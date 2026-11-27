-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "agent_hourly_rate" DOUBLE PRECISION,
ADD COLUMN     "ai_cost_markup_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "ai_multiplier" DOUBLE PRECISION,
ADD COLUMN     "include_ai_costs" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "overlap_mode" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "overlap_mode" TEXT NOT NULL DEFAULT 'dedupe',
ALTER COLUMN "ai_multiplier" SET DEFAULT 1.0;

-- CreateTable
CREATE TABLE "share_links" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "token_hash" TEXT NOT NULL,
    "token_prefix" TEXT NOT NULL,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "rolling_days" INTEGER,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "show_amounts" BOOLEAN NOT NULL DEFAULT true,
    "show_notes" BOOLEAN NOT NULL DEFAULT true,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "last_viewed_at" TIMESTAMP(3),
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT,

    CONSTRAINT "share_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "share_links_token_hash_key" ON "share_links"("token_hash");

-- CreateIndex
CREATE INDEX "share_links_user_id_idx" ON "share_links"("user_id");

-- AddForeignKey
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
