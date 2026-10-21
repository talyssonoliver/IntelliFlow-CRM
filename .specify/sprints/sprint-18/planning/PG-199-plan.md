# Execution Plan: PG-199 — Module Settings: Model Config (`/agent-approvals/model-config`)

| Field | Value |
|---|---|
| Spec | `.specify/sprints/sprint-18/specifications/PG-199-spec.md` (AC-001…AC-028, NF-001…NF-005, 6/6 consensus) |
| Owner rulings | `.specify/sprints/sprint-18/context/PG-199/PG-199-owner-ruling.md` (R1, R2, Q1–Q8, runner constraints) |
| Hexagonal layers | Domain → Validators → Database → Application (port) → Adapters → API → ai-worker runtime → UI |
| Dependency chain | `docs/architecture/diagrams/complete-dependency-chains.md` (PG-198 block, ~L1313) and `docs/architecture/diagrams/ai-output-review-dependency-chain.md` (PG-198 box) — PG-199 added in Step 29 |
| Branch / worktree | `feat/pg-199-model-config` / `C:/Users/talys/projects/intelliFlow-CRM-worktrees/pg-199` |
| Migrations | `20261019120000_tenant_model_config`, `20261019120100_tenant_ai_config_rls` (Class A; prod apply manual, before API promote) |
| ADR | ADR-082 (Proposed → Accepted in Step 32, after the gates) |

## Prerequisite Verification

| Layer / dependency | Status | Evidence |
|---|---|---|
| PG-178 (module settings shell) | ✅ | `apps/web/src/app/settings/*`; attestation sprint-16 COMPLETE |
| PG-152 (AgentLogsViewer, logs page) | ✅ | `apps/web/src/components/ai-monitoring/AgentLogsViewer.tsx`, `apps/web/src/app/agent-approvals/logs/page.tsx` |
| PG-192 (logs page + detail) | ✅ | `apps/web/src/app/agent-approvals/logs/page.tsx`, `logs/[id]` |
| PG-198 shared settings helpers | ✅ | `apps/api/src/modules/agent/settings-shared.ts:9-39` |
| `TenantAIConfig` model + reader | ✅ | `packages/db/prisma/schema.prisma:231-248`; `apps/ai-worker/src/lib/tenant-ai-config.ts` |
| Navigation entry | ✅ exists | `apps/web/src/components/sidebar/configs/agent-approvals.ts:194-199` (no sidebar change needed) |

No dependency claim is false (spec § Dependency Verification) → no blocking follow-up.

## Preflight Checks

