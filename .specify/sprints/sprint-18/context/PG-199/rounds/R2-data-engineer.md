# PG-199 Round 2 PROPOSAL — Data-Engineer

## Approach
1. **Extend `tenant_ai_config` additively, as the lead assumed.** `schema.prisma:231-248` is the row keyed `(tenantId, purpose)`; the P2.8 `ADD COLUMN` at `20260423000000_tenant_memory_and_rate_limits/migration.sql:48-49` is the precedent. Three new columns, all metadata-only on PG 11+ (nullable, or a constant default):
   - `"modelId" VARCHAR(100)` NULL: the catalog id of the pin. NULL means no pin.
   - `"fallbackModelIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`: ordered, first entry tried first. Same array form as `case_types.requiredFields` (`20261013120000_case_types/migration.sql:44-50`).
   - `"monthlyCostCeilingCents" INTEGER` NULL: NULL means no ceiling, and 0 blocks the purpose outright, consistent with `QuotaService.ts:59`.
2. **No schema change for per-purpose spend.** The lead's counter-key plan fits what exists.
   - `tenant_usage_counters` is already `(tenantId, key TEXT, period TEXT, value INTEGER)`, unique on that triple, with FK cascade and RLS (`20260930000000_tenant_quotas_usage/migration.sql:20-29,38,47,54-56`).
   - The key `aiSpendCents:<purpose>` and period `YYYY-MM` UTC need no DDL.
   - Month rollover is a new row per period via `getQuotaPeriod('aiSpendCentsPerMonth')` (`QuotaRegistry.ts:80-82`). There is no reset job. Old periods stay: 6 rows per tenant per month, which is tiny.
   - `value` is INTEGER (max 2.1e9 cents), so the ceiling CHECK caps at 100,000,000 cents ($1M).
3. **The closed `QuotaKey` stays closed.** `QUOTA_KEYS` (`QuotaRegistry.ts:13-20`) feeds `QuotaLimits` and the plan map, so I add a separate port instead of widening it. The aggregate `aiSpendCentsPerMonth` increment (`tenant-ai-spend.ts:56`) is unchanged and still drives the plan quota. The per-purpose increment is an additional write from the same listener.
4. **Two migrations, as the runner required.**
   - `20261019120000_model_config`: columns plus CHECKs.
   - `20261019120100_tenant_ai_config_rls`: the separately removable policy, in the shape of `20261016120000_approval_policies/migration.sql:104-131`.
5. **Existing-row risk on the CHECKs.** `purpose`/`tier`/`temperature`/`maxTokens` are unconstrained today (`schema.prisma:233-238`), and the reader guards with `VALID_TIERS`, which suggests bad values are possible. I use `ADD CONSTRAINT ... NOT VALID` followed by `VALIDATE CONSTRAINT` in the same migration. The table is tiny, so the lock is brief. If a prod row is bad, the whole migration fails atomically. The header carries a pre-check `SELECT` for the rehearsal (Class A gate), and I do not query prod.

