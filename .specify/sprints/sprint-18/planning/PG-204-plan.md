# Execution Plan: PG-204 — Module Settings: Case Types

**Spec:** `.specify/sprints/sprint-18/specifications/PG-204-spec.md` (APPROVED; consensus re-run 2026-10-13 on the final spec: 8/8 in 1 round. The original "8/8" was false: 3 verdicts on a draft) · **Sprint:** 18 ·
**Branch:** `agent/PG-204-case-types` (renamed from `feat/pg-204-case-types`) · **Owner ruling:** `.specify/sprints/sprint-18/context/PG-204/PG-204-owner-ruling.md`
· **ADR:** ADR-076 · **PRD:** `docs/planning/prd-module-settings.md` (PG-204 Addendum)

> **Checkbox re-verify (2026-10-13):** each box was checked against code or logs. A ticked box carries its citation inline. `matop/` means `.specify/sprints/sprint-18/execution/PG-204/exec-PG-204-20261013/matop/`. Result: 63 kept with a citation, 1 unticked.

> **PRISMA MIGRATION (L13):** `packages/db/prisma/migrations/20261013120000_case_types/` is additive Class A. The
> production apply is manual and must happen **before** the code ships. This is called out in the final report and
> the attestation.

## Runner constraints (apply to every step)

- Node: run tests and DB work under Node 22. The host default v25.2.1 hangs pg writes, and Node 24 (the repo pin)
  is not installed. Prefix commands with `export PATH=/c/Users/talys/AppData/Roaming/nvm/v22.14.0:$PATH;
  export NODE_OPTIONS=--max-old-space-size=8192;`.
- One test process at a time. Single-file vitest runs are exempt from the slot wrapper. Full package suites, builds
  and DB tests go through `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-204 -- <cmd>`, and DB tests
  also add `--exclusive intelliflow-db`.
- `@intelliflow/web`'s `test` script is watch-mode `vitest`, so web runs always use `vitest run`.
- Commits: staged by name, message via `-F`, hooks on, no AI attribution. **No push / PR / merge.**
- Never use `.env.local` `DATABASE_URL`/`DIRECT_URL` (production). The committed `.env.test` targets
  `localhost:5433/intelliflow_test`.

## Preflight Checks

- [x] `git branch --show-current` = `agent/PG-204-case-types` (was `feat/pg-204-case-types`); tree clean except PG-204 files. *Re-verified 2026-10-13:* branch renamed by the runner: `git branch --show-current` = `agent/PG-204-case-types` (was `feat/pg-204-case-types` at preflight); delivery.md:3.
- [x] `docker ps --filter name=postgres-test --format "{{.Status}}"` contains `healthy`. *Re-verified 2026-10-13:* `matop/gates/validation-matrix-07-integration-db.rerun.log:4` "docker: Up 2 hours (healthy)"; re-checked healthy before the post-reboot re-run.
- [x] Packages built: `ls packages/{domain,validators,db}/dist` exist. *Re-verified 2026-10-13:* `packages/{domain,validators,db}/dist` exist; `matop/gates/validation-matrix-05-db.log` exit 0.
- [x] Exec preflights: `node tools/scripts/exec-preflight/check-plan-reviewer-subagent.mjs PG-204`, *Re-verified 2026-10-13:* `matop/gates/preflight-plan-reviewer.log` exit 0; `preflight-exec-readiness.log` "OK - 5 checks"; `preflight-nav-wiring.log`, `preflight-page-doc-cochange.log` OK.
   `node tools/scripts/exec-preflight/check-page-doc-cochange.mjs PG-204`,
   `node tools/scripts/exec-preflight/check-nav-wiring.mjs PG-204`, `node tools/scripts/exec-preflight/check-exec-readiness.mjs PG-204`.
- [x] Record context_ack: `.specify/sprints/sprint-18/attestations/PG-204/context_ack.json` (files read + SHA-256), *Re-verified 2026-10-13:* `attestations/PG-204/context_ack.json:66-67`: 15 SHA-256 values hashed in one pass at 00:22:19Z; per-file read times were NOT recorded (`read_at_note`).
   CSV row artifact.

## Dependencies Verified

| Dependency | Status | Verified by |
|---|---|---|
| PG-178 | DONE | sidebar entry `apps/web/src/components/sidebar/configs/cases.ts:14`; attestation COMPLETE |
| PG-190 | DONE | `caseSettings` router (`apps/api/src/router.ts:150`), `CaseSettings`/`CaseRequiredField` models; attestation COMPLETE |

## Implementation Reality Checks

| Surface | Production Consumer | Replaces / Blocks | Verification Command |
|---|---|---|---|
| `resolveCaseCreateDefaults` (domain) | `cases.create` in `apps/api/src/modules/legal/cases.router.ts` | direct `input.priority` write with no settings read | `pnpm --dir apps/api exec vitest run src/modules/legal/__tests__/cases.router.case-types.test.ts` |
| `caseTypes.list/create/update/delete/setDefault` | `CaseTypesContent.tsx` | "coming soon" stub `cases/(list)/case-types/page.tsx` | `pnpm --dir apps/web exec vitest run "src/app/cases/(list)/case-types"` |
| `caseTypes.listActive` | `cases/(list)/new/page.tsx` → `CaseForm` | fake `CATEGORY_OPTIONS` select in `CaseForm.tsx:55` (removed) | `pnpm --dir apps/web exec vitest run src/components/cases/__tests__/CaseForm.test.tsx` |
| `caseSettings.general.get` + `caseSettings.requiredFields.list` (existing, read) | `cases.create` (server) + `new/page.tsx` (markers) | dead PG-190 config | as above |
| default assignee `ctx.tenant.userId` | `cases.create` | broken `(ctx.user as {id?}).id` at `cases.router.ts:348` | `cases.router.case-types.test.ts` "omitted assignedTo" case |
| `cases.getById.caseType` | `CaseDetail.tsx` badge | — | `pnpm --dir apps/web exec vitest run src/components/cases/__tests__/CaseDetail.test.tsx` |
| composite FK `cases(tenantId,caseTypeId)` | DB | single-column link (cross-tenant) | `tests/integration/case-types.test.ts` |

## Estimated Effort

PERT from the CSV (180/360/540 min) is 360 min. The real scope after the ruling is larger (a migration, wiring into case creation, a11y work):

| Phase | Files | Estimate |
|---|---|---|
| RED tests | 24 test files (16 new + 8 extended) | 4–6 h |
| GREEN implementation | 27 source files (14 new + 13 modified) + 1 migration | 6–9 h |
| Docs / registries / tracking | 17 files | 1.5–2 h |
| Validation (suites, build, codex, reviews) | — | 2–3 h |
| **Total** | **68 files** | **13.5–20 h** (Planned Finish 2026-10-15) |

## Files Summary

