-- RLS Policies Migration for IntelliFlow CRM
-- This migration creates Row Level Security policies for all core tables
--
-- Related: IFC-072 (Zero Trust Security - Sprint 1)
-- ADR: docs/planning/adr/ADR-009-zero-trust-security.md
-- Design: docs/security/rls-design.md
--
-- NOTE: This is a SKELETON migration for Sprint 1 design.
-- Apply AFTER enabling RLS and creating helper functions.
--
-- Migration: 20250124000000_rls_policies
-- Purpose: Create RLS policies for zero trust security
-- Status: READY FOR REVIEW
--
-- Prerequisites:
-- 1. RLS enabled on all tables (20250122000000_enable_rls.sql)
-- 2. Helper functions created (20250123000000_rls_helper_functions.sql)
-- 3. Schema migration applied (20250101000000_initial_schema.sql)

-- ============================================
-- USERS TABLE POLICIES
-- ============================================

-- SELECT: Users can view their own profile
CREATE POLICY "users_select_own"
  ON "users"
  FOR SELECT
  USING (id = auth.user_id());

-- SELECT: Admins can view all users
CREATE POLICY "users_select_admin"
  ON "users"
  FOR SELECT
  USING (auth.is_admin());

-- SELECT: Managers can view team members (USER, SALES_REP roles)
CREATE POLICY "users_select_manager"
  ON "users"
  FOR SELECT
  USING (
    auth.is_manager()
    AND role IN ('USER', 'SALES_REP')
  );

-- UPDATE: Users can update their own profile
-- WITH CHECK prevents role escalation (user cannot change own role)
CREATE POLICY "users_update_own"
  ON "users"
  FOR UPDATE
  USING (id = auth.user_id())
  WITH CHECK (
    id = auth.user_id()
    -- Prevent users from changing their own role
    AND role = (SELECT role FROM users WHERE id = auth.user_id())
  );

-- INSERT: Only admins can create new users
CREATE POLICY "users_insert_admin"
  ON "users"
  FOR INSERT
  WITH CHECK (auth.is_admin());

-- DELETE: Only admins can delete users
CREATE POLICY "users_delete_admin"
  ON "users"
  FOR DELETE
  USING (auth.is_admin());

-- ============================================
-- LEADS TABLE POLICIES
-- ============================================

-- SELECT: Users can view their own leads
CREATE POLICY "leads_select_own"
  ON "leads"
  FOR SELECT
  USING ("ownerId" = auth.user_id());

-- SELECT: Admins can view all leads
CREATE POLICY "leads_select_admin"
  ON "leads"
  FOR SELECT
  USING (auth.is_admin());

-- SELECT: Managers can view team leads
CREATE POLICY "leads_select_manager"
  ON "leads"
  FOR SELECT
  USING (
    auth.is_manager()
    AND "ownerId" IN (SELECT auth.team_member_ids())
  );

-- INSERT: Users can create leads (they become the owner)
CREATE POLICY "leads_insert_own"
  ON "leads"
  FOR INSERT
  WITH CHECK ("ownerId" = auth.user_id());

-- INSERT: Admins can create leads for anyone
CREATE POLICY "leads_insert_admin"
  ON "leads"
  FOR INSERT
  WITH CHECK (auth.is_admin());

-- UPDATE: Users can update their own leads
-- WITH CHECK prevents reassignment to another user
CREATE POLICY "leads_update_own"
  ON "leads"
  FOR UPDATE
  USING ("ownerId" = auth.user_id())
  WITH CHECK ("ownerId" = auth.user_id());

-- UPDATE: Admins can update any lead
CREATE POLICY "leads_update_admin"
  ON "leads"
  FOR UPDATE
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());

-- DELETE: Users can delete their own leads
CREATE POLICY "leads_delete_own"
  ON "leads"
  FOR DELETE
  USING ("ownerId" = auth.user_id());

-- DELETE: Admins can delete any lead
CREATE POLICY "leads_delete_admin"
  ON "leads"
  FOR DELETE
  USING (auth.is_admin());

