# PG-199 Round 2 PROPOSAL: AI-Specialist (ai-worker routing)

Paths under `apps/ai-worker/src/` unless noted.

## Approach
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

## Files
- `packages/domain/src/ai/model-config/{catalog,purposes,downgrade}.ts` (create): pure constants and `isDowngrade`/`findDowngrades`.
- `lib/llm-factory.ts` (modify): `LLMPurpose`/`LLMTier` become aliases of the domain types (`:36,44`), plus `model` option, key changes, fallback wrapper and ceiling.
- `lib/tenant-ai-config.ts` (modify): resolver plus fail-open rules.
- `lib/purpose-ceiling.ts` (create): `assertWithinCeiling`, `PurposeCeilingReachedError`, the spend cache.
- `utils/tenant-ai-spend.ts` (modify): `recordPurposeSpend`. `ai-worker.ts:310-322` (modify): second listener target.
- `tracing/llm-tracer.ts`, `utils/cost-tracker.ts` (modify): move recording and the `purpose` field into `UsageMetrics.metadata`.
- `agents/base.agent.ts`, `chains/insight-generation.chain.ts`, `jobs/summarize-conversation.job.ts` (modify).
- `infra/litellm/config.yaml` (modify): `catalog-*` stanzas.
- Tests: catalog vs YAML consistency, resolver fail-open matrix (P2022, other, cached-blocked), ceiling block with 0 and burst, double-count guard, cache and breaker key include the model, structured-output fallback spike, 60 s TTL with fake timers.

## Interfaces
```ts
resolveTenantModelConfig(t: string, p: LLMPurpose, d: LLMTier): Promise<TenantModelConfig>
createLLMForTenant(p, tier, o: CreateLLMOptions & { tenantId: string }): Promise<BaseChatModel> // may throw PurposeCeilingReachedError
class PurposeCeilingReachedError extends Error { purpose; ceilingCents; spentCents }
```

## Integration
- Rollout order: migrate, API, worker (matches Backend R1). The old worker ignores the new columns (`tenant-ai-config.ts:90` selects all, harmless), so the page copy must not claim enforcement.
- ADR-082 and ADR-048 amendment text must include the YAML stanzas.

## Runtime Consumer
- Resolver: `createLLMForTenant`, called by the 21 existing sites plus agents and the summary job.
- `assertWithinCeiling`: only `createLLMForTenant`.
- `recordPurposeSpend`: the cost listener in `ai-worker.ts`.
- `PurposeCeilingReachedError`: summary job, auto-response chain, and API error mapping.
- Legacy paths replaced: `base.agent.ts:164,690`, `summarize-conversation.job.ts:223`, `insight-generation.chain.ts:362-367`.

## Risks and open items
- **RAG:** `createEmbeddings(tier)` takes no tenant (`llm-factory.ts:409`) and is not metered, so a rag ceiling cannot trip. Either meter embeddings in this PR or mark the rag ceiling "not enforced yet" in the UI. I recommend the second, with a follow-up row.
- The spike in Approach 6 can change the fallback design. I will confirm it in Round 3.
