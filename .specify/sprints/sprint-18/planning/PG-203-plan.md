# Execution Plan: PG-203 — Event Types and Public Booking

**Spec:** `.specify/sprints/sprint-18/specifications/PG-203-spec.md` (APPROVED 6/6, Round 4.2, 2026-10-20 ~23:05Z) ·
**Sprint:** 18 · **Branch:** `feat/pg-203-event-types` · **Owner rulings:**
`.specify/sprints/sprint-18/context/PG-203/PG-203-owner-ruling.md` (Q1–Q12 + runner R1–R7) · **ADR:** ADR-083
(Accepted) · **PRD:** `docs/planning/prd-module-settings.md` (PG-203 Addendum) · **Hexagonal layers:** domain →
validators → application → database → adapters (none new) → API → UI · **Dependency chain:**
`docs/architecture/diagrams/complete-dependency-chains.md` (calendar/legal scheduling chain;
`docs/architecture/diagrams/legal-scheduling-dependency-chain.md`)

> **PRISMA MIGRATIONS (L13):** six additive Class A migrations, `20261021120000`…`20261021120500`. They are merged
> but NOT applied. The production apply is manual and must happen **before** the API ships. Class A gates 4 (staging)
> and 10 (prod smoke) are NEEDS_HUMAN. This is called out in the PR body, the final report and the attestation.

## Runner constraints (apply to every step)

- Node 24 (repo engine `24.x`; host default v25.2.1 hangs pg writes): prefix every command with
  `export PATH=/c/Users/talys/ops/node24/node-v24.21.0-win-x64:$PATH; export NODE_OPTIONS=--max-old-space-size=8192;`.
- One test process at a time. Single-file vitest runs need no slot wrapper. Full package suites, builds and DB tests go
  through `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-203 -- <cmd>`, and DB-backed tests add
  `--exclusive intelliflow-db`. The shared :5433 container is never stopped or reset.
- `@intelliflow/web`'s `test` script is watch mode, so web runs use `pnpm --dir apps/web exec vitest run <path>`.
- Never pipe a gate into `tail`/`head`. Write logs as `> <file>.txt 2>&1; echo "# exit=$?" >> <file>.txt`. Logs are
  `.txt`, never `.log` (L14).
- TDD evidence goes under `.specify/sprints/sprint-18/execution/PG-203/exec-PG-203-<yyyymmdd>/tdd/` as `red-*.txt` and
  `green-*.txt`. Each starts with `# date -u`, `# git rev-parse HEAD`, `# <command>` and ends with `# exit=<code>`.
  No RED claim without its log.
- Commits are small, conventional, lower-case and at most 100 characters. Stage by name, pass the message via
  `-F <file>`, keep hooks on, add no AI attribution, and commit no secret-shaped strings (build them from parts and use
  `*.example.invalid`). Run `node scripts/codex-review.mjs` before code commits (Global Rule 10) and iterate until it
  exits 0.
- Never use `.env.local` `DATABASE_URL`/`DIRECT_URL` (production). The committed `.env.test` targets
  `localhost:5433/intelliflow_test`.
- Every timestamp written to an artifact comes from `date -u` at that moment. No estimated or future times.
- Before SHIP, `git ls-files | grep -cE '\.(log|coverage|tsbuildinfo)$'` must print `0` (L14).
- Change only our own rows in the shared registries (router.ts, docs counts, CSVs). Other lanes edit the same counts.

## Preflight Checks

- [x] `git branch --show-current` prints `feat/pg-203-event-types`, and `git status --short` shows only PG-203 files *Verified 2026-10-20T23:2xZ: branch ok, postgres-test healthy, 5 dist dirs, main merged at 91c6477ac (+storybook lockfile, pnpm install OK), codex logged in, baselines exit 0 (tdd/characterization-*.txt)*
  plus generator churn (`artifacts/reports/plan-lint-report.json`).
- [x] `docker ps --filter name=postgres-test --format "{{.Status}}"` contains `healthy`.
- [x] `ls packages/{domain,validators,application,db,adapters}/dist` all exist. If not, rebuild via the slot wrapper:
  `pnpm turbo build --filter='./packages/*'`.
