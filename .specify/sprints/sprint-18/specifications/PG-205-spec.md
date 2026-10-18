# Specification: PG-205 — Module Settings: Contact Types

**Status:** APPROVED — `/spec-consensus` 7/7 APPROVED in 1 round (verdicts launched after 16:15:37Z, all back before
16:16:34Z, 2026-10-17; see Agent Sign-offs) · **Sprint:** 18 · **Branch:** `feat/pg-205-contact-types`
· **Base:** origin/main `28d93df47` · **Persona:** frontend-lead · **STOA:** foundation (row) + domain + security
(the task adds a migration, tenant-scoped router and contact create/update wiring)

## Overview

Tenants get **configurable contact types**. Each tenant starts with the six existing types (customer, prospect,
partner, vendor, investor, other), and admins can rename, recolour, add, deactivate and set a default type at
`/contacts/contact-types`. A type is **applied when a contact is created** (default status, default department,
owner rule, default tags, extra required fields). The New and Edit contact forms get a type picker, the contacts
list gets a type badge and filter, and the dead sidebar segment links (VIP / Partners / Vendors) start working.

Existing contacts keep their stored `contactType` strings: there is **no backfill**. The configurable types are
keyed by the value already stored in `contacts.contactType` (ADR-080).

### Owner rulings (binding, 2026-10-17)

`.specify/sprints/sprint-18/context/PG-205/PG-205-owner-ruling.md`:
1. Type set **A**: the current six, tenant-editable; no data migration of contacts.
2. Behaviour **A**: applied on create (PG-204 precedent); picker on New + Edit; type default values, type required
   fields on top of tenant-wide ones, default tags; list type filter + column; fix the dead `?segment=` links.
