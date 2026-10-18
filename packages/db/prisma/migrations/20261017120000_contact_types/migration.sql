-- PG-205: tenant contact types applied at contact creation (ADR-080).
--
-- Class A (ADR-069 / docs/operations/agent-autonomy-policy.md): additive only.
--   * Two NEW tables with their own constraints, indexes and RLS policies.
--   * "contacts" is NOT altered and no row is rewritten: contacts.contactType keeps
--     the key it already stores (owner ruling 2026-10-17, no backfill). Its
--     (tenantId, contactType) index ships CONCURRENTLY in 20261017120100.
--   * "contact_tags" gets one UNIQUE ("tenantId", "id") index, the composite FK
--     target for default tags. A plain CREATE UNIQUE INDEX takes a SHARE lock
--     (blocks writes on contact_tags) for the build; contact_tags is a small,
--     tenant-curated settings list, so the hold is brief. "id" is already the
--     primary key, so the index cannot fail on existing data.
--   * The six system types are NOT seeded here (that would be a cross-tenant data
--     write): the API seeds each tenant's own rows on first use.
--
-- Recovery plan: forward-only. Operational rollback = stop picking types in the
-- New/Edit Contact form (contacts without a type behave exactly as before). A
-- down-migration (DROP TABLE x2, DROP INDEX) is Class C — human-only, never run
-- autonomously.
--
-- Production applies only through the gated `prisma migrate deploy` workflow,
-- and must be applied before the API that uses these tables is promoted.

-- ── contact_tags: composite FK target ──────────────────────────────────────
CREATE UNIQUE INDEX "contact_tags_tenantId_id_key" ON "contact_tags"("tenantId", "id");

-- ── contact_types ──────────────────────────────────────────────────────────
CREATE TABLE "contact_types" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" VARCHAR(40) NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "colorToken" TEXT NOT NULL DEFAULT 'slate',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "defaultStatus" "ContactStatus",
    "defaultDepartment" VARCHAR(100),
    "defaultOwner" TEXT NOT NULL DEFAULT 'CREATOR',
    "requiredFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_types_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contact_types_key_check" CHECK ("key" ~ '^[a-z][a-z0-9_]{0,39}$'),
    CONSTRAINT "contact_types_name_check" CHECK ("name" = btrim("name") AND "name" <> ''),
    CONSTRAINT "contact_types_colorToken_check" CHECK ("colorToken" IN (
        'slate', 'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal',
        'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose')),
    CONSTRAINT "contact_types_defaultOwner_check"
        CHECK ("defaultOwner" IN ('CREATOR', 'ACCOUNT_OWNER')),
    CONSTRAINT "contact_types_defaultDepartment_check"
        CHECK ("defaultDepartment" IS NULL OR btrim("defaultDepartment") <> ''),
    CONSTRAINT "contact_types_sortOrder_check" CHECK ("sortOrder" >= 0),
    CONSTRAINT "contact_types_default_active_check" CHECK (NOT "isDefault" OR "isActive"),
    -- A custom type can never take a system key (CONTACT_TYPES in @intelliflow/domain).
    CONSTRAINT "contact_types_reserved_key_check" CHECK ("isSystem" OR "key" NOT IN
        ('customer', 'prospect', 'partner', 'vendor', 'investor', 'other')),
    -- Real contacts columns (title, not jobTitle — PG-205 B14).
    CONSTRAINT "contact_types_requiredFields_check" CHECK (
        "requiredFields"::TEXT[] <@ ARRAY['phone', 'company', 'title', 'department', 'accountId']::TEXT[]
        AND cardinality("requiredFields") <= 5)
);

-- ── contact_type_default_tags ──────────────────────────────────────────────
CREATE TABLE "contact_type_default_tags" (
    "tenantId" TEXT NOT NULL,
    "contactTypeId" TEXT NOT NULL,
    "contactTagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_type_default_tags_pkey" PRIMARY KEY ("contactTypeId", "contactTagId")
);

-- ── Indexes ────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX "contact_types_tenantId_key_key" ON "contact_types"("tenantId", "key");
CREATE UNIQUE INDEX "contact_types_tenantId_id_key" ON "contact_types"("tenantId", "id");
CREATE INDEX "contact_types_tenantId_isActive_idx" ON "contact_types"("tenantId", "isActive");
CREATE INDEX "contact_type_default_tags_tenantId_contactTagId_idx"
    ON "contact_type_default_tags"("tenantId", "contactTagId");
-- SQL-only (Prisma cannot express them; documented in schema.prisma).
CREATE UNIQUE INDEX "contact_types_tenant_lower_name_key" ON "contact_types"("tenantId", lower("name"));
CREATE UNIQUE INDEX "contact_types_one_default_key" ON "contact_types"("tenantId") WHERE "isDefault";

-- ── Foreign keys ───────────────────────────────────────────────────────────
ALTER TABLE "contact_types" ADD CONSTRAINT "contact_types_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_type_default_tags" ADD CONSTRAINT "contact_type_default_tags_tenantId_contactTypeId_fkey"
    FOREIGN KEY ("tenantId", "contactTypeId") REFERENCES "contact_types"("tenantId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE;
-- Deleting a tag that is a type default removes the default (tag deletion keeps working).
ALTER TABLE "contact_type_default_tags" ADD CONSTRAINT "contact_type_default_tags_tenantId_contactTagId_fkey"
    FOREIGN KEY ("tenantId", "contactTagId") REFERENCES "contact_tags"("tenantId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Row-level security (defence in depth; shape of 20261013120000_case_types) ──
-- The application-level tenant boundary is the explicit tenantId in every query
-- (prismaWithTenant does not inject it, and RLS is not FORCEd in this project).
ALTER TABLE "contact_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contact_type_default_tags" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "contact_types_tenant_isolation" ON "contact_types"
    USING ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "contact_type_default_tags_tenant_isolation" ON "contact_type_default_tags"
    USING ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
