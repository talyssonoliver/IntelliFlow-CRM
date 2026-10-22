# PG-199 Round 3 CHALLENGE: AI-Specialist (ai-worker lens)

Paths under `apps/ai-worker/src/` unless noted.

## Challenges
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

## Edge cases
- **Month rollover:** include the UTC period in the spend-cache key, so a cached "blocked" does not outlive the 1st of the month. The in-process carry (`tenant-ai-spend.ts:40`) is per tenant and must become per `(tenant, purpose)`.
- **Purpose with no row:** defaults, no ceiling, no pin. `rag` with no row still meters, but with no ceiling.
- **Pin retired from the catalog or not allowed for the purpose:** ignore the pin, use the tier default, log `pin_retired`, and show the card as "model retired" in `get`.
- **Provider lacks the pinned model (Ollama, OpenRouter):** use the tier default and log `pin_unavailable_for_provider`. The page must say a pin may be ignored on the dev provider.
- **Fallback loops:** the fallback list is deduplicated and excludes the primary by validator, but also enforce a runtime attempt cap of `1 + fallbacks.length`, and never re-enter the wrapper from a fallback instance.
- **Concurrency and multi-worker:** each worker has its own 30 s spend cache and 60 s config cache (`tenant-ai-config.ts:39`). With N workers the overshoot is bounded by roughly N times the rate times 30 s. The spec should say so.
- **Usage missing:** `usage_metadata` can be absent on OpenRouter free models or Ollama. Fall back to `countTokens` (as `base.agent.ts:691-692` does) rather than recording 0.

## Integration issues
- `lib/tenant-ai-config.ts:90` selects all columns. With the new Prisma client against a pre-migration DB, that throws `P2022`, which also drops the tier override (Data-Engineer R2). Implement the legacy-select retry in the resolver, and test it.
- Fail-open versus the settled rule: the existing blanket catch (`:130-136`) stays for unknown errors (last cached value, else open plus a warn), so the "blocked stays blocked during an outage" behaviour in my R2 is satisfied by the cache only. Say so.
- `agents/email-writer.agent.ts:79`, `followup.agent.ts:78` and `qualification.agent.ts:88` build `structuredModel` in the constructor. `NextBestActionAgent` (`next-best-action.agent.ts:180`) must be checked too. A `getModel(task)` hook changes all four.

## Dead-on-arrival risk
- `calculateCostForCatalogModel` (R2): dead unless the tracer calls it.
- `withModelFallback` helper: only exists if the structured-output spike fails; otherwise delete it.
- `PurposeSpendPort.getSpentCents` and `isCeilingReached`: consumed only by `createLLMForTenant` and the tracer's embedding path. If embeddings are not wired, the rag ceiling is dead.

## UI reachability and route conflict
- The route is already linked via `AI_SETTINGS_ITEMS` and `AIModuleSettingsPanel` (exploration section 3). `/agent-approvals/ai-settings` edits `ChainVersion.model` (dead at runtime). Add a visible note on that editor and a link from the Model Config page, so users do not think chain-version models are in effect.

## Suggestions
1. Meter in `wrapModelWithTracing` and `wrapEmbeddingsWithTracing` only; no per-caller recording.
2. Wrap embedding workers' handlers in `tenantContextStore.run`; add a test asserting spend lands under the job's tenant.
3. Use a `code` field on the ceiling error, and check `cause` in `generateEmbedding` callers.
4. Integer micro-dollar prices with a `MODEL_PRICING` parity test.
5. Add priced Gemini embedding and concrete catalog entries; make unknown pricing a test failure, not a silent 0.
6. Define "effective model" (`pin ?? alias(purpose, tier)`) in the domain and use it for `findDowngrades`.
