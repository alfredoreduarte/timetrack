import { TxClient } from "../utils/database";
import { createError } from "../middleware/errorHandler";
import { ServiceContext } from "./context";
import { getEntitlements, planLimitError } from "./entitlements";

/**
 * Hard ceiling on simultaneously running segments per user, regardless of
 * plan — keeps a runaway agent (or a leaked key looping start) from filling
 * the table. Plan limits on parallel AI-agent timers layer on top.
 */
export const MAX_RUNNING_ENTRIES = 25;

export async function assertCanRunTimer(
  tx: TxClient,
  ctx: ServiceContext,
  opts: { isAiGenerated: boolean }
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
  if (opts.isAiGenerated) await assertAgentSlot(tx, ctx);
}

/**
 * The plan's cap on parallel AI-agent timers. Checked when an AI timer
 * starts or resumes, and when a running timer or segment is relabeled as AI
 * work — otherwise starting as human work and flipping the flag would
 * bypass it. Takes the same per-user lock as starts.
 */
export async function assertAgentSlot(tx: TxClient, ctx: ServiceContext): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ctx.userId}))`;
  const { limits } = await getEntitlements(ctx.userId, tx, ctx.now());
  if (limits.maxRunningAgentTimers === null) return;
  const runningAgents = await tx.timeEntry.count({
    where: { userId: ctx.userId, isRunning: true, isAiGenerated: true },
  });
  if (runningAgents >= limits.maxRunningAgentTimers) {
    throw planLimitError(
      `Your Free plan runs ${limits.maxRunningAgentTimers} AI agent timers at once; pause or stop one, or run up to ${MAX_RUNNING_ENTRIES} at once with Pro.`
    );
  }
}
