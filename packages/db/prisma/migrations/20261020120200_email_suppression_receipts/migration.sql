-- PG-207: suppression list and bounce-report receipts (ADR-085).
--
-- Class A: additive only — two NEW tables with constraints, indexes and RLS.
-- Receipts hold no mail content: a status code and a truncated,
-- address-redacted diagnostic only (AC-EM-025).
--
-- Recovery plan: forward-only. Operational rollback = admins remove
-- suppressions in Email Settings. A down-migration is Class C — human-only.

-- ── email_suppressions ─────────────────────────────────────────────────────
CREATE TABLE "email_suppressions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "reason" VARCHAR(20) NOT NULL,
    "source" VARCHAR(10) NOT NULL,
    "emailRecordId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_suppressions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "email_suppressions_email_check"
        CHECK ("email" = lower(btrim("email")) AND position('@' IN "email") > 1),
    CONSTRAINT "email_suppressions_reason_check"
        CHECK ("reason" IN ('HARD_BOUNCE', 'SOFT_BOUNCE_LIMIT', 'MANUAL')),
    CONSTRAINT "email_suppressions_source_check" CHECK ("source" IN ('DSN', 'MANUAL'))
);

-- ── email_bounce_receipts ──────────────────────────────────────────────────
CREATE TABLE "email_bounce_receipts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "mailboxId" TEXT NOT NULL,
    "dsnKey" VARCHAR(255) NOT NULL,
    "recipient" VARCHAR(320) NOT NULL,
    "emailRecordId" TEXT,
    "kind" VARCHAR(10) NOT NULL,
    "statusCode" VARCHAR(16),
    "diagnostic" VARCHAR(200),
    "matchConfidence" VARCHAR(6) NOT NULL,
    "excludedFromCount" BOOLEAN NOT NULL DEFAULT false,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_bounce_receipts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "email_bounce_receipts_kind_check" CHECK ("kind" IN ('HARD', 'SOFT', 'DELAYED', 'UNMATCHED')),
    CONSTRAINT "email_bounce_receipts_matchConfidence_check" CHECK ("matchConfidence" IN ('HIGH', 'LOW')),
    CONSTRAINT "email_bounce_receipts_recipient_check" CHECK ("recipient" = lower(btrim("recipient")))
);

-- ── Indexes ────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX "email_suppressions_tenantId_email_key" ON "email_suppressions"("tenantId", "email");
CREATE UNIQUE INDEX "email_bounce_receipts_mailboxId_dsnKey_recipient_key"
    ON "email_bounce_receipts"("mailboxId", "dsnKey", "recipient");
CREATE INDEX "email_bounce_receipts_tenantId_recipient_receivedAt_idx"
    ON "email_bounce_receipts"("tenantId", "recipient", "receivedAt");

-- ── Foreign keys ───────────────────────────────────────────────────────────
ALTER TABLE "email_suppressions" ADD CONSTRAINT "email_suppressions_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Composite FK keeps a receipt inside its mailbox's tenant.
ALTER TABLE "email_bounce_receipts" ADD CONSTRAINT "email_bounce_receipts_tenantId_mailboxId_fkey"
    FOREIGN KEY ("tenantId", "mailboxId") REFERENCES "email_mailboxes"("tenantId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Row-level security ─────────────────────────────────────────────────────
ALTER TABLE "email_suppressions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "email_bounce_receipts" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "email_suppressions_tenant_isolation" ON "email_suppressions"
    USING ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "email_bounce_receipts_tenant_isolation" ON "email_bounce_receipts"
    USING ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