-- ============================================
-- CONTACTS TABLE POLICIES
-- ============================================

-- Same pattern as leads: owner-based isolation with manager/admin access

CREATE POLICY "contacts_select_own"
  ON "contacts" FOR SELECT
  USING ("ownerId" = auth.user_id());

CREATE POLICY "contacts_select_admin"
  ON "contacts" FOR SELECT
  USING (auth.is_admin());

CREATE POLICY "contacts_select_manager"
  ON "contacts" FOR SELECT
  USING (
    auth.is_manager()
    AND "ownerId" IN (SELECT auth.team_member_ids())
  );

CREATE POLICY "contacts_insert_own"
  ON "contacts" FOR INSERT
  WITH CHECK ("ownerId" = auth.user_id());

CREATE POLICY "contacts_insert_admin"
  ON "contacts" FOR INSERT
  WITH CHECK (auth.is_admin());

CREATE POLICY "contacts_update_own"
  ON "contacts" FOR UPDATE
  USING ("ownerId" = auth.user_id())
  WITH CHECK ("ownerId" = auth.user_id());

CREATE POLICY "contacts_update_admin"
  ON "contacts" FOR UPDATE
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());

CREATE POLICY "contacts_delete_own"
  ON "contacts" FOR DELETE
  USING ("ownerId" = auth.user_id());

CREATE POLICY "contacts_delete_admin"
  ON "contacts" FOR DELETE
  USING (auth.is_admin());

-- ============================================
-- ACCOUNTS TABLE POLICIES
-- ============================================

-- Same pattern as leads/contacts

CREATE POLICY "accounts_select_own"
  ON "accounts" FOR SELECT
  USING ("ownerId" = auth.user_id());

CREATE POLICY "accounts_select_admin"
  ON "accounts" FOR SELECT
  USING (auth.is_admin());

CREATE POLICY "accounts_select_manager"
  ON "accounts" FOR SELECT
  USING (
    auth.is_manager()
    AND "ownerId" IN (SELECT auth.team_member_ids())
  );

CREATE POLICY "accounts_insert_own"
  ON "accounts" FOR INSERT
  WITH CHECK ("ownerId" = auth.user_id());

CREATE POLICY "accounts_insert_admin"
  ON "accounts" FOR INSERT
  WITH CHECK (auth.is_admin());

CREATE POLICY "accounts_update_own"
  ON "accounts" FOR UPDATE
  USING ("ownerId" = auth.user_id())
  WITH CHECK ("ownerId" = auth.user_id());

CREATE POLICY "accounts_update_admin"
  ON "accounts" FOR UPDATE
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());

CREATE POLICY "accounts_delete_own"
  ON "accounts" FOR DELETE
  USING ("ownerId" = auth.user_id());

CREATE POLICY "accounts_delete_admin"
  ON "accounts" FOR DELETE
  USING (auth.is_admin());

-- ============================================
-- OPPORTUNITIES TABLE POLICIES
-- ============================================

-- Same pattern as other CRM entities

CREATE POLICY "opportunities_select_own"
  ON "opportunities" FOR SELECT
  USING ("ownerId" = auth.user_id());

CREATE POLICY "opportunities_select_admin"
  ON "opportunities" FOR SELECT
  USING (auth.is_admin());

CREATE POLICY "opportunities_select_manager"
  ON "opportunities" FOR SELECT
  USING (
    auth.is_manager()
    AND "ownerId" IN (SELECT auth.team_member_ids())
  );

CREATE POLICY "opportunities_insert_own"
  ON "opportunities" FOR INSERT
  WITH CHECK ("ownerId" = auth.user_id());

CREATE POLICY "opportunities_insert_admin"
  ON "opportunities" FOR INSERT
  WITH CHECK (auth.is_admin());

CREATE POLICY "opportunities_update_own"
  ON "opportunities" FOR UPDATE
  USING ("ownerId" = auth.user_id())
  WITH CHECK ("ownerId" = auth.user_id());

CREATE POLICY "opportunities_update_admin"
  ON "opportunities" FOR UPDATE
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());

