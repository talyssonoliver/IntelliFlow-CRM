-- ADR-071: inherited tenant membership (partner customers can act in their own CRM tenant).
-- Class A (additive): new enums, new nullable columns on "partners", new tables, new
-- indexes. No existing row is rewritten or deleted and nothing is backfilled: a user's
-- home tenant (users.tenantId) is an implicit membership, and a source = 'HOME' row is
-- written lazily the first time a user is attached to another tenant.

-- CreateEnum
CREATE TYPE "MembershipSource" AS ENUM ('HOME', 'PORTAL_MEMBER', 'PORTAL_STAFF', 'OWNER_INVITE', 'PARTNER_CREATED');

-- CreateEnum
CREATE TYPE "MembershipAuditAction" AS ENUM ('LINK_ISSUED', 'GRANT_CLAIMED', 'MEMBER_ATTACHED', 'MEMBER_REMOVED', 'ROLE_CHANGED', 'DENIED');

-- AlterTable: trust anchors, set ONLY by operator scripts (never over HTTP).
ALTER TABLE "partners"
    ADD COLUMN "assertionPublicKey" TEXT,
    ADD COLUMN "ownerTenantId" TEXT;

-- CreateTable
CREATE TABLE "tenant_memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "source" "MembershipSource" NOT NULL,
    "grantedByPartnerId" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_memberships_pkey" PRIMARY KEY ("id"),
    -- Only ADMIN | USER are ever written (MANAGER / SALES_REP are home-tenant roles).
    CONSTRAINT "tenant_memberships_role_check" CHECK ("role" IN ('ADMIN', 'USER')),
    -- A pinned membership is always a staff membership.
    CONSTRAINT "tenant_memberships_pinned_check" CHECK (("pinned" = false) OR ("source" = 'PORTAL_STAFF'))
);

-- CreateTable
CREATE TABLE "partner_login_grants" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "jti" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "claimedSessionId" TEXT,
    "sessionExpiresAt" TIMESTAMP(3),

    CONSTRAINT "partner_login_grants_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "partner_login_grants_kind_check" CHECK ("kind" IN ('member', 'staff', 'legacy'))
);

-- CreateTable
CREATE TABLE "tenant_membership_audits" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "partnerId" TEXT,
    "action" "MembershipAuditAction" NOT NULL,
    "actor" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_membership_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_memberships_userId_tenantId_key" ON "tenant_memberships"("userId", "tenantId");

-- CreateIndex
CREATE INDEX "tenant_memberships_tenantId_revokedAt_idx" ON "tenant_memberships"("tenantId", "revokedAt");

-- CreateIndex
CREATE INDEX "tenant_memberships_userId_idx" ON "tenant_memberships"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "partner_login_grants_partnerId_jti_key" ON "partner_login_grants"("partnerId", "jti");

-- CreateIndex
CREATE INDEX "partner_login_grants_userId_claimedSessionId_idx" ON "partner_login_grants"("userId", "claimedSessionId");

-- CreateIndex
CREATE INDEX "partner_login_grants_expiresAt_idx" ON "partner_login_grants"("expiresAt");

-- CreateIndex
CREATE INDEX "tenant_membership_audits_tenantId_createdAt_idx" ON "tenant_membership_audits"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "tenant_membership_audits_userId_createdAt_idx" ON "tenant_membership_audits"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_ownerTenantId_fkey" FOREIGN KEY ("ownerTenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_grantedByPartnerId_fkey" FOREIGN KEY ("grantedByPartnerId") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_login_grants" ADD CONSTRAINT "partner_login_grants_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_login_grants" ADD CONSTRAINT "partner_login_grants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_login_grants" ADD CONSTRAINT "partner_login_grants_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row Level Security: these tables are read BEFORE a tenant context exists (to decide which
-- tenant a request acts in), so a tenant-scoped policy cannot apply. RLS is enabled with NO
-- policy (deny by default) and the Supabase anon/authenticated roles are revoked, exactly
-- like "partners" and "partner_api_keys" (20260930120000_tenant_provenance_partner). The
-- API connects as the table owner, which bypasses RLS. No separate REVOKE is needed for the
-- two new "partners" columns: that table is already fully revoked.
ALTER TABLE "tenant_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "partner_login_grants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_membership_audits" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "tenant_memberships" FROM anon, authenticated;
REVOKE ALL ON TABLE "partner_login_grants" FROM anon, authenticated;
REVOKE ALL ON TABLE "tenant_membership_audits" FROM anon, authenticated;
