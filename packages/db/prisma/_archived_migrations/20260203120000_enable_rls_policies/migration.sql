-- Phase 5: Enable Row Level Security (ADR-025)
-- ==============================================
-- Prerequisites: Phase 1-4 complete (tenantId columns added, backfilled, NOT NULL enforced)
-- This migration enables RLS for data isolation in multi-tenant tables

-- Enable RLS on all tables with tenantId

-- Lead-related tables
ALTER TABLE "lead_activities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lead_files" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lead_ai_insights" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_scores" ENABLE ROW LEVEL SECURITY;

-- Contact-related tables
ALTER TABLE "contact_activities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contact_ai_insights" ENABLE ROW LEVEL SECURITY;

-- Deal-related tables
ALTER TABLE "deal_products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "deal_files" ENABLE ROW LEVEL SECURITY;

-- Activity tables
ALTER TABLE "activity_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agent_actions" ENABLE ROW LEVEL SECURITY;

-- Ticket-related tables
ALTER TABLE "sla_notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ticket_attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ticket_next_steps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "related_tickets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ticket_ai_insights" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sla_breaches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "escalation_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "routing_audits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sla_policies" ENABLE ROW LEVEL SECURITY;

-- Conversation tables
ALTER TABLE "message_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tool_call_records" ENABLE ROW LEVEL SECURITY;

-- Appointment tables
ALTER TABLE "appointment_attendees" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "appointment_cases" ENABLE ROW LEVEL SECURITY;

-- Document tables
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_access_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_shares" ENABLE ROW LEVEL SECURITY;

-- Analytics tables
ALTER TABLE "pipeline_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "traffic_sources" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "growth_metrics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "deals_won_metrics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales_performance" ENABLE ROW LEVEL SECURITY;

-- Communication tables
ALTER TABLE "team_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "email_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "email_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "email_attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chat_conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chat_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "call_records" ENABLE ROW LEVEL SECURITY;

-- Workflow tables
ALTER TABLE "workflow_definitions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workflow_executions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "business_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "business_rule_executions" ENABLE ROW LEVEL SECURITY;

-- Configuration tables
ALTER TABLE "routing_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ticket_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_endpoints" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "api_usage_records" ENABLE ROW LEVEL SECURITY;

-- Dashboard & Reporting tables
ALTER TABLE "dashboard_configs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "report_definitions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "report_schedules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "report_executions" ENABLE ROW LEVEL SECURITY;

-- Feedback tables
ALTER TABLE "feedback_surveys" ENABLE ROW LEVEL SECURITY;

-- Account health tables
ALTER TABLE "account_health_scores" ENABLE ROW LEVEL SECURITY;

-- Agent tables
ALTER TABLE "agent_skills" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agent_availability" ENABLE ROW LEVEL SECURITY;

-- AI tables
ALTER TABLE "ai_insights" ENABLE ROW LEVEL SECURITY;

-- ============================================
-- CREATE RLS POLICIES
-- ============================================
-- Policy pattern: tenant_isolation_[table_name]
-- All policies use the same pattern: check tenantId matches current_setting('app.current_tenant_id')

