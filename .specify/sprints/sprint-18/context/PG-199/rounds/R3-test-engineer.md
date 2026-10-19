# PG-199 Round 3 CHALLENGE (Test-Engineer)

Paths relative to the pg-199 worktree. Read: all R2 files, R3 brief, ruling Q1-Q8.

## Challenges

1. **Price ranking (Q7) has a flat region that makes the confirm untestable as specified.** `MODEL_PRICING` has `reasoning-free` and `rag-free` at `{0,0}` (`apps/ai-worker/src/config/ai.config.ts:239-244`) and `ollama` at 0 (`:225`). Several different free models therefore tie, so `isDowngrade` returns lateral for a real capability drop (any free-to-free swap), and any move from a paid model to a free one is a downgrade. That is the owner's accepted consequence, but the test table must pin it: free to free is lateral and audited; paid to free is a downgrade; free to paid is not.
2. **The domain package cannot import `MODEL_PRICING`** (it lives in ai-worker, `ai.config.ts:198`). Either the catalog carries a copied price (needs a parity test in ai-worker comparing catalog to `MODEL_PRICING`), or the table moves to domain. A silent drift defeats the Never-Downgrade rule, so parity is mandatory. Also, the pricing keys are logical aliases (`scoring-free`), not catalog model ids (`:213-269`); the test must map catalog id to alias and fail on a missing mapping.
3. **"Unknown or retired current model is a downgrade" contradicts my R2 test** (`isDowngrade` unknown current returns false). Superseded: with the brief's rule, a retired pin makes every pick, including the top model, require a confirm. I will test it, but the UI test must also confirm that Reset-to-defaults on a retired pin shows a clear message rather than a blocked Save.
4. **`calculateCost` silently prices unknown models as gpt-3.5** (`ai.config.ts:277`). With Q8, a Gemini embedding (`llm-factory.ts:424-433`) has no pricing entry, so rag spend would be wrong, not zero. Test: every model the factory can produce, including the Gemini embedding id, has a pricing entry (a table-driven test over the catalog).
5. **Q8 metering of embeddings is hard to test and may not produce tokens.** `createEmbeddings` is synchronous with no tenant (`llm-factory.ts:409`), and `EmbeddingChain` builds it once in its constructor with `'free'` (`embedding.chain.ts:61`). So metering in the factory needs a wrapper around `embedDocuments`/`embedQuery`. `GeminiEmbeddings` is a custom adapter, so I need to verify it returns usage; otherwise token counts are estimates (`countTokens`). Tests: wrapped embeddings add cents under `rag`; tenant comes from ALS; a ceiling reached error is thrown before the network call; an existing singleton `EmbeddingChain` without a tenant does not meter (no ALS) and must not throw.
6. **Where spend is recorded is still disputed.** AI-specialist R2 records in `wrapModelWithTracing` plus the listener (`R2-ai-specialist.md:28-31`); the brief says "in the factory". Two recording sites double count. Needs one test asserting a single `addSpentCents` per call for chat and for embeddings.
7. **Ceiling is checked pre-call but spend lands post-call**, so a test with the clock and concurrent calls can overshoot by one call. Assert and document it as a soft limit rather than a hard guarantee.
8. **Tests that mock `llm-factory` will break silently, not loudly.** Mocks in `base.agent.test.ts:15` and `summarize-conversation.job.test.ts:41` only define `createLLM`. A missing `createLLMForTenant` becomes `undefined is not a function` inside a try/catch in some callers, so a test can pass while the real path is skipped. Add assertions on the call, not only on the result.

## Edge cases (what I will test)

- Month rollover: spend at `2026-10-31T23:59:59.999Z` counts to October, at `2026-11-01T00:00:00.000Z` starts a new period; the cache must not carry October's "ceiling reached" into November (60 s cache, `tenant-ai-config.ts:37-43`). Test with advanceTimersByTime across the boundary.
- Purpose with no row: defaults, no ceiling, no throw.
- Pinned model retired from catalog: `get` still returns it flagged; worker falls back to tier default with a logged reason.
- Provider without the pinned model (Ollama, OpenRouter): factory test that an unsupported pin falls back to the tier model, with a warn, rather than a 404 at call time.
- Fallback loops: primary in fallbacks, duplicates and A to B to A are rejected by the validator; the worker chain terminates after the cap even with a hand-written DB row.
- Concurrency: `expectedUpdatedAt` mismatch returns CONFLICT with zero writes; two admins saving simultaneously, only one wins.
- Fail-open scope per the brief: P2021/P2022 only gives no ceiling and a warn; other DB errors return the last cached value, else fail open with a warn. Test all three, plus that a cached value is not overwritten by the error path.

## Integration issues

- `executeRaw` period key: API reads `tenant_usage_counters` (`QuotaRegistry.ts:13-20`) while the worker writes it; the integration test must write via the worker repository and read via the router's `get`.
- Atomic `update` with page-level Save: partial failure inside `$transaction` must roll back all purposes (test with `failTx` on the second upsert).
- The shared `settings-shared.ts` admin check is used by approval-policies too; run those tests.

## Dead-on-arrival risk

- `findDowngrades` is used by the router and the web; both need a test through their own caller, not only the unit.
- `trpc-errors.ts` extract: unless three existing copies are migrated, it is a 4th copy in effect. Test that old callers import it.
- `PurposeSpendPort.getSpentCents`: the web "used this month" display needs a procedure; if `get` does not return it, the port has a reader only in the worker. Confirm in tests that `get` returns spend per purpose.

## UI reachability and route conflict

- Reachable via `sidebar/configs/agent-approvals.ts:194-199` and `AIModuleSettingsPanel.tsx`. A sidebar-config test must assert the href, and the settings-search test (`apps/web/src/lib/shared/__tests__/settings-search.test.ts`) must be checked: no entry for model-config exists today (grep of `apps/web/src/lib/shared/settings-search.ts` finds 0 matches), so either add one and move the count, or state it is out of scope.
- AI Settings `ChainVersionEditor` still edits a dead `model` field; a test should assert Model Config shows a link to it and does not duplicate the control.

## Suggestions

1. Add a catalog-to-`MODEL_PRICING` parity test and a table-driven downgrade matrix including the free-tier ties.
2. Record spend in exactly one place; test single-increment.
3. Wrap embeddings with an explicit tenant argument rather than ALS only, so the singleton `EmbeddingChain` path is deliberate.
4. Add `settings-search` coverage or an explicit exclusion note.
5. Every wiring test asserts the tenant-aware factory was called (not just "result is fine").
