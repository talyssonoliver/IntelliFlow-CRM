-- Idempotent FK constraint additions
-- Each constraint is dropped first (if exists) then re-created

-- Helper: drop if exists, then add
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

-- DBA-118: 25 models
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
