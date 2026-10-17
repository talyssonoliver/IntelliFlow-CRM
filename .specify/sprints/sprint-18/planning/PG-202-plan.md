# Execution Plan: PG-202 — Module Settings: Availability

**Spec:** `.specify/sprints/sprint-18/specifications/PG-202-spec.md` (FINAL; Round 4 consensus 6/6 APPROVED in one round,
2026-10-17T16:59:15Z) · **Sprint:** 18 · **Branch:** `feat/pg-202-availability` · **Owner ruling:**
`.specify/sprints/sprint-18/context/PG-202/PG-202-owner-ruling.md` (Q1–Q7 + Aurora clearance) · **ADR:** ADR-081
(Accepted) · **PRD:** `docs/planning/prd-module-settings.md` (PG-202 Addendum) · **Plan drafted:** 2026-10-17T17:04:14Z

> **PRISMA MIGRATION (L13):** `packages/db/prisma/migrations/20261017130000_availability/` is additive Class A. It is
> merged, NOT applied: the production apply is manual and must happen **before** the API ships. Class A gates 4
> (staging), 7 (snapshot id) and 10-prod are NEEDS_HUMAN. Called out in the PR body, the final report and the
> attestation.

> **OVERLAP (Aurora boundaries):** in `appointments.router.ts` only the two `assertWithinBusinessHours` call swaps
> (create, reschedule), the findNextSlot branch and the removal of the old helper. No change to attendeeIds,
> linkedCaseIds, clientId, assignedTo, use-case id checks or cases.router.ts. Merge origin/main before SHIP and re-run
> the appointments router suites.

## Runner constraints (apply to every step)

- Node 22: prefix commands with `export PATH=/c/Users/talys/AppData/Roaming/nvm/v22.14.0:$PATH;
  export NODE_OPTIONS=--max-old-space-size=8192;` (host default v25.2.1 hangs pg writes).
- One test process at a time. Single-file vitest runs are exempt from the slot wrapper. Full package suites, builds
  and DB tests go through `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-202 -- <cmd>`; DB tests add
  `--exclusive intelliflow-db`. The shared :5433 / :6380 containers are never stopped or reset.
- `@intelliflow/web`'s `test` script is watch mode, so web runs use `pnpm --dir apps/web exec vitest run <path>`.
- Never pipe a gate into `tail`/`head`; write logs with `> <log> 2>&1; echo "exit=$?" >> <log>`.
- TDD logs: `.specify/sprints/sprint-18/execution/PG-202/exec-PG-202-20261017/tdd/` — `characterization-*.log` (GREEN on
  current code), `red-*.log`, `green-*.log`. Each log starts with `# date -u`, `# git rev-parse HEAD`, `# <command>`
  and ends with `# exit=<code>`. No RED claim without its log.
- Commits: small, staged by name, message via `-F <file>`, hooks on, no AI attribution, no secret-shaped strings (build
  test strings from parts, `*.example.invalid`). No push/PR until SHIP.
- Never use `.env.local` `DATABASE_URL`/`DIRECT_URL` (production). The committed `.env.test` targets
  `localhost:5433/intelliflow_test`; integration prefers a fresh DB from `scripts/lib/ephemeral-test-db.mjs`.
- Every timestamp written to an artifact comes from `date -u` at that moment.

## Preflight Checks

- [x] `git branch --show-current` = `feat/pg-202-availability`; `git status --short` shows only PG-202 files. *Verified 2026-10-17T17:19Z:* branch matches; modified files are PG-202 tracking (task-tracking.json, CSV + split, coverage-before) plus generator churn (`plan-lint-report.json`, `spec-tracker.json` timestamps), not committed.
- [x] `docker ps --filter name=postgres-test --format "{{.Status}}"` contains `healthy`. *Verified 2026-10-17T17:19Z:* "Up 32 hours (healthy)".
- [x] Packages built: `ls packages/{domain,validators,application,db}/dist` exist (provisioned 2026-10-17, 15/15). *Verified:* all four dist dirs exist.
- [x] `node -v` under the prefix prints `v22.14.0`. *Verified:* v22.14.0.
- [x] Exec preflights: `node tools/scripts/exec-preflight/check-plan-reviewer-subagent.mjs PG-202`,
      `node tools/scripts/exec-preflight/check-page-doc-cochange.mjs PG-202`,
      `node tools/scripts/exec-preflight/check-nav-wiring.mjs PG-202`,
      `node tools/scripts/exec-preflight/check-exec-readiness.mjs PG-202`. *Verified 2026-10-17T17:18Z:* all four exit 0 (`.specify/sprints/sprint-18/execution/PG-202/exec-PG-202-20261017/matop/gates/preflight-*.log`); readiness needed `pnpm run generate:metrics` for the cached task JSON first. `check-worktree-landed` exits 1 by design until SHIP (unpushed branch), re-run at Step 21.
- [x] Create `context_ack.json` (see Step 1 "Files to Create"; files read + SHA-256, `date -u` timestamp) — CSV
      EVIDENCE artifact. *Done 2026-10-17T17:18:49Z:* 29 files hashed; context_pack.md + manifest built by `build-context-pack-cli.ts`.
- [x] Confirmed in the plan session: `createTenantScopedPrisma` (`apps/api/src/security/tenant-context.ts:142-195`) issues
      independent queries (a session `SET` once per request, no wrapping transaction), so a failed availability read
      cannot abort the booking that follows — the P2021/P2022 fallback is safe.

## Dependencies Verified

| Dependency | Status | Verified by |
|---|---|---|
| PG-178 | DONE | `apps/web/src/components/settings/ModuleSettingsLayout.tsx`, `apps/api/src/modules/lead/lead-settings.router.ts` exist; attestation COMPLETE (sprint-16) |
| PG-189 | DONE | `appointmentSettings` router registered `apps/api/src/router.ts:37,154`; `AppointmentSettings` model `schema.prisma:2383`; attestation COMPLETE (sprint-18) |

**Hexagonal layers:** Domain → Application → Validators → Database → API → UI (full stack). Chain:
`docs/architecture/diagrams/complete-dependency-chains.md` → "Availability (PG-202 …)". Sidebar entry exists
(`apps/web/src/components/sidebar/configs/calendar.ts:15-17`).

## Implementation Reality Checks

| Surface | Production Consumer | Replaces / Blocks | Verification Command |
|---|---|---|---|
| `calendar.availability.get/update/resetToDefaults` | `AvailabilityContent.tsx` (`/calendar/availability`) | "coming soon" stub `availability/page.tsx` | `pnpm --dir apps/web exec vitest run src/app/calendar/availability` |
| `assertAppointmentWithinAvailability` | `appointments.create` (:513), `appointments.reschedule` (:787) | `assertWithinBusinessHours` + `BUSINESS_HOURS_*` (deleted from the router) | `pnpm --dir apps/api exec vitest run src/modules/legal/__tests__/appointments.router.caller.test.ts` |
| `findNextSlotWithinAvailability` + `CheckConflictsUseCase.findFirstFreeCandidate` | `appointments.findNextSlot` (API-only; no UI caller, gh issue) | hard-coded 9/17 for configured tenants | same caller test + `pnpm --dir packages/application exec vitest run src/usecases/scheduling/__tests__/CheckConflicts.test.ts` |
| `appointmentSettings.update/resetToDefaults` no longer write buffers/timezone | `CalendarSettingsContent.tsx` | stale overwrites of availability-owned columns | `pnpm --dir apps/api exec vitest run src/modules/legal/__tests__/appointment-settings.router.test.ts` |
| calendar-settings pointers + `resetDescription` | `/calendar/calendar-settings` | buffer + timezone editors there | `pnpm --dir apps/web exec vitest run src/app/calendar/calendar-settings` |
| firm buffer prefill (`defaultBuffers`) | `/appointments/new` → `AppointmentForm` | 0/0 starting buffers | `pnpm --dir apps/web exec vitest run src/components/appointments/__tests__/AppointmentForm.test.tsx src/app/appointments/new` |
| server-error display | `AppointmentForm` (create), `AppointmentDetail` (reschedule dialog) | client 07-19 duplicate (`AppointmentForm.tsx:118-138`); silent swallow (`AppointmentDetail.tsx:89-98`) | `pnpm --dir apps/web exec vitest run src/components/appointments/__tests__` |
| agent executor | `approved-action-executor.ts:226,260` | — | `pnpm --dir apps/api exec vitest run src/agent/__tests__/approved-action-executor.test.ts` |

## Estimated Effort

CSV PERT (180/360/540) = 360 min. The ruled scope (migration, enforcement, application method, calendar-settings and
appointment UI changes) is larger:

