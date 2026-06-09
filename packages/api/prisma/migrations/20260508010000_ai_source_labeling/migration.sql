-- AlterTable
ALTER TABLE "time_entries" ADD COLUMN     "created_via" TEXT NOT NULL DEFAULT 'web',
ADD COLUMN     "is_ai_generated" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "ai_multiplier" DOUBLE PRECISION DEFAULT 3.0;

-- CreateIndex
CREATE INDEX "time_entries_userId_is_ai_generated_idx" ON "time_entries"("userId", "is_ai_generated");
