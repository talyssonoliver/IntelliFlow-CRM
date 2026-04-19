-- PG-186 Document Settings — general config, duplicate rules, required fields,
-- tags, automation settings, retention policies. All tenant-scoped.

-- CreateTable: document_general_config (one row per tenant)
CREATE TABLE "document_general_config" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "allowedMimeTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maxUploadSizeMb" INTEGER NOT NULL DEFAULT 50,
    "defaultRetentionDays" INTEGER NOT NULL DEFAULT 365,
    "enableAntivirusScan" BOOLEAN NOT NULL DEFAULT true,
    "quarantineOnDetect" BOOLEAN NOT NULL DEFAULT true,
    "blockOnScanFailure" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_general_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable: document_duplicate_rules
CREATE TABLE "document_duplicate_rules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "matchStrategy" TEXT NOT NULL,
    "collisionAction" TEXT NOT NULL DEFAULT 'warn',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_duplicate_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable: document_required_fields
CREATE TABLE "document_required_fields" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_required_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable: document_tags
CREATE TABLE "document_tags" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "colorToken" TEXT NOT NULL DEFAULT 'slate',
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable: document_automation_settings (one row per tenant)
CREATE TABLE "document_automation_settings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "normalizeFilename" BOOLEAN NOT NULL DEFAULT true,
    "preventDeleteIfReferenced" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnOwnerChange" BOOLEAN NOT NULL DEFAULT false,
    "restrictTagCreationToAdmins" BOOLEAN NOT NULL DEFAULT false,
    "notifyOnDuplicate" BOOLEAN NOT NULL DEFAULT true,
    "autoVersionOnCollision" BOOLEAN NOT NULL DEFAULT false,
    "autoDetectDuplicates" BOOLEAN NOT NULL DEFAULT false,
    "autoExtractText" BOOLEAN NOT NULL DEFAULT false,
    "autoClassifyCategory" BOOLEAN NOT NULL DEFAULT false,
    "autoDetectPii" BOOLEAN NOT NULL DEFAULT false,
    "aiTagSuggestions" BOOLEAN NOT NULL DEFAULT false,
    "aiInsightGeneration" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_automation_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable: document_retention_policies
CREATE TABLE "document_retention_policies" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "categoryKey" TEXT NOT NULL,
    "retentionDays" INTEGER NOT NULL DEFAULT 365,
    "autoArchive" BOOLEAN NOT NULL DEFAULT false,
    "legalHoldOverride" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_retention_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (unique constraints)
CREATE UNIQUE INDEX "document_general_config_tenantId_key"
    ON "document_general_config"("tenantId");

CREATE UNIQUE INDEX "document_duplicate_rules_tenantId_field_matchStrategy_key"
    ON "document_duplicate_rules"("tenantId", "field", "matchStrategy");
CREATE INDEX "document_duplicate_rules_tenantId_idx"
    ON "document_duplicate_rules"("tenantId");

CREATE UNIQUE INDEX "document_required_fields_tenantId_fieldKey_key"
    ON "document_required_fields"("tenantId", "fieldKey");
CREATE INDEX "document_required_fields_tenantId_idx"
    ON "document_required_fields"("tenantId");

CREATE UNIQUE INDEX "document_tags_tenantId_name_key"
    ON "document_tags"("tenantId", "name");
CREATE INDEX "document_tags_tenantId_idx"
    ON "document_tags"("tenantId");

CREATE UNIQUE INDEX "document_automation_settings_tenantId_key"
    ON "document_automation_settings"("tenantId");

CREATE UNIQUE INDEX "document_retention_policies_tenantId_categoryKey_key"
    ON "document_retention_policies"("tenantId", "categoryKey");
CREATE INDEX "document_retention_policies_tenantId_idx"
    ON "document_retention_policies"("tenantId");

-- AddForeignKey (tenant cascade)
ALTER TABLE "document_general_config"
    ADD CONSTRAINT "document_general_config_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_duplicate_rules"
    ADD CONSTRAINT "document_duplicate_rules_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_required_fields"
    ADD CONSTRAINT "document_required_fields_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_tags"
    ADD CONSTRAINT "document_tags_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_automation_settings"
    ADD CONSTRAINT "document_automation_settings_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_retention_policies"
    ADD CONSTRAINT "document_retention_policies_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Enable Row Level Security on all new tables
ALTER TABLE "document_general_config" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_duplicate_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_required_fields" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_automation_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_retention_policies" ENABLE ROW LEVEL SECURITY;
