-- PG-203: tenant event types and the public booking page (ADR-083).
--
-- Class A (ADR-069 / docs/operations/agent-autonomy-policy.md): additive only.
--   * Two NEW tables (event_types, booking_attempts) with their own constraints, indexes, FKs and RLS.
--   * tenants: two NULLABLE columns with no default (metadata-only on PG 11+, no rewrite, no backfill).
--     Their CHECKs are added NOT VALID here (no scan) and VALIDATEd in 20261021120500, outside this
--     transaction, so the brief ACCESS EXCLUSIVE lock of ADD COLUMN is never held during a scan. The
--     bookingHandle unique index ships CONCURRENTLY in 20261021120200 (tenants is read on every request).
--   * appointments: eight NULLABLE columns with no default (metadata-only). No index is added to this
--     populated table. Its CHECKs and the eventTypeId composite FK are added NOT VALID here and VALIDATEd
--     in 20261021120500. lock_timeout bounds how long each statement waits to acquire its lock.
--   * ON DELETE SET NULL ("eventTypeId") uses the PostgreSQL 15+ column-list form, so deleting an event
--     type clears only the link and never the appointment's NOT NULL "tenantId".
--   * LeadSource 'BOOKING' was committed by 20261021120000, so it is usable here.
--   * No data is copied or rewritten.
--
-- Recovery plan: forward-only. Operational rollback = clear tenants."bookingHandle" (public booking turns
-- off) and stop using event types; existing appointments are unaffected. A down-migration (DROP TABLE x2,
-- DROP COLUMN x10, DROP TYPE) is Class C — human-only, never run autonomously.
--
-- Merged, NOT applied: production applies only through the gated `prisma migrate deploy` workflow, and it
-- must run BEFORE the API that reads these columns is promoted.

SET LOCAL lock_timeout = '5s';

-- ── EventLocationType ──────────────────────────────────────────────────────
CREATE TYPE "EventLocationType" AS ENUM ('IN_PERSON', 'PHONE', 'VIDEO', 'CUSTOM');

-- ── event_types ────────────────────────────────────────────────────────────
CREATE TABLE "event_types" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "description" TEXT,
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "colorToken" TEXT NOT NULL DEFAULT 'blue',
    "locationType" "EventLocationType" NOT NULL DEFAULT 'VIDEO',
    "locationDetails" VARCHAR(500),
    "appointmentType" "AppointmentType" NOT NULL DEFAULT 'MEETING',
    "hostUserId" TEXT NOT NULL,
    "requiredFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "leadSource" "LeadSource" NOT NULL DEFAULT 'BOOKING',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_types_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "event_types_name_check" CHECK ("name" = btrim("name") AND "name" <> ''),
    CONSTRAINT "event_types_slug_check" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CONSTRAINT "event_types_description_check"
        CHECK ("description" IS NULL OR char_length("description") <= 2000),
    CONSTRAINT "event_types_durationMinutes_check" CHECK ("durationMinutes" BETWEEN 5 AND 480),
    -- Same 18-token tag palette as contact_types_colorToken_check (TAG_COLOR_TOKENS in @intelliflow/validators).
    CONSTRAINT "event_types_colorToken_check" CHECK ("colorToken" IN (
        'slate', 'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal',
        'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose')),
    CONSTRAINT "event_types_locationDetails_check"
        CHECK ("locationDetails" IS NULL OR btrim("locationDetails") <> ''),
    CONSTRAINT "event_types_requiredFields_check" CHECK (
        "requiredFields" <@ ARRAY['phone', 'company', 'notes']::TEXT[]
        AND cardinality("requiredFields") <= 3),
    CONSTRAINT "event_types_leadSource_check" CHECK ("leadSource" IN ('WEBSITE', 'BOOKING'))
);

CREATE UNIQUE INDEX "event_types_tenantId_slug_key" ON "event_types"("tenantId", "slug");
CREATE UNIQUE INDEX "event_types_tenantId_id_key" ON "event_types"("tenantId", "id");
CREATE INDEX "event_types_tenantId_isActive_idx" ON "event_types"("tenantId", "isActive");
CREATE INDEX "event_types_hostUserId_idx" ON "event_types"("hostUserId");
-- SQL-only (Prisma cannot express it; documented in schema.prisma).
CREATE UNIQUE INDEX "event_types_tenant_lower_name_key" ON "event_types"("tenantId", lower("name"));

