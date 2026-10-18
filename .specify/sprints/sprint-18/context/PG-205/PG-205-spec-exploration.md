# PG-205 — spec exploration (Phase 0.75)

Run 2026-10-17 (UTC): launched after 14:44:51Z (agent selection written), first report back before 14:49:30Z, all seven back before 15:56:40Z. Seven `Explore` sub-agents, one per role, each read the code in
this worktree (origin/main `28d93df47`) with Read/Grep/Glob and cited file:line. This file condenses
their reports; the IDs (B/F/D/M/T/A/S) are the agents' own.

Hydration note: `tools/scripts/lib/stoa/context-hydration.ts` ran at 14:44:39Z
(`hydrated-context.json`, hash `1cb03f2d…b000`) but its codebase-pattern scan returned **0 patterns**:
its shell grep printed "The system cannot find the path specified." ~60 times on Windows. This
exploration is what actually covers codebase patterns.

## Roster

| Role | Agent | Notes |
|---|---|---|
| Backend-Architect | Explore | library-selected |
| Frontend-Lead | Explore | library-selected; task persona |
| Data-Engineer | Explore | added by lead: new table + migration |
| Domain-Expert | Explore | library "always included" |
| Test-Engineer | Explore | library "always included" (omitted from its 5-cap list) |
| A11y-Expert | Explore | library-selected |
| Security-Lead | Explore | added by lead: tenant isolation, RBAC, migration |
| AI-Specialist | not spawned | library picked it on the keyword "AI" ("AI defaults FALSE"); the task adds no AI logic and all 12 existing toggles are already wired (B11) |

## Backend (B)

- **B1** PG-204 `apps/api/src/modules/legal/case-types.router.ts`: `moduleTenantProcedure('LEGAL')` (:34),
  `assertCaseTypeAdmin` FORBIDDEN (:90-96) via `isCaseTypeAdminRole` (= `ACCOUNT_OWNER_ADMIN_ROLES`);
  explicit `tenantId` in every query (:7-9); `findOwnedCaseType` NOT_FOUND (:114-121); field-by-field data
  (:123-133); P2002→CONFLICT (:98-112); list with usage counts `groupBy` (:160-186); `listActive` (:189-215);
  create cap + callback `$transaction` (:217-248); delete refuses default/in-use, P2003→CONFLICT (:293-331);
  setDefault clear-then-set (:334-379).
- **B2** `cases.router.ts` applies the type at creation: `loadCaseCreateContext` (:62-106, inactive/foreign
  type → NOT_FOUND), pure `resolveCaseCreateDefaults` (:459-472), missing required → BAD_REQUEST (:474-480).
- **B3** `apps/api/src/router.ts`: `contactSettings` :146, `caseTypes` :153; no `contactTypes`.
- **B7/B8** PG-196 tiers use `adminTenantProcedure` (ADMIN only); PG-197 territories use `tenantProcedure`
  + `assertTerritoryAdmin` — closest model for a free (CORE_CRM) module.
- **B9** `contact-settings.router.ts` has **no role gate** on any procedure; tag `update` spreads input.
- **B11** All 12 `ContactAutomationSetting` Booleans are enforced (e.g. `autoMergeOnExactEmail`
  `contact-duplicate-detection.service.ts:342`; `normalizePhoneNumbers` `contact.router.ts:628`;
  `preventDeleteWithOpenDeals` :1216-1218; `notifyOnOwnerChange` `contact-reassign.ts:118-122`; AI flags
  :704-714/:2320/:2390/:2421). AI defaults are `false` (`contact-automation.ts:29-42`, schema :6148-6170).
- **B12** `contactType` on create/update: `contactTypeSchema.optional()` (`validators/src/contact.ts:44`),
  spread into create (`contact.router.ts:671-677`), part of `CONTACT_INFO_FIELDS` on update (:117-146).
- **B13** Tenant-wide required fields: `contact-automation.ts:175-246` (`email|phone|company|jobTitle|ownerId`).
- **B14** Latent bug: contact schemas have `title`, not `jobTitle`; create reads `(input as {jobTitle}).jobTitle`
  (`contact.router.ts:606-626`), so a tenant that requires `jobTitle` can never create a contact; update never
  checks `jobTitle`/`ownerId`. Per-type required fields must map keys to real columns.
