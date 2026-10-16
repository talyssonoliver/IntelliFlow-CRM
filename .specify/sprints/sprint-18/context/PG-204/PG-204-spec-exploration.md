# PG-204 — /spec-exploration (Phase 0.75), run for real

- **When:** the 8 Explore sub-agents were launched just after `2026-10-13T06:12:43Z` (the clock read at the start of
  this step) and had all returned by `2026-10-13T06:17:16Z`.
- **Why it ran late:** the original spec session (2026-10-12/13 night) skipped this phase. The runner audit found that
  gap. This run explores the **final spec against the implemented code at `29c68754a`** (branch
  `agent/PG-204-case-types`, origin/main merged in). It does not replay the pre-spec exploration.
- **How:** one `subagent_type: Explore` sub-agent per spec agent (read-only). Each one read the final spec, then read,
  grepped and globbed its own area, citing file:line. All 8 read well over 2 files and cited line numbers. The
  verification checklist in `.claude/skills/spec-exploration/SKILL.md` passes.

| Agent | Files read (main ones) | Result |
|---|---|---|
| backend-architect | case-types.router.ts, cases.router.ts, case-settings.router.ts, router.ts, case-sla-deadline.ts, case-task-order.ts, account-territories.router.ts | 9 discrepancies (E1, E2, E4, E5, E6, E7, E8, E10, E11) |
| data-engineer | schema.prisma, the case_types migration, db/src/index.ts, the account_territories migration, the integration test, the autonomy policy | migration is Class A; 6 discrepancies (E1, E2, E3, E12, E13) |
| frontend-lead | case-types page/content/loading/components, new/page.tsx, CaseForm.tsx, sidebar cases.ts, accounts territory-mapping | exactly one route serves `/cases/case-types`; 7 discrepancies (E14, E15, E16, E17, E18, E19) |
| domain-expert | case-type-defaults.ts + test, Case.ts, CaseTask.ts, CaseEvents.ts, cases.router.ts, validators case.ts / case-types.ts / case-settings.ts | ruling Q1=A / Q2=Yes implemented; domain still has no infra deps; minors (E4, E7, E9, E20, E21) |
| test-engineer | every PG-204 test file | every AC except AC-CT15 (evidence-based) has a test; partial gaps (E22-E26) |
| security-lead | case-types.router.ts, cases.router.ts, trpc.ts, context.ts, tenant-context.ts, validators, migration | no cross-tenant path in PG-204 code; 2 pre-existing cross-tenant gaps in `cases.update` / `deleteTask` (E27); D3/D19 drift (E5, E6) |
| a11y-expert | the case-types UI, CaseForm.tsx, new/page.tsx, radio-group.tsx, button.tsx, priority-select.tsx | 9 spec discrepancies + 13 WCAG notes (E15-E19, E28-E33) |
| stoa-domain | domain/validators package.json + index.ts, PrismaCaseRepository + test, case-type-defaults.ts, router.ts + smoke test, migration | no hexagonal-boundary violation; E1, E3, E20 |

## Discrepancies (spec vs code) and how each is resolved

