# PG-199 Round 2 PROPOSAL — Backend-Architect

Paths relative to the pg-199 worktree. I accept the lead's assumptions except where marked CHALLENGE.

## Approach
- **Router shape follows PG-198.** Use `approval-policies.router.ts:211-364` as the template: `tenantProcedure`, explicit `tenantId` in every `where` (header `:1-9`), `assertAgentSettingsAdmin` on mutations (`settings-shared.ts:17-26`), `$transaction`, `canManage` on read (`:222`).
- **Audit follows PG-205.** A `logModelConfigAudit` helper copies `contact-types.router.ts:206-223`: fire-and-forget `getAuditLogger(ctx.prisma).logAction(..., { actorId: ctx.tenant.userId, beforeState, afterState })`. Log ids, field names and model catalog ids only.
- **Domain owns the rules.** Everything lives under `packages/domain/src/ai/model-config/` and is exported from `domain/src/index.ts` beside `:119-120`. `ai-worker/package.json:33,36` already depends on domain and validators, so no new package edge is needed.
- **CHALLENGE 1: spend storage must not widen `QuotaKey`.**
  - `QUOTA_KEYS` is closed (`QuotaRegistry.ts:13-23`, per Data-Engineer R1) and `QuotaRepositoryPort.getCounter/incrementCounter` take `QuotaKey` (`QuotaRepositoryPort.ts:30,33`).
  - So `aiSpend:<purpose>` goes through a **new narrow port**, `PurposeSpendPort`, in `packages/application/src/ports/repositories/`. It is implemented by `PrismaPurposeSpendRepository` in adapters, reusing the atomic `INSERT ... ON CONFLICT` shape of `PrismaQuotaRepository.ts:56-70` against `tenant_usage_counters`.
  - The key and period are built by pure domain helpers, so API read and worker write cannot drift.
- **CHALLENGE 2: no container wiring for the API read.**
  - The API only reads month-to-date spend. `ctx.prismaWithTenant.tenantUsageCounter.findMany({ where: { tenantId, period, key: { in: keys } } })` is enough. This avoids a new `container.ts` / `context.ts` entry (`apps/api/CLAUDE.md` wiring rule).
  - Only the worker writes, so the adapter is instantiated at `ai-worker.ts:303-307`, next to the existing quota repository.
- **Downgrade is enforced server-side.** The client's dialog is advisory. The router recomputes `findDowngrades(before, after)` and refuses without `acknowledgeDowngrade: true`.
- **CHALLENGE 3: `rag` locked server-side too.** Per Q5, the router rejects a changed `modelId` / `fallbackModelIds` / `temperature` / `maxTokens` for `rag`. Only the ceiling is editable. A UI-only lock would let an API caller change the embedding dimension.

