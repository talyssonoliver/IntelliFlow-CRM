-- Per-tenant metering: PARTNER_FREE plan tier, quota overrides and usage counters.
-- Class A (additive): one new enum value, two new tables, no change to existing rows.

-- AlterEnum
ALTER TYPE "PlanTier" ADD VALUE IF NOT EXISTS 'PARTNER_FREE';

-- CreateTable
CREATE TABLE "tenant_quota_overrides" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "limit" INTEGER,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "tenant_quota_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_usage_counters" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "tenant_usage_counters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_quota_overrides_tenantId_key_key" ON "tenant_quota_overrides"("tenantId", "key");

-- CreateIndex
CREATE INDEX "tenant_quota_overrides_tenantId_idx" ON "tenant_quota_overrides"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_usage_counters_tenantId_key_period_key" ON "tenant_usage_counters"("tenantId", "key", "period");

-- CreateIndex
CREATE INDEX "tenant_usage_counters_tenantId_idx" ON "tenant_usage_counters"("tenantId");

-- AddForeignKey
ALTER TABLE "tenant_quota_overrides" ADD CONSTRAINT "tenant_quota_overrides_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_usage_counters" ADD CONSTRAINT "tenant_usage_counters_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row Level Security (defense-in-depth; app layer also filters by tenantId)
ALTER TABLE "tenant_quota_overrides" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_quota_overrides_tenant_isolation" ON "tenant_quota_overrides"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "tenant_usage_counters" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_usage_counters_tenant_isolation" ON "tenant_usage_counters"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));
