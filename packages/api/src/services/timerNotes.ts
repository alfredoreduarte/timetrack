import { TxClient } from "../utils/database";

/**
 * Places waiting notes on each timer's segment on the timer's own client:
 * the running one, else the latest (a timer's running segment is always on
 * its client). A note waits when it was written with no such segment, or
 * when its segment was discarded as empty; every write that can give a
 * timer one calls this, under the timers' row locks. One statement for any
 * number of timers; idempotent.
 */
export async function settleAwaitingNotes(tx: TxClient, timerIds: string | readonly string[]) {
  const ids = typeof timerIds === "string" ? [timerIds] : Array.from(timerIds);
  if (ids.length === 0) return;
  await tx.$executeRaw`
    UPDATE timer_notes n SET time_entry_id = s.id, awaiting_segment = false
    FROM (
      SELECT DISTINCT ON (e.timer_id) e.timer_id, e.id
      FROM time_entries e
      JOIN timers t ON t.id = e.timer_id
      JOIN unnest(${ids}::text[]) AS q(id) ON q.id = e.timer_id
      WHERE e."projectId" IS NOT DISTINCT FROM t.project_id
        AND EXISTS (SELECT 1 FROM timer_notes w WHERE w.timer_id = e.timer_id AND w.awaiting_segment)
      ORDER BY e.timer_id, e."isRunning" DESC, e."startTime" DESC, e.id DESC
    ) s
    WHERE n.timer_id = s.timer_id AND n.awaiting_segment`;
}
