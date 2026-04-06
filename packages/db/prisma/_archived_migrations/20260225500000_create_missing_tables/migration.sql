-- CreateMissingTables migration
-- Idempotent: creates 12 tables + enums missing from init migration.
-- Slots between 20260225000000_add_user_timezone and 20260227000000_add_performance_indexes
-- so all tables exist before schema_audit_remediation (20260227100000) runs.

-- ============================================================
-- Section 1: Enums (idempotent via DO $$ EXCEPTION handler)
-- ============================================================

DO $$ BEGIN
  CREATE TYPE "CRMModule" AS ENUM ('CORE_CRM', 'LEGAL', 'SUPPORT', 'AI_INTELLIGENCE', 'ANALYTICS', 'COMMERCE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AIOutputType" AS ENUM ('LEAD_SCORING', 'SENTIMENT_ANALYSIS', 'AUTO_RESPONSE', 'CHURN_PREDICTION', 'EMAIL_GENERATION', 'NEXT_BEST_ACTION');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'ESCALATED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ReviewDecision" AS ENUM ('APPROVED', 'REJECTED_QUALITY', 'REJECTED_ACCURACY', 'REJECTED_SAFETY', 'ESCALATED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CaseStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'ON_HOLD', 'CLOSED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CasePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CaseTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AutoResponseTrigger" AS ENUM ('EMAIL_RECEIVED', 'FORM_SUBMIT', 'CHAT_MESSAGE', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AutoResponseStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'INVALIDATED', 'SENT', 'FAILED', 'ESCALATED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ActorType is created by init migration, but declare here for self-containment
DO $$ BEGIN
  CREATE TYPE "ActorType" AS ENUM ('USER', 'SYSTEM', 'AI_AGENT', 'API_KEY', 'WEBHOOK');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- Section 2: Tables (all CREATE TABLE IF NOT EXISTS)
-- ============================================================

-- tenant_modules
CREATE TABLE IF NOT EXISTS "tenant_modules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "moduleId" "CRMModule" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "enabledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabledAt" TIMESTAMP(3),

    CONSTRAINT "tenant_modules_pkey" PRIMARY KEY ("id")
);

-- user_mfa_settings
CREATE TABLE IF NOT EXISTS "user_mfa_settings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "totpSecret" TEXT,
    "smsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "smsPhone" TEXT,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "backupCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "backupCodesGeneratedAt" TIMESTAMP(3),
    "enabledAt" TIMESTAMP(3),
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_mfa_settings_pkey" PRIMARY KEY ("id")
);

-- pipeline_stage_configs
CREATE TABLE IF NOT EXISTS "pipeline_stage_configs" (
    "id" TEXT NOT NULL,
    "stageKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "order" INTEGER NOT NULL,
    "probability" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "pipeline_stage_configs_pkey" PRIMARY KEY ("id")
);

-- cases
CREATE TABLE IF NOT EXISTS "cases" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "CaseStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "CasePriority" NOT NULL DEFAULT 'MEDIUM',
    "deadline" TIMESTAMP(3),
    "clientId" TEXT NOT NULL,
    "assignedTo" TEXT NOT NULL,
    "resolution" TEXT,
    "parties" JSONB,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- case_tasks
CREATE TABLE IF NOT EXISTS "case_tasks" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" "CaseTaskStatus" NOT NULL DEFAULT 'PENDING',
    "assignee" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "case_tasks_pkey" PRIMARY KEY ("id")
);

-- ai_output_reviews
CREATE TABLE IF NOT EXISTS "ai_output_reviews" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "outputType" "AIOutputType" NOT NULL,
    "outputPayload" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "slaDeadline" TIMESTAMP(3) NOT NULL,
    "escalationDepth" INTEGER NOT NULL DEFAULT 0,
    "lockedBy" TEXT,
    "lockedAt" TIMESTAMP(3),
    "lockExpiresAt" TIMESTAMP(3),
    "reviewerId" TEXT,
    "reviewDecision" "ReviewDecision",
    "reviewNotes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_output_reviews_pkey" PRIMARY KEY ("id")
);

-- ai_output_review_audit
CREATE TABLE IF NOT EXISTS "ai_output_review_audit" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "actorId" TEXT,
    "actorType" "ActorType" NOT NULL DEFAULT 'USER',
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_output_review_audit_pkey" PRIMARY KEY ("id")
);

