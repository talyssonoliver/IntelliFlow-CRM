# Specification: PG-199 — Module Settings: Model Config (`/agent-approvals/model-config`)

| Field | Value |
|---|---|
| Task | PG-199 (Sprint 18, Settings, Frontend Dev / STOA-Foundation) |
| Dependencies | PG-178, PG-152, PG-192 — all COMPLETE, claims verified TRUE (see Dependency Verification) |
| Session | 2026-10-19, subagent mode, 6 agents: AI-Specialist, Backend-Architect, Frontend-Lead, Data-Engineer, Domain-Expert, Test-Engineer |
| Rounds | Exploration (6 Explore agents) → R1 ANALYSIS → R2 PROPOSAL → R3 CHALLENGE → R4 CONSENSUS (round 1: 5/6, 1 REJECTED; round 2: **6/6 APPROVED**) |
| Owner rulings | `.specify/sprints/sprint-18/context/PG-199/PG-199-owner-ruling.md` (R1, R2 inherited; Q1–Q8 given 2026-10-19; runner constraints) |
| Round record | `.specify/sprints/sprint-18/context/PG-199/rounds/` (R1–R4 per agent, briefs, `R4-resolutions.md` D1–D29 + A1–A8) |
| Discussion log | `.specify/sprints/sprint-18/specifications/PG-199-discussion.md` |

## Overview

Replace the "coming soon" stub at `/agent-approvals/model-config`
(`apps/web/src/app/agent-approvals/model-config/page.tsx:1-16`) with a real, tenant-scoped,
audited settings page that controls, **per AI purpose** (owner Q1), which model runs, its
temperature and max tokens, an ordered fallback chain, and a monthly cost ceiling — and make the AI
worker actually honour those settings everywhere, including the four agents, the
conversation-summary job and embeddings.

Runtime today: `TenantAIConfig` (`packages/db/prisma/schema.prisma:231-248`) is read only by
`apps/ai-worker/src/lib/tenant-ai-config.ts` and written by nothing; it holds tier/temperature/
maxTokens per `(tenantId, purpose)`. Models are chosen by `(purpose, tier)` via LiteLLM aliases
(`apps/ai-worker/src/lib/llm-factory.ts:326`), OpenRouter by tier (`:20-26,303`), Ollama globally
(`:284`). Agents (`agents/base.agent.ts:164`) and the summary job
(`jobs/summarize-conversation.job.ts:223`) bypass tenant config. Spend is tracked per tenant only
(`utils/tenant-ai-spend.ts:39-64`) and is mis-attributed (`base.agent.ts:690`,
`chains/insight-generation.chain.ts:362-367`).

### Owner rulings that shape this spec (binding)

| # | Ruling |
|---|---|
| R1 | Router at `apps/api/src/modules/agent/model-config.router.ts` (not `modules/agent-approval/`); CSV ARTIFACT path updated. |
| R2 | Only allow-listed models; picking a lower one needs a confirm dialog + an audit entry naming the actor. |
| Q1 | One row per `LLMPurpose` (6): scoring, qualification, email, reasoning, structured, rag. |
| Q2 | Monthly USD ceiling per purpose; when reached that purpose is **blocked** (non-AI fallbacks run). |
| Q3 | Agents + summary job wired to tenant config in this PR. |
| Q4 | Lower-ranked fallback entries need the same confirm + audit as the primary. |
| Q5 | `rag` row shown, model locked; only its ceiling is editable. |
| Q6 | `email` at ceiling: visible "monthly AI ceiling reached for email"; page shows it blocked. |
| Q7 | Never-Downgrade ranking **by price** (input + output per 1k from `MODEL_PRICING`), not hand-assigned ranks. |
| Q8 | Meter embeddings now so the rag ceiling really blocks. |
| Runner | PG-199 owns the `tenant_ai_config` RLS policy (separately removable migration, case_types shape); CI db:push skips SQL-only objects; calm NOT_FOUND on deploy skew; fail open only pre-migration, logged. |

## Related Documents

| Type | Path | Status | Action |
|---|---|---|---|
| PRD | `docs/planning/prd-module-settings.md` | Active | Updated: PG-199 added to Related Tasks; **PG-199 addendum** (AC-M1…AC-M24 + toggle table "none") added in this spec session |
| ADR | `docs/architecture/adr/ADR-082-tenant-model-config.md` | Proposed → Accepted at exec | Created; Decision Outcome = option 2 (this spec); amends ADR-048 |
| ADR | `docs/architecture/adr/ADR-048-hybrid-ai-inference.md` | Accepted | Referenced; amended by ADR-082 (catalog stanzas in LiteLLM YAML, tenant fallbacks/ceilings) |
| Playbook | `docs/planning/module-settings-playbook.md` | — | Followed (§1 layout, §2 EmptyState, §3 CTAs/dirty, §4 TagsTab N/A, §7 AI defaults, §8 toggles N/A) |
| Design | `docs/design/EMPTY_STATES.md`, `docs/design/ICON_USAGE.md`, `docs/company/brand/style-guide.md` | — | Followed |

