-- How a timer was created (agent_hook | import | the client: web, api, mcp,
-- claude_code, ...). Unlike created_via (a resume rewrites it) it never
-- changes, so imports can tell the plugin's own sessions from AI work
-- tracked another way.
ALTER TABLE "timers" ADD COLUMN "origin" TEXT;

-- Existing timers: imports and hook sessions (hooks set the agent as the
-- client and carry the agent's session id); everything else by its client.
UPDATE "timers" SET "origin" = CASE
  WHEN "created_via" = 'import' THEN 'import'
  WHEN "created_via" IN ('claude_code', 'cursor', 'codex') AND "session_key" IS NOT NULL THEN 'agent_hook'
  ELSE "created_via"
END;

-- Notes and costs look up a timer's segments by start time.
CREATE INDEX "time_entries_timer_id_startTime_idx" ON "time_entries"("timer_id", "startTime");
