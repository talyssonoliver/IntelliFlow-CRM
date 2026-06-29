-- Migration: add_terms_acceptance (IFC-309)
-- Creates an immutable audit table for Terms of Service acceptances.
-- One record per (tenantId, userId, termsVersion) tuple — enforced by UNIQUE.
-- No UPDATE or DELETE rights should be granted to the application role.

CREATE TABLE "terms_acceptances" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "termsVersion" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" VARCHAR(45),
    "userAgent" VARCHAR(512),
    "route" VARCHAR(255) NOT NULL,

    CONSTRAINT "terms_acceptances_pkey" PRIMARY KEY ("id")
);

-- Unique constraint — idempotent upsert: one acceptance per tenant/user/version
CREATE UNIQUE INDEX "terms_acceptances_tenantId_userId_termsVersion_key"
    ON "terms_acceptances"("tenantId", "userId", "termsVersion");

-- Index for tenant-scoped lookups (AC-006: getAcceptance query)
CREATE INDEX "terms_acceptances_tenantId_idx"
    ON "terms_acceptances"("tenantId");

-- FK: tenant cascade delete — if tenant is removed, remove their acceptance records
ALTER TABLE "terms_acceptances" ADD CONSTRAINT "terms_acceptances_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- FK: user cascade delete — if user is removed, remove their acceptance records
ALTER TABLE "terms_acceptances" ADD CONSTRAINT "terms_acceptances_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
