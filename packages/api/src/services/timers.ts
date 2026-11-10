import { Prisma } from "@prisma/client";
import { prisma, TxClient } from "../utils/database";
import { createError } from "../middleware/errorHandler";
import { normalizeGitRemote } from "../utils/git";
import { emitToUser } from "../realtime";
import { logger } from "../utils/logger";
import { ServiceContext, systemContext } from "./context";
import { diffFields, recordAudit, AuditChanges } from "./audit";
import { getHourlyRate } from "./rates";
import { resolveProjectAndTask } from "./ownership";
import { cleanText, DESCRIPTION_MAX } from "./text";
import { assertCanRunTimer } from "./limits";

/** How far ahead of server time a client clock may be before we reject. */
export const FUTURE_SKEW_MS = 5 * 60 * 1000;
/** Heartbeats closer together than this don't write to the database. */
export const TOUCH_DEBOUNCE_MS = 15_000;
/** Timers may be started, resumed or moved back at most this far in the past. */
export const MAX_BACKDATE_MS = 24 * 60 * 60 * 1000;
export const MIN_IDLE_TIMEOUT_SECONDS = 60;
export const MAX_IDLE_TIMEOUT_SECONDS = 24 * 60 * 60;

export type TimerStatus = "running" | "paused" | "stopped";
export type PauseReason = "manual" | "idle";

export const entrySelect = {
  id: true,
  description: true,
  startTime: true,
  endTime: true,
  duration: true,
  isRunning: true,
  hourlyRateSnapshot: true,
  createdVia: true,
  isAiGenerated: true,
  timerId: true,
  stopReason: true,
  projectId: true,
  taskId: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
  project: { select: { id: true, name: true, color: true } },
  task: { select: { id: true, name: true } },
} satisfies Prisma.TimeEntrySelect;

export type EntryView = Prisma.TimeEntryGetPayload<{ select: typeof entrySelect }>;

const timerSelect = {
  id: true,
  status: true,
  description: true,
  sessionKey: true,
  agent: true,
  createdVia: true,
  isAiGenerated: true,
  cwd: true,
  gitRemote: true,
  gitBranch: true,
  idleTimeoutSeconds: true,
  lastActivityAt: true,
  pauseReason: true,
  startedAt: true,
  stoppedAt: true,
  usage: true,
  costUsd: true,
  createdAt: true,
  updatedAt: true,
  projectId: true,
  taskId: true,
  project: { select: { id: true, name: true, color: true } },
  task: { select: { id: true, name: true } },
  entries: { where: { isRunning: true }, select: entrySelect, take: 1 },
  _count: { select: { entries: true, notes: true } },
} satisfies Prisma.TimerSelect;

type TimerRow = Prisma.TimerGetPayload<{ select: typeof timerSelect }>;

export type TimerView = Omit<TimerRow, "entries" | "_count"> & {
  currentEntry: EntryView | null;
  segmentCount: number;
  noteCount: number;
  /** Closed segment time plus the running segment's elapsed time. */
  trackedSeconds: number;
};

export interface TimerActionResult {
  timer: TimerView;
  /** The segment opened (start/resume) or closed (pause/stop), if any. */
  entry: EntryView | null;
  /** False when the call was a no-op (already in the requested state). */
  changed: boolean;
  created?: boolean;
}

type PendingEvent = { event: string; payload: unknown };

const AUDITED_TIMER_FIELDS = [
  "status",
  "description",
  "projectId",
  "taskId",
  "pauseReason",
  "idleTimeoutSeconds",
  "isAiGenerated",
  "sessionKey",
  "agent",
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parses a client timestamp: defaults to now, rejects the far future, clamps small skew. */
export function resolveAt(
  ctx: ServiceContext,
  at: Date | string | null | undefined,
  field = "at"
): Date {
  const now = ctx.now();
  if (at === undefined || at === null || at === "") return now;
  const date = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(date.getTime())) throw createError(`${field} must be an ISO 8601 timestamp`, 400);
  if (date.getTime() > now.getTime() + FUTURE_SKEW_MS) {
    throw createError(`${field} cannot be in the future`, 400);
  }
  return date.getTime() > now.getTime() ? now : date;
}

