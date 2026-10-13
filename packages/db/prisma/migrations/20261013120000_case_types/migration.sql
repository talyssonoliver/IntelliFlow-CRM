-- PG-204: case types applied at case creation (ADR-076).
--
-- Class A (ADR-069 / docs/operations/agent-autonomy-policy.md): additive only.
--   * cases: one NULLABLE column with no default -> metadata-only on PG 11+, no
--     table rewrite, no backfill, no existing row changes.
--   * cases FK: added NOT VALID and then validated, so the validating scan runs
--     without holding a long lock; every existing row has a NULL "caseTypeId"
--     (MATCH SIMPLE skips NULLs), so validation cannot fail.
--   * No new index on "cases": a non-concurrent index inside the migration
--     transaction would take a SHARE lock (blocks writes). The "a type is in use"
--     check is tenant-scoped and served by the existing cases_tenantId_idx.
--   * Two NEW tables with their own constraints, indexes and RLS policies.
--
-- Recovery plan: forward-only. Operational rollback = stop picking types in the
-- New Case form (cases without a type behave exactly as before). A
-- down-migration (DROP CONSTRAINT, DROP COLUMN, DROP TABLE x2) is Class C —
-- human-only, never run autonomously.
--
-- Production applies only through the gated `prisma migrate deploy` workflow.

-- ── cases: case type link ──────────────────────────────────────────────────
ALTER TABLE "cases" ADD COLUMN     "caseTypeId" TEXT;

-- ── case_types ─────────────────────────────────────────────────────────────
CREATE TABLE "case_types" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "category" VARCHAR(60),
    "colorToken" TEXT NOT NULL DEFAULT 'slate',
    "defaultPriority" "CasePriority",
    "defaultSlaDays" INTEGER,
    "requiredFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_types_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "case_types_name_check" CHECK (btrim("name") <> ''),
    -- Same 8-token allowlist as case_tags (20260420120000_case_tag_color_token_check)
    CONSTRAINT "case_types_colorToken_check"
        CHECK ("colorToken" IN ('slate', 'blue', 'red', 'amber', 'green', 'violet', 'rose', 'teal')),
    CONSTRAINT "case_types_defaultSlaDays_check"
        CHECK ("defaultSlaDays" IS NULL OR "defaultSlaDays" BETWEEN 1 AND 3650),
    -- Subset of the PG-190 required-field keys (CASE_REQUIRED_FIELD_KEYS in @intelliflow/domain)
    CONSTRAINT "case_types_requiredFields_check"
        CHECK (
            "requiredFields" <@ ARRAY['title', 'description', 'deadline', 'jurisdiction', 'clientId', 'assignedTo']::TEXT[]
            AND cardinality("requiredFields") <= 6
        )
);

-- ── case_type_checklist_items ──────────────────────────────────────────────
CREATE TABLE "case_type_checklist_items" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseTypeId" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_type_checklist_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "case_type_checklist_items_title_check" CHECK (btrim("title") <> ''),
    CONSTRAINT "case_type_checklist_items_sortOrder_check" CHECK ("sortOrder" >= 0)
);

-- ── Indexes (Prisma-declared) ──────────────────────────────────────────────
CREATE INDEX "case_types_tenantId_isActive_idx" ON "case_types"("tenantId", "isActive");
CREATE UNIQUE INDEX "case_types_tenantId_id_key" ON "case_types"("tenantId", "id");
CREATE INDEX "case_type_checklist_items_tenantId_caseTypeId_idx" ON "case_type_checklist_items"("tenantId", "caseTypeId");

-- ── Indexes (SQL-only; Prisma cannot express them — see schema.prisma comment) ──
-- Case-insensitive type names per tenant (the DB, not a racy router check, decides).
CREATE UNIQUE INDEX "case_types_tenant_lower_name_key"
    ON "case_types"("tenantId", lower("name"));
-- At most one default case type per tenant.
CREATE UNIQUE INDEX "case_types_one_default_key"
    ON "case_types"("tenantId") WHERE "isDefault";

-- ── Foreign keys ───────────────────────────────────────────────────────────
ALTER TABLE "case_types" ADD CONSTRAINT "case_types_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Composite FK: a checklist item can never carry a tenant different from its type (DBA-012).
ALTER TABLE "case_type_checklist_items" ADD CONSTRAINT "case_type_checklist_items_tenantId_caseTypeId_fkey" FOREIGN KEY ("tenantId", "caseTypeId") REFERENCES "case_types"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Composite FK (SQL-only): a case can only reference a type of its own tenant.
-- NO ACTION (checked at end of statement) so a tenant delete that cascades to
-- both cases and case_types still succeeds, while deleting a type that cases
-- use fails. MATCH SIMPLE: cases with a NULL caseTypeId are not checked.
ALTER TABLE "cases" ADD CONSTRAINT "cases_tenantId_caseTypeId_fkey" FOREIGN KEY ("tenantId", "caseTypeId") REFERENCES "case_types"("tenantId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "cases" VALIDATE CONSTRAINT "cases_tenantId_caseTypeId_fkey";

-- ── Row-level security (defence in depth; shape of 20261007130000_account_territories) ──
-- The application-level tenant boundary is the explicit tenantId in every query
-- (prismaWithTenant does not inject it, and RLS is not FORCEd in this project).
ALTER TABLE "case_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "case_type_checklist_items" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "case_types_tenant_isolation" ON "case_types"
    USING ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "case_type_checklist_items_tenant_isolation" ON "case_type_checklist_items"
    USING ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