| Phase | Files | Estimate |
|---|---|---|
| RED (characterization + failing tests) | 18 new test files + 16 extended | 6–8 h |
| GREEN (implementation) | 14 new + 18 modified source files (incl. 1 migration) | 8–11 h |
| Refactor, docs, registries, tracking | 20 files | 2–3 h |
| Validation (suites, build, codex, reviews, attestation) | — | 3–4 h |
| **Total** | **86 files** | **19–26 h** (Planned Finish 2026-10-20) |

## Files Summary

**Create (source, 14):**
1. `packages/domain/src/legal/appointments/AvailabilityPolicy.ts`
2. `packages/domain/src/legal/appointments/availability-roles.ts`
3. `packages/validators/src/availability.ts`
4. `packages/db/prisma/migrations/20261017130000_availability/migration.sql`
5. `apps/api/src/modules/calendar/availability.router.ts`
6. `apps/api/src/modules/calendar/availability-enforcement.ts`
7. `apps/api/src/modules/legal/appointment-settings.defaults.ts`
8. `apps/web/src/app/calendar/availability/AvailabilityContent.tsx`
9. `apps/web/src/app/calendar/availability/AvailabilityLoading.tsx`
10. `apps/web/src/app/calendar/availability/availability-draft.ts`
11. `apps/web/src/app/calendar/availability/components/WeeklyHoursCard.tsx`
12. `apps/web/src/app/calendar/availability/components/TimezoneCard.tsx`
13. `apps/web/src/app/calendar/availability/components/BuffersCapCard.tsx`
14. `apps/web/src/app/calendar/availability/components/ClosuresList.tsx`

**Modify (source, 18):**
1. `packages/domain/src/index.ts`
2. `packages/application/src/usecases/scheduling/CheckConflicts.ts`
3. `packages/validators/src/appointment-settings.ts`
4. `packages/validators/src/index.ts`
5. `packages/db/prisma/schema.prisma`
6. `packages/db/src/index.ts`
7. `apps/api/src/modules/calendar/calendar.router.ts`
8. `apps/api/src/modules/legal/appointments.router.ts`
9. `apps/api/src/modules/legal/appointment-settings.router.ts`
10. `apps/web/src/app/calendar/availability/page.tsx`
11. `apps/web/src/app/calendar/calendar-settings/CalendarSettingsContent.tsx`
12. `apps/web/src/app/calendar/calendar-settings/components/BufferRemindersTab.tsx`
13. `apps/web/src/app/calendar/calendar-settings/components/CalendarIntegrationTab.tsx`
14. `apps/web/src/components/settings/ModuleSettingsLayout.tsx`
15. `apps/web/src/components/settings/TimezoneSelector.tsx`
16. `apps/web/src/components/appointments/AppointmentForm.tsx`
17. `apps/web/src/app/appointments/new/page.tsx`
18. `apps/web/src/components/appointments/AppointmentDetail.tsx`

**Tests, create (18):**
1. `packages/domain/src/legal/appointments/__tests__/AvailabilityPolicy.test.ts`
2. `packages/domain/src/legal/appointments/__tests__/availability-roles.test.ts`
3. `packages/validators/src/__tests__/availability.test.ts`
4. `apps/api/src/modules/calendar/__tests__/availability.test-utils.ts` (helpers; not a `*.test.ts` file)
5. `apps/api/src/modules/calendar/__tests__/availability-enforcement.test.ts`
6. `apps/api/src/modules/calendar/__tests__/availability.router.test.ts`
7. `apps/api/src/modules/legal/__tests__/appointments.legacy-hours.characterization.test.ts`
8. `apps/api/src/modules/legal/__tests__/appointments.availability-boundary.test.ts`
9. `tests/integration/availability.test.ts`
10. `apps/web/src/app/calendar/availability/__tests__/page.test.tsx`
11. `apps/web/src/app/calendar/availability/__tests__/AvailabilityContent.test.tsx`
12. `apps/web/src/app/calendar/availability/__tests__/AvailabilityContent.actions.test.tsx`
13. `apps/web/src/app/calendar/availability/__tests__/AvailabilityLoading.test.tsx`
14. `apps/web/src/app/calendar/availability/__tests__/availability-draft.test.ts`
15. `apps/web/src/app/calendar/availability/components/__tests__/WeeklyHoursCard.test.tsx`
16. `apps/web/src/app/calendar/availability/components/__tests__/TimezoneCard.test.tsx`
17. `apps/web/src/app/calendar/availability/components/__tests__/BuffersCapCard.test.tsx`
18. `apps/web/src/app/calendar/availability/components/__tests__/ClosuresList.test.tsx`

**Tests, extend (16):**
1. `packages/application/src/usecases/scheduling/__tests__/CheckConflicts.test.ts`
2. `packages/validators/src/__tests__/appointment-settings.test.ts`
3. `apps/api/src/modules/legal/__tests__/appointments.router.caller.test.ts`
4. `apps/api/src/modules/legal/__tests__/appointment-settings.router.test.ts`
5. `apps/api/src/__tests__/app-router.smoke.test.ts`
6. `apps/api/src/agent/__tests__/approved-action-executor.test.ts`
7. `apps/api/src/modules/legal/__tests__/legal-module-entitlement.test.ts` (assert `calendar.availability` is not LEGAL-gated)
8. `apps/web/src/app/calendar/calendar-settings/__tests__/BufferRemindersTab.test.tsx`
9. `apps/web/src/app/calendar/calendar-settings/__tests__/CalendarIntegrationTab.test.tsx`
10. `apps/web/src/app/calendar/calendar-settings/__tests__/CalendarSettingsContent.test.tsx`
11. `apps/web/src/components/appointments/__tests__/AppointmentForm.test.tsx`
12. `apps/web/src/components/appointments/__tests__/AppointmentDetail.test.tsx`
13. `apps/web/src/app/appointments/new/__tests__/page.onsuccess.test.tsx`
14. `apps/web/src/components/settings/__tests__/ModuleSettingsLayout.test.tsx`
15. `apps/web/src/components/settings/__tests__/TimezoneSelector.test.tsx`
16. `apps/web/src/components/aurora-landing/sections/__tests__/InboxCalendarSection.test.tsx` (stale "stub" comment)

Conditional (touched only if their run crashes on the new settings read, as PG-204 Step 12): `appointments.router.test.ts`,
`appointments.router.comprehensive.test.ts` — add `prismaMock.appointmentSettings.findUnique.mockResolvedValue(null)`
to `beforeEach`. Not counted.

**Docs / registries / tracking (20):**
1. `docs/design/page-registry.md` (new `/calendar/availability` entry)
2. `docs/design/sitemap.md` (:203 description)
3. `docs/design/PAGE_MAP_AND_FLOWS.md` (:226 description)
4. `docs/design/navigation-reachability-audit.md` (:232 panel column)
5. `docs/design/ui-flow-mapping.md` (procedure count +3, `/calendar/*` rows)
6. `docs/design/information-architecture.md` (procedure/router count if listed)
7. `docs/architecture/diagrams/complete-dependency-chains.md` (chain added in spec phase; ✅ status at close)
8. `docs/architecture/diagrams/legal-scheduling-dependency-chain.md` (PG-202 availability chain)
9. `docs/architecture/adr/ADR-081-tenant-availability.md` (implementation notes if a decision shifts)
10. `docs/planning/prd-module-settings.md` (PG-202 Delivery Status table)
11. `docs/compliance-and-governance/compliance/wcag-conformance-statement.md` (1.9.0 row, at SHIP, real review result)
12. `docs/compliance-and-governance/compliance/vpat-2.5.md` (1.10.0 row, at SHIP)
13. `artifacts/reports/content-audit-results.json` (PG-202 route entry only, if the audit lists it)
14. `artifacts/metrics/debt-ledger.yaml`
15. `.specify/sprints/sprint-18/findings/PG-202-findings.md` (create)
16. `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`
17. `apps/project-tracker/docs/metrics/_global/Sprint_plan_I.csv`
18. `.specify/sprints/sprint-18/attestations/PG-202/attestation.json` (exists; rewritten)
19. `.specify/sprints/sprint-18/attestations/PG-202/context_ack.json` (create, Step 1)
20. `.specify/sprints/sprint-18/attestations/PG-202/task-tracking.json` (exists; rewritten)

Page counts are unchanged (no new `page.tsx`): `sitemap-reconciliation.test.ts`, `content-audit-schema.test.ts` are
**run, not modified**. Lighthouse evidence goes to `artifacts/lighthouse/PG-202/` (not counted).

