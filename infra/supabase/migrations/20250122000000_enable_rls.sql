-- RLS Enablement Migration for IntelliFlow CRM
-- This migration enables Row Level Security on all core tables
--
-- Related: IFC-072 (Zero Trust Security - Sprint 1)
-- ADR: docs/planning/adr/ADR-009-zero-trust-security.md
-- Design: docs/security/rls-design.md
--
-- NOTE: This is a SKELETON migration for Sprint 1 design.
-- Actual policies are applied in later sprints when tables exist.
--
-- Migration: 20250122000000_enable_rls
-- Purpose: Enable RLS on all tables to prepare for policy application
-- Status: READY FOR REVIEW - Apply after schema migration

-- ============================================
-- ENABLE RLS ON ALL CORE TABLES
-- ============================================

-- Auth & Users
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;

-- CRM Core Entities
ALTER TABLE "leads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "opportunities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;

-- AI & Intelligence
ALTER TABLE "ai_scores" ENABLE ROW LEVEL SECURITY;

-- Audit & Events
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "domain_events" ENABLE ROW LEVEL SECURITY;

-- ============================================
-- VERIFICATION
-- ============================================

-- Verify RLS is enabled on all tables
DO $$
DECLARE
  table_name TEXT;
  missing_rls TEXT[] := ARRAY[]::TEXT[];
BEGIN
  FOR table_name IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN (
        'users', 'leads', 'contacts', 'accounts', 'opportunities',
        'tasks', 'ai_scores', 'audit_logs', 'domain_events'
      )
  LOOP
    -- Check if RLS is enabled
    IF NOT EXISTS (
      SELECT 1 FROM pg_class
      WHERE relname = table_name
        AND relrowsecurity = true
    ) THEN
      missing_rls := array_append(missing_rls, table_name);
    END IF;
  END LOOP;

  IF array_length(missing_rls, 1) > 0 THEN
    RAISE EXCEPTION 'RLS not enabled on tables: %', array_to_string(missing_rls, ', ');
  END IF;

  RAISE NOTICE 'RLS enabled on all core tables ✓';
END $$;

-- ============================================
-- NOTES FOR POLICY APPLICATION (SPRINT 2-3)
-- ============================================

-- IMPORTANT: RLS is now enabled but NO POLICIES are defined yet.
-- This means:
-- 1. Service role (backend) can still access all data (bypasses RLS)
-- 2. User connections will have NO access until policies are created
-- 3. Next migration (20250123000000_rls_helper_functions.sql) will add helper functions
-- 4. Migration after that (20250124000000_rls_policies.sql) will create actual policies

-- Recommended order for Sprint 2-3:
-- 1. Apply this migration (enable RLS)
-- 2. Apply helper functions migration
-- 3. Apply RLS policies migration
-- 4. Test with integration tests
-- 5. Monitor performance impact

-- ============================================
-- ROLLBACK INSTRUCTIONS
-- ============================================

-- To disable RLS (if needed for debugging):
-- ALTER TABLE "users" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "leads" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "contacts" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "accounts" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "opportunities" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "tasks" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "ai_scores" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "audit_logs" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "domain_events" DISABLE ROW LEVEL SECURITY;

-- WARNING: Disabling RLS removes database-level security enforcement!
-- Only disable for local development/debugging, NEVER in production.
