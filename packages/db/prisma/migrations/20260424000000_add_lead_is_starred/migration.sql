-- PG-059: sidebar "Starred" view on /leads
-- Adds a per-row star flag + a tenant-scoped composite index for
-- `?view=starred` filtering per current user.

ALTER TABLE "leads" ADD COLUMN "isStarred" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "leads_tenantId_ownerId_isStarred_idx"
  ON "leads" ("tenantId", "ownerId", "isStarred");
