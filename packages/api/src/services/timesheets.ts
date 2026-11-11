import { prisma } from "../utils/database";
import { createError } from "../middleware/errorHandler";
import { billProject, BillingPolicy, OverlapMode, unionMs, BillableEntry } from "../billing/engine";
import { canonicalTimezone, localDateKey, startOfLocalDate } from "../billing/time";
import { PRICING_AS_OF } from "../billing/pricing";
import { agentLabel } from "./agentEvents";
import { getEntitlements, historyFloor, planLimitError } from "./entitlements";

export const MAX_TIMESHEET_DAYS = 366;
/** Keeps one timesheet build to well under a second of event-loop time. */
export const MAX_TIMESHEET_ENTRIES = 50_000;

export interface TimesheetQuery {
  startDate?: Date;
  endDate?: Date;
  projectId?: string;
  timezone?: string;
}

export interface TimesheetLine {
  date: string;
  description: string;
  kind: "agent" | "human";
  agent: string | null;
  task: string | null;
  timerId: string | null;
  entryIds: string[];
  trackedSeconds: number;
  billedSeconds: number;
  rate: number;
  amount: number;
  notes: string[];
}

export interface CostLine {
  timerId: string;
  date: string;
  description: string;
  costUsd: number;
  billedUsd: number;
}

/** What a client view keeps of the policy when amounts are hidden. */
export type PublicPolicy = { overlapMode: OverlapMode };

export interface ProjectTimesheet {
  project: { id: string; name: string; color: string } | null;
  policy: BillingPolicy | PublicPolicy;
  hourlyRate: number | null;
  totals: {
    trackedSeconds: number;
    wallClockSeconds: number;
    billedSeconds: number;
    agentTrackedSeconds: number;
    humanTrackedSeconds: number;
    billedAgentSeconds: number;
    billedHumanSeconds: number;
    /** trackedSeconds / wallClockSeconds — how many timers ran at once on average. */
    parallelism: number;
    timeAmount: number;
    /** AI usage billed, in the sheet's currency (0 when that isn't USD — see costsIncluded). */
    costsAmount: number;
    /** AI usage billed in USD, whether or not it is part of `amount`. */
    costsBilledUsd: number;
    /** False when the sheet isn't in USD: cost lines are listed but not added to totals. */
    costsIncluded: boolean;
    amount: number;
  };
  lines: TimesheetLine[];
  costs: CostLine[];
  disclosure: string[];
}

export interface Timesheet {
  generatedAt: string;
  /** Set when the plan shortened the requested range. */
  limitedByPlan: { historyDays: number; requestedStartDate: string } | null;
  range: { startDate: string; endDate: string; timezone: string };
  currency: string;
  user: { name: string };
  pricingAsOf: string;
  totals: {
    trackedSeconds: number;
    wallClockSeconds: number;
    billedSeconds: number;
    amount: number;
  };
  projects: ProjectTimesheet[];
}

const secs = (ms: number) => Math.round(ms / 1000);
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Rounds amounts to cents so they sum to the rounded total (largest
 * remainder): rows on an invoice must add up to the printed total.
 */
