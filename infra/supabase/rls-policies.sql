-- Row Level Security (RLS) Policies for IntelliFlow CRM
-- Implements multi-tenant security with role-based access control
--
-- Access Rules:
-- - Users can only view/edit their own leads, contacts, accounts
-- - Managers can view team members' data
-- - Admins have full access
-- - Service role bypasses all RLS (for backend operations)

-- ============================================
-- ENABLE RLS ON ALL TABLES
-- ============================================

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "leads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "opportunities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_scores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "domain_events" ENABLE ROW LEVEL SECURITY;

-- ============================================
-- HELPER FUNCTIONS FOR RLS
-- ============================================

-- Get current user's ID from JWT
CREATE OR REPLACE FUNCTION auth.user_id()
RETURNS TEXT AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::json->>'sub', '')::text;
$$ LANGUAGE SQL STABLE;

-- Get current user's role from JWT
CREATE OR REPLACE FUNCTION auth.user_role()
RETURNS TEXT AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::json->>'role', '')::text;
$$ LANGUAGE SQL STABLE;

-- Check if current user is admin
CREATE OR REPLACE FUNCTION auth.is_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT role = 'ADMIN' FROM users WHERE id = auth.user_id()),
    false
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Check if current user is manager
CREATE OR REPLACE FUNCTION auth.is_manager()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT role IN ('MANAGER', 'ADMIN') FROM users WHERE id = auth.user_id()),
    false
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Get team members for a manager (simplified - extend with actual team structure)
CREATE OR REPLACE FUNCTION auth.team_member_ids()
RETURNS SETOF TEXT AS $$
  -- For now, managers can see all SALES_REP and USER roles
  -- In production, implement proper team hierarchy
  SELECT id FROM users
  WHERE role IN ('USER', 'SALES_REP')
    AND auth.is_manager();
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- ============================================
-- USERS TABLE POLICIES
-- ============================================

-- Users can view their own profile
CREATE POLICY "users_select_own"
  ON "users"
  FOR SELECT
  USING (id = auth.user_id());

-- Admins can view all users
CREATE POLICY "users_select_admin"
  ON "users"
  FOR SELECT
  USING (auth.is_admin());

-- Managers can view their team members
CREATE POLICY "users_select_manager"
  ON "users"
  FOR SELECT
  USING (
    auth.is_manager()
    AND role IN ('USER', 'SALES_REP')
  );

-- Users can update their own profile (limited fields)
CREATE POLICY "users_update_own"
  ON "users"
  FOR UPDATE
  USING (id = auth.user_id())
  WITH CHECK (
    id = auth.user_id()
    -- Prevent users from changing their own role
    AND role = (SELECT role FROM users WHERE id = auth.user_id())
  );

-- Only admins can insert new users
CREATE POLICY "users_insert_admin"
  ON "users"
  FOR INSERT
  WITH CHECK (auth.is_admin());

-- Only admins can delete users
CREATE POLICY "users_delete_admin"
  ON "users"
  FOR DELETE
  USING (auth.is_admin());

-- ============================================
-- LEADS TABLE POLICIES
-- ============================================

-- Users can view their own leads
CREATE POLICY "leads_select_own"
  ON "leads"
  FOR SELECT
  USING ("ownerId" = auth.user_id());

-- Admins can view all leads
CREATE POLICY "leads_select_admin"
  ON "leads"
  FOR SELECT
  USING (auth.is_admin());

-- Managers can view team leads
CREATE POLICY "leads_select_manager"
  ON "leads"
  FOR SELECT
  USING (
    auth.is_manager()
    AND "ownerId" IN (SELECT auth.team_member_ids())
  );

-- Users can insert leads (they become the owner)
CREATE POLICY "leads_insert_own"
  ON "leads"
  FOR INSERT
  WITH CHECK ("ownerId" = auth.user_id());

-- Admins can insert leads for anyone
CREATE POLICY "leads_insert_admin"
  ON "leads"
  FOR INSERT
  WITH CHECK (auth.is_admin());

-- Users can update their own leads
CREATE POLICY "leads_update_own"
  ON "leads"
  FOR UPDATE
  USING ("ownerId" = auth.user_id())
  WITH CHECK ("ownerId" = auth.user_id());

-- Admins can update any lead
CREATE POLICY "leads_update_admin"
  ON "leads"
  FOR UPDATE
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());

