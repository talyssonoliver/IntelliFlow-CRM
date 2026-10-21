# PG-199 Round 1 ANALYSIS (AI-Specialist, LLM routing lens)

All paths are under `apps/ai-worker/src/` unless noted. Line numbers are from the pg-199 worktree. No files were edited during analysis.

## Files Reviewed
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

## Interpretation
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

## Questions (the code cannot answer)
- Q-A: What is the allow-list id format, and is the `ChainVersion.model` free-text field (dead at runtime, per exploration) to be migrated or left alone?
- Q-B: Should a LiteLLM wildcard route (for example `anthropic/*`) be added to `config.yaml`, or should pins be restricted to the existing alias set? This goes against ADR-048's "YAML is the single source of truth" (exploration section 5), so ADR-082 must state the amendment.
- Q-C: Is the ceiling expressed in USD from `MODEL_PRICING`, which is an estimate, not an invoice (`tenant-ai-spend.ts:8-10`)? Please confirm that is acceptable.

## Concerns (with evidence)
- C1. OpenRouter ignores purpose entirely: `openRouterModelForTier(tier)` is tier-only (`llm-factory.ts:20-26`). Today one row per purpose changes nothing but the tier on the production path, so it needs the pinned-model plumbing, not just a UI.
- C2. The cache key has no model id (`:153`). A pin without a key change would serve stale or wrong-tenant models.
- C3. The 60s tier cache (`tenant-ai-config.ts:39`) plus the `_tierCache` entry shape (`:29-34`) does not carry model, fallbacks or ceiling. A ceiling or pin change takes up to 60s per worker, and it is per-process, so with N workers there is no instant propagation. Also, `resolveRateLimit` has a separate cache of the same shape (`:149`).
- C4. Cost mis-attribution at `base.agent.ts:690`: `modelName` is hardcoded `-free`. With a tenant on premium, spend is priced at `reasoning-free`, which is `{0,0}` (`ai.config.ts:240`). Ceilings would never trip for reasoning agents.
- C5. `calculateCost` falls back to `gpt-3.5-turbo` pricing for any unknown key (`ai.config.ts:277`). Pinned concrete ids absent from `MODEL_PRICING` (keys `:199-268`, which are logical aliases plus legacy OpenAI names) would be silently mispriced. The allow-list must be a subset of the priced keys, or pricing must be extended in the same PR.
- C6. Almost no spend is recorded: outside the tracker itself, `recordUsage` appears only at `base.agent.ts:694` and `insight-generation.chain.ts:362`. The insight chain records 0/0 tokens (`:362-367`). The case, account and contact chains record nothing. A per-purpose ceiling over chains that never call the tracker is unenforceable until tokens are captured, for example in the `wrapModelWithTracing` callback (`llm-tracer`).
- C7. Embeddings and RAG: `createEmbeddings(tier)` has no purpose, tenant or model parameter (`:409`), and the Gemini branch ignores tier (`:424-433`). The `rag` row can only apply to embeddings if this signature changes. Consider limiting `rag` to a ceiling and tier for now, and flagging model pin as unsupported.
- C8. Breaker key `:196-199` and the ALS `tenantContextStore` (`ai-worker.ts:1038`) must be reconciled. The tenant for a spend event comes from ALS, but the purpose is not in ALS.
- C9. Fail-open vs. the owner's rule: `resolveEffectiveTier` swallows DB errors (`:130-136`). The ruling wants fail-open only until the migration is applied. A missing-column error should log the reason, and a connection error should arguably not disable a ceiling.

## Dependencies on other agents
- **Backend:**
  - The router must validate the allow-list and the lower-ranked-pick confirm, with the audit entry naming the actor.
  - The ranking source should be shared with `MODEL_PRICING`, for example a `packages/validators` catalog that ai-worker also imports.
  - It also needs a spend-read procedure for the UI's "used this month".
- **Data:** the migration needs columns for model, fallback ids, a USD ceiling and per-purpose monthly spend (a new table or a JSON counter). It must keep the RLS step separately removable. Fail-open for missing columns lives in ai-worker (C9).
- **Frontend:** purposes are fixed at six rows. It shows an estimate disclaimer (Q-C), the downgrade confirm, and calm NOT_FOUND degrade.
- **Test:** the cache key now includes the model (C2), the `-free` mis-attribution (C4), the ceiling block with non-AI fallback, a cross-tenant negative test, and fake-timer coverage of the 60s TTL.