- [x] `git fetch origin main -q && git log --oneline HEAD..origin/main`. If main moved, merge it before Phase 2 (#890
  is an issue, not code; `appointments.router.ts` was last touched by #923).
- [x] `codex login status` (or Claude fallback available) for the review gate.
- [x] Baselines, recorded as `characterization-*.txt`:
  - `pnpm --filter @intelliflow/validators exec vitest run __tests__/enum-consistency.spec.ts`
  - `pnpm --filter @intelliflow/api exec vitest run src/modules/legal/__tests__/appointments.router.test.ts src/modules/lead`
  - `pnpm --dir apps/web exec vitest run src/components/appointments/__tests__/AppointmentForm.test.tsx src/app/__tests__/sitemap-reconciliation.test.ts src/app/appointments/new/__tests__/page.onsuccess.test.tsx`

## Dependencies Verified

| Dependency | Claim | Verified | Method |
|---|---|---|---|
| PG-178 | module settings layout / sidebar configs | TRUE | `configs/calendar.ts:5-28` lists event-types; `_layout-shell.tsx:26` settings mode |
| PG-189 | appointmentSettings router + model | TRUE | `router.ts:156`; `schema.prisma` AppointmentSettings :2389 |
| PG-202 | availability rules + enforcement (integration) | TRUE | `availability-enforcement.ts:53-303`; `calendar.router.ts:19`; `AvailabilityPolicy.ts:416` |
| PG-205 | contact-types UI/router pattern | TRUE | `contact-types.router.ts`, `contacts/(list)/contact-types/*` |

## Implementation Reality Checks

| Surface | Production Consumer | Replaces / Blocks | Verification Command |
|---|---|---|---|
| `calendar.eventTypes.*` | `EventTypesContent`, `EventTypeDialog`, `BookingLinkCard` | stub `event-types/page.tsx` | `pnpm --dir apps/web exec vitest run src/app/calendar/event-types` |
| `calendar.eventTypes.listActive` | `appointments/new/page.tsx` → `AppointmentForm` | — | `pnpm --dir apps/web exec vitest run src/components/appointments/__tests__/AppointmentForm.test.tsx` |
| `appointments.create.eventTypeId` | AppointmentForm submit | — | `pnpm --filter @intelliflow/api exec vitest run src/modules/legal/__tests__/appointments.router.test.ts` |
| `publicBooking.getEventType/listSlots/book` | `BookingContent` on `/book/[handle]/[slug]` | — | `pnpm --filter @intelliflow/api exec vitest run src/modules/calendar/__tests__/public-booking.router.test.ts` |
| `listOpenSlots` | `publicBooking.listSlots` + `book` re-check | — | `pnpm --filter @intelliflow/domain exec vitest run src/legal/appointments/__tests__/listOpenSlots.test.ts` |
| `LeadService.createLeadInTransaction` | `publicBooking.book`; `createLead` delegates | the private inline save+publish | `pnpm --filter @intelliflow/application exec vitest run src/services/__tests__/LeadService` |
| `enqueueLeadScoring` | `lead.create` + `publicBooking.book` | inline IIFE `lead.router.ts:532-559` | `pnpm --filter @intelliflow/api exec vitest run src/modules/lead` |
| `onAppointmentCreated` (extracted) | `appointments.create`/reschedule + `book` | module-private fn in `appointments.router.ts` | appointments router tests |
| `escapeHtml` | `booking-email.ts` | — | `pnpm --filter @intelliflow/api exec vitest run src/security/__tests__/html-escape.test.ts` |
| DSAR booker fields | `dsar-workflow.ts` export/erase | — | `pnpm --filter @intelliflow/api exec vitest run src/workflow` |

## Estimated Effort

| Phase | Estimate |
|---|---|
| RED tests (17 new + 14 modified test files) | 5–7 h |
| GREEN implementation (25 created source files, 6 of them migrations, + 26 modified; 5 modify entries are conditional (2b, 19, 20, 21, 24), see Files Summary) | 10–14 h |
| REFACTOR + docs/registries | 2–3 h |
| VALIDATION (suites, build, codex, a11y, Lighthouse, attestation) | 3–4 h |
| **Total** | **20–28 h** (PERT from CSV 180/360/540 min was set for the original settings-only scope; the owner widened it) |

## Files Summary

**Create (source, 25):**
1. `packages/domain/src/legal/appointments/event-types.ts`
2. `packages/domain/src/legal/appointments/listOpenSlots.ts`
3. `packages/validators/src/event-types.ts`
4. `packages/db/prisma/migrations/20261021120000_lead_source_booking/migration.sql`
5. `packages/db/prisma/migrations/20261021120100_event_types/migration.sql`
6. `packages/db/prisma/migrations/20261021120200_tenants_booking_handle_idx/migration.sql`
7. `packages/db/prisma/migrations/20261021120300_leads_tenant_id_key/migration.sql`
8. `packages/db/prisma/migrations/20261021120400_appointments_lead_fk/migration.sql`
8a. `packages/db/prisma/migrations/20261021120500_validate_booking_constraints/migration.sql` (added after the independent SQL review: VALIDATEs in their own transaction)
9. `apps/api/src/modules/calendar/event-types.router.ts`
10. `apps/api/src/modules/calendar/public-booking.router.ts`
11. `apps/api/src/modules/calendar/booking-email.ts`
12. `apps/api/src/modules/calendar/booking-abuse.ts`
13. `apps/api/src/modules/lead/lead-scoring-enqueue.ts`
14. `apps/api/src/modules/legal/appointment-side-effects.ts`
15. `apps/api/src/security/html-escape.ts`
16. `apps/web/src/app/calendar/event-types/EventTypesContent.tsx`
17. `apps/web/src/app/calendar/event-types/EventTypesLoading.tsx`
18. `apps/web/src/app/calendar/event-types/components/EventTypeList.tsx`
19. `apps/web/src/app/calendar/event-types/components/EventTypeDialog.tsx`
20. `apps/web/src/app/calendar/event-types/components/BookingLinkCard.tsx`
21. `apps/web/src/components/calendar/event-type-colors.ts`
22. `apps/web/src/app/(public)/book/[handle]/[slug]/page.tsx`
23. `apps/web/src/app/(public)/book/[handle]/[slug]/BookingContent.tsx`
24. `apps/web/src/app/(public)/book/[handle]/[slug]/loading.tsx`

**Modify (source, 26):**
1. `packages/domain/src/index.ts`
2. `packages/domain/src/crm/lead/Lead.ts` (LEAD_SOURCES += BOOKING)
2a. `packages/validators/package.json` (`./event-types` subpath export + tsup entry; L11)
2b. `packages/validators/src/lead.ts` (verify: derives from the domain; record "checked, no change" if untouched)
3. `packages/application/src/services/LeadService.ts`
4. `packages/validators/src/index.ts`
5. `packages/db/prisma/schema.prisma`
6. `packages/db/src/index.ts`
7. `apps/api/src/router.ts`
8. `apps/api/src/modules/calendar/calendar.router.ts`
9. `apps/api/src/modules/legal/appointments.router.ts`
10. `apps/api/src/modules/lead/lead.router.ts`
11. `apps/api/src/workflow/dsar-workflow.ts`
12. `apps/web/src/app/calendar/event-types/page.tsx`
13. `apps/web/src/components/appointments/AppointmentForm.tsx`
14. `apps/web/src/app/appointments/new/page.tsx`
15. `apps/web/src/components/calendar/CalendarSettingsPanel.tsx`
16. `apps/web/src/app/robots.ts`
17. `apps/web/src/app/(public)/_components/PublicLayoutShell.tsx`
18. `apps/web/src/components/navigation.tsx`
19. `apps/web/src/lib/leads/lead-form-utils.ts` (BOOKING label, if a source map exists there; TS exhaustiveness decides)
20. `apps/web/src/lib/shared/filter-utils.ts` (same)
21. `apps/web/src/components/leads/lead-detail.tsx` (same)
22. `.env.example` (`BOOKING_IP_SALT` placeholder `change-me-in-prod`)
23. `lighthouserc.authenticated.js` (`/calendar/event-types`)
24. `apps/web/src/components/shared/activity-feed/ActivityFeedFilters.tsx` (only if it enumerates lead sources)

Items 19–21 and 24 are modified only if `tsc` or the grep shows they map LeadSource exhaustively. Any that is not
touched is recorded in the delivery report as "checked, no change". The count stays honest.

**Tests, create (17):**
1. `packages/domain/src/legal/appointments/__tests__/listOpenSlots.test.ts`
2. `packages/domain/src/legal/appointments/__tests__/event-types.test.ts`
3. `packages/validators/src/__tests__/event-types.test.ts`
4. `packages/application/src/services/__tests__/LeadService.createLeadInTransaction.test.ts`
5. `apps/api/src/modules/calendar/__tests__/event-types.router.test.ts`
6. `apps/api/src/modules/calendar/__tests__/public-booking.router.test.ts`
7. `apps/api/src/modules/calendar/__tests__/booking-email.test.ts`
8. `apps/api/src/modules/calendar/__tests__/booking-abuse.test.ts`
9. `apps/api/src/modules/lead/__tests__/lead-scoring-enqueue.test.ts`
10. `apps/api/src/security/__tests__/html-escape.test.ts`
11. `tests/integration/event-types.test.ts`
12. `apps/web/src/app/calendar/event-types/__tests__/page.test.tsx`
13. `apps/web/src/app/calendar/event-types/__tests__/EventTypesContent.test.tsx`
14. `apps/web/src/app/calendar/event-types/components/__tests__/EventTypeDialog.test.tsx`
15. `apps/web/src/app/calendar/event-types/components/__tests__/BookingLinkCard.test.tsx`
16. `apps/web/src/app/(public)/book/[handle]/[slug]/__tests__/page.test.tsx`
17. `apps/web/src/app/(public)/book/[handle]/[slug]/__tests__/BookingContent.test.tsx`

(EventTypeList is covered inside `EventTypesContent.test.tsx` + `EventTypeDialog.test.tsx`; if the list grows logic of
its own, add `components/__tests__/EventTypeList.test.tsx` and update this count.)

**Tests, modify (14):**
1. `packages/validators/__tests__/enum-consistency.spec.ts`
2. `apps/api/src/modules/legal/__tests__/appointments.router.test.ts`
3. `apps/api/src/modules/lead/__tests__/lead.router.test.ts` (enqueue regression)
4. `apps/api/src/workflow/__tests__/dsar-workflow.test.ts` (booker export/erase)
5. `tests/integration/rls-tenant-isolation.test.ts` (event_types, booking_attempts)
6. `apps/web/src/components/appointments/__tests__/AppointmentForm.test.tsx`
7. `apps/web/src/app/__tests__/sitemap-reconciliation.test.ts` (214→215)
8. `apps/web/src/app/__tests__/robots.test.ts`
9. `apps/web/src/__tests__/root-proxy.test.ts`
10. `apps/web/src/app/(public)/_components/__tests__/PublicLayoutShell.test.tsx`
11. `apps/web/src/components/__tests__/navigation.tenant.test.tsx` (no app bar on `/book/x/y` when authenticated;
    if its setup cannot express that, create `navigation.book.test.tsx` instead and record the swap)
12. `apps/web/src/components/aurora-landing/sections/__tests__/InboxCalendarSection.test.tsx` (stale "stub" comment, :47)
13. `apps/web/src/app/__tests__/sitemap.test.ts` (asserts `/book` is absent from `app/sitemap.ts`, AC-021)
14. `apps/web/src/app/appointments/new/__tests__/page.onsuccess.test.tsx` (picker gating: `listActive` is gated like
    `settingsQuery`, event types are passed to the form, and the submit carries eventTypeId)

**Docs / tracking, modify or create (17):**
1. `docs/design/sitemap.md`
2. `docs/design/page-registry.md`
3. `docs/design/PAGE_MAP_AND_FLOWS.md`
4. `docs/design/information-architecture.md`
5. `docs/design/navigation-reachability-audit.md`
6. `docs/design/ui-flow-mapping.md`
7. `docs/design/content-audit.md` (regenerated)
8. `artifacts/reports/content-audit-results.json` (regenerated)
9. `docs/architecture/diagrams/complete-dependency-chains.md`
10. `docs/architecture/diagrams/legal-scheduling-dependency-chain.md`
11. `docs/compliance-and-governance/compliance/vpat-2.5.md` and `wcag-conformance-statement.md` (page counts)
12. `docs/planning/prd-module-settings.md` (Draft→In Progress→Delivered note)
13. `docs/architecture/adr/ADR-083-event-types-public-booking.md` (API DB-role citation; delivery note)
14. `docs/architecture/adr/README.md` (ADR-083 row)
15. `.specify/sprints/sprint-18/attestations/PG-203/{context_ack.json, attestation.json, task-tracking.json}`
16. `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv` + regenerated split `Sprint_plan_I.csv` (incl. the
    follow-up task rows from `/create-task`), and `artifacts/metrics/debt-ledger.yaml` (red-flag entries)
17. `.specify/sprints/sprint-18/execution/PG-203/PG-203-findings.md` (create)

## Execution Steps

### Phase 0 — Context and characterization

#### Step 1: Context ack + baselines (AC-024 setup)
**Type:** setup
**Files to Create:**
- `.specify/sprints/sprint-18/attestations/PG-203/context_ack.json`

**Validation:**
- [x] `context_ack.json` lists the spec, plan, ruling, ADR-083, ADR-081, playbook, PRD and the files actually read, each *Verified context_ack.json (19 files, sha256, 9 invariants) + context_pack built for run 20261020232057-32e38201; coverage-before artifacts/coverage/PG-203-before.json*
  with a sha256 hash.
- [x] Preflight baselines recorded as `characterization-*.txt` with exit 0.
- [x] Coverage-before captured via `/exec-coverage` (Phase 1.5 of /exec).

### Phase 1 — RED: write failing tests (layer order)

#### Step 2: Domain tests: event-type constants and `listOpenSlots` (AC-011; NF-001)
**Type:** test
**Files to Create:**
- `packages/domain/src/legal/appointments/__tests__/event-types.test.ts`
- `packages/domain/src/legal/appointments/__tests__/listOpenSlots.test.ts`

**Acceptance Criteria Addressed:** AC-011, AC-009 (constants)

- [x] `now` is injected, with no global fake timers. Fixtures are built relative to `now`, and fixed far-future dates *Verified tdd/red-domain.txt (missing modules) then tdd/green-domain.txt 30/30*
  are used only for DST.
- [x] Spring-forward and fall-back days in `Europe/London` and `America/New_York`.
- [x] Closures exclude whole days.
- [x] A slot must fit in one range on its local start day.
- [x] Buffers exclude overlaps. Parity cases are asserted against `ConflictDetector` on the same busy set.
- [x] Host busy time (organizer and attendee entries both passed in) excludes slots.
- [x] Notice: exactly 60 minutes is allowed and 59 is excluded. Horizon is 60 days.
- [x] A 15-minute grid. At most 48 slots per day. The daily cap hides a day once `bookedPerDay` ≥ `maxDaily`.
- [x] Composition: `generateCandidates` is called with `stepMinutes: 15` (spy, or equality with direct generation).
- [x] Constants: `EVENT_TYPE_REQUIRED_FIELDS`, `EVENT_TYPE_LEAD_SOURCES`, `BOOKING_RESERVED_HANDLES`,
  `EVENT_LOCATION_TYPES` values. `LEAD_SOURCES` includes `BOOKING`.

**Validation:**
- [x] RED: `pnpm --filter @intelliflow/domain exec vitest run src/legal/appointments/__tests__/listOpenSlots.test.ts src/legal/appointments/__tests__/event-types.test.ts`
  fails on missing modules → `red-domain.txt`

#### Step 3: Validator tests (AC-004, AC-007, AC-013, AC-015)
**Type:** test
**Files to Create:**
- `packages/validators/src/__tests__/event-types.test.ts`

**Files to Modify:**
- `packages/validators/__tests__/enum-consistency.spec.ts` (LeadSource includes BOOKING in domain = validators = Prisma)

- [x] `eventTypeInputSchema`: *Verified tdd/red-validators.txt (missing module) then green-validators.txt 28/28; enum-consistency PG-203 block RED until Step 13 (Prisma)*
  - name 1..100, trimmed;
  - slug kebab 1..60;
  - duration 5..480;
  - the colour allowlist accepts the 18 tokens and rejects others;
  - VIDEO requires an https URL (rejects `http:`/`javascript:`);
  - IN_PERSON requires details;
  - requiredFields come from the allowlist, with duplicates rejected;
  - leadSource is WEBSITE or BOOKING only;
  - there is no `aiScoringEnabled` key (strict).
- [x] `eventTypeCatalogSchema` superRefine:
  - a duplicate slug is reported at `[i,'slug']` of the **second** item, case-insensitive;
  - a duplicate name is reported at `[i,'name']`.
- [x] `bookingLinkSchema`: handle format 3..40 and reserved words; privacyUrl must be https; `null` clears it.
- [x] Public schemas are strict:
  - an extra `tenantId`/`hostId`/`hostUserId`/`leadId` is rejected on lookup, slots and book;
  - `fromDate` format and `days` 1..14;
  - name control characters and CR/LF are stripped;
  - email is lowercased and capped at 320;
  - answers are strict;
  - `consent` must be literally `true`;
  - `__honeypot` accepts `''`.

**Validation:**
- [x] RED: `pnpm --filter @intelliflow/validators exec vitest run src/__tests__/event-types.test.ts __tests__/enum-consistency.spec.ts` → `red-validators.txt`

#### Step 4: Application test: `LeadService.createLeadInTransaction` (AC-018)
**Type:** test
**Files to Create:**
- `packages/application/src/services/__tests__/LeadService.createLeadInTransaction.test.ts`

- [x] It saves with the given `tx` and publishes LeadCreated through `eventBus.publishAll(events, tx)` with the same `tx`. *Verified tdd/red-application.txt (4 fail: method missing) then green-application.txt 7/7*
- [x] It runs no duplicate pre-check (`existsByEmailInTenant` is not called).
- [x] It opens no transaction (`transactionManager.run` is not called).
- [x] Domain validation failure (bad email) → `Result.fail`, with no save.
- [x] `createLead` still checks duplicates and still runs inside `transactionManager.run` (regression).

**Validation:**
- [x] RED: `pnpm --filter @intelliflow/application exec vitest run src/services/__tests__/LeadService.createLeadInTransaction.test.ts` → `red-application.txt`

#### Step 5: API tests: event-types router (AC-003..AC-009, AC-023 unit)
**Type:** test
**Files to Create:**
- `apps/api/src/modules/calendar/__tests__/event-types.router.test.ts`

- [x] `list` (member) returns `canEdit:false` for a MEMBER and `true` for ADMIN/MANAGER. It returns bookingLink *Verified tdd/red-api-event-types.txt (missing module) then 26→31 tests green; commit 880575912*
  `{handle, privacyUrl, availabilityConfigured}`, host display names and `hostAvailable`.
- [x] `listActive` returns only `isActive`.
- [x] `create`/`update`/`delete`/`setBookingLink` by a MEMBER → FORBIDDEN, with no `$transaction`.
- [x] `create`:
  - `$transaction` callback form;
  - the 51st type → CONFLICT;
  - catalogue superRefine against existing rows → BAD_REQUEST with the field path;
  - duration outside the tenant min..max → BAD_REQUEST;
  - a host not in `tenantUserWhere` → NOT_FOUND;
  - P2002 (slug) → CONFLICT "slug in use", P2002 (name) → "name in use";
  - the audit logger is called.
- [x] `update`/`delete` on a foreign id → NOT_FOUND. The `findFirst` is called with `{id, tenantId}`, and there is no write.
- [x] `delete` runs in `$transaction` and calls `deleteMany({id, tenantId})`. No skipDuplicates anywhere: grep assertion
  on the module source.
- [x] `setBookingLink`:
  - P2002 → CONFLICT "That booking handle is taken";
  - reserved word → BAD_REQUEST;
  - `null` clears both fields;
  - audited.
- [x] Every Prisma call carries `tenantId`. A recording-prisma helper asserts it for each `where`/`data`, and it is
  written inside this test file (or a sibling `__tests__/tenant-scope.test-utils.ts`, listed if created).

**Validation:**
- [x] RED: `pnpm --filter @intelliflow/api exec vitest run src/modules/calendar/__tests__/event-types.router.test.ts` → `red-api-event-types.txt`

#### Step 6: API tests: public booking, abuse, email, escaping, scoring helper (AC-011..AC-020, AC-022 consent)
**Type:** test
**Files to Create:**
- `apps/api/src/modules/calendar/__tests__/public-booking.router.test.ts`
- `apps/api/src/modules/calendar/__tests__/booking-abuse.test.ts`
- `apps/api/src/modules/calendar/__tests__/booking-email.test.ts`
- `apps/api/src/security/__tests__/html-escape.test.ts`
- `apps/api/src/modules/lead/__tests__/lead-scoring-enqueue.test.ts`

Mocks: `createPublicContext` (`apps/api/src/test/setup.ts:443`); `notificationService.sendEmail` (resolve and
reject); `enqueueLeadScoring`; `onAppointmentCreated`; `LeadService.createLeadInTransaction`; the limiter reset in
`beforeEach`. `ctx.prisma` is the deep mock, and `$transaction` uses the callback form with `txMock`.

**Lookup and enumeration:**
- [x] Five NOT_FOUND cases give a deep-equal error (code, message, data) with an identical DB call sequence: exactly one *Verified tdd/red-api-public.txt, red-api-abuse.txt, red-api-email.txt, red-api-enqueue.txt (missing modules; html-escape written with its test, no RED) then calendar suite 171+ green; codex runs 7-13 findings fixed (non-atomic caps, stale config, required fields under lock, scoring not blocking emails, committed timezone) + 2 waivers of the accepted ADR-081 best-effort cap (gh #913)*
  `eventType.findFirst`, and nothing else. The cases are unknown handle, unknown slug, inactive type,
  `availabilityConfiguredAt` null, and inactive host.
- [x] Strict bodies on all three procedures reject `tenantId`/`hostId`/`hostUserId`/`leadId`.

**`book` gates:**
- [x] A filled honeypot returns the fake-success shape and makes **zero** prisma calls.
- [x] A missing required answer → BAD_REQUEST.
- [x] Abuse caps: email ≥ 3 in 24 h, IP ≥ 10 per hour and event type ≥ 30 per hour each give the same
  TOO_MANY_REQUESTS. The attempt row is written. The prune (`deleteMany createdAt < now-48h`) runs only after the
  lookup passes.
- [x] A production start without `BOOKING_IP_SALT` refuses with INTERNAL_SERVER_ERROR and a generic message.

**`book` transaction:**
- [x] Order: `set_config` → `lock_timeout` → `pg_advisory_xact_lock` (`$executeRaw`) → busy query. Asserted through
  the mock call order.
- [x] Re-check: a `start` not in the regenerated slot set → CONFLICT "That time is no longer available."
- [x] Lead branches, all with the same response object and the same lookup calls:
  - no match → `createLeadInTransaction` with `source = eventType.leadSource`, `ownerId = host`, and the name split.
    An invalid phone is dropped from the lead and kept in answers.
  - booking-created lead (same email, an appointment `bookedVia PUBLIC_LINK` with `leadId`) → linked, no create.
  - a staff WEBSITE lead with the same email → not linked, `matchedExistingRecord` true.
  - a contact match → not linked, flag true.
  - P2002 from a staff race → CONFLICT "try again".
- [x] Appointment create data:
  - SCHEDULED; organizer = host; buffers snapshotted; reminder = settings default;
  - title capped at 200;
  - `eventTypeId`, `leadId`, booker fields, `bookedVia`, consent time and version;
  - `bookingAnswers` built from allowlisted keys only.

**After commit:**
- [x] `enqueueLeadScoring` is called only for a newly created lead.
- [x] `onAppointmentCreated(…, {sendIcs:false})` is called.
- [x] Two emails. A rejected `sendEmail` still returns success. The log line carries no email or IP (spy assertion).
- [x] The DTO snapshot for `getEventType`/`listSlots`/`book` has no `organizerId`, `email`, `tenantId`, `title`,
  `attendees`, `hostUserId` or ids.
- [x] `listSlots`:
  - `fromDate` outside [today, today+60] → BAD_REQUEST;
  - the limiter throws TOO_MANY_REQUESTS on a burst inside 500 ms;
  - the busy query uses the organizer-or-attendee OR with a status filter and `tenantId`.
- [x] Errors never carry `error.message` from Prisma. A forced error gives a generic message.
- [x] NF-004: a lock-timeout error (Postgres 55P03 surfaced from `$executeRaw`) maps to CONFLICT "Please try again."
  with no partial writes.

**Other suites:**
- [x] `booking-abuse.test.ts`:
  - HMAC hashing is deterministic per salt, and the raw value is never returned;
  - each cap threshold boundary is tested;
  - the salt check passes in prod with the env set, refuses without it, and uses the local fallback in dev/test.
- [x] `booking-email.test.ts`:
  - booker and host templates;
  - a `<script>`/`&`/quotes name is escaped in HTML and present as plain text;
  - CR/LF are stripped from the subject;
  - no free-text answers in the booker mail;
  - the host mail contains the answers (escaped), the "email not verified" note and the matched-record note;
  - `replyTo` is the host on the booker mail only.
- [x] `html-escape.test.ts`: `& < > " '` and non-string input.
- [x] `lead-scoring-enqueue.test.ts`:
  - the payload `{leadId, tenantId, …, correlationId: 'lead-create-<id>'}` and the OTel carrier;
  - errors are swallowed and logged without PII;
  - no Redis means a no-op.

**Validation:**
- [x] RED: `pnpm --filter @intelliflow/api exec vitest run src/modules/calendar/__tests__/public-booking.router.test.ts src/modules/calendar/__tests__/booking-abuse.test.ts src/modules/calendar/__tests__/booking-email.test.ts src/security/__tests__/html-escape.test.ts src/modules/lead/__tests__/lead-scoring-enqueue.test.ts` → `red-api-public.txt`

#### Step 7: Regression tests for touched API paths (AC-010, AC-019, AC-022)
**Type:** test
**Files to Modify:**
- `apps/api/src/modules/legal/__tests__/appointments.router.test.ts`
- `apps/api/src/modules/lead/__tests__/lead.router.test.ts`
- `apps/api/src/workflow/__tests__/dsar-workflow.test.ts`

- [x] `appointments.create` with `eventTypeId`: *Verified tdd/red-api-regression.txt (2 eventTypeId cases fail) then appointments.router.caller 73/73; lead.router 61/61 (enqueue regression)*
  - the `{id, tenantId, isActive}` check comes next to `assertAppointmentRefsInTenant`;
  - a foreign or inactive id → NOT_FOUND before the use case;
  - success → `updateMany({where:{id, tenantId}, data:{eventTypeId}})`;
  - without `eventTypeId`, no extra calls (unchanged path).
- [x] `onAppointmentCreated` is still invoked on create and reschedule after extraction (ICS + reminder unchanged).
- [x] `lead.create` enqueues scoring through `enqueueLeadScoring` exactly as before (same payload).
- [ ] DSAR export includes appointments where `bookerEmail = subjectEmail` (booker fields only). Erasure nulls
  `bookerName/bookerEmail/bookingAnswers` for those rows.

**Validation:**
- [x] RED (new cases fail): `pnpm --filter @intelliflow/api exec vitest run src/modules/legal/__tests__/appointments.router.test.ts src/modules/lead src/workflow` → `red-api-regression.txt`

#### Step 8: DB integration test (AC-012, AC-023, AC-024)
**Type:** test
**Files to Create:**
- `tests/integration/event-types.test.ts`

**Files to Modify:**
- `tests/integration/rls-tenant-isolation.test.ts`

**Setup:**
- [x] `describeDb` gate, `pg203_` prefixed tenants, a sweep of rows older than a day, and `afterAll` cleanup. *Verified 2026-10-21: tdd/green-integration.txt 70/70 (fresh ephemeral DB); deviations (no RED capture, no outbox row, real 2s lock_timeout) in PG-203-findings.md*
- [x] `ensureMigrationSql`:
  - gate on `pg_enum` (BOOKING) and on a missing `event_types_colorToken_check`;
  - **never replay `ALTER TYPE`**;
  - run the two CONCURRENTLY files alone (the `ensureContactsTypeIndex` pattern, `contact-types.test.ts:91`);
  - everything under `applySchemaSql` / the schema lock.

**Assertions:**
- [x] CHECKs reject: a bad colorToken, slug, duration, requiredFields, leadSource EVENT, handle format, http privacy URL
  and oversized bookingAnswers.
- [x] Unique constraints: `(tenantId, slug)`, `lower(name)` per tenant and `tenants.bookingHandle`.
- [x] Composite FKs:
  - deleting an event type nulls only `eventTypeId`, and the appointment survives;
  - deleting a lead nulls only `leadId`;
  - a cross-tenant `leadId` or `eventTypeId` is rejected by the FK.
- [x] Tenant delete with event types and a host user present succeeds (NO ACTION).
- [x] RLS (SET LOCAL ROLE authenticated + `set_config`): A cannot see B's `event_types` or `booking_attempts`.
- [x] Booking runs against the real DB with the non-bypass role inside the tx:
  - B's handle books only into B;
  - the LeadCreated outbox row exists after a lead-creating booking.
- [x] Deterministic lock test:
  - tx A takes `pg_advisory_xact_lock('booking:'||A)` and parks;
  - tx B's `book` waits, confirmed via `pg_locks WHERE locktype='advisory' AND NOT granted`;
  - release A → exactly one appointment for the slot, and B gets CONFLICT.
- [x] Lock-free control: two concurrent inserts without the lock both land, proving the test detects races.
- [x] NF-004: while A holds the lock, B runs with a short `lock_timeout` (`200ms`, a test-only helper parameter) and
  fails with CONFLICT "Please try again.". No appointment is written for B.
- [x] `rls-tenant-isolation.test.ts`: add `event_types` and `booking_attempts` to its table list.

**Validation:**
- [ ] RED: `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-203 --exclusive intelliflow-db -- pnpm exec vitest run --project integration tests/integration/event-types.test.ts` → `red-integration.txt` *NOT CAPTURED (2026-10-21): the file was written after the migrations, so no failing run exists; recorded as a deviation in PG-203-findings.md (DB integration test section). The first real run had 4 failures, all in the test's own seeding.*

#### Step 9: Web tests (AC-001..AC-010, AC-021, AC-025 count, AC-026)
**Type:** test
**Files to Create:**
- `apps/web/src/app/calendar/event-types/__tests__/page.test.tsx`
- `apps/web/src/app/calendar/event-types/__tests__/EventTypesContent.test.tsx`
- `apps/web/src/app/calendar/event-types/components/__tests__/EventTypeDialog.test.tsx`
- `apps/web/src/app/calendar/event-types/components/__tests__/BookingLinkCard.test.tsx`
- `apps/web/src/app/(public)/book/[handle]/[slug]/__tests__/page.test.tsx`
- `apps/web/src/app/(public)/book/[handle]/[slug]/__tests__/BookingContent.test.tsx`

**Files to Modify:**
- `apps/web/src/components/appointments/__tests__/AppointmentForm.test.tsx`
- `apps/web/src/app/__tests__/sitemap-reconciliation.test.ts`
- `apps/web/src/app/__tests__/robots.test.ts`
- `apps/web/src/__tests__/root-proxy.test.ts`
- `apps/web/src/app/(public)/_components/__tests__/PublicLayoutShell.test.tsx`
- `apps/web/src/components/__tests__/navigation.tenant.test.tsx`
- `apps/web/src/app/__tests__/sitemap.test.ts`
- `apps/web/src/app/appointments/new/__tests__/page.onsuccess.test.tsx`
- `apps/web/src/components/aurora-landing/sections/__tests__/InboxCalendarSection.test.tsx`

**Event types page:**
- [x] `page.test.tsx`: Suspense + content mocked; no "coming soon" text. *Verified 2026-10-21: 20 web files 355 tests green (tdd/green-web.txt); RED logs tdd/red-web-*.txt*
- [x] `EventTypesContent.test.tsx`, with the hoisted tRPC mock tree `trpc.calendar.eventTypes.*`:
  - PageHeader and the 8+4 bento;
  - loading skeleton;
  - empty → `EmptyState` (entity appointments, phase passive, no action button);
  - CTA in the SectionHeader calls `openCreate` via the ref (AC-008);
  - read-only note for non-editors with the CTA hidden;
  - inactive badge;
  - "host unavailable" flag;
  - "Copy link" appears only when booking is available;
  - delete confirm with focus restore;
  - NOT_FOUND fallback;
  - error/retry state;
  - axe clean.
- [x] `EventTypeDialog.test.tsx`:
  - fields;
  - 18 swatch radios with labels;
  - legacy token narrowed to slate on edit;
  - VIDEO URL validation message;
  - IN_PERSON details required;
  - required-fields checkboxes;
  - lead-source radio WEBSITE/BOOKING;
  - **no AI switch**;
  - host combobox searching through `user.list`;
  - inline CONFLICT on slug/name;
  - submit payload;
  - axe clean.
- [x] `BookingLinkCard.test.tsx`:
  - handle/privacy inputs;
  - reserved-word message;
  - the "off: set a handle" and "off: set availability first" states with a link to `/calendar/availability`;
  - full URL + copy;
  - CONFLICT "taken";
  - clear;
  - axe clean.

**Appointment form:**
- [x] `AppointmentForm.test.tsx` (extend):
  - "Event type" select appears in create mode only;
  - `getByLabelText(/Type/)` still matches one element;
  - select sets the type, end = start + duration when start is set, fills empty location/description, never the title;
  - an edited end time is not overwritten;
  - empty start leaves end untouched;
  - clearing keeps the values;
  - submit includes `eventTypeId`;
  - existing cases stay green.

**Public booking page:**
- [x] `(public)/book/.../page.test.tsx`: `generateMetadata` gives a generic title and `robots` index:false/follow:false.
  The shell renders BookingContent.
- [x] `BookingContent.test.tsx`:
  - date radiogroup with roving tabindex/arrow keys/`aria-checked` and an aria-live count;
  - slot radiogroup;
  - visitor-local times formatted on the client, with the firm timezone shown;
  - form validation;
  - consent link to the firm URL or `/privacy`;
  - honeypot unreachable by keyboard (`tabIndex -1`, off-screen wrapper, no `aria-hidden` on the input);
  - states: not-available, no-slots, loading, 409 refetch keeping values, 429 message;
  - confirmation with focus on its heading;
  - axe clean.

**Shared surfaces:**
- [x] `sitemap-reconciliation.test.ts`: `toBe(214)` → `toBe(215)` with a PG-203 history comment.
- [x] `robots.test.ts`: `/book/` is disallowed (a separate assertion; it is not in the authenticated list).
- [x] `sitemap.test.ts`: no `/book` URL in the `app/sitemap.ts` output (AC-021).
- [x] `appointments/new/__tests__/page.onsuccess.test.tsx`:
  - the form waits for `listActive` the same way it waits for `settingsQuery`, so the picker does not pop in;
  - active types are passed to the form;
  - the submit payload carries `eventTypeId` (AC-010).
- [x] `root-proxy.test.ts`: unauthenticated `/book/x/y` passes with no login redirect.
- [x] `PublicLayoutShell.test.tsx`: `/book/x/y` renders no AuroraSiteHeader/Footer/FeedbackFab.
- [x] Navigation test: no app bar on `/book/x/y` while authenticated.
- [x] `InboxCalendarSection.test.tsx:47`: correct the stale "stub" comment only (no behaviour change).

**Validation:**
- [x] RED: `pnpm --dir apps/web exec vitest run src/app/calendar/event-types "src/app/(public)/book" src/components/appointments/__tests__/AppointmentForm.test.tsx src/app/__tests__/sitemap-reconciliation.test.ts src/app/__tests__/robots.test.ts src/app/__tests__/sitemap.test.ts src/app/appointments/new src/__tests__/root-proxy.test.ts "src/app/(public)/_components/__tests__/PublicLayoutShell.test.tsx" src/components/__tests__/navigation.tenant.test.tsx` → `red-web.txt`

### Phase 2 — GREEN: make tests pass (domain → validators → application → db → api → web)

#### Step 10: Domain
**Type:** implementation
**Files to Create:**
- `packages/domain/src/legal/appointments/event-types.ts`
- `packages/domain/src/legal/appointments/listOpenSlots.ts`

**Files to Modify:**
- `packages/domain/src/crm/lead/Lead.ts`
- `packages/domain/src/index.ts`

- [x] `listOpenSlots` composes `generateCandidates` (AvailabilityPolicy.ts:416) and uses the ConflictDetector overlap *Verified tdd/green-domain.txt, tsc-domain.txt, build-domain.txt exit 0*
  semantics. It imports nothing from infrastructure.
- [x] `LEAD_SOURCES` includes `'BOOKING'`.

**Validation:**
- [x] GREEN: Step 2 command → `green-domain.txt`
- [x] `pnpm --filter @intelliflow/domain exec tsc --noEmit`
- [x] Rebuild: `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-203 -- pnpm --filter @intelliflow/domain build`

#### Step 11: Validators
**Type:** implementation
**Files to Create:**
- `packages/validators/src/event-types.ts`

**Files to Modify:**
- `packages/validators/src/index.ts`
- `packages/validators/package.json`: add the `./event-types` exports entry (types/import/require, the `./ai-review`
  shape at :65-68) and `src/event-types.ts` to the tsup `build` and `dev` scripts (:87-88).
- `packages/validators/src/lead.ts`: **verify only.** `leadSourceSchema = z.enum(LEAD_SOURCES)` (:16) derives from
  the domain, so BOOKING arrives with no edit. Change it only if a hardcoded list is found, and record the outcome in
  the delivery report. The LeadSource uses in `apps/api/src/modules/lead/lead.router.ts` and
  `packages/adapters/src/repositories/PrismaLeadRepository.ts` are checked the same way.

**Validation:**
- [x] GREEN: `pnpm --filter @intelliflow/validators exec vitest run src/__tests__/event-types.test.ts` → `green-validators.txt` *Verified green-validators.txt 28/28, tsc-validators.txt, build-validators.txt exit 0; lead.ts/lead.router.ts/PrismaLeadRepository.ts checked: no hardcoded LeadSource list, no change*
  The enum-consistency spec compares Prisma, domain and validators. It stays RED until Step 13 adds BOOKING to the
  Prisma enum, and its GREEN run is recorded in Step 13.
- [x] Build validators (slot wrapper).

#### Step 12: Application: `createLeadInTransaction`
**Type:** implementation
**Files to Modify:**
- `packages/application/src/services/LeadService.ts`

- [x] `createLeadInTransaction(props, tx)` is public. `createLead` keeps its duplicate check and calls it inside *Verified green-application.txt 7/7; full-application.txt 1501/1501; tsc-application.txt; build-application.txt exit 0*
  `transactionManager.run`. The Prisma tx is handed in as `tx as unknown as RepositoryTransaction`
  (PrismaTransactionManager.ts:14-16 precedent).

**Validation:**
- [x] GREEN: Step 4 command → `green-application.txt`
- [x] Full suite: `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-203 -- pnpm --filter @intelliflow/application test` (TDD regression).
- [x] Build application.

#### Step 13: Prisma schema + six migrations (Class A, L13)
**Type:** implementation
**Files to Create:**
- `packages/db/prisma/migrations/20261021120000_lead_source_booking/migration.sql`
- `packages/db/prisma/migrations/20261021120100_event_types/migration.sql`
- `packages/db/prisma/migrations/20261021120200_tenants_booking_handle_idx/migration.sql`
- `packages/db/prisma/migrations/20261021120300_leads_tenant_id_key/migration.sql`
- `packages/db/prisma/migrations/20261021120400_appointments_lead_fk/migration.sql`
- `packages/db/prisma/migrations/20261021120500_validate_booking_constraints/migration.sql`

**Files to Modify:**
- `packages/db/prisma/schema.prisma`
- `packages/db/src/index.ts`

**`schema.prisma`:**
- [x] `EventLocationType` enum and the `EventType` + `BookingAttempt` models. *Verified 2026-10-20T23:58Z: schema +94 lines (no reformat), 6 migrations; migrate deploy on the shared intelliflow_test refused (P3009: another lane's failed 20261008000000) so applied to a fresh ephemeral DB via pnpm test:db:up (migrate-deploy-ephemeral.txt, all 6 applied, constraints validated); drift = documented SQL-only FKs only (prisma-drift.sql.txt); SQL review APPROVED after D1 fix (findings F2); green-enum.txt 22/22; tsc-db/build-db exit 0; commit 7fd27d0a5*
- [x] Tenant `bookingHandle @unique`, `bookingPrivacyUrl`, and `eventTypes EventType[] @ignore // PG-203` reverse
  relations.
- [x] Appointment's new nullable columns. Lead `@@unique([tenantId, id])`. `LeadSource` += BOOKING.
- [x] A SQL-only comment block (the CaseType :2336-2346 pattern).

**Migrations:**
- [x] Each header carries Class A bullets, lock notes (gate 6) and a forward-only recovery plan.
- [x] Migrations 1, 3 and 4 are single-statement files; every VALIDATE is in migration 6 (20261021120500).

**Database:**
- [x] Generate the client: `pnpm --filter @intelliflow/db db:generate`.
- [x] Apply to the **local test DB only**:
  `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-203 --exclusive intelliflow-db -- pnpm --filter @intelliflow/db exec prisma migrate deploy`
  with `.env.test`. Guarded by `tools/scripts/guard-db-target.mjs`. Never prod.
- [x] Prisma diff check: `pnpm --filter @intelliflow/db exec prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <local shadow>`
  shows no drift beyond the SQL-only objects (documented). If no shadow DB is available, use `migrate status` plus a
  manual reconcile note.
- [x] Export `EventType` and `BookingAttempt` from `packages/db/src/index.ts`. Build db.
- [x] An independent SQL review (Class A gate 1) by a `data-engineer` subagent on the six files, recorded in the
  findings doc.

**Validation:**
- [x] GREEN: `pnpm --filter @intelliflow/validators exec vitest run __tests__/enum-consistency.spec.ts` (BOOKING now in Prisma, domain and validators) → `green-enum.txt`
- [x] GREEN: Step 8 integration command (now passes) → `green-integration.txt` *Verified 2026-10-21: 70/70 on a fresh ephemeral DB (`pnpm test:db:run`)*
- [x] `pnpm --filter @intelliflow/db exec tsc --noEmit` *Verified 2026-10-21 via the package `typecheck` script (same tsc, plus its generated-client prep): tdd/tsc-db-final.txt exit 0*

#### Step 14: API: helpers, event-types router, public booking, registration
**Type:** implementation
**Files to Create:**
- `apps/api/src/security/html-escape.ts`: NEW. `escapeHtml` exists only in `apps/ai-worker` and `apps/web/src/lib`
  (`email-handler.ts`, `welcome-email.ts`, `pdf.ts`), which `apps/api` cannot import. Checked, not reused.
- `apps/api/src/modules/calendar/booking-abuse.ts`
- `apps/api/src/modules/calendar/booking-email.ts`
- `apps/api/src/modules/lead/lead-scoring-enqueue.ts`
- `apps/api/src/modules/legal/appointment-side-effects.ts`
- `apps/api/src/modules/calendar/event-types.router.ts`
- `apps/api/src/modules/calendar/public-booking.router.ts`

**Files to Modify:**
- `apps/api/src/modules/lead/lead.router.ts` (call `enqueueLeadScoring`; remove the inline IIFE)
- `apps/api/src/modules/legal/appointments.router.ts` (import the extracted `onAppointmentCreated`; `eventTypeId` input +
  check + post-write)
- `apps/api/src/modules/calendar/calendar.router.ts` (nest `eventTypes`)
- `apps/api/src/router.ts` (`publicBooking`)
- `apps/api/src/workflow/dsar-workflow.ts` (booker fields export/erase by `subjectEmail`)
- `.env.example` (`BOOKING_IP_SALT`)

**Requirements:**
- [x] Consumers: `public-booking.router.ts` imports `booking-abuse.ts`, `booking-email.ts`, `lead-scoring-enqueue.ts` *Verified tdd/green-api.txt 1983/1983 (calendar, lead, legal, security), tsc api clean, eslint clean, codex PASS (codex-13.txt), commit 880575912; ADR-083 DB-role citation pending (Step 18)*
  and `appointment-side-effects.ts`; `booking-email.ts` imports `security/html-escape.ts`.
- [x] The role check reuses `isAvailabilityAdminRole`.
- [x] Audit logger on create/update/delete/setBookingLink.
- [x] The public lookup is a single `findFirst` with the allowlist select and the gate fields.
- [x] The book transaction exactly follows spec step 5.
- [x] Post-commit work is detached with `void promise.catch(log)` and no PII in logs.
- [ ] ADR-083 is updated with where the API DB role (BYPASSRLS) is configured: grep `DATABASE_URL` role/`postgres` in
  infra/Railway docs, or `docs/operations/*`, and cite the file.

**Validation:**
- [x] GREEN: Steps 5, 6 and 7 commands → `green-api.txt`
- [x] `pnpm --filter @intelliflow/api exec tsc --noEmit`
- [x] Container/context check: no new container service. `adapters.notificationService` resolves to the mock in tests.
  Runtime check: `grep -n "publicBooking\|eventTypes" apps/api/src/router.ts apps/api/src/modules/calendar/calendar.router.ts`.

#### Step 15: Web: event types page
**Type:** implementation
**Files to Create:**
- `apps/web/src/app/calendar/event-types/EventTypesContent.tsx`
- `apps/web/src/app/calendar/event-types/EventTypesLoading.tsx`
- `apps/web/src/app/calendar/event-types/components/EventTypeList.tsx`
- `apps/web/src/app/calendar/event-types/components/EventTypeDialog.tsx`
- `apps/web/src/app/calendar/event-types/components/BookingLinkCard.tsx`
- `apps/web/src/components/calendar/event-type-colors.ts`

**Files to Modify:**
- `apps/web/src/app/calendar/event-types/page.tsx`
- `apps/web/src/components/calendar/CalendarSettingsPanel.tsx`

**Requirements:**
- [x] Shared component reuse, at verified locations: *Verified 2026-10-21: tdd/green-web-settings.txt 34/34; DeleteTypeDialog + event-type-colors reused*
  - `PageHeader` → `@/components/shared/page-header`; `SectionHeader` → `@/components/shared/section-header`
    (ContactTypesContent.tsx:16-17).
  - `Button, Card, Label, RadioGroup, RadioGroupItem, toast, Checkbox, Dialog*, Input, Switch`, plus `EmptyState` →
    `@intelliflow/ui` (ContactTypesContent.tsx:12; ContactTypeDialog.tsx:11-25).
  - Delete confirmation → **`@/components/settings/DeleteTypeDialog`**, the shared component that
    DeleteContactTypeDialog.tsx:7-10 wraps. It replaces the spec's "ConfirmationDialog" wording. Same behaviour,
    reused rather than re-implemented.
  - Swatches → `lib/color-tokens.ts` via `event-type-colors.ts` (the `contact-type-colors.ts` pattern).
  - Before creating any component, grep `apps/web/src/components/shared` and `apps/web/src/components/settings` for
    "color", "swatch", "combobox", "user select" and record the result.
- [x] Material Symbols only. Tokens only, no raw hex.
- [x] Consumers: `EventTypeList.tsx` and `EventTypeDialog.tsx` import `components/calendar/event-type-colors.ts`.

**Validation:**
- [x] GREEN: `pnpm --dir apps/web exec vitest run src/app/calendar/event-types` → `green-web-settings.txt`

#### Step 16: Web: appointment picker + public booking page + shells
**Type:** implementation
**Files to Create:**
- `apps/web/src/app/(public)/book/[handle]/[slug]/page.tsx`
- `apps/web/src/app/(public)/book/[handle]/[slug]/BookingContent.tsx`
- `apps/web/src/app/(public)/book/[handle]/[slug]/loading.tsx`

**Files to Modify:**
- `apps/web/src/components/appointments/AppointmentForm.tsx`
- `apps/web/src/app/appointments/new/page.tsx`
- `apps/web/src/app/(public)/_components/PublicLayoutShell.tsx`
- `apps/web/src/components/navigation.tsx`
- `apps/web/src/app/robots.ts`
- `apps/web/src/lib/leads/lead-form-utils.ts` (conditional: only if `tsc` or the grep shows an exhaustive LeadSource map)
- `apps/web/src/lib/shared/filter-utils.ts` (conditional, same)
- `apps/web/src/components/leads/lead-detail.tsx` (conditional, same)
- `apps/web/src/components/shared/activity-feed/ActivityFeedFilters.tsx` (conditional, same)

**Requirements:**
- [x] L11: `BookingContent` has no server-only imports. It imports schemas from `@intelliflow/validators/event-types` *Verified 2026-10-21: tdd/green-web.txt, tdd/tsc-web.txt exit 0; commit 978e12fae*
  (the subpath added in Step 11), never the root barrel.

**Validation:**
- [x] GREEN: the Step 9 command → `green-web.txt`
- [x] `pnpm --filter @intelliflow/web exec tsc --noEmit` (slot wrapper)

### Phase 3 — REFACTOR, docs, registries, tracking

#### Step 17: Refactor pass + red flags
**Type:** refactor
**Files to Create:**
- `.specify/sprints/sprint-18/execution/PG-203/PG-203-findings.md`

**Files to Modify:**
- `artifacts/metrics/debt-ledger.yaml`
- `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv` (follow-up task rows written by `/create-task`)
- no new source files; the refactor touches only the files created or modified in Steps 10-16

**Refactor:**
- [x] Remove duplication between `listSlots` and the `book` re-check (one function). *Verified 2026-10-21: listSlots and the book re-check share computeSlots; new code has no istanbul ignore/TODO/skipDuplicates; the only any-typed params are the side-effects helper moved verbatim from main and two appointments.router helpers (ctx.prismaWithTenant is untyped upstream)*
- [x] Check: no `any` in new code, no `istanbul ignore`, no TODO/stub, no skipDuplicates.

**Red flags:** each gets a gh issue (file:line + proposed fix), a debt-ledger entry, and a findings-doc entry in
`.specify/sprints/sprint-18/execution/PG-203/PG-203-findings.md`:
- (a) the playbook "AI defaults false" rule (module-settings-playbook.md:132-136) vs the owner's Q8;
- (b) the PUBLIC tier keys on the leftmost XFF and passes through without Redis (rate-limit.ts:411-424, trpc.ts:91-93);
- (c) placeholder ICS recipients (AppointmentIcsEventHandler.ts:245-258);
- (d) DSAR export/erase keys leads/contacts/accounts by `ownerId = subjectId` (dsar-workflow.ts:299-330, :419-422);
- (e) DSAR router returns `error.message` (dsar.router.ts:114-117).

**Follow-up tasks** via `/create-task` (anti-spam checklist first): booker self-service cancel/reschedule; per-type
notice/horizon; a booker-PII purge rule under the PG-206 retention policies.

**Validation:**
- [ ] `pnpm --filter @intelliflow/api lint`, `pnpm --filter @intelliflow/web lint`,
  `pnpm --filter @intelliflow/domain lint`, `pnpm --filter @intelliflow/validators lint` (slot wrapper)
- [ ] `pnpm run lint:sonar:guard`

#### Step 18: Docs, registries, ADR/PRD, dependency chains
**Type:** docs
**Files to Modify:**
- `docs/design/sitemap.md`
- `docs/design/page-registry.md`
- `docs/design/PAGE_MAP_AND_FLOWS.md`
- `docs/design/information-architecture.md`
- `docs/design/navigation-reachability-audit.md`
- `docs/design/ui-flow-mapping.md`
- `docs/design/content-audit.md`
- `artifacts/reports/content-audit-results.json`
- `docs/architecture/diagrams/complete-dependency-chains.md`
- `docs/architecture/diagrams/legal-scheduling-dependency-chain.md`
- `docs/compliance-and-governance/compliance/vpat-2.5.md`
- `docs/compliance-and-governance/compliance/wcag-conformance-statement.md`
- `docs/planning/prd-module-settings.md`
- `docs/architecture/adr/ADR-083-event-types-public-booking.md`
- `docs/architecture/adr/README.md`

**Changes:**
- [x] Page total 214 → 215 in every doc header listed. *Verified 2026-10-21 (ff814273d): 215 pages (only /book is new; /calendar/event-types replaced a counted stub); new 'Public Booking' section; /book an external entry; routers 70->71, procedures +9; content audit regenerated; ADR README row; dependency chains (PG-203 in progress; PG-211/212/213)*
- [x] `/book` is a **new route prefix**:
  - add a **new "Public Booking" section** to `PAGE_MAP_AND_FLOWS.md` (a section, not a row inside an existing one)
    and update its Summary Statistics;
  - add the route to `sitemap.md`, `page-registry.md`, the IA route table and the `ui-flow-mapping.md` route + router
    rows;
  - add it to `navigation-reachability-audit.md` as "external entry (PG-203)", which is not a waiver.
- [x] Reachability, Category Y (85b evidence):
  - `/calendar/event-types` is in `apps/web/src/components/sidebar/configs/calendar.ts:12` (verified), and the
    `CalendarSettingsPanel.tsx:19` copy is updated in Step 15.
  - `/book/[handle]/[slug]` is reached from the BookingLinkCard URL. Assert this manually with a grep that
    `BookingLinkCard.tsx` builds `/book/${handle}/${slug}`, and record it in the findings doc. `check-nav-wiring` is
    not trusted for `(public)` / route-group pages (false-green history).
- [x] Router and procedure counts change only by our additions (`publicBooking` +3; `calendar.eventTypes` +6).
- [x] Regenerate content audit: `npx tsx tools/scripts/content-audit.ts`.
- [x] PRD addendum status → In Progress, then the delivery note. ADR-083 gets the delivery note and the DB-role
  citation. Add the ADR README row.
- [ ] Dependency chain: PG-203 ⏳ → ✅ at close.
- [x] Design mockup check: no mockup for event types exists in `docs/design/` (`grep -ri "event type" docs/design`).
  Record that, and compare against the PG-205 contact-types page as the visual reference.

**Validation:**
- [x] `pnpm --dir apps/web exec vitest run src/app/__tests__/sitemap-reconciliation.test.ts src/app/__tests__/ia-reconciliation.test.ts src/app/__tests__/ui-flow-mapping-reconciliation.test.ts`
- [x] `pnpm exec vitest run tools/scripts/route-total-consistency.test.ts tools/scripts/__tests__/content-audit.test.ts`
- [x] `node tools/scripts/exec-preflight/check-page-doc-cochange.mjs PG-203` *Verified 2026-10-21: exit 0, but a known false green on route-group pages (gh #877); docs co-change done by hand in ff814273d*
- [x] `node tools/scripts/exec-preflight/check-nav-wiring.mjs PG-203` *Verified 2026-10-21: exit 0 (false green per #877); reachability checked by hand: calendar.ts:12 sidebar entry; BookingLinkCard.tsx builds `/book/<handle>/<slug>`; navigation-reachability-audit.md marks /book as an external entry*

### Phase 4 — VALIDATION

#### Step 19: Full validation, reviews, Lighthouse
**Type:** validation

**Full package suites** (slot wrapper; DB suites `--exclusive intelliflow-db`), each logged to `.txt`:
- [x] `pnpm --filter @intelliflow/domain test` *Verified 2026-10-21: 109 files / 3145 tests passed (validation/test-domain.txt)*
- [x] `pnpm --filter @intelliflow/validators test` *Verified 2026-10-21: 60 files / 2818 passed (validation/test-validators.txt)*
- [x] `pnpm --filter @intelliflow/application test` *Verified 2026-10-21: 59 files / 1501 passed (validation/test-application.txt)*
- [x] `pnpm --filter @intelliflow/db test` *Verified 2026-10-21: 15 files passed, 1 skipped / 224 passed, 14 skipped (validation/test-db.txt)*
- [x] `pnpm --filter @intelliflow/api test` (L5: health-server EADDRINUSE flake → re-run) *Verified 2026-10-21: 318 files / 8043 passed, 18 skipped (validation/test-api.txt); no EADDRINUSE flake*
- [x] `pnpm --dir apps/web exec vitest run` *Verified 2026-10-21: 840 files / 13187 passed (validation/test-web.txt)*
- [x] `pnpm exec vitest run --project integration tests/integration/event-types.test.ts tests/integration/rls-tenant-isolation.test.ts tests/integration/availability.test.ts` *Verified 2026-10-21 on a fresh ephemeral DB: 71/71 (tdd/green-integration.txt)*

**Non-functional checks:**
- [x] NF-001: time 10 local `listSlots` calls (14 days, seeded tenant on the local test DB) and record the p95 in the *Verified 2026-10-22: p95 135.6 ms, median 92.5 ms over 10 runs on a fresh ephemeral DB (tests/integration/event-types.test.ts NF-001 case; tdd/green-integration.txt). Recorded in PG-203-findings.md*
  findings doc. Target < 300 ms.
- [x] NF-004: the lock-timeout cases from Steps 6 and 8 are green. Record the typical lock hold time from the *Verified 2026-10-21: lock-timeout cases green in unit and integration; measured give-up 2046 ms at the 2s lock_timeout (tdd/green-integration.txt)*
  integration run.
- [x] NF-002: a grep of `apps/api/src/modules/calendar/*.ts` shows no logger call with an email, IP or answers. *Verified 2026-10-21: the calendar module's console calls log kinds, step names, codes and error classes only (booking-abuse.ts:69,157; booking-email.ts:199,202; public-booking.router.ts:425,446)*

**Gates:**
- [x] `pnpm run typecheck` *Verified 2026-10-21 after both main merges: 38/38 (validation/typecheck.txt; code-review run 20261022-003840 also 38/38, 0 TS errors)*
- [x] `pnpm run lint` *Verified 2026-10-21: 36/36 (validation/lint.txt); lint-promises gate PASS after 95d630c9c*
- [x] Build: `pnpm --filter @intelliflow/api build` and `pnpm --filter @intelliflow/web build` (slot wrapper). *Verified 2026-10-21: api and web builds exit 0 (validation/build-api.txt, build-web.txt); /book/[handle]/[slug] (dynamic) and /calendar/event-types (static) in the route table*
- [x] Diff coverage ≥ 80% on changed lines, via `/exec-coverage` after. Fix gaps with unit tests, never with ignore *Verified 2026-10-22: pre-ship diff-coverage PASS, TOTAL new_coverage 88.1% (1254/1424) on a fresh ephemeral DB (validation/preship-subset3.txt); low files noted in the PR 1 slice report*
  comments.
- [x] `node scripts/codex-review.mjs`, iterated to exit 0. Real bugs get minimal fixes. False positives are waived in *Verified: iterated to PASS (codex-1..34); waivers recorded in tools/audit/codex-review-waivers.yaml with tracked issues*
  `tools/audit/codex-review-waivers.yaml` with evidence (L3: `git show HEAD:<file>` to confirm a cited line exists).

**Reviews:**
- [x] `/code-review` on the diff and `/sonarqube-fix` for any new Sonar finding. *Verified 2026-10-22: quick run 20261022-003840-6381ca72 — 0 TS errors, lint clean; local sonar guard clean on every commit; SonarCloud runs in CI*
- [x] `a11y-expert` subagent WCAG 2.1 AA review of the three UI surfaces. Fix the findings. *Verified 2026-10-21: FAIL/REJECTED then fixed in ff814273d; details in PG-203-findings.md "Step 19 reviews"*
- [x] `security-lead` subagent adversarial review of `public-booking.router.ts`, `booking-abuse.ts` and `booking-email.ts` *Verified 2026-10-21: FAIL/REJECTED then fixed in ff814273d; details in PG-203-findings.md "Step 19 reviews"*
  (runner request). Fix the findings.

**Lighthouse ≥ 90:**
- [ ] `/calendar/event-types` via `lighthouserc.authenticated.js` + `tools/lighthouse/lhci-auth.js` (PG-198 Path C, *NEEDS_HUMAN 2026-10-21: auth-gated; an anonymous run lands on /login. Path C needs local API + Supabase + seeded admin without production credentials (local-run-note.md)*
  local stack).
- [x] `/book/<seeded-handle>/<slug>` via a production build plus a seeded tenant, local test DB only. *Verified 2026-10-21: /book measured on a production build in its not-available state (perf 93, a11y 100); artifacts/lighthouse/PG-203/book.report.json + local-run-note.md. Seeded slot/form states need a reachable API (NEEDS_HUMAN)*
- [x] Evidence JSON goes under the execution folder. If it cannot be measured → NEEDS_HUMAN with the exact reason. *Done: artifacts/lighthouse/PG-203/ (Gate 14 location) with the run note; NEEDS_HUMAN reasons recorded*

**Final check:**
- [x] Icons: run the Material Symbols subset verify (`node scripts/subset-material-symbols.mjs --verify`; find the *Verified 2026-10-21: `node tools/scripts/subset-material-symbols.mjs --verify` -> audit OK, 371 icons (check_circle already in the subset)*
  exact path with `ls scripts | grep -i symbol`). Regenerate the subset if new icon names were added.
- [x] `git ls-files | grep -cE '\.(log|coverage|tsbuildinfo)$'` prints `0`. *Verified 2026-10-21: prints 0*

#### Step 20: Attestation, tracking, close
**Type:** validation
**Files to Modify:**
- `.specify/sprints/sprint-18/attestations/PG-203/attestation.json`
- `.specify/sprints/sprint-18/attestations/PG-203/task-tracking.json`
- `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`
- `apps/project-tracker/docs/metrics/_global/Sprint_plan_I.csv`
- `docs/architecture/diagrams/complete-dependency-chains.md`

**Attestation and tracking:**
- [ ] `/exec-gates`: every gate PASS, or NEEDS_HUMAN with a reason (Lighthouse if unmeasurable; migration gates 4/10).
- [ ] `/exec-attestation` writes `attestation.json`. A stale INCOMPLETE verdict is replaced, never left.
- [ ] CSV: status set only by /exec Phase 5. Regenerate splits: `npx tsx tools/scripts/split-sprint-plan.ts`.
  Regenerate context: `npx tsx apps/project-tracker/scripts/generate-context.ts`.
- [ ] Update the CSV artifacts column via Category A (evidence): add the public router/page, the migrations and ADR-083
  to "Artifacts To Track". Correct the stale pre-req `FILE:apps/web/src/components/sidebar/configs/appointments.ts`
  to `configs/calendar.ts`.

**Close:**
- [ ] Deliverable Verification: every Files Summary path exists; CSV ARTIFACT/EVIDENCE exist; attestation verdict.
- [ ] SendMessage `projects-8c`: status, last SHA, attestation path, **6 Prisma migrations (L13)**, NEEDS_HUMAN list.

## Validation Matrix

| Scope | Purpose | Command |
|---|---|---|
| Domain new | slots, constants | `pnpm --filter @intelliflow/domain exec vitest run src/legal/appointments/__tests__/listOpenSlots.test.ts src/legal/appointments/__tests__/event-types.test.ts` |
| Validators new + enum | schemas, BOOKING parity | `pnpm --filter @intelliflow/validators exec vitest run src/__tests__/event-types.test.ts __tests__/enum-consistency.spec.ts` |
| Application | createLeadInTransaction + createLead regression | `pnpm --filter @intelliflow/application exec vitest run src/services/__tests__/LeadService.createLeadInTransaction.test.ts src/services/__tests__` |
| API new | routers, abuse, email, escape, enqueue | `pnpm --filter @intelliflow/api exec vitest run src/modules/calendar src/security/__tests__/html-escape.test.ts src/modules/lead/__tests__/lead-scoring-enqueue.test.ts` |
| API touched | appointments, lead, DSAR | `pnpm --filter @intelliflow/api exec vitest run src/modules/legal/__tests__/appointments.router.test.ts src/modules/lead src/workflow` |
| Integration (DB) | constraints, RLS, lock, outbox | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-203 --exclusive intelliflow-db -- pnpm exec vitest run --project integration tests/integration/event-types.test.ts tests/integration/rls-tenant-isolation.test.ts tests/integration/availability.test.ts` |
| Web new | settings page, booking page | `pnpm --dir apps/web exec vitest run src/app/calendar/event-types "src/app/(public)/book"` |
| Web touched | form, shells, robots, proxy, counts | `pnpm --dir apps/web exec vitest run src/components/appointments src/app/__tests__ src/__tests__/root-proxy.test.ts "src/app/(public)/_components" src/components/__tests__` |
| Tools | route totals, content audit | `pnpm exec vitest run tools/scripts/route-total-consistency.test.ts tools/scripts/__tests__/content-audit.test.ts` |
| Full packages | regression | the `pnpm --filter <pkg> test` commands in Step 19 (slot wrapper) |
| Type / lint / build | gates | `pnpm run typecheck`; `pnpm run lint`; `pnpm --filter @intelliflow/api build`; `pnpm --filter @intelliflow/web build` |
| Semantic | codex | `node scripts/codex-review.mjs` |
| Exec preflight | page/nav co-change | `node tools/scripts/exec-preflight/check-page-doc-cochange.mjs PG-203`; `node tools/scripts/exec-preflight/check-nav-wiring.mjs PG-203`; `node tools/scripts/exec-preflight/check-plan-reviewer-subagent.mjs PG-203` |

## Integration Checkpoints Summary

| After Step | Verification | Command |
|---|---|---|
| 9 | all RED logs exist, each failing for the right reason | `ls .specify/sprints/sprint-18/execution/PG-203/exec-PG-203-*/tdd/red-*.txt` |
| 10–12 | packages compile + build | `pnpm --filter @intelliflow/{domain,validators,application} exec tsc --noEmit` |
| 13 | migrations apply on local test DB; integration green | Step 8 command |
| 14 | API green + tsc | Steps 5–7 commands; `pnpm --filter @intelliflow/api exec tsc --noEmit` |
| 16 | web green + tsc | Step 9 command; `pnpm --filter @intelliflow/web exec tsc --noEmit` |
| 18 | registries consistent | reconciliation + route-total tests |
| 19 | full gates | Validation Matrix |

## Acceptance Criteria Traceability

| AC / NF | Steps (test → impl) |
|---|---|
| AC-001 page | 9 → 15 |
| AC-002 EmptyState/CTA | 9 → 15 |
| AC-003 roles | 5, 9 → 14, 15 |
| AC-004 validation | 3, 5 → 11, 14 |
| AC-005 host | 5, 9 → 14, 15 |
| AC-006 delete tx | 5, 8 → 13, 14 |
| AC-007 booking link | 3, 5, 9 → 11, 14, 15 |
| AC-008 forwardRef | 9 → 15 |
| AC-009 isActive | 2, 5, 6, 9 → 10, 14, 16 |
| AC-010 picker | 7, 9 → 14, 16 |
| AC-011 slots | 2, 6, 9 → 10, 14, 16 |
| AC-012 book tx/lock | 6, 8 → 13, 14 |
| AC-013 tenant scope | 3, 6, 8 → 11, 14 |
| AC-014 identical NOT_FOUND | 6 → 14 |
| AC-015 input | 3, 6 → 11, 14 |
| AC-016 emails | 6 → 14 |
| AC-017 caps/salt | 6, 8 → 13, 14 |
| AC-018 leads | 4, 6, 8 → 12, 14 |
| AC-019 AI scoring | 6, 7 → 14 |
| AC-020 DTO allowlist | 6 → 14 |
| AC-021 robots/noindex/chrome | 9 → 16 |
| AC-022 GDPR/DSAR | 6, 7 → 14 |
| AC-023 cross-tenant | 5, 6, 8 → 13, 14 |
| AC-024 migrations | 8 → 13 |
| AC-025 registries/ADR/PRD/follow-ups | 9 → 17, 18 |
| AC-026 WCAG | 9 → 15, 16, 19 (a11y-expert) |
| AC-027 Lighthouse | 19 |
| NF-001 listSlots perf | 2 (bounded queries asserted in 6) → 14; measured in 19 (timed local call, recorded) |
| NF-002 no PII logs | 6 → 14 |
| NF-003 L11 | 16, 19 (web build) |
| NF-004 lock duration | 6 (55P03 → CONFLICT), 8 (short lock_timeout) → 14; checked in 19 |

## Boolean toggles (playbook §8)

| Boolean | Category | Consumer |
|---|---|---|
| `EventType.isActive` | 1 (wired) | `listActive` (picker), public lookup `isActive: true`, list badge |

There are no AI toggles (owner Q8/Q9). The playbook §7 deviation is tracked as red flag (a).

## Plan-Reviewer Sign-off

<!-- plan-reviewer: subagent -->
reviewer_subagent: plan-reviewer (Task subagent, .claude/agents/plan-reviewer.md), lead session f7d22516-a758-41d6-8916-a2c4accfdecc

| Pass | Verdict | Findings | Resolution |
|---|---|---|---|
| 1 | REVISE | 8 ERROR, 7 WARN, 3 INFO (enum test path + GREEN order; validators lead.ts; validators subpath export; sitemap test; NF-004 tests; appointments/new page test; effort counts; PAGE_MAP new section; plus named test files, consumers, icons, prose paths, NF checkboxes, Category Y, CSV FILE:, escapeHtml) | all 17 applied; shared `DeleteTypeDialog` reuse added |
| 2 | **APPROVE** | 0 ERROR, 1 WARN (conditional-entry count wording) | fixed (5 conditional entries) |

Reviewer category verdicts (final, after pass 2; transcribed from the subagent reports):

| Cat | Name | Result |
|---|---|---|
| A | Files Summary accuracy | PASS (pass 2: 24 create, 26 modify, 17 test-create, 14 test-modify, 17 docs) |
| B | AC/NF traceability | PASS (AC-021 sitemap and NF-004 added) |
| C | Test file completeness | PASS |
| D | Test case coverage | PASS |
| E | Spec value consistency | PASS |
| F | Accessibility | PASS |
| G | Type/interface location | PASS (validators subpath export) |
| H | Dependencies | PASS |
| I | Hook/utility coverage | PASS |
| J | CSV alignment | PASS (stale FILE: inputs corrected in Step 20) |
| K | Effort estimates | PASS |
| L | Design mockup | PASS |
| M | NF in validation | PASS |
| N | Dependency chain | PASS |
| O | Backend prerequisites | PASS |
| P | Shared components | PASS (verified locations; DeleteTypeDialog reuse) |
| Q | Risk mitigation | PASS |
| R | Layer order | PASS (enum GREEN moved to Step 13) |
| S | Checkpoints | PASS |
| T | Structure | PASS |
| U | Coverage targets | PASS |
| V | Test count arithmetic | PASS |
| W | Integration points | PASS |
| X | Internal vs shared | PASS |
| Y | UI Reachability | PASS: `/calendar/event-types` in `apps/web/src/components/sidebar/configs/calendar.ts:12` (`href '/calendar/event-types'`); CalendarSettingsPanel link updated in Step 15; `/book/[handle]/[slug]` external entry via BookingLinkCard URL (manual grep assertion, Step 18) |
| Z | Internal contradictions | PASS |
| AA | Backend/frontend type parity | PASS |
| BB | PRD/ADR | PASS (`prd-module-settings.md` PG-203 Addendum; ADR-083 Accepted) |
| CC | Page doc co-change | PASS (new Public Booking section in PAGE_MAP) |
| DD | Exhaustive vs sampling | PASS |
| EE | Duplicates | PASS |
| FF/GG | Import chain / wiring | PASS (consumers stated) |
| HH | Icons | PASS (subset verify step) |
| II | Empty state | PASS |

Category Y (UI reachability): PASS. Sidebar `apps/web/src/components/sidebar/configs/calendar.ts:12`; public page is an
external entry via the BookingLinkCard URL.
Category BB (PRD/ADR): PASS. PRD PG-203 addendum; ADR-083 Accepted.


---

## Plan Addendum A: DSAR end to end (PR 2, branch `feat/pg-203-dsar`)

Source: spec "Addendum A" plus the round 3 and round 4 amendments and the sign-off conditions 1-8 (3/3 APPROVED,
2026-10-22). Owner rulings: Q13, Q14, Q16-Q19. Runner rules: a separate PR cut from PR 1's head, tests in every
layer, and the runner is told before any scope cut.

Layer order is domain → validators → db → application → adapters → api → enforcement points → scheduler → web →
docs. Each step is RED first; its log goes under `exec-PG-203-20261020/tdd/dsar/`.

### Preflight

- [ ] The DSAR worktree builds: `pnpm --filter @intelliflow/{domain,validators,application} build`, then
  `pnpm --filter @intelliflow/db run db:generate`.
- [ ] Characterisation: run the DSAR tests that exist today
  (`apps/api/src/workflow/__tests__/dsar-workflow.test.ts`, `dsar-search-purge.test.ts`,
  `apps/api/src/modules/privacy/__tests__/dsar.router.test.ts`, `tests/compliance/data-governance.spec.ts`) and keep
  the log as the baseline. Note which assertions in `dsar-search-purge.test.ts` must be ported (embedding and
  search_vector purge).
- [ ] Read `tests/architecture/tenant-procedure-enforcement.test.ts` and record which allowlist rule applies to a
  public-only router file (sign-off condition: decide on the `dsar.router.ts` entry from the test itself).
- [ ] Grep every AI-scoring and embedding caller (`enqueueLeadScoring`, `scoreLead`, `ContactEmbed`,
  `AutoResponseDraft.create`, `draftMessage`) and confirm the six enforcement points against the code.

### Step D1: Domain (`packages/domain/src/legal/privacy/`)
**Files to Create:** `dsar.ts` and `__tests__/dsar.test.ts`
- [ ] Constants: `DSAR_REQUEST_TYPES`, `DSAR_STATUSES`, `DSAR_SOURCES`, `DSAR_IDENTITY_METHODS`,
  `DSAR_OBJECTION_SCOPES`, `RESTRICTION_KINDS`, and `DSAR_LIMITS`:
  - verify 24 h, export 72 h, max downloads 5;
  - caps 3/24 h per tenant+email, 10/h per IP, 3/24 h global;
  - resend cooldown 1 h;
  - single-admin erasure pause 24 h;
  - overdue repeat 3 d;
  - SLA warn window 7 d;
  - backdate at most 30 d.
- [ ] `addCalendarMonths(date, n)` with the end-of-month clamp (31 Jan + 1 → 28/29 Feb), and
  `effectiveDeadline({slaDeadline, extendedUntil})`.
- [ ] `normalizeSubjectEmail` (trim + lowercase, exact). `isErasedEmail` (`@erased.invalid`).
- [ ] State rules as pure functions:
  - `canExtend`: VERIFIED, before the original deadline, 1 or 2 months;
  - `rejectionIsLate`;
  - `accessCompletesAtVerify(counts)`: true only when every withheld count is 0;
  - `staffErasureMayRun({adminCount, createdById, resolvedById, createdAt, now})`.
- [ ] RED → GREEN: `pnpm --filter @intelliflow/domain exec vitest run src/legal/privacy`

### Step D2: Validators (`packages/validators/src/dsar.ts`, plus a subpath export)
- [ ] Strict public schemas:
  - `dsarFirmLookupSchema`;
  - `dsarSubmitSchema`: handle, type, email, details ≤ 2000 with control characters stripped, `consent: true`,
    `__honeypot`, and `objectionScope` required when the type is OBJECTION;
  - `dsarVerifySchema` / `dsarDownloadSchema`: requestId cuid, token base64url of 43 characters.
- [ ] Admin schemas:
  - `logRequest`: `receivedOn`; `receivedOnReason` required when `receivedOn` is before today; `identityMethod`;
    `identityNote` ≥ 20 characters.
  - `complete`: a discriminated union by type. ERASURE requires `noHoldConfirmed: true`. A MARKETING objection
    requires `marketingStoppedConfirmed: true` and `marketingStopMethod` ≥ 10 characters.
  - `completeAccess`: `withheld[{category, count, reason}]`.
  - `extend`, `reject`, `cancelErasure`, `liftRestriction`, `revokeExport`, `exportData`, `list`.
  - `restrictionFor({entity: 'lead'|'contact', id})`.
- [ ] An enum-consistency block against Prisma (the PG-203 pattern).
- [ ] RED → GREEN: `pnpm --filter @intelliflow/validators exec vitest run src/__tests__/dsar.test.ts`

### Step D3: DB: schema plus a Class A migration (L13)
**Files:** `packages/db/prisma/schema.prisma` (no reformat) and `migrations/20261022120000_dsar_requests/migration.sql`
- [ ] Enums `DsarRequestType` and `DsarRequestStatus`.
- [ ] `dsar_requests`, with every column in spec R2, R3 and R4 (`capEmailHash`, `exportIssuedAt`,
  `exportDownloads`, `receivedOn`, `receivedOnReason`, `identityMethod`, `objectionScope`, `clockBreached`,
  `marketingStopMethod`), named CHECKs, hash CHECKs, and pair CHECKs (export hash with expiry; STAFF requires an
  identity note).
- [ ] `processing_restrictions`, with `kind`, `blocksMarketing`, `dsarRequestIds TEXT[]`, a partial unique index
  `(tenantId, subjectEmail) WHERE liftedAt IS NULL`, and RLS USING + WITH CHECK in the `DO $$` block.
- [ ] User FKs with SET NULL; the tenant FK with CASCADE; `(tenantId, id)` unique.
- [ ] Remove the ADR-007 note in `schema.prisma` that claims raw-SQL DSAR tables.
- [ ] An independent SQL review (a data-engineer subagent, read-only, on an ephemeral DB) that must return APPROVED
  before Step D5's integration tests are written.
- [ ] `pnpm --filter @intelliflow/db typecheck`, and `migrate deploy` on an ephemeral DB (log
  `tdd/dsar/migrate-deploy.txt`).

### Step D4: Application (`packages/application/src/`)
**Files to Create:**
- `ports/repositories/DsarRepositoryPort.ts`
- `ports/repositories/SubjectDataPort.ts`
- `ports/repositories/ProcessingRestrictionPort.ts`
- `ports/external/DsarNotificationPort.ts`
- `services/DataSubjectRequestService.ts`, plus tests using in-memory fakes

**Requirements:**
- [ ] Use cases:
  - `submitPublic`: the honeypot never reaches the service; caps; cooldown; send detached on both paths.
  - `verify`: dummy-hash compare; single-use; VERIFIED; deadline; RESTRICTION row at verify; auto-export issue;
    completes only on zero counts.
  - `downloadExport`: cap of 5; binding; expiry.
  - The admin use cases: `logRequest`, `extend`, `complete`, `completeAccess`, `reject` (late flag), `cancelErasure`,
    `liftRestriction` (email first), `revokeExport`, `exportData`.
  - `restrictionStatus`.
- [ ] Restriction upsert and merge (sign-off 1): OR on `blocksMarketing`, append the request id; a RESTRICTION
  followed by an OBJECTION leaves one active row.
- [ ] `LeadService.scoreLead` checks `ProcessingRestrictionPort.isRestricted(tenantId, email)` and returns a typed
  `ProcessingRestrictedError`. It is wired with a no-op default so existing constructors keep compiling. The bulk
  path is covered.
- [ ] `pnpm --filter @intelliflow/application exec vitest run src/services/__tests__/DataSubjectRequestService.test.ts src/services/__tests__/LeadService*.test.ts`

### Step D5: Adapters (`packages/adapters/src/repositories/`)
- [ ] `PrismaDsarRepository`.
- [ ] `PrismaProcessingRestrictionRepository`: the upsert merge, and moving a restriction on an email edit.
- [ ] `PrismaSubjectDataRepository`:
  - **Export.** Per-category allowlists, a 500-row cap, the withheld-category counts, and
    `processingInformation` built from the firm's name and privacy URL.
  - **Erasure.** One `$transaction`. The request is re-read `FOR UPDATE`. Matching is by `lower(btrim(email))` in
    raw SQL. Every Q19 column rule is applied, with the R3 fixes: ContactActivity description becomes the string
    `Erased activity`, LeadFile url becomes NULL, and AIInsight, AIScore, LeadAIInsight and ContactAIInsight rows are
    deleted. Embeddings and search vectors are set to NULL. Counts are returned for the checklist (communications,
    ContactReplyDraft, CalendarEvent, ExperimentAssignment).
- [ ] Real-DB integration tests: `tests/integration/dsar.test.ts`.
  - Migration SQL: the `ensureMigrationSql` pattern.
  - Constraints: CHECKs and the partial unique index.
  - RLS: a non-bypass session cannot see another tenant's rows.
  - The global cap counts plus-tag variants and other tenants' rows.
  - Export scope: another tenant's rows and `+tag` rows are not included.
  - Erasure: covers every column, rolls back fully on failure, and a second run is a no-op.
  - Restriction merge.
  - Ported assertions from `dsar-search-purge.test.ts`.
- [ ] Guard test: every Prisma delegate the DSAR adapters use exists on the generated client.
- [ ] RED → GREEN: `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-203 --exclusive intelliflow-db -- pnpm test:db:run -- pnpm exec vitest run --project integration tests/integration/dsar.test.ts`

### Step D6: API (`apps/api/src/modules/privacy/`)
**Files to Create:**
- `privacy-public.router.ts` and `privacy-admin.router.ts`
- `dsar-email.ts` (fixed templates; escaped; no visitor text; ICO wording; honest objection wording)
- `dsar-token.ts` (HMAC key `HMAC(BOOKING_IP_SALT, 'dsar-token-v1')`; `timingSafeEqual`; dummy hash)

**Files to Modify:**
- `apps/api/src/router.ts`: `privacy: mergeRouters(privacyPublicRouter, createTRPCRouter({ admin: privacyAdminRouter }))`
- `container.ts` and `context.ts`: service, adapters and notification port, with a runtime check
- `security/types.ts` and `rbac.ts`: the `dsar_request` resource
- the `tests/architecture` allowlist, as decided in the preflight

**Files to Delete (replacement, not addition):**
- `apps/api/src/workflow/dsar-workflow.ts` and its `workflow/index.ts` exports
- `apps/api/src/modules/privacy/dsar.router.ts`
- the three old DSAR test files
- the DSAR parts of `tests/compliance/data-governance.spec.ts` (the rest of the file stays)

**Requirements:**
- [ ] The per-IP limiters `bookingLookupLimiter` and `bookingSubmitLimiter` (from `booking-abuse.ts`), keyed by
  `ipHashOf`, run before any read on all four public procedures.
- [ ] `getFirm`: the same single handle read, and the same NOT_FOUND for an unknown handle or booking off.
- [ ] Every admin procedure uses `adminTenantProcedure`. Every `where` uses the context tenantId. A foreign id gives
  NOT_FOUND.
- [ ] Audit: awaited for erasure, with counts only. The late-rejection flag is set on `clockBreached`.
- [ ] A log-capture test: no DSAR mutation body reaches any logger.
- [ ] Router tests: authz (MANAGER and another tenant's ADMIN), the state machine, honeypot, caps, timing parity,
  and the emails (stubbed adapter; Resend is never called).
- [ ] `pnpm --filter @intelliflow/api exec vitest run src/modules/privacy`

### Step D7: Restriction enforcement points (sign-off 7 and 8)
- [ ] `lead.router.ts` create and `public-booking.router.ts` `afterBooking` check before calling
  `enqueueLeadScoring`.
- [ ] `scoreWithAI`, through `LeadService.scoreLead` (Step D4).
- [ ] `apps/ai-worker/src/workers/contact-embed-worker.ts` `processForTenant` skips a restricted email.
- [ ] `apps/ai-worker/src/jobs/scoring.job.ts` `processScoringJob`, after the feature-flag gate. It re-reads the lead
  and skips when the lead is missing, erased, has a different email, or is restricted. This covers
  `handleScheduledDispatch`.
- [ ] Both `AutoResponseDraft.create` sites in `autoresponse.router.ts`.
- [ ] `apps/api/src/agent/tools/draft-message.ts`.
- [ ] A test per point, with the AI-worker tests run in the ai-worker project.
- [ ] The restriction follows the record: the lead and contact update use cases move it. Then check bulk import and
  sync, and either cover them or document them (sign-off 4).

### Step D8: SLA scheduler
**Files:** `apps/api/src/modules/privacy/dsar-sla-scheduler.ts`, plus wiring in `http-server.ts`
- [x] It uses its own interval and env guard (`DSAR_SLA_INTERVAL_MS`), is disabled under test and on serverless,
  and uses `pg_try_advisory_xact_lock`.
- [x] Claims use `FOR UPDATE SKIP LOCKED`. `slaAlertedAt` is set after a successful send. Overdue alerts repeat
  every 3 days.
- [x] Alerts go to ADMINs, falling back to the owner, else an error log with the tenant id only. No PII.
- [x] Tests use a fake clock.

**Done (2026-10-24):** `dsar-sla-scheduler.ts` (interval, sweep, Prisma store, deps), started from
`startApiServer` and stopped on SIGTERM in `main.ts`; `buildAdminSlaEmail` in `dsar-email.ts`;
`DSAR_SLA_INTERVAL_MS` in `.env.example`.
- The schema has no tenant owner field, so "the owner" is the firm's earliest-created active user (the account
  that set it up), with the same revoked-membership filter as the admin lookup.
- A request alerted for an earlier deadline gets a fresh alert when an extension moves it into a new 7-day window.
- Codex (HIGH, batch starvation): a request that could not be alerted (send refused, nobody to alert) is put aside
  in the process for 6 hours and the claim leaves it out, so 50 undeliverable requests cannot block the rest.
- Codex (MEDIUM, transaction timeout): each request is claimed, alerted and marked in its own short transaction
  (60 s, one send), so a slow provider cannot roll back the markers of alerts already sent. A tick sends at most 50
  and stops if another replica takes the lock.
- Codex on earlier PR 2 code: RAG ticket search now also checks each ticket's linked contact (erased or restricted)
  (fixed; `retrieval-service.test.ts`); a refused rejection/completion email is not retried (#1014, waived).
- Codex (HIGH): opportunity predictions now follow the deal's contact, like insights (Q22): checked before the
  model, re-checked under the contact's locks after it, and the churn alert is written under those locks; a deal
  with no contact is about no one, and a missing deal fails closed (`insights-predictions-data-requests.test.ts`).
- Codex (MEDIUM): the erasure checklist counts notifications about the person's deals too (`subjectDealIds`,
  shared with `subjectInsightWhere`; real-DB test). Codex (HIGH) on conversation/message RAG: the Q11 scope-out
  above stands; tracked in #1015 and waived.
- Codex (HIGH x2): a contact update without an email now checks the stored contact (erased, restricted or gone:
  no embedding); `autoresponse.regenerate` checks the lead as it is now (erased or restricted at its new address:
  refused; gone: NOT_FOUND), and so does `create` (codex MEDIUM). RED shown on the old router.
- Codex (MEDIUM, fail-open): when the locked re-check throws (a lock timeout), the scoring and prediction jobs
  return no result (`UNVERIFIED` / `eligibility-unverified`). Three prediction suites that wrote to an unmocked
  client (the failure was swallowed before) now mock the insight tables in memory.
- Codex (MEDIUM): the export counts contact reply drafts and auto-response drafts under MESSAGE_BODIES withheld, so
  an export is never marked complete with them left out. The extension email gap joins #1014 (waived).
- Codex (HIGH): RAG also leaves out the addresses of completed erasure requests (`erasedSubjectEmails`), so a
  retained ticket with no linked contact that still carries an erased person's address is never retrieved.
- Codex (HIGH, D10 round): a failed erasure audit row is retried once, then logged with the request id and counts,
  and the committed erasure and its checklist are still returned (throwing lost the checklist; a retry was a
  CONFLICT). Codex (MEDIUM): auto-completed access export versus a later download, #1020 (waived).
- Codex (HIGH): contact enrichment refuses a seed whose address is not the one the guard just checked, so an older,
  now-restricted address never reaches the provider. AI-created task copies after erasure: #1010 (waived again).
- Codex (MEDIUM): cancelling an erasure after its deadline records `clockBreached`, like a late rejection.
- Codex (MEDIUM): the insight AI_AGENT audit entry is written after the locked insight write commits, not inside
  it, so the audit adapter's own connection cannot starve on a pool of one.
- Codex (MEDIUM): nothing after a committed transition throws any more: the firm lookups after verify, extend,
  reject, cancel and completion fall back to "the firm", and a failed export issue at verify leaves the request open
  for `exportData`. A thrown error there lost the erasure checklist or a used verification link.
- Codex (HIGH): a prediction whose queued context names another address than the person's current one is skipped
  (as for enrichment). Codex (MEDIUM): RAG recall when restricted matches fill the 100-row window, #1021 (waived).
- Codex (LOW): the public submission caps count public-form rows only, so requests staff logged never block the
  person's own request. Plan revision 1 must-fix 3 docs: flow-index, both dependency diagrams, retention-policy,
  the intent-layer README, `packages/search/CLAUDE.md` and the retention config now point at the new code; the
  config's DSAR block is marked as target settings (#1015). The checkpoint grep finds only history, evidence files
  and the orphaned `embedding-purge.service.ts` actor string.

**D12 reviews (2026-10-24/25):** a11y-expert PASS WITH MINOR, security-lead PASS WITH MINOR, compliance FAIL. Owner
rulings Q23-Q26 (2026-10-25) decided the open choices; the fixes:
- a11y: focus and live announcements on the verify and export pages, field-level errors and hints in the dialogs,
  focus after a dialog action, the banner as a note, per-row download labels, reduced-motion skeletons. The
  destructive colour token's contrast stays a known shared gap (#871).
- Q23 deals and tasks in the export (descriptions withheld) and on the erasure checklist; calendar events,
  notifications and experiment assignments counted as withheld. Q26 AI text, staff text and booking answers
  withheld for review (new categories DESCRIPTIONS, AI_TEXT, STAFF_TEXT, OTHER_RECORDS).
- Compliance blocker: completeAccess refuses unless every category withheld now has a reason and a count that covers
  the live count. Art 22 wording qualified; retention text when the firm has no privacy notice.
- Q24: per-firm daily cap of 50 public submissions; unverified requests purged 7 days after their link expired (in the
  deadline job); expired unverified requests left out of the admin list.
- Q25: every staff-logged erasure waits 24 hours after the warning. Extensions count from the start of the clock.
- Audits: the staff export audit is awaited (retried once), and public export downloads are audited.
- Appointment location is kept on erasure: it is the firm's meeting place, not booker text.
- Codex (D12 round): withheld counts must cover the live count; the dialog no longer invents a reason for a blank
  one (refused with field focus); a contact merge locks both rows before reading their addresses, so a racing
  address change cannot leave the survivor unrestricted (real-DB race test, RED first).
- Codex (HIGH): the insight job reads each queued deal as it is now (`currentDeals`: current name and contact), so a
  queued name of a person who is no longer the deal's contact never reaches the model.
- Codex (HIGH): a prediction about no one now (a deal whose contact was removed) still checks a queued context's
  address. Codex (HIGH, deal names and task titles in the export): owner ruling Q23, waived with that reason; it
  shares fingerprint 02b088e4 with the #1010 waiver, and the waiver now states both.
- Codex (HIGH): a reply draft checks every address its queued thread names (From and To), not only the contact's
  current address. AI-task copies (17e93f53) and the completed-export note (10bd40e1): #1010 and #1020, waived.
- Codex (HIGH): queued addresses (reply threads, prediction contexts) are checked with `queuedAddressBlocked`:
  restricted, erased, or the subject of a completed erasure, since erasure leaves no marker on the original address.
- Codex (HIGH): a reply draft re-checks the thread's other participants inside the locked write, each under its
  address lock. Codex (MEDIUM): booking title, description, notes and cancellation reason are withheld and counted
  (STAFF_TEXT), as the erasure clears them.
- Codex (HIGH): the export reads everything from one repeatable-read snapshot, so a record whose address changes
  mid-export cannot put another person's data in the file. The sonar guard's two findings (dialog validation
  complexity, the status region as `<output>`) are fixed.
- Codex (HIGH): the erasure takes the person's address lock (`dsar_subject_lock`) after its row locks, so an AI write
  that checked the address either commits first or waits for the erasure.
- Codex (deadlock, then race): the locked write takes the contact's address lock and the thread participants'
  (`alsoLock`) in one sorted order, then re-checks them; two drafts on one thread cannot deadlock, and a
  participant restricted meanwhile stops the draft.
- Codex (MEDIUM): the lead export includes `clickId`, which the erasure clears. #1020 waived a third time.
- Codex (MEDIUM): the reply-draft participant check leaves out the contact's own current address (checked as a
  contact), so a person who came back after an old erasure can still get a draft.
- Codex (LOW, MEDIUM): thread addresses are also found in comment, `mailto:`, quoted and trailing-full-stop forms,
  and an apostrophe inside an address (o'neil@) is kept. The per-firm IP cap is by design (waived with reason).
- Codex (MEDIUM): a failed restriction lift after a committed rejection no longer throws; the restriction stays
  (restrictionKept) and the rejection notice still goes. The shared-restriction lifting notice (LOW): #1027, waived.
- Codex (MEDIUM): `restrictionKept` follows what the lift actually did (null: another request still holds it).
  Process note: 0a5eb7549 was committed after the first codex pass on its tree had FAILED (a stale second-pass
  file read as PASS); this finding is the one it missed, fixed in the next commit with two fresh PASS runs.
- Tests: `apps/api/src/modules/privacy/__tests__/dsar-sla-scheduler.test.ts` (fake clock, fake store, recording
  client), `dsar-sla-deps.test.ts`, `apps/api/src/__tests__/http-server.dsar-sla.test.ts`, `main.test.ts`, and
  four real-database tests in `tests/integration/dsar.test.ts` (due, overdue, 3-day repeat, extension window,
  refused send retried, owner fallback, the advisory lock, and `SKIP LOCKED` against a row an admin holds).

### Step D9: Web
**Files to Create:**
- `(public)/dsar/[handle]/page.tsx`, `DsarRequestContent.tsx` and `loading.tsx`
- `(public)/dsar/[handle]/verify/page.tsx` and `DsarVerifyContent.tsx`
- `(public)/dsar/[handle]/export/page.tsx` and `DsarExportContent.tsx` (human-readable summary as text nodes only; no
  storage)
- `settings/privacy-requests/page.tsx`, `PrivacyRequestsContent.tsx`, and dialogs for log, extend, complete (erasure
  confirmation and counted checklist; objection stop method), completeAccess, reject, cancel, lift and revoke
- `components/privacy/RestrictionBanner.tsx`
- tests for each, with axe

**Files to Modify:**
- `PublicLayoutShell.tsx`: `/dsar/` added to `AUTH_PAGES_NO_CHROME`
- `apps/web/next.config.js`: `/dsar/:path*` headers after `/:path*`, plus a header test
- `robots.ts`: `/dsar/`
- `navigation.tsx`: `PUBLIC_ROUTES`
- `lib/sentry/scrub.ts`: drop fragments from request.url, transactions, breadcrumbs and replay, plus a test
- the booking page footer link and `booking-email.ts` confirmation link to `/dsar/<handle>`
- the `settings.ts` sidebar entry
- the lead and contact detail pages: `RestrictionBanner`

**Requirements:**
- [ ] The fragment is read once, into a ref, and stripped immediately.
- [ ] The pages are dynamic.
- [ ] No token appears in any request URL.
- [ ] Material Symbols only. Any new glyphs go into the subset regeneration.

### Step D10: Docs and registries
- [x] Rewrite `docs/compliance-and-governance/data-governance/dsar-process.md`.
- [x] `gdpr-compliance.md`: controller/processor statement and corrected evidence.
- [x] `gdpr-compliance-checklist.csv`: GDPR-005..010, -021, -023, -031.
- [x] `docs/security/security-claims-audit.md`: the Missing items resolved.
- [x] ADR-007 addendum; ADR-083 DSAR section.
- [x] `TRPC_PROCEDURE_CATALOG.md`, `docs/api/trpc-routes.md` and `FLOW-040.md`.
- [x] Page registries: four new pages, total 219. PAGE_MAP gets a "Data requests" section; sitemap, page registry,
  IA, nav reachability (`/dsar` as an external entry from the booking page; settings sidebar), ui-flow (routers and
  procedures), and the content audit regenerated.
- [x] PRD addendum: DSAR delivery and the migration note (L13).

### Step D11: Follow-ups and red flags
- [x] `/create-task` (owner approval gate):
  - outreach suppression keyed on `blocksMarketing` (sign-off 6);
  - automated erasure of communications;
  - DSAR CSV export and Art 20(2) direct transfer;
  - Art 19 recipient notification.
- [x] Findings: the ADR-007 false claim; the hold-registry absence; residual items.

**Done (2026-10-24):**
- D10: `dsar-process.md` rewritten; `gdpr-compliance.md` (controller/processor statement, Chapter III evidence);
  checklist rows GDPR-005..010, -021, -023, -031 (Implemented or Partial, with evidence paths);
  `security-claims-audit.md` §3.8; ADR-007 addendum (the "automated DSAR workflows" and "DSAR workflow functional"
  claims marked superseded); ADR-083 "Data subject requests"; PRD addendum with the L13 migration note; FLOW-040
  rewritten; `privacy` router (17 procedures) in `TRPC_PROCEDURE_CATALOG.md` and `docs/api/trpc-routes.md`, stale
  `dsar.*` entries removed. Page registries already carried the four pages (total 220 after the PR 1 merge;
  docs-integrity PASS). Drift: there is no allowlist file; the SQL-only objects are listed in the `schema.prisma`
  comment block, the repo's convention (8 CHECKs, 4 SET NULL user FKs, the partial unique index, 2 RLS policies,
  10 functions, 8 triggers).
- D11: owner approved IFC-315 to IFC-318 in Sprint 19 (2026-10-24): outreach suppression, communications erasure,
  CSV export with Art 20(2) transfer, Art 19 notices. Findings: ADR-007 corrected; no legal-hold registry and stale
  `anonymize_record()` / `docs/legal` claims filed as #1019.

### Step D12: Validation, reviews, close
- [ ] Every package suite touched (domain, validators, application, adapters, db, api, ai-worker, web), plus
  integration on a fresh DB; then typecheck, lint, lint-promises, the sonar guard, and the api and web builds.
- [ ] Pre-ship subset under `pnpm test:db:run`, coverage and diff-coverage ≥ 80%.
- [ ] codex review iterated to PASS; `/code-review`.
- [ ] Implementation reviews:
  - security-lead adversarial review of the public DSAR flow and erasure;
  - compliance review of emails, export and docs;
  - a11y-expert review of four pages and the banner.
- [ ] Lighthouse on `/dsar/<handle>` (production build, local recipe). The admin page is NEEDS_HUMAN, as for
  event-types.
- [ ] Then the main plan's Step 20 for PG-203 as a whole: `/exec-gates`, `/exec-attestation`, CSV, splits,
  `generate-context`, and `generate-final-report.mjs PG-203`.


### Plan revision 1 (plan-reviewer REVISE, 2026-10-22)

These items override the steps above where they conflict.

**Must-fix 1: `ipHashOf` (D6).** Move `ipHashOf` out of `public-booking.router.ts`, where it is module-private, into
`apps/api/src/modules/calendar/booking-abuse.ts` as an exported `ipHashOf(req, salt)` with a unit test. Public
booking and the new `privacy-public.router.ts` both import it from there. The privacy router imports
`bookingLookupLimiter`, `bookingSubmitLimiter`, `normalizeEmailForCap`, `getBookingSalt` and `ipHashOf` from
`../calendar/booking-abuse`.

**Must-fix 2: `LeadService` wiring (D4 and D6).**
- `LeadService` gains an optional seventh constructor parameter, `processingRestrictions?: ProcessingRestrictionPort`.
  When absent, it defaults to `ALLOW_ALL_RESTRICTIONS`, a no-op port that never restricts. Every existing call site
  compiles unchanged.
- `ProcessingRestrictedError extends DomainError` (in `packages/domain`), returned via `Result.fail` from `scoreLead`.
  `bulkScore` (`LeadService.ts:479`) reaches it through `scoreLead`. D4 tests both: `LeadService.test.ts` gets a
  scoreLead case and a bulkScore case.
- `container.ts` constructs `LeadService` with the real `PrismaProcessingRestrictionRepository` (added to
  `createAdapters`). A runtime check in `container.test.ts` asserts the adapter is injected.
- `lead.router.ts` `scoreWithAI` (around line 1185) maps `ProcessingRestrictedError` to `PRECONDITION_FAILED`, with
  the message "Processing is restricted for this person (data request).". Test: `lead.router.test.ts`.

**Must-fix 3: stale importers (D6 and D10).**
- `tests/compliance/data-governance.spec.ts:19-21` drops its `DSARWorkflow`/`dsarRequestSchema` imports and every
  DSAR `describe`. The DSAR coverage now lives in `tests/integration/dsar.test.ts` and the router and service tests.
  The retention and legal-hold parts stay, with imports adjusted.
- Docs and config updated in D10, in addition to the earlier list:
  - `infra/monitoring/data-retention-config.yaml:10,209-311`
  - `docs/compliance-and-governance/data-governance/retention-policy.md`
  - `docs/architecture/diagrams/business-workflows-dependency-chain.md`
  - `docs/architecture/diagrams/complete-dependency-chains.md`
  - `packages/search/CLAUDE.md:42`
  - `docs/operations/intent-layer/README.md`
  - `apps/project-tracker/docs/metrics/_global/flows/flow-index.md`
  - `docs/security/security-claims-audit.md`
- `apps/ai-worker/src/services/embedding-purge.service.ts` is exported (`apps/ai-worker/src/index.ts:112`) but has
  **no caller**. It stays as is (not PG-203's to remove). The findings and the debt ledger record it as orphaned, and
  record that DSAR erasure now nulls embeddings and search vectors in `PrismaSubjectDataRepository`.
- Checkpoint after the deletes:
  `git grep -nE "dsar-workflow|dsar\.router|DSARWorkflow|createDSARWorkflow" -- ':!*.md'` must print nothing
  outside history, and a docs grep must show only intentional historical mentions.

**Must-fix 4: page-count tests (D9 and D10).** The total goes from 215 to 219: three public pages and one
auth-gated page.
- `apps/web/src/app/__tests__/sitemap-reconciliation.test.ts`: `toBe(215)` becomes `toBe(219)`, with a PG-203 DSAR
  history comment.
- `apps/web/src/__tests__/content-audit-schema.test.ts`: the public routes go from 33 to 36 (TC-04 and TC-05).
- `docs/design/PAGE_MAP_AND_FLOWS.md`, `sitemap.md`, `page-registry.md`, `information-architecture.md`,
  `navigation-reachability-audit.md` and `ui-flow-mapping.md` headers.
- Regenerate with `npx tsx tools/scripts/content-audit.ts`.
- Then run `pnpm --dir apps/web exec vitest run src/app/__tests__/sitemap-reconciliation.test.ts src/app/__tests__/ia-reconciliation.test.ts src/app/__tests__/ui-flow-mapping-reconciliation.test.ts src/__tests__/content-audit-schema.test.ts`
  and `pnpm exec vitest run tools/scripts/route-total-consistency.test.ts tools/scripts/__tests__/content-audit.test.ts`.

**Must-fix 5: restriction follows the record (D7, sign-off 4).**
- The concrete email-change sites, each with a RED test:
  - `LeadService.updateLeadContactInfo` (`LeadService.ts:524`)
  - `LeadService.updateLead` (`:586`), when the email changes
  - `ContactService.updateContactEmail` (`ContactService.ts:166`)
  - `contact.router.ts` `update` (`:1149`)
- Each calls `ProcessingRestrictionPort.moveEmail(tenantId, oldEmail, newEmail)` in the same transaction or unit of
  work, which merges into an existing active row (sign-off 1).
- The direct `tx.contact.update` sites at `contact.router.ts:2044` and `:2596` are read during D7. They are covered
  if they can change the email, and documented if they cannot.
- Bulk import and sync paths: grep `contact.createMany|lead.createMany|upsert` under `apps/api/src/modules` and
  `apps/workers`. Creating a record does not move a restriction, so only email-changing updates matter. The result
  is recorded in the findings.

**Should-fixes**
- **6. Settings search.** Add a `/settings/privacy-requests` entry to `apps/web/src/lib/shared/settings-search.ts`
  `SETTINGS_ITEMS` (Security & Compliance category) and to `apps/web/src/components/sidebar/configs/settings.ts`.
  `settings-nav.test.tsx` counts through `SETTINGS_ITEMS.length`.
- **7. Scheduled scoring.** `processScoringJob` re-checks every fan-out job, which is how `handleScheduledDispatch`
  is covered. In addition, the dispatcher query (`scoring.job.ts:317-326`) excludes leads whose email ends in
  `@erased.invalid` and leads whose email has an active restriction, so it does not re-enqueue them on every run. A
  test covers both.
- **8. Sweep and restriction output.** The preflight records grep evidence that `approval-escalation-sweep.ts` creates
  no `AutoResponseDraft`. A D6 router test asserts the `restrictionFor` output is exactly
  `{restricted, blocksMarketing, since}`.
- **9. Migration name.** The single migration is `20261022120000_dsar_requests`, and the spec is aligned to it.
- **10. Validation commands, run with the slot wrapper:**
  - `pnpm --filter @intelliflow/ai-worker exec vitest run src/jobs/__tests__/scoring.job.test.ts src/workers/__tests__/contact-embed-worker.test.ts`
  - `pnpm --filter @intelliflow/api exec vitest run src/modules/privacy src/modules/lead src/modules/calendar src/modules/autoresponse src/agent/tools`
  - `pnpm --dir apps/web exec vitest run "src/app/(public)/dsar" src/app/settings/privacy-requests src/components/privacy src/lib/sentry`
  - `pnpm exec vitest run tests/architecture/tenant-procedure-enforcement.test.ts tests/compliance`
  - plus the D5 integration command.
- **11. Paths.**
  - `apps/api/src/security/types.ts` and `apps/api/src/security/rbac.ts` gain `dsar_request`. It is audit metadata
    only, because the admin procedures use `adminTenantProcedure`.
- **12. Icons, ports and allowlist.**
  - Icons: run `node tools/scripts/subset-material-symbols.mjs` after D9. Commit the woff2 and the glyph audit if
    either changes.
  - `DsarNotificationPort` goes in `packages/application/src/ports/external/`. Tests fake it, and fake
    `EmailServicePort` where they use it. Resend is never called.
  - Allowlist: record the decision on `tests/architecture/tenant-procedure-enforcement.test.ts:37` (`dsar.router.ts`)
    with the test's rule quoted.

### Plan revision 2 (plan-reviewer REVISE, 2026-10-22)

1. **Lead email is immutable, so there is no lead email-change site.** The evidence:
   - `packages/validators/src/lead.ts:77,94`: `updateLeadSchema` omits `email` and `source` ("immutable fields").
   - `packages/domain/src/crm/lead/Lead.ts` has no email setter.
   - The only direct writes in `lead.router.ts` set `isStarred` (around line 918) and `lastContactedAt`/`updatedAt`
     (around line 1895).
   - The two lead sites in revision 1 must-fix 5 are therefore **dropped**. A D7 test pins this:
     `updateLeadSchema.safeParse({ id, email })` strips or rejects `email`.
2. **The contact email change goes through `contact.router.ts` `updateEmail` (around line 1163), which calls
   `ContactService.updateContactEmail` (`ContactService.ts:166`, called around line 1236).**
   - `moveEmail` is called inside `ContactService.updateContactEmail`, so the router is covered through the service.
   - The `update` procedure (around line 1149, via `handleContactUpdate`) has no email handling and is not a site.
   - RED tests: `ContactService.test.ts` (the restriction moves; it merges into an existing active row) and
     `contact.router` `updateEmail` (the service is called with the restriction port wired).
3. **Corrected scoring test path:** `pnpm --filter @intelliflow/ai-worker exec vitest run src/jobs/scoring.job.test.ts src/workers/__tests__/contact-embed-worker.test.ts`
4. **D1 Files to Create** adds `packages/domain/src/legal/privacy/errors.ts` (`ProcessingRestrictedError extends
   DomainError`), exported from the privacy index and the domain barrel.

### Plan-Reviewer Sign-off: Addendum A (DSAR)

<!-- plan-reviewer: subagent -->
reviewer_subagent: plan-reviewer (PG-203 DSAR addendum, 2026-10-22)

| Pass | Verdict | Items |
|---|---|---|
| Initial | REVISE | 5 must-fix (ipHashOf export, LeadService wiring, stale importers, page-count tests, restriction-follows-record sites), 7 should-fix |
| Revision 1 | REVISE | lead email sites wrong, contact router site wrong, scoring test path, errors.ts missing from D1 |
| Revision 2 | **APPROVE** | One non-blocking D7 note: confirm `lead.updateMany` at `lead.router.ts:1563/1684/1754`, `routing.router.ts:422` and `LeadRoutingService.ts:293` never write `email` |

- [ ] D7: confirm the other lead writers listed above never set `email`, and record the grep in the findings.

## Plan Addendum B: restriction and erasure stop every AI path (owner Q21 and Q22, issue #1002)

**Status: written after the code.** The first part (Q21) shipped in ba00e098b as a spec amendment during exec without
its own plan review. The runner relayed the owner's 2026-10-23 ruling (the full pipeline for every task), so this
addendum records the plan the code follows. The plan-reviewer subagent reviews it below. Revision 1 answers that
review's REVISE, which included the scope question the owner then ruled on as Q22.

**Rulings.**

- Q21 (2026-10-23, AskUserQuestion): "Stop both, in PR 2". A processing restriction and an erasure stop AI insights and
  predictions.
- Q22 (2026-10-23, AskUserQuestion, after plan-reviewer must-fix 2): "All AI paths, in PR 2". They stop every AI path
  that sends a person's data to a model.

Both extend Q18 (spec: Restriction enforcement, D-AC-08).

**The rule every path follows.** Before the model call, the person (lead or contact) is checked with
`eligibleSubjectEmail` / `eligibleSubjects`. A missing, erased or restricted person is never sent. Anything stored
about the person afterwards is written in `writeSubjectIfStillEligible`, which takes the row lock, then
`dsar_subject_lock`, then reads the restriction. This is the lock order of scoring and embedding (Addendum A, D7). An
erasure or restriction that lands while the model runs therefore wins. Results BullMQ keeps in Redis carry no personal
output when a write was refused.

### Scope: every production AI path that sends a person's data to a model

The inventory comes from an Explore pass over `apps/ai-worker`, `apps/api` and `packages/*` on e18b89710.

| # | Path | Model call | Stored | Guard (step) |
|---|---|---|---|---|
| 1 | Lead scoring `scoring.job.ts` | scoring chain | `leadAIInsight` | Addendum A D7; result retention fix (Q4) |
| 2 | `LeadService.scoreLead` | AI service | score | Addendum A D7 |
| 3 | Contact embedding `contact-embed-worker.ts` | embeddings | `contacts.embedding` | Addendum A D7 |
| 4 | Contact insight `contact-insight.chain.ts` (via `entity-insight.job.ts`) | insight LLM | `contactAIInsight` | Q2 |
| 5 | Tenant insights `insight-generation.job.ts` (hot leads, stale contacts, deals at risk) | insight chain | `aIInsight`, `leadAIInsight`, `contactAIInsight`, activity, notification, task | Q3 |
| 6 | Predictions `prediction.job.ts` (churn, NBA, qualification) | chain or agent | `leadAIInsight` / `contactAIInsight`, churn alert | Q4 |
| 7 | Contact enrichment `contact-enrichment.chain.ts` (via `enrichment.job.ts`) | enrichment adapter | fills empty `contacts` columns | Q7 |
| 8 | Contact tag suggestions `tag-suggestion.job.ts` | tag chain | nothing (returned to the caller) | Q8 |
| 9 | Contact reply drafts `reply-draft.job.ts` | reply chain | `contactReplyDraft` | Q9 |
| 10 | Duplicate detection AI branch `contact-duplicate-detection.service.ts` (API) | query embedding | nothing (similarity search) | Q10 |
| 11 | RAG retrieval `services/retrieval-service.ts` (NBA prompts: notes, plus lead and contact search) | feeds other prompts | nothing | Q11 |
| 12 | Lead re-score on `lead.update` (`lead.router.ts`) | queues path 1 | via path 1 | Q12 |

**Out of scope, with the reason for each.**

- **Conversation summaries (`summarize-conversation.job.ts`): unreachable today.** The only producer,
  `ConversationRecordCallbackHandler`, is never attached; `attachConversationRecording` has no caller. Agent logs also
  share one conversation per tenant and agent type (`agent-status.ts`), so wiring summaries later needs a person tag
  on each `MessageRecord` (its `metadata` JSON) before anything is summarised.
- **Dead code with no production caller:** `followup.agent.ts`, `email-writer.agent.ts`, `auto-response.chain.ts`,
  `ticket-routing.chain.ts`, the case, deal and ticket automation jobs (not in the worker switch, never queued),
  `ScoreLeadUseCase` (never built), and `reindex-worker.ts` (not started).
- **Account paths:** enrichment, industry inference, tag suggestion, insight and scoring send account fields and
  counts, never a contact.
- **Opportunity and account predictions (path 6):** the API puts only the tenant and user ids in their context. The
  one route to person data, RAG, is filtered in Q11.
- **Entity insight fan-out (`entity-insight.job.ts`, nightly):** it queues contacts without a filter. Each job's model
  call is refused by path 4, so the cost is wasted jobs, not processing.
- **API writers without a model call:** `intelligence.router.ts` and `contact.router.ts` insight upserts are manual
  data, not AI processing.
- **Tasks created before an erasure:** there is no person provenance on tasks (issue #1010, waived with an expiry).
  New ones are covered by Q3.

### Files to Create

- `apps/ai-worker/src/jobs/__tests__/insights-predictions-data-requests.test.ts` (real guard, fake database)
- `apps/ai-worker/src/test/mocks/data-request-guard.mock.ts` (pass-through guard for job-behaviour suites)

### Files to Modify

- Guard: `apps/ai-worker/src/lib/data-request-guard.ts`, `apps/ai-worker/src/lib/__tests__/data-request-guard.test.ts`
- Workers: `apps/ai-worker/src/contact-insight.chain.ts`, `apps/ai-worker/src/jobs/insight-generation.job.ts`,
  `apps/ai-worker/src/jobs/prediction.job.ts`, `apps/ai-worker/src/jobs/scoring.job.ts`,
  `apps/ai-worker/src/contact-enrichment.chain.ts`, `apps/ai-worker/src/jobs/tag-suggestion.job.ts`,
  `apps/ai-worker/src/jobs/reply-draft.job.ts`, `apps/ai-worker/src/services/retrieval-service.ts`
- Adapters: `packages/adapters/src/repositories/PrismaSubjectDataRepository.ts` (deal insights in export and erasure),
  `packages/adapters/src/repositories/__tests__/PrismaDsarAdapters.test.ts`
- API: `apps/api/src/modules/contact/contact-duplicate-detection.service.ts`, `apps/api/src/container.ts`,
  `apps/api/src/modules/lead/lead.router.ts`
- Tests that now load the pass-through mock (eleven suites): `apps/ai-worker/src/jobs/prediction.job.test.ts`,
  `apps/ai-worker/src/jobs/prediction.job.additional.test.ts`,
  `apps/ai-worker/src/jobs/__tests__/fallback-resilience.test.ts`,
  `apps/ai-worker/src/jobs/__tests__/ifc312-jobs-happy-path.test.ts`,
  `apps/ai-worker/src/jobs/__tests__/ifc312-jobs.test.ts`,
  `apps/ai-worker/src/jobs/__tests__/insight-generation.job.fallback.test.ts`,
  `apps/ai-worker/src/jobs/__tests__/insight-generation.job.test.ts`,
  `apps/ai-worker/src/jobs/__tests__/prediction-tenant-isolation.test.ts`,
  `apps/ai-worker/src/jobs/__tests__/security-fixes.test.ts`, `apps/ai-worker/src/__tests__/contact-insight.chain.test.ts`,
  `apps/ai-worker/src/__tests__/contact-enrichment.chain.test.ts`
- Other tests: `apps/ai-worker/src/jobs/scoring.job.test.ts`,
  `apps/ai-worker/src/services/__tests__/retrieval-service.test.ts` (plus the mock factories in
  `retrieval-service.additional.test.ts` and `retrieval-service.b11.test.ts`),
  `apps/api/src/modules/contact/__tests__/contact-duplicate-detection.service.test.ts`,
  `apps/api/src/modules/lead/__tests__/lead.router.test.ts`, `tests/integration/dsar.test.ts`
- Docs and gates: `.specify/sprints/sprint-18/specifications/PG-203-spec.md`,
  `.specify/sprints/sprint-18/context/PG-203/PG-203-owner-ruling.md` (Q21, Q22). `tools/audit/codex-review-waivers.yaml`
  (waiver 6468c85e removed in ba00e098b; one false-positive waiver, 5b63b61f, added with its evidence).

**CSV alignment.** This addendum adds no page and no route, so the PG-203 row's "Artifacts To Track" (the PR 1 event
types files and `context_ack.json`) is unchanged. Its "Validation Method" (typecheck, test, lint, build) is covered row
by row in the validation matrix below.

### Steps

#### Q1: guard helpers (`data-request-guard.ts`)

- [x] RED `data-request-guard.test.ts`, describe "insight and prediction subjects (#1002)". `eligibleSubjectEmail`
  returns the stored address and null for a missing, erased or restricted person. `eligibleSubjects` keeps only
  eligible people and skips a table with no ids. `writeSubjectIfStillEligible` locks the lead or the contact row.
- [x] GREEN: `SubjectKind`, `SUBJECT_NOT_PROCESSABLE`, `eligibleSubjectEmail`, `eligibleSubjects` and
  `writeSubjectIfStillEligible` (reusing `writeIfStillEligible` / `writeContactIfStillEligible`).

#### Q2: contact insight chain (path 4)

- [x] RED "contact insight chain": a restricted contact gets no LLM call and no upsert; a contact erased during the
  call gets no upsert; an eligible contact gets its insight. "entity insight job": `processEntityInsightJob` reaches
  the chain, which refuses before `createLLMForTenant`.
- [x] GREEN: the check runs before `createLLMForTenant`, and the upsert runs in `writeSubjectIfStillEligible`.

#### Q3: tenant insight job (path 5)

- [x] RED "insight generation job" and "deals at risk follow their contact":
  - restricted and erased people are absent from the chain input;
  - a deal whose contact is restricted is dropped, and a deal with no contact is kept;
  - insights are written only for kept people;
  - nothing is written for a person, or a kept deal's contact, restricted during the call;
  - side effects are written for a kept person, and none when the person is erased after the record write;
  - a failed side effect keeps the insight.
- [x] GREEN:
  - `processableJobData` runs before capping and the model call (deals follow `opportunity.contactId`);
  - `persistInsightForSubject` locks on the lead, the contact, or the kept deal's contact;
  - the side effects run in their own locked transaction, so they stay non-blocking (one failed side effect aborts
    only that transaction, never the insight);
  - `populateEntityInsights` writes one person at a time (each write holds a pooled connection).
- [x] Export and erasure follow the same rule (codex, after Revision 1). `PrismaSubjectDataRepository`
  (`subjectInsightWhere`) covers AI insights stored under an opportunity whose contact is the person, as well as those on
  their leads and contacts. Test: `tests/integration/dsar.test.ts`, "exports and erases AI insights stored under the
  deals of the person". RED was proved with the earlier filter: the export found 0.

#### Q4: prediction job and the scoring result (paths 6 and 1)

- [x] RED "prediction job" and "every prediction type":
  - restricted, erased or missing leads, for CHURN_RISK, NEXT_BEST_ACTION and QUALIFICATION, are skipped before the
    model;
  - erased or restricted during the call returns `{ skipped: true, reason: 'data-subject-request' }`, with no
    prediction text, no upsert and no alert;
  - erased after the prediction write sends no alert;
  - an opportunity is not checked.
  - `scoring.job.test.ts` "discards the result when the person is erased" returns `{ skipped: true, reason: 'ERASED' }`.
- [x] GREEN:
  - `processableSubjectEmail` runs after the feature flag;
  - `persistPredictionResult` writes under the locks and returns `'blocked'`;
  - `notifyHighChurnRisk` locks for a lead or contact;
  - `persistScoringResult` returns the block reason.
  - A `'failed'` persist (a database error) still returns the prediction as before. This is not a data-request case.

#### Q7: contact enrichment (path 7)

- [x] RED "Q22: contact enrichment": a restricted contact is never sent to the adapter; nothing is written back onto a
  contact erased during the call; an eligible contact's empty fields are filled.
- [x] GREEN: in `contact-enrichment.chain.ts`, the check runs before `adapter.enrichContact`, and the
  `contact.update` runs in `writeSubjectIfStillEligible`.

#### Q8: contact tag suggestions (path 8)

- [x] RED "Q22: contact tag suggestions": a restricted contact gets no model call and an empty list; an eligible one
  is asked. "tag suggestions made while the person is restricted": a restriction during the call returns none.
- [x] GREEN: the check runs before `suggestContactTags`. The profile sent is read from the contact row at that moment,
  never taken from the queued snapshot, which may predate an erasure (codex). A re-check runs after the call. The suggestions reach the
  caller and the job result in Redis, so none are returned if the person was erased, restricted or changed address
  during the call (codex). Nothing is stored, so no locked write is needed.

#### Q9: contact reply drafts (path 9)

- [x] RED "Q22: contact reply drafts": a restricted contact's thread is never sent; no draft is stored for a contact
  restricted during the call; an eligible contact's draft is stored.
- [x] GREEN: the check runs before `draftContactReply`, and `contactReplyDraft.create` runs in
  `writeSubjectIfStillEligible`.

#### Q10: duplicate detection AI branch (path 10, API)

- [x] RED in `contact-duplicate-detection.service.test.ts`, "data requests (PG-203 Q22)": the details are not embedded
  when the submitted address is restricted, when the check is unreadable, or when no reader is wired, and the
  deterministic checks still run. An unrestricted person is embedded.
- [x] GREEN: a `restrictions` dependency (`ProcessingRestrictionPort.status`, wired in `container.ts`; an erased
  placeholder counts as restricted) is checked before `generateEmbedding`. The check fails closed. A submission
  with no address cannot match a restriction (they are keyed on it), so it is not blocked.

#### Q11: RAG retrieval (path 11)

- [x] RED in `retrieval-service.test.ts`, "data requests (PG-203 Q22)": lead, contact, ticket and opportunity search
  never return an erased or restricted person, and the notes query excludes notes on an erased or restricted contact.
- [x] GREEN: `withoutDataRequestSubjects` filters the lead, contact, ticket and opportunity results on the
  normalised stored address (`metadata.email`). A ticket's address is its `contactEmail`. An opportunity's is its
  contact's (codex), and a deal with no contact keeps an empty address, which no restriction matches. The notes SQL joins `contacts` and excludes
  `@erased.invalid` and active `processing_restrictions` matches.
- Out of scope in Q11, with reasons:
  - **Message search** (`searchMessages`): `RAG_SOURCES` allows it, but no production caller asks for it. The only caller, the NBA agent, requests documents, notes and conversations.
  - **Conversation search** (`searchConversations`): it returns conversation-level fields only (title, summary,
    context name), never messages. Summaries are unreachable (see above), and the agent-status task descriptions
    are short labels. Narrow, and noted here for the summaries follow-up.

#### Q12: lead re-score on update (path 12)

- [x] RED in `lead.router.test.ts` "update": the re-score goes through `enqueueLeadScoring` with a restriction reader.
- [x] GREEN: `lead.update` calls `enqueueLeadScoring(job, restrictionReader(ctx))` instead of its own queue.

#### Q5: existing suites

- [x] The eleven suites listed above load the pass-through mock (every person eligible) because they test job
  behaviour. A guard call deleted from a guarded path is caught by a suite running the real guard:
  `insights-predictions-data-requests.test.ts` covers paths 4 to 9 (contact insight, tenant insights, predictions,
  enrichment, tag suggestions and reply drafts). `scoring.job.test.ts` and `contact-embed-worker.test.ts`
  (Addendum A D7) cover paths 1 and 3. `contact-duplicate-detection.service.test.ts` covers path 10,
  `retrieval-service.test.ts` path 11, and `lead.router.test.ts` path 12.
- [x] `fallback-resilience.test.ts`: the `$transaction` mock passes its own object. A nested import of the mocked
  module can resolve to the real client.

#### Q6: docs and gates

- [x] Spec: "Restriction enforcement" and D-AC-08 cover AI insights and predictions (Q21) and every AI path (Q22).
- [x] Owner-ruling log: Q21 and Q22.
- [x] `tools/audit/codex-review-waivers.yaml`: waiver 6468c85e removed (fixed). Closes #1002.

#### Q13: the locks on a real database (plan-reviewer must-fix 4)

- [x] RED, then GREEN: `tests/integration/dsar.test.ts`, "a worker write waits for a restriction being written, then
  writes nothing". A transaction holds `dsar_subject_lock` and inserts a restriction while
  `writeSubjectIfStillEligible` waits on the lock; the write must see it and store nothing. RED was proved by moving
  the restriction read before the lock: the test fails ("written: true").

### D-AC-08 traceability (Q21 and Q22 clauses)

| Clause | Steps | Tests |
|---|---|---|
| Insights and predictions are neither generated nor written for a restricted or erased person (Q21) | Q1–Q4, Q13 | `insights-predictions-data-requests.test.ts` (prediction job, every prediction type, insight generation job, deals, contact insight chain, entity insight job); `data-request-guard.test.ts`; `dsar.test.ts` race test |
| No AI path sends a restricted or erased person's data to a model, or stores its output (Q22) | Q7–Q12 | `insights-predictions-data-requests.test.ts` (Q22 describes); `contact-duplicate-detection.service.test.ts`; `retrieval-service.test.ts`; `lead.router.test.ts` |

### Validation matrix (Addendum B)

| Check | Command |
|---|---|
| Typecheck | `pnpm exec turbo typecheck --filter=@intelliflow/ai-worker --filter=@intelliflow/api --filter=@intelliflow/adapters` |
| Lint | `pnpm exec turbo lint --filter=@intelliflow/ai-worker --filter=@intelliflow/api` |
| Build | `pnpm exec turbo build --filter=@intelliflow/ai-worker --filter=@intelliflow/api` |
| ai-worker unit (guard, all jobs, the eleven mock suites) | `pnpm exec vitest run --project ai-worker` |
| API unit (duplicates, lead router, privacy) | `pnpm exec vitest run --project api` |
| Real DB (migrated): locks and erasure | `pnpm test:db:run -- pnpm exec vitest run --project integration tests/integration/dsar.test.ts` |
| Real DB (CI-style `db push`): full integration project | the db-push wrapper used for #1003 (see PR body) |
| Codex gate | `node scripts/codex-review.mjs` (two consecutive PASS rounds) |
| Pre-ship with diff coverage ≥80% | the runner's push: `scripts/pre-ship.mjs` (husky pre-push), then `pnpm preship:attest` |

### Plan-Reviewer Sign-off: Addendum B (Q21 and Q22)

<!-- plan-reviewer: subagent -->
reviewer_subagent: plan-reviewer (Task subagent, .claude/agents/plan-reviewer.md), PG-203 Addendum B, 2026-10-23, lead session f7d22516-a758-41d6-8916-a2c4accfdecc

| Pass | Verdict | Items |
|---|---|---|
| Initial (code on e18b89710) | REVISE | 5 must-fix: no file lists, checkboxes or traceability; other AI paths unguarded (put to the owner, ruled Q22 "All AI paths, in PR 2"); deals at risk unguarded; no real-DB test of the locked write; thin validation matrix. 7 should-fix. |
| Revision 1 | **APPROVE** | No must-fix. 5 should-fix, all applied: Q5 wording names the suite per path; the waivers entry marked done; the ticket RAG source filtered (opportunity, message and conversation search noted out of scope with reasons); the no-address case in Q10 commented. |

The reviewer found no defect in the guard code at either pass. It verified the lock order, each Q22 guard, deals
following their contact, and the scope claims (no other synchronous LLM call on lead or contact data in `apps/api`;
`attachConversationRecording` has no production caller). It did not run tests. The counts in the validation matrix
come from the lead session's runs.