**Create (source, 14):**
1. `packages/domain/src/legal/cases/case-type-defaults.ts`
2. `packages/db/prisma/migrations/20261013120000_case_types/migration.sql`
3. `packages/validators/src/case-types.ts`
4. `apps/api/src/modules/legal/case-types.router.ts`
5. `apps/api/src/lib/case-sla-deadline.ts` (D7 date maths, built on timezone-utils)
6. `apps/web/src/app/cases/(list)/case-types/CaseTypesContent.tsx`
7. `apps/web/src/app/cases/(list)/case-types/CaseTypesLoading.tsx`
8. `apps/web/src/app/cases/(list)/case-types/components/CaseTypeList.tsx`
9. `apps/web/src/app/cases/(list)/case-types/components/CaseTypeDialog.tsx`
10. `apps/web/src/app/cases/(list)/case-types/components/ResolutionChecklistEditor.tsx`
11. `apps/web/src/app/cases/(list)/case-types/components/DeleteCaseTypeDialog.tsx` (on `@intelliflow/ui` `AlertDialog`, which keeps the server error in-dialog; the shared `ConfirmationDialog` is not changed)
12. `apps/web/src/components/cases/case-type-colors.ts` (shared by the case-types page and `CaseDetail`; it lives in `components/cases` so that no route-folder cross-import is needed)
13. `apps/web/src/components/cases/case-type-labels.ts` (field/priority/SLA display labels shared by the list, dialog, CaseForm hint and CaseDetail)

14. `apps/api/src/lib/case-task-order.ts` (codex C1, 2026-10-13: shared task read order: position nulls last, then dueDate)

**Modify (source, 13):**
1. `packages/domain/src/index.ts`
2. `packages/db/prisma/schema.prisma`
3. `packages/db/src/index.ts`
4. `packages/validators/src/case-settings.ts`
5. `packages/validators/src/case.ts`
6. `packages/validators/src/index.ts`
7. `apps/api/src/router.ts`
8. `apps/api/src/modules/legal/cases.router.ts`
9. `apps/web/src/app/cases/(list)/case-types/page.tsx`
10. `apps/web/src/components/cases/CaseForm.tsx`
11. `apps/web/src/app/cases/(list)/new/page.tsx`
12. `apps/web/src/components/cases/CaseDetail.tsx`
13. `apps/web/src/components/cases/types.ts`

**Tests, create (16):**
1. `packages/domain/src/legal/cases/__tests__/case-type-defaults.test.ts`
2. `packages/validators/src/__tests__/case-types.test.ts`
3. `apps/api/src/modules/legal/__tests__/case-types.router.test.ts`
4. `apps/api/src/modules/legal/__tests__/cases.router.case-types.test.ts`
5. `apps/api/src/lib/__tests__/case-sla-deadline.test.ts`
6. `tests/integration/case-types.test.ts`
7. `apps/web/src/app/cases/(list)/case-types/__tests__/page.test.tsx`
8. `apps/web/src/app/cases/(list)/case-types/__tests__/CaseTypesContent.test.tsx`
9. `apps/web/src/app/cases/(list)/case-types/__tests__/CaseTypesLoading.test.tsx`
10. `apps/web/src/app/cases/(list)/case-types/components/__tests__/CaseTypeList.test.tsx`
11. `apps/web/src/app/cases/(list)/case-types/components/__tests__/CaseTypeDialog.test.tsx`
12. `apps/web/src/app/cases/(list)/case-types/components/__tests__/ResolutionChecklistEditor.test.tsx`
13. `apps/web/src/app/cases/(list)/case-types/components/__tests__/DeleteCaseTypeDialog.test.tsx`
14. `apps/web/src/components/cases/__tests__/case-type-helpers.test.ts`
15. `apps/web/src/components/cases/__tests__/CaseForm.test.tsx`
16. `apps/web/src/app/cases/(list)/new/__tests__/page.test.tsx`

**Tests, extend (8):**
1. `packages/validators/src/__tests__/case.test.ts`
2. `packages/validators/src/__tests__/case-settings.test.ts`
3. `packages/validators/__tests__/enum-consistency.spec.ts`
4. `apps/api/src/modules/legal/__tests__/legal-module-entitlement.test.ts`
5. `apps/api/src/__tests__/app-router.smoke.test.ts`
6. `packages/adapters/src/repositories/__tests__/PrismaCaseRepository.test.ts` (exists)
7. `apps/web/src/components/cases/__tests__/CaseDetail.test.tsx`
8. `apps/api/src/modules/legal/__tests__/cases.router.test.ts`: conditional. It is touched in Step 12 **only if** its run shows a crash from the new `create` reads. Otherwise it is untouched, and the count drops to 7.

**Docs / registries / tracking (17):**
1. `docs/architecture/adr/ADR-076-case-types-applied-at-case-creation.md`
2. `docs/architecture/adr/README.md`
3. `docs/planning/prd-module-settings.md`
4. `docs/architecture/diagrams/complete-dependency-chains.md`
5. `docs/design/page-registry.md`
6. `docs/design/sitemap.md`
7. `docs/design/PAGE_MAP_AND_FLOWS.md`
8. `docs/design/navigation-reachability-audit.md`
9. `docs/design/ui-flow-mapping.md`
10. `docs/design/information-architecture.md`
11. `artifacts/reports/content-audit-results.json` (PG-204 entries only)
12. `artifacts/metrics/debt-ledger.yaml`
13. `.specify/sprints/sprint-18/findings/PG-204-findings.md`
14. `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv` (+ `Sprint_plan_I.csv` via the pre-commit hook)
15. `.specify/sprints/sprint-18/attestations/PG-204/attestation.json`
16. `.specify/sprints/sprint-18/attestations/PG-204/context_ack.json`
17. `.specify/sprints/sprint-18/attestations/PG-204/task-tracking.json`

Page counts are unchanged because no page is added: `apps/web/src/app/__tests__/sitemap-reconciliation.test.ts` is **run, not modified**.
`lighthouserc.authenticated.js` is **not** modified. It is already parametrised by `LHCI_URLS`/`LHCI_OUTPUT_DIR` (PG-197), and the spec was amended to match.

## Execution Steps

### Phase 1 — RED: Write Failing Tests

#### Step 1: Domain resolver tests (AC-CT9, AC-CT10, AC-CT11, AC-CT14, D6, D8, D14, D15)
**Type:** test
**Files to Create:**
- `packages/domain/src/legal/cases/__tests__/case-type-defaults.test.ts`

