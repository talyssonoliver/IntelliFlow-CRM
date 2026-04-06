-- IFC-185: Add composite indexes for Account tRPC Router performance
-- These indexes support the getContacts, getOpportunities, and getActivity endpoints
-- Target: All endpoints < 200ms response time

-- =============================================================================
-- Contact indexes for getContacts endpoint
-- =============================================================================

-- Composite index for tenant-scoped account queries
-- Supports: WHERE accountId = ? AND tenantId = ?
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Contact_accountId_tenantId_idx"
  ON "contacts" ("accountId", "tenantId");

-- Composite index for paginated queries with cursor
-- Supports: WHERE accountId = ? ORDER BY createdAt DESC
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Contact_accountId_createdAt_idx"
  ON "contacts" ("accountId", "createdAt" DESC);

-- =============================================================================
-- Opportunity indexes for getOpportunities endpoint
-- =============================================================================

-- Composite index for tenant-scoped account queries
-- Supports: WHERE accountId = ? AND tenantId = ?
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Opportunity_accountId_tenantId_idx"
  ON "opportunities" ("accountId", "tenantId");

-- Composite index for pipeline stage filtering
-- Supports: WHERE accountId = ? AND stage = ?
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Opportunity_accountId_stage_idx"
  ON "opportunities" ("accountId", "stage");

-- Composite index for paginated queries with cursor
-- Supports: WHERE accountId = ? ORDER BY createdAt DESC
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Opportunity_accountId_createdAt_idx"
  ON "opportunities" ("accountId", "createdAt" DESC);

-- =============================================================================
-- Activity indexes for getActivity endpoint
-- =============================================================================

-- ContactActivity: Composite index for time-ordered queries
-- Supports: WHERE contactId = ? ORDER BY timestamp DESC
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactActivity_contactId_timestamp_idx"
  ON "contact_activities" ("contactId", "timestamp" DESC);

-- ActivityEvent: Composite index for time-ordered queries
-- Supports: WHERE opportunityId = ? ORDER BY timestamp DESC
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ActivityEvent_opportunityId_timestamp_idx"
  ON "activity_events" ("opportunityId", "timestamp" DESC);

-- =============================================================================
-- Account indexes (additional)
-- =============================================================================

-- Composite index for industry filtering with tenant isolation
-- Supports: WHERE tenantId = ? AND industry = ?
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Account_tenantId_industry_idx"
  ON "accounts" ("tenantId", "industry");
