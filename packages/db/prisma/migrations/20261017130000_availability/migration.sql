-- PG-202: tenant availability — weekly working hours, all-day closures and a daily booking cap (ADR-081).
--
-- Class A (ADR-069 / docs/operations/agent-autonomy-policy.md): additive only.
--   * appointment_settings: two NULLABLE columns with no default -> metadata-only on PG 11+, no table
--     rewrite, no backfill, no existing row changes. "availabilityConfiguredAt" NULL = never configured
--     = legacy booking rules; the application reads NULL as "unchanged behaviour".
--   * appointment_settings CHECK on "maxDailyBookings" is added NOT VALID then validated. Every existing
--     row holds NULL (a CHECK passes on NULL), so the validating scan cannot fail and is short.
--   * Two NEW tables with their own constraints, indexes, FKs and RLS policies. No data is copied.
--   * No new index on a populated table (appointments is untouched; the daily-cap count uses its
--     existing indexes).
--
-- Recovery plan: forward-only. Operational rollback = clear "availabilityConfiguredAt" (the
-- calendar.availability.resetToDefaults procedure) and every booking path returns to its legacy rule with
-- the new tables left in place. A down-migration (DROP CONSTRAINT, DROP COLUMN x2, DROP TABLE x2) is
-- Class C — human-only, never run autonomously.
--
-- Merged, NOT applied: production applies only through the gated `prisma migrate deploy` workflow, and it
-- must run BEFORE the API that reads these columns is promoted.

-- ── appointment_settings: cap + configured marker ──────────────────────────
ALTER TABLE "appointment_settings" ADD COLUMN     "maxDailyBookings" INTEGER;
ALTER TABLE "appointment_settings" ADD COLUMN     "availabilityConfiguredAt" TIMESTAMP(3);

ALTER TABLE "appointment_settings" ADD CONSTRAINT "appointment_settings_maxDailyBookings_check"
    CHECK ("maxDailyBookings" IS NULL OR "maxDailyBookings" BETWEEN 1 AND 500) NOT VALID;
ALTER TABLE "appointment_settings" VALIDATE CONSTRAINT "appointment_settings_maxDailyBookings_check";

-- ── availability_hours ─────────────────────────────────────────────────────
-- Local wall-clock minutes-of-day in appointment_settings."defaultTimezone"; weekday 0 = Sunday.
CREATE TABLE "availability_hours" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "weekday" SMALLINT NOT NULL,
    "startMinute" SMALLINT NOT NULL,
    "endMinute" SMALLINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availability_hours_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "availability_hours_weekday_check" CHECK ("weekday" BETWEEN 0 AND 6),
    CONSTRAINT "availability_hours_startMinute_check" CHECK ("startMinute" >= 0),
    CONSTRAINT "availability_hours_endMinute_check" CHECK ("endMinute" <= 1440),
    CONSTRAINT "availability_hours_range_check" CHECK ("startMinute" < "endMinute")
);

-- ── availability_closures ──────────────────────────────────────────────────
-- All-day, inclusive calendar dates in the firm timezone (DATE, never an instant).
CREATE TABLE "availability_closures" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "reason" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availability_closures_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "availability_closures_range_check" CHECK ("endDate" >= "startDate"),
    CONSTRAINT "availability_closures_reason_check" CHECK ("reason" IS NULL OR btrim("reason") <> '')
);

-- ── Indexes (Prisma-declared) ──────────────────────────────────────────────
CREATE UNIQUE INDEX "availability_hours_tenantId_weekday_startMinute_key" ON "availability_hours"("tenantId", "weekday", "startMinute");
CREATE INDEX "availability_hours_tenantId_weekday_idx" ON "availability_hours"("tenantId", "weekday");
CREATE UNIQUE INDEX "availability_closures_tenantId_startDate_endDate_key" ON "availability_closures"("tenantId", "startDate", "endDate");
CREATE INDEX "availability_closures_tenantId_startDate_idx" ON "availability_closures"("tenantId", "startDate");

-- ── Foreign keys ───────────────────────────────────────────────────────────
-- To tenants, not appointment_settings: that row is lazily created and has no (tenantId, id) target.
ALTER TABLE "availability_hours" ADD CONSTRAINT "availability_hours_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "availability_closures" ADD CONSTRAINT "availability_closures_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Row-level security (defence in depth; shape of 20261013120000_case_types) ──
-- The app-level tenant boundary is the explicit "tenantId" filter on every query
-- (apps/api/src/security/tenant-context.ts); these policies guard other roles.
ALTER TABLE "availability_hours" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "availability_closures" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "availability_hours_tenant_isolation" ON "availability_hours"
    USING ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "availability_closures_tenant_isolation" ON "availability_closures"
    USING ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
