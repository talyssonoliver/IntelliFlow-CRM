-- AI Chains usage: one row per model call an ai-worker chain makes (AI Chains page stats).
--
-- Class A (ADR-069 / docs/operations/agent-autonomy-policy.md): additive only.
--   * One NEW table with its own index, FK and RLS. No existing table, column, constraint or row
--     is read, altered or rewritten.
--   * Plain (non-CONCURRENTLY) index: the table is created empty in this transaction.
--   * No backfill: counting starts at deploy; the page says "since <date>".
--
-- Recovery plan: forward-only. Operational rollback = the worker stops writing (it logs and goes
-- on when the insert fails) and the API's usage stats read nothing. A down-migration
-- (DROP TABLE "chain_runs") deletes the usage history and is Class C, human-only.
--
-- Merged, NOT applied: production applies only through the gated `prisma migrate deploy`
-- workflow, and it must run BEFORE the worker and API that use this table are promoted.

SET LOCAL lock_timeout = '5s';

CREATE TABLE "chain_runs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "chainType" VARCHAR(20) NOT NULL,
    "workerChain" VARCHAR(40) NOT NULL,
    "versionId" TEXT,
    "model" VARCHAR(200),
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,
    "errorClass" VARCHAR(60),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chain_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "chain_runs_tenantId_chainType_createdAt_idx"
    ON "chain_runs"("tenantId", "chainType", "createdAt");

ALTER TABLE "chain_runs" ADD CONSTRAINT "chain_runs_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Row-level security (defence in depth; shape of 20261022120000_dsar_requests) ──
-- The application-level tenant boundary is the explicit tenantId in every query.
ALTER TABLE "chain_runs" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "chain_runs_tenant_isolation" ON "chain_runs"
    USING ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
