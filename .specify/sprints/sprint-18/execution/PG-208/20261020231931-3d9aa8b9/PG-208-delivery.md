# Delivery Report: PG-208

**Run ID**: 20261020231931-3d9aa8b9
**Date**: 2026-10-21
**Task**: PG-208, Module Settings - Task Automation (`/tasks/(list)/automation`)
**Branch**: `feat/pg-208-task-automation`. 33 commits on origin/main `3d285c261`. Validated at HEAD `743586efe`.
**Verdict**: **COMPLETE** (updated 2026-10-22 after the merge of `origin/main`). The 2026-10-21 NEEDS_HUMAN items were resolved without a human; see "2026-10-22 update".

## Implementation summary

The page was a phantom stub (#615) and is now a working task-automation feature. A rule has one trigger and an ordered list of actions:

- **Triggers**: entity events (lead, contact, account, deal), a schedule (daily, weekly, monthly, quarterly or custom cron, each in a timezone), or a signed inbound webhook.
- **Actions**: create a task (templated title and description, due in N days), assign it round-robin from a member pool, and notify users.

The engine (ADR-084) runs in-process in the API:

- **Event intake**: the container's shared `InMemoryEventBus` feeds a bounded buffer, which a 15 s locked runner drains.
- **One admission path**: every path (event, schedule slot, webhook, Test Rule) is admitted under `pg_advisory_xact_lock('task_automation_run_admission:'+tenantId)`. That lock covers the idempotency, hourly-cap and per-minute-cap checks (ruling 8).

| Layer | What landed |
|---|---|
| domain | Event catalogue, template rendering (allow-listed tokens, `Object.hasOwn`, bidi and control characters stripped), due date in a timezone, round-robin pick, `canonicalRuleKey`, limits and role sets |
| validators | Rule, settings and tag schemas (strict, ordered actions, bounds, 18 colour tokens) and a duplicate-rule finder |
| db | 4 tables plus a Class A migration. Webhook secrets are field-encrypted. |
| adapters / application | Task `assigneeId` is persisted, and `TaskService.assignTask` emits `task.assigned` |
| api | `taskAutomation` router (CRUD, reorder, setActive, rotate and regenerate webhook, runNow, listRuns, settings, tags), an admin gate with audit logging, and strict limiters. The runtime is store, intake, engine and runner. The signed webhook route `/api/webhooks/task-automation/<token>` has HMAC `t=<unix>,v1=HMAC(secret, t.key.body)`, a replay window, a 64 KB / 10 s body cap and a failure-only IP limiter. OTel and Sentry scrub the token. |
| web | Page: PageHeader plus bento grid, rule list, rule dialog (fieldsets/legends, focus on the first invalid control), settings card, webhook secret dialog, recent runs, delete dialog, tags. Four components are now shared: schedule cadence fields, member multi-select, variable picker and copy field. |
| visibility (ruling 6) | Non-admins see tasks they own or are assigned to |

**Diff**: 161 files, +36,166 / −791 (103 added, 56 modified, 1 renamed, 1 deleted).

## Prisma migration (L13)

`packages/db/prisma/migrations/20261020120000_task_automation/migration.sql` is a single **Class A** migration. It is additive only: new tables, CHECKs, SQL-only uniques including a partial `ruleKey` unique, a composite FK, RLS with tenant policies, and no change to existing data.

- **Tables**: `task_automation_settings`, `task_automation_rules`, `task_automation_runs`, `task_automation_tags`.
- **Added after the independent SQL review** (`matop/gates/sql-review.md`). The runner re-reviewed and approved them on 2026-10-21. All are additive on the new tables:
  - the runs index `("tenantId", "createdAt" DESC)`, from the /simplify pass;
  - `task_automation_settings."automationEnabledAt" TIMESTAMP(3)`: slots that fell due while automation was off never run;
  - `task_automation_rules."effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`: a rule applies only to later events. The column is on a new, empty table, so the default needs no backfill;
  - `task_automation_runs."actions" JSONB`: the actions snapshot taken at admission (ruling 9).
- **migrate diff** against the schema shows no PG-208 drift. Its exit code 2 comes only from main's pre-existing drift (`users.locale` and others; #953). Evidence: `matop/gates/final-08-migrate-diff.txt`.
- **Local test DB (:5433)**. The shared DB already held 8 other lanes' unapplied migrations, so a plain `migrate deploy` there would have applied them too. Instead:
  1. the 4 PG-208 tables were dropped;
  2. the file was applied with `prisma db execute --file`;
  3. it was recorded with `prisma migrate resolve --applied 20261020120000_task_automation`.

  Re-checked on 2026-10-21 after the reboot: the checksum is `1e6dbf1979f4…` (equal to the file's sha256), it is finished with no rollback, and all 4 tables exist. Ephemeral DBs (`scripts/test-db.mjs run`) use plain `migrate deploy`. Production applies only through the runner after merge, with `prisma migrate deploy`.

## Event triggers in production (#966)

Event triggers work in production in-process. `container.ts` builds one `InMemoryEventBus`. The domain services publish to it, and the runtime registers the intake on the same `container.adapters.eventBus` (`http-server.ts:596-609` → `task-automation-runtime.ts`). This does not depend on the outbox or worker path tracked in #966/#889. The ADR-084 at-most-once window still applies: events still buffered in memory when a process stops are lost. **The PR description must say this.**

## TDD execution

RED then GREEN for every layer. See `attestations/PG-208/red-green/red-green-index.md`. The Codex-round fixes have their own RED-first logs: `23-dbnull.*` (a bare `null` broke the trigger CHECK, a real production bug), `23-ruling9.*` and `23-ruling9-schedule.*`.

## Validation (all at HEAD `743586efe`)

| Check | Command | Result |
|---|---|---|
| TypeScript | `pnpm run typecheck` | exit 0 |
| Lint | `pnpm run lint` | exit 0 |
| Tests + coverage | `pnpm test:coverage` (17 projects) | exit 0. All 17 green: web 13252, api 8180, domain 3151, adapters 3000, validators 2809, root 2571, ai-worker 2245, application 1499, ui 1252, integration 507 (+50 skipped), db 237 (+5 skipped), others 270 |
| Diff coverage | `node scripts/check-diff-coverage.mjs` | 95.6% (2517/2633) against the 80% floor |
| Build | `pnpm --filter ./apps/web build`, `pnpm --filter ./apps/api build` | exit 0 / exit 0 |
| Integration | `scripts/test-db.mjs run -- vitest run --project integration tests/integration/task-automation.test.ts` | 46/46 |

The first coverage run at HEAD failed one root test. `infra-skip-gate` flagged `ai-monitoring-redis-bridge.test.ts` as executing 0 tests, because the `intelliflow-redis-test` container had not come back after the 18:11 reboot. The container was restarted (`docker start`) and the full run repeated: exit 0. The file is untouched by this branch.

**Coverage AFTER**: `artifacts/coverage/PG-208-after.json`. The changed source files aggregate to 94.5% lines, 93.9% statements, 93.7% functions and 86.5% branches. Domain package: 95.43% lines. The BEFORE snapshot came from a stale committed baseline, so compare per-file values, not package totals.

## Reviews

| Review | Result |
|---|---|
| a11y-expert | PASS WITH FIXES, all fixed (`79cb2fcf8`) |
| security-lead | PASS WITH FIXES. M1 and L1–L9 fixed (`15cd8bca5`). L8 and trusted-hop IP are tracked in #960. The pre-existing OWNER scope issue is tracked in #959. |
| Codex | 11 rounds, about 25 fixes. Converged under ruling 9. The two remaining findings are waived with an expiry and tracked: #968 (lead converting into an existing account) and #969 (purge throughput). |
| /code-review quick | Run 20261021-153453-bb1087b4: 0 TS errors, lint clean |
| STOA Foundation / Domain / Security | PASS / NEEDS_HUMAN / FAIL. See `matop/summary.md`. The Security FAIL is the dependency audit only, kept verbatim under ruling 10, and tracked in #974. |
| Compliance | NEEDS_HUMAN, no blocking failures (`matop/compliance-check.md`) |

Out-of-scope findings are tracked on all three surfaces: GitHub issues #937–#954, #959, #960, #968, #969 and #974; the debt ledger; and the findings doc (T1–T20).

## Deviations from the plan

1. **Locking.** Every admission path, `create` included, uses `pg_advisory_xact_lock` instead of `SELECT … FOR UPDATE` on the settings row (ruling 8). `runNow` keeps its own cap check under the same lock key (Domain STOA finding F3), as the plan specified.
2. **Typed view contracts.** The router uses select allow-lists and explicit return types instead of `.output()` Zod schemas. The router tests assert that no secret fields are returned.
3. **:5433 migration.** Applied with `db execute` + `migrate resolve` instead of `migrate deploy`; the reason is above.
4. **Four additive columns or indexes after the SQL review.** All are on the new tables and were approved by the runner.

## 2026-10-22 update

The owner pointed out that the four NEEDS_HUMAN items were not human-only. Each one was resolved:

1. **Lighthouse ≥ 90 on `/tasks/automation` (AC-TA-019): met.** The authenticated LHCI harness ran against the real page:
   - Final URL `/tasks/automation`, 3 runs: performance 0.93 / 0.94 / 0.93, accessibility 0.93 / 0.93 / 0.93.
   - The harness signed in as the seeded `admin@intelliflow.dev` against a local Supabase (auth only; the repo's Supabase migrations fail on this host's pgvector, so they were disabled in a scratch workdir).
   - The API and web production builds ran over an ephemeral, seeded DB, with three real rules created through `taskAutomation.create`.
   - Reports and setup: `artifacts/lighthouse/PG-208/auth/` and `waiver-evidence.md`.
   - KPI pass (performance and accessibility only, PG-198 precedent): 0.93 / 0.93 / 0.95 and 0.93 ×3, in `auth-kpi/`. The median is `tasks-automation-auth.report.json`, and the completion guard (`check-lighthouse-evidence.mjs`) passes on it.
   - The harness's extra assertions (colour-contrast, TTI under 1 s) fail on shared nodes identical to PG-198's reports. Those are tracked in #871 and #540.
2. **Design screenshots: taken.** `artifacts/screenshots/PG-208/` holds `lg` and mobile captures plus the rule dialog.
   - They exposed a real layout defect: a webhook rule's extra actions squeezed its summary into a column about 120 px wide. It is fixed in `AutomationRuleList.tsx` (`sm:min-w-64` / `sm:max-w-md`).
   - They also exposed a pre-existing clipped-icon defect in shared components, filed as #978.
3. **Sonar: no human step.** The repo's Sonar guard over the whole branch diff (101 TS/TSX files) passes. SonarCloud analyses the PR in CI after push.
4. **#974: fixed on main by the runner (#975).**
   - PG-208 merged `origin/main` in `5f11ac307`. Conflicts kept both sides; the lockfile auto-merged and passes a frozen install.
   - PG-203's merge-aware pre-commit (#977) is carried byte-identical, so #903's existing `@ts-expect-error` is not counted as new.
   - `pnpm audit --prod --audit-level high` now exits 0. The Security STOA re-run is PASS.
   - The 2 remaining moderate advisories are inherited from main and tracked: #876 (sprintf-js) and #979 (hono).

**Post-merge validation (HEAD `5f11ac307`):**
- typecheck and lint exit 0;
- `pnpm test:coverage`: every project green except one web test, `ia-reconciliation` "API Router count". Each side added a router, but the merged header said 71; it is fixed to 72;
- the page, settings-search and all `src/app/__tests__` reconciliation suites re-run: 25 files, 312 tests pass;
- diff coverage 95.6%;
- integration 46/46 on an ephemeral DB with main's migrations;
- migrate diff shows only the pre-existing drift (#953);
- web and API builds pass on the merged tree.

Evidence: `matop/gates/merge-*.txt`.

## 2026-10-22 pre-ship Codex finding (stale schedule actions)

The runner's pre-ship push of `f0996c669` was blocked by one MEDIUM Codex finding: `claimSlotAndAdmit` admitted a schedule run with the actions `findDueSchedules` had read earlier, so an action edit committed between that read and the claim was ignored (the router keeps `nextRunAt` when the cadence is unchanged).

- **Fix**: after the conditional claim, which row-locks the rule, the store reads the rule's current actions inside the same transaction and admits the run with them. The test fake mirrors this.
- **RED then GREEN**: a unit test (`task-automation-store.test.ts`) and a real-DB regression (`tests/integration/task-automation.test.ts`, "admits a schedule run with actions edited after the due read") that edits the actions between `findDueSchedules` and the claim. Both failed on the old behaviour and pass now. Logs: `attestations/PG-208/red-green/24-*`.
- **Re-run**: API task tests 296/296; integration 47/47 on an ephemeral DB; API typecheck and ESLint on the changed files pass.

**Follow-up at the runner's request: every admission path.** Event and webhook admission (and Test Rule) had the same gap: they snapshotted actions read before the admission transaction, and the event tick caches its rules for the whole batch.

- **Fix**: the shared admission (`admitRun`, `claimSlotAndAdmit`) and Test Rule (`runNow`) read the rule inside the transaction, under the tenant admission lock, with `SELECT "actions", "isActive" ... FOR SHARE` (`lockRuleForAdmission`). The run snapshots those actions. A rule deactivated or deleted since the caller's read admits nothing: the store returns `inactive`, the engine skips it, the webhook answers the same 404 as an unknown token, and Test Rule refuses with PRECONDITION_FAILED. The schedule-specific read from the previous fix is folded into this.
- **RED then GREEN**: 8 unit tests (store, engine event path, webhook, Test Rule) and 3 real-DB tests (event and webhook actions edited after the read; a deactivated rule). All failed on the old behaviour and pass now. Logs: `attestations/PG-208/red-green/25-*`.
- **Re-run**: API task tests 303/303; integration 50/50 on an ephemeral DB; API typecheck, ESLint and prettier on the changed files pass.

## NEEDS_HUMAN

None.
