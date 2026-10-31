# Execution Plan: PG-208 — Module Settings: Task Automation

**Spec:** `.specify/sprints/sprint-18/specifications/PG-208-spec.md` (APPROVED, `/spec-consensus` 5/5 in 1 round; Round 4
modifications M1-M13 are binding) · **Sprint:** 18 · **Branch:** `feat/pg-208-task-automation` · **Owner rulings:**
`.specify/sprints/sprint-18/context/PG-208/PG-208-owner-ruling.md` (1-7) · **ADR:** ADR-084 (Proposed → Accepted at
Step 25) · **PRD:** `docs/planning/prd-module-settings.md` (PG-208 Addendum, Draft → In Progress at Step 8 → Delivered
at Step 25)

> **PRISMA MIGRATION (L13):** `packages/db/prisma/migrations/20261020120000_task_automation/` is additive Class A (four
> new tables, no existing table altered, no backfill). The production apply is manual (`prisma migrate deploy`, by the
> runner session `projects-8c` after merge) and must happen **before** the API is promoted. Called out in the final
> report, attestation, PR body and the runner message.

**Hexagonal layer:** full stack — Domain → Validators → Database → Adapters/Application → API (router + runtime) → UI.
**Dependency chain:** `docs/architecture/diagrams/complete-dependency-chains.md` ("Task Automation (PG-208 — ADR-084)"
section added at spec time; ⏳ → ✅ at Step 25). **Prerequisites:** PG-178 ✅, PG-191 ✅ (verified below).

## Runner constraints (apply to every step)

- Node 24 (`.nvmrc` = 24, CI 24.21.0): prefix every command with `export
  PATH=/c/Users/talys/ops/node24/node-v24.21.0-win-x64:/c/Users/talys/AppData/Roaming/nvm/v22.14.0:$PATH; export
  NODE_OPTIONS=--max-old-space-size=8192;` (portable Node 24.21.0 first, pnpm 10.33.0 shim from the nvm dir; host
  default Node 25 hangs pg writes). *(Corrected at exec start: the plan said Node 22, but the repo pins 24.)*
- One test process at a time. Single-file vitest runs may run directly; full package suites, builds and DB tests go
  through `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-208 -- <cmd>`; DB-backed runs add
  `--exclusive intelliflow-db`. Shared :5433 / :6380 containers are never stopped or reset.
- `@intelliflow/web`'s `test` script is watch-mode, so web runs always use `vitest run`.
- `pnpm --filter` always uses `./` paths (a bare name that matches nothing exits 0).
- Never pipe a gate into `tail`/`head`; write logs to files (`.txt`, never `.log` — L14) and read them.
- Commits: small and per layer, staged by name, message via `-F`, hooks on, no AI attribution; `bash .gitleaks/scan.sh
  staged` before each commit. No secret-shaped strings anywhere: tokens/secrets/signatures built at runtime
  (`randomBytes(32)`, `'x'.repeat(43)`), URLs `https://crm.example.invalid/...`, docs use `<secret>` / `<unix>` /
  `<hex>` placeholders.
- Never `.env.local` `DATABASE_URL`/`DIRECT_URL`. Committed `.env.test` targets `localhost:5433/intelliflow_test`.
  `packages/db/prisma.config.ts` reads `DIRECT_URL ?? DATABASE_URL` from the process env (dotenv from the cwd), **not**
  `.env.test`, so every DB command is run as **LOCALDB**: `set -a; eval "$(grep -E
  '^(DB_USER|DB_PASSWORD|DATABASE_URL|DIRECT_URL|TEST_DATABASE_URL)=' .env.test)"; set +a; export
  DIRECT_URL="$DATABASE_URL"; node tools/scripts/guard-db-target.mjs "<op>"` (must report localhost/127.0.0.1:5433)
  followed by the command. *(Exec: sourcing the whole `.env.test` fails at its `<local-supabase-key>` placeholder, so
  only the DB lines are loaded.)*
- Before SHIP: `git ls-files | grep -cE '\.(log|coverage|tsbuildinfo)$'` = 0 (L14).
- Every timestamp written comes from `date -u` at that moment. A RED claim needs a saved failing log.
- Clock rule (spec Test Requirements): time-dependent tests use `vi.useFakeTimers({ toFake: ['Date'] })` +
  `vi.setSystemTime(NOW)` around the call, `vi.useRealTimers()` in `afterEach`, fixtures relative to `NOW`.

## Preflight Checks