-- auto_response_drafts
CREATE TABLE IF NOT EXISTS "auto_response_drafts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "aiConfidence" DOUBLE PRECISION NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "triggerType" "AutoResponseTrigger" NOT NULL,
    "status" "AutoResponseStatus" NOT NULL DEFAULT 'DRAFT',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "statusHistory" JSONB NOT NULL DEFAULT '[]',
    "approvalDecision" JSONB,
    "escalation" JSONB,
    "escalationCount" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "sendError" TEXT,
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auto_response_drafts_pkey" PRIMARY KEY ("id")
);

-- lead_conversion_audit
CREATE TABLE IF NOT EXISTS "lead_conversion_audit" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "accountId" TEXT,
    "tenantId" TEXT NOT NULL,
    "convertedBy" TEXT NOT NULL,
    "conversionSnapshot" JSONB NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_conversion_audit_pkey" PRIMARY KEY ("id")
);

-- zep_episode_usage
CREATE TABLE IF NOT EXISTS "zep_episode_usage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'global',
    "episodesUsed" INTEGER NOT NULL DEFAULT 0,
    "maxEpisodes" INTEGER NOT NULL DEFAULT 1000,
    "warningPercent" INTEGER NOT NULL DEFAULT 80,
    "hardLimitPercent" INTEGER NOT NULL DEFAULT 95,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncSuccess" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "zep_episode_usage_pkey" PRIMARY KEY ("id")
);

-- zep_episode_audit
CREATE TABLE IF NOT EXISTS "zep_episode_audit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'global',
    "previousCount" INTEGER NOT NULL,
    "newCount" INTEGER NOT NULL,
    "delta" INTEGER NOT NULL,
    "operation" TEXT NOT NULL,
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zep_episode_audit_pkey" PRIMARY KEY ("id")
);

-- ============================================================
-- Section 3: Fix chain_version_audits → chain_version_audit name mismatch
-- ============================================================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'chain_version_audits')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'chain_version_audit') THEN
    ALTER TABLE "chain_version_audits" RENAME TO "chain_version_audit";
  END IF;
END $$;

-- Fallback: create chain_version_audit if neither old nor new name exists
CREATE TABLE IF NOT EXISTS "chain_version_audit" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "previousStatus" TEXT,
    "newStatus" TEXT NOT NULL,
    "reason" TEXT,
    "performedBy" TEXT NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "chain_version_audit_pkey" PRIMARY KEY ("id")
);

-- ============================================================
-- Section 4: Column backfill for tables from standalone SQL
-- case.sql creates cases/case_tasks without tenantId and parties
-- ============================================================

ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "parties" JSONB;
ALTER TABLE "case_tasks" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- Backfill tenantId for rows created by standalone case.sql
UPDATE "cases" SET "tenantId" = (SELECT "id" FROM "tenants" LIMIT 1) WHERE "tenantId" IS NULL;
UPDATE "case_tasks" SET "tenantId" = (SELECT "id" FROM "tenants" LIMIT 1) WHERE "tenantId" IS NULL;

-- ============================================================
-- Section 5: Indexes (CREATE INDEX IF NOT EXISTS)
-- ============================================================

-- tenant_modules indexes
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_modules_tenantId_moduleId_key" ON "tenant_modules"("tenantId", "moduleId");
CREATE INDEX IF NOT EXISTS "tenant_modules_tenantId_idx" ON "tenant_modules"("tenantId");

-- user_mfa_settings indexes
CREATE UNIQUE INDEX IF NOT EXISTS "user_mfa_settings_userId_key" ON "user_mfa_settings"("userId");
CREATE INDEX IF NOT EXISTS "user_mfa_settings_userId_idx" ON "user_mfa_settings"("userId");
CREATE INDEX IF NOT EXISTS "user_mfa_settings_tenantId_idx" ON "user_mfa_settings"("tenantId");

-- pipeline_stage_configs indexes
CREATE UNIQUE INDEX IF NOT EXISTS "pipeline_stage_configs_tenantId_stageKey_key" ON "pipeline_stage_configs"("tenantId", "stageKey");
CREATE INDEX IF NOT EXISTS "pipeline_stage_configs_tenantId_idx" ON "pipeline_stage_configs"("tenantId");
CREATE INDEX IF NOT EXISTS "pipeline_stage_configs_order_idx" ON "pipeline_stage_configs"("order");

-- cases indexes
CREATE INDEX IF NOT EXISTS "cases_status_idx" ON "cases"("status");
CREATE INDEX IF NOT EXISTS "cases_priority_idx" ON "cases"("priority");
CREATE INDEX IF NOT EXISTS "cases_clientId_idx" ON "cases"("clientId");
CREATE INDEX IF NOT EXISTS "cases_assignedTo_idx" ON "cases"("assignedTo");
CREATE INDEX IF NOT EXISTS "cases_deadline_idx" ON "cases"("deadline");
CREATE INDEX IF NOT EXISTS "cases_status_deadline_idx" ON "cases"("status", "deadline");
CREATE INDEX IF NOT EXISTS "cases_tenantId_idx" ON "cases"("tenantId");

