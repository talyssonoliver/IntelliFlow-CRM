# Specification: PG-204 — Module Settings: Case Types

**Status:** APPROVED. Consensus round re-run on this final, amended spec: **8/8 APPROVED in 1 round** (2026-10-13, all verdicts returned by 06:20:57Z; see Agent Sign-offs). · **Sprint:** 18 · **Branch:** `feat/pg-204-case-types` (renamed `agent/PG-204-case-types`)
· **Base:** origin/main `47f1b5d84` · **Persona:** frontend-lead · **STOA:** domain

## Overview

Tenants define **case types**: a taxonomy (name, category, colour) carrying defaults that are applied **when a case
is created**: default priority, default SLA in days (sets the deadline), required fields, and a resolution
checklist that is seeded as the case's tasks. Admins manage types at `/cases/case-types`; the New Case form gets a
type picker. With no type picked, case creation applies the PG-190 module defaults (`CaseSettings.defaultPriority`
and tenant `CaseRequiredField` rows), which are dead config today.

### Owner ruling (binding, 2026-10-13)

`.specify/sprints/sprint-18/context/PG-204/PG-204-owner-ruling.md`:
- **Q1 = A**: case types are applied at case creation: new `CaseType` table, optional `Case.caseTypeId`, type
  picker on New Case, server fills blank priority/deadline from the type, enforces the type's required fields,
  seeds the resolution checklist as `CaseTask`s. Additive Prisma migration.
- **Q2 = Yes**: with no type, case creation applies PG-190 `defaultPriority` and required fields. Precedence: type
  first, then module defaults.

### Path reconciliation (row vs main)

| Row says | Real path on main / decision |
|---|---|
| `apps/web/src/app/cases/case-types/page.tsx` | `apps/web/src/app/cases/(list)/case-types/page.tsx`: existing 20-line "coming soon" stub, served at `/cases/case-types` by the `(list)` route group. **Replaced in place; no second route.** |
| `apps/web/src/app/cases/case-types/CaseTypesContent.tsx` | `apps/web/src/app/cases/(list)/case-types/CaseTypesContent.tsx` |
| `apps/api/src/modules/case/case-types.router.ts` | `apps/api/src/modules/legal/case-types.router.ts`. No `modules/case` directory exists; every case router lives in `modules/legal` behind `moduleTenantProcedure('LEGAL')`. |
| `apps/web/src/app/cases/case-settings/page.tsx` (pre-req) | `apps/web/src/app/cases/(list)/case-settings/page.tsx` |

The CSV `Artifacts To Track` and `Pre-requisites` paths are corrected to the real paths (Category A rebaseline: a
path correction, no outcome change).

## Related Documents

