Task: PG-202 (Module Settings - Availability, Sprint 18)

## What

Firm-wide availability at `/calendar/availability`. It replaces the "coming soon" stub at the same URL and is enforced
when appointments are booked. The owner's ruling (Q1–Q7) is in `.specify/sprints/sprint-18/context/PG-202/PG-202-owner-ruling.md`.
ADR-081 is accepted.

- **Domain:** `AvailabilityPolicy` evaluates a booking against:
  - weekly hours (local minutes in the firm timezone),
  - all-day closures,
  - an optional daily cap (bookings in scheduled, confirmed, in-progress or completed status),
  - local midnight.
  It is DST-safe. On the autumn clock change it splits a booking at the offset change, so the repeated hour cannot hide closed
  time. Slot generation lists both occurrences of an ambiguous time and never repeats a slot in the spring gap.
  `availability-roles` restricts writes to admins and managers.
- **Application:** `CheckConflictsUseCase.findFirstFreeCandidate` does one repository read, widened by the largest possible
  existing buffer, and then checks every candidate in memory.
- **DB:** `availability_hours` and `availability_closures` with named CHECKs, tenant RLS (USING + WITH CHECK) and cascading
  tenant foreign keys. `appointment_settings` gains `maxDailyBookings` and `availabilityConfiguredAt` (NULL means legacy rules).
- **API:**
  - `calendar.availability.get / update / resetToDefaults`. Reads are open to members; writes are for admins and managers
    (FORBIDDEN otherwise). Saves run in one transaction with the settings row locked first, and a concurrent change maps to
    CONFLICT.
  - `availability-enforcement.ts` replaces the hard-coded 07:00–19:00 check in `appointments.create` and `reschedule`, and
    drives `findNextSlot` for configured firms.
  - Only those availability calls changed in `appointments.router.ts`. The #890 tenant-ownership checks are untouched.
- **Web:**
  - The Availability page follows the module-settings playbook. Its cards are weekly hours, timezone, closures, and
    buffers & daily limit. It saves one draft, shows a validation summary with links that focus each field, offers Reload on
    a conflict, confirms Reset, and is read-only for members.
  - Calendar Settings keeps reminders, durations and the primary calendar. It shows buffers and timezone read-only with a link
    to Availability, and its reset no longer touches them.
  - The New Appointment form drops its client-side 07:00–19:00 rule, shows the server's message, and starts from the firm's
    default buffers.
  - A failed reschedule keeps its dialog open with the message. The dialog is now named, and it is no longer hidden from
    assistive technology by `aria-hidden` on its backdrop.
  - `ConfirmationDialog` gains `onCloseAutoFocus`.

### Accepted behaviour changes for firms that save availability

1. Bookings outside the saved hours, on closure dates, over the daily cap, or running past local midnight are rejected.
   Multi-day events must be booked as one appointment per day.
2. The firm timezone governs both create and reschedule. Previously create used the form's event timezone and reschedule
   used UTC.
3. `forceOverrideConflicts` bypasses overlap conflicts only, never availability.
4. Members other than admins and managers can no longer edit buffers or the timezone (previously editable on Calendar Settings).

### Unchanged for firms that never save availability (legacy default)

Firms with `availabilityConfiguredAt` NULL keep today's rules exactly:
- create is allowed 07:00–19:00 in the event timezone;
- reschedule is allowed 07:00–19:00 in UTC;
- `findNextSlot` offers 09:00–17:00 on weekdays.

`appointments.legacy-hours.characterization.test.ts` pins these rules. A database without the migration (Prisma
P2021/P2022) falls back to the same rules with a logged error.

> ⚠️ **PRISMA MIGRATION (L13): apply it before the API ships.** `packages/db/prisma/migrations/20261017130000_availability` is
> Class A and additive (ADR-069). An independent SQL review sub-agent approved it with INFO findings only
> (`matop/sql-review.json`), and its sha256 is frozen in `matop/migration-freeze.txt`. It is merged but **not applied**.
> The production apply is manual and must happen **before** the API is promoted, because the API reads the new columns.
> Class A gates 4 (staging verification), 7 (backup or snapshot id) and 10-prod (`prisma migrate deploy` on production) are
> **NEEDS_HUMAN**.

