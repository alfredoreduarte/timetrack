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

interface Ranked {
  id: string;
  start: number;
  end: number;
  rate: number;
  isAi: boolean;
}

/**
 * Who bills a moment several entries cover (dedupe): the higher effective
 * rate, then human work, then the earlier start, then the smaller id — a
 * total order, so the result never depends on input order.
 */
function beats(a: Ranked, b: Ranked): boolean {
  if (a.rate !== b.rate) return a.rate > b.rate;
  if (a.isAi !== b.isAi) return !a.isAi;
  if (a.start !== b.start) return a.start < b.start;
  return a.id < b.id;
}

/** Binary max-heap under `beats`. */
class WinnerHeap {
  private items: Ranked[] = [];
  get size() {
    return this.items.length;
  }
  peek(): Ranked | undefined {
    return this.items[0];
  }
  push(x: Ranked) {
    const a = this.items;
    a.push(x);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!beats(a[i], a[parent])) break;
      [a[i], a[parent]] = [a[parent], a[i]];
      i = parent;
    }
  }
  pop(): Ranked | undefined {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length > 0 && last) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let best = i;
        if (l < a.length && beats(a[l], a[best])) best = l;
        if (r < a.length && beats(a[r], a[best])) best = r;
        if (best === i) break;
        [a[i], a[best]] = [a[best], a[i]];
        i = best;
      }
    }
    return top;
  }
}

/** Index of the first value > t in an ascending array. */
function upperBound(sorted: number[], t: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Bills one project's entries, split at local midnights so every amount
 * belongs to one day. Tracked time comes from each entry's own interval.
 * Billed time: in sum mode every entry bills all of its time; in dedupe
 * mode each moment is billed once, to the covering entry that `beats` the
 * others, found with a heap — O(n log n), however much entries overlap.
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
  const ranked: Ranked[] = [];
  for (const e of entries) {
    const start = e.start.getTime();
    const end = e.end.getTime();
    if (end > start) ranked.push({ id: e.id, start, end, rate: effectiveRate(e, policy), isAi: e.isAi });
  }
  if (ranked.length === 0) return result;

  // Loops, not Math.min(...spread): spreading 100k+ values overflows the stack.
  let minStart = Infinity;
  let maxEnd = -Infinity;
  for (const e of ranked) {
    if (e.start < minStart) minStart = e.start;
    if (e.end > maxEnd) maxEnd = e.end;
  }
  // Day k covers [midnights[k-1], midnights[k]); dayKeys[k] is its local date.
  const midnights = midnightsBetween(new Date(minStart), new Date(maxEnd), tz).map((d) => d.getTime());
  const dayKeys = [localDateKey(new Date(minStart), tz), ...midnights.map((m) => localDateKey(new Date(m), tz))];

  const allocate = (entryId: string, day: string, trackedMs: number, billedMs: number, amount: number) => {
    let byDay = result.allocations.get(entryId);
    if (!byDay) {
      byDay = new Map();
      result.allocations.set(entryId, byDay);
    }
    const a = byDay.get(day);
    if (a) {
      a.trackedMs += trackedMs;
      a.billedMs += billedMs;
      a.amount += amount;
    } else {
      byDay.set(day, { trackedMs, billedMs, amount });
    }
  };
  const bill = (e: Ranked, day: string, ms: number) => {
    const amount = (ms / HOUR_MS) * e.rate;
    result.billedMs += ms;
    if (e.isAi) result.billedAgentMs += ms;
    else result.billedHumanMs += ms;
    result.amount += amount;
    return amount;
  };

  // Tracked time (and, in sum mode, billed time): each entry split at the
  // local midnights it crosses.
  for (const e of ranked) {
    let t = e.start;
    let k = upperBound(midnights, t);
    while (t < e.end) {
      const segEnd = k < midnights.length ? Math.min(e.end, midnights[k]) : e.end;
      const ms = segEnd - t;
      result.trackedMs += ms;
      if (e.isAi) result.agentTrackedMs += ms;
      else result.humanTrackedMs += ms;
      if (policy.overlapMode === "sum") allocate(e.id, dayKeys[k], ms, ms, bill(e, dayKeys[k], ms));
      else allocate(e.id, dayKeys[k], ms, 0, 0);
      t = segEnd;
      k++;
    }
  }

  if (policy.overlapMode === "sum") {
    result.wallClockMs = unionMs(ranked.map((e) => ({ start: new Date(e.start), end: new Date(e.end) })));
    return result;
  }

  // Dedupe: sweep the cut points (starts, ends, midnights) with the
  // covering entries in a heap; expired entries leave lazily from the top.
  const byStart = [...ranked].sort((a, b) => a.start - b.start);
  const cuts = new Set<number>(midnights);
  for (const e of ranked) {
    cuts.add(e.start);
    cuts.add(e.end);
  }
  const points = Array.from(cuts).sort((a, b) => a - b);
  const heap = new WinnerHeap();
  let next = 0;
  let k = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const t = points[i];
    while (next < byStart.length && byStart[next].start <= t) heap.push(byStart[next++]);
    while (heap.size > 0 && heap.peek()!.end <= t) heap.pop();
    if (heap.size === 0) continue;
    while (k < midnights.length && midnights[k] <= t) k++;
    const winner = heap.peek()!;
    const ms = points[i + 1] - t;
    result.wallClockMs += ms;
    allocate(winner.id, dayKeys[k], 0, ms, bill(winner, dayKeys[k], ms));
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