| Type | Path | Status | Action |
|---|---|---|---|
| PRD | `docs/planning/prd-module-settings.md` | Updated | `PG-204 Addendum: Case Types` (US-CT*, AC-CT*); PG-204 added to Related Tasks |
| Playbook | `docs/planning/module-settings-playbook.md` | Canonical | Followed (§1–§14); deviations recorded under Decisions |
| ADR | `docs/architecture/adr/ADR-076-case-types-applied-at-case-creation.md` | Proposed → Accepted at exec | Created. ADR-075 is claimed by the `ifc-adr-317-318` lane (production secrets), so this takes 076. |
| Reference | PG-197 (#831, `39a94487e`) territory mapping; PG-196 (#825); PG-190 case settings | Merged | Shape copied |
| Owner ruling | `.specify/sprints/sprint-18/context/PG-204/PG-204-owner-ruling.md` | Binding | — |

## Dependencies Verified (Phase 0.95)

| Dep | Claim | Verified | Method |
|---|---|---|---|
| PG-190 | `caseSettings` router registered | TRUE | `apps/api/src/router.ts:150` |
| PG-190 | `CaseSettings`, `CaseRequiredField`, `CaseTag`, `CaseAutomationSetting` models | TRUE | `schema.prisma:2163-2240` |
| PG-190 | defaultPriority / required fields **applied** to cases | Not claimed by PG-190's DoD; not true (read only by `case-settings.router.ts` and `CaseSettingsContent.tsx`). Not a false attestation; wired here per ruling Q2. |
| PG-178 | Module settings pages + sidebar | TRUE | `apps/web/src/components/sidebar/configs/cases.ts:14` (`case-types` → `/cases/case-types`) |

## Decisions (Rounds 1–4)

- **D1 Storage.** `CaseType` table plus a `CaseTypeChecklistItem` child table (ordered, per-item validation and
  DB guarantees). `requiredFields` is `TEXT[]` with a subset CHECK and `cardinality <= 6`.
- **D2 Colour.** The 8 `CASE_TAG_COLOR_TOKENS` (`packages/validators/src/case-settings.ts:104`), the same allowlist
  as PG-190 case tags (precedent `20260420120000_case_tag_color_token_check`). The playbook's "18-colour" wording
  refers to the contact/account palette.
- **D3 Tenant-consistent FK + delete.** `cases ("tenantId","caseTypeId") → case_types ("tenantId","id")` composite
  FK, `MATCH SIMPLE` (a NULL `caseTypeId` is unchecked), `ON DELETE NO ACTION` (checked at end of statement, so a
  tenant cascade that deletes both cases and types still succeeds). Prisma cannot express an optional relation
  over a required `tenantId`, so `Case.caseTypeId` is a **plain scalar** in Prisma and the FK is a documented
  **SQL-only object** (PG-197 pattern, schema comment block "do not drop in a diff"). A type referenced by cases
  cannot be deleted: `delete` runs in one `$transaction`: `case.count {tenantId, caseTypeId}` > 0 → `CONFLICT`
  ("N cases use this type. Deactivate it instead."); otherwise `deleteMany {id, tenantId, isDefault: false}`.
  The default type is refused before the transaction (`PRECONDITION_FAILED`). A guarded delete that removes 0 rows
  (the type became the default or vanished in between) returns `PRECONDITION_FAILED` "changed while you were
  deleting" with no re-read (rev. 2026-10-13, exploration E5: one "reload" message for every race). A racing
  insert surfaces as P2003 → `CONFLICT`. Classification is never silently erased; deactivation always works.
- **D4 Default type = picker preselect only.** The server never infers a type: an omitted `caseTypeId` means "no
  type", which means the PG-190 defaults (the literal reading of ruling Q2). API callers that omit `caseTypeId`
  never get the default type. The default must be active.
- **D5 RBAC.** Reads (`list`, `listActive`) are open to every LEGAL-entitled tenant user (the New Case page needs
  `listActive`). Mutations require `CASE_TYPE_ADMIN_ROLES`, which **re-exports** the existing
  `ACCOUNT_OWNER_ADMIN_ROLES` (`packages/domain/src/crm/account/territory/territory-constants.ts:273`), with no
  duplicate list. The role is DB-sourced (`apps/api/src/context.ts:326-341`). `UserRole` has only
  USER/ADMIN/MANAGER/SALES_REP (`schema.prisma:580`), so OWNER/SUPER_ADMIN are forward-compat strings, not a
  privilege path. All procedures use `moduleTenantProcedure('LEGAL')`, which fails closed.
- **D6 Priority precedence.** Explicit input > `type.defaultPriority` (nullable; null means defer) >
  `CaseSettings.defaultPriority` (a String, parsed against `CASE_PRIORITIES`; invalid or missing falls through) >
  `MEDIUM`. `createCaseSchema.priority` loses `.default('MEDIUM')` (`packages/validators/src/case.ts:22`), so a
  blank priority is detectable.
- **D7 Deadline.** Explicit input > type SLA > none (PG-190 has no deadline default). SLA: `tz =
  safeTimezone(input.timezone)` (no timezone means UTC, `schema.prisma:2132`); `D` = local calendar date of now in tz;
  deadline = **1 ms before local day D+N+1 starts**, i.e. the last instant of local day D+N
  (`apps/api/src/lib/case-sla-deadline.ts`). The start of a local day is found with exact per-instant offsets; when a DST
  change sits at that midnight, the earliest candidate already on the target day is used. This is correct for repeated
  last hours (America/Santiago) and skipped midnights (Asia/Beirut), with regression tests (revised after codex
  review, 2026-10-13; it supersedes the earlier +12h reference rule and its 00:00-DST limitation). SLA days are
  calendar days, 1..3650. The case stores the timezone it was computed in.
- **D8 Required fields: "type first, then module defaults"** (ruling Q2, literal fallback, the same shape as
  priority): if a type is picked **and** its `requiredFields` is non-empty, the type's set applies; otherwise the
  tenant's `CaseRequiredField` rows with `isRequired = true` apply; when the tenant has no rows, the router passes
  `DEFAULT_CASE_REQUIRED_FIELDS` (domain holds no defaults). Checked on **effective** values (after defaults; the
  assignee defaults to the caller). A string field counts as present only when its trimmed value is non-empty.
  Violations return `BAD_REQUEST` naming every missing field. The dialog states it: no boxes ticked = "uses the
  module's required fields"; ticked = "replaces them for this type". The union reading (type adds to the tenant
  floor) was considered and rejected as not what the ruling says; recorded in ADR-076. Enforcement on
  `cases.update` is out of scope (ruling: "at case creation"); follow-up issue filed.
- **D9 Checklist seeding.** One `CaseTask` per item, in checklist order, `status PENDING`, `dueDate null` (the
  deadline is a milestone; per-task dates would show false overdue items), `assignee = case assignee`, created in
  the **same `$transaction`** as `case.create`. A failure rolls back the case. Later checklist edits affect only
  future cases. Revision (codex C1, 2026-10-13): seeded tasks also get `case_tasks.position`
  0..n-1 (nullable column added inside the same unapplied migration), and every `cases.router` read that returns
  tasks (`list`, `getById`, `create`, `update`) uses `CASE_TASK_ORDER` (`apps/api/src/lib/case-task-order.ts`):
  position nulls last, then dueDate, so the checklist order survives null due dates and hand-added tasks keep their
  due-date order. `PrismaCaseRepository` (adapters) keeps its own `dueDate` order: adapters cannot import an
  `apps/api` constant, and no UI path reads tasks through it (rev. 2026-10-13, exploration E10).
- **D10 Create-only + tenant preflight.** `caseTypeId` is set at creation and never changed: `updateCaseSchema` stays
  an independent `z.object` (not derived from `createCaseSchema`) that strips `caseTypeId`, with a regression
  test. Before any write, `cases.create` checks, in parallel and tenant-scoped: the type (`{id, tenantId,
  isActive: true}`), the client (`account.findFirst {id: clientId, tenantId}`) and an explicit assignee
  (`user.findFirst` with `tenantUserWhere`). Every miss returns the same `NOT_FOUND` "… not found" (no existence
  oracle between inactive, foreign and missing). `cases.getById` returns `caseType {id, name, colorToken} | null`
  (second tenant-scoped query, since there is no Prisma relation); `CaseDetail` shows a read-only badge.
