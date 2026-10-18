# Specification: PG-202 — Module Settings - Availability (`/calendar/availability`)

| Field | Value |
|---|---|
| Task | PG-202 (Sprint 18, Settings) |
| Persona / STOA | Frontend Dev (frontend-lead) / STOA-Foundation |
| Dependencies | PG-178 (DONE, verified), PG-189 (DONE, verified) |
| Branch / worktree | `feat/pg-202-availability` / `intelliFlow-CRM-worktrees/pg-202` |
| Spec status | **FINAL** — v2 after Round 3 (2026-10-17T16:54:47Z); Round 4 consensus 6/6 APPROVED (2026-10-17T16:59:15Z) |
| Owner ruling | `.specify/sprints/sprint-18/context/PG-202/PG-202-owner-ruling.md` (Q1–Q7 + Aurora clearance) |
| Discussion | `.specify/sprints/sprint-18/specifications/PG-202-discussion.md` (exploration, R1–R3 verbatim, resolutions) |
| Migration | **YES — `20261017130000_availability` (Class A). Merged, NOT applied: the production apply is manual and must happen before the API ships; Class A gates 4 (staging), 7 (snapshot id) and 10-prod are NEEDS_HUMAN.** |

## Overview

`/calendar/availability` is a "coming soon" stub (`apps/web/src/app/calendar/availability/page.tsx:1-16`), already
linked from the calendar settings sidebar (`apps/web/src/components/sidebar/configs/calendar.ts:15-17`) and the
settings panel (`apps/web/src/components/calendar/CalendarSettingsPanel.tsx:23-29`). Booking today uses three
hard-coded rules: create/reschedule 07:00-19:00 any day (`apps/api/src/modules/legal/appointments.router.ts:196-197`,
`:333-358`, called at `:513` with `input.timezone` and at `:787` with no zone, i.e. UTC), findNextSlot 09:00-17:00
weekdays (`:1152-1153`), and nothing for closures or a daily cap. The firm buffers and timezone exist on
`AppointmentSettings` but nothing in booking reads them (grep: only the settings router, validator and calendar-settings
UI).

PG-202 delivers a **firm-wide availability configuration** (owner Q1 = A):

- weekly working hours: per weekday, open/closed with 1..6 time ranges, stored as local minutes-of-day;
- the firm timezone and default buffers — the **existing** `AppointmentSettings` columns (owner Q2 = A), whose editing
  moves here from `/calendar/calendar-settings`; the New Appointment form starts from the firm default buffers (Q7 = A);
- an optional maximum number of bookings per day;
- all-day closure date ranges with an optional reason (owner Q4 = A);
- **runtime enforcement** at appointment create and reschedule, and in `findNextSlot` (owner Q3 = B, Aurora cleared
  option (a)); an appointment must fit inside one day's hours (Q6 = A);
- edit rights ADMIN + MANAGER (owner Q5 = A); everyone else reads.

Tenants that never saved availability keep today's rules exactly (Aurora boundary 4).

### Accepted behaviour changes for configured tenants (copied into the PR body)

1. Bookings outside the saved hours, on closure dates, over the daily cap, or running past local midnight are rejected
   (multi-day events must be booked one appointment per day).
2. The firm timezone governs create AND reschedule (previously create used the form's event timezone and reschedule
   used UTC).
3. `forceOverrideConflicts` bypasses overlap conflicts only, never availability.
4. Members (non ADMIN/MANAGER) can no longer edit buffers/timezone (previously editable on Calendar Settings).

## Related Documents

| Type | Path | Status | Action |
|---|---|---|---|
| PRD | `docs/planning/prd-module-settings.md` | Active | Updated: PG-202 in Related Tasks + `PG-202 Addendum` (user stories, AC summary, Boolean table) |
| Playbook | `docs/planning/module-settings-playbook.md` | Canonical | Referenced (§1-§14) |
| ADR | `docs/architecture/adr/ADR-081-tenant-availability.md` | Proposed → Accepted at consensus | Created in the spec phase + README index row; updated with Round 3 decisions |
| Reference impl. | PG-204 (`.specify/sprints/sprint-18/specifications/PG-204-spec.md`, `planning/PG-204-plan.md`), PG-196/PG-197, PG-182/PG-183 (playbook §14) | Merged | Referenced |
| Timezone | `memory/project_timezone_refactor.md`, ADR-044 | — | Referenced (instants UTC; wall-clock rules are not instants — ADR-081) |

## Technical Approach

Hexagonal, inside-out:

1. **Domain (pure)** — `packages/domain/src/legal/appointments/AvailabilityPolicy.ts` (scheduling rules, `Intl` only) and
   `availability-roles.ts` (authorization list, separate so the policy stays a pure scheduling rule).
2. **Application** — one new method on the existing `CheckConflictsUseCase`: `findFirstFreeCandidate` (single repository
   read, in-memory conflict checks).
3. **Validators** — `packages/validators/src/availability.ts`; `appointment-settings.ts` update schema stops accepting
   buffers + timezone.
4. **Database** — migration `20261017130000_availability` (Class A), Prisma models, db barrel.
5. **API** — `apps/api/src/modules/calendar/availability.router.ts` (sub-router `calendar.availability`),
   `availability-enforcement.ts`; minimal hunks in `appointments.router.ts`; `appointment-settings.defaults.ts`.
6. **Web** — the stub becomes a PageHeader + bento page with a single page-level draft; calendar-settings stops editing
   buffers/timezone; AppointmentForm and AppointmentDetail surface server rejections; the New Appointment form starts
   from the firm buffers.

## Components

### Domain

`AvailabilityPolicy.ts`:

