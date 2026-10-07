-- PG-196 Account Tiers — tenant-configurable revenue tiers (ADR-073).
--
-- Migration risk class A (ADR-069): two new, empty tables with CHECK
-- constraints, tenant foreign keys and RLS. No data is read, written or
-- rewritten in any existing table.
--
-- Defaults are application-side: a tenant with no rows resolves through the
-- domain DEFAULT_TIER_CONFIG (the IFC-273 revenue bands), so there is no seed.
-- Cross-row rules — exactly one tier at minRevenue 0, defaultTierKey among the
-- tenant's keys — are enforced by the domain validateTierConfig and the
-- accountTiers router; this file enforces the single-row rules.

-- CreateTable
CREATE TABLE "account_tier_definitions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "minRevenue" DECIMAL(15,2) NOT NULL,
    "colorToken" TEXT NOT NULL DEFAULT 'slate',
    "benefits" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_tier_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_tier_config" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "defaultTierKey" TEXT,
    "notifyOwnerOnUpgrade" BOOLEAN NOT NULL DEFAULT false,
    "notifyOwnerOnDowngrade" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_tier_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_tier_definitions_tenantId_key_key" ON "account_tier_definitions"("tenantId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "account_tier_definitions_tenantId_minRevenue_key" ON "account_tier_definitions"("tenantId", "minRevenue");

-- CreateIndex
CREATE UNIQUE INDEX "account_tier_config_tenantId_key" ON "account_tier_config"("tenantId");

-- AddForeignKey (tenant cascade)
ALTER TABLE "account_tier_definitions" ADD CONSTRAINT "account_tier_definitions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (tenant cascade)
ALTER TABLE "account_tier_config" ADD CONSTRAINT "account_tier_config_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Single-row rules (mirrors packages/validators/src/account-tiers.ts).
-- Colour allowlist copied verbatim from 20260414140000_account_settings_hardening.
ALTER TABLE "account_tier_definitions"
    ADD CONSTRAINT "account_tier_definitions_colorToken_check"
    CHECK ("colorToken" IN (
        'slate', 'red', 'orange', 'amber', 'yellow', 'lime', 'green',
        'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet',
        'purple', 'fuchsia', 'pink', 'rose'
    ));

ALTER TABLE "account_tier_definitions"
    ADD CONSTRAINT "account_tier_definitions_minRevenue_check"
    CHECK ("minRevenue" >= 0);

ALTER TABLE "account_tier_definitions"
    ADD CONSTRAINT "account_tier_definitions_key_check"
    CHECK ("key" ~ '^[A-Z][A-Z0-9_]{0,39}$' AND "key" <> 'UNKNOWN');

ALTER TABLE "account_tier_definitions"
    ADD CONSTRAINT "account_tier_definitions_label_check"
    CHECK (char_length("label") BETWEEN 1 AND 40);

ALTER TABLE "account_tier_definitions"
    ADD CONSTRAINT "account_tier_definitions_benefits_check"
    CHECK (cardinality("benefits") <= 12);

ALTER TABLE "account_tier_config"
    ADD CONSTRAINT "account_tier_config_defaultTierKey_check"
    CHECK ("defaultTierKey" IS NULL OR "defaultTierKey" ~ '^[A-Z][A-Z0-9_]{0,39}$');

-- Row Level Security: rows are visible and writable only for the connection's
-- app.current_tenant_id (set per operation by the API's tenant-scoped client).
ALTER TABLE "account_tier_definitions" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "account_tier_definitions_tenant_isolation" ON "account_tier_definitions"
    USING ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "account_tier_config" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "account_tier_config_tenant_isolation" ON "account_tier_config"
    USING ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
