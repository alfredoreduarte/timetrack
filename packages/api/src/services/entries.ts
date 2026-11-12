import { Prisma } from "@prisma/client";
import { prisma, TxClient } from "../utils/database";
import { createError } from "../middleware/errorHandler";
import { emitToUser } from "../realtime";
import { withTxRetry } from "./txRetry";
import { assertAgentSlot } from "./limits";
import { ServiceContext } from "./context";
import { diffFields, recordAudit, listAuditEvents } from "./audit";
import { getHourlyRate } from "./rates";
import { resolveProjectAndTask } from "./ownership";
import { cleanText, DESCRIPTION_MAX } from "./text";
import {
  entrySelect,
  EntryView,
  loadTimerViews,
  MAX_BACKDATE_MS,
  resolveAt,
  stopTimer,
} from "./timers";

/** Manually entered or edited entries may not span more than this. */
export const MAX_ENTRY_SECONDS = 24 * 60 * 60;
export const MAX_BULK_ENTRIES = 500;

const AUDITED_ENTRY_FIELDS = [
  "description",
  "startTime",
  "endTime",
  "duration",
  "projectId",
  "taskId",
  "hourlyRateSnapshot",
  "isAiGenerated",
  "timerId",
] as const;

type PendingEvent = { event: string; payload: unknown };

/**
 * Emits queued events after commit. Timer events are queued as
 * `{ timerId }` and sent with the full TimerView, the same payload the
 * timer service emits, so clients get one shape per event name.
 */
const flush = async (ctx: ServiceContext, events: PendingEvent[]) => {
  const timerIds = Array.from(
    new Set(
      events
        .filter((e) => e.event.startsWith("timer-"))
        .map((e) => (e.payload as { timerId: string }).timerId)
    )
  );
  const views = new Map((await loadTimerViews(ctx, timerIds)).map((v) => [v.id, v]));
  for (const e of events) {
    if (e.event.startsWith("timer-")) {
      const view = views.get((e.payload as { timerId: string }).timerId);
      if (view) emitToUser(ctx.userId, e.event, view);
    } else {
      emitToUser(ctx.userId, e.event, e.payload);
    }
  }
};

const parseTime = (ctx: ServiceContext, value: string | Date, field: string) => {
  const d = resolveAt(ctx, value, field);
  return d;
};

async function lockTimerRow(tx: TxClient, timerId: string) {
  await tx.$queryRaw`SELECT id FROM timers WHERE id = ${timerId} FOR UPDATE`;
}

/**
 * Takes the KEY SHARE locks a reassignment needs on its target project and
 * task before any entry is locked. Postgres would take them anyway when the
 * row is written, but only after the entry lock — the reverse of a project
 * or task delete (which lock the parent row, then its entries), which
 * deadlocks.
 */
async function lockAssignmentTargets(
  tx: TxClient,
  ctx: ServiceContext,
  target: { projectId?: string | null; taskId?: string | null }
) {
  const projectIds = new Set<string>();
  if (target.projectId) projectIds.add(target.projectId);
  if (target.taskId) {
    const task = await tx.task.findFirst({
      where: { id: target.taskId, userId: ctx.userId },
      select: { projectId: true },
    });
    if (task) projectIds.add(task.projectId);
  }
  for (const id of Array.from(projectIds).sort()) {
    await tx.$queryRaw`SELECT id FROM projects WHERE id = ${id} AND "userId" = ${ctx.userId} FOR KEY SHARE`;
  }
  if (target.taskId) {
    await tx.$queryRaw`SELECT id FROM tasks WHERE id = ${target.taskId} AND "userId" = ${ctx.userId} FOR KEY SHARE`;
  }
}

/**
 * Locks an entry for modification and returns a fresh copy. Lock order is
 * timer → target project/task → entry (the timer service closes/opens
 * segments while holding the timer lock), so a concurrent pause/stop can't
 * interleave with an edit and leave it acting on a stale snapshot.
 */