| Export | Contract |
|---|---|
| `WEEKDAYS`, `Weekday` | `[0..6] as const`, 0 = Sunday (as `NotificationPreference.quietHoursDays`, schema.prisma:5349) |
| `MINUTES_PER_DAY` | 1440 |
| `LEGACY_BOOKING_HOURS` | `{ startHour: 7, endHour: 19 } as const` — the single source for the API legacy branch and the web prefill |
| `AVAILABILITY_LIMITS` | `{ maxRangesPerWeekday: 6, maxClosures: 200, maxClosureDays: 366, maxDailyBookings: 500, maxReasonLength: 200, minClosureDate: '2000-01-01', maxClosureDate: '2100-12-31', maxFindNextSlotCandidates: 2000 }` |
| `CAP_COUNTED_STATUSES` | `['SCHEDULED','CONFIRMED','IN_PROGRESS','COMPLETED'] as const satisfies readonly AppointmentStatus[]` (enum `AppointmentEvents.ts:7-14`) |
| `AVAILABILITY_VIOLATION_CODES` | `INVALID_INTERVAL`, `INVALID_TIMEZONE`, `SPANS_MIDNIGHT`, `CLOSED_DATE`, `OUTSIDE_HOURS`, `DAILY_CAP_REACHED` |
| types | `WeeklyRange {weekday,startMinute,endMinute}`, `Closure {startDate,endDate}` ('YYYY-MM-DD'), `AvailabilityRules {timezone, weeklyRanges, closures, maxDailyBookings}`, `ZonedParts`, `AvailabilityResult = {ok:true} \| {ok:false, code, message}` |
| `InvalidTimezoneError` | `DomainError` subclass, code `INVALID_TIMEZONE` (pattern `Buffer.ts:4-10`) |
| `isValidTimezone(tz)` | `new Intl.DateTimeFormat('en-GB',{timeZone})` succeeds; `''` false |
| `canonicalTimezone(tz)` | `resolvedOptions().timeZone` |
| `toZonedParts(instant, tz)` | `hourCycle:'h23'`, fixed `en-GB`; local `date`, `weekday`, `minuteOfDay`, `second`, `ms`; formatter cache per zone |
| `localToUtc(date, minuteOfDay, tz)` | DST gap → first instant after the gap; overlap → earlier occurrence; 1440 = next day 00:00 |
| `localDayBoundsUtc(date, tz)` | half-open `[startUtc, endUtc)`; 23 h / 25 h on DST days |
| `mergeRanges(ranges)` | per weekday sort + merge touching/overlapping; input not mutated |
| `evaluateAvailability({rules, start, end, sameDayCount?})` | order: interval → timezone → midnight span (an end at exactly next-day 00:00 counts as 24:00 of the start day) → closure (local start date and effective end date) → hours (inside ONE merged range of the local start weekday; buffers are not part of the window) → cap (`sameDayCount >= max`; `undefined` with a cap set throws) |
| `capCountWindow(rules, start)` | `localDayBoundsUtc(toZonedParts(start).date)` |
| `generateCandidates({rules, from, durationMinutes, stepMinutes = 60, maxDaysAhead, limit})` | candidates anchored at each merged range start (`range.start + k*step`), on non-closed local days, with room for the duration inside the range, ending the same day, `>= from`; bounded by `maxDaysAhead` and `limit` |
| `formatViolationMessage(...)` | builds the messages in the contract table (weekday, ranges, zone, date) |

`availability-roles.ts`: `AVAILABILITY_ADMIN_ROLES = ACCOUNT_OWNER_ADMIN_ROLES`
(`packages/domain/src/crm/account/territory/territory-constants.ts:273`; same precedent as
`legal/cases/case-type-defaults.ts:40`), `isAvailabilityAdminRole(role)`. ADR-081 notes the cross-context reuse.

Barrel: both modules exported after `packages/domain/src/index.ts:80`; rebuild domain before dependants.

### Application

`CheckConflictsUseCase.findFirstFreeCandidate({ tenantId, attendeeId, candidates: {start,end}[], bufferMinutesBefore,
bufferMinutesAfter })` → `Result<{start,end} | null, DomainError>`: one `appointmentRepository.forTenant(tenantId)
.findForConflictCheck` over `[first.start - before, last.end + after]`, then the same pure conflict check used at
`CheckConflicts.ts:108-112` per candidate in order; returns the first free candidate. No container change (method on the
already-wired use case, `container.ts:640`).

### Validators — `availability.ts`

- `availabilityRangeSchema` `{ startMinute: int 0..1439, endMinute: int 1..1440 }`, start < end (equivalent to the DB
  CHECKs).
- `availabilityDaySchema` `{ weekday: 0..6, ranges: max 6 }`; `days`: exactly 7 entries with unique weekdays.
- `availabilityClosureInputSchema` `{ startDate, endDate: real 'YYYY-MM-DD' within 2000-01-01..2100-12-31, reason?:
  trimmed 1..200 | null (blank → null) }`, end >= start, span <= 366 days (UTC date math).
- `updateAvailabilitySchema` `{ timezone, days, bufferBeforeMinutes 0..240, bufferAfterMinutes 0..240,
  maxDailyBookings 1..500 | null, closures max 200 }` + `.superRefine`: overlapping ranges in a weekday (touching OK) →
  issue at `['days', d, 'ranges', j, 'startMinute']` of the later range (sorted order); overlapping/duplicate closures →
  issue at `['closures', j, 'startDate']`. Timezone: `isValidTimezone` + transform to `canonicalTimezone`. Unknown keys
  (incl. `tenantId`) stripped.
- Re-exports `LEGACY_BOOKING_HOURS` and `AVAILABILITY_LIMITS` for web. DTO types `AvailabilityDto`,
  `UpdateAvailabilityInput` (Interfaces section).