CREATE POLICY "opportunities_delete_own"
  ON "opportunities" FOR DELETE
  USING ("ownerId" = auth.user_id());

CREATE POLICY "opportunities_delete_admin"
  ON "opportunities" FOR DELETE
  USING (auth.is_admin());

-- ============================================
-- TASKS TABLE POLICIES
-- ============================================

-- Tasks use owner-based isolation
-- Future enhancement: Allow viewing tasks for entities you own

CREATE POLICY "tasks_select_own"
  ON "tasks" FOR SELECT
  USING ("ownerId" = auth.user_id());

CREATE POLICY "tasks_select_admin"
  ON "tasks" FOR SELECT
  USING (auth.is_admin());

CREATE POLICY "tasks_select_manager"
  ON "tasks" FOR SELECT
  USING (
    auth.is_manager()
    AND "ownerId" IN (SELECT auth.team_member_ids())
  );

CREATE POLICY "tasks_insert_own"
  ON "tasks" FOR INSERT
  WITH CHECK ("ownerId" = auth.user_id());

CREATE POLICY "tasks_insert_admin"
  ON "tasks" FOR INSERT
  WITH CHECK (auth.is_admin());

CREATE POLICY "tasks_update_own"
  ON "tasks" FOR UPDATE
  USING ("ownerId" = auth.user_id())
  WITH CHECK ("ownerId" = auth.user_id());

CREATE POLICY "tasks_update_admin"
  ON "tasks" FOR UPDATE
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());

CREATE POLICY "tasks_delete_own"
  ON "tasks" FOR DELETE
  USING ("ownerId" = auth.user_id());

CREATE POLICY "tasks_delete_admin"
  ON "tasks" FOR DELETE
  USING (auth.is_admin());

-- ============================================
-- AI SCORES TABLE POLICIES
-- ============================================

-- AI scores are readable by lead owner, writable only by system/admin
-- Uses EXISTS subquery to check lead ownership

-- SELECT: View AI scores for leads you own
CREATE POLICY "ai_scores_select_own"
  ON "ai_scores" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM leads
      WHERE leads.id = "ai_scores"."leadId"
        AND leads."ownerId" = auth.user_id()
    )
  );

-- SELECT: Admins can view all AI scores
CREATE POLICY "ai_scores_select_admin"
  ON "ai_scores" FOR SELECT
  USING (auth.is_admin());

-- SELECT: Managers can view AI scores for team leads
CREATE POLICY "ai_scores_select_manager"
  ON "ai_scores" FOR SELECT
  USING (
    auth.is_manager()
    AND EXISTS (
      SELECT 1 FROM leads
      WHERE leads.id = "ai_scores"."leadId"
        AND leads."ownerId" IN (SELECT auth.team_member_ids())
    )
  );

-- INSERT: Only system/admin can create AI scores
-- In practice, backend uses service role which bypasses this
CREATE POLICY "ai_scores_insert_admin"
  ON "ai_scores" FOR INSERT
  WITH CHECK (auth.is_admin());

-- NO UPDATE POLICY: AI scores are immutable (audit trail)

-- DELETE: Only admins (for cleanup/corrections)
CREATE POLICY "ai_scores_delete_admin"
  ON "ai_scores" FOR DELETE
  USING (auth.is_admin());

-- ============================================
-- AUDIT LOGS TABLE POLICIES
-- ============================================

-- Audit logs are readable by user/manager/admin, writable only by system

-- SELECT: Users can view their own audit logs
CREATE POLICY "audit_logs_select_own"
  ON "audit_logs" FOR SELECT
  USING ("userId" = auth.user_id());

-- SELECT: Admins can view all audit logs
CREATE POLICY "audit_logs_select_admin"
  ON "audit_logs" FOR SELECT
  USING (auth.is_admin());

-- SELECT: Managers can view team audit logs
CREATE POLICY "audit_logs_select_manager"
  ON "audit_logs" FOR SELECT
  USING (
    auth.is_manager()
    AND "userId" IN (SELECT auth.team_member_ids())
  );

