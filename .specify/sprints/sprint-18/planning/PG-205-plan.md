# Execution Plan: PG-205 — Module Settings: Contact Types

**Spec:** `.specify/sprints/sprint-18/specifications/PG-205-spec.md` (APPROVED, `/spec-consensus` 7/7 in 1 round) ·
**Sprint:** 18 · **Branch:** `feat/pg-205-contact-types` · **Owner rulings:**
`.specify/sprints/sprint-18/context/PG-205/PG-205-owner-ruling.md` (1-7) · **ADR:** ADR-080 (Proposed → Accepted at
Step 22) · **PRD:** `docs/planning/prd-module-settings.md` (PG-205 Addendum, Draft → In Progress → Delivered)

> **PRISMA MIGRATIONS (L13):** `packages/db/prisma/migrations/20261017120000_contact_types/` and
> `20261017120100_contacts_type_idx/` are additive Class A. The production apply is manual (`prisma migrate deploy`)
> and must happen **before** the API is promoted. Called out in the final report, attestation, PR body and the
> Aurora message.

**Hexagonal layer:** full stack — Domain → Validators → Database → Adapters/Application (type widening only) → API →
UI. **Dependency chain:** `docs/architecture/diagrams/complete-dependency-chains.md` (new "Contact Types (PG-205 —
ADR-080)" section, Step 22). **Prerequisites:** PG-178 ✅, PG-182 ✅ (verified below).

## Runner constraints (apply to every step)

- Node 22: prefix every command with `export PATH=/c/Users/talys/AppData/Roaming/nvm/v22.14.0:$PATH; export
  NODE_OPTIONS=--max-old-space-size=8192;` (host default Node 25 hangs pg writes).
- One test process at a time. Single-file vitest runs may run directly; full package suites, builds and DB tests go
  through `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-205 -- <cmd>`; DB-backed runs add
  `--exclusive intelliflow-db`. Shared :5433 / :6380 containers are never stopped or reset.
- `@intelliflow/web`'s `test` script is watch-mode, so web runs always use `vitest run`.
- `pnpm --filter` always uses `./` paths (a bare name that matches nothing exits 0).
- Never pipe a gate into `tail`/`head`; read logs from files.
- Commits: small and per layer, staged by name, message via `-F`, hooks on, no AI attribution. No secret-shaped
  strings in fixtures (`*.example.invalid`, runtime-built strings).
- Never `.env.local` `DATABASE_URL`/`DIRECT_URL`. Committed `.env.test` targets `localhost:5433/intelliflow_test`.
- Every timestamp written comes from `date -u` at that moment. A RED claim needs a saved failing log.

## Preflight Checks

