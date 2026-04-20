-- PG-190 v2 Case Settings scope-up — playbook parity.
-- Adds duplicate rules, required fields, tags, automation + AI toggles.

-- ============================================================
-- case_duplicate_rules
-- ============================================================
CREATE TABLE "case_duplicate_rules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "matchStrategy" TEXT NOT NULL,
    "collisionAction" TEXT NOT NULL DEFAULT 'warn',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_duplicate_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "case_duplicate_rules_tenantId_field_matchStrategy_key"
    ON "case_duplicate_rules"("tenantId", "field", "matchStrategy");
CREATE INDEX "case_duplicate_rules_tenantId_idx" ON "case_duplicate_rules"("tenantId");

ALTER TABLE "case_duplicate_rules"
    ADD CONSTRAINT "case_duplicate_rules_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "case_duplicate_rules" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "case_duplicate_rules_tenant_isolation" ON "case_duplicate_rules"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ============================================================
-- case_required_fields
-- ============================================================
CREATE TABLE "case_required_fields" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_required_fields_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "case_required_fields_tenantId_fieldKey_key"
    ON "case_required_fields"("tenantId", "fieldKey");
CREATE INDEX "case_required_fields_tenantId_idx" ON "case_required_fields"("tenantId");

ALTER TABLE "case_required_fields"
    ADD CONSTRAINT "case_required_fields_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "case_required_fields" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "case_required_fields_tenant_isolation" ON "case_required_fields"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ============================================================
-- case_tags
-- ============================================================
CREATE TABLE "case_tags" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "colorToken" TEXT NOT NULL DEFAULT 'slate',
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_tags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "case_tags_tenantId_name_key" ON "case_tags"("tenantId", "name");
CREATE INDEX "case_tags_tenantId_idx" ON "case_tags"("tenantId");

ALTER TABLE "case_tags"
    ADD CONSTRAINT "case_tags_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "case_tags" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "case_tags_tenant_isolation" ON "case_tags"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ============================================================
-- case_automation_settings (singleton per tenant)
-- ============================================================
CREATE TABLE "case_automation_settings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "autoEscalateOverdue" BOOLEAN NOT NULL DEFAULT false,
    "notifyOnAssignmentChange" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnDeadlineApproaching" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnStatusChange" BOOLEAN NOT NULL DEFAULT false,
    "notifyOnDuplicate" BOOLEAN NOT NULL DEFAULT true,
    "restrictTagCreationToAdmins" BOOLEAN NOT NULL DEFAULT false,
    "preventDeleteWithOpenTasks" BOOLEAN NOT NULL DEFAULT true,
    "aiCaseSummarization" BOOLEAN NOT NULL DEFAULT false,
    "aiPriorityPrediction" BOOLEAN NOT NULL DEFAULT false,
    "aiResolutionSuggestion" BOOLEAN NOT NULL DEFAULT false,
    "aiTagSuggestions" BOOLEAN NOT NULL DEFAULT false,
    "aiInsightGeneration" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_automation_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "case_automation_settings_tenantId_key"
    ON "case_automation_settings"("tenantId");

ALTER TABLE "case_automation_settings"
    ADD CONSTRAINT "case_automation_settings_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "case_automation_settings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "case_automation_settings_tenant_isolation" ON "case_automation_settings"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));