## Dependency Verification

| Dependency | Claim | Verified | Method |
|---|---|---|---|
| PG-178 | Module settings pages / shell | TRUE | `apps/web/src/app/settings/*` exist; attestation (sprint-16) COMPLETE |
| PG-152 | AgentLogsViewer + logs page | TRUE | `apps/web/src/components/ai-monitoring/AgentLogsViewer.tsx`, `agent-approvals/logs/page.tsx` exist |
| PG-192 | Logs page + detail | TRUE | `agent-approvals/logs/page.tsx`, `logs/[id]` exist |

No false claim; no blocking follow-up. Dependency chain: PG-199 is absent from every diagram in
`docs/architecture/diagrams/` → AC-027 adds it.

## Technical Approach

Hexagonal order: domain → validators → db (migrations) → adapters/application port → api router →
ai-worker runtime → web. Copy the shapes of PG-198 (`approval-policies.router.ts`,
`ApprovalPoliciesContent.tsx`), PG-202 (`calendar/availability.router.ts`, calm NOT_FOUND in
`AvailabilityContent.tsx:159-174`), PG-205 (audit helper `contact-types.router.ts:206-223`) and
the PG-198 migration conventions (`20261016120000_approval_policies`, `20261013120000_case_types`).
Extract shared pieces instead of copying (Sonar new-duplication < 3%).

## Components

### Domain — `packages/domain/src/ai/model-config/` (zero infra deps)
- `catalog.ts`: `MODEL_CATALOG` entries `{ id, kind: 'chat'|'embedding', purposes[],
  priceMicroUsdPer1k: { input, output } (integers = round(MODEL_PRICING × 1e6)), providers:
  { litellm: 'catalog-<id>', openrouter?: string }, deprecated?: true }`. Append-only; no
  `capabilityRank`/`generation`/`family` (Q7). Initial entries = the concrete models
  `infra/litellm/config.yaml:11-117` routes to, plus the production embedding model (Gemini) with a
  real price verified from the provider's pricing page during exec.
- `defaults.ts`: `LLM_PURPOSES` (6), `LLM_TIERS` (3), `DEFAULT_MODEL[purpose][tier]` (partial — no
  `rag-standard`), `CALLER_DEFAULT_TIERS[purpose]` (exported constant that callers import),
  limits (temperature 0–2, maxTokens 1–32768, fallbacks ≤ 3, ceiling 0–2,000,000 cents; 0 = block
  outright, null = none), `purposeSpendKey(purpose)` = `aiSpendCentiCents:<purpose>`.
- `rules.ts`: `priceOf(id)`, `effectiveModel(purpose, tier|null, modelId|null)`,
  `isDowngrade(before, after)` (strictly lower price; equal = lateral; id absent from catalog =
  downgrade), `findDowngrades(before, after)` (primary: effective before vs after, where an
  **unpinned** current is the MAX price among `DEFAULT_MODEL[purpose][t]` for
  `t ∈ CALLER_DEFAULT_TIERS[purpose]`; fallbacks: each new/changed entry vs effective primary after;
  unchanged entries never re-prompt), `purposeSpendPeriod(now)` =
  `getQuotaPeriod('aiSpendCentsPerMonth', now)` (never `'all'`).
- Re-exported from `packages/domain/src/index.ts`. ai-worker `LLMPurpose`/`LLMTier`
  (`llm-factory.ts:36,44`) become aliases of the domain types.

