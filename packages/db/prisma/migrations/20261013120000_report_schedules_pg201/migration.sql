-- PG-201: scheduled reports on the existing report_schedules table (ADR-075).
--
-- Owner ruling 2026-10-13: evolve report_schedules IN PLACE, additively. Nothing is
-- dropped: no table and no column. Every legacy column stays for future use.
--
-- Class A DDL (ADR-069 / docs/operations/agent-autonomy-policy.md):
--   * report_schedules / report_executions: nullable columns, constant defaults and
--     DROP NOT NULL only -> metadata-only on PG 11+, no table rewrite.
--   * Every CHECK and FOREIGN KEY on an existing table is added NOT VALID and then
--     VALIDATEd, so the validating scan does not hold an ACCESS EXCLUSIVE lock. Every
--     existing row satisfies them (new columns are NULL/default, existing rows all
--     carry reportId), so validation cannot fail.
--   * Two non-concurrent unique indexes on existing tables (report_templates
--     (tenantId, id) and report_schedules (tenantId, lower(name))) take a brief SHARE
--     lock that blocks writes while they build. Both tables are small (report
--     templates per tenant; report_schedules had no application writer before PG-201).
--   * One new table (report_schedule_tags) with its own constraints, indexes and RLS.
--
-- !!! PRODUCTION DATA WRITE !!!
-- The PG201-COPY block at the end INSERTs one report_schedules row per tenant whose
-- report_settings.scheduledDelivery was enabled or held recipients. It is idempotent
-- (deterministic id + NOT EXISTS + ON CONFLICT DO NOTHING), tenant-scoped (each row
-- takes the tenantId of its own report_settings row), never UPDATEs or DELETEs
-- report_settings, and lands every copied row INACTIVE (the legacy setting had no
-- template, and an active schedule must reference one). The production apply is
-- manual and needs the owner.
--
-- Recovery plan: forward-only. Copied rows are inactive and can be deleted by the
-- owner from the UI. A down-migration (DROP TABLE / DROP COLUMN) is Class C,
-- human-only, never run autonomously. Production applies only through the gated
-- `prisma migrate deploy` workflow.

-- ── report_schedules: new columns, relaxed legacy NOT NULLs ─────────────────
ALTER TABLE "report_schedules" ADD COLUMN     "colorToken" TEXT NOT NULL DEFAULT 'slate',
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "cronExpression" VARCHAR(100),
ADD COLUMN     "description" TEXT,
ADD COLUMN     "name" VARCHAR(100),
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "templateId" TEXT,
ALTER COLUMN "reportId" DROP NOT NULL,
ALTER COLUMN "timeOfDay" DROP NOT NULL;

-- ── report_executions: template-only schedules can record their runs ───────
ALTER TABLE "report_executions" ADD COLUMN     "templateId" TEXT,
ALTER COLUMN "reportId" DROP NOT NULL;

-- ── report_schedule_tags ───────────────────────────────────────────────────
CREATE TABLE "report_schedule_tags" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "colorToken" TEXT NOT NULL DEFAULT 'slate',
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_schedule_tags_pkey" PRIMARY KEY ("id"),
    -- Same 18-token palette as account_tags / account_territories.
    CONSTRAINT "report_schedule_tags_colorToken_check"
        CHECK ("colorToken" IN (
            'slate', 'red', 'orange', 'amber', 'yellow', 'lime', 'green',
            'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet',
            'purple', 'fuchsia', 'pink', 'rose'
        ))
);

-- ── Indexes (Prisma-declared) ──────────────────────────────────────────────
CREATE INDEX "report_schedule_tags_tenantId_idx" ON "report_schedule_tags"("tenantId");
CREATE UNIQUE INDEX "report_schedule_tags_tenantId_name_key" ON "report_schedule_tags"("tenantId", "name");
CREATE UNIQUE INDEX "report_templates_tenantId_id_key" ON "report_templates"("tenantId", "id");

-- ── Indexes (SQL-only; Prisma cannot express them — see schema.prisma comments) ──
-- Case-insensitive names per tenant: the DB, not a racy router check, decides.
CREATE UNIQUE INDEX "report_schedule_tags_tenant_lower_name_key"
    ON "report_schedule_tags"("tenantId", lower("name"));
-- NULL names (legacy rows) are distinct, so they never collide.
CREATE UNIQUE INDEX "report_schedules_tenant_lower_name_key"
    ON "report_schedules"("tenantId", lower("name"));

-- ── Foreign keys ───────────────────────────────────────────────────────────
ALTER TABLE "report_schedule_tags" ADD CONSTRAINT "report_schedule_tags_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Composite FK: a schedule can only reference a template of its own tenant (DBA-012).
-- NO ACTION: deleting a template that a schedule still delivers is refused (the
-- report-templates router maps it to CONFLICT). Not RESTRICT: NO ACTION is checked at
-- the end of the statement, so a tenant delete cascading through report_templates and
-- report_schedules never depends on the order of the cascades.
ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_tenantId_templateId_fkey" FOREIGN KEY ("tenantId", "templateId") REFERENCES "report_templates"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE NOT VALID;
ALTER TABLE "report_schedules" VALIDATE CONSTRAINT "report_schedules_tenantId_templateId_fkey";

