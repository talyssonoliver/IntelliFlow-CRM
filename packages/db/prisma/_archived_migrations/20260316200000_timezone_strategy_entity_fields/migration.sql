-- ADR-044: UTC Storage with Three-Timezone Display Model
-- Adds entity-level timezone fields and changes system default to Europe/London.
--
-- Changes:
-- 1. Case.timezone       — IANA timezone for deadline display (e.g. "America/New_York")
-- 2. Case.jurisdiction    — Legal jurisdiction code (e.g. "US-NY", "UK-England")
-- 3. User.timezone default changed from 'UTC' to 'Europe/London'
-- 4. ReportSchedule.timezone default changed from 'UTC' to 'Europe/London'
-- 5. NotificationPreference.timezone default changed from 'UTC' to 'Europe/London'
-- 6. Backfill existing NULL/UTC user timezones to 'Europe/London'
--
-- Reversible with:
--   ALTER TABLE "cases" DROP COLUMN "timezone";
--   ALTER TABLE "cases" DROP COLUMN "jurisdiction";
--   ALTER TABLE "users" ALTER COLUMN "timezone" SET DEFAULT 'UTC';
--   ALTER TABLE "report_schedules" ALTER COLUMN "timezone" SET DEFAULT 'UTC';
--   ALTER TABLE "notification_preferences" ALTER COLUMN "timezone" SET DEFAULT 'UTC';
--   UPDATE "users" SET "timezone" = 'UTC' WHERE "timezone" = 'Europe/London';

-- ─── 1. Entity-level timezone fields ─────────────────────────────────────────

-- Case timezone: which timezone deadlines should be interpreted in
ALTER TABLE "cases" ADD COLUMN "timezone" TEXT;

-- Case jurisdiction: legal jurisdiction for court-time display
ALTER TABLE "cases" ADD COLUMN "jurisdiction" TEXT;

-- ─── 2. Change system default timezone from UTC to Europe/London ─────────────

-- User timezone default
ALTER TABLE "users" ALTER COLUMN "timezone" SET DEFAULT 'Europe/London';

-- ReportSchedule timezone default
ALTER TABLE "report_schedules" ALTER COLUMN "timezone" SET DEFAULT 'Europe/London';

-- NotificationPreference timezone default
ALTER TABLE "notification_preferences" ALTER COLUMN "timezone" SET DEFAULT 'Europe/London';

-- ─── 3. Backfill existing data ───────────────────────────────────────────────

-- Users who never set a timezone (NULL or 'UTC') get the new default
UPDATE "users" SET "timezone" = 'Europe/London' WHERE "timezone" IS NULL OR "timezone" = 'UTC';

-- Report schedules defaulting to UTC get updated
UPDATE "report_schedules" SET "timezone" = 'Europe/London' WHERE "timezone" = 'UTC';

-- Notification preferences defaulting to UTC get updated
UPDATE "notification_preferences" SET "timezone" = 'Europe/London' WHERE "timezone" = 'UTC';