- **D11 Default assignee bug fixed in scope.** On main, `cases.create` read `(ctx.user as {id?}).id`, but `UserSession` has `userId`, not `id` (`apps/api/src/context.ts:38`). So an omitted
  `assignedTo` ("Assign to me", which `CaseForm` sends as omission) fails with "Assignee is required" in
  production. The create path uses `ctx.tenant.userId` (`apps/api/src/trpc.ts:413`; `cases.router.ts:439`). The
  same pattern remains at `cases.router.ts:599,649` (`changeStatus` / `close` notification sender falling back to
  `'system'`), outside the create path: gh issue + debt-ledger. Side effect recorded (exploration E21): "Assign to
  me" now notifies the caller about their own case (`cases.router.ts:506`).
- **D12 Fake taxonomy consolidated.** `CaseForm.tsx:55` `CATEGORY_OPTIONS` (TECHNICAL/BILLING/FEATURE_REQUEST/…) is
  a ticket-style list that is **never persisted** (`createCaseSchema` has no `category`; zod strips it). Per the
  fake-data rule it is replaced in this task by the real **Case type** select in create mode; edit mode shows no
  type control (the type is shown on the detail page).
- **D13 Blank priority in the form.** In create mode `CaseFormData.priority` is `CasePriority | ''` with a first
  option "Use default". The empty value is omitted from the payload. A hint (`role="status"`) shows what the server
  will apply ("Type default: High priority · due in 14 days"); the form never writes type defaults into its own
  state. Edit mode is unchanged.
- **D14 Limits** (domain `CASE_TYPE_LIMITS`, validators derive from it): 50 types per tenant (active + inactive;
  soft cap, a concurrent create can overshoot by one); name 1..100 trimmed, tenant-unique case-insensitive;
  category optional free text ≤ 60 (no vocabulary exists in code, and practice areas are tenant-specific);
  checklist ≤ 20 items, title 1..200, no case-insensitive duplicates; SLA days integer 1..3650 or null;
  `requiredFields` ≤ 6 distinct keys.
- **D15 Pure resolver in domain.** `packages/domain/src/legal/cases/case-type-defaults.ts` exports
  `CASE_REQUIRED_FIELD_KEYS` + `CaseRequiredFieldKey` (moved to domain; `caseRequiredFieldKeySchema` in
  validators becomes `z.enum(CASE_REQUIRED_FIELD_KEYS)`, which removes the validators→domain cycle risk),
  `CASE_TYPE_LIMITS`, `CASE_TYPE_ADMIN_ROLES`, and `resolveCaseCreateDefaults(...)`. Zero infra deps, ≥ 95%
  coverage. The router does I/O and the D7 date maths only.
- **D16 Boolean toggles (playbook §8).** `isActive` is **category 1, wired** (the picker lists active only; create
  rejects inactive). `isDefault` is **category 1, wired** (preselected in the New Case picker). No AI columns, so
  "AI defaults FALSE" is N/A. No `CaseAutomationSetting` changes.
- **D17 No reset / no reorder.** Not in the DoD or the ruling; a delete-all conflicts with D3. Order: default first,
  then name ascending (case-insensitive).
- **D18 Explicit contracts (#772).** Router outputs are explicit exported DTO types (`CaseTypeDto`,
  `CaseTypeOptionDto` in `packages/validators/src/case-types.ts`); `getById` declares `caseType`. No casts, no
  `@ts-expect-error`; the web typecheck must be free of TS2589.
- **D19 P2002 mapping.** Each procedure can violate exactly one unique index, so the mapping is per procedure
  rather than per `meta.target` (rev. 2026-10-13, exploration E6): `create` / `update` never write `isDefault`, so
  their only P2002 is the name index → `CONFLICT` "A case type named "X" already exists."; `setDefault` never
  writes `name`, so its only P2002 is the one-default index → `CONFLICT` "The default type changed at the same
  time. Reload and try again." The Prisma message is never returned. Tenant free text (names, checklist
  titles) is never logged at error level.

## Technical Approach

### Data: additive migration, Class A

`packages/db/prisma/migrations/20261013120000_case_types/migration.sql` (after `20261007130000_account_territories`):

```prisma
model CaseType {
  id              String        @id @default(cuid())
  tenantId        String
  tenant          Tenant        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  name            String        @db.VarChar(100)
  category        String?       @db.VarChar(60)
  colorToken      String        @default("slate")
  defaultPriority CasePriority?
  defaultSlaDays  Int?
  requiredFields  String[]      @default([])
  isActive        Boolean       @default(true)
  isDefault       Boolean       @default(false)
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  checklist       CaseTypeChecklistItem[]
  @@unique([tenantId, id])          // DBA-012 composite target
  @@index([tenantId, isActive])
  @@map("case_types")
}
model CaseTypeChecklistItem {
  id         String   @id @default(cuid())
  tenantId   String
  caseTypeId String
  caseType   CaseType @relation(fields: [tenantId, caseTypeId], references: [tenantId, id], onDelete: Cascade)
  title      String   @db.VarChar(200)
  sortOrder  Int      @default(0)
  createdAt  DateTime @default(now())
  @@index([tenantId, caseTypeId])
  @@map("case_type_checklist_items")
}
// Case: caseTypeId String?   (scalar; composite FK is SQL-only, see D3). No new index on cases (see below).
// Tenant: caseTypes CaseType[] @ignore   (schema.prisma:34 convention, like caseTags/accountTerritories)
```