**Spec amended to match the code (the code's choice is the intended one):**
- **E1** No index on `cases(tenantId, caseTypeId)`. A plain CREATE INDEX on the populated `cases` table takes a SHARE
  lock, which the Class A gate forbids. The lookups are served by `cases_tenantId_idx` (migration.sql:10-12).
- **E2** The cases composite FK is added `NOT VALID` and then validated (migration.sql:97-98). Every existing row is
  NULL, so the validation scan is short.
- **E3** Recovery plan: forward-only. A down-migration is Class C (migration.sql:15-18). The spec's "drop …, no data
  loss" wording was wrong.
- **E4** The Risks row "00:00 DST accepted 1h limitation" is stale. The revised D7 supersedes it
  (case-sla-deadline.ts:47-77).
- **E5** D3 delete: a zero-row guarded delete returns PRECONDITION_FAILED "changed while you were deleting" without a
  re-read (case-types.router.ts:318-323).
- **E6** D19: create/update never write `isDefault`, so their only possible P2002 is the name index, and `setDefault`'s
  only one is the one-default index (case-types.router.ts:103-112, 370-375). Documented rather than branching on
  `meta.target`.
- **E7** Stale line numbers (cases.router.ts create is at :434; the remaining `ctx.user` casts are at :599/:649;
  schema.prisma Case is at :2125; case-settings.ts tokens start at :104).
- **E9** The enum check of the required-field keys lives in `packages/validators/__tests__/enum-consistency.spec.ts:105-110`,
  not in the domain test (domain cannot import validators).
- **E12** `requiredFields TEXT[]` has no NOT NULL (Prisma's normal output for `String[]`; adding it would show as drift).
  Prisma never writes NULL. Recorded as a known limitation.
- **E14 / E17** Checklist copy says "step" (it matches the "Add Step" CTA). The priority placeholder reads
  "Case Settings default".
- **E16** The selected colour is marked by the ring plus the radio dot indicator (radio-group.tsx:31), which is a
  non-colour cue. There is no separate check glyph.

**Code gaps to fix (the spec requires them and the code misses them):**
- **E10** `cases.update` includes `tasks: true` without `CASE_TASK_ORDER` (cases.router.ts:549). D9 says every API
  task read uses it. `PrismaCaseRepository` is in adapters and cannot import an api/lib constant, so the spec is
  narrowed to the API read paths.
- **E11** `updateCaseTypeSchema` inherits `isActive.default(true)`, so an API update that omits `isActive` silently
  reactivates a type (validators case-types.ts:44, 84-86).
- **E15** `/cases/new` shows server errors only as a toast (new/page.tsx:42-44). The spec (Web) requires inline +
  toast, and the rejected `mutateAsync` is unhandled.
- **E18** The Subject and Client `*` are read aloud and their inputs lack `aria-required` (CaseForm.tsx:288, 407); the
  Client error has no `role="alert"` (CaseForm.tsx:513).
- **E19** Removing the last checklist row moves focus to the previous row instead of the Add button
  (ResolutionChecklistEditor.tsx:79-83).
- **E28** The default-type RadioGroup is disabled while saving. That drops focus to `<body>` and there is no pending
  indicator (CaseTypesContent.tsx:58, 211). The spec asks for a pending state.
- **E29** axe is missing from the CaseTypesContent, CaseTypesLoading, DeleteCaseTypeDialog and CaseForm suites (spec
  test plan / AC-CT16).
- **E22-E26** Test gaps: no test that deactivating a type leaves existing cases' type intact; OWNER / SUPER_ADMIN not
  tested directly; `cases.router.case-types.test.ts:170-174` only asserts `toBeDefined`; a misnamed
  DeleteCaseTypeDialog test.

**Recorded, not changed (out of PG-204 scope or accepted):**
- **E8 / E13** P2003 mapping and "1 case uses this type" on a delete race; the default ⇒ active rule is enforced in
  the app only (as D4 says).
- **E20** `Case.create` in the domain aggregate keeps its own MEDIUM default; `cases.create` is the only API write path
  (spec line 325).
- **E21** "Assign to me" now notifies the caller about their own case (cases.router.ts:506).
- **E27** Pre-existing, not PG-204 code: `cases.update` accepts another tenant's `assignedTo` and updates by `{ id }`
  only; `deleteTask` deletes by task id without checking `caseId`/tenant (cases.router.ts:543-547, 752-754). Tracked
  as a GitHub issue + debt ledger + findings.
- **E30-E33** Further WCAG minors (live-region announcements while a Radix modal is open, the `aria-busy` loading
  output, the duplicate-step error not being live, the empty-name Save with no message, and the pre-existing CaseForm
  client combobox / clear button / focus-ring items). Recorded in the findings doc and the a11y issue.
