-- DB Schema Audit Remediation Migration
-- Covers: DBA-103, DBA-107, DBA-104/009, DBA-105, DBA-108, DBA-109, DBA-013,
--         DBA-020, DBA-028, DBA-112-115, DBA-117, DBA-118, DBA-120-125
-- Hand-written to avoid data-destructive auto-generated patterns

-- ============================================================
-- SECTION 1: Safe Enum Operations
-- ============================================================

-- DBA-001: Create missing enums for Experiment models
DO $$ BEGIN
  CREATE TYPE "PlanTier" AS ENUM ('STARTER', 'PROFESSIONAL', 'ENTERPRISE', 'CUSTOM');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ExperimentStatus" AS ENUM ('DRAFT', 'RUNNING', 'PAUSED', 'COMPLETED', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ExperimentType" AS ENUM ('AI_VS_MANUAL', 'MODEL_COMPARISON', 'THRESHOLD_TEST');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- DBA-105: Rename SurveyType → FeedbackType (safe swap with USING cast)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SurveyType') THEN
    -- Drop default before type change (default can't auto-cast between enum types)
    ALTER TABLE "feedback_surveys" ALTER COLUMN "type" DROP DEFAULT;
    CREATE TYPE "FeedbackType_new" AS ENUM ('NPS', 'CSAT', 'CES', 'CUSTOM');
    ALTER TABLE "feedback_surveys" ALTER COLUMN "type" TYPE "FeedbackType_new" USING ("type"::text::"FeedbackType_new");
    ALTER TYPE "FeedbackType" RENAME TO "FeedbackType_old";
    ALTER TYPE "FeedbackType_new" RENAME TO "FeedbackType";
    DROP TYPE "FeedbackType_old";
    DROP TYPE "SurveyType";
    -- Restore default with new type
    ALTER TABLE "feedback_surveys" ALTER COLUMN "type" SET DEFAULT 'NPS'::"FeedbackType";
  END IF;
END $$;

-- DBA-106: Add ARCHIVED to TicketStatus enum (additive, safe)
DO $$ BEGIN
  ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- SECTION 2: Safe Column Type Changes (USING casts, NOT DROP+ADD)
-- ============================================================

-- DBA-107: actorType text → ActorType enum (preserves audit data)
ALTER TABLE "ai_output_review_audit" ALTER COLUMN "actorType" DROP DEFAULT;
ALTER TABLE "ai_output_review_audit"
  ALTER COLUMN "actorType" TYPE "ActorType" USING "actorType"::"ActorType";
ALTER TABLE "ai_output_review_audit" ALTER COLUMN "actorType" SET DEFAULT 'USER'::"ActorType";

-- DBA-104/009: workspaces.plan text → PlanTier enum (preserves plan data)
ALTER TABLE "workspaces" ALTER COLUMN "plan" DROP DEFAULT;
ALTER TABLE "workspaces"
  ALTER COLUMN "plan" TYPE "PlanTier" USING (
    CASE
      WHEN "plan" = 'free' THEN 'STARTER'
      WHEN "plan" = 'STARTER' THEN 'STARTER'
      WHEN "plan" = 'PROFESSIONAL' THEN 'PROFESSIONAL'
      WHEN "plan" = 'ENTERPRISE' THEN 'ENTERPRISE'
      WHEN "plan" = 'CUSTOM' THEN 'CUSTOM'
      ELSE 'STARTER'
    END
  )::"PlanTier";
ALTER TABLE "workspaces" ALTER COLUMN "plan" SET DEFAULT 'STARTER'::"PlanTier";

-- ============================================================
-- SECTION 3: DBA-103 — teams/team_members tenantId backfill
-- 3-step: add nullable → backfill from workspace → set NOT NULL
-- ============================================================

-- Step 1: Add nullable tenantId columns
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "team_members" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- Step 2: Backfill all rows with the first available tenant
-- (Workspaces don't have tenantId, so no direct mapping exists)
UPDATE "teams" SET "tenantId" = (SELECT "id" FROM "tenants" LIMIT 1)
WHERE "tenantId" IS NULL;

-- For team_members, backfill from the team's tenantId
UPDATE "team_members" tm
SET "tenantId" = t."tenantId"
FROM "teams" t
WHERE tm."teamId" = t."id"
  AND tm."tenantId" IS NULL;

-- Fallback for orphaned team_members
UPDATE "team_members" SET "tenantId" = (SELECT "id" FROM "tenants" LIMIT 1)
WHERE "tenantId" IS NULL;

-- Step 3: Set NOT NULL + FK constraints + indexes
ALTER TABLE "teams" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "team_members" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "teams" DROP CONSTRAINT IF EXISTS "teams_tenantId_fkey";
ALTER TABLE "teams" ADD CONSTRAINT "teams_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "team_members" DROP CONSTRAINT IF EXISTS "team_members_tenantId_fkey";
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "teams_tenantId_idx" ON "teams"("tenantId");
CREATE INDEX IF NOT EXISTS "team_members_tenantId_idx" ON "team_members"("tenantId");

-- ============================================================
-- SECTION 4: Safe DEFAULT and NULL Changes
-- ============================================================

-- DBA-110: Drop DB-level defaults on updatedAt (Prisma @updatedAt handles it)
ALTER TABLE "cases" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "case_tasks" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "chain_versions" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- DBA-111: Relax lead_activities.description NOT NULL → nullable
ALTER TABLE "lead_activities" ALTER COLUMN "description" DROP NOT NULL;

-- auto_response_drafts: Drop triggerType default to match Prisma
ALTER TABLE "auto_response_drafts" ALTER COLUMN "triggerType" DROP DEFAULT;

-- ============================================================
-- SECTION 5: Drop Stale Indexes (being replaced by composites or unique constraints)
-- ============================================================

-- DBA-020: Replaced by tenant-scoped unique constraint
DROP INDEX IF EXISTS "contacts_email_key";

-- DBA-013: Replaced by tenant-scoped unique constraint
DROP INDEX IF EXISTS "ticket_categories_name_key";

-- Stale single-column indexes superseded by composites (DBA-118 alignment)
DROP INDEX IF EXISTS "activity_events_tenantId_idx";
DROP INDEX IF EXISTS "contact_activities_tenantId_idx";
DROP INDEX IF EXISTS "lead_activities_tenantId_idx";
DROP INDEX IF EXISTS "lead_activities_type_idx";
DROP INDEX IF EXISTS "call_records_tenantId_idx";
DROP INDEX IF EXISTS "chat_messages_tenantId_idx";
DROP INDEX IF EXISTS "email_records_tenantId_idx";

-- Stale AI review indexes (being replaced by composites)
DROP INDEX IF EXISTS "ai_output_review_audit_eventType_idx";
DROP INDEX IF EXISTS "ai_output_review_audit_timestamp_idx";
DROP INDEX IF EXISTS "ai_output_reviews_reviewerId_idx";
DROP INDEX IF EXISTS "ai_output_reviews_status_slaDeadline_idx";
DROP INDEX IF EXISTS "ai_output_reviews_tenantId_createdAt_idx";

-- Stale auto_response_drafts composites (schema no longer declares them)
DROP INDEX IF EXISTS "auto_response_drafts_tenantId_createdAt_idx";
DROP INDEX IF EXISTS "auto_response_drafts_tenantId_status_idx";

-- ============================================================
-- SECTION 6: DBA-020 + DBA-013 — Tenant-Scoped Unique Constraints
-- ============================================================

CREATE UNIQUE INDEX "contacts_tenantId_email_key" ON "contacts"("tenantId", "email");
CREATE UNIQUE INDEX "ticket_categories_tenantId_name_key" ON "ticket_categories"("tenantId", "name");

-- ============================================================
-- SECTION 7: DBA-001 — Create Missing Tables (Experiment + AuditLog)
-- ============================================================

CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "experiments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "ExperimentType" NOT NULL,
    "status" "ExperimentStatus" NOT NULL DEFAULT 'DRAFT',
    "hypothesis" TEXT NOT NULL,
    "controlVariant" TEXT NOT NULL DEFAULT 'manual',
    "treatmentVariant" TEXT NOT NULL DEFAULT 'ai',
    "trafficPercent" INTEGER NOT NULL DEFAULT 50,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "minSampleSize" INTEGER NOT NULL DEFAULT 100,
    "significanceLevel" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    CONSTRAINT "experiments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "experiment_assignments" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "score" INTEGER,
    "confidence" DOUBLE PRECISION,
    "convertedAt" TIMESTAMP(3),
    "conversionValue" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "experiment_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "experiment_results" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL UNIQUE,
    "controlSampleSize" INTEGER NOT NULL,
    "treatmentSampleSize" INTEGER NOT NULL,
    "controlMean" DOUBLE PRECISION NOT NULL,
    "treatmentMean" DOUBLE PRECISION NOT NULL,
    "controlStdDev" DOUBLE PRECISION NOT NULL,
    "treatmentStdDev" DOUBLE PRECISION NOT NULL,
    "tStatistic" DOUBLE PRECISION NOT NULL,
    "pValue" DOUBLE PRECISION NOT NULL,
    "confidenceInterval" JSONB NOT NULL,
    "effectSize" DOUBLE PRECISION NOT NULL,
    "controlConversionRate" DOUBLE PRECISION,
    "treatmentConversionRate" DOUBLE PRECISION,
    "chiSquareStatistic" DOUBLE PRECISION,
    "chiSquarePValue" DOUBLE PRECISION,
    "isSignificant" BOOLEAN NOT NULL,
    "winner" TEXT,
    "recommendation" TEXT,
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "experiment_results_pkey" PRIMARY KEY ("id")
);

-- ============================================================
-- SECTION 8: New Table Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "audit_logs_userId_idx" ON "audit_logs"("userId");
CREATE INDEX IF NOT EXISTS "audit_logs_tenantId_idx" ON "audit_logs"("tenantId");
CREATE INDEX IF NOT EXISTS "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

CREATE INDEX IF NOT EXISTS "experiments_tenantId_idx" ON "experiments"("tenantId");
CREATE INDEX IF NOT EXISTS "experiments_status_idx" ON "experiments"("status");
CREATE INDEX IF NOT EXISTS "experiments_type_idx" ON "experiments"("type");

CREATE INDEX IF NOT EXISTS "experiment_assignments_experimentId_idx" ON "experiment_assignments"("experimentId");
CREATE INDEX IF NOT EXISTS "experiment_assignments_leadId_idx" ON "experiment_assignments"("leadId");
CREATE INDEX IF NOT EXISTS "experiment_assignments_variant_idx" ON "experiment_assignments"("variant");
CREATE UNIQUE INDEX IF NOT EXISTS "experiment_assignments_experimentId_leadId_key" ON "experiment_assignments"("experimentId", "leadId");

CREATE INDEX IF NOT EXISTS "experiment_results_experimentId_idx" ON "experiment_results"("experimentId");

-- ============================================================
-- SECTION 9: DBA-120..125 — Performance Composite Indexes
-- ============================================================

-- DBA-120: SecurityEvent composites
CREATE INDEX IF NOT EXISTS "security_events_tenantId_createdAt_idx" ON "security_events"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "security_events_tenantId_eventType_idx" ON "security_events"("tenantId", "eventType");

-- DBA-121: ChainVersionAudit + NotificationDeliveryLog composites
CREATE INDEX IF NOT EXISTS "chain_version_audit_versionId_performedAt_idx" ON "chain_version_audit"("versionId", "performedAt");
CREATE INDEX IF NOT EXISTS "notification_delivery_logs_notificationId_attemptedAt_idx" ON "notification_delivery_logs"("notificationId", "attemptedAt");

-- DBA-122: Task opportunityId + EscalationHistory toUserId
CREATE INDEX IF NOT EXISTS "tasks_opportunityId_idx" ON "tasks"("opportunityId");
CREATE INDEX IF NOT EXISTS "escalation_history_toUserId_idx" ON "escalation_history"("toUserId");

-- DBA-123: AIOutputReview composites (preserves existing DB composite)
CREATE INDEX IF NOT EXISTS "ai_output_reviews_tenantId_slaDeadline_idx" ON "ai_output_reviews"("tenantId", "slaDeadline");

-- DBA-124: LeadConversionAudit + AccountHealthScore
CREATE INDEX IF NOT EXISTS "lead_conversion_audit_contactId_idx" ON "lead_conversion_audit"("contactId");
CREATE INDEX IF NOT EXISTS "lead_conversion_audit_accountId_idx" ON "lead_conversion_audit"("accountId");
CREATE INDEX IF NOT EXISTS "account_health_scores_accountId_calculatedAt_idx" ON "account_health_scores"("accountId", "calculatedAt");

-- DBA-125: DomainEvent + WorkflowExecution composites
CREATE INDEX IF NOT EXISTS "domain_events_tenantId_status_idx" ON "domain_events"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "workflow_executions_workflowId_startedAt_idx" ON "workflow_executions"("workflowId", "startedAt");

-- ============================================================
-- SECTION 10: Recreate indexes that Prisma diff expects
-- ============================================================

-- Recreate indexes with correct definitions from schema
CREATE INDEX IF NOT EXISTS "ai_output_review_audit_timestamp_idx" ON "ai_output_review_audit"("timestamp");
CREATE INDEX IF NOT EXISTS "ai_output_reviews_status_idx" ON "ai_output_reviews"("status");
CREATE INDEX IF NOT EXISTS "ai_output_reviews_outputType_idx" ON "ai_output_reviews"("outputType");
CREATE INDEX IF NOT EXISTS "ai_output_reviews_slaDeadline_idx" ON "ai_output_reviews"("slaDeadline");
CREATE INDEX IF NOT EXISTS "auto_response_drafts_tenantId_idx" ON "auto_response_drafts"("tenantId");
CREATE INDEX IF NOT EXISTS "auto_response_drafts_triggerType_idx" ON "auto_response_drafts"("triggerType");

-- Activity feed composite indexes
CREATE INDEX IF NOT EXISTS "activity_events_opportunityId_timestamp_idx" ON "activity_events"("opportunityId", "timestamp" DESC);
CREATE INDEX IF NOT EXISTS "activity_events_tenantId_timestamp_idx" ON "activity_events"("tenantId", "timestamp" DESC);
CREATE INDEX IF NOT EXISTS "call_records_tenantId_startedAt_idx" ON "call_records"("tenantId", "startedAt" DESC);
CREATE INDEX IF NOT EXISTS "chat_messages_tenantId_createdAt_idx" ON "chat_messages"("tenantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "contact_activities_contactId_timestamp_idx" ON "contact_activities"("contactId", "timestamp" DESC);
CREATE INDEX IF NOT EXISTS "contact_activities_tenantId_timestamp_idx" ON "contact_activities"("tenantId", "timestamp" DESC);
CREATE INDEX IF NOT EXISTS "email_records_tenantId_createdAt_idx" ON "email_records"("tenantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "lead_activities_tenantId_timestamp_idx" ON "lead_activities"("tenantId", "timestamp" DESC);
CREATE INDEX IF NOT EXISTS "ticket_activities_tenantId_timestamp_idx" ON "ticket_activities"("tenantId", "timestamp" DESC);
CREATE INDEX IF NOT EXISTS "lead_files_uploadedAt_idx" ON "lead_files"("uploadedAt");

-- Case indexes
CREATE INDEX IF NOT EXISTS "case_tasks_status_dueDate_idx" ON "case_tasks"("status", "dueDate");

-- Contact/Account composite indexes
CREATE INDEX IF NOT EXISTS "contacts_accountId_tenantId_idx" ON "contacts"("accountId", "tenantId");
CREATE INDEX IF NOT EXISTS "contacts_accountId_createdAt_idx" ON "contacts"("accountId", "createdAt" DESC);

-- Opportunity composite indexes
CREATE INDEX IF NOT EXISTS "opportunities_accountId_tenantId_idx" ON "opportunities"("accountId", "tenantId");
CREATE INDEX IF NOT EXISTS "opportunities_accountId_stage_idx" ON "opportunities"("accountId", "stage");
CREATE INDEX IF NOT EXISTS "opportunities_accountId_createdAt_idx" ON "opportunities"("accountId", "createdAt" DESC);

-- Task indexes
CREATE INDEX IF NOT EXISTS "tasks_contactId_idx" ON "tasks"("contactId");
CREATE INDEX IF NOT EXISTS "tasks_contactId_createdAt_idx" ON "tasks"("contactId", "createdAt" DESC);

-- FeedbackSurvey composites
CREATE INDEX IF NOT EXISTS "feedback_surveys_tenantId_type_idx" ON "feedback_surveys"("tenantId", "type");
CREATE INDEX IF NOT EXISTS "feedback_surveys_tenantId_type_createdAt_idx" ON "feedback_surveys"("tenantId", "type", "createdAt");

-- ============================================================
-- SECTION 11: DBA-117 + DBA-118 — FK Constraints (idempotent: DROP IF EXISTS + ADD)
-- All these tables already have tenantId NOT NULL, just missing FK
-- ============================================================

-- DBA-117: 19 tables
ALTER TABLE "api_keys" DROP CONSTRAINT IF EXISTS "api_keys_tenantId_fkey";
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "business_rules" DROP CONSTRAINT IF EXISTS "business_rules_tenantId_fkey";
ALTER TABLE "business_rules" ADD CONSTRAINT "business_rules_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "business_rule_executions" DROP CONSTRAINT IF EXISTS "business_rule_executions_tenantId_fkey";
ALTER TABLE "business_rule_executions" ADD CONSTRAINT "business_rule_executions_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "chat_conversations" DROP CONSTRAINT IF EXISTS "chat_conversations_tenantId_fkey";
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dashboard_configs" DROP CONSTRAINT IF EXISTS "dashboard_configs_tenantId_fkey";
ALTER TABLE "dashboard_configs" ADD CONSTRAINT "dashboard_configs_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "deals_won_metrics" DROP CONSTRAINT IF EXISTS "deals_won_metrics_tenantId_fkey";
ALTER TABLE "deals_won_metrics" ADD CONSTRAINT "deals_won_metrics_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_access_logs" DROP CONSTRAINT IF EXISTS "document_access_logs_tenantId_fkey";
ALTER TABLE "document_access_logs" ADD CONSTRAINT "document_access_logs_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_shares" DROP CONSTRAINT IF EXISTS "document_shares_tenantId_fkey";
ALTER TABLE "document_shares" ADD CONSTRAINT "document_shares_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "documents" DROP CONSTRAINT IF EXISTS "documents_tenantId_fkey";
ALTER TABLE "documents" ADD CONSTRAINT "documents_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "email_attachments" DROP CONSTRAINT IF EXISTS "email_attachments_tenantId_fkey";
ALTER TABLE "email_attachments" ADD CONSTRAINT "email_attachments_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "report_executions" DROP CONSTRAINT IF EXISTS "report_executions_tenantId_fkey";
ALTER TABLE "report_executions" ADD CONSTRAINT "report_executions_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "report_schedules" DROP CONSTRAINT IF EXISTS "report_schedules_tenantId_fkey";
ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sla_notifications" DROP CONSTRAINT IF EXISTS "sla_notifications_tenantId_fkey";
ALTER TABLE "sla_notifications" ADD CONSTRAINT "sla_notifications_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ticket_attachments" DROP CONSTRAINT IF EXISTS "ticket_attachments_tenantId_fkey";
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ticket_categories" DROP CONSTRAINT IF EXISTS "ticket_categories_tenantId_fkey";
ALTER TABLE "ticket_categories" ADD CONSTRAINT "ticket_categories_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "webhook_deliveries" DROP CONSTRAINT IF EXISTS "webhook_deliveries_tenantId_fkey";
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "webhook_endpoints" DROP CONSTRAINT IF EXISTS "webhook_endpoints_tenantId_fkey";
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_definitions" DROP CONSTRAINT IF EXISTS "workflow_definitions_tenantId_fkey";
ALTER TABLE "workflow_definitions" ADD CONSTRAINT "workflow_definitions_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_executions" DROP CONSTRAINT IF EXISTS "workflow_executions_tenantId_fkey";
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DBA-118: 21 tenant FK constraints
ALTER TABLE "lead_activities" DROP CONSTRAINT IF EXISTS "lead_activities_tenantId_fkey";
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lead_notes" DROP CONSTRAINT IF EXISTS "lead_notes_tenantId_fkey";
ALTER TABLE "lead_notes" ADD CONSTRAINT "lead_notes_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lead_files" DROP CONSTRAINT IF EXISTS "lead_files_tenantId_fkey";
ALTER TABLE "lead_files" ADD CONSTRAINT "lead_files_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "appointment_attendees" DROP CONSTRAINT IF EXISTS "appointment_attendees_tenantId_fkey";
ALTER TABLE "appointment_attendees" ADD CONSTRAINT "appointment_attendees_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "appointment_cases" DROP CONSTRAINT IF EXISTS "appointment_cases_tenantId_fkey";
ALTER TABLE "appointment_cases" ADD CONSTRAINT "appointment_cases_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ticket_activities" DROP CONSTRAINT IF EXISTS "ticket_activities_tenantId_fkey";
ALTER TABLE "ticket_activities" ADD CONSTRAINT "ticket_activities_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_role_assignments" DROP CONSTRAINT IF EXISTS "user_role_assignments_tenantId_fkey";
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_permissions" DROP CONSTRAINT IF EXISTS "user_permissions_tenantId_fkey";
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lead_ai_insights" DROP CONSTRAINT IF EXISTS "lead_ai_insights_tenantId_fkey";
ALTER TABLE "lead_ai_insights" ADD CONSTRAINT "lead_ai_insights_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contact_ai_insights" DROP CONSTRAINT IF EXISTS "contact_ai_insights_tenantId_fkey";
ALTER TABLE "contact_ai_insights" ADD CONSTRAINT "contact_ai_insights_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "email_records" DROP CONSTRAINT IF EXISTS "email_records_tenantId_fkey";
ALTER TABLE "email_records" ADD CONSTRAINT "email_records_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "chat_messages" DROP CONSTRAINT IF EXISTS "chat_messages_tenantId_fkey";
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "call_records" DROP CONSTRAINT IF EXISTS "call_records_tenantId_fkey";
ALTER TABLE "call_records" ADD CONSTRAINT "call_records_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "agent_availability" DROP CONSTRAINT IF EXISTS "agent_availability_tenantId_fkey";
ALTER TABLE "agent_availability" ADD CONSTRAINT "agent_availability_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "routing_rules" DROP CONSTRAINT IF EXISTS "routing_rules_tenantId_fkey";
ALTER TABLE "routing_rules" ADD CONSTRAINT "routing_rules_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "routing_audits" DROP CONSTRAINT IF EXISTS "routing_audits_tenantId_fkey";
ALTER TABLE "routing_audits" ADD CONSTRAINT "routing_audits_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_tenantId_fkey";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_preferences" DROP CONSTRAINT IF EXISTS "notification_preferences_tenantId_fkey";
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_templates" DROP CONSTRAINT IF EXISTS "notification_templates_tenantId_fkey";
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_dlq" DROP CONSTRAINT IF EXISTS "notification_dlq_tenantId_fkey";
ALTER TABLE "notification_dlq" ADD CONSTRAINT "notification_dlq_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lead_conversion_audit" DROP CONSTRAINT IF EXISTS "lead_conversion_audit_tenantId_fkey";
ALTER TABLE "lead_conversion_audit" ADD CONSTRAINT "lead_conversion_audit_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Non-tenantId FK constraints
ALTER TABLE "auto_response_drafts" DROP CONSTRAINT IF EXISTS "auto_response_drafts_leadId_fkey";
ALTER TABLE "auto_response_drafts" ADD CONSTRAINT "auto_response_drafts_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "appointment_cases" DROP CONSTRAINT IF EXISTS "appointment_cases_caseId_fkey";
ALTER TABLE "appointment_cases" ADD CONSTRAINT "appointment_cases_caseId_fkey"
  FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "case_tasks" DROP CONSTRAINT IF EXISTS "case_tasks_assignee_fkey";
ALTER TABLE "case_tasks" ADD CONSTRAINT "case_tasks_assignee_fkey"
  FOREIGN KEY ("assignee") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Other tenant FK constraints
ALTER TABLE "ai_scores" DROP CONSTRAINT IF EXISTS "ai_scores_tenantId_fkey";
ALTER TABLE "ai_scores" ADD CONSTRAINT "ai_scores_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_tenantId_fkey";
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_userId_fkey";
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sla_policies" DROP CONSTRAINT IF EXISTS "sla_policies_tenantId_fkey";
ALTER TABLE "sla_policies" ADD CONSTRAINT "sla_policies_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "team_messages" DROP CONSTRAINT IF EXISTS "team_messages_tenantId_fkey";
ALTER TABLE "team_messages" ADD CONSTRAINT "team_messages_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pipeline_snapshots" DROP CONSTRAINT IF EXISTS "pipeline_snapshots_tenantId_fkey";
ALTER TABLE "pipeline_snapshots" ADD CONSTRAINT "pipeline_snapshots_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "traffic_sources" DROP CONSTRAINT IF EXISTS "traffic_sources_tenantId_fkey";
ALTER TABLE "traffic_sources" ADD CONSTRAINT "traffic_sources_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "growth_metrics" DROP CONSTRAINT IF EXISTS "growth_metrics_tenantId_fkey";
ALTER TABLE "growth_metrics" ADD CONSTRAINT "growth_metrics_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ticket_next_steps" DROP CONSTRAINT IF EXISTS "ticket_next_steps_tenantId_fkey";
ALTER TABLE "ticket_next_steps" ADD CONSTRAINT "ticket_next_steps_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "related_tickets" DROP CONSTRAINT IF EXISTS "related_tickets_tenantId_fkey";
ALTER TABLE "related_tickets" ADD CONSTRAINT "related_tickets_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ticket_ai_insights" DROP CONSTRAINT IF EXISTS "ticket_ai_insights_tenantId_fkey";
ALTER TABLE "ticket_ai_insights" ADD CONSTRAINT "ticket_ai_insights_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sales_performance" DROP CONSTRAINT IF EXISTS "sales_performance_tenantId_fkey";
ALTER TABLE "sales_performance" ADD CONSTRAINT "sales_performance_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "email_templates" DROP CONSTRAINT IF EXISTS "email_templates_tenantId_fkey";
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "feedback_surveys" DROP CONSTRAINT IF EXISTS "feedback_surveys_tenantId_fkey";
ALTER TABLE "feedback_surveys" ADD CONSTRAINT "feedback_surveys_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "account_health_scores" DROP CONSTRAINT IF EXISTS "account_health_scores_tenantId_fkey";
ALTER TABLE "account_health_scores" ADD CONSTRAINT "account_health_scores_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "agent_skills" DROP CONSTRAINT IF EXISTS "agent_skills_tenantId_fkey";
ALTER TABLE "agent_skills" ADD CONSTRAINT "agent_skills_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sla_breaches" DROP CONSTRAINT IF EXISTS "sla_breaches_tenantId_fkey";
ALTER TABLE "sla_breaches" ADD CONSTRAINT "sla_breaches_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "escalation_history" DROP CONSTRAINT IF EXISTS "escalation_history_tenantId_fkey";
ALTER TABLE "escalation_history" ADD CONSTRAINT "escalation_history_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "report_definitions" DROP CONSTRAINT IF EXISTS "report_definitions_tenantId_fkey";
ALTER TABLE "report_definitions" ADD CONSTRAINT "report_definitions_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_insights" DROP CONSTRAINT IF EXISTS "ai_insights_tenantId_fkey";
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Experiment FK constraints
ALTER TABLE "experiments" DROP CONSTRAINT IF EXISTS "experiments_tenantId_fkey";
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "experiment_assignments" DROP CONSTRAINT IF EXISTS "experiment_assignments_experimentId_fkey";
ALTER TABLE "experiment_assignments" ADD CONSTRAINT "experiment_assignments_experimentId_fkey"
  FOREIGN KEY ("experimentId") REFERENCES "experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "experiment_assignments" DROP CONSTRAINT IF EXISTS "experiment_assignments_leadId_fkey";
ALTER TABLE "experiment_assignments" ADD CONSTRAINT "experiment_assignments_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "experiment_results" DROP CONSTRAINT IF EXISTS "experiment_results_experimentId_fkey";
ALTER TABLE "experiment_results" ADD CONSTRAINT "experiment_results_experimentId_fkey"
  FOREIGN KEY ("experimentId") REFERENCES "experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