-- Users can delete their own leads
CREATE POLICY "leads_delete_own"
  ON "leads"
  FOR DELETE
  USING ("ownerId" = auth.user_id());

-- Admins can delete any lead
CREATE POLICY "leads_delete_admin"
  ON "leads"
  FOR DELETE
  USING (auth.is_admin());

-- ============================================
-- CONTACTS TABLE POLICIES
-- ============================================

-- Users can view their own contacts
CREATE POLICY "contacts_select_own"
  ON "contacts"
  FOR SELECT
  USING ("ownerId" = auth.user_id());

-- Admins can view all contacts
CREATE POLICY "contacts_select_admin"
  ON "contacts"
  FOR SELECT
  USING (auth.is_admin());

-- Managers can view team contacts
CREATE POLICY "contacts_select_manager"
  ON "contacts"
  FOR SELECT
  USING (
    auth.is_manager()
    AND "ownerId" IN (SELECT auth.team_member_ids())
  );

-- Users can insert contacts (they become the owner)
CREATE POLICY "contacts_insert_own"
  ON "contacts"
  FOR INSERT
  WITH CHECK ("ownerId" = auth.user_id());

-- Admins can insert contacts for anyone
CREATE POLICY "contacts_insert_admin"
  ON "contacts"
  FOR INSERT
  WITH CHECK (auth.is_admin());

-- Users can update their own contacts
CREATE POLICY "contacts_update_own"
  ON "contacts"
  FOR UPDATE
  USING ("ownerId" = auth.user_id())
  WITH CHECK ("ownerId" = auth.user_id());

-- Admins can update any contact
CREATE POLICY "contacts_update_admin"
  ON "contacts"
  FOR UPDATE
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());

-- Users can delete their own contacts
CREATE POLICY "contacts_delete_own"
  ON "contacts"
  FOR DELETE
  USING ("ownerId" = auth.user_id());

-- Admins can delete any contact
CREATE POLICY "contacts_delete_admin"
  ON "contacts"
  FOR DELETE
  USING (auth.is_admin());

-- ============================================
-- ACCOUNTS TABLE POLICIES
-- ============================================

-- Users can view their own accounts
CREATE POLICY "accounts_select_own"
  ON "accounts"
  FOR SELECT
  USING ("ownerId" = auth.user_id());

-- Admins can view all accounts
CREATE POLICY "accounts_select_admin"
  ON "accounts"
  FOR SELECT
  USING (auth.is_admin());

-- Managers can view team accounts
CREATE POLICY "accounts_select_manager"
  ON "accounts"
  FOR SELECT
  USING (
    auth.is_manager()
    AND "ownerId" IN (SELECT auth.team_member_ids())
  );

-- Users can insert accounts (they become the owner)
CREATE POLICY "accounts_insert_own"
  ON "accounts"
  FOR INSERT
  WITH CHECK ("ownerId" = auth.user_id());

-- Admins can insert accounts for anyone
CREATE POLICY "accounts_insert_admin"
  ON "accounts"
  FOR INSERT
  WITH CHECK (auth.is_admin());

-- Users can update their own accounts
CREATE POLICY "accounts_update_own"
  ON "accounts"
  FOR UPDATE
  USING ("ownerId" = auth.user_id())
  WITH CHECK ("ownerId" = auth.user_id());

-- Admins can update any account
CREATE POLICY "accounts_update_admin"
  ON "accounts"
  FOR UPDATE
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());

-- Users can delete their own accounts
CREATE POLICY "accounts_delete_own"
  ON "accounts"
  FOR DELETE
  USING ("ownerId" = auth.user_id());

-- Admins can delete any account
CREATE POLICY "accounts_delete_admin"
  ON "accounts"
  FOR DELETE
  USING (auth.is_admin());

-- ============================================
-- OPPORTUNITIES TABLE POLICIES
-- ============================================

-- Users can view their own opportunities
CREATE POLICY "opportunities_select_own"
  ON "opportunities"
  FOR SELECT
  USING ("ownerId" = auth.user_id());

-- Admins can view all opportunities
CREATE POLICY "opportunities_select_admin"
  ON "opportunities"
  FOR SELECT
  USING (auth.is_admin());

-- Managers can view team opportunities
CREATE POLICY "opportunities_select_manager"
  ON "opportunities"
  FOR SELECT
  USING (
    auth.is_manager()
    AND "ownerId" IN (SELECT auth.team_member_ids())
  );

