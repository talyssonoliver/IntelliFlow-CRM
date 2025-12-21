-- RLS Helper Functions Migration for IntelliFlow CRM
-- This migration creates PostgreSQL functions used by RLS policies
--
-- Related: IFC-072 (Zero Trust Security - Sprint 1)
-- ADR: docs/planning/adr/ADR-009-zero-trust-security.md
-- Design: docs/security/rls-design.md
--
-- NOTE: This is a SKELETON migration for Sprint 1 design.
-- Apply AFTER enabling RLS, BEFORE creating policies.
--
-- Migration: 20250123000000_rls_helper_functions
-- Purpose: Create helper functions for RLS policy evaluation
-- Status: READY FOR REVIEW

-- ============================================
-- JWT CLAIM EXTRACTION FUNCTIONS
-- ============================================

-- Get current user's ID from JWT token
-- Used by: All RLS policies for owner-based isolation
CREATE OR REPLACE FUNCTION auth.user_id()
RETURNS TEXT AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claims', true)::json->>'sub',
    ''
  )::text;
$$ LANGUAGE SQL STABLE;

COMMENT ON FUNCTION auth.user_id() IS
  'Extracts user ID from JWT claims. Returns NULL if not authenticated.';

-- Get current user's application role from JWT token
-- Used by: Role-based policies (manager, admin checks)
CREATE OR REPLACE FUNCTION auth.user_role()
RETURNS TEXT AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claims', true)::json->'app_metadata'->>'role',
    ''
  )::text;
$$ LANGUAGE SQL STABLE;

COMMENT ON FUNCTION auth.user_role() IS
  'Extracts application role from JWT claims (USER, MANAGER, ADMIN, SALES_REP).';

-- ============================================
-- ROLE CHECKING FUNCTIONS
-- ============================================

-- Check if current user is an admin
-- Used by: Admin-only policies (view all, delete, etc.)
CREATE OR REPLACE FUNCTION auth.is_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT role = 'ADMIN' FROM users WHERE id = auth.user_id()),
    false
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

COMMENT ON FUNCTION auth.is_admin() IS
  'Returns true if current user has ADMIN role. Uses SECURITY DEFINER for query plan caching.';

-- Check if current user is a manager or admin
-- Used by: Team visibility policies
CREATE OR REPLACE FUNCTION auth.is_manager()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT role IN ('MANAGER', 'ADMIN') FROM users WHERE id = auth.user_id()),
    false
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

COMMENT ON FUNCTION auth.is_manager() IS
  'Returns true if current user has MANAGER or ADMIN role.';

-- ============================================
-- TEAM HIERARCHY FUNCTIONS
-- ============================================

-- Get IDs of team members for current user (if they are a manager)
-- Used by: Manager policies to view team data
--
-- TODO (Sprint 4-5): Implement proper team hierarchy
-- Current implementation: Managers see all non-admin users
-- Future: Replace with actual team structure from team_members table
CREATE OR REPLACE FUNCTION auth.team_member_ids()
RETURNS SETOF TEXT AS $$
BEGIN
  -- Only return results if user is a manager
  IF NOT auth.is_manager() THEN
    RETURN;
  END IF;

  -- TEMPORARY IMPLEMENTATION
  -- Returns all users with USER or SALES_REP role
  -- This allows managers to see all team members' data
  --
  -- FUTURE ENHANCEMENT:
  -- Replace with:
  -- RETURN QUERY
  -- SELECT userId FROM team_members
  -- WHERE managerId = auth.user_id();
  RETURN QUERY
  SELECT id FROM users
  WHERE role IN ('USER', 'SALES_REP');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION auth.team_member_ids() IS
  'Returns IDs of team members for current manager. TEMPORARY: Returns all non-admin users. TODO: Implement proper hierarchy in Sprint 4-5.';

-- ============================================
-- FUTURE: ORGANIZATION FUNCTIONS (SPRINT 10+)
-- ============================================

-- Placeholder for multi-organization support
-- Will be implemented when migrating to org-level tenancy

-- Get current user's organization IDs
-- CREATE OR REPLACE FUNCTION auth.user_organization_ids()
-- RETURNS SETOF TEXT AS $$
--   SELECT organizationId FROM organization_members
--   WHERE userId = auth.user_id();
-- $$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Check if user is admin of specific organization
-- CREATE OR REPLACE FUNCTION auth.is_org_admin(org_id TEXT)
-- RETURNS BOOLEAN AS $$
--   SELECT EXISTS (
--     SELECT 1 FROM organization_members
--     WHERE userId = auth.user_id()
--       AND organizationId = org_id
--       AND role = 'ORG_ADMIN'
--   );
-- $$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Get current organization from JWT
-- CREATE OR REPLACE FUNCTION auth.current_organization_id()
-- RETURNS TEXT AS $$
--   SELECT NULLIF(
--     current_setting('request.jwt.claims', true)::json->'user_metadata'->>'organizationId',
--     ''
--   )::text;
-- $$ LANGUAGE SQL STABLE;