- **B15/B20** No ContactType model/router/validator/migration exists — the CSV KPI "backend exists" is false.
- **B16-B18** IFC-310 (duplicates), IFC-311 (reassign), IFC-312 (AI chains) are all Completed.

## Frontend (F)

- **F1** Stub `contact-types/page.tsx:1-16` ('use client', "coming soon"). `(list)/layout.tsx:25-34` already
  treats `/contacts/contact-types` as a settings page.
- **F2** PG-204 UI shape: server `page.tsx` + `Suspense`/Loading; `CaseTypesContent.tsx` PageHeader breadcrumbs,
  sr-only live `<output>`, read-only note, bento `lg:grid-cols-12` 8+4, SectionHeader action
  `listRef.current?.openCreate()`; `CaseTypeList` forwardRef/useImperativeHandle, EmptyState passive;
  `CaseTypeDialog` dirty fingerprint, RadioGroup swatches; `DeleteCaseTypeDialog` AlertDialog keeps server error.
- **F3** `ContactSettingsContent.tsx` TagsTab via forwardRef (:130, :429-442); `TagsTab.tsx:86,102`; 18-token
  `TAG_COLOR_TOKENS` (`validators/src/contact-settings.ts:78-100`); colour picked from a raw-token Select.
- **F4** Playbook rules (`docs/planning/module-settings-playbook.md`): §1 layout, §2 EmptyState, §3 CTAs,
  §4 TagsTab forwardRef, §5 router, §6 superRefine, §8 toggle categories, §10 db barrel, §12 tests,
  §13 PRD addendum, §14 spec citations.
- **F5** Sidebar already links the page (`sidebar/configs/contacts.ts:12-17`) and so does
  `ContactSettingsPanel.tsx:16-22`. Docs list the route with a stale description (sitemap :137,
  PAGE_MAP :170, reachability :258); `page-registry.md` has no entry.
- **F6** New Contact form hard-codes the six options (`new/page.tsx:116-124`), drops `contactTypeOther`
  (:270-279); `ContactForm.tsx` (edit) carries `contactType` but renders no field; no list/detail renders it.
- **F7** Shared: `PageHeader`, `SectionHeader`, `EmptyState` (`entity="contacts"` has no hotkey), RadioGroup,
  AlertDialog, Badge; no shared colour picker (module-local precedents: CaseTypeDialog, TierColorPicker).
- Registries to update: `router.ts`, `app-router.smoke.test.ts`, validators/db barrels, `ui-flow-mapping.md`
  router + procedure counts, `information-architecture.md` router count, page-registry / sitemap / PAGE_MAP /
  reachability descriptions, WCAG/VPAT version rows, dependency chains, PRD addendum, Sprint_plan CSV + splits.

## Data (D)

- **D1** `Contact.contactType String?` (schema :800), no index/relation; `@@index([tenantId])`.
- **D3/D5** PG-204 migration `20261013120000_case_types`: btrim name CHECK, colour CHECK, `(tenantId, lower(name))`
  unique, partial one-default unique, composite FKs, RLS policy `current_setting('app.current_tenant_id', true)`
  in a `DO $$ … duplicate_object` block; RLS not FORCEd; Class A forward-only header.
- **D4** Tenant back-relations are `@ignore`'d (schema :155-157, :189).
- **D6** `contact_tags_colorToken_check` (18 tokens) in `20260414120000_contact_settings_hardening:7-13`.
- **D7** Contact settings tables have RLS enabled but no policy; newer tables use the case_types convention.
- **D8** `packages/db/src/__tests__/rls-migrations.test.ts` fails a CREATE TABLE without ENABLE RLS.
- **D9** Newest migration `20261016120100_agent_actions_pending_sweep_idx` → `20261017120000` sorts last.
- **D10-D13** Only the six enum values or NULL can have been written via the API (`contactTypeOther` never
  stored; bulk lead conversion leaves NULL). The DB column has no CHECK, so `SELECT DISTINCT` before relying on it.
- **D14** Prisma is 7.x (`packages/db/CLAUDE.md:5`, package ^7.8.0); root CLAUDE.md's "5.22.0" is stale.
- **D16** Integration template `tests/integration/case-types.test.ts` with `ensureMigrationSql()` (CI uses db push).
- Backfill risks: seeding six types per tenant inside the migration is a cross-tenant data write (beyond Class A)
  → seed lazily per tenant; FK on `contacts` would need a backfill → keep the string column.

