-- PG-199: tenant model configuration per AI purpose (ADR-082).
--
-- Class A (ADR-069 / docs/operations/agent-autonomy-policy.md): additive or relaxing only.
--   * Three NULLABLE / defaulted columns on tenant_ai_config:
--       "modelId" TEXT (no default), "fallbackModelIds" TEXT[] NOT NULL DEFAULT '{}',
--       "monthlyCostCeilingCents" INTEGER (no default).
--     On PG 11+ a constant default is stored in the catalog: no table rewrite, no backfill,
--     no existing row changes.
--   * "tier" DROP NOT NULL: relaxing, metadata-only, every existing row keeps its value.
--     NULL means "each caller keeps its own default tier". An older ai-worker reading a NULL
--     tier falls to its existing fail-open path (caller default), so the rollout order is
--     migration -> API -> worker -> web.
--   * Named CHECK constraints are added NOT VALID and then validated. Existing rows are only
--     ever written by ai-worker defaults with the six purposes / three tiers, so validation
--     cannot fail; the validating scan holds the lock only for this small per-tenant table.
--   * Catalog membership of "modelId"/"fallbackModelIds" is NOT a CHECK: the catalog is code
--     (@intelliflow/domain MODEL_CATALOG) and is enforced by the validators and the router.
--
-- Recovery plan: forward-only. Operational rollback = stop editing on
-- /agent-approvals/model-config; rows with NULL model/fallbacks/ceiling behave exactly as
-- before. A down-migration (DROP CONSTRAINT x6, DROP COLUMN x3, SET NOT NULL on tier) is
-- Class C — human-only, never run autonomously (SET NOT NULL would fail on PG-199 rows).
--
-- Production applies only through the gated `prisma migrate deploy` workflow, and must be
-- applied before the API is promoted.

-- ── tenant_ai_config: new columns ───────────────────────────────────────────
ALTER TABLE "tenant_ai_config" ADD COLUMN "modelId" TEXT;

ALTER TABLE "tenant_ai_config" ADD COLUMN "fallbackModelIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "tenant_ai_config" ADD COLUMN "monthlyCostCeilingCents" INTEGER;

-- ── tenant_ai_config: tier becomes optional ─────────────────────────────────
ALTER TABLE "tenant_ai_config" ALTER COLUMN "tier" DROP NOT NULL;

-- ── tenant_ai_config: named CHECK constraints ───────────────────────────────
-- LLM_PURPOSES / LLM_TIERS / MODEL_CONFIG_LIMITS in @intelliflow/domain.
ALTER TABLE "tenant_ai_config" ADD CONSTRAINT "tenant_ai_config_purpose_check"
    CHECK ("purpose" IN ('scoring', 'qualification', 'email', 'reasoning', 'structured', 'rag')) NOT VALID;

ALTER TABLE "tenant_ai_config" ADD CONSTRAINT "tenant_ai_config_tier_check"
    CHECK ("tier" IS NULL OR "tier" IN ('free', 'standard', 'premium')) NOT VALID;

ALTER TABLE "tenant_ai_config" ADD CONSTRAINT "tenant_ai_config_temperature_check"
    CHECK ("temperature" IS NULL OR "temperature" BETWEEN 0 AND 2) NOT VALID;

ALTER TABLE "tenant_ai_config" ADD CONSTRAINT "tenant_ai_config_maxTokens_check"
    CHECK ("maxTokens" IS NULL OR "maxTokens" > 0) NOT VALID;

ALTER TABLE "tenant_ai_config" ADD CONSTRAINT "tenant_ai_config_monthlyCostCeilingCents_check"
    CHECK ("monthlyCostCeilingCents" IS NULL OR "monthlyCostCeilingCents" BETWEEN 0 AND 2000000) NOT VALID;

ALTER TABLE "tenant_ai_config" ADD CONSTRAINT "tenant_ai_config_fallbackModelIds_check"
    CHECK (
        cardinality("fallbackModelIds") <= 3
        AND ("modelId" IS NULL OR NOT ("modelId" = ANY ("fallbackModelIds")))
    ) NOT VALID;

ALTER TABLE "tenant_ai_config" VALIDATE CONSTRAINT "tenant_ai_config_purpose_check";

ALTER TABLE "tenant_ai_config" VALIDATE CONSTRAINT "tenant_ai_config_tier_check";

ALTER TABLE "tenant_ai_config" VALIDATE CONSTRAINT "tenant_ai_config_temperature_check";

ALTER TABLE "tenant_ai_config" VALIDATE CONSTRAINT "tenant_ai_config_maxTokens_check";

ALTER TABLE "tenant_ai_config" VALIDATE CONSTRAINT "tenant_ai_config_monthlyCostCeilingCents_check";

ALTER TABLE "tenant_ai_config" VALIDATE CONSTRAINT "tenant_ai_config_fallbackModelIds_check";
