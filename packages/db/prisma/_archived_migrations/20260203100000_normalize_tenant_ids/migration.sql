-- Migration: Normalize Tenant IDs across all tenant-scoped tables
-- Purpose: Add tenantId to all tables that should have tenant isolation per ADR-004
-- ADR Reference: ADR-025-tenant-id-normalization.md
-- NOTE: Database uses camelCase column names (Prisma default without @map)

-- =====================================================
-- PHASE 1: ADD NULLABLE TENANT_ID COLUMNS
-- =====================================================

-- Lead-related tables
ALTER TABLE "lead_activities" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "lead_files" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "lead_ai_insights" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "ai_scores" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- Contact-related tables
ALTER TABLE "contact_activities" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "contact_ai_insights" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- Opportunity-related tables
ALTER TABLE "deal_products" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "deal_files" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "activity_events" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "agent_actions" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- Ticket-related tables
ALTER TABLE "sla_notifications" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "ticket_attachments" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "ticket_next_steps" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "related_tickets" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "ticket_ai_insights" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "sla_breaches" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "escalation_history" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "routing_audits" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- SLA Policy (nullable - null means global default)
ALTER TABLE "sla_policies" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- Conversation-related tables
ALTER TABLE "message_records" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "tool_call_records" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- Appointment-related tables
ALTER TABLE "appointment_attendees" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "appointment_cases" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- Document tables
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "document_access_logs" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "document_shares" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- Analytics tables
ALTER TABLE "pipeline_snapshots" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "traffic_sources" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "growth_metrics" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "deals_won_metrics" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "sales_performance" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- Communication tables
ALTER TABLE "team_messages" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "email_templates" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "email_records" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "email_attachments" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "call_records" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- Configuration tables
ALTER TABLE "workflow_definitions" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "workflow_executions" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "business_rules" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "business_rule_executions" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "routing_rules" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "ticket_categories" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "webhook_endpoints" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "webhook_deliveries" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "api_usage_records" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- Dashboard tables
ALTER TABLE "dashboard_configs" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "report_definitions" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "report_schedules" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "report_executions" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- Feedback tables
ALTER TABLE "feedback_surveys" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "account_health_scores" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- Agent tables
ALTER TABLE "agent_skills" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "agent_availability" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- AI tables
ALTER TABLE "ai_insights" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- Case documents - SKIPPED (already have tenant_id column)

-- =====================================================
-- PHASE 2: BACKFILL FROM PARENT RELATIONSHIPS
-- =====================================================

-- Lead-related backfill
UPDATE "lead_activities" la
SET "tenantId" = l."tenantId"
FROM "leads" l
WHERE la."leadId" = l."id" AND la."tenantId" IS NULL;

UPDATE "lead_files" lf
SET "tenantId" = l."tenantId"
FROM "leads" l
WHERE lf."leadId" = l."id" AND lf."tenantId" IS NULL;

UPDATE "lead_ai_insights" lai
SET "tenantId" = l."tenantId"
FROM "leads" l
WHERE lai."leadId" = l."id" AND lai."tenantId" IS NULL;

UPDATE "ai_scores" ais
SET "tenantId" = l."tenantId"
FROM "leads" l
WHERE ais."leadId" = l."id" AND ais."tenantId" IS NULL;

-- Contact-related backfill
UPDATE "contact_activities" ca
SET "tenantId" = c."tenantId"
FROM "contacts" c
WHERE ca."contactId" = c."id" AND ca."tenantId" IS NULL;

UPDATE "contact_ai_insights" cai
SET "tenantId" = c."tenantId"
FROM "contacts" c
WHERE cai."contactId" = c."id" AND cai."tenantId" IS NULL;

-- Opportunity-related backfill
UPDATE "deal_products" dp
SET "tenantId" = o."tenantId"
FROM "opportunities" o
WHERE dp."opportunityId" = o."id" AND dp."tenantId" IS NULL;

UPDATE "deal_files" df
SET "tenantId" = o."tenantId"
FROM "opportunities" o
WHERE df."opportunityId" = o."id" AND df."tenantId" IS NULL;

UPDATE "activity_events" ae
SET "tenantId" = o."tenantId"
FROM "opportunities" o
WHERE ae."opportunityId" = o."id" AND ae."tenantId" IS NULL;

-- Ticket-related backfill
UPDATE "sla_notifications" sn
SET "tenantId" = t."tenantId"
FROM "tickets" t
WHERE sn."ticketId" = t."id" AND sn."tenantId" IS NULL;

UPDATE "ticket_attachments" ta
SET "tenantId" = t."tenantId"
FROM "tickets" t
WHERE ta."ticketId" = t."id" AND ta."tenantId" IS NULL;

