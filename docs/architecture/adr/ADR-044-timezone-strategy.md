# ADR-044: UTC Storage with Three-Timezone Display Model

**Status:** Accepted

**Date:** 2026-03-16

**Deciders:** Architecture Team, Frontend Team, Legal Module Team

**Technical Story:** IFC-027, IFC-160

## Context and Problem Statement

IntelliFlow CRM is a multi-tenant CRM with users primarily based in London
(Europe/London as system default). The Legal Module introduces
jurisdiction-aware timestamp requirements: a paralegal in London working a New
York case must see court deadlines displayed in New York time, not London time.
Previously, timestamps were stored as PostgreSQL `timestamp` (without time zone)
and displayed using browser or server local time. How should the system store,
transmit, and display timestamps to be unambiguous across timezones,
jurisdictions, and deployment environments?

## Decision Drivers

- Multi-tenant users may operate across different geographic timezones
- Legal Module deadlines must reflect the jurisdiction's local time, not the
  user's local time
- Server and client timezones can differ, causing "today" boundary bugs
- Email reminders were displaying server time rather than recipient time
- ICS calendar events must encode the correct timezone for external calendar
  clients
- ESLint enforcement is needed to prevent bare `toLocaleDateString()` calls from
  regressing

## Considered Options

- **Option 1**: UTC storage + three-timezone display model (user timezone,
  entity timezone, jurisdiction)
- **Option 2**: Store timestamps in server-local timezone; convert on read
- **Option 3**: Store timestamps in user-local timezone per tenant; no
  conversion layer
- **Option 4**: UTC storage + single user-timezone display (no entity-level
  timezone)

## Decision Outcome

Chosen option: "UTC storage + three-timezone display model", because it is the
only option that correctly handles the Legal Module requirement for
jurisdiction-aware deadlines, eliminates server-TZ/client-TZ boundary bugs, and
provides a clean, auditable canonical form for all timestamps.

### Positive Consequences

- All 108+ frontend date formatting calls now use an explicit `timeZone` option
- 7 server-side "today" boundary bugs are fixed
- Email reminders and ICS events use the appointment's entity timezone
- ESLint `no-restricted-syntax` rules prevent bare `toLocaleDateString`/
  `toLocaleTimeString` regressions
- New entity fields (`Appointment.timezone`, `Case.timezone`,
  `Case.jurisdiction`) make timezone intent explicit and queryable
- Export, PDF, and billing contexts use `timeZone: 'UTC'` for consistency
- Public pages with no user context default to `timeZone: 'UTC'`

### Negative Consequences

- Existing `timestamp` (without time zone) columns require a future migration to
  `timestamptz`; this is non-breaking because Prisma handles both identically at
  the JS layer, but the migration must still be scheduled
- Every new date-formatting call requires a conscious timezone decision;
  developers cannot rely on implicit local-time defaults
- Three-timezone model adds conceptual surface area for onboarding new
  contributors

## Pros and Cons of the Options

### Option 1: UTC storage + three-timezone display model

- Good, because UTC is the only unambiguous canonical form across DST
  transitions and deployment environments
- Good, because entity-level timezone satisfies the Legal Module jurisdiction
  requirement without coupling it to user preference
- Good, because `User.timezone` gives each user independent display control
- Good, because ESLint rules make the constraint enforceable at CI time
- Bad, because it introduces three timezone concepts that developers must
  understand
- Bad, because existing `timestamp` columns need a future `timestamptz`
  migration

### Option 2: Store in server-local timezone; convert on read

- Good, because no migration is needed for existing columns
- Bad, because server timezone changes silently corrupt historical data
- Bad, because DST transitions produce ambiguous stored values
- Bad, because it does not solve the Legal Module jurisdiction requirement

### Option 3: Store in user-local timezone per tenant

- Good, because reads for a single tenant require no conversion
- Bad, because cross-tenant queries and reports become extremely complex
- Bad, because shared infrastructure (email, ICS) has no single canonical form
- Bad, because it does not scale to multi-jurisdiction legal workflows

### Option 4: UTC storage + single user-timezone display

- Good, because it is simpler than the three-timezone model
- Good, because UTC storage is correct
- Bad, because it cannot satisfy the Legal Module requirement: a London
  paralegal viewing a New York case deadline must see it in US-Eastern time,
  regardless of their own `User.timezone`
- Bad, because ICS events and email reminders for appointments would display in
  user timezone rather than the event's actual local time

## Links

- Sage CRM timezone best practices: user/system/integration timezone alignment
- OnePageCRM localization: per-user timezone independence
- Salesforce/Zoho pattern: user timezone vs record timezone vs system timezone
- Key files:
  - `apps/web/src/lib/shared/timezone-utils.ts`
  - `apps/api/src/lib/timezone-utils.ts`
  - `apps/web/src/providers/TimezoneProvider.tsx`

## Implementation Notes

### Three-Timezone Model

1. **User Timezone** (`User.timezone`): IANA timezone string (e.g.,
   `"Europe/London"`). Controls display of all general dates in the UI. Defaults
   to `Europe/London` when not set.
2. **Entity Timezone** (`Appointment.timezone`, `Case.timezone`): IANA timezone
   string attached to specific records. Appointments display in the event's
   timezone; cases display deadlines in the jurisdiction's timezone.
3. **Jurisdiction** (`Case.jurisdiction`): Legal jurisdiction code (e.g.,
   `"US-NY"`, `"UK-England"`). Drives court-time display for legal workflows.

### Storage Rules

- All timestamps stored as UTC in the database
- PostgreSQL column type: `timestamp` (Prisma `DateTime`)
- Prisma JS `Date` objects are always UTC
- Future non-breaking migration path: `timestamp` → `timestamptz`

### Display Rules

- All `toLocaleDateString` / `toLocaleTimeString` calls MUST include an explicit
  `timeZone` option — bare calls are blocked by ESLint `no-restricted-syntax`
- Server-side "today"/"this month" boundaries use
  `startOfDayInTimezone(userTimezone)` from
  `apps/api/src/lib/timezone-utils.ts`; never use
  `new Date(now.getFullYear(), now.getMonth(), now.getDate())`
- Public pages (no user context): `timeZone: 'UTC'`
- Export, PDF, billing: `timeZone: 'UTC'`

### Validation Criteria

- [ ] All frontend date formatting calls include explicit `timeZone` option
- [ ] ESLint `no-restricted-syntax` rule blocks bare locale date calls
- [ ] `startOfDayInTimezone` used for all server-side boundary calculations
- [ ] `Appointment.timezone` and `Case.timezone` fields present in Prisma schema
- [ ] `Case.jurisdiction` field present in Prisma schema
- [ ] Email reminders use appointment entity timezone
- [ ] ICS events encode entity timezone
- [ ] `TimezoneProvider` supplies user timezone to all UI components
- [ ] Tests written for `timezone-utils.ts` (both web and api)
- [ ] Documentation updated

### Rollback Plan

If the three-timezone model proves unworkable:

1. Revert entity-level timezone fields to optional and treat them as metadata
   only (no display logic change)
2. Fall back to Option 4 (UTC storage + single user-timezone display) as an
   interim measure
3. Legal Module jurisdiction display would require a separate, scoped override
   mechanism rather than a system-wide timezone model
4. UTC storage itself is never rolled back — it is always the correct canonical
   form

---
