-- Row-Level Security Policies for IntelliFlow CRM
-- Task: IFC-127 - Tenant Isolation at Database and Application Layers
-- Created: 2025-12-29
-- Updated: 2025-12-29 - Fixed table names to match Prisma @@map() directives

-- =============================================================================
-- Enable RLS on all tenant-scoped tables
-- NOTE: Table names must match Prisma @@map() directives (lowercase snake_case)
-- =============================================================================

ALTER TABLE "leads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "opportunities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "appointments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Lead Table Policies (table: leads)
-- =============================================================================

-- Policy: Users can only access leads they own
CREATE POLICY "lead_owner_access" ON "leads"
  FOR ALL
  USING (
    "ownerId" = (current_setting('request.jwt.claims', true)::json->>'sub')::text
    OR (current_setting('request.jwt.claims', true)::json->>'role') IN ('ADMIN', 'SERVICE')
  )
  WITH CHECK (
    "ownerId" = (current_setting('request.jwt.claims', true)::json->>'sub')::text
    OR (current_setting('request.jwt.claims', true)::json->>'role') IN ('ADMIN', 'SERVICE')
  );

-- Policy: Managers can view all leads (read-only)
CREATE POLICY "lead_manager_read" ON "leads"
  FOR SELECT
  USING (
    (current_setting('request.jwt.claims', true)::json->>'role') = 'MANAGER'
  );

-- =============================================================================
-- Contact Table Policies (table: contacts)
-- =============================================================================

CREATE POLICY "contact_owner_access" ON "contacts"
  FOR ALL
  USING (
    "ownerId" = (current_setting('request.jwt.claims', true)::json->>'sub')::text
    OR (current_setting('request.jwt.claims', true)::json->>'role') IN ('ADMIN', 'SERVICE')
  )
  WITH CHECK (
    "ownerId" = (current_setting('request.jwt.claims', true)::json->>'sub')::text
    OR (current_setting('request.jwt.claims', true)::json->>'role') IN ('ADMIN', 'SERVICE')
  );

CREATE POLICY "contact_manager_read" ON "contacts"
  FOR SELECT
  USING (
    (current_setting('request.jwt.claims', true)::json->>'role') = 'MANAGER'
  );

-- =============================================================================
-- Account Table Policies (table: accounts)
-- =============================================================================

CREATE POLICY "account_owner_access" ON "accounts"
  FOR ALL
  USING (
    "ownerId" = (current_setting('request.jwt.claims', true)::json->>'sub')::text
    OR (current_setting('request.jwt.claims', true)::json->>'role') IN ('ADMIN', 'SERVICE')
  )
  WITH CHECK (
    "ownerId" = (current_setting('request.jwt.claims', true)::json->>'sub')::text
    OR (current_setting('request.jwt.claims', true)::json->>'role') IN ('ADMIN', 'SERVICE')
  );

CREATE POLICY "account_manager_read" ON "accounts"
  FOR SELECT
  USING (
    (current_setting('request.jwt.claims', true)::json->>'role') = 'MANAGER'
  );

-- =============================================================================
-- Opportunity Table Policies (table: opportunities)
-- =============================================================================

CREATE POLICY "opportunity_owner_access" ON "opportunities"
  FOR ALL
  USING (
    "ownerId" = (current_setting('request.jwt.claims', true)::json->>'sub')::text
    OR (current_setting('request.jwt.claims', true)::json->>'role') IN ('ADMIN', 'SERVICE')
  )
  WITH CHECK (
    "ownerId" = (current_setting('request.jwt.claims', true)::json->>'sub')::text
    OR (current_setting('request.jwt.claims', true)::json->>'role') IN ('ADMIN', 'SERVICE')
  );

CREATE POLICY "opportunity_manager_read" ON "opportunities"
  FOR SELECT
  USING (
    (current_setting('request.jwt.claims', true)::json->>'role') = 'MANAGER'
  );

-- =============================================================================
-- Task Table Policies (table: tasks)
-- NOTE: Task model only has ownerId, no assignedToId field
-- =============================================================================

CREATE POLICY "task_owner_access" ON "tasks"
  FOR ALL
  USING (
    "ownerId" = (current_setting('request.jwt.claims', true)::json->>'sub')::text
    OR (current_setting('request.jwt.claims', true)::json->>'role') IN ('ADMIN', 'SERVICE')
  )
  WITH CHECK (
    "ownerId" = (current_setting('request.jwt.claims', true)::json->>'sub')::text
    OR (current_setting('request.jwt.claims', true)::json->>'role') IN ('ADMIN', 'SERVICE')
  );

CREATE POLICY "task_manager_read" ON "tasks"
  FOR SELECT
  USING (
    (current_setting('request.jwt.claims', true)::json->>'role') = 'MANAGER'
  );

-- =============================================================================
-- Appointment Table Policies (table: appointments)
-- NOTE: Appointment uses organizerId, not ownerId
-- =============================================================================

CREATE POLICY "appointment_organizer_access" ON "appointments"
  FOR ALL
  USING (
    "organizerId" = (current_setting('request.jwt.claims', true)::json->>'sub')::text
    OR (current_setting('request.jwt.claims', true)::json->>'role') IN ('ADMIN', 'SERVICE')
  )
  WITH CHECK (
    "organizerId" = (current_setting('request.jwt.claims', true)::json->>'sub')::text
    OR (current_setting('request.jwt.claims', true)::json->>'role') IN ('ADMIN', 'SERVICE')
  );

CREATE POLICY "appointment_manager_read" ON "appointments"
  FOR SELECT
  USING (
    (current_setting('request.jwt.claims', true)::json->>'role') = 'MANAGER'
  );

-- =============================================================================
-- Audit Log Policies (table: audit_logs) - Admin-only read, everyone can insert
-- =============================================================================

CREATE POLICY "audit_admin_read" ON "audit_logs"
  FOR SELECT
  USING (
    (current_setting('request.jwt.claims', true)::json->>'role') IN ('ADMIN', 'SERVICE')
  );

CREATE POLICY "audit_authenticated_insert" ON "audit_logs"
  FOR INSERT
  WITH CHECK (
    current_setting('request.jwt.claims', true)::json->>'sub' IS NOT NULL
  );

-- =============================================================================
-- Verification Queries
-- =============================================================================

-- Verify RLS is enabled on tables:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = true;

-- Verify policies exist:
-- SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public';
