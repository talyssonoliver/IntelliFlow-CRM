-- Customer feedback surveys that can be sent and answered (MVP-012).
--
-- Class A (ADR-069 / docs/operations/agent-autonomy-policy.md): additive only. Seven columns are added
-- to "feedback_surveys" (six nullable, one with a constant default) and one NEW table
-- "feedback_survey_settings" is created. No row is read, rewritten or deleted, no existing column,
-- constraint or RLS policy is touched.
--   "tokenHash":       SHA-256 hex of the single-use answer link token (the token itself is never stored).
--   "tokenExpiresAt":  the link stops working at this time.
--   "tokenUsedAt":     set once, atomically, when the answer is stored.
--   "accountId":       the account the survey is about (no foreign key, like "contactId").
--   "trigger":         what queued it: MANUAL, DEAL_WON or TICKET_RESOLVED (existing rows: MANUAL).
--   "sentById":        the user who sent a MANUAL survey.
-- The unique index on "tokenHash" is built on a column that is NULL in every existing row, on a table
-- the analytics page has never been able to fill, so it is instant. The composite index serves the
-- "one survey per contact per 30 days" check.
-- "feedback_survey_settings": one row per tenant for the two automatic-survey switches. No row means
-- both ON (owner rule: defaults on), so no backfill is needed.
--
-- Recovery plan: forward-only; unset columns and an empty table change nothing. A down-migration
-- (DROP COLUMN / DROP TABLE) is Class C, human-only, never autonomous. Production applies only through
-- the gated `prisma migrate deploy` workflow, after the owner's yes.

-- AlterTable
ALTER TABLE "feedback_surveys"
  ADD COLUMN "tokenHash" TEXT,
  ADD COLUMN "tokenExpiresAt" TIMESTAMP(3),
  ADD COLUMN "tokenUsedAt" TIMESTAMP(3),
  ADD COLUMN "accountId" TEXT,
  ADD COLUMN "trigger" TEXT NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "sentById" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "feedback_surveys_tokenHash_key" ON "feedback_surveys"("tokenHash");

-- CreateIndex
CREATE INDEX "feedback_surveys_tenantId_contactId_createdAt_idx" ON "feedback_surveys"("tenantId", "contactId", "createdAt");

-- CreateTable
CREATE TABLE "feedback_survey_settings" (
    "id" TEXT NOT NULL,
    "autoSendOnDealWon" BOOLEAN NOT NULL DEFAULT true,
    "autoSendOnTicketResolved" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "feedback_survey_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "feedback_survey_settings_tenantId_key" ON "feedback_survey_settings"("tenantId");

-- AddForeignKey
ALTER TABLE "feedback_survey_settings" ADD CONSTRAINT "feedback_survey_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Tenant isolation, same shape as "feedback_surveys" and the other settings tables.
ALTER TABLE "feedback_survey_settings" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_feedback_survey_settings ON "feedback_survey_settings"
  FOR ALL USING ("tenantId" = get_current_tenant_id());