-- Helper function to get current tenant
CREATE OR REPLACE FUNCTION get_current_tenant_id()
RETURNS TEXT AS $$
BEGIN
  RETURN current_setting('app.current_tenant_id', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Lead-related policies
CREATE POLICY tenant_isolation_lead_activities ON "lead_activities"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

CREATE POLICY tenant_isolation_lead_files ON "lead_files"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

CREATE POLICY tenant_isolation_lead_ai_insights ON "lead_ai_insights"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

CREATE POLICY tenant_isolation_ai_scores ON "ai_scores"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

-- Contact-related policies
CREATE POLICY tenant_isolation_contact_activities ON "contact_activities"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

CREATE POLICY tenant_isolation_contact_ai_insights ON "contact_ai_insights"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

-- Deal-related policies
CREATE POLICY tenant_isolation_deal_products ON "deal_products"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

CREATE POLICY tenant_isolation_deal_files ON "deal_files"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

-- Activity policies
CREATE POLICY tenant_isolation_activity_events ON "activity_events"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

CREATE POLICY tenant_isolation_agent_actions ON "agent_actions"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

-- Ticket-related policies
CREATE POLICY tenant_isolation_sla_notifications ON "sla_notifications"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

CREATE POLICY tenant_isolation_ticket_attachments ON "ticket_attachments"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

CREATE POLICY tenant_isolation_ticket_next_steps ON "ticket_next_steps"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

CREATE POLICY tenant_isolation_related_tickets ON "related_tickets"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

CREATE POLICY tenant_isolation_ticket_ai_insights ON "ticket_ai_insights"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

CREATE POLICY tenant_isolation_sla_breaches ON "sla_breaches"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

CREATE POLICY tenant_isolation_escalation_history ON "escalation_history"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

CREATE POLICY tenant_isolation_routing_audits ON "routing_audits"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

CREATE POLICY tenant_isolation_sla_policies ON "sla_policies"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

-- Conversation policies
CREATE POLICY tenant_isolation_message_records ON "message_records"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

CREATE POLICY tenant_isolation_tool_call_records ON "tool_call_records"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

-- Appointment policies
CREATE POLICY tenant_isolation_appointment_attendees ON "appointment_attendees"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

CREATE POLICY tenant_isolation_appointment_cases ON "appointment_cases"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

-- Document policies
CREATE POLICY tenant_isolation_documents ON "documents"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

CREATE POLICY tenant_isolation_document_access_logs ON "document_access_logs"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

CREATE POLICY tenant_isolation_document_shares ON "document_shares"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

-- Analytics policies
CREATE POLICY tenant_isolation_pipeline_snapshots ON "pipeline_snapshots"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

CREATE POLICY tenant_isolation_traffic_sources ON "traffic_sources"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

CREATE POLICY tenant_isolation_growth_metrics ON "growth_metrics"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

CREATE POLICY tenant_isolation_deals_won_metrics ON "deals_won_metrics"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

CREATE POLICY tenant_isolation_sales_performance ON "sales_performance"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

-- Communication policies
CREATE POLICY tenant_isolation_team_messages ON "team_messages"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

CREATE POLICY tenant_isolation_email_templates ON "email_templates"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

CREATE POLICY tenant_isolation_email_records ON "email_records"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

CREATE POLICY tenant_isolation_email_attachments ON "email_attachments"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

CREATE POLICY tenant_isolation_chat_conversations ON "chat_conversations"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

CREATE POLICY tenant_isolation_chat_messages ON "chat_messages"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

CREATE POLICY tenant_isolation_call_records ON "call_records"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

-- Workflow policies
CREATE POLICY tenant_isolation_workflow_definitions ON "workflow_definitions"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

CREATE POLICY tenant_isolation_workflow_executions ON "workflow_executions"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

CREATE POLICY tenant_isolation_business_rules ON "business_rules"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

CREATE POLICY tenant_isolation_business_rule_executions ON "business_rule_executions"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

-- Configuration policies
CREATE POLICY tenant_isolation_routing_rules ON "routing_rules"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

CREATE POLICY tenant_isolation_ticket_categories ON "ticket_categories"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

CREATE POLICY tenant_isolation_webhook_endpoints ON "webhook_endpoints"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

CREATE POLICY tenant_isolation_webhook_deliveries ON "webhook_deliveries"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

CREATE POLICY tenant_isolation_api_keys ON "api_keys"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

CREATE POLICY tenant_isolation_api_usage_records ON "api_usage_records"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

-- Dashboard & Reporting policies
CREATE POLICY tenant_isolation_dashboard_configs ON "dashboard_configs"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

CREATE POLICY tenant_isolation_report_definitions ON "report_definitions"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

CREATE POLICY tenant_isolation_report_schedules ON "report_schedules"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

CREATE POLICY tenant_isolation_report_executions ON "report_executions"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

-- Feedback policies
CREATE POLICY tenant_isolation_feedback_surveys ON "feedback_surveys"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

-- Account health policies
CREATE POLICY tenant_isolation_account_health_scores ON "account_health_scores"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

-- Agent policies
CREATE POLICY tenant_isolation_agent_skills ON "agent_skills"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

CREATE POLICY tenant_isolation_agent_availability ON "agent_availability"
  FOR ALL USING ("tenantId" = get_current_tenant_id());

-- AI policies
CREATE POLICY tenant_isolation_ai_insights ON "ai_insights"
  FOR ALL USING ("tenantId" = get_current_tenant_id());