const cleanToken = (
  value: string | null | undefined,
  field: string,
  max: number
): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  // Paths and branch names: strip control characters, keep everything else.
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!cleaned) return null;
  if (cleaned.length > max) throw createError(`${field} must be at most ${max} characters`, 400);
  return cleaned;
};

const AGENT_RE = /^[a-z0-9][a-z0-9_.-]{0,39}$/;

const cleanAgent = (value: string | null | undefined): string | null | undefined => {
  if (value === undefined || value === null) return value;
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (!AGENT_RE.test(v)) {
    throw createError("agent must be a short slug like claude_code, cursor or codex", 400);
  }
  return v;
};

const cleanIdleTimeout = (value: number | null | undefined): number | null | undefined => {
  if (value === undefined || value === null) return value;
  if (
    !Number.isInteger(value) ||
    value < MIN_IDLE_TIMEOUT_SECONDS ||
    value > MAX_IDLE_TIMEOUT_SECONDS
  ) {
    throw createError(
      `idleTimeoutSeconds must be a whole number between ${MIN_IDLE_TIMEOUT_SECONDS} and ${MAX_IDLE_TIMEOUT_SECONDS}`,
      400
    );
  }
  return value;
};

export const cleanSessionKey = (value: string | null | undefined): string | null => {
  if (value === undefined || value === null) return null;
  const v = value.trim();
  if (!v) return null;
  if (v.length > 200) throw createError("sessionKey must be at most 200 characters", 400);
  return v;
};