## Evidence

Every number comes from a log under `.specify/sprints/sprint-18/execution/PG-202/exec-PG-202-20261017/`.

- **Validation Matrix** (`matop/validation-matrix/`): the full matrix ran one row at a time at the final code. Every row
  exited 0:
  - domain 3072 tests
  - application 1488
  - validators 2722
  - db 224 (14 skipped by the suites' own environment guards)
  - API 7796 (18 pre-existing skips)
  - web 12954
  - integration `availability`: 20 tests in the exclusive DB slot
  - typecheck, lint (including the CI-mode sonar guard) and the build of every touched package, including `next build`
- **Integration skips:** the 5 skips are the pre-existing `rls-tenant-isolation` suite. It skips when the shared local DB's
  `authenticated` role has no grants. PG-202's own RLS session check ran.
- **Coverage:** diff coverage is **96.1%** (1120/1165). Domain new files are above 98% statements; application, validators
  and API new files are above 92%.
- **Codex semantic review** (`node scripts/codex-review.mjs`, 6 runs): passed. Six findings were real and fixed test-first:
  - DST fall-back escape
  - DST slot search
  - all-day range round-trip
  - existing-buffer read gap
  - in-flight save overwrite
  - findNextSlot invalid timezone (raised by STOA-Domain)
  The non-atomic daily cap is waived (see below).
- **a11y-expert WCAG 2.1 AA review:** FAIL with 3 major findings, fixed in `015016c13`. The re-check passed with minor
  items. axe runs in the component tests with no violations in five page states.
- **STOA sub-agent verdicts:** Domain PASS and Security PASS. Foundation and Quality gave WARN on stale evidence and line-ending
  churn; both were fixed and re-checked (`matop/stoa-verdicts/`).
- **`/code-review`** (full): typecheck and lint clean, no circular imports, architecture tests green. It caught the db suite
  failing after a `prisma format` re-alignment of `schema.prisma`; fixed in `4c6ac696e`.
- **`/sonarqube-fix`:** SonarCloud main issues on the modified files were fixed on the lines this branch touches (`fdd76e690`).
- **First-load JS:** `/calendar/availability` is 871.0 KB gzip vs 876.7 KB for `/cases/case-types` (NF-003).
- **Pre-ship:** see the SHIP note below.

## Review notes

- `schema.prisma` differs from main only by the PG-202 models and columns (58/21 lines).
- `artifacts/metrics/debt-ledger.yaml` gains PG-202 entries; its `summary` was already behind the item list on main.
- `artifacts/benchmarks/IFC-310-merge.json` is timing churn from the API suite's merge benchmark, committed at the owner's
  request.

## Tracked, out of scope

- #909: legacy rule accepts appointments past midnight
- #910: `appointment_settings` RLS has no WITH CHECK
- #911: `defaultTimezone` defaults to UTC, but ADR-044 says Europe/London
- #912: stale `/calendar/new` and `/calendar/[id]` registry rows
- #913: known limits (recurring series checked on the first occurrence, findNextSlot has no UI caller, daily cap best-effort;
  the legacy findNextSlot existing-buffer gap is noted there)
- #914: findNextSlot input bounds
- #871 (comment): shared-token contrast for the Switch track and primary buttons
- #527 (comment): automated authenticated Lighthouse without hosted quota

## NEEDS_HUMAN

1. **Apply the migration to production before the API ships.** This covers Class A gates 4, 7 and 10-prod (above).
2. **Lighthouse (`GATE:lighthouse-gte-90`, AC-025):** a Path A attempt measured the global error page, because no Supabase is
   configured locally (`artifacts/lighthouse/PG-202/waiver-evidence.md`). An authenticated run needs a non-production Supabase.
   Owner direction: automate without spending hosted free quota (gh #527).
3. **Codex waiver for the best-effort daily cap:** approved by the owner in the lane modal on 2026-10-17 and recorded in
   `tools/audit/codex-review-waivers.yaml`. No action left; listed for visibility.
