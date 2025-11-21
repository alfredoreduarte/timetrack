-- Add idle_timeout_seconds column with default 600 seconds (10 minutes)
ALTER TABLE "users"
ADD COLUMN "idle_timeout_seconds" INTEGER DEFAULT 600;

