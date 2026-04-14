-- PG-183: Account Settings (hierarchy rules, industry taxonomy, custom fields)
--
-- Adds 3 tenant-scoped tables that back the /accounts/account-settings page.

-- CreateTable: account_hierarchy_config (one row per tenant)
CREATE TABLE "account_hierarchy_config" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "maxDepth" INTEGER NOT NULL DEFAULT 5,
    "requireParentForTiers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preventCycles" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_hierarchy_config_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "account_hierarchy_config_tenantId_key" ON "account_hierarchy_config"("tenantId");

-- CreateTable: account_industry_options
CREATE TABLE "account_industry_options" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_industry_options_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "account_industry_options_tenantId_key_key" ON "account_industry_options"("tenantId", "key");
CREATE INDEX "account_industry_options_tenantId_sortOrder_idx" ON "account_industry_options"("tenantId", "sortOrder");

-- CreateTable: account_custom_fields
CREATE TABLE "account_custom_fields" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "dataType" TEXT NOT NULL,
    "options" JSONB,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_custom_fields_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "account_custom_fields_tenantId_fieldKey_key" ON "account_custom_fields"("tenantId", "fieldKey");
CREATE INDEX "account_custom_fields_tenantId_sortOrder_idx" ON "account_custom_fields"("tenantId", "sortOrder");

-- CreateTable: account_duplicate_rules
CREATE TABLE "account_duplicate_rules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "matchStrategy" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_duplicate_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "account_duplicate_rules_tenantId_field_matchStrategy_key" ON "account_duplicate_rules"("tenantId", "field", "matchStrategy");
CREATE INDEX "account_duplicate_rules_tenantId_idx" ON "account_duplicate_rules"("tenantId");

-- CreateTable: account_required_fields
CREATE TABLE "account_required_fields" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_required_fields_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "account_required_fields_tenantId_fieldKey_key" ON "account_required_fields"("tenantId", "fieldKey");
CREATE INDEX "account_required_fields_tenantId_idx" ON "account_required_fields"("tenantId");

-- CreateTable: account_tags
CREATE TABLE "account_tags" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "colorToken" TEXT NOT NULL DEFAULT 'slate',
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_tags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "account_tags_tenantId_name_key" ON "account_tags"("tenantId", "name");
CREATE INDEX "account_tags_tenantId_idx" ON "account_tags"("tenantId");

-- CreateTable: account_automation_settings
CREATE TABLE "account_automation_settings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "autoAssignOwner" BOOLEAN NOT NULL DEFAULT false,
    "autoLinkContactsByDomain" BOOLEAN NOT NULL DEFAULT true,
    "preventDeleteWithOpenOpportunities" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnOwnerChange" BOOLEAN NOT NULL DEFAULT false,
    "normalizeWebsiteDomain" BOOLEAN NOT NULL DEFAULT true,
    "autoCapitalizeAccountNames" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnDuplicate" BOOLEAN NOT NULL DEFAULT true,
    "restrictTagCreationToAdmins" BOOLEAN NOT NULL DEFAULT false,
    "aiIndustryInference" BOOLEAN NOT NULL DEFAULT true,
    "aiEnrichment" BOOLEAN NOT NULL DEFAULT false,
    "aiTagSuggestions" BOOLEAN NOT NULL DEFAULT true,
    "aiInsightGeneration" BOOLEAN NOT NULL DEFAULT true,
    "aiAccountScoring" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_automation_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "account_automation_settings_tenantId_key" ON "account_automation_settings"("tenantId");

-- Enable RLS (secure default; policies added as needed)
ALTER TABLE "account_hierarchy_config" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "account_industry_options" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "account_custom_fields" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "account_duplicate_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "account_required_fields" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "account_tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "account_automation_settings" ENABLE ROW LEVEL SECURITY;