UPDATE "ticket_next_steps" tns
SET "tenantId" = t."tenantId"
FROM "tickets" t
WHERE tns."ticketId" = t."id" AND tns."tenantId" IS NULL;

UPDATE "related_tickets" rt
SET "tenantId" = t."tenantId"
FROM "tickets" t
WHERE rt."ticketId" = t."id" AND rt."tenantId" IS NULL;

UPDATE "ticket_ai_insights" tai
SET "tenantId" = t."tenantId"
FROM "tickets" t
WHERE tai."ticketId" = t."id" AND tai."tenantId" IS NULL;

UPDATE "sla_breaches" sb
SET "tenantId" = t."tenantId"
FROM "tickets" t
WHERE sb."ticketId" = t."id" AND sb."tenantId" IS NULL;

UPDATE "escalation_history" eh
SET "tenantId" = t."tenantId"
FROM "tickets" t
WHERE eh."ticketId" = t."id" AND eh."tenantId" IS NULL;

UPDATE "routing_audits" ra
SET "tenantId" = t."tenantId"
FROM "tickets" t
WHERE ra."ticketId" = t."id" AND ra."tenantId" IS NULL;

-- Conversation-related backfill
UPDATE "message_records" mr
SET "tenantId" = cr."tenantId"
FROM "conversation_records" cr
WHERE mr."conversationId" = cr."id" AND mr."tenantId" IS NULL;

UPDATE "tool_call_records" tcr
SET "tenantId" = cr."tenantId"
FROM "conversation_records" cr
WHERE tcr."conversationId" = cr."id" AND tcr."tenantId" IS NULL;

-- Appointment-related backfill
UPDATE "appointment_attendees" aa
SET "tenantId" = a."tenantId"
FROM "appointments" a
WHERE aa."appointmentId" = a."id" AND aa."tenantId" IS NULL;

UPDATE "appointment_cases" ac
SET "tenantId" = a."tenantId"
FROM "appointments" a
WHERE ac."appointmentId" = a."id" AND ac."tenantId" IS NULL;

-- Document-related backfill (documents are standalone, need to infer from contact/account)
UPDATE "documents" d
SET "tenantId" = c."tenantId"
FROM "contacts" c
WHERE d."contactId" = c."id" AND d."tenantId" IS NULL;

UPDATE "documents" d
SET "tenantId" = a."tenantId"
FROM "accounts" a
WHERE d."accountId" = a."id" AND d."tenantId" IS NULL;

UPDATE "document_access_logs" dal
SET "tenantId" = d."tenantId"
FROM "documents" d
WHERE dal."documentId" = d."id" AND dal."tenantId" IS NULL;

UPDATE "document_shares" ds
SET "tenantId" = d."tenantId"
FROM "documents" d
WHERE ds."documentId" = d."id" AND ds."tenantId" IS NULL;

-- Email-related backfill (from contact)
UPDATE "email_records" er
SET "tenantId" = c."tenantId"
FROM "contacts" c
WHERE er."contactId" = c."id" AND er."tenantId" IS NULL;

UPDATE "email_attachments" ea
SET "tenantId" = er."tenantId"
FROM "email_records" er
WHERE ea."emailId" = er."id" AND ea."tenantId" IS NULL;

-- Chat-related backfill
UPDATE "chat_conversations" cc
SET "tenantId" = c."tenantId"
FROM "contacts" c
WHERE cc."contactId" = c."id" AND cc."tenantId" IS NULL;

UPDATE "chat_messages" cm
SET "tenantId" = cc."tenantId"
FROM "chat_conversations" cc
WHERE cm."conversationId" = cc."id" AND cm."tenantId" IS NULL;

-- Call-related backfill
UPDATE "call_records" cr
SET "tenantId" = c."tenantId"
FROM "contacts" c
WHERE cr."contactId" = c."id" AND cr."tenantId" IS NULL;

-- Feedback backfill
UPDATE "feedback_surveys" fs
SET "tenantId" = c."tenantId"
FROM "contacts" c
WHERE fs."contactId" = c."id" AND fs."tenantId" IS NULL;

-- Account health backfill
UPDATE "account_health_scores" ahs
SET "tenantId" = a."tenantId"
FROM "accounts" a
WHERE ahs."accountId" = a."id" AND ahs."tenantId" IS NULL;

-- Workflow backfill (from user)
UPDATE "workflow_definitions" wd
SET "tenantId" = u."tenantId"
FROM "users" u
WHERE wd."createdBy" = u."id" AND wd."tenantId" IS NULL;

UPDATE "workflow_executions" we
SET "tenantId" = wd."tenantId"
FROM "workflow_definitions" wd
WHERE we."workflowId" = wd."id" AND we."tenantId" IS NULL;

-- Business rules backfill
UPDATE "business_rules" br
SET "tenantId" = u."tenantId"
FROM "users" u
WHERE br."createdBy" = u."id" AND br."tenantId" IS NULL;

