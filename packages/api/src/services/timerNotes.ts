import { TxClient } from "../utils/database";

/**
 * Places the timer's waiting notes on its segment on the timer's own client:
 * the running one, else the latest (a timer's running segment is always on
 * its client). A note waits when it was written with no such segment, or
 * when its segment was discarded as empty; every write that can give the
 * timer one calls this, under the timer's row lock.
 */
export async function settleAwaitingNotes(tx: TxClient, timerId: string) {
  await tx.$executeRaw`
    UPDATE timer_notes n SET time_entry_id = s.id, awaiting_segment = false
    FROM (
      SELECT e.id FROM time_entries e
      JOIN timers t ON t.id = e.timer_id
      WHERE e.timer_id = ${timerId} AND e."projectId" IS NOT DISTINCT FROM t.project_id
      ORDER BY e."isRunning" DESC, e."startTime" DESC, e.id DESC
      LIMIT 1
    ) s
    WHERE n.timer_id = ${timerId} AND n.awaiting_segment`;
}
