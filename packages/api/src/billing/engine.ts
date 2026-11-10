import { localDateKey, midnightsBetween } from "./time";

/**
 * How a project bills time when several timers ran at once:
 * - dedupe: every moment is billed once, at the highest rate that applies
 *   (a client never pays more than wall-clock time for their project)
 * - sum: every timer is billed in full (agent-hours)
 */
export type OverlapMode = "dedupe" | "sum";

export interface BillingPolicy {
  overlapMode: OverlapMode;
  /** Multiplier on the rate for AI-assisted time (1 = same rate, 0 = not billed). */
  aiMultiplier: number;
  /** Flat hourly rate for AI-assisted time; overrides rate × multiplier. */
  agentHourlyRate: number | null;
  includeAiCosts: boolean;
  aiCostMarkupPercent: number;
}

export interface BillableEntry {
  id: string;
  start: Date;
  end: Date;
  /** Hourly rate snapshot (null = unbilled). */
  rate: number | null;
  isAi: boolean;
}

export interface Allocation {
  /** Time this entry actually covered (ms). */
  trackedMs: number;
  /** Time billed to this entry after overlap handling (ms). */
  billedMs: number;
  amount: number;
}

export interface ProjectBilling {
  wallClockMs: number;
  trackedMs: number;
  agentTrackedMs: number;
  humanTrackedMs: number;
  billedMs: number;
  billedAgentMs: number;
  billedHumanMs: number;
  amount: number;
  /** Per entry, per local day. */
  allocations: Map<string, Map<string, Allocation>>;
}

export function effectiveRate(e: Pick<BillableEntry, "rate" | "isAi">, policy: BillingPolicy): number {
  const base = e.rate ?? 0;
  if (!e.isAi) return base;
  if (policy.agentHourlyRate !== null && policy.agentHourlyRate !== undefined) {
    return policy.agentHourlyRate;
  }
  return base * policy.aiMultiplier;
}

const HOUR_MS = 3_600_000;

/**
 * Sweep line over the entries' intervals (plus local-midnight cuts so every
 * slice belongs to exactly one day). Each elementary slice is billed to the
 * covering entry with the highest effective rate (dedupe; ties prefer human
 * work, then the earlier start) or to every covering entry (sum).
 */
export function billProject(
  entries: BillableEntry[],
  policy: BillingPolicy,
  tz: string
): ProjectBilling {
  const result: ProjectBilling = {
    wallClockMs: 0,
    trackedMs: 0,
    agentTrackedMs: 0,
    humanTrackedMs: 0,
    billedMs: 0,
    billedAgentMs: 0,
    billedHumanMs: 0,
    amount: 0,
    allocations: new Map(),
  };
  const valid = entries.filter((e) => e.end.getTime() > e.start.getTime());
  if (valid.length === 0) return result;

  const rates = new Map(valid.map((e) => [e.id, effectiveRate(e, policy)]));
  const minStart = Math.min(...valid.map((e) => e.start.getTime()));
  const maxEnd = Math.max(...valid.map((e) => e.end.getTime()));

  const cuts = new Set<number>();
  for (const e of valid) {
    cuts.add(e.start.getTime());
    cuts.add(e.end.getTime());
  }
  for (const m of midnightsBetween(new Date(minStart), new Date(maxEnd), tz)) cuts.add(m.getTime());
  const points = Array.from(cuts).sort((a, b) => a - b);

  const starts = new Map<number, BillableEntry[]>();
  const ends = new Map<number, Set<string>>();
  for (const e of valid) {
    const s = e.start.getTime();
    const t = e.end.getTime();
    starts.set(s, [...(starts.get(s) ?? []), e]);
    if (!ends.has(t)) ends.set(t, new Set());
    ends.get(t)!.add(e.id);
  }

  const allocate = (entryId: string, day: string, trackedMs: number, billedMs: number, amount: number) => {
    let byDay = result.allocations.get(entryId);
    if (!byDay) {
      byDay = new Map();
      result.allocations.set(entryId, byDay);
    }
    const a = byDay.get(day) ?? { trackedMs: 0, billedMs: 0, amount: 0 };
    a.trackedMs += trackedMs;
    a.billedMs += billedMs;
    a.amount += amount;
    byDay.set(day, a);
  };

  let active: BillableEntry[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const t = points[i];
    const ending = ends.get(t);
    if (ending) active = active.filter((e) => !ending.has(e.id));
    const starting = starts.get(t);
    if (starting) active.push(...starting);
    if (active.length === 0) continue;

    const len = points[i + 1] - t;
    const day = localDateKey(new Date(t), tz);
    result.wallClockMs += len;

    for (const e of active) {
      result.trackedMs += len;
      if (e.isAi) result.agentTrackedMs += len;
      else result.humanTrackedMs += len;
    }

    if (policy.overlapMode === "sum") {
      for (const e of active) {
        const amount = (len / HOUR_MS) * rates.get(e.id)!;
        allocate(e.id, day, len, len, amount);
        result.billedMs += len;
        if (e.isAi) result.billedAgentMs += len;
        else result.billedHumanMs += len;
        result.amount += amount;
      }
      continue;
    }

    let winner = active[0];
    for (const e of active) {
      const r = rates.get(e.id)!;
      const w = rates.get(winner.id)!;
      if (
        r > w ||
        (r === w && winner.isAi && !e.isAi) ||
        (r === w && e.isAi === winner.isAi && e.start.getTime() < winner.start.getTime()) ||
        (r === w &&
          e.isAi === winner.isAi &&
          e.start.getTime() === winner.start.getTime() &&
          e.id < winner.id)
      ) {
        winner = e;
      }
    }
    const amount = (len / HOUR_MS) * rates.get(winner.id)!;
    for (const e of active) allocate(e.id, day, len, e === winner ? len : 0, e === winner ? amount : 0);
    result.billedMs += len;
    if (winner.isAi) result.billedAgentMs += len;
    else result.billedHumanMs += len;
    result.amount += amount;
  }
  return result;
}

/** Length of the union of intervals, in ms. */
export function unionMs(intervals: Array<{ start: Date; end: Date }>): number {
  const sorted = intervals
    .filter((i) => i.end > i.start)
    .map((i) => [i.start.getTime(), i.end.getTime()] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let curStart = -Infinity;
  let curEnd = -Infinity;
  for (const [s, e] of sorted) {
    if (s > curEnd) {
      if (curEnd > curStart) total += curEnd - curStart;
      curStart = s;
      curEnd = e;
    } else if (e > curEnd) {
      curEnd = e;
    }
  }
  if (curEnd > curStart) total += curEnd - curStart;
  return total;
}
