-- Migration: add_workflow_deleted_at
-- IFC-031: Workflow Builder UI — soft-delete support
--
-- Adds deletedAt column to workflow_definitions.
-- Replaces the broad @@unique([tenantId, name]) constraint with a partial
-- unique index that only applies to active (non-deleted) rows, allowing
-- name reuse after soft-deletion.

-- Step 1: Add deletedAt column (nullable, default NULL = active)
ALTER TABLE "workflow_definitions" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Step 2: Add index on deletedAt for query performance
CREATE INDEX "workflow_definitions_deletedAt_idx" ON "workflow_definitions" ("deletedAt");

-- Step 3: Drop the broad unique constraint (blocks name reuse after soft-delete)
DROP INDEX IF EXISTS "workflow_definitions_tenantId_name_key";

-- Step 4: Create partial unique index — only active rows must have unique names per tenant
CREATE UNIQUE INDEX "workflow_definitions_tenantId_name_active_key"
  ON "workflow_definitions" ("tenantId", "name")
  WHERE "deletedAt" IS NULL;
