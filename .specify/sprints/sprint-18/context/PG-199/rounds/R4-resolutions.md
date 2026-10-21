# PG-199 Round 4 CONSENSUS — lead's resolutions of the Round 3 challenges

This is the draft the spec will be built from. Vote on it. Owner rulings Q1–Q8 and the runner
constraints in PG-199-owner-ruling.md are fixed inputs, not votable.

## Domain (`packages/domain/src/ai/model-config/`, zero infra deps)

- **D1 Catalog fields.** `MODEL_CATALOG` entry = `{ id, kind: 'chat'|'embedding', purposes[],
  priceMicroUsdPer1k: { input, output } (integers, = round(MODEL_PRICING × 1e6)),
  providers: { litellm: 'catalog-<id>', openrouter?: string }, deprecated?: true }`.
  `capabilityRank`, `generation`, `family` are DROPPED (Q7: no consumer). Append-only: entries are
  deprecated, never deleted; a snapshot test pins ids + prices.
- **D2 Ranking (Q7).** price = input + output (integer micro-USD per 1k). Downgrade iff strictly
  lower; equal ⇒ lateral (no confirm, still audited). Unknown id (not in catalog at all) ⇒ treated as
  downgrade. Free/free swaps are lateral (owner-accepted). Confirm copy says "lower price", names
  models and prices, never tiers.
- **D3 Effective model.** `effectiveModel(purpose, tier, modelId) = modelId ?? DEFAULT_MODEL[purpose][tier]`
  (table derived from `infra/litellm/config.yaml` aliases; parity test). `BASELINE_TIER[purpose]` =
  tier used for a no-row tenant. `findDowngrades(before, after)` compares EFFECTIVE models (primary
  before vs after; each new/changed fallback vs effective primary after); a first save from defaults
  resolves through the table, so it does not fire the unknown-model rule.
- **D4 Shared constants.** 6 purposes, 3 tiers, limits (temperature 0–2, maxTokens 1–32768,
  fallbacks ≤ 3, ceiling 0–2,000,000 cents, 0 = block outright, null = none), `purposeSpendKey`,
  and the period helper REUSES `getQuotaPeriod` (no second UTC formatter). ai-worker `LLMPurpose`/
  `LLMTier` become aliases of the domain types.
- **D5 Client import.** Add an `./ai/*` subpath export to `packages/domain/package.json` and import
  from it in web (L11 / Lighthouse), unless a measured tree-shake proves the root barrel adds nothing.

## Data (migrations 20261019120000 + 20261019120100)

- **D6 Columns** on `tenant_ai_config`: `modelId TEXT NULL`, `fallbackModelIds TEXT[] NOT NULL
  DEFAULT '{}'`, `monthlyCostCeilingCents INTEGER NULL`; named CHECKs (purpose ∈ 6, tier ∈ 3,
  temperature 0–2, maxTokens > 0, ceiling 0–2,000,000, fallbacks ≤ 3 and primary ∉ fallbacks).
  Catalog membership is NOT a CHECK (catalog is code). `tier` stays NOT NULL; it is not edited on the
  page — router writes existing row tier ?? `BASELINE_TIER[purpose]`.
- **D7 RLS** in the second, separately removable migration (case_types shape; ENABLE not FORCE;
  DO/duplicate_object; header "prod RLS state unknown, projects-64 verifies at rehearsal"). No code
  relies on it.
- **D8 Spend unit.** Per-purpose counters in `tenant_usage_counters` key `aiSpendCentiCents:<purpose>`
  (hundredths of a cent, INTEGER ⇒ ≤ $214k/month/purpose; ceiling cap 2,000,000 cents keeps the
  compare in range). Aggregate `aiSpendCentsPerMonth` unchanged. Sub-centicent carry in memory is
  lost on restart: disclosed.
- **D9 Schema skew.** The worker resolver retries with a legacy select on P2021/P2022 so the tier
  override survives a pre-migration DB.

## API (`apps/api/src/modules/agent/model-config.router.ts`)

