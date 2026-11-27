-- IFC-316: the stored files of an erased person, queued by the erasure transaction.
--
-- Class A (ADR-069 / docs/operations/agent-autonomy-policy.md): additive only. One NEW table with
-- its own constraints, index, FKs and RLS; no existing table, column, constraint or row is
-- touched. A plain (non-CONCURRENTLY) index is safe: the table is created empty in this
-- transaction.
--
-- Why a table: a storage delete cannot join the database transaction. The erasure writes one row
-- per stored object (PENDING) in its own transaction, moves the locator out of the lead file,
-- email attachment, chat message and ticket attachment rows, and commits; the objects are
-- deleted afterwards and each row is settled (DELETED, locator cleared). A row left PENDING or
-- MANUAL is exactly what the admin's checklist still shows, and survives a restart.
--
-- Recovery plan: forward-only. Operational rollback = stop calling the cleanup (the rows stay
-- queued). DROP TABLE dsar_stored_objects is Class C (human-only): it would lose the list of
-- objects still to delete.
--
-- Merged, NOT applied: production applies only through the gated `prisma migrate deploy`
-- workflow, and it must run BEFORE the API that writes this table is promoted.

SET LOCAL lock_timeout = '5s';

CREATE TABLE "dsar_stored_objects" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "source" VARCHAR(20) NOT NULL,
    "state" VARCHAR(10) NOT NULL DEFAULT 'PENDING',
    "reason" VARCHAR(20),
    "bucket" VARCHAR(100),
    "locator" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" VARCHAR(40),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "dsar_stored_objects_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "dsar_stored_objects_source_check" CHECK ("source" IN
        ('LEAD_FILE', 'EMAIL_ATTACHMENT', 'CHAT_ATTACHMENT', 'TICKET_ATTACHMENT')),
    CONSTRAINT "dsar_stored_objects_state_check" CHECK ("state" IN ('PENDING', 'MANUAL', 'KEPT', 'DELETED')),
    -- Why a row is not deleted by the CRM: UNMANAGED (manual: another host, bucket or firm) or
    -- SHARED_KEPT (kept: another retained record still uses the object).
    CONSTRAINT "dsar_stored_objects_reason_check" CHECK (
        ("state" = 'MANUAL' AND "reason" = 'UNMANAGED')
        OR ("state" = 'KEPT' AND "reason" = 'SHARED_KEPT')
        OR ("state" IN ('PENDING', 'DELETED') AND "reason" IS NULL)),
    -- A deletable row names its bucket and path; a settled one keeps no locator.
    CONSTRAINT "dsar_stored_objects_locator_check" CHECK (
        ("state" = 'PENDING' AND "bucket" IS NOT NULL AND "locator" IS NOT NULL)
        OR ("state" = 'MANUAL' AND "locator" IS NOT NULL)
        OR ("state" IN ('KEPT', 'DELETED') AND "locator" IS NULL))
);

CREATE INDEX "dsar_stored_objects_tenantId_requestId_state_idx"
    ON "dsar_stored_objects"("tenantId", "requestId", "state");

ALTER TABLE "dsar_stored_objects" ADD CONSTRAINT "dsar_stored_objects_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dsar_stored_objects" ADD CONSTRAINT "dsar_stored_objects_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "dsar_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security (defence in depth; same shape as dsar_requests).
ALTER TABLE "dsar_stored_objects" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "dsar_stored_objects_tenant_isolation" ON "dsar_stored_objects"
    USING ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