### Validators — `packages/validators/src/model-config.ts`
`purposeConfigInputSchema`, `updateModelConfigSchema = { purposes: PurposeConfigInput[] (1..6),
expected: Record<purpose, ISO string | null>, acknowledgeDowngrade?: true }` with `superRefine`:
duplicate purposes ("Duplicate purpose: items N and M", path to the 2nd item — DoD "duplicate agent
keys"), catalog membership + allowed-for-purpose, primary ∉ fallbacks (against the EFFECTIVE primary),
duplicate fallbacks, fallbacks ≤ 3, `rag` changes other than ceiling rejected, bounds. Non-strict
objects (old-API tolerance). `resetModelConfigSchema = { expected }`. Exported from `index.ts`.

### Data — migrations
- `packages/db/prisma/migrations/20261019120000_tenant_model_config/migration.sql` (Class A header,
  recovery plan, forward-only): `ADD COLUMN "modelId" TEXT NULL`, `"fallbackModelIds" TEXT[] NOT
  NULL DEFAULT '{}'`, `"monthlyCostCeilingCents" INTEGER NULL`; `ALTER COLUMN "tier" DROP NOT NULL`
  (relaxing); named CHECKs `tenant_ai_config_{purpose,tier,temperature,maxTokens,
  monthlyCostCeilingCents,fallbackModelIds}_check` (purpose ∈ 6; tier NULL or ∈ 3; temperature 0–2;
  maxTokens > 0; ceiling 0–2,000,000; cardinality ≤ 3 and modelId ∉ fallbacks). Catalog membership
  is NOT a CHECK (catalog is code).
- `packages/db/prisma/migrations/20261019120100_tenant_ai_config_rls/migration.sql` (separately
  removable): `ENABLE ROW LEVEL SECURITY` (not FORCE) + `DO $$ BEGIN CREATE POLICY
  "tenant_ai_config_tenant_isolation" ... USING/WITH CHECK ("tenantId" =
  current_setting('app.current_tenant_id', true)) EXCEPTION WHEN duplicate_object THEN NULL; END $$;`
  Header: "prod RLS state on tenant_ai_config: unknown, projects-64 verifies at rehearsal".
- `schema.prisma` TenantAIConfig: `tier String?`, new fields, and a comment block listing SQL-only
  objects (CHECKs, policy) "do not drop in a diff" (copy `schema.prisma:1661-1669`). Regenerate the
  client for api + ai-worker.

### Application / adapters
- `packages/application/src/ports/repositories/PurposeSpendPort.ts`:
  `addSpend(tenantId, purpose, period, centiCents): Promise<number>` (clamped at INT max),
  `getSpend(tenantId, period, purposes[]): Promise<Record<purpose, number>>` (batch).
- `packages/adapters/src/repositories/PrismaPurposeSpendRepository.ts`: atomic
  `INSERT … ON CONFLICT DO UPDATE` on `tenant_usage_counters` (shape of
  `PrismaQuotaRepository.ts:56-70`), key from `purposeSpendKey`. Instantiated in the worker beside
  the existing quota repository (`ai-worker.ts:303-307`). No API container change.

### API — `apps/api/src/modules/agent/model-config.router.ts` → `modelConfig.*`
- `get` (all tenant users): 6 rows `{ purpose, modelId|null, effectiveModels, fallbackModelIds,
  temperature, maxTokens, monthlyCostCeilingCents, updatedAt|null, spentCents|null, blocked,
  retired, locked (rag) }`, catalog (ids, prices, `onOpenRouter`), limits, period (UTC), `canManage`
  (`isAgentSettingsAdmin`). Spend via `ctx.prismaWithTenant.tenantUsageCounter.findMany` with
  explicit `tenantId` and domain keys; read failure ⇒ `spentCents:null, blocked:false` + log.
- `update` (admin via `assertAgentSettingsAdmin(ctx,'model configuration')`): in one
  `$transaction`: `pg_advisory_xact_lock` per tenant (pattern `scheduled-reports.router.ts:109-110`);
  read rows with explicit `tenantId`; per-purpose `expected` compare (null vs existing row ⇒
  CONFLICT); skip purposes equal to stored-or-default (no write, no audit); rag lock; retired id ⇒
  coded BAD_REQUEST; `findDowngrades` on the in-lock read; without ack ⇒ `PRECONDITION_FAILED
  { code:'DOWNGRADE_UNCONFIRMED', downgrades[] }` listing all; upsert with `tier: null` on create,
  never editing tier; P2002 ⇒ CONFLICT (`rethrowConflict`). Data objects built field-by-field.
- `resetToDefaults` (admin): same lock + `expected`; delete rows whose `rateLimitPerMinute` is null;
  on the rest null `tier`, `temperature`, `maxTokens`, `modelId`, ceiling and empty fallbacks;
  downgrade check vs defaults; no rows ⇒ no-op, no audit.
- Audit: `'model_config'` added to `ResourceType` (`security/types.ts:91-105`) and to the 5 role maps
  in `security/rbac.ts`; `logModelConfigAudit` (fire-and-forget, `actorId: ctx.tenant.userId`),
  one entry per update (incl. lateral) and per reset, with from/to catalog ids and their prices at
  decision time and `downgrade`/`lateral` flags.
- Mounted in `apps/api/src/router.ts` as `modelConfig` beside `approvalPolicies`.
- `PurposeCeilingReachedError` (code `PURPOSE_CEILING_REACHED`) surfaced by auto-response is mapped to
  a clear "monthly AI ceiling reached for email" message (Q6) where the auto-response draft path
  reports errors.

### ai-worker
- `lib/llm-factory.ts`: `CreateLLMOptions.model` (catalog id) added to the cache key (`:153`) and
  breaker key (`:196-199`). LiteLLM ⇒ `modelName: 'catalog-<id>'`; OpenRouter ⇒
  `providers.openrouter` if mapped, else tier default + rate-limited `pin_unavailable_for_provider`
  warn; Ollama ⇒ pins ignored + warn. `createLLMForTenant` resolves config, runs the pre-call
  ceiling check, applies the pin and executes the fallback chain (429/5xx/timeout/breaker-open;
  attempt cap 1 + fallbacks.length; never re-entering the wrapper). Fallback mechanism (LangChain
  `withFallbacks` vs a helper) chosen by a structured-output RED test written first.
- `lib/tenant-ai-config.ts`: `resolveTenantModelConfig(tenantId, purpose, callerDefaultTier)` →
  `{ tier = row.tier ?? callerDefaultTier, modelId, fallbackModelIds, temperature, maxTokens,
  ceilingCents }`; `resolveEffectiveTier` becomes a thin wrapper (21 callers unchanged). P2021/P2022 ⇒
  legacy select retry, no ceiling, `schema_pending` warn; other DB errors ⇒ last cached, else open +
  warn. Deprecated catalog pins honoured; id absent from catalog ⇒ fall into tenant fallbacks, else
  caller default + error log.
- `lib/purpose-ceiling.ts` (new): `assertWithinCeiling`, `PurposeCeilingReachedError`, spend cache
  30 s keyed `(tenant, purpose, period)`.
- `tracing/llm-tracer.ts`: the **single** metering site. `wrapModelWithTracing` and
  `wrapEmbeddingsWithTracing` record usage (`usage_metadata`, else `countTokens` estimate) with
  `purpose` + `modelId` meta, tenant from `tenantContextStore`. Embedding wrapper also runs the
  ceiling check.
- `utils/tenant-ai-spend.ts` + `ai-worker.ts:310-322`: listener writes the aggregate key (unchanged)
  AND per-purpose spend via `PurposeSpendPort`; carry map keyed by `(tenant, purpose, period)`.
- `utils/cost-tracker.ts` / `config/ai.config.ts`: price via catalog; unknown pricing key is a test
  failure (no silent gpt-3.5 default for catalog models); Gemini embedding priced.
- Remove the duplicate recorders: `agents/base.agent.ts:685-703` and
  `chains/insight-generation.chain.ts:359-368` (same commit as the tracer metering).
- `agents/base.agent.ts`: `getModel(task)` resolves tenant config at execute time (tenant from
  `task.context.metadata.tenantId`), cached per tenant; subclasses (`email-writer`, `followup`,
  `qualification` — `withStructuredOutput`; `next-best-action` — plain) build their models there;
  constructor model kept as no-tenant default.
- `jobs/summarize-conversation.job.ts`: passes `tenantId` to `generateSummaryWithLLM` →
  `createLLMForTenant('reasoning', …)`; ceiling ⇒ `buildFallbackDigest`.
- `workers/contact-embed-worker.ts`, `workers/ingestion-workers.ts`: handlers run inside
  `tenantContextStore.run({ tenantId: data.tenantId })`; ceiling ⇒ explicit BullMQ delayed re-queue
  (15-minute bounded delay, re-check each wake), never dead-letter. `chains/rag-context.chain.ts`:
  ceiling surfaces a visible "AI ceiling reached for rag" result, not a silent empty context.
- `chains/auto-response.chain.ts`: rethrows the coded ceiling error (no template fallback, Q6).
- `infra/litellm/config.yaml`: one `catalog-<id>` stanza per catalog chat model (ADR-082).

### Web — `apps/web/src/app/agent-approvals/model-config/`
| File | Reuse tag |
|---|---|
| `page.tsx` (server shell + Suspense) | REUSES approval-policies `page.tsx` pattern |
| `ModelConfigContent.tsx` | COMPOSES PageHeader + SectionHeader + Card + ConfirmationDialog + EmptyState |
| `ModelConfigLoading.tsx` | REUSES Skeleton; mirrors the bento grid |
| `components/PurposeCard.tsx` | NEW (justified: no shared component edits a model + params + ceiling row; PolicyCard not reusable) — COMPOSES Select, Slider (+visible value, aria-label), Input |
| `components/FallbackList.tsx` | COMPOSES the ResolutionChecklistEditor move-up/down pattern (`cases/(list)/case-types/components/ResolutionChecklistEditor.tsx:130-166`) |
| `components/model-config-model.ts` | NEW pure helpers (draft ⇄ payload, USD ⇄ cents, dirty compare) — keeps logic coverable |
| `apps/web/src/lib/trpc-errors.ts` | NEW shared `errorCode()`; existing copies in `CaseTypesContent.tsx`, `ContactTypesContent.tsx`, `AvailabilityContent.tsx` migrated (re-export kept where tests import it) |

Behaviour: breadcrumbs Dashboard › AI & Agents › AI Settings › Model Configuration; bento
`grid-cols-1 lg:grid-cols-12`, one card per purpose; model `Select` with a "Default (varies by
feature)" option (value `null`) and per-option price; retired current shown as a disabled
"(retired)" option; rag card read-only except ceiling ("platform-managed embedding model" +
dimension); ceiling input "" ⇒ null, "0" ⇒ 0 ("$0 blocks AI for this purpose"); warning when the
ceiling is below month-to-date spend ("drafts stop on save" for email); blocked badge per purpose;
UTC period label + refetch on focus; copy: changes apply within ~2 minutes, ceilings are soft (one
in-flight call may overshoot), embedding spend is estimated, pins apply via the LiteLLM gateway and
marked models are unavailable on OpenRouter, fallbacks are tenant-defined once pinned. Page-level
Save/Reset with a dirty snapshot (playbook §3; Save disabled when `!isDirty || isSaving ||
hasConflict`); Save sends only changed purposes, `expected` only for them, `acknowledgeDowngrade`
only when true, never `tier`; downgrades computed with domain `findDowngrades(snapshot, draft)` at
Save ⇒ ONE combined ConfirmationDialog naming models and prices ("costs less per 1k tokens"); pick
time shows only a non-modal note; CONFLICT keeps the draft and offers "Reload latest"; server issue
paths mapped to fields. Calm NOT_FOUND: `role="status"` notice, no `alert`, no write attempted.
Header links to AI Settings (chain versions). Reset confirm enumerates what is reset and what is kept
(rate-limit overrides kept).