export function splitCents(amounts: number[]): number[] {
  const raw = amounts.map((a) => a * 100);
  const floors = raw.map((r) => Math.floor(r + 1e-9));
  let left = Math.round(raw.reduce((s, r) => s + r, 0)) - floors.reduce((s, f) => s + f, 0);
  const order = raw.map((r, i) => [r - floors[i], i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    floors[i] += 1;
    left -= 1;
  }
  return floors;
}

/** Canonical IANA zone (default UTC); 400 for unknown names. */
export function resolveTimezone(tz: string | null | undefined): string {
  if (!tz) return "UTC";
  const canonical = canonicalTimezone(tz);
  if (!canonical) throw createError("Invalid timezone", 400);
  return canonical;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const HAS_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i;

/**
 * Parses a range bound. A bare date (YYYY-MM-DD, what agents usually send)
 * means local midnight in `tz`; as an end it is inclusive (the end of that
 * day). A timestamp must say its zone — read without one, it would silently
 * shift by the server's offset. `field` names the input in error messages.
 */
export function parseRangeDate(value: string, tz: string, edge: "start" | "end", field = `${edge}Date`): Date {
  const bare = DATE_ONLY.exec(value);
  if (bare) {
    const [y, m, d] = bare.slice(1).map(Number);
    const day = new Date(Date.UTC(y, m - 1, d));
    // Date.UTC rolls Feb 30 into March; a date that doesn't exist is an error.
    if (day.getUTCFullYear() !== y || day.getUTCMonth() !== m - 1 || day.getUTCDate() !== d) {
      throw createError(`${field} ${value} is not a calendar date`, 400);
    }
    if (edge === "start") return startOfLocalDate(value, tz);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    return startOfLocalDate(next.toISOString().slice(0, 10), tz);
  }
  if (!HAS_ZONE.test(value)) {
    throw createError(`${field} must be YYYY-MM-DD or a timestamp with a zone (e.g. 2026-03-02T09:00:00Z)`, 400);
  }
  const datePart = /^(\d{4})-(\d{2})-(\d{2})T/.exec(value);
  if (datePart) {
    const [y, m, d] = datePart.slice(1).map(Number);
    const day = new Date(Date.UTC(y, m - 1, d));
    // V8 rolls 2026-04-31T… into May; an impossible date is an error here too.
    if (day.getUTCFullYear() !== y || day.getUTCMonth() !== m - 1 || day.getUTCDate() !== d) {
      throw createError(`${field} ${value} is not a calendar date`, 400);
    }
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw createError(`${field} must be an ISO 8601 date or timestamp`, 400);
  return date;
}

/** Validates and defaults a range: default is the current local month. */
export function resolveRange(q: TimesheetQuery, now: Date) {
  const timezone = resolveTimezone(q.timezone);
  for (const [name, d] of [["startDate", q.startDate], ["endDate", q.endDate]] as const) {
    if (d && Number.isNaN(d.getTime())) throw createError(`${name} must be a valid date`, 400);
  }
  let start = q.startDate;
  let end = q.endDate ?? now;
  if (!start) {
    start = startOfLocalDate(`${localDateKey(now, timezone).slice(0, 7)}-01`, timezone);
  }
  if (end <= start) throw createError("endDate must be after startDate", 400);
  if (end.getTime() - start.getTime() > MAX_TIMESHEET_DAYS * 86400 * 1000) {
    throw createError(`A timesheet can cover at most ${MAX_TIMESHEET_DAYS} days`, 400);
  }
  return { start, end, timezone };
}

function disclosureFor(p: ProjectTimesheet, policy: BillingPolicy, currency: string): string[] {
  const lines: string[] = [];
  const t = p.totals;
  if (t.agentTrackedSeconds === 0) return lines;
  const hours = (t.agentTrackedSeconds / 3600).toFixed(1);
  lines.push(`Includes ${hours} h of AI-assisted work by coding agents.`);
  if (policy.overlapMode === "dedupe") {
    if (t.trackedSeconds > t.wallClockSeconds) {
      lines.push("When several agents worked on this project at the same time, the overlapping time is billed once.");
    }
  } else {
    lines.push("Parallel agent sessions are billed per session (agent-hours).");
  }
  if (policy.agentHourlyRate !== null) {
    lines.push(`AI-assisted time is billed at a flat agent rate of ${formatMoney(policy.agentHourlyRate, currency)}/h.`);
  } else if (policy.aiMultiplier === 0) {
    lines.push("AI-assisted time is not billed.");
  } else if (policy.aiMultiplier !== 1) {
    lines.push(`AI-assisted time is billed at ${policy.aiMultiplier}× the standard rate.`);
  } else {
    lines.push("AI-assisted time is billed at the standard rate.");
  }
  if (policy.includeAiCosts && p.costs.length > 0) {
    const fee = policy.aiCostMarkupPercent > 0 ? ` plus a ${policy.aiCostMarkupPercent}% handling fee` : "";
    lines.push(`AI usage is passed through at API-equivalent list prices${fee}.`);
    if (!p.totals.costsIncluded) {
      lines.push(`AI usage is priced in USD and is not included in the ${currency} total.`);
    }
  }
  return lines;
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/**
 * Builds a client-ready timesheet: entries clipped to the range, billed per
 * project under that project's policy, grouped into lines per (day, timer).
 * Projects never dedupe against each other — each client pays for its own
 * time.
 */
export async function buildTimesheet(
  userId: string,
  q: TimesheetQuery,
  opts: { now?: Date; showNotes?: boolean } = {}
): Promise<Timesheet> {
  const now = opts.now ?? new Date();
  const range = resolveRange(q, now);
  const { end: requestedEnd, timezone } = range;
  let start = range.start;
  const end = requestedEnd > now ? now : requestedEnd;

  // Free plan: timesheets reach back a limited number of days.
  const entitlements = await getEntitlements(userId, prisma, now);
  const exactFloor = historyFloor(entitlements, now);
  // Whole local days only: a first row cut at the current time of day
  // would look like a full day that's missing hours.
  let floor = exactFloor;
  if (exactFloor) {
    const key = localDateKey(exactFloor, timezone);
    floor = startOfLocalDate(key, timezone);
    if (floor < exactFloor) {
      const [y, m, d] = key.split("-").map(Number);
      floor = startOfLocalDate(new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10), timezone);
    }
  }
  let limitedByPlan: Timesheet["limitedByPlan"] = null;
  if (floor && start < floor) {
    if (end <= floor) {
      throw planLimitError(
        `The Free plan covers the last ${entitlements.limits.historyDays} days of timesheets.`
      );
    }
    limitedByPlan = { historyDays: entitlements.limits.historyDays!, requestedStartDate: start.toISOString() };
    start = floor;
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { name: true, aiMultiplier: true, overlapMode: true, currency: true },
  });

  const entryWhere = {
    userId,
    ...(q.projectId ? { projectId: q.projectId } : {}),
    startTime: { lt: end },
    OR: [{ isRunning: true }, { endTime: { gt: start } }],
  };
  if ((await prisma.timeEntry.count({ where: entryWhere })) > MAX_TIMESHEET_ENTRIES) {
    throw createError(
      `This period has more than ${MAX_TIMESHEET_ENTRIES} entries; pick a shorter period or one project`,
      400
    );
  }
  const entries = await prisma.timeEntry.findMany({
    where: entryWhere,
    select: {
      id: true,
      description: true,
      startTime: true,
      endTime: true,
      isRunning: true,
      hourlyRateSnapshot: true,
      isAiGenerated: true,
      projectId: true,
      timerId: true,
      task: { select: { name: true } },
      timer: { select: { id: true, description: true, agent: true } },
    },
    orderBy: { startTime: "asc" },
  });

  const projectIds = Array.from(new Set(entries.map((e) => e.projectId).filter((x): x is string => !!x)));
  if (q.projectId && !projectIds.includes(q.projectId)) projectIds.push(q.projectId);
  const projects = await prisma.project.findMany({
    where: { userId, id: { in: projectIds } },
    select: {
      id: true,
      name: true,
      color: true,
      hourlyRate: true,
      overlapMode: true,
      aiMultiplier: true,
      agentHourlyRate: true,
      includeAiCosts: true,
      aiCostMarkupPercent: true,
    },
  });
  if (q.projectId && !projects.some((p) => p.id === q.projectId)) {
    throw createError("Project not found", 404);
  }
  const projectById = new Map(projects.map((p) => [p.id, p]));

  const timerIds = Array.from(new Set(entries.map((e) => e.timerId).filter((x): x is string => !!x)));
  const [notes, costTimers] = await Promise.all([
    opts.showNotes === false || timerIds.length === 0
      ? Promise.resolve([])
      : prisma.timerNote.findMany({
          where: { userId, timerId: { in: timerIds }, createdAt: { gte: start, lt: end } },
          select: { timerId: true, body: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        }),
    prisma.timer.findMany({
      where: {
        userId,
        costUsd: { gt: 0 },
        startedAt: { gte: start, lt: end },
        ...(q.projectId ? { projectId: q.projectId } : { projectId: { in: projectIds } }),
      },
      select: { id: true, description: true, agent: true, projectId: true, costUsd: true, startedAt: true },
    }),
  ]);
  const notesByTimerDay = new Map<string, string[]>();
  for (const n of notes) {
    const key = `${n.timerId}|${localDateKey(n.createdAt, timezone)}`;
    let list = notesByTimerDay.get(key);
    if (!list) notesByTimerDay.set(key, (list = []));
    list.push(n.body);
  }

  const groups = new Map<string, typeof entries>();
  for (const e of entries) {
    const key = e.projectId ?? "none";
    let group = groups.get(key);
    if (!group) groups.set(key, (group = []));
    group.push(e);
  }
  if (q.projectId && !groups.has(q.projectId)) groups.set(q.projectId, []);

  const sheets: ProjectTimesheet[] = [];
  const allIntervals: Array<{ start: Date; end: Date }> = [];

  for (const [key, group] of groups) {
    const project = key === "none" ? null : projectById.get(key) ?? null;
    const policy: BillingPolicy = {
      overlapMode: ((project?.overlapMode ?? user.overlapMode) as OverlapMode) === "sum" ? "sum" : "dedupe",
      aiMultiplier: project?.aiMultiplier ?? user.aiMultiplier ?? 1,
      agentHourlyRate: project?.agentHourlyRate ?? null,
      includeAiCosts: (project?.includeAiCosts ?? false) && entitlements.limits.aiCostLines,
      aiCostMarkupPercent: project?.aiCostMarkupPercent ?? 0,
    };

    const billable: BillableEntry[] = group.map((e) => {
      const s = e.startTime < start ? start : e.startTime;
      const rawEnd = e.isRunning || !e.endTime ? now : e.endTime;
      const t = rawEnd > end ? end : rawEnd;
      allIntervals.push({ start: s, end: t });
      return { id: e.id, start: s, end: t, rate: e.hourlyRateSnapshot, isAi: e.isAiGenerated };
    });
    const bill = billProject(billable, policy, timezone);

    // Lines: one per (local day, timer) — or per entry for timer-less entries.
    const lineMap = new Map<string, TimesheetLine>();
    for (const e of group) {
      const alloc = bill.allocations.get(e.id);
      if (!alloc) continue;
      for (const [day, a] of alloc) {
        const lineKey = `${day}|${e.timerId ?? `entry:${e.id}`}`;
        let line = lineMap.get(lineKey);
        if (!line) {
          line = {
            date: day,
            description:
              e.timer?.description || e.description || e.task?.name || (e.isAiGenerated ? `${agentLabel(e.timer?.agent)} session` : "Work"),
            kind: e.isAiGenerated ? "agent" : "human",
            agent: e.timer?.agent ?? null,
            task: e.task?.name ?? null,
            timerId: e.timerId,
            entryIds: [],
            trackedSeconds: 0,
            billedSeconds: 0,
            rate: 0,
            amount: 0,
            notes: e.timerId ? notesByTimerDay.get(`${e.timerId}|${day}`) ?? [] : [],
          };
          lineMap.set(lineKey, line);
        }
        line.entryIds.push(e.id);
        line.trackedSeconds += a.trackedMs / 1000;
        line.billedSeconds += a.billedMs / 1000;
        line.amount += a.amount;
      }
    }
    const shown = Array.from(lineMap.values()).filter((l) => Math.round(l.trackedSeconds) > 0);
    const cents = splitCents(shown.map((l) => l.amount));
    const lines = shown
      .map((l, i) => ({
        ...l,
        trackedSeconds: Math.round(l.trackedSeconds),
        billedSeconds: Math.round(l.billedSeconds),
        rate: l.billedSeconds > 0 ? round2(l.amount / (l.billedSeconds / 3600)) : 0,
        amount: cents[i] / 100,
      }))
      .sort((a, b) => a.date.localeCompare(b.date) || b.trackedSeconds - a.trackedSeconds);

    const costs: CostLine[] = policy.includeAiCosts
      ? costTimers
          .filter((t) => (t.projectId ?? "none") === key)
          .map((t) => ({
            timerId: t.id,
            date: localDateKey(t.startedAt, timezone),
            description: t.description || `${agentLabel(t.agent)} session`,
            costUsd: round2(t.costUsd ?? 0),
            billedUsd: round2((t.costUsd ?? 0) * (1 + policy.aiCostMarkupPercent / 100)),
          }))
      : [];

    // Totals are the sum of the rows the client sees, so they always add up.
    const timeAmount = cents.reduce((s, c) => s + c, 0) / 100;
    const costsBilledUsd = round2(costs.reduce((s, c) => s + c.billedUsd, 0));
    // Costs are priced in USD; they only join the total on a USD sheet.
    const costsIncluded = user.currency === "USD";
    const costsAmount = costsIncluded ? costsBilledUsd : 0;
    const sheet: ProjectTimesheet = {
      project: project ? { id: project.id, name: project.name, color: project.color } : null,
      policy,
      hourlyRate: project?.hourlyRate ?? null,
      totals: {
        trackedSeconds: secs(bill.trackedMs),
        wallClockSeconds: secs(bill.wallClockMs),
        billedSeconds: secs(bill.billedMs),
        agentTrackedSeconds: secs(bill.agentTrackedMs),
        humanTrackedSeconds: secs(bill.humanTrackedMs),
        billedAgentSeconds: secs(bill.billedAgentMs),
        billedHumanSeconds: secs(bill.billedHumanMs),
        parallelism: bill.wallClockMs > 0 ? Math.round((bill.trackedMs / bill.wallClockMs) * 100) / 100 : 0,
        timeAmount,
        costsAmount,
        costsBilledUsd,
        costsIncluded,
        amount: round2(timeAmount + costsAmount),
      },
      lines,
      costs,
      disclosure: [],
    };
    sheet.disclosure = disclosureFor(sheet, policy, user.currency);
    sheets.push(sheet);
  }

  // Named projects first (by amount), unassigned last.
  sheets.sort((a, b) => (a.project ? 0 : 1) - (b.project ? 0 : 1) || b.totals.amount - a.totals.amount);

  return {
    generatedAt: now.toISOString(),
    limitedByPlan,
    range: { startDate: start.toISOString(), endDate: end.toISOString(), timezone },
    currency: user.currency,
    user: { name: user.name },
    pricingAsOf: PRICING_AS_OF,
    totals: {
      trackedSeconds: sheets.reduce((s, p) => s + p.totals.trackedSeconds, 0),
      wallClockSeconds: secs(unionMs(allIntervals)),
      billedSeconds: sheets.reduce((s, p) => s + p.totals.billedSeconds, 0),
      amount: round2(sheets.reduce((s, p) => s + p.totals.amount, 0)),
    },
    projects: sheets,
  };
}

/**
 * The client-facing copy of a timesheet, built from an allowlist so new
 * internal fields never leak into public views. Without amounts it drops
 * every money field and the billing policy except the overlap rule (the
 * disclosure explains it); without notes it drops agent notes. Internal ids
 * go in all cases.
 */
export function redactTimesheet(t: Timesheet, opts: { showAmounts: boolean; showNotes: boolean }): Timesheet {
  const money = opts.showAmounts;
  return {
    generatedAt: t.generatedAt,
    range: { ...t.range },
    // Public links stop working when the owner's plan lacks them, so a
    // client never sees a sheet cut short by the owner's plan.
    limitedByPlan: null,
    currency: t.currency,
    user: { name: t.user.name },
    pricingAsOf: t.pricingAsOf,
    totals: {
      trackedSeconds: t.totals.trackedSeconds,
      wallClockSeconds: t.totals.wallClockSeconds,
      billedSeconds: t.totals.billedSeconds,
      amount: money ? t.totals.amount : 0,
    },
    projects: t.projects.map((p) => ({
      project: p.project ? { id: "", name: p.project.name, color: p.project.color } : null,
      policy: money
        ? { ...p.policy }
        : { overlapMode: p.policy.overlapMode },
      hourlyRate: money ? p.hourlyRate : null,
      totals: {
        trackedSeconds: p.totals.trackedSeconds,
        wallClockSeconds: p.totals.wallClockSeconds,
        billedSeconds: p.totals.billedSeconds,
        agentTrackedSeconds: p.totals.agentTrackedSeconds,
        humanTrackedSeconds: p.totals.humanTrackedSeconds,
        billedAgentSeconds: p.totals.billedAgentSeconds,
        billedHumanSeconds: p.totals.billedHumanSeconds,
        parallelism: p.totals.parallelism,
        timeAmount: money ? p.totals.timeAmount : 0,
        costsAmount: money ? p.totals.costsAmount : 0,
        costsBilledUsd: money ? p.totals.costsBilledUsd : 0,
        costsIncluded: p.totals.costsIncluded,
        amount: money ? p.totals.amount : 0,
      },
      lines: p.lines.map((l) => ({
        date: l.date,
        description: l.description,
        kind: l.kind,
        agent: l.agent,
        task: l.task,
        timerId: null,
        entryIds: [],
        trackedSeconds: l.trackedSeconds,
        billedSeconds: l.billedSeconds,
        rate: money ? l.rate : 0,
        amount: money ? l.amount : 0,
        notes: opts.showNotes ? [...l.notes] : [],
      })),
      costs: money
        ? p.costs.map((c) => ({ timerId: "", date: c.date, description: c.description, costUsd: c.costUsd, billedUsd: c.billedUsd }))
        : [],
      disclosure: money
        ? [...p.disclosure]
        : p.disclosure.filter((d) => !/rate|billed at|handling fee|passed through|priced in USD/.test(d)),
    })),
  };
}