-- Users can insert opportunities (they become the owner)
CREATE POLICY "opportunities_insert_own"
  ON "opportunities"
  FOR INSERT
  WITH CHECK ("ownerId" = auth.user_id());

-- Admins can insert opportunities for anyone
CREATE POLICY "opportunities_insert_admin"
  ON "opportunities"
  FOR INSERT
  WITH CHECK (auth.is_admin());

-- Users can update their own opportunities
CREATE POLICY "opportunities_update_own"
  ON "opportunities"
  FOR UPDATE
  USING ("ownerId" = auth.user_id())
  WITH CHECK ("ownerId" = auth.user_id());

-- Admins can update any opportunity
CREATE POLICY "opportunities_update_admin"
  ON "opportunities"
  FOR UPDATE
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());

-- Users can delete their own opportunities
CREATE POLICY "opportunities_delete_own"
  ON "opportunities"
  FOR DELETE
  USING ("ownerId" = auth.user_id());

-- Admins can delete any opportunity
CREATE POLICY "opportunities_delete_admin"
  ON "opportunities"
  FOR DELETE
  USING (auth.is_admin());

-- ============================================
-- TASKS TABLE POLICIES
-- ============================================

-- Users can view their own tasks
CREATE POLICY "tasks_select_own"
  ON "tasks"
  FOR SELECT
  USING ("ownerId" = auth.user_id());

-- Admins can view all tasks
CREATE POLICY "tasks_select_admin"
  ON "tasks"
  FOR SELECT
  USING (auth.is_admin());

-- Managers can view team tasks
CREATE POLICY "tasks_select_manager"
  ON "tasks"
  FOR SELECT
  USING (
    auth.is_manager()
    AND "ownerId" IN (SELECT auth.team_member_ids())
  );

-- Users can insert tasks (they become the owner)
CREATE POLICY "tasks_insert_own"
  ON "tasks"
  FOR INSERT
  WITH CHECK ("ownerId" = auth.user_id());

-- Admins can insert tasks for anyone
CREATE POLICY "tasks_insert_admin"
  ON "tasks"
  FOR INSERT
  WITH CHECK (auth.is_admin());

-- Users can update their own tasks
CREATE POLICY "tasks_update_own"
  ON "tasks"
  FOR UPDATE
  USING ("ownerId" = auth.user_id())
  WITH CHECK ("ownerId" = auth.user_id());

-- Admins can update any task
CREATE POLICY "tasks_update_admin"
  ON "tasks"
  FOR UPDATE
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());

-- Users can delete their own tasks
CREATE POLICY "tasks_delete_own"
  ON "tasks"
  FOR DELETE
  USING ("ownerId" = auth.user_id());

-- Admins can delete any task
CREATE POLICY "tasks_delete_admin"
  ON "tasks"
  FOR DELETE
  USING (auth.is_admin());

-- ============================================
-- AI SCORES TABLE POLICIES
-- ============================================

-- Users can view AI scores for their own leads
CREATE POLICY "ai_scores_select_own"
  ON "ai_scores"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM leads
      WHERE leads.id = "ai_scores"."leadId"
        AND leads."ownerId" = auth.user_id()
    )
  );

-- Admins can view all AI scores
CREATE POLICY "ai_scores_select_admin"
  ON "ai_scores"
  FOR SELECT
  USING (auth.is_admin());

-- Managers can view AI scores for team leads
CREATE POLICY "ai_scores_select_manager"
  ON "ai_scores"
  FOR SELECT
  USING (
    auth.is_manager()
    AND EXISTS (
      SELECT 1 FROM leads
      WHERE leads.id = "ai_scores"."leadId"
        AND leads."ownerId" IN (SELECT auth.team_member_ids())
    )
  );

-- Only system/admin can insert AI scores
CREATE POLICY "ai_scores_insert_admin"
  ON "ai_scores"
  FOR INSERT
  WITH CHECK (auth.is_admin());

-- AI scores are immutable (no updates)
-- Only admins can delete AI scores (for cleanup)
CREATE POLICY "ai_scores_delete_admin"
  ON "ai_scores"
  FOR DELETE
  USING (auth.is_admin());

-- ============================================
-- AUDIT LOGS TABLE POLICIES
-- ============================================

