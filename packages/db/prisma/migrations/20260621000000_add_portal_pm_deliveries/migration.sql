-- CRM-PR-A: inbound ledger for leangency-portal PM-event deliveries (ADR-022).
-- Ingestion-only; one idempotent row per delivery keyed on the deterministic
-- Idempotency-Key. Stores the minimal envelope + a payload hash, never the full
-- governed payload. Additive: a new table only, no changes to existing tables.

-- CreateTable
CREATE TABLE "portal_pm_deliveries" (
    "id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processing_status" TEXT NOT NULL DEFAULT 'received',
    "safe_error_code" TEXT,
    "payload_hash" TEXT NOT NULL,
    "tenant_id" TEXT,

    CONSTRAINT "portal_pm_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "portal_pm_deliveries_idempotency_key_key" ON "portal_pm_deliveries"("idempotency_key");

-- CreateIndex
CREATE INDEX "portal_pm_deliveries_event_id_idx" ON "portal_pm_deliveries"("event_id");

-- CreateIndex
CREATE INDEX "portal_pm_deliveries_processing_status_idx" ON "portal_pm_deliveries"("processing_status");
