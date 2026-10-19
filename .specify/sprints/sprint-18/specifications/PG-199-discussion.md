# PG-199 — Spec session discussion log

Assembled verbatim from the per-agent round files in `context/PG-199/rounds/` (each agent wrote its own file).
Exploration: `context/PG-199/PG-199-spec-exploration.md`. Rulings: `context/PG-199/PG-199-owner-ruling.md`.

## Round 1 — ANALYSIS

### ai-specialist

### PG-199 Round 1 ANALYSIS (AI-Specialist, LLM routing lens)

All paths are under `apps/ai-worker/src/` unless noted. Line numbers are from the pg-199 worktree. No files were edited during analysis.

#### Files Reviewed
- `lib/llm-factory.ts`
  - Cache key: 143-154. Breaker pool: 194-211. `resolveFallbackProvider`: 232-240.
  - `createLLM`: 256-354, with branches Ollama 281, mock 287, OpenRouter 297, LiteLLM 320.
  - `createLLMForTenant`: 380-398. `createEmbeddings`: 409-464.
- `lib/tenant-ai-config.ts`
  - 60s cache: 37-43. `resolveEffectiveTier`: 74-137. Fail-open: 130-136. `resolveRateLimit`: 162-190.
- `agents/base.agent.ts`: purpose 161, `createLLM(this.purpose,'free')` 164, `invokeLLM` 665-703, hardcoded `-free` at 690, `recordUsage` 694.
- `jobs/summarize-conversation.job.ts`: `generateSummaryWithLLM(transcript)` at 222-223 takes no tenant, although `tenantId` is in scope at 262.
- `utils/cost-tracker.ts`: `calculateCost` 79, listeners 95-101, `checkThresholds` 186-197.
- `utils/tenant-ai-spend.ts`: single key `AI_SPEND_KEY` 19, recorder 45-63, listener wiring at `ai-worker.ts:310-322`, tenant from ALS at `ai-worker.ts:312`.
- `config/ai.config.ts`: `MODEL_PRICING` 198-269, `calculateCost` 276-283.
- `infra/litellm/config.yaml`: model_list 7+, `router_settings.fallbacks` 127-131, budgets only via an unset DB (138).

#### Interpretation
1. **Pinned model id reaching each provider.**
   - Today the model is derived from `(purpose, tier)` only.
     - LiteLLM uses the alias `${purpose}-${tier}` (`llm-factory.ts:326`).
     - OpenRouter uses `openRouterModelForTier(tier)` (`:20-26,303`).
     - Ollama uses `aiConfig.ollama.model` (`:284`).
   - A pinned id therefore needs a new `CreateLLMOptions.model` field, which becomes the cache key's seventh dimension (`:153`).
   - Per provider:
     - OpenRouter: pass the id as `modelName` at `:303`. This is a direct fit, and the id must be in the OpenRouter namespace (`vendor/model`).
     - LiteLLM: a raw id such as `anthropic/claude-haiku-4-5` only works if the proxy has a matching `model_name` entry or a wildcard route. Today only the logical aliases exist (`config.yaml:11-117`).
     - Ollama: override `model` at `:284`.
   - Open design point: the allow-list's id format must be provider-neutral (a logical catalog id mapped per provider), or the pin is unusable on two of the three providers.
2. **Fallback chain execution.**
   - Nothing at request level exists today. `resolveFallbackProvider` is a single env-var provider swap (`:232-240`), and LiteLLM fallbacks are a static YAML (`config.yaml:127-131`).
   - Tenant fallbacks must be executed in the worker as a model list: try the primary, and on a transport, 429 or 5xx error build the next entry via `createLLM({model})`.
   - LangChain's `.withFallbacks()` would do it. The breaker key `${provider}:${purpose}-${tier}` (`:196-199`) needs the model id added, or one bad pin trips every tenant's breaker.
3. **Per-purpose spend and ceiling, pre-call.**
   - The listener has `usage.operationType` and `model` but no purpose or tenant-by-purpose, and `recordTenantSpend` writes one aggregate key (`tenant-ai-spend.ts:56`).
   - Needed: a `(tenantId, purpose, yyyymm)` accumulator. It is incremented in the same listener, so `purpose` must be added to `recordUsage` metadata. It is read in `createLLMForTenant` before building the model.
   - If the ceiling is reached, throw a typed `PurposeCeilingReachedError`. Callers already have non-AI fallbacks, for example `buildFallbackDigest` (`summarize-conversation.job.ts:215-219`).
   - Enforcement is soft-by-one-call: cost is only known post-call (`cost-tracker.ts:79`), and the existing daily limit also throws after the spend (`:186-197`). The spec should say so.
4. **Agents and the summary job become tenant-aware.**
   - `BaseAgent` builds its model synchronously in the constructor (`base.agent.ts:164`), but `createLLMForTenant` is async (`llm-factory.ts:380`).
   - Move resolution into `invokeLLM` (`:665`), using `task.context.metadata.tenantId`, which the agent already reads at `:266` and `:315`. Keep a lazy default model for the no-tenant case.
   - The summary job passes `tenantId` into `generateSummaryWithLLM` and calls `createLLMForTenant('reasoning','free',{tenantId})` at `:223`.
   - Four concrete agents extend `BaseAgent`: `email-writer.agent.ts:55`, `followup.agent.ts:56`, `next-best-action.agent.ts:180`, `qualification.agent.ts:66`.

#### Questions (the code cannot answer)
- Q-A: What is the allow-list id format, and is the `ChainVersion.model` free-text field (dead at runtime, per exploration) to be migrated or left alone?
- Q-B: Should a LiteLLM wildcard route (for example `anthropic/*`) be added to `config.yaml`, or should pins be restricted to the existing alias set? This goes against ADR-048's "YAML is the single source of truth" (exploration section 5), so ADR-082 must state the amendment.
- Q-C: Is the ceiling expressed in USD from `MODEL_PRICING`, which is an estimate, not an invoice (`tenant-ai-spend.ts:8-10`)? Please confirm that is acceptable.

#### Concerns (with evidence)
- C1. OpenRouter ignores purpose entirely: `openRouterModelForTier(tier)` is tier-only (`llm-factory.ts:20-26`). Today one row per purpose changes nothing but the tier on the production path, so it needs the pinned-model plumbing, not just a UI.
- C2. The cache key has no model id (`:153`). A pin without a key change would serve stale or wrong-tenant models.
- C3. The 60s tier cache (`tenant-ai-config.ts:39`) plus the `_tierCache` entry shape (`:29-34`) does not carry model, fallbacks or ceiling. A ceiling or pin change takes up to 60s per worker, and it is per-process, so with N workers there is no instant propagation. Also, `resolveRateLimit` has a separate cache of the same shape (`:149`).
- C4. Cost mis-attribution at `base.agent.ts:690`: `modelName` is hardcoded `-free`. With a tenant on premium, spend is priced at `reasoning-free`, which is `{0,0}` (`ai.config.ts:240`). Ceilings would never trip for reasoning agents.
- C5. `calculateCost` falls back to `gpt-3.5-turbo` pricing for any unknown key (`ai.config.ts:277`). Pinned concrete ids absent from `MODEL_PRICING` (keys `:199-268`, which are logical aliases plus legacy OpenAI names) would be silently mispriced. The allow-list must be a subset of the priced keys, or pricing must be extended in the same PR.
- C6. Almost no spend is recorded: outside the tracker itself, `recordUsage` appears only at `base.agent.ts:694` and `insight-generation.chain.ts:362`. The insight chain records 0/0 tokens (`:362-367`). The case, account and contact chains record nothing. A per-purpose ceiling over chains that never call the tracker is unenforceable until tokens are captured, for example in the `wrapModelWithTracing` callback (`llm-tracer`).
- C7. Embeddings and RAG: `createEmbeddings(tier)` has no purpose, tenant or model parameter (`:409`), and the Gemini branch ignores tier (`:424-433`). The `rag` row can only apply to embeddings if this signature changes. Consider limiting `rag` to a ceiling and tier for now, and flagging model pin as unsupported.
- C8. Breaker key `:196-199` and the ALS `tenantContextStore` (`ai-worker.ts:1038`) must be reconciled. The tenant for a spend event comes from ALS, but the purpose is not in ALS.
- C9. Fail-open vs. the owner's rule: `resolveEffectiveTier` swallows DB errors (`:130-136`). The ruling wants fail-open only until the migration is applied. A missing-column error should log the reason, and a connection error should arguably not disable a ceiling.

#### Dependencies on other agents
- **Backend:**
  - The router must validate the allow-list and the lower-ranked-pick confirm, with the audit entry naming the actor.
  - The ranking source should be shared with `MODEL_PRICING`, for example a `packages/validators` catalog that ai-worker also imports.
  - It also needs a spend-read procedure for the UI's "used this month".
- **Data:** the migration needs columns for model, fallback ids, a USD ceiling and per-purpose monthly spend (a new table or a JSON counter). It must keep the RLS step separately removable. Fail-open for missing columns lives in ai-worker (C9).
- **Frontend:** purposes are fixed at six rows. It shows an estimate disclaimer (Q-C), the downgrade confirm, and calm NOT_FOUND degrade.
- **Test:** the cache key now includes the model (C2), the `-free` mis-attribution (C4), the ceiling block with non-AI fallback, a cross-tenant negative test, and fake-timer coverage of the 60s TTL.

### backend-architect

### PG-199 Round 1 ANALYSIS — Backend-Architect (read-only; nothing else edited)

#### Files Reviewed
- `PG-199-owner-ruling.md:5-6` (R1 router path), `:13-18` (Q1-Q4), `:24-38` (runner constraints). `ADR-082:46-50` (Decision Outcome still "TBD").
- CSV row 579 lists `ARTIFACT:apps/api/src/modules/agent-approval/model-config.router.ts`. This contradicts R1, so the CSV needs a fix.
- `approval-policies.router.ts:211-364` (template), `:44-45` (`PolicyCtx` / `PolicyTx` types), `:226-259` (create with `$transaction` and `rethrowConflict`), `:336-344` (`resetToDefaults`).
- `settings-shared.ts:9-39` (admin roles, `assertAgentSettingsAdmin`, `rethrowConflict`). Its header at `:2-3` already anticipates PG-199.
- `contact-types.router.ts:206-223` (audit pattern), `security/types.ts:91-105` (`ResourceType`), `security/rbac.ts:55-56, 71-72, 87-88, 103-104, 119-120` (per-role permission maps).
- `router.ts:42, 173` (registration), `__tests__/app-router.smoke.test.ts:142-159` (smoke pattern).
- `packages/domain/src/index.ts:119-120` (`export * from './ai/approval-policy'`), `packages/validators/src/index.ts:105,111`.
- `ai-worker/package.json:33,36` (already depends on `@intelliflow/domain` and `validators`).
- `llm-factory.ts:36,44` (`LLMPurpose` / `LLMTier` defined in ai-worker), `:380-398` (`createLLMForTenant`).
- `tenant-ai-config.ts:56-60, 74-137` (tier / temperature / maxTokens only, with a fail-open cache).
- `schema.prisma:231-248` (`TenantAIConfig`).

#### Interpretation
1. **Router.** Create `apps/api/src/modules/agent/model-config.router.ts` and mount it in `router.ts` next to line 173 as `modelConfig`.
   - Use `tenantProcedure` for everything.
   - Pass `tenantId` explicitly in every `where`. `approval-policies.router.ts:1-9` says `prismaWithTenant` does not inject it.
   - Procedures: `get` (returns `canManage`, the 6 purposes with defaults, the allow-list, ranking and limits), `update` (upsert one purpose in `$transaction`), `resetToDefaults`, and a read-only `usage` for month-to-date spend per purpose.
   - Gate every mutation with `assertAgentSettingsAdmin(ctx, 'model configuration')`.
2. **Shared constants.** Put purposes, tiers, the model allow-list with ranking, and the limits in `packages/domain/src/ai/model-config.ts`.
   - Re-export it from `domain/src/index.ts`, following the line 119-120 convention.
   - Both consumers can import it: ai-worker (`package.json:33`) and api (`approval-policies.router.ts:13-24`).
   - `LLMPurpose` / `LLMTier` (`llm-factory.ts:36,44`) become aliases of the domain types, so there is one source and no drift.
   - Domain stays free of infra imports (`packages/domain/CLAUDE.md:5`).
3. **Validators.** `packages/validators/src/model-config.ts`, exported from `index.ts` beside line 111. Use `superRefine` to reject a duplicate model between primary and fallbacks, fallbacks over the max length, and any model id not on the allow-list.
4. **Never-downgrade (R2 and Q4).** Compute server-side with a domain function `isDowngrade(current, next)` over the ranking, covering primary and every fallback entry.
   - `update` takes `acknowledgeDowngrade: boolean`.
   - If the diff contains a lower-ranked pick and the flag is false, throw `PRECONDITION_FAILED` / `BAD_REQUEST`.
   - The UI confirm dialog is not enough, because it can be bypassed by calling the API directly.
5. **Audit.** Add `'model_config'` to `ResourceType` (`types.ts:105`) and to all 5 role maps in `rbac.ts`. The PG-205 additions at lines 56/72/88/104/120 show those maps need an entry per role.
   - Call `getAuditLogger(ctx.prisma).logAction(action, 'model_config', id, tenantId, { actorId: ctx.tenant.userId, beforeState, afterState })`, fire-and-forget, as in `contact-types.router.ts:217-222`.
   - Log ids and field names only, plus a `downgrade: true` marker.
6. **Smoke test.** Add a block after `app-router.smoke.test.ts:159` asserting every procedure is defined.
7. **Cache invalidation.** `tenant-ai-config.ts:37` is a 60 s in-process cache in a different process, so the API cannot flush it.
   - Accept up to 60 s of staleness and state that in the UI copy. No port or container wiring is needed (`apps/api/CLAUDE.md` container rule, nothing to register).

#### Questions (code cannot answer)
- **Q-A (needs the owner or AI-specialist):** What are the exact allow-list and ranking? `MODEL_PRICING` (`ai.config.ts:198-269`, per the exploration doc) is a price table, not a capability rank. Is cheaper-price-first the rank, with the version or size ordering encoded in the domain list by hand?
- **Q-B:** Does "block that purpose" at the ceiling apply to the whole calendar month in UTC? I can't resolve that from code. It affects the `usage` query window and the reset boundary.

#### Concerns
1. **Deploy skew, new API with old worker.** The old worker's `findUnique` at `tenant-ai-config.ts:90` selects all columns. Added nullable columns are harmless, so the migration must stay strictly additive (Class A).
   - Old worker still honours `tier`, `temperature` and `maxTokens`.
   - It ignores model, fallbacks and ceilings until it is redeployed, so the UI must not claim enforcement until the worker ships.
   - Worker rollout order: migrate, API, then worker.
2. **Deploy skew, old API with new web.** The web page calls `modelConfig.get` and gets `NOT_FOUND`. It must degrade calmly (runner constraint `:35-36`), following `AvailabilityContent.tsx:159-174`. The new web must not send `acknowledgeDowngrade` to an API that rejects unknown keys. A plain `z.object` strips them silently, and I would not use `.strict()`.
3. **Fail-open on the ceiling.** The runner requires fail-open only until the migration is applied, and logging the reason (`:37-38`). `resolveEffectiveTier` already fails open on any error (`:130-136`), so a DB outage would also lift the ceiling.
   - Fail-open must be distinguished from fail-closed-on-known-breach, e.g. only a missing-column error (Prisma `P2022` / `P2021`) fails open. Everything else is logged at warn level.
   - This is a real design point for round 2.
4. **Concurrency.** Two admins editing concurrently is last-write-wins on an upsert. Add an `updatedAt` optimistic check (compare the expected `updatedAt` in the `where`) so a stale downgrade check can't be bypassed. Without it, the diff computed from a read can be stale by the time of the write.
5. **Unique-constraint / duplicate gaps.** `@@unique([tenantId, purpose])` (`schema.prisma:245`) makes the upsert safe, but `purpose` and `tier` are unconstrained TEXT (`:234-235`). Add named CHECKs in the migration, and validate against the domain constants in the router. That keeps stray values out of the `VALID_TIERS` warn path.
6. **RLS dependency.** The runner owns the `tenant_ai_config` policy (`:31-35`). The router must not rely on it filtering rows, so every query carries an explicit `tenantId`.
7. **CSV path conflict.** The CSV artifact path (`agent-approval/`) contradicts R1. Fix it in CSV only, then run `split-sprint-plan`.
8. **Spend attribution (Q2).** `base.agent.ts:690` hardcodes `-free` and `insight-generation.chain.ts:362-367` records 0/0 tokens (per the exploration doc, unverified by me). Ceilings built on those numbers would be wrong, so they are a prerequisite fix.

#### Dependencies on other agents
- **ai-specialist:** the allow-list and ranking (Q-A), worker enforcement and spend tracking, and the `base.agent.ts` / summary-job wiring (Q3). I need its answer on how the worker will read the new columns (`resolveEffectiveTier` returns a richer shape).
- **data-engineer:** new columns, CHECK names, the spend table or columns, the migration and RLS shape. The router `select`s depend on it.
- **frontend-lead:** the `get` response shape (limits, `canManage`, allow-list with rank) and the downgrade-confirm contract (`acknowledgeDowngrade`), plus the NOT_FOUND degrade.
- **test-engineer:** router tests need cross-tenant NOT_FOUND, FORBIDDEN `it.each`, a downgrade-without-ack rejection test, and an audit-actor assertion.

### frontend-lead

### PG-199 Round 1 ANALYSIS (Frontend-Lead)

Paths are relative to the worktree root. Read-only analysis; no other file was edited.

#### Files Reviewed
- `apps/web/src/app/agent-approvals/model-config/page.tsx:1-16`: client-component stub reading "coming soon". It needs replacing with a server shell.
- `approval-policies/page.tsx:9-19`: Suspense shell, `<ApprovalPoliciesLoading />` fallback, then the Content component. This is the shell to copy.
- `approval-policies/ApprovalPoliciesContent.tsx:13-18,150-162,187,197`: imports from `@intelliflow/ui`, `PageHeader` and `SectionHeader`. Its error branch renders the raw `listQuery.error.message`, with no NOT_FOUND handling. It has an `aria-live` `<output>` and the `lg:grid-cols-12` bento.
- `calendar/availability/AvailabilityContent.tsx:60-64,159-175,192-195`: a local `errorCode()` helper and the calm NOT_FOUND branch (`PageHeader` plus a static `<output>`). It computes `isDirty` as `normalize(draft) !== snapshot.baseline`, which is the playbook dirty rule.
- `docs/planning/module-settings-playbook.md:25-43` (layout), `:58-67` (CTAs, Save disabled when `!isDirty || isSaving || hasConflict`), `:69-85` (dirty snapshot), `:87-100` (TagsTab), `:139-165` (toggle wiring).
- `packages/ui/src/components/slider.tsx:1-22`: Radix Slider with a single Thumb. It shows no value and has no `aria-label` of its own, so the caller must supply both. `confirmation-dialog.tsx:17-39` takes `open`, `title`, `description`, `confirmLabel`, `onConfirm`, `variant` and `isLoading`.
- `cases/(list)/case-types/components/ResolutionChecklistEditor.tsx:130-166`: the ordered-list pattern, with up/down/remove buttons at 44px (`h-11 w-11`). The buttons carry per-index `aria-label`s and use `aria-disabled` at the ends.
- `.specify/sprints/sprint-18/context/PG-199/PG-199-owner-ruling.md:11-38`: Q1 to Q4 plus the runner constraints. `Sprint_plan.csv` row PG-199 holds the DoD.

#### Interpretation
- **Page shape:** server `page.tsx` with Suspense, then `ModelConfigContent.tsx` and `ModelConfigLoading.tsx`. These sit beside the CSV ARTIFACTs, which already name `page.tsx` and `ModelConfigContent.tsx`.
- **Bento layout:** `PageHeader` with breadcrumbs `Dashboard > AI & Agents > AI Settings > Model Configuration`, copying `ApprovalPoliciesContent.tsx:38-43`. The grid is `grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5`.
- **Cards (six purposes):** each of scoring, qualification, email, reasoning, structured and rag gets one card at `lg:col-span-6`, or `xl:col-span-4` if three fit. A card holds:
  - a primary model `Select`;
  - temperature as `Slider` plus a visible value and a number `Input`;
  - max tokens as an `Input type=number`;
  - a monthly USD ceiling `Input`, with an empty value meaning no ceiling;
  - an ordered fallback list.
- **Page-level controls:** one page-level Save and Reset, driven by a dirty snapshot as in `AvailabilityContent.tsx:192`.
- **Downgrade confirm:** a pick of a lower-ranked model, primary or fallback, opens `ConfirmationDialog` before it enters the draft (rulings R2 and Q4). The dialog's `onConfirm` applies the pick to the draft only. The server writes the audit entry on Save.
- **Toggles:** the page has no Boolean toggle, so playbook section 8 and "AI defaults FALSE" need no wiring. The only possible Boolean is a per-purpose "ceiling enabled" switch, and I'd drop it in favour of a nullable ceiling. The `Switch` listed in the brief is therefore not needed.
- **DoD item TagsTab via forwardRef:** N/A. There is no tags card, and `grep forwardRef|colorToken` under `agent-approvals` finds only the PG-198 policy chips. This agrees with the exploration doc at `PG-199-spec-exploration.md:76,85`.
- **DoD item colorToken CHECK:** N/A for the same reason. Rows are keyed by purpose, not by user-labelled entities.
- **Empty state:** `EmptyState` is only reachable if the allow-list returns no models, or a purpose has an empty fallback list. For the fallback case use `entity="rules"` with `phase="passive" size="sm"` and no action button (playbook section 2).

#### Questions (code cannot answer)
1. Is the model allow-list returned by the API (`list` includes `models[]` with rank and price), or hardcoded in the web? I need the API contract from backend-architect. I recommend the API, because the ranking must be identical for the client confirm and the server audit.
2. Does a cost ceiling need a "spent this month" readout per card? Q2 requires spend tracking, so showing it is cheap. I recommend yes, as read-only progress text.
3. Is there a maximum fallback length? I assume 3, pending the validator.

#### Concerns (code evidence)
1. **Sonar duplication:** `errorCode()` is copy-pasted in three files (`AvailabilityContent.tsx:60`, `CaseTypesContent.tsx:27`, `ContactTypesContent.tsx:28`), and `errorMessage` is also duplicated (`ApprovalPoliciesContent.tsx:45`). Adding a fourth copy risks the >3% duplicated-lines limit. I propose a shared `apps/web/src/lib/trpc-errors.ts` (`errorCode`, `errorMessage`, `isNotFound`). Migrating the three existing copies is optional and I'd keep it out of this PR. The per-purpose card also needs one `PurposeCard` component rendered six times from a metadata map, and the fallback editor should be one component, not six copies. The calm-degrade `PageHeader` plus `<output>` block (`AvailabilityContent.tsx:161-175`) is worth extracting as a small shared `ComingSoonNotice`.
2. **Deploy skew:** `ApprovalPoliciesContent.tsx:150-162` shows a raw error, which breaks the owner constraint "degrade calmly on NOT_FOUND". Copy the PG-202 branch (`:161`). Also send only fields the old API accepts, so the Save payload must not include the new fields on a NOT_FOUND `get`. The same applies to a missing spend table, where the API should fail open and the UI should show "spend unavailable", not 0.
3. **Fallback list a11y:** `ResolutionChecklistEditor.tsx:138-166` has the pattern, but no live-region announcement on reorder. Add the `aria-live` `<output>` from `ApprovalPoliciesContent.tsx:187` ("Fallback 2 moved to position 1"). Keep 44px targets and focus on the moved item after reorder. Use `<ol>`, not a div list.
4. **Slider a11y:** `slider.tsx:15` renders one Thumb with no label. Pass `aria-label` through `Slider`, plus `aria-valuetext`, and keep the number `Input` as the accessible fallback. Check whether Radix forwards `aria-label` to the Thumb. In Radix it goes to the Root, so I'd verify with a test. Contrast and touch size need checking at the 5px thumb height.
5. **Lighthouse:** `model-config` is not in `lighthouserc*.js`. The page is authenticated, so it needs `lighthouserc.authenticated.js` and playbook `docs/claude-refs/lighthouse-playbook.md`. Risks are six cards with six Selects and Sliders (Radix cost) and labels on every control. Mitigation: no extra client libraries, and skeleton dimensions that match the cards to avoid CLS.
6. **L11 build graph:** the Content imports types and constants from `@intelliflow/validators` only (zod, light). It must NOT import `@intelliflow/domain` runtime or anything from `apps/ai-worker`. `LLMPurpose` is defined only in ai-worker (exploration `:21-22`), so the purpose list and model ranks must live in `packages/validators/src/model-config.ts` (the CSV ARTIFACT), not be imported from ai-worker.
7. **Coverage:** `app/**/page.tsx` is excluded from coverage (exploration `:110`), so all logic belongs in `ModelConfigContent.tsx` and components. For diff-coverage, put the draft and dirty logic in a pure `model-config-model.ts`, mirroring `policy-model.ts`.
8. **Stale docs:** `ChainVersionEditor.tsx:68-85` also edits model, temperature and maxTokens (exploration `:73-75`). Model Config should carry a link/hint to AI Settings, not duplicate that editor.

