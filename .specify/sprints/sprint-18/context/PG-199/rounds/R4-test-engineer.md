APPROVED

## Agreement
I support D1-D3, D5-D7, D9-D10, D12-D14, D15-D17, D19-D20, D23-D24 and D26-D29 as written. These are testable as specified.
- D1 snapshot test pinning ids and prices, with a parity test against `MODEL_PRICING` (`apps/ai-worker/src/config/ai.config.ts:198-269`).
- D2 downgrade matrix: lower price is a downgrade, equal is lateral, and an id absent from the catalog is a downgrade.
- D3 effective-model comparison, so a first save from defaults does not fire the unknown-model rule.
- D11 advisory lock: the pattern exists at `apps/api/src/modules/analytics/scheduled-reports.router.ts:110`.
- D18 single recording site, with a test asserting exactly one increment per call for chat and for embeddings.
- D20 fail-open matrix.
- D27 `settings-search` count: `apps/web/src/lib/shared/__tests__/settings-search.test.ts:13-15` asserts 13 and moves to 14.

## Modifications
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

## Sign-off
APPROVED, conditional on Modification 1 being applied in the spec and the plan, because the as-written reuse is a silent correctness bug. All other items are refinements.

## Final Notes
- Diff-coverage: the new router is measured (`vitest.config.ts:371` excludes only the root `router.ts`). Web `page.tsx` is excluded (`vitest.config.ts:387`), so logic stays in `ModelConfigContent.tsx` and the components.
- Fixed-clock plan, regression suites and integration test are as in R2. The integration test must use Node 22 and `DATABASE_TEST_URL`.
- Count tests that move: `ui-flow-mapping-reconciliation.test.ts`, `ia-reconciliation.test.ts`, `tools/scripts/route-total-consistency.test.ts`, `settings-search.test.ts`. `sitemap-reconciliation.test.ts:65` (214) stays unless a page is added.

## Files Verified
- `.../rounds/R4-resolutions.md` (all D1-D29)
- `packages/domain/src/platform/quotas/QuotaRegistry.ts:70-83`
- `packages/db/prisma/schema.prisma:6539-6551`
- `apps/api/src/modules/analytics/scheduled-reports.router.ts:110`
- `apps/web/src/lib/shared/__tests__/settings-search.test.ts:13-15, 39`
- `apps/ai-worker/src/agents/{email-writer,followup,qualification}.agent.ts` (lines 79, 78, 88)
- `apps/ai-worker/src/ai-worker.ts:312, 1038`; `apps/ai-worker/src/tracing/llm-tracer.ts:41`
- `apps/ai-worker/src/workers/contact-embed-worker.ts` (existence); `apps/ai-worker/src/config/ai.config.ts:198-285`

## Round 2 vote
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