UPDATE "business_rule_executions" bre
SET "tenantId" = br."tenantId"
FROM "business_rules" br
WHERE bre."ruleId" = br."id" AND bre."tenantId" IS NULL;

-- Agent backfill
UPDATE "agent_skills" ask
SET "tenantId" = u."tenantId"
FROM "users" u
WHERE ask."userId" = u."id" AND ask."tenantId" IS NULL;

UPDATE "agent_availability" aa
SET "tenantId" = u."tenantId"
FROM "users" u
WHERE aa."userId" = u."id" AND aa."tenantId" IS NULL;

-- Dashboard/Report backfill
UPDATE "dashboard_configs" dc
SET "tenantId" = u."tenantId"
FROM "users" u
WHERE dc."userId" = u."id" AND dc."tenantId" IS NULL;

-- Case documents backfill - SKIPPED (already have tenant_id column)

-- =====================================================
-- PHASE 3: CREATE INDEXES FOR PERFORMANCE
-- =====================================================

CREATE INDEX IF NOT EXISTS "idx_lead_activities_tenantId" ON "lead_activities"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_lead_files_tenantId" ON "lead_files"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_lead_ai_insights_tenantId" ON "lead_ai_insights"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_ai_scores_tenantId" ON "ai_scores"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_contact_activities_tenantId" ON "contact_activities"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_contact_ai_insights_tenantId" ON "contact_ai_insights"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_deal_products_tenantId" ON "deal_products"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_deal_files_tenantId" ON "deal_files"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_activity_events_tenantId" ON "activity_events"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_agent_actions_tenantId" ON "agent_actions"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_sla_notifications_tenantId" ON "sla_notifications"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_ticket_attachments_tenantId" ON "ticket_attachments"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_ticket_next_steps_tenantId" ON "ticket_next_steps"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_related_tickets_tenantId" ON "related_tickets"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_ticket_ai_insights_tenantId" ON "ticket_ai_insights"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_sla_breaches_tenantId" ON "sla_breaches"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_escalation_history_tenantId" ON "escalation_history"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_routing_audits_tenantId" ON "routing_audits"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_sla_policies_tenantId" ON "sla_policies"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_message_records_tenantId" ON "message_records"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_tool_call_records_tenantId" ON "tool_call_records"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_appointment_attendees_tenantId" ON "appointment_attendees"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_appointment_cases_tenantId" ON "appointment_cases"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_documents_tenantId" ON "documents"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_document_access_logs_tenantId" ON "document_access_logs"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_document_shares_tenantId" ON "document_shares"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_pipeline_snapshots_tenantId" ON "pipeline_snapshots"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_traffic_sources_tenantId" ON "traffic_sources"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_growth_metrics_tenantId" ON "growth_metrics"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_deals_won_metrics_tenantId" ON "deals_won_metrics"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_sales_performance_tenantId" ON "sales_performance"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_team_messages_tenantId" ON "team_messages"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_email_templates_tenantId" ON "email_templates"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_email_records_tenantId" ON "email_records"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_email_attachments_tenantId" ON "email_attachments"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_chat_conversations_tenantId" ON "chat_conversations"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_chat_messages_tenantId" ON "chat_messages"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_call_records_tenantId" ON "call_records"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_workflow_definitions_tenantId" ON "workflow_definitions"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_workflow_executions_tenantId" ON "workflow_executions"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_business_rules_tenantId" ON "business_rules"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_business_rule_executions_tenantId" ON "business_rule_executions"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_routing_rules_tenantId" ON "routing_rules"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_ticket_categories_tenantId" ON "ticket_categories"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_webhook_endpoints_tenantId" ON "webhook_endpoints"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_webhook_deliveries_tenantId" ON "webhook_deliveries"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_api_keys_tenantId" ON "api_keys"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_api_usage_records_tenantId" ON "api_usage_records"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_dashboard_configs_tenantId" ON "dashboard_configs"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_report_definitions_tenantId" ON "report_definitions"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_report_schedules_tenantId" ON "report_schedules"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_report_executions_tenantId" ON "report_executions"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_feedback_surveys_tenantId" ON "feedback_surveys"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_account_health_scores_tenantId" ON "account_health_scores"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_agent_skills_tenantId" ON "agent_skills"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_agent_availability_tenantId" ON "agent_availability"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_ai_insights_tenantId" ON "ai_insights"("tenantId");
-- Case documents indexes - SKIPPED (already have tenant_id column with indexes)

-- =====================================================
-- NOTE: PHASE 4 (NOT NULL constraints) and PHASE 5 (RLS)
-- should be run separately after verifying backfill success
-- See ADR-025 for complete instructions
-- =====================================================
