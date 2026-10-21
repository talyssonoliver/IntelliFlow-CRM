APPROVED

# PG-199 Round 4 CONSENSUS: AI-Specialist

Paths under `apps/ai-worker/src/` unless noted.

## Agreement
I support D1, D2, D4-D7, D9-D14, D17-D21 and D23-D29 as written.
- D8: the unit holds. `aiSpendCentiCents` max is about 2.1e9 and the ceiling cap of 2,000,000 cents is 2e8 centicents, in range. The recorder carry (`utils/tenant-ai-spend.ts:40-55`) must be converted to centicents with the same per-`(tenant, purpose)` structure.
- D3: the `DEFAULT_MODEL` table from the YAML aliases (`infra/litellm/config.yaml:11-117`) is the correct baseline.
- D18: single-site metering matches the code. Chat has no other recorder than the two being deleted (`agents/base.agent.ts:694`, `chains/insight-generation.chain.ts:362`). The scoring chain's `TokenUsageCallbackHandler` (`chains/scoring.chain.ts:48,213`) is monitoring only and stays.

## Modifications
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

## Sign-off
Approved from the ai-worker routing lens, subject to the modifications above being reflected in the spec (1 and 2 are required for correctness; 3-7 are clarifications).

## Final Notes
- Rollout order stays migrate, API, worker. Until the worker is deployed, nothing is enforced; page copy must not claim otherwise.
- The 21 existing `createLLMForTenant` call sites get pins, ceilings and fallbacks without code changes, because the logic lives in the factory.

## Files Verified
- `lib/llm-factory.ts` (20-26, 153, 196-211, 256-354, 380-398, 409-464)
- `lib/tenant-ai-config.ts` (74-137)
- `tracing/llm-tracer.ts` (27-30, 41-88, 103-160)
- `utils/tenant-ai-spend.ts` (35-64); `utils/cost-tracker.ts`
- `agents/base.agent.ts` (164, 685-703); `agents/email-writer.agent.ts:79`
- `chains/embedding.chain.ts` (61, 72-118, 371-373); `chains/insight-generation.chain.ts` (359-368); `chains/scoring.chain.ts` (48, 213)
- `workers/contact-embed-worker.ts` (23, 73-74, 156); `workers/ingestion-workers.ts` (45, 193-195, 335-336)
- `jobs/prediction.job.ts`, `jobs/scoring.job.ts`, `ai-worker.ts` (310-322, 388-439, 1038)
- `infra/litellm/config.yaml` (11-117, 127-131)

## Round 2 vote
APPROVED

Verified against code. Three non-critical modifications:

1. **A1, resolver and callers.** The 21 `createLLMForTenant` call sites pass their own defaults (for example `chains/sentiment.chain.ts:236` free vs `shared/enrichment-adapter.ts:124` standard; `chains/auto-response.chain.ts:174` free vs `contact-reply-draft.chain.ts:107` standard), so `row.tier ?? callerDefaultTier` in `lib/tenant-ai-config.ts:120` preserves every caller's model. `chains/scoring.chain.ts:179-183` calls `resolveEffectiveTier` first and passes `resolved.tier` on; with a null stored tier it receives the caller default, which is correct. Keep `VALID_TIERS` handling at `:106` for non-null invalid values only, and treat null as "no tier override" without the invalid-tier warning.
2. **A1, old-worker skew window.** An old worker with a non-null `tier` in its generated client will throw on a NULL column (Prisma conversion error). It is caught by the blanket catch at `:130-136`, which does not cache, so those tenants cause one DB query and one warn per call until the worker is upgraded. It is fail-open and correct, only noisy. Rollout order migrate, API, worker narrows the window. The router could also avoid creating NULL-tier rows until the worker version is confirmed, but I do not require that.
3. **A5, delay target.** "Until the next UTC month" strands jobs if an admin raises the ceiling mid-month. Use a bounded recheck delay (for example 1 h, capped at the period end) and re-evaluate the ceiling on each wake. `moveToDelayed` needs the worker `token`, so the handler signatures in `workers/contact-embed-worker.ts` and `workers/ingestion-workers.ts:344,358` must be extended to pass it. The ingestion handlers must rethrow the ceiling error (`ingestion-workers.ts:193-195,265-267` currently swallow).

A7 is consistent with the code: `agents/next-best-action.agent.ts` has no `withStructuredOutput` call (the other three agents do, at `email-writer.agent.ts:79`, `followup.agent.ts:78`, `qualification.agent.ts:88`).
