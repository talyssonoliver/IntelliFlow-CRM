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

## Tracked (out of scope)

| # | Finding | gh issue | Debt ledger |
|---|---|---|---|
| T1 | `cases.router.ts:597,647` read `ctx.user.id` (always undefined), so notifications fall back to `'system'` | #864 | `PG-204-CASES-NOTIFY-USER-ID-001` |
| T2 | `cases.router.test.ts` tests the Prisma mock, not the router (false coverage) | #865 | `PG-204-CASES-ROUTER-TEST-FALSE-COVERAGE-001` |
| T3 | Required-field policy is not enforced on `cases.update` | #866 | `PG-204-CASE-UPDATE-REQUIRED-FIELDS-001` |
| T4 | `timezone-utils` `getTimezoneOffsetMinutes` is wrong beyond +12h (Kiritimati/Tonga/Chatham) | #867 | `PG-204-TIMEZONE-OFFSET-BEYOND-12H-001` |
| T5 | Approved agent actions (incl. `create_case`) are never executed; `approval-workflow.ts:240` returns a canned success with a random `entityId` | #853 (already open, P1, filed by another lane) | (owned by #853) |

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
- **Test DB**: the local `intelliflow_test` is migration-managed only up to June 2026 (newer tables come from test
  helpers), so `prisma migrate deploy` was **not** run against it. Applying months of pending migrations to a DB shared
  by other lanes is unsafe. `tests/integration/case-types.test.ts` applies this migration's SQL idempotently (PG-197
  pattern).
- **Node**: the host default is v25.2.1, which hangs pg writes, and the repo pin (24) is not installed. All tests ran on
  Node 22.14.0 via nvm.
