-- PG-197: account geography + territory tables (ADR-074).
--
-- Class A (ADR-069 / docs/operations/agent-autonomy-policy.md): additive only.
--   * accounts: three NULLABLE columns with no default -> metadata-only on PG 11+,
--     no table rewrite, no backfill, no existing row changes. The country CHECK is
--     added NOT VALID and then validated, so the validating scan runs without an
--     ACCESS EXCLUSIVE lock held for its duration; every existing row is NULL, so
--     it cannot fail.
--   * No new index on "accounts": a non-concurrent index inside the migration
--     transaction would take a SHARE lock (blocks writes). Load-balance counting
--     is served by the existing accounts_ownerId_idx.
--   * Three NEW tables with their own constraints, indexes and RLS policies.
--
-- Recovery plan: forward-only. Operational rollback = turn
-- AccountAutomationSetting.autoAssignOwner off; nothing else reads these tables.
-- A down-migration (DROP TABLE x3, DROP COLUMN x3) is Class C — human-only,
-- never run autonomously.
--
-- Production applies only through the gated `prisma migrate deploy` workflow.

-- ── accounts: geography ────────────────────────────────────────────────────
ALTER TABLE "accounts" ADD COLUMN     "country" VARCHAR(2),
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "region" TEXT;

ALTER TABLE "accounts"
    ADD CONSTRAINT "accounts_country_iso_check"
    CHECK ("country" IS NULL OR "country" ~ '^[A-Z]{2}$') NOT VALID;
ALTER TABLE "accounts" VALIDATE CONSTRAINT "accounts_country_iso_check";

-- ── account_territories ────────────────────────────────────────────────────
CREATE TABLE "account_territories" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "colorToken" TEXT NOT NULL DEFAULT 'slate',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "strategy" TEXT NOT NULL DEFAULT 'MANUAL',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "rrCursor" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_territories_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "account_territories_strategy_check"
        CHECK ("strategy" IN ('ROUND_ROBIN', 'LOAD_BALANCE', 'MANUAL')),
    -- Same 18-token allowlist as account_tags (20260414140000_account_settings_hardening)
    CONSTRAINT "account_territories_colorToken_check"
        CHECK ("colorToken" IN (
            'slate', 'red', 'orange', 'amber', 'yellow', 'lime', 'green',
            'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet',
            'purple', 'fuchsia', 'pink', 'rose'
        ))
);

-- ── account_territory_rules ────────────────────────────────────────────────
CREATE TABLE "account_territory_rules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "territoryId" TEXT NOT NULL,
    "country" VARCHAR(2) NOT NULL,
    "region" TEXT,
    "postalPrefix" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_territory_rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "account_territory_rules_country_check" CHECK ("country" ~ '^[A-Z]{2}$'),
    CONSTRAINT "account_territory_rules_region_check" CHECK ("region" IS NULL OR "region" <> ''),
    CONSTRAINT "account_territory_rules_postalPrefix_check"
        CHECK ("postalPrefix" IS NULL OR "postalPrefix" <> '')
);

-- ── account_territory_members ──────────────────────────────────────────────
CREATE TABLE "account_territory_members" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "territoryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_territory_members_pkey" PRIMARY KEY ("id")
);

-- ── Indexes (Prisma-declared) ──────────────────────────────────────────────
CREATE INDEX "account_territories_tenantId_isActive_priority_idx" ON "account_territories"("tenantId", "isActive", "priority");
CREATE UNIQUE INDEX "account_territories_tenantId_id_key" ON "account_territories"("tenantId", "id");
CREATE INDEX "account_territory_rules_tenantId_territoryId_idx" ON "account_territory_rules"("tenantId", "territoryId");
CREATE INDEX "account_territory_members_tenantId_territoryId_idx" ON "account_territory_members"("tenantId", "territoryId");
CREATE INDEX "account_territory_members_userId_idx" ON "account_territory_members"("userId");
CREATE UNIQUE INDEX "account_territory_members_territoryId_userId_key" ON "account_territory_members"("territoryId", "userId");

-- ── Indexes (SQL-only; Prisma cannot express them — see schema.prisma comment) ──
-- Case-insensitive territory names per tenant (the DB, not a racy router check, decides).
CREATE UNIQUE INDEX "account_territories_tenant_lower_name_key"
    ON "account_territories"("tenantId", lower("name"));
-- At most one default territory per tenant.
CREATE UNIQUE INDEX "account_territories_one_default_key"
    ON "account_territories"("tenantId") WHERE "isDefault";
-- Rule de-duplication: region compared case-insensitively, NULL == '' (NULLs are distinct in a plain unique).
CREATE UNIQUE INDEX "account_territory_rules_dedupe_key"
    ON "account_territory_rules"("territoryId", "country", lower(COALESCE("region", '')), COALESCE("postalPrefix", ''));

-- ── Foreign keys ───────────────────────────────────────────────────────────
ALTER TABLE "account_territories" ADD CONSTRAINT "account_territories_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Composite FKs: a rule/member can never carry a tenant different from its territory (DBA-012).
ALTER TABLE "account_territory_rules" ADD CONSTRAINT "account_territory_rules_tenantId_territoryId_fkey" FOREIGN KEY ("tenantId", "territoryId") REFERENCES "account_territories"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "account_territory_members" ADD CONSTRAINT "account_territory_members_tenantId_territoryId_fkey" FOREIGN KEY ("tenantId", "territoryId") REFERENCES "account_territories"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- userId: plain FK — under ADR-071 a user can belong to a tenant through a
-- membership, so tenant validity is checked in the app with tenantUserWhere.
ALTER TABLE "account_territory_members" ADD CONSTRAINT "account_territory_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Row-level security (defence in depth; shape of 20260424100000_case_ai_insight) ──
-- The application-level tenant boundary is the explicit tenantId in every query
-- (prismaWithTenant does not inject it, and RLS is not FORCEd in this project).
ALTER TABLE "account_territories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "account_territory_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "account_territory_members" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "account_territories_tenant_isolation" ON "account_territories"
    USING ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "account_territory_rules_tenant_isolation" ON "account_territory_rules"
    USING ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "account_territory_members_tenant_isolation" ON "account_territory_members"
    USING ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
