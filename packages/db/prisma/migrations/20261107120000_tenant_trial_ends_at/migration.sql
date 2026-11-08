-- Store when a workspace's trial ends, instead of deriving it from the tenant's age (#1220).
--
-- Class A (ADR-069 / docs/operations/agent-autonomy-policy.md): additive only.
--   * One NEW nullable column with no default, so ADD COLUMN is a catalog-only change: no existing
--     row is read, copied or rewritten, and every existing tenant keeps NULL.
--   * No existing column, constraint, index, trigger or RLS policy is altered.
--   * While a tenant's value is NULL the API keeps today's behaviour (created + 14 days), so this
--     migration changes nothing anyone sees on its own.
-- Filling the column for existing trial tenants rewrites rows, so it is NOT in this migration: it is
-- the separate, Class B script tools/scripts/backfill-tenant-trial-ends-at.ts, run only after the
-- owner's yes.
-- lock_timeout bounds how long the statement waits to acquire its lock.
--
-- Recovery plan: forward-only. Operational rollback = deploy the previous API, which never reads the
-- column. A down-migration (DROP COLUMN) loses only the stored trial ends, which the backfill rule
-- can recompute.
SET LOCAL lock_timeout = '5s';

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN "trialEndsAt" TIMESTAMP(3);