#### Dependencies on other agents
- backend-architect: the router contract. This means `list` returning `{ rows[6], models[], canManage, spend }`, an `update` input shape with the superRefine duplicate-fallback check, and the `NOT_FOUND` behaviour of old API versions.
- ai-specialist: the canonical model ids and rank order (`MODEL_PRICING`, `ai.config.ts:198-269`), which tiers/models are allow-listed per purpose, and the fallback max.
- Shared with a11y-expert (if spawned): slider and reorder-list behaviour.

### data-engineer

### PG-199 Round 1 ANALYSIS — Data-Engineer (read-only, no other files edited)

#### Files Reviewed
- `packages/db/prisma/schema.prisma:231-248`: `TenantAIConfig` has `purpose` and `tier` as plain TEXT. It also has `temperature`, `maxTokens`, `rateLimitPerMinute` and `@@unique([tenantId, purpose])`. There is no model, fallback or ceiling column and no Boolean column. I found no CHECKs on it.
- `migrations/20260421000000_feat_agent_system_tenant_customization/migration.sql:54-78`: it creates `tenant_ai_config` and runs `ENABLE ROW LEVEL SECURITY` at line 78. There is no `CREATE POLICY` in either migration that touches this table.
- `migrations/20260423000000_tenant_memory_and_rate_limits/migration.sql:48-49`: precedent for a plain additive `ADD COLUMN` on this table.
- `schema.prisma:6522-6553`: `TenantQuotaOverride` is keyed `(tenantId, key)` with `limit Int?`. `TenantUsageCounter` is keyed `(tenantId, key, period)` with `value Int`.
- `packages/domain/src/platform/quotas/QuotaRegistry.ts:13-23,80-82`: `QUOTA_KEYS` is a closed `as const` tuple and `QuotaKey` is derived from it. Only `emailsPerMonth` and `aiSpendCentsPerMonth` are monthly. `getQuotaPeriod` returns `'YYYY-MM'` in UTC.
- `packages/adapters/src/repositories/PrismaQuotaRepository.ts:56-70`: `incrementCounter` is an atomic `INSERT ... ON CONFLICT DO UPDATE` on `tenant_usage_counters`.
- `apps/ai-worker/src/utils/tenant-ai-spend.ts:12,37-64`: `AI_SPEND_KEY` is hardcoded to `aiSpendCentsPerMonth`. The recorder takes only `usage.cost` and has no purpose input.
- `20261013120000_case_types/migration.sql:1-20,44-50,82+`: the Class A header, named CHECKs, `TEXT[]` with a `<@` CHECK, and SQL-only indexes.
- `20261016120000_approval_policies/migration.sql:104-131`: `ENABLE` (not FORCE) RLS plus a `DO $$ ... EXCEPTION WHEN duplicate_object` policy block. It has `USING` and `WITH CHECK` on `current_setting('app.current_tenant_id', true)`.
- `tests/integration/approval-policies.test.ts:59-80`: `ensureMigrationSql` replays the migration SQL when the named CHECK is absent from the db:push DB.

#### Interpretation
1. Q1 (per purpose) maps to the existing key `(tenantId, purpose)`, so no new table is needed. I recommend adding these columns to `tenant_ai_config`:
   - `modelId TEXT NULL`.
   - `fallbackModelIds TEXT[] NOT NULL DEFAULT '{}'`.
   - `monthlyCostCeilingCents INTEGER NULL`, where NULL means no ceiling.
   - All are metadata-only on PG 11+, matching the pattern at 20260423 lines 48-49.
2. Spend storage should reuse `tenant_usage_counters` with a new per-purpose key instead of new columns or a table.
   - It already handles atomic increments, month rollover and cascade delete.
   - The `key` column is free TEXT in the DB. Only the TypeScript `QuotaKey` is closed.
   - A new `aiSpendCents:<purpose>` key can't go through `QuotaService.increment` without widening `QUOTA_KEYS`. I'd rather not widen it, because `QuotaLimits` is `Record<QuotaKey, ...>` and the plan map would break.
   - Instead, add a dedicated port method that reuses `incrementCounter`'s SQL and calls `getQuotaPeriod('aiSpendCentsPerMonth')` for the period.
3. Applying the owner-ruling constraints to the migration:
   - **Timestamps:** the migration is `20261019120000`. The RLS policy goes in a separately removable block in a second migration, `20261019120100`.
   - **Header:** it says prod RLS state is "unknown, projects-64 verifies at rehearsal".
   - **Policy:** `ENABLE` only, never FORCE.
   - **Function:** nothing may rely on the policy filtering rows.
4. There is no Boolean column, so "AI defaults FALSE" has nothing to apply to. `colorToken` doesn't apply either, since rows are keyed by purpose, not by user-labelled entity.

#### Questions (code cannot answer)
- Q-DE1: Is the ceiling stored as integer cents (my recommendation, to match `aiSpendCentsPerMonth`) or as USD in the UI only? The owner ruling says "monthly USD ceiling". I assume the UI converts to cents. Please confirm.
- Q-DE2: Should the ceiling counter key be `aiSpendCents:<purpose>` in `tenant_usage_counters`? If so, backend-architect must agree to a port method that sits outside the closed `QuotaKey` type.

