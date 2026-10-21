# PG-199 — Spec exploration (Phase 0.75)

Run: 2026-10-19, six `Explore` sub-agents spawned in parallel (AI-Specialist, Backend-Architect,
Frontend-Lead, Data-Engineer, Domain-Expert, Test-Engineer). Each used Read/Grep/Glob (29–47 tool
calls each) and cited file:line. Findings below are condensed from their reports; the line
numbers are theirs and were spot-checked by the lead for schema.prisma:231-248,
llm-factory.ts:20-26/36/44/303/326, tenant-ai-config.ts, agent-approvals.ts:192-206.

Hydration note: `hydrateContext()` wrote `hydrated-context.{json,md}` (3 deps, hash
`dab1a6656d9e…`) but its codebase-pattern scan returned **0 patterns** on this Windows host (its
shell search printed "The system cannot find the path specified" 60×). This exploration replaces
that gap; it is disclosed, not hidden.

## 1. Runtime reality (AI-Specialist, Data-Engineer)

- `TenantAIConfig` (`packages/db/prisma/schema.prisma:231-248`): `purpose`, `tier`,
  `temperature?`, `maxTokens?`, `rateLimitPerMinute?`, `@@unique([tenantId, purpose])`. No model
  id, fallback, cost column. `purpose`/`tier` unconstrained TEXT (no CHECK).
- Only reader: `apps/ai-worker/src/lib/tenant-ai-config.ts` `resolveEffectiveTier` (60 s cache
  `${tenantId}:${purpose}`, fail-open, `VALID_TIERS` guard). No API/router/UI writes it.
- `LLMPurpose` = scoring|qualification|email|reasoning|structured|rag, `LLMTier` =
  free|standard|premium (`llm-factory.ts:36,44`) — defined only in ai-worker.
- Model resolution: LiteLLM alias `${purpose}-${tier}` (`llm-factory.ts:326`); OpenRouter picks by
  **tier only** (`:20-26,303`, default `openai/gpt-oss-120b:free`); Ollama one global model.
  Factory cache key has no model id (`:153`). Provider fallback is a single env var
  (`resolveFallbackProvider`, `:232-240`); LiteLLM YAML fallbacks free→standard
  (`infra/litellm/config.yaml:127-131`).
- Tenant-aware callers (`createLLMForTenant`): case-*/account-*/contact-* chains, enrichment
  adapter; chains scoring/churn-risk/insight-generation/auto-response/sentiment/ticket-routing
  re-resolve per tenant at invoke. **Not tenant-aware:** all agents via
  `agents/base.agent.ts:164` (`createLLM(purpose,'free')`), `jobs/summarize-conversation.job.ts:223`.
- Concrete models today (`infra/litellm/config.yaml:11-117`): e.g. scoring-free
  `groq/llama-3.1-8b-instant`, reasoning-standard `anthropic/claude-haiku-4-5`,
  reasoning-premium `anthropic/claude-sonnet-4-5`, qualification-premium `openai/gpt-4o`.
  Price table `MODEL_PRICING` (`apps/ai-worker/src/config/ai.config.ts:198-269`) gives a real
  ordering usable for never-downgrade ranking.
- Cost: global `costTracking.dailyLimit` (`ai.config.ts:46-50`), process-global tracker throws
  after the call (`utils/cost-tracker.ts:186-197`); per-tenant spend → quota
  `aiSpendCentsPerMonth` (`utils/tenant-ai-spend.ts:39-64`, enforced `agent.router.ts:378`).
  **No per-purpose/per-agent spend attribution exists.** Mis-attribution: `base.agent.ts:690`
  hardcodes `-free`; `insight-generation.chain.ts:362-367` records 0/0 tokens.
- `ChainVersion.model` (`schema.prisma:5603`, default gpt-4o-mini) is stored and edited free-text
  in AI Settings (`ChainVersionEditor`) but **dead at runtime** (chains use only `config.prompt`).

## 2. API (Backend-Architect)

- Template: `apps/api/src/modules/agent/approval-policies.router.ts` (tenantProcedure, explicit
  tenantId in every where — `prismaWithTenant` does not inject it, L5-8; `list` returns
  `canManage`; mutations `assertAgentSettingsAdmin` from `settings-shared.ts:9-39`;
  `$transaction`; `rethrowConflict` P2002→CONFLICT).
- Shape better matched by PG-202 `calendar/availability.router.ts` get/update/resetToDefaults with
  `upsert` in `$transaction`.
- Audit with actor: PG-205 `contact-types.router.ts:206-223` →
  `getAuditLogger(ctx.prisma).logAction(..., { actorId: ctx.tenant.userId, ... })`, fire-and-forget;
  needs a `ResourceType` member in `apps/api/src/security/types.ts:91-105` (+ `rbac.ts`). PG-198
  router has **no** audit trail.
