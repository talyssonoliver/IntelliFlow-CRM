# PG-204 findings (Case Types, 2026-10-13)

Red flags and out-of-scope defects found while building case types. Each is fixed in this task or tracked in all
three surfaces (gh issue, `artifacts/metrics/debt-ledger.yaml`, this file).

## Fixed in PG-204

| # | Finding | Evidence | Fix |
|---|---|---|---|
| F1 | `cases.create` defaulted the assignee from `(ctx.user as {id?}).id`, but `UserSession` has `userId`. "Assign to me" (the New Case default, sent as an omitted `assignedTo`) failed with "Assignee is required". | `apps/api/src/context.ts:38`; old `cases.router.ts:348` | `ctx.tenant.userId`; regression test in `cases.router.case-types.test.ts` |
| F2 | The New Case client picker searched **contacts** and sent a contact id as `clientId`, but `cases.clientId` references `accounts` (`cases_clientId_fkey`, baseline migration line 4422). Creating a case from the UI could not succeed. | `CaseForm.tsx` (`api.contact.list`) | Picker searches `api.account.list`; "create a new one" links to `/accounts/new`; test asserts the query |
| F3 | Fake taxonomy: `CaseForm` `CATEGORY_OPTIONS` (Technical, Billing, Feature Request…) was never persisted; `createCaseSchema` has no `category`, so zod stripped it. | `CaseForm.tsx:55` | Replaced by the real Case type picker (spec D12) |
| F4 | PG-190 `CaseSettings.defaultPriority` and `CaseRequiredField` were dead config: nothing read them at case creation. | spec Dependency Verification | Applied by `cases.create` (ruling Q2) |
| F5 | `createCaseSchema.priority` defaulted to `MEDIUM`, so a blank priority could not be detected. | `packages/validators/src/case.ts:22` | Optional; server resolves it (ADR-076) |
| F6 | `cases.create` did not check that `clientId` / an explicit `assignedTo` belong to the caller's tenant (the `clientId` FK is not tenant-scoped). | security-lead R3 C3 | Tenant-scoped preflight, uniform `NOT_FOUND` |
| F7 | (exploration E10) `cases.update` returned tasks unordered, losing the seeded checklist order. | `cases.router.ts:549` | `tasks: { orderBy: CASE_TASK_ORDER }` + test (`8491d69a5`) |
| F8 | (E11) `updateCaseTypeSchema` inherited `isActive.default(true)`: an API update omitting `isActive` silently reactivated a type. | `validators/case-types.ts:44,84` | `isActive` required on update + validator and router tests (`8491d69a5`) |
| F9 | (E15) `/cases/new` showed server errors only as a toast, and the rejected `mutateAsync` was unhandled. | `new/page.tsx:42-44,59` | Inline `role="alert"` above the form + handled rejection (`e3f23e584`) |
| F10 | (E28) the default-type RadioGroup was `disabled` while saving, dropping focus to `<body>`, with no pending state. | `CaseTypesContent.tsx:58,211` | Stays focusable, `aria-busy`, ignores changes, visible + announced "Saving…" (`e3f23e584`) |
| F11 | (E29) axe `heading-order`: section headings were h3 directly under the page h1. | axe in `CaseTypesContent.test.tsx` | Optional `headingLevel` on the shared `SectionHeader` (default h3), h2 on this page (`e3f23e584`) |
| F12 | (E18) Subject/Client `*` read aloud, no `aria-required`; Client error not an alert. | `CaseForm.tsx:288,407,513` | `RequiredMark`, `aria-required`, `role="alert"` (`e3f23e584`) |
| F13 | (E19) removing the last checklist row focused the previous row instead of Add Step. | `ResolutionChecklistEditor.tsx:79-83` | Focus Add Step when no next row (`e3f23e584`) |
| F14 | Exec contrast review: `text-destructive` (a fill token) is 3.5:1 light / 1.8:1 dark as text; amber/green/teal swatch fills < 3:1 on light. | `matop/a11y-contrast-review.json` | `text-red-700 dark:text-red-300` on PG-204 error/required text; slate-500 outline on every swatch; re-check PASS WITH MINOR (`d7d91e5e8`) |

## Tracked (out of scope)

| # | Finding | gh issue | Debt ledger |
|---|---|---|---|
| T1 | `cases.router.ts:597,647` read `ctx.user.id` (always undefined), so notifications fall back to `'system'` | #864 | `PG-204-CASES-NOTIFY-USER-ID-001` |
| T2 | `cases.router.test.ts` tests the Prisma mock, not the router (false coverage) | #865 | `PG-204-CASES-ROUTER-TEST-FALSE-COVERAGE-001` |
| T3 | Required-field policy is not enforced on `cases.update` | #866 | `PG-204-CASE-UPDATE-REQUIRED-FIELDS-001` |
| T4 | `timezone-utils` `getTimezoneOffsetMinutes` is wrong beyond +12h (Kiritimati/Tonga/Chatham) | #867 | `PG-204-TIMEZONE-OFFSET-BEYOND-12H-001` |
| T5 | Approved agent actions (incl. `create_case`) are never executed; `approval-workflow.ts:240` returns a canned success with a random `entityId` | #853 (already open, P1, filed by another lane) | (owned by #853) |
| T6 | (E27, pre-existing) `cases.update` accepts another tenant's `assignedTo` and updates by `{ id }` only; `removeTask` deletes a task without checking its case or tenant. The cases module is **not** claimed tenant-hardened by PG-204. | #880 | `PG-204-CASES-UPDATE-TENANT-SCOPE-001` |
| T7 | `/hydrate-context` pattern scan returns 0 patterns on Windows (`2>/dev/null` under cmd.exe) | #881 | `PG-204-HYDRATION-WINDOWS-PATTERNS-001` |
| T8 | WCAG 2.1 AA minors (E30-E33 + pre-existing CaseForm combobox/clear button/focus ring) | #882 | `PG-204-A11Y-MINORS-001` |
| T9 | App-wide: `text-destructive` used as text in ~170 places fails AA contrast | #885 | (design-system token; owned by #885) |
| T10 | `/code-review` tooling: complexity step throws (`replaceAll`) and circular step writes an empty file, both reporting success; `rotate-secrets.test.ts` timing-flaky | #888 | (tooling) |

