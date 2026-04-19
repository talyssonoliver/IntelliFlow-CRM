-- PG-185 Ticket Settings — duplicate rules, required fields, tags,
-- automation. All tenant-scoped. SLA policies live in the pre-existing
-- sla_policies table; `ticket_automation_settings.defaultSlaPolicyId` FK
-- binds the per-tenant default selection to a row there.

-- CreateTable
CREATE TABLE "ticket_duplicate_rules" (
    "id" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "matchStrategy" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "ticket_duplicate_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_required_fields" (
    "id" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "ticket_required_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "colorToken" TEXT NOT NULL DEFAULT 'slate',
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "ticket_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_automation_settings" (
    "id" TEXT NOT NULL,
    "defaultSlaPolicyId" TEXT,
    "autoCloseIdleDays" INTEGER NOT NULL DEFAULT 7,
    "autoCloseAppliesToWaitingCustomer" BOOLEAN NOT NULL DEFAULT true,
    "autoCloseAppliesToResolved" BOOLEAN NOT NULL DEFAULT true,
    "autoCloseNotifyCustomer" BOOLEAN NOT NULL DEFAULT true,
    "autoMergeOnExactContactSubject" BOOLEAN NOT NULL DEFAULT false,
    "notifyOnDuplicate" BOOLEAN NOT NULL DEFAULT true,
    "restrictTagCreationToAdmins" BOOLEAN NOT NULL DEFAULT false,
    "normalizeSubjectCasing" BOOLEAN NOT NULL DEFAULT true,
    "trimDescriptionWhitespace" BOOLEAN NOT NULL DEFAULT true,
    "preventDeleteWithOpenChildren" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnAssigneeChange" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnSlaBreach" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnSlaWarning" BOOLEAN NOT NULL DEFAULT false,
    "notifyOnStatusResolved" BOOLEAN NOT NULL DEFAULT false,
    "notifyOnEscalation" BOOLEAN NOT NULL DEFAULT true,
    "aiDuplicateDetection" BOOLEAN NOT NULL DEFAULT false,
    "aiAutoCategorization" BOOLEAN NOT NULL DEFAULT false,
    "aiSentimentAnalysis" BOOLEAN NOT NULL DEFAULT false,
    "aiNextStepRecommendation" BOOLEAN NOT NULL DEFAULT false,
    "aiTagSuggestions" BOOLEAN NOT NULL DEFAULT false,
    "aiInsightGeneration" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "ticket_automation_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ticket_duplicate_rules_tenantId_field_matchStrategy_key"
    ON "ticket_duplicate_rules"("tenantId", "field", "matchStrategy");
CREATE INDEX "ticket_duplicate_rules_tenantId_idx"
    ON "ticket_duplicate_rules"("tenantId");

CREATE UNIQUE INDEX "ticket_required_fields_tenantId_fieldKey_key"
    ON "ticket_required_fields"("tenantId", "fieldKey");
CREATE INDEX "ticket_required_fields_tenantId_idx"
    ON "ticket_required_fields"("tenantId");

CREATE UNIQUE INDEX "ticket_tags_tenantId_name_key"
    ON "ticket_tags"("tenantId", "name");
CREATE INDEX "ticket_tags_tenantId_sortOrder_idx"
    ON "ticket_tags"("tenantId", "sortOrder");

CREATE UNIQUE INDEX "ticket_automation_settings_tenantId_key"
    ON "ticket_automation_settings"("tenantId");
CREATE INDEX "ticket_automation_settings_defaultSlaPolicyId_idx"
    ON "ticket_automation_settings"("defaultSlaPolicyId");

-- AddForeignKey (tenant cascade)
ALTER TABLE "ticket_duplicate_rules"
    ADD CONSTRAINT "ticket_duplicate_rules_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ticket_required_fields"
    ADD CONSTRAINT "ticket_required_fields_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ticket_tags"
    ADD CONSTRAINT "ticket_tags_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ticket_automation_settings"
    ADD CONSTRAINT "ticket_automation_settings_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (default SLA policy, null-safe)
ALTER TABLE "ticket_automation_settings"
    ADD CONSTRAINT "ticket_automation_settings_defaultSlaPolicyId_fkey"
    FOREIGN KEY ("defaultSlaPolicyId") REFERENCES "sla_policies"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