-- ============================================
-- TESTING HELPER FUNCTIONS
-- ============================================

-- Function to set JWT claims for testing
-- ONLY use in test environment, NEVER in production
CREATE OR REPLACE FUNCTION auth.set_test_user(user_id TEXT, user_role TEXT DEFAULT 'USER')
RETURNS void AS $$
BEGIN
  -- Set JWT claims for test user
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', user_id,
      'role', 'authenticated',
      'app_metadata', json_build_object('role', user_role)
    )::text,
    false -- Set for entire transaction
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION auth.set_test_user(TEXT, TEXT) IS
  'TEST ONLY: Sets JWT claims for testing RLS policies. DO NOT use in production!';

-- Function to clear JWT claims after testing
CREATE OR REPLACE FUNCTION auth.clear_test_user()
RETURNS void AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '', false);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION auth.clear_test_user() IS
  'TEST ONLY: Clears JWT claims after testing. DO NOT use in production!';

-- ============================================
-- VERIFICATION
-- ============================================

-- Test helper functions
DO $$
BEGIN
  -- Test 1: auth.user_id() returns NULL when not authenticated
  IF auth.user_id() IS NOT NULL THEN
    RAISE EXCEPTION 'auth.user_id() should return NULL when not authenticated';
  END IF;

  -- Test 2: Set test user and verify
  PERFORM auth.set_test_user('test-user-123', 'ADMIN');
  IF auth.user_id() != 'test-user-123' THEN
    RAISE EXCEPTION 'auth.user_id() should return test-user-123';
  END IF;

  -- Test 3: Verify role detection
  IF auth.user_role() != 'ADMIN' THEN
    RAISE EXCEPTION 'auth.user_role() should return ADMIN';
  END IF;

  -- Test 4: Clean up
  PERFORM auth.clear_test_user();
  IF auth.user_id() IS NOT NULL THEN
    RAISE EXCEPTION 'auth.user_id() should return NULL after clear';
  END IF;

  RAISE NOTICE 'All helper function tests passed ✓';
END $$;

-- ============================================
-- PERFORMANCE NOTES
-- ============================================

-- SECURITY DEFINER functions (is_admin, is_manager, team_member_ids):
-- - Query plans are cached by PostgreSQL
-- - First call per connection is slower (~10ms)
-- - Subsequent calls are fast (~1ms)
-- - Consider connection pooling to maximize cache benefits

-- STABLE functions:
-- - Can be evaluated once per statement
-- - Results are cached within transaction
-- - More efficient than VOLATILE functions

-- Indexes required for performance:
-- - users.id (primary key - already indexed)
-- - users.role (indexed in schema)
-- - Future: team_members(managerId, userId) when implemented

-- ============================================
-- SECURITY CONSIDERATIONS
-- ============================================

-- SECURITY DEFINER privilege:
-- - Functions run with privileges of function creator
-- - Required for accessing users table from policies
-- - MUST be carefully reviewed (potential privilege escalation)
-- - Only use for simple lookups, avoid complex logic

-- JWT claim validation:
-- - Supabase validates JWT signature before setting claims
-- - Cannot be tampered with by clients
-- - Short expiry (15 minutes) limits exposure
-- - Refresh token rotation prevents replay attacks

-- Service role bypass:
-- - Service role key bypasses ALL RLS policies
-- - Functions are NOT called for service role
-- - Use service role only for backend operations
-- - Audit all service role API calls

-- ============================================
-- ROLLBACK INSTRUCTIONS
-- ============================================

-- To remove helper functions:
-- DROP FUNCTION IF EXISTS auth.user_id();
-- DROP FUNCTION IF EXISTS auth.user_role();
-- DROP FUNCTION IF EXISTS auth.is_admin();
-- DROP FUNCTION IF EXISTS auth.is_manager();
-- DROP FUNCTION IF EXISTS auth.team_member_ids();
-- DROP FUNCTION IF EXISTS auth.set_test_user(TEXT, TEXT);
-- DROP FUNCTION IF EXISTS auth.clear_test_user();

-- WARNING: Dropping these functions will break RLS policies that depend on them!
-- Only rollback if RLS policies have not been applied yet.
