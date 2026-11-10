import { prisma, TxClient } from "../utils/database";
import { createError } from "../middleware/errorHandler";
import { emitToUser } from "../realtime";
import { ServiceContext } from "./context";
import { recordAudit } from "./audit";

/**
 * Locks, in id order, every timer that points at the project/task or has
 * segments on it. Deletions cascade into time_entries and timers through
 * foreign keys; taking the timer locks first keeps the timer → entry lock
 * order every other writer uses, so deletes can't deadlock with pauses.
 */
async function lockTimersFor(
  tx: TxClient,
  userId: string,
  ref: { projectId?: string; taskId?: string }
): Promise<string[]> {
  const rows = ref.projectId
    ? await tx.$queryRaw<Array<{ id: string }>>`
        SELECT DISTINCT t.id FROM timers t
        LEFT JOIN time_entries e ON e.timer_id = t.id
        WHERE t.user_id = ${userId} AND (t.project_id = ${ref.projectId} OR e."projectId" = ${ref.projectId})
        ORDER BY t.id`
    : await tx.$queryRaw<Array<{ id: string }>>`
        SELECT DISTINCT t.id FROM timers t
        LEFT JOIN time_entries e ON e.timer_id = t.id
        WHERE t.user_id = ${userId} AND (t.task_id = ${ref.taskId} OR e."taskId" = ${ref.taskId})
        ORDER BY t.id`;
  for (const { id } of rows) {
    await tx.$queryRaw`SELECT id FROM timers WHERE id = ${id} FOR UPDATE`;
  }
  return rows.map((r) => r.id);
}

/**
 * Deletes a project and the time entries recorded on it. Timers whose
 * running segment is removed pause (they keep running work otherwise
 * unbilled). Entries of other projects — including unassigned ones — are
 * never touched.
 */
export async function deleteProject(ctx: ServiceContext, projectId: string): Promise<{ entriesDeleted: number }> {
  const pausedTimers: string[] = [];
  const result = await prisma.$transaction(async (tx) => {
    const project = await tx.project.findFirst({
      where: { id: projectId, userId: ctx.userId },
      select: { id: true, name: true },
    });
    if (!project) throw createError("Project not found", 404);

    await lockTimersFor(tx, ctx.userId, { projectId });

    const running = await tx.timeEntry.findMany({
      where: { userId: ctx.userId, projectId, isRunning: true, timerId: { not: null } },
      select: { timerId: true },
    });
    for (const { timerId } of running) {
      await tx.timer.update({ where: { id: timerId! }, data: { status: "paused", pauseReason: "manual" } });
      await recordAudit(tx, ctx, {
        entityType: "timer",
        entityId: timerId!,
        action: "pause",
        changes: { status: { from: "running", to: "paused" }, reason: { from: null, to: "project_deleted" } },
      });
      pausedTimers.push(timerId!);
    }

    const removed = await tx.timeEntry.deleteMany({ where: { userId: ctx.userId, projectId } });
    await tx.project.delete({ where: { id: projectId } });
    await recordAudit(tx, ctx, {
      entityType: "project",
      entityId: projectId,
      action: "delete",
      changes: { name: { from: project.name, to: null }, entriesDeleted: { from: removed.count, to: null } },
    });
    return { entriesDeleted: removed.count };
  });

  emitToUser(ctx.userId, "project-deleted", { id: projectId });
  for (const id of pausedTimers) emitToUser(ctx.userId, "timer-paused", { id });
  return result;
}

/** Deletes a task; its entries and timers keep their time and project, without the task. */
export async function deleteTask(ctx: ServiceContext, taskId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const task = await tx.task.findFirst({
      where: { id: taskId, userId: ctx.userId },
      select: { id: true, name: true },
    });
    if (!task) throw createError("Task not found", 404);
    await lockTimersFor(tx, ctx.userId, { taskId });
    await tx.task.delete({ where: { id: taskId } });
  });
  emitToUser(ctx.userId, "task-deleted", { id: taskId });
}
