-- PG-208: task automation rules executed inside the API process (ADR-084).
--
-- Class A (ADR-069 / docs/operations/agent-autonomy-policy.md): additive only.
--   * Four NEW tables (settings, rules, runs, tags) with their own constraints,
--     indexes and RLS policies. No existing table is altered, no row is copied or
--     rewritten, nothing is backfilled (an absent settings row means defaults).
--   * Only new-table indexes. The five FK additions take a brief SHARE ROW EXCLUSIVE
--     lock on "tenants" / "users"; the new tables are empty, so validation is
--     instant. lock_timeout makes a deploy that would queue behind a long
--     transaction fail fast instead of stalling writers.
--
-- Recovery plan: forward-only. First rollback step = redeploy the previous API (the
-- tables are inert without it). Per tenant: settings.automationEnabled = false (an
-- absent settings row means enabled, so the row is created) or deactivate rules.
-- A down-migration (DROP TABLE x4) is Class C — human-only, never run autonomously.
--
-- Production applies only through the gated `prisma migrate deploy` workflow,
-- and must be applied before the API that uses these tables is promoted.

SET LOCAL lock_timeout = '5s';

-- CreateTable
CREATE TABLE "task_automation_settings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "automationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "maxRunsPerRulePerHour" INTEGER NOT NULL DEFAULT 60,
    "notifyRuleOwnerOnFailure" BOOLEAN NOT NULL DEFAULT false,
    "automationEnabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_automation_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "task_automation_settings_maxRunsPerRulePerHour_check" CHECK ("maxRunsPerRulePerHour" BETWEEN 1 AND 500)
);