- [x] Priority: input wins; type wins over module; module `'HIGH'` wins over fallback; module `'garbage'`/`null` → `MEDIUM` (`prioritySource` asserted each time). *Re-verified 2026-10-13:* `packages/domain/src/legal/cases/__tests__/case-type-defaults.test.ts:93-136`.
- [x] Deadline: `hasDeadline` → `{kind:'input'}`; type SLA 14 → `{kind:'sla',days:14}`; null SLA / no type → `{kind:'none'}`. *Re-verified 2026-10-13:* case-type-defaults.test.ts:144-165.
- [x] Required: type non-empty set → `requiredSource:'type'` and tenant rows ignored; type with `[]` → tenant rows; no type → tenant rows; `isRequired:false` ignored; unknown keys ignored. *Re-verified 2026-10-13:* case-type-defaults.test.ts:169-212.
- [x] Effective values: `deadline` required + SLA → satisfied; `deadline` required, no SLA, no input → missing; `description: '   '` and `jurisdiction: ''` → missing; the order of `missingRequired` follows `CASE_REQUIRED_FIELD_KEYS`. *Re-verified 2026-10-13:* case-type-defaults.test.ts:214-272.
- [x] Seeds: checklist order kept, titles trimmed; no type → `[]`. *Re-verified 2026-10-13:* case-type-defaults.test.ts:276-292.
- [x] Consts: `CASE_REQUIRED_FIELD_KEYS` has 6 keys; `CASE_TYPE_LIMITS` values; `CASE_TYPE_ADMIN_ROLES` equals `ACCOUNT_OWNER_ADMIN_ROLES` (identity). *Re-verified 2026-10-13:* case-type-defaults.test.ts:53-78 (:77 identity).
**Validation:** `pnpm --dir packages/domain exec vitest run src/legal/cases/__tests__/case-type-defaults.test.ts` → fails (module missing).

#### Step 2: Validator tests (AC-CT2, D12, D13, D14, D18)
**Type:** test
**Files to Create:**
- `packages/validators/src/__tests__/case-types.test.ts`
**Files to Modify:**
- `packages/validators/src/__tests__/case.test.ts`
- `packages/validators/src/__tests__/case-settings.test.ts`
- `packages/validators/__tests__/enum-consistency.spec.ts`

- [x] `createCaseTypeSchema`: trims name; rejects '' / '   ' / 101 chars; category ≤ 60 and optional; colour = 8 tokens, rejects `neon`; `defaultPriority` enum or null; SLA int 1..3650 or null, rejects 0, 3651 and 1.5; `requiredFields` keys only, ≤ 6, duplicate → superRefine error at `requiredFields[N]`; checklist ≤ 20, title 1..200 trimmed, case-insensitive duplicate → "items 1 and 3" at `checklist[2].title`; `isActive` defaults to true. *Re-verified 2026-10-13:* `packages/validators/src/__tests__/case-types.test.ts:62-105`.
- [x] `updateCaseTypeSchema` requires `id`; `deleteCaseTypeSchema`; `setDefaultCaseTypeSchema` accepts `null`. *Re-verified 2026-10-13:* case-types.test.ts:115-143.
- [x] `findDuplicateCaseTypeName(['NDA','Litigation'],' nda ')` → `'NDA'`; with `excludeId` the row being edited is ignored; `caseTypeNameSchema(existing)` superRefine rejects a duplicate type name (row DoD). *Re-verified 2026-10-13:* case-types.test.ts:145-170.
- [x] `case.test.ts`: `createCaseSchema.parse({title, clientId})` leaves `priority` `undefined` (was `'MEDIUM'` at line ~111); accepts `caseTypeId`; `updateCaseSchema.parse({id, caseTypeId})` strips `caseTypeId`. *Re-verified 2026-10-13:* `packages/validators/src/__tests__/case.test.ts:112` (priority undefined), :232, :250-251.
- [x] `case-settings.test.ts`: `caseRequiredFieldKeySchema.options` equals `CASE_REQUIRED_FIELD_KEYS`. *Re-verified 2026-10-13:* the assertion lives in `packages/validators/__tests__/enum-consistency.spec.ts:105-109`, not in case-settings.test.ts as planned.
- [x] `enum-consistency.spec.ts`: add the `CASE_REQUIRED_FIELD_KEYS` ↔ `caseRequiredFieldKeySchema` pair. *Re-verified 2026-10-13:* `packages/validators/__tests__/enum-consistency.spec.ts:105-109`.
**Validation:** `pnpm --dir packages/validators exec vitest run src/__tests__/case-types.test.ts src/__tests__/case.test.ts` → fails.

#### Step 3: Case-types router tests (AC-CT4..AC-CT7, D3, D5, D17, D19)
**Type:** test
**Files to Create:**
- `apps/api/src/modules/legal/__tests__/case-types.router.test.ts`

Uses `prismaMock` + `createTestContext` from `apps/api/src/test/setup.ts`, `$transaction.mockImplementation(async (cb) => cb(prismaMock))`, and `caseTypesRouter.createCaller(ctx)`.
- [x] `list`: `where.tenantId` asserted; checklist ordered; `caseCount` from `case.groupBy` (tenant-scoped); order is default first, then name; `canEdit` true for ADMIN/MANAGER and false for USER. *Re-verified 2026-10-13:* `apps/api/src/modules/legal/__tests__/case-types.router.test.ts:102-138`.
- [x] `listActive`: `where {tenantId, isActive:true}`; slim DTO. *Re-verified 2026-10-13:* case-types.router.test.ts:142-173.
- [x] `create`: USER → `FORBIDDEN` with no write; 50 existing → `BAD_REQUEST`; happy path inside `$transaction`: `caseType.create` data has explicit keys only (`tenantId` comes from ctx even if the input carries an extra key) and `caseTypeChecklistItem.createMany` has `sortOrder` 0..n with **no `skipDuplicates`**; P2002 name target → `CONFLICT` "already exists"; P2002 default target → `CONFLICT` "default type changed"; other errors rethrown. *Re-verified 2026-10-13:* case-types.router.test.ts:175-242.
- [x] `update`: foreign id (`findFirst` null) → `NOT_FOUND` with no `$transaction`; default + `isActive:false` → `PRECONDITION_FAILED`; happy path replaces the checklist inside the tx (`where {tenantId, caseTypeId}`); P2002 → `CONFLICT`. *Re-verified 2026-10-13:* case-types.router.test.ts:245-333.
- [x] `delete`: foreign → `NOT_FOUND`; default → `PRECONDITION_FAILED`; `case.count` 3 → `CONFLICT` "3 cases use this type"; 1 → singular "1 case"; 0 → `deleteMany {id, tenantId, isDefault:false}` inside the tx; P2003 → `CONFLICT`. *Re-verified 2026-10-13:* case-types.router.test.ts:336-405.
- [x] `setDefault`: `null` clears only (`updateMany {tenantId,isDefault:true}`); foreign → `NOT_FOUND`; inactive → `PRECONDITION_FAILED`; happy path clear-then-set in one tx; P2002 → `CONFLICT`. *Re-verified 2026-10-13:* case-types.router.test.ts:407-471.
- [x] Every mutation for a non-admin → `FORBIDDEN`. *Re-verified 2026-10-13:* case-types.router.test.ts:177,255,342,409.
**Validation:** `pnpm --dir apps/api exec vitest run src/modules/legal/__tests__/case-types.router.test.ts` → fails.

#### Step 4: Case-creation wiring tests (AC-CT9..AC-CT14, D7, D10, D11)
**Type:** test
**Files to Create:**
- `apps/api/src/modules/legal/__tests__/cases.router.case-types.test.ts`
- `apps/api/src/lib/__tests__/case-sla-deadline.test.ts`
**Files to Modify:**
- `apps/api/src/modules/legal/__tests__/legal-module-entitlement.test.ts`
- `apps/api/src/__tests__/app-router.smoke.test.ts`

