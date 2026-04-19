-- Split Task.ownerId (accountable/creator) from Task.assigneeId (currently-working user).
-- The domain event `task.assigned` now carries user-assignment semantics; the
-- entity-linking event has been renamed `task.linked_to_entity`. See
-- packages/domain/src/crm/task/TaskEvents.ts for the event contracts.

-- AlterTable: add nullable assigneeId + FK to users
ALTER TABLE "tasks" ADD COLUMN "assigneeId" TEXT;

-- Index for lookups filtering by assignee
CREATE INDEX "tasks_assigneeId_idx" ON "tasks"("assigneeId");

-- Composite index for per-assignee workload / due-soon queries (mirrors the
-- existing (tenantId, ownerId, status, dueDate) covering index).
CREATE INDEX "tasks_tenantId_assigneeId_status_dueDate_idx"
    ON "tasks"("tenantId", "assigneeId", "status", "dueDate");

-- FK constraint: dropping a user clears the assignment rather than cascading
-- a task delete, since the owner (accountable user) is still tracked.
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigneeId_fkey"
    FOREIGN KEY ("assigneeId") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