- [x] `git branch --show-current` = `feat/pg-208-task-automation`; tree clean except PG-208 files.
- [x] `docker ps --filter name=postgres-test --format "{{.Status}}"` contains `healthy`.
- [x] Packages built (`ls packages/{domain,validators,db,application,adapters}/dist`).
- [x] Exec preflights: `node tools/scripts/exec-preflight/check-plan-reviewer-subagent.mjs PG-208`,
      `node tools/scripts/exec-preflight/check-page-doc-cochange.mjs PG-208`,
      `node tools/scripts/exec-preflight/check-nav-wiring.mjs PG-208` (known false PASS on `(list)` routes, #877 — the
      route is already linked from `sidebar/configs/tasks.ts:7`, verified by hand),
      `node tools/scripts/exec-preflight/check-exec-readiness.mjs PG-208` (logs under the run's `matop/gates/`).
- [x] Context acknowledgement (files read + SHA-256; CSV EVIDENCE artifact).
- [x] Coverage BEFORE snapshot via `/exec-coverage` → `artifacts/coverage/PG-208-before.json`.
- [x] Verify `convertLead` sets `Contact.leadId` (`LeadService.ts:383-391`) and publishes account, contact and lead
      events in one call (`:415-423`) — the ruling-7 suppression depends on it.
- [x] Verify the API role bypasses non-forced RLS on the **local test DB** (`SELECT rolbypassrls FROM pg_roles WHERE
      rolname = current_user` or table ownership), as ADR-078 records — the engine's tenant-less reads depend on it.

**Files to Create:**
- `.specify/sprints/sprint-18/attestations/PG-208/context_ack.json`

## Dependencies Verified

| Dependency | Claim | Verified | Method |
|---|---|---|---|
| PG-178 | module settings shell + per-module pages | TRUE | `apps/web/src/components/shared/module-settings-shell.tsx`; attestation COMPLETE |
| PG-191 | `taskSettings` router registered | TRUE | `apps/api/src/router.ts:22,158` |
| PG-191 | `TaskSettings` model, task-settings page | TRUE | `schema.prisma:2466-2477`; `apps/web/src/app/tasks/(list)/task-settings/page.tsx` |
| PG-191 | settings consumed at runtime | FALSE (pre-existing) | tracked at Step 19; PG-208 does not depend on it |

## Implementation Reality Checks

| Surface | Production Consumer | Replaces / Blocks | Verification Command |
|---|---|---|---|
| `taskAutomation.*` router | `TaskAutomationContent` + dialogs | "coming soon" stub `automation/page.tsx:1-18` | `pnpm --filter ./apps/web exec vitest run "src/app/tasks/(list)/automation"` |
| `registerTaskAutomationEventIntake` | `startApiServer` after `containerReady` (interval > 0) | — | `pnpm --filter ./apps/api exec vitest run src/__tests__/http-server.task-automation-runner.test.ts` |
| `startTaskAutomationRunner` / `stopTaskAutomationRunner` | `startApiServer` / `main.ts` SIGTERM | — | same + `pnpm --filter ./apps/api exec vitest run src/main.test.ts` |
| `handleTaskAutomationWebhook` | `http-server.ts` `handleRequest` before the global body read (`:495`) | — | `pnpm --filter ./apps/api exec vitest run src/__tests__/http-server.task-automation-webhook.test.ts` |
| `TaskService.assignTask` | engine `ASSIGN_ROUND_ROBIN` | `Task.assignTo` had no caller | `pnpm --filter ./packages/application exec vitest run src/services/__tests__/TaskService.test.ts` |
| `PrismaTaskRepository.toDomain` | all 11 reconstitute sites | silently dropped `assigneeId` | `pnpm --filter ./packages/adapters exec vitest run src/repositories/__tests__/PrismaTaskRepository.test.ts` |
| task list/getById owner-or-assignee | `TaskList`, task detail page | owner-only visibility (ruling 6) | `pnpm --filter ./apps/api exec vitest run src/modules/task/__tests__/task.router.test.ts` |
| shared `ScheduleCadenceFields` | PG-208 rule dialog + PG-201 `ScheduleDialog` | private `CadenceFields` | `pnpm --filter ./apps/web exec vitest run src/app/analytics/scheduled-reports` |
| shared `MemberMultiSelect` | PG-208 rule dialog + PG-197 `TerritoryDialog` | page-local copy | `pnpm --filter ./apps/web exec vitest run "src/app/accounts/(list)/territory-mapping"` |
| `task_automation` notification type | engine NOTIFY + failure notice; web `notification-utils.ts` mapping | — | `pnpm --filter ./packages/validators exec vitest run src/__tests__/notifications.test.ts` |
| Sentry path scrub | `tracing/sentry.ts` `beforeSend` / `beforeBreadcrumb` | token leak in URLs | `pnpm --filter ./apps/api exec vitest run src/tracing/sentry.test.ts` |

## Navigation & Reachability

| Route | Sidebar Entry | Parent Link | Breadcrumb | Reachable? |
|---|---|---|---|---|
| `/tasks/automation` | `apps/web/src/components/sidebar/configs/tasks.ts:7` (`id: 'automation'`, existing) | `apps/web/src/components/tasks/TaskSettingsPanel.tsx:23-29` (existing) | PageHeader Tasks › Automation (Step 16) | YES — asserted by `tasks-config.test.ts` (sidebar item + `TaskSettingsPanel` href, Step 7), because `check-nav-wiring` false-PASSes on `(list)` routes (#877) |

The page replaces the existing stub in place; no new route, no sidebar change.

## Estimated Effort

| Phase | Files | Estimate |
|---|---|---|
| RED (tests) | 27 new test files + 14 modified test files | 7-10 h |
| GREEN (implementation) | 26 new source files + 1 migration + 22 modified source files | 12-17 h |
| REFACTOR + docs/registries | 19 doc/registry/tracking files | 2-3 h |
| VALIDATION (gates, integration, reviews, Lighthouse, STOA, attestation) | — | 3-5 h |
| **Total** | | **24-35 h** (CSV O/M/P 180/360/540 min, PERT 360 min, predates owner ruling 1 = all three triggers) |

## Files Summary

**Files to Create (57):**

Source (26):
- `packages/domain/src/crm/task/automation/task-automation-constants.ts`
- `packages/domain/src/crm/task/automation/index.ts`
- `packages/validators/src/task-automation.ts`
- `apps/api/src/modules/task/task-automation.router.ts`
- `apps/api/src/modules/task/automation/task-automation-store.ts`
- `apps/api/src/modules/task/automation/task-automation-event-intake.ts`
- `apps/api/src/modules/task/automation/task-automation-engine.ts`
- `apps/api/src/modules/task/automation/task-automation-runner.ts`
- `apps/api/src/modules/task/automation/task-automation-webhook.ts`
- `apps/api/src/modules/task/automation/task-automation-admin.ts` (role gate + denial audit)
- `apps/web/src/app/tasks/(list)/automation/TaskAutomationContent.tsx`
- `apps/web/src/app/tasks/(list)/automation/TaskAutomationLoading.tsx`
- `apps/web/src/app/tasks/(list)/automation/loading.tsx`
- `apps/web/src/app/tasks/(list)/automation/components/AutomationRuleList.tsx`
- `apps/web/src/app/tasks/(list)/automation/components/AutomationRuleDialog.tsx`
- `apps/web/src/app/tasks/(list)/automation/components/TriggerFields.tsx`
- `apps/web/src/app/tasks/(list)/automation/components/ActionFields.tsx`
- `apps/web/src/app/tasks/(list)/automation/components/WebhookSecretDialog.tsx`
- `apps/web/src/app/tasks/(list)/automation/components/RecentRunsDialog.tsx`
- `apps/web/src/app/tasks/(list)/automation/components/DeleteAutomationRuleDialog.tsx`
- `apps/web/src/app/tasks/(list)/automation/components/AutomationSettingsCard.tsx`
- `apps/web/src/app/tasks/(list)/automation/components/TagsTab.tsx`
- `apps/web/src/app/tasks/(list)/automation/task-automation-labels.ts` (event/outcome/trigger labels)
- `apps/web/src/components/shared/copy-field.tsx`
- `apps/web/src/components/shared/schedule-cadence-fields.tsx`
- `apps/web/src/components/shared/member-multi-select.tsx` (moved from territory-mapping; old file deleted)

Migration (1):
- `packages/db/prisma/migrations/20261020120000_task_automation/migration.sql`

Tests (27):
- `packages/domain/src/crm/task/automation/__tests__/task-automation-constants.test.ts`
- `packages/validators/src/__tests__/task-automation.test.ts`
- `apps/api/src/modules/task/__tests__/task-automation.router.test.ts`
- `apps/api/src/modules/task/automation/__tests__/task-automation-admin.test.ts`
- `apps/api/src/modules/task/automation/__tests__/task-automation-store.test.ts`
- `apps/api/src/modules/task/automation/__tests__/task-automation-event-intake.test.ts`
- `apps/api/src/modules/task/automation/__tests__/task-automation-engine.test.ts`
- `apps/api/src/modules/task/automation/__tests__/task-automation-runner.test.ts`
- `apps/api/src/modules/task/automation/__tests__/task-automation-webhook.test.ts`
- `apps/api/src/__tests__/http-server.task-automation-webhook.test.ts`
- `apps/api/src/__tests__/http-server.task-automation-runner.test.ts`
- `tests/integration/task-automation.test.ts`
- `apps/web/src/app/tasks/(list)/automation/__tests__/page.test.tsx`
- `apps/web/src/app/tasks/(list)/automation/__tests__/TaskAutomationContent.test.tsx`
- `apps/web/src/app/tasks/(list)/automation/__tests__/TaskAutomationLoading.test.tsx`
- `apps/web/src/app/tasks/(list)/automation/components/__tests__/AutomationRuleList.test.tsx`
- `apps/web/src/app/tasks/(list)/automation/components/__tests__/AutomationRuleDialog.test.tsx`
- `apps/web/src/app/tasks/(list)/automation/components/__tests__/WebhookSecretDialog.test.tsx`
- `apps/web/src/app/tasks/(list)/automation/components/__tests__/RecentRunsDialog.test.tsx`
- `apps/web/src/app/tasks/(list)/automation/components/__tests__/DeleteAutomationRuleDialog.test.tsx`
- `apps/web/src/app/tasks/(list)/automation/components/__tests__/AutomationSettingsCard.test.tsx`
- `apps/web/src/app/tasks/(list)/automation/components/__tests__/TagsTab.test.tsx`
- `apps/web/src/components/shared/__tests__/copy-field.test.tsx`
- `apps/web/src/components/shared/__tests__/schedule-cadence-fields.test.tsx`
- `apps/web/src/components/shared/__tests__/variable-picker.test.tsx`
- `apps/web/src/components/shared/__tests__/member-multi-select.test.tsx` (moved from territory-mapping; old file deleted)
- `apps/web/src/components/sidebar/__tests__/tasks-config.test.ts`

Evidence/docs (3):
- `.specify/sprints/sprint-18/attestations/PG-208/context_ack.json`
- `.specify/sprints/sprint-18/findings/PG-208-findings.md`
- `.specify/sprints/sprint-18/attestations/PG-208/red-green/red-green-index.md` (+ the `NN-<layer>.red.txt` /
  `.green.txt` files it indexes)

**Files to Modify (55):**

Source (22):
- `packages/domain/src/index.ts`
- `packages/validators/src/index.ts`
- `packages/validators/src/notifications.ts`
- `packages/db/prisma/schema.prisma`
- `packages/db/src/index.ts`
- `packages/db/src/field-encryption.ts`
- `packages/adapters/src/repositories/PrismaTaskRepository.ts`
- `packages/application/src/services/TaskService.ts`
- `apps/api/src/router.ts`
- `apps/api/src/modules/task/task.router.ts`
- `apps/api/src/http-server.ts`
- `apps/api/src/main.ts`
- `apps/api/src/tracing/sentry.ts`
- `.env.example` (`API_PUBLIC_URL`, `TASK_AUTOMATION_INTERVAL_MS` documented, placeholder values only)
- `apps/web/src/app/tasks/(list)/automation/page.tsx`
- `apps/web/src/components/shared/variable-picker.tsx`
- `apps/web/src/app/analytics/scheduled-reports/components/ScheduleDialog.tsx`
- `apps/web/src/app/accounts/(list)/territory-mapping/components/TerritoryDialog.tsx`
- `apps/web/src/app/accounts/(list)/territory-mapping/components/TerritoryList.tsx`
- `apps/web/src/components/notifications/notification-utils.ts`
- `apps/web/src/components/tasks/TaskSettingsPanel.tsx`
- `apps/web/src/lib/shared/settings-search.ts`

Tests (14):
- `packages/validators/src/__tests__/notifications.test.ts`
- `packages/db/src/__tests__/field-encryption.test.ts`
- `packages/db/src/__tests__/field-encryption-extension.test.ts`
- `packages/adapters/src/repositories/__tests__/PrismaTaskRepository.test.ts`
- `packages/application/src/services/__tests__/TaskService.test.ts`
- `apps/api/src/modules/task/__tests__/task.router.test.ts`
- `apps/api/src/__tests__/app-router.smoke.test.ts`
- `apps/api/src/main.test.ts`
- `apps/api/src/tracing/sentry.test.ts`
- `apps/web/src/lib/shared/__tests__/settings-search.test.ts`
- `apps/web/src/components/notifications/__tests__/notification-utils.supplementary.test.ts`
- `apps/web/src/app/accounts/(list)/territory-mapping/components/__tests__/TerritoryDialog.test.tsx` (import path only,
  if it imports MemberMultiSelect)
- `apps/web/src/app/accounts/(list)/territory-mapping/components/__tests__/TerritoryList.test.tsx` (mock path only, if
  needed)
- `packages/validators/__tests__/enum-consistency.spec.ts` (only if the new enums are registered there)

Docs/registries/tracking (19):
- `docs/design/ui-flow-mapping.md`
- `docs/design/information-architecture.md`
- `docs/design/page-registry.md`
- `docs/design/sitemap.md`
- `docs/design/PAGE_MAP_AND_FLOWS.md`
- `docs/design/navigation-reachability-audit.md`
- `docs/architecture/diagrams/complete-dependency-chains.md`
- `docs/architecture/diagrams/core-crm-dependency-chain.md` (Task lane: automation router + runtime)
- `docs/planning/prd-module-settings.md`
- `docs/architecture/adr/ADR-084-task-automation-engine.md`
- `docs/architecture/adr/README.md`
- `docs/compliance-and-governance/compliance/wcag-conformance-statement.md`
- `docs/compliance-and-governance/compliance/vpat-2.5.md`
- `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv` (+ regenerated `Sprint_plan_J.csv`, which holds the row;
  diff the splits against main before push — `_I`/`_J` reset trap)
- `artifacts/metrics/debt-ledger.yaml`
- `.gitleaks.toml` (one-file allowlist entry for `attestations/PG-208/attestation.json` hash map, PG-198 precedent)
- `.specify/sprints/sprint-18/attestations/PG-208/task-tracking.json`
- `.specify/sprints/sprint-18/attestations/PG-208/attestation.json`
- `.specify/sprints/sprint-18/specifications/PG-208-spec.md` (delivery notes only, if a decision changes at exec)

**Files to Delete (2, moves):** `apps/web/src/app/accounts/(list)/territory-mapping/components/MemberMultiSelect.tsx`,
`apps/web/src/app/accounts/(list)/territory-mapping/components/__tests__/MemberMultiSelect.test.tsx` (moved to
`components/shared`, git mv).

**Totals:** create 57 (26 source + 1 migration + 27 tests + 3 evidence/docs) · modify 55 (22 source + 14 tests + 19
docs/registries/tracking) · delete 2 (moves). Conditional test entries (enum-consistency, territory test import/mock
paths) are touched only if they fail and are listed in the delivery report.

**Audit naming decision (no type change):** audit entries reuse `resourceType: 'task'` with the existing
`AuditAction` values (`CREATE` rule / manual run, `UPDATE` rule, activation, reorder, settings, tags, secret
rotate/regenerate with `metadata.operation`, `DELETE` rule/tag) and `logPermissionDenied('task', …)`, so
`apps/api/src/security/types.ts` and the five `rbac.ts` role maps stay unchanged.

**Evidence outputs (not counted):** `artifacts/coverage/PG-208-{before,after}.json`, `red-green/NN-*.{red,green}.txt`,
`.specify/sprints/sprint-18/execution/PG-208/<run>/` (`PG-208-delivery.md`, `matop/design-check.md`,
`matop/gates/*.txt`, `matop/stoa-verdicts/*.json`), `artifacts/lighthouse/PG-208/*`.

## CSV Alignment (Sprint_plan.csv row PG-208)

| CSV entry | In plan | Action at Step 18 (old → new recorded in the findings doc) |
|---|---|---|
| `ARTIFACT:` `automation/page.tsx` | Step 16 (modify) | keep |
| `ARTIFACT:` `TaskAutomationContent.tsx` | Step 16 (create) | keep |
| `ARTIFACT:` `task-automation.router.ts` | Step 12 (create) | keep |
| `ARTIFACT:` `packages/validators/src/task-automation.ts` | Step 9 (create) | keep |
| `EVIDENCE:` `context_ack.json` | Preflight (create) | keep |
| `FILE:` `sidebar/configs/tasks.ts` (pre-req) | read only — already links `/tasks/automation` (:7); new test Step 7 | keep as pre-req |
| `FILE:` `task-settings/page.tsx` (pre-req) | read only (page shape reference) | keep as pre-req |
| `FILE:` playbook, PRD (pre-req) | followed / PRD modified Steps 8, 25 | keep |
| plan-only artifacts (domain constants, runtime files, migration, web components) | Steps 8-16 | add as `ARTIFACT:` entries |
| KPI "phantom UI stub, no backend, no attestation; #615" | — | replace with the delivered KPI at Step 27 |

## Execution Steps

### Phase 1 — RED: Write Failing Tests

Each RED step: add the minimal export stub first (so the run fails on **assertions**, not missing modules), run the new
test file, save `NN-<layer>.red.txt` under `.specify/sprints/sprint-18/attestations/PG-208/red-green/`, commit the
tests. A RED that fails only on import/compile errors does not count.

#### Step 1: Domain tests (AC-TA-003, -004, -007, -008, -011)

**Files to Create:**
- `packages/domain/src/crm/task/automation/__tests__/task-automation-constants.test.ts`

- [x] `renderTaskTemplate`: allow-listed tokens; unknown token → empty; `{{webhook.constructor}}` / `{{webhook.toString}}`
      → empty (Map-based vars); control characters stripped; truncation at the field limit; empty title →
      `<event label> – <record type>`; no HTML interpretation (`<b>` kept as text).
- [x] `computeAutomationDueDate`: N = 0, 1, 365 → end of day in the given timezone; late-day boundary → ≥ now + 15 min;
      `null` → null; timezone variants (Europe/London, Pacific/Auckland, UTC) with a pinned clock (M5).
- [x] `pickRoundRobinAssignee`: wrap-around, negative cursor, members in pool order, empty list → null.
- [x] `canonicalRuleKey`: stable across key order / whitespace; differs by title template, pool order, recipients,
      filter; `null` for webhook triggers.
- [x] Event catalogue **contract**: each `TASK_AUTOMATION_EVENTS` entry's `eventType` and id field equal what the domain
      event class emits (`new LeadCreatedEvent(...)`, `LeadQualifiedEvent`, `LeadConvertedEvent`, `ContactCreatedEvent`,
      `OpportunityCreatedEvent`, `OpportunityStageChangedEvent`, `OpportunityWonEvent`, `OpportunityLostEvent`,
      `AccountCreatedEvent` → `.eventType`, `.toPayload()` keys); no `task.*` type present (ruling 4).
- [x] Role sets: `TASK_AUTOMATION_WEBHOOK_ADMIN_ROLES` excludes MANAGER; `lead.qualified` postcondition set =
      {QUALIFIED, NEGOTIATING, CONVERTED} (M2).

**Validation:**
- [x] `pnpm --filter ./packages/domain exec vitest run src/crm/task/automation/__tests__/task-automation-constants.test.ts`
      fails on assertions → `01-domain.red.txt`.

#### Step 2: Validator tests (AC-TA-003, -005, -015; DoD 9)

**Files to Create:**
- `packages/validators/src/__tests__/task-automation.test.ts`

**Files to Modify:**
- `packages/validators/src/__tests__/notifications.test.ts` (length 55 → 56, `task_automation` present)

- [x] Each trigger kind valid; `WEBHOOK` accepts no client token/secret.
- [x] `actions[0]` must be CREATE_TASK; repeated type "actions 1 and 3" with path `['actions', 2]`; out-of-order
      actions rejected; 1..3 actions.
- [x] `toStage` only with `opportunity.stage_changed`; CLOSED_WON / CLOSED_LOST refused.
- [x] Bounds: name 1..80 trimmed, title 1..200, description ≤ 2000, message ≤ 500, dueInDays 0..365 | null, pool 1..25
      deduped with order kept, notify ≥ 1 recipient and ≤ 10 users, tags ≤ 10.
- [x] `.strict()` rejects `tenantId`, `createdBy`, token, secret, `ruleKey`, `rrCursor`.
- [x] Update schema cannot change `trigger.type`.
- [x] Tag schemas: colour allowlist (18 tokens), name 1..50.
- [x] `findDuplicateTriggerActionRules`: finds identical active rules; ignores inactive and webhook rules.

**Validation:**
- [x] `pnpm --filter ./packages/validators exec vitest run src/__tests__/task-automation.test.ts src/__tests__/notifications.test.ts`
      fails → `02-validators.red.txt`.

#### Step 3: DB tests (AC-TA-015, -016, -017, -018)

**Files to Create:**
- `tests/integration/task-automation.test.ts`

**Files to Modify:**
- `packages/db/src/__tests__/field-encryption.test.ts` (map lists `TaskAutomationRule: ['webhookSecret',
  'webhookSecretPrevious']`)
- `packages/db/src/__tests__/field-encryption-extension.test.ts` (create/update encrypt, find decrypts, null passthrough
  for `webhookSecretPrevious`, `updateMany`)

- [x] Section A (`describe('constraints')`, green at Step 10). Integration (clone `contact-types.test.ts`):
      `ensureMigrationSql` keyed on `task_automation_tags_colorToken_check`,
      rebuilding runs → rules → settings → tags children-first under `applySchemaSql` (CI `db push`, L14).
- [x] Colour CHECK `it.each`, token list = validator constant; trigger-consistency CHECK one valid + one invalid row
      per trigger type; rules and tags `lower(name)` unique; partial unique `ruleKey` among active rules only;
      unique `(ruleId, idempotencyKey)`; composite FK rejects a run whose tenant differs from its rule's; RLS enabled on
      all four tables; cascade on rule delete; `createdBy` ON DELETE SET NULL.
- [x] Section B (`describe('store behaviour')`, green at Step 13): store behaviour on the real DB (imports
      `apps/api/src/modules/task/automation/task-automation-store.ts`): two
      concurrent `claimDueSchedule` on one slot → exactly one wins; two concurrent `claimPendingRuns` → disjoint sets;
      `insertRunIfAbsent` duplicate → `duplicate`; N concurrent `incrementRrCursor` → N distinct values;
      `purgeRunsBefore` removes only older rows; `reapStaleRuns` only RUNNING older than the cutoff.
- [x] Section A also asserts: with a runtime-generated `PRISMA_FIELD_ENCRYPTION_KEY`, a stored `webhookSecret` starts
      with `v1:`.
- [x] Section C (`describe('webhook verifier')`, green at Step 14): a plaintext secret written directly makes the webhook
      verifier answer 503 (M11).
- [x] Section A: unscoped `findUnique` on `task_automation_rules` works with the API role (RLS not forced; ADR-084).

**Validation:**
- [x] LOCALDB + `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-208 --exclusive intelliflow-db -- pnpm exec
      vitest run --project integration tests/integration/task-automation.test.ts` fails (tables absent) →
      `03-db.red.txt`.
- [x] `pnpm --filter ./packages/db exec vitest run src/__tests__/field-encryption.test.ts src/__tests__/field-encryption-extension.test.ts`
      fails → appended to `03-db.red.txt`.

#### Step 4: Adapters + application tests (AC-TA-008)

**Files to Modify:**
- `packages/adapters/src/repositories/__tests__/PrismaTaskRepository.test.ts`
- `packages/application/src/services/__tests__/TaskService.test.ts`

- [x] Real `PrismaTaskRepository` over mocked Prisma: `assigneeId` in `save` args; returned by `findById`, `findByIds`,
      `findByOwnerId` and every other reader (11 sites); a `bulkComplete`-style load + save keeps the assignee.
- [x] `TaskService.createTask` with `assigneeId` persists it; `assignTask` emits `task.assigned` with actor
      `system:task-automation`; a task of another tenant → NotFound, no save; relative due dates only.

**Validation:**
- [x] `pnpm --filter ./packages/adapters exec vitest run src/repositories/__tests__/PrismaTaskRepository.test.ts` and
      `pnpm --filter ./packages/application exec vitest run src/services/__tests__/TaskService.test.ts` fail →
      `04-adapters-application.red.txt`.

#### Step 5: API router tests (AC-TA-002, -003, -005, -006, -009, -014..-018)

**Files to Create:**
- `apps/api/src/modules/task/__tests__/task-automation.router.test.ts`
- `apps/api/src/modules/task/automation/__tests__/task-automation-admin.test.ts`

**Files to Modify:**
- `apps/api/src/modules/task/__tests__/task.router.test.ts`
- `apps/api/src/__tests__/app-router.smoke.test.ts` (new `taskAutomation` block naming every procedure)

- [x] Admin gate: USER → FORBIDDEN, no writes, `logPermissionDenied` called (`.catch` swallowed); MANAGER allowed for
      event/schedule rules, FORBIDDEN for webhook create / rotate / regenerate.
- [x] Cross-tenant negative on **every mutation** (`update`, `delete`, `setActive`, `reorder`, `rotateWebhookSecret`,
      `regenerateWebhookUrl`, `runNow`, `tags.update`, `tags.delete`, `listRuns`): lookup-first NOT_FOUND asserting
      `where: { id: FOREIGN, tenantId }` and the write `not.toHaveBeenCalled()`; P2025 inside `$transaction` → NOT_FOUND.
- [x] P2002 → CONFLICT for name and for `ruleKey`; generic error rethrown; `$transaction` mocked per test (playbook §12).
- [x] `create`: cap 50 counted inside the transaction; foreign pool / notify user → BAD_REQUEST; unknown tag →
      BAD_REQUEST; tag stored with catalogue casing; cadence below the minimum → BAD_REQUEST; `nextRunAt` from the
      pinned now; webhook → `{webhookUrl, signingSecret}` from plaintext (not the returned row), token `tat_` + 43
      chars, hash stored; `API_PUBLIC_URL` unset → PRECONDITION_FAILED for `create`, `rotateWebhookSecret` **and**
      `regenerateWebhookUrl` (M10).
- [x] Strict limiter: the 11th call within a minute to each of `create`, `rotateWebhookSecret`, `regenerateWebhookUrl`,
      `runNow` → TOO_MANY_REQUESTS (limiter mocked); other procedures are not wrapped.
- [x] `settings.get` returns defaults when no row exists; `settings.update` USER → FORBIDDEN, admin upserts by
      `tenantId`, bounds 1..500 enforced.
- [x] `list` / `listRuns` outputs never contain `webhookSecret*`, `webhookTokenHash`, `ruleKey` (select allow-list +
      output schema); `listRuns` USER → FORBIDDEN.
- [x] `setActive` recomputes `nextRunAt` from now; `update` cannot change trigger type; `reorder` with a foreign or
      missing id refused.
- [x] `rotateWebhookSecret` keeps the previous secret with expiry `NOW + 24 h`; `revokePrevious: true` clears it;
      `regenerateWebhookUrl` replaces the hash.
- [x] `runNow`: refused for ENTITY_EVENT, inactive rule, automation disabled; SCHEDULE and WEBHOOK enqueue
      `manual:<uuid>` (stubbed `randomUUID`) and count toward caps.
- [x] `resetToDefaults` updates settings only (rules/tags untouched); `tags.update` rename and `tags.delete` rewrite
      rules' `tags` in the same transaction.
- [x] Audit entries for create/update/delete/activate/rotate/regenerate/runNow/settings/tags without template text or
      secrets.
- [x] Ruling 6 (M1): non-admin `list` returns owned or assigned tasks with search still applied
      (`AND: [{ OR: [{ownerId}, {assigneeId}] }]`), manager `ownerId: { in }` case, `getById` returns an assigned task,
      a task neither owned nor assigned stays NOT_FOUND, another tenant's assigned task stays hidden.

**Validation:**
- [x] `pnpm --filter ./apps/api exec vitest run src/modules/task/__tests__/task-automation.router.test.ts src/modules/task/automation/__tests__/task-automation-admin.test.ts src/modules/task/__tests__/task.router.test.ts`
      fails → `05-api.red.txt`.

#### Step 6: Runtime tests (AC-TA-004..-013, -016, -017)

**Files to Create:**
- `apps/api/src/modules/task/automation/__tests__/task-automation-store.test.ts`
- `apps/api/src/modules/task/automation/__tests__/task-automation-event-intake.test.ts`
- `apps/api/src/modules/task/automation/__tests__/task-automation-engine.test.ts`
- `apps/api/src/modules/task/automation/__tests__/task-automation-runner.test.ts`
- `apps/api/src/modules/task/automation/__tests__/task-automation-webhook.test.ts`
- `apps/api/src/__tests__/http-server.task-automation-webhook.test.ts`
- `apps/api/src/__tests__/http-server.task-automation-runner.test.ts`

**Files to Modify:**
- `apps/api/src/main.test.ts` (SIGTERM calls `stopTaskAutomationRunner`)
- `apps/api/src/tracing/sentry.test.ts` (M12: `event.request.url`, `event.transaction`, span description,
  `breadcrumb.data.url` / `data.to` with a runtime-built token come out scrubbed)

- [x] Store (prismaMock): each function's branches — `updateMany` count 0 vs 1, P2002 → duplicate, select allow-lists,
      `loadWebhookRule` uses `findUnique` by hash (never raw SQL), injected `now` in every time filter.
- [x] Intake: handler never throws (buffer full → drop-oldest + metric, malformed event, unwatched type), maps each v1
      event via `toPayload`, ignores task events, records `lead.converted` correlation ids; watched set primed before
      registration (M7); **business write survives**: real `InMemoryEventBus`, failing buffer, publish inside a
      transaction-like callback resolves.
- [x] Engine (in-memory fake store, pinned clock): drain — tenant from the record row; missing record retried until
      30 s (clock advanced) then dropped with a warn + metric; postconditions (`lead.qualified` status set, converted,
      won/lost); `stage_changed` CLOSED_* → won/lost rules; conversion-born contact (`leadId` set, incl. a manual contact
      with `leadId`, M6) and correlated account → SKIPPED `covered_by_lead_conversion`; tenant-B rule never matched for
      a tenant-A record; cap checked once per rule per tick, over cap → no row + `suppressedCount` (M8); drain ≤ 500;
      duplicate insert idempotent. Schedule — due / not due / boundary / behind-by-many → one run; Europe/London DST;
      invalid cron deactivates only that rule. Execute — owner chain (record owner → creator → SKIPPED
      `no_eligible_owner`); round-robin in pool order, ineligible member skipped, empty pool → owner with
      `pool_empty_fallback_owner`, cursor incremented even when the later write fails; link fallback (converted lead,
      closed deal, foreign contact id) → unlinked + `link_fallback_unlinked`; due date never past; notify recipients
      de-duplicated and live-filtered, orchestrator `filtered` = success, notify failure → SUCCEEDED `notify_failed`;
      timezone resolution: schedule rule → `scheduleTimezone`, other rules → UTC (Tenant has no timezone column, M5);
      action failure → FAILED safe code; failure notification only when the toggle is on and the creator is live;
      batch ≤ 50; per-tenant cap; stale RUNNING → `interrupted`; purge boundary `NOW − 30 d`.
- [x] Runner: interval from an explicit env object (test / VERCEL / Lambda / `0` / invalid → default 15 000);
      skip-if-running; a thrown tick keeps the interval; `stopTaskAutomationRunner` in `afterEach`.
- [x] Webhook handler: 202 + run; duplicate same body → `duplicate: true`; same key different body → 409; changed
      Idempotency-Key with the old signature → 401; missing / malformed / non-numeric `t` / duplicate `v1` / uppercase
      hex / short signature / stale 299-300-301 s → 401, nothing written; unknown / inactive / disabled / malformed
      token → identical 404 (status, body, headers); previous secret valid before expiry, invalid after and after
      `revokePrevious`; unencrypted secret → 503; non-object JSON → 400; per-rule cap → 429; IP failure limiter counts
      404s and 401s (M9), keyed on the rightmost forwarded hop → `x-real-ip` → `'unknown'` (one test per branch),
      and many valid signed requests from one IP are never limited; variables = own keys only, only
      referenced keys stored; real `encryptField`/`decryptField` round-trip with a runtime key; console/logger spy over
      202, 401 and a thrown error finds no token, secret or signature substring.
- [x] http-server route (real server): mounted at `/api/webhooks/task-automation/<token>` and `/webhooks/…`; GET → 405
      with `Allow: POST`; streamed body > 64 KB → 413 with `Connection: close` before the whole body is read (M3); no
      CORS headers on POST; `OPTIONS` on the webhook path gets no CORS allow headers; other routes' bodies unchanged.
- [x] http-server runner wiring (clone `http-server.approval-sweep.test.ts`): `startApiServer` starts the runner and
      registers the intake when the interval > 0; `createApiServer` does neither; interval 0 registers nothing.

**Validation:**
- [x] `pnpm --filter ./apps/api exec vitest run src/modules/task/automation src/__tests__/http-server.task-automation-webhook.test.ts src/__tests__/http-server.task-automation-runner.test.ts src/main.test.ts src/tracing/sentry.test.ts`
      fails → `06-runtime.red.txt`.

#### Step 7: Web tests (AC-TA-001, -002, -012..-015, -019)

**Files to Create:**
- `apps/web/src/app/tasks/(list)/automation/__tests__/page.test.tsx`
- `apps/web/src/app/tasks/(list)/automation/__tests__/TaskAutomationContent.test.tsx`
- `apps/web/src/app/tasks/(list)/automation/__tests__/TaskAutomationLoading.test.tsx`
- `apps/web/src/app/tasks/(list)/automation/components/__tests__/AutomationRuleList.test.tsx`
- `apps/web/src/app/tasks/(list)/automation/components/__tests__/AutomationRuleDialog.test.tsx`
- `apps/web/src/app/tasks/(list)/automation/components/__tests__/WebhookSecretDialog.test.tsx`
- `apps/web/src/app/tasks/(list)/automation/components/__tests__/RecentRunsDialog.test.tsx`
- `apps/web/src/app/tasks/(list)/automation/components/__tests__/DeleteAutomationRuleDialog.test.tsx`
- `apps/web/src/app/tasks/(list)/automation/components/__tests__/AutomationSettingsCard.test.tsx`
- `apps/web/src/app/tasks/(list)/automation/components/__tests__/TagsTab.test.tsx`
- `apps/web/src/components/shared/__tests__/copy-field.test.tsx`
- `apps/web/src/components/shared/__tests__/schedule-cadence-fields.test.tsx`
- `apps/web/src/components/shared/__tests__/variable-picker.test.tsx`
- `apps/web/src/components/sidebar/__tests__/tasks-config.test.ts`

**Files to Modify:**
- `apps/web/src/lib/shared/__tests__/settings-search.test.ts` (13 → 14; `task-automation` item in ai-automation)
- `apps/web/src/components/notifications/__tests__/notification-utils.supplementary.test.ts` (`task_automation`
  mapping)

- [x] `page.test.tsx`: exports `metadata`, renders Content in `Suspense`, source has no `'use client'`, no "coming soon".
- [x] Content (hoisted tRPC mock, PG-205 style, `@vitest-environment jsdom`): loading, error + Retry, passive EmptyState
      with no action, read-only (no CTAs, read-only note), New Rule calls `listRef.current.openCreate()`, create /
      update / delete / toggle invalidate `list`, CONFLICT inline, Move Up/Down keeps focus and announces "Moved to
      position N of M", axe on `document.body` (color-contrast disabled).
- [x] Settings card: seeded from `data.settings`; a rule toggle invalidating `list` keeps unsaved edits (M13); Save
      disabled when not dirty or saving; number field parsed on save; **handleReset awaits `resetToDefaults`**, toast,
      dialog stays open on error; dialog text lists reset vs preserved.
- [x] Rule list: trigger/action summary, owner rule text, last-run badge incl. prominent `no_eligible_owner`,
      suppressed count, Switch `aria-label="Active: <name>"` disabled while pending, Test Rule `aria-disabled` +
      description for entity-event rules.
- [x] Rule dialog: trigger switching (event / schedule / webhook), `toStage` only for stage changes, fixed action order,
      duplicate-action inline error, duplicate-rule warning, keyboard operation, help texts (rules apply after saving;
      system-owned leads; "0 = end of today").
- [x] Webhook secret dialog: stubbed `navigator.clipboard`, copy success announced, copy failure selects text with a
      hint, outside click ignored, Esc closes, secret absent from the DOM after close, mutation `reset()` called.
- [x] Recent runs (outcome labels, task link), delete dialog (focus to the Rules heading), TagsTab forwardRef
      `openCreate`, `swatchClass` fallback for a legacy token, loading skeleton matches 8 / 4.
- [x] Shared: `copy-field` (success, failure fallback, timers cleared on unmount); `schedule-cadence-fields` (cadence
      switching, custom cron, controlled value, `idPrefix` ids, `cronHint`); `variable-picker` (default strings unchanged,
      new optional props wire `id` / `aria-invalid` / `aria-describedby` / `maxLength`).
- [x] Sidebar: `/tasks/automation` item present in `sidebar/configs/tasks.ts`; `TaskSettingsPanel` renders a link with
      href `/tasks/automation` (same test file).
- [x] Dialog due-date help text: schedule rules "end of day in the rule's timezone", other rules "end of day (UTC)" (M5).

**Validation:**
- [x] `pnpm --filter ./apps/web exec vitest run "src/app/tasks/(list)/automation" src/components/shared/__tests__/copy-field.test.tsx src/components/shared/__tests__/schedule-cadence-fields.test.tsx src/components/shared/__tests__/variable-picker.test.tsx src/components/sidebar/__tests__/tasks-config.test.ts src/lib/shared/__tests__/settings-search.test.ts src/components/notifications/__tests__/notification-utils.supplementary.test.ts`
      fails → `07-web.red.txt`.

### Phase 2 — GREEN: Make Tests Pass (layer order: domain → validators → db → adapters/application → api → web)

Each GREEN step ends with its RED command passing → `NN-<layer>.green.txt`, then a commit for that layer.

#### Step 8: Domain + PRD status

**Files to Create:**
- `packages/domain/src/crm/task/automation/task-automation-constants.ts`
- `packages/domain/src/crm/task/automation/index.ts`

**Files to Modify:**
- `packages/domain/src/index.ts`
- `docs/planning/prd-module-settings.md` (PG-208 addendum delivery status: Plan done, implementation In Progress)

- [x] Constants, event catalogue (spec event table), templates, due date, round-robin pick, `canonicalRuleKey`, limits,
      role sets, outcome codes + labels; zero infra deps, no Node-only imports (web imports it, L11).

**Validation:**
- [x] Step 1 command passes → `08-domain.green.txt`; `pnpm --filter ./packages/domain run typecheck`;
      `pnpm --filter ./packages/domain build`.

#### Step 9: Validators + notification type

**Files to Create:**
- `packages/validators/src/task-automation.ts`

**Files to Modify:**
- `packages/validators/src/index.ts`
- `packages/validators/src/notifications.ts` (`task_automation`)

**Validation:**
- [x] Step 2 command passes → `09-validators.green.txt`; `pnpm --filter ./packages/validators run typecheck`;
      `pnpm --filter ./packages/validators build`.

#### Step 10: Prisma schema, migration, db exports (Class A, L13)

**Files to Create:**
- `packages/db/prisma/migrations/20261020120000_task_automation/migration.sql`

**Files to Modify:**
- `packages/db/prisma/schema.prisma` (4 models, Tenant back-relations `@ignore // PG-208`, SQL-only object comment)
- `packages/db/src/index.ts` (4 model types; export `isEncrypted`, `encryptField`, `decryptField` — M11)
- `packages/db/src/field-encryption.ts` (`ENCRYPTED_FIELDS.TaskAutomationRule`)

- [x] Migration per spec §Data (CHECKs, SQL-only uniques incl. partial `ruleKey`, composite FK, RLS + policies, header
      with Class A + recovery). Prisma client regenerated (`pnpm --filter ./packages/db run db:generate`), never
      `--no-engine`.
- [x] Apply to the **local test DB only**: LOCALDB + `pnpm --filter ./packages/db exec prisma migrate deploy` (guard output
      saved to `matop/gates/migrate-target.txt`, and again per LOCALDB step as `matop/gates/localdb-<step>.txt`; never `db push` / `migrate dev` / `reset`; the db-destructive guard
      stays on).
      > Deviation: the shared :5433 DB already held 8 other lanes' unapplied migrations, so `migrate deploy` there would have applied them too. PG-208 was applied with `prisma db execute --file` + `prisma migrate resolve --applied 20261020120000_task_automation` (checksum = file sha256); ephemeral DBs (`scripts/test-db.mjs run`) use plain `migrate deploy`.
- [x] Independent SQL review of the migration (Class A gate) by a `data-engineer` subagent → `matop/gates/sql-review.md`.

**Validation:**
- [x] Step 3 **Section A** (`-t constraints`) and the field-encryption commands pass → `10-db.green.txt` (Sections B and
      C stay red until Steps 13 and 14); `packages/db/src/__tests__/rls-migrations.test.ts` passes;
      `pnpm --filter ./packages/db build`.

#### Step 11: Adapters + application

**Files to Modify:**
- `packages/adapters/src/repositories/PrismaTaskRepository.ts` (single `toDomain` mapper, `assigneeId` save/load)
- `packages/application/src/services/TaskService.ts` (`assignTask`)

**Validation:**
- [x] Step 4 commands pass → `11-adapters-application.green.txt`; both packages typecheck + build.

#### Step 12: Task automation router, admin gate, task router visibility (ruling 6)

**Files to Create:**
- `apps/api/src/modules/task/task-automation.router.ts`
- `apps/api/src/modules/task/automation/task-automation-admin.ts`

**Files to Modify:**
- `apps/api/src/router.ts` (`taskAutomation: taskAutomationRouter,` single line next to `taskSettings`)
- `apps/api/src/modules/task/task.router.ts` (M1 query shape for list + getById)

- [x] `assertTaskAutomationAdmin(ctx, roles)` in `task-automation-admin.ts`: FORBIDDEN + `getAuditLogger(ctx.prisma)
      .logPermissionDenied('task', …).catch(logAuditFailure)`; webhook operations use the webhook role set.
- [x] Strict limiter (10/min per user, `createDistributedRateLimitMiddleware`) on `create`, `rotateWebhookSecret`,
      `regenerateWebhookUrl`, `runNow` only.
- [x] `create`: settings row upserted then locked (`SELECT … FOR UPDATE` on the settings table only, inside
      `$transaction`), cap 50 counted under the lock; `ruleKey` hashed from `canonicalRuleKey`; P2002 → CONFLICT.
      > Deviation (owner ruling 8): every admission path, `create` included, serialises on `pg_advisory_xact_lock('task_automation_run_admission:'+tenantId)` instead of `SELECT … FOR UPDATE` on the settings row (ADR-084 §Implementation outcome).
- [x] `getApiPublicUrl()` (one accessor in `task-automation.router.ts`: reads `process.env.API_PUBLIC_URL`, trims a
      trailing slash, PRECONDITION_FAILED when unset) used by create / rotate / regenerate; never the `Host` header.
- [x] `runNow` inserts its `manual:<uuid>` run with `ctx.prismaWithTenant.taskAutomationRun.create` (tenant-scoped,
      P2002 → CONFLICT) after the same cap check the engine uses; it does not depend on the Step 13 store.
- [x] Output DTO schemas (`.output()`) live in `task-automation.router.ts`; the web imports inferred router types only.
      > Deviation: typed view contracts (select allow-lists + explicit return types) instead of `.output()` Zod schemas; the web imports inferred router types only, and the no-secret-fields guarantee is asserted in the router tests.

**Validation:**
- [x] Step 5 command passes → `12-api.green.txt`; `apps/api/src/__tests__/app-router.smoke.test.ts` and
      `tests/architecture/tenant-procedure-enforcement.test.ts` pass.

#### Step 13: Runtime store, intake, engine, runner

**Files to Create:**
- `apps/api/src/modules/task/automation/task-automation-store.ts`
- `apps/api/src/modules/task/automation/task-automation-event-intake.ts`
- `apps/api/src/modules/task/automation/task-automation-engine.ts`
- `apps/api/src/modules/task/automation/task-automation-runner.ts`

- [x] Owner chain: record owner if `tenantUserWhere(tenantId)` matches, else rule creator if it matches, else SKIPPED
      `no_eligible_owner`; round-robin over pool ∩ live users in pool order with `incrementRrCursor`.
- [x] Due-date timezone (M5): schedule rule → `scheduleTimezone`; other rules → UTC.
- [x] Notify path: `createNotification(apiPrisma, {tenantId, type: 'task_automation', …, actionUrl: '/tasks/<id>'},
      container.notificationOrchestrator)`; orchestrator `filtered` = success; failure → `notify_failed`.
- [x] Re-run Step 3 **Section B** (`-t "store behaviour"`, LOCALDB, slot wrapper) → appended to `13-runtime.green.txt`.
- [x] Engine deps from the container after `containerReady`: `container.taskService`,
      `container.notificationOrchestrator`, `container.adapters.eventBus`, `apiPrisma` (no `container.ts` change).

**Validation:**
- [x] Store, intake, engine, runner tests from Step 6 pass → `13-runtime.green.txt`.

#### Step 14: Webhook route, server wiring, shutdown, Sentry scrub

**Files to Create:**
- `apps/api/src/modules/task/automation/task-automation-webhook.ts`

**Files to Modify:**
- `apps/api/src/http-server.ts` (path match before the global body read; `readRequestBody(req, maxBytes?)`; route
  branch with no CORS; runner + intake start in `startApiServer`)
- `apps/api/src/main.ts` (SIGTERM `stopTaskAutomationRunner()`)
- `apps/api/src/tracing/sentry.ts` (M12 scrub)

- [x] `handleRequest` matches the webhook path before the global `readRequestBody` (`http-server.ts:495`) and branches;
      the branch sets no CORS headers and is not added to `CORS_ALLOWED_HEADERS`.
- [x] Pipeline in order: (1) method guard 405 + `Allow`; (2) IP failure limiter (rightmost hop → `x-real-ip` →
      `'unknown'`; Redis limiter when distributed limiting is enabled); (3) `Content-Length` > 64 KB → 413, then a
      byte-counted read with a 10 s deadline, overflow writes 413 with `Connection: close` and then destroys the request
      (M3); (4) token format pre-check, `loadWebhookRule(sha256(token))`, identical 404; (5) secret-encrypted check →
      503; (6) strict signature header parse, ±300 s, HMAC over `${t}.${idempotencyKey}.${rawBody}` (raw Buffer), hex
      length check + `timingSafeEqual`, current then previous secret → identical 401; (7) per-rule cap → 429; (8) JSON
      object check → 400, own-key scalar variables, referenced keys only; (9) `insertRunIfAbsent` with body hash → 202 /
      202 duplicate / 409.
- [x] Handler catches everything → 500 `{error:'internal'}`; logs `{ruleId, tenantId, code}` only; never reaches
      `sendInternalError`.
- [x] `startApiServer`: after `containerReady`, when `taskAutomationRunnerIntervalFromEnv(process.env) > 0`, prime the
      watched set, register the intake, start the runner; `main.ts` SIGTERM stops it.
- [x] Sentry: scrub `/webhooks/task-automation/<token>` in `event.request.url`, `event.transaction`, span descriptions,
      `breadcrumb.data.url` / `data.to` (M12).
- [x] Re-run Step 3 **Section C** (`-t "webhook verifier"`, LOCALDB, slot wrapper) → appended to `14-webhook.green.txt`.

**Validation:**
- [x] Remaining Step 6 tests pass → `14-webhook.green.txt`; existing `src/__tests__/http-server*.test.ts` suites pass
      unchanged.

#### Step 15: Shared web components (pure moves/extensions, own commits)

**Files to Create:**
- `apps/web/src/components/shared/copy-field.tsx`
- `apps/web/src/components/shared/schedule-cadence-fields.tsx`
- `apps/web/src/components/shared/member-multi-select.tsx` (git mv + `legend` prop)
- `apps/web/src/components/shared/__tests__/member-multi-select.test.tsx` (git mv; legend "Territory members")

**Files to Modify:**
- `apps/web/src/app/analytics/scheduled-reports/components/ScheduleDialog.tsx` (imports the extracted fields; DOM ids
  byte-identical via `idPrefix="schedule"`)
- `apps/web/src/app/accounts/(list)/territory-mapping/components/TerritoryDialog.tsx`
- `apps/web/src/app/accounts/(list)/territory-mapping/components/TerritoryList.tsx`
- `apps/web/src/components/shared/variable-picker.tsx` (optional props, defaults unchanged)

- [x] Commit 15a (cadence extraction) then immediately run the **unmodified** `ScheduleDialog.test.tsx`,
      `ScheduleList.test.tsx`, `TagsTab.test.tsx`, `ScheduledReportsContent.test.tsx` and `TimezoneSelector.test.tsx`.
- [x] Commit 15b (MemberMultiSelect move) then run the territory-mapping suites; commit 15c (variable picker) then run
      the workflow config-form suites that use it (`src/components/workflows`).

**Validation:**
- [x] `pnpm --filter ./apps/web exec vitest run src/app/analytics/scheduled-reports "src/app/accounts/(list)/territory-mapping" src/components/settings/__tests__/TimezoneSelector.test.tsx src/components/workflows src/components/shared/__tests__`
      passes → `15-shared-web.green.txt`.

#### Step 16: Task Automation page (replaces the stub)

**Files to Create:**
- `apps/web/src/app/tasks/(list)/automation/TaskAutomationContent.tsx`
- `apps/web/src/app/tasks/(list)/automation/TaskAutomationLoading.tsx`
- `apps/web/src/app/tasks/(list)/automation/loading.tsx`
- `apps/web/src/app/tasks/(list)/automation/task-automation-labels.ts`
- `apps/web/src/app/tasks/(list)/automation/components/AutomationRuleList.tsx`
- `apps/web/src/app/tasks/(list)/automation/components/AutomationRuleDialog.tsx`
- `apps/web/src/app/tasks/(list)/automation/components/TriggerFields.tsx`
- `apps/web/src/app/tasks/(list)/automation/components/ActionFields.tsx`
- `apps/web/src/app/tasks/(list)/automation/components/WebhookSecretDialog.tsx`
- `apps/web/src/app/tasks/(list)/automation/components/RecentRunsDialog.tsx`
- `apps/web/src/app/tasks/(list)/automation/components/DeleteAutomationRuleDialog.tsx`
- `apps/web/src/app/tasks/(list)/automation/components/AutomationSettingsCard.tsx`
- `apps/web/src/app/tasks/(list)/automation/components/TagsTab.tsx`

**Files to Modify:**
- `apps/web/src/app/tasks/(list)/automation/page.tsx` (server component, metadata, Suspense — replaces the stub)
- `apps/web/src/components/notifications/notification-utils.ts` (`task_automation` entry)
- `apps/web/src/components/tasks/TaskSettingsPanel.tsx` (copy)
- `apps/web/src/lib/shared/settings-search.ts` (new item + ai-automation `itemIds`)

- [x] Reuse per the spec reuse table (PageHeader, shared SectionHeader, EmptyState `entity="rules"`,
      ConfirmationDialog, DeleteTypeDialog, PrioritySelect, TimezoneSelector, extended VariablePicker, shared
      MemberMultiSelect and ScheduleCadenceFields, CopyField); Material Symbols only; web imports constants/types only.
- [x] Webhook secret held in component state; create/rotate/regenerate mutations `gcTime: 0` + `reset()` on close;
      `WebhookSecretDialog` prevents outside-click close (`onInteractOutside`), Esc and the close button work.
- [x] Accessibility: Trigger and Actions are `<fieldset>`s with `<legend>`s; every invalid field has `aria-invalid` +
      `aria-describedby` to its error; one `<output aria-live="polite">` for announcements (saved, deleted, moved,
      copied); Test Rule on entity-event rules is `aria-disabled` with an `aria-describedby` reason; Move Up/Down keeps
      focus on the moved row's button and announces "Moved to position N of M"; after delete focus moves to the Rules
      heading (`focusableTitle`); the active `Switch` has `aria-label="Active: <name>"` and sits beside, not inside, the
      buttons; read-only users get an `aria-describedby` read-only note and no CTAs.
- [x] Settings card seeded from `data.settings` only, not re-seeded while dirty; own `<fieldset disabled={isSaving}>`.

**Validation:**
- [x] Step 7 command passes → `16-web.green.txt`; `pnpm --filter ./apps/web run typecheck`.

### Phase 3 — REFACTOR: cleanup, docs, tracking

#### Step 17: Refactor pass

- [x] `/simplify` over the diff; remove duplication between engine and webhook paths; keep functions under the Sonar
      cognitive-complexity limit; no `/* istanbul ignore */` (L2); no `any` / unsafe casts at tRPC boundaries.
- [x] Re-run every RED/GREEN command; `pnpm --filter ./apps/api run lint`, `./apps/web`, `./packages/validators`,
      `./packages/domain` lint.

#### Step 18: Docs, registries, CSV artifacts

**Files to Modify:**
- `docs/design/PAGE_MAP_AND_FLOWS.md` (:215 rewrite; PG-208 tag)
- `docs/design/sitemap.md` (:198 rewrite, :445 row)
- `docs/design/navigation-reachability-audit.md` (:367 "Tasks sidebar + Task Settings panel; implemented (PG-208)")
- `docs/design/page-registry.md` (new Tasks block: file, router, tests)
- `docs/design/ui-flow-mapping.md` (router row; header router count + procedure count = summary total)
- `docs/design/information-architecture.md` (router count)
- `docs/compliance-and-governance/compliance/wcag-conformance-statement.md` (changelog row)
- `docs/compliance-and-governance/compliance/vpat-2.5.md` (changelog row)
- `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv` (plan-only `ARTIFACT:` entries; then
  `npx tsx tools/scripts/split-sprint-plan.ts`, which rewrites `Sprint_plan_J.csv`)

- [x] Change only PG-208's own lines/counts (sibling lanes edit the same files).

**Validation:**
- [x] `pnpm --filter ./apps/web exec vitest run src/app/__tests__/ui-flow-mapping-reconciliation.test.ts src/app/__tests__/ia-reconciliation.test.ts src/app/__tests__/sitemap-reconciliation.test.ts`;
      `pnpm exec vitest run tools/scripts/route-total-consistency.test.ts tools/scripts/a11y-route-reconcile.test.ts tools/scripts/__tests__/content-audit.test.ts`
      and `pnpm exec vitest run tools/scripts/__tests__/docs-integrity-audit.test.ts` pass → `18-registries.txt`.
- [x] `node tools/scripts/exec-preflight/check-page-doc-cochange.mjs PG-208` exit 0.

#### Step 19: Red-flag / out-of-scope tracking (all three surfaces)

**Files to Create:**
- `.specify/sprints/sprint-18/findings/PG-208-findings.md`

**Files to Modify:**
- `artifacts/metrics/debt-ledger.yaml`

- [x] One `gh issue` each (file:line + proposed fix), a debt-ledger entry and a findings-doc entry for: unbounded
      `readRequestBody` for other routes; `sendInternalError` echoes `error.message`; `process-pm-event.ts:50`
      non-constant-time compare; `stripeVerify` NaN timestamp; webhooks dead-letter procedures open to any user;
      `assertTerritoryAdmin` denials not audited; `redactSensitiveData` case bug; bulk stage update / bulk convert publish
      no events; `changeStage` closes deals without won/lost; PG-191 task settings unread; assignee edit rights (and
      `getOverdue`/`getDueSoon`/stats owner-only); `MemberMultiSelect` label-in-name (WCAG 2.5.3); TagsTab shared
      extraction; `lead.created` source filter. Search existing issues first (no duplicates).

### Phase 4 — VALIDATION

#### Step 20: Design check

- [x] Compare the page against the playbook §1-§4 and PG-201 Scheduled Reports (no mockup on the row) — screenshots at
      `lg` and mobile via the webapp-testing skill → `matop/design-check.md`.
      > Done 2026-10-22: authenticated `lg` (1440, @2x) and mobile (390) captures plus the rule dialog in `artifacts/screenshots/PG-208/` (seeded admin, local Supabase auth, ephemeral DB). They exposed a rule-row layout defect, fixed in `AutomationRuleList.tsx`, and a pre-existing clipped-icon defect in shared components (#978). See `matop/design-check.md`.

#### Step 21: Full validations (4 mandatory, every touched package)

- [x] `pnpm --filter ./packages/domain test`, `pnpm --filter ./packages/validators test`, `pnpm --filter ./packages/db
      test`, `pnpm --filter ./packages/application test`, `pnpm --filter ./packages/adapters test`, `pnpm --filter
      ./apps/api test` (each via the slot wrapper); `pnpm --filter ./apps/web exec vitest run` (full
      web suite via the slot wrapper).
- [x] `pnpm run typecheck` (full), `pnpm run lint` (full), `pnpm --filter ./apps/web build` and
      `pnpm --filter ./apps/api build` (slot wrapper), knip if configured for the touched packages.
- [x] Coverage AFTER snapshot via `/exec-coverage` → `artifacts/coverage/PG-208-after.json`; changed-lines coverage
      ≥ 80% (`node scripts/check-diff-coverage.mjs`).

#### Step 22: Integration tests

- [x] LOCALDB + `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-208 --exclusive intelliflow-db -- pnpm exec vitest run --project integration tests/integration/task-automation.test.ts`
      → `22-integration.txt` (all three sections); plus the existing integration suites touching tasks (`tests/integration/*task*`).

#### Step 23: Reviews

- [x] `node scripts/codex-review.mjs` iterated until clean (fix or waive with evidence in
      `tools/audit/codex-review-waivers.yaml`, L3).
- [x] `/code-review` on the diff; `/sonarqube-fix` for any new Sonar finding.
      > `/code-review` done (run 20261021-153453-bb1087b4: 0 TS errors, lint clean). Sonar: the repo's Sonar guard over the whole branch diff (`CI=1 SONAR_GUARD_BASE=origin/main`, 101 TS/TSX files) passes (`matop/gates/final-09-sonar-guard-branch.txt`), so there is no Sonar finding to fix locally. SonarCloud then analyses the PR automatically in CI after the runner pushes.
- [x] `a11y-expert` subagent WCAG 2.1 AA pass on the page and dialogs; `security-lead` subagent pass on the webhook
      route and router; findings fixed or tracked (Step 19 surfaces).

#### Step 24: Lighthouse (DoD 14, AC-TA-019)

- [x] Production web build on :3400, API on :4000 started under LOCALDB with `API_PUBLIC_URL=http://localhost:4000`, the
      migration applied locally, local Supabase + Postgres, a test ADMIN, at least one real rule created through the UI,
      Node 24:
      `LHCI_URLS=http://localhost:3400/tasks/automation LHCI_OUTPUT_DIR=artifacts/lighthouse/PG-208 pnpm --filter @intelliflow/web run lighthouse:auth`
      → scores ≥ 90; or NEEDS_HUMAN naming the paths tried (`docs/claude-refs/lighthouse-playbook.md`).
      > Done 2026-10-22: authenticated LHCI on `/tasks/automation` (3 runs) scored performance 0.93/0.94/0.93 and accessibility 0.93. Reports are in `artifacts/lighthouse/PG-208/auth/`; setup is in `waiver-evidence.md`. The harness's extra colour-contrast and TTI<1s assertions fail on shared app-wide nodes, identical to PG-198 (#871, #540).

#### Step 25: Dependency chain + PRD/ADR finalisation

**Files to Modify:**
- `docs/architecture/diagrams/complete-dependency-chains.md` (PG-208 ⏳ → ✅)
- `docs/architecture/diagrams/core-crm-dependency-chain.md` (Task lane: `taskAutomation` router + runtime, PG-208)
- `docs/architecture/adr/ADR-084-task-automation-engine.md` (Proposed → Accepted, with validation evidence)
- `docs/architecture/adr/README.md` (status)
- `docs/planning/prd-module-settings.md` (delivery status table)

- [x] Confirm the PRD addendum AC summary matches the final spec AC-TA-001..020; fix any drift.

#### Step 26: MATOP (STOA sub-agents) + compliance

- [x] `/matop-execute PG-208` with STOA foundation + domain + security (verdicts under `matop/stoa-verdicts/`);
      `/compliance-check PG-208` before any status change to Completed.
      > Done: STOA foundation PASS, domain NEEDS_HUMAN, security FAIL (dependency audit only, #974, ruling 10) in `matop/stoa-verdicts/`; consensus NEEDS_HUMAN (`matop/summary.md`); `/compliance-check` NEEDS_HUMAN with no blocking section failing (`matop/compliance-check.md`).

#### Step 27: Attestation + tracking

**Files to Modify:**
- `.specify/sprints/sprint-18/attestations/PG-208/attestation.json` (replaces the INCOMPLETE backfill; every gate PASS
  or NEEDS_HUMAN with reason; hashes incl. the migration)
- `.specify/sprints/sprint-18/attestations/PG-208/task-tracking.json`
- `.gitleaks.toml` (one-file allowlist entry for the attestation hash map, PG-198 precedent)
- `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv` (status per exec rules; KPI replaced) + regenerated
  `Sprint_plan_J.csv`

- [x] `npx tsx apps/project-tracker/scripts/generate-context.ts` (session context refresh).
- [x] `git ls-files | grep -cE '\.(log|coverage|tsbuildinfo)$'` = 0; SendMessage `projects-8c` with status, last SHA,
      attestation path, the migration (L13) and NEEDS_HUMAN items.
      > Done: `git ls-files | grep -cE` = 0; the runner (projects-8c, via projects-e9) is sent this commit as the new HEAD, the attestation path, the migration and the outcome.

## Validation Matrix

| Scope | Purpose | Command |
|---|---|---|
| Domain | constants, templates, contract | `pnpm --filter ./packages/domain exec vitest run src/crm/task/automation` |
| Validators | schemas, superRefine, notification count | `pnpm --filter ./packages/validators exec vitest run src/__tests__/task-automation.test.ts src/__tests__/notifications.test.ts` |
| DB unit | encryption map + extension | `pnpm --filter ./packages/db exec vitest run src/__tests__/field-encryption.test.ts src/__tests__/field-encryption-extension.test.ts src/__tests__/rls-migrations.test.ts` |
| DB integration | CHECKs, uniques, FK, RLS, concurrency | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-208 --exclusive intelliflow-db -- pnpm exec vitest run --project integration tests/integration/task-automation.test.ts` |
| Adapters / application | assignee persistence, assignTask | `pnpm --filter ./packages/adapters exec vitest run src/repositories/__tests__/PrismaTaskRepository.test.ts`; `pnpm --filter ./packages/application exec vitest run src/services/__tests__/TaskService.test.ts` |
| API router | auth, cross-tenant, outputs, ruling 6 | `pnpm --filter ./apps/api exec vitest run src/modules/task src/__tests__/app-router.smoke.test.ts` |
| Runtime | store, intake, engine, runner, webhook, wiring | `pnpm --filter ./apps/api exec vitest run src/modules/task/automation src/__tests__/http-server.task-automation-webhook.test.ts src/__tests__/http-server.task-automation-runner.test.ts src/main.test.ts src/tracing/sentry.test.ts` |
| Touched API suites | regressions | `pnpm --filter ./apps/api exec vitest run src/__tests__/http-server.test.ts src/__tests__/http-server.stripe-webhook.test.ts src/__tests__/http-server.approval-sweep.test.ts src/modules/notifications` |
| Architecture | tenant procedures | `pnpm exec vitest run tests/architecture/tenant-procedure-enforcement.test.ts` |
| Web page | page, content, dialogs | `pnpm --filter ./apps/web exec vitest run "src/app/tasks/(list)/automation"` |
| Web shared + touched | moved/extended components, PG-197/PG-201 suites | `pnpm --filter ./apps/web exec vitest run src/components/shared src/app/analytics/scheduled-reports "src/app/accounts/(list)/territory-mapping" src/components/settings src/components/workflows src/components/notifications src/components/sidebar src/lib/shared` |
| Registries | counts and routes | `pnpm --filter ./apps/web exec vitest run src/app/__tests__`; `pnpm exec vitest run tools/scripts/route-total-consistency.test.ts tools/scripts/a11y-route-reconcile.test.ts tools/scripts/__tests__/content-audit.test.ts tools/scripts/__tests__/docs-integrity-audit.test.ts` |
| Full suites | every touched package | `pnpm --filter ./packages/domain --filter ./packages/validators --filter ./packages/db --filter ./packages/application --filter ./packages/adapters test`, `pnpm --filter ./apps/api test`, `pnpm --filter ./apps/web exec vitest run` (slot wrapper) |
| Gates | type / lint / build | `pnpm run typecheck`; `pnpm run lint`; `pnpm --filter ./apps/api build`; `pnpm --filter ./apps/web build` (slot wrapper) |
| Coverage | changed lines ≥ 80% | `/exec-coverage` + `node scripts/check-diff-coverage.mjs` |
| Semantic review | codex | `node scripts/codex-review.mjs` |
| Secret scan | staged diff | `bash .gitleaks/scan.sh staged` |
| Lighthouse | ≥ 90 | `pnpm --filter @intelliflow/web run lighthouse:auth` (Step 24 env) |

## Integration Checkpoints Summary

| After Step | Verification | Command |
|---|---|---|
| 7 | all RED logs saved, failing on assertions | `ls .specify/sprints/sprint-18/attestations/PG-208/red-green/*.red.txt` |
| 10 | migration applied locally, Prisma client regenerated | `pnpm --filter ./packages/db exec prisma migrate status` (local) |
| 12 | router registered, smoke test | `pnpm --filter ./apps/api exec vitest run src/__tests__/app-router.smoke.test.ts` |
| 14 | runtime + webhook green, server suites unchanged | Runtime + Touched API rows |
| 15 | PG-197 / PG-201 suites unmodified and green | Web shared + touched row |
| 16 | page green, typecheck | Web page row + `pnpm --filter ./apps/web run typecheck` |
| 18 | registries consistent | Registries row |
| 21 | 4 mandatory validations | Full suites + Gates rows |
| 23 | codex clean | `node scripts/codex-review.mjs` |

## Acceptance Criteria Traceability

| AC | RED | GREEN | Notes |
|---|---|---|---|
| AC-TA-001 playbook layout, loading | 7 | 16 | design check Step 20 |
| AC-TA-002 roles, reorder, denial audit | 5, 7 | 12, 16 | |
| AC-TA-003 actions superRefine, duplicate rules | 1, 2, 3, 5, 7 | 8, 9, 10, 12 | DoD 9 |
| AC-TA-004 entity events, postconditions, never blocks writes | 1, 6 | 8, 13 | |
| AC-TA-005 schedules once per slot, min interval | 2, 3, 5, 6 | 9, 12, 13 | integration concurrency |
| AC-TA-006 webhook | 5, 6 | 12, 14 | |
| AC-TA-007 create task (templates, due, owner, link) | 1, 6 | 8, 13 | |
| AC-TA-008 round-robin, assignee persistence, task.assigned | 1, 3, 4, 6 | 8, 10, 11, 13 | |
| AC-TA-009 assignee visibility (ruling 6) | 5 | 12 | |
| AC-TA-010 notify | 2, 6, 7 | 9, 13, 16 | |
| AC-TA-011 conversion rule, no task triggers | 1, 6 | 8, 13 | |
| AC-TA-012 run history, reaper, purge | 3, 5, 6, 7 | 10, 12, 13, 16 | |
| AC-TA-013 guardrails before insert | 6 | 13 | |
| AC-TA-014 settings card + reset | 5, 7 | 12, 16 | |
| AC-TA-015 tags + colour CHECK | 2, 3, 5, 7 | 9, 10, 12, 16 | DoD 10 |
| AC-TA-016 tenant isolation | 3, 5, 6 | 10, 12, 13 | DoD 13 cross-tenant |
| AC-TA-017 secrets never exposed | 3, 5, 6, 7 | 10, 12, 14, 16 | |
| AC-TA-018 transactions, no skipDuplicates, P2002/P2025 | 5 | 12 | DoD 7, 8 |
| AC-TA-019 WCAG + Lighthouse | 7 | 16 | Steps 23-24 |
| AC-TA-020 registries, PRD, ADR, chain, CSV, migration | — | 18, 25, 27 | |

DoD 11 (AI defaults FALSE): N/A — no AI toggle; recorded in PRD + ADR. DoD 12 (Boolean toggles): table below. DoD 15
(verified by `pnpm test`): Step 21.

## Boolean toggles (playbook §8)

| Toggle | Category | Runtime consumer | Test |
|---|---|---|---|
| `TaskAutomationRule.isActive` | 1, wired | watched set, drain, schedule claim, execution, Test Rule | Steps 5, 6 |
| `TaskAutomationSetting.automationEnabled` | 1, wired | drain, webhook 404, execution, Test Rule | Steps 5, 6 |
| `TaskAutomationSetting.notifyRuleOwnerOnFailure` | 1, wired | engine failure notification | Step 6 |
| `TaskAutomationTag.isActive` | 1, wired | rule dialog tag picker | Step 7 |
| `CREATE_TASK.linkToRecord` | 1, wired | engine link decision | Step 6 |
| `NOTIFY.recipients.assignee/owner` | 1, wired | engine recipients | Step 6 |
| `rotateWebhookSecret.revokePrevious` | 1, wired | router clears previous secret | Step 5 |

## Plan-Reviewer Sign-off

<!-- plan-reviewer: subagent -->
reviewer_subagent: plan-reviewer (`.claude/agents/plan-reviewer.md`), spawned via the Agent tool by the PG-208 lane
(session `100745b3-8c4a-4bcb-9515-686bce1662d6`), 2 iterations.

| Iteration | Verdict | Summary |
|---|---|---|
| 1 (2026-10-20T23:10-23:13Z) | REVISE (6 ERROR, 7 WARN, 3 INFO) | integration green gate before the store existed; `.env.test` not read by `prisma.config.ts` (prod-DB hazard); `API_PUBLIC_URL` unplanned; audit type closed set; thin GREEN implementation checkboxes (a11y, M3, limiter); domain chain file; M5 resolution; filter syntax; docs-integrity path; 4 missing test cases; nav section; `runNow` store ordering; split name |
| 2 (2026-10-20T23:16-23:19Z) | REVISE (1 ERROR, 1 WARN, 1 INFO) → APPROVE once applied | stale `security/types.ts` line in Step 12; unlabeled Section A bullet; guard output per LOCALDB step |

All fixes applied (iteration 2's reviewer: "Once they are in, the plan is APPROVE, and I don't need another full pass").

| Cat | Name | Verdict | Evidence |
|---|---|---|---|
| Y | UI Reachability | PASS | existing route replaced in place; sidebar `apps/web/src/components/sidebar/configs/tasks.ts:7`; parent `TaskSettingsPanel.tsx:23-29`; both asserted by `tasks-config.test.ts`; no deferral |
| BB | PRD/ADR | PASS | PRD addendum `docs/planning/prd-module-settings.md`; ADR-084 Proposed → Accepted at Step 25; README row |
| A | Files summary | PASS | create 57, modify 55, delete 2; delta 0 |

**Final verdict: APPROVE.**
