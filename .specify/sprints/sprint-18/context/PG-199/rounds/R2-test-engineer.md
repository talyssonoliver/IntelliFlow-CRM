# PG-199 Round 2 PROPOSAL (Test-Engineer)

Paths are relative to the pg-199 worktree. Every test is written RED first, in the same commit group as its code.

## Answer to my R1 question: where the router.ts coverage exclusion lives
- Root `vitest.config.ts:371` excludes `apps/api/src/router.ts`. `apps/api/vitest.config.ts:76-90` does not, which is why I missed it.
- Sonar mirrors it: `sonar-project.properties:198` (`apps/api/src/router.ts`) and `:196` (`apps/api/src/modules/legal/*.router.ts`).
- Correction to the lead's assumption: `modules/agent/model-config.router.ts` is NOT excluded. Only the legal routers and the root `router.ts` are. The new router is measured, so the router test must cover every branch, and the smoke block only covers the mount.
- The web `page.tsx` exclusion is `vitest.config.ts:387` and `sonar-project.properties:192`. `ModelConfigContent.tsx` and its sub-components are measured.

## Approach
Copy PG-198 and PG-202 patterns, adding only what the new risk needs: the downgrade rule, per-purpose ceilings and fail-open. Pure logic (rank, downgrade, catalog) lives in the domain package so it is tested without mocks. Domain target is above 95%, and diff-coverage (`scripts/lib/diff-coverage.mjs`) must be at least 80% on changed lines, with no coverage-ignore comments.

## Files (create)
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

## Files (modify)
- `apps/ai-worker/src/lib/__tests__/tenant-ai-config.test.ts`: new fields resolved, missing-column fallback, cache keyed to the new shape. It already clears `_tierCache` in `beforeEach` (`:51-53`).
- `apps/ai-worker/src/agents/base.agent.test.ts:15` and `jobs/__tests__/summarize-conversation.job.test.ts:41`: the `llm-factory` mock factories add `createLLMForTenant: vi.fn(async () => stubModel)` beside `createLLM`. Assert it is called with `(purpose, tier, { tenantId })` and that `createLLM` is not. Check every other `vi.mock('../lib/llm-factory.js')` that loads `base.agent` (email-writer, followup, qualification, next-best-action tests, plus `__tests__/next-best-action.agent.b11.test.ts`) so none breaks.
- Spend misattribution: `base.agent.test.ts` asserts `recordUsage` receives the resolved model and purpose, not `${purpose}-free` (`base.agent.ts:690`). An `insight-generation` test asserts non-zero tokens (`insight-generation.chain.ts:362-367`).
- `apps/api/src/__tests__/app-router.smoke.test.ts` (after `:142-155`): a `modelConfig` block with get, update and resetToDefaults.
- Count tests, edited with the code that moves them: `apps/web/src/app/__tests__/sitemap-reconciliation.test.ts:65` (214 stays unless a page is added; verify), `ui-flow-mapping-reconciliation.test.ts` (70 to 71 routers, procedures plus 3), `ia-reconciliation.test.ts`, `tools/scripts/route-total-consistency.test.ts`, `apps/web/src/lib/shared/__tests__/settings-search.test.ts`. Their numbers are updated together with `docs/design/ui-flow-mapping.md`.

## Interfaces (test seams)
- `isDowngrade(current: string | null, next: string): boolean`; `findDowngrades(before, after): Downgrade[]`.
- `checkPurposeCeiling(tenantId, purpose, now?: Date)` takes an injectable clock and a Prisma-like client, so month tests need no global patching.
- Router input carries `acknowledgeDowngrade?: boolean` and `expectedUpdatedAt?`.

## Fixed-clock plan
- All spend and ceiling tests use `vi.useFakeTimers()` plus `vi.setSystemTime(new Date('2026-10-31T23:59:59.999Z'))` then `'2026-11-01T00:00:00.000Z'`, with `vi.useRealTimers()` in `afterEach`, following `tenant-ai-config.test.ts:126`.
- Run with `TZ` set to a non-UTC zone in one case to prove the period is computed in UTC.
- No test reads the real `Date` except through the injected clock.

## Coverage plan
Domain above 95%, validators above 95%, router all branches (it is measured), ai-worker new modules above 90%, `ModelConfigContent` above 90%. `page.tsx` stays a thin shell (excluded). Run `node scripts/pre-ship.mjs`, which includes `diff-coverage`.

## Regression suites to rerun, by package
- ai-worker: `llm-factory*`, `createLLMForTenant`, `tenant-ai-config`, every `agents/*.test.ts`, `chains/*scoring|churn|sentiment|ticket|auto-response*`, `jobs/__tests__/summarize-conversation*`, cost-tracker and tenant-ai-spend tests.
- api: `modules/agent/__tests__/*`, `app-router.smoke`, security RBAC/audit tests (new `ResourceType`).
- validators and domain: full package runs. web: `agent-approvals/**`, sidebar config, settings-nav, `settings-search`, reconciliation tests.
- integration and docs: `tools/scripts` count tests.

## Integration
CI builds with `db:push`, so integration SQL is applied by the test itself. Node 22 and `DATABASE_TEST_URL` only; the prod URL in `.env.local` is never used.

## Runtime Consumer
Each new function must be exercised by a test that goes through its production caller (`createLLMForTenant`, `BaseAgent.invokeLLM`, `generateSummaryWithLLM`, the web `trpc.modelConfig.*` calls), not just a unit of the function.

## Questions for the lead
- Fail-open scope: I propose only P2021/P2022 (missing table or column) fail open, and other DB errors keep the last cached ceiling. This follows the backend-architect's concern (R1 item 3) and `tenant-ai-config.ts:130-136`.
- Do you want the optimistic `expectedUpdatedAt` check? I have included tests for it.