/** Row-locks a timer for the rest of the transaction; 404s across users. */
async function lockTimer(tx: TxClient, ctx: ServiceContext, timerId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM timers WHERE id = ${timerId} AND user_id = ${ctx.userId} FOR UPDATE`;
  if (rows.length === 0) throw createError("Timer not found", 404);
  return tx.timer.findUniqueOrThrow({ where: { id: timerId } });
}

type LockedTimer = Awaited<ReturnType<typeof lockTimer>>;

async function openSegment(
  tx: TxClient,
  ctx: ServiceContext,
  timer: LockedTimer,
  startAt: Date,
  events: PendingEvent[]
): Promise<EntryView> {
  const rate = await getHourlyRate(tx, ctx.userId, timer.projectId, timer.taskId);
  const entry = await tx.timeEntry.create({
    data: {
      description: timer.description,
      startTime: startAt,
      isRunning: true,
      projectId: timer.projectId,
      taskId: timer.taskId,
      userId: ctx.userId,
      hourlyRateSnapshot: rate,
      // Segments inherit the timer's classification: resuming an agent's
      // timer from the web UI is still the agent's work.
      createdVia: timer.createdVia,
      isAiGenerated: timer.isAiGenerated,
      timerId: timer.id,
    },
    select: entrySelect,
  });
  await recordAudit(tx, ctx, {
    entityType: "time_entry",
    entityId: entry.id,
    action: "start",
    changes: diffFields(null, entry, ["startTime", "projectId", "taskId", "description"]),
  });
  events.push({ event: "time-entry-started", payload: entry });
  return entry;
}

/**
 * Closes the timer's running segment at `endAt` (clamped to its start).
 * Zero-length segments are discarded unless `keepEmpty` (legacy stop must
 * return the entry it was asked to stop).
 */
async function closeSegment(
  tx: TxClient,
  ctx: ServiceContext,
  timerId: string,
  endAt: Date,
  stopReason: string,
  events: PendingEvent[],
  keepEmpty = false
): Promise<EntryView | null> {
  const running = await tx.timeEntry.findFirst({
    where: { timerId, isRunning: true },
    select: { id: true, startTime: true },
  });
  if (!running) return null;

  const end = endAt < running.startTime ? running.startTime : endAt;
  const duration = Math.floor((end.getTime() - running.startTime.getTime()) / 1000);

  if (duration === 0 && !keepEmpty) {
    await tx.timeEntry.delete({ where: { id: running.id } });
    await recordAudit(tx, ctx, {
      entityType: "time_entry",
      entityId: running.id,
      action: "discard_empty",
      changes: {
        startTime: { from: running.startTime.toISOString(), to: null },
        requestedEnd: { from: null, to: endAt.toISOString() },
      },
    });
    events.push({ event: "time-entry-deleted", payload: { id: running.id } });
    return null;
  }

  const entry = await tx.timeEntry.update({
    where: { id: running.id },
    data: { endTime: end, duration, isRunning: false, stopReason },
    select: entrySelect,
  });
  await recordAudit(tx, ctx, {
    entityType: "time_entry",
    entityId: entry.id,
    action: "stop",
    changes: {
      endTime: { from: null, to: end.toISOString() },
      duration: { from: null, to: duration },
      stopReason: { from: null, to: stopReason },
    },
  });
  events.push({ event: "time-entry-stopped", payload: entry });
  return entry;
}

const toView = (row: TimerRow, closedSeconds: number, now: Date): TimerView => {
  const { entries, _count, ...rest } = row;
  const current = entries[0] ?? null;
  const runningSeconds = current
    ? Math.max(0, Math.floor((now.getTime() - current.startTime.getTime()) / 1000))
    : 0;
  return {
    ...rest,
    currentEntry: current,
    segmentCount: _count.entries,
    noteCount: _count.notes,
    trackedSeconds: closedSeconds + runningSeconds,
  };
};

export async function loadTimerViews(
  ctx: ServiceContext,
  timerIds: string[]
): Promise<TimerView[]> {
  if (timerIds.length === 0) return [];
  const [rows, sums] = await Promise.all([
    prisma.timer.findMany({
      where: { id: { in: timerIds }, userId: ctx.userId },
      select: timerSelect,
    }),
    prisma.timeEntry.groupBy({
      by: ["timerId"],
      where: { timerId: { in: timerIds }, isRunning: false },
      _sum: { duration: true },
    }),
  ]);
  const closed = new Map(sums.map((s) => [s.timerId, s._sum.duration ?? 0]));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const now = ctx.now();
  return timerIds
    .map((id) => byId.get(id))
    .filter((r): r is TimerRow => Boolean(r))
    .map((r) => toView(r, closed.get(r.id) ?? 0, now));
}

async function loadTimerView(ctx: ServiceContext, timerId: string): Promise<TimerView> {
  const [view] = await loadTimerViews(ctx, [timerId]);
  if (!view) throw createError("Timer not found", 404);
  return view;
}

const flush = (ctx: ServiceContext, events: PendingEvent[]) => {
  for (const e of events) emitToUser(ctx.userId, e.event, e.payload);
};

const timerSnapshot = (t: Partial<LockedTimer>) =>
  Object.fromEntries(AUDITED_TIMER_FIELDS.map((f) => [f, t[f] ?? null])) as Record<
    (typeof AUDITED_TIMER_FIELDS)[number],
    unknown
  >;

const isUniqueViolation = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export interface StartTimerInput {
  description?: string | null;
  projectId?: string | null;
  taskId?: string | null;
  sessionKey?: string | null;
  agent?: string | null;
  cwd?: string | null;
  gitRemote?: string | null;
  gitBranch?: string | null;
  idleTimeoutSeconds?: number | null;
  isAiGenerated?: boolean;
  startedAt?: Date | string | null;
}

/**
 * Starts a timer. With a `sessionKey` the call is idempotent: an existing
 * running timer is returned (and touched), a paused or stopped one resumes.
 */
export async function startTimer(
  ctx: ServiceContext,
  input: StartTimerInput,
  attempt = 0
): Promise<TimerActionResult> {
  const sessionKey = cleanSessionKey(input.sessionKey);
  // Truncate rather than reject: legacy clients (native apps) start timers
  // with whatever the user typed.
  const description =
    cleanText(input.description, "description", DESCRIPTION_MAX, { truncate: true }) ?? null;
  const agent = cleanAgent(input.agent) ?? null;
  const cwd = cleanToken(input.cwd, "cwd", 1000) ?? null;
  const gitBranch = cleanToken(input.gitBranch, "gitBranch", 255) ?? null;
  const gitRemote = normalizeGitRemote(input.gitRemote);
  const idleTimeoutSeconds = cleanIdleTimeout(input.idleTimeoutSeconds) ?? null;
  const startedAt = resolveAt(ctx, input.startedAt, "startedAt");
  if (ctx.now().getTime() - startedAt.getTime() > MAX_BACKDATE_MS) {
    throw createError("startedAt can be at most 24 hours in the past", 400);
  }

  if (sessionKey) {
    const existing = await prisma.timer.findUnique({
      where: { userId_sessionKey: { userId: ctx.userId, sessionKey } },
      select: { id: true, status: true },
    });
    if (existing) {
      // Refresh repo context (branch switches, worktrees) without touching
      // project/description, which only explicit updates may change.
      const contextPatch: Prisma.TimerUpdateInput = {};
      if (cwd) contextPatch.cwd = cwd;
      if (gitRemote) contextPatch.gitRemote = gitRemote;
      if (gitBranch) contextPatch.gitBranch = gitBranch;
      if (Object.keys(contextPatch).length > 0) {
        await prisma.timer.update({ where: { id: existing.id }, data: contextPatch });
      }
      if (existing.status === "running") {
        await touchTimer(ctx, existing.id, {});
        return {
          timer: await loadTimerView(ctx, existing.id),
          entry: null,
          changed: false,
          created: false,
        };
      }
      const resumed = await resumeTimer(ctx, existing.id, {});
      return { ...resumed, created: false };
    }
  }

  const isAiGenerated = input.isAiGenerated ?? ctx.aiDefault;
  const events: PendingEvent[] = [];
  let timerId: string;
  let entry: EntryView;

  try {
    ({ timerId, entry } = await prisma.$transaction(async (tx) => {
      const ref = await resolveProjectAndTask(tx, ctx.userId, {
        projectId: input.projectId,
        taskId: input.taskId,
      });
      await assertCanRunTimer(tx, ctx, { isAiGenerated });

      const timer = await tx.timer.create({
        data: {
          userId: ctx.userId,
          status: "running",
          description,
          projectId: ref.projectId ?? null,
          taskId: ref.taskId ?? null,
          sessionKey,
          agent,
          createdVia: ctx.via,
          isAiGenerated,
          cwd,
          gitRemote,
          gitBranch,
          idleTimeoutSeconds,
          lastActivityAt: ctx.now(),
          startedAt,
        },
      });
      const opened = await openSegment(tx, ctx, timer, startedAt, events);
      await recordAudit(tx, ctx, {
        entityType: "timer",
        entityId: timer.id,
        action: "start",
        changes: diffFields(null, timerSnapshot(timer), AUDITED_TIMER_FIELDS),
      });
      return { timerId: timer.id, entry: opened };
    }));
  } catch (e) {
    // Two starts with the same sessionKey raced; the loser re-runs and
    // lands on the idempotent path above.
    if (sessionKey && isUniqueViolation(e) && attempt === 0) {
      return startTimer(ctx, input, attempt + 1);
    }
    throw e;
  }

  const timer = await loadTimerView(ctx, timerId);
  flush(ctx, [{ event: "timer-started", payload: timer }, ...events]);
  return { timer, entry, changed: true, created: true };
}

export interface PauseOptions {
  at?: Date | string | null;
  reason?: PauseReason;
  /**
   * Idle sweeper guard: only pause if the timer's lastActivityAt still
   * equals this value (no heartbeat arrived since the sweep query ran).
   */
  expectLastActivityAt?: Date;
}

export async function pauseTimer(
  ctx: ServiceContext,
  timerId: string,
  opts: PauseOptions = {}
): Promise<TimerActionResult> {
  const reason: PauseReason = opts.reason ?? "manual";
  const at = resolveAt(ctx, opts.at);
  const events: PendingEvent[] = [];

  const { entry, changed } = await prisma.$transaction(async (tx) => {
    const timer = await lockTimer(tx, ctx, timerId);
    if (timer.status === "paused" && timer.pauseReason === "idle" && reason === "manual") {
      // A human pausing an idle-paused timer means "keep it paused": stray
      // heartbeats must no longer resume it.
      await tx.timer.update({ where: { id: timer.id }, data: { pauseReason: "manual" } });
      await recordAudit(tx, ctx, {
        entityType: "timer",
        entityId: timer.id,
        action: "pause",
        changes: { pauseReason: { from: "idle", to: "manual" } },
      });
      return { entry: null, changed: true };
    }
    if (timer.status !== "running") return { entry: null, changed: false };
    if (
      opts.expectLastActivityAt &&
      timer.lastActivityAt.getTime() !== opts.expectLastActivityAt.getTime()
    ) {
      return { entry: null, changed: false };
    }

    const closed = await closeSegment(
      tx,
      ctx,
      timer.id,
      at,
      reason === "idle" ? "idle" : "paused",
      events
    );
    const updated = await tx.timer.update({
      where: { id: timer.id },
      data: { status: "paused", pauseReason: reason },
    });
    await recordAudit(tx, ctx, {
      entityType: "timer",
      entityId: timer.id,
      action: reason === "idle" ? "auto_pause" : "pause",
      changes: diffFields(timerSnapshot(timer), timerSnapshot(updated), AUDITED_TIMER_FIELDS),
    });
    return { entry: closed, changed: true };
  });

  const timer = await loadTimerView(ctx, timerId);
  if (changed) flush(ctx, [{ event: "timer-paused", payload: timer }, ...events]);
  return { timer, entry, changed };
}

export async function resumeTimer(
  ctx: ServiceContext,
  timerId: string,
  opts: {
    at?: Date | string | null;
    /** Heartbeat path: only resume if the timer is (still) idle-paused under the lock. */
    onlyIfIdlePaused?: boolean;
  } = {}
): Promise<TimerActionResult> {
  const requestedAt = resolveAt(ctx, opts.at);
  if (ctx.now().getTime() - requestedAt.getTime() > MAX_BACKDATE_MS) {
    throw createError("A timer can be resumed at most 24 hours in the past", 400);
  }
  const events: PendingEvent[] = [];

  const { entry, changed } = await prisma.$transaction(async (tx) => {
    const timer = await lockTimer(tx, ctx, timerId);
    if (timer.status === "running") return { entry: null, changed: false };
    if (opts.onlyIfIdlePaused && !(timer.status === "paused" && timer.pauseReason === "idle")) {
      return { entry: null, changed: false };
    }
    await assertCanRunTimer(tx, ctx, { isAiGenerated: timer.isAiGenerated });

    // A backdated resume may not overlap the timer's previous segment (that
    // would bill the same minutes twice) nor start before the timer did.
    const last = await tx.timeEntry.findFirst({
      where: { timerId: timer.id, endTime: { not: null } },
      orderBy: { endTime: "desc" },
      select: { endTime: true },
    });
    let at = requestedAt;
    if (last?.endTime && at < last.endTime) at = last.endTime;
    if (at < timer.startedAt) at = timer.startedAt;

    const opened = await openSegment(tx, ctx, timer, at, events);
    const updated = await tx.timer.update({
      where: { id: timer.id },
      data: {
        status: "running",
        pauseReason: null,
        stoppedAt: null,
        lastActivityAt: ctx.now(),
      },
    });
    await recordAudit(tx, ctx, {
      entityType: "timer",
      entityId: timer.id,
      action: "resume",
      changes: diffFields(timerSnapshot(timer), timerSnapshot(updated), AUDITED_TIMER_FIELDS),
    });
    return { entry: opened, changed: true };
  });

  const timer = await loadTimerView(ctx, timerId);
  if (changed) flush(ctx, [{ event: "timer-resumed", payload: timer }, ...events]);
  return { timer, entry, changed };
}

export async function stopTimer(
  ctx: ServiceContext,
  timerId: string,
  opts: { at?: Date | string | null; reason?: string; keepEmpty?: boolean } = {}
): Promise<TimerActionResult> {
  const at = resolveAt(ctx, opts.at);
  const events: PendingEvent[] = [];

  const { entry, changed } = await prisma.$transaction(async (tx) => {
    const timer = await lockTimer(tx, ctx, timerId);
    if (timer.status === "stopped") return { entry: null, changed: false };

    const closed =
      timer.status === "running"
        ? await closeSegment(tx, ctx, timer.id, at, opts.reason ?? "stopped", events, opts.keepEmpty)
        : null;
    const updated = await tx.timer.update({
      where: { id: timer.id },
      data: { status: "stopped", pauseReason: null, stoppedAt: at },
    });
    await recordAudit(tx, ctx, {
      entityType: "timer",
      entityId: timer.id,
      action: "stop",
      changes: diffFields(timerSnapshot(timer), timerSnapshot(updated), AUDITED_TIMER_FIELDS),
    });
    return { entry: closed, changed: true };
  });

  const timer = await loadTimerView(ctx, timerId);
  if (changed) flush(ctx, [{ event: "timer-stopped", payload: timer }, ...events]);
  return { timer, entry, changed };
}

/**
 * Records agent activity. Running timers get `lastActivityAt` bumped
 * (debounced); timers the idle sweeper paused resume. Manually paused and
 * stopped timers are left alone — a stray heartbeat must not override a
 * human's decision to stop billing.
 */
export async function touchTimer(
  ctx: ServiceContext,
  timerId: string,
  opts: { at?: Date | string | null } = {}
): Promise<{ timer: TimerView; resumed: boolean }> {
  const at = resolveAt(ctx, opts.at);
  const timer = await prisma.timer.findFirst({
    where: { id: timerId, userId: ctx.userId },
    select: { id: true, status: true, pauseReason: true, lastActivityAt: true },
  });
  if (!timer) throw createError("Timer not found", 404);

  if (timer.status === "paused" && timer.pauseReason === "idle") {
    // Re-checked under the row lock: a stop or manual pause that lands
    // between this read and the resume wins.
    const result = await resumeTimer(ctx, timer.id, { onlyIfIdlePaused: true });
    return { timer: result.timer, resumed: result.changed };
  }

  if (
    timer.status === "running" &&
    at.getTime() - timer.lastActivityAt.getTime() >= TOUCH_DEBOUNCE_MS
  ) {
    // Conditional so a concurrent pause isn't overwritten and activity
    // never moves backwards.
    await prisma.timer.updateMany({
      where: { id: timer.id, status: "running", lastActivityAt: { lt: at } },
      data: { lastActivityAt: at },
    });
  }
  return { timer: await loadTimerView(ctx, timer.id), resumed: false };
}

export interface UpdateTimerInput {
  description?: string | null;
  projectId?: string | null;
  taskId?: string | null;
  idleTimeoutSeconds?: number | null;
  isAiGenerated?: boolean;
}

/**
 * Reassigns a timer. Project/task/classification changes apply to every
 * segment (rate snapshots recomputed); a new description replaces it on the
 * segments that still carry the old one.
 */
export async function updateTimer(
  ctx: ServiceContext,
  timerId: string,
  input: UpdateTimerInput
): Promise<TimerActionResult & { entriesUpdated: number }> {
  const description = cleanText(input.description, "description", DESCRIPTION_MAX);
  const idleTimeoutSeconds = cleanIdleTimeout(input.idleTimeoutSeconds);
  const events: PendingEvent[] = [];

  const { changed, entriesUpdated } = await prisma.$transaction(async (tx) => {
    const timer = await lockTimer(tx, ctx, timerId);
    const ref = await resolveProjectAndTask(tx, ctx.userId, {
      projectId: input.projectId,
      taskId: input.taskId,
    });

    let projectId = ref.projectId !== undefined ? ref.projectId : timer.projectId;
    let taskId = ref.taskId !== undefined ? ref.taskId : timer.taskId;
    if (input.taskId === undefined && ref.projectId !== undefined && taskId) {
      // Project changed without naming a task: keep the task only if it
      // belongs to the new project.
      const task = await tx.task.findUnique({ where: { id: taskId }, select: { projectId: true } });
      if (!projectId || task?.projectId !== projectId) taskId = null;
    }
    if (!projectId) taskId = null;

    const data: Prisma.TimerUpdateInput = {};
    if (description !== undefined) data.description = description;
    if (idleTimeoutSeconds !== undefined && idleTimeoutSeconds !== timer.idleTimeoutSeconds) {
      data.idleTimeoutSeconds = idleTimeoutSeconds;
      // Turning idle detection on for a timer that never sent heartbeats
      // must not let the sweeper cut it back to a stale lastActivityAt.
      const now = ctx.now();
      if (timer.status === "running" && timer.lastActivityAt < now) data.lastActivityAt = now;
    }
    if (input.isAiGenerated !== undefined) data.isAiGenerated = input.isAiGenerated;
    const assignmentChanged = projectId !== timer.projectId || taskId !== timer.taskId;
    if (assignmentChanged) {
      data.project = projectId ? { connect: { id: projectId } } : { disconnect: true };
      data.task = taskId ? { connect: { id: taskId } } : { disconnect: true };
    }
    if (Object.keys(data).length === 0) return { changed: false, entriesUpdated: 0 };

    const updated = await tx.timer.update({ where: { id: timer.id }, data });
    const timerChanges = diffFields(
      timerSnapshot(timer),
      timerSnapshot(updated),
      AUDITED_TIMER_FIELDS
    );
    if (!timerChanges) return { changed: false, entriesUpdated: 0 };

    // Propagate to segments.
    const segments = await tx.timeEntry.findMany({
      where: { timerId: timer.id },
      select: entrySelect,
    });
    const rate = assignmentChanged
      ? await getHourlyRate(tx, ctx.userId, projectId, taskId)
      : undefined;
    let touched = 0;
    for (const seg of segments) {
      const segData: Prisma.TimeEntryUncheckedUpdateInput = {};
      if (assignmentChanged) {
        segData.projectId = projectId;
        segData.taskId = taskId;
        segData.hourlyRateSnapshot = rate ?? null;
      }
      if (input.isAiGenerated !== undefined && seg.isAiGenerated !== input.isAiGenerated) {
        segData.isAiGenerated = input.isAiGenerated;
      }
      if (
        description !== undefined &&
        updated.description !== timer.description &&
        seg.description === timer.description
      ) {
        segData.description = updated.description;
      }
      if (Object.keys(segData).length === 0) continue;
      const after = await tx.timeEntry.update({
        where: { id: seg.id },
        data: segData,
        select: entrySelect,
      });
      const segChanges = diffFields(seg, after, [
        "description",
        "projectId",
        "taskId",
        "hourlyRateSnapshot",
        "isAiGenerated",
      ]);
      if (segChanges) {
        touched += 1;
        await recordAudit(tx, ctx, {
          entityType: "time_entry",
          entityId: seg.id,
          action: "update",
          changes: segChanges,
        });
        events.push({ event: "time-entry-updated", payload: after });
      }
    }

    await recordAudit(tx, ctx, {
      entityType: "timer",
      entityId: timer.id,
      action: "update",
      changes: timerChanges,
    });
    return { changed: true, entriesUpdated: touched };
  });

  const timer = await loadTimerView(ctx, timerId);
  if (changed) flush(ctx, [{ event: "timer-updated", payload: timer }, ...events]);
  return { timer, entry: timer.currentEntry, changed, entriesUpdated };
}

export async function addTimerNote(ctx: ServiceContext, timerId: string, body: string) {
  const text = cleanText(body, "note", 2000);
  if (!text) throw createError("note cannot be empty", 400);
  const timer = await prisma.timer.findFirst({
    where: { id: timerId, userId: ctx.userId },
    select: { id: true, status: true },
  });
  if (!timer) throw createError("Timer not found", 404);

  const note = await prisma.timerNote.create({
    data: { timerId, userId: ctx.userId, body: text, via: ctx.via, createdAt: ctx.now() },
    select: { id: true, body: true, via: true, createdAt: true, timerId: true },
  });
  // A note from an agent is a sign of life.
  if (timer.status === "running") await touchTimer(ctx, timerId, {});
  emitToUser(ctx.userId, "timer-note-added", note);
  return note;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export type TimerStatusFilter = TimerStatus | "active" | "all";

export async function listTimers(
  ctx: ServiceContext,
  opts: { status?: TimerStatusFilter; limit?: number } = {}
): Promise<TimerView[]> {
  const status = opts.status ?? "active";
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const where: Prisma.TimerWhereInput = { userId: ctx.userId };
  if (status === "active") where.status = { in: ["running", "paused"] };
  else if (status !== "all") where.status = status;

  const rows = await prisma.timer.findMany({
    where,
    select: { id: true },
    orderBy: { lastActivityAt: "desc" },
    take: limit,
  });
  return loadTimerViews(ctx, rows.map((r) => r.id));
}

export async function getTimerDetail(ctx: ServiceContext, timerId: string) {
  const timer = await loadTimerView(ctx, timerId);
  const [segments, notes] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { timerId, userId: ctx.userId },
      select: entrySelect,
      orderBy: { startTime: "asc" },
      take: 500,
    }),
    prisma.timerNote.findMany({
      where: { timerId, userId: ctx.userId },
      select: { id: true, body: true, via: true, createdAt: true },
      orderBy: { createdAt: "asc" },
      take: 500,
    }),
  ]);
  return { ...timer, segments, notes };
}

export async function findTimerBySessionKey(ctx: ServiceContext, sessionKey: string) {
  const key = cleanSessionKey(sessionKey);
  if (!key) return null;
  return prisma.timer.findUnique({
    where: { userId_sessionKey: { userId: ctx.userId, sessionKey: key } },
    select: { id: true, status: true, pauseReason: true },
  });
}

// ---------------------------------------------------------------------------
// Background job
// ---------------------------------------------------------------------------

/**
 * Pauses running timers whose heartbeats stopped more than their idle
 * timeout ago, ending the open segment at the last activity — time after
 * an agent went quiet is never billed. Safe to run concurrently with
 * heartbeats: each pause re-checks lastActivityAt under a row lock.
 */
export async function sweepIdleTimers(now: Date = new Date(), batchSize = 200): Promise<number> {
  const stale = await prisma.$queryRaw<
    Array<{ id: string; user_id: string; last_activity_at: Date }>
  >`
    SELECT id, user_id, last_activity_at FROM timers
    WHERE status = 'running'
      AND idle_timeout_seconds IS NOT NULL
      AND last_activity_at + make_interval(secs => idle_timeout_seconds) < ${now}
    ORDER BY last_activity_at ASC
    LIMIT ${batchSize}`;

  let paused = 0;
  for (const row of stale) {
    try {
      const result = await pauseTimer(systemContext(row.user_id, () => now), row.id, {
        at: row.last_activity_at,
        reason: "idle",
        expectLastActivityAt: row.last_activity_at,
      });
      if (result.changed) paused += 1;
    } catch (e) {
      logger.error(`Idle sweep failed for timer ${row.id}`, {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return paused;
}

export type { AuditChanges };