- [x] `case-sla-deadline`: `computeSlaDeadline(now, days, tz)` returns 23:59:59.999 local on D+N for UTC, Europe/London (BST→GMT target), America/New_York (2026-03-08 spring-forward and 2026-11-01 fall-back target days), Australia/Sydney, Pacific/Kiritimati; an invalid tz falls back to UTC; `now` at 23:30 local stays on the local date. *Re-verified 2026-10-13:* `apps/api/src/lib/__tests__/case-sla-deadline.test.ts:25-90`.
- [x] `cases.create` (real caller, `vi.useFakeTimers`): *Re-verified 2026-10-13:* `apps/api/src/modules/legal/__tests__/cases.router.case-types.test.ts` (priority, deadline, required fields, checklist on tx, preflight, assignee, getById, update).
  - explicit priority is kept and the type is not consulted for it; type HIGH; no type with module URGENT; no settings → MEDIUM.
  - blank deadline + SLA 14 → `computeSlaDeadline` value + timezone stored; explicit deadline kept.
  - type required `jurisdiction` missing → `BAD_REQUEST` "Required fields missing: Jurisdiction" with no `case.create`; with no type, tenant rows (`description` required) are enforced; no rows → `DEFAULT_CASE_REQUIRED_FIELDS` (passes).
  - checklist → `caseTask.createMany` on the **tx** object with `{tenantId, caseId, title, status:'PENDING', assignee, dueDate:null}` in order; empty checklist → no `createMany`; `createMany` throws → error propagates and the notification is not sent.
  - inactive/foreign type → `NOT_FOUND` "Case type not found"; foreign `clientId` → `NOT_FOUND` "Client not found"; foreign explicit `assignedTo` → `NOT_FOUND` "Assignee not found"; all with no `case.create`.
  - omitted `assignedTo` → `assignedTo = ctx.tenant.userId` (regression for D11).
  - `getById` returns `caseType {id,name,colorToken}` or `null` (tenant-scoped lookup).
  - `update({id, caseTypeId})` → `case.update` data has no `caseTypeId`.
- [x] `legal-module-entitlement`: `caseTypes` in the gated router list (incl. `listActive`). *Re-verified 2026-10-13:* `apps/api/src/modules/legal/__tests__/legal-module-entitlement.test.ts:40`.
- [x] `app-router.smoke`: `caseTypes` registered with `list, listActive, create, update, delete, setDefault`. *Re-verified 2026-10-13:* `apps/api/src/__tests__/app-router.smoke.test.ts:142-150`.
**Validation:** `pnpm --dir apps/api exec vitest run src/modules/legal/__tests__/cases.router.case-types.test.ts src/lib/__tests__/case-sla-deadline.test.ts` → fails.

#### Step 5: Adapter round-trip test (spec M5)
**Type:** test
**Files to Modify:**
- `packages/adapters/src/repositories/__tests__/PrismaCaseRepository.test.ts` (exists; add one case)

- [x] `save` upsert `create`/`update` payloads never include `caseTypeId`. *Re-verified 2026-10-13:* `packages/adapters/src/repositories/__tests__/PrismaCaseRepository.test.ts:103-104`.
**Validation:** `pnpm --dir packages/adapters exec vitest run src/repositories/__tests__/PrismaCaseRepository.test.ts` → passes now and stays green (pins behaviour).

#### Step 6: DB integration test (AC-CT2, AC-CT5, AC-CT6, AC-CT7, NF-1)
**Type:** test
**Files to Create:**
- `tests/integration/case-types.test.ts`

PG-197 scaffold (`tests/integration/account-territories.test.ts:28-79`): `ensureMigrationSql()` probes `pg_constraint` for `case_types_colorToken_check`. If it is absent, it drops only `case_type_checklist_items` and `case_types`, replays the migration statements (skipping `ALTER TABLE "cases" ADD COLUMN`), and adds the cases FK and index idempotently (`IF NOT EXISTS` / `DO $$ … duplicate_object`). It never drops `cases`. Tenants are created per suite with unique ids and cleaned up by tenant.
- [x] colorToken CHECK rejects `neon`; SLA CHECK rejects 0; name blank CHECK; `requiredFields` subset + cardinality CHECKs; checklist blank title CHECK. *Re-verified 2026-10-13:* `tests/integration/case-types.test.ts` neon/SLA 0/blank/unknown key/blank checklist title; the cardinality half had no test until "rejects more than six required-field entries" was added at the re-verify (characterization, passed first run; see the row-07 re-run log).
- [x] `lower(name)` unique within a tenant (`NDA` vs `nda` → 23505); same name in another tenant OK. *Re-verified 2026-10-13:* tests/integration/case-types.test.ts:225-230.
- [x] one default per tenant (second default → 23505; other tenant OK). *Re-verified 2026-10-13:* tests/integration/case-types.test.ts:232-237.
- [x] checklist composite FK: item with tenant B + type of tenant A → 23503. *Re-verified 2026-10-13:* tests/integration/case-types.test.ts:266-274.
- [x] **cases composite FK**: a case in tenant B referencing tenant A's type → 23503; a NULL `caseTypeId` is accepted. *Re-verified 2026-10-13:* tests/integration/case-types.test.ts:278-292.
- [x] deleting a referenced type → 23503; a tenant delete cascades both tables. *Re-verified 2026-10-13:* blocked delete: tests/integration/case-types.test.ts:294-298. The tenant-delete cascade had no test until "are removed with their type when the tenant is deleted" was added at the re-verify (characterization; row-07 re-run log).
- [x] `pg_policies` has `_tenant_isolation` on both tables. *Re-verified 2026-10-13:* tests/integration/case-types.test.ts:358-374.
- [x] the SQL `requiredFields` key list equals `CASE_REQUIRED_FIELD_KEYS`. *Re-verified 2026-10-13:* tests/integration/case-types.test.ts:239-247.
**Validation:** runs in Step 9 after the migration (it skips without `DATABASE_URL`).

#### Step 7: Web tests (AC-CT1, AC-CT3, AC-CT8, AC-CT13, AC-CT16)
**Type:** test
**Files to Create:**
- `apps/web/src/app/cases/(list)/case-types/__tests__/page.test.tsx`
- `apps/web/src/app/cases/(list)/case-types/__tests__/CaseTypesContent.test.tsx`
- `apps/web/src/app/cases/(list)/case-types/__tests__/CaseTypesLoading.test.tsx`
- `apps/web/src/app/cases/(list)/case-types/components/__tests__/CaseTypeList.test.tsx`
- `apps/web/src/app/cases/(list)/case-types/components/__tests__/CaseTypeDialog.test.tsx`
- `apps/web/src/app/cases/(list)/case-types/components/__tests__/ResolutionChecklistEditor.test.tsx`
- `apps/web/src/app/cases/(list)/case-types/components/__tests__/DeleteCaseTypeDialog.test.tsx`
- `apps/web/src/components/cases/__tests__/case-type-helpers.test.ts`
- `apps/web/src/components/cases/__tests__/CaseForm.test.tsx`
- `apps/web/src/app/cases/(list)/new/__tests__/page.test.tsx`
**Files to Modify:**
- `apps/web/src/components/cases/__tests__/CaseDetail.test.tsx`

