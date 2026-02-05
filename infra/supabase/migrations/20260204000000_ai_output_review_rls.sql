-- =====================================================
-- IFC-178: AI Output Review RLS Policies
-- Human-in-the-loop review for AI-generated outputs
-- =====================================================

-- Create helper functions in public schema (if they don't exist)
-- These provide tenant isolation without requiring auth schema access

CREATE OR REPLACE FUNCTION public.get_current_tenant_id()
RETURNS TEXT AS $$
BEGIN
  -- Try to get from JWT claims first (Supabase production)
  BEGIN
    RETURN (current_setting('request.jwt.claims', true)::json->>'tenant_id');
  EXCEPTION WHEN OTHERS THEN
    -- Fallback to session variable (development/testing)
    BEGIN
      RETURN current_setting('app.current_tenant_id', true);
    EXCEPTION WHEN OTHERS THEN
      RETURN NULL;
    END;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_service_role()
RETURNS BOOLEAN AS $$
BEGIN
  -- Check for superuser or service roles
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN TRUE;
  END IF;
  -- Check session variable
  BEGIN
    RETURN current_setting('app.is_service_role', true)::boolean;
  EXCEPTION WHEN OTHERS THEN
    RETURN FALSE;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Enable RLS on both tables
ALTER TABLE ai_output_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_output_review_audit ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- ai_output_reviews table policies
-- =====================================================

-- Tenant isolation policy - users can only access reviews from their tenant
CREATE POLICY "ai_output_reviews_tenant_isolation"
ON ai_output_reviews
FOR ALL
USING ("tenantId" = public.get_current_tenant_id());

-- Service role bypass - allows backend services to access all reviews
CREATE POLICY "ai_output_reviews_service_role"
ON ai_output_reviews
FOR ALL
USING (public.is_service_role());

-- =====================================================
-- ai_output_review_audit table policies
-- =====================================================

-- SELECT: tenant isolation via parent review
-- Users can only read audit entries for reviews in their tenant
CREATE POLICY "ai_output_review_audit_tenant_select"
ON ai_output_review_audit
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM ai_output_reviews r
  WHERE r.id = ai_output_review_audit."reviewId"
  AND r."tenantId" = public.get_current_tenant_id()
));

-- INSERT: append-only for authorized users and service role
-- Audit entries can only be inserted, not updated or deleted (immutable)
CREATE POLICY "ai_output_review_audit_insert"
ON ai_output_review_audit
FOR INSERT
WITH CHECK (
  public.is_service_role() OR EXISTS (
    SELECT 1 FROM ai_output_reviews r
    WHERE r.id = "reviewId"
    AND r."tenantId" = public.get_current_tenant_id()
  )
);

-- Service role bypass for SELECT
CREATE POLICY "ai_output_review_audit_service_role"
ON ai_output_review_audit
FOR SELECT
USING (public.is_service_role());

-- NOTE: NO UPDATE or DELETE policies for audit table
-- This makes the audit trail immutable - entries can only be added, never modified or removed

-- =====================================================
-- Indexes for performance (RLS query optimization)
-- =====================================================
-- These are already defined in Prisma schema but adding explicit comments
-- for documentation purposes:
-- - ai_output_reviews: @@index([tenantId]) - used by tenant_id lookups
-- - ai_output_reviews: @@index([tenantId, status]) - used by queue queries
-- - ai_output_reviews: @@index([status, slaDeadline]) - used by SLA breach detection
-- - ai_output_review_audit: @@index([reviewId]) - used by FK lookups
