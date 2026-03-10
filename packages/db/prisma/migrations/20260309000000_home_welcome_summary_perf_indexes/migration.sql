-- HOME-PERF: Composite indexes for getWelcomeSummary queries
-- Resolves slow query (257ms > 200ms target) by providing covering indexes
-- for the 11 parallel count queries in home.router.ts

-- Task: high-priority count (tenantId + ownerId + priority + status)
CREATE INDEX "tasks_tenantId_ownerId_priority_status_idx" ON "tasks"("tenantId", "ownerId", "priority", "status");

-- Task: overdue count (tenantId + ownerId + status + dueDate)
CREATE INDEX "tasks_tenantId_ownerId_status_dueDate_idx" ON "tasks"("tenantId", "ownerId", "status", "dueDate");

-- Lead: progressive fallback counts (tenantId + ownerId + createdAt DESC)
CREATE INDEX "leads_tenantId_ownerId_createdAt_idx" ON "leads"("tenantId", "ownerId", "createdAt" DESC);

-- Opportunity: deal trend counts (tenantId + ownerId + stage + closedAt)
CREATE INDEX "opportunities_tenantId_ownerId_stage_closedAt_idx" ON "opportunities"("tenantId", "ownerId", "stage", "closedAt");