Mock `@/lib/trpc` as in PG-197 `TerritoryMappingContent.test.tsx`.
- [x] page: Suspense shell renders `CaseTypesContent`; the fallback is `CaseTypesLoading`. *Re-verified 2026-10-13:* `apps/web/src/app/cases/(list)/case-types/__tests__/page.test.tsx:16-22`.
- [x] Content: loading skeleton; error + Retry calls `refetch`; empty → `EmptyState` with `entity="cases"`, `variant="folder"`, `phase="passive"` and no inner button; list renders; the "New Case Type" header button calls the list ref's `openCreate` (forwardRef mock); the default RadioGroup ("Default case type") calls `setDefault` and announces it; non-admin → controls disabled + visible "Only administrators and managers can change case types." referenced by `aria-describedby`. *Re-verified 2026-10-13:* CaseTypesContent.test.tsx:145-170; CaseTypeList.test.tsx:138 (EmptyState).
- [x] Loading: `aria-busy="true"`, bento columns. *Re-verified 2026-10-13:* CaseTypesLoading.test.tsx:10; page.test.tsx:22.
- [x] List: `ref.current.openCreate()` opens the dialog; row text "Due in 14 days", "No SLA", "2 required fields", "No cases"/"1 case"/"12 cases", "Default", "Inactive"; buttons "Edit NDA"/"Delete NDA"; focus returns to Edit after closing. *Re-verified 2026-10-13:* CaseTypeList.test.tsx:77-116.
- [x] Dialog: required name; client duplicate-name error (via `findDuplicateCaseTypeName`); server CONFLICT → `role="alert"` under the name, `aria-invalid`, focus to name; colour fieldset/legend "Colour" with visible names; required fieldset/legend "Required when creating a case" + help text; SLA 0 rejected; the submit payload shape matches `createCaseTypeSchema`; edit prefill normalises a legacy colour to `slate`. *Re-verified 2026-10-13:* CaseTypeDialog.test.tsx:157-260.
- [x] Checklist editor: labelled inputs "Checklist item N"; move up/down/remove buttons named per item; `aria-disabled` at the ends with focus kept; live-region messages; focus after add/remove; Add disabled at 20 with visible "Maximum 20 items". *Re-verified 2026-10-13:* ResolutionChecklistEditor.test.tsx:43-140.
- [x] Delete dialog: the server error stays in the dialog with `role="alert"`; confirm calls `delete`; on success it closes and calls `onDeleted`. *Re-verified 2026-10-13:* DeleteCaseTypeDialog.test.tsx:31-46.
- [x] helpers (`apps/web/src/components/cases/__tests__/case-type-helpers.test.ts`): `swatchClass('blue')`, unknown → slate; `describeCaseTypeDefaults({defaultPriority:'HIGH',defaultSlaDays:14})` → "High priority · due in 14 days"; singular/plural labels. *Re-verified 2026-10-13:* `apps/web/src/components/cases/__tests__/case-type-helpers.test.ts:37,76`.
- [x] CaseForm (create): a "Case type" select replaces "Category" (no `TECHNICAL` option); the default type is preselected; the "Use default" priority option → payload without `priority`; explicit priority → included; hint `#case-type-hint` (`role="status"`) text "Type default: High priority · due in 14 days"; `aria-describedby` on the type + priority selects; `aria-required` on type-required fields; `caseTypeId` in the payload; None → no `caseTypeId`. Edit mode has no type select and keeps the priority value. *Re-verified 2026-10-13:* `apps/web/src/components/cases/__tests__/CaseForm.test.tsx:98-122`.
- [x] new page: passes `listActive` data + module required fields to CaseForm; `mutateAsync` gets `caseTypeId` and omits `priority` when blank; a server error → toast. *Re-verified 2026-10-13:* `apps/web/src/app/cases/(list)/new/__tests__/page.test.tsx:90,97,157`.
- [x] CaseDetail: badge "Litigation" when `caseType` is set; none when null. *Re-verified 2026-10-13:* `apps/web/src/components/cases/__tests__/CaseDetail.test.tsx:119,131`.
**Validation:** `pnpm --dir apps/web exec vitest run "src/app/cases/(list)/case-types" src/components/cases/__tests__/CaseForm.test.tsx "src/app/cases/(list)/new"` → fails.

> **Checkpoint RED:** commit the failing tests (`test(pg-204): …`). Hooks lint/typecheck staged files, so test files
> importing not-yet-existing modules may fail typecheck. If the hook blocks, fold RED into the matching GREEN commit
> per layer, never `--no-verify`.

### Phase 2 — GREEN: Make Tests Pass (layer order: domain → db → validators → api → web)

#### Step 8: Domain resolver
**Type:** implementation
**Files to Create:**
- `packages/domain/src/legal/cases/case-type-defaults.ts`
**Files to Modify:**
- `packages/domain/src/index.ts` (after line 66: `export * from './legal/cases/case-type-defaults';`)

Pure functions per spec D15 (imports only `CASE_PRIORITIES`/`CasePriority` from `./CaseEvents` and `ACCOUNT_OWNER_ADMIN_ROLES` from `../../crm/account/territory/territory-constants`).
**Validation:** `pnpm --dir packages/domain exec vitest run src/legal/cases/__tests__/case-type-defaults.test.ts --coverage.enabled --coverage.include=src/legal/cases/case-type-defaults.ts` (≥ 95%); `pnpm --filter @intelliflow/domain build`.

#### Step 9: Prisma schema + migration (Class A, L13)
**Type:** implementation
**Files to Create:**
- `packages/db/prisma/migrations/20261013120000_case_types/migration.sql`
**Files to Modify:**
- `packages/db/prisma/schema.prisma`
- `packages/db/src/index.ts`

