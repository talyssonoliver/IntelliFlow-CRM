-- PG-200: Replace tenant-wide unique constraint with scope-aware partial indexes.
-- Private templates must be unique per owner; shared templates unique per tenant.

-- Drop the tenant-wide unique constraint added in the initial migration.
DROP INDEX IF EXISTS "report_templates_tenantId_name_key";

-- Private templates: one user cannot have two private templates with the same name.
CREATE UNIQUE INDEX "report_templates_private_owner_name_key"
  ON "report_templates" ("tenantId", "createdBy", "name")
  WHERE "sharingScope" = 'private';

-- Shared templates (team or tenant scope): name must be unique within the tenant.
CREATE UNIQUE INDEX "report_templates_shared_tenant_name_key"
  ON "report_templates" ("tenantId", "name")
  WHERE "sharingScope" != 'private';

-- Add a non-unique covering index for (tenantId, name) lookups.
CREATE INDEX "report_templates_tenantId_name_idx"
  ON "report_templates" ("tenantId", "name");