- **D10 Procedures** `modelConfig.get | update | resetToDefaults`. `get` returns 6 rows (effective
  config, `updatedAt|null`, `spentCents|null`, `blocked`, `retired`, `locked` for rag), catalog with
  prices + provider availability (`onOpenRouter: boolean`), limits, period, `canManage`.
- **D11 Update contract.** `update({ purposes: PurposeConfigInput[], expected: Record<purpose,
  ISOString|null>, acknowledgeDowngrade?: true })`, validator superRefine rejects duplicate purposes
  (DoD "duplicate agent keys"), primary-in-fallbacks (against the EFFECTIVE primary), duplicate
  fallbacks, non-catalog / not-allowed-for-purpose ids, rag changes other than the ceiling, bounds.
  Server: `pg_advisory_xact_lock` per tenant (scheduled-reports.router.ts:109-110 pattern) at the
  start of `update` and `resetToDefaults`; per-purpose `expected` compare in-lock (null vs existing
  row ⇒ CONFLICT); skip purposes equal to stored-or-default (no write, no audit); `findDowngrades`
  on the in-lock read; without ack ⇒ `PRECONDITION_FAILED { code:'DOWNGRADE_UNCONFIRMED',
  downgrades[] }` listing ALL; P2002 ⇒ CONFLICT; rag locked server-side; re-saving a retired id ⇒
  coded BAD_REQUEST.
- **D12 Reset.** In one `$transaction` under the lock: delete rows whose `rateLimitPerMinute` is
  null, null-out PG-199 columns on the rest (rate-limit override survives). Downgrade check vs
  baseline applies; reset on no rows is a no-op, no audit.
- **D13 Audit.** `'model_config'` ResourceType + rbac entries; one fire-and-forget entry per update
  (incl. lateral) and per reset, actorId = `ctx.tenant.userId`, from/to ids AND their prices at
  decision time, `downgrade`/`lateral` flags.
- **D14 Spend read** in the router via `prismaWithTenant.tenantUsageCounter.findMany` with explicit
  tenantId, key from the domain helper (test asserts exact key). Read failure ⇒ `spentCents:null`,
  `blocked:false`, logged. No container change.

## ai-worker

- **D15 Model pin per provider.** `createLLM` gains `options.model` (catalog id) in cache + breaker
  keys. LiteLLM: new `catalog-<id>` stanzas in `infra/litellm/config.yaml` (ADR-082 amends ADR-048).
  OpenRouter: `providers.openrouter` mapping where it exists, else tier default + rate-limited
  `pin_unavailable_for_provider` warn. Ollama (dev): pins ignored, warn. Tracer meta gains `modelId`.
- **D16 Fallback chain** executed in the worker on 429/5xx/timeout/breaker-open, attempt cap
  1 + fallbacks.length, never re-entering the wrapper. Implementation (LangChain `withFallbacks` vs a
  helper) is decided by a structured-output test written FIRST (RED) in exec. Pinned models lose the
  YAML free→standard fallback: UI + ADR copy says fallbacks are tenant-defined once pinned.
- **D17 Unknown/retired pins.** Deprecated catalog entries keep their provider ids and stay
  honoured (no silent downgrade). An id absent from the catalog (hand-edited DB) fails into the
  tenant's fallbacks; with none, tier default + error log + `get` shows `retired`.
- **D18 Metering — single site.** Chat: `wrapModelWithTracing`; embeddings: `wrapEmbeddingsWithTracing`.
  Usage from `usage_metadata`, else `countTokens` estimate. Delete `base.agent.ts:685-703` recorder
  and `insight-generation.chain.ts:359-368` record in the same commit; a test asserts exactly one
  increment per call (chat and embedding). Price via catalog; unknown pricing key is a test failure.
- **D19 Ceiling.** Pre-call check in `createLLMForTenant` and the embedding wrapper; spend cache 30 s
  keyed `(tenant, purpose, period)`; error has `code: 'PURPOSE_CEILING_REACHED'` (callers check
  `code`/`cause`, not `instanceof`). Soft limit: one in-flight call per worker may overshoot — stated
  in UI copy and ADR. Changes apply within ~2 minutes (config 60 s + spend 30 s): UI copy.
