-- AlterTable: Change favorites.taskId FK from CASCADE to SET NULL on delete
ALTER TABLE "favorites" DROP CONSTRAINT "favorites_taskId_fkey";
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
