-- Move vector extension from public schema to dedicated extensions schema
-- This follows PostgreSQL best practices to avoid polluting the public namespace
-- Migration: 20260122000000_move_vector_to_extensions_schema

-- ============================================
-- CREATE EXTENSIONS SCHEMA
-- ============================================

-- Create dedicated schema for PostgreSQL extensions
CREATE SCHEMA IF NOT EXISTS extensions;

-- Grant usage on the extensions schema to relevant roles
-- This ensures the extension objects are accessible
GRANT USAGE ON SCHEMA extensions TO postgres;
GRANT USAGE ON SCHEMA extensions TO anon;
GRANT USAGE ON SCHEMA extensions TO authenticated;
GRANT USAGE ON SCHEMA extensions TO service_role;

-- ============================================
-- MOVE VECTOR EXTENSION
-- ============================================

-- Move the vector extension to the extensions schema
-- This is a non-destructive operation that relocates extension objects
ALTER EXTENSION vector SET SCHEMA extensions;

-- ============================================
-- UPDATE SEARCH PATH FOR DATABASE ROLES
-- ============================================

-- Update search_path for relevant roles to include extensions schema
-- This ensures unqualified references to vector types/operators still work

-- For the postgres superuser role
ALTER ROLE postgres SET search_path = extensions, public;

-- For Supabase-specific roles (if they exist)
-- Note: supabase_admin is a reserved role and cannot be modified without superuser
DO $$
BEGIN
  -- anon role (unauthenticated access)
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'ALTER ROLE anon SET search_path = extensions, public';
  END IF;

  -- authenticated role (authenticated users)
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'ALTER ROLE authenticated SET search_path = extensions, public';
  END IF;

  -- service_role (backend service access)
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'ALTER ROLE service_role SET search_path = extensions, public';
  END IF;

  -- Note: supabase_admin is reserved and managed by Supabase platform
  -- The extensions schema is already in extra_search_path via config.toml
END $$;

-- ============================================
-- VERIFY MIGRATION
-- ============================================

-- Create a verification function to ensure the migration succeeded
CREATE OR REPLACE FUNCTION verify_vector_extension_schema()
RETURNS TABLE (
  extension_name name,
  schema_name name,
  status text
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.extname as extension_name,
    n.nspname as schema_name,
    CASE
      WHEN n.nspname = 'extensions' THEN 'SUCCESS: vector extension in extensions schema'
      ELSE 'WARNING: vector extension in ' || n.nspname || ' schema'
    END as status
  FROM pg_extension e
  JOIN pg_namespace n ON e.extnamespace = n.oid
  WHERE e.extname = 'vector';
END;
$$;

-- Run verification (outputs to migration log)
SELECT * FROM verify_vector_extension_schema();

-- Clean up verification function
DROP FUNCTION verify_vector_extension_schema();

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON SCHEMA extensions IS 'Dedicated schema for PostgreSQL extensions to keep public schema clean';