SQL-only objects (schema comment block, asserted by `tests/integration/case-types.test.ts`):
- `cases_tenantId_caseTypeId_fkey` composite FK, MATCH SIMPLE, ON DELETE NO ACTION.
- CHECKs: `colorToken IN (8)`, `defaultSlaDays IS NULL OR BETWEEN 1 AND 3650`, `btrim(name) <> ''`,
  `requiredFields <@ ARRAY[6 keys]::text[]` and `cardinality(requiredFields) <= 6`; checklist `btrim(title) <> ''`,
  `sortOrder >= 0`.
- `case_types_tenant_lower_name_key UNIQUE (tenantId, lower(name))`; `case_types_one_default_key UNIQUE (tenantId)
  WHERE "isDefault"`.
- RLS `ENABLE` + `_tenant_isolation` policies (`USING` + `WITH CHECK` on `app.current_tenant_id`) on both new
  tables, using the PG-197 `DO $$ … duplicate_object` pattern.
- Header: Class A (additive: two new tables, two nullable columns `cases.caseTypeId` and `case_tasks.position`).
  The cases FK is added `NOT VALID` and then validated (every existing row is NULL, so the scan is short).
  **No new index on `cases`** (rev. 2026-10-13, exploration E1): a plain `CREATE INDEX` on the populated table takes
  a SHARE lock, which the Class A gate does not allow; the type lookups are served by `cases_tenantId_idx`.
  Recovery is forward-only: stop picking types in New Case; a down-migration would drop tenant data and is
  therefore Class C, human-only (exploration E3).