-- ── CHECK constraints on report_schedules (SQL-only) ───────────────────────
ALTER TABLE "report_schedules"
    ADD CONSTRAINT "report_schedules_colorToken_check"
    CHECK ("colorToken" IN (
        'slate', 'red', 'orange', 'amber', 'yellow', 'lime', 'green',
        'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet',
        'purple', 'fuchsia', 'pink', 'rose'
    )) NOT VALID;
ALTER TABLE "report_schedules" VALIDATE CONSTRAINT "report_schedules_colorToken_check";

-- A BullMQ pattern: exactly five space-separated cron fields.
ALTER TABLE "report_schedules"
    ADD CONSTRAINT "report_schedules_cronExpression_check"
    CHECK ("cronExpression" IS NULL OR "cronExpression" ~ '^[0-9*,/-]+( [0-9*,/-]+){4}$') NOT VALID;
ALTER TABLE "report_schedules" VALIDATE CONSTRAINT "report_schedules_cronExpression_check";

-- An active schedule always references something to deliver.
ALTER TABLE "report_schedules"
    ADD CONSTRAINT "report_schedules_reference_check"
    CHECK (NOT "isActive" OR "templateId" IS NOT NULL OR "reportId" IS NOT NULL) NOT VALID;
ALTER TABLE "report_schedules" VALIDATE CONSTRAINT "report_schedules_reference_check";

-- ── Row-level security (defence in depth; shape of 20261007130000_account_territories) ──
-- report_schedules already has RLS + tenant_isolation_report_schedules from the baseline.
ALTER TABLE "report_schedule_tags" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "report_schedule_tags_tenant_isolation" ON "report_schedule_tags"
    USING ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- !!! PRODUCTION DATA WRITE — one-time copy of report_settings.scheduledDelivery !!!
-- Every value is guarded before it is cast, so malformed JSON falls back to a safe
-- default instead of aborting the migration. The legacy JSON is read, never written.
-- PG201-COPY-BEGIN
INSERT INTO "report_schedules" (
    "id", "tenantId", "name", "description", "frequency", "dayOfWeek", "dayOfMonth",
    "timeOfDay", "cronExpression", "timezone", "recipients", "format", "colorToken",
    "tags", "isActive", "createdAt", "updatedAt"
)
SELECT
    'rs-migrated-' || src."tenantId",
    src."tenantId",
    'Scheduled delivery (from Report Settings)',
    CASE WHEN src.was_enabled
        THEN 'Copied from Report Settings, where scheduled delivery was enabled. Choose a report template, then activate this schedule.'
        ELSE 'Copied from Report Settings, where scheduled delivery was saved but not enabled. Choose a report template, then activate this schedule.'
    END,
    src.freq,
    CASE WHEN src.freq = 'weekly' THEN src.dow END,
    CASE WHEN src.freq = 'monthly' THEN 1 END,
    src.tod,
    split_part(src.tod, ':', 2)::int || ' ' || split_part(src.tod, ':', 1)::int || ' ' ||
        CASE src.freq
            WHEN 'daily' THEN '* * *'
            WHEN 'weekly' THEN '* * ' || src.dow
            ELSE '1 * *'
        END,
    'Europe/London',
    src.recipients,
    src.fmt,
    'slate',
    ARRAY[]::TEXT[],
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    SELECT
        rs."tenantId",
        (rs."scheduledDelivery"->>'enabled') = 'true' AS was_enabled,
        CASE WHEN rs."scheduledDelivery"->>'frequency' IN ('daily', 'weekly', 'monthly')
            THEN rs."scheduledDelivery"->>'frequency' ELSE 'weekly' END AS freq,
        CASE WHEN jsonb_typeof(rs."scheduledDelivery"->'dayOfWeek') = 'number'
                  AND (rs."scheduledDelivery"->>'dayOfWeek') ~ '^[0-6]$'
            THEN (rs."scheduledDelivery"->>'dayOfWeek')::int ELSE 1 END AS dow,
        CASE WHEN (rs."scheduledDelivery"->>'time') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
            THEN rs."scheduledDelivery"->>'time' ELSE '09:00' END AS tod,
        CASE WHEN jsonb_typeof(rs."scheduledDelivery"->'recipients') = 'array'
            THEN rs."scheduledDelivery"->'recipients' ELSE '[]'::jsonb END AS recipients,
        CASE WHEN rs."scheduledDelivery"->>'format' IN ('pdf', 'csv', 'excel')
            THEN rs."scheduledDelivery"->>'format' ELSE 'pdf' END AS fmt
    FROM "report_settings" rs
    WHERE jsonb_typeof(rs."scheduledDelivery") = 'object'
      AND (
        (rs."scheduledDelivery"->>'enabled') = 'true'
        -- CASE, not AND: Postgres does not guarantee AND evaluation order, and
        -- jsonb_array_length raises on a non-array.
        OR CASE WHEN jsonb_typeof(rs."scheduledDelivery"->'recipients') = 'array'
               THEN jsonb_array_length(rs."scheduledDelivery"->'recipients') > 0
               ELSE false END
      )
) AS src
WHERE NOT EXISTS (
    SELECT 1 FROM "report_schedules" existing
    WHERE existing."tenantId" = src."tenantId"
      AND lower(existing."name") = lower('Scheduled delivery (from Report Settings)')
)
ON CONFLICT DO NOTHING;
-- PG201-COPY-END