- Registries: `apps/api/src/router.ts` (mount after `approvalPolicies` L173),
  `__tests__/app-router.smoke.test.ts` (block per router, PG-198 at L142-159),
  `packages/validators/src/index.ts`, `docs/design/ui-flow-mapping.md` (70 routers / 412 procs).
- Nothing to wire in `container.ts`.

## 3. Web (Frontend-Lead)

- Stub `apps/web/src/app/agent-approvals/model-config/page.tsx` (16 lines, "coming soon").
- Reachable already: `AI_SETTINGS_ITEMS` (`sidebar/configs/agent-approvals.ts:194-199`),
  `AIModuleSettingsPanel.tsx:16-22`.
- Copy PG-198 `approval-policies/`: Suspense shell, `PageHeader` + `SectionHeader`, bento
  `grid-cols-1 lg:grid-cols-12`, `EmptyState entity phase="passive" size="sm"`, `aria-live` queue,
  `ConfirmationDialog`. Calm NOT_FOUND degrade pattern from PG-202
  `calendar/availability/AvailabilityContent.tsx:159-174` (PG-198 shows raw error).
- Reuse: ui `Slider` (+ visible value), `Select`/`RadioGroup`, `Input type=number`, `Switch`,
  `ConfirmationDialog`; ordered list pattern from `cases/(list)/case-types/components/ResolutionChecklistEditor.tsx:138-166`.
- Route-conflict: `/agent-approvals/ai-settings` `ChainVersionEditor.tsx:68-85` edits per-version
  model/temp/maxTokens and **resets temp/maxTokens to hard-coded defaults on edit** (real data
  loss bug) — different concern (prompt versioning); Model Config must link, not duplicate.
- Playbook (`docs/planning/module-settings-playbook.md` §1-§14) read in full; TagsTab §4 only
  applies if a tags card exists (none here).

## 4. Data (Data-Engineer)

- Extend `tenant_ai_config` additively (precedent `20260423000000_tenant_memory_and_rate_limits`
  L44-49). Template migration `20261016120000_approval_policies` (Class A header, named CHECKs,
  `SET DEFAULT false`, DO-block RLS policy with USING + WITH CHECK).
- `tenant_ai_config` has RLS **enabled with no policy** (creation migration L78).
- colorToken: N/A (config rows keyed by purpose, not user-labelled entities).
- CI test DB uses `db:push` → integration test must replay migration SQL (`ensureMigrationSql`
  pattern, `tests/integration/approval-policies.test.ts:59-80`).

## 5. Domain (Domain-Expert)

- PRD `docs/planning/prd-module-settings.md` has PG-198 addendum (L878-1000), **no PG-199 section**.
- ADR-048 (`docs/architecture/adr/ADR-048-hybrid-ai-inference.md:86,228-231`): LiteLLM YAML is the
  single source of truth for routing/fallback; budgets via LiteLLM virtual keys (DB unset). Tenant
  model pins / fallback chains / per-purpose ceilings need ADR-082 amending it.
- IFC-310/311/312 are contacts/accounts only — toggles here cannot be parked there.
- Deps PG-178/PG-152/PG-192: attestations live in sprint-16/sprint-8 (not sprint-18), all COMPLETE,
  claims verified TRUE against code; they supply shell/pattern only.
- `docs/design/sitemap.md:239,449` marks the route "Implemented" — false today.

## 6. Tests (Test-Engineer)

- Router tests: `prismaMock` deep mock, `useTx`/`failTx`, FORBIDDEN `it.each`, cross-tenant
  NOT_FOUND with no transaction (`approval-policies.router.test.ts:88-98,159-168,402-409`).
- Validator superRefine duplicate tests (`approval-policies.test.ts:100-112`, contact-types
  `reportDuplicates` L51-75).
- Web: `vi.hoisted` trpc stubs; NOT_FOUND degrade test pattern
  `calendar/availability/__tests__/AvailabilityContent.test.tsx:144-159`.
- Count tests: sitemap-reconciliation (214 pages), ui-flow-mapping-reconciliation (214/70/412),
  ia-reconciliation, route-total-consistency, settings-search (13 items / 4 categories).
- Coverage excludes `app/**/page.tsx` and `apps/api/src/router.ts` — logic must live in
  `ModelConfigContent.tsx` and the router module.

## Mandatory co-artifacts detected (Rule 1, PG-* task)

`docs/design/PAGE_MAP_AND_FLOWS.md` (L320 task column), `docs/design/sitemap.md`,
`docs/design/navigation-reachability-audit.md` (L184), `docs/design/page-registry.md` (new entry),
`docs/architecture/diagrams/complete-dependency-chains.md` + `ai-intelligence`/`ai-output-review`
chain (PG-199 absent from all diagrams).

## Open product questions (to owner before ANALYSIS)

Unit of "agent"; cost-ceiling semantics/enforcement; runtime wiring scope for non-tenant-aware
agents; whether fallback entries are subject to the downgrade confirm. Model selection = allow-listed
concrete models and downgrade = confirm + audit were already ruled (PG-198 R2, 2026-10-13).
