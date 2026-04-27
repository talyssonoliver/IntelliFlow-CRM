-- IFC-211 — Goal Settings RBAC: tenant-wide default daily goal.
--
-- Adds the `tenant_goal_default` table holding the org-wide default goal
-- a tenant admin can set via home.setOrgGoalDefault.  Single row per tenant
-- (enforced by UNIQUE on tenantId).  home.getDailyGoal falls back to this
-- row when User.preferences.dailyGoal is unset, then to GOAL_DEFAULTS.
--
-- This migration is PURELY ADDITIVE.  No existing rows / columns / tables
-- are modified, dropped, or renamed.  RLS is enabled to follow the project
-- convention (see packages/db/prisma/migrations/20260420000000_enable_rls_*).

-- ============================================================
-- IFC-211: CreateTable tenant_goal_default
-- ============================================================

CREATE TABLE "tenant_goal_default" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "goalType" TEXT NOT NULL,
    "targetValue" INTEGER NOT NULL,
    "label" TEXT,
    "customUnit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "tenant_goal_default_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_goal_default_tenantId_key"
    ON "tenant_goal_default"("tenantId");

CREATE INDEX "tenant_goal_default_tenantId_idx"
    ON "tenant_goal_default"("tenantId");

ALTER TABLE "tenant_goal_default"
    ADD CONSTRAINT "tenant_goal_default_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tenant_goal_default" ENABLE ROW LEVEL SECURITY;
