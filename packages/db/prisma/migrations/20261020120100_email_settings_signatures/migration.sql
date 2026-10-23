-- PG-207: tenant email settings and email signatures (ADR-085).
--
-- Class A: additive only — two NEW tables with constraints, indexes and RLS.
-- No existing table is altered and no row is written (a tenant without a
-- tenant_email_settings row uses the documented defaults).
--
-- Recovery plan: forward-only. Operational rollback = the settings page keeps
-- the defaults and signatures are simply not prefilled. A down-migration
-- (DROP TABLE x2) is Class C — human-only.

-- ── tenant_email_settings ──────────────────────────────────────────────────
CREATE TABLE "tenant_email_settings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "allowTenantMailboxFallback" BOOLEAN NOT NULL DEFAULT false,
    "replyToAddress" VARCHAR(320),
    "trackOpens" BOOLEAN NOT NULL DEFAULT false,
    "trackClicks" BOOLEAN NOT NULL DEFAULT false,
    "hardBounceAction" VARCHAR(10) NOT NULL DEFAULT 'SUPPRESS',
    "softBounceThreshold" INTEGER NOT NULL DEFAULT 3,
    "notifySenderOnBounce" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_email_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tenant_email_settings_hardBounceAction_check" CHECK ("hardBounceAction" IN ('SUPPRESS', 'NONE')),
    CONSTRAINT "tenant_email_settings_softBounceThreshold_check" CHECK ("softBounceThreshold" BETWEEN 1 AND 10),
    CONSTRAINT "tenant_email_settings_replyToAddress_check" CHECK (
        "replyToAddress" IS NULL
        OR ("replyToAddress" = lower(btrim("replyToAddress")) AND position('@' IN "replyToAddress") > 1))
);

-- ── email_signatures ───────────────────────────────────────────────────────
CREATE TABLE "email_signatures" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scope" VARCHAR(10) NOT NULL,
    "userId" TEXT,
    "name" VARCHAR(100) NOT NULL,
    "html" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_signatures_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "email_signatures_scope_check" CHECK ("scope" IN ('USER', 'ORG')),
    CONSTRAINT "email_signatures_scope_user_check" CHECK (("scope" = 'USER') = ("userId" IS NOT NULL)),
    CONSTRAINT "email_signatures_name_check" CHECK ("name" = btrim("name") AND "name" <> ''),
    CONSTRAINT "email_signatures_html_check" CHECK (char_length("html") <= 20000)
);

-- ── Indexes ────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX "tenant_email_settings_tenantId_key" ON "tenant_email_settings"("tenantId");
CREATE INDEX "email_signatures_tenantId_scope_userId_idx" ON "email_signatures"("tenantId", "scope", "userId");
-- SQL-only (Prisma cannot express them; documented in schema.prisma).
-- Names are unique per owner scope, case-insensitively.
CREATE UNIQUE INDEX "email_signatures_owner_lower_name_key"
    ON "email_signatures"("tenantId", "scope", coalesce("userId", ''), lower("name"));
-- At most one default per user and one per organisation.
CREATE UNIQUE INDEX "email_signatures_one_user_default_key"
    ON "email_signatures"("tenantId", "userId") WHERE "isDefault" AND "scope" = 'USER';
CREATE UNIQUE INDEX "email_signatures_one_org_default_key"
    ON "email_signatures"("tenantId") WHERE "isDefault" AND "scope" = 'ORG';

-- ── Foreign keys ───────────────────────────────────────────────────────────
ALTER TABLE "tenant_email_settings" ADD CONSTRAINT "tenant_email_settings_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_signatures" ADD CONSTRAINT "email_signatures_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_signatures" ADD CONSTRAINT "email_signatures_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Row-level security ─────────────────────────────────────────────────────
ALTER TABLE "tenant_email_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "email_signatures" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "tenant_email_settings_tenant_isolation" ON "tenant_email_settings"
    USING ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "email_signatures_tenant_isolation" ON "email_signatures"
    USING ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
