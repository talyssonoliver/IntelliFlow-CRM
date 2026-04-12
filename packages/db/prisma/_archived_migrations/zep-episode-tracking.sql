-- Migration: Add Zep Episode Tracking Tables (IFC-086)
-- Description: Creates tables for tracking Zep episode usage and audit trail

-- Create zep_episode_usage table
CREATE TABLE IF NOT EXISTS "zep_episode_usage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "episodesUsed" INTEGER NOT NULL DEFAULT 0,
    "maxEpisodes" INTEGER NOT NULL DEFAULT 1000,
    "warningPercent" INTEGER NOT NULL DEFAULT 80,
    "hardLimitPercent" INTEGER NOT NULL DEFAULT 95,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncSuccess" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "zep_episode_usage_pkey" PRIMARY KEY ("id")
);

-- Create zep_episode_audit table
CREATE TABLE IF NOT EXISTS "zep_episode_audit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "previousCount" INTEGER NOT NULL,
    "newCount" INTEGER NOT NULL,
    "delta" INTEGER NOT NULL,
    "operation" TEXT NOT NULL,
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zep_episode_audit_pkey" PRIMARY KEY ("id")
);

-- Create unique index on tenantId for zep_episode_usage
CREATE UNIQUE INDEX IF NOT EXISTS "zep_episode_usage_tenantId_key" ON "zep_episode_usage"("tenantId");

-- Create indexes for zep_episode_usage
CREATE INDEX IF NOT EXISTS "zep_episode_usage_tenantId_idx" ON "zep_episode_usage"("tenantId");

-- Create indexes for zep_episode_audit
CREATE INDEX IF NOT EXISTS "zep_episode_audit_tenantId_idx" ON "zep_episode_audit"("tenantId");
CREATE INDEX IF NOT EXISTS "zep_episode_audit_createdAt_idx" ON "zep_episode_audit"("createdAt");
CREATE INDEX IF NOT EXISTS "zep_episode_audit_operation_idx" ON "zep_episode_audit"("operation");

-- Add foreign key constraint
ALTER TABLE "zep_episode_audit"
ADD CONSTRAINT "zep_episode_audit_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "zep_episode_usage"("tenantId")
ON DELETE CASCADE ON UPDATE CASCADE;