## Domain (M)

- **M1-M3** `CONTACT_TYPES` fixed; no invariants; "Other" free text lost.
- **M4** Edit form has no type picker. **M5** nothing downstream reads `contactType` (list filters status/
  department/company only, `ContactsPageClient.tsx:59-61,83-87`).
- **M6** Sidebar segments `/contacts?segment=vip|partners|vendors` (`sidebar/configs/contacts.ts:57-81`) are read
  by nothing — same dead-filter shape PG-196 fixed.
- **M8** Person vs organisation is already Contact vs Account. **M9** customer/prospect overlap `CONTACT_STATUSES`.
- **M10** Required fields are tenant-wide (5 keys). **M11** no "labels", only tags; `Contact.tags` free text.
- **M12** PG-204 precedence rule: explicit input → type → module defaults (`case-type-defaults.ts:1-8,96-157`).
- **M14** Playbook §8 toggle categories; PRD needs a "PG-205 Addendum".

## Test (T)

- **T1** PG-204 router test template (callback `$transaction` mock, FORBIDDEN, FOREIGN NOT_FOUND with `where`
  assertion, smuggled tenantId, P2002/P2003, no skipDuplicates).
- **T3** DB integration template; **T4** web test templates (Content/page/Loading/components, axe).
- **T5** contact-settings router test is weaker (non-callback tx mock, weak P2025 test).
- **T6** Count tests: `ia-reconciliation.test.ts:46-69`, `ui-flow-mapping-reconciliation.test.ts:44-89` (router
  count + procedure header vs Total row); `app-router.smoke.test.ts:177-186` block per router. Page count (214)
  unchanged — the route exists.
- **T7** Validator tests in `packages/validators/src/__tests__/`; PG-204 `caseTypeNameSchema`/`findDuplicateCaseTypeName`.
- **T9** diff-coverage ≥80% changed lines; coverage + integration need local Postgres/Redis.
- **T10** Lighthouse precedent: PG-204/PG-201 NEEDS_HUMAN (authenticated page, no non-prod admin).

## A11y (A)

- **A1/A2** PG-204 contrast: `text-destructive` failed (1.77:1 dark) → `text-red-700 dark:text-red-300`;
  swatches need `ring-1 ring-inset ring-slate-500`.
- **A4-A7** CaseTypeDialog/List/Delete patterns are the model (fieldset+legend RadioGroup, aria-invalid/
  describedby, focus return, AlertDialog keeps server error).
- **A8** Contact TagsTab has five issues not to copy (text-destructive, no aria-invalid, raw-token Select,
  label-changing save button, ConfirmationDialog loses server errors).
- **A10** axe.run with color-contrast off; add keyboard tests. **A11** EmptyState entity mode adds `tabIndex=0`
  region; pick an entity with no hotkey (`contacts` is safe).

## Security (S)

- **S1/S2** No procedure allows MANAGER except in-handler checks; reuse `ACCOUNT_OWNER_ADMIN_ROLES` via a new
  `isContactTypeAdminRole` in the domain package; `list` returns `canEdit`.
- **S3** Do not copy contact-settings (no role gate, input spread, P2025 → 500).
- **S4** `prismaWithTenant` does not inject tenantId (`security/tenant-context.ts:142-191`); explicit tenantId
  everywhere; `updateMany/deleteMany` `{id, tenantId}`.
- **S5** RLS per case_types. **S6** DB guards; never set `ALLOW_PROD_DB_OPS`.
- **S8** Contacts is CORE_CRM → plain `tenantProcedure`, no module gate.
- **S9** trim + btrim CHECK, colour enum shared by Zod/DB/UI, token → class via fixed map only, P2002→CONFLICT,
  per-tenant cap; contact create must validate the type key belongs to the caller's tenant.

## Discrepancies with the task row (resolved by the owner ruling, `PG-205-owner-ruling.md`)

1. Taxonomy person/organization/vendor/partner vs code's six → ruling: current six, tenant-editable.
2. "backend exists, UI stub only" → false; full-stack task.
3. "default labels" → default tags; "default fields" → default values.
4. Owner/STOA metadata ("Frontend Dev (STOA-Foundation)") understates a full-stack task; the note's STOA
   instruction (/stoa-foundation) is kept, and Domain/Security STOA are added because of the migration.