## Process corrections (runner audit, 2026-10-13)

- `/spec-exploration` had not run; it ran at 06:12-06:17Z (8 Explore sub-agents) and produced E1-E33
  (`.specify/sprints/sprint-18/context/PG-204/PG-204-spec-exploration.md`).
- The "8/8 consensus" was false (3 verdicts on a draft). `/spec-consensus` re-ran on the final amended spec:
  8/8 APPROVED in 1 round by 06:20:57Z.
- `/hydrate-context` had not run as a skill; the old files were hand-written and back-dated. The skill library ran at
  06:22:17Z (`hydrated-context.{json,md}`); the old files are relabelled with their provenance.
- The plan-reviewer iteration 1 was REVISE with 6 errors / 5 warnings / 3 info, not 4/4/1.
- The delivery doc's "RED → GREEN per layer" was false for the initial layers; the TDD table now cites only observed
  failing runs.

## Semantic review (codex), corrected record

- **My earlier claim that codex could not run here was wrong.** In this lane I put the Node 22 nvm directory first on
  `PATH`, so `codex` resolved to that directory's old global `codex-cli 0.79.0`, which rejects `--ephemeral`. The
  system `codex-cli 0.160.0` (`C:/Users/talys/AppData/Roaming/npm/codex`) supports it. The first passes therefore fell
  back to Claude, whose findings (dropped jurisdiction/timezone; update/setDefault races; deactivation vs setDefault)
  were real and fixed.
- **Real codex passes** (run without the Node 22 prefix), all findings verified and fixed test-first, none waived:
  | # | Finding | Fix |
  |---|---|---|
  | C1 | lost-checklist-order: seeded tasks had no position, tasks read by `dueDate` only | `case_tasks.position` (nullable, in the unapplied `20261013120000_case_types` migration); seeds 0..n-1; `CASE_TASK_ORDER` = position nulls last, then dueDate; real-DB retrieval test (`e85c9a65b`) |
  | C2 | stale-case-type-picker: only `caseTypes.list` invalidated | router-wide `utils.caseTypes.invalidate()` on every mutation (`9b3371890`) |
  | C3 | ambiguous-end-of-day (America/Santiago repeated last hour) | deadline = 1 ms before the next local day (`7ec2075b6`) |
  | C4 | repeated-midnight-offset (Asia/Amman 2021-10-29) | start of day from offsets bracketing midnight + exhaustive 2021/2026 × 11-zone test (`461edde35`) |
  | C5 | hidden required-field keys blocked "none ticked" inheritance | then C6 (codex flagged the first fix) |
  | C6 | silent-required-fields-change | a checkbox for each of the six supported keys; stored = shown (`b6673da54`) |
- Real codex run: **Verdict PASS, 0 findings** (2026-10-13T03:07Z, reviewer: codex).
- **Self-review gap after that run (S1):** `/cases/new` rendered `CaseForm` before `caseTypes.listActive` and
  `caseSettings.requiredFields.list` resolved, so a quick submit went out without the default case type and the Case
  Settings required fields. The page now waits for both lists, shows a loading state, and on failure shows an alert
  with a Retry that refetches only the list that failed (RED tests first, `c492d96f8`).
- **Final real codex run after S1: Verdict PASS, 0 findings** (2026-10-13T05:54:30Z, reviewer: codex, 45 files in
  scope). The 05:32Z attempt hit the OpenAI usage cap and fell back to Claude (PASS, 0 findings). That run is not
  counted as the codex pass; the review was re-run on codex after the cap reset.

## Notes

- **Legal coverage dead zone** (`LEGAL-MERGED-LCOV-DEADZONE-001`): only `apps/api/src/modules/legal/*.router.ts` is
  excluded from Sonar coverage. The SLA helper was therefore placed in `apps/api/src/lib/case-sla-deadline.ts`, so its
  new code is measured.
- **Design mockup check** (`docs/design/mockups/case-new.png` / `case-new.html`): the mockup's field order is
  Subject; Category | Priority; Description; Link to Client/Account; Assign To; Deadline. The Case type select takes
  the Category slot in the same two-column row, and every other field keeps its position. The added hint line sits
  under that row.
- **content-audit-results.json**: regenerating changed only `og_url` on the PG-204 routes, which is drift from #849
  (canonical domain) that affects every entry, so the file was left unchanged.
- **Test DB**: `prisma migrate status` against the local `intelliflow_test` reports the last common migration
  `20261007130000_account_territories`, with `20261013120000_case_types` pending, plus one migration from another lane
  (`20260629000000_add_report_templates`) that is not on this branch. `migrate deploy` was not run on that shared DB.
  `tests/integration/case-types.test.ts` applies this migration's SQL idempotently (PG-197 pattern), so the objects
  exist there but are not recorded in `_prisma_migrations`.
- **Node**: the host default is v25.2.1, which hangs pg writes, and the repo pin (24) is not installed. Corrected
  2026-10-13: the original exec run reported Node 22.14.0 via nvm for its tests; in the 2026-10-13 re-runs only the
  DB-backed steps (integration test, related-tests coverage, migrate-deploy proof) used Node 22.14.0; the other
  matrix rows ran on the host default v25.2.1 (recorded per row in `matop/validation-matrix.json`).
