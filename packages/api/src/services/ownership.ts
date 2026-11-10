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
 */
export async function resolveProjectAndTask(
  db: Db,
  userId: string,
  input: { projectId?: string | null; taskId?: string | null }
): Promise<{ projectId?: string | null; taskId?: string | null }> {
  let { projectId, taskId } = input;

  if (projectId) {
    const project = await db.project.findFirst({
      where: { id: projectId, userId },
      select: { id: true },
    });
    if (!project) throw createError("Project not found", 404);
  }

  if (taskId) {
    const task = await db.task.findFirst({
      where: { id: taskId, userId },
      select: { id: true, projectId: true },
    });
    if (!task) throw createError("Task not found", 404);
    if (projectId && task.projectId !== projectId) {
      throw createError("Task does not belong to the given project", 400);
    }
    if (projectId === undefined || projectId === null) projectId = task.projectId;
  }

  return { projectId, taskId };
}
