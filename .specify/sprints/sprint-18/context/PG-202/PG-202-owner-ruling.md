# PG-202 — Owner ruling (Availability)

- **Asked:** 2026-10-17, AskUserQuestion modal from the PG-202 lane, during `/spec-session` Phase 0.75.
- **Recorded:** 2026-10-17T15:58:59Z (`date -u`).
- **Answered by:** Talysson (owner), in the modal.

## Why the questions were needed

The six exploration agents found that the row's DoD conflicts with the code:

- No availability model, validator or router exists. `/calendar/availability` is a "coming soon" stub
  (`apps/web/src/app/calendar/availability/page.tsx:1-16`).
- Buffers and timezone already live in `AppointmentSettings` (`packages/db/prisma/schema.prisma:2389-2395`) and are
  edited on `/calendar/calendar-settings` (`BufferRemindersTab.tsx`, `CalendarIntegrationTab.tsx`).
- Three different hard-coded working-hours rules: `findNextSlot` 9-17 weekdays
  (`apps/api/src/modules/legal/appointments.router.ts:1152-1153`), `create` 7-19 every day (`:196-197`, `:333-358`),
  `ConflictDetector` default 9-17 in server-local time (`packages/domain/src/legal/appointments/ConflictDetector.ts:308-309`).
- No daily booking cap is enforced anywhere.
- "Store UTC in DB" cannot hold for recurring weekly hours (DST drift).

## Questions and answers

| # | Question | Options | Owner's answer |
|---|---|---|---|
| Q1 | Whose availability is it? | A firm-wide (rec.) / B firm + per-user override / C per-user only | **A. Firm-wide** |
| Q2 | Buffers + timezone already in Appointment Settings — how to handle? | A reuse the same columns, move editing to Availability (rec.) / B reuse, edit in both / C separate columns | **A. Reuse, move editing** |
| Q3 | What should saved availability enforce in this PR? | A next-slot search only, create enforcement as follow-up (rec.) / B also block at appointment create (overlaps projects-64; coordinate via Aurora) / C settings only | **B. Also block at create** |
| Q4 | Unavailable dates shape? (weekly hours stored as local time + IANA zone; dates as UTC) | A all-day ranges with optional reason (rec.) / B partial-day ranges / C ranges + yearly recurring | **A. All-day ranges** |

## Consequences for the spec

1. Availability is one tenant-level configuration (no per-user override; that becomes a registered follow-up only if
   the owner asks).
2. `AppointmentSettings.defaultBufferBeforeMinutes / defaultBufferAfterMinutes / defaultTimezone` stay the single
   source of truth. Their editing moves to `/calendar/availability`; `/calendar/calendar-settings` stops editing them
   (fields removed or replaced by a link). No second copy of these columns.
3. Saved availability is enforced at runtime in this PR: `findNextSlot` (no UI caller today) **and appointment
   create** (working hours, closures, daily cap). Appointment create validation is owned by the projects-64 lane
   (issue #890 appointments part). Per the batch-2 overlap rule, the lane told Aurora before touching it and does not
   change appointment create/update code until Aurora clears the overlap.
4. Unavailable dates are all-day ranges (start date to end date inclusive) with an optional reason. Weekly hours are
   stored as local minutes-of-day plus the tenant IANA timezone; closure dates as calendar dates (interpreted in the
   tenant timezone). This is the deliberate reading of the DoD's "store UTC in DB": instants are UTC, recurring
   wall-clock rules are not.

## Aurora clearance for the overlap (recorded 2026-10-17T16:00:24Z)

Aurora (batch coordinator) replied to the lane's overlap notice: **cleared for option (a)** — PG-202 owns the
availability check in appointment create and reschedule. Aurora checked that #890 is an issue (no open PR touches
`appointments.router.ts` or `modules/calendar`) and told projects-64. Boundaries:

1. Logic lives in the new `apps/api/src/modules/calendar/availability-enforcement.ts`. In `appointments.router.ts`
   the change is limited to swapping the `assertWithinBusinessHours` call(s) for the helper in create and reschedule,
   and removing the hard-coded 7-19 helper if a caller census shows nothing else uses it.
2. Do NOT touch the tenant-ownership side: attendeeIds, linkedCaseIds, clientId, assignedTo,
   ScheduleAppointmentUseCase id checks, or cases.router.ts (projects-64 / #890).
3. Tests: per-weekday hours, all-day closures, max daily bookings, timezone (defaultTimezone), the reschedule path,
   and a cross-tenant negative test (tenant A's availability never governs tenant B's booking). RED log before GREEN.
4. Tenants with no saved availability keep today's behaviour (create: 7-19 any day). Never silently "always closed"
   or "always open". State the default in the PR body.
5. Merge origin/main before SHIP; resolve any landed appointments change and re-run the router tests.

## Q5 — edit rights (asked during Round 1, recorded 2026-10-17T16:05:25Z)

| # | Question | Options | Owner's answer |
|---|---|---|---|
| Q5 | Who may edit firm Availability (it blocks bookings for everyone)? | A Admins + Managers (rec.) / B any user / C Admins only | **A. Admins + Managers** |

Consequence: availability writes are limited to ADMIN and MANAGER (FORBIDDEN otherwise); reads stay open to any tenant
user and the page renders read-only for others. Members lose the buffer/timezone edit they had on Calendar Settings.

## Q6-Q7 — asked after Round 3 (recorded 2026-10-17T16:52:56Z)

| # | Question | Options | Owner's answer |
|---|---|---|---|
| Q6 | Configured firms: must an appointment fit one day's hours (multi-day hearings rejected)? | A one day only (rec.) / B allow multi-day spans / C exempt hearings + depositions | **A. One day only** |
| Q7 | Firm default buffers are stored but unused (new appointments start 0/0). Make them take effect? | A prefill the New Appointment form (rec.) / B leave unwired / C server-side default when omitted | **A. Prefill new appointments** |

Consequences: SPANS_MIDNIGHT stays for configured firms, with a message telling the user to book one appointment per
day; the New Appointment form initialises its buffer inputs from the firm defaults (editing an existing appointment
keeps its own values); server-side booking input handling is unchanged.

## Daily-cap codex waiver (2026-10-17 / 2026-10-18)

- 2026-10-17: Talysson approved the codex waiver for the best-effort daily cap (non-atomic count then insert; spec NF-004,
  ADR-081, gh #913) in the PG-202 lane modal. The three entries in `tools/audit/codex-review-waivers.yaml` name him.
- 2026-10-18: Talysson confirmed the same waiver to Aurora by modal (relayed in Aurora's PR #916 review). The three
  waiver entries stand.