- [ ] `git branch --show-current` = `feat/pg-205-contact-types`; tree clean except PG-205 files.
- [ ] `docker ps --filter name=postgres-test --format "{{.Status}}"` contains `healthy`.
- [ ] Packages built (`ls packages/{domain,validators,db}/dist`).
- [ ] Exec preflights: `node tools/scripts/exec-preflight/check-plan-reviewer-subagent.mjs PG-205`,
      `node tools/scripts/exec-preflight/check-page-doc-cochange.mjs PG-205`,
      `node tools/scripts/exec-preflight/check-nav-wiring.mjs PG-205`,
      `node tools/scripts/exec-preflight/check-exec-readiness.mjs PG-205` (logs saved under the run's `matop/gates/`).
- [ ] Record the context acknowledgement (files read + SHA-256; CSV EVIDENCE artifact).

**Files to Create:**
- `.specify/sprints/sprint-18/attestations/PG-205/context_ack.json`

- [ ] Coverage BEFORE snapshot via `/exec-coverage` → `artifacts/coverage/PG-205-before.json`.
- [ ] `SELECT DISTINCT "contactType" FROM contacts` on the **local test DB** only (never prod) — records the value set
      the no-backfill design assumes; any value outside the six is reported (unknown keys degrade to a neutral label).

## Dependencies Verified

| Dependency | Claim | Verified | Method |
|---|---|---|---|
| PG-178 | module settings layout + lead settings | TRUE | 4/4 attested artifacts exist on disk |
| PG-182 | contact-settings router registered | TRUE | `apps/api/src/router.ts:146` |
| PG-182 | ContactTag / ContactRequiredField / ContactAutomationSetting | TRUE | `schema.prisma:6115-6170` |
| PG-182 | all 12 automation toggles have a runtime consumer | TRUE | exploration B11 table |

## Implementation Reality Checks

| Surface | Production Consumer | Replaces / Blocks | Verification Command |
|---|---|---|---|
| `contactTypes.list/create/update/delete/setDefault` | `ContactTypesContent` + dialogs | "coming soon" stub `contact-types/page.tsx` | `pnpm --filter ./apps/web exec vitest run "src/app/contacts/(list)/contact-types"` |
| `contactTypes.listActive` | `ContactTypeSelect` (New + Edit), list Type filter, `ContactTypeBadge` | hard-coded `contactTypeOptions` (`new/page.tsx:116-124`) + "Other — please specify" | `pnpm --filter ./apps/web exec vitest run src/components/contacts/__tests__/ContactTypeSelect.test.tsx` |
| `resolveContactCreateDefaults`, `missingTypeRequiredFields` | `contact.create`; `contact.update` on type change | inline required check in `create` | `pnpm --filter ./apps/api exec vitest run src/modules/contact/__tests__/contact.router.contact-types.test.ts` |
| `contactTypeKeySchema` + tenant lookup | `contact.create` / `contact.update` | `z.enum(CONTACT_TYPES)` (`validators/contact.ts:9,44`) | same + `pnpm --filter ./packages/validators test` |
| `contactQuerySchema.contactType` / `segment` | `ContactsPageClient` + sidebar `?segment=` links | dead links (nothing read `segment`) | `pnpm --filter ./apps/web exec vitest run src/lib/contacts/__tests__/contact-search.test.ts` |
| B14 policy-key mapping | `assertRequiredContactFields` callers (create/update) | reading non-existent `jobTitle` (`contact.router.ts:621`) | `pnpm --filter ./apps/api exec vitest run src/modules/contact/__tests__/contact-automation.test.ts` |
| `ensureSystemContactTypes` | `contactTypes.*`, contact create/update type lookup | — | `pnpm --filter ./apps/api exec vitest run src/modules/contact/__tests__/contact-type-resolver.test.ts` + integration race test |

## Estimated Effort

| Phase | Files | Estimate |
|---|---|---|
| RED (tests) | 20 new test files + 8 modified test files | 4-6 h |
| GREEN (implementation) | 13 new source files + 2 migrations + 19 modified source files | 7-10 h |
| REFACTOR + docs/registries | 17 doc/registry/tracking files | 1.5-2.5 h |
| VALIDATION (gates, reviews, STOA, attestation) | — | 2-3 h |
| **Total** | | **14.5-21.5 h** (CSV O/M/P 180/360/540 min; PERT 360 min — the CSV estimate predates the owner rulings that made this full-stack) |

## Files Summary

**Files to Create (38):**

Source (13): `packages/domain/src/crm/contact/contact-type-defaults.ts`; `packages/validators/src/contact-types.ts`;
`apps/api/src/modules/contact/contact-types.router.ts`; `apps/api/src/modules/contact/contact-type-resolver.ts`;
`apps/web/src/app/contacts/(list)/contact-types/ContactTypesContent.tsx`;
`apps/web/src/app/contacts/(list)/contact-types/ContactTypesLoading.tsx`;
`apps/web/src/app/contacts/(list)/contact-types/components/ContactTypeList.tsx`;
`apps/web/src/app/contacts/(list)/contact-types/components/ContactTypeDialog.tsx`;
`apps/web/src/app/contacts/(list)/contact-types/components/DefaultTagPicker.tsx`;
`apps/web/src/app/contacts/(list)/contact-types/components/DeleteContactTypeDialog.tsx`;
`apps/web/src/components/contacts/contact-type-colors.ts`; `apps/web/src/components/contacts/ContactTypeSelect.tsx`;
`apps/web/src/components/contacts/ContactTypeBadge.tsx`.

Migrations (2): `packages/db/prisma/migrations/20261017120000_contact_types/migration.sql`;
`packages/db/prisma/migrations/20261017120100_contacts_type_idx/migration.sql`.

Tests (20): `packages/domain/src/crm/contact/__tests__/contact-type-defaults.test.ts`;
`packages/validators/src/__tests__/contact-types.test.ts`;
`apps/api/src/modules/contact/__tests__/contact-types.router.test.ts`;
`apps/api/src/modules/contact/__tests__/contact-type-resolver.test.ts`;
`apps/api/src/modules/contact/__tests__/contact.router.contact-types.test.ts`; `tests/integration/contact-types.test.ts`;
`apps/web/src/app/contacts/(list)/contact-types/__tests__/page.test.tsx`;
`apps/web/src/app/contacts/(list)/contact-types/__tests__/ContactTypesContent.test.tsx`;
`apps/web/src/app/contacts/(list)/contact-types/__tests__/ContactTypesLoading.test.tsx`;
`apps/web/src/app/contacts/(list)/contact-types/components/__tests__/ContactTypeList.test.tsx`;
`apps/web/src/app/contacts/(list)/contact-types/components/__tests__/ContactTypeDialog.test.tsx`;
`apps/web/src/app/contacts/(list)/contact-types/components/__tests__/DefaultTagPicker.test.tsx`;
`apps/web/src/app/contacts/(list)/contact-types/components/__tests__/DeleteContactTypeDialog.test.tsx`;
`apps/web/src/components/contacts/__tests__/ContactTypeSelect.test.tsx`;
`apps/web/src/components/contacts/__tests__/ContactTypeBadge.test.tsx`;
`apps/web/src/components/contacts/__tests__/contact-type-colors.test.ts`;
`apps/web/src/app/contacts/[id]/edit/__tests__/page.test.tsx`;
`apps/web/src/components/sidebar/__tests__/contacts-config.test.ts`;
`apps/web/src/app/contacts/(list)/__tests__/ContactsPageClient.contact-types.test.tsx`;
`apps/web/src/components/contacts/__tests__/ContactList.contact-types.test.tsx`.

Evidence/docs (3): `.specify/sprints/sprint-18/attestations/PG-205/context_ack.json`;
`.specify/sprints/sprint-18/findings/PG-205-findings.md`; `.specify/sprints/sprint-18/attestations/PG-205/red-green/red-green-index.md`
(+ the per-layer `NN-<layer>.red.log` / `.green.log` files it indexes).

**Files to Modify (44):**

Source (19): `packages/domain/src/crm/contact/Contact.ts`; `packages/domain/src/index.ts`;
`packages/validators/src/contact.ts`; `packages/validators/src/index.ts`; `packages/db/prisma/schema.prisma`;
`packages/db/src/index.ts`; `packages/application/src/services/ContactService.ts`;
`packages/adapters/src/repositories/PrismaContactRepository.ts`; `apps/api/src/router.ts`;
`apps/api/src/modules/contact/contact.router.ts`; `apps/api/src/modules/contact/contact-automation.ts`;
`apps/api/src/security/types.ts`; `apps/web/src/app/contacts/(list)/contact-types/page.tsx`;
`apps/web/src/app/contacts/(list)/new/page.tsx`; `apps/web/src/components/contacts/ContactForm.tsx`;
`apps/web/src/app/contacts/(list)/ContactsPageClient.tsx`; `apps/web/src/lib/contacts/contact-search.ts`;
`apps/web/src/components/contacts/ContactList.tsx`; `apps/web/src/app/contacts/[id]/edit/page.tsx`.

Tests (8): `packages/validators/__tests__/enum-consistency.spec.ts`; `packages/validators/__tests__/contact.test.ts`;
`packages/domain/src/crm/contact/__tests__/Contact.additional.test.ts` (additive key-format cases only; the length-6
assertion at :56-64 is untouched); `apps/api/src/__tests__/app-router.smoke.test.ts`;
`apps/api/src/modules/contact/__tests__/contact-automation.test.ts`;
`apps/web/src/app/contacts/(list)/new/__tests__/page.test.tsx`; `apps/web/src/components/contacts/__tests__/ContactForm.test.tsx`;
`apps/web/src/lib/contacts/__tests__/contact-search.test.ts`.
Existing contact router suites that only need default `contactType` mocks (`contact.router.test.ts`,
`contact.router.coverage.test.ts`, `contact.router.additional.test.ts`, `contact.router.tenant.test.ts`,
`contact.router.security.test.ts`) are touched **only if** they fail for the missing mock; each such edit is listed
in the delivery report.

Docs/registries/tracking (17): `docs/design/ui-flow-mapping.md`; `docs/design/information-architecture.md`;
`docs/design/page-registry.md`; `docs/design/sitemap.md`; `docs/design/PAGE_MAP_AND_FLOWS.md`;
`docs/design/navigation-reachability-audit.md`; `docs/architecture/diagrams/complete-dependency-chains.md`;
`docs/architecture/diagrams/core-crm-dependency-chain.md`;
`docs/planning/prd-module-settings.md`; `docs/architecture/adr/ADR-080-tenant-contact-types.md`;
`docs/architecture/adr/README.md`; `docs/compliance-and-governance/compliance/wcag-conformance-statement.md`;
`apps/project-tracker/docs/metrics/_global/Sprint_plan.csv` (+ regenerated `Sprint_plan_I.csv`);
`artifacts/metrics/debt-ledger.yaml`; `.specify/sprints/sprint-18/attestations/PG-205/task-tracking.json`;
`.specify/sprints/sprint-18/attestations/PG-205/attestation.json`.

**Totals:** create 38 (13 source + 2 migrations + 20 tests + 3 evidence/docs) · modify 44 (19 source + 8 tests +
17 docs/registries/tracking) · conditional: up to 5 existing contact router suites (mock defaults only).

**Evidence outputs (untracked or exec-run artifacts, not counted above):** `artifacts/coverage/PG-205-before.json` /
after snapshot, `red-green/NN-*.red.log` / `.green.log`, `.specify/sprints/sprint-18/execution/PG-205/<run>/`
(`PG-205-delivery.md`, `matop/design-check.md`, `matop/gates/*.log`, `matop/stoa-verdicts/*.json`),
`artifacts/lighthouse/PG-205/*`.

## CSV Alignment (Sprint_plan.csv row PG-205)

| CSV entry | In plan | Action at Step 16 (old → new recorded in the findings doc) |
|---|---|---|
| `ARTIFACT:` `contact-types/page.tsx` | Step 13 (modify) | keep |
| `ARTIFACT:` `ContactTypesContent.tsx` | Step 13 (create) | keep |
| `ARTIFACT:` `contact-types.router.ts` | Step 11 (create) | keep |
| `ARTIFACT:` `packages/validators/src/contact-types.ts` | Step 8 (create) | keep |
| `EVIDENCE:` `context_ack.json` | Preflight (create) | keep |
| `FILE:` `sidebar/configs/contacts.ts` (pre-req) | read only — already links the page; segment hrefs unchanged | keep as pre-req (read) |
| `FILE:` `ContactSettingsContent.tsx` (pre-req) | read only (TagsTab pattern reference; not copied, A8) | keep as pre-req (read) |
| `FILE:` `contact-automation.ts` (pre-req) | Step 12 (modify, B14) | keep |
| `FILE:` `module-settings-playbook.md`, `prd-module-settings.md` (pre-req) | followed / PRD modified Step 16 | keep |
| plan-only artifacts (domain/resolver/migrations/web components) | Steps 7-14 | add as `ARTIFACT:` entries |


## Execution Steps

### Phase 1 — RED: Write Failing Tests

Each RED step: add the minimal export stub first (so the run fails on **assertions**, not missing modules), run the
new test file, save `NN-<layer>.red.log` under `.specify/sprints/sprint-18/attestations/PG-205/red-green/`, commit the
tests. A RED that fails only on import/compile errors does not count. Every test with a date-sensitive assertion pins
the clock (`vi.useFakeTimers()` + `vi.setSystemTime`) around the call (CA-6).

#### Step 1: Domain tests (AC-CTY-006, AC-CTY-009, AC-CTY-010, AC-CTY-012; CA-3)

**Files to Create:**
- `packages/domain/src/crm/contact/__tests__/contact-type-defaults.test.ts`

**Files to Modify:**
- `packages/domain/src/crm/contact/__tests__/Contact.additional.test.ts` (key-format invariant cases only)

- [ ] precedence: explicit status/department beat type defaults; type beats none.
- [ ] owner: CREATOR → creator; ACCOUNT_OWNER with valid owner → owner; no account / no owner / invalid owner →
      creator with `ownerSource` recording the reason.
- [ ] tags: input ∪ type tags, case-insensitive dedup keeps the first spelling, capped at 20.
- [ ] `missingTypeRequiredFields` over real columns (`phone, company, title, department, accountId`); blanks count as missing.
- [ ] `CONTACT_POLICY_FIELD_TO_COLUMN.jobTitle === 'title'` (B14).
- [ ] `generateContactTypeKey`: slug, never one of the six reserved keys (`customer` → `customer_2`), suffixes on
      collision, empty slug → `type`, ≤ 40 chars, matches `CONTACT_TYPE_KEY_PATTERN`.
- [ ] `CONTACT_TYPE_ADMIN_ROLES` pinned to `['ADMIN','MANAGER','OWNER','SUPER_ADMIN']`; `isContactTypeAdminRole`
      false for USER/undefined.
- [ ] resolver output keys == allowlist (no tenantId/email/dataClassification).
- [ ] `Contact` rejects a malformed `contactType`; still accepts all six seed keys.
- Validation: `pnpm --filter ./packages/domain exec vitest run src/crm/contact/__tests__/contact-type-defaults.test.ts src/crm/contact/__tests__/Contact.additional.test.ts` → RED log `01-domain.red.log`.

#### Step 2: Validator tests (AC-CTY-004, AC-CTY-005, AC-CTY-009; DoD 7; CA-6)

**Files to Create:**
- `packages/validators/src/__tests__/contact-types.test.ts`

**Files to Modify:**
- `packages/validators/__tests__/enum-consistency.spec.ts` (new block)
- `packages/validators/__tests__/contact.test.ts` (key-format cases; existing six-value fixtures kept)

- [ ] create/update schemas: name trim 1-50, colour ∈ 18 tokens, owner enum, `requiredFields` ⊆ real columns (rejects
      `jobTitle`), ≤ 10 deduped `defaultTagIds`, update requires `id` + `isActive`; `.strict()` rejects `key`,
      `isSystem`, `tenantId`, raw `ownerId` (it.each table).
- [ ] `contactTypeNameSchema(existing, excludeId)` superRefine flags case-insensitive duplicates;
      `findDuplicateContactTypeName` excludes the edited row.
- [ ] `contactTypeKeySchema` accepts the six seeds and `customer_2`; rejects uppercase, leading digit, 41 chars, spaces.
- [ ] `contactQuerySchema` accepts `contactType` and `segment: 'vip'`; rejects other segments.
- [ ] enum-consistency: contact-type colour tokens == `TAG_COLOR_TOKENS`; validator required keys == domain constant.
- Validation: `pnpm --filter ./packages/validators exec vitest run src/__tests__/contact-types.test.ts __tests__/enum-consistency.spec.ts __tests__/contact.test.ts` → `02-validators.red.log`.

#### Step 3: Resolver + router tests (AC-CTY-002, -003, -004, -007, -008, -015, -016; SEC-1..3, 9-18, 21; CA-1, CA-7)

**Files to Create:**
- `apps/api/src/modules/contact/__tests__/contact-type-resolver.test.ts`
- `apps/api/src/modules/contact/__tests__/contact-types.router.test.ts`

**Files to Modify:**
- `apps/api/src/__tests__/app-router.smoke.test.ts` (twin of the `caseTypes` block at :177-186, six procedures)

- [ ] resolver: fast path (six present) never takes the lock; missing rows → `$executeRaw` lock (tagged template, key
      built in JS) + `createMany` of only the missing keys, no `skipDuplicates`; P2002 → re-read; other errors abort.
- [ ] resolver: `loadContactTypeByKey` scopes by `tenantId`; `activeOnly` excludes inactive; `resolveDefaultTagNames`
      returns only active same-tenant tag names.
- [ ] router: unauthenticated rejected; USER FORBIDDEN on create/update/delete/setDefault with no write and
      `$transaction` not called (table); MANAGER allowed; missing role fails closed; denial audited.
- [ ] FOREIGN id → NOT_FOUND with `where {id: FOREIGN, tenantId}` on update/delete/setDefault.
- [ ] smuggled `tenantId`/`key`/`isSystem` rejected by `.strict()`; created row's `tenantId` = session tenant.
- [ ] foreign or inactive default tag → one BAD_REQUEST; 11th tag rejected; 51st type rejected (cap counted under lock).
- [ ] P2002 → fixed CONFLICT message without input echo; unknown errors rethrown.
- [ ] delete refuses system ("deactivate instead"), default, and in-use (count by key + tenantId) types; count + delete
      in one `$transaction`; unused custom type deleted.
- [ ] update cannot deactivate the default; replaces default-tag rows in the same transaction; key never changes.
- [ ] setDefault: target must be active; clear then set in one `$transaction`; `id: null` clears.
- [ ] list: ordered `sortOrder, name`; `defaultTags {id,name}`; `contactCount` from one `groupBy` with tenantId; `canEdit`.
- [ ] audit payloads carry ids + changed field names only (no names of tags, no PII).
- [ ] smoke: `contactTypes` registered with `list, listActive, create, update, delete, setDefault`.
- Validation: `pnpm --filter ./apps/api exec vitest run src/modules/contact/__tests__/contact-type-resolver.test.ts src/modules/contact/__tests__/contact-types.router.test.ts src/__tests__/app-router.smoke.test.ts` → `03-api-router.red.log`.

#### Step 4: Contact create/update/list wiring tests (AC-CTY-010..-012, -014, -015; SEC-4..8; CA-3)

**Files to Create:**
- `apps/api/src/modules/contact/__tests__/contact.router.contact-types.test.ts`

**Files to Modify:**
- `apps/api/src/modules/contact/__tests__/contact-automation.test.ts` (B14 cases)

- [ ] create with an active key applies default status/department/tags; explicit input wins.
- [ ] unknown, foreign and inactive keys → identical `BAD_REQUEST "Invalid contact type"`; `createContact` and quota
      side effects not reached.
- [ ] ACCOUNT_OWNER: same-tenant account owner passing `tenantUserWhere` → owner; foreign account / owner failing the
      check → creator; `account.findFirst` asserted with `tenantId`; fallback recorded in audit metadata only.
- [ ] required = tenant-wide ∪ type, checked after defaults; missing → BAD_REQUEST.
- [ ] B14: tenant `jobTitle` rule checks `title` on create (missing → fails; present → passes) and on update (explicit clear fails).
- [ ] update: unchanged stored inactive key accepted; new inactive/foreign key rejected; type change checks the new
      type's required fields against stored row + input; defaults not re-applied.
- [ ] all six seed keys accepted on create/update.
- [ ] list: `contactType` filter and `segment: 'vip'` (ContactTag names matching `vip` case-insensitively ∪ `'vip'`,
      capped at 20) → `tags.hasSome`; `tenantId` always in `where`.
- [ ] input `ownerId`/`tenantId`/`dataClassification` never honoured.
- [ ] contact CREATE audit `afterState` contains `contactType`, `appliedDefaults` (field names only) and `ownerFallback`;
      no default values or PII (AC-CTY-016).
- [ ] the ACCOUNT_OWNER account lookup and the contact insert run inside one `$transaction` (SEC-6 / CA-7): assert both
      calls go through the transaction client.
- [ ] SEC-19: no dedicated limiter is added; a test asserts the new procedures are plain `tenantProcedure` (inherited
      AUTHENTICATED tier) and the caps (50 types, 10 tags) are enforced.
- Validation: `pnpm --filter ./apps/api exec vitest run src/modules/contact/__tests__/contact.router.contact-types.test.ts src/modules/contact/__tests__/contact-automation.test.ts` → `04-api-contact.red.log`.

#### Step 5: DB integration test (AC-CTY-002, -004..-008, -015; SEC-18, SEC-21; CA-4, CA-6, D12)

**Files to Create:**
- `tests/integration/contact-types.test.ts` (template `tests/integration/case-types.test.ts`, index handling from
  `tests/integration/approval-policies.test.ts:83`)

- [ ] `ensureMigrationSql()` replays `20261017120000` when its CHECK is absent; index migration in its own `beforeAll`
      as one `$executeRawUnsafe` statement outside any transaction, skipped if a valid index already exists.
- [ ] setup failure **throws** (no silent `ctx.skip()`); only a missing `DATABASE_URL` may skip, and pre-ship always has it.
- [ ] CHECKs reject: bad key, padded name, unknown colour, bad `defaultOwner`, `requiredFields` with `email`
      (23514), negative sortOrder, inactive default, custom row with key `partner` (23514).
- [ ] migration colour list == `contact_tags_colorToken_check` list (read from `pg_constraint`).
- [ ] `(tenantId,key)` and `(tenantId, lower(name))` unique per tenant; the same in another tenant succeeds; second
      default rejected.
- [ ] default tag of tenant B on a type of tenant A rejected by the composite FK; deleting a ContactTag removes its
      default-tag rows (and the tag delete succeeds); deleting a tenant cascades.
- [ ] RLS enabled + `_tenant_isolation` policies present on both tables; isolation via a non-owner role when the
      `authenticated` role exists (else that one assertion is disclosed as skipped, as PG-204).
- [ ] two concurrent `ensureSystemContactTypes` on a fresh tenant → exactly six rows.
- [ ] `contacts_tenantId_contactType_idx`: `indisvalid AND indisready`, columns `(tenantId, contactType)`.
- [ ] orphan outcome: deleting an unused type while a contact is created with that key in another transaction —
      the outcome (orphan key tolerated) is asserted and documented.
- Validation: `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-205-int --exclusive intelliflow-db -- pnpm exec vitest run --project integration tests/integration/contact-types.test.ts` → `05-db.red.log`.

#### Step 6: Web tests (AC-CTY-001, -003, -013, -014, -017; A11Y-1..12; CA-2, CA-5)

**Files to Create:**
- `apps/web/src/app/contacts/(list)/contact-types/__tests__/page.test.tsx`
- `apps/web/src/app/contacts/(list)/contact-types/__tests__/ContactTypesContent.test.tsx`
- `apps/web/src/app/contacts/(list)/contact-types/__tests__/ContactTypesLoading.test.tsx`
- `apps/web/src/app/contacts/(list)/contact-types/components/__tests__/ContactTypeList.test.tsx`
- `apps/web/src/app/contacts/(list)/contact-types/components/__tests__/ContactTypeDialog.test.tsx`
- `apps/web/src/app/contacts/(list)/contact-types/components/__tests__/DefaultTagPicker.test.tsx`
- `apps/web/src/app/contacts/(list)/contact-types/components/__tests__/DeleteContactTypeDialog.test.tsx`
- `apps/web/src/components/contacts/__tests__/ContactTypeSelect.test.tsx`
- `apps/web/src/components/contacts/__tests__/ContactTypeBadge.test.tsx`
- `apps/web/src/components/contacts/__tests__/contact-type-colors.test.ts`
- `apps/web/src/app/contacts/[id]/edit/__tests__/page.test.tsx`
- `apps/web/src/components/sidebar/__tests__/contacts-config.test.ts`
- `apps/web/src/app/contacts/(list)/__tests__/ContactsPageClient.contact-types.test.tsx`
- `apps/web/src/components/contacts/__tests__/ContactList.contact-types.test.tsx`
- `.specify/sprints/sprint-18/attestations/PG-205/red-green/red-green-index.md` (one row per layer: commit SHA,
  command, exit code, log path for RED and GREEN; written as each RED/GREEN log is saved)

**Files to Modify:**
- `apps/web/src/app/contacts/(list)/new/__tests__/page.test.tsx` (mock `contactTypes.listActive`; delete the two
  "Other" tests at :218 and :273-284 — feature removed by ruling 6, recorded in the delivery report; add picker tests)
- `apps/web/src/components/contacts/__tests__/ContactForm.test.tsx` (trpc mock for the picker)
- `apps/web/src/lib/contacts/__tests__/contact-search.test.ts` (filter fields, `isDefaultContactQuery`, `segmentToFilter`)

- [ ] page: no "coming soon"; Suspense skeleton has the bento grid.
- [ ] Content: loading, error + Retry, breadcrumbs, `lg:grid-cols-12`, read-only note for USER, default RadioGroup,
      CONFLICT shown inside the dialog with focus on name, `contactTypes` invalidated after each mutation, live output
      silent on mount, axe (color-contrast off) on page/dialog/delete/empty.
- [ ] List: EmptyState `entity="contacts" phase="passive"`, no extra tab stop; rows show text badges (Default,
      Inactive, System) and "N contacts"; Delete `aria-disabled` + focusable + visible reason for system/default/in-use;
      `openCreate` via ref; focus returns to the trigger; after delete focus goes to "New Contact Type".
- [ ] Dialog: 18 labelled radios in fieldset/legend; arrows cycle all 18 in DOM order; checked glyph; required-field
      checkboxes; owner RadioGroup; status Select; department; key read-only on edit; dirty fingerprint; Save disabled
      when clean; errors `role=alert` + `aria-invalid`; error text classes `text-red-700 dark:text-red-300`.
- [ ] DefaultTagPicker: checkboxes in fieldset/legend; at 10 the rest are `aria-disabled`, focusable, hint linked,
      live message; inactive tags not offered.
- [ ] Delete dialog: AlertDialog focuses Cancel; server error stays inside.
- [ ] colours: every token maps to fixed classes; unknown → slate; **contrast test fails the run** if ring vs card <
      3:1 or badge text < 4.5:1 in light or dark.
- [ ] Badge: text always rendered, dot `aria-hidden`; unknown key → neutral label.
- [ ] Select: visible label; "No type"; stored inactive key shown "Name (inactive)" with `aria-describedby` hint; deleted
      key shown "<key> (inactive)"; fetch error = one `role=alert` + retry, submit stays enabled; default preselected on
      New only after load and only if untouched.
- [ ] New page: picker replaces the inline select; no "Please specify" field; payload sends the key.
- [ ] Edit page (new test): picker in `ContactForm`; unchanged inactive key submitted as is.
- [ ] list: Type filter; `?segment=partners|vendors` → type filter; `?segment=vip` → removable chip
      "Remove filter: VIP" (focus to next chip else Type filter trigger; polite announcement); type filter not reset when
      its option is inactive; filter change `router.replace`s the URL; `useSearchParams` inside a Suspense boundary.
- [ ] ContactList: badge per card; unknown key neutral label.
- [ ] NF-002: `contactTypes.listActive` is queried with `staleTime: 5 * 60 * 1000` (asserted on the mocked `useQuery`
      options in `ContactTypeSelect.test.tsx`), and a settings mutation calls `utils.contactTypes.invalidate()`
      (asserted in `ContactTypesContent.test.tsx`).
- [ ] A11Y-9: invalid dialog fields carry `aria-invalid` + `aria-describedby` → the error text id; on submit with errors
      focus moves to the first invalid field.
- [ ] A11Y-11: the settings page renders exactly one `h1` and section headings are `h2` (no skipped level); the empty
      state adds no extra tab stop.
- [ ] wiring: `ContactTypeDialog` renders `DefaultTagPicker`; `ContactList` renders `ContactTypeBadge`; the
      `ContactsPageClient` Type filter options come from `contactTypes.listActive`.
- [ ] sidebar config: segment hrefs unchanged and mapped by `segmentToFilter`.
- Validation: `pnpm --filter ./apps/web exec vitest run "src/app/contacts/(list)/contact-types" src/components/contacts/__tests__/ContactTypeSelect.test.tsx src/components/contacts/__tests__/ContactTypeBadge.test.tsx src/components/contacts/__tests__/contact-type-colors.test.ts "src/app/contacts/[id]/edit" src/components/sidebar/__tests__/contacts-config.test.ts "src/app/contacts/(list)/__tests__/ContactsPageClient.contact-types.test.tsx" src/components/contacts/__tests__/ContactList.contact-types.test.tsx "src/app/contacts/(list)/new/__tests__/page.test.tsx" src/components/contacts/__tests__/ContactForm.test.tsx src/lib/contacts/__tests__/contact-search.test.ts` → `06-web.red.log`.

### Phase 2 — GREEN: Make Tests Pass (layer order: domain → validators → db → adapters/application → api → web)

#### Step 7: Domain

**Files to Create:**
- `packages/domain/src/crm/contact/contact-type-defaults.ts`

**Files to Modify:**
- `packages/domain/src/crm/contact/Contact.ts` (`ContactType` → `ContactTypeKey = string` at :39,:89,:115,:337,:386;
  key-format invariant; `CONTACT_TYPES` unchanged)
- `packages/domain/src/index.ts` (export the new module)

- [ ] Step 1 tests GREEN → `07-domain.green.log`; `pnpm --filter ./packages/domain test` (full) and
      `pnpm --filter ./packages/domain build` (dist rebuild before downstream packages).

#### Step 8: Validators

**Files to Create:**
- `packages/validators/src/contact-types.ts`

**Files to Modify:**
- `packages/validators/src/contact.ts` (:9/:44 → `contactTypeKeySchema.optional()`; `contactQuerySchema` gains
  `contactType`, `segment`; `ContactType` type export renamed in line with D1)
- `packages/validators/src/index.ts` (export `contact-types`)

- [ ] Step 2 tests GREEN → `08-validators.green.log`; `pnpm --filter ./packages/validators test`;
      `pnpm --filter ./packages/validators build`.

#### Step 9: Prisma schema + migrations (Class A, L13)

**Files to Create:**
- `packages/db/prisma/migrations/20261017120000_contact_types/migration.sql`
- `packages/db/prisma/migrations/20261017120100_contacts_type_idx/migration.sql`

**Files to Modify:**
- `packages/db/prisma/schema.prisma` (`ContactType`, `ContactTypeDefaultTag`, `ContactTag @@unique([tenantId,id])` +
  back-relation, `Contact @@index([tenantId, contactType])`, Tenant `contactTypes … @ignore`, SQL-only objects comment)
- `packages/db/src/index.ts` (export `ContactType`, `ContactTypeDefaultTag`)

- [ ] Header: Class A, additive, `contacts` untouched, brief `contact_tags` lock note, forward-only recovery, prod only
      via `prisma migrate deploy`; CHECKs with `::text[]` casts.
- [ ] `pnpm --filter ./packages/db exec prisma validate`; `pnpm --filter ./packages/db db:generate`.
- [ ] Apply to the **local test DB** through the guard (`guard-db-target`, :5433 only) with `prisma migrate deploy`;
      `prisma migrate diff` shows no unexpected drift (SQL-only objects documented).
- [ ] `pnpm --filter ./packages/db test` (incl. `src/__tests__/rls-migrations.test.ts`); `pnpm --filter ./packages/db build`.
- [ ] Step 5 integration test GREEN → `09-db.green.log` (slot + `--exclusive intelliflow-db`).

#### Step 10: Application + adapters (type widening only)

**Files to Modify:**
- `packages/application/src/services/ContactService.ts` (:7, :134 `ContactTypeKey`)
- `packages/adapters/src/repositories/PrismaContactRepository.ts` (:8; remove the `as ContactType` casts at :114, :199, :245)

- [ ] `pnpm --filter ./packages/application test`; `pnpm --filter ./packages/adapters test`; typecheck both.

#### Step 11: Contact-types router, resolver, registration, audit type

**Files to Create:**
- `apps/api/src/modules/contact/contact-type-resolver.ts`
- `apps/api/src/modules/contact/contact-types.router.ts`

**Files to Modify:**
- `apps/api/src/router.ts` (`contactTypes: contactTypesRouter` next to `contactSettings`, :146)
- `apps/api/src/security/types.ts` (`| 'contact_type'` after `report_schedule`, :104, PG-201-style comment)
- `docs/design/ui-flow-mapping.md`, `docs/design/information-architecture.md` (router +1, procedures +6 — **same
  commit** as the `router.ts` registration so the reconciliation tests stay green)

- [ ] Step 3 tests GREEN → `11-api-router.green.log`; explicit `.output()` schemas (no casts, TS2589 rule).

#### Step 12: Contact create/update/list wiring + B14 (replaces the fixed enum and inline check)

**Files to Modify:**
- `apps/api/src/modules/contact/contact.router.ts` (anchored by symbol: `create`, `update`, `list`,
  `buildContactListWhere`, the `assertRequiredContactFields` calls)
- `apps/api/src/modules/contact/contact-automation.ts` (B14 policy-key → column mapping)

- [ ] Step 4 tests GREEN → `12-api-contact.green.log`.
- [ ] `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-205 -- pnpm --filter ./apps/api test` (full suite);
      existing suites that fail only for a missing `contactType` mock get the mock default (listed in the delivery report).
- [ ] `pnpm --filter ./apps/api typecheck`.

#### Step 13: Contact Types settings page (replaces the stub)

**Files to Create:**
- `apps/web/src/app/contacts/(list)/contact-types/ContactTypesContent.tsx`
- `apps/web/src/app/contacts/(list)/contact-types/ContactTypesLoading.tsx`
- `apps/web/src/app/contacts/(list)/contact-types/components/ContactTypeList.tsx`
- `apps/web/src/app/contacts/(list)/contact-types/components/ContactTypeDialog.tsx`
- `apps/web/src/app/contacts/(list)/contact-types/components/DefaultTagPicker.tsx`
- `apps/web/src/app/contacts/(list)/contact-types/components/DeleteContactTypeDialog.tsx`
- `apps/web/src/components/contacts/contact-type-colors.ts`
- `apps/web/src/components/contacts/ContactTypeBadge.tsx`

**Files to Modify:**
- `apps/web/src/app/contacts/(list)/contact-types/page.tsx` (stub → server Suspense shell)

- [ ] Use `/frontend-design` guidance; Material Symbols only; playbook §1-§4 (PageHeader, bento, EmptyState passive,
      CTAs, forwardRef); shared `apps/web/src/components/shared/section-header.tsx` (not the territory-local copy);
      no TagsTab copy (A8). If a new glyph is added (e.g. the checked-swatch `check`), run
      `node tools/scripts/subset-material-symbols.mjs --verify`.
- [ ] Reuse (W2/W3): `contact-type-colors.ts` **imports** `swatchClass` / `toColorToken` / `COLOR_SWATCH_CLASSES` from
      `apps/web/src/lib/color-tokens.ts` (the shared 18-token map, PG-197/PG-198) and only adds the outline ring,
      text labels and badge (`-200`/`-900`) classes — no second swatch map. `ContactTypeBadge` composes the
      `@intelliflow/ui` `Badge`. `DefaultTagPicker` is NEW (verified): an inline capped checkbox fieldset; the
      popover-based `accounts/(list)/territory-mapping/components/MemberMultiSelect.tsx` selects users, not tags, and
      has no cap semantics. `ContactTypeList` / `DeleteContactTypeDialog` / `ContactTypesLoading` follow the PG-204
      case-types pattern module-locally (different payload; cross-module imports avoided) — recorded as accepted
      near-duplication in the findings doc.
- [ ] Wiring: `ContactTypeDialog` renders `DefaultTagPicker`; `ContactTypeList`, `ContactTypeDialog` and
      `ContactTypeBadge` import `contact-type-colors`; `ContactTypesContent` invalidates `contactTypes` after every mutation.
- [ ] A11Y-9 / A11Y-11 implemented (describedby + focus-first-invalid; one h1, h2 sections).
- [ ] Step 6 settings-page tests GREEN.

#### Step 14: Picker, list filter, badge, segments (retires the hard-coded options and "Other")

**Files to Create:**
- `apps/web/src/components/contacts/ContactTypeSelect.tsx`

**Files to Modify:**
- `apps/web/src/app/contacts/(list)/new/page.tsx` (remove `contactTypeOptions` :116-124, `contactTypeOther` in
  `ContactFormData`/defaults/`validateAdditionalStep` and its caller, the "Please specify" input, the `'other'` mapping
  :270-279; render `ContactTypeSelect`)
- `apps/web/src/components/contacts/ContactForm.tsx` (render `ContactTypeSelect`)
- `apps/web/src/app/contacts/[id]/edit/page.tsx` (keeps sending the stored key unchanged)
- `apps/web/src/app/contacts/(list)/ContactsPageClient.tsx`, `apps/web/src/lib/contacts/contact-search.ts`,
  `apps/web/src/components/contacts/ContactList.tsx`

- [ ] Wiring: `ContactList` renders `ContactTypeBadge`; `ContactsPageClient` builds the Type filter from
      `contactTypes.listActive`; New and Edit render `ContactTypeSelect`.
- [ ] NF-002: `listActive` queried with `staleTime: 5 * 60 * 1000`.
- [ ] Step 6 remaining tests GREEN → `14-web.green.log`.
- [ ] `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-205 -- pnpm --filter ./apps/web exec vitest run` (full web suite).
- [ ] `pnpm --filter ./apps/web typecheck`.

### Phase 3 — REFACTOR: cleanup, docs, tracking

#### Step 15: Refactor pass

**Files to Modify:**
- none beyond the files already created/modified in Steps 7-14 (no behaviour change; any touched file is listed in the
  delivery report)

- [ ] duplication check (`/simplify`-style review), lint all touched packages, tests still green.

#### Step 16: Docs, registries, ADR/PRD

**Files to Modify:**
- `docs/design/page-registry.md` (new `/contacts/contact-types` entry; `/contacts/new` API/test rows)
- `docs/design/sitemap.md` (line 137) and `docs/design/PAGE_MAP_AND_FLOWS.md` (line 170): descriptions
- `docs/design/navigation-reachability-audit.md` (line 258): `SB | IP`, "Contacts sidebar; Contact Settings panel (PG-205)"
- `docs/architecture/diagrams/complete-dependency-chains.md` (new PG-205 section)
- `docs/architecture/diagrams/core-crm-dependency-chain.md` (Contact row/settings layer: PG-205 contact types)
- `docs/planning/prd-module-settings.md` (PG-205 Addendum: status In Progress, AC-CTY summary, boolean toggles table,
  delivery status)
- `docs/architecture/adr/ADR-080-tenant-contact-types.md` + `docs/architecture/adr/README.md` (status text prepared;
  flipped to Accepted in Step 22 once Step 19 validations pass)
- `docs/compliance-and-governance/compliance/wcag-conformance-statement.md` (version row)
- `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv` (row correction, Category A: KPI note, DoD taxonomy
  wording → owner ruling, artifacts list extended; old → new recorded in the findings doc) + `npx tsx tools/scripts/split-sprint-plan.ts`

- [ ] `pnpm --filter ./apps/web exec vitest run src/app/__tests__/ia-reconciliation.test.ts src/app/__tests__/ui-flow-mapping-reconciliation.test.ts src/app/__tests__/sitemap-reconciliation.test.ts`.
- [ ] `node tools/scripts/exec-preflight/check-page-doc-cochange.mjs PG-205`; `node tools/scripts/exec-preflight/check-nav-wiring.mjs PG-205`
      (known false-green on `(list)` route-group pages, #877 — the log also records the manual reachability evidence:
      `sidebar/configs/contacts.ts:12-17`, `ContactSettingsPanel.tsx:16-22`, audit row updated).

#### Step 17: Red-flag / out-of-scope tracking (all three surfaces)

**Files to Create:**
- `.specify/sprints/sprint-18/findings/PG-205-findings.md`

**Files to Modify:**
- `artifacts/metrics/debt-ledger.yaml`

- [ ] One gh issue (file:line + proposed fix): contact-settings router has no role gate (`contact-settings.router.ts`);
      tag `update` spreads input (:224-230); bulk lead conversion `skipDuplicates` (`lead.router.ts:1584`);
      `ContactService.ts:92` echoes the account id. Same items in the debt ledger and findings doc.
- [ ] Findings doc also records: declined event payload (D11), lead conversion untyped, VIP spelling caveat, CSV
      corrections, Lighthouse status.

### Phase 4 — VALIDATION

#### Step 18: Design check

**Files to Modify:**
- none (writes the untracked evidence file `matop/design-check.md` in the exec run directory)

- [ ] No DESIGN mockup exists for this row (Sprint_plan_I.csv: no `DESIGN:` entry); compare against
      `docs/design/mockups/create-new-contact.html` (picker placement), `contact-list.html` (badge/filter) and the PG-204
      page; record in `matop/design-check.md`.

#### Step 19: Full validations (4 mandatory, every touched package)

**Files to Modify:**
- none (logs under the exec run's `matop/gates/`)

- [ ] NF checks: NF-001 (Step 3 fast-path test: no lock when six rows exist; one indexed type lookup per create),
      NF-002 (Step 6 `staleTime` + invalidation test), NF-003 (web build graph: no server-only imports in the new
      components, web build passes), NF-004 (coverage below).
- [ ] TypeScript: `pnpm --filter ./packages/domain typecheck`, `./packages/validators`, `./packages/db`,
      `./packages/application`, `./packages/adapters`, `./apps/api`, `./apps/web`.
- [ ] Tests: full suite per touched package through the slot (domain, validators, db, application, adapters, api, web
      with `vitest run`), plus the integration project via slot + `--exclusive intelliflow-db`, plus
      `pnpm exec vitest run tools/scripts/route-total-consistency.test.ts tools/scripts/__tests__/docs-integrity-audit.test.ts`.
- [ ] Lint: `pnpm --filter <each touched pkg> lint`.
- [ ] Build: `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-205-build -- pnpm --filter ./apps/web build`
      and `pnpm turbo build --filter='./packages/*'`.
- [ ] knip on touched packages (no unused exports/files from this task).
- [ ] `/exec-coverage` AFTER; changed-line coverage ≥ 80%; domain > 95%.

#### Step 20: Reviews

**Files to Modify:**
- only files a review finding requires (each listed in the delivery report)

- [ ] `/code-review` on the diff; `/sonarqube-fix` for any new finding.
- [ ] a11y-expert (WCAG 2.1 AA) review sub-agent on the shipped UI + computed contrast review for the 18 tokens.
- [ ] `node scripts/codex-review.mjs` iterated until clean (fallback reviews block the same way; waivers only with evidence).

#### Step 21: Lighthouse (DoD 12)

**Files to Modify:**
- none (reports or attempt logs under `artifacts/lighthouse/PG-205/`)

- [ ] Follow `docs/claude-refs/lighthouse-playbook.md` for `/contacts/contact-types` (auth path
      `pnpm --filter @intelliflow/web lighthouse:auth` with `LHCI_URLS` / `LHCI_OUTPUT_DIR=./artifacts/lighthouse/PG-205`).
      If no non-production credentials exist, record NEEDS_HUMAN with the attempt logs (`artifacts/lighthouse/PG-205/`), never a score.

#### Step 22: Dependency chain + PRD/ADR finalisation

**Files to Modify:**
- `docs/architecture/diagrams/complete-dependency-chains.md`
- `docs/architecture/diagrams/core-crm-dependency-chain.md`
- `docs/planning/prd-module-settings.md`
- `docs/architecture/adr/ADR-080-tenant-contact-types.md`
- `docs/architecture/adr/README.md`

- [ ] Chain sections marked delivered; PRD addendum delivery-status table; ADR-080 → Accepted (README row too).
- [ ] L13 stated in ADR-080 (consequences: both migrations applied to production before the API is promoted).

#### Step 23: MATOP (STOA sub-agents) + compliance

**Files to Modify:**
- none (verdict files written by the STOA sub-agents under `matop/stoa-verdicts/`)

- [ ] `/exec-gates`, then spawned STOA sub-agents: Foundation (row), Domain, Security, Quality — each writes its own
      verdict file; `/compliance-check PG-205`.

#### Step 24: Attestation + tracking

**Files to Modify:**
- `.specify/sprints/sprint-18/attestations/PG-205/attestation.json`
- `.specify/sprints/sprint-18/attestations/PG-205/task-tracking.json`

- [ ] `/exec-attestation` (every gate PASS or NEEDS_HUMAN with reason); `/exec-metrics` session end;
      `npx tsx apps/project-tracker/scripts/generate-context.ts`.
- [ ] L13 present in: the attestation (`notes` / migration entry), the PR body (loud section), the Aurora READY
      message, and ADR-080 (Step 22).

## Validation Matrix

| Scope | Purpose | Command |
|---|---|---|
| Domain new + touched | resolver, constants, entity invariant | `pnpm --filter ./packages/domain exec vitest run src/crm/contact/__tests__/contact-type-defaults.test.ts src/crm/contact/__tests__/Contact.additional.test.ts` |
| Domain full | regression | `pnpm --filter ./packages/domain test` |
| Validators new + touched | schemas, enum consistency, contact keys | `pnpm --filter ./packages/validators exec vitest run src/__tests__/contact-types.test.ts __tests__/enum-consistency.spec.ts __tests__/contact.test.ts` |
| Validators full | regression | `pnpm --filter ./packages/validators test` |
| DB | schema + RLS coverage | `pnpm --filter ./packages/db exec prisma validate`; `pnpm --filter ./packages/db test` |
| Integration | real constraints, RLS, race, index | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-205-int --exclusive intelliflow-db -- pnpm exec vitest run --project integration tests/integration/contact-types.test.ts` |
| Application/adapters | widening regression | `pnpm --filter ./packages/application test`; `pnpm --filter ./packages/adapters test` |
| API new | router, resolver, wiring, B14, smoke | `pnpm --filter ./apps/api exec vitest run src/modules/contact/__tests__/contact-types.router.test.ts src/modules/contact/__tests__/contact-type-resolver.test.ts src/modules/contact/__tests__/contact.router.contact-types.test.ts src/modules/contact/__tests__/contact-automation.test.ts src/__tests__/app-router.smoke.test.ts` |
| API touched existing | contact regressions, contract | `pnpm --filter ./apps/api exec vitest run src/modules/contact/__tests__ src/__tests__/contract/contact.contract.test.ts` |
| API full | regression | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-205 -- pnpm --filter ./apps/api test` |
| Web new + touched | settings page, picker, list, segments, a11y | Step 6 command |
| Web registries | counts | `pnpm --filter ./apps/web exec vitest run src/app/__tests__/ia-reconciliation.test.ts src/app/__tests__/ui-flow-mapping-reconciliation.test.ts src/app/__tests__/sitemap-reconciliation.test.ts` |
| Web full | regression | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-205 -- pnpm --filter ./apps/web exec vitest run` |
| Tools | route/doc integrity | `pnpm exec vitest run tools/scripts/route-total-consistency.test.ts tools/scripts/__tests__/docs-integrity-audit.test.ts` |
| Typecheck | all touched | `pnpm --filter ./packages/domain typecheck` … `pnpm --filter ./apps/web typecheck` (7 packages) |
| Lint | all touched | `pnpm --filter <pkg> lint` (7 packages) |
| Build | web + packages | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-205-build -- pnpm --filter ./apps/web build`; `pnpm turbo build --filter='./packages/*'` |
| Semantic review | codex gate | `node scripts/codex-review.mjs` |
| Pre-ship (runner, once at final SHA) | full gate | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-205 --exclusive intelliflow-pre-ship -- node scripts/pre-ship.mjs` |

## Integration Checkpoints Summary

| After Step | Verification | Command |
|---|---|---|
| 6 | all RED logs saved, failures are assertions | `ls .specify/sprints/sprint-18/attestations/PG-205/red-green/` + `red-green-index.md` |
| 7-8 | domain + validators green, dist rebuilt | `pnpm --filter ./packages/domain test && pnpm --filter ./packages/domain build && pnpm --filter ./packages/validators test && pnpm --filter ./packages/validators build` |
| 9 | migrations valid, applied to local test DB, integration green | `pnpm --filter ./packages/db exec prisma validate`; `pnpm --filter ./packages/db test`; integration command (matrix) |
| 10 | widening compiles | `pnpm --filter ./packages/application test && pnpm --filter ./packages/adapters test && pnpm --filter ./packages/adapters typecheck` |
| 11-12 | API green, counts reconciled | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-205 -- pnpm --filter ./apps/api test`; web registry command (matrix) |
| 13-14 | web green | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-205 -- pnpm --filter ./apps/web exec vitest run`; `pnpm --filter ./apps/web typecheck` |
| 16 | docs co-change | `check-page-doc-cochange.mjs`, `check-nav-wiring.mjs` |
| 19 | 4 mandatory validations | matrix above |

## Acceptance Criteria Traceability

| AC / NF | Plan steps (test → implementation) |
|---|---|
| AC-CTY-001 playbook page | 6 → 13 |
| AC-CTY-002 lazy seed | 3, 5 → 11 |
| AC-CTY-003 roles | 3, 6 → 11, 13 |
| AC-CTY-004 unique names + superRefine | 2, 3, 5 → 8, 9, 11 |
| AC-CTY-005 colours | 2, 5, 6 → 8, 9, 13 |
| AC-CTY-006 keys | 1, 5 → 7, 9, 11 |
| AC-CTY-007 one active default | 3, 5 → 9, 11 |
| AC-CTY-008 delete rules + `$transaction` | 3, 5 → 11 |
| AC-CTY-009 type fields | 1, 2 → 7, 8, 9 |
| AC-CTY-010 create defaults | 1, 4 → 7, 12 |
| AC-CTY-011 key validation create/update | 4 → 12 |
| AC-CTY-012 B14 | 1, 4 → 7, 12 |
| AC-CTY-013 New/Edit picker, "Other" removed | 6 → 14 |
| AC-CTY-014 list badge/filter/segments | 4, 6 → 12, 14 |
| AC-CTY-015 tenant scoping / cross-tenant negatives | 3, 4, 5 → 11, 12 |
| AC-CTY-016 audit | 3, 4 → 11, 12 |
| AC-CTY-017 WCAG + Lighthouse | 6 → 13, 14, 20, 21 |
| AC-CTY-018 registries | 3, 16 → 11, 16 |
| NF-001 one extra query | 3 (fast path) → 11, 12; checked 19 |
| NF-002 listActive caching | 6 (staleTime + invalidation) → 13, 14; checked 19 |
| SEC-6 / CA-7 one transaction | 4 → 12 |
| SEC-19 inherited tier + caps | 4 → 11 |
| A11Y-9 / A11Y-11 | 6 → 13 |
| NF-003 L11 build graph | 19 (web build) |
| NF-004 coverage | 19 (`/exec-coverage`) |

## Boolean toggles (playbook §8)

| Toggle | Category | Runtime consumer |
|---|---|---|
| `ContactType.isActive` | 1 — wired (Steps 11, 12, 14) | `listActive`; contact create/update reject new inactive keys |
| `ContactType.isDefault` | 1 — wired (Steps 11, 14) | New Contact picker preselection |
| `ContactType.isSystem` | 1 — wired (Steps 9, 11) | delete refused; reserved-key CHECK |
No AI toggles added; the 12 existing `ContactAutomationSetting` flags are already wired (spec, exploration B11).

## Plan-Reviewer Sign-off

<!-- plan-reviewer: subagent -->
reviewer_subagent: plan-reviewer (`.claude/agents/plan-reviewer.md`), spawned as named sub-agent `plan-reviewer-pg205`
(spawned 16:24:52Z; replies relayed by message).

| Iteration | Verdict | Detail |
|---|---|---|
| 1 | REVISE — 4 ERROR, 10 WARN, 8 INFO | sub-agent result at 2026-10-17T16:29:09Z. Errors: E1 effort-table counts (K), E2 `red-green-index.md` in summary but no step (A), E3 missing `core-crm-dependency-chain.md` update (N), E4 NF-002 with no test (B/M). Warnings W1-W10: CSV alignment table, duplicated colour map vs `lib/color-tokens.ts`, reuse notes, A11Y-9/11 checks, audit afterState + one-transaction checks, explicit wiring checkboxes, L13 checkboxes, exact checkpoint commands, pinned clocks + SEC-19, NF list in Step 19. All applied by the lead. |
| 2 | **APPROVE — 0 ERROR, 0 WARN, 3 INFO** | sub-agent result at 2026-10-17T16:31:55Z. Files Summary create 38 / modify 44 verified by recount. INFO (verbatim): "I1: The 'Plan-Reviewer Sign-off' section still says 'Pending'. Record this APPROVE there." (done here) · "I2: Sprint_plan_I.csv is counted as a separate docs file through the '(+ regenerated)' note. This is consistent across the plan." · "I3: The exec check-plan-reviewer-subagent.mjs preflight expects the exact rows Y / UI Reachability. They are present in the review output." |

Iteration-2 category verdicts (as returned by the reviewer):

| Cat | Name | Result |
|---|---|---|
| A | Files Summary accuracy | PASS |
| B | AC/NF traceability | PASS |
| C | Test file completeness | PASS |
| D | Test case coverage | PASS |
| E | Spec value consistency | PASS |
| F | Accessibility | PASS |
| G | Type/interface location | PASS |
| H | Dependencies | PASS |
| I | Hook/utility coverage | PASS |
| J | CSV artifact alignment | PASS |
| K | Effort estimates | PASS |
| L | Design mockup | PASS |
| M | NF in validation | PASS |
| N | Dependency chain | PASS |
| O | Backend prerequisites | PASS |
| P | Shared component existence | PASS |
| Q | Risk mitigation | PASS |
| R | Layer order | PASS |
| S | Integration checkpoints | PASS |
| T | Plan structure | PASS |
| U | Coverage targets | PASS |
| V | Test count arithmetic | PASS |
| W | Spec integration points | PASS |
| X | Internal vs shared | PASS |
| Y | UI Reachability | PASS — `apps/web/src/components/sidebar/configs/contacts.ts:12-17` (`CONTACT_SETTINGS_ITEMS`, id `contact-types`) and `apps/web/src/components/contacts/ContactSettingsPanel.tsx:16-22`; `navigation-reachability-audit.md:258` updated in Step 16 with manual evidence (#877 false-green caveat); `?segment=` links live in Step 14; no out-of-scope deferral |
| Z | Internal contradictions | PASS |
| AA | Type contract across boundaries | PASS |
| BB | PRD/ADR | PASS |
| CC | Page doc co-change | PASS |
| DD | Exhaustive vs sampling | PASS |
| EE | Duplicate detection | PASS |
| FF | Import chain | PASS |
| GG | Runtime wiring | PASS |
| HH | Icon library | PASS |
| II | Empty state | PASS |
