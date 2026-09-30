-- ADR-070: tenant provenance + plan on Tenant, partner tables, lead attribution.
-- Class A (additive): new enum values/types, new nullable or defaulted columns,
-- new tables, new indexes. No existing data is deleted or rewritten; the plan
-- backfill below only sets the column this migration adds.

-- AlterEnum
ALTER TYPE "PlanTier" ADD VALUE IF NOT EXISTS 'PARTNER_FREE';

-- CreateEnum
CREATE TYPE "TenantSource" AS ENUM ('DIRECT', 'PARTNER');

-- AlterTable
ALTER TABLE "tenants"
    ADD COLUMN "source" "TenantSource" NOT NULL DEFAULT 'DIRECT',
    ADD COLUMN "partnerId" TEXT,
    ADD COLUMN "externalRef" TEXT,
    ADD COLUMN "plan" "PlanTier" NOT NULL DEFAULT 'STARTER';

-- AlterTable
ALTER TABLE "leads"
    ADD COLUMN "utmSource" TEXT,
    ADD COLUMN "utmMedium" TEXT,
    ADD COLUMN "utmCampaign" TEXT,
    ADD COLUMN "utmContent" TEXT,
    ADD COLUMN "utmTerm" TEXT,
    ADD COLUMN "clickId" TEXT,
    ADD COLUMN "referrer" TEXT,
    ADD COLUMN "landingPath" TEXT;

-- CreateTable
CREATE TABLE "partners" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_api_keys" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "scopes" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "partners_slug_key" ON "partners"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "partner_api_keys_keyHash_key" ON "partner_api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "partner_api_keys_keyPrefix_idx" ON "partner_api_keys"("keyPrefix");

-- CreateIndex
CREATE INDEX "partner_api_keys_partnerId_idx" ON "partner_api_keys"("partnerId");

-- CreateIndex
CREATE INDEX "tenants_partnerId_idx" ON "tenants"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_partnerId_externalRef_key" ON "tenants"("partnerId", "externalRef");

-- CreateIndex
CREATE INDEX "leads_tenantId_utmCampaign_idx" ON "leads"("tenantId", "utmCampaign");

-- AddForeignKey
ALTER TABLE "partner_api_keys" ADD CONSTRAINT "partner_api_keys_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill tenants.plan from the previous authoritative source (workspaces.plan reached via
-- workspace_members -> users.tenantId). Tenants with no workspace keep the STARTER default,
-- which is what the old lookup resolved them to. One deterministic row per tenant.
UPDATE "tenants" t
SET "plan" = src."plan"
FROM (
    SELECT DISTINCT ON (u."tenantId") u."tenantId" AS "tenantId", w."plan" AS "plan"
    FROM "workspaces" w
    INNER JOIN "workspace_members" wm ON wm."workspaceId" = w."id"
    INNER JOIN "users" u ON u."id" = wm."userId"
    WHERE u."tenantId" IS NOT NULL
    ORDER BY u."tenantId", wm."isDefault" DESC, wm."joinedAt" ASC, w."id" ASC
) src
WHERE t."id" = src."tenantId";

-- Row Level Security: partner credentials are never reachable through the Supabase
-- anon/authenticated roles. RLS is enabled with NO policy (deny by default); the API
-- connects as the table owner, which bypasses RLS. The baseline default privileges grant
-- ALL on new tables to anon and authenticated, so revoke explicitly as well.
ALTER TABLE "partners" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "partner_api_keys" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "partners" FROM anon, authenticated;
REVOKE ALL ON TABLE "partner_api_keys" FROM anon, authenticated;