**Total: 14 + 18 + 18 + 16 + 20 = 86 files.** Execution evidence (`exec-PG-202-20261017/tdd/*.log`, `matop/*`,
`artifacts/lighthouse/PG-202/*`, a regenerated Material Symbols subset if Step 18 needs it) is not counted.

## Execution Steps

### Phase 0 — Characterization (GREEN on current code, before any change)

#### Step 1: Context ack + pin the legacy booking rules
**Type:** test (characterization)
**Files to Create:**
- `.specify/sprints/sprint-18/attestations/PG-202/context_ack.json`
- `apps/api/src/modules/legal/__tests__/appointments.legacy-hours.characterization.test.ts`

- [x] `context_ack.json`: spec, plan, owner ruling, ADR-081, playbook, PRD, the CSV pre-requisite files and every source
      file to modify, each with SHA-256 and the `date -u` time of hashing.

Cases (router caller with the mocked container, clock pinned with `vi.useFakeTimers({ toFake: ['Date'] })`):
- [x] create: start 06:59 UTC rejected `Appointments must start and end between 07:00 and 19:00.`; 07:00 ok; end 19:00:00 ok;
      end 19:01 rejected; 18:00 → 08:00 next day accepted (gap pinned, test named "legacy path keeps the cross-midnight gap
      (recorded finding)"); `timezone: 'Asia/Tokyo'` shifts the window.
- [x] reschedule: evaluated in UTC (no timezone input).
- [x] findNextSlot: `checkConflictsUseCase.findNextSlot` called with `workingHoursStart: 9, workingHoursEnd: 17`. *Verified:* `tdd/characterization-legacy.log` (9 passed, exit 0, 2026-10-17).
- [x] Run on the untouched router → **GREEN**; log `characterization-legacy.log`. It must stay GREEN after Step 15
      (the settings read returns `null` in this file: `prismaMock.appointmentSettings.findUnique.mockResolvedValue(null)`).

**Validation:** `pnpm --dir apps/api exec vitest run src/modules/legal/__tests__/appointments.legacy-hours.characterization.test.ts`

### Phase 1 — RED: Write Failing Tests (layer order)

#### Step 2: Domain policy + roles tests (AC-002, AC-004, AC-005, AC-006, AC-011, AC-015, AC-016, AC-019; NF-002)
**Type:** test
**Files to Create:**
- `packages/domain/src/legal/appointments/__tests__/AvailabilityPolicy.test.ts`
- `packages/domain/src/legal/appointments/__tests__/availability-roles.test.ts`

- [x] Per-weekday hours; touching merge (09-12 + 12-17 → 11:00-13:00 ok); gap not merged; closed weekday (message names
      the weekday + zone); start exactly at closing time rejected; end exactly at close ok.
- [x] 24:00: range ending 1440 accepts 23:00-24:00; 23:30-00:30 → SPANS_MIDNIGHT (message "Book multi-day events as one
      appointment per day."); end at next-day 00:00 with last range ending 1020 → OUTSIDE_HOURS.
- [x] Closures: start date, end date, inclusive first/last day, day before/after, next-day exemption for a 24:00 end,
      closure precedes hours, firm-zone date (Pacific/Auckland instant on the previous UTC day).
- [x] Cap: `count = cap - 1` ok, `= cap` rejected; null unlimited; `undefined` with a cap set throws;
      `CAP_COUNTED_STATUSES ∪ {CANCELLED, NO_SHOW}` equals `APPOINTMENT_STATUSES` (guard).
- [x] Timezone: invalid zone → INVALID_TIMEZONE (no RangeError); `canonicalTimezone('Asia/Calcutta')` is valid and
      idempotent; `toZonedParts` at local 00:00 → minuteOfDay 0.
- [x] DST: Europe/London 2026-03-29 and 2026-10-25, America/New_York 2026-03-08 and 2026-11-01 (09:00-17:00 local holds on
      both sides; 17:00 end ok / 17:01 not on transition days), Asia/Kolkata (+05:30); `localToUtc` gap/overlap;
      `localDayBoundsUtc` 23 h / 25 h; weekday mapping 2026-04-12 (Sun) … 2026-04-18 (Sat).
- [x] `generateCandidates`: anchored at range start (09:30 range yields 09:30, 10:30 …), mid-range `from` rounds up to the
      next grid point, skips closures and closed weekdays, respects duration/same-day, `maxDaysAhead`, `limit` 2000.
- [x] Messages never contain a closure reason or an id.
- [x] Week boundary: a 23:30 local start in Pacific/Auckland (previous UTC date) and in America/New_York resolves to the
      firm-local weekday, not the UTC weekday.
- [x] `mergeRanges` leaves its input array and objects unchanged (frozen input).
- [x] No test depends on the wall clock: every case passes explicit instants and IANA zones; no `process.env.TZ`.
- [x] `isAvailabilityAdminRole`: ADMIN, MANAGER true; USER, undefined false; `AVAILABILITY_ADMIN_ROLES` is
      `ACCOUNT_OWNER_ADMIN_ROLES` (identity assertion, so OWNER/SUPER_ADMIN follow the shared list, as PG-204).
- [x] RED log `red-domain.log` (module not found). *Verified:* "Cannot find module ../AvailabilityPolicy / ../availability-roles", 2 files failed, exit 1.

**Validation:** `pnpm --dir packages/domain exec vitest run src/legal/appointments/__tests__/AvailabilityPolicy.test.ts src/legal/appointments/__tests__/availability-roles.test.ts`

#### Step 3: Application `findFirstFreeCandidate` tests (AC-016, NF-001)
**Type:** test
**Files to Modify:**
- `packages/application/src/usecases/scheduling/__tests__/CheckConflicts.test.ts`

- [x] One `findForConflictCheck` call over `[first.start - before, last.end + after]` with `attendeeIds: [attendeeId]`.
- [x] Returns the first free candidate (conflict on 1st, free 2nd); buffers cause a conflict; empty list → `null`;
      all busy → `null`; repository failure → `Result.fail`.
- [x] RED log `red-application.log` (method missing). *Verified:* 6 failed "findFirstFreeCandidate is not a function", 13 existing passed, exit 1.

**Validation:** `pnpm --dir packages/application exec vitest run src/usecases/scheduling/__tests__/CheckConflicts.test.ts`

#### Step 4: Validator tests (AC-002, AC-003, AC-005, AC-011, AC-021)
**Type:** test
**Files to Create:**
- `packages/validators/src/__tests__/availability.test.ts`
**Files to Modify:**
- `packages/validators/src/__tests__/appointment-settings.test.ts`

- [x] `valid()` + `issues()` + `it.each`: 7 unique weekdays (6, 8, duplicate rejected); minutes 0..1439 / 1..1440;
      start ≥ end rejected; 6 ranges ok, 7 rejected; overlap rejected at `['days', d, 'ranges', j, 'startMinute']` (later
      range, unsorted input); touching allowed; duplicate range rejected.
- [x] Closures: invalid dates (`2026-02-30`, `2026-13-01`, datetime string), bounds 2000-01-01..2100-12-31, end < start,
      366 days ok / 367 rejected (incl. 2028-02-29), reason trimmed, blank → null, 201 chars rejected, overlapping and
      duplicate closures rejected at `['closures', j, 'startDate']`, 200 ok / 201 rejected.
- [x] Buffers 0/240 ok, -1/241 rejected; cap null/1/500 ok, 0/501/1.5 rejected; timezone valid/alias canonicalised/
      invalid (`Not/AZone`, `''`); `tenantId` stripped.
- [x] `updateAppointmentSettingsSchema` strips `defaultBufferBeforeMinutes`, `defaultBufferAfterMinutes`,
      `defaultTimezone`; duration refine still rejects min > max.
- [x] RED log `red-validators.log`. *Verified:* "Cannot find module ../availability"; the new strip test fails on the current schema (1 failed, 25 passed), exit 1.

**Validation:** `pnpm --dir packages/validators exec vitest run src/__tests__/availability.test.ts src/__tests__/appointment-settings.test.ts`

#### Step 5: API enforcement + router tests (AC-010, AC-015..AC-021; NF-001)
**Type:** test
**Files to Create:**
- `apps/api/src/modules/calendar/__tests__/availability.test-utils.ts`
- `apps/api/src/modules/calendar/__tests__/availability-enforcement.test.ts`
- `apps/api/src/modules/calendar/__tests__/availability.router.test.ts`

- [x] Helpers: `stubTenantAvailability(prismaMock, { configured, timezone, ranges, closures, cap, count })` stubs ALL four
      reads; `expectEveryCallTenantScoped(prismaMock, tenantId)` iterates every model's calls.
- [x] Enforcement legacy: settings `null`, `undefined`, non-object, `availabilityConfiguredAt: null` → legacy message;
      Prisma `P2021` and `P2022` on each loader read (settings, hours, closures) → legacy + `console.error` asserted; other
      codes propagate; a failure of the cap `count` (any code, incl. P2022) propagates and never falls back to legacy;
      create uses `legacyTimezone`, reschedule UTC.
- [x] Enforcement configured: each violation code → BAD_REQUEST with the exact contract message; INVALID_TIMEZONE →
      PRECONDITION_FAILED; `input.timezone` ignored; `forceOverrideConflicts` irrelevant; cap null → `count` not called;
      cap set → `count` where = `{tenantId, status in CAP_COUNTED_STATUSES, startTime gte/lt window, id not excludeId}`
      (23 h / 25 h windows); unstubbed `count` → throws (not allow); `toHaveBeenCalledTimes` per model.
- [x] findNextSlot configured: ≤ 5 queries (settings, hours, closures, cap `findMany` bounded to the candidate span,
      one `findFirstFreeCandidate`); full day dropped (`count = cap` dropped, `cap - 1` offered); `null` at horizon/limit;
      starts at `max(startFrom, now)`; returns `{ slot: {startTime, endTime, durationMinutes} | null, searchDurationMs }`.
- [x] Real-use-case contract test: `findNextSlotWithinAvailability` with the REAL `CheckConflictsUseCase` over an
      in-memory `AppointmentRepository` (one busy appointment) returns the first free candidate — anchors the mocked
      `findFirstFreeCandidate` result shape used elsewhere.
- [x] Router get: any role; no lazy create (`create`/`upsert`/`createMany` not called); unconfigured timezone from
      `ctx.user.timezone`; `canEdit` true for ADMIN/MANAGER, false for USER; every query tenant-scoped.
- [x] Router update: ADMIN ok, MANAGER ok, USER FORBIDDEN (no write calls), unauthenticated UNAUTHORIZED; one
      `$transaction` with call order upsert → hours delete/create → closures delete/create (`mock.invocationCallOrder`);
      no `skipDuplicates`; smuggled `tenantId` ignored; P2002 from settings upsert / hours / closures → CONFLICT;
      `availabilityConfiguredAt` = pinned NOW; upsert `update` keys exactly buffers/timezone/cap/configuredAt; create
      branch uses `DEFAULT_APPOINTMENT_SETTINGS`; closure dates sent as UTC-midnight `Date`s and read back as `YYYY-MM-DD`.
- [x] Router reset: ADMIN/MANAGER only; call order `updateMany` → hours → closures; buffers/timezone untouched; no-row safe
      (`count: 0`); returns unconfigured DTO; cross-tenant: tenant A caller never sees tenant B rows.
- [x] RED log `red-api-calendar.log` (modules missing). *Verified:* "Cannot find module ../availability-enforcement / ../availability.router", exit 1.

**Validation:** `pnpm --dir apps/api exec vitest run src/modules/calendar/__tests__/availability-enforcement.test.ts src/modules/calendar/__tests__/availability.router.test.ts`

#### Step 6: Booking wiring + regression-net tests (AC-015, AC-016, AC-017, AC-020, AC-021)
**Type:** test
**Files to Create:**
- `apps/api/src/modules/legal/__tests__/appointments.availability-boundary.test.ts`
**Files to Modify:**
- `apps/api/src/modules/legal/__tests__/appointments.router.caller.test.ts`
- `apps/api/src/modules/legal/__tests__/appointment-settings.router.test.ts`
- `apps/api/src/__tests__/app-router.smoke.test.ts`
- `apps/api/src/agent/__tests__/approved-action-executor.test.ts`
- `apps/api/src/modules/legal/__tests__/legal-module-entitlement.test.ts`

- [x] Caller `describe('availability enforcement (PG-202)')`: configured create/reschedule blocked (hours, closure, cap,
      midnight) with the use case NOT called; allowed case calls it; firm zone governs (08:30Z ok in London BST, input
      `Asia/Tokyo` ignored); unconfigured keeps legacy; availability runs before the use case (call order); reschedule
      within the same full day passes (excludes itself), into a full day fails; findNextSlot configured vs unconfigured;
      cross-tenant A (Mon-Fri 09-12) / B (unconfigured): B Sat 15:00 ok, A Sat 15:00 blocked, every read for A carries A.
- [x] Boundary guard: `appointments.router.ts` contains no `BUSINESS_HOURS_` / `assertWithinBusinessHours` and calls
      `assertAppointmentWithinAvailability` exactly twice.
- [x] appointment-settings router: `update` with old-client buffers/timezone leaves them out of `upsert.update`;
      `resetToDefaults` update branch has no buffers/timezone and sets `primaryCalendarId: null`; `get` unchanged.
- [x] Smoke: root `appRouter._def.record.calendar` exposes `availability.{get,update,resetToDefaults}` (+ typo guard);
      runtime check that the real `container.checkConflictsUseCase.findFirstFreeCandidate` is a function.
- [x] Executor: an availability BAD_REQUEST from `create`/`reschedule` surfaces as a failed execution, not a crash.
- [x] Entitlement: `calendar.availability` not in `LEGAL_ROUTERS` (calendar is core).
- [x] RED log `red-api-wiring.log` (the characterization file stays GREEN). *Verified:* 22 failed / 128 passed; the characterization, legacy and executor guard cases pass (the executor router is mocked, so those two are regression guards, not RED-able); exit 1.

**Validation:** `pnpm --dir apps/api exec vitest run src/modules/legal/__tests__/appointments.router.caller.test.ts src/modules/legal/__tests__/appointments.availability-boundary.test.ts src/modules/legal/__tests__/appointment-settings.router.test.ts src/__tests__/app-router.smoke.test.ts src/agent/__tests__/approved-action-executor.test.ts src/modules/legal/__tests__/legal-module-entitlement.test.ts`

#### Step 7: DB integration test (AC-005, AC-018, AC-020)
**Type:** test
**Files to Create:**
- `tests/integration/availability.test.ts`

- [x] `describeDb` gate with a visible skip reason; random run prefix (`pg202_${Date.now()}_${rand}`), cleanup in
      `afterAll` (hours, closures, settings, tenants) + stale-prefix sweep; `ensureMigrationSql()` probes BOTH
      `availability_hours_range_check` and `appointment_settings_maxDailyBookings_check`.
- [x] Insert-failure matrix (23514/23505/23503): weekday -1/7, start -1, end 1441, start == end, start > end,
      endDate < startDate, blank reason, reason 201 chars, cap 0/501, duplicate hours row, duplicate closure, missing tenant;
      accepted boundaries 0-1440, cap NULL/1/500; columns nullable with no default.
- [x] Tenant delete cascades hours + closures.
- [x] RLS with `SET LOCAL app.current_tenant_id` inside a transaction on the `authenticated` role: tenant A cannot read or
      insert tenant B rows (skip disclosed when the role is missing — never counted as a pass).
- [x] DATE round-trip: `SET TIME ZONE 'Pacific/Auckland'`, write 2026-03-29 via Prisma, read via Prisma and
      `SELECT "startDate"::text` → `2026-03-29`.
- [x] Real adapter error shape (consensus mod 1): in a throwaway database from `scripts/lib/ephemeral-test-db.mjs`
      (never the shared DB), drop `appointment_settings."availabilityConfiguredAt"` after `migrate deploy`, call
      `loadTenantAvailability` with a real `PrismaClient` + `PrismaPg` adapter, and assert it returns `{configured:false}`
      and that the caught error carries `code: 'P2022'` (the shape the unit tests mock). Skip disclosed if the ephemeral DB
      helper cannot run.
- [x] RED log `red-integration.log` (tables missing). *Verified:* "Cannot find module …/availability-enforcement" (module + migration absent), exit 1, run under `--exclusive intelliflow-db`. Probe uses a throwaway Postgres schema instead of a whole ephemeral DB (same real adapter error, no shared table touched).

**Validation:** `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-202 --exclusive intelliflow-db -- pnpm exec vitest run --project integration tests/integration/availability.test.ts`

#### Step 8: Web tests (AC-001..AC-009, AC-017, AC-019, AC-022..AC-024)
**Type:** test
**Files to Create:**
- `apps/web/src/app/calendar/availability/__tests__/page.test.tsx`
- `apps/web/src/app/calendar/availability/__tests__/AvailabilityContent.test.tsx`
- `apps/web/src/app/calendar/availability/__tests__/AvailabilityContent.actions.test.tsx`
- `apps/web/src/app/calendar/availability/__tests__/AvailabilityLoading.test.tsx`
- `apps/web/src/app/calendar/availability/__tests__/availability-draft.test.ts`
- `apps/web/src/app/calendar/availability/components/__tests__/WeeklyHoursCard.test.tsx`
- `apps/web/src/app/calendar/availability/components/__tests__/TimezoneCard.test.tsx`
- `apps/web/src/app/calendar/availability/components/__tests__/BuffersCapCard.test.tsx`
- `apps/web/src/app/calendar/availability/components/__tests__/ClosuresList.test.tsx`
**Files to Modify:**
- `apps/web/src/app/calendar/calendar-settings/__tests__/BufferRemindersTab.test.tsx`
- `apps/web/src/app/calendar/calendar-settings/__tests__/CalendarIntegrationTab.test.tsx`
- `apps/web/src/app/calendar/calendar-settings/__tests__/CalendarSettingsContent.test.tsx`
- `apps/web/src/components/appointments/__tests__/AppointmentForm.test.tsx`
- `apps/web/src/components/appointments/__tests__/AppointmentDetail.test.tsx`
- `apps/web/src/app/appointments/new/__tests__/page.onsuccess.test.tsx`
- `apps/web/src/components/settings/__tests__/ModuleSettingsLayout.test.tsx`
- `apps/web/src/components/settings/__tests__/TimezoneSelector.test.tsx`
- `apps/web/src/components/aurora-landing/sections/__tests__/InboxCalendarSection.test.tsx`

- [x] page: server shell renders `AvailabilityLoading` fallback then content; no "coming soon".
- [x] AvailabilityLoading: wrapper `aria-busy="true"`, sr-only `<output>` "Loading availability", skeletons `aria-hidden`,
      four card skeletons in bento order (8 / 4 / 8 / 4 spans).
- [x] Closure reasons are shown to every tenant member, read-only view included (text rows), and never in booking errors.
- [x] AvailabilityContent (jsdom pragma, `vi.hoisted` trpc mock, real PageHeader, axe-core): bento order Weekly / Timezone /
      Closures / Buffers; headings `[1,2,2,2,2]` (+ EmptyState h3 under Closures); query error `role="alert"` + Retry;
      unconfigured prefill 07:00-19:00 × 7 from `LEGACY_BOOKING_HOURS` + the exact unconfigured note; first save with only a
      closure sends full prefill hours; viewer-zone note only when zones differ; closure dates displayed without a day shift
      for an America/Los_Angeles viewer (context formatters not called with closure strings); read-only: no combobox/
      spinbutton/switch/textbox, values as text, no Save/Reset; axe zero violations in default, unconfigured,
      validation-error, empty-closures, read-only.
- [x] Actions: Save disabled when clean (enabled when unconfigured + canEdit), enabled when dirty, disabled while saving;
      label "Save Changes" stable; no `hideOnMobile`; validation runs on click → `role="alert"` summary "N problems need
      fixing", focus first invalid; success → toast only, snapshot refreshed, focus on the Weekly hours title; server
      error → `role="alert"`, focus on it, no destructive toast; CONFLICT → alert + Reload (Save disabled until reload);
      Reset → `ConfirmationDialog` text lists reset vs kept, Cancel keeps the draft, Confirm calls `resetToDefaults` once,
      announces in the polite region, focus to the Weekly hours title.
- [x] availability-draft: minute↔`HH:MM` incl. 00:00, 23:59, end `00:00` ⇔ 1440 (start > 0), `00:00`-`00:00` invalid;
      `toUpdateInput` sends open days only; `normalize` stable; Sun..Sat ↔ Monday-first issue-path mapping (Sunday case).
- [x] WeeklyHoursCard: fieldset/legend per day (Monday first), Switch "Monday open" + description, positional names, Add
      range ("Add range for Monday"), Remove only when > 1 range, 6-range `aria-disabled` + announcement, focus after
      add/remove, switch off hides controls and keeps ranges in the draft, closed days not validated.
- [x] TimezoneCard: label + selector id, detect button hidden, confirm note while unconfigured, zone-change helper text.
- [x] BuffersCapCard: labelled number inputs with help, empty → error (no null-for-number), cap Switch off → `null`,
      on + empty → error, 0/501 rejected.
- [x] ClosuresList: `forwardRef` `openCreate` adds a row and focuses its start date; EmptyState exact props, no CTA inside;
      per-row names; end < start error; reason limit; remove focus order; 200 limit; draft order kept while editing.
- [x] calendar-settings: no buffer inputs; tab/heading "Reminders"; pointer text with current values + link
      `getByRole('link', {name: 'Manage working hours, buffers and timezone in Availability'})` →
      `/calendar/availability` in both tabs; save payload has no buffers/timezone; dirty detection still works on remaining
      fields; one switch on the integration tab; `resetDescription` text passed.
- [x] AppointmentForm: "submits a 06:00 start (no client-side business-hours rule)" (RED on current code); rejected
      `onSubmit` (Error and non-Error) → `role="alert"` `form-submit-error` with `text-red-700 dark:text-red-300`, cleared on
      next submit and on field edit, submit re-enabled; `defaultBuffers` initialise new-appointment buffers, edit mode keeps
      the appointment's own; Event Timezone help text.
- [x] AppointmentDetail: rejected reschedule keeps the dialog open, shows the message in `role="alert"`, input preserved;
      success closes it.
- [x] new/page: renders the form after `appointmentSettings.get` settles and passes `defaultBuffers`.
- [x] ModuleSettingsLayout: custom `resetDescription` shown; default unchanged. TimezoneSelector: `showDetect={false}` hides
      the button; default shows it.
- [x] RED log `red-web.log` (one run over the listed files). *Verified:* 17 files failed / 9 passed, 25 tests failed / 200 passed (new modules missing; changed contracts fail on current components), exit 1.

**Validation:** `pnpm --dir apps/web exec vitest run src/app/calendar src/components/appointments/__tests__ src/app/appointments/new src/components/settings/__tests__/ModuleSettingsLayout.test.tsx src/components/settings/__tests__/TimezoneSelector.test.tsx src/components/aurora-landing/sections/__tests__/InboxCalendarSection.test.tsx`

### Phase 2 — GREEN: Make Tests Pass (layer order: domain → application → validators → db → api → web)

#### Step 9: Domain policy + roles
**Type:** implementation
**Files to Create:**
- `packages/domain/src/legal/appointments/AvailabilityPolicy.ts`
- `packages/domain/src/legal/appointments/availability-roles.ts`
**Files to Modify:**
- `packages/domain/src/index.ts`

- [x] Implement the spec "Domain" contract (pure; `Intl` only; `DomainError` subclass per `Buffer.ts:4-10`).
- [x] Barrel exports after `packages/domain/src/index.ts:80`; `pnpm --filter @intelliflow/domain build` (stale-dist rule).
- [x] GREEN log `green-domain.log`; coverage ≥ 95% on both files. *Verified:* 51 passed; All files 98.7% stmts / 97.46% branches / 100% funcs / 100% lines; `pnpm --filter @intelliflow/domain build` exit 0.

**Validation:** Step 2 command, then `pnpm --dir packages/domain exec vitest run --coverage.enabled --coverage.include=src/legal/appointments/AvailabilityPolicy.ts --coverage.include=src/legal/appointments/availability-roles.ts src/legal/appointments/__tests__`

#### Step 10: Application method
**Type:** implementation
**Files to Modify:**
- `packages/application/src/usecases/scheduling/CheckConflicts.ts`

- [x] `findFirstFreeCandidate` per spec (one repository read, the existing pure conflict check per candidate, wraps
      `[attendeeId]`). No container change. `pnpm --filter @intelliflow/application build`.
- [x] GREEN log `green-application.log`; coverage > 90% on the new method's lines. *Verified:* 20 passed; the uncovered lines (103, 143, 188, 209, 245) are pre-existing, every added line is covered; build exit 0.

**Validation:** Step 3 command, then `pnpm --dir packages/application exec vitest run --coverage.enabled --coverage.include=src/usecases/scheduling/CheckConflicts.ts src/usecases/scheduling/__tests__/CheckConflicts.test.ts`

#### Step 11: Validators
**Type:** implementation
**Files to Create:**
- `packages/validators/src/availability.ts`
**Files to Modify:**
- `packages/validators/src/appointment-settings.ts`
- `packages/validators/src/index.ts`

- [x] Schemas, DTO types, re-exports of `LEGACY_BOOKING_HOURS` / `AVAILABILITY_LIMITS`; update schema `.omit(...)`.
- [x] `pnpm --filter @intelliflow/validators build`; GREEN log `green-validators.log`; coverage > 90%. *Verified:* 68 passed; availability.ts 100% lines / 92% branches; appointment-settings.ts 100%; build + typecheck exit 0.

**Validation:** Step 4 command, then `pnpm --dir packages/validators exec vitest run --coverage.enabled --coverage.include=src/availability.ts --coverage.include=src/appointment-settings.ts src/__tests__/availability.test.ts src/__tests__/appointment-settings.test.ts`

#### Step 12: Prisma schema + migration (Class A, L13)
**Type:** implementation
**Files to Create:**
- `packages/db/prisma/migrations/20261017130000_availability/migration.sql`
**Files to Modify:**
- `packages/db/prisma/schema.prisma`
- `packages/db/src/index.ts`

- [x] Migration per the R2 data-engineer draft (header: Class A bullets, forward-only recovery, "merged, not applied").
- [x] Models + Tenant `@ignore` relations + two `AppointmentSettings` fields; allowlist after :99; grep `packages/db/src`
      for any other model registry.
- [x] Index names stay the Prisma defaults (`availability_hours_tenantId_weekday_startMinute_key`, …) so
      `prisma migrate diff` shows no drift.
- [x] `pnpm --filter @intelliflow/db exec prisma generate` (never `--no-engine`), `pnpm --filter @intelliflow/db build`.
- [x] Independent SQL review by a sub-agent (Class A gate 1) on `migration.sql` only → `matop/sql-review.json`; then
      freeze the file. *Verified:* `pg202-sql-reviewer` (data-engineer) APPROVE, 6 INFO findings, no fixes required; sha256 in `matop/migration-freeze.txt`.
- [x] Apply to the local test DB (fresh DB via `scripts/lib/ephemeral-test-db.mjs` where available) and run Step 7 →
      GREEN log `green-integration.log`. *Verified:* 20 passed (verbose list in the log) incl. RLS session check and the real-adapter P2022 probe; applied via the test's `ensureMigrationSql()` (shared DB, exclusive slot), not `migrate deploy`, so the shared DB's migration history is untouched.

**Validation:** `pnpm --filter @intelliflow/db typecheck` and the Step 7 command

#### Step 13: Settings defaults module + appointment-settings router
**Type:** implementation
**Files to Create:**
- `apps/api/src/modules/legal/appointment-settings.defaults.ts`
**Files to Modify:**
- `apps/api/src/modules/legal/appointment-settings.router.ts`

- [x] Move `DEFAULT_APPOINTMENT_SETTINGS`; reset update branch = defaults minus buffers/timezone + `primaryCalendarId: null`.

**Validation:** `pnpm --dir apps/api exec vitest run src/modules/legal/__tests__/appointment-settings.router.test.ts`

#### Step 14: Availability router + enforcement helper + registration
**Type:** implementation
**Files to Create:**
- `apps/api/src/modules/calendar/availability.router.ts`
- `apps/api/src/modules/calendar/availability-enforcement.ts`
**Files to Modify:**
- `apps/api/src/modules/calendar/calendar.router.ts`

- [x] Router per spec (plain `tenantProcedure`, `assertTenantContext`, explicit `tenantId`, settings-first transaction,
      P2002 → CONFLICT, no lazy create).
- [x] Helper per spec (structural `AvailabilityPrisma` type over the four delegates; legacy branch = the router's
      `getLocalHour` + `assertWithinBusinessHours` moved verbatim with constants from `LEGACY_BOOKING_HOURS`; P2021/P2022
      fallback with `console.error`; `findNextSlotWithinAvailability`).
- [x] `availability.router.ts` imports `DEFAULT_APPOINTMENT_SETTINGS` from `../legal/appointment-settings.defaults` and
      `isAvailabilityAdminRole` from `@intelliflow/domain`; the helper imports `evaluateAvailability`, `capCountWindow`,
      `generateCandidates`, `CAP_COUNTED_STATUSES`, `LEGACY_BOOKING_HOURS` from `@intelliflow/domain`.
- [x] `availability: availabilityRouter` in `calendar.router.ts`.
- [x] GREEN log `green-api-calendar.log`; coverage > 90% on both new files. *Verified:* 80 passed; 97.47% stmts / 92.13% branches / 100% lines.

**Validation:** Step 5 command, then `pnpm --dir apps/api exec vitest run --coverage.enabled --coverage.include=src/modules/calendar/availability.router.ts --coverage.include=src/modules/calendar/availability-enforcement.ts src/modules/calendar/__tests__`

#### Step 15: Booking wiring (replaces the legacy helper)
**Type:** implementation
**Files to Modify:**
- `apps/api/src/modules/legal/appointments.router.ts`

- [x] Import; create `:512-513` and reschedule `:786-787` swaps exactly as the spec; findNextSlot `:1141-1177` configured
      branch; delete `:191-197` and `:316-358`; keep the `tenantProcedure` shadow `:307-314`; update comments.
- [x] If `appointments.router.test.ts` / `.comprehensive.test.ts` crash on the new settings read, add
      `prismaMock.appointmentSettings.findUnique.mockResolvedValue(null)` to their `beforeEach` (conditional).
- [x] Runtime check: `container.checkConflictsUseCase.findFirstFreeCandidate` is a function (smoke test).
- [x] GREEN log `green-api-wiring.log`; characterization log re-run GREEN (`characterization-legacy-after.log`). *Verified:* 11 files / 288 passed incl. untouched appointments.router.test / comprehensive / tenant-isolation; characterization 9 passed after the swap; api typecheck exit 0.

**Validation:** Step 6 command + Step 1 command

#### Step 16: Availability page
**Type:** implementation
**Files to Create:**
- `apps/web/src/app/calendar/availability/AvailabilityContent.tsx`
- `apps/web/src/app/calendar/availability/AvailabilityLoading.tsx`
- `apps/web/src/app/calendar/availability/availability-draft.ts`
- `apps/web/src/app/calendar/availability/components/WeeklyHoursCard.tsx`
- `apps/web/src/app/calendar/availability/components/TimezoneCard.tsx`
- `apps/web/src/app/calendar/availability/components/BuffersCapCard.tsx`
- `apps/web/src/app/calendar/availability/components/ClosuresList.tsx`
**Files to Modify:**
- `apps/web/src/app/calendar/availability/page.tsx`
- `apps/web/src/components/settings/TimezoneSelector.tsx`
- `packages/ui/src/components/confirmation-dialog.tsx` (exec addition: optional `onCloseAutoFocus` so focus can move to
  the Weekly hours title after Reset; test `packages/ui/__tests__/confirmation-dialog.test.tsx`)

- [x] Invoke `/frontend-design` before writing UI; follow the playbook §1-§4 and the PG-204 case-types page as the visual
      reference (no Figma mockup exists for this route; design check recorded in `matop/design-check-availability.md`).
- [x] Shared pieces reused (no new shared component): `PageHeader` (`apps/web/src/components/shared/page-header.tsx`,
      `actions` with `variant:'primary'|'secondary'`, no `hideOnMobile`), `SectionHeader`
      (`apps/web/src/components/shared/section-header.tsx`, `headingLevel={2}`, `titleId`, `action`, `focusableTitle` on
      Weekly hours), `ConfirmationDialog` + `EmptyState entity="appointments" phase="passive" size="sm"
      className="py-4 px-3 gap-2"` + `Card`/`Button`/`Input`/`Label`/`Switch`/`Skeleton` (`@intelliflow/ui`),
      `TimezoneSelector` (`apps/web/src/components/settings/TimezoneSelector.tsx`, `id`/`invalid`/`describedBy`/new
      `showDetect`), `useTimezoneContext` (`apps/web/src/providers/TimezoneProvider.tsx:106`); `trpc` from `@/lib/trpc`;
      `useRequireAuth` from `@/lib/auth/AuthContext`.
- [x] Material Symbols only (`docs/design/ICON_USAGE.md`); decorative icons `aria-hidden`; error text
      `text-red-700 dark:text-red-300`; no `fieldset className="contents"`; no new dependency.
- [x] GREEN log `green-web-availability.log`.

**Validation:** `pnpm --dir apps/web exec vitest run src/app/calendar/availability src/components/settings/__tests__/TimezoneSelector.test.tsx`

#### Step 17: Calendar settings + appointment surfaces
**Type:** implementation
**Files to Modify:**
- `apps/web/src/app/calendar/calendar-settings/CalendarSettingsContent.tsx`
- `apps/web/src/app/calendar/calendar-settings/components/BufferRemindersTab.tsx`
- `apps/web/src/app/calendar/calendar-settings/components/CalendarIntegrationTab.tsx`
- `apps/web/src/components/settings/ModuleSettingsLayout.tsx`
- `apps/web/src/components/appointments/AppointmentForm.tsx`
- `apps/web/src/app/appointments/new/page.tsx`
- `apps/web/src/components/appointments/AppointmentDetail.tsx`
- Exec additions: `apps/web/src/app/calendar/calendar-settings/components/AvailabilityPointer.tsx` (the one pointer + link
  shared by both tabs, instead of a copied block); `AppointmentDetail` modal backdrop loses `aria-hidden="true"`, which hid
  the whole dialog (and the new alert) from assistive technology.

- [x] calendar-settings per spec (`next/link` pointers, "Reminders", payload/mapSettings/normalize, `resetDescription`).
- [x] AppointmentForm: delete `:118-138`; catch `onSubmit`; `defaultBuffers`; Event Timezone help. No change to
      attendee/client/assignee/conflict logic.
- [x] new/page: wait for `appointmentSettings.get`, pass `defaultBuffers`.
- [x] AppointmentDetail `handleAction`: catch → `actionError`, close only on success.
- [x] GREEN log `green-web-surfaces.log`. *Verified:* 26 files / 313 tests passed, exit 0.

**Validation:** Step 8 command

### Phase 3 — REFACTOR: cleanup, docs and tracking

#### Step 18: Refactor pass
**Type:** refactor
- [x] Remove duplication (no copied fixtures across test files; shared factories), check `knip` for unused exports,
      Sonar guard on touched files (`pnpm run lint:sonar:guard`), typecheck + lint of every touched package.
      *Verified:* shared factories `availability.test-utils.ts` (API) and `availability-fixtures.ts` (web); the
      calendar-settings pointer is one component (`AvailabilityPointer.tsx`). `knip` (`matop/knip.log`) lists no PG-202
      file. Sonar guard over all 69 changed TS files found 12 issues (cognitive complexity in `AvailabilityPolicy`,
      `AvailabilityContent`, API test utils; nested ternaries; nested template literal; `role="region"` → `<section>`;
      non-native interaction on the modal backdrop), all fixed, re-run exit 0. Workspace typecheck + staged lint passed
      in the five commit hooks.
- [x] `node tools/scripts/subset-material-symbols.mjs --verify`; if a new glyph (e.g. the range/closure remove icon) is
      missing, regenerate the subset font + audit JSON with the script and commit them with the UI. *Verified:*
      `audit OK — 370 icons`; no new glyph (schedule, public, event_busy, timer, close already in the subset).
- [x] Confirm `sonar-project.properties` (`sonar.coverage.exclusions`, :148-157 test-helper rule) and
      `scripts/check-diff-coverage.mjs` treat `apps/api/src/modules/calendar/__tests__/availability.test-utils.ts` as a test
      helper (excluded from new-code coverage); record the line that matches. *Verified:* `sonar-project.properties:158`
      `**/__tests__/**` and `scripts/lib/diff-coverage.mjs:38` (`(__tests__|__mocks__|…)\/` segment).
- [x] Re-run Steps 1-8 commands → all GREEN (`refactor-rerun.log`). *Verified:* 9 commands (Steps 1-8 + the ConfirmationDialog
      test), 697 tests, every exit 0, overall 0.

**Validation:** typecheck + lint rows of the Validation Matrix

#### Step 19: Docs, registries, ADR/PRD, findings
**Type:** docs
**Files to Modify:**
- `docs/design/page-registry.md`
- `docs/design/sitemap.md`
- `docs/design/PAGE_MAP_AND_FLOWS.md`
- `docs/design/navigation-reachability-audit.md`
- `docs/design/ui-flow-mapping.md`
- `docs/design/information-architecture.md`
- `docs/architecture/diagrams/complete-dependency-chains.md`
- `docs/architecture/diagrams/legal-scheduling-dependency-chain.md`
- `docs/architecture/adr/ADR-081-tenant-availability.md`
- `docs/planning/prd-module-settings.md`
- `artifacts/reports/content-audit-results.json`
- `artifacts/metrics/debt-ledger.yaml`
**Files to Create:**
- `.specify/sprints/sprint-18/findings/PG-202-findings.md`

- [x] Change only PG-202's own additions in shared registries (PG-205 lane edits the same counts). *Verified:* only the
      Calendar rows/section counts, the `calendar.availability` router row and procedure total (header router count stays
      69: a nested router is not a `router.ts` registration), and +5 debt-ledger items.
- [x] `legal-scheduling-dependency-chain.md`: add the PG-202 availability chain (AvailabilityPolicy → validators →
      availability_hours/closures → calendar.availability + appointments create/reschedule/findNextSlot → page);
      `complete-dependency-chains.md` PG-202 entry marked ✅.
- [x] Red-flag tracking on all three surfaces (gh issue with file:line + fix, debt-ledger, findings doc): legacy
      cross-midnight gap; `appointment_settings` RLS without `WITH CHECK`; `defaultTimezone` default 'UTC' vs ADR-044;
      stale `/calendar/new`, `/calendar/[id]` registry rows; recurring series checked on the first occurrence only;
      findNextSlot has no UI caller; daily cap best-effort. *Verified:* gh #909-#913, debt-ledger
      `PG-202-*` (5 items), `.specify/sprints/sprint-18/findings/PG-202-findings.md` (F1-F9 fixed, T1-T5 tracked).
- [x] Reconciliation tests green: `pnpm --dir apps/web exec vitest run src/app/__tests__/ui-flow-mapping-reconciliation.test.ts src/app/__tests__/ia-reconciliation.test.ts src/app/__tests__/sitemap-reconciliation.test.ts src/__tests__/content-audit-schema.test.ts`. *Verified:* 29 passed (after keeping the header router count
      at 69); `check-page-doc-cochange.mjs PG-202` exit 0.

**Validation:** the reconciliation command above + `node tools/scripts/exec-preflight/check-page-doc-cochange.mjs PG-202`

### Phase 4 — VALIDATION

#### Step 20: Full validation, reviews, Lighthouse
**Type:** validation
- [ ] Validation Matrix in order (one process at a time); L5 health-server flake: re-run once and report both runs.
- [ ] `node scripts/codex-review.mjs` iterated until clean (waivers only with evidence).
- [ ] `/code-review` on the diff; `/sonarqube-fix` for any new finding; `knip`; a11y-expert WCAG 2.1 AA review on the built
      UI (→ `matop/a11y-review.json`, fix findings); STOA Foundation by a spawned `stoa-foundation` sub-agent (+ others the
      gate selection names).
- [ ] First-load JS of `/calendar/availability` vs `/cases/case-types` from `next build` output (NF-003).
- [ ] Lighthouse: run `lighthouse:auth` with `LHCI_URLS`/`LHCI_OUTPUT_DIR=artifacts/lighthouse/PG-202` only if
      `LHCI_TEST_EMAIL`/`LHCI_TEST_PASSWORD` exist for a non-production auth target; otherwise Path A attempt + NEEDS_HUMAN
      with evidence (`artifacts/lighthouse/PG-202/waiver-evidence.md`).

#### Step 21: Attestation, tracking, close
**Type:** validation
**Files to Modify:**
- `.specify/sprints/sprint-18/attestations/PG-202/attestation.json`
- `.specify/sprints/sprint-18/attestations/PG-202/context_ack.json` (final hash refresh)
- `.specify/sprints/sprint-18/attestations/PG-202/task-tracking.json`
- `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`
- `apps/project-tracker/docs/metrics/_global/Sprint_plan_I.csv` (regenerated, not hand-edited)
- `docs/compliance-and-governance/compliance/wcag-conformance-statement.md`
- `docs/compliance-and-governance/compliance/vpat-2.5.md`

- [ ] Attestation: every gate PASS or NEEDS_HUMAN with reason (Lighthouse, Class A gates 4/7/10-prod); artifact hashes incl.
      the migration; KPIs from logs; `node tools/scripts/exec-preflight/check-attestation-phrases.mjs PG-202` and
      `check-attestation-provenance.mjs PG-202`.
- [ ] WCAG 1.9.0 / VPAT 1.10.0 rows with the real review result.
- [ ] CSV artifacts list updated with the new files, and the pre-requisite `FILE:apps/web/src/components/sidebar/configs/appointments.ts`
      corrected to `configs/calendar.ts` (where the entry lives); status → `Completed` only via /exec Phase 5 after all
      gates pass.
- [ ] After every `Sprint_plan.csv` edit, regenerate the splits with `npx tsx tools/scripts/split-sprint-plan.ts` (updates
      `Sprint_plan_I.csv`), then run the plan validation the repo uses for CSV edits and keep only PG-202's row changes.
- [ ] PR body draft (`matop/pr-body.md`, used at SHIP): the four accepted behaviour changes for configured tenants (spec
      Overview), the legacy default for unconfigured tenants, the **migration-before-API** order with Class A gates
      4/7/10-prod NEEDS_HUMAN, the AppointmentForm/AppointmentDetail changes disclosed to Aurora, and every NEEDS_HUMAN item.

## Validation Matrix

| Scope | Purpose | Command |
|---|---|---|
| Characterization | legacy unchanged | `pnpm --dir apps/api exec vitest run src/modules/legal/__tests__/appointments.legacy-hours.characterization.test.ts` |
| Domain full | policy ≥ 95% + regression | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-202 -- pnpm --filter @intelliflow/domain test` |
| Application full | findFirstFreeCandidate + scheduling | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-202 -- pnpm --filter @intelliflow/application test` |
| Validators full | schemas + appointment-settings | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-202 -- pnpm --filter @intelliflow/validators test` |
| DB | client + types | `pnpm --filter @intelliflow/db build && pnpm --filter @intelliflow/db typecheck` |
| API full | router, enforcement, wiring, legacy legal suites, agent | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-202 -- pnpm --filter @intelliflow/api test` |
| Integration (DB) | constraints, cascade, RLS, DATE | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-202 --exclusive intelliflow-db -- pnpm exec vitest run --project integration tests/integration/availability.test.ts tests/integration/rls-tenant-isolation.test.ts` |
| Web full | page, calendar-settings, appointments, registries | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-202 -- pnpm --dir apps/web exec vitest run` |
| Typecheck | all touched packages | `pnpm --filter @intelliflow/domain typecheck && pnpm --filter @intelliflow/application typecheck && pnpm --filter @intelliflow/validators typecheck && pnpm --filter @intelliflow/api typecheck && pnpm --filter @intelliflow/web typecheck` |
| Lint | touched packages + sonar guard | `pnpm --filter @intelliflow/domain lint && pnpm --filter @intelliflow/application lint && pnpm --filter @intelliflow/validators lint && pnpm --filter @intelliflow/api lint && pnpm --filter @intelliflow/web lint && pnpm run lint:sonar:guard` |
| Build | touched packages + web | `pnpm --filter @intelliflow/domain build && pnpm --filter @intelliflow/application build && pnpm --filter @intelliflow/validators build && pnpm --filter @intelliflow/db build && node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-202 -- pnpm --filter @intelliflow/api build && node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-202 -- pnpm --filter @intelliflow/web build` |
| Coverage targets | domain > 95%; application, validators, API > 90% (NF-002) | the per-step coverage commands in Steps 9, 10, 11, 14 |
| Diff coverage | Sonar new_coverage ≥ 80% on changed lines | per-package `vitest run --coverage.enabled --coverage.include=<changed file>` for every changed source file (incl. web), then `node scripts/check-diff-coverage.mjs`; no `istanbul ignore` / `c8 ignore` |
| Semantic review | codex gate | `node scripts/codex-review.mjs` |
| Preflights | exec gates | the four `tools/scripts/exec-preflight/*.mjs PG-202` checks + attestation checks |

## Integration Checkpoints Summary

| After Step | Verification | Command |
|---|---|---|
| 1 | legacy pinned GREEN | Step 1 command |
| 8 | all RED logs saved | `ls .specify/sprints/sprint-18/execution/PG-202/exec-PG-202-20261017/tdd/red-*.log` |
| 9 | domain green + built | Step 9 commands |
| 11 | validators green; api compiles | `pnpm --filter @intelliflow/api typecheck` |
| 12 | migration applies; integration green | Step 7 command |
| 15 | api suites green; characterization still green | Step 6 + Step 1 commands |
| 17 | web suites green; web typecheck | Step 8 command + `pnpm --filter @intelliflow/web typecheck` |
| 19 | registry tests green | Step 19 command |
| 20 | full matrix green; codex clean | Validation Matrix |

## Acceptance Criteria Traceability

| AC / NF | Steps |
|---|---|
| AC-001 | 8, 16 |
| AC-002 | 2, 4, 8, 9, 11, 16 |
| AC-003 | 4, 6, 8, 11, 13, 16, 17 |
| AC-004 | 2, 4, 5, 8, 9, 14, 16 |
| AC-005 | 2, 4, 7, 8, 11, 12, 16 |
| AC-006 | 2, 8, 9, 16 |
| AC-007 | 8, 16 |
| AC-008 | 8, 16 |
| AC-009 | 8, 16 |
| AC-010 | 5, 14 |
| AC-011 | 4, 11 |
| AC-012 | N/A (no colour tokens; named CHECKs in 12) |
| AC-013 | N/A (no AI columns) |
| AC-014 | 8, 16 (draft-only switches) + 6, 15 (wired) |
| AC-015 | 2, 5, 6, 9, 14, 15 |
| AC-016 | 3, 5, 6, 10, 14, 15 |
| AC-017 | 1, 5, 6, 8, 14, 15, 16 |
| AC-018 | 7, 12 |
| AC-019 | 2, 5, 8, 14, 16 |
| AC-020 | 5, 6, 7, 14 |
| AC-021 | 4, 6, 11, 13, 17 |
| AC-022 | 8, 17 |
| AC-023 | 8, 17 |
| AC-024 | 8, 16, 17, 20 |
| AC-025 | 20 |
| AC-026 | 19 |
| AC-027 | 18, 20 |
| NF-001 | 3, 5, 10, 14 |
| NF-002 | 9, 10, 11, 14, 20 |
| NF-003 | 16, 20 |
| NF-004 | 2, 19 (ADR + findings) |

## Boolean toggles (playbook §8)

| Toggle | Category | Consumer |
|---|---|---|
| (none persisted) | — | the weekday open Switch and the "Limit bookings per day" Switch are draft-only controls mapped to hour rows and `maxDailyBookings`, both enforced at booking (Steps 14, 15) |

No AI toggles; no colour tokens.

## Plan-Reviewer Sign-off

<!-- plan-reviewer: subagent -->
reviewer_subagent: pg202-plan-reviewer (.claude/agents/plan-reviewer.md, spawned via the Agent tool with
`subagent_type: plan-reviewer`)

| Iteration | Verdict | Findings |
|---|---|---|
| 1 | REVISE (5 ERRORS, 10 WARNINGS, 6 INFO), returned 2026-10-17T17:10:06Z | ERRORS: missing `legal-scheduling-dependency-chain.md`; consensus mod 1 real adapter error shape + cap-count no-fallback; Step 2 missing Auckland week boundary / `mergeRanges` immutability / no wall clock; no `AvailabilityLoading` test bullet; per-layer coverage targets missing. WARNINGS: roles wording, real-use-case contract test, container method RED, test-utils Sonar treatment, PR-body behaviour changes, Material Symbols `--verify`, shared pieces listed, `context_ack.json` create block, index names + closure-reason visibility, Step 14 imports. INFO: CSV counted separately, layer order, CSV FILE prefix, no mockup, sign-off pending, effort OK. All fixed in this revision. |
| 2 | REVISE (1 ERROR, 0 WARNINGS, 2 INFO), returned 2026-10-17T17:12:56Z | All 21 items verified fixed. New: `Sprint_plan_I.csv` (summary item 17) in no step → added to Step 21 with the `split-sprint-plan.ts` regeneration checkbox; NF-002 row → 9, 10, 11, 14, 20; Step 21 `context_ack.json` marked "final hash refresh". |
| 3 | **APPROVE**, returned 2026-10-17T17:13:22Z | iteration-2 fixes verified; counts reconcile (86); every summary file in a step |

| Category | Check | Result | Evidence |
|---|---|---|---|
| Y | UI Reachability | PASS | `apps/web/src/components/sidebar/configs/calendar.ts:15-17` + `CalendarSettingsPanel.tsx:23-29`; new links from both calendar-settings tabs (Step 17); stub replaced in place |
| CC | Page-doc co-change | PASS | no new `page.tsx`; `page-registry.md`, `sitemap.md`, `PAGE_MAP_AND_FLOWS.md`, `navigation-reachability-audit.md` in Step 19 |
| BB | PRD/ADR | PASS | `prd-module-settings.md` (Related Tasks + PG-202 Addendum); ADR-081 Accepted + README row; both in Step 19 |
