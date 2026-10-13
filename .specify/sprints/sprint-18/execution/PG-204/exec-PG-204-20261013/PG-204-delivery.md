# Delivery Report: PG-204 — Module Settings: Case Types

Run: `exec-PG-204-20261013` · Branch: `agent/PG-204-case-types` (was `feat/pg-204-case-types`) · Verdict: **NEEDS_HUMAN** (status In Progress, 90%)

> **PRISMA MIGRATION:** `packages/db/prisma/migrations/20261013120000_case_types` (Class A, additive). It must be
> applied to production manually, before the code that writes `cases.caseTypeId` ships.

## Implemented
- Domain `resolveCaseCreateDefaults` (explicit > case type > PG-190 module default), `CASE_REQUIRED_FIELD_KEYS`,
  `CASE_TYPE_LIMITS`, `CASE_TYPE_ADMIN_ROLES` (ADR-076, accepted).
- DB: `case_types`, `case_type_checklist_items`, `cases.caseTypeId` with a tenant-consistent composite FK, CHECKs, RLS.
- Validators `case-types.ts`; `createCaseSchema.priority` is optional; `caseTypeId` added.
- API `caseTypes` router (list, listActive, create, update, delete, setDefault). `cases.create` applies case types and
  PG-190 defaults, enforces required fields, seeds the checklist as tasks in the case transaction, and preflights the
  tenant. `getById` returns the case type.
- Web `/cases/case-types` (stub replaced in place), a New Case type picker (replaces the unpersisted category list),
  and a case-detail badge.
- Fixed beyond the row: the "Assign to me" default assignee, and a client picker that searched contacts while
  `clientId` references accounts.

## TDD log (corrected 2026-10-13 after the runner audit)

The original line here said "RED → GREEN per layer". **That was false for the initial layers.** Their tests were
written with or after the code and first ran green. The table below claims RED only where the session transcript
shows a failing run before the fix commit. Times are UTC, taken from the transcript; commits are on this branch.

