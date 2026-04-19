-- Audit remediation 2026-04-19 — P2.7 + P2.8.
--
-- P2.7: TenantMemoryPolicy — per-tenant retention policy for conversation /
--       memory artifacts.  Absent row = platform default.  Daily pruning job
--       (future memory-retention.job.ts) joins against this table.
--
-- P2.8: TenantAIConfig.rateLimitPerMinute — per-tenant rate-limit override.
--       null = fall back to global AI_RATE_LIMIT_PER_MINUTE env var.
--
-- Both changes are PURELY ADDITIVE.  No existing rows are modified; no
-- columns / tables / constraints are dropped or renamed.

-- ============================================================
-- P2.7: CreateTable tenant_memory_policy
-- ============================================================

CREATE TABLE "tenant_memory_policy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationRetentionDays" INTEGER,
    "chainVersionRetentionDays" INTEGER,
    "monitoringEventRetentionDays" INTEGER,
    "scrubRatherThanDelete" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_memory_policy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_memory_policy_tenantId_key"
    ON "tenant_memory_policy"("tenantId");

CREATE INDEX "tenant_memory_policy_tenantId_idx"
    ON "tenant_memory_policy"("tenantId");

ALTER TABLE "tenant_memory_policy"
    ADD CONSTRAINT "tenant_memory_policy_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tenant_memory_policy" ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- P2.8: AlterTable tenant_ai_config — add rateLimitPerMinute
-- ============================================================

ALTER TABLE "tenant_ai_config"
    ADD COLUMN "rateLimitPerMinute" INTEGER;
