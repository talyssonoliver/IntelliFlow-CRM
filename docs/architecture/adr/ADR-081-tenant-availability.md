# ADR-081: Tenant Availability (Working Hours, Closures, Daily Cap) Enforced at Booking

**Status:** Accepted (PG-202 spec consensus 6/6, 2026-10-17)

**Date:** 2026-10-17

**Deciders:** Talysson (owner ruling 2026-10-17), PG-202 spec session

**Technical Story:** PG-202 — Module Settings - Availability
(`/calendar/availability`)

## Context and Problem Statement

`/calendar/availability` is a "coming soon" stub. The scheduling code has three
different hard-coded ideas of when a firm is open: `findNextSlot` passes 9-17 on
weekdays (`appointments.router.ts:1152-1153`), appointment create checks 7-19 on
every day (`assertWithinBusinessHours`, `:196-197`, `:333-358`), and
`ConflictDetector` defaults to 9-17 in the API server's local time
(`ConflictDetector.ts:308-309`, `:337-338`). Nothing stores per-weekday hours,
closure dates or a daily booking cap. Buffers and a default timezone already
exist on `AppointmentSettings`.

How should a firm's availability be stored, where does it live, and how is it
enforced, given that the row's DoD says "store UTC in DB" but weekly hours are
wall-clock rules that recur across DST changes?

## Decision Drivers

- Owner ruling 2026-10-17: firm-wide (one per tenant); reuse
  `AppointmentSettings` buffers + `defaultTimezone` (editing moves to the
  Availability page); enforce at appointment create **and** in `findNextSlot`;
  closures are all-day date ranges.
- One source of truth per setting (no second copy of buffers or timezone).
- DST correctness: "Mon 09:00-17:00" must stay 09:00-17:00 local in summer and
  winter.
- Tenants that never saved availability must keep today's behaviour (no silent
  always-open / always-closed).
- Module-settings playbook: `$transaction` on destructive writes, no
  `skipDuplicates`, tenant-scoped writes, CHECK constraints, RLS.
- Calendar is a core (all-tier) module: no LEGAL entitlement gate.

## Considered Options

1. **Child tables + columns on `AppointmentSettings`** — `availability_hours`
   (weekday, startMinute, endMinute) and `availability_closures` (startDate,
   endDate, reason), plus `maxDailyBookings` on `appointment_settings`.
2. **JSON columns on `AppointmentSettings`** — `weeklyHours Json`,
   `closures Json`, `maxDailyBookings Int?`.
3. **A separate `AvailabilityProfile` aggregate** (per-user capable) with its
   own timezone and buffers.
4. **Store hours as UTC instants/offsets** as the DoD wording literally says.

## Decision Outcome

Chosen option: **1 — child tables (`availability_hours`,
`availability_closures`) plus `maxDailyBookings` and `availabilityConfiguredAt`
on `appointment_settings`**. Weekly hours are stored as local minutes-of-day
interpreted in `AppointmentSettings.defaultTimezone`; closures are stored as
calendar dates (`DATE`) interpreted in the same zone; instants (appointment
times) remain UTC. `availabilityConfiguredAt` NULL means "never configured"
(legacy rules). Shape confirmed by the PG-202 spec consensus (6/6, 2026-10-17).

The rules are a pure domain module
(`packages/domain/src/legal/appointments/AvailabilityPolicy.ts`, `Intl` only);
the write-role list is a separate module (`availability-roles.ts`, reusing
`ACCOUNT_OWNER_ADMIN_ROLES` from the CRM territory context, the same
cross-context reuse PG-204 made). The API helper
(`apps/api/src/modules/calendar/availability-enforcement.ts`) loads data and
maps violations to tRPC errors; it is called by `appointments.create` and
`appointments.reschedule`. `findNextSlot` generates candidate slots from the
policy and checks them with one new application method,
`CheckConflictsUseCase.findFirstFreeCandidate` (one repository read, in-memory
conflict checks), instead of feeding rules into `ConflictDetector`'s
server-local hour loop.

- **Legacy:** when a tenant has no saved availability
  (`availabilityConfiguredAt` NULL), each path keeps its legacy rule (create
  07:00-19:00 in the request timezone; reschedule 07:00-19:00 in UTC;
  findNextSlot 09:00-17:00 weekdays).
- **Deploy order:** the migration is applied before the API. If it is not, the
  loader treats Prisma P2021/P2022 (missing table/column) as "not configured"
  and logs loudly, so booking degrades to the legacy rule instead of failing for
  every tenant.
- **Writes:** `availability.update` writes the settings row first inside one
  transaction (row lock), then replaces the hours and closures, so concurrent
  admin saves serialise instead of merging.
- **One-day rule (owner Q6):** an appointment must fit inside one merged range
  of its firm-local start day.
- **Daily cap:** best-effort (check-then-insert); a guaranteed cap would need a
  lock on the populated appointments table.
- **Isolation:** app-level isolation is the explicit `tenantId` filter on every
  query; RLS policies on the new tables are defence in depth.
- **Single source of truth:** buffers and timezone stay on
  `AppointmentSettings`; `/calendar/calendar-settings` stops editing them and
  `appointmentSettings.update/resetToDefaults` stop writing them. The New
  Appointment form prefills the firm buffers (owner Q7).

### Positive Consequences

- DB CHECKs and per-row uniqueness enforce shape; the replace-in-transaction
  write pattern from the playbook applies.
- No duplicate buffers/timezone; `/calendar/calendar-settings` stops editing
  them.
- DST-safe weekly rules; closures and caps evaluated in the firm's zone.

### Negative Consequences

- New tables + a nullable column → a Class A migration that must be applied to
  production before the API ships.
- A timezone change reinterprets the saved hours and closure dates in the new
  zone (no conversion).
- Recurring appointments are checked on their first occurrence only (occurrences
  are not materialised as rows).
- `inbound.logCallBooking` (already-booked external calls) is not enforced, but
  its rows count toward the cap.

## Pros and Cons of the Options

### Option 2 (JSON)

- Good: one row, no joins. Bad: no DB-level CHECKs or uniqueness on ranges; the
  overlap rule lives only in Zod.

### Option 3 (profile aggregate)

- Good: per-user ready. Bad: duplicates buffers/timezone (owner rejected two
  sources of truth) and per-user scope was ruled out (Q1 = A).

### Option 4 (UTC hours)

- Bad: a 09:00 London rule stored as 08:00Z in summer becomes 08:00 local in
  winter. Rejected.