3. "Default labels" = **default tags** chosen from the tenant `ContactTag` list.
4. "Default fields" = **default values** (precedence explicit input > type > module default).
5. VIP segment = filter by the `vip` tag (case-insensitive).
6. Remove the discarded "Other — please specify" free text.
7. Owner default = per-type **CREATOR** or **ACCOUNT_OWNER** (linked account's owner, else creator). Never a raw id.

### Row reconciliation (row vs main)

| Row says | Reality on main / decision |
|---|---|
| taxonomy person/organization/vendor/partner | Superseded by ruling 1. Organisations are `Account` (`packages/domain/src/crm/account/Account.ts:171`). |
| KPI "backend exists, UI stub only" | False: no ContactType model/router/validator exists (exploration B15). Corrected in the CSV (Category A). |
| default labels / default fields | Rulings 3 and 4. |
| `apps/web/src/app/contacts/(list)/contact-types/page.tsx` | Exists: 16-line "coming soon" stub, served at `/contacts/contact-types`. Replaced in place; no second route. |
| `apps/api/src/modules/contact/contact-types.router.ts`, `packages/validators/src/contact-types.ts` | New files at exactly these paths. |
| Owner "Frontend Dev (STOA-Foundation)" | Full-stack task. /stoa-foundation as the note requires, plus Domain + Security STOA (migration, tenant router). |

## Related Documents

| Type | Path | Status | Action |
|---|---|---|---|
| PRD | `docs/planning/prd-module-settings.md` (PG-205 Addendum) | Draft addendum | Updated (US-CTY1..4); AC + delivery status filled at exec |
| ADR | `docs/architecture/adr/ADR-080-tenant-contact-types.md` | Proposed → Accepted at exec | Created; decision outcome = option 1 (stable key, string match) |
| ADR | `docs/architecture/adr/ADR-076-case-types-applied-at-case-creation.md` | Accepted | Referenced (create-only defaults, precedence) |
| ADR | ADR-069 (agent autonomy / migration risk classes) | Accepted | Referenced (Class A gates) |
| Playbook | `docs/planning/module-settings-playbook.md` | — | Followed (§1-§15) |
| Dependency chain | `docs/architecture/diagrams/complete-dependency-chains.md` | — | New "Contact Types (PG-205 — ADR-080)" section |

## Dependencies Verified (Phase 0.95)

| Dependency | Claim | Verified | Method |
|---|---|---|---|
| PG-178 | module settings layout + lead settings | TRUE | all 4 attested artifacts exist |
| PG-182 | contact-settings router, ContactTag/RequiredField/Automation models, toggles enforced | TRUE | `router.ts:146`; `schema.prisma:6115-6170`; B11 (12/12 flags have a runtime consumer) |

## Decisions (Rounds 1–3)

Full log: `PG-205-discussion.md` (lead synthesis L1-L10, resolutions R2-1..R2-6, decisions D1-D12).

## Technical Approach

### Data: two additive migrations, Class A (ADR-069)

`packages/db/prisma/migrations/20261017120000_contact_types/migration.sql`
- `contact_types`: `id`, `tenantId` (FK tenants CASCADE), `key VARCHAR(40)`, `name VARCHAR(50)`, `colorToken`
  (default `slate`), `isSystem`, `isActive`, `isDefault`, `sortOrder`, `defaultStatus "ContactStatus"` (nullable),
  `defaultDepartment VARCHAR(100)` (nullable), `defaultOwner` (default `CREATOR`), `requiredFields TEXT[]`,
  timestamps.
- CHECKs: key `^[a-z][a-z0-9_]{0,39}$`; name trimmed and non-empty; colour in the 18 contact `TAG_COLOR_TOKENS`
  (same list as `contact_tags_colorToken_check`, `20260414120000_contact_settings_hardening:7-13`); `defaultOwner IN
  ('CREATOR','ACCOUNT_OWNER')`; department NULL or non-blank; `sortOrder >= 0`; `NOT isDefault OR isActive`;
  reserved keys only for system rows (`isSystem OR key NOT IN (the six)`); `requiredFields <@
  ARRAY['phone','company','title','department','accountId']` and cardinality ≤ 5.
- Indexes: unique `(tenantId, key)`, unique `(tenantId, id)`, `(tenantId, isActive)`; SQL-only unique
  `(tenantId, lower(name))` and partial unique `(tenantId) WHERE "isDefault"`.
- `contact_type_default_tags(tenantId, contactTypeId, contactTagId, createdAt)`, PK `(contactTypeId, contactTagId)`,
  composite FKs to `contact_types(tenantId,id)` and `contact_tags(tenantId,id)`, both `ON DELETE CASCADE`,
  index `(tenantId, contactTagId)`.
- `contact_tags` gets `UNIQUE (tenantId, id)` (composite FK target; PK already guarantees uniqueness; tiny table).
- RLS ENABLE + `<table>_tenant_isolation` policy (USING + WITH CHECK on `current_setting('app.current_tenant_id',
  true)`, `DO $$ … duplicate_object`) on both new tables, copied from `20261013120000_case_types:104-119`. Not FORCEd:
  explicit `tenantId` in every query is the boundary.
- Header: Class A, additive only, `contacts` untouched, forward-only recovery, prod only via `prisma migrate deploy`.

`packages/db/prisma/migrations/20261017120100_contacts_type_idx/migration.sql`: exactly one statement,
`CREATE INDEX CONCURRENTLY IF NOT EXISTS "contacts_tenantId_contactType_idx" ON "contacts"("tenantId","contactType")`
(precedent `20261016120100_agent_actions_pending_sweep_idx`).

Prisma: models `ContactType` (`@@map("contact_types")`), `ContactTypeDefaultTag`; `ContactTag` gains
`@@unique([tenantId, id])` + back-relation; `Contact` gains `@@index([tenantId, contactType])`; Tenant
`contactTypes ContactType[] @ignore // PG-205`. A schema comment lists the SQL-only objects. `packages/db/src/index.ts`
exports `ContactType`, `ContactTypeDefaultTag` (playbook §10).

**Migration L13 (loud):** both migrations must be applied to production manually (`prisma migrate deploy`)
**before** the API is promoted.

### Domain: `packages/domain/src/crm/contact/contact-type-defaults.ts` (new, zero infra deps)

- `CONTACT_TYPES` (existing, length 6) is the seed set and the reserved keys. `ContactType` union in `Contact.ts`
  becomes `ContactTypeKey = string` (renamed; D1) at `Contact.ts:39,89,115,337,386`; the entity validates the key
  format `CONTACT_TYPE_KEY_PATTERN`.
- Constants: `CONTACT_TYPE_KEY_PATTERN`, `CONTACT_TYPE_REQUIRED_FIELD_KEYS = ['phone','company','title','department',
  'accountId']`, `CONTACT_TYPE_OWNER_DEFAULTS = ['CREATOR','ACCOUNT_OWNER']`, `CONTACT_TYPE_LIMITS {maxTypesPerTenant:
  50, maxNameLength: 50, maxDefaultTags: 10, maxTagsPerContact: 20, maxDepartmentLength: 100}`,
  `CONTACT_TYPE_ADMIN_ROLES = ACCOUNT_OWNER_ADMIN_ROLES`, `CONTACT_POLICY_FIELD_TO_COLUMN` (`jobTitle → title`, B14).
- `isContactTypeAdminRole(role)`, `generateContactTypeKey(name, taken)` (slug, never a reserved key, `_2…` suffix),
  `resolveContactCreateDefaults({input, type, accountOwnerId, creatorId, defaultTagNames})` → `{status, department,
  ownerId, ownerSource, tags}` (explicit input wins; tags = input ∪ type tags, case-insensitive dedup, cap 20),
  `missingTypeRequiredFields(type, values)` (real columns).

### Validators: `packages/validators/src/contact-types.ts` (new) + `contact.ts`

- `contactTypeKeySchema` (pattern), `createContactTypeSchema` / `updateContactTypeSchema` (`.strict()`; no `key`,
  `isSystem`, `tenantId`; name trim 1-50; `colorToken` = `tagColorTokenSchema`; `defaultStatus` nullable;
  `defaultDepartment` trim ≤100 nullable; `defaultOwner` enum; `requiredFields` enum array, deduped; `defaultTagIds`
  ≤10 deduped; update adds `id` and requires `isActive`), `deleteContactTypeSchema`, `setDefaultContactTypeSchema`
  (`id` nullable), name-duplicate helpers `findDuplicateContactTypeName` / `contactTypeNameSchema(existing, excludeId)`
  with `superRefine` (DoD item 7), output DTO interfaces.
- `contact.ts`: `contactType` on create/update becomes `contactTypeKeySchema.optional()` (replaces `z.enum(CONTACT_TYPES)`
  at :9/:44); `contactQuerySchema` gains `contactType` and `segment: z.enum(['vip'])`.

### API

`apps/api/src/modules/contact/contact-types.router.ts` registered as `contactTypes` in `apps/api/src/router.ts`
(next to `contactSettings`, :146). Plain `tenantProcedure` (contacts is CORE_CRM — never `moduleTenantProcedure`).
Explicit `.output()` schemas.

| Procedure | Who | Behaviour |
|---|---|---|
| `list` | any tenant user | seed check; types ordered `sortOrder, name`, each with `defaultTags {id,name}[]` and `contactCount` (one tenant-scoped `groupBy`); `limits`; `canEdit` |
| `listActive` | any tenant user | seed check; active types `{id, key, name, colorToken, requiredFields, isDefault, isSystem}` |
| `create` | admin roles | strict input; under the tenant lock: cap 50, generate key, insert type + default-tag rows in one `$transaction`; default tags must be active same-tenant tags (one BAD_REQUEST) ; P2002 → one CONFLICT |
| `update` | admin roles | `updateMany {id, tenantId}`; the default type cannot be deactivated; replaces default-tag rows in the same transaction; key/isSystem never change |
| `delete` | admin roles | refuse system types ("deactivate instead"), the default type, and in-use types (tenant-scoped count by key) — count + delete in one `$transaction` |
| `setDefault` | admin roles | copy of `case-types.router.ts:334-379` (clear then set; target must be active; `id: null` clears) |

`apps/api/src/modules/contact/contact-type-resolver.ts` (new): `ensureSystemContactTypes(ctx)` (cheap count pre-check;
else `$transaction` + `$executeRaw` `pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))` with the key built in JS,
find existing system keys, `createMany` only missing ones, P2002 backstop re-read; failure aborts the caller),
`loadContactTypeByKey(ctx, key, {activeOnly})`, `resolveDefaultTagNames(ctx, typeId)` (active same-tenant tags only),
`assertContactTypeAdmin(ctx)` (FORBIDDEN + `logPermissionDenied`).

`contact.router.ts`:
- **create** (:597-720): if `contactType` given → `ensureSystemContactTypes`, `loadContactTypeByKey(activeOnly)`; unknown,
  foreign or inactive → one `BAD_REQUEST "Invalid contact type"` before quota side effects. ACCOUNT_OWNER: same-tenant
  account `findFirst({id, tenantId})`, owner accepted only if `tenantUserWhere(tenantId)` matches, else creator (fallback
  recorded in audit metadata). Resolve defaults (pure domain), then tenant-wide required (B14 fixed) and type required
  checks against the resolved values; pass resolved status/department/ownerId/tags to `createContact`.
- **update** (:488-560): a changed `contactType` must be active in the tenant; the unchanged stored key is accepted even if
  inactive; when the type changes, the new type's required fields are checked against `beforeContact` + input; tenant-wide
  rules keep explicit-clear semantics (B14 fixed); defaults never re-applied.
- **list** / `buildContactListWhere` (:152-178, :1005-1025): `contactType` filter; `segment='vip'` → tenant `ContactTag`
  names matching `vip` case-insensitively ∪ `'vip'` → `tags: {hasSome}` (no raw SQL).
- `contact-automation.ts` (:175-246): `jobTitle` policy key checks the real `title` value (B14).
- Audit: `'contact_type'` added to `ResourceType` (`apps/api/src/security/types.ts:91-104`); type create/update/delete/
  setDefault logged (ids + changed field names, no PII); contact CREATE afterState gains `contactType`, `appliedDefaults`
  (field names), `ownerFallback`.
- Unchanged and stated: bulk lead→contact conversion (`lead.router.ts:1584`, `PrismaLeadRepository.ts:438`) and
  `ConvertLeadToDeal` create untyped contacts; auto-merge keeps the survivor's own type.

### Web

| File | Reuse tag | Notes |
|---|---|---|
| `contacts/(list)/contact-types/page.tsx` | EXTENDS (replaces stub) | server shell, `<Suspense fallback={<ContactTypesLoading/>}>` |
| `…/contact-types/ContactTypesContent.tsx` | COMPOSES | PageHeader (Dashboard › Contacts › Contact Types), live `<output>`, read-only note, bento `lg:grid-cols-12` 8 + 4 (default type RadioGroup + policy note), SectionHeader action "New Contact Type" → `listRef.current?.openCreate()` |
| `…/contact-types/ContactTypesLoading.tsx` | COMPOSES | bento skeleton, `aria-busy` |
| `…/contact-types/components/ContactTypeList.tsx` | COMPOSES | `forwardRef` + `useImperativeHandle({openCreate})`; `EmptyState entity="contacts" phase="passive" size="sm"`; rows with badge, Default/Inactive/System text badges, "N contacts", Edit / Delete |
| `…/components/ContactTypeDialog.tsx` | COMPOSES | name, colour RadioGroup (18 labelled swatches), active Switch, default status, department, owner rule RadioGroup, required-field checkboxes, `DefaultTagPicker`; dirty fingerprint; key shown read-only on edit |
| `…/components/DefaultTagPicker.tsx` | NEW (justified: no multi-select tag control exists; TagsTab is A8) | checkboxes in fieldset/legend, cap 10 |
| `…/components/DeleteContactTypeDialog.tsx` | COMPOSES | AlertDialog keeping server error, `onCloseAutoFocus` |
| `components/contacts/contact-type-colors.ts` | NEW | 18-token swatch + badge class maps, labels, `toContactTypeColorToken()` slate fallback |
| `components/contacts/ContactTypeSelect.tsx` | NEW (shared by New + Edit) | `@intelliflow/ui` Select, "No type", "(inactive)" stored value, loading/error states never block submit |
| `components/contacts/ContactTypeBadge.tsx` | NEW | text name + aria-hidden dot; unknown key → neutral label |
| `contacts/(list)/new/page.tsx` | EXTENDS | `ContactTypeSelect` replaces the inline select (:772-806); remove `contactTypeOptions` (:116-124), `contactTypeOther` (:59-66, :89, :109, :860-884) and the `'other'` mapping (:270-279); default type preselected |
| `components/contacts/ContactForm.tsx` + `contacts/[id]/edit/page.tsx` | EXTENDS | picker rendered in the Edit form |
| `contacts/(list)/ContactsPageClient.tsx`, `lib/contacts/contact-search.ts`, `components/contacts/ContactList.tsx` | EXTENDS | Type filter in `SearchFilterBar`; `contactType` + `segment` in filter state/query; `segmentToFilter()`; `isDefaultContactQuery` includes them; type filter exempt from the vanish-reset effect; card badge; `useSearchParams` inside a Suspense boundary; URL is the initial seed, filter changes `router.replace` |
| `components/sidebar/configs/contacts.ts` | REUSES (unchanged) | `?segment=vip|partners|vendors` links now work |

## Runtime Wiring & Replacement Paths

| Surface | Must Be Called By | Replaces / Blocks | Notes |
|---|---|---|---|
| `contactTypes.list/create/update/delete/setDefault` | `ContactTypesContent` / dialogs | "coming soon" stub | settings page |
| `contactTypes.listActive` | `ContactTypeSelect` (New, Edit), list Type filter, `ContactTypeBadge` | hard-coded `contactTypeOptions`; "Other — please specify" | |
| `resolveContactCreateDefaults`, `missingTypeRequiredFields` | `contact.create` (and update for type change) | — | domain |
| `contactTypeKeySchema` + tenant lookup | `contact.create` / `contact.update` | `z.enum(CONTACT_TYPES)` (`validators/contact.ts:9,44`) | enum stays only as the seed set |
| `contactQuerySchema.contactType/segment` | `ContactsPageClient` + sidebar segment links | dead `?segment=` links | |
| B14 mapping | `assertRequiredContactFields` callers | reading non-existent `jobTitle` | |

## Navigation & Reachability

Route `/contacts/contact-types`, layout `contacts/(list)/layout.tsx` (settings sidebar via `isContactSettingsPage`).
Sidebar entry exists (`sidebar/configs/contacts.ts:12-17`, icon `category`); parent link `ContactSettingsPanel.tsx:16-22`;
breadcrumbs added in `PageHeader`. Doc updates: `docs/design/navigation-reachability-audit.md:258` → `SB | IP`
"Contacts sidebar; Contact Settings panel (PG-205)"; descriptions in `sitemap.md:137`, `PAGE_MAP_AND_FLOWS.md:170`;
new `page-registry.md` entry. No new page file → page count (214) unchanged.

## Boolean toggles (playbook §8)

| Toggle | Category | Runtime consumer |
|---|---|---|
| `ContactType.isActive` | 1 — wired | `listActive`; `contact.create/update` reject inactive new keys |
| `ContactType.isDefault` | 1 — wired | New Contact picker preselection (UI only; never auto-applied server-side) |
| `ContactType.isSystem` | 1 — wired | delete refused; key reservation |
No AI toggles are added; all 12 existing `ContactAutomationSetting` flags are already wired (exploration B11); AI defaults stay FALSE.

## Acceptance Criteria

- **AC-CTY-001** `/contacts/contact-types` follows the playbook: PageHeader + breadcrumbs, 12-col bento, canonical
  `EmptyState` (entity `contacts`, `phase="passive"`), playbook CTAs (`Button size="sm"`, Title Case, in the
  SectionHeader action), list `openCreate` via `forwardRef`; no "coming soon".
- **AC-CTY-002** Each tenant sees the six system types on first use, seeded lazily for its own tenant only, idempotent
  and race-safe; no `skipDuplicates`.
- **AC-CTY-003** Admins (MANAGER/ADMIN/OWNER/SUPER_ADMIN) can create (cap 50), rename, recolour, deactivate and set
  default; USER gets FORBIDDEN on every write; reads open; `canEdit` reflects the role.
- **AC-CTY-004** Names are unique per tenant case-insensitively (DB index + Zod `superRefine` client helper); duplicate →
  one CONFLICT message.
- **AC-CTY-005** Colour is one of 18 tokens, enforced by Zod, DB CHECK (DoD 8) and a fixed UI class map.
- **AC-CTY-006** Keys are server-generated, immutable, never a reserved key for custom types (DB CHECK).
- **AC-CTY-007** At most one default type, which must be active.
- **AC-CTY-008** System types cannot be deleted; custom types can be deleted only when unused and not default;
  destructive writes run in `$transaction` (DoD 5).
- **AC-CTY-009** A type stores default status, default department, owner rule (CREATOR | ACCOUNT_OWNER), required
  fields (phone, company, title, department, accountId) and ≤ 10 default tags from the tenant tag list.
- **AC-CTY-010** On contact create with a type: explicit input wins, then type defaults; owner = linked same-tenant
  account's valid owner for ACCOUNT_OWNER, else the creator; tags = input ∪ active default tags (dedup, cap 20);
  required = tenant-wide ∪ type fields, checked after defaults.
- **AC-CTY-011** Unknown, foreign or inactive type key on create/update → one identical BAD_REQUEST; the unchanged stored
  key is accepted on update even if inactive; a type change checks the new type's required fields.
- **AC-CTY-012** The tenant-wide "job title required" rule checks the real `title` field on create and update (B14).
- **AC-CTY-013** New Contact: type picker (default preselected), "Other — please specify" removed. Edit: type picker
  with "(inactive)" stored value. A failed types fetch never blocks saving.
- **AC-CTY-014** Contacts list: type badge on each card, Type filter, `?segment=partners|vendors` filter by type,
  `?segment=vip` by the `vip` tag case-insensitively; unknown keys show a neutral label.
- **AC-CTY-015** Every query is tenant-scoped; cross-tenant ids/keys/tags/accounts are NOT_FOUND / rejected (DoD 11).
- **AC-CTY-016** Changes and denials are audit-logged without PII.
- **AC-CTY-017** WCAG 2.1 AA per A11Y-1..12; Lighthouse ≥ 90 on `/contacts/contact-types` (DoD 12) or NEEDS_HUMAN with
  the playbook evidence.
- **AC-CTY-018** Registries updated: `router.ts`, smoke test, `ui-flow-mapping.md` (+1 router, +6 procedures),
  `information-architecture.md`, page-registry/sitemap/PAGE_MAP/reachability, PRD addendum, ADR-080, dependency chain,
  CSV row correction + splits.

### Non-functional

- **NF-001** One extra indexed query per contact create when a type is given; seed pre-check is a count.
- **NF-002** `listActive` cached on the client (`staleTime` 5 min); invalidated by settings mutations.
- **NF-003** No heavy server-only imports in web components (L11).
- **NF-004** Domain coverage > 95%; changed lines ≥ 80% (diff-coverage).

## Accessibility requirements (A11Y)

A11Y-1 swatch fieldset/legend + RadioGroup, 18 labelled radios, linear arrow keys. A11Y-2 pure contrast test for all
tokens (ring vs card ≥ 3:1, badge text ≥ 4.5:1, both themes). A11Y-3 checked swatch has a glyph + ring. A11Y-4 tag picker
checkboxes in fieldset/legend; cap → `aria-disabled`, hint, live message. A11Y-5 select has a visible label, "(inactive)"
text + hint, fetch error `role=alert`. A11Y-6 badge text always present, dot `aria-hidden`. A11Y-7 blocked Delete
`aria-disabled` + focusable + visible reason. A11Y-8 removable filter chips "Remove filter: X", defined focus target.
A11Y-9 one polite `<output>`, `role=alert` errors in `text-red-700 dark:text-red-300`, `aria-invalid` + described-by,
focus first invalid. A11Y-10 focus return; AlertDialog keeps server error. A11Y-11 one h1, no skipped levels, no extra
tab stop. A11Y-12 axe on page/dialog/delete/empty; Lighthouse recorded honestly.

## Security requirements (SEC)

SEC-1 role matrix (above). SEC-2 denials audited. SEC-3 explicit tenantId; `updateMany/deleteMany {id, tenantId}`.
SEC-4..6 ACCOUNT_OWNER rules (same-tenant account, `tenantUserWhere` owner, silent creator fallback, lookup + insert in
one transaction). SEC-7 one invalid-type message. SEC-8 update rule. SEC-9 tags re-resolved. SEC-10 strict schemas.
SEC-11 key generation. SEC-12 caps + fixed messages. SEC-13 colour map only. SEC-14 no Prisma text / input echo.
SEC-15 unknown keys degrade. SEC-16 default must be active. SEC-17 audit (D7). SEC-18 lock + seed failure aborts.
SEC-19 inherited AUTHENTICATED tier + caps. SEC-21 join table tenantId + RLS + CASCADE.

## Test Requirements

TDD order: domain → validators → db/migration → router → contact wiring → web. RED logs (assertion failures, not
missing modules) and GREEN logs under `.specify/sprints/sprint-18/attestations/PG-205/red-green/`.

New:
- `packages/domain/src/crm/contact/__tests__/contact-type-defaults.test.ts` — precedence, owner rule + fallbacks, tag
  union/dedup/cap, required union, key generator (reserved skip, suffixes), admin roles, output keys allowlist.
- `packages/validators/src/__tests__/contact-types.test.ts` — schemas, rejects (it.each), strict unknown keys, colour,
  owner enum, requiredFields (rejects `jobTitle`), duplicate-name superRefine helpers.
- `packages/validators/__tests__/enum-consistency.spec.ts` — new block: colour tokens == `TAG_COLOR_TOKENS`;
  required keys == domain constant.
- `apps/api/src/modules/contact/__tests__/contact-types.router.test.ts` — callback `$transaction` mock; unauth; FORBIDDEN
  table for USER on every write (no write called); MANAGER allowed; missing role fails closed; FOREIGN id NOT_FOUND with
  `where {id, tenantId}`; smuggled tenantId/key/isSystem rejected; foreign/inactive default tag rejected; caps; P2002 →
  CONFLICT; delete guards; setDefault; seed race P2002 re-read; no `skipDuplicates`; audit payload has no PII.
- `apps/api/src/modules/contact/__tests__/contact.router.contact-types.test.ts` — create defaults/owner/tags/required,
  identical invalid-type message for unknown/foreign/inactive (create not called), foreign account → creator, B14,
  update rules (unchanged inactive key ok, new inactive rejected, type change required check, no re-apply), list filter
  + vip segment (tenantId always in where).
- `tests/integration/contact-types.test.ts` — real DB: CHECKs (incl. reserved key 23514), uniqueness per tenant,
  one default, composite FK cross-tenant rejection, cascades (tag delete removes default-tag rows), RLS (non-owner role
  where available), concurrent `ensureSystemContactTypes` → exactly six rows, CONCURRENTLY index `indisvalid AND
  indisready`; setup failure fails loudly (no silent skip).
- Web: `contact-types/__tests__/{page,ContactTypesContent,ContactTypesLoading}.test.tsx`,
  `contact-types/components/__tests__/{ContactTypeList,ContactTypeDialog,DefaultTagPicker,DeleteContactTypeDialog}.test.tsx`,
  `components/contacts/__tests__/{ContactTypeSelect,ContactTypeBadge,contact-type-colors}.test.tsx`, `contacts/[id]/edit`
  test (new), `lib/contacts` segment tests, `components/sidebar/__tests__/contacts-config.test.ts`; axe + keyboard tests.

Existing suites to re-run (full suite per touched package): `packages/domain`, `packages/validators`, `packages/db`
(`rls-migrations.test.ts`), `packages/application`, `packages/adapters`, `apps/api` (incl. `app-router.smoke.test.ts`,
`contact.contract.test.ts`, every `modules/contact/__tests__/*`), `apps/web` (incl. `new/__tests__/page.test.tsx` —
the two "Other" tests are deleted with the feature and recorded; `ia-reconciliation`, `ui-flow-mapping-reconciliation`,
`sitemap-reconciliation`), `tools/scripts` route/doc integrity tests, the integration project. Must NOT weaken:
`Contact.additional.test.ts:56-64`, `contact.contract.test.ts:50`, quota/tenant/security suites.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| No DB link between `contacts.contactType` and types (no-backfill ruling) | app-level validation on write; system types deactivate-only; unknown keys degrade to a neutral label |
| Delete-in-use race (no FK) | count + delete in one transaction; orphan tolerated by the update rule |
| Seed race / self-DoS by name | advisory lock; seed before every mutation; reserved keys skipped; failure aborts |
| CONCURRENTLY index hangs/INVALID | single-statement migration; test asserts validity; runbook drops INVALID first |
| Widening the type cascades | rename to `ContactTypeKey`; 4 files listed; domain dist rebuilt |
| Existing tests assume the enum | mocks extended; only the removed "Other" tests deleted |
| Lighthouse on an auth page | playbook attempts; NEEDS_HUMAN with evidence, never faked |
| Production apply forgotten | L13 called out in spec, ADR, PR body, Aurora message |

## Out of scope (tracked)

- contact-settings router has no role gate; tag `update` spreads input; bulk lead conversion uses `skipDuplicates`;
  `ContactService.ts:92` echoes the account id → one gh issue + debt-ledger + findings doc (L10).
- A `contactType` field on `ContactCreatedEvent` / a type-changed event (no consumer today) → findings doc note.
- Lead conversion applying a default type → findings doc note (owner did not ask for it).

## Consensus amendments (non-blocking modifications adopted from the votes)

- CA-1 (backend) Anchor `contact.router.ts` edits by symbol (`create`, `update`, `assertRequiredContactFields` calls at
  :509/:616), not line ranges. Router test proves the lock path is not entered once the six rows exist. The VIP name
  list is capped at 20. `contactCount` is one `groupBy` by `contactType` with `tenantId`.
- CA-2 (frontend) `ContactTypeSelect` sits in `ContactForm` next to the existing fields; `edit/page.tsx` keeps sending the
  stored key unchanged (an unchanged inactive key is submitted as is). Remove `contactTypeOther` from `ContactFormData`,
  `validateAdditionalStep` and its caller. The default is preselected only after `listActive` resolves and only if the
  user has not touched the field. A test covers the `useSearchParams` Suspense boundary (build would fail otherwise).
- CA-3 (domain) ACCOUNT_OWNER falls back to the creator for no account, a foreign account, no account owner, or an owner
  who fails `tenantUserWhere` — never a hard failure. A domain test pins `CONTACT_TYPE_ADMIN_ROLES` to
  `['ADMIN','MANAGER','OWNER','SUPER_ADMIN']`. `setDefault` clear-then-set runs in one `$transaction`.
  `ContactCreatedEvent` is deliberately unchanged.
- CA-4 (data) `requiredFields` CHECK uses explicit `::text[]` casts; a DB test inserts a bad value and expects 23514.
  Migration header notes the brief lock for the `contact_tags` unique index. Schema comment lists the SQL-only indexes so
  drift tooling treats them as expected. Prisma 7.x syntax (`packages/db/CLAUDE.md`).
- CA-5 (a11y) A11Y-8 focus target: the next chip, else the Type filter trigger. A11Y-2 contrast test fails the run
  (`expect`), covering light and `dark:` classes of `contact-type-colors.ts`. Keyboard test: arrows cycle all 18 swatches;
  the checked glyph is asserted. A11Y-5 "(inactive)" hint linked via `aria-describedby`. The types-fetch error alert is
  rendered once (not re-announced on every refetch).
- CA-6 (test) `packages/db/src/__tests__/rls-migrations.test.ts` is the RLS coverage path. A test asserts the migration's
  18-token CHECK list equals `contact_tags_colorToken_check`. `contact.create`/`update` accept all six seed keys. Mocks
  follow `contact.router.tenant.test.ts`. Clocks pinned. A test documents the delete-vs-assign orphan outcome. `ContactList`
  renders the neutral label for an unknown key. Domain dist rebuilt before validators/api runs.
- CA-7 (security) `'contact_type'` added after `report_schedule` in `ResourceType` (`security/types.ts:104`, PG-201-style
  comment). The case-types precedent path is `apps/api/src/modules/legal/case-types.router.ts` (`setDefault` :334-379). The
  account lookup and the contact insert share one transaction; the fallback appears only in audit metadata.

## Agent Sign-offs

`/spec-consensus` (subagent mode), 1 round, 7 voters launched after 16:15:37Z, all verdicts returned before 16:16:34Z
(2026-10-17). Threshold ≥ 66%: **7/7 APPROVED (100%)**, no blocking modification.

| Agent | Verdict | Files verified (examples) |
|---|---|---|
| backend-architect | APPROVED | `router.ts:12,146`; `legal/case-types.router.ts:263,334`; `scheduled-reports.router.ts:110`; `contact.router.ts:112,128,509,616,621` |
| frontend-lead | APPROVED | `contact-types/page.tsx` (16 lines); `new/page.tsx:58-66,114-124,268-280,770-776`; `ContactForm.tsx:22,86`; `[id]/edit/page.tsx:29,78,141,248` |
| data-engineer | APPROVED | `20261016120100…/migration.sql:3-13`; `20261013120000_case_types/migration.sql:104-118`; `…hardening/migration.sql:8`; `schema.prisma:6130-6146,781,834` |
| domain-expert | APPROVED | owner ruling 1-54; `Contact.ts:18`; `territory-constants.ts:273`; `router.ts:146`; `contact-automation.ts:175,198` |
| test-engineer | APPROVED | `enum-consistency.spec.ts`; `Contact.additional.test.ts:56-64`; `contact.contract.test.ts:50`; `new/__tests__/page.test.tsx:218,273`; `rls-migrations.test.ts` |
| a11y-expert | APPROVED (Round 3 conditions A11Y-2/4/7 met) | spec :254-263; `new/page.tsx:59-63,783-871`; `CaseTypesContent.tsx:176`; `CaseTypeList.tsx:5` |
| security-lead | APPROVED | `security/types.ts:91-104`; `packages/db/src/membership.ts:68`; `legal/case-types.router.ts:266,316,334,352` |