- **D20 Fail-open.** P2021/P2022 ⇒ no ceiling + warn with reason (pre-migration). Other DB errors ⇒
  last cached value, else open + warn. Never block because the DB is unreachable.
- **D21 Agents + summary job (Q3).** `BaseAgent.getModel(task)` resolves tenant config at execute
  time (tenant from task metadata); subclasses build `withStructuredOutput` there (all 4 agents incl.
  NextBestAction); constructor model stays as no-tenant default. Summary job passes tenantId; on
  ceiling ⇒ `buildFallbackDigest`. Test mocks of llm-factory gain `createLLMForTenant` and tests
  assert it was called.
- **D22 Embeddings (Q8).** Embedding job handlers (`ContactEmbedWorker`, ingestion workers) run in
  `tenantContextStore.run({ tenantId: data.tenantId })`; the shared `EmbeddingChain` singleton stays.
  Rag at ceiling ⇒ jobs DEFERRED (delayed retry), never failed/dead-lettered; retrieval surfaces a
  visible "AI ceiling reached for rag" path, not a silent empty result. Gemini embedding model gets a
  real price entry (verified from the provider's pricing page during exec) — no gpt-3.5 default.
  rag row shows "platform-managed embedding model" + dimension; model locked (Q5); ceiling editable.
- **D23 Email at ceiling (Q6).** auto-response throws the coded error; API maps it to "monthly AI
  ceiling reached for email"; page shows the purpose blocked.

## Web (`apps/web/src/app/agent-approvals/model-config/`)

- **D24 Files.** server `page.tsx` (Suspense) + `ModelConfigContent.tsx` + `ModelConfigLoading.tsx` +
  `components/PurposeCard.tsx` (NEW justified) + `components/FallbackList.tsx` (COMPOSES the
  ResolutionChecklistEditor move-up/down pattern) ; REUSES PageHeader, SectionHeader, EmptyState,
  Card, Select, Slider (+ visible value + aria-label), Input, ConfirmationDialog.
- **D25 Save.** Page-level Save/Reset with dirty snapshot (playbook §3); sends ONLY changed purposes;
  downgrades computed with the domain `findDowngrades(snapshot, draft)` at Save ⇒ ONE combined
  ConfirmationDialog (pick time shows a non-modal note only); CONFLICT keeps the draft and offers
  "Reload latest"; server issue paths mapped to fields.
- **D26 States.** Calm NOT_FOUND via extracted `apps/web/src/lib/trpc-errors.ts`, and the existing
  copies are migrated to it (no 4th copy); retired current model shown as a disabled "(retired)"
  option; "$0 blocks AI for this purpose"; ceiling below month-to-date spend warns before Save
  (email: "drafts stop on save"); UTC period label + refetch on focus; provider-honesty copy
  ("pins apply via the LiteLLM gateway; marked models are unavailable on OpenRouter").
- **D27 Reachability.** Sidebar already links. Add a `Model Configuration` entry to
  `apps/web/src/lib/shared/settings-search.ts` and bump its count test 13 → 14 in the same commit.
  Header links to AI Settings (chain versions). Not editing ChainVersionEditor (L1); file issues for
  its dead `model` field and its temperature/maxTokens reset bug, and for approval-policies' missing
  settings-search entry.
- **D28 DoD N/A with evidence.** TagsTab-forwardRef (no tags card), colorToken CHECK (rows keyed by
  purpose, not user-labelled), "wire every Boolean toggle" / "AI defaults FALSE" (no Boolean on the
  page; recorded in the PRD toggle table as "none"). Lighthouse ≥ 90 is attempted with the
  authenticated recipe; NEEDS_HUMAN with reason if credentials are unavailable, never faked.

## Docs / registries

- **D29** ADR-082 → Accepted (option 2, with D1/D2/D15/D16/D19 consequences, ADR-048 amended);
  PRD addendum PG-199 (ACs + toggle table "none"); page-registry entry; PAGE_MAP task column;
  sitemap "Implemented" made true; nav-reachability row; ui-flow-mapping 70→71 routers and
  procedures +3 with the reconciliation tests; dependency-chain diagrams gain PG-199; CSV ARTIFACT
  path → `modules/agent/model-config.router.ts` (R1) + split regen with _I/_J reconciled.

## Follow-up issues to file (not in scope)

ChainVersion.model dead at runtime; ChainVersionEditor resets temperature/maxTokens; approval-policies
missing from settings-search; `tenant_tool_enablement`/`tenant_memory_policy` RLS enabled with no policy;
`sentiment.chain.ts:341` rate-limit purpose mismatch.

---

# Amendments after CONSENSUS round 1 (5 APPROVED / 1 REJECTED)

Round 1 votes: ai-specialist APPROVED, test-engineer APPROVED (conditional A2), frontend-lead
APPROVED, data-engineer APPROVED, domain-expert APPROVED (conditional A1), backend-architect
REJECTED (A1). Each amendment supersedes the D-item it names.

- **A1 (supersedes D3/D4/D6 tier parts) — `tier` becomes NULLABLE.** Callers within one purpose use
  different default tiers (structured: free `sentiment.chain.ts:236` vs standard
  `shared/enrichment-adapter.ts:124`; scoring: `churn-risk.chain.ts:318` vs
  `account-scoring.chain.ts:73`; email: `auto-response.chain.ts:174` vs
  `contact-reply-draft.chain.ts:107`; qualification agents free vs chains standard). Writing one
  BASELINE_TIER would silently move other callers' models. So: migration 20261019120000 also
  `ALTER COLUMN "tier" DROP NOT NULL` (relaxing, Class A) with CHECK `tier IS NULL OR tier IN (...)`;
  resolver uses `row.tier ?? callerDefaultTier`; the router writes `tier = NULL` for rows it creates
  and never edits tier. Old-worker skew: a NULL tier fails `VALID_TIERS` (or Prisma's null-conversion
  error is caught) and both paths fall back to the caller default — the intended meaning. BASELINE_TIER
  is replaced by `CALLER_DEFAULT_TIERS[purpose]` (the set of default tiers its callers pass, with a
  test that greps/imports the call sites). An UNPINNED current model is compared for downgrade
  against the MAXIMUM price among its purpose's caller-default models (conservative: confirm when
  any caller could get cheaper). `DEFAULT_MODEL[purpose][tier]` is partial (no `rag-standard`).