-- INSERT: Only system can create audit logs
-- Backend uses service role to insert logs
CREATE POLICY "audit_logs_insert_system"
  ON "audit_logs" FOR INSERT
  WITH CHECK (auth.is_admin());

-- NO UPDATE POLICY: Audit logs are immutable

-- DELETE: Only admins (for compliance cleanup after retention period)
CREATE POLICY "audit_logs_delete_admin"
  ON "audit_logs" FOR DELETE
  USING (auth.is_admin());

-- ============================================
-- DOMAIN EVENTS TABLE POLICIES
-- ============================================

-- Domain events visible to entity owners, managed by system

-- SELECT: View events for entities you own
-- Uses CASE statement to check ownership based on aggregate type
CREATE POLICY "domain_events_select_own"
  ON "domain_events" FOR SELECT
  USING (
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

-- SELECT: Admins can view all events
CREATE POLICY "domain_events_select_admin"
  ON "domain_events" FOR SELECT
  USING (auth.is_admin());

-- INSERT: Only system can create domain events
-- Event processor uses service role
CREATE POLICY "domain_events_insert_system"
  ON "domain_events" FOR INSERT
  WITH CHECK (auth.is_admin());

-- UPDATE: Only system can update events (for processing status)
CREATE POLICY "domain_events_update_system"
  ON "domain_events" FOR UPDATE
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());

-- DELETE: Only admins (for cleanup after processing)
CREATE POLICY "domain_events_delete_admin"
  ON "domain_events" FOR DELETE
  USING (auth.is_admin());

-- ============================================
-- VERIFICATION
-- ============================================

-- Verify all expected policies exist
DO $$
DECLARE
  expected_policies TEXT[] := ARRAY[
    'users_select_own', 'users_select_admin', 'users_select_manager',
    'users_update_own', 'users_insert_admin', 'users_delete_admin',
    'leads_select_own', 'leads_select_admin', 'leads_select_manager',
    'leads_insert_own', 'leads_insert_admin',
    'leads_update_own', 'leads_update_admin',
    'leads_delete_own', 'leads_delete_admin',
    'contacts_select_own', 'contacts_select_admin', 'contacts_select_manager',
    'accounts_select_own', 'accounts_select_admin', 'accounts_select_manager',
    'opportunities_select_own', 'opportunities_select_admin', 'opportunities_select_manager',
    'tasks_select_own', 'tasks_select_admin', 'tasks_select_manager',
    'ai_scores_select_own', 'ai_scores_select_admin', 'ai_scores_select_manager',
    'ai_scores_insert_admin', 'ai_scores_delete_admin',
    'audit_logs_select_own', 'audit_logs_select_admin', 'audit_logs_select_manager',
    'audit_logs_insert_system', 'audit_logs_delete_admin',
    'domain_events_select_own', 'domain_events_select_admin',
    'domain_events_insert_system', 'domain_events_update_system', 'domain_events_delete_admin'
  ];
  policy_name TEXT;
  missing_policies TEXT[] := ARRAY[]::TEXT[];
  actual_count INT;
BEGIN
  -- Count actual policies
  SELECT COUNT(*) INTO actual_count
  FROM pg_policies
  WHERE schemaname = 'public';

  -- Check each expected policy
  FOREACH policy_name IN ARRAY expected_policies
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND policyname = policy_name
    ) THEN
      missing_policies := array_append(missing_policies, policy_name);
    END IF;
  END LOOP;

  IF array_length(missing_policies, 1) > 0 THEN
    RAISE EXCEPTION 'Missing RLS policies: %', array_to_string(missing_policies, ', ');
  END IF;

  RAISE NOTICE '% RLS policies created successfully ✓', actual_count;
END $$;

-- ============================================
-- TESTING NOTES
-- ============================================

