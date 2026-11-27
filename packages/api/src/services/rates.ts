import { prisma, TxClient } from "../utils/database";

type Db = TxClient | typeof prisma;

/** Hourly rate cascade: task > project > user default. Null when none is set. */
export async function getHourlyRate(
  db: Db,
  userId: string,
  projectId?: string | null,
  taskId?: string | null
): Promise<number | null> {
  if (taskId) {
    const task = await db.task.findUnique({ where: { id: taskId }, select: { hourlyRate: true } });
    if (task?.hourlyRate !== null && task?.hourlyRate !== undefined) return task.hourlyRate;
  }
  if (projectId) {
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { hourlyRate: true },
    });
    if (project?.hourlyRate !== null && project?.hourlyRate !== undefined) return project.hourlyRate;
  }
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { defaultHourlyRate: true },
  });
  return user?.defaultHourlyRate ?? null;
}
