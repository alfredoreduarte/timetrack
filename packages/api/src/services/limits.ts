import { TxClient } from "../utils/database";
import { createError } from "../middleware/errorHandler";
import { ServiceContext } from "./context";

/**
 * Hard ceiling on simultaneously running segments per user, regardless of
 * plan — keeps a runaway agent (or a leaked key looping start) from filling
 * the table. Plan-based limits for AI timers layer on top (Stage 4).
 */
export const MAX_RUNNING_ENTRIES = 25;

export async function assertCanRunTimer(
  tx: TxClient,
  ctx: ServiceContext,
  _opts: { isAiGenerated: boolean }
): Promise<void> {
  // Serialize starts/resumes per user so concurrent requests can't all pass
  // the count before any of them inserts (held until the transaction ends).
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ctx.userId}))`;
  const running = await tx.timeEntry.count({
    where: { userId: ctx.userId, isRunning: true },
  });
  if (running >= MAX_RUNNING_ENTRIES) {
    throw createError(
      `You can have at most ${MAX_RUNNING_ENTRIES} timers running at once. Pause or stop one first.`,
      429
    );
  }
}
