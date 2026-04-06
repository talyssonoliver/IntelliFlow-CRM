-- DB Schema Audit: Priority 1 (tenantId drift alignment) + Priority 2 (performance indexes)
-- DBA-002..008 + DBA-033..036

-- =============================================================
-- Priority 1: Add FK constraints + indexes for tenantId alignment
-- DB already has tenantId NOT NULL on these tables; Prisma now
-- declares @relation so we add matching FK constraints.
-- =============================================================

-- DBA-002: DealProduct, DealFile, AgentAction — add FK + index
CREATE INDEX IF NOT EXISTS "deal_products_tenantId_idx" ON "deal_products"("tenantId");
ALTER TABLE "deal_products" ADD CONSTRAINT "deal_products_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "deal_files_tenantId_idx" ON "deal_files"("tenantId");
ALTER TABLE "deal_files" ADD CONSTRAINT "deal_files_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "agent_actions_tenantId_idx" ON "agent_actions"("tenantId");
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DBA-003: ActivityEvent — add FK (tenantId already NOT NULL + indexed)
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DBA-004: ContactActivity — add FK
ALTER TABLE "contact_activities" ADD CONSTRAINT "contact_activities_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DBA-005: MessageRecord — add FK
ALTER TABLE "message_records" ADD CONSTRAINT "message_records_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DBA-006: ToolCallRecord — add FK
ALTER TABLE "tool_call_records" ADD CONSTRAINT "tool_call_records_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DBA-007: SecurityEvent — add FK
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================
-- Priority 2: Add missing performance indexes
-- =============================================================

-- DBA-033: Missing slaPolicyId indexes for SLA policy lookups
CREATE INDEX IF NOT EXISTS "tickets_slaPolicyId_idx" ON "tickets"("slaPolicyId");
CREATE INDEX IF NOT EXISTS "sla_breaches_slaPolicyId_idx" ON "sla_breaches"("slaPolicyId");
CREATE INDEX IF NOT EXISTS "ticket_categories_slaPolicyId_idx" ON "ticket_categories"("slaPolicyId");

-- DBA-034: Composite indexes for tenant-scoped agent action queries
CREATE INDEX IF NOT EXISTS "agent_actions_tenantId_createdAt_idx" ON "agent_actions"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "agent_actions_tenantId_status_idx" ON "agent_actions"("tenantId", "status");

-- DBA-035: Missing parentVersionId index for version tree lookups
CREATE INDEX IF NOT EXISTS "chain_versions_parentVersionId_idx" ON "chain_versions"("parentVersionId");

-- DBA-036: Composite indexes for tenant-scoped time-series queries
-- performance_metrics: column missing from DB, add + backfill + NOT NULL
ALTER TABLE "performance_metrics" ADD COLUMN "tenantId" TEXT;
UPDATE "performance_metrics" SET "tenantId" = (SELECT id FROM "tenants" LIMIT 1) WHERE "tenantId" IS NULL;
ALTER TABLE "performance_metrics" ALTER COLUMN "tenantId" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "performance_metrics_tenantId_idx" ON "performance_metrics"("tenantId");
CREATE INDEX IF NOT EXISTS "performance_metrics_tenantId_recordedAt_idx" ON "performance_metrics"("tenantId", "recordedAt");
ALTER TABLE "performance_metrics" ADD CONSTRAINT "performance_metrics_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- api_usage_records: tenantId column already exists as NOT NULL in DB
CREATE INDEX IF NOT EXISTS "api_usage_records_tenantId_idx" ON "api_usage_records"("tenantId");
CREATE INDEX IF NOT EXISTS "api_usage_records_tenantId_recordedAt_idx" ON "api_usage_records"("tenantId", "recordedAt");
ALTER TABLE "api_usage_records" ADD CONSTRAINT "api_usage_records_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