## Files
**Create**
- `packages/db/prisma/migrations/20261019120000_model_config/migration.sql`. Outline:
```sql
-- PG-199: tenant model config (ADR-082). Class A (ADR-069): additive only.
--  * 3 columns: nullable or constant-default -> metadata-only, no rewrite, no backfill.
--  * CHECKs added NOT VALID then VALIDATEd (tiny table; short scan). Pre-check for rehearsal:
--    SELECT * FROM tenant_ai_config WHERE purpose NOT IN (...) OR tier NOT IN (...)
--      OR temperature NOT BETWEEN 0 AND 2 OR "maxTokens" <= 0;   -- must return 0 rows
--  * No new index: (tenantId, purpose) unique already serves every read.
-- Recovery: forward-only. Operational rollback = clear modelId/fallbacks/ceiling (rows revert
--   to tier-only behaviour). DROP COLUMN / DROP CONSTRAINT is Class C, human-only.
-- Prod applies only through gated `prisma migrate deploy`.
ALTER TABLE "tenant_ai_config" ADD COLUMN "modelId" VARCHAR(100);
ALTER TABLE "tenant_ai_config" ADD COLUMN "fallbackModelIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "tenant_ai_config" ADD COLUMN "monthlyCostCeilingCents" INTEGER;

ALTER TABLE "tenant_ai_config"
  ADD CONSTRAINT "tenant_ai_config_purpose_check" CHECK ("purpose" IN
    ('scoring','qualification','email','reasoning','structured','rag')) NOT VALID,
  ADD CONSTRAINT "tenant_ai_config_tier_check" CHECK ("tier" IN ('free','standard','premium')) NOT VALID,
  ADD CONSTRAINT "tenant_ai_config_temperature_check"
    CHECK ("temperature" IS NULL OR "temperature" BETWEEN 0 AND 2) NOT VALID,
  ADD CONSTRAINT "tenant_ai_config_maxTokens_check"
    CHECK ("maxTokens" IS NULL OR "maxTokens" BETWEEN 1 AND 200000) NOT VALID,
  ADD CONSTRAINT "tenant_ai_config_modelId_check"
    CHECK ("modelId" IS NULL OR btrim("modelId") <> ''),
  ADD CONSTRAINT "tenant_ai_config_fallbackModelIds_check"
    CHECK (cardinality("fallbackModelIds") <= 3
           AND array_position("fallbackModelIds", NULL) IS NULL
           AND NOT ("modelId" = ANY("fallbackModelIds"))),
  ADD CONSTRAINT "tenant_ai_config_monthlyCostCeilingCents_check"
    CHECK ("monthlyCostCeilingCents" IS NULL
           OR "monthlyCostCeilingCents" BETWEEN 0 AND 100000000);
ALTER TABLE "tenant_ai_config" VALIDATE CONSTRAINT "tenant_ai_config_purpose_check";
-- ...same VALIDATE for tier, temperature, maxTokens
```
  Not in SQL: duplicate fallbacks and catalog membership. A CHECK cannot hold a subquery, and the allow-list changes, so Zod and the router own them. `NOT NULL` default on the array and the `... = ANY(...)` NULL-safety follow SQL three-valued logic (NULL passes a CHECK).
- `packages/db/prisma/migrations/20261019120100_tenant_ai_config_rls/migration.sql`:
```sql
-- PG-199: RLS policy for tenant_ai_config. Separately removable (DROP POLICY) from the columns.
-- Prod RLS state: unknown, projects-64 verifies at rehearsal (no prod query made here).
-- ENABLE is idempotent (already enabled at 20260421000000:78); NOT FORCE; no code path depends on
-- this policy filtering rows — tenant scoping stays in every query.
ALTER TABLE "tenant_ai_config" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "tenant_ai_config_tenant_isolation" ON "tenant_ai_config"
    USING ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
```
- `packages/application/src/ports/repositories/PurposeSpendRepositoryPort.ts` plus export beside `QuotaRepositoryPort` (`ports/repositories/index.ts:22`); adapter `packages/adapters/src/repositories/PrismaPurposeSpendRepository.ts` (+ unit test) copying the atomic `ON CONFLICT` SQL of `PrismaQuotaRepository.ts:62-68`.
- `tests/integration/model-config.test.ts` (see Integration).

**Modify**
- `packages/db/prisma/schema.prisma:231-248`: the diff below.
```prisma
  rateLimitPerMinute Int?     // P2.8
  modelId                 String?  @db.VarChar(100)       // PG-199: catalog id; null = tier default
  fallbackModelIds        String[] @default([])           // PG-199: ordered, max 3
  monthlyCostCeilingCents Int?                            // PG-199: null = no ceiling; 0 blocks
```
  Plus a header comment on the model in the style of `schema.prisma:2415`:
  `/// SQL-only (migration 20261019120000_model_config): CHECKs purpose IN the 6 LLMPurpose values; tier IN free|standard|premium; temperature 0-2; maxTokens 1-200000; modelId non-blank; fallbackModelIds <= 3 entries, no NULLs, not containing modelId; monthlyCostCeilingCents 0-100000000. RLS policy tenant_ai_config_tenant_isolation (migration 20261019120100).`
- `packages/domain/src/ai/model-config/`: add `purposeSpendKey(purpose)` returning `aiSpendCents:${purpose}`, and `isCeilingReached(spentCents, ceilingCents | null)`.

