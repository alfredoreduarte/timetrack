-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "repo_patterns" TEXT[] DEFAULT ARRAY[]::TEXT[];
