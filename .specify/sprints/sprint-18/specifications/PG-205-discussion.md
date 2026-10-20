# PG-205 — spec session discussion log

Task: PG-205 Module Settings - Contact Types (`/contacts/(list)/contact-types`, served `/contacts/contact-types`).
Lane: batch-2, worktree `pg-205`, branch `feat/pg-205-contact-types` off origin/main `28d93df47`.
All times UTC. Exact times come from `date -u` readings; where only bounds between two readings are known, a range is given (no estimated times).

## Session timeline

| Phase | When | What ran |
|---|---|---|
| Start | 14:43:34Z | CSV → Specifying, Planned Start 2026-10-17, 10% |
| 0 Hydration | 14:44:39Z | `hydrateContext` + `selectAgents` library (pattern scan returned 0 — Windows grep failure, disclosed) |
| 0.75 Exploration | after 14:44:51Z; all reports before 15:56:40Z | `/spec-exploration`: 7 Explore sub-agents (`context/PG-205/PG-205-spec-exploration.md`) |
| Owner ruling | 15:56:40Z recorded | AskUserQuestion modal: A / A / default tags / default values (`context/PG-205/PG-205-owner-ruling.md`) |
| 0.9 / 0.95 | between 15:56:40Z and 16:03:59Z | dependency chain (no PG-205 section yet → added by plan) and PG-178 / PG-182 deep verification |
| 0.97 PRD/ADR | between 15:56:40Z and 16:03:59Z | PRD PG-205 Addendum; ADR-080 Proposed |
| Round 1 ANALYSIS | between 15:56:40Z and 16:03:59Z | backend-architect, frontend-lead, data-engineer, test-engineer, security-lead sub-agents |

## Phase 0.9 — dependency chain