| Layer / cycle | Commit | Failing run observed before the fix? |
|---|---|---|
| Domain resolver (25 tests) | `9e20fd9c6` | **No.** Written with the code; first run green. |
| Validators (case-types, case, enum consistency) | `2a0468258` | **No.** |
| DB migration + integration test | `9e20fd9c6` / `5ed77059d` | **No.** |
| Router + case-creation wiring, SLA deadline | `5ed77059d` | **Partly.** One: the Pacific/Kiritimati (UTC+14) SLA test failed at 00:55:52Z, which exposed the timezone-utils +12h fold (#867) and led to the exact local helper. The other tests first ran green. |
| Web page, picker, detail badge | `de368071e` | **No.** |
| Claude-fallback review fixes: jurisdiction/timezone forwarding, update/setDefault races, WCAG review, deactivation guard | `fb0fb4b52`, `ab7438424`, `3a10045ad`, `438759ce3` | **No failing run observed.** |
| C1 checklist order | `e85c9a65b` | **Yes, compile-level.** 02:37:13Z: "Cannot find module ../../../lib/case-task-order" (the test was written first). |
| C2 picker invalidation | `9b3371890` | **Yes.** 02:43:52Z |
| C3 Santiago end of day | `7ec2075b6` | **Yes.** 02:47:05Z |
| C4 Amman repeated midnight | `461edde35` | **Yes.** 02:52:29Z |
| C5 required fields shown | `378efebe8` | **Yes.** 02:57:55Z (2 failing) |
| C6 a checkbox per stored field | `b6673da54` | **Yes.** 03:02:47Z (4 failing) |
| S1 New Case waits for both lists | `c492d96f8` | **Yes.** 03:40:19Z (3 failing), and again at 04:26:26Z after the crash restore |
| E10 update task order | `8491d69a5` | **Yes.** 06:23:59Z |
| E24 stronger create assertions | `8491d69a5` | Strengthened assertions. The one new failure (06:23:59Z) was a wrong label in the test ("Subject" vs the API's "Title"), so the test was corrected, not the code. |
| E11 isActive required on update | `8491d69a5` | **Yes** for the validators test (06:24:50Z). The router-level test first ran after the fix and was green. |
| E22 deactivation keeps cases; E23 OWNER/SUPER_ADMIN | `8491d69a5` | **No.** Characterization tests, green on first run. |
| E28 default-type pending state; axe on CaseTypesContent | `e3f23e584` | **Yes.** 06:26:13Z (axe: heading-order) |
| SectionHeader headingLevel | `e3f23e584` | **Yes.** 06:26:44Z |
| E18 Subject/Client markers, client alert; axe on CaseForm | `e3f23e584` | **Yes.** 06:28:07Z (3 failing; the axe failure was the test checking `document.body`, corrected to the container) |
| E19 focus after removing the last row | `e3f23e584` | **Yes.** 06:28:57Z |
| E15 inline server error on New Case | `e3f23e584` | **Yes.** 06:29:28Z |
| axe on CaseTypesLoading and DeleteCaseTypeDialog | `e3f23e584` | **No.** Green on first run. |

## Validation (corrected 2026-10-13; every number below is from a log)

The earlier version of this section quoted figures from the first exec run and said "STOA domain WARN". That Domain
verdict file had been hand-written. The MATOP Phase 3 run below replaces it; its evidence is in
`matop/` (gitignored by `.specify/sprints/.gitignore`, kept in the worktree).

| Step | Result | Evidence |
|---|---|---|
| Validation matrix rows 01-07 (at `6bf14467f`) | domain resolver 25; domain 2957; validators 2558; adapters 2967; db build + typecheck; api 7295 (18 pre-existing skips); integration case-types 17 on the local test DB (Node 22) - all exit 0 | `matop/validation-matrix.json`, `matop/gates/validation-matrix-0*.log` |
| Rows 08-13 (re-run at `d7d91e5e8`) | web 12677 tests in 797 files; typecheck; lint; build (224 pages, `/cases/case-types` and `/cases/new`); related-tests coverage; diff coverage 97.9% (559/571) - all exit 0 | same; run 1 at `6bf14467f` kept in `matop/gates/run1-at-6bf14467f/` |
| Baselines | root `pnpm run typecheck` and `pnpm run lint` exit 0, but both were 100% turbo cache hits (corroboration only) | `matop/gates/turbo-*.log` |
| Sonar guard over the branch diff | 49 TS/TSX files, exit 0 (CI mode; the local mode only sees uncommitted files) | `matop/gates/sonar-guard-branch-diff.log` |
| Gate 3c knip | 12 unused files, all pre-existing; none of the 29 created TS/TSX files | `matop/gates/gate-3c-knip.log` |
| Class A migrate deploy | `prisma migrate deploy` of all 68 migrations into a fresh scratch DB (after the CI Supabase bootstrap): exit 0; case_types objects + RLS verified; scratch DB dropped | `matop/gates/class-a-migrate-deploy-proof.log` (attempt 1 without the bootstrap failed at the baseline and is kept) |
| STOA sub-agents | Foundation PASS, Domain PASS, Quality PASS, Security WARN (pre-existing sprintf-js advisory, gh #876) -> aggregate **WARN** | `matop/stoa-verdicts/*.json`, `matop/stoa-aggregate.json` |
| a11y contrast at exec | FAIL (text-destructive 3.5:1 light / 1.8:1 dark; 3 swatch fills < 3:1) -> fixed in `d7d91e5e8` -> re-check PASS WITH MINOR | `matop/a11y-contrast-review.json`, `matop/a11y-contrast-review-recheck.json` |
| Codex review | reviewer codex, PASS, 0 findings, 47 files (at `d7d91e5e8`) | `matop/gates/codex-review-d7d91e5e8.log` |
| /code-review (full) and /sonarqube-fix | see the attestation gates `code-review skill` and `sonarqube-fix skill` | `matop/code-review-summary.json`, `matop/sonarcloud-main-issues-on-changed-files.json` |
| Domain resolver coverage | 100% statements 38/38, branches 26/26, functions 12/12, lines 32/32 (25 tests) | `matop/gates/domain-resolver-coverage.log` |

## Open
- AC-CT15 Lighthouse >= 90: Path A reaches only the `/login` redirect; Path C needs a production test admin, which
  agents never create; no waiver approver is named (NEEDS_HUMAN, runner ruling 2).
- Gate 4b: branch `agent/PG-204-case-types` is not pushed; the runner pushes after pre-ship.
- Security STOA WARN: the sprintf-js advisory (#876) needs a recorded risk acceptance to count as PASS.
- Shared local test DB: the case_types objects exist there without a `_prisma_migrations` row (needs
  `prisma migrate resolve --applied 20261013120000_case_types` before a `migrate deploy` there).
- Tracked: #864, #865, #866, #867, #880, #881, #882, #885 (+ #853, #876 owned elsewhere).