## Interfaces & Contracts

```ts
// domain
type CatalogId = string;
interface CatalogEntry { id: CatalogId; kind: 'chat'|'embedding'; purposes: readonly LLMPurpose[];
  priceMicroUsdPer1k: { input: number; output: number }; providers: { litellm: string; openrouter?: string };
  deprecated?: true }
priceOf(id: CatalogId): number | undefined
effectiveModel(purpose: LLMPurpose, tier: LLMTier | null, modelId: CatalogId | null): CatalogId | null
isDowngrade(before: CatalogId | null, after: CatalogId): boolean
findDowngrades(purpose, before: PurposeModelPick, after: PurposeModelPick):
  { purpose; slot: 'primary' | number; from: CatalogId | null; to: CatalogId; fromPrice; toPrice }[]
purposeSpendKey(p: LLMPurpose): `aiSpendCentiCents:${LLMPurpose}`
purposeSpendPeriod(now: Date): string // 'YYYY-MM' UTC, never 'all'

// api (tRPC)
modelConfig.get: () => { purposes: PurposeRow[6]; catalog; limits; period; canManage }
modelConfig.update: (UpdateModelConfigInput) => { purposes: PurposeRow[] }
  // FORBIDDEN | BAD_REQUEST (validation, rag locked, retired id) | PRECONDITION_FAILED DOWNGRADE_UNCONFIRMED | CONFLICT
modelConfig.resetToDefaults: ({ expected, acknowledgeDowngrade? }) => { reset: number }

// ai-worker
resolveTenantModelConfig(tenantId, purpose, callerDefaultTier): Promise<TenantModelConfig>
createLLMForTenant(purpose, tier, opts & { tenantId }): Promise<BaseChatModel> // throws code PURPOSE_CEILING_REACHED
class PurposeCeilingReachedError extends Error { code = 'PURPOSE_CEILING_REACHED'; purpose; ceilingCents; spentCents }
PurposeSpendPort { addSpend(...); getSpend(...) }
```

