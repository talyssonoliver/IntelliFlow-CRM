-- Leangency outreach funnel: COA's concept-page slug on the lead, written by inbound.syncPipelineLead.
--
-- Class A (ADR-069 / docs/operations/agent-autonomy-policy.md): additive only.
--   * One NEW nullable column with no default, so ADD COLUMN is a catalog-only change: no existing
--     row is read, copied or rewritten, and every existing lead keeps outreachSlug NULL.
--   * One NEW index. A plain CREATE INDEX holds a SHARE lock on "leads" (reads keep flowing, writes
--     wait) for the length of the build; CONCURRENTLY cannot run inside the migration transaction.
--     The leads table is small, so the build is short.
--   * No existing column, constraint, index, trigger or RLS policy is altered.
-- lock_timeout bounds how long each statement waits to acquire its lock.
--
-- Recovery plan: forward-only. Operational rollback = deploy the previous API; nothing else reads the
-- column. A down-migration (DROP INDEX, then DROP COLUMN) loses the stored slugs, which COA can resend.
SET LOCAL lock_timeout = '5s';

-- AlterTable
ALTER TABLE "leads" ADD COLUMN "outreachSlug" TEXT;

-- CreateIndex
CREATE INDEX "leads_tenantId_outreachSlug_idx" ON "leads"("tenantId", "outreachSlug");