- `appointment-settings.ts`: `updateAppointmentSettingsSchema` = shape `.omit({ defaultBufferBeforeMinutes,
  defaultBufferAfterMinutes, defaultTimezone })` → `.partial()` → `.superRefine(durationConsistency)` (verify the refine
  reads only duration fields); `.strip()` semantics (old clients' extra keys ignored, not 400).

### Database

Migration (full draft: discussion R2 data-engineer §1): header with Class A bullets + forward-only recovery plan +
"merged, not applied" note; `ALTER TABLE appointment_settings ADD COLUMN "maxDailyBookings" INTEGER`, `ADD COLUMN
"availabilityConfiguredAt" TIMESTAMP(3)`; CHECK `appointment_settings_maxDailyBookings_check` (NULL or 1..500)
`NOT VALID` + `VALIDATE`; `availability_hours` (named CHECKs weekday 0-6, start >= 0, end <= 1440, start < end;
UNIQUE (tenantId, weekday, startMinute); index (tenantId, weekday)); `availability_closures` (`DATE` columns; CHECK
end >= start; reason NULL or non-blank; `VARCHAR(200)`; UNIQUE (tenantId, startDate, endDate); index (tenantId,
startDate)); FKs to `tenants` ON DELETE CASCADE; RLS enabled + `DO $$` policies with `USING` and `WITH CHECK` (defence in
depth; the app-level boundary is the explicit `tenantId` filter, `apps/api/src/security/tenant-context.ts:120-195`).
Prisma: `AvailabilityHour`, `AvailabilityClosure` (`@@map`, `@db.SmallInt`, `@db.Date`, `@db.VarChar(200)`), Tenant
reverse relations `@ignore`, two `AppointmentSettings` fields; both models in the `packages/db/src/index.ts` allowlist
after `AppointmentSettings` (:99). No new index on `appointments`.

### API

- **`calendar.availability.get`** (any tenant user): `Promise.all` of settings `findUnique`, hours `findMany`, closures
  `findMany`, all with explicit `tenantId`; **no lazy create**. Unconfigured (`availabilityConfiguredAt` NULL or no row):
  `timezone = ctx.user.timezone ?? row?.defaultTimezone ?? 'UTC'`, buffers from the row or defaults, cap null, no
  closures/hours. Returns `AvailabilityDto` with `canEdit = isAvailabilityAdminRole(ctx.user.role)`.
- **`calendar.availability.update`** (ADMIN/MANAGER else FORBIDDEN "Only administrators and managers can change
  availability."): one `$transaction` callback, in this order: (1) `appointmentSettings.upsert` on `tenantId` (row lock;
  create branch spreads `DEFAULT_APPOINTMENT_SETTINGS`; writes only buffers, timezone, cap, `availabilityConfiguredAt =
  now`); (2) hours `deleteMany` + `createMany`; (3) closures `deleteMany` + `createMany` (no `skipDuplicates`; dates via
  `new Date(`${s}T00:00:00.000Z`)`); returns the fresh DTO. P2002 (settings `tenantId` race, hours unique, closure
  unique) → CONFLICT "Availability was changed by someone else. Reload and try again."
- **`calendar.availability.resetToDefaults`** (ADMIN/MANAGER): `$transaction`: (1) `appointmentSettings.updateMany({where:
  {tenantId}, data:{maxDailyBookings:null, availabilityConfiguredAt:null}})` (count 0 is fine); (2) delete hours;
  (3) delete closures. Buffers and timezone kept. Returns the DTO (unconfigured).
- **`availability-enforcement.ts`**:
  - `loadTenantAvailability(prisma, tenantId)`: settings read first; `{configured:false}` when the row is missing, not an
    object, or `availabilityConfiguredAt` is NULL; Prisma `P2021`/`P2022` (migration not applied) → `console.error` with
    the migration name + `{configured:false}`; any other error propagates. Configured → hours + closures reads → rules.
  - `assertAppointmentWithinAvailability(prisma, {tenantId, start, end, legacyTimezone?, excludeAppointmentId?})`:
    unconfigured → `assertLegacyBusinessHours(start, end, legacyTimezone)` (the router's `getLocalHour` +
    `assertWithinBusinessHours` moved verbatim, constants from `LEGACY_BOOKING_HOURS`, same message); configured →
    `evaluateAvailability`, passing the raw `appointment.count` (`tenantId`, `status in CAP_COUNTED_STATUSES`,
    `startTime` in `capCountWindow`, `id not excludeAppointmentId`) only when a cap is set → violations → `TRPCError
    BAD_REQUEST` (message table); `INVALID_TIMEZONE` → `PRECONDITION_FAILED`.
  - `findNextSlotWithinAvailability(prisma, useCase, input)`: configured path only — `generateCandidates` (from
    `max(startFrom, now)`, duration, `maxDaysAhead`, limit 2000) → when a cap is set, ONE `appointment.findMany({select:
    {startTime}, where:{tenantId, status in CAP_COUNTED_STATUSES, startTime in horizon}})` bucketed by firm-local date to
    drop full days → `useCase.findFirstFreeCandidate` (buffers from input) → slot or `null`.
- **`appointments.router.ts` hunks only:** import; create `:512-513` → `await assertAppointmentWithinAvailability(
  ctx.prismaWithTenant, { tenantId: ctx.user.tenantId, start: input.startTime, end: input.endTime, legacyTimezone:
  input.timezone })`; reschedule `:786-787` → same with `excludeAppointmentId: input.id` and no legacy timezone;
  findNextSlot `:1141-1177` → `loadTenantAvailability` then configured branch → `findNextSlotWithinAvailability`,
  unconfigured branch unchanged; delete `BUSINESS_HOURS_*` (:196-197 with the comment :191-195) and `getLocalHour` +
  `assertWithinBusinessHours` (:316-358); the router-local `tenantProcedure` shadow (:307-314) stays; comments at :512,
  :786, :1139 updated. **Not touched:** attendeeIds, linkedCaseIds, clientId, assignedTo, use-case id checks,
  `forceOverrideConflicts`, `appointments.update`, cases.router.ts.
- **`appointment-settings.defaults.ts`** (new, pure): `DEFAULT_APPOINTMENT_SETTINGS` moved from
  `appointment-settings.router.ts:10-20`; both routers import it. `appointmentSettings.resetToDefaults` update branch =
  defaults minus buffers/timezone, plus `primaryCalendarId: null`; `get`/`update` code unchanged.
- **`calendar.router.ts`:** `availability: availabilityRouter`. No `router.ts`, `container.ts` or `context.ts` change.

#### Write paths (enforcement census)

| Writer | Enforced? | Why |
|---|---|---|
| `appointments.create` (web New Appointment, agent executor `approved-action-executor.ts:226`) | Yes | user/agent-initiated booking |
| `appointments.reschedule` (web detail dialog, agent executor `:260`) | Yes | changes the time |
| `appointments.update` | n/a | cannot change times (`updateAppointmentSchema`, appointments.router.ts:122-137) |
| status-only procedures (confirm, complete, cancel, no-show) | n/a | change status, not times |
| `calendar.delete` (`calendar.router.ts:120-123`) | n/a | `updateMany` sets `calendarId: null` only |
| `inbound.logCallBooking` (`inbound.router.ts:1043`) | No (counts toward the cap) | records an already-booked external call; rejecting would lose the record |
| recurring series | First occurrence only | one row stores the pattern; occurrences are not materialised (finding) |

### Web

| File | Tag | Notes |
|---|---|---|
| `app/calendar/availability/page.tsx` | MODIFY | server component (drop `'use client'`): `Suspense` + `AvailabilityLoading` + `AvailabilityContent` (as `cases/(list)/case-types/page.tsx:9-19`) |
| `.../AvailabilityContent.tsx` | NEW | auth gate; `trpc.calendar.availability.get`; draft; `isDirty`/validation on `toUpdateInput(draft)`; Save/Reset; CONFLICT alert + Reload; error summary; one polite `<output>`; read-only text view; unconfigured note |
| `.../AvailabilityLoading.tsx` | COMPOSES Card+Skeleton | mirrors the bento; `aria-busy` + sr-only "Loading availability" |
| `.../availability-draft.ts` | NEW (pure) | `toDraft`, `toUpdateInput` (open days only), `normalize`, `prefillLegacy()` from `LEGACY_BOOKING_HOURS`, minute↔`HH:MM` (end `00:00` ⇔ 1440 when start > 0), Sun..Sat ↔ Monday-first issue-path mapping |
| `.../components/WeeklyHoursCard.tsx` | COMPOSES Card, SectionHeader, Switch, Input[type=time], Button | 7 fieldsets, Monday first |
| `.../components/TimezoneCard.tsx` | COMPOSES Card, SectionHeader, **TimezoneSelector (EXTENDS: additive `showDetect?: boolean`, default true)** | viewer-zone note via `useTimezoneContext()`; "Confirm your firm timezone" note while unconfigured |
| `.../components/BuffersCapCard.tsx` | COMPOSES Card, SectionHeader, Input[type=number], Switch, Label | "Limit bookings per day" switch + number |
| `.../components/ClosuresList.tsx` | COMPOSES EmptyState, Input[type=date], Button; `forwardRef<ClosuresListHandle>` `{openCreate}` | equivalent of "TagsTab via forwardRef" |
| `components/shared/page-header.tsx`, `section-header.tsx`, `@intelliflow/ui` `ConfirmationDialog`, `EmptyState` | REUSES | no change |
| `components/settings/ModuleSettingsLayout.tsx` | EXTENDS (additive) | optional `resetDescription` prop (default = current text) |
| `components/settings/TimezoneSelector.tsx` | EXTENDS (additive) | optional `showDetect` prop |
| `app/calendar/calendar-settings/components/BufferRemindersTab.tsx` | MODIFY | buffer inputs removed; heading/description "Reminders"; pointer (current buffers as text + link) via `next/link` + plain elements |
| `.../CalendarIntegrationTab.tsx` | MODIFY | timezone select + `getAvailableTimezones` import removed; pointer (current firm zone + link) |
| `.../CalendarSettingsContent.tsx` | MODIFY | `LocalSettings`/`mapSettings`/`normalize`/payload/description drop buffers + timezone; tab label "Reminders"; passes read-only values; `resetDescription` "Resets durations, reminder and primary calendar. Buffers and timezone are managed in Availability and are not changed."; reset toast wording matches |
| `components/appointments/AppointmentForm.tsx` | MODIFY | delete `:118-138`; catch `onSubmit` rejection → `role="alert"` `form-submit-error`; Event Timezone help text; optional `defaultBuffers` prop initialises buffer inputs for new appointments (once, before user edits) |
| `app/appointments/new/page.tsx` | MODIFY | reads `trpc.appointmentSettings.get` and passes `defaultBuffers` |
| `components/appointments/AppointmentDetail.tsx` | MODIFY | `handleAction` catch → `actionError` `role="alert"` in the dialog; dialog closes only on success |

## Interfaces & Contracts

```ts
// packages/validators/src/availability.ts
export interface AvailabilityRangeDto { startMinute: number; endMinute: number }          // local minutes
export interface AvailabilityDayDto { weekday: 0|1|2|3|4|5|6; ranges: AvailabilityRangeDto[] } // [] = closed
export interface AvailabilityClosureDto { id: string; startDate: string; endDate: string; reason: string | null }
export interface AvailabilityDto {
  isConfigured: boolean; timezone: string; days: AvailabilityDayDto[];     // always 7 entries, Sun..Sat
  bufferBeforeMinutes: number; bufferAfterMinutes: number; maxDailyBookings: number | null;
  closures: AvailabilityClosureDto[]; canEdit: boolean;
}
export type UpdateAvailabilityInput = Omit<AvailabilityDto, 'isConfigured' | 'canEdit' | 'closures'> & {
  closures: Omit<AvailabilityClosureDto, 'id'>[];
};
```

Booking error messages (stable contract; `<…>` are filled from the rules):

| Code | tRPC code | Message |
|---|---|---|
| OUTSIDE_HOURS (open day) | BAD_REQUEST | `Appointments on <Monday> must fall within <09:00-12:00 or 13:00-17:00> (<Europe/London>).` |
| OUTSIDE_HOURS (closed weekday) | BAD_REQUEST | `The firm is closed on <Saturdays> (<Europe/London>).` |
| CLOSED_DATE | BAD_REQUEST | `The firm is closed on <2026-12-24>.` |
| SPANS_MIDNIGHT | BAD_REQUEST | `Appointments cannot run past midnight. Book multi-day events as one appointment per day.` |
| DAILY_CAP_REACHED | BAD_REQUEST | `The daily booking limit for <2026-12-23> has been reached.` |
| INVALID_INTERVAL | BAD_REQUEST | `Appointment end time must be after its start time.` |
| INVALID_TIMEZONE | PRECONDITION_FAILED | `The firm timezone is invalid. An administrator must fix it in Calendar > Availability.` |
| legacy (unconfigured) | BAD_REQUEST | unchanged: `Appointments must start and end between 07:00 and 19:00.` |

Closure dates cross the API as `YYYY-MM-DD`; Prisma `@db.Date` in/out at UTC midnight (precedent schema.prisma:5952).

## Integration Points

- `calendar.router.ts` sub-router; app-router smoke test block (root `appRouter.createCaller(...).calendar.availability`).
- `appointments.router.ts` create/reschedule/findNextSlot (Aurora-cleared hunks only); `CheckConflictsUseCase`.
- `appointment-settings.router.ts` + validator + `appointment-settings.defaults.ts` (single source of truth).
- Agent executor (`approved-action-executor.ts:226`, `:260`): availability rejections surface as failed executions.
- Cross-document updates: `docs/design/page-registry.md` (new entry), `sitemap.md:203`, `PAGE_MAP_AND_FLOWS.md:226`,
  `navigation-reachability-audit.md:232` (panel column), `ui-flow-mapping.md` (+3 procedures, `/calendar/*` rows),
  `information-architecture.md` (count) with their reconciliation tests, `complete-dependency-chains.md` (PG-202 chain),
  WCAG statement 1.9.0 + VPAT 1.10.0 rows (written at SHIP with the real review result), `InboxCalendarSection.test.tsx`
  comment, ADR README, PRD addendum, Sprint_plan CSV + splits.

## Runtime Wiring & Replacement Paths

| Surface | Must Be Called By | Replaces / Blocks | Notes |
|---|---|---|---|
| `calendar.availability.get/update/resetToDefaults` | `AvailabilityContent.tsx` | the "coming soon" stub | page reachable from sidebar + panel + calendar-settings links |
| `assertAppointmentWithinAvailability` | `appointments.create` (:513), `appointments.reschedule` (:787) | `assertWithinBusinessHours` + `BUSINESS_HOURS_*` (removed from the router; legacy branch kept inside the helper for unconfigured tenants) | web New Appointment + detail reschedule; agent executor |
| `findNextSlotWithinAvailability` + `CheckConflictsUseCase.findFirstFreeCandidate` | `appointments.findNextSlot` | hard-coded 9/17 for configured tenants | **API-only capability: no web or agent caller (pre-existing); gh issue for a "next available" UI** |
| `AppointmentSettings.defaultBuffer*` | written by `availability.update`; read by `availability.get`, `appointmentSettings.get` → New Appointment form prefill | writes from `appointmentSettings.update/resetToDefaults` + calendar-settings tabs | Q7 consumer |
| `AppointmentSettings.defaultTimezone` | written by `availability.update`; read by enforcement (configured tenants) + `get` | same as above | — |
| `availabilityConfiguredAt` | written by `update`, cleared by `resetToDefaults`, read by loader + `get` | — | NULL = legacy |
| AppointmentForm / AppointmentDetail error display | `/appointments/new`, `/appointments/[id]` | client-side 07-19 duplicate; silent swallow | server authoritative |

## Navigation & Reachability (UI tasks)

| Route | Sidebar Entry | Parent Link | Breadcrumb | Reachable? |
|---|---|---|---|---|
| `/calendar/availability` | `configs/calendar.ts:15-17` (`availability`, `event_available`; settings mode via `isCalendarSettingsPage`) | `CalendarSettingsPanel.tsx:23-29`; new links in both calendar-settings tabs | PageHeader: Dashboard / Calendar / Availability | **YES** (already; no nav change) |

Layout: `apps/web/src/app/calendar/layout.tsx` + `_layout-shell.tsx`. No new `page.tsx`, so page counts (214) are
unchanged. `/calendar/event-types` is a separate "coming soon" stub (a different task), not touched.

## Acceptance Criteria

- **AC-001** [DoD 1] `/calendar/availability` renders PageHeader (Dashboard / Calendar / Availability, "Availability")
  and a 12-column bento (`grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5`) with four Cards (`p-4 sm:p-5`,
  `SectionHeader headingLevel={2}`) in DOM order Weekly hours (8), Timezone (4), Closures (8), Buffers & daily limit (4);
  `AvailabilityLoading` mirrors it; the stub text is gone; query error → `role="alert"` + Retry.
- **AC-002** [DoD 1] Weekly hours: seven weekday fieldsets (Monday first), each with an open Switch and 1..6 ranges when
  open; ranges are local wall-clock minutes in the firm zone, never converted; an end of `00:00` means 24:00 (1440
  round-trips); only open days are validated and sent; a closed day's ranges persist in the draft for the session only.
- **AC-003** [DoD 1, Q2] Timezone (`TimezoneSelector`, detect button hidden) and buffers before/after (0-240) are edited
  here in the existing `AppointmentSettings` columns; unconfigured tenants see the timezone prefilled from the user's
  zone with "Confirm your firm timezone"; `/calendar/calendar-settings` no longer edits or sends them, its tab is renamed
  "Reminders", and both tabs show the current values with the link "Manage working hours, buffers and timezone in
  Availability" (`/calendar/availability`).
- **AC-004** [DoD 1] Max daily bookings: optional (Switch "Limit bookings per day" + 1..500), tenant-wide per firm-local
  start day, counting SCHEDULED, CONFIRMED, IN_PROGRESS, COMPLETED (inbound call bookings included).
- **AC-005** [DoD 1, Q4] Closures: all-day inclusive date ranges in 2000-01-01..2100-12-31, optional reason ≤ 200 chars,
  ≤ 200 closures, span ≤ 366 days, no overlaps; `DATE` columns, `YYYY-MM-DD` transport; no retroactive effect on
  existing appointments (hint under the card).
- **AC-006** [DoD 1, TIMEZONE-REFACTOR-AWARE] Instants stay UTC; weekly hours are minutes in the firm zone; closures are
  firm-zone calendar dates; `useTimezoneContext()` drives the note when the viewer's zone differs; closure dates never
  pass through viewer-zone formatters; changing the firm zone reinterprets hours/closures (helper text says so).
- **AC-007** [DoD 2] Empty closures: `<EmptyState entity="appointments" phase="passive" size="sm" className="py-4 px-3
  gap-2" />` with no CTA inside (its h3 sits under the Closures h2).
- **AC-008** [DoD 3] CTAs: "Add Closure" `<Button size="sm">` (no icon, Title Case) in the Closures SectionHeader action;
  "Save Changes" (`variant:'primary'`) and "Reset" (`variant:'secondary'`) in PageHeader actions without `hideOnMobile`;
  Save disabled when `!canEdit || !(isDirty || !isConfigured) || isSaving || hasConflict`, where `hasConflict` is a
  server CONFLICT (alert with the CONFLICT message + "Reload"); client validation runs on Save; Reset opens
  `ConfirmationDialog` listing what resets (hours, closures, daily limit) and what is kept (timezone, buffers).
- **AC-009** [DoD 4] `ClosuresList` is `forwardRef<ClosuresListHandle>` with `useImperativeHandle(ref, () =>
  ({ openCreate }))`; the header button calls `ref.current?.openCreate()`. ("TagsTab" has no subject here — no tags.)
- **AC-010** [DoD 5, 6] `update` and `resetToDefaults` run in one `$transaction` callback with the settings row write
  first (row lock); no `skipDuplicates`; P2002 → CONFLICT.
- **AC-011** [DoD 7] `updateAvailabilitySchema.superRefine` rejects overlapping ranges within a weekday (touching
  allowed) at the later range's path, and overlapping/duplicate closures.
- **AC-012** [DoD 8] colorToken CHECK: **N/A** — no colour tokens introduced; every new column has a named DB CHECK.
- **AC-013** [DoD 9] AI defaults FALSE: **N/A** — no AI columns or logic.
- **AC-014** [DoD 10] Boolean toggles: **none persisted**. The weekday Switch and "Limit bookings per day" Switch are
  draft-only controls mapped to ranges / `maxDailyBookings` and wired now (category 1) by AC-015; nothing deferred to
  IFC-310/311/312.
- **AC-015** [Q3, Q6, Aurora] Configured tenants: appointments create and reschedule reject bookings outside the hours of
  the firm-local start day, on closure dates, past local midnight, or over the daily cap (reschedule excludes itself),
  with the contract messages; the firm zone governs; `forceOverrideConflicts` does not bypass; the write-path census
  holds.
- **AC-016** [Q3] `findNextSlot` returns only slots inside saved availability for configured tenants using ≤ 5 queries
  (settings, hours, closures, cap, conflicts); unconfigured tenants get today's call unchanged. API-only (no UI caller).
- **AC-017** [Aurora 4] Unconfigured tenants (no row, or `availabilityConfiguredAt` NULL, or migration missing →
  P2021/P2022 fallback) keep create 07-19 in `input.timezone`, reschedule 07-19 in UTC, findNextSlot 9-17 weekdays with
  identical messages; the UI prefills `LEGACY_BOOKING_HOURS` every day with the note "Availability has not been saved
  yet. Until you save, the built-in booking rule applies (07:00-19:00 any day). Saving switches this firm to the
  availability set here."; a first save marks the tenant configured.
- **AC-018** Migration `20261017130000_availability` (Class A) has named CHECKs, uniques, indexes, CASCADE FKs and RLS
  (`USING` + `WITH CHECK`); the integration test proves each constraint (RLS on the `authenticated` role, or a disclosed
  skip).
- **AC-019** [Q5] `update`/`resetToDefaults` limited to `AVAILABILITY_ADMIN_ROLES` (FORBIDDEN otherwise); `get` open to
  any tenant user with `canEdit` from the server; read-only users see every value as text (no form controls), a plain
  note, and no Save/Reset. No LEGAL gate (calendar is core).
- **AC-020** [DoD 11] Cross-tenant negative tests: router (foreign rows never read/written; smuggled `tenantId` stripped)
  and booking (tenant A's availability never governs tenant B; every availability query carries the caller's
  `tenantId`).
- **AC-021** `appointmentSettings.update` ignores buffers/timezone (stripped), `resetToDefaults` no longer resets them,
  `get` still returns them.
- **AC-022** `AppointmentForm` has no client-side 07-19 rule; a rejected submit shows the server message in `role="alert"`
  (`text-red-700 dark:text-red-300`), cleared on next submit or field edit, submit re-enabled; `AppointmentDetail` keeps a
  rejected reschedule's dialog open with the message in `role="alert"` and the input preserved;
  attendee/client/assignee/conflict logic unchanged.
- **AC-023** [Q7] The New Appointment form initialises its buffer inputs from the firm defaults (still editable);
  existing appointments keep their own buffers.
- **AC-024** WCAG 2.1 AA, verified by RTL role/name queries, focus assertions and axe-core (zero violations in default,
  unconfigured, validation-error, empty-closures and read-only states):
  a. one `h1`; each card a `<section aria-labelledby>` with an `h2`; EmptyState `h3` under the Closures `h2`;
  b. weekday `<fieldset>` + full-day `<legend>`; Switch "<Day> open" described by a text summary ("09:00 to 17:00",
     "Closed", "midnight (end of day)"); ranges in `<ul aria-label="<Day> hours">`; inputs "<Day> range N start/end";
     "Add range" with sr-only " for <Day>"; "Remove <Day> range N" only when > 1 range; closed days render no range
     controls; 6-range and 200-closure limits use `aria-disabled` + an announcement;
  c. one always-mounted polite `<output>` for list operations, timezone changes and reset; save success announced by
     the toast only; failures by `role="alert"` only (no destructive toast);
  d. failed Save: `role="alert"` summary "N problems need fixing" with links, focus on the first invalid field;
     per-field `aria-invalid` + `aria-describedby` errors in `text-red-700 dark:text-red-300`; empty time/date inputs
     have their own message; after a failed attempt fields re-validate on change/blur;
  e. focus: Add range → new start input; remove → same-index start, else previous, else Add range; Add Closure → new row
     start date; remove closure → next, else previous, else Add Closure; after Save settles → Weekly hours title
     (`focusableTitle`); after Reload → Weekly hours title;
  f. visible "Unsaved changes" text when dirty; Reset dialog returns focus to Reset on cancel;
  g. read-only renders values as text; unconfigured note visible as text;
  h. 44px icon buttons; reflow at 320px without horizontal scroll (`flex-wrap`, no fixed-width time inputs below sm);
     every `aria-describedby`/`aria-labelledby` id resolves; no `fieldset className="contents"`.
- **AC-025** [DoD 12] Lighthouse ≥ 90 on `/calendar/availability` (NEEDS_HUMAN with evidence when authenticated Lighthouse
  credentials are unavailable, as PG-204/PG-201); never claimed without a run.
- **AC-026** Docs/registries updated (Integration Points); reconciliation tests pass with the new procedure count.
- **AC-027** [DoD 13] Full suites of every touched package, typecheck, lint and build pass.

Non-functional:

- **NF-001** Create/reschedule add one settings read; configured tenants add two small reads (≤ 42 hour rows, ≤ 200
  closures) and one indexed count only when a cap is set. findNextSlot configured path ≤ 5 queries regardless of
  horizon.
- **NF-002** Domain coverage > 95%; API/validators/application > 90%; diff-coverage ≥ 80% on changed lines; no
  `istanbul ignore` / `c8 ignore`.
- **NF-003** No new web dependency; `/calendar/availability` first-load JS recorded from `next build` and compared with
  `/cases/case-types` (L11).
- **NF-004** The daily cap is best-effort under concurrency (check-then-insert); documented in ADR-081.

## Test Requirements

TDD order with saved logs under `.specify/sprints/sprint-18/execution/PG-202/exec-PG-202-<date>/tdd/` (`red-*.log`,
`green-*.log`, and `characterization-*.log` for tests that must be GREEN on the current code first). Each log records
`date -u`, `git rev-parse HEAD`, the command and the exit code. Per-AC trace table in the plan.

0. **Characterization (GREEN on current main, before any move):** legacy create (06:59 rejected, 07:00 ok, 19:00 end ok,
   19:01 rejected, 18:00→08:00 next day accepted, `input.timezone` shifts the window, exact message), reschedule (UTC),
   findNextSlot call args (9/17).
1. `packages/domain/src/legal/appointments/__tests__/AvailabilityPolicy.test.ts` — per-weekday, merge, gaps, closed
   weekday, start at closing time, 24:00, SPANS_MIDNIGHT, closures (start/end/inclusive/next-day exemption), cap
   boundaries + statuses guard, invalid zone, `localToUtc` gap/overlap, `localDayBoundsUtc` 23/25 h, `generateCandidates`
   (range-start anchoring incl. a 09:30 range, closure/weekday skips, limit, horizon), messages; DST London 2026-03-29 /
   2026-10-25, New York 2026-03-08 / 2026-11-01, Asia/Kolkata, Pacific/Auckland (23:30 local week boundary), weekday
   mapping 2026-04-12..18; explicit zones, no wall clock. `availability-roles.test.ts`.
2. `packages/application/src/usecases/scheduling/__tests__/CheckConflicts.test.ts` — `findFirstFreeCandidate` (one
   repository call, first free candidate, buffers, empty list, failure path) with an in-memory repository.
3. `packages/validators/src/__tests__/availability.test.ts` — limits, 7 unique days, superRefine paths, dates (invalid,
   bounds, leap year, 366/367), reason trim/blank, timezone (valid, alias canonicalised, invalid), stripping;
   `appointment-settings.test.ts` updated (keys stripped; duration refine unchanged).
4. `apps/api/src/modules/calendar/__tests__/availability-enforcement.test.ts` (with `availability.test-utils.ts`
   `stubTenantAvailability` / `expectEveryCallTenantScoped`) — legacy (null, undefined, non-object, configuredAt NULL,
   P2021, P2022; other DB error propagates), configured violations + exact messages, `input.timezone` ignored,
   `forceOverrideConflicts` no bypass, cap query shape (23/25 h windows, excludeId), cap null → no count, unstubbed
   count → fails loudly, invalid zone → PRECONDITION_FAILED, findNextSlot configured path (query count ≤ 5, full day
   dropped, null at horizon/limit).
5. `apps/api/src/modules/calendar/__tests__/availability.router.test.ts` — get (no lazy create, canEdit, unconfigured
   timezone from user, every query tenant-scoped), update (ADMIN, MANAGER ok; USER FORBIDDEN, no writes; one
   transaction with the settings upsert first; smuggled tenantId; P2002 on settings/hours/closures → CONFLICT;
   configuredAt = pinned NOW; settings upsert keys exact; no-row create via defaults), reset (keeps buffers/timezone,
   order, no-row safe), cross-tenant.
6. `appointments.router.caller.test.ts` additions — create/reschedule blocked (hours, closure, cap, midnight), allowed,
   firm zone governs, unconfigured legacy, availability before the use case, findNextSlot both paths, cross-tenant A/B;
   `availability-boundary.test.ts` static guard; agent executor test (availability BAD_REQUEST → failed execution).
7. `tests/integration/availability.test.ts` (`describeDb`; fresh DB via `scripts/lib/ephemeral-test-db.mjs` when
   available, else the shared test DB under the exclusive slot; probe both CHECK names; random run prefix; cleanup) —
   every CHECK/unique, missing-tenant FK, cascade, RLS with `SET LOCAL` (or disclosed skip), DATE round-trip under
   `SET TIME ZONE 'Pacific/Auckland'`, columns nullable.
8. Web: `AvailabilityContent.test.tsx` (+ axe states; real PageHeader, not mocked), `AvailabilityContent.actions.test.tsx`
   (Save/Reset states, CONFLICT + Reload, focus after save), `availability-draft.test.ts` (round-trips incl. 1440, open-day
   payload, path mapping), `WeeklyHoursCard.test.tsx`, `ClosuresList.test.tsx` (forwardRef), `BuffersCapCard.test.tsx`,
   `TimezoneCard.test.tsx`, `AvailabilityLoading.test.tsx`, `page.test.tsx`; `AppointmentForm` (RED: "submits a 06:00
   start"; alert on rejection, non-Error rejection, clearing, buffers prefill); `AppointmentDetail` (rejected reschedule
   keeps the dialog + alert); `new/page.tsx` (passes defaults); `ModuleSettingsLayout` (`resetDescription`);
   `TimezoneSelector` (`showDetect`).

Existing suites to update/re-run: `appointments.router.caller.test.ts`, `appointments.router.test.ts`,
`appointments.router.comprehensive.test.ts`, `appointment-settings.router.test.ts`, `app-router.smoke.test.ts`,
`legal-module-entitlement.test.ts`, `approved-action-executor.test.ts`, calendar-settings `BufferRemindersTab.test.tsx`,
`CalendarIntegrationTab.test.tsx`, `CalendarSettingsContent.test.tsx`, `InboxCalendarSection.test.tsx`,
`appointments/[id]/__tests__/*`, `ui-flow-mapping-reconciliation.test.ts`, `ia-reconciliation.test.ts`,
`sitemap-reconciliation.test.ts`, domain `ConflictDetector*.test.ts`, validators `appointment-settings.test.ts`,
integration `rls-tenant-isolation.test.ts`; then the full suites of every touched package (`pnpm --filter <pkg> test`).

Security negative paths: USER → FORBIDDEN (update/reset); cross-tenant read/write; smuggled tenantId; RLS `WITH CHECK`
on the `authenticated` role.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Overlap with projects-64 (#890) | Aurora cleared option (a); hunks limited to the two call swaps + findNextSlot; ownership checks untouched; boundary guard test; merge origin/main before SHIP and re-run router tests |
| API ships before the migration | P2021/P2022 fallback to legacy with a loud log (no booking outage); PR body states migration-first; gates 4/7/10-prod NEEDS_HUMAN |
| Unconfigured tenants silently change | `availabilityConfiguredAt` gate; legacy moved verbatim behind characterization tests |
| First save closes the firm or picks UTC | prefill `LEGACY_BOOKING_HOURS`; timezone prefilled from the user's zone + confirm note |
| Concurrent admin saves merge | settings row written first (row lock); P2002 → CONFLICT |
| Stale calendar-settings writes | keys stripped server-side + UI stops sending them |
| DST/timezone bugs | pure policy with explicit-zone tests; DATE strings for closures |
| Deep-mock false greens | explicit stub helper, loud failure on unstubbed count, call-count assertions, real-use-case contract test |
| Daily-cap race | best-effort (ADR-081); no lock on the populated appointments table |
| Lighthouse on an authenticated page | attempt + NEEDS_HUMAN evidence |
| Pre-existing issues (legacy cross-midnight gap; `appointment_settings` RLS lacks WITH CHECK; `defaultTimezone` default 'UTC' vs ADR-044; stale `/calendar/new`, `/calendar/[id]` registry rows; recurring series checked on the first occurrence only; findNextSlot has no UI caller) | findings doc + gh issues + debt-ledger; the AppointmentForm/AppointmentDetail error swallow is fixed in scope (needed by AC-022) |

Out of scope (each with a reason; none defers navigation): per-user overrides (Q1 = A); recurring yearly closures
(Q4 = A); multi-day appointments (Q6 = A); server-side buffer defaults (Q7 = A chose the form prefill); migrating
`/calendar/calendar-settings` off `ModuleSettingsLayout`; a new appointments index; client-side availability
pre-validation in AppointmentForm; the `/calendar/event-types` stub; authenticated E2E.

## Consensus modifications (non-blocking, folded in at Round 4; the plan must carry each)

1. **P2021/P2022 fallback** covers every loader read (settings, hours, closures) but not the cap `count`; tests assert the
   `console.error`, that other codes propagate, and verify the real `@prisma/adapter-pg` error shape (an integration
   probe against a DB without the columns, or the adapter's error class), not only a mocked `{ code }`. Check whether
   `createTenantScopedPrisma` (`apps/api/src/trpc.ts:424`, `security/tenant-context.ts`) runs request queries inside a
   shared transaction; if it does, a failed read would abort the booking, and the fallback must probe safely instead.
2. **findNextSlot wrapper output** is exactly today's procedure shape `{ slot: {startTime, endTime, durationMinutes} |
   null, searchDurationMs }`; the cap `findMany` is bounded to `[first candidate day start, last candidate day end)`;
   the configured path starts at `max(startFrom, now)` (documented difference from the legacy path).
   `findFirstFreeCandidate` wraps the single `attendeeId` as `[attendeeId]` for the repository port.
3. **Tests added:** cap boundary for findNextSlot (`count = cap - 1` offered, `= cap` dropped); messages never contain a
   closure reason or ids; candidate grid (09:30 range, mid-range `from`, 2000 limit); call order (settings first) in
   update and reset; runtime check that the container's use case exposes `findFirstFreeCandidate`; diff-coverage/Sonar
   treatment of `availability.test-utils.ts` confirmed.
4. **Web:** `/appointments/new` renders the form only after `appointmentSettings.get` settles (initial state reads the
   defaults; `AppointmentForm.tsx:73-74`); a `00:00`-`00:00` range is a field error; an unconfigured Save sends the
   prefilled values with the timezone confirm note visible; calendar-settings pointers use `next/link` only; first-load
   JS recorded from `next build`.
5. **A11y:** after a server save error focus goes to the error alert; `AvailabilityLoading` has `aria-busy` + an sr-only
   status; after a confirmed Reset the polite region announces it and focus moves to the Weekly hours title.
6. **Data:** freeze `migration.sql` after the independent SQL review; keep Prisma-default index names; grep
   `packages/db/src` for any model registry beyond the `index.ts` export list.
7. **Closure reasons** are firm-internal and visible to every tenant member on the page (read-only view included); they
   never appear in booking error messages.
8. ADR-081 → Accepted; the PR body states the accepted behaviour changes and the migration-before-API order.

## Agent Sign-offs

Round 4 CONSENSUS (`/spec-consensus`), 2026-10-17T16:57Z–16:59Z: **6/6 APPROVED (100%)**, first round.

| Agent | Verdict | Files verified (sample) | Notes |
|---|---|---|---|
| backend-architect | APPROVED | appointments.router.ts, CheckConflicts.ts, appointment-settings.router.ts, calendar.router.ts, trpc.ts, case-types.router.ts | conditions 1-3 → consensus modifications 1-2 |
| data-engineer | APPROVED | schema.prisma, case_types + appointment_settings migrations, db/src/index.ts, agent-autonomy-policy.md, tenant-context.ts, ci.yml | implementation notes → modification 6 |
| frontend-lead | APPROVED | AppointmentForm.tsx, AppointmentDetail.tsx, new/page.tsx, page-header.tsx, section-header.tsx, ModuleSettingsLayout.tsx, calendar-settings/** | 5 modifications → modification 4 |
| domain-expert | APPROVED | ConflictDetector.ts, CheckConflicts.ts, Appointment.ts, AppointmentEvents.ts, inbound.router.ts, case-type-defaults.ts | test items → modifications 2-3 |
| test-engineer | APPROVED | case-types tests, caller test, test/setup.ts, case-types integration, ops wrapper, ephemeral-test-db.mjs | modifications 1, 3 |
| a11y-expert | APPROVED | page-header.tsx, section-header.tsx, empty-state.tsx, confirmation-dialog.tsx, TimezoneSelector.tsx, calendar-settings tests | modification 5; WCAG/VPAT rows only at SHIP |

Full votes: `PG-202-discussion.md` → "Round 4 — CONSENSUS".