- [x] Schema per spec Data section; SQL-only comment block above `model CaseType` ("do not drop in a diff"). *Re-verified 2026-10-13:* `packages/db/prisma/schema.prisma:2262-2274`.
- [x] Migration SQL per the spec outline. Header: Class A, recovery plan, `cases` index lock note. Statement order: tables, Prisma indexes, SQL-only indexes, FKs (tenant cascade, checklist composite cascade, cases composite NO ACTION), CHECKs, RLS. *Re-verified 2026-10-13:* `packages/db/prisma/migrations/20261013120000_case_types/migration.sql:3,9-16`.
- [x] Generate the SQL skeleton with `pnpm --filter @intelliflow/db exec prisma migrate diff --from-schema-datasource … ` **only against the local test DB**; or hand-write from the PG-197 template (preferred, no DB call). Then add the SQL-only objects. *Re-verified 2026-10-13:* hand-written path taken, commit `9e20fd9c6` (no DB call).
- [x] `pnpm --filter @intelliflow/db build` (prisma generate + tsc); grep `packages/db/generated/prisma/models/CaseType.ts` exists. *Re-verified 2026-10-13:* `matop/gates/validation-matrix-05-db.log` exit 0; `packages/db/generated/prisma/models/CaseType.ts` exists.
- [ ] Apply to the **local test DB only**: `node tools/scripts/guard-db-target.mjs` check, then `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-204 --exclusive intelliflow-db -- pnpm --filter @intelliflow/db exec prisma migrate deploy` with `DATABASE_URL` from `.env.test` (localhost:5433). If the test DB is not migration-managed (db-push), skip deploy; `tests/integration/case-types.test.ts` `ensureMigrationSql` replays the SQL. **Never** `db push --accept-data-loss` / `migrate reset` / `migrate dev`. **Unticked at the 2026-10-13 re-verify:** not done as written. `prisma migrate deploy` ran only on a throwaway scratch DB on :5433 (`matop/gates/class-a-migrate-deploy-proof.log`, exit 0, DB dropped afterwards). The shared test DB has the objects from the test replay (`ensureMigrationSql`) but no `_prisma_migrations` row, and no log records a `guard-db-target.mjs` run. It needs `migrate resolve --applied` before a deploy there (findings doc). Not done here: the DB is shared with the other lanes.
- [x] Run `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-204 --exclusive intelliflow-db -- pnpm exec vitest run --project integration tests/integration/case-types.test.ts` → green. *Re-verified 2026-10-13:* `matop/gates/validation-matrix-07-integration-db.log` (post-reboot re-run, `--exclusive intelliflow-db`).
**Validation:** `pnpm --filter @intelliflow/db typecheck`; the integration test above.

#### Step 10: Validators
**Type:** implementation
**Files to Create:**
- `packages/validators/src/case-types.ts`
**Files to Modify:**
- `packages/validators/src/case-settings.ts` (line 86: `z.enum(CASE_REQUIRED_FIELD_KEYS)`; the type alias stays)
- `packages/validators/src/case.ts` (line 22: `casePrioritySchema.optional()`; add `caseTypeId: idSchema.optional()`)
- `packages/validators/src/index.ts`

DTOs `CaseTypeDto`, `CaseTypeOptionDto`, `CaseTypeChecklistItemDto` are plain exported interfaces (no Prisma import).
**Validation:** `pnpm --dir packages/validators exec vitest run src/__tests__/case-types.test.ts src/__tests__/case.test.ts src/__tests__/case-settings.test.ts __tests__/enum-consistency.spec.ts`; `pnpm --filter @intelliflow/validators build`; `pnpm --filter @intelliflow/api typecheck` (the agent `create_case` / `CreateCaseInput` consumers still compile).

#### Step 11: Case-types router + registration
**Type:** implementation
**Files to Create:**
- `apps/api/src/modules/legal/case-types.router.ts`
**Files to Modify:**
- `apps/api/src/router.ts` (import beside line 35, `caseTypes: caseTypesRouter, // PG-204` beside line 150)

`moduleTenantProcedure('LEGAL')`; `assertCaseTypeAdmin(ctx)` checks `ctx.user?.role` against `CASE_TYPE_ADMIN_ROLES`; `rethrowCaseTypeWriteError(err, name)` branches on `meta.target`/constraint (D19); explicit `data` objects; outputs typed as validators DTOs.
**Validation:** `pnpm --dir apps/api exec vitest run src/modules/legal/__tests__/case-types.router.test.ts src/modules/legal/__tests__/legal-module-entitlement.test.ts src/__tests__/app-router.smoke.test.ts`.

#### Step 12: Case creation wiring (replaces the legacy direct write)
**Type:** implementation
**Files to Create:**
- `apps/api/src/lib/case-sla-deadline.ts`
**Files to Modify:**
- `apps/api/src/modules/legal/cases.router.ts` (`create` at 343-395; `getById` at 195-260)

`create` follows spec API steps 1–6; the legacy `(ctx.user as {id?}).id` in `create` is replaced by `ctx.tenant.userId`. Only the create path changes; lines 468 and 518 go to a gh issue. `getById` adds a tenant-scoped `caseType.findFirst` and returns `caseType`.
- [x] Run the legacy `cases.router.test.ts`. If (and only if) it crashes on the new `create` reads, add `beforeEach` stubs (`caseSettings.findUnique → null`, `caseRequiredField.findMany → []`) and list the file as modified. *Re-verified 2026-10-13:* `matop/gates/validation-matrix-06-api-full.log` exit 0; `cases.router.test.ts` unmodified (no stubs needed).
**Validation:** `pnpm --dir apps/api exec vitest run src/modules/legal/__tests__/cases.router.case-types.test.ts src/lib/__tests__/case-sla-deadline.test.ts src/modules/legal/__tests__/cases.router.test.ts`.

#### Step 13: Case Types page
**Type:** implementation
**Files to Create:**
- `apps/web/src/app/cases/(list)/case-types/CaseTypesContent.tsx` (COMPOSES `PageHeader`, shared `SectionHeader`, `@intelliflow/ui` Card/Button/RadioGroup/Label/toast, `EmptyState`)
- `apps/web/src/app/cases/(list)/case-types/CaseTypesLoading.tsx` (REUSES `Skeleton`)
- `apps/web/src/app/cases/(list)/case-types/components/CaseTypeList.tsx` (NEW (verified): no shared list with a forwardRef create handle; pattern from PG-197 `TerritoryList`)
- `apps/web/src/app/cases/(list)/case-types/components/CaseTypeDialog.tsx` (COMPOSES `@intelliflow/ui` Dialog/Input/Switch/Checkbox/RadioGroup + shared `PrioritySelect`)
- `apps/web/src/app/cases/(list)/case-types/components/ResolutionChecklistEditor.tsx` (NEW (verified): no shared ordered-list editor; PG-197 `TerritoryRulesEditor` pattern with the a11y fixes)
- `apps/web/src/app/cases/(list)/case-types/components/DeleteCaseTypeDialog.tsx` (COMPOSES `@intelliflow/ui` `AlertDialog`)
- `apps/web/src/components/cases/case-type-colors.ts`
- `apps/web/src/components/cases/case-type-labels.ts`
**Files to Modify:**
- `apps/web/src/app/cases/(list)/case-types/page.tsx` (replace the stub with a server Suspense shell)

Load `/frontend-design` before writing UI. The design follows `case-settings` / PG-197 tokens; Material Symbols only.
**Validation:** `pnpm --dir apps/web exec vitest run "src/app/cases/(list)/case-types"`.

#### Step 14: New Case + detail wiring (retires the fake Category select)
**Type:** implementation
**Files to Modify:**
- `apps/web/src/components/cases/CaseForm.tsx` (remove `CATEGORY_OPTIONS` + `category` field/submit; add type select, "Use default", hint, required markers, `caseTypeId`)
- `apps/web/src/app/cases/(list)/new/page.tsx` (`trpc`/`api` `caseTypes.listActive` + `caseSettings.requiredFields.list`; forward `caseTypeId` and an optional priority)
- `apps/web/src/components/cases/CaseDetail.tsx` (badge beside the priority badge ~line 255)
- `apps/web/src/components/cases/types.ts` (`caseType?: {id; name; colorToken} | null`)