#### Concerns (code evidence)
1. **Closed enum:** the `QuotaRegistry.ts:13-20` change would ripple into `QuotaLimits`, the plan map and `partner.router.ts:162`. Avoid it.
2. **Attribution gap:** `tenant-ai-spend.ts:37-64` receives only `{cost}` and has no purpose. Per-purpose attribution needs the purpose passed from `llm-factory` or from an AsyncLocalStorage purpose context. That is an ai-specialist dependency. Also `base.agent.ts:690` hardcodes `-free`, so attribution is wrong until Q3 is wired.
3. **Carry rounding:** the recorder carries sub-cent costs in an in-memory Map (`:40-55`). A per-purpose carry is lost on a restart, so the ceiling will be slightly under-counted. The ceiling is an estimate and the UI should say so.
4. **CHECKs on the TEXT-typed columns:**
   - `purpose` IN the 6 values (the table has ~no rows today, but I haven't proved it for prod).
   - `tier` IN (free, standard, premium).
   - `temperature` BETWEEN 0 AND 2, NULL allowed.
   - `maxTokens` > 0, NULL allowed.
   - `monthlyCostCeilingCents` >= 0, NULL allowed. Note 0 means "block outright", consistent with `QuotaService.ts:59`.
   - `cardinality(fallbackModelIds) <= N`.
   - Use plain `ADD CONSTRAINT ... CHECK`, not NOT VALID. Existing rows were written only by seed or admin, but I can't verify prod rows, so Class A gate 1 needs a pre-check query.
   - Do not use `<@` against a model allow-list in SQL. The allow-list changes, so it belongs in Zod only.
5. **Fallback type:** `TEXT[]` over JSONB. Prisma 5.22 supports `String[]`, order is preserved, there's precedent in `case_types.requiredFields`, and the CHECK is simple. A JSONB array would need element-typed validation.
6. **Never-downgrade audit:** the confirm and audit entry lives in the API (`ResourceType` in `security/types.ts`), not in the DB. No audit column is needed.
7. **Fail open:** the reader must treat a missing column or table as "no ceiling". Prisma selects named columns, so with the new client against the old DB a query would throw on a missing column. The resolver must catch and log the reason.
8. **db:push:** CI skips the CHECKs and RLS. The integration test needs `ensureMigrationSql` with a sentinel named CHECK. Don't drop `tenant_ai_config` to replay, since the real table has rows from other suites. Apply only the `ALTER`s guarded by `IF NOT EXISTS` / constraint-presence checks.
9. **Destructive writes:** "reset to defaults" is a `deleteMany` for the tenant and must run in `$transaction`. Writes use `upsert` on `tenantId_purpose`. No `createMany`, so `skipDuplicates` is moot.
10. **No new index:** the existing `(tenantId, purpose)` unique index covers every read.
11. **schema.prisma comment:** add a "SQL-only objects" comment on `TenantAIConfig` in the style of `schema.prisma:2415`. It lists the CHECKs and the RLS policy.

#### Dependencies on other agents
- ai-specialist: the purpose-attribution mechanism for spend (concern 2), how the resolver reads the pin, fallback and ceiling, and the model rank table for the downgrade check.
- backend-architect: the port method for per-purpose counters (decision 2), the `ResourceType` audit member, and the router `resetToDefaults` transaction.
- frontend-lead: send only the new fields when present, and degrade calmly on NOT_FOUND. Per the ruling, no new fields may be sent to an API that predates this migration.

### domain-expert

### PG-199 Round 1 ANALYSIS — Domain-Expert (business rules)

Paths are relative to the pg-199 worktree. Read-only analysis.

#### Files Reviewed
- `.specify/sprints/sprint-18/context/PG-199/PG-199-owner-ruling.md:5-26` (R1, R2, Q1-Q4, runner constraints) and `PG-199-spec-exploration.md:10-124`.
- `apps/ai-worker/src/config/ai.config.ts:198-269`. `MODEL_PRICING` is keyed by LiteLLM alias (`scoring-free`, `reasoning-premium`) plus legacy OpenAI names (`gpt-4o`, `gpt-4o-mini`). It holds no Anthropic, Mistral, Groq or Gemini model ids.
- `infra/litellm/config.yaml:11-117` (alias to concrete model) and `:127-131` (fallbacks, free to standard for scoring, qualification, reasoning and structured only).
- `apps/ai-worker/src/lib/tenant-ai-config.ts:60-125` (fail-open, no row means factory default) and `llm-factory.ts:20-26`, `:232-240`, `:326`.
- `apps/api/src/modules/agent/settings-shared.ts:9-23` (admin roles ADMIN, MANAGER, OWNER, SUPER_ADMIN).
- `packages/db/prisma/schema.prisma:231-248` (`TenantAIConfig`) and `:5603` (`ChainVersion.model`).
- `docs/planning/module-settings-playbook.md:124-166` (§7-§8), `docs/planning/prd-module-settings.md:878-990` (template) and `docs/architecture/adr/ADR-082-tenant-model-config.md` (Outcome "TBD", leaning option 2).
- Fallback behaviour: `chains/auto-response.chain.ts:10,174`, `chains/ticket-routing.chain.ts:255-295`, `chains/churn-risk.chain.ts:593-676`, `chains/insight-generation.chain.ts:399-412`, `chains/scoring.chain.ts:294`, `chains/sentiment.chain.ts:313`, `jobs/summarize-conversation.job.ts:215-220` (all under `apps/ai-worker/src/`).

#### Interpretation
1. **Never-Downgrade ranking.** There is no single scalar today. Price is the only numeric signal: `ai.config.ts:198-269` has input and output rates per alias. Price alone mis-ranks:
   - `reasoning-free` and `rag-free` price at 0.
   - `qualification-free` (groq llama-3.3-70b, $0.59/$0.79) costs more than `scoring-premium` (gpt-4o-mini, $0.15/$0.60).
   - Embedding models are not comparable with chat models.

   Proposal: an explicit, code-owned allow-list in the domain package. One entry per concrete model, with `provider`, `family`, a numeric `capabilityRank` and `generation`, scoped per purpose. "Lower" means a strictly lower `capabilityRank`. Equal rank is not a downgrade. A different family with the same rank is a lateral move: no confirm, but still audited as a change. Price is only a tiebreaker and a ceiling-UI aid, never the rank.
2. **Allow-list per provider.** Initial contents are exactly what `config.yaml:11-117` routes to: groq llama-3.1-8b and 3.3-70b, openrouter gpt-oss-20b:free, gemini-2.5-flash, mistral small and medium, claude-haiku-4-5, claude-sonnet-4-5, gpt-4o-mini, gpt-4o, plus rag: nomic-embed-text and text-embedding-3-small. A YAML-versus-code consistency test is already promised in ADR-082 "Negative Consequences".
3. **Tenants with no row.** Behaviour unchanged. `tenant-ai-config.ts:93-105` already treats an absent row as the factory tier. New columns must be nullable: null model means the `${purpose}-${tier}` alias, null fallbacks means YAML fallbacks only, null ceiling means no ceiling. No backfill. Class A.
4. **"Block that purpose" per purpose** (owner Q2). Behaviour differs, so the spec must state it for each:

   | Purpose | What runs when blocked |
   |---|---|
   | scoring | Churn and insight heuristics exist (`churn-risk.chain.ts:593`, `insight-generation.chain.ts:412`). Scoring returns a default low-confidence score (`scoring.chain.ts:294`). |
   | structured | Ticket routing keyword heuristic (`ticket-routing.chain.ts:255`). Sentiment returns neutral (`sentiment.chain.ts:313`). |
   | reasoning | Insight fallback. Summarize job writes a digest (`summarize-conversation.job.ts:215`). |
   | email | **No non-AI fallback.** `auto-response.chain.ts:10` says "MUST call real LLM, no template fallback allowed"; `:169` throws on failure. |
   | qualification | case-* and account-* chains need inspection (see Questions). |
   | rag | No chat call exists, only `createEmbeddings` (`llm-factory.ts:409`). |

   Blocking email must fail visibly (typed "ceiling reached" error, queue state) and must not synthesise a template.
5. **Reset to defaults.** Delete the tenant's rows (or null the new columns) to restore factory behaviour. Playbook §7 `resetToDefaults`, modelled on `availability.router.ts:162`. Confirm text must list what is reset (model, fallbacks, temperature, max tokens, ceiling) and what is kept (spend history, audit log). Reset to a lower-ranked model counts as a downgrade only if the tenant's current model outranks the factory default; that case needs the confirm and an audit entry.
6. **Who may edit.** `assertAgentSettingsAdmin` (`settings-shared.ts:22`). Reads open to any tenant user; `list` returns `canManage` as PG-198 does.

#### DoD applicability (CSV row, 13 items)
- **Applies:** PageHeader and bento layout; canonical EmptyState (entity plus passive); system-compliant CTAs; `$transaction` on multi-row writes; no `skipDuplicates`; Zod `superRefine` for duplicates (purpose keys and repeated fallback entries, "rows N and M"); AI defaults FALSE (the `SET DEFAULT false` restatement applies only if a Boolean is added); cross-tenant negative test; Lighthouse >= 90 (likely NEEDS_HUMAN as PG-198 AC-P16); `pnpm test`.
- **N/A with evidence:**
  - TagsTab: no tags card, as PG-198 AC-P17.
  - colorToken CHECK: rows are keyed by the fixed purpose enum, not user-labelled entities (exploration §4).
- **Boolean toggles (§8):** prefer none. Ceiling-enabled is expressible as a null ceiling, avoiding an unwired Boolean. If one is added it must be category 1 (wired in the factory).
- **CSV defect:** the ARTIFACT path says `modules/agent-approval/`, but R1 puts the router in `modules/agent/`. Fix in the CSV only, then regenerate splits.

#### Questions (code cannot answer)
1. Is a ceiling a hard stop for in-flight calls, or checked before each call? `cost-tracker.ts:186-197` throws after the call. Proposal: pre-call check, one overshoot call accepted.
2. Does the ceiling window reset on the UTC calendar month or on the billing cycle? `aiSpendCentsPerMonth` needs checking.
3. Is blocking the `email` purpose acceptable, given it has no non-AI fallback?

#### Concerns
1. **`rag` purpose is a trap.** No chat call uses it; only embeddings do. Temperature and max tokens are meaningless there. Switching embedding models changes the vector dimension (768 vs 1536), which corrupts pgvector search. Recommend `rag` be read-only or excluded from model pick, and flag to the data-engineer. This contradicts the owner's "6 purposes" answer, so it needs an owner confirm.
2. **Tier and model both persisted.** `resolveEffectiveTier` returns the tier only. A model pin must override the alias, and the cache key `llm-factory.ts:153` has no model id. The AI-specialist must settle which wins, and the cache must include the model.
3. **Cost attribution is wrong today**, so per-purpose ceilings would be wrong too. `base.agent.ts:690` hardcodes `-free`; `insight-generation.chain.ts:362-367` records 0/0 tokens. Fix in this PR or declare the limitation and file it.
4. **Fail-open on missing spend table.** Per the owner constraint, log the reason and do not block.

#### Follow-up issues to file (out of scope; confirm with team-lead before creating)
- `ChainVersion.model` (`schema.prisma:5603`) is stored and edited but dead at runtime.
- `ChainVersionEditor.tsx:73-85` resets temperature and max tokens to 0.7 and 2000 on edit (data loss).
- Cost misattribution at `base.agent.ts:690` and `insight-generation.chain.ts:362`, unless fixed here.
- `docs/design/sitemap.md:239,449` marks the route "Implemented" although it is a stub.

#### Dependencies on other agents
- **ai-specialist:** model-versus-tier precedence, factory cache key, pre-call ceiling check, `rag` handling.
- **data-engineer:** nullable columns, CHECKs, spend table (per tenant, purpose and month), RLS step.
- **backend-architect:** `ResourceType` member for the audit log (`security/types.ts:91-105`) and `resetToDefaults`.
- **frontend-lead:** downgrade confirm dialog, calm NOT_FOUND degrade, link to AI Settings rather than duplicating it.

### test-engineer

#### PG-199 Test-Engineer Round 1 Analysis

**Files Reviewed**
- `.specify/.../PG-199-spec-exploration.md:100-111` (section 6) and `PG-199-owner-ruling.md:11-38`. The CSV row is read, DoD included: cross-tenant negative test, Lighthouse >=90, Zod superRefine on duplicate keys.
- `apps/api/src/modules/agent/__tests__/approval-policies.router.test.ts:67-79` (`useTx`/`failTx`), `:98-108` (FORBIDDEN `it.each`, asserts `$transaction` not called), `:154-161` (foreign id returns NOT_FOUND with `where:{id,tenantId}` and zero writes).
- `packages/validators/src/__tests__/approval-policies.test.ts:100-112` (superRefine "rows 1 and 3", path `['assignments',2]`).
- `tests/integration/approval-policies.test.ts:57-80` (`ensureMigrationSql`; `describeDb` skips when `DATABASE_URL` is unset).
- `apps/api/src/__tests__/app-router.smoke.test.ts:142-155` (one block per router).
- `apps/web/.../AvailabilityContent.test.tsx:144-158` (NOT_FOUND calm degrade, `role=status`, no `role=alert`).
- `apps/ai-worker/src/lib/__tests__/` has `tenant-ai-config.test.ts`, `llm-factory.test.ts`, `createLLMForTenant.test.ts`. The first uses `vi.useFakeTimers` (`:126`).
- `apps/ai-worker/src/agents/base.agent.ts:164`, `jobs/summarize-conversation.job.ts:223`, `utils/cost-tracker.ts:186-197`, `utils/tenant-ai-spend.ts:39-64`.
- `vitest.config.ts:384-387` (excludes `apps/web/src/app/**/page.tsx` from coverage). `apps/api/vitest.config.ts:76-90` excludes only barrels, so `router.ts` exclusion comes from another path (see Questions).

**Interpretation: new test files (RED first)**
1. Domain: `packages/domain/src/.../__tests__/model-config.test.ts` covers purposes and tiers constants, an allow-list, and `modelRank`. It checks that every allow-listed model has a rank and that downgrade is a strict comparison. The ranking should derive from the `MODEL_PRICING` shape (`ai.config.ts:198-269`). If the domain package cannot import it, the table must be a deliberate copy with a parity test.
2. Validators: `packages/validators/src/__tests__/model-config.test.ts`. Cases are duplicate purposes, with the error on the second row and a "rows N and M" message. Also temperature and maxTokens bounds, ceiling >= 0, fallback chain with no duplicates and not containing the primary, and a model outside the allow-list. `detectDowngrade` gets its own table: primary and fallback, equal rank (not a downgrade), unknown current model.
3. Router: `apps/api/src/modules/agent/__tests__/model-config.router.test.ts`.
   - `list` returns `canManage` and defaults for purposes with no row.
   - FORBIDDEN `it.each` over `update` and `resetToDefaults` asserts `$transaction` is not called. Also cover a manager-allowed case.
   - Cross-tenant negative: the `where` carries `tenantId`, and a foreign row returns NOT_FOUND with zero writes.
   - Audit assertions: actor equals `ctx.tenant.userId`, the entry carries from-model and to-model, and it is fired only when the change is a downgrade and was confirmed.
   - A downgrade without `confirmDowngrade` returns PRECONDITION_FAILED or BAD_REQUEST with no write.
   - P2002 maps to CONFLICT (`failTx`).
   - `resetToDefaults` runs inside `$transaction`.
   - `app-router.smoke.test.ts`: add a `modelConfig` block, with the procedure list taken from the final router.
4. ai-worker: extend `tenant-ai-config.test.ts` for the new model, fallback and ceiling columns (including "columns missing" returning the old shape and the failure being logged). Extend `llm-factory.test.ts` for the model pin, the fallback chain, and the ceiling block. A new `purpose-spend` test file covers the per-purpose monthly ledger.
5. Wiring: add tenant tests to `base.agent.test.ts` and `summarize-conversation.job.test.ts`. Both currently mock `createLLM` at `base.agent.test.ts:15` and `summarize-conversation.job.test.ts:41`. Those mocks must also supply `createLLMForTenant`, or ~15 agent test files that import `base.agent` will break.
6. Web: `ModelConfigContent.test.tsx` covers:
   - NOT_FOUND calm degrade
   - loading, error, empty and read-only states
   - downgrade confirm for both primary and fallback (Q4)
   - dirty and save, with the payload omitting new fields so an old API does not reject it
   - slider value, and a11y roles/names with `axe`
7. Integration: `tests/integration/model-config.test.ts`. It uses the `ensureMigrationSql` pattern with TENANT_A/B and replays the migration's CHECKs and RLS policy. It must verify `pg_constraint` presence first, because `db:push` skips them.

**Questions (code cannot answer)**
- Where does the `router.ts` coverage exclusion live? I could not find it in `apps/api/vitest.config.ts`, though the exploration doc asserts it.
- Where does the ranking table live (domain versus validators), and does the web import it?

**Concerns**
- Count-asserting registry tests will move: `sitemap-reconciliation.test.ts:65` (`toBe(214)`), `ui-flow-mapping-reconciliation.test.ts`, `ia-reconciliation.test.ts`, `tools/scripts/route-total-consistency.test.ts`, and `settings-search.test.ts` (13 items). The route is already a stub page, so the page count probably stays at 214. The router and procedure counts (70 routers / 412 procs in `ui-flow-mapping.md`) will change, and those docs plus the tests must be updated in the same commit.
- Month-rollover tests: `tenant-ai-config.test.ts:126` shows the repo already pins the clock. Every spend and ceiling test must use `vi.useFakeTimers` plus `setSystemTime` (feedback: fixed-date fixtures are time bombs). Use explicit UTC month-boundary cases (e.g. 31 Oct 23:59:59 and 1 Nov 00:00:00) and restore real timers in `afterEach`.
- Fail-open is risky to test. `isBillableTenant` (`tenant-ai-spend.ts:35-37`) and the `catch` that carries cents (`:60-69`) show the existing recorder swallows write errors, so the ceiling check needs separate tests for "table missing", "column missing" and "DB error", each asserting a logged reason and the call proceeding. Also assert that a blocked purpose does not block the others (Q2).
- The existing global cost tracker throws *after* the call (`cost-tracker.ts:186-197`). A per-purpose pre-call check is a different shape, so the new tests should not copy that pattern.
- Mock accuracy: `createLLM` is mocked with an unconditional stub in the base-agent suite. A wiring test that asserts `createLLMForTenant` is called with the tenant id and purpose is needed, not just "createLLM not called".
- Integration test: `describeDb` silently skips without `DATABASE_URL`, so the gate must be shown to actually run it. This host's default Node is v25.2.1, and DB writes silently hang there (memory: node25-breaks-pg-writes). Run it under Node 22 with `DATABASE_TEST_URL`, never the prod `.env.local` URL.
- Diff-coverage >= 80% on changed lines (`scripts/lib/diff-coverage.mjs`). No istanbul ignores. Web logic must live in `ModelConfigContent.tsx` and sub-components, since `page.tsx` is excluded (`vitest.config.ts:387`). If `router.ts` is not excluded after all, the one-line mount is covered by the smoke test.
- Existing suites to rerun: `llm-factory.test.ts`, `createLLMForTenant.test.ts`, `tenant-ai-config.test.ts`, all `agents/*.test.ts`, `summarize-conversation.job.test.ts`, `approval-policies*` (shared `settings-shared`), the AI settings tests around `ChainVersionEditor`, the sidebar config and settings-nav tests, and `app-router.smoke.test.ts`.

**Dependencies on other agents**
- Backend-architect: procedure names, input shape, and the downgrade-confirm contract (the field name and the error code). Router tests depend on these.
- Data-engineer: column names and types, CHECK constraint names, and the ledger table design. The integration test and the `tenant-ai-config` extension depend on them.
- AI-specialist: the `createLLMForTenant` signature, the model-pin and fallback semantics, and the ceiling-check location. The wiring and fail-open tests depend on these.
- Domain-expert: where the ranking table lives and its single source of truth.
- Frontend-lead: the component split (so logic stays out of `page.tsx`), the dirty-state semantics, and the old-API payload rule.

## Round 2 — PROPOSAL

### Lead: R2-brief.md

### PG-199 Round 2 PROPOSAL — brief from the lead

Read ALL six Round 1 files in this folder (R1-*.md) and the updated PG-199-owner-ruling.md
(now Q1–Q6 + runner constraints + lead decisions). Then write your Round 2 PROPOSAL to
rounds/R2-<your-role>.md (only file you may create/edit).

Lead working assumptions (challenge them in your proposal if the code says otherwise):
- Shared constants + rules in `packages/domain/src/ai/model-config/` (zero infra deps): the 6
  purposes, 3 tiers, a MODEL_CATALOG (catalog id → provider-specific model ids, family,
  capabilityRank, generation, allowed purposes, price per 1k for UI), defaults/limits, and
  pure functions `isDowngrade(current, next)` / `findDowngrades(before, after)`. ai-worker's
  `LLMPurpose`/`LLMTier` become aliases of the domain types. A test keeps the catalog
  consistent with infra/litellm/config.yaml.
- Validators `packages/validators/src/model-config.ts` (superRefine: duplicate purposes, primary
  in fallbacks, duplicate fallbacks, catalog/purpose membership, rag model locked, bounds).
- Router `apps/api/src/modules/agent/model-config.router.ts` → `modelConfig.{get,update,
  resetToDefaults}`; server-side downgrade check with an explicit acknowledge flag; audit via
  getAuditLogger with actorId; `$transaction`; explicit tenantId everywhere.
- Migration 20261019120000: additive nullable columns on tenant_ai_config (model pin, TEXT[]
  fallbacks default '{}', monthly ceiling cents) + named CHECKs; 20261019120100: the
  separately removable RLS policy (case_types shape, ENABLE not FORCE, DO/duplicate_object).
- Per-purpose spend: tenant_usage_counters key `aiSpendCents:<purpose>`, period YYYY-MM UTC,
  incremented from the existing cost listener with purpose attributed; ceiling check pre-call in
  the tenant-aware factory; typed PurposeCeilingReachedError; fail open (+ logged reason) only
  when the columns/counters are absent (pre-migration).
- ai-worker: model pin per provider, fallback chain executed in worker, breaker/cache keys include
  model; base.agent + summarize job resolve tenant config at invoke time; fix spend
  misattribution (base.agent.ts:690, insight-generation.chain.ts:362-367).
- Web: server page.tsx + ModelConfigContent.tsx + ModelConfigLoading.tsx + small components;
  one card per purpose; page-level Save/Reset with dirty snapshot; downgrade ConfirmationDialog
  for primary AND fallback; calm NOT_FOUND via a shared `apps/web/src/lib/trpc-errors.ts`
  (extract, don't add a 4th copy); never send fields the old API rejects.
- DoD N/A with evidence: TagsTab-forwardRef, colorToken CHECK, Boolean toggles (none).

Round 2 sections (file:line citations required): Approach (referencing existing patterns);
Files (create/modify, each with rationale; UI files carry REUSES/EXTENDS/COMPOSES/NEW(justified));
Interfaces (signatures/contracts); Integration; Runtime Consumer (production caller of every new
procedure/function + legacy path replaced). Under 1000 words.

### ai-specialist

### PG-199 Round 2 PROPOSAL: AI-Specialist (ai-worker routing)

Paths under `apps/ai-worker/src/` unless noted.

#### Approach
Challenges to the lead assumptions are marked CHALLENGE.

1. **Catalog per provider (domain, pure).** Each `MODEL_CATALOG` entry holds `id`, `family`, `capabilityRank`, `generation`, `purposes[]`, `pricePer1k {input, output}`, and `providers: { litellm?: string; openrouter?: string; ollama?: string }`.
   - Today the model is derived from `(purpose, tier)` only: LiteLLM alias (`lib/llm-factory.ts:326`), OpenRouter `openRouterModelForTier` (`:20-26,303`), Ollama global (`:284`).
   - CHALLENGE: LiteLLM aliases are not unique per model. For example `claude-haiku-4-5` backs both `reasoning-standard` and `email-premium` (`infra/litellm/config.yaml:62-64,87-89`). So the catalog's `providers.litellm` must name a new dedicated `model_name: catalog-<id>` stanza per entry. Add those stanzas to the YAML and keep ADR-048's "YAML is the single source" (amend in ADR-082). The consistency test parses the YAML and asserts every catalog `providers.litellm` exists in `model_list`.
   - A catalog entry with no mapping for the active provider is not an error. The factory logs `pin_unavailable_for_provider` once per minute and uses the tier default. Ollama is dev-only and ignores pins.
   - Ollama is the only local provider and uses the single `aiConfig.ollama.model`.
2. **Pricing.** `calculateCost` falls back silently to gpt-3.5 pricing for unknown keys (`config/ai.config.ts:277`).
   - Add `calculateCostForCatalogModel(id, in, out)` reading catalog prices, and a test that every catalog id is priced.
   - Unknown model keys log a warning. They no longer price silently.
3. **Resolver.** Add `resolveTenantModelConfig(tenantId, purpose, defaultTier)` in `lib/tenant-ai-config.ts` returning `{ tier, model?, fallbacks[], ceilingCents|null, temperature, maxTokens, degraded? }`.
   - `resolveEffectiveTier` (`:74-137`) becomes a thin wrapper over it, so the 21 existing `createLLMForTenant` callers do not change.
   - The 60 s cache (`:39`) entry grows model/fallbacks/ceiling. Staleness up to 60 s is documented in the UI copy.
   - **Fail-open (CHALLENGE to the blanket catch at `:130-136`).**
     - Prisma `P2021/P2022` (table or column missing) means pre-migration: no ceiling, a `schema_pending` log, and one warning per process per minute.
     - Any other DB error serves the last-known cached entry for up to 15 min, so a blocked purpose stays blocked during an outage. With no cache it fails open with a warn.
4. **Ceiling pre-call.** `createLLMForTenant` (`:380-398`) calls `assertWithinCeiling(tenantId, purpose, ceilingCents)`.
   - Spend is read from `tenant_usage_counters` key `aiSpendCents:<purpose>` (data-engineer's port), cached 30 s per `(tenant, purpose)`. The local unflushed carry is added so a burst cannot run through the cache window.
   - On breach it throws `PurposeCeilingReachedError { purpose, ceilingCents, spentCents }`.
   - A ceiling of 0 blocks outright (matches `QuotaService`, per data-engineer R1). The overshoot is bounded by the calls in flight, because cost is known only after the call (`utils/cost-tracker.ts:79,186-197`). The spec must state this, along with the sub-cent carry lost on restart (`utils/tenant-ai-spend.ts:40-55`).
5. **Spend attribution, single choke point (CHALLENGE).** Only two call sites feed `costTracker` today (`agents/base.agent.ts:694`, `chains/insight-generation.chain.ts:362`).
   - Chains such as scoring keep their own `TokenUsageCallbackHandler` for monitoring only (`chains/scoring.chain.ts:48,213`).
   - So per-purpose ceilings cannot be fixed by patching the two sites. The record must move into `wrapModelWithTracing`'s `invoke` (`tracing/llm-tracer.ts:53-85`), which already knows `purpose` and `tier`, plus the tenant from ALS (`:57`). Read `usage_metadata` from the result and call `costTracker.recordUsage({ model: catalogId or `${purpose}-${tier}`, purpose, ... })`.
   - Delete the base.agent recorder (`:685-703`, `-free` at `:690`) and the insight 0/0 record (`:359-368`), or every agent call would count twice.
   - Embeddings (rag) are not charged per call here. The rag row carries only a ceiling that has no spend source until embeddings usage is metered. State this explicitly (see Risks).
   - The listener `ai-worker.ts:310-322` gains a second target: `recordPurposeSpend(tenantId, purpose, cost)`, using the same carry logic as `tenant-ai-spend.ts:45-63`. The aggregate `aiSpendCentsPerMonth` write is unchanged.
6. **Fallback execution.**
   - `createLLM` gains `options.model` (catalog id), added to the cache key (`:153`) and the breaker key (`:196-199`).
   - `createLLMForTenant` returns the primary with its instance `invoke` wrapped (same in-place pattern as `llm-tracer.ts:53`): ceiling check, then try primary, then on 429, 5xx, timeout or breaker-open try each fallback in order. A fallback's own ceiling is the same purpose's.
   - **Spike required:** 12 chains and 3 agents call `withStructuredOutput` (for example `case-insight.chain.ts:61`; `agents/email-writer.agent.ts:79`, built in the constructor). The bound runnable must reach the overridden `invoke`. Include a test with a failing primary and a structured-output call that lands on the fallback. If the spike fails, fall back to a `withModelFallback(candidates, run)` helper adopted at those call sites.
7. **Agents and summary job.**
   - `BaseAgent` stops building the model in the constructor (`agents/base.agent.ts:164`). Subclasses build `structuredModel` from `this.model` in the constructor (`email-writer.agent.ts:79`, `followup.agent.ts:78`, `qualification.agent.ts:88`), so a late async model would break them.
   - Resolve at `execute` time from `task.context.metadata.tenantId` (already read at `:266,315`) via a protected `getModel(task)` hook. Subclasses call `withStructuredOutput` there, keeping a per-tenant cache.
   - Keep the constructor model as the no-tenant default.
   - The summary job passes `tenantId` into `generateSummaryWithLLM` and calls `createLLMForTenant('reasoning','free',{tenantId})` (`jobs/summarize-conversation.job.ts:222-223`, `tenantId` at `:262`). On `PurposeCeilingReachedError` it goes to `buildFallbackDigest` (`:215-219`).
   - Q6: `email` has no non-AI fallback, so the auto-response chain rethrows a typed error. The API maps it to a clear message (Backend).

#### Files
- `packages/domain/src/ai/model-config/{catalog,purposes,downgrade}.ts` (create): pure constants and `isDowngrade`/`findDowngrades`.
- `lib/llm-factory.ts` (modify): `LLMPurpose`/`LLMTier` become aliases of the domain types (`:36,44`), plus `model` option, key changes, fallback wrapper and ceiling.
- `lib/tenant-ai-config.ts` (modify): resolver plus fail-open rules.
- `lib/purpose-ceiling.ts` (create): `assertWithinCeiling`, `PurposeCeilingReachedError`, the spend cache.
- `utils/tenant-ai-spend.ts` (modify): `recordPurposeSpend`. `ai-worker.ts:310-322` (modify): second listener target.
- `tracing/llm-tracer.ts`, `utils/cost-tracker.ts` (modify): move recording and the `purpose` field into `UsageMetrics.metadata`.
- `agents/base.agent.ts`, `chains/insight-generation.chain.ts`, `jobs/summarize-conversation.job.ts` (modify).
- `infra/litellm/config.yaml` (modify): `catalog-*` stanzas.
- Tests: catalog vs YAML consistency, resolver fail-open matrix (P2022, other, cached-blocked), ceiling block with 0 and burst, double-count guard, cache and breaker key include the model, structured-output fallback spike, 60 s TTL with fake timers.

#### Interfaces
```ts
resolveTenantModelConfig(t: string, p: LLMPurpose, d: LLMTier): Promise<TenantModelConfig>
createLLMForTenant(p, tier, o: CreateLLMOptions & { tenantId: string }): Promise<BaseChatModel> // may throw PurposeCeilingReachedError
class PurposeCeilingReachedError extends Error { purpose; ceilingCents; spentCents }
```

#### Integration
- Rollout order: migrate, API, worker (matches Backend R1). The old worker ignores the new columns (`tenant-ai-config.ts:90` selects all, harmless), so the page copy must not claim enforcement.
- ADR-082 and ADR-048 amendment text must include the YAML stanzas.

#### Runtime Consumer
- Resolver: `createLLMForTenant`, called by the 21 existing sites plus agents and the summary job.
- `assertWithinCeiling`: only `createLLMForTenant`.
- `recordPurposeSpend`: the cost listener in `ai-worker.ts`.
- `PurposeCeilingReachedError`: summary job, auto-response chain, and API error mapping.
- Legacy paths replaced: `base.agent.ts:164,690`, `summarize-conversation.job.ts:223`, `insight-generation.chain.ts:362-367`.

#### Risks and open items
- **RAG:** `createEmbeddings(tier)` takes no tenant (`llm-factory.ts:409`) and is not metered, so a rag ceiling cannot trip. Either meter embeddings in this PR or mark the rag ceiling "not enforced yet" in the UI. I recommend the second, with a follow-up row.
- The spike in Approach 6 can change the fallback design. I will confirm it in Round 3.

### backend-architect

### PG-199 Round 2 PROPOSAL — Backend-Architect

Paths relative to the pg-199 worktree. I accept the lead's assumptions except where marked CHALLENGE.

#### Approach
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

#### Files
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

#### Interfaces
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

#### Integration
- **Deploy skew.**
  - Old API plus new web: `modelConfig.get` is `NOT_FOUND`, and the page degrades calmly through the shared `lib/trpc-errors.ts` (Frontend).
  - New API plus old worker: new columns are nullable and ignored. The worker keeps honouring tier, temperature and maxTokens (`tenant-ai-config.ts:120-129`).
  - The page copy must say enforcement of model / ceiling begins when the worker is on the new version.
  - Rollout order: migration, API, worker, web.
- **Ceiling semantics.** The worker pre-call check compares `purposeSpend` against `monthlyCostCeilingCents`. UTC month, matching `getQuotaPeriod`. `0` means block outright, null means none. One overshoot call is accepted, because cost is only known post-call.
- **Fail-open.** In the worker, only Prisma `P2021` / `P2022` (table or column missing) means "no ceiling" plus a logged reason. Connection errors keep the existing fail-open of `tenant-ai-config.ts:130-136` but log at warn level naming the ceiling as unenforced. This is for AI-specialist to confirm.
- **Staleness.** The worker's 60 s cache (`tenant-ai-config.ts:37-43`) means edits apply within about a minute. The UI states it.
- **No RLS reliance.** Every query carries `tenantId`. The policy is a separate migration.

#### Runtime Consumer
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

#### Open points for consensus
1. The shape of the `PRECONDITION_FAILED` payload that the UI reads for the dialog (Frontend).
2. Whether `rag` rows are returned with `locked: true` and a fixed `modelId` from the catalog, so the UI never infers the lock (my recommendation).
3. `expectedUpdatedAt` for a purpose with no row yet is `null`. The conflict check treats "row appeared since" as `CONFLICT`.

### frontend-lead

### PG-199 Round 2 PROPOSAL (Frontend-Lead)

Paths are relative to the worktree root. Read-only analysis of existing code; this file is the only file written.

#### Approach
- Copy the PG-198 shell. `approval-policies/page.tsx:9-19` is a server `page.tsx` with Suspense, and `ApprovalPoliciesContent.tsx:49-197` owns the logic. The PG-199 stub at `model-config/page.tsx:1` is a `'use client'` file and must lose that directive.
- Use PG-202's draft/snapshot discipline. `AvailabilityContent.tsx:192` computes `isDirty = normalize(draft) !== snapshot.baseline`. `:104-112` seeds the draft from query data and never overwrites a dirty draft. The same hook shape fits here (`useModelConfigDraft`).
- Use PG-202's calm NOT_FOUND branch (`AvailabilityContent.tsx:159-175`). The three existing `errorCode` copies (`AvailabilityContent.tsx:60`, `CaseTypesContent.tsx:27`, `ContactTypesContent.tsx:28`) mean this PR extracts rather than adds a fourth.
- One card per purpose, six cards, all from a single `PurposeCard` fed by a metadata map. `PageHeader` has an `actions` array (`page-header.tsx:18-33`), so Save and Reset go there, not into a per-card footer. That gives one page-level Save, as the brief requires.
- **Challenge to the lead assumptions:** the lead puts constants in `packages/domain`. That is fine for the web because `ApprovalPoliciesContent.tsx:14` already imports runtime constants from `@intelliflow/domain`. But I do not want the web to import the rank table to decide a downgrade. The API `get` should return, per model, `{ id, label, family, rank, priceIn1k, priceOut1k }`, and the web should call a shared pure `isDowngrade` from domain, so the client confirm and the server check cannot drift. The server stays authoritative through `acknowledgeDowngrade`. If the lead prefers the web not to import domain at all, `get` can return a precomputed `downgradesFrom` per model per row. I recommend the domain import, because the domain package is already in the web bundle.

#### Files
Create under `apps/web/src/app/agent-approvals/model-config/` unless noted.
1. `page.tsx` (MODIFY, rewrite): server Suspense shell. EXTENDS the `approval-policies/page.tsx` pattern. Rationale: the stub is client-only and cannot stream.
2. `ModelConfigContent.tsx` (NEW file, COMPOSES `PageHeader`, `Card`, `ConfirmationDialog`, `toast`): auth gate via `useRequireAuth` (as `ApprovalPoliciesContent.tsx:50`), `trpc.modelConfig.get`, `update`, `resetToDefaults`. It owns Save, Reset, the downgrade dialog and the aria-live announcer.
3. `ModelConfigLoading.tsx` (NEW, EXTENDS `ApprovalPoliciesLoading.tsx:7-34`): same skeleton with six `lg:col-span-6` cards, and card heights equal to real cards to hold CLS at 0.
4. `components/PurposeCard.tsx` (NEW, COMPOSES `Card`, `SectionHeader`, `Select`, `Slider`, `Input`, `Label`, `Badge`): the single reusable row. NEW is justified because no existing component edits model plus parameters. Props are `{ row, models, draft, onChange, readOnly, errors }`. The same component renders the rag locked state and the email blocked state through props, so there are no forks.
5. `components/FallbackList.tsx` (NEW, EXTENDS the interaction pattern of `ResolutionChecklistEditor.tsx:130-166`): an `<ol>` with up, down and remove buttons at `h-11 w-11`, an add `Select`, and an `EmptyState entity="rules"` when empty (`entity-empty-state-config.ts:30`). It is a new file because the checklist editor edits free text, not a model list. It does not copy that file's code. Only the shape is reused, to keep duplication under the Sonar limit.
6. `components/TemperatureControl.tsx` (NEW, COMPOSES `ui/Slider` `slider.tsx:5-19`): Slider plus a synchronised number `Input` plus visible value. It is separate because `Slider` has no label or value display. It passes `aria-label` and `aria-valuetext` to the Thumb and tests that Radix forwards them.
7. `components/DowngradeDialog.tsx` is NOT created. COMPOSES the existing `ConfirmationDialog` (`confirmation-dialog.tsx:17-39`, `variant="destructive"`) inside `ModelConfigContent`, avoiding a wrapper component.
8. `model-config-model.ts` (NEW, pure, mirrors `approval-policies/components/policy-model.ts`): `toDraft`, `normalize`, `isDirty`, `buildUpdateInput`, `findPendingDowngrades`, `formatUsd`, `centsFromUsd`. All logic lives here and in Content, since `page.tsx` is excluded from coverage.
9. `apps/web/src/lib/trpc-errors.ts` (NEW): `errorCode`, `errorMessage`, `isNotFound`. Migrating the three old copies is OUT of scope. I propose only to replace `ApprovalPoliciesContent.tsx:45` if the lead wants, but I'd leave it.
10. `components/CalmNotice.tsx` or inline: skip. The NOT_FOUND branch is about 12 lines inside Content, and a shared component adds an indirection for one caller.
11. `__tests__/ModelConfigContent.test.tsx`, `PurposeCard.test.tsx`, `FallbackList.test.tsx`, `model-config-model.test.ts`: the test-engineer owns detail. The NOT_FOUND test should follow `AvailabilityContent.test.tsx:144-159` (`role=status`, no `role=alert`).
12. Docs/registries (MODIFY): `docs/design/page-registry.md`, `sitemap.md:239,449` ("Implemented" becomes true), `PAGE_MAP_AND_FLOWS.md`, `navigation-reachability-audit.md`. The sidebar already links the page (`sidebar/configs/agent-approvals.ts:194-199`), so no sidebar change.
13. `lighthouserc.authenticated.js` (MODIFY): add the URL. Per R1, this is the DoD gate.

#### Interfaces
Assumed `modelConfig.get` output (backend-architect to confirm):
```ts
{ canManage: boolean; stale: { workerCacheSeconds: 60 };
  models: { id: string; label: string; family: string; rank: number; purposes: Purpose[] }[];
  limits: { temperature: {min,max,step}; maxTokens: {min,max}; fallbackMax: number; ceilingCentsMax: number };
  rows: { purpose: Purpose; modelId: string|null; fallbackIds: string[]; temperature: number|null;
          maxTokens: number|null; ceilingCents: number|null; spentCents: number|null;
          locked: boolean; blocked: boolean; updatedAt: string }[] }
```
- `update` input per purpose: `{ purpose, modelId, fallbackIds, temperature, maxTokens, ceilingCents, expectedUpdatedAt, acknowledgeDowngrade }`.
- **Rule A (old-API safety):** `buildUpdateInput` omits `acknowledgeDowngrade` unless it is true, and omits null-valued new fields. A plain `z.object` strips unknown keys (R1 backend concern 2), so this is belt and braces.
- **Rule B (save granularity):** Save sends only rows that differ from the snapshot, one `update` per changed row, run sequentially so a failure names its purpose. Per-purpose `update` is the backend's contract (R1-backend: "upsert one purpose in `$transaction`").
- **Dirty rule:** normalize `''`/undefined to null (playbook section 3). The draft is re-seeded from the query only when clean.
- **Save disabled when** `!canManage || !isDirty || isSaving || hasErrors` (playbook `:65-67`). `hasErrors` is local validation using the shared validator schema (duplicate fallback, primary in fallbacks, bounds).
- **rag row (Q5):** `locked: true`. The model `Select` is `disabled` with visible text "Fixed: changing it would change vector size", and a `<span>` explaining why, not just `disabled`. Temperature, max tokens and fallbacks are hidden for rag, since R1-ai-specialist C7 says they are meaningless there. Only the ceiling input stays editable. The card still has a heading and the same grid slot, so layout is stable.
- **email blocked (Q6):** `blocked: true` renders a `Badge` plus a `role="status"` line "Monthly AI ceiling reached for email. Drafts are paused until <first of next month, UTC>. Other purposes keep working." It is `status`, not `alert`, since it is persistent state and not an interruption. Controls stay editable so an admin can raise the ceiling. Other blocked purposes use the same state with the line "Falls back to non-AI behaviour" (the table in R1-domain-expert).
- **Spend readout:** `Intl` formatted "$3.20 of $5.00 this month" plus a `<progress>`-style bar with `aria-label`. Copy states it is an estimate (R1-ai-specialist Q-C) and takes up to 60 s to apply (R1-backend concern 7). If `spentCents` is null, show "Spend unavailable", never "$0.00".

#### Integration
- Mounted at the existing route `/agent-approvals/model-config`; the sidebar link exists (`agent-approvals.ts:194-199`).
- Breadcrumbs: `Dashboard > AI & Agents > AI Settings > Model Configuration` (`ApprovalPoliciesContent.tsx:38-43`). A short `Link` to `/agent-approvals/ai-settings` states that prompt versions are edited there (`ChainVersionEditor.tsx:68-85`).
- Read-only users (`canManage` false) see the same cards, with disabled controls and a note, as `ApprovalPoliciesContent.tsx:191`.
- **Lighthouse:** server shell and skeleton, no new dependency, the Slider/Select Radix chunks are already in the shared bundle. Every control has a visible `<Label>`. Fallback buttons have `aria-label`s. Colour contrast uses the existing tokens. Reorder moves focus to the moved button (`data-*` ids as in `ResolutionChecklistEditor.tsx:143`) and announces through the page `<output aria-live="polite">` (`ApprovalPoliciesContent.tsx:187`).
- **L11:** the Content imports `@intelliflow/domain` (already used by web) and `@intelliflow/validators`. It imports nothing from ai-worker or api.
- **Duplication control:** one `PurposeCard`, one `FallbackList`, one `trpc-errors.ts`. No copy of the PG-198 dialog or card code.

#### Runtime Consumer
| New thing | Production caller | Legacy path replaced |
|---|---|---|
| `modelConfig.get` / `update` / `resetToDefaults` | `ModelConfigContent.tsx` (`trpc.modelConfig.*`) | The "coming soon" stub at `model-config/page.tsx:10-13` |
| `trpc-errors.ts` | `ModelConfigContent.tsx` | None replaced (the three old copies remain, noted as follow-up) |
| `findPendingDowngrades` / domain `isDowngrade` | `ModelConfigContent` pick handlers and Save | None (new rule, R2/Q4) |
| `PurposeCard`, `FallbackList`, `TemperatureControl` | `ModelConfigContent.tsx` | None |

Reset opens a `ConfirmationDialog` that lists what resets (all six purposes: model, fallbacks, temperature, tokens, ceiling) and what stays (spend history, audit trail), per playbook `:130-131`.

#### Open points for consensus
1. Per-row `update` calls versus one batch `updateAll`: one atomic batch gives a cleaner Save (all or nothing). I'd ask backend-architect for `updateAll`, or accept the sequential per-row approach with partial-failure messaging.
2. `expectedUpdatedAt` conflict (R1-backend concern 4) needs a UI message ("changed by someone else, reload"). I'd refetch and keep the draft diff visible.

### data-engineer

### PG-199 Round 2 PROPOSAL — Data-Engineer

#### Approach
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

#### Files
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

#### Interfaces
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

#### Integration
- Test ordering: `ensureMigrationSql` keyed on `pg_constraint` sentinel `tenant_ai_config_purpose_check` (pattern `approval-policies.test.ts:59-80`). On a db:push DB the columns already exist, so skip `ADD COLUMN` statements when `information_schema` shows them (same trick as the `agent_actions` skip). Do not drop `tenant_ai_config`. It has FK and rows from other suites. Replay both migration files, with `splitStatements` keeping the `DO $$` block whole.
- Cases: every CHECK rejects (bogus purpose, tier, temperature 2.5, maxTokens 0, ceiling -1, 4 fallbacks, primary within fallbacks, blank modelId) and boundary values pass (ceiling 0, temperature 0 and 2). The default fallback is `{}`. Unique `(tenantId, purpose)` still holds. Tenant delete cascades. `pg_policies` has the policy and `relforcerowsecurity` is false. A second replay is a no-op (guard). Counter: 10 concurrent increments equal 10; distinct purpose keys are independent; a different period is a fresh row; cross-tenant counters are isolated.
- Run under Node 22 against `DATABASE_TEST_URL` and show the suite actually ran (`describeDb` skips silently).
- Unit test for `isCeilingReached` and `purposeSpendKey`; adapter test for the SQL shape.
- Docs: regenerate nothing in splits for this. The ADR-082 and PRD addenda state the schema and the skew behaviour.

#### Runtime Consumer
- Columns: read by the ai-worker config resolver (`lib/tenant-ai-config.ts` extension, called from `createLLMForTenant`, `llm-factory.ts:380`) and by `modelConfig.get/update/resetToDefaults`. The legacy path replaced: tier-only resolution (`resolveEffectiveTier`, `tenant-ai-config.ts:74-137`).
- `incrementPurposeSpend`: called from the cost listener in `ai-worker.ts:310-322` after `recordTenantSpend`, with the purpose attributed. `getPurposeSpend`: called by the factory ceiling check and by the router `usage` read for the page. Legacy replaced: the single aggregate key at `tenant-ai-spend.ts:56`, which stays for the plan quota.
- RLS migration: no runtime consumer by design (defence in depth only).
- Open items for others: ai-specialist (purpose in cost-listener metadata, fail-open error classes), backend-architect (reset tier handling, tx boundaries), test-engineer (Node 22 evidence).

### domain-expert

### PG-199 Round 2 PROPOSAL — Domain-Expert (business rules)

Paths relative to the pg-199 worktree; ai-worker paths are under `apps/ai-worker/src/`.

#### Approach
Pure rules live in `packages/domain/src/ai/model-config/` (pattern: `ai/approval-policy`, exported at `packages/domain/src/index.ts:119-120`). The router, worker and web all import them. Four findings from the code change the lead's assumptions:

1. **Tier labels are not monotone.** `structured-free` is gemini-2.5-flash but `structured-standard` is mistral-small (`infra/litellm/config.yaml:36,67-70`), and flash outranks mistral-small. A tier-only change can therefore be a model downgrade. Downgrade is judged on the **effective model**, never the tier label.
2. **The factory default tier is caller-supplied** (`llm-factory.ts:380-398`). `qualification` is `standard` in the case/account chains but `free` in `base.agent.ts:164`; `structured` is `free` in tag chains and `standard` in `enrichment-adapter.ts:124`. A stored row forces one tier for all callers of that purpose (`tenant-ai-config.ts:93-105`). The domain therefore needs one `BASELINE_TIER[purpose]` as the "current" for tenants with no row (see Decisions).
3. **Every `createLLMForTenant` caller already catches errors and has a non-AI fallback**, so a typed `PurposeCeilingReachedError` thrown from the factory degrades correctly: `case-insight.chain.ts:59,82`, `account-scoring.chain.ts:90-111`, `contact-reply-draft.chain.ts:106,143`, `enrichment-adapter.ts:146`. The exceptions are `auto-response.chain.ts:10,169` (throws, per Q6) and `summarize-conversation.job.ts:215` (digest).
4. **Embeddings are not wired to tenants.** `embedding.chain.ts:61` hardcodes `createEmbeddings('free')`, and there is no tenant param and no cost recording (`llm-factory.ts:409`). Production may use Gemini via `EMBEDDING_PROVIDER` (`:424`).

#### Files
Create:
- `packages/domain/src/ai/model-config/catalog.ts`: `MODEL_CATALOG`, `BASELINE_TIER`, `TIER_DEFAULT_MODEL`.
- `.../rules.ts`: `effectiveModel`, `isDowngrade`, `findDowngrades`, limits.
- `.../index.ts`.
- `packages/domain/src/ai/model-config/__tests__/*.test.ts`.
- `ai-worker` catalog-versus-YAML consistency test.

Modify:
- `llm-factory.ts:36,44`: purpose and tier become aliases of the domain types.
- PRD addendum `docs/planning/prd-module-settings.md`.
- ADR-082 Decision Outcome: option 2, plus the YAML-amendment wording.

(Router, validators, web and migration files belong to the other roles.)

##### MODEL_CATALOG (append-only; ids are stable, entries are deprecated, never deleted)
Rank is a hand-assigned 0-100 capability scale (30-point gap = a different class). Higher is better. A pick is **lower** only if its rank is strictly less.

| catalog id | provider model (YAML) | rank | gen | purposes | USD per 1k in/out |
|---|---|---|---|---|---|
| `llama-3.1-8b-instant` | groq/llama-3.1-8b-instant | 20 | 3.1 | scoring, email | 0.00005 / 0.00008 |
| `gpt-oss-20b-free` | openrouter/openai/gpt-oss-20b:free | 30 | oss-20b | reasoning | 0 / 0 |
| `mistral-small` | mistral/mistral-small-latest | 35 | latest | scoring, structured | 0.0002 / 0.0006 |
| `llama-3.3-70b` | groq/llama-3.3-70b-versatile | 40 | 3.3 | qualification, email | 0.00059 / 0.00079 |
| `gpt-4o-mini` | openai/gpt-4o-mini | 48 | 4o | scoring | 0.00015 / 0.0006 |
| `gemini-2.5-flash` | gemini/gemini-2.5-flash | 50 | 2.5 | structured | 0.000075 / 0.0003 |
| `mistral-medium` | mistral/mistral-medium-latest | 55 | latest | qualification | 0.001 / 0.003 |
| `claude-haiku-4-5` | anthropic/claude-haiku-4-5 | 65 | 4.5 | email, reasoning | 0.0008 / 0.004 |
| `gpt-4o` | openai/gpt-4o | 75 | 4o | qualification, structured | 0.0025 / 0.01 |
| `claude-sonnet-4-5` | anthropic/claude-sonnet-4-5 | 85 | 4.5 | reasoning | 0.003 / 0.015 |
| `nomic-embed-text` (embedding) | ollama/nomic-embed-text | 20 | 768d | rag, locked | 0 |
| `text-embedding-3-small` (embedding) | openai/text-embedding-3-small | 40 | 1536d | rag, locked | 0.00002 / 0 |

- Purposes per model are exactly the YAML `model_list` aliases of that purpose (`config.yaml:11-117`), so every pinned model is already proven for its purpose. Prices equal `MODEL_PRICING` (`ai.config.ts:198-269`), per 1k tokens.
- Each default alias model ascends free < standard < premium for scoring, qualification, email and reasoning, so tier moves there are upgrades. Exception: structured (50 down to 35).
- Changing an existing rank retroactively changes what counts as a downgrade, so ranks are frozen. Changing one needs an ADR-082 amendment and owner sign-off. A test snapshots ids and ranks.
- Ranks are my judgment, to be ratified by the owner in the spec.

#### Interfaces
- `effectiveModel(purpose, tier, modelId|null): CatalogId` = the pin, else `TIER_DEFAULT_MODEL[purpose][tier]`.
- `isDowngrade(before: CatalogId|null, after: CatalogId): boolean`. Unknown or retired `before` returns **true** (safe toward a confirm).
- `findDowngrades(before: Config, after: Config): Downgrade[]`, with `{purpose, slot: 'primary'|'fallback', from, to}`:
  - **Primary:** `rank(effective primary after) < rank(effective primary before)`. For a purpose with no row, `before` = `TIER_DEFAULT_MODEL[purpose][BASELINE_TIER[purpose]]`.
  - **Fallback (Q4):** a fallback that is new or changed, with `rank(entry) < rank(primary after)`. Unchanged entries never re-prompt. Equal rank is not a downgrade.
  - **Reset:** a downgrade whenever the current effective model outranks the baseline.
- Limits:
  - temperature 0-2, maxTokens 1-32768 (AI-specialist to verify per-model caps; none are asserted here).
  - fallbacks <= 3, no duplicates, none equal to the primary, all allowed for the purpose.
  - ceiling integer cents, 0-10,000,000 (0 = block outright). Null means no ceiling.
  - `rag`: model, tier, fallbacks, temperature and maxTokens are locked (null or empty). Only the ceiling is editable.

#### Behaviour per purpose when the ceiling is reached
Check is pre-call, per UTC month, so one overshoot call is possible. Spend is an estimate from `MODEL_PRICING`, not an invoice. Tenant-wide `aiSpendCentsPerMonth` (`agent.router.ts:378`) still applies independently.

| purpose | blocked behaviour |
|---|---|
| scoring | default low-confidence score (`scoring.chain.ts:294`); churn heuristic (`churn-risk.chain.ts:593`) |
| qualification | chain `source:'fallback'` (case-*, account-*); qualification agent errors visibly |
| email | auto-response throws "monthly AI ceiling reached for email" (Q6); reply-draft returns `requiresReview` fallback (`contact-reply-draft.chain.ts:7`) |
| reasoning | insight heuristics (`insight-generation.chain.ts:412`); summary digest |
| structured | ticket keyword routing (`ticket-routing.chain.ts:255`); sentiment neutral (`sentiment.chain.ts:313`) |
| rag | not enforceable today (finding 4); see Decisions |

Fail open only on a missing column or table (`P2021`/`P2022`), with a logged reason. Any other DB error does not lift a ceiling that is already known.

#### Reset semantics
`resetToDefaults`: one transaction, all six purposes.
- Delete rows with `rateLimitPerMinute` null. Rows carrying a rate limit (P2.8, `schema.prisma:236`) are kept: pin, fallbacks, ceiling, temperature and maxTokens are nulled and tier is set to baseline.
- Confirm text lists what is reset (model, fallbacks, temperature, max tokens, ceiling, with the blocked state lifted) and what is kept (month-to-date spend, audit log, rate limit).
- If it lowers any purpose's effective model, it needs `acknowledgeDowngrade` plus an audit entry.
- Reset always writes one audit entry with before and after.

#### Decisions for the lead
1. **`BASELINE_TIER`:** scoring `free`, qualification `standard`, email `free`, reasoning `free`, structured `free`, rag `free`. These are the majority call-site defaults. Please ratify.
2. **rag ceiling:** Q5 says it is editable, but embeddings are tenantless and unmetered, so the ceiling would never trip. Recommend keeping it editable per Q5 and labelling it "not metered yet" (an accepted exception to the playbook's no-pending-badge rule). File the follow-up. Alternative: read-only. Needs the owner's choice.
3. **Metering must cover every `createLLMForTenant` caller.** Spend is recorded today only at `base.agent.ts:694` and `insight-generation.chain.ts:362`. The case, account and contact chains record nothing, so a qualification or email ceiling would never trip. Capture tokens in the tracing callback wrapper rather than per chain.
4. **Catalog pins need YAML routes.** Add additive `model_name` entries for catalog ids (no existing alias edited). The YAML-consistency test asserts `litellm_params.model` equality per catalog entry.

#### Final DoD applicability (13 items)
| # | item | status |
|---|---|---|
| 1 | Never-Downgrade model ids | Applies: catalog, `findDowngrades`, server ack, audit |
| 2 | PageHeader + bento | Applies |
| 3 | Canonical EmptyState | Applies (fresh tenant, no spend) |
| 4 | System-compliant CTAs | Applies |
| 5 | TagsTab forwardRef | **N/A**: no tags card (cf. PG-198 AC-P17) |
| 6 | `$transaction` on destructive writes | Applies: update, reset |
| 7 | No `skipDuplicates` | Applies (no `createMany`) |
| 8 | Zod `superRefine` duplicate keys | Applies: purposes, fallbacks, "rows N and M" |
| 9 | colorToken CHECK | **N/A**: rows keyed by the fixed purpose enum |
| 10 | AI defaults FALSE | **N/A**: no Boolean column (ceiling null = off) |
| 11 | Wire every Boolean toggle | **N/A**: no Booleans; every setting has a runtime consumer |
| 12 | Cross-tenant negative test | Applies |
| 13 | Lighthouse >= 90 | Applies; NEEDS_HUMAN if `LHCI_TEST_*` creds absent |

#### PRD addendum ACs
- AC-M1: playbook layout.
- AC-M2: admin-only mutations (FORBIDDEN), read-only for others.
- AC-M3: six purpose rows, each a model pick from the catalog filtered by purpose.
- AC-M4: temperature and max tokens bounds.
- AC-M5: fallback chain bounds (<= 3, ordered, no duplicate, not the primary).
- AC-M6: cost ceiling in cents, USD in the UI, estimate disclaimer.
- AC-M7: a lower-ranked primary pick needs a server-verified acknowledge, a confirm dialog and an audit entry naming the actor.
- AC-M8: same for a new or changed lower-ranked fallback.
- AC-M9: a tier-only change that lowers the effective model also needs the acknowledge.
- AC-M10: unknown current model needs the acknowledge.
- AC-M11: tenant-scoped, foreign id is NOT_FOUND.
- AC-M12: multi-row writes are transactional.
- AC-M13: no row means unchanged behaviour.
- AC-M14: pin, fallbacks, temperature, maxTokens and ceiling are honoured at runtime by every caller, including agents and the summary job.
- AC-M15: ceiling reached blocks only that purpose, per the table above.
- AC-M16: email shows "monthly AI ceiling reached"; the page shows the purpose as blocked.
- AC-M17: reset semantics as above.
- AC-M18: rag model, tier and fallbacks are locked.
- AC-M19: old API gives calm NOT_FOUND degrade; no unknown fields sent.
- AC-M20: cross-tenant negative test.
- AC-M21: fail open only on missing column or table, with a logged reason.
- AC-M22: settings may take up to 60 s to apply (worker cache).

#### Integration
- Boundary: domain (pure) is imported by the API router, ai-worker, validators and web. No infra imports.
- Prisma `TenantAIConfig` gains modelId, fallbackModelIds, ceiling cents.
- Counters are `tenant_usage_counters` `aiSpendCents:<purpose>`, UTC month period.
- Audit via `getAuditLogger` with `model_config` resource.

#### Runtime Consumer
| new item | production caller | legacy replaced |
|---|---|---|
| `effectiveModel`, catalog | `createLLMForTenant` and web catalog list | tier-only alias at `llm-factory.ts:326` |
| `findDowngrades` | `modelConfig.update`, `resetToDefaults`, web confirm | none (new rule) |
| `PurposeCeilingReachedError` | `createLLMForTenant`, caught by each chain's existing fallback | none |
| `BASELINE_TIER` | `findDowngrades` for no-row tenants | caller-supplied default for ranking |
| tenant-aware `BaseAgent` | agents `invokeLLM` | `createLLM(purpose,'free')` at `base.agent.ts:164` |
| tenant-aware summary job | `processSummarizeJob` | `createLLM('reasoning','free')` at `:223` |

#### Follow-up issues to file (confirm with team-lead first)
1. `ChainVersion.model` (`schema.prisma:5603`) is stored but dead at runtime.
2. `ChainVersionEditor.tsx:73-85` resets temperature and max tokens on edit (data loss).
3. Embeddings tenantless and unmetered (`embedding.chain.ts:61`); wire the rag model and ceiling.
4. Per-model `maxTokens` caps in the catalog.
5. `docs/design/sitemap.md:239,449` marks the route "Implemented" while it is a stub.
6. Fix inline in this PR if feasible: spend misattribution at `base.agent.ts:690` and `insight-generation.chain.ts:362-367`.

### test-engineer

### PG-199 Round 2 PROPOSAL (Test-Engineer)

Paths are relative to the pg-199 worktree. Every test is written RED first, in the same commit group as its code.

#### Answer to my R1 question: where the router.ts coverage exclusion lives
- Root `vitest.config.ts:371` excludes `apps/api/src/router.ts`. `apps/api/vitest.config.ts:76-90` does not, which is why I missed it.
- Sonar mirrors it: `sonar-project.properties:198` (`apps/api/src/router.ts`) and `:196` (`apps/api/src/modules/legal/*.router.ts`).
- Correction to the lead's assumption: `modules/agent/model-config.router.ts` is NOT excluded. Only the legal routers and the root `router.ts` are. The new router is measured, so the router test must cover every branch, and the smoke block only covers the mount.
- The web `page.tsx` exclusion is `vitest.config.ts:387` and `sonar-project.properties:192`. `ModelConfigContent.tsx` and its sub-components are measured.

#### Approach
Copy PG-198 and PG-202 patterns, adding only what the new risk needs: the downgrade rule, per-purpose ceilings and fail-open. Pure logic (rank, downgrade, catalog) lives in the domain package so it is tested without mocks. Domain target is above 95%, and diff-coverage (`scripts/lib/diff-coverage.mjs`) must be at least 80% on changed lines, with no coverage-ignore comments.

#### Files (create)
1. `packages/domain/src/ai/model-config/__tests__/model-catalog.test.ts`
   - Every catalog entry has a unique id, a rank, and a non-empty provider map.
   - `isDowngrade`: lower rank is true; equal rank false; higher false; unknown current id returns false (nothing to protect); unknown next id throws.
   - `findDowngrades(before, after)` returns primary and fallback entries and ignores unchanged ones.
   - Consistency test: parse `infra/litellm/config.yaml` and check each catalog LiteLLM id exists. Use `readFileSync` plus a line match, not a YAML dependency, unless one is already installed.
   - Price parity: each catalog id used by the cost path exists in `MODEL_PRICING` (`apps/ai-worker/src/config/ai.config.ts:198-269`), because `calculateCost` falls back to gpt-3.5 pricing for unknown keys (`:277`). Put this one in ai-worker, since domain must not import ai-worker.
2. `packages/validators/src/__tests__/model-config.test.ts`: superRefine cases modelled on `approval-policies.test.ts:100-112`.
   - Duplicate purposes: one issue, path on the second row, message "rows 1 and 3".
   - Primary appears in fallbacks; duplicate fallbacks; model not in catalog; model not allowed for the purpose.
   - `rag`: model change rejected, ceiling accepted.
   - Bounds: temperature 0 and 2 accepted, 2.01 and -0.1 rejected; maxTokens 0 rejected; ceiling 0 accepted (means block), negative rejected; fallback count above the cap rejected.
   - Absent optional fields parse (old-client payload).
3. `apps/api/src/modules/agent/__tests__/model-config.router.test.ts`: `prismaMock`, `useTx`/`failTx`, `expectCode` as in `approval-policies.router.test.ts:67-92`.
   - `get`: defaults for purposes with no row; `canManage` true for admin, false for user; every `where` contains `tenantId`.
   - Admin gate `it.each` over `update` and `resetToDefaults`: FORBIDDEN and `$transaction` not called (`:98-108`).
   - Cross-tenant negative: tenant B's row never appears in tenant A's `get`/`update` (`where` asserted), and a stale `updatedAt` is CONFLICT with no write.
   - Downgrade: primary and fallback each rejected without `acknowledgeDowngrade` and no write; with the flag, written, and `logAction` called with `actorId = ctx.tenant.userId` plus from and to model. Upgrade or unchanged: no audit entry.
   - `$transaction` used for update and reset; P2002 maps to CONFLICT via `failTx`.
   - Audit is fire-and-forget: a rejected `logAction` does not fail the mutation.
   - `resetToDefaults` writes defaults in one transaction, and a reset that lowers a pinned model also needs the acknowledgement.
4. `apps/ai-worker/src/lib/__tests__/purpose-spend.test.ts`: key `aiSpendCents:<purpose>:YYYY-MM` (UTC).
   - Increment per purpose; two purposes do not leak; two tenants do not leak.
   - Month boundary with a pinned clock (see below).
   - Ceiling gate: under the ceiling passes, at it throws `PurposeCeilingReachedError`, ceiling 0 blocks outright, null means no ceiling, and other purposes keep working (Q2).
   - Fail-open matrix: P2021/P2022 and a missing column proceed with a logged reason; any other DB error does not silently lift an existing ceiling (decision for the lead, see Questions).
5. `apps/ai-worker/src/lib/__tests__/llm-factory.model-pin.test.ts` (or extend `llm-factory.test.ts`; its `importFactory(provider)` helper at `:79` is reusable): model pin per provider (OpenRouter `modelName`, LiteLLM, Ollama), cache key includes model, breaker key includes model, fallback chain advances on 429/5xx and not on 4xx validation errors.
6. `apps/web/src/app/agent-approvals/model-config/__tests__/ModelConfigContent.test.tsx`, modelled on `AvailabilityContent.test.tsx:144-158` with `vi.hoisted` trpc stubs.
   - Six purpose cards; rag model read-only with an editable ceiling (Q5); blocked badge with a visible reason for `email` at ceiling (Q6).
   - NOT_FOUND: `role=status`, no `role=alert`; other errors show Retry.
   - Downgrade confirm for primary and for fallback; Cancel restores the previous value; Confirm sends `acknowledgeDowngrade: true`.
   - Dirty snapshot: Save disabled until changed; reset restores; read-only when `canManage` is false.
   - The payload omits unset optional fields (old-API rule); USD shown, cents sent.
7. `apps/web/src/lib/__tests__/trpc-errors.test.ts` for the extracted helper: NOT_FOUND by `data.code` and by the "No procedure found" message, and non-tRPC values return false. Existing callers keep their tests green.
8. `tests/integration/model-config.test.ts` using the `ensureMigrationSql` pattern (`tests/integration/approval-policies.test.ts:57-80`). Guard on `pg_constraint` presence, then replay both migration files (CHECKs, then the separate RLS file).
   - Each named CHECK rejects a bad value (SQLSTATE 23514 via the existing `pgCode` helper).
   - Two tenants: A's row is invisible to B under the RLS policy, and the default pattern still passes with no policy-dependence in queries.
   - Fail-open path: against a table missing the new columns, the worker's lookup returns the legacy shape.

#### Files (modify)
- `apps/ai-worker/src/lib/__tests__/tenant-ai-config.test.ts`: new fields resolved, missing-column fallback, cache keyed to the new shape. It already clears `_tierCache` in `beforeEach` (`:51-53`).
- `apps/ai-worker/src/agents/base.agent.test.ts:15` and `jobs/__tests__/summarize-conversation.job.test.ts:41`: the `llm-factory` mock factories add `createLLMForTenant: vi.fn(async () => stubModel)` beside `createLLM`. Assert it is called with `(purpose, tier, { tenantId })` and that `createLLM` is not. Check every other `vi.mock('../lib/llm-factory.js')` that loads `base.agent` (email-writer, followup, qualification, next-best-action tests, plus `__tests__/next-best-action.agent.b11.test.ts`) so none breaks.
- Spend misattribution: `base.agent.test.ts` asserts `recordUsage` receives the resolved model and purpose, not `${purpose}-free` (`base.agent.ts:690`). An `insight-generation` test asserts non-zero tokens (`insight-generation.chain.ts:362-367`).
- `apps/api/src/__tests__/app-router.smoke.test.ts` (after `:142-155`): a `modelConfig` block with get, update and resetToDefaults.
- Count tests, edited with the code that moves them: `apps/web/src/app/__tests__/sitemap-reconciliation.test.ts:65` (214 stays unless a page is added; verify), `ui-flow-mapping-reconciliation.test.ts` (70 to 71 routers, procedures plus 3), `ia-reconciliation.test.ts`, `tools/scripts/route-total-consistency.test.ts`, `apps/web/src/lib/shared/__tests__/settings-search.test.ts`. Their numbers are updated together with `docs/design/ui-flow-mapping.md`.

#### Interfaces (test seams)
- `isDowngrade(current: string | null, next: string): boolean`; `findDowngrades(before, after): Downgrade[]`.
- `checkPurposeCeiling(tenantId, purpose, now?: Date)` takes an injectable clock and a Prisma-like client, so month tests need no global patching.
- Router input carries `acknowledgeDowngrade?: boolean` and `expectedUpdatedAt?`.

#### Fixed-clock plan
- All spend and ceiling tests use `vi.useFakeTimers()` plus `vi.setSystemTime(new Date('2026-10-31T23:59:59.999Z'))` then `'2026-11-01T00:00:00.000Z'`, with `vi.useRealTimers()` in `afterEach`, following `tenant-ai-config.test.ts:126`.
- Run with `TZ` set to a non-UTC zone in one case to prove the period is computed in UTC.
- No test reads the real `Date` except through the injected clock.

#### Coverage plan
Domain above 95%, validators above 95%, router all branches (it is measured), ai-worker new modules above 90%, `ModelConfigContent` above 90%. `page.tsx` stays a thin shell (excluded). Run `node scripts/pre-ship.mjs`, which includes `diff-coverage`.

#### Regression suites to rerun, by package
- ai-worker: `llm-factory*`, `createLLMForTenant`, `tenant-ai-config`, every `agents/*.test.ts`, `chains/*scoring|churn|sentiment|ticket|auto-response*`, `jobs/__tests__/summarize-conversation*`, cost-tracker and tenant-ai-spend tests.
- api: `modules/agent/__tests__/*`, `app-router.smoke`, security RBAC/audit tests (new `ResourceType`).
- validators and domain: full package runs. web: `agent-approvals/**`, sidebar config, settings-nav, `settings-search`, reconciliation tests.
- integration and docs: `tools/scripts` count tests.

#### Integration
CI builds with `db:push`, so integration SQL is applied by the test itself. Node 22 and `DATABASE_TEST_URL` only; the prod URL in `.env.local` is never used.

#### Runtime Consumer
Each new function must be exercised by a test that goes through its production caller (`createLLMForTenant`, `BaseAgent.invokeLLM`, `generateSummaryWithLLM`, the web `trpc.modelConfig.*` calls), not just a unit of the function.

#### Questions for the lead
- Fail-open scope: I propose only P2021/P2022 (missing table or column) fail open, and other DB errors keep the last cached ceiling. This follows the backend-architect's concern (R1 item 3) and `tenant-ai-config.ts:130-136`.
- Do you want the optimistic `expectedUpdatedAt` check? I have included tests for it.

## Round 3 — CHALLENGE

### Lead: R3-brief.md

### PG-199 Round 3 CHALLENGE — brief from the lead

Read ALL six R2-*.md files and PG-199-owner-ruling.md (now Q1–Q8). Write your challenge to
rounds/R3-<your-role>.md (only file you may create/edit), file:line citations required.

#### Settled since Round 2 (do not re-propose; challenge only with code evidence)

- **Q7 (owner): rank BY PRICE, not hand-assigned capability ranks.** rank = input+output USD per 1k
  from MODEL_PRICING; strictly lower price ⇒ downgrade; equal ⇒ lateral (no confirm, audited);
  unknown/retired current ⇒ treat as downgrade. Domain-Expert's 0-100 rank table is REJECTED.
- **Q8 (owner): meter embeddings now** — embeddings become tenant-aware and count spend under `rag`;
  rag ceiling really blocks (rag model still locked per Q5).
- Save contract: ONE atomic mutation `modelConfig.update({ purposes: PurposeConfigInput[],
  acknowledgeDowngrade?: true, expectedUpdatedAt? })` covering all edited purposes in one
  `$transaction` (page-level Save). The validator's superRefine rejects duplicate purposes
  (this is the DoD "duplicate agent keys" item). Plus `get` and `resetToDefaults`.
- Optimistic concurrency: `expectedUpdatedAt` (tenant's latest row updatedAt) ⇒ CONFLICT on mismatch;
  web hasConflict disables Save (playbook §3).
- Spend: Backend's `PurposeSpendPort` (not the closed QuotaKey) over tenant_usage_counters key
  `aiSpendCents:<purpose>`, period YYYY-MM UTC. EVERY tenant-aware LLM/embedding call is metered with
  its purpose (in the factory, not per caller), so qualification/email ceilings can trip.
- Fail-open: only "relation/column does not exist" (pre-migration skew) ⇒ no ceiling + warn log with
  reason; other DB errors ⇒ last cached value, else fail open + warn log (matches the existing
  tenant-ai-config fail-open). Never block AI because the DB is unreachable.
- Server enforces downgrade + rag lock; the web calls the same domain `findDowngrades` for its
  confirm.

#### Challenge sections
- Challenges (what could go wrong, with code evidence)
- Edge cases (month rollover, purpose with no row, pinned model retired from catalog, provider
  without the pinned model e.g. Ollama/OpenRouter, fallback loops, concurrency, 60 s cache)
- Integration issues (cite both files)
- Dead-on-arrival risk (any proposed file/procedure/function with no production caller)
- UI reachability (sidebar/breadcrumbs/settings search) and route conflict (AI Settings chain
  versions)
- Suggestions (concrete fixes)
Under 800 words.

### ai-specialist

### PG-199 Round 3 CHALLENGE: AI-Specialist (ai-worker lens)

Paths under `apps/ai-worker/src/` unless noted.

#### Challenges
1. **Q8 embedding metering is mostly an ALS problem, not a factory problem.**
   - The embeddings instance is a process-wide singleton: `getEmbeddingChain()` memoizes `new EmbeddingChain()` (`chains/embedding.chain.ts:371-373`), which calls `createEmbeddings('free')` (`:61`). So `createEmbeddings` cannot be made per-tenant, and its signature (`lib/llm-factory.ts:409`) should not change.
   - Meter and ceiling-check inside `wrapEmbeddingsWithTracing` (`tracing/llm-tracer.ts:116,152`). It already resolves the tenant per call from `tenantContextStore`, so a shared instance is fine.
   - The two embedding consumers do not run inside the ALS scope. `ContactEmbedWorker` and the ingestion workers are their own BullMQ workers (`ai-worker.ts:388-400,432-439`), not `processJob` (`ai-worker.ts:1038`).
   - Their callbacks drop the tenant: `generateEmbedding(text)` only (`workers/contact-embed-worker.ts:38,156`, `workers/ingestion-workers.ts:172,195`), although the job data carries `tenantId` (`contact-embed-worker.ts:23`, `ingestion-workers.ts:45`).
   - Without a fix, every embedding resolves to tenant `unknown` and is silently unmetered. `isBillableTenant` drops it (`utils/tenant-ai-spend.ts:35-37`), so the rag ceiling never trips.
   - Fix: wrap each job handler in `tenantContextStore.run({ tenantId: data.tenantId }, ...)`.
2. **Ceiling errors are swallowed or wrapped.**
   - `generateEmbedding` rethrows as `new Error('Failed to generate embedding: ...', { cause })` (`embedding.chain.ts:113-116`), so `instanceof PurposeCeilingReachedError` is lost.
   - Embedding callers also swallow errors: `ingestion-workers.ts:193-195,265-267` sit in try/catch, and the contact worker returns null.
   - Check `error.cause` or use a `code` property (`'PURPOSE_CEILING_REACHED'`) instead of `instanceof`. A ceiling-blocked embedding must be skipped and logged, not retried forever by BullMQ.
3. **Embeddings carry no token counts.** `embedQuery` and `embedDocuments` return vectors only (`embedding.chain.ts:82,137`), so cost must be estimated with `countTokens`.
   - Prod uses `EMBEDDING_PROVIDER=gemini` (`lib/llm-factory.ts:424-433`). Gemini embedding is not in `MODEL_PRICING` (`config/ai.config.ts:198-269`; only `rag-free {0,0}` and `rag-premium` are present).
   - It would price at 0 and the rag ceiling would be inert in production. Add a priced catalog entry for the Gemini embedding model and select it by provider. The rag model is locked, so it is a read-only display row plus a pricing key.
4. **Q7 price ranking pitfalls.**
   - Floating-point sums: `0.0002+0.0006` against `0.0008+0` can compare unequal by 1 ulp, turning a lateral move into a downgrade or the reverse. Store prices as integer micro-dollars per million tokens in the catalog and compare integers. The parity test asserts catalog equals `MODEL_PRICING` after conversion.
   - "Current effective model" for a tenant with no row or no pin must be defined as `pin ?? default alias for (purpose, tier)`, priced from `ai.config.ts:235-268`. Otherwise "unknown current means downgrade" fires on every first save.
   - Tier edits (`resolveEffectiveTier` still returns tier, `lib/tenant-ai-config.ts:74-137`) change the effective model. Tier going down is a downgrade and needs the same confirm and audit entry. Decide whether the page keeps a tier control. I recommend removing it from the UI (the pin supersedes it) and keeping the column.
   - Price ties are common: `scoring-free` and `email-free` are identical (`ai.config.ts:235-236`), and every free model is 0. Equal is lateral by the ruling; just ensure the audit still records it.
5. **Double counting.** After metering moves into the tracer (R2 Approach 5), `base.agent.ts:685-703` and `insight-generation.chain.ts:359-368` must go in the same commit, with a test that fails if a single agent call records twice.
6. **Tracer labels lie for pins.** `llm.model_name` is `${purpose}-${tier}` (`llm-tracer.ts:67`) and `LLMTracingMeta` has no model (`:27-30`). Add `modelId` to the meta, or spans and cost records will show the alias for a pinned model.

#### Edge cases
- **Month rollover:** include the UTC period in the spend-cache key, so a cached "blocked" does not outlive the 1st of the month. The in-process carry (`tenant-ai-spend.ts:40`) is per tenant and must become per `(tenant, purpose)`.
- **Purpose with no row:** defaults, no ceiling, no pin. `rag` with no row still meters, but with no ceiling.
- **Pin retired from the catalog or not allowed for the purpose:** ignore the pin, use the tier default, log `pin_retired`, and show the card as "model retired" in `get`.
- **Provider lacks the pinned model (Ollama, OpenRouter):** use the tier default and log `pin_unavailable_for_provider`. The page must say a pin may be ignored on the dev provider.
- **Fallback loops:** the fallback list is deduplicated and excludes the primary by validator, but also enforce a runtime attempt cap of `1 + fallbacks.length`, and never re-enter the wrapper from a fallback instance.
- **Concurrency and multi-worker:** each worker has its own 30 s spend cache and 60 s config cache (`tenant-ai-config.ts:39`). With N workers the overshoot is bounded by roughly N times the rate times 30 s. The spec should say so.
- **Usage missing:** `usage_metadata` can be absent on OpenRouter free models or Ollama. Fall back to `countTokens` (as `base.agent.ts:691-692` does) rather than recording 0.

#### Integration issues
- `lib/tenant-ai-config.ts:90` selects all columns. With the new Prisma client against a pre-migration DB, that throws `P2022`, which also drops the tier override (Data-Engineer R2). Implement the legacy-select retry in the resolver, and test it.
- Fail-open versus the settled rule: the existing blanket catch (`:130-136`) stays for unknown errors (last cached value, else open plus a warn), so the "blocked stays blocked during an outage" behaviour in my R2 is satisfied by the cache only. Say so.
- `agents/email-writer.agent.ts:79`, `followup.agent.ts:78` and `qualification.agent.ts:88` build `structuredModel` in the constructor. `NextBestActionAgent` (`next-best-action.agent.ts:180`) must be checked too. A `getModel(task)` hook changes all four.

#### Dead-on-arrival risk
- `calculateCostForCatalogModel` (R2): dead unless the tracer calls it.
- `withModelFallback` helper: only exists if the structured-output spike fails; otherwise delete it.
- `PurposeSpendPort.getSpentCents` and `isCeilingReached`: consumed only by `createLLMForTenant` and the tracer's embedding path. If embeddings are not wired, the rag ceiling is dead.

#### UI reachability and route conflict
- The route is already linked via `AI_SETTINGS_ITEMS` and `AIModuleSettingsPanel` (exploration section 3). `/agent-approvals/ai-settings` edits `ChainVersion.model` (dead at runtime). Add a visible note on that editor and a link from the Model Config page, so users do not think chain-version models are in effect.

#### Suggestions
1. Meter in `wrapModelWithTracing` and `wrapEmbeddingsWithTracing` only; no per-caller recording.
2. Wrap embedding workers' handlers in `tenantContextStore.run`; add a test asserting spend lands under the job's tenant.
3. Use a `code` field on the ceiling error, and check `cause` in `generateEmbedding` callers.
4. Integer micro-dollar prices with a `MODEL_PRICING` parity test.
5. Add priced Gemini embedding and concrete catalog entries; make unknown pricing a test failure, not a silent 0.
6. Define "effective model" (`pin ?? alias(purpose, tier)`) in the domain and use it for `findDowngrades`.

### backend-architect

### PG-199 Round 3 CHALLENGE — Backend-Architect

Paths relative to the pg-199 worktree. Challenges are against all six R2 files plus Q7/Q8.

#### Challenges
1. **Tier changes are downgrades too, and nobody covers them.**
   - With no pin, the effective model is `${purpose}-${tier}` (`llm-factory.ts:326`). The update payload still carries `tier`, so moving `premium` to `free` swaps the model for a cheaper one with no `modelId` involved.
   - `findDowngrades(before, after)` must compare **effective** models: `modelId ?? defaultModelFor(purpose, tier)`. That needs a domain table `purpose x tier -> catalog id`, derived from `infra/litellm/config.yaml:11-117` and covered by the parity test.
   - The first save from "default" is also the case "current model is not a catalog pin". It must resolve through that table, not through the "unknown current is a downgrade" rule. Otherwise every first save asks for a confirm.
2. **Price comparison needs integers, not floats.**
   - `MODEL_PRICING` is USD per 1k as floats (`ai.config.ts:198-269`). Summing `input + output` and testing "strictly lower / equal" with floats is unsafe, e.g. `0.00005 + 0.00008`.
   - The domain catalog should store integer micro-USD per million tokens, and the parity test should convert `MODEL_PRICING` with rounding.
   - Domain cannot import `apps/ai-worker`. The parity test must live in ai-worker, importing the domain catalog, not the reverse.
3. **Atomic `update` and the `expectedUpdatedAt` token have an ABA hole.**
   - "Tenant's latest row updatedAt" regresses when `resetToDefaults` deletes the newest row, so a stale client token can match again.
   - Missing rows (a purpose with no row yet) race on the unique key, so an unguarded upsert can throw P2002 or silently overwrite.
   - Fix: take `pg_advisory_xact_lock` per tenant at the start of both mutations, the pattern in `scheduled-reports.router.ts:109-110`. Then compare a token built from `(count, max(updatedAt))`. Map P2002 to CONFLICT via `rethrowConflict` (`settings-shared.ts:34-39`).
   - The downgrade diff runs on the read inside that lock, never on a pre-transaction read.
4. **The array payload should be diffed server-side.**
   - If the web sends all six purposes, unedited ones would create rows pinned to today's tier.
   - A future change to the factory default would then no longer reach that tenant. That is silent behaviour change.
   - The router should skip purposes equal to their stored-or-default effective value: no write, no audit, no `updatedAt` bump.
   - `Frontend R2 Rule B` (changed rows only) helps, but the server must not rely on it.
5. **`resetToDefaults` must not erase `rateLimitPerMinute`.** The Data-Engineer is right (`schema.prisma:238`, field outside the page). My R2 used a blanket `deleteMany`. Adopt their delete-where-null-rate-limit plus `updateMany` null-out, in one `$transaction`. The downgrade check on reset compares the current effective model with the factory default (Domain R1 interpretation 5).
6. **Q8 metering cannot be done "in the factory" for embeddings as things stand.**
   - `EmbeddingChain` builds a module-level singleton with `createEmbeddings('free')` (`embedding.chain.ts:61`). `createEmbeddings` takes no tenant, purpose or model (`llm-factory.ts:409`).
   - Metering by tenant needs a per-call tenant-aware wrapper (tenant from ALS, as the cost listener does) and a spend record with usage from the provider, or from a token estimate when the provider returns none.
   - The singleton import-time boot-safety constraint (#238, `llm-factory.ts:333,442`) must not be broken.
   - `rag-premium` is priced input-only (`ai.config.ts:268`), `rag-free` is `$0` (`:244`), so with the free default a rag ceiling never trips. This is a fact for the UI copy: ceiling meaningful only when the embedding provider is paid.
7. **Fail-open versus the Data-Engineer's legacy-select retry.** Their retry on P2022 is sound, but the AI-specialist's "serve last cache up to 15 min" rule can leave a stale blocked state after an admin raises a ceiling during a DB error. Acceptable, but the `get` UI copy must not promise "applies within 60 s" unconditionally.

#### Edge cases
- **Month rollover.** The period is read from the clock per call, so a new `YYYY-MM` row starts at 0 with no job. The spend cache (30 s) and the 60 s config cache can hold a blocked state about a minute past midnight UTC. Document it.
- **Purpose with no row.** `get` returns effective defaults with `updatedAt: null`. Token for an empty tenant is `(0, null)`.
- **Retired pin.** Stored `modelId` absent from the catalog: `get` returns `retired: true` and the effective model falls back to the tier default (worker logs `pin_retired`). `update` must reject re-saving the dead id with a coded error, so the UI forces a choice. Under Q7 the retired current counts as downgrade, so the next pick will ask for confirm. Say so in copy.
- **Provider lacks the pin (Ollama/OpenRouter).** The API cannot know the worker's active provider, and I found no usable signal beyond `AI_PROVIDER` in `container.ts` (7 hits). `get` must not claim the pin is effective. Copy: "applies when the platform routes through the LiteLLM gateway".
- **Fallback loops.** CHECK covers primary-in-fallbacks only for explicit pins (Data R2 `...fallbackModelIds_check`). A fallback equal to the effective **default** primary slips through, so the validator needs the resolved primary from item 1.
- **Equal price is lateral.** Audit with `lateral: true`, no confirm.

#### Integration issues
- The `get` response shape differs between Frontend R2 (`rank`, `fallbackIds`, `ceilingCents`, `rows`) and my R2 (`purposes`, `fallbackModelIds`, `monthlyCostCeilingCents`). Proposal: DB and validator names `modelId`, `fallbackModelIds`, `monthlyCostCeilingCents`; the web maps to display. Under Q7, `rank` is replaced by `priceMicroPerM`, never a hand rank.
- `PurposeSpendPort` is named differently in Data R2 (`PurposeSpendRepositoryPort`, `getPurposeSpend` batch). Adopt the Data-Engineer's batch signature. `get` needs six values in one query.
- Update contract becomes one mutation (`purposes[]`, `acknowledgeDowngrade`, `expectedUpdatedAt`). My earlier per-purpose `PRECONDITION_FAILED` payload must list **all** downgrades across purposes so one confirm covers the whole save.
- Old-API safety: a new web calling `update` with the new array shape against the old API returns NOT_FOUND on the whole router, so `get` fails first and the page degrades before any write.

#### Dead-on-arrival risk
- `resolveEffectiveModelConfig` (my R2): the AI-specialist's `resolveTenantModelConfig` is the real consumer. Keep one, in domain, pure; the worker resolver calls it. Otherwise two resolvers.
- `purposeSpendPeriod`: the only caller must be the port adapter, the worker and the router. Duplicate period logic exists in `getQuotaPeriod` (`QuotaRegistry.ts:80-82`): reuse it, do not add a second UTC formatter.
- `models` catalog fields (`family`, `generation`) have no consumer under Q7. Drop `capabilityRank`, `generation`; keep family only if the UI displays it.

#### UI reachability and route conflict
- Reachable already: sidebar `agent-approvals.ts:194-199` and `AIModuleSettingsPanel.tsx:16-22` are the only two references. I did not verify settings-search or breadcrumb registration; Test-Engineer owns the count tests.
- Route conflict: AI Settings `ChainVersionEditor` also edits `model`/temperature/maxTokens per chain version (dead at runtime per exploration). A link is not enough: add a visible notice there that these values do not drive runtime, or the owner will edit the wrong page.

#### Suggestions
1. Domain: `defaultModelFor(purpose, tier)`, `effectiveModel(row)`, integer-micro pricing, drop capability ranks.
2. Router: per-tenant advisory lock, in-lock diff, server-side no-op skip, retired-id error code, `(count, max(updatedAt))` token.
3. Reset: Data-Engineer's two-step transaction.
4. Embeddings: AI-specialist to specify a tenant-aware wrapper that leaves the import-time singleton intact; `rag` gets a ceiling UI note about free providers.
5. Single naming source: validator field names are canonical.

### frontend-lead

### PG-199 Round 3 CHALLENGE (Frontend-Lead)

Paths relative to the pg-199 worktree. I accept Q7, Q8 and the atomic Save. This file is the only file written.

#### Challenges
1. **My R2 pick-time confirm is wrong for an atomic Save; move the confirm to Save.** At pick time, A to B and back to A would confirm twice for a net no-op. The downgrade is defined against the saved baseline (backend R2 computes `findDowngrades` inside the transaction against the stored row). So the web should compute `findDowngrades(snapshot, draft)` when Save is clicked and open ONE `ConfirmationDialog` (`packages/ui/src/components/confirmation-dialog.tsx:17-39`) listing every downgrade across all purposes, primary and fallback. On confirm it calls `update({ ..., acknowledgeDowngrade: true })`. At pick time the card only shows a non-modal inline note, "Lower price than saved: will ask to confirm on Save". This still satisfies Q4, because audit and confirm happen at the write.
2. **Q7 copy must say "lower price", never "weaker".** The owner accepted that llama-3.3-70b outranks gpt-4o-mini. In `MODEL_PRICING` (`apps/ai-worker/src/config/ai.config.ts:198-269`) the free/local rows are `{input:0, output:0}` (`reasoning-free`, `rag-free`), so many models tie at 0. Equal price is lateral (no confirm). The dialog text must therefore be "This model costs less per 1k tokens than the current one", and every option label shows the price, so the confirm is explainable.
3. **Retired or unknown current model.** Radix `Select` with a value that matches no item renders blank. A row whose pinned id left the catalog needs a disabled option "<id> (retired)" so the control is truthful. Per Q7 any pick from an unknown current is a downgrade, so the dialog will fire. That should be stated: "Current model is no longer offered".
4. **Spend, ceiling and month edge cases the UI must handle:**
   - Ceiling set below month-to-date spend blocks the purpose immediately. For `email`, which has no non-AI fallback (Q6), show an inline warning before Save: "Already reached: drafts stop on save".
   - Zero versus empty: empty means no ceiling, `0` means blocked now. I suggest minimum $0.01 with empty = none, and ask Domain-Expert to confirm in the validator.
   - Month rollover: the page can stay open across 00:00 UTC. Refetch on window focus, label the period "UTC", and compute "resets <first of next month>" with `timeZone: 'UTC'`.
   - `rag` runs a local $0 model by default, so its spend stays 0 and the ceiling never trips. Show "Local model: no metered cost" when the row price is 0 instead of a misleading "$0.00 of $5.00".
   - USD to cents: parse the string and use `Math.round(Number(x) * 100)` only after rejecting more than 2 decimals, otherwise float error leaks into audit values.
5. **Provider honesty.** OpenRouter picks by tier only (`llm-factory.ts:20-26`, per R1 AI-specialist) and Ollama uses one global model. The UI cannot know the active provider, so it would claim a pin that is not applied. I need `get` to return a per-row `pinHonoured: boolean` (or `provider`), and the card shows "Pinned model not applied on the current provider". If the backend cannot supply it, the page copy must say "applies when routed through LiteLLM".
6. **Fallback loops.** Changing the primary to a model already in the fallback list must show an error on the row (same superRefine rule), not silently remove the fallback (silent drop is data loss, playbook section 5 spirit). Fallback options exclude the primary and already-picked entries.
7. **Concurrency (`expectedUpdatedAt`).** Use the tenant's latest `updatedAt` from `get`. On CONFLICT, keep the draft, refetch, and show a `role=status` message with a "Reload latest" button. The seed hook must not overwrite a dirty draft (`AvailabilityContent.tsx:104-112`), and downgrades are recomputed against the new baseline. Note that a purpose with no row has `expectedUpdatedAt = null`, so a first-time Save by two admins conflicts correctly.
8. **Save payload.** Send only changed purposes. Sending all six would create six rows for a one-field edit and silently freeze defaults. Server errors have paths like `purposes.2.fallbackIds.1`; map them to fields the way `AvailabilityContent.tsx:90-96` does with `issuePathToFieldId`. The duplicate-purpose superRefine can never fire from this UI, but the test must still exist.

#### Integration issues
- `@intelliflow/domain` is imported at runtime by web (`ApprovalPoliciesContent.tsx:14`), but its `exports` map (`packages/domain/package.json:9-21`) exposes only `.` plus `./crm/*` and `./shared/*`. A new `ai/model-config` module reached through the root barrel pulls the whole domain index into the client chunk (Lighthouse, L11). Either check that tree-shaking works for `ApprovalPoliciesContent` today, or add an `./ai/*` subpath export and import from it.
- ai-worker's `MODEL_PRICING` is the Q7 source, but web cannot import ai-worker. Domain's catalog must carry the prices (Domain R2 does) with the consistency test against `MODEL_PRICING`, or the UI price drifts from the real rank.

#### Dead-on-arrival risk
- `TemperatureControl.tsx` and `FallbackList.tsx` have callers only in `PurposeCard`. For `rag` both are hidden, so they are not dead, but their tests must render a non-rag row.
- `trpc-errors.ts` has one caller, `ModelConfigContent`; fine, but if the lead drops extraction it must not leave a fourth copy.

#### UI reachability and route conflict
- Reachable today through the sidebar (`components/sidebar/configs/agent-approvals.ts:194-199`) and `AIModuleSettingsPanel.tsx:15-22`.
- `lib/shared/settings-search.ts` has `AI Chains` at `:47-55` with a "model" keyword pointing at `/agent-approvals/ai-settings`, and no model-config or approval-policies entry. The test pins 13 items (`settings-search.test.ts:15`). I recommend adding one `Model Configuration` entry and bumping the test to 14. Approval Policies is missing too; that is PG-198's gap, so file an issue rather than fix it here.
- Route conflict: `ChainVersionEditor` edits a per-version model/temperature/maxTokens that is dead at runtime (exploration `:42`) and resets temp/maxTokens on edit (`:73-75`). Users now have two places to set a "model". The Model Config header gets a link to AI Settings, and I suggest a one-line note there ("Per-version model fields do not change routing; set models in Model Configuration"). Editing `ChainVersionEditor` is out of scope; file the reset bug as an issue.

#### Suggestions
1. Confirm at Save, one combined dialog (challenge 1).
2. `get` rows add `pinHonoured`, `priceIn1k/priceOut1k` per catalog model, and `retired` handling via a model id outside the catalog.
3. Validator: ceiling minimum 1 cent, shared with the web's local validation.
4. Domain subpath export or a verified tree-shake for the client import.
5. Add the settings-search entry and bump its count test in the same commit.

### data-engineer

### PG-199 Round 3 CHALLENGE — Data-Engineer

I accept Q7, Q8 and the save contract. Nothing below re-proposes them; it challenges how they meet the data layer.

#### Challenges
1. **`expectedUpdatedAt` as "tenant's latest row updatedAt" is unsound.** The rows are `(tenantId, purpose)`-keyed with `@updatedAt` (`schema.prisma:241`) and up to six may exist.
   - `resetToDefaults` deletes rows (`R2-backend-architect.md`, Reset). After a delete, the maximum drops to an older value. A client holding that older value passes the check and silently overwrites a reset it never saw.
   - Creating a row for a previously absent purpose bumps no value the client could hold.
   - Fix: carry `expectedUpdatedAt` **per purpose** (`Date | null`, null = "I saw no row"). Inside the `$transaction`, read the edited purposes' rows and compare each. A null expectation against an existing row is a CONFLICT. A create race falls to P2002 mapped to CONFLICT via the existing `rethrowConflict` helper.
2. **Embedding spend is sub-cent, so the rag ceiling will not trip in practice.** `text-embedding-3-small` is $0.02 per million tokens (`ai.config.ts:267`), which is about 0.0002 cents per 1k tokens. Counters write only whole cents, and the sub-cent remainder lives in an in-memory `Map` (`tenant-ai-spend.ts:40-55`). Any worker restart or deploy discards it. At low volume the stored counter understates spend indefinitely, and the "really blocks" outcome from Q8 depends on that counter.
   - Fix options: (a) store per-purpose spend in a finer unit, for example hundredths of a cent ("centicents"), keeping the ceiling in cents and multiplying by 100 when comparing. INTEGER holds 2.1e9, which is $214k per month per purpose, and the ceiling CHECK already caps at $1M, so cap the ceiling at 2,000,000 cents to stay in range. (b) Keep cents and flush the carry on `SIGTERM`. (a) removes the loss for all purposes, so I recommend it and will adjust `purposeSpendKey` docs and the CHECK upper bound.
3. **Free models never accrue spend.** `MODEL_PRICING` has `{0,0}` for free aliases (`ai.config.ts:240,243`). A purpose pinned to a free model with a ceiling of 100 cents never trips. That is correct, but the UI must not imply a block is possible there. Likewise a ceiling of 0 must block even free models: the pre-call check, not spend, decides (`isCeilingReached(0, 0)` is true).
4. **Required `tier` forces a pin when only a ceiling is saved.** `tier TEXT NOT NULL` (`20260421000000_.../migration.sql:58`). Saving only a ceiling on a fresh purpose must create a row, so the router must write some tier, which then overrides future changes to the factory default. Making `tier` nullable is unsafe: the old worker reads it through the generated non-null type and its catch path would swallow the failure as a fail-open default (`tenant-ai-config.ts:130-136`), and the rollout order is migration, API, worker. Fix: keep NOT NULL, write the tier from the picked model's catalog tier, or the resolved default when no model is picked, and state in the UI copy that a saved row pins its tier.
5. **Spend cache and period.** AI-Specialist caches spend 30 s per `(tenant, purpose)` (`R2-ai-specialist.md`). If the key omits the period, the first 30 s of a new month still see last month's spend and wrongly block. The carry map also flushes the old month's remainder into the new period. Key the cache by `(tenant, purpose, period)` and compute the period at write time from the event time.
6. **Two readers of one key format.** Backend reads spend with a raw `tenantUsageCounter.findMany` in the router while the worker uses `PurposeSpendPort` (R2-backend-architect, Challenge 2). They can drift on key and period. Both must import `purposeSpendKey` and the period helper from the domain, and the router test must assert the exact key.

#### Edge cases
- **Month rollover:** a new `YYYY-MM` row appears on first write. There is no reset job, and nothing deletes old rows. Rows stay: 6 per tenant per month.
- **Purpose with no row:** the effective config is the factory default with no ceiling. `get` must still return six rows. No DB write on read.
- **Pinned model retired from the catalog:** the DB cannot validate it (no subquery in CHECK). The resolver must treat an unknown `modelId` as "use tier default" with a warn, and the UI shows it as retired. Q7 makes unknown current a downgrade, so any replacement pick requires the confirm.
- **Provider without the pinned model:** Ollama and OpenRouter need a catalog mapping per provider; if the mapping is absent, fall back to the tier default and warn. This is the worker's job, not the DB's.
- **Fallback loops:** the CHECK already forbids primary within fallbacks and over three entries (`tenant_ai_config_fallbackModelIds_check`). Duplicate fallbacks stay in Zod.
- **Concurrency:** Prisma `upsert` can race on create, so P2002 must map to CONFLICT. Counter increments are atomic (`PrismaQuotaRepository.ts:62-68`).
- **60 s cache:** raising a ceiling still takes up to 60 s for config plus up to 30 s for spend. The UI copy should say "up to two minutes".

#### Integration issues
- Prisma full-select versus old DB: the legacy-select retry in my R2 needs one named caller. It lives in the resolver (`tenant-ai-config.ts:74-137`). Without it, schema skew also drops the tier override, because `findUnique` selects all columns.
- `schema.prisma` and the generated client (`packages/db/generated/prisma/models/TenantAIConfig.ts`) must be regenerated for ai-worker and api in the same PR, or typecheck fails against stale types.
- `resetToDefaults` per `R2-backend-architect.md` says "deletes tenant rows", which also removes `rateLimitPerMinute` (`schema.prisma:237`), an override this page does not own. Use my R2 form: delete only rows with a null rate limit, update the rest.

#### Dead-on-arrival risk
- `incrementPurposeSpend`/`getPurposeSpend` (my R2) and Backend's `addSpentCents`/`getSpentCents` are the same port. Merge them into Backend's `PurposeSpendPort` with a batch read of the six purposes. Keep one name.
- `isCeilingReached` needs two callers: the factory pre-call check and the router's `blocked` flag. If either is missing, delete the function.
- The RLS migration has no runtime consumer by design. Say so in the PR so it is not read as dead code.

#### UI reachability
The sidebar item exists (`sidebar/configs/agent-approvals.ts:194-199`). The route conflict with `/agent-approvals/ai-settings` is a Frontend concern. From the data side the only link is that `ChainVersion.model` is dead at runtime, so Model Config must not claim to govern it.

#### Suggestions
1. Per-purpose `expectedUpdatedAt` map in the validator and an in-transaction compare (Challenge 1).
2. Store spend in centicents for the per-purpose keys; cap the ceiling CHECK at 2,000,000 cents; update `purposeSpendKey` docs (Challenge 2). Need AI-Specialist and Backend agreement.
3. Router writes `tier` from the picked catalog model (Challenge 4).
4. Spend cache key includes the period (Challenge 5).
5. Integration test adds: stale per-purpose update returns CONFLICT after a reset, sub-cent accumulation survives a simulated restart (if option a), and the 0-ceiling case.

### domain-expert

### PG-199 Round 3 CHALLENGE — Domain-Expert

Paths relative to the pg-199 worktree; ai-worker paths under `apps/ai-worker/src/`. My R2 rank table is withdrawn (Q7). `rounds/R2-ai-specialist.md` and `R2-backend-architect.md` still carry `capabilityRank`; it must go.

#### Re-check of my R2 rules against Q7 and Q8
Price = (input + output) USD per 1k, from `MODEL_PRICING` (`config/ai.config.ts:198-269`):

| model | price | | model | price |
|---|---|---|---|---|
| gpt-oss-20b-free | 0 | | mistral-medium | 0.004 |
| llama-3.1-8b | 0.00013 | | claude-haiku-4-5 | 0.0048 |
| gemini-2.5-flash | 0.000375 | | gpt-4o | 0.0125 |
| gpt-4o-mini | 0.00075 | | claude-sonnet-4-5 | 0.018 |
| mistral-small | 0.0008 | | llama-3.3-70b | 0.00138 |

- **The non-monotone structured tiers disappear.** Free (0.000375), standard (0.0008) and premium (0.0125) now ascend.
- **Scoring inverts.** `scoring-standard` is mistral-small (0.0008, `config.yaml:56-58`) and `scoring-premium` is gpt-4o-mini (0.00075, `:73-76`). Moving a tenant standard to premium is a "downgrade" and needs the confirm. The dialog must name models and prices, never tiers. Owner accepted the llama-70b versus 4o-mini oddity; this is the same class.
- **My `findDowngrades` rules stay** (primary vs before; new or changed fallback vs primary after; reset vs baseline; unknown current is a downgrade). Only the comparator changes.
- **ACs to amend:**
  - AC-M7..M10: "strictly lower price".
  - New AC: equal price is lateral (no confirm, still audited).
  - AC-M15: the rag row now blocks (see Q8 below).
  - Withdraw R2 Decision 2 ("not metered yet" label).
  - AC-M18 (rag lock) stays.

#### Challenges
1. **Float equality.** `0.00005 + 0.00008` is not exactly `0.00013`. "Equal price is lateral" must compare integers. Store catalog prices as integer micro-USD per 1k (`Math.round(x * 1e6)`), with a parity test against `MODEL_PRICING`. A test that pins every `MODEL_PRICING` key without a catalog route must also exist (`ai.config.ts:277` silently prices unknown keys as gpt-3.5).
2. **Domain cannot import ai-worker's `MODEL_PRICING`.** The catalog duplicates prices, and the parity test must live in ai-worker (it already depends on domain, `package.json:33`). Catalog ids map to existing pricing keys (for example haiku to `reasoning-standard`). A repricing in `MODEL_PRICING` reorders ranks silently, so the audit entry must store the from/to ids and their prices at decision time.
3. **Dead fields.** With price ranking, `capabilityRank`, `generation` and `family` have no production consumer. Drop them, or keep one only if the UI renders it.
4. **Retired pin.** Catalog is append-only (`deprecated: true`, never deleted; a snapshot test pins ids). If the worker ignored an unknown pin and fell back to the tier alias (R2-ai-specialist approach 1), that is a silent runtime downgrade, which is exactly what R2 of the owner ruling forbids. Unknown pin must keep failing visibly into the tenant's fallbacks, not to a cheaper default.
5. **LiteLLM YAML fallbacks vanish on a pin.** A no-row tenant gets free to standard fallback (`config.yaml:127-131`); a pinned `catalog-*` stanza has none. The page copy and ADR-082 must say that fallbacks are tenant-defined once pinned.

#### Q8: embeddings are harder than R2 assumed
- `getEmbeddingChain()` is a process singleton built with `createEmbeddings('free')` (`chains/embedding.chain.ts:61,371`). Its producers are queue consumers whose closures take `text` only: `ai-worker.ts:393,435`. `generateEmbedding({text})` has no tenant (`embedding.chain.ts:72`). `tenantId` exists in the contact-embed job but is dropped (`updateContactEmbedding(_prisma, contactId, _tenantId, ...)`, `:399`). Threading it needs a signature change in `EmbeddingChain`, `ContactEmbedWorker`, and `bootIngestionWorkers`; ALS (`ai-worker.ts:312`) is not set on these paths.
- **No usage is returned** by `embedQuery` / `embedDocuments` (`:82,137`). Spend must be estimated from input tokens with the local counter. State it as an estimate.
- **Pricing gap.** Production uses Gemini embeddings (`llm-factory.ts:424-433`, `gemini-embedding-001` at 1536d), which has no `MODEL_PRICING` key. It would be priced at gpt-3.5 rates (`ai.config.ts:277`), roughly 25x too high versus text-embedding-3-small. Add a catalog and pricing entry for the model actually used.
- **What the rag row shows.** The embedding model is chosen by worker env (`EMBEDDING_PROVIDER`), which the API cannot see. A tier-based display would lie. Show "platform-managed embedding model" with dimension, not a catalog name.
- **Blocked behaviour is a job problem, not a chain fallback.** `ai-worker.ts:430` shows unembedded work stays queued. A thrown ceiling error would burn BullMQ retries and dead-letter documents. For rag, jobs must be deferred (delayed retry to the next UTC month or until the ceiling rises), never failed or dropped. Retrieval queries (`rag-context.chain.ts:270` catch) need a visible "AI ceiling reached for rag" path, not a silent empty result.
- Sub-cent embeddings: a 1-cent ceiling is about 500k text-embedding-3-small tokens. The existing carry (`tenant-ai-spend.ts:40-55`) is lost on restart; accept and disclose.

#### Edge cases
- **Month rollover.** Period must be computed at check and at record time; a spend cache (AI-Specialist 30 s) keyed without the period carries last month's value across midnight UTC. Include the period in the cache key; test 31 Oct 23:59:59 versus 1 Nov 00:00:00 with fake timers.
- **Ceiling lowered below spend** blocks within 60 s plus cache; raised, unblocks likewise. The page's `blocked` flag (API read of counters) can disagree with the worker for about 90 s. Copy: "may take up to 90 seconds".
- **No row.** `get` returns baseline defaults and `updatedAt: null`; saving all six creates rows. Reset on no rows is a no-op (not an error, no audit entry).
- **Provider without the pinned model.** In production the worker runs OpenRouter by default (`llm-factory.ts:297-318`), whose model is tier/env-selected (`:20-26`), not the YAML alias. A pin without an OpenRouter mapping falls back to env default; the page would show a model that is not running. Unmapped pins need a per-process warn log, plus a visible "pin not available on this provider" note (worker-visible only; flag as a follow-up if the API cannot know).
- **Fallback loops** cannot occur (<= 3, unique, not the primary), but a fallback priced below the primary triggers the confirm on nearly every sensible config. One acknowledge covers the whole batch.

#### Integration issues
- Two resolver names for one concept: `resolveEffectiveModelConfig` (`R2-backend-architect.md`) versus `resolveTenantModelConfig` (`R2-ai-specialist.md`). Make the pure domain function the single comparator and the worker function the I/O wrapper; the router and web call only the domain one.
- Data's CHECK `"modelId" = ANY("fallbackModelIds")` passes when `modelId` is NULL (three-valued logic), so a no-pin row can list the tier default as a fallback. Zod/domain must reject a fallback equal to the effective model.
- `ceiling BETWEEN 0 AND 100000000` (Data) versus my 10,000,000 cents: use one constant in domain.

#### Dead-on-arrival check
`isDowngrade` is called only inside `findDowngrades`; fine. `PurposeSpendPort.getSpentCents` has a worker consumer; the API reads Prisma directly, so do not export it to the router. Anything catalog-only (family, generation, `capabilityRank`) is dead (Challenge 3).

#### UI reachability and route conflict
Reachable already: `sidebar/configs/agent-approvals.ts:194-199`, `AIModuleSettingsPanel.tsx:16-22`, `navigation-reachability-audit.md:184`; no sidebar change. `ChainVersionEditor.tsx:68-85` also edits a free-text "model" (dead at runtime). Two "model" fields in one product confuses admins: add a short link and copy on both pages, and file the follow-up.

#### Suggestions
1. Integer micro-USD prices plus parity test; store prices in audit entries.
2. Remove rank/generation/family fields.
3. Retired pins: keep honoring, fail into fallbacks, never fall to cheaper default.
4. rag: tenant-thread the embedding path; defer jobs at ceiling; add the Gemini embedding price key; display "platform-managed".
5. Period-keyed spend cache; one audit entry per update (including lateral) and per reset.

### test-engineer

### PG-199 Round 3 CHALLENGE (Test-Engineer)

Paths relative to the pg-199 worktree. Read: all R2 files, R3 brief, ruling Q1-Q8.

#### Challenges

1. **Price ranking (Q7) has a flat region that makes the confirm untestable as specified.** `MODEL_PRICING` has `reasoning-free` and `rag-free` at `{0,0}` (`apps/ai-worker/src/config/ai.config.ts:239-244`) and `ollama` at 0 (`:225`). Several different free models therefore tie, so `isDowngrade` returns lateral for a real capability drop (any free-to-free swap), and any move from a paid model to a free one is a downgrade. That is the owner's accepted consequence, but the test table must pin it: free to free is lateral and audited; paid to free is a downgrade; free to paid is not.
2. **The domain package cannot import `MODEL_PRICING`** (it lives in ai-worker, `ai.config.ts:198`). Either the catalog carries a copied price (needs a parity test in ai-worker comparing catalog to `MODEL_PRICING`), or the table moves to domain. A silent drift defeats the Never-Downgrade rule, so parity is mandatory. Also, the pricing keys are logical aliases (`scoring-free`), not catalog model ids (`:213-269`); the test must map catalog id to alias and fail on a missing mapping.
3. **"Unknown or retired current model is a downgrade" contradicts my R2 test** (`isDowngrade` unknown current returns false). Superseded: with the brief's rule, a retired pin makes every pick, including the top model, require a confirm. I will test it, but the UI test must also confirm that Reset-to-defaults on a retired pin shows a clear message rather than a blocked Save.
4. **`calculateCost` silently prices unknown models as gpt-3.5** (`ai.config.ts:277`). With Q8, a Gemini embedding (`llm-factory.ts:424-433`) has no pricing entry, so rag spend would be wrong, not zero. Test: every model the factory can produce, including the Gemini embedding id, has a pricing entry (a table-driven test over the catalog).
5. **Q8 metering of embeddings is hard to test and may not produce tokens.** `createEmbeddings` is synchronous with no tenant (`llm-factory.ts:409`), and `EmbeddingChain` builds it once in its constructor with `'free'` (`embedding.chain.ts:61`). So metering in the factory needs a wrapper around `embedDocuments`/`embedQuery`. `GeminiEmbeddings` is a custom adapter, so I need to verify it returns usage; otherwise token counts are estimates (`countTokens`). Tests: wrapped embeddings add cents under `rag`; tenant comes from ALS; a ceiling reached error is thrown before the network call; an existing singleton `EmbeddingChain` without a tenant does not meter (no ALS) and must not throw.
6. **Where spend is recorded is still disputed.** AI-specialist R2 records in `wrapModelWithTracing` plus the listener (`R2-ai-specialist.md:28-31`); the brief says "in the factory". Two recording sites double count. Needs one test asserting a single `addSpentCents` per call for chat and for embeddings.
7. **Ceiling is checked pre-call but spend lands post-call**, so a test with the clock and concurrent calls can overshoot by one call. Assert and document it as a soft limit rather than a hard guarantee.
8. **Tests that mock `llm-factory` will break silently, not loudly.** Mocks in `base.agent.test.ts:15` and `summarize-conversation.job.test.ts:41` only define `createLLM`. A missing `createLLMForTenant` becomes `undefined is not a function` inside a try/catch in some callers, so a test can pass while the real path is skipped. Add assertions on the call, not only on the result.

#### Edge cases (what I will test)

- Month rollover: spend at `2026-10-31T23:59:59.999Z` counts to October, at `2026-11-01T00:00:00.000Z` starts a new period; the cache must not carry October's "ceiling reached" into November (60 s cache, `tenant-ai-config.ts:37-43`). Test with advanceTimersByTime across the boundary.
- Purpose with no row: defaults, no ceiling, no throw.
- Pinned model retired from catalog: `get` still returns it flagged; worker falls back to tier default with a logged reason.
- Provider without the pinned model (Ollama, OpenRouter): factory test that an unsupported pin falls back to the tier model, with a warn, rather than a 404 at call time.
- Fallback loops: primary in fallbacks, duplicates and A to B to A are rejected by the validator; the worker chain terminates after the cap even with a hand-written DB row.
- Concurrency: `expectedUpdatedAt` mismatch returns CONFLICT with zero writes; two admins saving simultaneously, only one wins.
- Fail-open scope per the brief: P2021/P2022 only gives no ceiling and a warn; other DB errors return the last cached value, else fail open with a warn. Test all three, plus that a cached value is not overwritten by the error path.

#### Integration issues

- `executeRaw` period key: API reads `tenant_usage_counters` (`QuotaRegistry.ts:13-20`) while the worker writes it; the integration test must write via the worker repository and read via the router's `get`.
- Atomic `update` with page-level Save: partial failure inside `$transaction` must roll back all purposes (test with `failTx` on the second upsert).
- The shared `settings-shared.ts` admin check is used by approval-policies too; run those tests.

#### Dead-on-arrival risk

- `findDowngrades` is used by the router and the web; both need a test through their own caller, not only the unit.
- `trpc-errors.ts` extract: unless three existing copies are migrated, it is a 4th copy in effect. Test that old callers import it.
- `PurposeSpendPort.getSpentCents`: the web "used this month" display needs a procedure; if `get` does not return it, the port has a reader only in the worker. Confirm in tests that `get` returns spend per purpose.

#### UI reachability and route conflict

- Reachable via `sidebar/configs/agent-approvals.ts:194-199` and `AIModuleSettingsPanel.tsx`. A sidebar-config test must assert the href, and the settings-search test (`apps/web/src/lib/shared/__tests__/settings-search.test.ts`) must be checked: no entry for model-config exists today (grep of `apps/web/src/lib/shared/settings-search.ts` finds 0 matches), so either add one and move the count, or state it is out of scope.
- AI Settings `ChainVersionEditor` still edits a dead `model` field; a test should assert Model Config shows a link to it and does not duplicate the control.

#### Suggestions

1. Add a catalog-to-`MODEL_PRICING` parity test and a table-driven downgrade matrix including the free-tier ties.
2. Record spend in exactly one place; test single-increment.
3. Wrap embeddings with an explicit tenant argument rather than ALS only, so the singleton `EmbeddingChain` path is deliberate.
4. Add `settings-search` coverage or an explicit exclusion note.
5. Every wiring test asserts the tenant-aware factory was called (not just "result is fine").

## Round 4 — CONSENSUS

### Lead: R4-resolutions.md

### PG-199 Round 4 CONSENSUS — lead's resolutions of the Round 3 challenges

This is the draft the spec will be built from. Vote on it. Owner rulings Q1–Q8 and the runner
constraints in PG-199-owner-ruling.md are fixed inputs, not votable.

#### Domain (`packages/domain/src/ai/model-config/`, zero infra deps)

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

#### Data (migrations 20261019120000 + 20261019120100)

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

#### API (`apps/api/src/modules/agent/model-config.router.ts`)

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

#### ai-worker

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

#### Web (`apps/web/src/app/agent-approvals/model-config/`)

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

#### Docs / registries

- **D29** ADR-082 → Accepted (option 2, with D1/D2/D15/D16/D19 consequences, ADR-048 amended);
  PRD addendum PG-199 (ACs + toggle table "none"); page-registry entry; PAGE_MAP task column;
  sitemap "Implemented" made true; nav-reachability row; ui-flow-mapping 70→71 routers and
  procedures +3 with the reconciliation tests; dependency-chain diagrams gain PG-199; CSV ARTIFACT
  path → `modules/agent/model-config.router.ts` (R1) + split regen with _I/_J reconciled.

#### Follow-up issues to file (not in scope)

ChainVersion.model dead at runtime; ChainVersionEditor resets temperature/maxTokens; approval-policies
missing from settings-search; `tenant_tool_enablement`/`tenant_memory_policy` RLS enabled with no policy;
`sentiment.chain.ts:341` rate-limit purpose mismatch.

---

### Amendments after CONSENSUS round 1 (5 APPROVED / 1 REJECTED)

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

### ai-specialist

APPROVED

### PG-199 Round 4 CONSENSUS: AI-Specialist

Paths under `apps/ai-worker/src/` unless noted.

#### Agreement
I support D1, D2, D4-D7, D9-D14, D17-D21 and D23-D29 as written.
- D8: the unit holds. `aiSpendCentiCents` max is about 2.1e9 and the ceiling cap of 2,000,000 cents is 2e8 centicents, in range. The recorder carry (`utils/tenant-ai-spend.ts:40-55`) must be converted to centicents with the same per-`(tenant, purpose)` structure.
- D3: the `DEFAULT_MODEL` table from the YAML aliases (`infra/litellm/config.yaml:11-117`) is the correct baseline.
- D18: single-site metering matches the code. Chat has no other recorder than the two being deleted (`agents/base.agent.ts:694`, `chains/insight-generation.chain.ts:362`). The scoring chain's `TokenUsageCallbackHandler` (`chains/scoring.chain.ts:48,213`) is monitoring only and stays.

#### Modifications
1. **D22, deferral mechanics (important).**
   - Both embedding workers use BullMQ `attempts: 3` with exponential 5 s backoff (`workers/contact-embed-worker.ts:73-74`, `workers/ingestion-workers.ts:335-336`). Throwing the ceiling error would exhaust the attempts in about 15 s and dead-letter the job.
   - "Deferred" must be implemented as `job.moveToDelayed(Date.now() + DEFER_MS, token)` followed by `throw new DelayedError()`, which does not consume an attempt. Use a delay such as 15 min, never past the end of the period.
   - The ingestion handlers swallow embedding errors in try/catch (`ingestion-workers.ts:193-195,265-267`). The ceiling error (identified by `code`) must be rethrown from there, or rag-blocked documents silently ship without embeddings.
   - `generateEmbedding` wraps all errors (`chains/embedding.chain.ts:113-116`). Preserve the code on the wrapper: copy `code` from `cause`, or let the ceiling error pass through unwrapped.
   - Add a test per worker: at ceiling, the job is delayed, not failed, and no attempt is consumed.
2. **D15, breaker key.**
   - `getLLMBreaker(purpose, tier)` is called by jobs that know nothing of pins (`jobs/prediction.job.ts:569,720,820`, `jobs/scoring.job.ts:291`). Do not change its signature.
   - Add the model id to the breaker used inside the fallback wrapper, keyed `provider:modelId`, and leave the existing job-level breakers on alias keys.
3. **D3, baseline on OpenRouter.** Production runs on OpenRouter, where every tier resolves to `openRouterModelForTier` (`lib/llm-factory.ts:20-26`, default `gpt-oss-120b:free`), not the YAML alias. The downgrade baseline stays the YAML table (provider-independent, per Q7), but ADR-082 and the confirm copy should say that prices compare catalog models, not what a provider currently serves.
4. **D16, test first.** The structured-output fallback test must cover three paths: `BaseAgent` subclasses (`agents/email-writer.agent.ts:79`), a chain (`chains/case-insight.chain.ts:61`), and a plain `invoke` (the summary job). It should record which model served the call.
5. **D18, wrapper order.** The fallback wrapper must sit outside the tracing wrapper, so each attempt (primary and fallbacks) is traced and metered once under the model that actually served it. Add a test for a failed primary: no spend for the failed attempt, one record for the fallback.
6. **D19, ceiling error and the API.** The error mapping to the page is Backend's. The worker side must expose `code`, `purpose`, `ceilingCents`, `spentCents` as plain properties so job results and logs can carry them.
7. **D22, Gemini price.** Production embeddings use Gemini (`lib/llm-factory.ts:424-433`). The catalog entry needs a verified price. If it cannot be verified during exec, record NEEDS_HUMAN rather than a guess; an unpriced rag ceiling would be inert.

#### Sign-off
Approved from the ai-worker routing lens, subject to the modifications above being reflected in the spec (1 and 2 are required for correctness; 3-7 are clarifications).

#### Final Notes
- Rollout order stays migrate, API, worker. Until the worker is deployed, nothing is enforced; page copy must not claim otherwise.
- The 21 existing `createLLMForTenant` call sites get pins, ceilings and fallbacks without code changes, because the logic lives in the factory.

#### Files Verified
- `lib/llm-factory.ts` (20-26, 153, 196-211, 256-354, 380-398, 409-464)
- `lib/tenant-ai-config.ts` (74-137)
- `tracing/llm-tracer.ts` (27-30, 41-88, 103-160)
- `utils/tenant-ai-spend.ts` (35-64); `utils/cost-tracker.ts`
- `agents/base.agent.ts` (164, 685-703); `agents/email-writer.agent.ts:79`
- `chains/embedding.chain.ts` (61, 72-118, 371-373); `chains/insight-generation.chain.ts` (359-368); `chains/scoring.chain.ts` (48, 213)
- `workers/contact-embed-worker.ts` (23, 73-74, 156); `workers/ingestion-workers.ts` (45, 193-195, 335-336)
- `jobs/prediction.job.ts`, `jobs/scoring.job.ts`, `ai-worker.ts` (310-322, 388-439, 1038)
- `infra/litellm/config.yaml` (11-117, 127-131)

#### Round 2 vote
APPROVED

Verified against code. Three non-critical modifications:

1. **A1, resolver and callers.** The 21 `createLLMForTenant` call sites pass their own defaults (for example `chains/sentiment.chain.ts:236` free vs `shared/enrichment-adapter.ts:124` standard; `chains/auto-response.chain.ts:174` free vs `contact-reply-draft.chain.ts:107` standard), so `row.tier ?? callerDefaultTier` in `lib/tenant-ai-config.ts:120` preserves every caller's model. `chains/scoring.chain.ts:179-183` calls `resolveEffectiveTier` first and passes `resolved.tier` on; with a null stored tier it receives the caller default, which is correct. Keep `VALID_TIERS` handling at `:106` for non-null invalid values only, and treat null as "no tier override" without the invalid-tier warning.
2. **A1, old-worker skew window.** An old worker with a non-null `tier` in its generated client will throw on a NULL column (Prisma conversion error). It is caught by the blanket catch at `:130-136`, which does not cache, so those tenants cause one DB query and one warn per call until the worker is upgraded. It is fail-open and correct, only noisy. Rollout order migrate, API, worker narrows the window. The router could also avoid creating NULL-tier rows until the worker version is confirmed, but I do not require that.
3. **A5, delay target.** "Until the next UTC month" strands jobs if an admin raises the ceiling mid-month. Use a bounded recheck delay (for example 1 h, capped at the period end) and re-evaluate the ceiling on each wake. `moveToDelayed` needs the worker `token`, so the handler signatures in `workers/contact-embed-worker.ts` and `workers/ingestion-workers.ts:344,358` must be extended to pass it. The ingestion handlers must rethrow the ceiling error (`ingestion-workers.ts:193-195,265-267` currently swallow).

A7 is consistent with the code: `agents/next-best-action.agent.ts` has no `withStructuredOutput` call (the other three agents do, at `email-writer.agent.ts:79`, `followup.agent.ts:78`, `qualification.agent.ts:88`).

### backend-architect

REJECTED: D3/D6 assume one BASELINE_TIER per purpose, but callers of createLLMForTenant pass different default tiers for the same purpose, so writing a row with tier = BASELINE_TIER silently changes (and can downgrade) other callers' models.

#### Agreement
I support D1, D2 (with the integer-micro rule already in D1), D4, D7, D9, D10, D12, D13, D14, D15-D23, D24-D29 as written. D11's advisory lock, per-purpose `expected`, no-op skip, in-lock downgrade diff and P2002 mapping match my R3 asks (`scheduled-reports.router.ts:109-110`, `settings-shared.ts:34-39`). D12 keeps `rateLimitPerMinute` rows alive, as the Data-Engineer required (`schema.prisma:238`).

#### The blocking problem (D3, D6)
- `resolveEffectiveTier(tenantId, purpose, defaultTier)` takes the **caller's** default (`tenant-ai-config.ts:74-78`), and a row's `tier` overrides it for every caller of that purpose (`:120-129`).
- Callers disagree on the default tier within one purpose (all in `apps/ai-worker/src`):
  - `structured`: `free` in `chains/sentiment.chain.ts:236`, `chains/ticket-routing.chain.ts:178`, `contact-tag-suggestion.chain.ts:80`, `account-tag-suggestion.chain.ts:74`; `standard` in `shared/enrichment-adapter.ts:124,154` and `account-industry-inference.chain.ts:77`.
  - `scoring`: `free` in `chains/churn-risk.chain.ts:318`; `standard` in `account-scoring.chain.ts:73`.
  - `email`: `free` in `chains/auto-response.chain.ts:174`; `standard` in `contact-reply-draft.chain.ts:107`.
- So there is no single `BASELINE_TIER[purpose]`. If the router writes `tier = BASELINE_TIER` when it creates a row (D6), then saving only a ceiling or temperature for `structured` would move either the enrichment callers from standard to free (a silent downgrade, against R2/Never-Downgrade) or the tagging callers from free to standard (silent spend increase). The server-side downgrade check cannot see it, because D3 compares against one table entry.
- Effective model for a no-row tenant is therefore caller-dependent, so D3's `effectiveModel(purpose, tier, null)` is ill-defined for those three purposes.

#### Modifications (concrete)
1. **Make `tier` nullable** in migration `20261019120000`: `ALTER TABLE "tenant_ai_config" ALTER COLUMN "tier" DROP NOT NULL;` (metadata-only; `schema.prisma:235` `String?`). NULL means "each caller's own default". The router never writes a tier from the page (D6 already says tier is not edited), so a new row carries `tier = NULL` unless a legacy row exists.
   - Old worker against a NULL tier: `VALID_TIERS.has(row.tier)` fails and it falls back to the caller default with a warn (`tenant-ai-config.ts:106-118`). That is the correct behaviour, but it logs once per 60 s per purpose. Say so in the skew notes, or accept the noise during the short skew window.
   - Update the CHECK to `"tier" IS NULL OR "tier" IN (...)`.
   - New worker resolver: `tier = row.tier ?? callerDefault`.
2. **Replace `BASELINE_TIER` with `CALLER_DEFAULT_TIERS[purpose]`** in domain: the set of default tiers callers use (`structured {free,standard}`, `scoring {free,standard}`, `email {free,standard}`, `qualification {standard}`, `reasoning {free}`, `rag {free}`). A parity test greps the ai-worker call sites so the table cannot drift.
3. **D3 comparison for an unpinned current model:** treat the current price as the **maximum** price of `DEFAULT_MODEL[purpose][t]` over `t in CALLER_DEFAULT_TIERS[purpose]`. A pick strictly below that maximum asks for the confirm. This is conservative (toward confirm) and consistent with D2's rule for unknown models. Copy: "lower price than the model some features use today".
4. **D12 reset:** the downgrade check vs baseline uses the same maximum-price rule. Resetting a pinned model to "caller defaults" lowers price whenever the pin outranks that maximum.
5. **D8 overflow:** `tenant_usage_counters.value` is INTEGER (Data R2). With no ceiling set (null) a purpose can exceed 2,147,483,647 centi-cents. Use `LEAST(value + by, 2147483647)` in the adapter's `ON CONFLICT` update, or the increment errors and the carry never drains. The ceiling compare stays valid because the cap exceeds the 2,000,000-cent ceiling x 100.
6. **D5 subpath export:** `packages/domain/tsup.config.ts:4` has `entry: ['src/index.ts']` only. A `./ai/*` export pointing at `dist/ai/*.mjs` would resolve to nothing, as the existing `./crm/*` pattern suggests it may not today. Either add a `src/ai/model-config/index.ts` entry and the matching `exports` map, or take D5's measured tree-shake exception. Decide in exec with a build check, not by assumption.
7. **D27:** `settings-search.ts` exists and its test asserts `toHaveLength(13)` (`__tests__/settings-search*.test.ts:15`). The bump to 14 is correct; also check the category count (4, line 39) is unaffected by the new entry's category.

#### Sign-off
Rejected only for the D3/D6 tier defect, which is code-evidenced and breaks Never-Downgrade. With Modifications 1-4 applied I would approve without further changes. Items 5-7 are non-blocking.

#### Final Notes
- Rollout order stays migration, API, worker, web. The `tier` DROP NOT NULL is the one change that touches existing-column semantics, but it is a loosening and Class A.
- `get` must show `tier`-derived defaults as "per feature default" for the three split purposes rather than naming one model, since no single default exists.
- I did not verify that `prismaWithTenant` exposes `tenantUsageCounter` in the API (no existing API usage found by grep). The Data-Engineer or exec should confirm D14 against the real tenant-scoped client before relying on it. If it is missing, the read goes through `ctx.prisma` with explicit `tenantId`.

#### Files Verified
- `apps/ai-worker/src/lib/tenant-ai-config.ts:74-137`; `llm-factory.ts:380-398`
- Call sites listed above (`createLLMForTenant` defaults), via grep of `apps/ai-worker/src`
- `apps/api/src/modules/analytics/scheduled-reports.router.ts:109-110`; `apps/api/src/modules/agent/settings-shared.ts:34-39`
- `packages/db/prisma/schema.prisma:231-248`
- `packages/domain/package.json` exports; `packages/domain/tsup.config.ts:4`
- `apps/web/src/lib/shared/settings-search.ts` and its test (`toHaveLength(13)`)
- `.specify/.../rounds/R4-resolutions.md` D1-D29; `R2-data-engineer.md`, `R3-brief.md`

#### Round 2 vote
APPROVED

- A1 resolves my blocker: nullable `tier` with `row.tier ?? callerDefaultTier`, `CALLER_DEFAULT_TIERS[purpose]`, and the unpinned current model compared against the maximum caller-default price. The call-site evidence it cites matches what I found (`sentiment.chain.ts:236`, `enrichment-adapter.ts:124`, `churn-risk.chain.ts:318`, `account-scoring.chain.ts:73`, `auto-response.chain.ts:174`, `contact-reply-draft.chain.ts:107`).
- A2 is correct and a catch I missed: `getQuotaPeriod` returns `'all'` for non-monthly keys, so the guard test per purpose is needed.
- A3 (keep the root import, add a tsup entry only if growth is measured), A4 (reset nulls `tier` too), A6 (clamp at INT max) and the D27 count bump match my Modifications 5-7.
- One note for exec, not a condition: the old-worker skew in A1 is slightly wider than described. Against a NULL `tier`, the old worker's `findUnique` selects every column (`tenant-ai-config.ts:90`) and the generated client types `tier` as required. If Prisma throws on the null conversion, the whole `resolveEffectiveTier` call lands in the catch at `:130-136`, so the caller default applies and that purpose's temperature and max-tokens overrides are also ignored during the skew window. `resolveRateLimit` is unaffected because it selects only `rateLimitPerMinute` (`:176-179`). The behaviour is still the intended one, but add a skew test that asserts the fallback, and note it in the rollout copy.

### frontend-lead

APPROVED

### PG-199 Round 4 CONSENSUS (Frontend-Lead)

#### Agreement
I support D1 to D4, D6 to D14 and D24 to D29 as written from the web lens, and take D15 to D23 as the owners' (ai-worker, API, data) calls. Points where my lens is directly exercised:
- **D25** matches my R3 challenge 1 (one combined confirm at Save, computed from `findDowngrades(snapshot, draft)`), and the changed-only payload from challenge 8.
- **D2 and D26:** price-only wording ("lower price") and the disabled "(retired)" option are what I asked for.
- **D10:** `retired`, `locked`, `spentCents|null`, `onOpenRouter` in `get` give the UI everything it needs to avoid claiming an unapplied pin. This replaces my requested `pinHonoured`.
- **D3:** because `get` returns EFFECTIVE config, a first save from defaults resolves through the table in the web as well, so the unknown-model rule does not fire spuriously.
- **D26 migration of the existing `errorCode` copies** is acceptable, with the caveat below.
- **D27:** adding the settings-search entry and bumping 13 to 14 is right.
- **D28:** N/A items are correct. There is no Boolean on the page, no tags card, and rows are keyed by purpose.

#### Modifications (non-critical)
1. **D5 needs build work it does not mention.** `packages/domain/tsup.config.ts:4` builds `entry: ['src/index.ts']` only, so the existing `./crm/*` and `./shared/*` exports (`packages/domain/package.json:15-26`) point at files tsup never emits, and no code imports a domain subpath (grep found none outside `dist`). An `./ai/*` export alone would be dead. Meanwhile `apps/web/next.config.js:58-62` already lists `@intelliflow/domain` under `optimizePackageImports`, which handles barrel tree-shaking, and `ApprovalPoliciesContent.tsx:14` already imports a runtime constant from the root. So D5's own escape clause applies. Recommendation: keep the root import, and verify with a measured build (the 4-validation `pnpm build` output for the route's First Load JS). Only add the subpath if that measurement shows growth, in which case it must also add a tsup entry (for example `'ai/model-config/index'`) and check the vitest alias (`vitest.config.ts:31` maps the package root to `src`, so a subpath resolves in tests only).
2. **D26 migration of old copies:** `CaseTypesContent.tsx:27` and `ContactTypesContent.tsx:28` export `errorCode`, and their tests import it (`CaseTypesContent.test.tsx:95,346-351`, `ContactTypesContent.test.tsx:89,328-330`). Migrating must keep a re-export (or move those assertions to a `trpc-errors.test.ts`) so the existing tests do not break. `AvailabilityContent.tsx:60` is private. The three `errorMessage` copies have differing fallback strings (`ApprovalPoliciesContent.tsx:45` "Please try again."); the shared helper should take an optional fallback.
3. **D25 and D11 contract:** the web must send `expected` as a Record for the changed purposes only, taken from each row's `updatedAt` in `get` (null for no row). It must omit `acknowledgeDowngrade` unless true (old-API rule). On `PRECONDITION_FAILED` with `DOWNGRADE_UNCONFIRMED` the web should treat it as a stale-baseline signal: re-open the dialog from the server's `downgrades[]` rather than failing silently.
4. **D8 unit:** `get` returns `spentCents`, but storage is centi-cents. State in the interface comment that the API converts, so the web never divides.
5. **D26 "$0 blocks AI" and D4 `0 = block`:** the ceiling field must distinguish empty (no ceiling) from `0`. The web `Input` therefore parses to `null` only for the empty string, never via `Number('')` (which gives 0).

#### Sign-off
APPROVED, with Modifications 1 to 5 recorded for the plan. No critical issue found.

#### Final Notes
- Lighthouse risk is low: server shell plus skeleton, no new dependency (`next.config.js:58-62` covers barrel imports).
- The page needs `lighthouserc.authenticated.js` coverage; per D28 report NEEDS_HUMAN rather than fake it.
- Web test list for the plan: dirty/seed hook, combined downgrade dialog (multiple purposes, primary and fallback), CONFLICT keeps draft, calm NOT_FOUND `role=status`, retired option, ceiling-below-spend warning, `0` versus empty, rag locked row, email blocked state, fallback reorder live-region announcement.

#### Files Verified
- `.specify/sprints/sprint-18/context/PG-199/rounds/R4-resolutions.md` (D1 to D29)
- `packages/domain/tsup.config.ts:4`, `packages/domain/package.json:9-26`
- `apps/web/next.config.js:52-70`, `vitest.config.ts:31`
- `apps/web/src/app/cases/(list)/case-types/CaseTypesContent.tsx:25-34` and its test `:95,346-351`
- `apps/web/src/app/contacts/(list)/contact-types/__tests__/ContactTypesContent.test.tsx:89,328-330`
- `apps/web/src/lib/shared/__tests__/settings-search.test.ts:13-15`
- `apps/web/src/app/agent-approvals/approval-policies/ApprovalPoliciesContent.tsx:14,45`

#### Round 2 vote
APPROVED

Reviewed the "Amendments" section of `R4-resolutions.md` (A1 to A8). A3 and A8 match what I proposed. A2, A4 to A7 are outside the web lens and I have no objection. A1 does not change the page's contract with the user, because the page never edits `tier`; it does change two things the web must handle, recorded here as non-critical notes for the plan:

1. **Unpinned rows have no single "current model" (A1).** A row with `modelId = null` can resolve to different models per caller (`CALLER_DEFAULT_TIERS[purpose]`). The model `Select` therefore needs an explicit first option "Default (varies by feature)" with value `null`, and the card should show the range of default models and prices, not one model. `get` should return per row `defaultModelIds` (the set of caller-default models) or a `defaultMaxPriceMicroUsd`, or the web must import `CALLER_DEFAULT_TIERS` and `DEFAULT_MODEL` from domain. I prefer importing them from domain, so the client `findDowngrades(snapshot, draft)` uses the same max-price rule as the server (A1) and the confirm cannot disagree with the server check.
2. **Picking "Default" is itself a comparison.** Going from a pinned model to `null` compares the pinned price with the unpinned side, and `findDowngrades` must define it (the server rule decides it). The dialog text for that case must say "Use each feature's default model" and list the models, not a single price.
3. **`DEFAULT_MODEL` is partial (no `rag-standard`).** The rag row never offers a pin (locked, Q5), so the web must not index `DEFAULT_MODEL[rag][standard]`. The lookup helper should return `undefined` safely and the rag card should read "platform-managed embedding model" (D22).
4. **Tier is never in the payload.** `buildUpdateInput` must not include `tier`, and the draft/normalize comparator must ignore it, so a NULL tier cannot make a row look dirty.

### data-engineer

APPROVED

#### Agreement
I support D1-D5 (nothing in them touches storage beyond the shared constants), D6, D7, D8, D9, D10, D11, D12, D13, D14, D18-D20 and D22 as written, with the modifications below. D21, D23 and D24-D29 are outside my lens and I have no objection.
- D6 and D7 match my R2 migrations. The `tier NOT NULL` decision agrees with my R3 challenge 4 (`20260421000000_feat_agent_system_tenant_customization/migration.sql:58`).
- D8 adopts my R3 centicent proposal. The 2,000,000-cent ceiling cap times 100 is 2e8, inside INTEGER (2.147e9).
- D9: the P2021/P2022 retry has a working precedent in the same repo, `apps/api/src/modules/calendar/availability-enforcement.ts:33` (`MISSING_SCHEMA_CODES`), so error-code handling is an established pattern.
- D11: the advisory lock exists at `apps/api/src/modules/analytics/scheduled-reports.router.ts:110` (`pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`). It closes the create race, so P2002 becomes a residual safety net, not the main guard.

#### Modifications
1. **D12, reset leaves stale values.** "Null-out PG-199 columns on the rest" is ambiguous. State it exactly: for retained rows (those with `rateLimitPerMinute` set) set `modelId = NULL`, `fallbackModelIds = '{}'`, `monthlyCostCeilingCents = NULL`, `temperature = NULL`, `maxTokens = NULL` and `tier = BASELINE_TIER[purpose]`. Otherwise a retained row keeps an old tier and the page would claim "defaults" while the worker still uses it (`tenant-ai-config.ts:93-97` reads `row.tier`). `tier` is NOT NULL (`...migration.sql:58`), so it is set, not nulled.
2. **D6, add a non-blank guard.** `modelId TEXT` has no length bound. Add `CHECK ("modelId" IS NULL OR (btrim("modelId") <> '' AND char_length("modelId") <= 100))`, named `tenant_ai_config_modelId_check`. The primary-not-in-fallbacks CHECK only sees the stored `modelId`. When `modelId` is NULL it passes vacuously, so D11's validator (effective primary) stays the real guard. Say so in the migration header.
3. **D6, keep validation of existing rows.** Add the CHECKs `NOT VALID` then `VALIDATE` in the same migration, with the pre-check SELECT in the header, as in my R2. `purpose`, `tier`, `temperature` and `maxTokens` are unconstrained today (`schema.prisma:233-238`), and `tenant-ai-config.ts:93` shows the code already defends against a bad tier. The rehearsal (projects-64) must run the pre-check.
4. **D8, counter overflow.** `value INTEGER` plus the adapter's `value + by` (`PrismaQuotaRepository.ts:66`) errors past 2,147,483,647. In the new adapter use `LEAST(tenant_usage_counters."value"::bigint + ${by}, 2147483647)::int` in the `DO UPDATE`, so a runaway purpose saturates instead of raising on every call. Document that $214k per purpose per month is the saturation point. Also name the key constant once in the domain and use it in the router (D14) and the worker. D14 must divide centicents by 100 for `spentCents`.
5. **D11, lock key.** Use a namespaced key, `model-config:${tenantId}`, so it cannot collide with the scheduled-reports lock (`scheduled-reports.router.ts:110` hashes its own key). Both `update` and `resetToDefaults` take it first.
6. **D4, upper bound versus stored data.** The CHECK allows `maxTokens` above 32768 while Zod caps it (D4). A row written earlier with a larger value would be rejected when its card is changed. The page should display it and offer clamping, and the server error should name the field. This is not a migration problem.
7. **Prisma version correction (mine).** My R1 and R2 cited "Prisma 5.22" from `packages/db/CLAUDE.md`. `packages/db/package.json:57-64` says `@prisma/client` and `prisma` ^7.8.0, and `@prisma/adapter-pg@7.8.0` maps PG `42703` to `ColumnNotFound` (`adapter-pg/dist`, line 522). So `String[] @default([])` and the P2022 mapping apply under 7.8. The exec step should confirm that a genuine missing-column error from the live adapter surfaces as `P2022`, with one unit test using the real error shape, not only a mocked code.
8. **Integration test addition.** Beyond my R3 list: re-saving with `expected` null against a rate-limit-only row returns CONFLICT; `resetToDefaults` leaves a rate-limit row with `tier = BASELINE_TIER` and all PG-199 columns cleared; and the counter saturates at 2147483647 without error.

#### Sign-off
APPROVED from the data lens, conditional on modifications 1, 2 and 4 being folded into the spec. The rest are clarifications. No finding is critical: none changes the migration's Class A status (additive, nullable or constant-default columns, plain CHECKs on a small table).

#### Final Notes
- Migration 1 stays free of any RLS statement. Migration 2 holds only `ENABLE ROW LEVEL SECURITY` and the guarded `CREATE POLICY`. Its header states "prod RLS state unknown, projects-64 verifies at rehearsal".
- The generated client must be regenerated for the packages that read `TenantAIConfig` (`apps/ai-worker/src/lib/tenant-ai-config.ts` and the API router), or typecheck fails.
- CI uses db:push, so every CHECK and the policy exist only through the integration test's replay. Show that the suite actually ran under Node 22 against `DATABASE_TEST_URL`.
- Spend is an estimate; sub-centicent carry is lost on restart (D8); one in-flight call per worker may overshoot (D19).

#### Files Verified
- `packages/db/package.json:52-64` (Prisma 7.8)
- `node_modules/.pnpm/@prisma+adapter-pg@7.8.0/.../dist` line 522 (42703 to ColumnNotFound)
- `apps/api/src/modules/calendar/availability-enforcement.ts:25-60`
- `apps/api/src/modules/analytics/scheduled-reports.router.ts:110`
- `apps/ai-worker/src/lib/tenant-ai-config.ts:25-45,74-137`
- `packages/adapters/src/repositories/PrismaQuotaRepository.ts:56-70`
- `packages/db/prisma/schema.prisma:231-248`
- `packages/db/prisma/migrations/20260421000000_feat_agent_system_tenant_customization/migration.sql:54-78`

#### Round 2 vote
APPROVED

**A1 (tier nullable) checked against the code. I withdraw R3 challenge 4.**
- The caller-default evidence holds: one purpose is called with different default tiers, so a single written baseline tier would move other callers' models. `resolveEffectiveTier` already takes the default as a parameter (`apps/ai-worker/src/lib/tenant-ai-config.ts:74-78`), so `row.tier ?? defaultTier` is a one-line change.
- **Old-worker skew, both paths fall back to the caller default.**
  - If Prisma returns `null` for the required `tier`, `VALID_TIERS.has(row.tier)` is false (`tenant-ai-config.ts:106`). The code logs a warning and returns `{ tier: defaultTier }` (`:106-117`).
  - If Prisma throws on the null, the catch at `:131-135` returns `{ tier: defaultTier }`.
  - I could not run it against a live DB here, so which path occurs is unverified. The client uses `engineType = "client"` (`schema.prisma:7`). The outcome is the same either way.
- **Rate-limit override survives.** `resolveRateLimit` selects only `rateLimitPerMinute` (`tenant-ai-config.ts:176-179`), so a NULL tier on a retained row cannot break it. That matters because A4's reset keeps rows for their rate limit and nulls their tier.
- **Cost of the skew.** While the old worker runs, a NULL-tier row loses that row's `temperature` and `maxTokens`, and the old worker logs a warn about every 60 s per tenant and purpose (`:108-111`). It is a short window (rollout order: migration, API, worker). I'd accept it and note it in the PR.

**Modifications for A1**
1. `ALTER COLUMN "tier" DROP NOT NULL` goes in migration 20261019120000 before the CHECKs. It is a catalog-only change on PG 11+ and Class A (relaxing). Name the replacement `tenant_ai_config_tier_check` with `"tier" IS NULL OR "tier" IN ('free','standard','premium')`, still `NOT VALID` then `VALIDATE`. Update `schema.prisma` to `tier String?` and its SQL-only comment.
2. The legacy select fallback (D9) must tolerate `tier` being null, and the new reader uses `row.tier ?? callerDefaultTier`. Add a resolver unit test with `tier: null`.
3. Integration test: a row inserted with `tier = NULL` is accepted, an invalid tier is rejected, and a retained rate-limit row after `resetToDefaults` has `tier IS NULL`.
4. Update my R4 Modification 1: after reset the retained row's tier is NULL (A4), not `BASELINE_TIER`. I have no objection to A2, A4 or A6. A6 matches my Modification 4 (clamp at INT max).

### domain-expert

APPROVED

### PG-199 Round 4 CONSENSUS — Domain-Expert

Paths relative to the pg-199 worktree; ai-worker paths under `apps/ai-worker/src/`.

#### Agreement
I support D1-D5, D7-D10, D13-D21, D23-D25, D27-D29 as written, and D6, D11, D12, D22 and D26 with the modifications below.
- D1/D2: integer micro-USD prices, strictly-lower-price rule and the dropped rank fields resolve my R3 challenges 1-3. `round(0.00005 * 1e6)` is safe where raw float addition is not.
- D8: centicents fit INTEGER. 2,000,000 cents = 2e8 centicents, under 2.147e9. The recorder's carry logic (`utils/tenant-ai-spend.ts:40-55`) is reusable.
- D11: the cited lock pattern exists at `apps/api/src/modules/analytics/scheduled-reports.router.ts:105-110` (`pg_advisory_xact_lock(hashtextextended(...))`). The cite should include the `analytics/` path.
- D13: storing prices in the audit entry answers the repricing concern.
- D17/D19/D20: retired pins keep honouring, the `code`-based error and the narrow fail-open are consistent with the owner rulings. Every `createLLMForTenant` caller already catches errors (`case-insight.chain.ts:59,82`, `contact-reply-draft.chain.ts:106,143`, `enrichment-adapter.ts:146`).
- D22 feasibility: both job payloads carry `tenantId` (`workers/contact-embed-worker.ts:23`, `workers/ingestion-workers.ts:45`), so running handlers inside `tenantContextStore.run` is possible.

#### Modifications
1. **D6 (must fix before exec): a ceiling-only save can silently downgrade other features.** A stored row overrides the tier for every caller of that purpose (`lib/tenant-ai-config.ts:93-105`; `lib/llm-factory.ts:387-388`, `chains/scoring.chain.ts:183`). D6 writes `tier = existing ?? BASELINE_TIER` for a new row. Callers' own defaults differ from the baseline:
   - email baseline `free`, but `contact-reply-draft.chain.ts:107` uses `standard`. A ceiling-only row drops reply drafts from llama-70b to llama-8b.
   - structured baseline `free`, but `shared/enrichment-adapter.ts:124` uses `standard`.
   - qualification baseline `standard`, but `agents/base.agent.ts:164` runs `free`. The same save upgrades agents and costs money.

   Fix: relax `tier` to NULLABLE (additive, Class A) in migration `20261019120000`, and have the resolver use `row.tier ?? callerDefault`. The router writes `tier = null` for rows it creates and preserves existing non-null values. The old worker survives a null tier through the `VALID_TIERS` guard (`tenant-ai-config.ts:100-110`), though that path also drops temperature and maxTokens, so the rollout order (migrate, API, worker) matters. If you prefer not to relax the constraint, the alternative is to refuse a first save that would change any caller's default, which is worse UX.
2. **D12 reset must be explicit about the existing columns.** "Null-out PG-199 columns" leaves `tier`, `temperature` and `maxTokens` on kept rows (rate-limit rows), so reset would not restore defaults. Specify: on kept rows set `tier = null` (after Mod. 1), `temperature = null`, `maxTokens = null`, `modelId = null`, `fallbackModelIds = '{}'`, ceiling null.
3. **D3 pin scope is wider than the "before" model.** A pin applies to every feature using the purpose, while `before` is a single baseline model. A pin that is cheaper than one caller's current default (for example email llama-70b versus the reply-draft default) cannot be detected as a downgrade. Accept this limitation, and add it to the page copy: "applies to every feature that uses this purpose".
4. **D3 table coverage.** `DEFAULT_MODEL[purpose][tier]` has no `rag`/`standard` entry (`infra/litellm/config.yaml:100-117`: only `rag-free` and `rag-premium`). Make the table partial for rag, and cover it by the rag lock and `BASELINE_TIER.rag = 'free'`.
5. **D3 production-provider caveat.** Production chat runs on OpenRouter, whose model is env/tier-selected (`lib/llm-factory.ts:20-26,297-318`), not the YAML alias. The "before" model derived from the YAML can differ from what runs, and the difference errs toward extra confirms, not missed ones. Document it in ADR-082.
6. **D22 deferral needs explicit mechanics.** The default behaviour on a thrown error is the queue's retry: `attempts: 3`, exponential backoff 5 s (`contact-embed-worker.ts:73-74`, `ingestion-workers.ts:335-336`). That would dead-letter documents in about 15 s. Specify BullMQ delayed handling (`job.moveToDelayed` plus `DelayedError`, or a re-enqueue with `delay`) to the next check time (capped, for example 15 min, and re-checked), and a test that a ceiling error does not consume an attempt.
7. **D8/D22 estimate.** Embedding spend is estimated from input text, since `embedQuery`/`embedDocuments` return no usage (`chains/embedding.chain.ts:82,137`). Say so in the UI copy for the rag card.

#### Sign-off
APPROVED, subject to Modification 1 being adopted in the spec (it is a silent downgrade the owner's Never-Downgrade rule forbids) and Modifications 2 and 6 being reflected in the plan.

#### Final Notes
- AC set: amend AC-M7..M10 to "strictly lower price", add "equal price is lateral, audited", rag ceiling enforced (Q8), reset restores tier/temperature/maxTokens, and "ceiling error never consumes a queue attempt".
- Follow-ups to file as D29 lists, plus: rag/embedding worker tenant threading beyond the two handlers, and per-model `maxTokens` caps (limit 32768 is a global guess).
- Catalog prices for Gemini embeddings must come from the provider's pricing page during exec, as D22 states. I have not verified a figure.

#### Files Verified
- `apps/api/src/modules/analytics/scheduled-reports.router.ts:105-110`
- `apps/ai-worker/src/lib/tenant-ai-config.ts:93-110`
- `apps/ai-worker/src/lib/llm-factory.ts:20-26,297-318,380-398,424-433`
- `apps/ai-worker/src/chains/contact-reply-draft.chain.ts:106-143`, `case-insight.chain.ts:59-84`, `scoring.chain.ts:183`
- `apps/ai-worker/src/shared/enrichment-adapter.ts:124-146`
- `apps/ai-worker/src/agents/base.agent.ts:164`
- `apps/ai-worker/src/workers/contact-embed-worker.ts:23,73-74`, `ingestion-workers.ts:45,335-336`
- `apps/ai-worker/src/chains/embedding.chain.ts:82,137`
- `infra/litellm/config.yaml:100-117`

#### Round 2 vote
APPROVED

Checked against `R4-resolutions.md` lines 149-189 (Amendments A1-A8).

- **A1 adopted as required.** Nullable `tier`, `row.tier ?? callerDefaultTier`, and the router never writing or editing tier remove the silent caller-default shift I found (`lib/tenant-ai-config.ts:93-110`, `lib/llm-factory.ts:387-388`, `contact-reply-draft.chain.ts:107`, `shared/enrichment-adapter.ts:124`). Comparing an unpinned current model against the maximum price among its callers' defaults is the conservative direction. The partial `DEFAULT_MODEL` covers the missing `rag-standard`.
- **A4** now resets tier, temperature and maxTokens on kept rows. **A5** specifies delayed re-queue and the embedding-estimate disclosure. **A2, A6, A7, A8** do not touch my lens and look sound.

Non-blocking notes for the spec:
1. **A5 "until the next UTC month" is too long.** If the owner raises the ceiling mid-month, deferred jobs would not resume until the month rolls over. Use a bounded delay (for example 15 minutes) and re-check the ceiling on each wake-up.
2. **A1 skew.** During the old-worker window a NULL tier row takes the fail-open path in `tenant-ai-config.ts:130-136`, which also drops that row's temperature and maxTokens. This is harmless under the rollout order (migrate, API, worker); state it in the ADR.
3. **`CALLER_DEFAULT_TIERS` test.** The call-site-importing test should fail when a new `createLLMForTenant(purpose, tier, ...)` call introduces a tier not in the set.

### test-engineer

APPROVED

#### Agreement
I support D1-D3, D5-D7, D9-D10, D12-D14, D15-D17, D19-D20, D23-D24 and D26-D29 as written. These are testable as specified.
- D1 snapshot test pinning ids and prices, with a parity test against `MODEL_PRICING` (`apps/ai-worker/src/config/ai.config.ts:198-269`).
- D2 downgrade matrix: lower price is a downgrade, equal is lateral, and an id absent from the catalog is a downgrade.
- D3 effective-model comparison, so a first save from defaults does not fire the unknown-model rule.
- D11 advisory lock: the pattern exists at `apps/api/src/modules/analytics/scheduled-reports.router.ts:110`.
- D18 single recording site, with a test asserting exactly one increment per call for chat and for embeddings.
- D20 fail-open matrix.
- D27 `settings-search` count: `apps/web/src/lib/shared/__tests__/settings-search.test.ts:13-15` asserts 13 and moves to 14.

#### Modifications
1. **D4 and D8: `getQuotaPeriod` cannot be reused as written. This is a must-fix.**
   - `getQuotaPeriod(key: QuotaKey, now)` at `packages/domain/src/platform/quotas/QuotaRegistry.ts:80-83` returns `'all'` unless `isMonthlyQuotaKey(key)` is true (`:70-72`, a lookup in `MONTHLY_QUOTA_KEYS`).
   - `aiSpendCentiCents:<purpose>` is not a `QuotaKey`, so a naive call returns `'all'`. The ceilings would never reset each month. The type does not catch this if the key is cast.
   - Fix: derive the period with `getQuotaPeriod('aiSpendCentsPerMonth', now)`. This is already a monthly key, which is the same period the aggregate counter uses.
   - Test: `purposePeriod(now)` equals `'2026-10'` at `2026-10-31T23:59:59.999Z` and `'2026-11'` at `2026-11-01T00:00:00.000Z`.
   - A second test asserts it never returns `'all'` for any of the 6 purposes. This is the guard against the silent regression.
2. **D8 range:** `TenantUsageCounter.value` is `Int` (`packages/db/prisma/schema.prisma:6543`), max 2,147,483,647. A ceiling of 2,000,000 cents is 200,000,000 centicents, which fits. Add a boundary test: the maximum ceiling compares correctly, and incrementing past the Int range is handled (clamp or error with a log), not a Postgres overflow thrown into the LLM call path.
3. **D21: not all four agents use `withStructuredOutput` in the same way.** `email-writer.agent.ts:79`, `followup.agent.ts:78` and `qualification.agent.ts:88` call `(this.model as any).withStructuredOutput(...)` in their constructors. `next-best-action.agent.ts` has no such call (grep finds none), so it builds its output differently. The refactor tests must be written per agent for what each actually does. For the three above, assert the structured model is rebuilt from the tenant model at execute time, not the constructor model.
4. **D22: the worker file is `apps/ai-worker/src/workers/contact-embed-worker.ts`.** I found no ingestion-worker file by name, so the spec should list the real handlers. Test: the handler runs inside `tenantContextStore.run({ tenantId })` (`apps/ai-worker/src/ai-worker.ts:1038` shows the existing usage), a rag-at-ceiling job is delayed (not failed), and a retry increments attempts only once.
5. **D19:** callers check `code`, so the test asserts `error.code === 'PURPOSE_CEILING_REACHED'` after crossing the BullMQ/ALS boundary, not `instanceof`.
6. **D25:** a web test that Save sends only changed purposes and computes downgrades from `findDowngrades(snapshot, draft)`; a fallback-only change fires the same combined dialog.
7. **D16:** the RED structured-output test must exist before the `withFallbacks` versus helper decision, as written. I add a termination test using a hand-written DB row with a self-referencing fallback.

#### Sign-off
APPROVED, conditional on Modification 1 being applied in the spec and the plan, because the as-written reuse is a silent correctness bug. All other items are refinements.

#### Final Notes
- Diff-coverage: the new router is measured (`vitest.config.ts:371` excludes only the root `router.ts`). Web `page.tsx` is excluded (`vitest.config.ts:387`), so logic stays in `ModelConfigContent.tsx` and the components.
- Fixed-clock plan, regression suites and integration test are as in R2. The integration test must use Node 22 and `DATABASE_TEST_URL`.
- Count tests that move: `ui-flow-mapping-reconciliation.test.ts`, `ia-reconciliation.test.ts`, `tools/scripts/route-total-consistency.test.ts`, `settings-search.test.ts`. `sitemap-reconciliation.test.ts:65` (214) stays unless a page is added.

#### Files Verified
- `.../rounds/R4-resolutions.md` (all D1-D29)
- `packages/domain/src/platform/quotas/QuotaRegistry.ts:70-83`
- `packages/db/prisma/schema.prisma:6539-6551`
- `apps/api/src/modules/analytics/scheduled-reports.router.ts:110`
- `apps/web/src/lib/shared/__tests__/settings-search.test.ts:13-15, 39`
- `apps/ai-worker/src/agents/{email-writer,followup,qualification}.agent.ts` (lines 79, 78, 88)
- `apps/ai-worker/src/ai-worker.ts:312, 1038`; `apps/ai-worker/src/tracing/llm-tracer.ts:41`
- `apps/ai-worker/src/workers/contact-embed-worker.ts` (existence); `apps/ai-worker/src/config/ai.config.ts:198-285`

#### Round 2 vote
APPROVED

- A2 (period) matches Modification 1 and A6 matches Modification 2. A7 matches Modification 3. A5 matches Modification 4. All four are testable as written.
- A1 (nullable tier) checked against `apps/ai-worker/src/lib/tenant-ai-config.ts:88-128`. An old worker reading a row with `tier = NULL` hits the `!VALID_TIERS.has(row.tier)` branch (`:104-113`), logs a warning and returns the caller default. The `VALID_TIERS` guard already handles it, with no code change needed for the skew claim. That branch also caches `temperature: null, maxTokens: null`, so an old worker ignores temperature and maxTokens saved from the new page until it is redeployed. This is expected skew, not a bug, but the UI copy about changes applying should not promise otherwise.
- Test additions for A1:
  - Resolver: `row.tier = null` returns the caller default and keeps the row's temperature, model and ceiling (new worker); an invalid string tier still falls back (existing behaviour, `tenant-ai-config.test.ts`).
  - Integration: `tier IS NULL OR tier IN (...)` accepts NULL and rejects `'gold'` (23514), and DROP NOT NULL applies on a table that `db:push` created from the old schema (`schema.prisma:235` must change to `String?` so db:push matches).
  - Router: rows it creates have `tier = NULL`, and an existing row's tier is never modified by `update` or `reset` (A4 nulls it on reset).
  - `CALLER_DEFAULT_TIERS` call-site check: avoid grepping source text in a test (brittle). Prefer an exported per-purpose constant that each caller imports, and a test that the callers named in A1 use it. If grep is kept, scope it to the cited files.
  - Unpinned current model is compared against the maximum price across its purpose's caller defaults. Table-test purposes with mixed defaults (structured free vs standard, scoring, email), and `rag` having no standard entry.
- Typing note: making `tier` nullable changes the generated Prisma type. `resolveRateLimit` and any other reader of `tenantAIConfig.tier` must be re-typed (run typecheck across `apps/ai-worker` and `apps/api`).
- A8 (`errorCode` re-exported from `CaseTypesContent.tsx` / `ContactTypesContent.tsx`): keep their existing tests green; the "" to null and "0" to 0 ceiling mapping needs explicit web tests.

