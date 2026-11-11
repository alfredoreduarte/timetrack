import { prisma, TxClient } from "../utils/database";
import { createError } from "../middleware/errorHandler";
import { emitToUser } from "../realtime";
import { logger } from "../utils/logger";
import { ServiceContext } from "./context";
import { recordAudit } from "./audit";
import { loadTimerViews } from "./timers";
import { withTxRetry } from "./txRetry";

/*
 * Lock order, shared with every writer: timers (by id) → project → task →
 * entries (by id). A project delete takes timers → project FOR UPDATE →
 * its entries (by id), then the cascade reaches its tasks; a task delete
 * takes timers → project FOR SHARE → task FOR UPDATE → its entries (by id).
 * Attaching a timer or entry to a project or task takes a KEY SHARE lock on
 * that row (entry writers take it before any entry lock, see
 * lockAssignmentTargets), so once the delete holds the row nothing new can
 * attach. Anything that attached between the first timer query and that
 * lock is caught by re-checking the timer set; the transaction then retries
 * with those timers locked up front instead of locking them out of order.
 */

class TimerSetChanged extends Error {}

const retryDelete = <T>(label: string, fn: () => Promise<T>) =>
  withTxRetry(label, fn, { retryIf: (e) => e instanceof TimerSetChanged });

type Ref = { projectId: string } | { taskId: string };

/** Timers that point at the project/task, have segments on it, or (for a project) use one of its tasks. */
async function timerIdsFor(tx: TxClient, userId: string, ref: Ref): Promise<string[]> {
  const rows =
    "projectId" in ref
      ? await tx.$queryRaw<Array<{ id: string }>>`
          SELECT DISTINCT t.id FROM timers t
          LEFT JOIN time_entries e ON e.timer_id = t.id
          WHERE t.user_id = ${userId}
            AND (t.project_id = ${ref.projectId}
              OR e."projectId" = ${ref.projectId}
              OR t.task_id IN (SELECT id FROM tasks WHERE "projectId" = ${ref.projectId})
              OR e."taskId" IN (SELECT id FROM tasks WHERE "projectId" = ${ref.projectId}))
          ORDER BY t.id`
      : await tx.$queryRaw<Array<{ id: string }>>`
          SELECT DISTINCT t.id FROM timers t
          LEFT JOIN time_entries e ON e.timer_id = t.id
          WHERE t.user_id = ${userId} AND (t.task_id = ${ref.taskId} OR e."taskId" = ${ref.taskId})
          ORDER BY t.id`;
  return rows.map((r) => r.id);
}

async function lockTimers(tx: TxClient, ids: string[]): Promise<void> {
  for (const id of ids) {
    await tx.$queryRaw`SELECT id FROM timers WHERE id = ${id} FOR UPDATE`;
  }
}

/** After the parent row is locked, nothing new can attach; anything that did since the first query forces a retry. */
async function assertTimerSetStable(tx: TxClient, userId: string, ref: Ref, locked: string[]): Promise<void> {
  const held = new Set(locked);
  const now = await timerIdsFor(tx, userId, ref);
  if (now.some((id) => !held.has(id))) throw new TimerSetChanged();
}

/**
 * Deletes a project and the time entries recorded on it. Timers whose
 * running segment is removed pause (they keep running work otherwise
 * unbilled). Entries of other projects — including unassigned ones — are
 * never touched.
 */
