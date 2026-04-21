-- IFC-312: AI chains for contacts + accounts
-- Adds AccountAIInsight + ContactReplyDraft models, Account score/industry
-- provenance scalars, ContactAIInsight provenance scalars, and
-- @@index([score]) on Account. All new columns are nullable (or nullable
-- with safe defaults) to ensure zero-downtime migration on existing rows.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. ContactAIInsight — provenance scalars
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "contact_ai_insights" ADD COLUMN "modelVersion" TEXT;
ALTER TABLE "contact_ai_insights" ADD COLUMN "generatedAt" TIMESTAMP(3);
ALTER TABLE "contact_ai_insights" ADD COLUMN "source" TEXT DEFAULT 'llm';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Account — score + industry-inference provenance scalars
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "accounts" ADD COLUMN "score" INTEGER;
ALTER TABLE "accounts" ADD COLUMN "scoreProvenance" JSONB;
ALTER TABLE "accounts" ADD COLUMN "scoredAt" TIMESTAMP(3);
ALTER TABLE "accounts" ADD COLUMN "scoreModelVersion" TEXT;
ALTER TABLE "accounts" ADD COLUMN "industryInferredAt" TIMESTAMP(3);
ALTER TABLE "accounts" ADD COLUMN "industryModelVersion" TEXT;

CREATE INDEX "accounts_score_idx" ON "accounts" ("score");

-- ─────────────────────────────────────────────────────────────────────────
-- 3. AccountAIInsight — new table (one row per account per tenant)
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE "account_ai_insights" (
    "id"              TEXT NOT NULL,
    "accountId"       TEXT NOT NULL,
    "tenantId"        TEXT NOT NULL,
    "healthSummary"   TEXT,
    "nextBestAction"  TEXT,
    "keySignals"      JSONB,
    "churnRisk"       "ChurnRisk" NOT NULL DEFAULT 'LOW',
    "engagementScore" INTEGER NOT NULL,
    "sentimentTrend"  TEXT,
    "recommendations" JSONB,
    "modelVersion"    TEXT NOT NULL,
    "generatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source"          TEXT NOT NULL DEFAULT 'llm',
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_ai_insights_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "account_ai_insights_accountId_key" ON "account_ai_insights" ("accountId");
CREATE INDEX "account_ai_insights_tenantId_idx" ON "account_ai_insights" ("tenantId");
CREATE INDEX "account_ai_insights_churnRisk_idx" ON "account_ai_insights" ("churnRisk");

ALTER TABLE "account_ai_insights"
  ADD CONSTRAINT "account_ai_insights_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "accounts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "account_ai_insights"
  ADD CONSTRAINT "account_ai_insights_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. ContactReplyDraft — new table; status defaults to DRAFT (ADR-037)
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE "contact_reply_drafts" (
    "id"            TEXT NOT NULL,
    "contactId"     TEXT NOT NULL,
    "tenantId"      TEXT NOT NULL,
    "emailThreadId" TEXT,
    "draftSubject"  TEXT NOT NULL,
    "draftBody"     TEXT NOT NULL,
    "tone"          TEXT,
    "status"        TEXT NOT NULL DEFAULT 'DRAFT',
    "confidence"    DOUBLE PRECISION NOT NULL,
    "modelVersion"  TEXT NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    "createdBy"     TEXT,

    CONSTRAINT "contact_reply_drafts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "contact_reply_drafts_contactId_status_idx" ON "contact_reply_drafts" ("contactId", "status");
CREATE INDEX "contact_reply_drafts_tenantId_status_idx" ON "contact_reply_drafts" ("tenantId", "status");

ALTER TABLE "contact_reply_drafts"
  ADD CONSTRAINT "contact_reply_drafts_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "contacts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contact_reply_drafts"
  ADD CONSTRAINT "contact_reply_drafts_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
