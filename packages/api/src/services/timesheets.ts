import { prisma } from "../utils/database";
import { createError } from "../middleware/errorHandler";
import { billProject, BillingPolicy, OverlapMode, unionMs, BillableEntry } from "../billing/engine";
import { isValidTimezone, localDateKey, startOfLocalDay } from "../billing/time";
import { PRICING_AS_OF } from "../billing/pricing";
import { agentLabel } from "./agentEvents";

export const MAX_TIMESHEET_DAYS = 366;

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

export interface ProjectTimesheet {
  project: { id: string; name: string; color: string } | null;
  policy: BillingPolicy;
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
    costsAmount: number;
    amount: number;
  };
  lines: TimesheetLine[];
  costs: CostLine[];
  disclosure: string[];
}

export interface Timesheet {
  generatedAt: string;
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

/** Validates and defaults a range: default is the current local month. */
export function resolveRange(q: TimesheetQuery, now: Date) {
  const timezone = q.timezone && isValidTimezone(q.timezone) ? q.timezone : "UTC";
  if (q.timezone && !isValidTimezone(q.timezone)) throw createError("Invalid timezone", 400);
  let start = q.startDate;
  let end = q.endDate ?? now;
  if (!start) {
    const today = startOfLocalDay(now, timezone);
    const [y, m] = localDateKey(today, timezone).split("-").map(Number);
    // First of the month: step back day by day from today's local midnight.
    let cursor = today;
    while (localDateKey(cursor, timezone) !== `${y}-${String(m).padStart(2, "0")}-01`) {
      cursor = startOfLocalDay(new Date(cursor.getTime() - 12 * 3600 * 1000), timezone);
    }
    start = cursor;
  }
  if (end <= start) throw createError("endDate must be after startDate", 400);
  if (end.getTime() - start.getTime() > MAX_TIMESHEET_DAYS * 86400 * 1000) {
    throw createError(`A timesheet can cover at most ${MAX_TIMESHEET_DAYS} days`, 400);
  }
  return { start, end, timezone };
}

function disclosureFor(p: ProjectTimesheet, currency: string): string[] {
  const lines: string[] = [];
  const t = p.totals;
  if (t.agentTrackedSeconds === 0) return lines;
  const hours = (t.agentTrackedSeconds / 3600).toFixed(1);
  lines.push(`Includes ${hours} h of AI-assisted work by coding agents.`);
  if (p.policy.overlapMode === "dedupe") {
    if (t.trackedSeconds > t.wallClockSeconds) {
      lines.push("When several agents worked on this project at the same time, the overlapping time is billed once.");
    }
  } else {
    lines.push("Parallel agent sessions are billed per session (agent-hours).");
  }
  if (p.policy.agentHourlyRate !== null) {
    lines.push(`AI-assisted time is billed at a flat agent rate of ${formatMoney(p.policy.agentHourlyRate, currency)}/h.`);
  } else if (p.policy.aiMultiplier === 0) {
    lines.push("AI-assisted time is not billed.");
  } else if (p.policy.aiMultiplier !== 1) {
    lines.push(`AI-assisted time is billed at ${p.policy.aiMultiplier}× the standard rate.`);
  } else {
    lines.push("AI-assisted time is billed at the standard rate.");
  }
  if (p.policy.includeAiCosts && p.costs.length > 0) {
    const fee = p.policy.aiCostMarkupPercent > 0 ? ` plus a ${p.policy.aiCostMarkupPercent}% handling fee` : "";
    lines.push(`AI usage is passed through at API-equivalent list prices${fee}.`);
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
  const { start, end: requestedEnd, timezone } = resolveRange(q, now);
  const end = requestedEnd > now ? now : requestedEnd;

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { name: true, aiMultiplier: true, overlapMode: true, currency: true },
  });

  const entries = await prisma.timeEntry.findMany({
    where: {
      userId,
      ...(q.projectId ? { projectId: q.projectId } : {}),
      startTime: { lt: end },
      OR: [{ isRunning: true }, { endTime: { gt: start } }],
    },
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
    notesByTimerDay.set(key, [...(notesByTimerDay.get(key) ?? []), n.body]);
  }

  const groups = new Map<string, typeof entries>();
  for (const e of entries) {
    const key = e.projectId ?? "none";
    groups.set(key, [...(groups.get(key) ?? []), e]);
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
      includeAiCosts: project?.includeAiCosts ?? false,
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
    const lines = Array.from(lineMap.values())
      .map((l) => ({
        ...l,
        trackedSeconds: Math.round(l.trackedSeconds),
        billedSeconds: Math.round(l.billedSeconds),
        rate: l.billedSeconds > 0 ? round2(l.amount / (l.billedSeconds / 3600)) : 0,
        amount: round2(l.amount),
      }))
      .filter((l) => l.trackedSeconds > 0)
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

    const timeAmount = round2(bill.amount);
    const costsAmount = round2(costs.reduce((s, c) => s + c.billedUsd, 0));
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
        amount: round2(timeAmount + costsAmount),
      },
      lines,
      costs,
      disclosure: [],
    };
    sheet.disclosure = disclosureFor(sheet, user.currency);
    sheets.push(sheet);
  }

  // Named projects first (by amount), unassigned last.
  sheets.sort((a, b) => (a.project ? 0 : 1) - (b.project ? 0 : 1) || b.totals.amount - a.totals.amount);

  return {
    generatedAt: now.toISOString(),
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

/** Removes money (and optionally notes) for client views that hide them. */
export function redactTimesheet(t: Timesheet, opts: { showAmounts: boolean; showNotes: boolean }): Timesheet {
  return {
    ...t,
    totals: opts.showAmounts ? t.totals : { ...t.totals, amount: 0 },
    projects: t.projects.map((p) => ({
      ...p,
      hourlyRate: opts.showAmounts ? p.hourlyRate : null,
      totals: opts.showAmounts ? p.totals : { ...p.totals, timeAmount: 0, costsAmount: 0, amount: 0 },
      costs: opts.showAmounts ? p.costs : [],
      lines: p.lines.map((l) => ({
        ...l,
        entryIds: [],
        rate: opts.showAmounts ? l.rate : 0,
        amount: opts.showAmounts ? l.amount : 0,
        notes: opts.showNotes ? l.notes : [],
      })),
      disclosure: opts.showAmounts
        ? p.disclosure
        : p.disclosure.filter((d) => !/rate|billed at|handling fee|passed through/.test(d)),
    })),
  };
}