`docs/architecture/diagrams/complete-dependency-chains.md` has no PG-205 section (PG-204's is at :2462). The plan
adds a "Contact Types (PG-205 — ADR-080)" section in the same shape.

## Phase 0.92 — UI reachability

| Route | Sidebar entry | Parent link | Breadcrumb | Reachable? |
|---|---|---|---|---|
| `/contacts/contact-types` | `sidebar/configs/contacts.ts:12-17` (`id: 'contact-types'`) | `components/contacts/ContactSettingsPanel.tsx:16-22` | PageHeader breadcrumbs (to add) | YES |

## Phase 0.95 — dependency deep verification

| Dependency | Claim | Verified | Method |
|---|---|---|---|
| PG-178 | Module settings layout + lead settings artifacts | TRUE | all 4 `artifact_hashes` paths exist on disk |
| PG-182 | contact-settings router registered | TRUE | `apps/api/src/router.ts:146` `contactSettings` |
| PG-182 | ContactTag / ContactRequiredField / ContactAutomationSetting models | TRUE | `schema.prisma:6115-6170` |
| PG-182 | automation toggles enforced | TRUE | B11 table (all 12 flags have a runtime consumer) |
| PG-182 | 7 artifacts | TRUE | all exist on disk |

No false dependency claims → no blocking follow-up.

## Round 1 — ANALYSIS

### Frontend-Lead (sub-agent, completed before 16:03:59Z, 6 tool calls)

- Files: owner ruling, exploration, playbook §1-4; stub `contact-types/page.tsx:1-16`; `CaseTypesContent.tsx:160-185`;
  `CaseTypeList.tsx:9,23,101,116`; `new/page.tsx:116-124,270-279,772-881`; `ContactForm.tsx:22,86`;
  `[id]/edit/page.tsx:78,141`; `ContactsPageClient.tsx:56-61,83-87`; `sidebar/configs/contacts.ts:7-18,57-81`;
  `AppSidebar.tsx:596-597`; `ContactSettingsPanel.tsx:16-22`.
- Interpretation: server page + Suspense + Loading; PageHeader + 12-col bento (8 list + 4 policy note);
  `ContactTypeList` forwardRef `openCreate`; `ContactTypeDialog` (name, colour RadioGroup, active, default,
  required-field checkboxes over the 5 tenant keys, default values status/department/owner, default-tag chips);
  `DeleteContactTypeDialog` AlertDialog keeping server errors. New/Edit picker from `listActive` (edit form
  has no field today). List `typeFilter` + Type column. `?segment=partners|vendors` → `contactType=partner|vendor`.
- Reuse: PageHeader, SectionHeader, EmptyState(`contacts`), Card, Button, AlertDialog, RadioGroup, Badge,
  Checkbox REUSE; list/dialogs COMPOSE the PG-204 pattern module-locally; colour picker — two module-local
  copies exist, prefer not a third; tag chip multi-select NEW (fieldset of toggle chips); do not copy TagsTab (A8).
- Route conflict audit: no other page covers contact types; the stub holds no fake data → no conflict.
- Questions: VIP segment has no type ((a) tag filter recommended, (b) drop link, (c) add `vip` type);
  remove the "Other — please specify" free text (recommended).
- Concerns: typed contracts (no casts); B14 jobTitle/title; stored key no longer active must stay selectable as
  "(inactive)"; stable keys on rename; client asterisks vs server authority; listActive caching; a11y patterns;
  Lighthouse NEEDS_HUMAN precedent; DESIGN mockup not yet checked.

### Data-Engineer (sub-agent, completed before 16:03:59Z, 13 tool calls)

- Files: ruling, exploration D1-D16, ADR-080; schema Contact 781-847, CaseType 2343-2364, ContactTag 6130-6146;
  `20261013120000_case_types/migration.sql`; `20260414120000_contact_settings_hardening:6-13`;
  `20261016120100_agent_actions_pending_sweep_idx:3-11`; `packages/db/CLAUDE.md`; `packages/db/src/index.ts:51,97-98`.
- Table `contact_types`: id, tenantId (FK CASCADE), `key VARCHAR(40)` immutable slug CHECK `^[a-z][a-z0-9_]{0,39}$`,
  `name VARCHAR(100)` btrim CHECK, `colorToken` 18-token CHECK (copy of `contact_tags_colorToken_check`), isActive,
  isDefault, sortOrder ≥0, `defaultStatus "ContactStatus"?`, `defaultDepartment VARCHAR(100)?`, `requiredFields text[]`
  subset CHECK mapped to REAL columns (`jobTitle` is not a column — B14). Indexes: `(tenantId,id)` unique,
  `(tenantId,key)` unique (Prisma), `(tenantId, lower(name))` unique (SQL), partial one-default, `(tenantId,isActive)`.
  RLS copied from case_types.
- Default tags → join table `contact_type_default_tags` with composite FKs to `contact_types(tenantId,id)` and
  `contact_tags(tenantId,id)` (needs a new `@@unique([tenantId,id])` on ContactTag). Tag id → current name resolved
  at create; later renames don't propagate (existing behaviour). Inactive tags dropped silently; cap ~10/type.
- Migration Class A. Index `contacts(tenantId, contactType)` via a separate single-statement CONCURRENTLY migration
  `20261017120100_…` (precedent `20261016120100`), or skip in v1.
- Seeding lazy per tenant (`INSERT … ON CONFLICT (tenantId,key) DO NOTHING`); alternative: virtual defaults on read.
- Questions: is `isDefault` meaningful? key user-visible? cap 50? delete-in-use only app-level (race) acceptable?
- Concerns: no DB integrity contacts.contactType ↔ key (price of no-backfill); root CLAUDE.md Prisma version stale;
  document SQL-only objects in schema comment; ContactTag unique is a change to an existing model; db barrel export.

### Backend-Architect (sub-agent, completed before 16:03:59Z, 29 tool calls)

- Files: ruling, exploration, ADR-080; `contact.router.ts` 105-198, 396-416, 490-720, 995-1045; `contact-automation.ts`
  173-246; `contact-settings.router.ts` 191-245; `case-types.router.ts` 30-34, 90, 159, 221-336; `case-type-defaults.ts`
  92-157; `validators/contact.ts` 1-95; `Contact.ts` 18-39, 89-116; `lead.router.ts` 216-238, 1556-1594;
  `PrismaLeadRepository.ts` 437-453; `PrismaContactRepository.ts` 75-76, 114-115; `router.ts` 146, 153.
- Router `contactTypes` (plain `tenantProcedure`): list(+canEdit, usage counts), listActive, create, update,
  setActive, delete; admin assert on every mutation; explicit tenantId.
- `ensureSystemContactTypes` lazy upsert of the six keys; catch P2002 and re-read on races.
- Pure domain `resolveContactCreateDefaults` (input > type > module). Required = UNION of tenant + type keys
  (ruling "on top of" — stricter than PG-204's replace). Tags = union, de-dup, cap 20.
- Validation: `contactType` becomes a key-format string; router checks active-in-tenant (BAD_REQUEST); on update only
  when `contactType` is sent.
- Create wiring in `contact.router.ts` create (597-677); list filter in `contactQuerySchema` + `buildContactListWhere`.
- Concerns: B14 confirmed (`contact.router.ts:621` reads `jobTitle`; update never checks email/title) → fix in scope;
  update semantics of required rules (create + explicit clear only); widening `ContactType` union cascades through
  domain/validators/adapters (+ domain dist rebuild); bulk lead conversion `createMany` (+`skipDuplicates`) bypasses
  types — must stay NULL-typed and be stated; auto-merge branch (:686) — confirm tags carried; perf: one findMany of
  active types per create.

### Security-Lead (sub-agent, completed before 16:03:59Z, 12 tool calls)

- Files: ruling, exploration S1-S9, ADR-080; `trpc.ts:429,492,567`; `tenant-context.ts:142-193`;
  `case-types.router.ts:34,90-133`; `contact.router.ts:117-146,597-677`; `territory-constants.ts:273`;
  `validators/contact.ts:9,44-45,89`; schema Contact 781-793, ContactTag 6130-6141; case_types migration 103-118.
- AuthZ: reads plain `tenantProcedure`; writes in-handler `assertContactTypeAdmin` over `ACCOUNT_OWNER_ADMIN_ROLES`
  (not `adminTenantProcedure`, which excludes MANAGER); fail closed on missing role.
- Scoping: explicit tenantId on every op; never tenantId from input; field-by-field data. Contact create resolver
  `findFirst({tenantId, key, isActive:true})` with ONE message for foreign/unknown/inactive (no existence oracle),
  before quota side effects. Update: allow re-sending the unchanged stored key even if inactive; new values must
  be active.
- Default tags: references to same-tenant ContactTag rows; re-resolve at create; drop inactive/deleted; cap 10.
- Mass assignment: allowlist only — status, department, owner CHOICE as an enum (never a raw userId); never
  tenantId/ownerId/dataClassification/email/AI fields; strict schemas; pure field-by-field resolver.
- Hardening: name trim 1-50 + btrim CHECK + lower(name) unique; key server-generated, immutable, absent from update,
  six system keys reserved; colour enum shared; cap 50; no echo of raw input.
- RLS per case_types; lazy own-tenant seeding with unique-violation retry.
- Questions: stale key on update (keep if unchanged); required on update (create only → bypass-by-edit?); owner
  choice enum; delete vs deactivate-only + race.
- Concerns: relaxing the enum without the tenant lookup would accept any string (HIGH); orphan keys after delete;
  contact-settings no role gate → file an issue (out of scope); audit-log type changes without PII.

### Test-Engineer (sub-agent, completed before 16:03:59Z, 13 tool calls)

- Files: ruling, exploration T1-T11; `case-types.router.test.ts:1-150`; `cases.router.case-types.test.ts:1-120`;
  `tests/integration/case-types.test.ts:1-120`; `ui-flow-mapping-reconciliation.test.ts:42-90`; contact `__tests__/`
  (15 files); `Contact.additional.test.ts:56-64`; `new/__tests__/page.test.tsx`; `validators/contact.ts:3-10,44`.
- TDD order: domain resolver → validators → router → contact create/update wiring → web; RED logs saved under
  `attestations/PG-205/red-green/` and must fail on assertions, not on missing modules.
- DB integration `tests/integration/contact-types.test.ts` with `ensureMigrationSql()`; must actually run (not skip)
  in pre-ship.
- Cross-tenant negatives at router, contact create/update, and DB (RLS + uniqueness per tenant).
- Regression at risk: `validators/__tests__/contact.test.ts:459-726` (8 enum fixtures); `contact.contract.test.ts:50`;
  `contact.router.coverage.test.ts:814,847,886`; `Contact.additional.test.ts:56-64` (keep CONTACT_TYPES length 6 as
  the seed set); `new/__tests__/page.test.tsx:218,267,273-284`; contact create tests need `contactType.findMany`
  mock defaults; count tests (ui-flow, IA, smoke) must change in the same commit as router registration.
- Diff-coverage risks: P2002/P2003 mappers, seed race, web client branches; pin clocks.
- Questions: enum-consistency spec path (lead: `packages/validators/__tests__/enum-consistency.spec.ts` per F/T6);
  contactType input becomes a key string; required keys map to real columns; lazy seed concurrency test.

### Round 1 → owner (second modal, recorded 16:03:59Z)

VIP segment → `vip` tag filter; remove "Other — please specify"; owner default = per-type CREATOR | ACCOUNT_OWNER.

## Lead synthesis after Round 1 (baseline for Round 2)

- L1 Table `contact_types`: key (immutable slug, server-generated, unique per tenant; the six `CONTACT_TYPES` are
  reserved system keys with `isSystem=true`), name 1-50 trimmed (btrim CHECK, `(tenantId, lower(name))` unique),
  colorToken = the 18 contact `TAG_COLOR_TOKENS` (CHECK), isActive, isDefault (≤1 per tenant, partial unique, must be
  active; used only to preselect the picker — never auto-applied server-side), sortOrder, defaultStatus
  (`ContactStatus`?), defaultDepartment (≤100)?, defaultOwner (`CREATOR`|`ACCOUNT_OWNER`, default CREATOR, CHECK),
  requiredFields text[] (subset CHECK over real columns). RLS per case_types. Cap 50 types/tenant.
- L2 Default tags: join table `contact_type_default_tags` with composite tenant FKs (adds `@@unique([tenantId,id])`
  to ContactTag); cap 10 per type; inactive tags skipped at apply time; applied as current tag names.
- L3 Seeding: lazy, own tenant only, idempotent, no `skipDuplicates`, safe under concurrent first use.
- L4 Contact create: optional `contactType` key must be an ACTIVE type in the caller's tenant (one error message for
  unknown/foreign/inactive). Defaults applied create-only (ADR-076): status/department (input > type > none),
  owner (ACCOUNT_OWNER → same-tenant linked account's owner, else creator), tags (input ∪ type defaults, dedup, cap 20).
  Required = tenant-wide ∪ type keys, checked after defaults.
- L5 Contact update: new/changed key must be active in tenant; unchanged stored key accepted even if inactive;
  required rules (tenant ∪ effective type) keep today's update semantics (explicit clear fails). No re-application of
  defaults on update.
- L6 B14 fixed in scope: the tenant-wide `jobTitle` key checks the real `title` field on create and update.
- L7 Delete: system types are deactivate-only; custom types deletable only when unused (tenant-scoped count) and not
  default. Bulk lead→contact conversion stays NULL-typed (stated, not changed).
- L8 List: `contactType` filter + Type column; `?segment=partners|vendors` → type filter, `?segment=vip` → tag `vip`
  case-insensitive. Index `contacts(tenantId, contactType)` via a separate CONCURRENTLY migration `20261017120100`.
- L9 New Contact: picker from `listActive`, default preselected, "Other — please specify" removed. Edit: picker added,
  stored inactive value shown as "(inactive)".
- L10 Out-of-scope findings → gh issue + debt ledger + findings doc: contact-settings router has no role gate (B9/S3);
  tag `update` spreads input; bulk lead conversion `skipDuplicates`.

## Round 2 — PROPOSAL (5 sub-agents launched after 16:05:00Z; all reports back before 2026-10-17T16:09:16Z)

### Backend-Architect (16 tool calls)
- New: `packages/domain/src/crm/contact/contact-type-defaults.ts` (constants, `isContactTypeAdminRole`,
  `generateContactTypeKey(name, taken)`, `resolveContactCreateDefaults`, `CONTACT_POLICY_TO_FIELD` with
  `jobTitle→title`), `packages/validators/src/contact-types.ts`, `apps/api/src/modules/contact/contact-types.router.ts`,
  `apps/api/src/modules/contact/contact-type-resolver.ts` (`ensureSystemContactTypes`, `loadActiveContactTypeByKey`,
  `resolveDefaultTagNames`). Modify `contact.router.ts` create/update/list/`buildContactListWhere`,
  `contact-automation.ts` (B14), `validators/contact.ts:9,44,86-93`, `Contact.ts` (`ContactType` widened to string),
  `PrismaContactRepository.ts:114,199,245` casts.
- Procedures: list, listActive, create, update (carries isActive), delete, setDefault (copy of case-types :334-379).
- Seeding: `$transaction` + `pg_advisory_xact_lock(hashtextextended('contact_types:'||tenantId,0))` (precedent
  `scheduled-reports.router.ts:110`), findMany existing system keys, createMany only missing ones, P2002 backstop.
- VIP: `segment: z.enum(['vip'])` on `contactQuerySchema`; tenant-scoped `$queryRaw` for DISTINCT real spellings with
  `lower(t)='vip'`, then `tags: { hasSome }`; empty page when none.
- Runtime-consumer table: listActive → New/Edit picker (replaces hard-coded options + "Other"); list/create/update/
  delete/setDefault → settings page; resolver → contact.create (replaces :616-626 inline check); key schema →
  contact create/update (replaces `z.enum(CONTACT_TYPES)`); query filter/segment → list page + sidebar links.

### Security-Lead (13 tool calls) — SEC-1..SEC-20
- Verified: account tenancy on contact create is enforced in `ContactService.ts:84-93` via
  `PrismaAccountRepository.findById` `{id, tenantId}` (:106-109) but the error echoes the id (`ContactService.ts:92`);
  user-in-tenant check `tenantUserWhere(tenantId)` (`packages/db/src/membership.ts:68-82`, used `contact-reassign.ts:61-64`).
- SEC-1 matrix (reads all roles; writes MANAGER/ADMIN/OWNER/SUPER_ADMIN; USER 403; unauth 401); SEC-2 audit denials
  (`logPermissionDenied`); SEC-3 explicit tenantId; SEC-4..6 ACCOUNT_OWNER: same-tenant account, owner must satisfy
  `tenantUserWhere`, else silent fallback to creator recorded in audit metadata; SEC-7 one "Invalid contact type"
  message; SEC-8 update rule; SEC-9 tags re-resolved, cap 20; SEC-10 strict schemas; SEC-11 key; SEC-12 caps + fixed
  CONFLICT message; SEC-13 colour map; SEC-14 error uniformity; SEC-15 delete race → unknown keys degrade to a neutral
  label; SEC-16 default must be active; SEC-17 audit events (no PII, tag ids only); SEC-18 RLS + seed; SEC-19 rate
  limiting; SEC-20 tests.
- Out-of-scope issue: contact-settings no role gate; tag update input spread; bulk lead conversion skipDuplicates;
  `ContactService.ts:92` id echo.

### Test-Engineer (7 tool calls)
- `enum-consistency.spec.ts` has no contact block (add one); no contacts sidebar config test exists (new file).
- New files: domain `contact-type-defaults.test.ts`; validators `contact-type.test.ts`; enum-consistency block; API
  `contact-types.router.test.ts` and `contact.router.contact-types.test.ts`; `tests/integration/contact-types.test.ts`;
  web component/page tests; `sidebar/__tests__/contacts-config.test.ts`. Each security behaviour has a [-] case.
- Regression: may change `new/__tests__/page.test.tsx:218-284` (removed feature) and add mocks; must NOT weaken
  `Contact.additional.test.ts:56-64`, `contact.contract.test.ts:50`, quota/tenant/security suites.
- RED/GREEN protocol under `attestations/PG-205/red-green/` (assertion failures only; stub exports first).
- Commands per package with `./` filters; DB suite must not silently skip in pre-ship.

### Data-Engineer (18 tool calls)
- Full Prisma models `ContactType` (`@@map("contact_types")`) + `ContactTypeDefaultTag`; ContactTag gains
  `@@unique([tenantId,id])`; Contact gains `@@index([tenantId, contactType])`; Tenant `contactTypes … @ignore`.
- Migration `20261017120000_contact_types` (Class A header + forward-only recovery): CHECKs for key regex, name
  btrim, 18 colours, defaultOwner, defaultDepartment, sortOrder, default ⇒ active, reserved system keys (custom rows can't
  use the six), requiredFields ⊆ {phone, company, title, department, accountId}; unique indexes; composite FKs; RLS.
- Migration `20261017120100_contacts_type_idx`: single `CREATE INDEX CONCURRENTLY IF NOT EXISTS`; test asserts
  `indisvalid`.
- Flag: Prisma model name `ContactType` collides with the domain `ContactType` alias in files importing both.

### Frontend-Lead (19 tool calls)
- No DESIGN mockup for this row (Sprint_plan_I.csv:43; nearest: `create-new-contact.html`, `contact-list.html`).
- Sidebar links are dead twice over: `contacts/(list)/page.tsx:11-27` takes no searchParams and
  `lib/contacts/contact-search.ts:41-62` has no type/tag field. List is card-based (`ContactList.tsx`) → "Type column" =
  type badge on the card.
- Files with reuse tags (page EXTENDS; Content/Loading/List/Dialog/Delete COMPOSES; `DefaultTagPicker` NEW;
  `components/contacts/contact-type-colors.ts` NEW (18 tokens); `components/contacts/ContactTypeSelect.tsx` NEW shared
  picker; ContactForm/new/edit/list page/ContactsPageClient/contact-search/ContactList EXTENDS; sidebar config unchanged).
- Picker rules (default preselected on New only; stored inactive key shown "(inactive)"; fetch failure never blocks
  create); segment translation in the client via pure `segmentToFilter()`; `isDefaultContactQuery` must treat filters as
  non-default.

## Lead resolution of Round 2 open points

- R2-1 Procedures: `list`, `listActive`, `create`, `update` (carries `isActive`; no separate setActive), `delete`,
  `setDefault` → 6 procedures.
- R2-2 `list` returns `defaultTags: {id, name}[]` per type plus `contactCount`; `listActive` returns id, key, name,
  colorToken, requiredFields, isDefault. `contact.create` response is unchanged (no contract change); the UI derives
  the applied defaults from the selected type.
- R2-3 VIP: server-side `segment: 'vip'` on `contact.list` (backend's case-insensitive approach); partners/vendors are
  client-side `contactType` filters.
- R2-4 Required-field keys: tenant-wide stored keys stay `email|phone|company|jobTitle|ownerId` (mapped, `jobTitle→title`);
  type keys are real columns `phone|company|title|department|accountId`.
- R2-5 Seeding: advisory lock + create missing; `ensureSystemContactTypes` runs before every contact-types mutation and
  before the contact create/update type lookup, so a custom "Partner" can never pre-empt the seed.
- R2-6 Model name collision: open for Round 3.

## Round 3 — CHALLENGE (6 sub-agents launched after 16:09:16Z; all back before 16:13:01Z)

### Domain-Expert (5 tool calls)
- C1 widening reaches the entity; rename the widened alias `ContactTypeKey`, keep `CONTACT_TYPES`; add a key-format check.
- C2 two key vocabularies → a separate type-required check (the tenant helper filters to its 5 keys and would
  silently drop `department`/`accountId`). C3 ownerId always satisfied today; check against the resolved owner.
- Edge: type change on update bypasses type required fields → validate the new type against merged state; owner is
  create-time only (no reassignment when an account is linked later); lead conversion untyped (state it); auto-merge
  survivor keeps its own type; unknown keys → neutral label, filters still work for inactive keys; segment links stay
  when partner/vendor are deactivated.
- R2-6: keep Prisma `ContactType`; rename the domain alias. DOA: isDefault UI-only (document), sortOrder needs a
  consumer, isSystem missing from listActive. Suggested a ContactCreatedEvent payload addition.

### A11y-Expert (7 tool calls) — A11Y-1..12, conditional sign-off pending A11Y-2/4/7
- Radix RadioGroup is linear roving tabindex (no 2D) — keep DOM order; swatch = labelled radio with aria-hidden dot +
  1px inset ring on every swatch; checked state needs a non-colour cue (check glyph).
- DefaultTagPicker = real checkboxes in fieldset/legend; at cap use aria-disabled (focusable) + described-by hint +
  live announcement. Blocked Delete uses aria-disabled + visible reason (native disabled hides the reason from
  keyboard users). Removable chips named "Remove filter: X" with a defined focus target. Pure contrast test for all
  18 tokens in both themes (axe runs with color-contrast off). Lighthouse NEEDS_HUMAN.

### Frontend-Lead (9 tool calls)
- `ContactForm` is used only by Edit (`[id]/edit/page.tsx:29,248`); New has its own inline select → the shared
  `ContactTypeSelect` has two call sites. Server prefetch (`contacts/(list)/page.tsx:11`, `contact-queries.ts:17-27`)
  can't see the segment; keep the page signature; `isDefaultContactQuery` (`contact-search.ts:122-136`) must include the
  new filters; `useSearchParams` needs a Suspense boundary ('use cache', `next.config.js:70`); URL = initial seed then
  `router.replace`; exempt the type filter from the "clear filter when option vanishes" effect
  (`ContactsPageClient.tsx:99-125`); avoid a third colour helper; reachability confirmed; no route conflict.

### Backend-Architect (27 tool calls)
- Advisory lock must be `$executeRaw` (Prisma 7 can't deserialize void — `TicketService.ts:364`); raw queries bypass the
  tenant SET so need explicit tenantId; unit tests can't prove the lock.
- `$queryRaw` VIP path is the weakest piece (mock gaps, duplicated predicates, full scan) → avoid raw SQL.
- Widening edit list: `Contact.ts`, `validators/contact.ts`, `ContactService.ts:7,134`, `PrismaContactRepository.ts:8,114,199,245`;
  none in apps/web or apps/api code. Domain dist rebuild.
- Update: `beforeContact` at `contact.router.ts:498` after `assertContactInTenant` (:494); effective type = input ?? before;
  the update resolver must resolve inactive stored keys.
- No generated api-client types; explicit `.output()` + RouterOutputs (TS2589 rule). Counts: +1 router, +6 procedures.
- R2-6 not reachable today (db barrel exports an explicit list; nothing imports ContactType from db).
- Cheap count pre-check outside the lock for seeded tenants.

### Security-Lead (21 tool calls) — corrected SEC
- Build the lock key in JS and bind one parameter (precedents `scheduled-reports.router.ts:110`, `inbound.router.ts:668`);
  cap count under the same lock; key generator must skip reserved keys (else 23514, not P2002); seed failure aborts the
  mutation; join table needs tenantId + RLS + CASCADE on both FKs (else tag deletion breaks).
- SEC-19 replaced: no per-mutation limiter exists (`trpc.ts:237-249` AUTHENTICATED tier) → inherited tier + caps.
- SEC-17/2: add `'contact_type'` to `ResourceType` (`apps/api/src/security/types.ts:91-104`, PG-201 precedent :104); use
  `UPDATE` + metadata for activate/default (no such actions in `AuditAction`).
- ACCOUNT_OWNER lookup + insert in one transaction; residual window accepted; VIP not a disclosure vector; prefer a
  Prisma `ContactTag` insensitive lookup over raw SQL.

### Test-Engineer (13 tool calls)
- CONCURRENTLY via `$executeRawUnsafe` works only as a single statement (precedent `approval-policies.test.ts:83`); assert
  `indisvalid AND indisready` + definition; CONCURRENTLY waits on other forks' transactions → own `beforeAll`, check-then-skip.
- Silent skip = false green: setup failure must fail loudly; pre-ship `integration-tests` (`scripts/pre-ship.mjs:441-449`)
  runs on the :5433 test DB and records MISSING when the DB is down.
- Web mocks that break: `new/__tests__/page.test.tsx:53-68` (needs `contactTypes.listActive`), `ContactForm.test.tsx:21`
  (no trpc mock); the Edit page has no tests → add. Counts: ui-flow-mapping header + smoke twin of `caseTypes` (:177-184).
- New contact.router tests in a new file; existing create tests need default `contactType` mocks.
- Real-DB concurrent seed race; reserved-key CHECK 23514; RLS proven with a non-owner role; 10 "false confidence" tests to avoid.

## Lead decisions after Round 3 (folded into the spec)

- D1 Domain: widened alias renamed `ContactTypeKey = string`; `CONTACT_TYPES` unchanged (length 6, seed set); one key-format
  regex constant shared by domain/validators/DB CHECK. Prisma model stays `ContactType` (CaseType parity); the domain no
  longer exports a `ContactType` name, so there is no collision; db barrel exports `ContactType`, `ContactTypeDefaultTag`.
- D2 Separate `missingTypeRequiredFields` (real-column keys); the tenant helper keeps its keys with the B14 `jobTitle→title` fix.
- D3 Update: when `contactType` changes, the NEW type's required fields are checked against the merged state
  (stored row + input); otherwise today's explicit-clear semantics. Defaults are never re-applied on update.
- D4 VIP: Prisma-only — `contactTag.findMany({tenantId, name: {equals: 'vip', mode: 'insensitive'}})` names ∪ `'vip'` →
  `tags: {hasSome}`. No raw SQL. Caveat documented (a free-text spelling like "vIp" with no ContactTag row is missed).
- D5 Seeding/caps: `$executeRaw` advisory lock, key built in JS; seed + 50-cap count under the lock; cheap count
  pre-check outside the lock; a seed failure aborts the mutation; the key generator skips the reserved keys.
- D6 `sortOrder` consumer = ordering of list/listActive (system 0-5, custom max+1); no reorder UI in v1. `isSystem` in listActive.
- D7 Audit: `'contact_type'` added to `ResourceType`; create/update/delete/setDefault audited with ids + changed field
  names only; denials audited. Rate limiting = inherited AUTHENTICATED tier + caps (SEC-19 corrected).
- D8 Join table: tenantId + RLS policy + CASCADE on both composite FKs.
- D9 Web: New keeps its own form but swaps the inline select for the shared `ContactTypeSelect` (`@intelliflow/ui` Select);
  Edit gets it inside `ContactForm`; one new colour module `components/contacts/contact-type-colors.ts` (TagsTab untouched,
  L1); the segment is read via `useSearchParams` inside a Suspense boundary, initial seed then `router.replace`; the type
  filter is exempt from the vanish-reset effect; `isDefaultContactQuery` includes the new fields.
- D10 A11Y-1..12 adopted in full. Lighthouse follows the playbook's attempts; NEEDS_HUMAN with evidence if blocked.
- D11 Declined (L1 minimal change, recorded): adding `contactType` to `ContactCreatedEvent` / a type-changed event —
  no consumer exists; noted in the findings doc.
- D12 The integration suite fails loudly on setup failure; the CONCURRENTLY index in its own beforeAll with check-then-skip and
  `indisvalid AND indisready`; real concurrent seed race; reserved-key 23514; RLS via a non-owner role where available.

## Round 4 — CONSENSUS (`/spec-consensus`, subagent mode; 7 voters launched after 16:15:37Z, all back before 16:16:34Z)

| Agent | Verdict | Non-blocking modifications (adopted as CA-1..CA-7 in the spec) |
|---|---|---|
| backend-architect (6 tool calls) | APPROVED | anchor by symbol; lock-path test; cap VIP names; groupBy count |
| frontend-lead (4) | APPROVED | picker inside ContactForm; submit unchanged stored key; remove contactTypeOther from type + validator; preselect after load if untouched; Suspense test |
| data-engineer (8) | APPROVED | `::text[]` casts + 23514 test; lock note; SQL-only index comment; Prisma 7 syntax; staging first for CONCURRENTLY |
| domain-expert (6) | APPROVED | full fallback list; pin admin roles in a test; setDefault in one tx; event unchanged stated |
| test-engineer (5) | APPROVED | rls-migrations path; SQL colour list test; six seed keys accepted; mock shape; pinned clocks; orphan test; unknown-key render; dist rebuild |
| a11y-expert (7) | APPROVED | chip focus target; contrast test fails run incl. dark; arrow-cycle test; describedby on inactive hint; alert once |
| security-lead (10) | APPROVED | ResourceType entry; correct case-types path (`modules/legal`); account lookup + insert in one tx |

Result: **7/7 APPROVED (100% ≥ 66%)**, no critical unresolved issue → spec status APPROVED.
