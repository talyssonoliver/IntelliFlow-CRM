-- ============================================
-- RLS POLICIES UPDATE (IFC-127 Phase 2)
-- Updates existing RLS policies to check tenantId
-- Adds RLS to newly tenant-isolated tables
--
-- Run AFTER: 20260103000000_add_tenant_isolation.sql
-- ============================================

BEGIN;

-- ============================================
-- HELPER FUNCTION: Get current tenant ID from JWT claims
-- ============================================

CREATE OR REPLACE FUNCTION auth.tenant_id() RETURNS TEXT AS $$
BEGIN
  RETURN COALESCE(
    current_setting('request.jwt.claims', true)::json->>'tenant_id',
    current_setting('app.tenant_id', true)
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================
-- DROP EXISTING OWNER-ONLY POLICIES
-- These will be replaced with tenant-aware policies
-- ============================================

-- Domain Events
DROP POLICY IF EXISTS "domain_events_select_own" ON domain_events;
DROP POLICY IF EXISTS "domain_events_insert_own" ON domain_events;
DROP POLICY IF EXISTS "domain_events_update_own" ON domain_events;
DROP POLICY IF EXISTS "domain_events_delete_own" ON domain_events;

-- Security Events
DROP POLICY IF EXISTS "security_events_select_own" ON security_events;
DROP POLICY IF EXISTS "security_events_insert_own" ON security_events;

-- Appointments
DROP POLICY IF EXISTS "appointments_select_own" ON appointments;
DROP POLICY IF EXISTS "appointments_insert_own" ON appointments;
DROP POLICY IF EXISTS "appointments_update_own" ON appointments;
DROP POLICY IF EXISTS "appointments_delete_own" ON appointments;

-- ============================================
-- ENABLE RLS ON NEW TABLES
-- ============================================

ALTER TABLE domain_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE chain_version_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_ai_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE sla_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE sla_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_attachments ENABLE ROW LEVEL SECURITY;

-- ============================================
-- CREATE TENANT-AWARE POLICIES
-- All policies now enforce tenant isolation
-- ============================================

-- Domain Events
CREATE POLICY "domain_events_tenant_isolation" ON domain_events
FOR ALL USING (tenant_id = auth.tenant_id());

-- Security Events (SELECT only - immutable for audit purposes)
CREATE POLICY "security_events_tenant_isolation" ON security_events
FOR SELECT USING (tenant_id = auth.tenant_id());

CREATE POLICY "security_events_insert_tenant" ON security_events
FOR INSERT WITH CHECK (tenant_id = auth.tenant_id());

-- Appointments
CREATE POLICY "appointments_tenant_isolation" ON appointments
FOR ALL USING (tenant_id = auth.tenant_id());

-- Appointment Attendees
CREATE POLICY "appointment_attendees_tenant_isolation" ON appointment_attendees
FOR ALL USING (tenant_id = auth.tenant_id());

-- Appointment Cases
CREATE POLICY "appointment_cases_tenant_isolation" ON appointment_cases
FOR ALL USING (tenant_id = auth.tenant_id());

-- Deal Products
CREATE POLICY "deal_products_tenant_isolation" ON deal_products
FOR ALL USING (tenant_id = auth.tenant_id());

-- Deal Files
CREATE POLICY "deal_files_tenant_isolation" ON deal_files
FOR ALL USING (tenant_id = auth.tenant_id());

-- Activity Events
CREATE POLICY "activity_events_tenant_isolation" ON activity_events
FOR ALL USING (tenant_id = auth.tenant_id());

-- Agent Actions
CREATE POLICY "agent_actions_tenant_isolation" ON agent_actions
FOR ALL USING (tenant_id = auth.tenant_id());

-- Contact Activities
CREATE POLICY "contact_activities_tenant_isolation" ON contact_activities
FOR ALL USING (tenant_id = auth.tenant_id());

-- Chain Version Audits
CREATE POLICY "chain_version_audits_tenant_isolation" ON chain_version_audits
FOR ALL USING (tenant_id = auth.tenant_id());

-- Role Permissions
CREATE POLICY "role_permissions_tenant_isolation" ON role_permissions
FOR ALL USING (tenant_id = auth.tenant_id());

-- User Role Assignments
CREATE POLICY "user_role_assignments_tenant_isolation" ON user_role_assignments
FOR ALL USING (tenant_id = auth.tenant_id());

-- User Permissions
CREATE POLICY "user_permissions_tenant_isolation" ON user_permissions
FOR ALL USING (tenant_id = auth.tenant_id());

-- Contact Notes
CREATE POLICY "contact_notes_tenant_isolation" ON contact_notes
FOR ALL USING (tenant_id = auth.tenant_id());

-- Contact AI Insights
CREATE POLICY "contact_ai_insights_tenant_isolation" ON contact_ai_insights
FOR ALL USING (tenant_id = auth.tenant_id());

-- Webhook Endpoints
CREATE POLICY "webhook_endpoints_tenant_isolation" ON webhook_endpoints
FOR ALL USING (tenant_id = auth.tenant_id());

-- Webhook Deliveries
CREATE POLICY "webhook_deliveries_tenant_isolation" ON webhook_deliveries
FOR ALL USING (tenant_id = auth.tenant_id());

-- API Keys
CREATE POLICY "api_keys_tenant_isolation" ON api_keys
FOR ALL USING (tenant_id = auth.tenant_id());

-- API Usage Records
CREATE POLICY "api_usage_records_tenant_isolation" ON api_usage_records
FOR ALL USING (tenant_id = auth.tenant_id());

-- AI Scores
CREATE POLICY "ai_scores_tenant_isolation" ON ai_scores
FOR ALL USING (tenant_id = auth.tenant_id());

-- SLA Policies
CREATE POLICY "sla_policies_tenant_isolation" ON sla_policies
FOR ALL USING (tenant_id = auth.tenant_id());

-- SLA Notifications
CREATE POLICY "sla_notifications_tenant_isolation" ON sla_notifications
FOR ALL USING (tenant_id = auth.tenant_id());

-- Ticket Activities
CREATE POLICY "ticket_activities_tenant_isolation" ON ticket_activities
FOR ALL USING (tenant_id = auth.tenant_id());

-- Ticket Attachments
CREATE POLICY "ticket_attachments_tenant_isolation" ON ticket_attachments
FOR ALL USING (tenant_id = auth.tenant_id());

-- ============================================
-- UPDATE EXISTING CORE TABLE POLICIES
-- Add tenantId check to existing policies
-- ============================================

-- Update Leads policy to include tenant check
DROP POLICY IF EXISTS "leads_select_own" ON leads;
DROP POLICY IF EXISTS "leads_insert_own" ON leads;
DROP POLICY IF EXISTS "leads_update_own" ON leads;
DROP POLICY IF EXISTS "leads_delete_own" ON leads;

CREATE POLICY "leads_tenant_isolation" ON leads
FOR ALL USING (tenant_id = auth.tenant_id());

-- Update Contacts policy
DROP POLICY IF EXISTS "contacts_select_own" ON contacts;
DROP POLICY IF EXISTS "contacts_insert_own" ON contacts;
DROP POLICY IF EXISTS "contacts_update_own" ON contacts;
DROP POLICY IF EXISTS "contacts_delete_own" ON contacts;

CREATE POLICY "contacts_tenant_isolation" ON contacts
FOR ALL USING (tenant_id = auth.tenant_id());

-- Update Accounts policy
DROP POLICY IF EXISTS "accounts_select_own" ON accounts;
DROP POLICY IF EXISTS "accounts_insert_own" ON accounts;
DROP POLICY IF EXISTS "accounts_update_own" ON accounts;
DROP POLICY IF EXISTS "accounts_delete_own" ON accounts;

CREATE POLICY "accounts_tenant_isolation" ON accounts
FOR ALL USING (tenant_id = auth.tenant_id());

-- Update Opportunities policy
DROP POLICY IF EXISTS "opportunities_select_own" ON opportunities;
DROP POLICY IF EXISTS "opportunities_insert_own" ON opportunities;
DROP POLICY IF EXISTS "opportunities_update_own" ON opportunities;
DROP POLICY IF EXISTS "opportunities_delete_own" ON opportunities;

CREATE POLICY "opportunities_tenant_isolation" ON opportunities
FOR ALL USING (tenant_id = auth.tenant_id());

-- Update Tasks policy
DROP POLICY IF EXISTS "tasks_select_own" ON tasks;
DROP POLICY IF EXISTS "tasks_insert_own" ON tasks;
DROP POLICY IF EXISTS "tasks_update_own" ON tasks;
DROP POLICY IF EXISTS "tasks_delete_own" ON tasks;

CREATE POLICY "tasks_tenant_isolation" ON tasks
FOR ALL USING (tenant_id = auth.tenant_id());

-- Update Tickets policy
DROP POLICY IF EXISTS "tickets_select_own" ON tickets;
DROP POLICY IF EXISTS "tickets_insert_own" ON tickets;
DROP POLICY IF EXISTS "tickets_update_own" ON tickets;
DROP POLICY IF EXISTS "tickets_delete_own" ON tickets;

CREATE POLICY "tickets_tenant_isolation" ON tickets
FOR ALL USING (tenant_id = auth.tenant_id());

-- ============================================
-- SERVICE ROLE BYPASS POLICIES
-- Allow service role to bypass RLS for system operations
-- ============================================

-- Create function to check for service role
CREATE OR REPLACE FUNCTION auth.is_service_role() RETURNS BOOLEAN AS $$
BEGIN
  RETURN COALESCE(
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role',
    FALSE
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Add service role bypass to critical tables
CREATE POLICY "domain_events_service_role" ON domain_events
FOR ALL USING (auth.is_service_role());

CREATE POLICY "security_events_service_role" ON security_events
FOR ALL USING (auth.is_service_role());

CREATE POLICY "agent_actions_service_role" ON agent_actions
FOR ALL USING (auth.is_service_role());

COMMIT;

-- ============================================
-- POST-MIGRATION VERIFICATION
-- ============================================
--
-- Run these queries to verify RLS is working:
--
-- 1. Check all tables have RLS enabled:
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- AND tablename IN ('domain_events', 'security_events', 'appointments', ...)
-- AND rowsecurity = true;
--
-- 2. List all tenant isolation policies:
-- SELECT tablename, policyname
-- FROM pg_policies
-- WHERE policyname LIKE '%tenant_isolation%';
--
-- 3. Test tenant isolation (as authenticated user):
-- SET request.jwt.claims = '{"tenant_id": "test-tenant-1"}';
-- SELECT * FROM leads; -- Should only return tenant-1 leads
