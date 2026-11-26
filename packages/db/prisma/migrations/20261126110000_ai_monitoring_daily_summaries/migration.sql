-- AI monitoring daily summaries (Supabase egress audit 1126).
--
-- Class A (ADR-069 / docs/operations/agent-autonomy-policy.md): additive only. One NEW table, no
-- existing table, column, row, index or constraint is touched, and nothing reads or writes it
-- until the owner approves running tools/scripts/ai-monitoring-retention.ts with --apply.
--
-- Why: "ai_monitoring_events" keeps one row per model call. The retention script rolls the rows
-- older than N days into one row per (day, event type, tenant, model) here and then deletes the
-- detailed rows, so the table stays small and the history survives as counts, sums, min, max and
-- p50/p95/p99 instead of raw events.
--
--   "day"        the UTC calendar day rolled up.
--   "tenantKey"  the tenant id, or '' for a global event (events with a NULL tenantId). Not a
--                foreign key and not named tenantId on purpose: a roll-up must outlive its tenant
--                row, and a NOT NULL sentinel keeps the unique key free of NULL-distinct pitfalls.
--   "model"      the model name, or ''.
--
-- Recovery plan: forward-only. An empty table changes nothing. A down-migration (DROP TABLE) is
-- Class C, human-only, never autonomous. Production applies only through the gated
-- `prisma migrate deploy` workflow, after the owner's yes.

-- CreateTable
CREATE TABLE "ai_monitoring_daily_summaries" (
    "id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "eventType" TEXT NOT NULL,
    "tenantKey" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT '',
    "eventCount" INTEGER NOT NULL,
    "flaggedCount" INTEGER NOT NULL,
    "valueSum" DOUBLE PRECISION,
    "valueMin" DOUBLE PRECISION,
    "valueMax" DOUBLE PRECISION,
    "valueP50" DOUBLE PRECISION,
    "valueP95" DOUBLE PRECISION,
    "valueP99" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_monitoring_daily_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_monitoring_daily_summaries_day_idx" ON "ai_monitoring_daily_summaries"("day");

-- CreateIndex
CREATE UNIQUE INDEX "ai_monitoring_daily_summaries_day_eventType_tenantKey_model_key" ON "ai_monitoring_daily_summaries"("day", "eventType", "tenantKey", "model");

-- Backend-only table: RLS on with no policy (deny by default) and no grant to the Supabase client
-- roles. Supabase grants ALL on new public tables to anon and authenticated, so revoke explicitly.
ALTER TABLE "ai_monitoring_daily_summaries" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ai_monitoring_daily_summaries" FROM anon, authenticated;
