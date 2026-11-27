import { sweepIdleTimers } from "../services/timers";
import { logger } from "../utils/logger";

const DEFAULT_INTERVAL_MS = 60_000;

/**
 * Periodically pauses agent timers that stopped sending heartbeats. Runs
 * in-process; each pause is guarded by a row lock + lastActivityAt check, so
 * overlapping runs (or several API instances) are harmless.
 */
export function startIdleSweeper(intervalMs = DEFAULT_INTERVAL_MS): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const paused = await sweepIdleTimers(new Date());
      if (paused > 0) logger.info(`Idle sweeper paused ${paused} timer(s)`);
    } catch (e) {
      logger.error("Idle sweeper failed", { error: e instanceof Error ? e.message : String(e) });
    } finally {
      running = false;
    }
  };
  const handle = setInterval(tick, intervalMs);
  handle.unref();
  return () => clearInterval(handle);
}