-- Users can view their own audit logs
CREATE POLICY "audit_logs_select_own"
  ON "audit_logs"
  FOR SELECT
  USING ("userId" = auth.user_id());

-- Admins can view all audit logs
CREATE POLICY "audit_logs_select_admin"
  ON "audit_logs"
  FOR SELECT
  USING (auth.is_admin());

-- Managers can view team audit logs
CREATE POLICY "audit_logs_select_manager"
  ON "audit_logs"
  FOR SELECT
  USING (
    auth.is_manager()
    AND "userId" IN (SELECT auth.team_member_ids())
  );

-- Only system can insert audit logs
CREATE POLICY "audit_logs_insert_system"
  ON "audit_logs"
  FOR INSERT
  WITH CHECK (auth.is_admin());

-- Audit logs are immutable (no updates or deletes except by admin)
CREATE POLICY "audit_logs_delete_admin"
  ON "audit_logs"
  FOR DELETE
  USING (auth.is_admin());

-- ============================================
-- DOMAIN EVENTS TABLE POLICIES
-- ============================================

-- Users can view events related to their entities
CREATE POLICY "domain_events_select_own"
  ON "domain_events"
  FOR SELECT
  USING (
    -- Check if user owns the aggregate
    CASE "aggregateType"
      WHEN 'Lead' THEN EXISTS (
        SELECT 1 FROM leads
        WHERE leads.id = "domain_events"."aggregateId"
          AND leads."ownerId" = auth.user_id()
      )
      WHEN 'Contact' THEN EXISTS (
        SELECT 1 FROM contacts
        WHERE contacts.id = "domain_events"."aggregateId"
          AND contacts."ownerId" = auth.user_id()
      )
      WHEN 'Account' THEN EXISTS (
        SELECT 1 FROM accounts
        WHERE accounts.id = "domain_events"."aggregateId"
          AND accounts."ownerId" = auth.user_id()
      )
      WHEN 'Opportunity' THEN EXISTS (
        SELECT 1 FROM opportunities
        WHERE opportunities.id = "domain_events"."aggregateId"
          AND opportunities."ownerId" = auth.user_id()
      )
      ELSE false
    END
  );

-- Admins can view all events
CREATE POLICY "domain_events_select_admin"
  ON "domain_events"
  FOR SELECT
  USING (auth.is_admin());

-- Only system can insert domain events
CREATE POLICY "domain_events_insert_system"
  ON "domain_events"
  FOR INSERT
  WITH CHECK (auth.is_admin());

-- Only system can update domain events (for processing status)
CREATE POLICY "domain_events_update_system"
  ON "domain_events"
  FOR UPDATE
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());

-- Only admins can delete events (for cleanup)
CREATE POLICY "domain_events_delete_admin"
  ON "domain_events"
  FOR DELETE
  USING (auth.is_admin());

-- ============================================
-- BYPASS RLS FOR SERVICE ROLE
-- ============================================

-- The service role key should be used for:
-- - Backend API operations
-- - Scheduled jobs
-- - System processes
-- - AI scoring operations
--
-- Service role bypasses all RLS policies automatically
-- Ensure service role key is kept secure and never exposed to frontend

-- ============================================
-- TESTING RLS POLICIES
-- ============================================

-- To test RLS policies, use these commands:
--
-- 1. Create test users with different roles:
--    INSERT INTO users (id, email, name, role) VALUES
--      ('user1', 'user@test.com', 'Test User', 'USER'),
--      ('manager1', 'manager@test.com', 'Test Manager', 'MANAGER'),
--      ('admin1', 'admin@test.com', 'Test Admin', 'ADMIN');
--
-- 2. Set JWT claims to simulate different users:
--    SET request.jwt.claims = '{"sub": "user1", "role": "authenticated"}';
--
-- 3. Run queries and verify access control works as expected
--
-- 4. Reset to service role:
--    RESET request.jwt.claims;

-- ============================================
-- PERFORMANCE NOTES
-- ============================================

-- RLS policies can impact query performance. Optimizations:
--
-- 1. Indexes on ownerId columns (already created in schema)
-- 2. SECURITY DEFINER functions for complex checks
-- 3. Consider materialized views for manager team hierarchies
-- 4. Use service role for batch operations
-- 5. Cache user role in application layer
-- 6. Monitor slow query logs for RLS policy overhead