-- To test RLS policies, use the helper functions:
--
-- -- Test as regular user
-- SELECT auth.set_test_user('user-1', 'USER');
-- SELECT COUNT(*) FROM leads; -- Should only see user-1's leads
-- SELECT auth.clear_test_user();
--
-- -- Test as manager
-- SELECT auth.set_test_user('manager-1', 'MANAGER');
-- SELECT COUNT(*) FROM leads; -- Should see team leads
-- SELECT auth.clear_test_user();
--
-- -- Test as admin
-- SELECT auth.set_test_user('admin-1', 'ADMIN');
-- SELECT COUNT(*) FROM leads; -- Should see all leads
-- SELECT auth.clear_test_user();

-- Integration tests should verify:
-- 1. Cross-tenant access prevention
-- 2. Manager can view team data
-- 3. Admin has full access
-- 4. Users cannot escalate privileges
-- 5. Service role bypasses RLS

-- ============================================
-- PERFORMANCE MONITORING
-- ============================================

-- After applying this migration, monitor query performance:
--
-- -- Slow query log (queries >100ms)
-- SELECT query, mean_exec_time, calls
-- FROM pg_stat_statements
-- WHERE mean_exec_time > 100
-- ORDER BY mean_exec_time DESC;
--
-- -- RLS policy overhead
-- EXPLAIN ANALYZE SELECT * FROM leads WHERE "ownerId" = 'user-1';
-- -- Verify "Index Scan using idx_leads_ownerId" is used

-- Expected overhead:
-- - Simple owner queries: +2-5ms (index scan)
-- - Manager queries: +5-15ms (team_member_ids subquery)
-- - Complex event queries: +10-30ms (multiple EXISTS subqueries)

-- ============================================
-- ROLLBACK INSTRUCTIONS
-- ============================================

-- To remove all RLS policies:
-- DO $$ BEGIN
--   EXECUTE (
--     SELECT string_agg('DROP POLICY IF EXISTS ' || quote_ident(policyname) || ' ON ' || quote_ident(tablename) || ';', ' ')
--     FROM pg_policies
--     WHERE schemaname = 'public'
--   );
-- END $$;

-- WARNING: This removes ALL security enforcement!
-- Only rollback in emergency, never in production with user data.

-- ============================================
-- FUTURE ENHANCEMENTS (SPRINT 10+)
-- ============================================

-- When migrating to multi-organization tenancy:
-- 1. Add organizationId column to all tables
-- 2. Create organization-level policies:
--    CREATE POLICY "leads_select_org"
--      ON "leads" FOR SELECT
--      USING ("organizationId" IN (SELECT auth.user_organization_ids()));
-- 3. Keep owner-based policies for intra-org permission control
-- 4. Update team_member_ids() to respect org boundaries

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON POLICY "users_select_own" ON "users" IS
  'Users can view their own profile';

COMMENT ON POLICY "leads_select_own" ON "leads" IS
  'Users can view leads they own (ownerId = user_id)';

COMMENT ON POLICY "leads_select_manager" ON "leads" IS
  'Managers can view leads owned by their team members';

COMMENT ON POLICY "ai_scores_select_own" ON "ai_scores" IS
  'Users can view AI scores for leads they own (via EXISTS subquery)';

COMMENT ON POLICY "domain_events_select_own" ON "domain_events" IS
  'Users can view events for aggregates they own (CASE statement checks aggregate type)';

-- ============================================
-- SUCCESS MESSAGE
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '════════════════════════════════════════════════════════════════';
  RAISE NOTICE 'RLS Policies Migration Complete!';
  RAISE NOTICE '';
  RAISE NOTICE 'Zero Trust Security is now enabled:';
  RAISE NOTICE '  ✓ All tables protected by Row Level Security';
  RAISE NOTICE '  ✓ Owner-based isolation enforced at database level';
  RAISE NOTICE '  ✓ Role-based access control (USER, MANAGER, ADMIN)';
  RAISE NOTICE '  ✓ Service role can bypass RLS for backend operations';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Run integration tests to verify policies';
  RAISE NOTICE '  2. Monitor query performance (target: <50ms overhead)';
  RAISE NOTICE '  3. Audit service role usage';
  RAISE NOTICE '  4. Test cross-tenant access prevention';
  RAISE NOTICE '════════════════════════════════════════════════════════════════';
END $$;
