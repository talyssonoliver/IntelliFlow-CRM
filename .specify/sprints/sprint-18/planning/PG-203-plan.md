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
- [ ] Remove duplication between `listSlots` and the `book` re-check (one function).
- [ ] Check: no `any` in new code, no `istanbul ignore`, no TODO/stub, no skipDuplicates.

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
- [ ] Page total 214 → 215 in every doc header listed.
- [ ] `/book` is a **new route prefix**:
  - add a **new "Public Booking" section** to `PAGE_MAP_AND_FLOWS.md` (a section, not a row inside an existing one)
    and update its Summary Statistics;
  - add the route to `sitemap.md`, `page-registry.md`, the IA route table and the `ui-flow-mapping.md` route + router
    rows;
  - add it to `navigation-reachability-audit.md` as "external entry (PG-203)", which is not a waiver.
- [ ] Reachability, Category Y (85b evidence):
  - `/calendar/event-types` is in `apps/web/src/components/sidebar/configs/calendar.ts:12` (verified), and the
    `CalendarSettingsPanel.tsx:19` copy is updated in Step 15.
  - `/book/[handle]/[slug]` is reached from the BookingLinkCard URL. Assert this manually with a grep that
    `BookingLinkCard.tsx` builds `/book/${handle}/${slug}`, and record it in the findings doc. `check-nav-wiring` is
    not trusted for `(public)` / route-group pages (false-green history).
- [ ] Router and procedure counts change only by our additions (`publicBooking` +3; `calendar.eventTypes` +6).
- [ ] Regenerate content audit: `npx tsx tools/scripts/content-audit.ts`.
- [ ] PRD addendum status → In Progress, then the delivery note. ADR-083 gets the delivery note and the DB-role
  citation. Add the ADR README row.
- [ ] Dependency chain: PG-203 ⏳ → ✅ at close.
- [ ] Design mockup check: no mockup for event types exists in `docs/design/` (`grep -ri "event type" docs/design`).
  Record that, and compare against the PG-205 contact-types page as the visual reference.

**Validation:**
- [ ] `pnpm --dir apps/web exec vitest run src/app/__tests__/sitemap-reconciliation.test.ts src/app/__tests__/ia-reconciliation.test.ts src/app/__tests__/ui-flow-mapping-reconciliation.test.ts`
- [ ] `pnpm exec vitest run tools/scripts/route-total-consistency.test.ts tools/scripts/__tests__/content-audit.test.ts`
- [ ] `node tools/scripts/exec-preflight/check-page-doc-cochange.mjs PG-203`
- [ ] `node tools/scripts/exec-preflight/check-nav-wiring.mjs PG-203`

### Phase 4 — VALIDATION

#### Step 19: Full validation, reviews, Lighthouse
**Type:** validation

**Full package suites** (slot wrapper; DB suites `--exclusive intelliflow-db`), each logged to `.txt`:
- [ ] `pnpm --filter @intelliflow/domain test`
- [ ] `pnpm --filter @intelliflow/validators test`
- [ ] `pnpm --filter @intelliflow/application test`
- [ ] `pnpm --filter @intelliflow/db test`
- [ ] `pnpm --filter @intelliflow/api test` (L5: health-server EADDRINUSE flake → re-run)
- [ ] `pnpm --dir apps/web exec vitest run`
- [ ] `pnpm exec vitest run --project integration tests/integration/event-types.test.ts tests/integration/rls-tenant-isolation.test.ts tests/integration/availability.test.ts`

**Non-functional checks:**
- [ ] NF-001: time 10 local `listSlots` calls (14 days, seeded tenant on the local test DB) and record the p95 in the
  findings doc. Target < 300 ms.
- [ ] NF-004: the lock-timeout cases from Steps 6 and 8 are green. Record the typical lock hold time from the
  integration run.
- [ ] NF-002: a grep of `apps/api/src/modules/calendar/*.ts` shows no logger call with an email, IP or answers.

**Gates:**
- [ ] `pnpm run typecheck`
- [ ] `pnpm run lint`
- [ ] Build: `pnpm --filter @intelliflow/api build` and `pnpm --filter @intelliflow/web build` (slot wrapper).
- [ ] Diff coverage ≥ 80% on changed lines, via `/exec-coverage` after. Fix gaps with unit tests, never with ignore
  comments.
- [ ] `node scripts/codex-review.mjs`, iterated to exit 0. Real bugs get minimal fixes. False positives are waived in
  `tools/audit/codex-review-waivers.yaml` with evidence (L3: `git show HEAD:<file>` to confirm a cited line exists).

**Reviews:**
- [ ] `/code-review` on the diff and `/sonarqube-fix` for any new Sonar finding.
- [ ] `a11y-expert` subagent WCAG 2.1 AA review of the three UI surfaces. Fix the findings.
- [ ] `security-lead` subagent adversarial review of `public-booking.router.ts`, `booking-abuse.ts` and `booking-email.ts`
  (runner request). Fix the findings.

**Lighthouse ≥ 90:**
- [ ] `/calendar/event-types` via `lighthouserc.authenticated.js` + `tools/lighthouse/lhci-auth.js` (PG-198 Path C,
  local stack).
- [ ] `/book/<seeded-handle>/<slug>` via a production build plus a seeded tenant, local test DB only.
- [ ] Evidence JSON goes under the execution folder. If it cannot be measured → NEEDS_HUMAN with the exact reason.

**Final check:**
- [ ] Icons: run the Material Symbols subset verify (`node scripts/subset-material-symbols.mjs --verify`; find the
  exact path with `ls scripts | grep -i symbol`). Regenerate the subset if new icon names were added.
- [ ] `git ls-files | grep -cE '\.(log|coverage|tsbuildinfo)$'` prints `0`.

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
