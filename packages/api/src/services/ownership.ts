import { prisma, TxClient } from "../utils/database";
import { createError } from "../middleware/errorHandler";

type Db = TxClient | typeof prisma;

export interface ProjectTaskRef {
  projectId: string | null;
  taskId: string | null;
}

/**
 * Validates that the project/task belong to the user and agree with each
 * other. A task alone implies its project. `undefined` means "not provided"
 * and is passed through so partial updates can tell it apart from null.
 *
 * Inside a transaction the rows are locked FOR KEY SHARE, project before
 * task (the global lock order): a concurrent project/task delete either
 * commits first — and this answers 404 — or waits until the caller is done.
 */
export async function resolveProjectAndTask(
  db: Db,
  userId: string,
  input: { projectId?: string | null; taskId?: string | null }
): Promise<{ projectId?: string | null; taskId?: string | null }> {
  let { projectId, taskId } = input;

  let taskProjectId: string | null = null;
  if (taskId) {
    const task = await db.task.findFirst({ where: { id: taskId, userId }, select: { projectId: true } });
    if (!task) throw createError("Task not found", 404);
    taskProjectId = task.projectId;
  }

  const projectIds = Array.from(new Set([projectId, taskProjectId].filter((x): x is string => !!x))).sort();
  for (const id of projectIds) {
    const rows = await db.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM projects WHERE id = ${id} AND "userId" = ${userId} FOR KEY SHARE`;
    if (rows.length === 0) throw createError(id === projectId ? "Project not found" : "Task not found", 404);
  }

  if (taskId) {
    const rows = await db.$queryRaw<Array<{ projectId: string }>>`
      SELECT "projectId" FROM tasks WHERE id = ${taskId} AND "userId" = ${userId} FOR KEY SHARE`;
    if (rows.length === 0) throw createError("Task not found", 404);
    if (projectId && rows[0].projectId !== projectId) {
      throw createError("Task does not belong to the given project", 400);
    }
    if (projectId === undefined || projectId === null) projectId = rows[0].projectId;
  }

  return { projectId, taskId };
}
