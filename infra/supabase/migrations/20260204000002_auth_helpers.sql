-- =====================================================
-- Auth Helper Functions for RLS Policies
-- These functions support multi-tenant row-level security
-- =====================================================

-- Create auth schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS auth;

-- Function to get current tenant ID from JWT claims or session
-- In production Supabase, this extracts from auth.jwt() claims
-- For development, we use current_setting with a fallback
CREATE OR REPLACE FUNCTION auth.tenant_id()
RETURNS TEXT AS $$
BEGIN
  -- Try to get tenant_id from JWT claims (production Supabase)
  BEGIN
    RETURN (current_setting('request.jwt.claims', true)::json->>'tenant_id');
  EXCEPTION WHEN OTHERS THEN
    -- Fallback to session variable for development
    BEGIN
      RETURN current_setting('app.current_tenant_id', true);
    EXCEPTION WHEN OTHERS THEN
      RETURN NULL;
    END;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if current role is service role
-- In production Supabase, service_role bypasses RLS
-- For development, we check current user or session variable
CREATE OR REPLACE FUNCTION auth.is_service_role()
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if current role is service_role or postgres (superuser)
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN TRUE;
  END IF;

  -- Check session variable for service role flag
  BEGIN
    RETURN current_setting('app.is_service_role', true)::boolean;
  EXCEPTION WHEN OTHERS THEN
    RETURN FALSE;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT USAGE ON SCHEMA auth TO PUBLIC;
GRANT EXECUTE ON FUNCTION auth.tenant_id() TO PUBLIC;
GRANT EXECUTE ON FUNCTION auth.is_service_role() TO PUBLIC;
