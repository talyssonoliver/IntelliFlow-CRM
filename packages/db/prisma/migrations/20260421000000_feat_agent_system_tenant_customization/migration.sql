-- Audit remediation 2026-04-17 Group A — three schema changes in one migration.
--
-- M2: LeadAIInsight compound unique (leadId, tenantId)
--   Replace the existing per-leadId unique index with a compound one.
--   New constraint is LESS restrictive (allows multiple tenants to hold an
--   insight for the same lead), so no data destruction can occur.
--
-- H6: TenantToolEnablement — per-tenant ADR-006 tool on/off toggle.
--
-- M8/M9: TenantAIConfig — per-tenant LLM tier override for createLLM().

-- ============================================================
-- M2: Replace single-column unique with compound unique
-- ============================================================

DROP INDEX IF EXISTS "lead_ai_insights_leadId_key";

CREATE UNIQUE INDEX "lead_ai_insights_leadId_tenantId_key"
    ON "lead_ai_insights"("leadId", "tenantId");

-- ============================================================
-- H6: CreateTable tenant_tool_enablement
-- ============================================================

CREATE TABLE "tenant_tool_enablement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_tool_enablement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_tool_enablement_tenantId_toolName_key"
    ON "tenant_tool_enablement"("tenantId", "toolName");

CREATE INDEX "tenant_tool_enablement_tenantId_enabled_idx"
    ON "tenant_tool_enablement"("tenantId", "enabled");

ALTER TABLE "tenant_tool_enablement"
    ADD CONSTRAINT "tenant_tool_enablement_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tenant_tool_enablement" ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- M8/M9: CreateTable tenant_ai_config
-- ============================================================

CREATE TABLE "tenant_ai_config" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "temperature" DOUBLE PRECISION,
    "maxTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_ai_config_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_ai_config_tenantId_purpose_key"
    ON "tenant_ai_config"("tenantId", "purpose");

CREATE INDEX "tenant_ai_config_tenantId_idx"
    ON "tenant_ai_config"("tenantId");

ALTER TABLE "tenant_ai_config"
    ADD CONSTRAINT "tenant_ai_config_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tenant_ai_config" ENABLE ROW LEVEL SECURITY;