- **A2 (supersedes D4 period).** `getQuotaPeriod` returns `'all'` for non-monthly keys, so the period
  for per-purpose counters is `getQuotaPeriod('aiSpendCentsPerMonth', now)`; month-boundary tests +
  a guard that it is never `'all'` for any purpose.
- **A3 (supersedes D5).** domain's tsup only emits `src/index.ts`; web already lists
  `@intelliflow/domain` in `optimizePackageImports`. Keep the root import; measure the route bundle
  in exec; add a subpath (with a tsup entry) only if measured growth.
- **A4 (amends D12).** Reset also nulls `tier`, `temperature`, `maxTokens` (and the PG-199 columns)
  on rows it keeps for their rate limit; rows with null rate limit are deleted.
- **A5 (amends D22).** Ceiling-blocked embedding jobs use explicit BullMQ delayed re-queue
  (`moveToDelayed` / `DelayedError`) until the next UTC month, NOT the 3-attempt/5 s backoff (would
  dead-letter in ~15 s). Real handler files are listed in the spec from code (contact-embed worker +
  the ingestion boot path in `ai-worker.ts`). Embedding spend is an estimate from input text (no usage
  returned) — disclosed in UI + ADR.
- **A6 (amends D8).** Counter increments clamp at INT max (no overflow into the LLM call path) with a
  boundary test.
- **A7 (amends D21).** `next-best-action.agent.ts` has no `withStructuredOutput`; its getModel test
  has its own shape.
- **A8 (amends D26).** `errorCode` is exported from `CaseTypesContent.tsx` / `ContactTypesContent.tsx`
  and imported by their tests: migrate with a re-export (or move those assertions) — no behaviour
  change. Web sends `expected` only for changed purposes; omits `acknowledgeDowngrade` unless true;
  ceiling input maps "" ⇒ null and "0" ⇒ 0 (never `Number('')`).
