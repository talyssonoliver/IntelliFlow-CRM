-- Owner ruling 23/11/2026: vertical modules (Cases, Tickets, Commerce) are granted only to the
-- business type they make sense for. A tenant gets a business type; a module row records where it came from.
--
-- Class A (ADR-069 / docs/operations/agent-autonomy-policy.md): additive and backward-compatible.
-- Two new enum types, one nullable column on tenants (no default, no rewrite) and one defaulted column on
-- tenant_modules (a constant default is catalogue-only on PostgreSQL 11+). No row is changed, no backfill here:
-- production tenants are set by tools/scripts/backfill-business-type.ts (dry run by default, --apply), never by
-- a migration. Old application code ignores both columns and keeps working.
--
-- Deploy order matters: a NULL business type gates like OTHER (core CRM, AI, reports), so run the migration, then
-- `tools/scripts/backfill-business-type.ts` (dry run, then --apply, owner yes) so every tenant that already holds
-- cases, documents or tickets keeps that module, and only then promote the API.
--
-- Recovery plan: forward-only. Operational rollback = ignore the columns. Dropping them is Class C, human-only.
-- Production applies only through the gated `prisma migrate deploy` workflow, before the API is promoted.

CREATE TYPE "TenantBusinessType" AS ENUM ('TRADES_HOME_SERVICES', 'AGENCY', 'LAW_FIRM', 'SHOP_ECOMMERCE', 'OTHER');

CREATE TYPE "TenantModuleOrigin" AS ENUM ('PLAN', 'OVERRIDE', 'EXISTING_DATA');

ALTER TABLE "tenants" ADD COLUMN "businessType" "TenantBusinessType";

ALTER TABLE "tenant_modules" ADD COLUMN "origin" "TenantModuleOrigin" NOT NULL DEFAULT 'PLAN';