## Integration Points

- Registries (only our own addition; other lanes edit the same counts): `apps/api/src/router.ts`,
  `apps/api/src/__tests__/app-router.smoke.test.ts`, `packages/validators/src/index.ts`,
  `packages/domain/src/index.ts`, `apps/api/src/security/{types,rbac}.ts`,
  `apps/web/src/lib/shared/settings-search.ts` (+ count test 13 → 14),
  `docs/design/ui-flow-mapping.md` (routers +1, procedures +3, with reconciliation tests),
  `docs/design/information-architecture.md` router count.
- Cross-document co-changes (page task, Rule 1): `docs/design/PAGE_MAP_AND_FLOWS.md` (task column
  PG-199), `docs/design/page-registry.md` (new entry), `docs/design/sitemap.md` ("Implemented" made
  true), `docs/design/navigation-reachability-audit.md` row, dependency-chain diagrams. Page count
  (214) does not change — the page already exists.
- Rollout order: migration → API → worker → web. Old API + new web ⇒ calm NOT_FOUND. New API + old
  worker ⇒ new columns ignored; a NULL tier takes the old worker's existing fail-open path (caller
  default; that row's temperature/maxTokens ignored until the worker is redeployed) — disclosed in
  ADR-082 and covered by a skew test.

## Runtime Wiring & Replacement Paths

| Surface | Must be called by | Replaces / blocks | Notes |
|---|---|---|---|
| `modelConfig.get/update/resetToDefaults` | `ModelConfigContent.tsx` | the stub page (`page.tsx:1-16`); nothing wrote `tenant_ai_config` before | |
| `findDowngrades` / `isDowngrade` | router `update`/`reset`; web Save dialog | — | one comparator, both sides |
| `resolveTenantModelConfig` | `createLLMForTenant` (21 call sites), `BaseAgent.getModel`, summary job | `createLLM(purpose,'free')` at `base.agent.ts:164`; `summarize-conversation.job.ts:223` | |
| `assertWithinCeiling` | `createLLMForTenant`, `wrapEmbeddingsWithTracing` | — | soft limit |
| tracer metering | every chat + embedding call | `base.agent.ts:685-703`, `insight-generation.chain.ts:359-368` recorders | exactly one increment per call |
| `PurposeSpendPort.addSpend` | cost listener (`ai-worker.ts:310-322`) | aggregate-only `AI_SPEND_KEY` | aggregate kept |
| `catalog-<id>` LiteLLM stanzas | `createLLM` with a pin | alias-only routing | ADR-082 |
| tenant ALS in embed workers | `contact-embed-worker.ts`, `ingestion-workers.ts` | tenant `unknown` (unmetered) | |
| `trpc-errors.ts` `errorCode` | Model Config + 3 migrated pages | 3 local copies | no 4th copy |

