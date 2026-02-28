-- DB Schema Audit — Batch 3 Final Remediation
-- Migration: 20260228100000_schema_audit_batch3
-- Resolves: DBA-012, DBA-014, DBA-017, DBA-018, DBA-021, DBA-023, DBA-024,
--           DBA-025, DBA-027, DBA-029, DBA-031, DBA-032
-- Documentation-only: DBA-015, DBA-016, DBA-026 (no SQL needed)

-- ============================================================
-- SECTION 1: Create enums (DBA-024, DBA-029) — idempotent
-- ============================================================

DO $$ BEGIN
  CREATE TYPE "ConversationStatus" AS ENUM ('ACTIVE', 'IDLE', 'PENDING', 'RUNNING', 'SUCCESS', 'ERROR', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ToolCallStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'ERROR', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ReportExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- SecurityEventType and EventOutcome already exist (created in batch 2)
-- but SecurityEvent.eventType was String — now we wire it

-- ============================================================
-- SECTION 2: ALTER status columns → enums (DBA-024)
-- ============================================================

-- ConversationRecord.status: String → ConversationStatus
-- Must drop default before type change, then re-add with enum cast
ALTER TABLE "conversation_records" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "conversation_records"
  ALTER COLUMN "status" TYPE "ConversationStatus"
  USING "status"::"ConversationStatus";
ALTER TABLE "conversation_records" ALTER COLUMN "status" SET DEFAULT 'ACTIVE'::"ConversationStatus";

-- ToolCallRecord.status: String → ToolCallStatus
ALTER TABLE "tool_call_records" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "tool_call_records"
  ALTER COLUMN "status" TYPE "ToolCallStatus"
  USING "status"::"ToolCallStatus";
ALTER TABLE "tool_call_records" ALTER COLUMN "status" SET DEFAULT 'PENDING'::"ToolCallStatus";

-- ToolCallRecord.approvalStatus: String → ApprovalStatus (nullable, no default)
ALTER TABLE "tool_call_records"
  ALTER COLUMN "approvalStatus" TYPE "ApprovalStatus"
  USING "approvalStatus"::"ApprovalStatus";

-- ReportExecution.status: String → ReportExecutionStatus
ALTER TABLE "report_executions" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "report_executions"
  ALTER COLUMN "status" TYPE "ReportExecutionStatus"
  USING "status"::"ReportExecutionStatus";

-- ============================================================
-- SECTION 3: ALTER sentiment columns → Sentiment enum (DBA-025)
-- Case-normalize before casting: 'positive'→'POSITIVE', etc.
-- ============================================================

-- LeadAIInsight.sentiment (nullable)
UPDATE "lead_ai_insights" SET "sentiment" = UPPER("sentiment") WHERE "sentiment" IS NOT NULL AND "sentiment" != UPPER("sentiment");
ALTER TABLE "lead_ai_insights"
  ALTER COLUMN "sentiment" TYPE "Sentiment"
  USING "sentiment"::"Sentiment";

-- ContactAIInsight.sentiment (nullable)
UPDATE "contact_ai_insights" SET "sentiment" = UPPER("sentiment") WHERE "sentiment" IS NOT NULL AND "sentiment" != UPPER("sentiment");
ALTER TABLE "contact_ai_insights"
  ALTER COLUMN "sentiment" TYPE "Sentiment"
  USING "sentiment"::"Sentiment";

-- TicketAIInsight.sentiment (NOT NULL)
UPDATE "ticket_ai_insights" SET "sentiment" = UPPER("sentiment") WHERE "sentiment" != UPPER("sentiment");
ALTER TABLE "ticket_ai_insights"
  ALTER COLUMN "sentiment" TYPE "Sentiment"
  USING "sentiment"::"Sentiment";

-- CallRecord.sentiment (nullable)
UPDATE "call_records" SET "sentiment" = UPPER("sentiment") WHERE "sentiment" IS NOT NULL AND "sentiment" != UPPER("sentiment");
ALTER TABLE "call_records"
  ALTER COLUMN "sentiment" TYPE "Sentiment"
  USING "sentiment"::"Sentiment";

-- FeedbackSurvey.sentiment (nullable)
UPDATE "feedback_surveys" SET "sentiment" = UPPER("sentiment") WHERE "sentiment" IS NOT NULL AND "sentiment" != UPPER("sentiment");
ALTER TABLE "feedback_surveys"
  ALTER COLUMN "sentiment" TYPE "Sentiment"
  USING "sentiment"::"Sentiment";

-- ============================================================
-- SECTION 4: ALTER money columns Int → Decimal(15,2) (DBA-023)
-- Widening cast: integer cents → decimal cents (no data loss)
-- ============================================================

ALTER TABLE "pipeline_snapshots"
  ALTER COLUMN "value" TYPE DECIMAL(15,2)
  USING "value"::DECIMAL(15,2);

ALTER TABLE "sales_performance"
  ALTER COLUMN "revenue" TYPE DECIMAL(15,2)
  USING "revenue"::DECIMAL(15,2);

ALTER TABLE "deal_renewals"
  ALTER COLUMN "value" TYPE DECIMAL(15,2)
  USING "value"::DECIMAL(15,2);

ALTER TABLE "deal_renewals"
  ALTER COLUMN "previousValue" TYPE DECIMAL(15,2)
  USING "previousValue"::DECIMAL(15,2);

-- ============================================================
-- SECTION 5: ALTER IP address columns → VARCHAR(45) (DBA-017)
-- Supports full IPv6-mapped-IPv4 (e.g., ::ffff:192.168.1.1)
-- ============================================================

ALTER TABLE "security_events"
  ALTER COLUMN "actorIp" TYPE VARCHAR(45);

ALTER TABLE "audit_log_entries"
  ALTER COLUMN "ipAddress" TYPE VARCHAR(45);

ALTER TABLE "audit_logs"
  ALTER COLUMN "ipAddress" TYPE VARCHAR(45);

ALTER TABLE "conversation_records"
  ALTER COLUMN "ipAddress" TYPE VARCHAR(45);

ALTER TABLE "case_document_audit"
  ALTER COLUMN "ip_address" TYPE VARCHAR(45);

-- ============================================================
-- SECTION 6: SecurityEvent.eventType String → SecurityEventType (DBA-029)
-- + ADD outcome EventOutcome column
-- ============================================================

-- Map existing string values to enum values
UPDATE "security_events" SET "eventType" = CASE
  WHEN "eventType" = 'login' THEN 'LOGIN_ATTEMPT'
  WHEN "eventType" = 'login_attempt' THEN 'LOGIN_ATTEMPT'
  WHEN "eventType" = 'login_success' THEN 'LOGIN_SUCCESS'
  WHEN "eventType" = 'login_failure' THEN 'LOGIN_FAILURE'
  WHEN "eventType" = 'logout' THEN 'LOGOUT'
  WHEN "eventType" = 'password_change' THEN 'PASSWORD_CHANGE'
  WHEN "eventType" = 'mfa_challenge' THEN 'MFA_CHALLENGE'
  WHEN "eventType" = 'mfa_success' THEN 'MFA_SUCCESS'
  WHEN "eventType" = 'mfa_failure' THEN 'MFA_FAILURE'
  WHEN "eventType" = 'permission_denied' THEN 'PERMISSION_DENIED'
  WHEN "eventType" = 'rate_limit_exceeded' THEN 'RATE_LIMIT_EXCEEDED'
  WHEN "eventType" = 'suspicious_activity' THEN 'SUSPICIOUS_ACTIVITY'
  WHEN "eventType" = 'brute_force_detected' THEN 'BRUTE_FORCE_DETECTED'
  WHEN "eventType" = 'session_hijack_attempt' THEN 'SESSION_HIJACK_ATTEMPT'
  WHEN "eventType" = 'api_key_created' THEN 'API_KEY_CREATED'
  WHEN "eventType" = 'api_key_revoked' THEN 'API_KEY_REVOKED'
  WHEN "eventType" = 'data_export' THEN 'DATA_EXPORT'
  WHEN "eventType" = 'admin_action' THEN 'ADMIN_ACTION'
  WHEN "eventType" = 'role_change' THEN 'ADMIN_ACTION'
  ELSE UPPER(REPLACE("eventType", ' ', '_'))
END
WHERE "eventType" NOT IN (
  'LOGIN_ATTEMPT', 'LOGIN_SUCCESS', 'LOGIN_FAILURE', 'LOGOUT',
  'PASSWORD_CHANGE', 'MFA_CHALLENGE', 'MFA_SUCCESS', 'MFA_FAILURE',
  'PERMISSION_DENIED', 'RATE_LIMIT_EXCEEDED', 'SUSPICIOUS_ACTIVITY',
  'BRUTE_FORCE_DETECTED', 'SESSION_HIJACK_ATTEMPT',
  'API_KEY_CREATED', 'API_KEY_REVOKED', 'DATA_EXPORT', 'ADMIN_ACTION'
);

ALTER TABLE "security_events"
  ALTER COLUMN "eventType" TYPE "SecurityEventType"
  USING "eventType"::"SecurityEventType";

-- Add outcome column
ALTER TABLE "security_events"
  ADD COLUMN IF NOT EXISTS "outcome" "EventOutcome";

-- ============================================================
-- SECTION 7: Rename ZepEpisodeUsage.lastUpdated → updatedAt (DBA-027)
-- ============================================================

ALTER TABLE "zep_episode_usage"
  RENAME COLUMN "lastUpdated" TO "updatedAt";

-- ============================================================
-- SECTION 8: ADD columns to chain_versions (DBA-018, DBA-031)
-- ============================================================

ALTER TABLE "chain_versions"
  ADD COLUMN IF NOT EXISTS "systemPrompt" TEXT;

ALTER TABLE "chain_versions"
  ADD COLUMN IF NOT EXISTS "archivedBy" TEXT;

-- ============================================================
-- SECTION 9: ADD dueDateAt column to ticket_next_steps (DBA-032)
-- ============================================================

ALTER TABLE "ticket_next_steps"
  ADD COLUMN IF NOT EXISTS "dueDateAt" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "ticket_next_steps_dueDateAt_idx"
  ON "ticket_next_steps" ("dueDateAt");

-- ============================================================
-- SECTION 10: CREATE UNIQUE INDEX tenantId+id (DBA-012)
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS "accounts_tenantId_id_key"
  ON "accounts" ("tenantId", "id");

CREATE UNIQUE INDEX IF NOT EXISTS "contacts_tenantId_id_key"
  ON "contacts" ("tenantId", "id");

-- ============================================================
-- SECTION 11: Dedup + CREATE UNIQUE INDEX tenantId+name (DBA-014)
-- For each table: delete duplicates keeping the most recent,
-- then add unique constraint
-- ============================================================

-- WebhookEndpoint
DELETE FROM "webhook_endpoints" a USING "webhook_endpoints" b
  WHERE a."id" < b."id" AND a."tenantId" = b."tenantId" AND a."name" = b."name";
CREATE UNIQUE INDEX IF NOT EXISTS "webhook_endpoints_tenantId_name_key"
  ON "webhook_endpoints" ("tenantId", "name");

-- ReportDefinition
DELETE FROM "report_definitions" a USING "report_definitions" b
  WHERE a."id" < b."id" AND a."tenantId" = b."tenantId" AND a."name" = b."name";
CREATE UNIQUE INDEX IF NOT EXISTS "report_definitions_tenantId_name_key"
  ON "report_definitions" ("tenantId", "name");

-- RoutingRule
DELETE FROM "routing_rules" a USING "routing_rules" b
  WHERE a."id" < b."id" AND a."tenantId" = b."tenantId" AND a."name" = b."name";
CREATE UNIQUE INDEX IF NOT EXISTS "routing_rules_tenantId_name_key"
  ON "routing_rules" ("tenantId", "name");

-- BusinessRule
DELETE FROM "business_rules" a USING "business_rules" b
  WHERE a."id" < b."id" AND a."tenantId" = b."tenantId" AND a."name" = b."name";
CREATE UNIQUE INDEX IF NOT EXISTS "business_rules_tenantId_name_key"
  ON "business_rules" ("tenantId", "name");

-- WorkflowDefinition
DELETE FROM "workflow_definitions" a USING "workflow_definitions" b
  WHERE a."id" < b."id" AND a."tenantId" = b."tenantId" AND a."name" = b."name";
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_definitions_tenantId_name_key"
  ON "workflow_definitions" ("tenantId", "name");

-- EmailTemplate
DELETE FROM "email_templates" a USING "email_templates" b
  WHERE a."id" < b."id" AND a."tenantId" = b."tenantId" AND a."name" = b."name";
CREATE UNIQUE INDEX IF NOT EXISTS "email_templates_tenantId_name_key"
  ON "email_templates" ("tenantId", "name");

-- SLAPolicy
DELETE FROM "sla_policies" a USING "sla_policies" b
  WHERE a."id" < b."id" AND a."tenantId" = b."tenantId" AND a."name" = b."name";
CREATE UNIQUE INDEX IF NOT EXISTS "sla_policies_tenantId_name_key"
  ON "sla_policies" ("tenantId", "name");

-- DashboardConfig
DELETE FROM "dashboard_configs" a USING "dashboard_configs" b
  WHERE a."id" < b."id" AND a."tenantId" = b."tenantId" AND a."name" = b."name";
CREATE UNIQUE INDEX IF NOT EXISTS "dashboard_configs_tenantId_name_key"
  ON "dashboard_configs" ("tenantId", "name");

-- ============================================================
-- SECTION 12: ADD FK constraints for CaseDocument tenant_id (DBA-021)
-- Idempotent: drop if exists, then add
-- ============================================================

-- CaseDocument → Tenant
ALTER TABLE "case_documents" DROP CONSTRAINT IF EXISTS "case_documents_tenant_id_fkey";
ALTER TABLE "case_documents"
  ADD CONSTRAINT "case_documents_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CaseDocumentACL → Tenant
ALTER TABLE "case_document_acl" DROP CONSTRAINT IF EXISTS "case_document_acl_tenant_id_fkey";
ALTER TABLE "case_document_acl"
  ADD CONSTRAINT "case_document_acl_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CaseDocumentAudit → Tenant
ALTER TABLE "case_document_audit" DROP CONSTRAINT IF EXISTS "case_document_audit_tenant_id_fkey";
ALTER TABLE "case_document_audit"
  ADD CONSTRAINT "case_document_audit_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