## Files
**Create**
- `packages/domain/src/ai/model-config/catalog.ts` — `MODEL_CATALOG` (catalog id → per-provider model ids, family, `capabilityRank`, `generation`, allowed purposes, price per 1k for UI). Rank is explicit, not price-derived (Domain-Expert R1 interpretation 1).
- `.../rules.ts` — `isDowngrade`, `findDowngrades`, `resolveEffectiveModelConfig`, `purposeSpendKey`, `purposeSpendPeriod`, defaults and limits.
- `.../index.ts` — barrel.
- `packages/validators/src/model-config.ts` — schemas (below); export from `index.ts` beside `:111`.
- `apps/api/src/modules/agent/model-config.router.ts`.
- `packages/application/src/ports/repositories/PurposeSpendPort.ts`; `packages/adapters/src/repositories/PrismaPurposeSpendRepository.ts` (the matching migration is Data-Engineer's).
- Tests: `domain/.../__tests__/{rules,catalog-litellm-consistency}.test.ts`, `validators/__tests__/model-config.test.ts`, `api/.../__tests__/model-config.router.test.ts`, adapter test, integration test (replays migration SQL, per `tests/integration/approval-policies.test.ts:59-80`).

**Modify**
- `apps/api/src/router.ts` — import after `:42`, mount `modelConfig: modelConfigRouter,` after `:173`.
- `apps/api/src/security/types.ts:105` — add `| 'model_config'`.
- `apps/api/src/security/rbac.ts:55-56, 71-72, 87-88, 103-104, 119-120` — one `model_config` entry per role: owner/admin full, manager `read/write/delete/manage`, others `read`.
- `apps/api/src/__tests__/app-router.smoke.test.ts` — block after `:159` for `get, update, resetToDefaults`.
- `packages/domain/src/index.ts` — one export line. `ai-worker/src/lib/llm-factory.ts:36,44` — `LLMPurpose` / `LLMTier` become aliases.
- `packages/db/prisma/schema.prisma:231-248` — new fields (Data-Engineer).
- `apps/project-tracker/.../Sprint_plan.csv` — fix the ARTIFACT path to `modules/agent/`, then regenerate the splits.
- `docs/design/ui-flow-mapping.md` — router and procedure counts (70 → 71 routers, 412 → 415 procedures), with the reconciliation tests that assert them.

## Interfaces
```ts
// domain
type ModelPick = { modelId: string | null; fallbackModelIds: readonly string[] };
isDowngrade(purpose, currentId: string | null, nextId: string): boolean   // strictly lower capabilityRank; equal rank is lateral
findDowngrades(purpose, before: ModelPick, after: ModelPick): { slot: 'primary'|number; from: string|null; to: string }[]
purposeSpendKey(p: LLMPurpose): `aiSpendCents:${LLMPurpose}`; purposeSpendPeriod(d: Date): string // 'YYYY-MM' UTC

// validators (z.object strips unknown keys; no .strict(), for old-API tolerance)
updateModelConfigSchema = { purpose, tier, modelId: string|null, fallbackModelIds: string[],
  temperature: number|null, maxTokens: int|null, monthlyCostCeilingCents: int|null,
  expectedUpdatedAt: Date|null, acknowledgeDowngrade: boolean (default false) }
  .superRefine // catalog membership, purpose allowed, primary not in fallbacks, no duplicate fallbacks, max length, rag lock, bounds
resetModelConfigSchema = { purpose?: LLMPurpose }   // omitted = all six

// router (modelConfig.*)
get: query -> { purposes: Row[6], catalog, limits, defaults, spendPeriod, canManage }
     // Row = effective config (rows absent => factory defaults), updatedAt, spentCents, blocked: boolean
update: mutation -> Row
     // errors: FORBIDDEN (non-admin); NOT_FOUND-free (upsert); BAD_REQUEST rag locked;
     // PRECONDITION_FAILED { code:'DOWNGRADE_UNCONFIRMED', downgrades[] } without ack; CONFLICT stale expectedUpdatedAt
resetToDefaults: mutation -> { reset: number }   // deletes tenant rows; downgrade check applies if current outranks factory default

// port
PurposeSpendPort { getSpentCents(tenantId, purpose, period): Promise<number>; addSpentCents(tenantId, purpose, period, cents): Promise<number> }
```
- **Update flow.** Inside one `$transaction`: read the existing row with explicit `tenantId`, compare `expectedUpdatedAt`, compute `findDowngrades` on the in-transaction read (not a pre-read), then upsert on `tenantId_purpose`. Audit fires after commit, with `downgrade: true` and the downgrade list.
- **Reset.** One `deleteMany({ where: { tenantId, ...(purpose && { purpose }) } })` inside `$transaction`, same pattern as `approval-policies.router.ts:336-344`.
- **Spend failure.** Reading spend failing must not break `get`. Return `spentCents: null` and `blocked: false`, and log the reason.

## Integration
- **Deploy skew.**
  - Old API plus new web: `modelConfig.get` is `NOT_FOUND`, and the page degrades calmly through the shared `lib/trpc-errors.ts` (Frontend).
  - New API plus old worker: new columns are nullable and ignored. The worker keeps honouring tier, temperature and maxTokens (`tenant-ai-config.ts:120-129`).
  - The page copy must say enforcement of model / ceiling begins when the worker is on the new version.
  - Rollout order: migration, API, worker, web.
- **Ceiling semantics.** The worker pre-call check compares `purposeSpend` against `monthlyCostCeilingCents`. UTC month, matching `getQuotaPeriod`. `0` means block outright, null means none. One overshoot call is accepted, because cost is only known post-call.
- **Fail-open.** In the worker, only Prisma `P2021` / `P2022` (table or column missing) means "no ceiling" plus a logged reason. Connection errors keep the existing fail-open of `tenant-ai-config.ts:130-136` but log at warn level naming the ceiling as unenforced. This is for AI-specialist to confirm.
- **Staleness.** The worker's 60 s cache (`tenant-ai-config.ts:37-43`) means edits apply within about a minute. The UI states it.
- **No RLS reliance.** Every query carries `tenantId`. The policy is a separate migration.

## Runtime Consumer
| New thing | Production caller | Legacy replaced |
|---|---|---|
| `modelConfig.get` | `ModelConfigContent.tsx` on `/agent-approvals/model-config` (stub today: 16-line page, per exploration §3) | none; page was "coming soon" |
| `modelConfig.update` / `resetToDefaults` | same component's Save / Reset | nothing writes `tenant_ai_config` today |
| `findDowngrades`, `isDowngrade` | router `update` / `reset`; the web dialog for the preview | none |
| `resolveEffectiveModelConfig` | `resolveEffectiveTier` evolves into it, called by `createLLMForTenant` (`llm-factory.ts:387`) and `BaseAgent.invokeLLM` | `createLLM(purpose,'free')` at `base.agent.ts:164`; hardcoded call in `summarize-conversation.job.ts:223` |
| `PurposeSpendPort.addSpentCents` | the worker's cost listener (`tenant-ai-spend.ts:45-64`, wired `ai-worker.ts:303-322`) | single aggregate `AI_SPEND_KEY` only (`:19`) |
| `PurposeSpendPort.getSpentCents` | pre-call ceiling check in the tenant-aware factory | none |
| `purposeSpendKey/Period` | adapter, worker and router read | n/a |
| `'model_config'` ResourceType | `logModelConfigAudit` | n/a |

## Open points for consensus
1. The shape of the `PRECONDITION_FAILED` payload that the UI reads for the dialog (Frontend).
2. Whether `rag` rows are returned with `locked: true` and a fixed `modelId` from the catalog, so the UI never infers the lock (my recommendation).
3. `expectedUpdatedAt` for a purpose with no row yet is `null`. The conflict check treats "row appeared since" as `CONFLICT`.