## Navigation & Reachability

| Route | Sidebar entry | Parent link | Breadcrumb | Reachable |
|---|---|---|---|---|
| `/agent-approvals/model-config` | `AI_SETTINGS_ITEMS` `model-config` (`apps/web/src/components/sidebar/configs/agent-approvals.ts:194-199`, icon `psychology`, label "Model Configuration") | `AIModuleSettingsPanel.tsx:16-22` | Dashboard › AI & Agents › AI Settings › Model Configuration | YES (already) |

Additional: settings-search entry (AC-022). Layout wrapper: `apps/web/src/app/agent-approvals/layout.tsx`
(`_layout-shell.tsx`, `ModuleGate AI_INTELLIGENCE`, settings-sidebar mode via `isAISettingsPage`).
No sidebar change needed; no waiver.

Route conflict: `/agent-approvals/ai-settings` (`ChainVersionEditor`) edits per-chain-version
model/temperature/maxTokens that are dead at runtime — a different concern (prompt versioning) with
real tRPC data. Coordinated: Model Config owns runtime model settings and links to AI Settings; the
dead field and its reset bug are filed as issues (not edited here, L1).

## Acceptance Criteria

- **AC-001** `/agent-approvals/model-config` renders PageHeader + bento grid with 6 purpose cards from
  `modelConfig.get`; no "coming soon".
- **AC-002** Each non-rag card edits primary model (catalog, allowed for the purpose, or Default),
  temperature (0–2), max tokens (1–32768), ordered fallbacks (≤ 3, unique, ≠ primary), monthly
  ceiling (USD, "" = none, 0 = block).
- **AC-003** rag card: model locked (platform-managed embedding + dimension), ceiling editable; server
  rejects any other rag change.
- **AC-004** Picking a strictly cheaper model (primary or fallback, effective-model compare) requires
  ONE combined confirm at Save naming models and prices; server refuses without
  `acknowledgeDowngrade` (`PRECONDITION_FAILED DOWNGRADE_UNCONFIRMED`).
- **AC-005** Equal price = lateral (no confirm); every update/reset writes one audit entry with actor,
  from/to ids and prices, downgrade/lateral flags.
- **AC-006** Only admins/managers/owners can update/reset (FORBIDDEN otherwise, no write); all tenant
  users can read; `canManage` drives a view-only state.
- **AC-007** Every query carries explicit `tenantId`; cross-tenant access returns NOT_FOUND / no write
  (negative test).
- **AC-008** Update/reset run in `$transaction` under a per-tenant advisory lock; stale `expected` ⇒
  CONFLICT with zero writes; P2002 ⇒ CONFLICT; no `skipDuplicates` anywhere.
- **AC-009** Validator superRefine rejects duplicate purposes (DoD "duplicate agent keys") and the
  other rules listed under Validators.
- **AC-010** Unchanged purposes are not written or audited; created rows have `tier = NULL`; tier is
  never edited by the page.
- **AC-011** Reset restores defaults and keeps `rateLimitPerMinute` overrides; reset confirm enumerates
  reset vs kept.
- **AC-012** Old API (no `modelConfig`) ⇒ calm `role="status"` notice, no write attempted.
- **AC-013** ai-worker honours a pinned model on LiteLLM (`catalog-<id>`) and on OpenRouter where
  mapped; unmapped/Ollama ⇒ caller default + rate-limited warn; page copy states it.
- **AC-014** Fallback chain executes in order on 429/5xx/timeout/breaker-open, capped, works with
  structured output.
- **AC-015** Ceiling reached ⇒ that purpose blocked pre-call; others unaffected; non-AI fallbacks run
  per purpose (scoring default score/churn heuristic; qualification `source:'fallback'`; reasoning
  insight heuristic + summary digest; structured keyword routing/neutral sentiment).
- **AC-016** email at ceiling ⇒ "monthly AI ceiling reached for email"; page shows email blocked (Q6).
- **AC-017** rag at ceiling ⇒ embedding jobs delayed (15 min, re-check), never dead-lettered;
  retrieval shows a visible ceiling result.
- **AC-018** Spend is metered once per chat and embedding call, per purpose, in centicents for the UTC
  month; aggregate tenant spend unchanged; mis-attribution at `base.agent.ts:690` and
  `insight-generation.chain.ts:362-367` removed.