export async function deleteProject(ctx: ServiceContext, projectId: string): Promise<{ entriesDeleted: number }> {
  const ref = { projectId };
  const { result, pausedTimers, touchedTimers } = await retryDelete("deleteProject", () =>
    prisma.$transaction(async (tx) => {
      const project = await tx.project.findFirst({
        where: { id: projectId, userId: ctx.userId },
        select: { id: true, name: true },
      });
      if (!project) throw createError("Project not found", 404);

      const timerIds = await timerIdsFor(tx, ctx.userId, ref);
      await lockTimers(tx, timerIds);
      const stillThere = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM projects WHERE id = ${projectId} FOR UPDATE`;
      if (stillThere.length === 0) throw createError("Project not found", 404);
      await assertTimerSetStable(tx, ctx.userId, ref, timerIds);
      // Entries in id order, as bulk updates take them; the cascade to the
      // project's tasks will clear taskId on these too.
      await tx.$queryRaw`
        SELECT id FROM time_entries
        WHERE "userId" = ${ctx.userId}
          AND ("projectId" = ${projectId} OR "taskId" IN (SELECT id FROM tasks WHERE "projectId" = ${projectId}))
        ORDER BY id FOR UPDATE`;

      // Every timer whose running segment is about to be deleted. All of
      // them are locked: any timer with an entry on the project is.
      const running = await tx.timeEntry.findMany({
        where: { userId: ctx.userId, projectId, isRunning: true, timerId: { not: null } },
        select: { timerId: true },
      });
      const paused: string[] = [];
      for (const timerId of new Set(running.map((r) => r.timerId!))) {
        await tx.timer.update({ where: { id: timerId }, data: { status: "paused", pauseReason: "manual" } });
        await recordAudit(tx, ctx, {
          entityType: "timer",
          entityId: timerId,
          action: "pause",
          changes: { status: { from: "running", to: "paused" }, reason: { from: null, to: "project_deleted" } },
        });
        paused.push(timerId);
      }

      const removed = await tx.timeEntry.deleteMany({ where: { userId: ctx.userId, projectId } });
      await tx.project.delete({ where: { id: projectId } });
      await recordAudit(tx, ctx, {
        entityType: "project",
        entityId: projectId,
        action: "delete",
        changes: { name: { from: project.name, to: null }, entriesDeleted: { from: removed.count, to: null } },
      });
      return { result: { entriesDeleted: removed.count }, pausedTimers: paused, touchedTimers: timerIds };
    })
  );

  emitToUser(ctx.userId, "project-deleted", { id: projectId });
  await emitTimerViews(ctx, pausedTimers, touchedTimers);
  return result;
}

/** Deletes a task; its entries and timers keep their time and project, without the task. */
export async function deleteTask(ctx: ServiceContext, taskId: string): Promise<void> {
  const ref = { taskId };
  const touchedTimers = await retryDelete("deleteTask", () =>
    prisma.$transaction(async (tx) => {
      const task = await tx.task.findFirst({
        where: { id: taskId, userId: ctx.userId },
        select: { id: true, projectId: true },
      });
      if (!task) throw createError("Task not found", 404);

      const timerIds = await timerIdsFor(tx, ctx.userId, ref);
      await lockTimers(tx, timerIds);
      // Serializes with a delete of the parent project, which would
      // otherwise take the task and entry locks in the opposite order.
      const parent = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM projects WHERE id = ${task.projectId} FOR SHARE`;
      const stillThere = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM tasks WHERE id = ${taskId} FOR UPDATE`;
      if (parent.length === 0 || stillThere.length === 0) throw createError("Task not found", 404);
      await assertTimerSetStable(tx, ctx.userId, ref, timerIds);
      // Entries in id order, as bulk updates take them (the delete clears their taskId).
      await tx.$queryRaw`SELECT id FROM time_entries WHERE "taskId" = ${taskId} ORDER BY id FOR UPDATE`;

      await tx.task.delete({ where: { id: taskId } });
      return timerIds;
    })
  );
  emitToUser(ctx.userId, "task-deleted", { id: taskId });
  await emitTimerViews(ctx, [], touchedTimers);
}

/** Paused timers get `timer-paused`; the rest lost their project or task and get `timer-updated`. */
async function emitTimerViews(ctx: ServiceContext, paused: string[], touched: string[]): Promise<void> {
  const ids = Array.from(new Set([...paused, ...touched]));
  if (ids.length === 0) return;
  try {
    const pausedSet = new Set(paused);
    for (const view of await loadTimerViews(ctx, ids)) {
      emitToUser(ctx.userId, pausedSet.has(view.id) ? "timer-paused" : "timer-updated", view);
    }
  } catch (e) {
    // The delete committed; a failed notification must not turn it into an error.
    logger.warn("Failed to emit timer updates after delete", { error: (e as Error).message });
  }
}
