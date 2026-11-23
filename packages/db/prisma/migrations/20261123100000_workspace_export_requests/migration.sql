-- Whole-workspace data export requests (customer agreement clause 5: a standalone copy of a
-- leaving client's data within 14 days). One row per request, for audit and for the 14-day link.
--
-- Class A (ADR-069 / docs/operations/agent-autonomy-policy.md): additive only.
--   * Two NEW enums and one NEW table with its own indexes, FK and RLS. No existing table,
--     column, constraint or row is read, altered or rewritten.
--   * Plain (non-CONCURRENTLY) indexes: the table is created empty in this transaction.
--
-- Recovery plan: forward-only. Operational rollback = stop the workspace-export worker and the
-- two triggers (admin button, subscription ended); nothing else reads this table. A
-- down-migration (DROP TABLE "workspace_export_requests") deletes the export audit trail and is
-- Class C, human-only.
--
-- Merged, NOT applied: production applies only through the gated `prisma migrate deploy`
-- workflow, and it must run BEFORE the API and worker that use this table are promoted.

SET LOCAL lock_timeout = '5s';

CREATE TYPE "WorkspaceExportStatus" AS ENUM ('QUEUED', 'RUNNING', 'READY', 'FAILED', 'EXPIRED');
CREATE TYPE "WorkspaceExportTrigger" AS ENUM ('ADMIN', 'SUBSCRIPTION_ENDED');

CREATE TABLE "workspace_export_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestedById" TEXT,
    "trigger" "WorkspaceExportTrigger" NOT NULL,
    "subscriptionId" TEXT,
    "status" "WorkspaceExportStatus" NOT NULL DEFAULT 'QUEUED',
    "rowCounts" JSONB,
    "fileCount" INTEGER,
    "archiveBytes" BIGINT,
    "archiveSha256" CHAR(64),
    "storageBucket" TEXT,
    "storagePath" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "emailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_export_requests_pkey" PRIMARY KEY ("id")
);

-- One export per ended subscription (NULL subscriptionId rows, the admin ones, never collide).
CREATE UNIQUE INDEX "workspace_export_requests_tenantId_subscriptionId_key"
    ON "workspace_export_requests"("tenantId", "subscriptionId");
CREATE INDEX "workspace_export_requests_tenantId_requestedAt_idx"
    ON "workspace_export_requests"("tenantId", "requestedAt");
CREATE INDEX "workspace_export_requests_status_requestedAt_idx"
    ON "workspace_export_requests"("status", "requestedAt");

ALTER TABLE "workspace_export_requests" ADD CONSTRAINT "workspace_export_requests_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Row-level security (defence in depth; shape of 20261111120000_chain_runs) ──
-- The application-level tenant boundary is the explicit tenantId in every query. The export
-- worker and the sweep read across tenants, so they run as the service role (RLS bypass).
ALTER TABLE "workspace_export_requests" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "workspace_export_requests_tenant_isolation" ON "workspace_export_requests"
    USING ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