-- case_tasks indexes
CREATE INDEX IF NOT EXISTS "case_tasks_caseId_idx" ON "case_tasks"("caseId");
CREATE INDEX IF NOT EXISTS "case_tasks_status_idx" ON "case_tasks"("status");
CREATE INDEX IF NOT EXISTS "case_tasks_assignee_idx" ON "case_tasks"("assignee");
CREATE INDEX IF NOT EXISTS "case_tasks_dueDate_idx" ON "case_tasks"("dueDate");
CREATE INDEX IF NOT EXISTS "case_tasks_status_dueDate_idx" ON "case_tasks"("status", "dueDate");
CREATE INDEX IF NOT EXISTS "case_tasks_tenantId_idx" ON "case_tasks"("tenantId");

-- ai_output_reviews indexes
CREATE INDEX IF NOT EXISTS "ai_output_reviews_tenantId_idx" ON "ai_output_reviews"("tenantId");
CREATE INDEX IF NOT EXISTS "ai_output_reviews_status_idx" ON "ai_output_reviews"("status");
CREATE INDEX IF NOT EXISTS "ai_output_reviews_outputType_idx" ON "ai_output_reviews"("outputType");
CREATE INDEX IF NOT EXISTS "ai_output_reviews_slaDeadline_idx" ON "ai_output_reviews"("slaDeadline");
CREATE INDEX IF NOT EXISTS "ai_output_reviews_lockedBy_idx" ON "ai_output_reviews"("lockedBy");
CREATE INDEX IF NOT EXISTS "ai_output_reviews_tenantId_status_idx" ON "ai_output_reviews"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "ai_output_reviews_tenantId_slaDeadline_idx" ON "ai_output_reviews"("tenantId", "slaDeadline");

-- ai_output_review_audit indexes
CREATE INDEX IF NOT EXISTS "ai_output_review_audit_reviewId_idx" ON "ai_output_review_audit"("reviewId");
CREATE INDEX IF NOT EXISTS "ai_output_review_audit_actorId_idx" ON "ai_output_review_audit"("actorId");
CREATE INDEX IF NOT EXISTS "ai_output_review_audit_timestamp_idx" ON "ai_output_review_audit"("timestamp");

-- auto_response_drafts indexes
CREATE INDEX IF NOT EXISTS "auto_response_drafts_tenantId_idx" ON "auto_response_drafts"("tenantId");
CREATE INDEX IF NOT EXISTS "auto_response_drafts_leadId_idx" ON "auto_response_drafts"("leadId");
CREATE INDEX IF NOT EXISTS "auto_response_drafts_status_idx" ON "auto_response_drafts"("status");
CREATE INDEX IF NOT EXISTS "auto_response_drafts_triggerType_idx" ON "auto_response_drafts"("triggerType");
CREATE INDEX IF NOT EXISTS "auto_response_drafts_expiresAt_idx" ON "auto_response_drafts"("expiresAt");

