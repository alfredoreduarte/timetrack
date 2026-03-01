-- CreateTable
CREATE TABLE "github_integrations" (
    "id" TEXT NOT NULL,
    "github_user_id" INTEGER NOT NULL,
    "github_username" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "scope" TEXT,
    "avatar_url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "github_integrations_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Add GitHub fields to projects
ALTER TABLE "projects" ADD COLUMN "github_repo_id" INTEGER;
ALTER TABLE "projects" ADD COLUMN "github_repo_owner" TEXT;
ALTER TABLE "projects" ADD COLUMN "github_repo_name" TEXT;
ALTER TABLE "projects" ADD COLUMN "github_repo_full_name" TEXT;
ALTER TABLE "projects" ADD COLUMN "github_webhook_id" INTEGER;
ALTER TABLE "projects" ADD COLUMN "github_webhook_secret" TEXT;

-- AlterTable: Add GitHub fields to tasks
ALTER TABLE "tasks" ADD COLUMN "github_issue_id" INTEGER;
ALTER TABLE "tasks" ADD COLUMN "github_issue_number" INTEGER;
ALTER TABLE "tasks" ADD COLUMN "github_issue_url" TEXT;
ALTER TABLE "tasks" ADD COLUMN "github_labels" TEXT;
ALTER TABLE "tasks" ADD COLUMN "github_issue_state" TEXT;

-- CreateIndex
CREATE INDEX "github_integrations_github_user_id_idx" ON "github_integrations"("github_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "github_integrations_userId_key" ON "github_integrations"("userId");

-- CreateIndex
CREATE INDEX "tasks_github_issue_id_idx" ON "tasks"("github_issue_id");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_projectId_github_issue_number_key" ON "tasks"("projectId", "github_issue_number");

-- AddForeignKey
ALTER TABLE "github_integrations" ADD CONSTRAINT "github_integrations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