- **AC-019** Agents (all 4) and the summary job use tenant config at execute time.
- **AC-020** Pre-migration DB ⇒ no ceiling + logged reason, tier override still honoured (legacy
  select); DB outage ⇒ last cached, else open + warn; AI never blocked by DB unreachability.
- **AC-021** Migration 20261019120000 adds the columns/CHECKs and relaxes `tier`; 20261019120100 adds
  the RLS policy (separately removable); both Class A.
- **AC-022** Settings search lists "Model Configuration" (count test 13 → 14).
- **AC-023** Header links to AI Settings; ChainVersion follow-ups filed as issues.
- **AC-024** Catalog ⇄ `MODEL_PRICING` ⇄ `infra/litellm/config.yaml` parity tests pass; unknown pricing
  key fails a test.
- **AC-025** PRD addendum, ADR-082 Accepted, page-registry, PAGE_MAP, sitemap, nav-reachability,
  ui-flow-mapping/IA counts updated (own addition only).
- **AC-026** CSV ARTIFACT router path updated to `apps/api/src/modules/agent/model-config.router.ts`;
  splits regenerated with `_I`/`_J` reconciled against main.
- **AC-027** PG-199 added to the dependency-chain diagrams beside PG-198.
- **AC-028** Lighthouse ≥ 90 on the page via the authenticated recipe; if credentials are unavailable
  the gate is NEEDS_HUMAN with the reason (never faked).

### Non-functional
- **NF-001** WCAG 2.1 AA: labelled slider with visible value, reorder buttons ≥ 44 px with per-index
  labels and `aria-live` announcement, dialog focus restore; a11y-expert review pass.
- **NF-002** No heavy server-only imports in web (L11); domain imported through the root barrel unless
  a measured bundle increase justifies a subpath export.
- **NF-003** New duplicated lines < 3%; no sort without comparator (S2871).
- **NF-004** Diff coverage ≥ 80% on changed lines; no `istanbul ignore`; logic lives outside
  `page.tsx` / `router.ts` (coverage-excluded).
- **NF-005** No secret-shaped strings in code, tests or fixtures; `*.example.invalid` hosts.

### DoD item map (CSV row, 13 items)
| # | DoD item | Status |
|---|---|---|
| 1 | Model config page (model, temperature, max tokens, fallback, ceilings; Never-Downgrade; playbook) | AC-001–AC-005, AC-013–AC-019 |
| 2 | Canonical EmptyState (entity + phase=passive) | `EmptyState entity="rules" phase="passive" size="sm"` for an empty fallback list; `entity="agents"` if the catalog returns no model |
| 3 | System-compliant CTAs | playbook §3 (`<Button size="sm">`, Title Case, Save disabled rule) |
| 4 | TagsTab via forwardRef | **N/A** — no tags card (playbook §4 applies only to a tags card) |
| 5 | `$transaction` on destructive writes | AC-008, AC-011 |
| 6 | no skipDuplicates | AC-008 |
| 7 | Zod superRefine duplicate agent keys | AC-009 |
| 8 | colorToken CHECK | **N/A** — rows keyed by purpose, not user-labelled entities |
| 9 | AI defaults FALSE | **N/A** — no Boolean column/toggle; recorded in the PRD toggle table as "none" |
| 10 | Wire every Boolean toggle or declare follow-up | **N/A** — no toggles (IFC-310/311/312 are contacts/accounts only) |
| 11 | Cross-tenant negative test | AC-007 + integration test |
| 12 | Lighthouse ≥ 90 | AC-028 |
| 13 | verified by `pnpm test` | Test Requirements |

## Test Requirements

TDD: every item below is written RED first with a saved failing-run log.

New test files:
- `packages/domain/src/ai/model-config/__tests__/rules.test.ts` — price ranking matrix incl. free/free
  lateral, paid→free downgrade, scoring standard→premium downgrade, unpinned max-default rule,
  unknown id, fallbacks, period never `'all'` + month boundary (fixed clock).
- `packages/domain/src/ai/model-config/__tests__/catalog.test.ts` — snapshot of ids + prices, append-only.
- `packages/validators/src/__tests__/model-config.test.ts` — duplicate purposes message/path, bounds,
  catalog/purpose membership, primary∈fallbacks, rag lock, ceiling "" vs 0.
- `apps/api/src/modules/agent/__tests__/model-config.router.test.ts` — get defaults/canManage;
  FORBIDDEN `it.each` (no `$transaction`); cross-tenant negative; downgrade without ack; lateral
  audit; audit actorId; per-purpose expected CONFLICT (incl. after reset); no-op skip; P2002;
  `failTx` rolls back all purposes; reset keeps rate limit; retired id; spend read failure; exact
  spend key.
- `packages/adapters/src/repositories/__tests__/PrismaPurposeSpendRepository.test.ts` — atomic add,
  clamp, batch get.
- `apps/ai-worker/src/lib/__tests__/model-config-parity.test.ts` — catalog ⇄ MODEL_PRICING ⇄ YAML;
  `CALLER_DEFAULT_TIERS` covers every `createLLMForTenant` call's tier.