## Interfaces
```ts
export interface PurposeSpendRepositoryPort {
  getPurposeSpend(tenantId: string, purposes: readonly LLMPurpose[], period: string): Promise<Record<LLMPurpose, number>>; // missing row = 0; one query, key = ANY(...)
  incrementPurposeSpend(tenantId: string, purpose: LLMPurpose, period: string, cents: number): Promise<number>;
}
export function purposeSpendKey(p: LLMPurpose): `aiSpendCents:${LLMPurpose}`;
export function isCeilingReached(spent: number, ceiling: number | null): boolean; // ceiling !== null && spent >= ceiling
```
Prisma reads select explicit columns. The worker reader performs a full select, and on Prisma `P2022` / PG `42703` (column absent) retries with the legacy select (`tier`, `temperature`, `maxTokens`). Without that retry, schema skew would also drop the tier override. It logs `MODEL_CONFIG_COLUMNS_ABSENT` and treats the ceiling as none. Any other DB error does not silently lift a ceiling. I recommend ai-specialist treat it as fail-closed-for-ceiling-only or at least log distinctly, versus the swallow-all at `tenant-ai-config.ts:130-136`.

`resetToDefaults` (backend-architect owns the router). Because `rateLimitPerMinute` lives on the same row and is not a page field (`schema.prisma:237`), a blanket `deleteMany({tenantId})` would erase an unrelated override. In one `$transaction`: `deleteMany({ where: { tenantId, rateLimitPerMinute: null } })`, then `updateMany({ where: { tenantId }, data: { modelId: null, fallbackModelIds: [], monthlyCostCeilingCents: null, temperature: null, maxTokens: null } })` for retained rows. A retained row keeps its `tier` (NOT NULL); backend decides whether to set it to the factory default per purpose.

## Integration
- Test ordering: `ensureMigrationSql` keyed on `pg_constraint` sentinel `tenant_ai_config_purpose_check` (pattern `approval-policies.test.ts:59-80`). On a db:push DB the columns already exist, so skip `ADD COLUMN` statements when `information_schema` shows them (same trick as the `agent_actions` skip). Do not drop `tenant_ai_config`. It has FK and rows from other suites. Replay both migration files, with `splitStatements` keeping the `DO $$` block whole.
- Cases: every CHECK rejects (bogus purpose, tier, temperature 2.5, maxTokens 0, ceiling -1, 4 fallbacks, primary within fallbacks, blank modelId) and boundary values pass (ceiling 0, temperature 0 and 2). The default fallback is `{}`. Unique `(tenantId, purpose)` still holds. Tenant delete cascades. `pg_policies` has the policy and `relforcerowsecurity` is false. A second replay is a no-op (guard). Counter: 10 concurrent increments equal 10; distinct purpose keys are independent; a different period is a fresh row; cross-tenant counters are isolated.
- Run under Node 22 against `DATABASE_TEST_URL` and show the suite actually ran (`describeDb` skips silently).
- Unit test for `isCeilingReached` and `purposeSpendKey`; adapter test for the SQL shape.
- Docs: regenerate nothing in splits for this. The ADR-082 and PRD addenda state the schema and the skew behaviour.

## Runtime Consumer
- Columns: read by the ai-worker config resolver (`lib/tenant-ai-config.ts` extension, called from `createLLMForTenant`, `llm-factory.ts:380`) and by `modelConfig.get/update/resetToDefaults`. The legacy path replaced: tier-only resolution (`resolveEffectiveTier`, `tenant-ai-config.ts:74-137`).
- `incrementPurposeSpend`: called from the cost listener in `ai-worker.ts:310-322` after `recordTenantSpend`, with the purpose attributed. `getPurposeSpend`: called by the factory ceiling check and by the router `usage` read for the page. Legacy replaced: the single aggregate key at `tenant-ai-spend.ts:56`, which stays for the plan quota.
- RLS migration: no runtime consumer by design (defence in depth only).
- Open items for others: ai-specialist (purpose in cost-listener metadata, fail-open error classes), backend-architect (reset tier handling, tx boundaries), test-engineer (Node 22 evidence).