1. `export PATH="/c/Users/talys/AppData/Roaming/nvm/v22.14.0:$PATH"; node -v` → `v22.x` (Node 25 hangs pg writes).
2. `export NODE_OPTIONS=--max-old-space-size=8192`.
3. `docker ps --filter name=postgres-test --format '{{.Status}}'` → contains `healthy` (shared; never stop/reset).
4. `pnpm install --frozen-lockfile` already done; packages built (`node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-199-build -- pnpm turbo build --filter='./packages/*'` → 15/15).
5. Baseline typecheck of touched packages: `pnpm --filter @intelliflow/domain --filter @intelliflow/validators --filter @intelliflow/api --filter @intelliflow/ai-worker --filter @intelliflow/web typecheck` (record baseline; must stay green).
6. Test DB only: the committed `.env.test` sets `DATABASE_URL` to the local test DB (`localhost:5433/intelliflow_test`, i.e. the spec's `DATABASE_TEST_URL` target); never `.env.local` DB URLs (production).
7. `/exec-metrics` start + `/exec-coverage` before (Exec Phase 0/1.5).
8. Every test process runs alone; DB-backed runs via `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-199 --exclusive intelliflow-db -- <cmd>`.
9. RED logs saved as `.txt` under `.specify/sprints/sprint-18/execution/PG-199/<run>/logs/` (never `.log`).
10. YAML parser resolvable from ai-worker (Step 11): `cd apps/ai-worker && node -e "require.resolve('yaml')"` — verified 2026-10-19 (`yaml` and `js-yaml` both resolve; no new dependency).
11. Shared UI primitives exist (Step 25): `packages/ui/src/components/{slider,select,confirmation-dialog,empty-state,skeleton,card}.tsx`, `apps/web/src/components/shared/{page-header,section-header}.tsx` — verified 2026-10-19.

**CSV `FILE:` pre-requisites (reference only, not modified):** `apps/web/src/components/sidebar/configs/agent-approvals.ts`, `apps/web/src/components/ai-monitoring/AgentLogsViewer.tsx`, `docs/planning/module-settings-playbook.md`, `docs/planning/prd-module-settings.md` (the last is modified in Step 29).

## Implementation Reality Checks

| Surface | Production Consumer | Replaces / Blocks | Verification Command |
|---|---|---|---|
| `modelConfig.get/update/resetToDefaults` | `ModelConfigContent.tsx` (`/agent-approvals/model-config`) | stub `page.tsx:1-16`; nothing wrote `tenant_ai_config` | `pnpm --filter @intelliflow/api exec vitest run src/modules/agent/__tests__/model-config.router.test.ts` |
| domain `findDowngrades/isDowngrade` | router `update`/`resetToDefaults`; web Save dialog | — | `pnpm --filter @intelliflow/domain exec vitest run src/ai/model-config` |
| `resolveTenantModelConfig` | `createLLMForTenant` (21 call sites), `BaseAgent.getModel`, summary job | `createLLM(purpose,'free')` `agents/base.agent.ts:164`; `jobs/summarize-conversation.job.ts:223` | `pnpm --filter @intelliflow/ai-worker exec vitest run src/lib/__tests__/tenant-ai-config.test.ts src/agents/base.agent.test.ts src/jobs/__tests__/summarize-conversation.job.test.ts` |
| `assertWithinCeiling` | `createLLMForTenant`, `wrapEmbeddingsWithTracing` | — | `pnpm --filter @intelliflow/ai-worker exec vitest run src/lib/__tests__/purpose-ceiling.test.ts` |
| tracer metering | every chat + embedding call | recorders `base.agent.ts:685-703`, `insight-generation.chain.ts:359-368` (removed) | `pnpm --filter @intelliflow/ai-worker exec vitest run src/tracing/__tests__/llm-tracer.test.ts` |
| `PurposeSpendPort` / `PrismaPurposeSpendRepository` | cost listener `apps/ai-worker/src/ai-worker.ts:303-322` | aggregate-only `AI_SPEND_KEY` (kept) | `pnpm --filter @intelliflow/adapters exec vitest run src/repositories/__tests__/PrismaPurposeSpendRepository.test.ts` |
| LiteLLM `catalog-<id>` stanzas | `createLLM` with a pin | alias-only routing | `pnpm --filter @intelliflow/ai-worker exec vitest run src/lib/__tests__/model-config-parity.test.ts` |
| tenant ALS in embed workers | `workers/contact-embed-worker.ts`, `workers/ingestion-workers.ts` | tenant `unknown` (unmetered) | `pnpm --filter @intelliflow/ai-worker exec vitest run src/workers/__tests__/contact-embed-worker.test.ts src/workers/__tests__/ingestion-workers.test.ts` |
| `setPurposeSpendReader` seam | `ai-worker.ts` boot registers `PrismaPurposeSpendRepository`; read by `assertWithinCeiling` | — (unregistered ⇒ logged fail-open) | `pnpm --filter @intelliflow/ai-worker exec vitest run src/__tests__/ai-worker.tenant-ai-spend-wiring.test.ts src/lib/__tests__/purpose-ceiling.test.ts` |
| `apps/web/src/lib/trpc-errors.ts` `errorCode` | ModelConfigContent + CaseTypesContent + ContactTypesContent + AvailabilityContent | 3 local copies | `pnpm --filter @intelliflow/web exec vitest run src/lib/__tests__/trpc-errors.test.ts` |
| settings-search entry | Settings search UI (`apps/web/src/lib/shared/settings-search.ts`) | — | `pnpm --filter @intelliflow/web exec vitest run src/lib/shared/__tests__/settings-search.test.ts` |

## Estimated Effort

CSV estimate 180/360/540 min → PERT (180 + 4·360 + 540)/6 = **360 min**. The consensus scope (worker
metering, embeddings, agents, two migrations) is materially larger; realistic estimate below.

File counts below are taken from the Files Summary (same 105 files).

| Phase | Files (create + modify) | Estimate |
|---|---|---|
| Domain + validators (Steps 1–4) | 8 + 2 = 10 | 90–150 min |
| Database (Steps 5–6) | 3 + 1 = 4 | 60–120 min |
| Application/adapters (Steps 7–8) | 3 + 2 = 5 | 30–60 min |
| API (Steps 9–10) | 2 + 4 = 6 | 120–180 min |
| ai-worker runtime (Steps 11–21) | 4 + 43 = 47 | 300–480 min |
| Web (Steps 22–26) | 12 + 6 = 18 | 180–300 min |
| Docs / registries / CSV / ledger (Steps 27–30, 32) | 0 + 15 = 15 | 60–90 min |
| **Total** | **32 + 73 = 105** | **14–23 h** |

## Execution Steps

Every RED step saves its failing run to `logs/<step>-red.txt`; every GREEN step reruns the same command.

### Phase A — Domain (`packages/domain`)

#### Step 1: RED — catalog, defaults and rules tests
**Type:** test
**Files to Create:**
- `packages/domain/src/ai/model-config/__tests__/rules.test.ts`
- `packages/domain/src/ai/model-config/__tests__/catalog.test.ts`

**Acceptance Criteria Addressed:** AC-004, AC-005, AC-009 (rules part), AC-018 (period), AC-024 (snapshot)

**Validation:**
- [x] price matrix: strictly lower = downgrade; equal = lateral; free→free lateral; paid→free downgrade; scoring standard (mistral-small) → premium (gpt-4o-mini) = downgrade
- [x] unpinned current = MAX price over `DEFAULT_MODEL[p][t]` for `t ∈ CALLER_DEFAULT_TIERS[p]`
- [x] id absent from catalog ⇒ downgrade; deprecated id keeps its price
- [x] fallback: new/changed entry cheaper than effective primary-after ⇒ downgrade; unchanged never re-prompts
- [x] `effectiveModel` with null tier/modelId; `DEFAULT_MODEL.rag.standard` absent
- [x] `purposeSpendPeriod` = `getQuotaPeriod('aiSpendCentsPerMonth', now)`, never `'all'`; boundary 2026-10-31T23:59:59.999Z vs 2026-11-01T00:00:00.000Z (fixed clock)
- [x] catalog snapshot (ids + integer prices), append-only, every entry ≥ 1 purpose, chat entries have `providers.litellm = 'catalog-<id>'`
- [x] Fails: `pnpm --filter @intelliflow/domain exec vitest run src/ai/model-config` → save `logs/01-red.txt`

#### Step 2: GREEN — implement domain module
**Type:** implementation
**Files to Create:**
- `packages/domain/src/ai/model-config/catalog.ts`
- `packages/domain/src/ai/model-config/defaults.ts`
- `packages/domain/src/ai/model-config/rules.ts`
- `packages/domain/src/ai/model-config/index.ts`

**Files to Modify:**
- `packages/domain/src/index.ts` (one `export * from './ai/model-config'` beside `:119-120`)

**Validation:**
- [x] Catalog prices = `round(MODEL_PRICING × 1e6)` (parity enforced in Step 11); Gemini embedding price taken from the provider pricing page (URL + date recorded in a code comment and the delivery report)
- [x] `pnpm --filter @intelliflow/domain exec vitest run src/ai/model-config` passes
- [x] `pnpm --filter @intelliflow/domain typecheck` and `pnpm --filter @intelliflow/domain build`

### Phase B — Validators (`packages/validators`)

#### Step 3: RED — model-config schema tests
**Type:** test
**Files to Create:**
- `packages/validators/src/__tests__/model-config.test.ts`

**Acceptance Criteria Addressed:** AC-002, AC-003, AC-009, AC-010

**Validation:**
- [x] duplicate purposes ⇒ one issue "Duplicate purpose: items 1 and 3", path `['purposes', 2]`
- [x] bounds (temperature 0–2, maxTokens 1–32768, ceiling 0–2,000,000 int, fallbacks ≤ 3), "" never reaches schema (null), 0 accepted
- [x] non-catalog id / not allowed for purpose rejected; primary in fallbacks rejected against the EFFECTIVE primary; duplicate fallbacks rejected
- [x] rag: any field other than ceiling rejected
- [x] unknown keys stripped (non-strict); `tier` not accepted as editable input
- [x] Fails: `pnpm --filter @intelliflow/validators exec vitest run src/__tests__/model-config.test.ts` → `logs/03-red.txt`

#### Step 4: GREEN — implement validators
**Type:** implementation
**Files to Create:**
- `packages/validators/src/model-config.ts`

**Files to Modify:**
- `packages/validators/src/index.ts` (export beside `:111`)

**Validation:**
- [x] Step 3 command passes; `pnpm --filter @intelliflow/validators typecheck`; `pnpm --filter @intelliflow/validators build`

### Phase C — Database (`packages/db`)

#### Step 5: RED — migration integration test
**Type:** test
**Files to Create:**
- `tests/integration/model-config.test.ts`

**Acceptance Criteria Addressed:** AC-007, AC-021, NF-005

**Validation:**
- [x] `describeDb` skip when no `DATABASE_URL`; `ensureMigrationSql()` replays both migrations when the named CHECK is absent (db:push DB), pattern `tests/integration/approval-policies.test.ts:59-80`
- [x] CHECK violations (purpose, tier, temperature, maxTokens, ceiling, fallback cardinality, modelId ∈ fallbacks) raise 23514/P2004/P2010
- [x] `tier` NULL accepted; `relrowsecurity = true`; policy `tenant_ai_config_tenant_isolation` present
- [x] two tenants: rows written with explicit tenantId never read across tenants (no reliance on RLS)
- [x] Fails: `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-199 --exclusive intelliflow-db -- pnpm exec vitest run --project integration tests/integration/model-config.test.ts` → `logs/05-red.txt`

#### Step 6: GREEN — migrations + Prisma schema
**Type:** implementation
**Files to Create:**
- `packages/db/prisma/migrations/20261019120000_tenant_model_config/migration.sql`
- `packages/db/prisma/migrations/20261019120100_tenant_ai_config_rls/migration.sql`

**Files to Modify:**
- `packages/db/prisma/schema.prisma` (`TenantAIConfig`: `tier String?`, `modelId String?`, `fallbackModelIds String[] @default([])`, `monthlyCostCeilingCents Int?`; SQL-only objects comment block copied from `:1661-1669`)

**Validation:**
- [x] Class A header (additive/relaxing, recovery plan forward-only, prod via `prisma migrate deploy` only); RLS header "prod RLS state on tenant_ai_config: unknown, projects-64 verifies at rehearsal"; ENABLE not FORCE; DO/duplicate_object
- [x] `pnpm --filter @intelliflow/db exec prisma validate` and `pnpm --filter @intelliflow/db exec prisma generate`
- [x] apply to the local test DB only: `pnpm --filter @intelliflow/db exec prisma migrate deploy` with `DATABASE_URL` from `.env.test` (guard `tools/scripts/guard-db-target.mjs` must accept it) — DONE ON AN EPHEMERAL DB on the same local :5433 server (batch rule: never mutate the shared DB): all 78 migrations via `prisma migrate deploy` (`logs/06-green-integration.txt`); shared `intelliflow_test` verified untouched
- [x] Step 5 command passes; rebuild packages via the slot wrapper — the Step 5 test passed 15/15 on a fully migrated ephemeral DB AND on a db-push-simulated one (SQL-only objects stripped, replay path), `logs/06-green-integration*.txt`; db package rebuilt

### Phase D — Application + Adapters (spend port)

#### Step 7: RED — purpose spend repository test
**Type:** test
**Files to Create:**
- `packages/adapters/src/repositories/__tests__/PrismaPurposeSpendRepository.test.ts`

**Acceptance Criteria Addressed:** AC-018

**Validation:**
- [x] atomic upsert SQL with key `aiSpendCentiCents:<purpose>` + period; batch `getSpend` returns 0 for missing; clamp at 2147483647 (no throw)
- [x] Fails: `pnpm --filter @intelliflow/adapters exec vitest run src/repositories/__tests__/PrismaPurposeSpendRepository.test.ts` → `logs/07-red.txt`

#### Step 8: GREEN — port + adapter
**Type:** implementation
**Files to Create:**
- `packages/application/src/ports/repositories/PurposeSpendPort.ts`
- `packages/adapters/src/repositories/PrismaPurposeSpendRepository.ts`

**Files to Modify:**
- `packages/application/src/ports/repositories/index.ts` (export)
- `packages/adapters/src/repositories/index.ts` (export)

**Validation:**
- [x] Step 7 command passes; `pnpm --filter @intelliflow/application typecheck`; `pnpm --filter @intelliflow/adapters typecheck`

### Phase E — API (`apps/api`)

#### Step 9: RED — router tests
**Type:** test
**Files to Create:**
- `apps/api/src/modules/agent/__tests__/model-config.router.test.ts`

**Files to Modify:**
- `apps/api/src/__tests__/app-router.smoke.test.ts` (block for `modelConfig.get/update/resetToDefaults` after `:159`)

**Acceptance Criteria Addressed:** AC-001 (data), AC-003, AC-004, AC-005, AC-006, AC-007, AC-008, AC-010, AC-011, AC-016 (mapping)

**Validation:**
- [x] `get`: 6 rows with defaults for absent purposes, `canManage` by role, rag `locked`, `retired` for id absent from catalog, spend read with exact key + explicit tenantId, read failure ⇒ `spentCents:null, blocked:false`
- [x] FORBIDDEN `it.each` (USER) for `update` and `resetToDefaults` with `$transaction` not called; anonymous rejected
- [x] cross-tenant negative: rows queried only with `tenantId: ctx.tenant.tenantId`; a foreign tenant's row never read/written
- [x] advisory lock executed first in the transaction; per-purpose `expected` mismatch ⇒ CONFLICT zero writes (incl. after reset; null vs existing row)
- [x] no-op purposes skipped (no upsert, no audit); created rows `tier: null`
- [x] downgrade without ack ⇒ `PRECONDITION_FAILED` `DOWNGRADE_UNCONFIRMED` listing all; with ack ⇒ write + audit `downgrade:true`, actorId = `ctx.tenant.userId`, from/to ids + prices; lateral ⇒ no confirm, audit `lateral:true`
- [x] rag model change ⇒ BAD_REQUEST; retired id re-save ⇒ coded BAD_REQUEST
- [x] P2002 ⇒ CONFLICT; `failTx` on second upsert rolls back all
- [x] reset: deletes null-rate-limit rows, nulls tier/temperature/maxTokens/model/ceiling/fallbacks on others, downgrade check vs defaults, no rows ⇒ no-op no audit
- [x] Fails: `pnpm --filter @intelliflow/api exec vitest run src/modules/agent/__tests__/model-config.router.test.ts src/__tests__/app-router.smoke.test.ts` → `logs/09-red.txt`

#### Step 10: GREEN — router, audit, registration
**Type:** implementation
**Files to Create:**
- `apps/api/src/modules/agent/model-config.router.ts`

**Files to Modify:**
- `apps/api/src/router.ts` (import after `:42`; `modelConfig: modelConfigRouter, // PG-199` after `:173`)
- `apps/api/src/security/types.ts` (`| 'model_config'` in `ResourceType`, `:91-105`)
- `apps/api/src/security/rbac.ts` (`model_config` in the 5 role maps: owner/admin full, manager read/write/delete/manage, others read)

**Reuse (no new copies):** `assertAgentSettingsAdmin`, `isAgentSettingsAdmin`, `rethrowConflict` from
`apps/api/src/modules/agent/settings-shared.ts:9-39`; advisory lock `` tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))` ``
exactly as `apps/api/src/modules/analytics/scheduled-reports.router.ts:106-110` (verified); `logModelConfigAudit` is a module-private helper inside `model-config.router.ts` copying the
shape of `apps/api/src/modules/contact/contact-types.router.ts:206-223`; domain `findDowngrades`,
`effectiveModel`, `purposeSpendKey`, `purposeSpendPeriod`. Coverage note (NF-004): only the root
`apps/api/src/router.ts` is coverage-excluded (`vitest.config.ts:371`, `sonar-project.properties:198`);
`modules/agent/model-config.router.ts` is measured, so Step 9 covers every branch.

**Validation:**
- [x] Step 9 command passes; `pnpm --filter @intelliflow/api typecheck`
- [x] `pnpm --filter @intelliflow/api exec vitest run src/modules/agent src/security` (touched regression suites incl. `settings-shared.test.ts`, `approval-policies.router.test.ts`)

### Phase F — ai-worker runtime (`apps/ai-worker`)

#### Step 11: RED — parity + caller-tier tests
**Type:** test
**Files to Create:**
- `apps/ai-worker/src/lib/__tests__/model-config-parity.test.ts`

**Acceptance Criteria Addressed:** AC-013, AC-024

**Validation:**
- [x] every catalog price = `round(MODEL_PRICING[alias] × 1e6)` via an explicit alias map; every `MODEL_PRICING` alias that `DEFAULT_MODEL` uses maps to a catalog id; unknown pricing ⇒ failure
- [x] `infra/litellm/config.yaml` parsed: every catalog chat entry has a `catalog-<id>` model_name whose `litellm_params.model` equals the model already used by the alias it mirrors
- [x] `CALLER_DEFAULT_TIERS[p]` ⊇ every tier passed to `createLLMForTenant(p, tier)` / `createLLM(p, tier)` at the tenant-aware call sites. Decision (E7): the ~21 caller files are NOT modified (L1 minimal change); the constant is consumed only by the resolver and `findDowngrades`, and this test — which scans the call sites under `apps/ai-worker/src` — is the enforcement, failing when a new call passes a tier outside the set. (Spec wording "callers import" is superseded by this decision; spec updated in the same step.)
- [x] Fails: `pnpm --filter @intelliflow/ai-worker exec vitest run src/lib/__tests__/model-config-parity.test.ts` → `logs/11-red.txt`

#### Step 12: GREEN — catalog stanzas + pricing
**Type:** implementation
**Files to Modify:**
- `infra/litellm/config.yaml` (one `catalog-<id>` stanza per chat catalog entry; ADR-082 note)
- `apps/ai-worker/src/config/ai.config.ts` (Gemini embedding pricing key; no other price changes)
- `apps/ai-worker/src/lib/llm-factory.ts` (`LLMPurpose`/`LLMTier` aliases of domain types, `:36,44`)

**Validation:**
- [x] Step 11 command passes; `pnpm --filter @intelliflow/ai-worker exec vitest run src/lib/__tests__/llm-factory.test.ts`

#### Step 13: RED — resolver, ceiling, factory tests
**Type:** test
**Files to Create:**
- `apps/ai-worker/src/lib/__tests__/purpose-ceiling.test.ts`

**Files to Modify:**
- `apps/ai-worker/src/lib/__tests__/tenant-ai-config.test.ts`
- `apps/ai-worker/src/lib/__tests__/createLLMForTenant.test.ts`
- `apps/ai-worker/src/lib/__tests__/llm-factory.test.ts`

**Acceptance Criteria Addressed:** AC-013, AC-014, AC-015, AC-020

**Validation:**
- [x] resolver: new columns returned; NULL tier ⇒ caller default; P2021/P2022 ⇒ legacy select retry, no ceiling, `schema_pending` warn; other error ⇒ last cached else open + warn; cached value not overwritten by error path
- [x] skew: an old-shape resolver path given a NULL tier falls back to caller default (documented behaviour) — the old worker's path is the existing invalid-tier branch (`VALID_TIERS.has(null)` false ⇒ caller default, test "row with invalid tier"), or its catch on a Prisma null-conversion error ("DB error ⇒ default"); documented in ADR-082
- [x] ceiling: spent ≥ ceiling ⇒ `PURPOSE_CEILING_REACHED` before any model call, message `monthly AI ceiling reached for <purpose>`; 0 blocks; null never blocks; cache key `(tenant, purpose, period)` — Oct→Nov boundary with fake timers clears a cached block
- [x] seam (E6): `setPurposeSpendReader(reader)` / `getPurposeSpendReader()` in `purpose-ceiling.ts`; with a registered fake reader over the ceiling, `createLLMForTenant` throws; with NO registered reader the check fails open and logs `spend_reader_missing` once (never silently)
- [x] factory: pin ⇒ LiteLLM `catalog-<id>`; OpenRouter mapped id / unmapped ⇒ tier default + rate-limited warn; Ollama ignores pin; model in cache + breaker keys
- [x] fallback chain: 429/5xx/timeout/breaker-open advance in order; attempt cap; non-retryable error not retried; structured-output call lands on fallback (decides `withFallbacks` vs helper)
- [x] deprecated pin honoured; id absent from catalog ⇒ fallbacks else caller default + error log — deprecated: `getCatalogEntry` never filters the flag (domain catalog test), and the factory resolves pins only through it; absent ids: 2 tests
- [x] Fails: `pnpm --filter @intelliflow/ai-worker exec vitest run src/lib/__tests__/purpose-ceiling.test.ts src/lib/__tests__/tenant-ai-config.test.ts src/lib/__tests__/createLLMForTenant.test.ts src/lib/__tests__/llm-factory.test.ts` → `logs/13-red.txt`

#### Step 14: GREEN — resolver, ceiling, factory
**Type:** implementation
**Files to Create:**
- `apps/ai-worker/src/lib/purpose-ceiling.ts`

**Files to Modify:**
- `apps/ai-worker/src/lib/tenant-ai-config.ts`
- `apps/ai-worker/src/lib/llm-factory.ts`

**Validation:**
- [x] `purpose-ceiling.ts` exports `setPurposeSpendReader(reader: PurposeSpendReader)` / `getPurposeSpendReader()`, `assertWithinCeiling`, `PurposeCeilingReachedError` (code `PURPOSE_CEILING_REACHED`, message `monthly AI ceiling reached for <purpose>`); missing reader ⇒ fail open + one `spend_reader_missing` warn
- [x] `createLLMForTenant` calls `assertWithinCeiling` before building/invoking the model; `tenant-ai-config.ts` returns the new fields
- [x] Step 13 command passes; `pnpm --filter @intelliflow/ai-worker typecheck`

#### Step 15: RED — metering tests
**Type:** test
**Files to Modify:**
- `apps/ai-worker/src/tracing/__tests__/llm-tracer.test.ts`
- `apps/ai-worker/src/utils/tenant-ai-spend.test.ts`
- `apps/ai-worker/src/utils/cost-tracker.test.ts`
- `apps/ai-worker/src/__tests__/ai-worker.tenant-ai-spend-wiring.test.ts` (E6: boot registers `PrismaPurposeSpendRepository` via `setPurposeSpendReader` AND wires the listener's per-purpose write)

**Acceptance Criteria Addressed:** AC-018

**Validation:**
- [x] chat call ⇒ exactly ONE usage record with purpose + modelId + tenant from ALS; missing `usage_metadata` ⇒ `countTokens` estimate (not 0)
- [x] embedding call ⇒ one record under `rag`, estimated from input text; ceiling checked before the network call; no ALS ⇒ no metering, no throw
- [x] listener writes aggregate (unchanged) + per-purpose centicents; carry keyed `(tenant, purpose, period)`
- [x] catalog pricing used; unknown pricing logs (no silent gpt-3.5 for catalog ids)
- [x] boot wiring: `ai-worker.ts` calls `setPurposeSpendReader(new PrismaPurposeSpendRepository(prisma))` before workers start
- [x] Fails: `pnpm --filter @intelliflow/ai-worker exec vitest run src/tracing/__tests__/llm-tracer.test.ts src/utils/tenant-ai-spend.test.ts src/utils/cost-tracker.test.ts src/__tests__/ai-worker.tenant-ai-spend-wiring.test.ts` → `logs/15-red.txt`

#### Step 16: GREEN — metering + remove duplicate recorders
**Type:** implementation
**Files to Modify:**
- `apps/ai-worker/src/tracing/llm-tracer.ts`
- `apps/ai-worker/src/utils/tenant-ai-spend.ts`
- `apps/ai-worker/src/utils/cost-tracker.ts`
- `apps/ai-worker/src/ai-worker.ts` (instantiate `PrismaPurposeSpendRepository` beside `:303-307`; `setPurposeSpendReader(...)` registration; listener `:310-322` per-purpose write)
- `apps/ai-worker/src/agents/base.agent.ts` (delete recorder `:685-703`)
- `apps/ai-worker/src/chains/insight-generation.chain.ts` (delete record `:359-368`)

**Validation:**
- [x] Step 15 command passes; `pnpm --filter @intelliflow/ai-worker exec vitest run src/jobs/__tests__/insight-generation.job.test.ts src/jobs/__tests__/insight-generation.job.fallback.test.ts`

> **Exec deviation (Steps 15–16, 2026-10-19):** `src/tracing/__tests__/**` is excluded from the ai-worker suite (`apps/ai-worker/vitest.config.ts:35`, OTel global-state isolation), so tests there never run in CI nor count for coverage. The metering logic therefore lives in a NEW `apps/ai-worker/src/lib/usage-metering.ts` (called by `llm-tracer.ts`) with its tests in NEW `apps/ai-worker/src/lib/__tests__/usage-metering.test.ts`; `tracing/__tests__/llm-tracer.test.ts` is left unchanged (its 13 tests re-run green via a temporary config, `logs/16-tracing-suite.txt`). `cost-tracker.ts` needed no change; `calculateCost` in `config/ai.config.ts` now warns once per unknown pricing key (test in `model-config-parity.test.ts`). The existing `chains/__tests__/insight-generation.chain.test.ts` asserted the removed 0/0 record and now asserts the chain records nothing itself. Files: +2 created, +1 test modified, −1 test not modified, −1 src (cost-tracker) not modified.

#### Step 17: RED — agents + summary job tests
**Type:** test
**Files to Modify:**
- `apps/ai-worker/src/agents/base.agent.test.ts`
- `apps/ai-worker/src/agents/email-writer.agent.test.ts`
- `apps/ai-worker/src/agents/followup.agent.test.ts`
- `apps/ai-worker/src/agents/qualification.agent.test.ts`
- `apps/ai-worker/src/agents/next-best-action.agent.test.ts`
- `apps/ai-worker/src/agents/email-writer.agent.additional.test.ts` (llm-factory mock gains `createLLMForTenant`)
- `apps/ai-worker/src/agents/followup.agent.additional.test.ts` (same)
- `apps/ai-worker/src/agents/base.agent.plan-reflect.test.ts` (same)
- `apps/ai-worker/src/agents/__tests__/next-best-action.agent.b11.test.ts` (same)
- `apps/ai-worker/src/jobs/__tests__/summarize-conversation.job.test.ts`

**Acceptance Criteria Addressed:** AC-015, AC-019

**Validation:**
- [x] llm-factory mocks gain `createLLMForTenant`; tests ASSERT it is called with the task's tenantId and purpose (not only the result)
- [x] `getModel(task)` per tenant cached; no tenant ⇒ constructor default; NBA (no structured output) has its own shape
- [x] summary job: tenantId passed; ceiling ⇒ `buildFallbackDigest`
- [x] Fails: `pnpm --filter @intelliflow/ai-worker exec vitest run src/agents src/jobs/__tests__/summarize-conversation.job.test.ts` → `logs/17-red.txt`

#### Step 18: GREEN — agents + summary job wiring
**Type:** implementation
**Files to Modify:**
- `apps/ai-worker/src/agents/base.agent.ts`
- `apps/ai-worker/src/agents/email-writer.agent.ts`
- `apps/ai-worker/src/agents/followup.agent.ts`
- `apps/ai-worker/src/agents/qualification.agent.ts`
- `apps/ai-worker/src/agents/next-best-action.agent.ts`
- `apps/ai-worker/src/jobs/summarize-conversation.job.ts`

**Validation:**
- [x] Step 17 command passes (all agent test files incl. `*.additional.test.ts`, `base.agent.plan-reflect.test.ts`, `crew.test.ts`, `next-best-action.agent.b11.test.ts`)

> **Exec note (Steps 17–18):** agents resolve the tenant model inside an AsyncLocalStorage scope opened by `execute()` (concurrent tasks of different tenants never share a model); structured output goes through a new protected `structuredFor(schema)` built from the task model. Existing tests that stubbed the removed private `structuredModel` field now stub `structuredFor` (`email-writer.agent.additional.test.ts` 9, `followup.agent.additional.test.ts` 5, `qualification.agent.test.ts` 1); `followup.agent.additional.test.ts` beforeEach model override gained `withStructuredOutput`. NBA has no structured output and inherits the tenant model via `invokeLLM`.

#### Step 19: RED — embeddings + ceiling surfaces
**Type:** test
**Files to Modify:**
- `apps/ai-worker/src/workers/__tests__/contact-embed-worker.test.ts`
- `apps/ai-worker/src/workers/__tests__/ingestion-workers.test.ts`
- `apps/ai-worker/src/chains/rag-context.chain.test.ts`
- `apps/ai-worker/src/chains/auto-response.chain.test.ts`
- `apps/ai-worker/src/chains/embedding.chain.methods.test.ts` (llm-factory mock + `cause`/`code` preservation)
- `apps/ai-worker/src/chains/embedding.chain.boot-safety.test.ts` (singleton boot unchanged; tracer wrap does not break import-time boot)

**Acceptance Criteria Addressed:** AC-016, AC-017

**Validation:**
- [x] handlers run inside `tenantContextStore.run({ tenantId: job.data.tenantId })` ⇒ spend lands under that tenant
- [x] ceiling ⇒ job moved to delayed (15 min) via BullMQ `moveToDelayed`/`DelayedError`; never failed/dead-lettered; error identified by `code` through `cause` wrapping in `generateEmbedding`
- [x] rag retrieval at ceiling returns a visible "AI ceiling reached for rag" marker (not silent empty)
- [x] auto-response rethrows the coded ceiling error (no template fallback) and its message is exactly "monthly AI ceiling reached for email" (Q6 — the user-facing text lives in the coded error; `AutoResponseChain` has no API caller today (`grep -rn AutoResponseChain apps/api/src` → none), so no API file and none of projects-64's overlap files are touched)
- [x] Fails: `pnpm --filter @intelliflow/ai-worker exec vitest run src/workers/__tests__/contact-embed-worker.test.ts src/workers/__tests__/ingestion-workers.test.ts src/chains/rag-context.chain.test.ts src/chains/auto-response.chain.test.ts src/chains/embedding.chain.methods.test.ts src/chains/embedding.chain.boot-safety.test.ts` → `logs/19-red.txt`

#### Step 20: GREEN — embeddings + surfaces
**Type:** implementation
**Files to Modify:**
- `apps/ai-worker/src/workers/contact-embed-worker.ts`
- `apps/ai-worker/src/workers/ingestion-workers.ts`
- `apps/ai-worker/src/chains/embedding.chain.ts` (preserve `cause`/`code`; singleton unchanged)
- `apps/ai-worker/src/chains/rag-context.chain.ts`
- `apps/ai-worker/src/chains/auto-response.chain.ts`

**Validation:**
- [x] Step 19 command passes; `pnpm --filter @intelliflow/ai-worker exec vitest run src/chains/embedding.chain.test.ts src/chains/embedding.chain.methods.test.ts src/chains/embedding.chain.boot-safety.test.ts`

> **Exec note (Steps 19–20):** `embedding.chain.ts` needed no change — it already wraps errors with `{ cause }`, and `isPurposeCeilingReached` walks the cause chain (pinned by a new test in `embedding.chain.methods.test.ts`); `embedding.chain.boot-safety.test.ts` re-ran green unchanged. `auto-response.chain.ts` needed no change — `createLLMForTenant` throws the coded error before any model call and `generateResponse` propagates it (characterization test added). Ingestion keeps embedding failures non-fatal (never failed/dead-lettered) and now logs the ceiling distinctly; only the contact-embed worker, whose embedding is fatal, uses the delayed re-queue.

#### Step 21: RED → GREEN — per-purpose non-AI fallbacks at the ceiling (AC-015)
**Type:** test + implementation
**Files to Create:**
- `apps/ai-worker/src/lib/__tests__/purpose-fallbacks.test.ts`

**Acceptance Criteria Addressed:** AC-015

**Validation:**
- [x] With `createLLMForTenant` / `createLLM` mocked to throw `PURPOSE_CEILING_REACHED`, each chain degrades to its existing non-AI fallback and never rethrows: scoring (`chains/scoring.chain.ts` default low-confidence score), churn (`chains/churn-risk.chain.ts` heuristic), reasoning (`chains/insight-generation.chain.ts` heuristic), structured (`chains/ticket-routing.chain.ts` keyword routing, `chains/sentiment.chain.ts` neutral), qualification (`case-insight.chain.ts` `source:'fallback'` — a qualification call site: `case-insight.chain.ts:60` calls `createLLMForTenant('qualification', 'standard', { tenantId })`; QualificationAgent has no non-AI fallback and errors visibly, asserted in Step 17), email reply draft (`contact-reply-draft.chain.ts` `requiresReview` fallback); auto-response is the documented exception (Step 19)
- [x] RED log `logs/21-red.txt`: `pnpm --filter @intelliflow/ai-worker exec vitest run src/lib/__tests__/purpose-fallbacks.test.ts`
- [x] Conditional GREEN: a chain source file is modified ONLY if its case fails RED — RESULT: no chain source needed a change; all 7 cases pass (the only RED failure in `logs/21-red.txt` was a wrong field name in the test assertion, `recommendedAgentId` → `assigneeId`) (its catch path misses the coded error); each such file is named in the delivery report and the attestation `artifact_hashes`. Candidate files: `chains/scoring.chain.ts`, `chains/churn-risk.chain.ts`, `chains/insight-generation.chain.ts`, `chains/ticket-routing.chain.ts`, `chains/sentiment.chain.ts`, `case-insight.chain.ts`, `contact-reply-draft.chain.ts` (not counted in the Files Summary until RED proves a change is needed)
- [x] Same command passes; existing chain suites rerun: `pnpm --filter @intelliflow/ai-worker exec vitest run src/chains src/jobs/__tests__/case-ai-automation.job.test.ts src/__tests__/contact-reply-draft.chain.test.ts`

### Phase G — Web (`apps/web`)

#### Step 22: RED — shared tRPC error helper
**Type:** test
**Files to Create:**
- `apps/web/src/lib/__tests__/trpc-errors.test.ts`

**Validation:**
- [x] `errorCode` returns `data.code`, `shape.data.code`, undefined for non-tRPC errors
- [x] Fails: `pnpm --filter @intelliflow/web exec vitest run src/lib/__tests__/trpc-errors.test.ts` → `logs/22-red.txt`

#### Step 23: GREEN — extract helper, migrate copies
**Type:** implementation
**Files to Create:**
- `apps/web/src/lib/trpc-errors.ts`

**Files to Modify:**
- `apps/web/src/app/cases/(list)/case-types/CaseTypesContent.tsx` (import + re-export `errorCode` for its tests)
- `apps/web/src/app/contacts/(list)/contact-types/ContactTypesContent.tsx` (same)
- `apps/web/src/app/calendar/availability/AvailabilityContent.tsx` (import)

**Validation:**
- [x] Step 22 passes; `pnpm --filter @intelliflow/web exec vitest run "src/app/cases/(list)/case-types" "src/app/contacts/(list)/contact-types" src/app/calendar/availability` unchanged-green

#### Step 24: RED — page + components tests
**Type:** test
**Files to Create:**
- `apps/web/src/app/agent-approvals/model-config/__tests__/page.test.tsx`
- `apps/web/src/app/agent-approvals/model-config/__tests__/ModelConfigContent.test.tsx`
- `apps/web/src/app/agent-approvals/model-config/components/__tests__/PurposeCard.test.tsx`
- `apps/web/src/app/agent-approvals/model-config/components/__tests__/FallbackList.test.tsx`
- `apps/web/src/app/agent-approvals/model-config/components/__tests__/model-config-model.test.ts`

**Acceptance Criteria Addressed:** AC-001, AC-002, AC-003, AC-004, AC-005 (no dialog on lateral), AC-006 (view-only), AC-008 (conflict UX), AC-010, AC-011, AC-012, AC-016 (blocked badge), NF-001

**Validation:**
- [x] page: no "coming soon"; Suspense + loading skeleton grid
- [x] 6 cards; rag read-only except ceiling, "platform-managed embedding model"
- [x] NOT_FOUND ⇒ `role="status"` calm notice, no `role="alert"`, no mutation called
- [x] Save sends only changed purposes, `expected` only for them, no `tier`, `acknowledgeDowngrade` only after confirm
- [x] one combined ConfirmationDialog listing every downgrade (models + prices); lateral ⇒ no dialog; pick time shows non-modal note
- [x] CONFLICT keeps draft + "Reload latest"; Save disabled when `!isDirty || isSaving || hasConflict`
- [x] ceiling "" ⇒ null, "0" ⇒ 0, >2 decimals rejected; below-spend warning ("drafts stop on save" for email)
- [x] retired current ⇒ disabled "(retired)" option; "Default (varies by feature)" option = null
- [x] non-admin ⇒ view-only (no Save/Reset)
- [x] a11y: slider has aria-label + visible value; reorder buttons labelled per index, ≥ 44 px, `aria-live` announcement; dialog focus restore
- [x] reset confirm enumerates reset vs kept (rate-limit overrides kept)
- [x] AC-023: PageHeader contains a link to `/agent-approvals/ai-settings` (chain versions)
- [x] UTC period label ("October 2026 (UTC)") and `refetchOnWindowFocus` on the `get` query
- [x] disclosure copy present: changes apply within ~2 minutes; ceilings are soft; embedding spend is estimated; pins apply via the LiteLLM gateway and marked models are unavailable on OpenRouter; fallbacks are tenant-defined once pinned
- [x] server `BAD_REQUEST` issue paths (e.g. `purposes.2.fallbackModelIds.1`) mapped to the matching field with `aria-invalid` + message
- [x] empty fallback list renders `EmptyState entity="rules" phase="passive" size="sm"` with no button inside
- [x] Fails: `pnpm --filter @intelliflow/web exec vitest run src/app/agent-approvals/model-config` → `logs/24-red.txt`

#### Step 25: GREEN — page + components
**Type:** implementation
**Files to Create:**
- `apps/web/src/app/agent-approvals/model-config/ModelConfigContent.tsx`
- `apps/web/src/app/agent-approvals/model-config/ModelConfigLoading.tsx`
- `apps/web/src/app/agent-approvals/model-config/components/PurposeCard.tsx`
- `apps/web/src/app/agent-approvals/model-config/components/FallbackList.tsx`
- `apps/web/src/app/agent-approvals/model-config/components/model-config-model.ts`

**Files to Modify:**
- `apps/web/src/app/agent-approvals/model-config/page.tsx` (server shell + Suspense; replaces stub)

**Reuse tags:** `page.tsx` REUSES the approval-policies Suspense shell; `ModelConfigContent.tsx`
COMPOSES `PageHeader` (`@/components/shared/page-header`), `SectionHeader`
(`@/components/shared/section-header`), `Card`, `Button`, `ConfirmationDialog`, `EmptyState`, `toast`
(`@intelliflow/ui`, as `ApprovalPoliciesContent.tsx:13-18`); `ModelConfigLoading.tsx` REUSES `Skeleton`;
`PurposeCard.tsx` NEW (justified) COMPOSES `Select`, `Slider`, `Input`; `FallbackList.tsx` COMPOSES the
ResolutionChecklistEditor move-up/down pattern; `errorCode` from `apps/web/src/lib/trpc-errors.ts`.

**Validation:**
- [x] Step 24 passes; `pnpm --filter @intelliflow/web typecheck`; Material Symbols only (ICON_USAGE); EmptyState canonical (`entity="rules"`/`"agents"`, `phase="passive"`)
- [x] header link to AI Settings implemented (AC-023)
- [x] glyph guard: `node tools/scripts/subset-material-symbols.mjs --verify` (icons used: `psychology`, `arrow_upward`, `arrow_downward`, `lock`, `block`, `info`, `warning`)
- [x] bundle check: compare `.next` route chunk with/without the domain import (A3); subpath export only if growth measured — measured at Step 32 (`logs/32-bundle-check.txt`): the model catalog is in chunk 88156, already loaded by /agent-approvals/approval-policies (domain root import); the only route-specific chunk is the page code (38.9 KB uncompressed); no subpath export needed

> **Exec deviation (Steps 24–25, 2026-10-19):** temperature uses a native `<input type="range">` (+ a "Custom temperature" checkbox, null = caller default) instead of the shared `Slider`: Radix puts the shared wrapper's `aria-label` on the root, never on the `role="slider"` thumb, so the thumb has no accessible name (`packages/ui/src/components/slider.tsx:5-20`; Radix `SliderThumb` labels only from its own props) — filed as F7, shared component not edited (L1). Prices are shown per 1M tokens (input + output, from the same catalog price; "costs less per token" in the copy) because per-1k values are unreadably small. `apps/web/src/test/mocks/native-select.tsx` now forwards `disabled` on items (needed for the "(retired)" option; 9 other suites using it re-run green). Qualification icon is `checklist` (already in the font subset) instead of adding `fact_check`. Bundle check moves to Step 32 (needs the production build). RED `logs/24-red.txt`, GREEN `logs/25-green.txt`, glyph `logs/25-glyph-verify.txt`.

#### Step 26: RED → GREEN — settings search entry
**Type:** test + implementation
**Files to Modify:**
- `apps/web/src/lib/shared/__tests__/settings-search.test.ts` (13 → 14; asserts the Model Configuration entry href)
- `apps/web/src/lib/shared/settings-search.ts` (entry `Model Configuration` → `/agent-approvals/model-config`)

**Validation:**
- [x] RED then GREEN: `pnpm --filter @intelliflow/web exec vitest run src/lib/shared/__tests__/settings-search.test.ts` (`logs/26-red.txt`)

### Phase H — Docs, registries, CSV

#### Step 27: Registry counts (own addition only)
**Type:** docs
**Files to Modify:**
- `docs/design/ui-flow-mapping.md` (router row near `:751`, header `:5-6`, Total `:753`: routers +1, procedures +3)
- `docs/design/information-architecture.md` (router count header)

**Validation:**
- [x] `pnpm --filter @intelliflow/web exec vitest run src/app/__tests__/ui-flow-mapping-reconciliation.test.ts src/app/__tests__/ia-reconciliation.test.ts src/app/__tests__/sitemap-reconciliation.test.ts`
- [x] `pnpm exec vitest run --project root tools/scripts/route-total-consistency.test.ts`

#### Step 28: Page co-artifacts
**Type:** docs
**Files to Modify:**
- `docs/design/page-registry.md` (Model Configuration entry shaped like Approval Policies `:1325-1338`)
- `docs/design/PAGE_MAP_AND_FLOWS.md` (`:320` task column → PG-199)
- `docs/design/sitemap.md` (`:239,449` accurate)
- `docs/design/navigation-reachability-audit.md` (`:184` row: SB + IP, no waiver)

**Validation:**
- [x] `node tools/scripts/exec-preflight/check-page-doc-cochange.mjs PG-199` and `node tools/scripts/exec-preflight/check-nav-wiring.mjs PG-199` exit 0

#### Step 29: Dependency chains, ADR, PRD, CSV
**Type:** docs
**Files to Modify:**
- `docs/architecture/diagrams/complete-dependency-chains.md` (PG-199 block after PG-198)
- `docs/architecture/diagrams/ai-output-review-dependency-chain.md` (PG-199 box)
- `docs/architecture/adr/ADR-048-hybrid-ai-inference.md` (header note "Amended by ADR-082 (PG-199): catalog stanzas, tenant fallbacks and ceilings")
- `docs/planning/prd-module-settings.md` (PG-199 addendum delivery note)
- `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv` (ARTIFACT router path → `apps/api/src/modules/agent/model-config.router.ts`, R1)
- `apps/project-tracker/docs/metrics/_global/Sprint_plan_I.csv` (only the PG-199 row; `_J` byte-identical to main)

> Note: the ADR-082 Status → Accepted flip and its README row are done in Step 32, after the full gates (not here).

**Validation:**
- [x] `npx tsx tools/scripts/split-sprint-plan.ts` then reset `_I`/`_J` to main except the PG-199 row (temp-file pattern); `git diff origin/main -- apps/project-tracker/docs/metrics/_global/Sprint_plan_J.csv` empty
- [x] `npx tsx tools/scripts/validate-artifacts.ts PG-199`

#### Step 30: File follow-up issues
**Type:** docs
**Files to Modify:**
- `artifacts/metrics/debt-ledger.yaml` (entries for the five out-of-scope findings)

**Validation:**
- [x] `gh issue create` × 5 (ChainVersion.model dead; ChainVersionEditor reset bug; approval-policies missing from settings search; RLS without policy on tenant_tool_enablement/tenant_memory_policy; sentiment rate-limit purpose mismatch) — each with file:line + proposed fix; numbers recorded in the delivery report

> **Exec note (Step 30, 2026-10-19):** filed #924 (F1 ChainVersion.model), #925 (F2 editor reset), #926 (F3 settings search), #927 (F4 RLS without policy), #928 (F5 sentiment purpose) and #929 (F7 shared Slider thumb unlabelled, found in Step 25). F6 (`scripts/test-db.mjs:96-97` sink recursion, found in Step 6) was already open as #905 after a duplicate search, so no new issue. All seven are in `artifacts/metrics/debt-ledger.yaml` (summary counts +7, own additions only).

### Phase I — REFACTOR

#### Step 31: Refactor for duplication and patterns
**Type:** refactor
**Files to Modify:**
- all files created/modified above (no new files)

**Validation:**
- [x] no sort without comparator; new duplicated lines < 3% (`/sonarqube-fix` local checks); no `istanbul ignore`; no `skipDuplicates`; no secret-shaped strings (`*.example.invalid` hosts only)
- [x] `pnpm --filter @intelliflow/domain --filter @intelliflow/validators --filter @intelliflow/application --filter @intelliflow/adapters --filter @intelliflow/api --filter @intelliflow/ai-worker --filter @intelliflow/web lint`
- [x] `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-199 -- pnpm exec knip` (no new unused exports/files)

### Phase J — VALIDATION

#### Step 32: Full validation matrix + gates
**Type:** validation
**Validation:**
- [x] every command in the Validation Matrix passes (full suite of every touched package via the slot wrapper)
- [x] diff-coverage ≥ 80% on changed lines (`/exec-coverage` after)
- [x] builds: `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-199 -- pnpm turbo build --filter=@intelliflow/web --filter=@intelliflow/api --filter=@intelliflow/ai-worker`
- [x] `node scripts/codex-review.mjs` iterated until clean (waivers with evidence only)
- [x] a11y-expert (WCAG 2.1 AA) review sub-agent; `/code-review`; `/sonarqube-fix`
- [ ] Lighthouse ≥ 90 via the authenticated recipe (`reference_lighthouse_gate_local_recipe`); NEEDS_HUMAN with reason if no credentials
- [x] STOA sub-agents (Foundation required; Domain, Security, Quality, Intelligence as selected by gate-selection) — verdicts from spawned agents only
- [x] `git ls-files | grep -cE '\.(log|coverage|tsbuildinfo)$'` = 0
- [ ] only after every gate above passes: `docs/architecture/adr/ADR-082-tenant-model-config.md` Status → Accepted and `docs/architecture/adr/README.md` row → Accepted (left Proposed if any gate fails)
- [x] attestation `.specify/sprints/sprint-18/attestations/PG-199/attestation.json` + `context_ack.json`, with `definition_of_done_items` for all 13 CSV DoD items, including the N/A ones with reasons: #4 TagsTab via forwardRef (no tags card), #8 colorToken CHECK (rows keyed by purpose, not user-labelled), #9 AI defaults FALSE (no Boolean column/toggle), #10 wire every Boolean toggle (none; IFC-310/311/312 are contacts/accounts only)

**Files to Modify:**
- `docs/architecture/adr/ADR-082-tenant-model-config.md`
- `docs/architecture/adr/README.md`

**Files to Create:**
- `.specify/sprints/sprint-18/attestations/PG-199/context_ack.json` (exec Phase 1; CSV `EVIDENCE:`; exec evidence, not counted in the Files Summary)
- `.specify/sprints/sprint-18/attestations/PG-199/attestation.json` (exec evidence, not counted in the Files Summary)

> **Exec note (Step 29, 2026-10-19):** `validate-artifacts.ts` reports MISMATCH for every plan file the CSV does not list (the CSV lists 5 deliverables, the plan 105 files), so it can never PASS for a multi-file task. The check that matters, as in PG-202's plan session, is every CSV artifact in the plan and on disk: all 5 are (`logs/29-validate-artifacts.txt`). `context_ack.json` was the only CSV artifact the plan did not list; it is listed above.

## Files Summary

| Category | Count |
|---|---|
| Create — domain (4 src + 2 tests) | 6 |
| Create — validators (1 + 1 test) | 2 |
| Create — db migrations | 2 |
| Create — integration test | 1 |
| Create — application/adapters (2 + 1 test) | 3 |
| Create — api (1 + 1 test) | 2 |
| Create — ai-worker (`purpose-ceiling.ts` + parity, purpose-ceiling, purpose-fallbacks tests) | 4 |
| Create — web (5 src + `trpc-errors.ts` + 6 tests) | 12 |
| **Create total** | **32** |
| Modify — domain/validators/application/adapters index + schema.prisma | 5 |
| Modify — api (`router.ts`, smoke test, `types.ts`, `rbac.ts`) | 4 |
| Modify — ai-worker src (`llm-factory.ts`, `tenant-ai-config.ts`, `ai.config.ts`, `llm-tracer.ts`, `tenant-ai-spend.ts`, `cost-tracker.ts`, `ai-worker.ts`, `base.agent.ts`, 4 agents, `summarize-conversation.job.ts`, `insight-generation.chain.ts`, `contact-embed-worker.ts`, `ingestion-workers.ts`, `embedding.chain.ts`, `rag-context.chain.ts`, `auto-response.chain.ts`) | 19 |
| Modify — ai-worker tests (tenant-ai-config, createLLMForTenant, llm-factory, llm-tracer, tenant-ai-spend, cost-tracker, boot spend-wiring, 5 agent tests, 4 extra agent tests (W1), summarize job, contact-embed, ingestion, rag-context, auto-response, 2 embedding chain tests (W2)) | 23 |
| Modify — infra `config.yaml` | 1 |
| Modify — web src (`page.tsx`, 3 migrated contents, `settings-search.ts`) + test | 6 |
| Modify — docs/registries/CSV/ledger (ui-flow-mapping, IA, page-registry, PAGE_MAP, sitemap, nav-audit, 2 chains, ADR-048, ADR-082, ADR README, PRD, CSV, `_I`, debt-ledger) | 15 |
| **Modify total** | **73** |
| **Grand total** | **105** (+0–7 conditional chain sources from Step 21, reported if RED proves them needed) |

## CSV Artifact Alignment

| CSV artifact | In plan | Note |
|---|---|---|
| `ARTIFACT:apps/web/src/app/agent-approvals/model-config/page.tsx` | Step 25 | — |
| `ARTIFACT:apps/web/src/app/agent-approvals/model-config/ModelConfigContent.tsx` | Step 25 | — |
| `ARTIFACT:apps/api/src/modules/agent-approval/model-config.router.ts` | Step 10 at `modules/agent/` | WARN → CSV path corrected in Step 29 per owner ruling R1 |
| `ARTIFACT:packages/validators/src/model-config.ts` | Step 4 | — |
| `EVIDENCE:.specify/sprints/sprint-18/attestations/PG-199/context_ack.json` | Exec Phase 1 | created by `/exec` |

## Final Validation

1. Run every Validation Matrix command.
2. Diff coverage ≥ 80% on changed lines (Sonar new_coverage); package thresholds unchanged.
3. Builds green (web, api, ai-worker, packages).
4. All AC-001…AC-028 and NF-001…NF-005 checked in the attestation `definition_of_done_items`.
5. Runner (Aurora) runs pre-ship once at the final SHA — not this lane.

## Validation Matrix

| Scope | Purpose | Command |
|---|---|---|
| Domain | new + full package | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-199 -- pnpm --filter @intelliflow/domain test` |
| Validators | new + full package | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-199 -- pnpm --filter @intelliflow/validators test` |
| Application | port | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-199 -- pnpm --filter @intelliflow/application test` |
| Adapters | spend repo + full package | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-199 -- pnpm --filter @intelliflow/adapters test` |
| API | router + smoke + agent/security regressions (full package) | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-199 -- pnpm --filter @intelliflow/api test` |
| ai-worker | lib/agents/chains/jobs/workers/tracing/utils (full package) | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-199 -- pnpm --filter @intelliflow/ai-worker test` |
| Web | model-config + migrated pages + reconciliation + settings-search (full package) | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-199 -- pnpm --filter @intelliflow/web exec vitest run` |
| Root tools | route totals | `pnpm exec vitest run --project root tools/scripts/route-total-consistency.test.ts` |
| Integration (DB) | CHECKs, RLS, two tenants | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-199 --exclusive intelliflow-db -- pnpm exec vitest run --project integration tests/integration/model-config.test.ts` |
| Typecheck | all touched | `pnpm --filter @intelliflow/domain --filter @intelliflow/validators --filter @intelliflow/application --filter @intelliflow/adapters --filter @intelliflow/api --filter @intelliflow/ai-worker --filter @intelliflow/web typecheck` |
| Lint | all touched | same filters with `lint` |
| Build | packages + apps | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-199 -- pnpm turbo build --filter='./packages/*' --filter=@intelliflow/api --filter=@intelliflow/ai-worker --filter=@intelliflow/web` |
| Docs gates | page co-change, nav wiring, artifacts | `node tools/scripts/exec-preflight/check-page-doc-cochange.mjs PG-199`; `node tools/scripts/exec-preflight/check-nav-wiring.mjs PG-199`; `npx tsx tools/scripts/validate-artifacts.ts PG-199` |
| Hygiene | evidence extensions | `git ls-files \| grep -cE '\.(log\|coverage\|tsbuildinfo)$'` → 0 (run without a pipe into the gate's exit) |

## Integration Checkpoints Summary

| After Step | Verification | Command |
|---|---|---|
| 2 | domain green + built | `pnpm --filter @intelliflow/domain exec vitest run src/ai/model-config && pnpm --filter @intelliflow/domain build` |
| 4 | validators green | `pnpm --filter @intelliflow/validators exec vitest run src/__tests__/model-config.test.ts` |
| 6 | migrations replay + integration | integration command above |
| 10 | API router + regressions | `pnpm --filter @intelliflow/api exec vitest run src/modules/agent src/security src/__tests__/app-router.smoke.test.ts` |
| 20 | ai-worker full package | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-199 -- pnpm --filter @intelliflow/ai-worker test` |
| 21 | per-purpose fallbacks + chain regressions | `pnpm --filter @intelliflow/ai-worker exec vitest run src/lib/__tests__/purpose-fallbacks.test.ts src/chains src/jobs/__tests__/case-ai-automation.job.test.ts src/__tests__/contact-reply-draft.chain.test.ts` |
| 25 | web model-config | `pnpm --filter @intelliflow/web exec vitest run src/app/agent-approvals` |
| 29 | docs gates + reconciliation | `node tools/scripts/exec-preflight/check-page-doc-cochange.mjs PG-199 && node tools/scripts/exec-preflight/check-nav-wiring.mjs PG-199 && npx tsx tools/scripts/validate-artifacts.ts PG-199 && pnpm exec vitest run --project root tools/scripts/route-total-consistency.test.ts && pnpm --filter @intelliflow/web exec vitest run src/app/__tests__/ui-flow-mapping-reconciliation.test.ts src/app/__tests__/ia-reconciliation.test.ts src/app/__tests__/sitemap-reconciliation.test.ts` |
| 32 | everything | each Validation Matrix row, run one at a time in the order listed (each command's own exit code checked; no pipes) |

## Plan-Reviewer Sign-off

<!-- plan-reviewer: subagent -->
reviewer_subagent: pg199-plan-reviewer (spawned via the Agent tool with `.claude/agents/plan-reviewer.md`, 2026-10-19)

| Iteration | Verdict | ERROR | WARN | INFO | Review file |
|---|---|---|---|---|---|
| 1 | REVISE | 7 | 10 | 5 | `.specify/sprints/sprint-18/context/PG-199/PG-199-plan-review-iter1.md` |
| 2 | REVISE | 3 | 3 | 2 | `.specify/sprints/sprint-18/context/PG-199/PG-199-plan-review-iter2.md` |
| 3 | **APPROVE** | 0 | 0 | 1 | `.specify/sprints/sprint-18/context/PG-199/PG-199-plan-review-iter3.md` |

Reviewer category verdicts (iteration 3, quoted from `PG-199-plan-review-iter3.md:14`):

| Category | Label | Verdict | Evidence |
|---|---|---|---|
| Y | UI Reachability | PASS | sidebar `apps/web/src/components/sidebar/configs/agent-approvals.ts:194-199` and parent link `apps/web/src/components/ai-agents/AIModuleSettingsPanel.tsx:17-21`, verified; page pre-exists, no waiver |
| BB | PRD/ADR Verification | PASS | PRD `docs/planning/prd-module-settings.md` addendum present; ADR-082 exists and is flipped to Accepted in Step 32 after gates; README row and ADR-048 amendment planned |
| A–X, Z–AA, CC–II | all other categories | PASS (L N/A — no mockup) | see review file |

Category Y and Category BB each PASS with their own row in every iteration. Iteration-2 W1 was disputed with evidence (`case-insight.chain.ts:60` is a qualification
call site) and withdrawn by the reviewer. Remaining INFO: Step 21's 0–7 conditional chain-source
edits are outside the Files Summary and must be reported in the delivery report if RED proves them
necessary.