async function lockAndLoadEntry(
  tx: TxClient,
  ctx: ServiceContext,
  id: string,
  target: { projectId?: string | null; taskId?: string | null } = {}
) {
  const head = await tx.timeEntry.findFirst({
    where: { id, userId: ctx.userId },
    select: { id: true, timerId: true },
  });
  if (!head) return null;
  if (head.timerId) await lockTimerRow(tx, head.timerId);
  await lockAssignmentTargets(tx, ctx, target);
  await tx.$queryRaw`SELECT id FROM time_entries WHERE id = ${id} FOR UPDATE`;
  return tx.timeEntry.findFirst({ where: { id, userId: ctx.userId }, select: entrySelect });
}

/**
 * Segments of one timer are one stream of work and must not overlap —
 * overlapping segments would bill the same minutes twice. (Separate timers
 * may overlap: that's parallel agents, handled by billing policies.)
 */
async function assertNoSegmentOverlap(
  tx: TxClient,
  ctx: ServiceContext,
  timerId: string,
  start: Date,
  end: Date | null,
  excludeId?: string
) {
  const effectiveEnd = end ?? ctx.now();
  const clash = await tx.timeEntry.findFirst({
    where: {
      timerId,
      id: excludeId ? { not: excludeId } : undefined,
      startTime: { lt: effectiveEnd },
      OR: [{ endTime: null }, { endTime: { gt: start } }],
    },
    select: { id: true },
  });
  if (clash) {
    throw createError("This time overlaps another segment of the same timer", 400);
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getEntry(ctx: ServiceContext, id: string): Promise<EntryView> {
  const entry = await prisma.timeEntry.findFirst({
    where: { id, userId: ctx.userId },
    select: entrySelect,
  });
  if (!entry) throw createError("Time entry not found", 404);
  return entry;
}

export interface ListEntriesFilters {
  projectId?: string;
  taskId?: string;
  timerId?: string;
  isRunning?: boolean;
  isAiGenerated?: boolean;
  createdVia?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

export async function listEntries(ctx: ServiceContext, f: ListEntriesFilters) {
  const page = Math.max(1, f.page ?? 1);
  const limit = Math.min(100, Math.max(1, f.limit ?? 50));
  const where: Prisma.TimeEntryWhereInput = { userId: ctx.userId };
  if (f.projectId) where.projectId = f.projectId;
  if (f.taskId) where.taskId = f.taskId;
  if (f.timerId) where.timerId = f.timerId;
  if (f.isRunning !== undefined) where.isRunning = f.isRunning;
  if (f.isAiGenerated !== undefined) where.isAiGenerated = f.isAiGenerated;
  if (f.createdVia) where.createdVia = f.createdVia;
  if (f.startDate || f.endDate) {
    where.startTime = {};
    if (f.startDate) where.startTime.gte = f.startDate;
    if (f.endDate) where.startTime.lte = f.endDate;
  }
  const [total, entries] = await Promise.all([
    prisma.timeEntry.count({ where }),
    prisma.timeEntry.findMany({
      where,
      select: entrySelect,
      orderBy: { startTime: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  return { entries, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export async function getEntryHistory(ctx: ServiceContext, id: string) {
  const events = await listAuditEvents(ctx, "time_entry", id);
  if (events.length === 0) {
    // Distinguish "no history yet" from "not yours / doesn't exist".
    await getEntry(ctx, id);
  }
  return events;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export interface CreateEntryInput {
  description?: string | null;
  startTime: string | Date;
  endTime: string | Date;
  projectId?: string | null;
  taskId?: string | null;
  isAiGenerated?: boolean;
  timerId?: string | null;
}

/** Creates a closed entry — manual backfill by a human or an agent. */
export async function createEntry(ctx: ServiceContext, input: CreateEntryInput): Promise<EntryView> {
  const start = parseTime(ctx, input.startTime, "startTime");
  const end = parseTime(ctx, input.endTime, "endTime");
  if (end <= start) throw createError("End time must be after start time", 400);
  const duration = Math.floor((end.getTime() - start.getTime()) / 1000);
  if (duration > MAX_ENTRY_SECONDS) {
    throw createError("A single entry can span at most 24 hours", 400);
  }
  const description = cleanText(input.description, "description", DESCRIPTION_MAX) ?? null;

  const entry = await prisma.$transaction(async (tx) => {
    let timer: { id: string; projectId: string | null; taskId: string | null } | null = null;
    if (input.timerId) {
      // Lock before reading the assignment we may inherit, so a concurrent
      // reassignment can't leave this segment on the old project.
      const owned = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM timers WHERE id = ${input.timerId} AND user_id = ${ctx.userId} FOR UPDATE`;
      if (owned.length === 0) throw createError("Timer not found", 404);
      timer = await tx.timer.findUniqueOrThrow({
        where: { id: input.timerId },
        select: { id: true, projectId: true, taskId: true },
      });
    }
    // Inherit the timer's task only along with its project.
    const ref = await resolveProjectAndTask(tx, ctx.userId, {
      projectId: input.projectId !== undefined ? input.projectId : timer?.projectId,
      taskId:
        input.taskId !== undefined
          ? input.taskId
          : input.projectId === undefined
            ? timer?.taskId
            : undefined,
    });
    if (timer) await assertNoSegmentOverlap(tx, ctx, timer.id, start, end);
    const rate = await getHourlyRate(tx, ctx.userId, ref.projectId, ref.taskId);
    const created = await tx.timeEntry.create({
      data: {
        description,
        startTime: start,
        endTime: end,
        duration,
        isRunning: false,
        projectId: ref.projectId ?? null,
        taskId: ref.taskId ?? null,
        userId: ctx.userId,
        hourlyRateSnapshot: rate,
        createdVia: ctx.via,
        isAiGenerated: input.isAiGenerated ?? ctx.aiDefault,
        timerId: timer?.id ?? null,
        stopReason: "manual",
      },
      select: entrySelect,
    });
    await recordAudit(tx, ctx, {
      entityType: "time_entry",
      entityId: created.id,
      action: "create",
      changes: diffFields(null, created, AUDITED_ENTRY_FIELDS),
    });
    return created;
  });

  emitToUser(ctx.userId, "time-entry-created", entry);
  return entry;
}

export interface UpdateEntryInput {
  description?: string | null;
  startTime?: string | Date;
  endTime?: string | Date;
  hours?: number;
  projectId?: string | null;
  taskId?: string | null;
  isAiGenerated?: boolean;
}

type ExistingEntry = EntryView;

async function findOwnedEntry(tx: TxClient, ctx: ServiceContext, id: string) {
  return tx.timeEntry.findFirst({ where: { id, userId: ctx.userId }, select: entrySelect });
}

const sameInstant = (value: string | Date | undefined, stored: Date | null) =>
  value !== undefined && stored !== null && new Date(value).getTime() === stored.getTime();

/**
 * Applies a patch to one entry inside an open transaction. The caller must
 * have locked it (lockAndLoadEntry). Only fields that actually change are
 * written. Running entries accept everything except their end (stop/pause
 * the timer for that); edits to a timer's running segment are mirrored onto
 * the timer so its next segments match.
 */
async function applyEntryUpdate(
  tx: TxClient,
  ctx: ServiceContext,
  existing: ExistingEntry,
  patch: UpdateEntryInput,
  events: PendingEvent[],
  /** Entries this same batch updates itself (left out of the sibling rename). */
  batchIds: ReadonlySet<string> = new Set()
): Promise<EntryView> {
  const startChanged = patch.startTime !== undefined && !sameInstant(patch.startTime, existing.startTime);
  const endChanged = patch.endTime !== undefined && !sameInstant(patch.endTime, existing.endTime);
  const hoursGiven = patch.hours !== undefined;

  if (existing.isRunning && (endChanged || hoursGiven)) {
    throw createError(
      "Cannot set the end of a running entry. Pause or stop its timer instead.",
      400
    );
  }

  // Unchanged descriptions pass through untouched (older ones may exceed today's cap).
  const descriptionChanged =
    patch.description !== undefined && patch.description !== existing.description;
  const description = descriptionChanged
    ? cleanText(patch.description, "description", DESCRIPTION_MAX)
    : undefined;

  const ref = await resolveProjectAndTask(tx, ctx.userId, {
    projectId: patch.projectId,
    taskId: patch.taskId,
  });
  let projectId = ref.projectId !== undefined ? ref.projectId : existing.projectId;
  let taskId = ref.taskId !== undefined ? ref.taskId : existing.taskId;
  if (patch.taskId === undefined && ref.projectId !== undefined && taskId) {
    const task = await tx.task.findUnique({ where: { id: taskId }, select: { projectId: true } });
    if (!projectId || task?.projectId !== projectId) taskId = null;
  }
  // A task needs a project, but only an edit of the assignment enforces it:
  // older entries may carry a task alone, and editing their text or times
  // must not drop the task or re-rate them.
  if (!projectId && (ref.projectId !== undefined || ref.taskId !== undefined)) taskId = null;

  const data: Prisma.TimeEntryUncheckedUpdateInput = {};
  const now = ctx.now();

  // Times — validated only when they actually change.
  let startTime = existing.startTime;
  let endTime = existing.endTime;
  if (startChanged) startTime = resolveAt(ctx, patch.startTime!, "startTime");
  if (existing.isRunning) {
    if (startChanged) {
      if (now.getTime() - startTime.getTime() > MAX_BACKDATE_MS) {
        throw createError(
          "A running entry can start at most 24 hours ago. Create a separate entry for older work.",
          400
        );
      }
      data.startTime = startTime;
    }
  } else if (startChanged || endChanged || hoursGiven) {
    if (hoursGiven) {
      if (!(patch.hours! > 0) || patch.hours! > 24) {
        throw createError("Hours must be between 0 and 24", 400);
      }
      // Whole seconds: hours sent as seconds/3600 must round-trip exactly.
      endTime = new Date(startTime.getTime() + Math.round(patch.hours! * 3600) * 1000);
      if (endTime.getTime() > now.getTime()) throw createError("endTime cannot be in the future", 400);
    } else if (endChanged) {
      endTime = resolveAt(ctx, patch.endTime!, "endTime");
    }
    if (!endTime || endTime <= startTime) {
      throw createError("End time must be after start time", 400);
    }
    const duration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);
    // Only growing a span past 24h is rejected; long entries produced by a
    // timer stay editable.
    if (duration > MAX_ENTRY_SECONDS && duration > (existing.duration ?? 0)) {
      throw createError("A single entry can span at most 24 hours", 400);
    }
    data.startTime = startTime;
    data.endTime = endTime;
    data.duration = duration;
  }

  if (data.startTime !== undefined && existing.timerId) {
    await assertNoSegmentOverlap(tx, ctx, existing.timerId, startTime, existing.isRunning ? null : endTime, existing.id);
  }

  const assignmentChanged = projectId !== existing.projectId || taskId !== existing.taskId;
  if (assignmentChanged) {
    data.projectId = projectId;
    data.taskId = taskId;
    data.hourlyRateSnapshot = await getHourlyRate(tx, ctx.userId, projectId, taskId);
  }
  if (description !== undefined) data.description = description;
  if (patch.isAiGenerated !== undefined && patch.isAiGenerated !== existing.isAiGenerated) {
    if (patch.isAiGenerated && existing.isRunning) await assertAgentSlot(tx, ctx);
    data.isAiGenerated = patch.isAiGenerated;
  }

  if (Object.keys(data).length === 0) return existing;

  const updated = await tx.timeEntry.update({
    where: { id: existing.id },
    data,
    select: entrySelect,
  });

  const changes = diffFields(existing, updated, AUDITED_ENTRY_FIELDS);
  if (changes) {
    await recordAudit(tx, ctx, {
      entityType: "time_entry",
      entityId: updated.id,
      action: "update",
      changes,
    });
    events.push({ event: "time-entry-updated", payload: updated });
  }

  if (existing.isRunning && existing.timerId && changes) {
    const timer = await tx.timer.findUniqueOrThrow({ where: { id: existing.timerId } });
    const timerData: Prisma.TimerUncheckedUpdateInput = {};
    if (changes.description) timerData.description = updated.description;
    if (changes.projectId || changes.taskId) {
      timerData.projectId = updated.projectId;
      timerData.taskId = updated.taskId;
    }
    if (changes.isAiGenerated) timerData.isAiGenerated = updated.isAiGenerated;
    if (Object.keys(timerData).length > 0) {
      await tx.timer.update({ where: { id: timer.id }, data: timerData });
      if (changes.description) {
        // As a timer rename does: its other segments that still carry the
        // old text take the new one (the timer's lock is held, see
        // lockAndLoadEntry).
        const stale = await tx.timeEntry.findMany({
          where: { timerId: timer.id, id: { notIn: [updated.id, ...batchIds] }, description: timer.description },
          select: entrySelect,
          orderBy: { id: "asc" },
        });
        for (const seg of stale) {
          const after = await tx.timeEntry.update({
            where: { id: seg.id },
            data: { description: updated.description },
            select: entrySelect,
          });
          await recordAudit(tx, ctx, {
            entityType: "time_entry",
            entityId: seg.id,
            action: "update",
            changes: { description: { from: seg.description, to: after.description } },
          });
          events.push({ event: "time-entry-updated", payload: after });
        }
      }
      const timerChanges: Record<string, { from: unknown; to: unknown }> = {};
      for (const k of Object.keys(timerData)) {
        timerChanges[k] = {
          from: (timer as Record<string, unknown>)[k] ?? null,
          to: (timerData as Record<string, unknown>)[k] ?? null,
        };
      }
      await recordAudit(tx, ctx, {
        entityType: "timer",
        entityId: timer.id,
        action: "update",
        changes: timerChanges,
      });
      events.push({ event: "timer-updated", payload: { timerId: timer.id } });
    }
  }
  return updated;
}

export async function updateEntry(
  ctx: ServiceContext,
  id: string,
  patch: UpdateEntryInput
): Promise<EntryView> {
  let events: PendingEvent[] = [];
  const entry = await withTxRetry("updateEntry", () => {
    events = [];
    return prisma.$transaction(async (tx) => {
      const existing = await lockAndLoadEntry(tx, ctx, id, patch);
      if (!existing) throw createError("Time entry not found", 404);
      return applyEntryUpdate(tx, ctx, existing, patch, events);
    });
  });
  await flush(ctx, events);
  return entry;
}

export interface BulkUpdateInput {
  ids: string[];
  set: Pick<UpdateEntryInput, "description" | "projectId" | "taskId" | "isAiGenerated">;
}

/** Applies the same reassignment to many entries atomically. */
export async function bulkUpdateEntries(ctx: ServiceContext, input: BulkUpdateInput) {
  const ids = Array.from(new Set(input.ids));
  if (ids.length === 0) throw createError("ids cannot be empty", 400);
  if (ids.length > MAX_BULK_ENTRIES) {
    throw createError(`At most ${MAX_BULK_ENTRIES} entries per bulk update`, 400);
  }
  if (Object.values(input.set).every((v) => v === undefined)) {
    throw createError("set must change at least one field", 400);
  }
  let events: PendingEvent[] = [];
  const entries = await withTxRetry("bulkUpdateEntries", () => {
    events = [];
    return prisma.$transaction(
      async (tx) => {
        const heads = await tx.timeEntry.findMany({
          where: { id: { in: ids }, userId: ctx.userId },
          select: { id: true, timerId: true },
        });
        if (heads.length !== ids.length) {
          throw createError(`${ids.length - heads.length} of the entries were not found`, 404);
        }
        // Lock timers in a stable order (deadlock-free), then the entries.
        const timerIds = Array.from(new Set(heads.map((h) => h.timerId).filter((t): t is string => !!t))).sort();
        for (const t of timerIds) await lockTimerRow(tx, t);
        await lockAssignmentTargets(tx, ctx, input.set);
        await tx.$queryRaw`SELECT id FROM time_entries WHERE id = ANY(${ids}) ORDER BY id FOR UPDATE`;
        const found = await tx.timeEntry.findMany({
          where: { id: { in: ids }, userId: ctx.userId },
          select: entrySelect,
        });
        const out: EntryView[] = [];
        for (const existing of found) {
          out.push(await applyEntryUpdate(tx, ctx, existing, input.set, events, new Set(ids)));
        }
        return out;
      },
      { timeout: 30_000 }
    );
  });
  await flush(ctx, events);
  return { updated: entries.length, entries };
}

/**
 * Deletes an entry. Deleting a timer's running segment pauses the timer
 * (the work stopped being billable) rather than leaving it running with no
 * open segment.
 */
export async function deleteEntry(ctx: ServiceContext, id: string): Promise<void> {
  const events: PendingEvent[] = [];
  await prisma.$transaction(async (tx) => {
    const existing = await lockAndLoadEntry(tx, ctx, id);
    if (!existing) throw createError("Time entry not found", 404);
    if (existing.isRunning && existing.timerId) {
      // Re-read under the lock: only pause if this is still the timer's
      // running segment.
      const timer = await tx.timer.findUniqueOrThrow({
        where: { id: existing.timerId },
        select: { id: true, status: true },
      });
      if (timer.status === "running") {
        await tx.timer.update({
          where: { id: timer.id },
          data: { status: "paused", pauseReason: "manual" },
        });
        await recordAudit(tx, ctx, {
          entityType: "timer",
          entityId: timer.id,
          action: "pause",
          changes: { status: { from: "running", to: "paused" } },
        });
        events.push({ event: "timer-paused", payload: { timerId: timer.id } });
      }
    }
    await tx.timeEntry.delete({ where: { id } });
    await recordAudit(tx, ctx, {
      entityType: "time_entry",
      entityId: id,
      action: "delete",
      changes: diffFields(existing, null, AUDITED_ENTRY_FIELDS),
    });
    events.push({ event: "time-entry-deleted", payload: { id } });
  });
  await flush(ctx, events);
}

/**
 * Legacy `POST /time-entries/:id/stop`. Entries that belong to a timer stop
 * the whole timer (same behavior clients had before timers existed).
 */
export async function stopEntry(
  ctx: ServiceContext,
  id: string,
  opts: { endTime?: string | null }
): Promise<EntryView> {
  const existing = await prisma.timeEntry.findFirst({
    where: { id, userId: ctx.userId },
    select: { id: true, isRunning: true, timerId: true, startTime: true },
  });
  if (!existing) throw createError("Time entry not found", 404);
  if (!existing.isRunning) throw createError("Time entry is not running", 400);
  const end = resolveAt(ctx, opts.endTime, "endTime");
  if (end < existing.startTime) throw createError("End time must be after start time", 400);

  if (existing.timerId) {
    const result = await stopTimer(ctx, existing.timerId, { at: end, keepEmpty: true });
    if (result.entry && result.entry.id === id) return result.entry;
    return getEntry(ctx, id);
  }

  // Pre-timer entry still running (created before timers existed).
  const entry = await prisma.$transaction(async (tx) => {
    const fresh = await lockAndLoadEntry(tx, ctx, id);
    if (!fresh || !fresh.isRunning) throw createError("Time entry is not running", 400);
    if (end < fresh.startTime) throw createError("End time must be after start time", 400);
    const duration = Math.floor((end.getTime() - fresh.startTime.getTime()) / 1000);
    const updated = await tx.timeEntry.update({
      where: { id },
      data: { endTime: end, duration, isRunning: false, stopReason: "stopped" },
      select: entrySelect,
    });
    await recordAudit(tx, ctx, {
      entityType: "time_entry",
      entityId: id,
      action: "stop",
      changes: { endTime: { from: null, to: end.toISOString() }, duration: { from: null, to: duration } },
    });
    return updated;
  });
  emitToUser(ctx.userId, "time-entry-stopped", entry);
  return entry;
}