ALTER TABLE "event_types" ADD CONSTRAINT "event_types_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- NO ACTION (checked at statement end), not RESTRICT: a tenant delete cascades to both users and
-- event types without tripping this FK mid-statement.
ALTER TABLE "event_types" ADD CONSTRAINT "event_types_hostUserId_fkey"
    FOREIGN KEY ("hostUserId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- ── booking_attempts (abuse counters; salted hashes only, never raw email/IP) ──
CREATE TABLE "booking_attempts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventTypeId" TEXT,
    "emailHash" CHAR(64) NOT NULL,
    "ipHash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_attempts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "booking_attempts_emailHash_check" CHECK ("emailHash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "booking_attempts_ipHash_check" CHECK ("ipHash" ~ '^[0-9a-f]{64}$')
);

CREATE INDEX "booking_attempts_tenantId_emailHash_createdAt_idx"
    ON "booking_attempts"("tenantId", "emailHash", "createdAt");
CREATE INDEX "booking_attempts_tenantId_ipHash_createdAt_idx"
    ON "booking_attempts"("tenantId", "ipHash", "createdAt");
CREATE INDEX "booking_attempts_eventTypeId_createdAt_idx"
    ON "booking_attempts"("eventTypeId", "createdAt");

ALTER TABLE "booking_attempts" ADD CONSTRAINT "booking_attempts_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_attempts" ADD CONSTRAINT "booking_attempts_tenantId_eventTypeId_fkey"
    FOREIGN KEY ("tenantId", "eventTypeId") REFERENCES "event_types"("tenantId", "id")
    ON DELETE SET NULL ("eventTypeId") ON UPDATE CASCADE;

-- ── tenants: public booking handle + privacy notice ────────────────────────
ALTER TABLE "tenants" ADD COLUMN "bookingHandle" VARCHAR(40);
ALTER TABLE "tenants" ADD COLUMN "bookingPrivacyUrl" VARCHAR(500);

ALTER TABLE "tenants" ADD CONSTRAINT "tenants_bookingHandle_check" CHECK (
    "bookingHandle" IS NULL OR (
        "bookingHandle" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
        AND char_length("bookingHandle") BETWEEN 3 AND 40)) NOT VALID;
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_bookingPrivacyUrl_check"
    CHECK ("bookingPrivacyUrl" IS NULL OR "bookingPrivacyUrl" LIKE 'https://%') NOT VALID;

-- ── appointments: booking columns ──────────────────────────────────────────
ALTER TABLE "appointments" ADD COLUMN "eventTypeId" TEXT;
ALTER TABLE "appointments" ADD COLUMN "leadId" TEXT;
ALTER TABLE "appointments" ADD COLUMN "bookerName" VARCHAR(200);
ALTER TABLE "appointments" ADD COLUMN "bookerEmail" VARCHAR(320);
ALTER TABLE "appointments" ADD COLUMN "bookingAnswers" JSONB;
ALTER TABLE "appointments" ADD COLUMN "bookedVia" VARCHAR(20);
ALTER TABLE "appointments" ADD COLUMN "bookingConsentAt" TIMESTAMP(3);
ALTER TABLE "appointments" ADD COLUMN "bookingConsentVersion" VARCHAR(40);

ALTER TABLE "appointments" ADD CONSTRAINT "appointments_bookedVia_check"
    CHECK ("bookedVia" IS NULL OR "bookedVia" IN ('PUBLIC_LINK')) NOT VALID;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_bookingAnswers_check"
    CHECK ("bookingAnswers" IS NULL OR pg_column_size("bookingAnswers") <= 4096) NOT VALID;

ALTER TABLE "appointments" ADD CONSTRAINT "appointments_tenantId_eventTypeId_fkey"
    FOREIGN KEY ("tenantId", "eventTypeId") REFERENCES "event_types"("tenantId", "id")
    ON DELETE SET NULL ("eventTypeId") ON UPDATE CASCADE NOT VALID;

-- ── Row-level security (defence in depth; shape of 20261017120000_contact_types) ──
-- The application-level tenant boundary is the explicit tenantId in every query; the public booking
-- transaction sets app.current_tenant_id with set_config(..., true) before it writes.
ALTER TABLE "event_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "booking_attempts" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "event_types_tenant_isolation" ON "event_types"
    USING ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "booking_attempts_tenant_isolation" ON "booking_attempts"
    USING ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