- [x] Design check: compare the rendered `/cases/new` form (component test DOM order + the dev server if available) against `docs/design/mockups/case-new.png` / `case-new.html`. The type select takes the Category slot. Record the comparison in the findings doc. *Re-verified 2026-10-13:* done late, at the re-verify: mockup image compared with the CaseForm JSX order, no dev-server render (`matop/design-check-case-new.md`).

Grep proves the retirement: `grep -n "CATEGORY_OPTIONS\|FEATURE_REQUEST" apps/web/src/components/cases/CaseForm.tsx` → no match.
**Validation:** `pnpm --dir apps/web exec vitest run src/components/cases "src/app/cases/(list)/new"`; `pnpm --filter @intelliflow/web typecheck` (no TS2589, no casts added: `git diff -U0 | grep -n " as any\|@ts-expect-error"` → none in PG-204 files).

### Phase 3 — REFACTOR: docs and tracking

#### Step 15: Refactor pass
**Type:** refactor
**Files to Modify:**
- PG-204 source files only

- [x] No duplicated label maps (all in `case-type-labels.ts`); no inline colour maps outside `case-type-colors.ts`; cognitive complexity within the sonar guard (`pnpm run lint:sonar:guard`). *Re-verified 2026-10-13:* sonar guard exit 0 (`matop/gates/sonar-guard-branch-diff.log`); all case-type labels/colours are in case-type-labels.ts / case-type-colors.ts. CaseForm.tsx keeps its own `PRIORITY_LABELS` ("Urgent / Critical"), which was already on main (origin/main CaseForm.tsx:64) and is out of scope (L1).
- [x] `pnpm --filter @intelliflow/domain lint && pnpm --filter @intelliflow/validators lint && pnpm --filter @intelliflow/api lint && pnpm --filter @intelliflow/web lint` (one at a time). *Re-verified 2026-10-13:* `matop/gates/validation-matrix-10-lint.log` exit 0.

#### Step 16: Docs, registries, ADR/PRD
**Type:** docs
**Files to Modify:**
- `docs/design/page-registry.md` (`/cases/case-types` entry: Task PG-204, File Path `(list)`, API Router `case-types.router.ts`)
- `docs/design/sitemap.md` (line 189 description; API Routers count +1)
- `docs/design/PAGE_MAP_AND_FLOWS.md` (line 294 description)
- `docs/design/navigation-reachability-audit.md` (line 247 note "Cases sidebar (PG-204)")
- `docs/design/ui-flow-mapping.md` (header Routers 67→68, procedures +6; a `caseTypes` row after `accountTerritories` at line 746)
- `docs/design/information-architecture.md` (API Routers 67→68)
- `docs/architecture/diagrams/complete-dependency-chains.md` ("Case Types (PG-204)" block after the Case Settings section at ~2404)
- `docs/architecture/adr/ADR-076-case-types-applied-at-case-creation.md` (Status → Accepted after Step 18 is green; index row in `docs/architecture/adr/README.md`)
- `docs/planning/prd-module-settings.md` (PG-204 Delivery Status table)
- `artifacts/reports/content-audit-results.json` (run `npx tsx tools/scripts/content-audit.ts`, then keep **only** the `/cases/case-types` and `/cases/new` entry changes; revert other generated hunks by re-applying the HEAD text with a script, since other lanes edit this file)
- `docs/architecture/adr/README.md` (ADR-076 status Proposed → Accepted)

Run, not modify: `apps/web/src/app/__tests__/sitemap-reconciliation.test.ts` (page count unchanged).

**Validation:** `pnpm --dir apps/web exec vitest run src/app/__tests__/sitemap-reconciliation.test.ts src/__tests__/content-audit-schema.test.ts`; `npx --no-install prettier --check` on the docs.

#### Step 17: Red-flag tracking (all three surfaces)
**Type:** tracking
**Files to Create:**
- `.specify/sprints/sprint-18/findings/PG-204-findings.md`
**Files to Modify:**
- `artifacts/metrics/debt-ledger.yaml`

gh issues (search for duplicates first with `gh issue list --search`), each with file:line + proposed fix:
1. `cases.router.ts:468,518` `(ctx.user as {id?}).id` is always undefined, so notifications use `'system'`. Fix: `ctx.tenant.userId`.
2. `apps/api/src/modules/legal/__tests__/cases.router.test.ts` exercises `mockPrisma` directly, never the router (false coverage). Fix: caller-based tests.
3. Required-field policy is not enforced on `cases.update` (blanking `description`/`jurisdiction`). Fix: reuse `resolveCaseCreateDefaults`'s required check on update.
4. Agent `create_case` execute/rollback simulated (`apps/api/src/agent/tools/create.ts:257-272`). Only if not already tracked.

### Phase 4 — VALIDATION

#### Step 18: Final validation, reviews, attestation
**Type:** validation
**Files to Modify:**
- `.specify/sprints/sprint-18/attestations/PG-204/attestation.json`
- `.specify/sprints/sprint-18/attestations/PG-204/context_ack.json`
- `.specify/sprints/sprint-18/attestations/PG-204/task-tracking.json`
- `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`

