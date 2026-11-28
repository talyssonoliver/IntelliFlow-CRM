-- IFC-317: direct transfer of a portability export to another controller (UK GDPR Art 20(2)).
--
-- Class A (ADR-069 / docs/operations/agent-autonomy-policy.md): additive only.
--   * Two NEW tables (dsar_transfers, dsar_transfer_events) with their own constraints, indexes,
--     FKs and RLS. No existing table, column, constraint, trigger or row is read, altered,
--     copied or rewritten. No new enum: the closed sets are CHECKs, as in dsar_requests.
--   * Plain (non-CONCURRENTLY) indexes are safe: both tables are created empty in this transaction.
--   * Composite FKs (tenantId, requestId) and (tenantId, transferId) keep a transfer and its events
--     in the same firm as the request; deleting a request removes its transfers and their events.
--   * The users FKs use ON DELETE SET NULL so deleting a staff user never removes the record.
--
-- Recovery plan: forward-only. Operational rollback = stop serving the transfer procedures
-- (privacy.admin.createTransfer and privacy.downloadTransfer); nothing else reads these tables.
-- A down-migration (DROP TABLE dsar_transfer_events, dsar_transfers) deletes the record of data
-- the firm sent to other controllers, which it must keep as evidence of compliance: Class C,
-- human-only.
--
-- Merged, NOT applied: production applies only through the gated `prisma migrate deploy` workflow,
-- and it must run BEFORE the API that reads these tables is promoted.

SET LOCAL lock_timeout = '5s';

-- ── dsar_transfers ─────────────────────────────────────────────────────────
CREATE TABLE "dsar_transfers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "recipientName" VARCHAR(200) NOT NULL,
    "recipientEmail" VARCHAR(320) NOT NULL,
    "basis" VARCHAR(500) NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dsar_transfers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "dsar_transfers_tokenHash_check" CHECK ("tokenHash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "dsar_transfers_recipientEmail_check"
        CHECK ("recipientEmail" = lower(btrim("recipientEmail")) AND "recipientEmail" LIKE '%_@_%'),
    CONSTRAINT "dsar_transfers_recipientName_check"
        CHECK (char_length(btrim("recipientName")) BETWEEN 1 AND 200),
    CONSTRAINT "dsar_transfers_basis_check"
        CHECK (char_length(btrim("basis")) BETWEEN 10 AND 500),
    -- A link that was used cannot also be revoked afterwards, and vice versa.
    CONSTRAINT "dsar_transfers_used_or_revoked_check"
        CHECK ("usedAt" IS NULL OR "revokedAt" IS NULL)
);

CREATE UNIQUE INDEX "dsar_transfers_tokenHash_key" ON "dsar_transfers"("tokenHash");
CREATE UNIQUE INDEX "dsar_transfers_tenantId_id_key" ON "dsar_transfers"("tenantId", "id");
CREATE INDEX "dsar_transfers_tenantId_requestId_createdAt_idx"
    ON "dsar_transfers"("tenantId", "requestId", "createdAt");
CREATE INDEX "dsar_transfers_expiresAt_idx" ON "dsar_transfers"("expiresAt");

ALTER TABLE "dsar_transfers" ADD CONSTRAINT "dsar_transfers_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dsar_transfers" ADD CONSTRAINT "dsar_transfers_tenantId_requestId_fkey"
    FOREIGN KEY ("tenantId", "requestId") REFERENCES "dsar_requests"("tenantId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dsar_transfers" ADD CONSTRAINT "dsar_transfers_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── dsar_transfer_events ───────────────────────────────────────────────────
CREATE TABLE "dsar_transfer_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "actorType" VARCHAR(20) NOT NULL,
    "actorId" TEXT,
    "via" VARCHAR(10),
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dsar_transfer_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "dsar_transfer_events_kind_check"
        CHECK ("kind" IN ('CREATED', 'SENT', 'DOWNLOADED', 'EXPIRED', 'REVOKED')),
    CONSTRAINT "dsar_transfer_events_actorType_check"
        CHECK ("actorType" IN ('ADMIN', 'RECIPIENT', 'SYSTEM')),
    -- Only a SENT event says how; the IS NOT NULL guard keeps a NULL from passing the CHECK.
    CONSTRAINT "dsar_transfer_events_via_check" CHECK (
        ("kind" = 'SENT' AND "via" IS NOT NULL AND "via" IN ('EMAIL', 'MANUAL'))
        OR ("kind" <> 'SENT' AND "via" IS NULL))
);

-- At most one step of each kind per transfer: a link is created, sent, used or ended once.
CREATE UNIQUE INDEX "dsar_transfer_events_transferId_kind_key"
    ON "dsar_transfer_events"("transferId", "kind");
CREATE INDEX "dsar_transfer_events_tenantId_requestId_occurredAt_idx"
    ON "dsar_transfer_events"("tenantId", "requestId", "occurredAt");

ALTER TABLE "dsar_transfer_events" ADD CONSTRAINT "dsar_transfer_events_tenantId_transferId_fkey"
    FOREIGN KEY ("tenantId", "transferId") REFERENCES "dsar_transfers"("tenantId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dsar_transfer_events" ADD CONSTRAINT "dsar_transfer_events_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Row-level security (defence in depth; shape of 20261022120000_dsar_requests) ──
-- The application-level tenant boundary is the explicit tenantId in every admin query. The public
-- download finds its row by the token hash alone and runs on the API's own connection, like the
-- other public DSAR procedures.
ALTER TABLE "dsar_transfers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dsar_transfer_events" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "dsar_transfers_tenant_isolation" ON "dsar_transfers"
    USING ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "dsar_transfer_events_tenant_isolation" ON "dsar_transfer_events"
    USING ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
