-- Phase 4: Enforce NOT NULL constraints (ADR-025)
-- ==============================================
-- Prerequisites: Phase 1-3 complete (tenantId columns added and backfilled)
-- This migration adds NOT NULL constraints to make multi-tenancy mandatory

-- Lead-related tables
ALTER TABLE "lead_activities" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "lead_files" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "lead_ai_insights" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "ai_scores" ALTER COLUMN "tenantId" SET NOT NULL;

-- Contact-related tables
ALTER TABLE "contact_activities" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "contact_ai_insights" ALTER COLUMN "tenantId" SET NOT NULL;

-- Deal-related tables
ALTER TABLE "deal_products" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "deal_files" ALTER COLUMN "tenantId" SET NOT NULL;

-- Activity tables
ALTER TABLE "activity_events" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "agent_actions" ALTER COLUMN "tenantId" SET NOT NULL;

-- Ticket-related tables
ALTER TABLE "sla_notifications" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "ticket_attachments" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "ticket_next_steps" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "related_tickets" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "ticket_ai_insights" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "sla_breaches" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "escalation_history" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "routing_audits" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "sla_policies" ALTER COLUMN "tenantId" SET NOT NULL;

-- Conversation tables
ALTER TABLE "message_records" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "tool_call_records" ALTER COLUMN "tenantId" SET NOT NULL;

-- Appointment tables
ALTER TABLE "appointment_attendees" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "appointment_cases" ALTER COLUMN "tenantId" SET NOT NULL;

-- Document tables
ALTER TABLE "documents" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "document_access_logs" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "document_shares" ALTER COLUMN "tenantId" SET NOT NULL;

-- Analytics tables
ALTER TABLE "pipeline_snapshots" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "traffic_sources" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "growth_metrics" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "deals_won_metrics" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "sales_performance" ALTER COLUMN "tenantId" SET NOT NULL;

-- Communication tables
ALTER TABLE "team_messages" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "email_templates" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "email_records" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "email_attachments" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "chat_conversations" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "chat_messages" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "call_records" ALTER COLUMN "tenantId" SET NOT NULL;

-- Workflow tables
ALTER TABLE "workflow_definitions" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "workflow_executions" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "business_rules" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "business_rule_executions" ALTER COLUMN "tenantId" SET NOT NULL;

-- Configuration tables
ALTER TABLE "routing_rules" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "ticket_categories" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "webhook_endpoints" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "webhook_deliveries" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "api_keys" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "api_usage_records" ALTER COLUMN "tenantId" SET NOT NULL;

-- Dashboard & Reporting tables
ALTER TABLE "dashboard_configs" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "report_definitions" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "report_schedules" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "report_executions" ALTER COLUMN "tenantId" SET NOT NULL;

-- Feedback tables
ALTER TABLE "feedback_surveys" ALTER COLUMN "tenantId" SET NOT NULL;

-- Account health tables
ALTER TABLE "account_health_scores" ALTER COLUMN "tenantId" SET NOT NULL;

-- Agent tables
ALTER TABLE "agent_skills" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "agent_availability" ALTER COLUMN "tenantId" SET NOT NULL;

-- AI tables
ALTER TABLE "ai_insights" ALTER COLUMN "tenantId" SET NOT NULL;
