-- AlterTable
ALTER TABLE "time_entries" ADD COLUMN     "stop_reason" TEXT,
ADD COLUMN     "timer_id" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "agent_idle_timeout_seconds" INTEGER NOT NULL DEFAULT 900;

-- CreateTable
CREATE TABLE "timers" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "description" TEXT,
    "session_key" TEXT,
    "agent" TEXT,
    "created_via" TEXT NOT NULL DEFAULT 'web',
    "is_ai_generated" BOOLEAN NOT NULL DEFAULT false,
    "cwd" TEXT,
    "git_remote" TEXT,
    "git_branch" TEXT,
    "idle_timeout_seconds" INTEGER,
    "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pause_reason" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stopped_at" TIMESTAMP(3),
    "usage" JSONB,
    "cost_usd" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT,
    "task_id" TEXT,

    CONSTRAINT "timers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timer_notes" (
    "id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "via" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "timer_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "timer_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "timers_user_id_status_idx" ON "timers"("user_id", "status");

-- CreateIndex
CREATE INDEX "timers_status_last_activity_at_idx" ON "timers"("status", "last_activity_at");

-- CreateIndex
CREATE UNIQUE INDEX "timers_user_id_session_key_key" ON "timers"("user_id", "session_key");

-- CreateIndex
CREATE INDEX "timer_notes_timer_id_created_at_idx" ON "timer_notes"("timer_id", "created_at");

-- CreateIndex
CREATE INDEX "timer_notes_user_id_created_at_idx" ON "timer_notes"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "time_entries_timer_id_idx" ON "time_entries"("timer_id");

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_timer_id_fkey" FOREIGN KEY ("timer_id") REFERENCES "timers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timers" ADD CONSTRAINT "timers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timers" ADD CONSTRAINT "timers_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timers" ADD CONSTRAINT "timers_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timer_notes" ADD CONSTRAINT "timer_notes_timer_id_fkey" FOREIGN KEY ("timer_id") REFERENCES "timers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timer_notes" ADD CONSTRAINT "timer_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: entries still running at deploy time become the first segment of a
-- running timer, so they can be paused/resumed like timers created from now on.
-- Closed historical entries stay timer-less; reports never needed timers.
INSERT INTO "timers" (
    "id", "status", "description", "created_via", "is_ai_generated",
    "last_activity_at", "started_at", "created_at", "updated_at",
    "user_id", "project_id", "task_id"
)
SELECT
    'tmr_' || e."id", 'running', e."description", e."created_via", e."is_ai_generated",
    NOW(), e."startTime", e."startTime", NOW(),
    e."userId", e."projectId", e."taskId"
FROM "time_entries" e
WHERE e."isRunning" = true AND e."timer_id" IS NULL;

UPDATE "time_entries"
SET "timer_id" = 'tmr_' || "id"
WHERE "isRunning" = true AND "timer_id" IS NULL;