-- lead_conversion_audit indexes
CREATE UNIQUE INDEX IF NOT EXISTS "lead_conversion_audit_idempotencyKey_key" ON "lead_conversion_audit"("idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "lead_conversion_audit_leadId_tenantId_key" ON "lead_conversion_audit"("leadId", "tenantId");
CREATE INDEX IF NOT EXISTS "lead_conversion_audit_leadId_idx" ON "lead_conversion_audit"("leadId");
CREATE INDEX IF NOT EXISTS "lead_conversion_audit_tenantId_idx" ON "lead_conversion_audit"("tenantId");
CREATE INDEX IF NOT EXISTS "lead_conversion_audit_idempotencyKey_idx" ON "lead_conversion_audit"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "lead_conversion_audit_createdAt_idx" ON "lead_conversion_audit"("createdAt");
CREATE INDEX IF NOT EXISTS "lead_conversion_audit_contactId_idx" ON "lead_conversion_audit"("contactId");
CREATE INDEX IF NOT EXISTS "lead_conversion_audit_accountId_idx" ON "lead_conversion_audit"("accountId");

-- zep_episode_usage indexes
CREATE UNIQUE INDEX IF NOT EXISTS "zep_episode_usage_tenantId_key" ON "zep_episode_usage"("tenantId");
CREATE INDEX IF NOT EXISTS "zep_episode_usage_episodesUsed_idx" ON "zep_episode_usage"("episodesUsed");

-- zep_episode_audit indexes
CREATE INDEX IF NOT EXISTS "zep_episode_audit_tenantId_createdAt_idx" ON "zep_episode_audit"("tenantId", "createdAt");

-- chain_version_audit indexes
CREATE INDEX IF NOT EXISTS "chain_version_audit_versionId_idx" ON "chain_version_audit"("versionId");
CREATE INDEX IF NOT EXISTS "chain_version_audit_performedAt_idx" ON "chain_version_audit"("performedAt");
CREATE INDEX IF NOT EXISTS "chain_version_audit_versionId_performedAt_idx" ON "chain_version_audit"("versionId", "performedAt");

-- ============================================================
-- Section 6: Foreign Keys (idempotent via DROP IF EXISTS + ADD)
-- ============================================================

-- tenant_modules FK
ALTER TABLE "tenant_modules" DROP CONSTRAINT IF EXISTS "tenant_modules_tenantId_fkey";
ALTER TABLE "tenant_modules" ADD CONSTRAINT "tenant_modules_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- user_mfa_settings FKs
ALTER TABLE "user_mfa_settings" DROP CONSTRAINT IF EXISTS "user_mfa_settings_userId_fkey";
ALTER TABLE "user_mfa_settings" ADD CONSTRAINT "user_mfa_settings_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- pipeline_stage_configs FK
ALTER TABLE "pipeline_stage_configs" DROP CONSTRAINT IF EXISTS "pipeline_stage_configs_tenantId_fkey";
ALTER TABLE "pipeline_stage_configs" ADD CONSTRAINT "pipeline_stage_configs_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- cases FKs
ALTER TABLE "cases" DROP CONSTRAINT IF EXISTS "cases_tenantId_fkey";
ALTER TABLE "cases" ADD CONSTRAINT "cases_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cases" DROP CONSTRAINT IF EXISTS "cases_clientId_fkey";
ALTER TABLE "cases" ADD CONSTRAINT "cases_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cases" DROP CONSTRAINT IF EXISTS "cases_assignedTo_fkey";
ALTER TABLE "cases" ADD CONSTRAINT "cases_assignedTo_fkey"
  FOREIGN KEY ("assignedTo") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- case_tasks FKs
ALTER TABLE "case_tasks" DROP CONSTRAINT IF EXISTS "case_tasks_tenantId_fkey";
ALTER TABLE "case_tasks" ADD CONSTRAINT "case_tasks_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "case_tasks" DROP CONSTRAINT IF EXISTS "case_tasks_caseId_fkey";
ALTER TABLE "case_tasks" ADD CONSTRAINT "case_tasks_caseId_fkey"
  FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "case_tasks" DROP CONSTRAINT IF EXISTS "case_tasks_assignee_fkey";
ALTER TABLE "case_tasks" ADD CONSTRAINT "case_tasks_assignee_fkey"
  FOREIGN KEY ("assignee") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ai_output_reviews FK
ALTER TABLE "ai_output_reviews" DROP CONSTRAINT IF EXISTS "ai_output_reviews_tenantId_fkey";
ALTER TABLE "ai_output_reviews" ADD CONSTRAINT "ai_output_reviews_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ai_output_review_audit FK
ALTER TABLE "ai_output_review_audit" DROP CONSTRAINT IF EXISTS "ai_output_review_audit_reviewId_fkey";
ALTER TABLE "ai_output_review_audit" ADD CONSTRAINT "ai_output_review_audit_reviewId_fkey"
  FOREIGN KEY ("reviewId") REFERENCES "ai_output_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- auto_response_drafts FKs
ALTER TABLE "auto_response_drafts" DROP CONSTRAINT IF EXISTS "auto_response_drafts_tenantId_fkey";
ALTER TABLE "auto_response_drafts" ADD CONSTRAINT "auto_response_drafts_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "auto_response_drafts" DROP CONSTRAINT IF EXISTS "auto_response_drafts_leadId_fkey";
ALTER TABLE "auto_response_drafts" ADD CONSTRAINT "auto_response_drafts_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- lead_conversion_audit FK
ALTER TABLE "lead_conversion_audit" DROP CONSTRAINT IF EXISTS "lead_conversion_audit_tenantId_fkey";
ALTER TABLE "lead_conversion_audit" ADD CONSTRAINT "lead_conversion_audit_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- chain_version_audit FK
ALTER TABLE "chain_version_audit" DROP CONSTRAINT IF EXISTS "chain_version_audit_versionId_fkey";
ALTER TABLE "chain_version_audit" ADD CONSTRAINT "chain_version_audit_versionId_fkey"
  FOREIGN KEY ("versionId") REFERENCES "chain_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