- `requiredFields TEXT[]` has no `NOT NULL` (Prisma's normal output for `String[]`; adding it would show as drift).
  Prisma never writes NULL; a raw-SQL NULL is a known limitation (exploration E12).
- `packages/db/src/index.ts` type allowlist: `CaseType`, `CaseTypeChecklistItem` (playbook §10).

### Domain: `packages/domain/src/legal/cases/case-type-defaults.ts` (new)

```ts
export const CASE_REQUIRED_FIELD_KEYS = ['title','description','deadline','jurisdiction','clientId','assignedTo'] as const;
export type CaseRequiredFieldKey = (typeof CASE_REQUIRED_FIELD_KEYS)[number];
export const CASE_TYPE_LIMITS = { maxTypesPerTenant: 50, maxNameLength: 100, maxCategoryLength: 60,
  maxChecklistItems: 20, maxChecklistTitleLength: 200, minSlaDays: 1, maxSlaDays: 3650 } as const;
export const CASE_TYPE_ADMIN_ROLES = ACCOUNT_OWNER_ADMIN_ROLES; // same set, one source
export function resolveCaseCreateDefaults(args: {
  input: { priority?: CasePriority; hasDeadline: boolean; title: string; description?: string | null;
           jurisdiction?: string | null; clientId: string; assignedTo: string };
  caseType: { defaultPriority: CasePriority | null; defaultSlaDays: number | null;
              requiredFields: readonly string[]; checklist: readonly { title: string }[] } | null;
  moduleDefaultPriority: string | null;
  tenantRequiredFields: readonly { fieldKey: string; isRequired: boolean }[]; // concrete list (router passes defaults)
}): { priority: CasePriority; prioritySource: 'input' | 'type' | 'module' | 'fallback';
      deadline: { kind: 'input' } | { kind: 'sla'; days: number } | { kind: 'none' };
      requiredSource: 'type' | 'module'; missingRequired: CaseRequiredFieldKey[]; seedTasks: { title: string }[] };
```
Exported from `packages/domain/src/index.ts`; `enum-consistency` test covers the new key const.

### Validators

- `packages/validators/src/case-types.ts` (new): `caseTypeColorTokenSchema` (= `CASE_TAG_COLOR_TOKENS`),
  `caseTypeChecklistItemSchema {title}`, `createCaseTypeSchema {name, category?, colorToken, defaultPriority |
  null, defaultSlaDays int | null, requiredFields: CaseRequiredFieldKey[] ≤ 6, checklist ≤ 20, isActive (default true)}` with
  `.superRefine` rejecting duplicate required keys and duplicate checklist titles case-insensitively ("items N and
  M"); `updateCaseTypeSchema = create + {id}` with `isActive` **required** (no default), so an update that omits
  it cannot silently reactivate a type (rev. 2026-10-13, exploration E11); `deleteCaseTypeSchema`, `setDefaultCaseTypeSchema {id | null}`;
  `findDuplicateCaseTypeName(names, candidate, excludeId?)` plus `caseTypeNameSchema(existing)` (**superRefine for
  duplicate type names**, row DoD), used by the dialog; the server is authoritative through the `lower(name)`
  index. DTO types `CaseTypeDto`, `CaseTypeOptionDto`.
- `packages/validators/src/case-settings.ts`: `caseRequiredFieldKeySchema = z.enum(CASE_REQUIRED_FIELD_KEYS)`.
- `packages/validators/src/case.ts`: `createCaseSchema.priority` optional with no default; `caseTypeId:
  idSchema.optional()`. `updateCaseSchema` unchanged.
- `packages/validators/src/index.ts`: export `case-types`.

### API

- `apps/api/src/modules/legal/case-types.router.ts` (new, `moduleTenantProcedure('LEGAL')`, explicit `tenantId` in
  every `where`, Prisma `data` from explicit field lists, never an input spread):
  - `list` (any user) → `{ types: CaseTypeDto[] (checklist ordered, caseCount via case.groupBy), limits, canEdit }`.
  - `listActive` (any user) → `CaseTypeOptionDto[]`.
  - `create` (admin): count ≥ 50 → `BAD_REQUEST`; `$transaction` (create + `createMany` checklist, no
    `skipDuplicates`); P2002 per D19.
  - `update` (admin): own → else `NOT_FOUND`; default && !isActive → `PRECONDITION_FAILED`; `$transaction` (update
    + delete/recreate checklist); P2002 per D19.
  - `delete` (admin): per D3.
  - `setDefault` (admin): `null` clears; target own (`NOT_FOUND`) and active (`PRECONDITION_FAILED`);
    `$transaction` clear-then-set; P2002 per D19.
- `apps/api/src/router.ts`: `caseTypes: caseTypesRouter` beside `caseSettings` (`:150`).
- `cases.router.ts` `create` (`:434`):
  1. Assignee = `input.assignedTo ?? ctx.tenant.userId` (D11).
  2. Parallel tenant-scoped preflight (D10) + `caseSettings.findUnique` + `caseRequiredField.findMany`.
  3. `resolveCaseCreateDefaults`; `missingRequired` → `BAD_REQUEST` ("Required fields missing: Deadline, Jurisdiction").
  4. Deadline per D7.
  5. `$transaction`: `case.create` (with `caseTypeId`, effective `priority`, `deadline`, `timezone`), then
     `caseTask.createMany` (seeds, `tenantId`, `caseId`, `assignee`), then `case.findFirstOrThrow` with the
     existing include.
  6. Notification unchanged (outside the transaction).
- `getById`: adds `caseType` (D10).

### Web

- `apps/web/src/app/cases/(list)/case-types/page.tsx`: server Suspense shell replacing the stub.
- `CaseTypesContent.tsx`: `PageHeader` (Dashboard / Cases / Case Types, description) + `grid grid-cols-1
  lg:grid-cols-12 gap-4 sm:gap-5`.
  - Card "Case types" (`lg:col-span-8`): shared `SectionHeader` (`apps/web/src/components/shared/section-header.tsx`)
    with `action` `<Button size="sm">New Case Type</Button>` → `listRef.current?.openCreate()`.
  - Card "Default case type" (`lg:col-span-4`): a `RadioGroup` labelled "Default case type" including "No default";
    the result is announced in the live region. While saving, the group stays focusable (not `disabled`, so focus
    is never dropped to `<body>`), sets `aria-busy`, ignores further changes and shows a visible "Saving…" status
    (rev. 2026-10-13, exploration E28).
  - Non-admins: controls visible but `disabled`, plus the visible sentence "Only administrators and managers can
    change case types.", referenced by `aria-describedby`.
  - Error state with Retry.
- `CaseTypesLoading.tsx`: a bento-shaped skeleton (`aria-busy`).
- `components/CaseTypeList.tsx`: `forwardRef<CaseTypeListHandle>` + `useImperativeHandle(ref, () => ({ openCreate }))`
  (row DoD "TagsTab via forwardRef"). Rows show an `aria-hidden` swatch + visible name, then text: category, "High
  priority" / "Module default priority", "Due in 14 days" / "No SLA", "2 required fields", "5 checklist items",
  "Default", "Inactive", "12 cases" / "1 case" / "No cases". Actions "Edit {name}", "Delete {name}". Canonical
  `EmptyState entity="cases" variant="folder" phase="passive" size="sm"` (title "No case types yet") with no
  inner CTA (`folder` is a variant, not an entity: `entity-empty-state-config.ts:5,44`).
- Delete: a confirmation dialog that keeps a server error **inside the dialog** (`role="alert"`). The shared
  `ConfirmationDialog` swallows `onConfirm` errors (`packages/ui/src/components/confirmation-dialog.tsx:79-82`), so it
  is either extended with an `error` prop (narrow, backward-compatible) or a local `AlertDialog` is used; the plan
  picks one. On success, focus moves to the "New Case Type" button and the deletion is announced.
- `components/CaseTypeDialog.tsx`: name (client duplicate check; server `CONFLICT` shown as `<p role="alert">` under
  the field with `aria-invalid`, then focus to the field), category, colour (`RadioGroup` in a fieldset with
  legend "Colour", visible token names, ≥ 24×24 targets, selected = ring + the radio's dot indicator, a non-colour
  cue; rev. E16), default priority (shared `PrioritySelect clearable`, empty placeholder "Case Settings default";
  rev. E17), SLA days (integer input), required fields
  (`fieldset` + legend "Required when creating a case" + help text per D8), checklist editor, Active switch. Focus
  returns to the opener (the row's Edit or the New button).
- `components/ResolutionChecklistEditor.tsx`: `<ul aria-label="Resolution checklist">`; the copy says **step**, to
  match the "Add Step" CTA (rev. E14): each row has a labelled input ("Checklist step 3") and buttons "Move step 3
  up/down", "Remove step 3"; `aria-disabled` (not `disabled`) at the ends so focus stays; one persistent polite live
  region ("Step moved to position 2 of 5", "Step 3 removed, 4 steps remain", "Step added, position 6"); focus rules:
  after a move, focus stays on the same control (if inert, the opposite one); after remove, the next row's input,
  or the Add button when the removed row was the last one; after add, the new input. "Maximum 20 steps" is shown as
  visible text.
- `apps/web/src/components/cases/case-type-colors.ts`: `swatchClass(token: string)` with a slate fallback, no cast (playbook §4); labels in `apps/web/src/components/cases/case-type-labels.ts`.
- `apps/web/src/components/cases/CaseForm.tsx` (create mode):
  - The **Case type** select (`caseTypes` prop, "None", default preselected) replaces the fake Category select.
  - The priority select gets "Use default (…resolved…)".
  - A hint `id="case-type-hint"` (`role="status"`, mounted from the start) is referenced by `aria-describedby` on
    the type and priority selects.
  - Required markers (type set, or module rows when no type/empty) get `aria-required` plus a visually hidden
    "required"; `*` is `aria-hidden`. This includes the always-required Subject and Client (rev. E18).
  - Submit errors (including the Client error) use `role="alert"` and focus the first invalid field.
  - Submits `caseTypeId`.
- `apps/web/src/app/cases/(list)/new/page.tsx`: loads `caseTypes.listActive` and the module required fields
  (`caseSettings.requiredFields.list`, read-only); passes both to `CaseForm`; forwards `caseTypeId` and an optional
  priority; holds the form until both lists load (loading status; on failure an alert with Retry that refetches
  only the failed list); server errors shown inline (`role="alert"` above the form) and as a toast, with the
  rejected mutation handled (rev. E15).
- `apps/web/src/components/cases/CaseDetail.tsx` (+ `types.ts`): a text badge with the type name when present.
- Lighthouse: `lighthouserc.authenticated.js` is already parametrised (`LHCI_URLS`, `LHCI_OUTPUT_DIR`, PG-197), so it is
  not modified; runs pass `LHCI_URLS=…/cases/case-types,…/cases/new`.

## Runtime Wiring & Replacement Paths

| Surface | Must be called by | Replaces / blocks | Notes |
|---|---|---|---|
| `caseTypes.list/create/update/delete/setDefault` | `CaseTypesContent` | the "coming soon" stub | — |
| `caseTypes.listActive` | `cases/(list)/new/page.tsx` → `CaseForm` | fake `CATEGORY_OPTIONS` (never persisted) | — |
| `resolveCaseCreateDefaults` | `cases.create` | direct `input.priority` write; no settings read | `cases.create` is the only API write path. `PrismaCaseRepository.save` (`packages/adapters/src/repositories/PrismaCaseRepository.ts:25`) is a domain-aggregate upsert with an explicit field list (never writes `caseTypeId`); a test pins that. The agent `create_case` only queues an approval (execute simulated). |
| `CaseSettings.defaultPriority`, `CaseRequiredField` | `cases.create`; `new/page.tsx` (markers) | dead config today | ruling Q2 |
| `cases.getById.caseType` | `CaseDetail` badge | — | — |
| `ctx.tenant.userId` default assignee | `cases.create` | broken `(ctx.user as {id?}).id` | D11 |

## Navigation & Reachability

Route `/cases/case-types`, layout `cases/(list)/layout.tsx`. Sidebar `apps/web/src/components/sidebar/configs/cases.ts:14`
(`case-types`, icon `category`, "Case Types"), already present; also linked from
`components/cases/CaseSettingsPanel.tsx:17-21`. Breadcrumbs Dashboard → Cases → Case Types. No new nav work;
`check-nav-wiring` is satisfied by the existing inbound references.

## Acceptance Criteria

- **AC-CT1** `/cases/case-types` replaces the stub and follows the playbook: PageHeader, 12-col bento grid,
  canonical EmptyState (`entity`, `phase="passive"`, no inner CTA), Title Case `size="sm"` CTA in the SectionHeader.
- **AC-CT2** A type has a tenant-unique (case-insensitive, trimmed) name, optional category, one of 8 colour tokens,
  nullable default priority, nullable SLA days (1..3650), a required-field subset and an ordered checklist (≤ 20, no
  duplicate titles). Invalid input is rejected by Zod (superRefine, incl. duplicate type names client-side) and by
  DB CHECKs/indexes.
- **AC-CT3** The type list exposes `openCreate` via `forwardRef`/`useImperativeHandle`.
- **AC-CT4** Every multi-row write (create/update with checklist, setDefault, delete) runs in `$transaction`; no
  `skipDuplicates`; P2002 → `CONFLICT` with a constraint-specific static message.
- **AC-CT5** At most one default per tenant; it must be active; it cannot be deleted or deactivated.
- **AC-CT6** A type used by cases cannot be deleted (`CONFLICT` naming the count); deactivating hides it from the
  picker; existing cases keep it; the DB FK is tenant-consistent.
- **AC-CT7** Mutations need ADMIN/MANAGER (+ forward-compat OWNER/SUPER_ADMIN), otherwise `FORBIDDEN`; reads are
  open; every procedure is LEGAL-gated; every query is tenant-scoped; a foreign-tenant id gives `NOT_FOUND`
  (cross-tenant negative tests per mutation and on `cases.create`).
- **AC-CT8** New Case shows a Case type picker (active only, default preselected, "None"), a "Use default" priority
  option and a hint of what will apply; the fake Category select is gone.
- **AC-CT9** On create, priority = explicit > type > PG-190 `defaultPriority` > MEDIUM; deadline = explicit >
  23:59:59.999 local (case timezone, UTC if none) on day today+N > none.
- **AC-CT10** On create, required fields (the type's non-empty set, else tenant rows, else PG-190 defaults) are
  enforced on effective, trimmed values; a violation returns `BAD_REQUEST` naming the fields.
- **AC-CT11** On create with a type, its checklist is seeded as PENDING `CaseTask`s (order kept, assignee = case
  assignee, no due date) in the same transaction as the case; a seed failure leaves no case.
- **AC-CT12** An inactive or foreign-tenant `caseTypeId`, a foreign `clientId`, or a foreign explicit `assignedTo`
  is rejected with `NOT_FOUND` before any write.
- **AC-CT13** Case detail shows the case type when set; `cases.update` ignores `caseTypeId`.
- **AC-CT14** With no type, PG-190 defaults apply; "Assign to me" (omitted `assignedTo`) creates the case assigned
  to the caller.
- **AC-CT15** Lighthouse ≥ 90 on `/cases/case-types` and `/cases/new` (NEEDS_HUMAN with reason if LHCI credentials
  are unavailable, PG-197 precedent).
- **AC-CT16** WCAG 2.1 AA as specified under Web (labels, fieldsets, live regions, focus management, no
  colour-only signal, target sizes); axe checks in component tests; an a11y-expert review recorded at exec.
- **NF-1** Additive Class A migration with recovery plan; prod apply is manual before the code ships (L13).
- **NF-2** No heavy server-only imports in web components (L11): web imports zod/enums/DTO types from validators
  and constants from domain only.
- **NF-3** Diff coverage ≥ 80% on changed lines; domain resolver ≥ 95%.

## Test Requirements

New:
- `packages/domain/src/legal/cases/__tests__/case-type-defaults.test.ts`: every precedence branch; invalid module
  priority; required fallback (type non-empty / empty / no type), trimmed-empty strings missing; seed order; limits
  and role consts (incl. OWNER and SUPER_ADMIN). The key-list check against the validators enum lives in
  `packages/validators/__tests__/enum-consistency.spec.ts` (domain cannot import validators; rev. E9).
- `packages/validators/src/__tests__/case-types.test.ts`: schemas, superRefine (duplicate checklist titles,
  duplicate keys, duplicate type names helper), colour/priority enums, SLA int bounds, max counts, DTO shape.
- `packages/validators/src/__tests__/case.test.ts` (extend): `priority` optional with no default; `caseTypeId`;
  `updateCaseSchema` strips `caseTypeId`.
- `apps/api/src/modules/legal/__tests__/case-types.router.test.ts` (`prismaMock`, `$transaction` callback mock):
  every procedure; RBAC `FORBIDDEN`; cross-tenant `NOT_FOUND`; P2002 per constraint; P2003 on delete; delete
  rules; setDefault rules; 50 cap; no `skipDuplicates`; no input spread.
- `apps/api/src/modules/legal/__tests__/cases.router.case-types.test.ts` (real `createCaller`): precedence; SLA
  deadline with fake timers (UTC, Europe/London, America/New_York spring-forward and fall-back target days,
  Australia/Sydney, Pacific/Kiritimati); required-field `BAD_REQUEST`; checklist seeded with the same `tx`;
  rollback on seed failure; inactive/foreign type, foreign client, foreign assignee → `NOT_FOUND` with no
  `case.create`; omitted `assignedTo` → `ctx.tenant.userId`; `getById.caseType`; `update` ignores `caseTypeId`.
- `apps/api/src/modules/legal/__tests__/legal-module-entitlement.test.ts` (extend): `caseTypes` gated, incl.
  `listActive`.
- `apps/api/src/__tests__/app-router.smoke.test.ts` (extend).
- `packages/adapters/src/repositories/__tests__/PrismaCaseRepository.test.ts` (extend): `save` never writes
  `caseTypeId`.
- `tests/integration/case-types.test.ts` (DB, run via the slot wrapper with `--exclusive intelliflow-db`):
  `ensureMigrationSql` (PG-197 pattern; never drops `cases`; adds the shared-table columns and the composite FK idempotently); CHECKs;
  `lower(name)` unique per tenant; one default per tenant; checklist composite FK; **cross-tenant `caseTypeId`
  insert on `cases` fails at the DB**; deleting a referenced type fails; RLS policies present; SQL CHECK key list
  equals `CASE_REQUIRED_FIELD_KEYS`.
- Web: `case-types/__tests__/{page,CaseTypesContent,CaseTypesLoading}.test.tsx`;
  `components/__tests__/{CaseTypeList,CaseTypeDialog,ResolutionChecklistEditor,DeleteCaseTypeDialog}.test.tsx`; `components/cases/__tests__/case-type-helpers.test.ts`
  (live-region text, focus after move/remove/add/delete, `aria-describedby`, axe in every component suite incl.
  CaseTypesContent, CaseTypesLoading, DeleteCaseTypeDialog and CaseForm; jsdom cannot compute colour contrast, so
  the axe `color-contrast` rule is off there and contrast is covered by the a11y-expert review);
  `components/cases/__tests__/CaseForm.test.tsx` (new: picker, no `priority` in the payload for "Use default",
  hint, required markers, `caseTypeId`); `cases/(list)/new/__tests__/page.test.tsx` (new: loading, Retry, inline
  server error); `CaseDetail.test.tsx` (extend: badge).

Existing suites to rerun (full package suites, one at a time, through the slot wrapper): `@intelliflow/domain`
(`enum-consistency`), `@intelliflow/validators`, `@intelliflow/adapters`, `@intelliflow/api` (incl.
`cases.router.test.ts`, `case-settings.router.test.ts`, the agent `create_case` tool tests: `CreateCaseInput`
consumers), `@intelliflow/web` (incl. `content-audit-schema.test.ts`, `sitemap-reconciliation.test.ts`), plus `db`,
`domain`, `validators` builds before the api/web typecheck (stale dist).

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| The form keeps sending `MEDIUM`, so precedence is silently dead | D13 + a CaseForm test asserting no `priority` in the payload |
| `db push` test DBs miss SQL-only objects (incl. the composite FK) | per-file `ensureMigrationSql` (PG-197 `81ec9845f` pattern) |
| `prisma migrate diff` proposes dropping SQL-only objects | schema comment block "do not drop in a diff" (PG-197 precedent) |
| Concurrent creates exceed the 50 cap by one | accepted soft cap, documented in `CASE_TYPE_LIMITS` |
| Concurrent `setDefault` / delete-vs-create races | partial unique index + clear-then-set tx (P2002 → retry message); composite FK NO ACTION (P2003 → `CONFLICT`) |
| `CaseSettings.defaultPriority` is an unvalidated String | parsed against `CASE_PRIORITIES`, falls through |
| Zones with 00:00 DST transitions | handled by the D7 start-of-day search; Santiago/Beirut/Amman + exhaustive 2021/2026 × 11-zone tests |
| Legacy `cases.router.test.ts` never calls the router (false confidence) | new caller-based suite; gh issue + debt-ledger for the legacy file |
| `(ctx.user as {id?}).id` at `cases.router.ts:599,649` | gh issue + debt-ledger (outside the create path) |
| Required-field enforcement on `cases.update` | out of scope per ruling; gh issue |
| Agent `create_case` execute is simulated (pre-existing) | gh issue if not already tracked; when wired it must call `cases.create` |
| Other lanes edit the same registries and ADR numbering | change only PG-204 lines; ADR-076 (075 claimed); the runner rebases before pre-ship |

## Out of scope

Business-day SLAs; changing a case's type after creation; a workflow-engine "resolution workflow" (the ruling's
checklist replaces it); reorder/reset of types; required-field enforcement on update; migrating PG-197's local
`SectionHeader` copy.

## Agent Sign-offs

### What happened in the original session (2026-10-12/13 night), stated exactly

- Rounds 1-2 (ANALYSIS + PROPOSAL): backend-architect, data-engineer, frontend-lead, domain-expert and
  test-engineer gave analyses and proposals. **None of them gave an approve/reject verdict.**
- Rounds 3-4 (CHALLENGE): security-lead, a11y-expert and stoa-domain each returned **APPROVE WITH MODIFICATIONS on
  a draft**, which the lead then rewrote to fold the modifications in.
- The earlier "8/8 approved" claim was false: only 3 verdicts existed, all on a draft, and the 5 Round 1-2 agents
  never saw the final text.
- Lead override, stated plainly: the lead (not domain-expert) replaced domain-expert's BR-14 (union of type and
  tenant required fields) and BR-21 (the server applies the default type) with D8 and D4 to follow the owner
  ruling. domain-expert did not review that replacement in the original session; it reviewed and accepted it in
  the consensus re-run below.
- `/spec-exploration` (Phase 0.75) was skipped in the original session. It was run on 2026-10-13 against the final
  spec and the implemented code (`.specify/sprints/sprint-18/context/PG-204/PG-204-spec-exploration.md`), and its
  findings produced the "rev. 2026-10-13" amendments in this document.

### Consensus re-run on the final spec (2026-10-13, `/spec-consensus`, subagent mode)

Each agent read this final spec and the exploration record, verified its area against the code with Read/Grep
(file:line cited), and returned `APPROVED` or `REJECTED: <reason>`. Threshold ≥ 66%. Result: **8/8 APPROVED in 1
round**, no REJECT. Verdicts were returned between the round start (`06:19:36Z`) and `06:20:57Z`.

| Agent | Verdict | Conditions / notes it attached | Key files verified this round |
|---|---|---|---|
| backend-architect | APPROVED | E10 and E11 must be fixed in exec; keep the `updateCaseSchema` regression test | `case-types.router.ts:1-381`, `cases.router.ts:55-125,425-575`, `case-sla-deadline.ts`, `case-task-order.ts` |
| data-engineer | APPROVED | migration header over-claims the NOT VALID lock benefit (one migration transaction): reword | `migration.sql:1-119`, `schema.prisma:2120-2179,2230-2439`, `tests/integration/case-types.test.ts:60-169` |
| frontend-lead | APPROVED | implement E19 literally; E28 disable only on `!canEdit`; E18/E15 fix shapes | `CaseTypesContent.tsx:1-254`, `ResolutionChecklistEditor.tsx:1-202`, `new/page.tsx:1-136`, `CaseForm.tsx:280-370` |
| domain-expert | APPROVED | **accepts the lead's D4/D8 replacement of its BR-21/BR-14** as the correct reading of the ruling; note in the PR that a type's non-empty set can relax the module floor | `PG-204-owner-ruling.md:1-10`, `case-type-defaults.ts:1-157`, `cases.router.ts:55-132` |
| test-engineer | APPROVED | E22-E26, E29 plus tests for D3 zero-row delete, D19, E10, E11, E15 | `case-type-defaults.test.ts`, `cases.router.case-types.test.ts:173,179`, `case-types.router.test.ts` |
| security-lead | APPROVED | E27 gh issue filed before merge (done: #880); the PR and ADR-076 must not claim the cases module is tenant-hardened | `case-types.router.ts:1-381`, `cases.router.ts:60-107,430-565,735-757`, `validators/case-types.ts:1-179` |
| a11y-expert | APPROVED | explicit contrast review at exec (swatches 3:1 non-text, radio, destructive text, both themes); "Saving…" also announced politely; E19 test asserts focus on Add | `ResolutionChecklistEditor.tsx:1-201`, `CaseTypesContent.tsx:1-253`, `CaseTypeDialog.tsx:270-304`, `radio-group.tsx:21` |
| stoa-domain | APPROVED | E11 and E10 not yet implemented: exec must close them with tests; reword the migration lock comment | `router.ts:35-36,151-152`, `migration.sql`, `validators/case-types.ts`, `case-type-defaults.ts:10-11,40-42` |

Discussion log: `PG-204-discussion.md`. Exploration record: `PG-204-spec-exploration.md`.
