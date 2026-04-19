-- PG-184 Deal Settings — win/loss reasons, scoring rules, duplicate rules,
-- required fields, tags, automation. All tenant-scoped.

-- CreateTable
CREATE TABLE "deal_win_loss_reasons" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "deal_win_loss_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_scoring_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "valueJson" JSONB NOT NULL,
    "points" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "deal_scoring_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_duplicate_rules" (
    "id" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "matchStrategy" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "deal_duplicate_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_required_fields" (
    "id" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "deal_required_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "colorToken" TEXT NOT NULL DEFAULT 'slate',
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "deal_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_automation_settings" (
    "id" TEXT NOT NULL,
    "autoMergeOnExactNameAccount" BOOLEAN NOT NULL DEFAULT false,
    "notifyOnDuplicate" BOOLEAN NOT NULL DEFAULT true,
    "restrictTagCreationToAdmins" BOOLEAN NOT NULL DEFAULT false,
    "normalizeCurrency" BOOLEAN NOT NULL DEFAULT true,
    "autoCapitalizeDealNames" BOOLEAN NOT NULL DEFAULT true,
    "preventDeleteWithOpenTasks" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnOwnerChange" BOOLEAN NOT NULL DEFAULT false,
    "notifyOnStageChange" BOOLEAN NOT NULL DEFAULT false,
    "notifyOnHighValueStageMove" BOOLEAN NOT NULL DEFAULT false,
    "highValueThreshold" DECIMAL(15,2) NOT NULL DEFAULT 50000,
    "aiDuplicateDetection" BOOLEAN NOT NULL DEFAULT false,
    "aiDealScoring" BOOLEAN NOT NULL DEFAULT false,
    "aiNextStepRecommendation" BOOLEAN NOT NULL DEFAULT false,
    "aiTagSuggestions" BOOLEAN NOT NULL DEFAULT false,
    "aiInsightGeneration" BOOLEAN NOT NULL DEFAULT false,
    "aiWinLossPrediction" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "deal_automation_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "deal_win_loss_reasons_tenantId_key_key"
    ON "deal_win_loss_reasons"("tenantId", "key");
CREATE INDEX "deal_win_loss_reasons_tenantId_category_sortOrder_idx"
    ON "deal_win_loss_reasons"("tenantId", "category", "sortOrder");

CREATE INDEX "deal_scoring_rules_tenantId_sortOrder_idx"
    ON "deal_scoring_rules"("tenantId", "sortOrder");

CREATE UNIQUE INDEX "deal_duplicate_rules_tenantId_field_matchStrategy_key"
    ON "deal_duplicate_rules"("tenantId", "field", "matchStrategy");
CREATE INDEX "deal_duplicate_rules_tenantId_idx"
    ON "deal_duplicate_rules"("tenantId");

CREATE UNIQUE INDEX "deal_required_fields_tenantId_fieldKey_key"
    ON "deal_required_fields"("tenantId", "fieldKey");
CREATE INDEX "deal_required_fields_tenantId_idx"
    ON "deal_required_fields"("tenantId");

CREATE UNIQUE INDEX "deal_tags_tenantId_name_key"
    ON "deal_tags"("tenantId", "name");
CREATE INDEX "deal_tags_tenantId_sortOrder_idx"
    ON "deal_tags"("tenantId", "sortOrder");

CREATE UNIQUE INDEX "deal_automation_settings_tenantId_key"
    ON "deal_automation_settings"("tenantId");

-- AddForeignKey
ALTER TABLE "deal_win_loss_reasons"
    ADD CONSTRAINT "deal_win_loss_reasons_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "deal_scoring_rules"
    ADD CONSTRAINT "deal_scoring_rules_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "deal_duplicate_rules"
    ADD CONSTRAINT "deal_duplicate_rules_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "deal_required_fields"
    ADD CONSTRAINT "deal_required_fields_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "deal_tags"
    ADD CONSTRAINT "deal_tags_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "deal_automation_settings"
    ADD CONSTRAINT "deal_automation_settings_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
