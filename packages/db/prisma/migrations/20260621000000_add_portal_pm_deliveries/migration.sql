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

-- Enable Row Level Security: the repo-wide RLS-coverage contract requires every
-- public table to ENABLE RLS (db/__tests__/rls-migrations.test.ts). The CRM connects
-- with a privileged role that bypasses RLS, and this is an internal integration
-- ledger written only by the apps/api receiver — so ENABLE-only is the established
-- pattern (mirrors IFC-314's setup_instalments / stripe_subscriptions).
ALTER TABLE "portal_pm_deliveries" ENABLE ROW LEVEL SECURITY;
