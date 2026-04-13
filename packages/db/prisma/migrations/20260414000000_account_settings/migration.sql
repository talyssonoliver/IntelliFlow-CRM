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

-- Enable RLS (follow PG-178 pattern — secure default; policies added as needed)
ALTER TABLE "account_hierarchy_config" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "account_industry_options" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "account_custom_fields" ENABLE ROW LEVEL SECURITY;