-- CreateTable
CREATE TABLE "task_automation_rules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(500),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "triggerType" TEXT NOT NULL,
    "eventType" TEXT,
    "eventFilter" JSONB,
    "scheduleCadence" TEXT,
    "scheduleDayOfWeek" INTEGER,
    "scheduleDayOfMonth" INTEGER,
    "scheduleTimeOfDay" VARCHAR(5),
    "scheduleCron" VARCHAR(100),
    "scheduleTimezone" VARCHAR(64),
    "nextRunAt" TIMESTAMP(3),
    "webhookTokenHash" CHAR(64),
    "webhookTokenPrefix" VARCHAR(12),
    "webhookSecret" TEXT,
    "webhookSecretPrevious" TEXT,
    "webhookSecretPreviousExpiresAt" TIMESTAMP(3),
    "actions" JSONB NOT NULL,
    "ruleKey" CHAR(64),
    "rrCursor" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRunAt" TIMESTAMP(3),
    "lastRunStatus" TEXT,
    "lastRunOutcome" VARCHAR(60),
    "suppressedCount" INTEGER NOT NULL DEFAULT 0,
    "lastSuppressedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_automation_rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "task_automation_rules_name_check" CHECK ("name" = btrim("name") AND "name" <> ''),
    CONSTRAINT "task_automation_rules_sortOrder_check" CHECK ("sortOrder" >= 0),
    CONSTRAINT "task_automation_rules_tags_check" CHECK (cardinality("tags") <= 10),
    CONSTRAINT "task_automation_rules_triggerType_check" CHECK ("triggerType" IN ('ENTITY_EVENT', 'SCHEDULE', 'WEBHOOK')),
    CONSTRAINT "task_automation_rules_eventType_check" CHECK ("eventType" IS NULL OR "eventType" IN (
        'lead.created', 'lead.qualified', 'lead.converted', 'contact.created',
        'opportunity.created', 'opportunity.stage_changed', 'opportunity.won',
        'opportunity.lost', 'account.created')),
    CONSTRAINT "task_automation_rules_scheduleCadence_check" CHECK ("scheduleCadence" IS NULL OR "scheduleCadence" IN
        ('daily', 'weekly', 'monthly', 'quarterly', 'custom')),
    CONSTRAINT "task_automation_rules_lastRunStatus_check" CHECK ("lastRunStatus" IS NULL OR "lastRunStatus" IN ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED')),
    CONSTRAINT "task_automation_rules_rrCursor_check" CHECK ("rrCursor" >= 0),
    CONSTRAINT "task_automation_rules_suppressedCount_check" CHECK ("suppressedCount" >= 0),
    CONSTRAINT "task_automation_rules_schedule_ranges_check" CHECK (
        ("scheduleDayOfWeek" IS NULL OR "scheduleDayOfWeek" BETWEEN 0 AND 6)
        AND ("scheduleDayOfMonth" IS NULL OR "scheduleDayOfMonth" BETWEEN 1 AND 28)
        AND ("scheduleTimeOfDay" IS NULL OR "scheduleTimeOfDay" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')),
    CONSTRAINT "task_automation_rules_trigger_columns_check" CHECK (
        ("triggerType" = 'ENTITY_EVENT'
          AND "eventType" IS NOT NULL
          AND "scheduleCadence" IS NULL AND "scheduleCron" IS NULL AND "scheduleTimezone" IS NULL
          AND "nextRunAt" IS NULL
          AND "webhookTokenHash" IS NULL AND "webhookTokenPrefix" IS NULL AND "webhookSecret" IS NULL
          AND "ruleKey" IS NOT NULL)
        OR ("triggerType" = 'SCHEDULE'
          AND "scheduleCadence" IS NOT NULL AND "scheduleCron" IS NOT NULL
          AND "scheduleTimezone" IS NOT NULL
          AND (NOT "isActive" OR "nextRunAt" IS NOT NULL)
          AND "eventType" IS NULL AND "eventFilter" IS NULL
          AND "webhookTokenHash" IS NULL AND "webhookTokenPrefix" IS NULL AND "webhookSecret" IS NULL
          AND "ruleKey" IS NOT NULL)
        OR ("triggerType" = 'WEBHOOK'
          AND "webhookTokenHash" IS NOT NULL AND "webhookTokenPrefix" IS NOT NULL
          AND "webhookSecret" IS NOT NULL
          AND "eventType" IS NULL AND "eventFilter" IS NULL
          AND "scheduleCadence" IS NULL AND "scheduleCron" IS NULL AND "scheduleTimezone" IS NULL
          AND "nextRunAt" IS NULL AND "ruleKey" IS NULL))
);

-- CreateTable
CREATE TABLE "task_automation_runs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "idempotencyKey" VARCHAR(160) NOT NULL,
    "payloadHash" CHAR(64),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "actions" JSONB,
    "context" JSONB NOT NULL DEFAULT '{}',
    "taskId" TEXT,
    "assigneeId" TEXT,
    "outcome" VARCHAR(60),
    "errorCode" VARCHAR(60),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "task_automation_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "task_automation_runs_status_check" CHECK ("status" IN ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED')),
    CONSTRAINT "task_automation_runs_triggerType_check" CHECK ("triggerType" IN ('ENTITY_EVENT', 'SCHEDULE', 'WEBHOOK')),
    CONSTRAINT "task_automation_runs_idempotencyKey_check" CHECK ("idempotencyKey" <> '')
);

-- CreateTable
CREATE TABLE "task_automation_tags" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "colorToken" TEXT NOT NULL DEFAULT 'slate',
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_automation_tags_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "task_automation_tags_name_check" CHECK ("name" = btrim("name") AND "name" <> ''),
    CONSTRAINT "task_automation_tags_colorToken_check" CHECK ("colorToken" IN (
        'slate', 'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal',
        'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose')),
    CONSTRAINT "task_automation_tags_sortOrder_check" CHECK ("sortOrder" >= 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "task_automation_settings_tenantId_key" ON "task_automation_settings"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "task_automation_rules_webhookTokenHash_key" ON "task_automation_rules"("webhookTokenHash");

-- CreateIndex
CREATE INDEX "task_automation_rules_tenantId_isActive_triggerType_eventTy_idx" ON "task_automation_rules"("tenantId", "isActive", "triggerType", "eventType");

-- CreateIndex
CREATE UNIQUE INDEX "task_automation_rules_tenantId_id_key" ON "task_automation_rules"("tenantId", "id");

-- CreateIndex
CREATE INDEX "task_automation_runs_status_createdAt_idx" ON "task_automation_runs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "task_automation_runs_tenantId_ruleId_createdAt_idx" ON "task_automation_runs"("tenantId", "ruleId", "createdAt" DESC);

-- Tenant-wide hourly cap count (webhook route, engine tick, Test Rule).
CREATE INDEX "task_automation_runs_tenantId_createdAt_idx" ON "task_automation_runs"("tenantId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "task_automation_runs_ruleId_idempotencyKey_key" ON "task_automation_runs"("ruleId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "task_automation_tags_tenantId_idx" ON "task_automation_tags"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "task_automation_tags_tenantId_name_key" ON "task_automation_tags"("tenantId", "name");

-- AddForeignKey
ALTER TABLE "task_automation_settings" ADD CONSTRAINT "task_automation_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_automation_rules" ADD CONSTRAINT "task_automation_rules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_automation_rules" ADD CONSTRAINT "task_automation_rules_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_automation_runs" ADD CONSTRAINT "task_automation_runs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_automation_runs" ADD CONSTRAINT "task_automation_runs_tenantId_ruleId_fkey" FOREIGN KEY ("tenantId", "ruleId") REFERENCES "task_automation_rules"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_automation_tags" ADD CONSTRAINT "task_automation_tags_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── SQL-only indexes (Prisma cannot express them; documented in schema.prisma) ──
CREATE UNIQUE INDEX "task_automation_rules_tenant_lower_name_key"
    ON "task_automation_rules"("tenantId", lower("name"));
-- Two ACTIVE rules may not do the same thing (DoD item 9; webhook rules have no key).
CREATE UNIQUE INDEX "task_automation_rules_tenant_ruleKey_active_key"
    ON "task_automation_rules"("tenantId", "ruleKey") WHERE "isActive" AND "ruleKey" IS NOT NULL;
CREATE INDEX "task_automation_rules_schedule_due_idx"
    ON "task_automation_rules"("nextRunAt") WHERE "isActive" AND "triggerType" = 'SCHEDULE';
CREATE UNIQUE INDEX "task_automation_tags_tenant_lower_name_key"
    ON "task_automation_tags"("tenantId", lower("name"));

-- ── Row-level security (defence in depth; shape of 20261017120000_contact_types) ──
-- The application-level tenant boundary is the explicit tenantId in every query
-- (RLS is not FORCEd in this project; the runner and webhook read with the API role).
ALTER TABLE "task_automation_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "task_automation_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "task_automation_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "task_automation_tags" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "task_automation_settings_tenant_isolation" ON "task_automation_settings"
    USING ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "task_automation_rules_tenant_isolation" ON "task_automation_rules"
    USING ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "task_automation_runs_tenant_isolation" ON "task_automation_runs"
    USING ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "task_automation_tags_tenant_isolation" ON "task_automation_tags"
    USING ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
