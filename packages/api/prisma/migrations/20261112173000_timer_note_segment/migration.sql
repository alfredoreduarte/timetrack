-- A note belongs to the segment it was written on, so timesheets show it
-- with that segment's client and period, however the timer's segments are
-- later moved, trimmed or deleted (a deleted segment's notes show nowhere).
ALTER TABLE "timer_notes" ADD COLUMN "time_entry_id" TEXT;
-- A note written before the timer had a segment on its client goes with
-- the next one it opens.
ALTER TABLE "timer_notes" ADD COLUMN "awaiting_segment" BOOLEAN NOT NULL DEFAULT false;

-- Existing notes, by the rule new notes follow: the segment they were
-- written during; else (written in a pause) the latest earlier segment on
-- the timer's own client; else (written before any) the first one there;
-- else the next segment the timer opens.
UPDATE "timer_notes" n SET "time_entry_id" = COALESCE(
  (SELECT e."id" FROM "time_entries" e
    WHERE e."timer_id" = n."timer_id" AND e."startTime" <= n."created_at"
      AND (e."endTime" IS NULL OR e."endTime" >= n."created_at")
    ORDER BY e."startTime" DESC, e."id" DESC LIMIT 1),
  (SELECT e."id" FROM "time_entries" e JOIN "timers" t ON t."id" = e."timer_id"
    WHERE e."timer_id" = n."timer_id" AND e."projectId" IS NOT DISTINCT FROM t."project_id"
      AND e."startTime" <= n."created_at"
    ORDER BY e."startTime" DESC, e."id" DESC LIMIT 1),
  (SELECT e."id" FROM "time_entries" e JOIN "timers" t ON t."id" = e."timer_id"
    WHERE e."timer_id" = n."timer_id" AND e."projectId" IS NOT DISTINCT FROM t."project_id"
    ORDER BY e."startTime" ASC, e."id" ASC LIMIT 1)
);
UPDATE "timer_notes" SET "awaiting_segment" = true WHERE "time_entry_id" IS NULL;

CREATE INDEX "timer_notes_time_entry_id_idx" ON "timer_notes"("time_entry_id");

ALTER TABLE "timer_notes" ADD CONSTRAINT "timer_notes_time_entry_id_fkey" FOREIGN KEY ("time_entry_id") REFERENCES "time_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Correction to the origin backfill (20261112170000): a resume rewrites
-- created_via, so an imported session that was later resumed looked like
-- the resuming client's. Its segments still say they were imported.
-- (Session-keyed claude_code/cursor/codex timers from before origin existed
-- were all taken as hook sessions; one started through MCP looks the same
-- and can't be told apart. Production has no timers from before this
-- release, so only dev and staging rows are affected.)
UPDATE "timers" t SET "origin" = 'import'
WHERE t."origin" IS DISTINCT FROM 'import'
  AND EXISTS (SELECT 1 FROM "time_entries" e WHERE e."timer_id" = t."id" AND e."created_via" = 'import');