- `apps/ai-worker/src/lib/__tests__/purpose-ceiling.test.ts` — block at/over ceiling, 0 blocks, cache
  keyed by period across 31 Oct 23:59:59.999Z → 1 Nov 00:00:00.000Z (fake timers), fail-open matrix
  (P2021/P2022, other error with/without cache).
- Extend `tenant-ai-config.test.ts` (new columns, NULL tier ⇒ caller default, legacy select),
  `createLLMForTenant.test.ts` / `llm-factory.test.ts` (pin per provider, cache + breaker keys,
  fallback chain incl. structured output, attempt cap), tracer tests (single increment per chat and
  embedding call, `countTokens` estimate), `base.agent.test.ts` + agent tests (`getModel` called with
  tenant; mocks gain `createLLMForTenant`), `summarize-conversation.job.test.ts`,
  contact-embed / ingestion worker tests (ALS tenant, delayed re-queue), `rag-context.chain.test.ts`
  (visible ceiling), `auto-response.chain.test.ts` (coded rethrow).
- `apps/web/src/app/agent-approvals/model-config/__tests__/ModelConfigContent.test.tsx` — render 6
  cards, rag locked, NOT_FOUND calm (`role=status`, no alert), single combined downgrade dialog,
  lateral no dialog, CONFLICT reload, dirty/Save disabled, payload (changed only, no tier, ack only
  when true), ceiling "" ⇒ null / "0" ⇒ 0, retired option, view-only for non-admin, a11y labels.
- `.../__tests__/page.test.tsx`, `components/__tests__/{PurposeCard,FallbackList,model-config-model}.test.tsx`,
  `apps/web/src/lib/__tests__/trpc-errors.test.ts`.
- `tests/integration/model-config.test.ts` — two tenants; replays both migrations' SQL when absent
  (CI db:push); CHECK violations (23514/P2004/P2010); `relrowsecurity`; cross-tenant isolation via
  explicit `tenantId`; RLS not relied on. Runs under Node 22 with `DATABASE_TEST_URL` only.

Existing regression suites to rerun (full suite of every touched package): `packages/domain`,
`packages/validators`, `packages/adapters`, `packages/application`, `apps/api` (incl.
`modules/agent/__tests__/*`, `app-router.smoke`, `settings-shared`), `apps/ai-worker` (all `lib`,
`agents`, `chains`, `jobs`, `workers`, `tracing`, `utils`), `apps/web` (agent-approvals, the three
migrated pages' tests, reconciliation tests `sitemap-reconciliation`, `ui-flow-mapping-reconciliation`,
`ia-reconciliation`, `settings-search`), root `tools/scripts/route-total-consistency.test.ts`,
integration project.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Ceiling is soft (cost known post-call; per-worker caches) | Documented in UI + ADR-082; overshoot bounded by in-flight calls per worker |
| Pins not honoured on OpenRouter/Ollama | Per-model `onOpenRouter`; rate-limited warn; page copy |
| Catalog drifts from `MODEL_PRICING`/YAML | Parity tests (AC-024); append-only snapshot |
| Price repricing silently re-orders downgrades | Audit stores prices at decision time; ADR notes it |
| Embedding spend is an estimate; Gemini price unverified | Disclosed; price verified from provider page during exec |
| Sub-centicent carry lost on restart | Disclosed; centicent unit makes the loss negligible |
| Deploy skew (old worker + NULL tier) | Caller default via existing fail-open path; ADR + skew test; rollout order |
| Structured output vs fallback wrapper | RED test first; helper fallback design if needed |
| Shared registries edited by other lanes | Change only our own addition; second merger re-counts |
| Lighthouse needs auth credentials | NEEDS_HUMAN with reason if unavailable |

Out of scope (filed as issues, not deferred in-scope work): ChainVersion.model dead at runtime;
ChainVersionEditor temperature/maxTokens reset bug; approval-policies missing from settings search;
`tenant_tool_enablement`/`tenant_memory_policy` RLS enabled without a policy;
`sentiment.chain.ts:341` rate-limit purpose mismatch.

## Agent Sign-offs

| Agent | Consensus round 1 | Consensus round 2 | Files verified (record) |
|---|---|---|---|
| AI-Specialist | APPROVED | APPROVED | `rounds/R4-ai-specialist.md` |
| Backend-Architect | REJECTED (single BASELINE_TIER) | APPROVED (A1 adopted) | `rounds/R4-backend-architect.md` |
| Frontend-Lead | APPROVED | APPROVED | `rounds/R4-frontend-lead.md` |
| Data-Engineer | APPROVED | APPROVED | `rounds/R4-data-engineer.md` |
| Domain-Expert | APPROVED (conditional on A1) | APPROVED | `rounds/R4-domain-expert.md` |
| Test-Engineer | APPROVED (conditional on A2) | APPROVED | `rounds/R4-test-engineer.md` |

Consensus: 6/6 (100%) in consensus round 2; no unresolved critical issue.
