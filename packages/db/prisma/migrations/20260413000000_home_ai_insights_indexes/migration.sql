-- HOME-PERF: composite indexes for home.getAIInsights cold-path
-- Addresses p95 regression surfaced by the tRPC benchmark (63.46ms > 50ms KPI)
-- against the heuristic queries in runHeuristicQueries (home.router.ts).

-- CreateIndex: Opportunity deals-at-risk query
-- Pattern: WHERE tenantId = X AND ownerId = Y AND stage NOT IN (...) AND updatedAt < cutoff
-- Existing [tenantId, ownerId, stage, closedAt] sorts by closedAt, not updatedAt.
CREATE INDEX IF NOT EXISTS "opportunities_tenantId_ownerId_stage_updatedAt_idx"
  ON "opportunities"("tenantId", "ownerId", "stage", "updatedAt");

-- CreateIndex: Contact stale-contact query
-- Pattern: WHERE tenantId = X AND ownerId = Y AND lastContactedAt < cutoff (OR NULL)
-- Existing [tenantId, lastContactedAt] misses the ownerId predicate.
CREATE INDEX IF NOT EXISTS "contacts_tenantId_ownerId_lastContactedAt_idx"
  ON "contacts"("tenantId", "ownerId", "lastContactedAt");
