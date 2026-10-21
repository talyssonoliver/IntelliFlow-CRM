## PG-199 Test-Engineer Round 1 Analysis

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