Run the Validation Matrix in order (one process at a time). Then:
- [x] `node scripts/codex-review.mjs`, iterated until clean (waivers only with evidence in `tools/audit/codex-review-waivers.yaml`). *Re-verified 2026-10-13:* iterated after the remediation: codex FAIL at a31603d21 (tz mismatch), fallback FAIL at 13cf1f0db (Apia), FAIL at 07b2f9044 (checklist order), FAIL on the staged tree (display tz, offset seconds), PASS at 653e23641 (`matop/gates/codex-review-653e23641.log`).
- [x] `/code-review` on the diff; `/sonarqube-fix` for any new finding; `/stoa-domain` validation. **Correction (2026-10-13 runner audit):** this was ticked when only `code-review-analysis.ps1 -Quick` had run. Now run for real: `/code-review` Full (run 20261013-090440-0e4d60d4 at d7d91e5e8, typecheck/lint 0 issues, architecture 40/40; complexity and circular steps produced no evidence, gh #888) -> `matop/code-review-summary.json`; `/sonarqube-fix`: 0 new findings on changed lines (SonarCloud main issues on the 49 changed files: 4 pre-existing MINOR on unchanged lines) -> `matop/sonarcloud-main-issues-on-changed-files.json`; STOA Domain by the stoa-domain sub-agent -> `matop/stoa-verdicts/Domain.json` (PASS). *Re-verified 2026-10-13:* `matop/code-review-summary.json` (run 20261013-090440-0e4d60d4); `matop/sonarcloud-main-issues-on-changed-files.json`; `matop/stoa-verdicts/Domain.json` PASS.
- [x] a11y-expert review agent on the built UI files (WCAG 2.1 AA); fix findings. *Re-verified 2026-10-13:* `matop/a11y-contrast-review.json` (FAIL) -> `d7d91e5e8` -> `matop/a11y-contrast-review-recheck.json` (PASS WITH MINOR).
- [x] Lighthouse: attempt `LHCI_URLS=… LHCI_OUTPUT_DIR=artifacts/benchmarks/pg-204-lighthouse npx lhci autorun --config=lighthouserc.authenticated.js` only if `LHCI_TEST_EMAIL`/`LHCI_TEST_PASSWORD` exist for a non-production auth target; otherwise gate = **NEEDS_HUMAN** with the reason (PG-197 precedent). *Re-verified 2026-10-13:* `artifacts/lighthouse/PG-204/waiver-evidence.md:3,13-22` (no LHCI credentials, so NEEDS_HUMAN; output dir is artifacts/lighthouse, not artifacts/benchmarks).
- [x] Attestation: every gate PASS or NEEDS_HUMAN with reason; artifact hashes incl. the migration; KPIs; `node tools/scripts/exec-preflight/check-attestation-phrases.mjs PG-204` and `check-attestation-provenance.mjs PG-204`. *Re-verified 2026-10-13:* `matop/gates/check-attestation-phrases.log` and `check-attestation-provenance.log` exit 0.
- [x] CSV → `Completed` only via /exec Phase 5 after all gates pass. Honoured: verdict NEEDS_HUMAN (Lighthouse credentials, runner-owned push), so the row stays `In Progress` (90%). *Re-verified 2026-10-13:* `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv:584` PG-204 = In Progress, 90.

## Validation Matrix

| Scope | Purpose | Command |
|---|---|---|
| Domain new | resolver ≥ 95% | `pnpm --dir packages/domain exec vitest run src/legal/cases/__tests__/case-type-defaults.test.ts` |
| Domain full | regression | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-204 -- pnpm --filter @intelliflow/domain test` |
| Validators full | regression incl. enum-consistency | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-204 -- pnpm --filter @intelliflow/validators test` |
| Adapters full | `save` round-trip | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-204 -- pnpm --filter @intelliflow/adapters test` |
| DB | client + types | `pnpm --filter @intelliflow/db build && pnpm --filter @intelliflow/db typecheck` |
| API full | router + create wiring + legacy legal suites + agent tools | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-204 -- pnpm --filter @intelliflow/api test` (L5 flake: re-run once) |
| Integration (DB) | constraints, composite FKs, RLS | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-204 --exclusive intelliflow-db -- pnpm exec vitest run --project integration tests/integration/case-types.test.ts` |
| Web full | page, form, detail, registries | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-204 -- pnpm --filter @intelliflow/web exec vitest run` |
| Typecheck | all touched packages | `pnpm --filter @intelliflow/domain typecheck && pnpm --filter @intelliflow/validators typecheck && pnpm --filter @intelliflow/adapters typecheck && pnpm --filter @intelliflow/api typecheck && pnpm --filter @intelliflow/web typecheck` |
| Lint | touched packages + sonar guard | `pnpm --filter @intelliflow/domain lint && pnpm --filter @intelliflow/validators lint && pnpm --filter @intelliflow/api lint && pnpm --filter @intelliflow/web lint && pnpm run lint:sonar:guard` |
| Build | touched packages + web | `pnpm --filter @intelliflow/domain build && pnpm --filter @intelliflow/validators build && pnpm --filter @intelliflow/db build && node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-204 -- pnpm --filter @intelliflow/api build && node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-204 -- pnpm --filter @intelliflow/web build` |
| Diff coverage | Sonar new_coverage ≥ 80% | coverage runs of the new/changed files (`--coverage.enabled --coverage.include=<file>`) per package; no `istanbul ignore` |
| Semantic review | codex gate | `node scripts/codex-review.mjs` |
| Preflights | exec gates | the four `tools/scripts/exec-preflight/*.mjs PG-204` checks |

## Integration Checkpoints Summary

| After Step | Verification | Command |
|---|---|---|
| 8 | domain green + built | Step 8 commands |
| 9 | migration applies; integration green | Step 9 integration command |
| 10 | validators green; api still compiles | `pnpm --filter @intelliflow/api typecheck` |
| 12 | api legal suites green | Step 12 command |
| 14 | web case suites green; web typecheck | Step 14 commands |
| 16 | registry tests green | Step 16 command |
| 18 | full matrix green; codex clean | Validation Matrix |

## Acceptance Criteria Traceability

| AC / NF | Steps |
|---|---|
| AC-CT1 | 7, 13, 16 |
| AC-CT2 | 2, 6, 9, 10, 13 |
| AC-CT3 | 7, 13 |
| AC-CT4 | 3, 11 |
| AC-CT5 | 3, 6, 11 |
| AC-CT6 | 3, 6, 9, 11 |
| AC-CT7 | 3, 4, 6, 11 |
| AC-CT8 | 7, 14 |
| AC-CT9 | 1, 4, 8, 12 |
| AC-CT10 | 1, 4, 8, 12 |
| AC-CT11 | 1, 4, 12 |
| AC-CT12 | 4, 12 |
| AC-CT13 | 2, 4, 7, 12, 14 |
| AC-CT14 | 1, 4, 12 |
| AC-CT15 | 18 |
| AC-CT16 | 7, 13, 14, 18 |
| NF-1 | 6, 9, 18 |
| NF-2 | 13, 14, 18 (import audit) |
| NF-3 | 8, 18 |

## Boolean toggles (playbook §8)

| Toggle | Category | Consumer |
|---|---|---|
| `CaseType.isActive` | 1, wired | `caseTypes.listActive`; `cases.create` rejects inactive (Steps 11, 12) |
| `CaseType.isDefault` | 1, wired | `CaseForm` preselection (Step 14) |

No AI toggles; no `CaseAutomationSetting` change.

## Plan-Reviewer Sign-off

<!-- plan-reviewer: subagent -->
reviewer_subagent: plan-reviewer (.claude/agents/plan-reviewer.md), agent id a66765eb167925037

| Iteration | Verdict | Findings |
|---|---|---|
| 1 | REVISE | The reviewer's verdict line (2026-10-13T00:16:11Z): **REVISE (6 ERRORS, 5 WARNINGS, 3 INFO)**. The lead's original summary here said 4 ERROR / 4 WARN / 1 INFO, which undercounted (corrected 2026-10-13 after the runner audit). Errors included the Files Summary/effort counts (categories A and K), a phantom `setup.ts` entry and an invalid `EmptyState entity="folder"`; warnings included no mockup step (L), CSV artifacts (J), Lighthouse spec drift, sign-off pending and a route-folder label import. |
| 2 | **APPROVE** | Re-review of the same agent via SendMessage (sent 00:17:52Z): all 6 items on its fix list verified; two stale spec lines (299, 402) fixed afterwards |

| Category | Check | Result | Evidence |
|---|---|---|---|
| Y | UI Reachability | PASS | existing sidebar entry `apps/web/src/components/sidebar/configs/cases.ts:14` + `CaseSettingsPanel.tsx:17-21`; stub replaced in place |
| CC | Page-doc co-change | PASS | no new `page.tsx`; `PAGE_MAP_AND_FLOWS.md`, `sitemap.md`, `navigation-reachability-audit.md` in Step 16 |

INFO (CSV): the new files are added to `Artifacts To Track` at close (Step 18).
