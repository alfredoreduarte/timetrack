-- Deleting a project, a task or an account sets these references to NULL
-- (or deletes the rows); without an index each of those scans the table.
CREATE INDEX "timers_project_id_idx" ON "timers"("project_id");
CREATE INDEX "timers_task_id_idx" ON "timers"("task_id");
CREATE INDEX "favorites_projectId_idx" ON "favorites"("projectId");
CREATE INDEX "favorites_taskId_idx" ON "favorites"("taskId");
CREATE INDEX "share_links_project_id_idx" ON "share_links"("project_id");
