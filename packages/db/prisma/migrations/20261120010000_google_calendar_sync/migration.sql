-- MVP-013: Google Calendar sync - the per-mailbox sync state and the event <-> appointment links.
--
-- Class A (ADR-069 / docs/operations/agent-autonomy-policy.md): additive only.
--   * Six columns added to "email_mailboxes": four nullable, one integer and one short text with a
--     constant default (0 and 'ACTIVE'). Postgres adds a constant default without rewriting the
--     table, and no existing row is read or changed.
--   * One CHECK on the new status column, added NOT VALID (validated in the next migration).
--   * One NEW table, "calendar_event_links", with its own constraints, indexes and RLS policy. It
--     holds no credential: Google event ids, an etag and timestamps.
--   * "calendarSyncToken" is Google's incremental sync token, useless without the mailbox's own
--     access token (never stored); it is not a credential.
--
-- Recovery plan: forward-only. Operational rollback = the sync is switched off with
-- GOOGLE_CALENDAR_SYNC=off and the columns and table are simply unused. A down-migration (DROP
-- COLUMN, DROP TABLE) is Class C - human-only, never autonomous.
--
-- Production applies only through the gated `prisma migrate deploy` workflow, before the API that
-- reads these columns is promoted.

-- ── email_mailboxes: the calendar sync state ────────────────────────────────
ALTER TABLE "email_mailboxes"
    ADD COLUMN "calendarSyncToken" TEXT,
    ADD COLUMN "calendarSyncedAt" TIMESTAMP(3),
    ADD COLUMN "calendarNextSyncAt" TIMESTAMP(3),
    ADD COLUMN "calendarLockedUntil" TIMESTAMP(3),
    ADD COLUMN "calendarFailureCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "calendarStatus" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE "email_mailboxes" ADD CONSTRAINT "email_mailboxes_calendarStatus_check"
    CHECK ("calendarStatus" IN ('ACTIVE', 'NEEDS_RECONNECT')) NOT VALID;

-- ── calendar_event_links ───────────────────────────────────────────────────
CREATE TABLE "calendar_event_links" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "mailboxId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "googleEventId" VARCHAR(1024) NOT NULL,
    "origin" VARCHAR(10) NOT NULL,
    "etag" VARCHAR(256),
    "localSyncedAt" TIMESTAMP(3),
    "remoteUpdatedAt" TIMESTAMP(3),
    "remoteCancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_event_links_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "calendar_event_links_origin_check" CHECK ("origin" IN ('AURORA', 'GOOGLE')),
    CONSTRAINT "calendar_event_links_googleEventId_check" CHECK (length("googleEventId") > 0)
);

-- ── Indexes ────────────────────────────────────────────────────────────────
-- One link per Google event and per appointment in a calendar: the sync's idempotency. A NULL
-- "appointmentId" (the appointment was deleted) never collides, as Postgres treats NULLs as distinct.
CREATE UNIQUE INDEX "calendar_event_links_mailboxId_googleEventId_key"
    ON "calendar_event_links"("mailboxId", "googleEventId");
CREATE UNIQUE INDEX "calendar_event_links_mailboxId_appointmentId_key"
    ON "calendar_event_links"("mailboxId", "appointmentId");
CREATE INDEX "calendar_event_links_tenantId_idx" ON "calendar_event_links"("tenantId");
CREATE INDEX "calendar_event_links_appointmentId_idx" ON "calendar_event_links"("appointmentId");

-- ── Foreign keys ───────────────────────────────────────────────────────────
ALTER TABLE "calendar_event_links" ADD CONSTRAINT "calendar_event_links_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Composite, so a link can only point at a mailbox of its own tenant.
ALTER TABLE "calendar_event_links" ADD CONSTRAINT "calendar_event_links_tenantId_mailboxId_fkey"
    FOREIGN KEY ("tenantId", "mailboxId") REFERENCES "email_mailboxes"("tenantId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE;
-- SET NULL: a deleted appointment leaves its link behind, which tells the sync to delete the Google
-- event as well.
ALTER TABLE "calendar_event_links" ADD CONSTRAINT "calendar_event_links_appointmentId_fkey"
    FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Row-level security (defence in depth; shape of 20261020120000_email_mailboxes) ──
ALTER TABLE "calendar_event_links" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "calendar_event_links_tenant_isolation" ON "calendar_event_links"
    USING ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
