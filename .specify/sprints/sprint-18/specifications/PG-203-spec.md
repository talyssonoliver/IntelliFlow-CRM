# Specification: PG-203 — Event Types and Public Booking

**Status:** APPROVED. Spec consensus 6/6 on 2026-10-21 (Round 4.2).
**Sprint:** 18 · **Persona:** frontend-lead · **STOA:** Domain (lead), Security, Foundation, Quality
**Owner rulings:** `.specify/sprints/sprint-18/context/PG-203/PG-203-owner-ruling.md` (Q1-Q12; runner security
requirements R1-R7). **Exploration:** `.specify/sprints/sprint-18/context/PG-203/PG-203-spec-exploration.md`.
**Discussion log:** `.specify/sprints/sprint-18/specifications/PG-203-discussion.md`.

## Overview

`/calendar/event-types` is a 16-line "coming soon" stub (`apps/web/src/app/calendar/event-types/page.tsx:1-16`).
The owner rulings define three deliverables for PG-203, all in one PR:

1. **Event types settings.** A tenant catalogue of meeting types. Each type has a name, booking slug, duration,
   colour, default description, location type and details, required booker fields, host user, mapped
   `AppointmentType`, lead source (WEBSITE or BOOKING) and an active flag. The page also holds the firm's public
   **booking handle** and an optional **privacy-policy URL**.
2. **Applied at appointment creation.** The New Appointment form gets an "Event type" picker. It sets the
   appointment type and end time and fills empty location and description fields. The appointment stores a
   nullable `eventTypeId`.
3. **Public booking page** at `/book/<bookingHandle>/<eventSlug>`.
   - An anonymous visitor sees the open slots: the firm's PG-202 availability minus the host's busy time.
   - The visitor enters name, email, the required fields and consent, then books.
   - The booking creates a SCHEDULED appointment for the host.
   - If no lead or contact has that email, the booking creates a Lead with the event type's source. That lead
     is **always AI-scored** (Q9).
   - If the email matches an existing record, the booking does **not** link it. It flags the match to the host
     instead (Q11).
   - The booker gets a confirmation email and the host gets a notification email, via Resend through the
     existing notification adapter.
   - Booking is available only when the firm has a handle **and** has saved availability (Q10).

### Row DoD rebaseline (Category B, owner-approved; old → new)

| Row DoD item | New | Evidence |
|---|---|---|
| "AI defaults FALSE" | Rejected by the owner. Booking-created leads are always AI-scored, and PG-203 adds no AI toggle | Q8, Q9 (verbatim in ruling) |
| "wire every Boolean toggle … OR category-2 under IFC-310/311/312" | The only PG-203 Boolean, `isActive`, is wired (category 1). IFC-310/311/312 cover contacts and accounts only | Playbook §8, exploration |
| Artifacts: page, content, router, validators, context_ack | Adds the public booking router, public page, migrations and ADR-083 | Q1/Q3 |
| Owner "Frontend Dev (STOA-Foundation)" | STOA Domain + Security + Foundation + Quality | public write surface + migrations |

All other DoD items stand: playbook layout, EmptyState, CTAs, TagsTab via forwardRef, `$transaction` on
destructive writes, no skipDuplicates, superRefine for duplicate booking slugs, colorToken CHECK, cross-tenant
negative test, Lighthouse ≥ 90, verified by `pnpm test`.

## Related Documents

| Type | Path | Status | Action |
|------|------|--------|--------|
| PRD | `docs/planning/prd-module-settings.md` | Updated | Add "PG-203 Addendum: Event Types and Public Booking" (US-ET1..5, AC summary, toggles, AI deviation) |
| Playbook | `docs/planning/module-settings-playbook.md` | Referenced | §1-§4, §8, §12, §14 followed; **deviation:** "AI defaults false" (:132-136) overridden by owner Q8/Q9, tracked as an issue |
| ADR | `docs/architecture/adr/ADR-083-event-types-public-booking.md` | Proposed | Create (number allocated by the runner) |
| ADR | `docs/architecture/adr/ADR-081-tenant-availability.md` | Accepted | Referenced (slot rules) |
| ADR | `docs/architecture/adr/ADR-069-*` (autonomy / DB risk classes) | Accepted | Referenced (Class A) |
| ADR | `docs/architecture/adr/ADR-071-*` (visiting members / `tenantUserWhere`) | Accepted | Referenced (host membership) |

## Technical Approach

### Data: six migrations, all Class A, additive, forward-only

Splitting into six follows Postgres rules and the independent SQL review (every VALIDATE runs in its own
migration, 20261021120500, so it never scans under an ADD COLUMN / ADD FOREIGN KEY lock). `ADD VALUE` is unusable until it commits (55P04), and
`CONCURRENTLY` cannot run in a transaction. A single-statement file is not wrapped (precedent
`20261017120100_contacts_type_idx`).

1. **`20261021120000_lead_source_booking`**. Its only statement is `ALTER TYPE "LeadSource" ADD VALUE IF NOT EXISTS
   'BOOKING'`. Precedent: `20260930000000_tenant_quotas_usage:5`.
2. **`20261021120100_event_types`** (one transaction):
   - `enum EventLocationType { IN_PERSON PHONE VIDEO CUSTOM }`.
   - **`event_types`** columns:
     - `id` TEXT PK.
     - `tenantId` NOT NULL, FK tenants CASCADE.
     - `name VARCHAR(100)` NOT NULL, CHECK `btrim(name) <> ''`.
     - `slug VARCHAR(60)` NOT NULL, CHECK `~ '^[a-z0-9]+(-[a-z0-9]+)*$'`.
     - `description TEXT` NULL, CHECK length ≤ 2000.
     - `durationMinutes INT` NOT NULL DEFAULT 30, CHECK 5..480.
     - `colorToken TEXT` NOT NULL DEFAULT 'blue', CHECK on the 18-token `TAG_COLOR_TOKENS` literal. This is the
       same literal as `contact_types_colorToken_check` (20261017120000_contact_types:48-50).
     - `locationType` NOT NULL DEFAULT 'VIDEO'.
     - `locationDetails VARCHAR(500)` NULL.
     - `appointmentType "AppointmentType"` NOT NULL DEFAULT 'MEETING'.
     - `hostUserId TEXT` NOT NULL, FK users(id) **ON DELETE NO ACTION**. NO ACTION is checked at statement end,
       so a tenant CASCADE still works. RESTRICT would break it.
     - `requiredFields TEXT[]` NOT NULL DEFAULT '{}', CHECK `<@ ARRAY['phone','company','notes']::TEXT[]` AND
       `cardinality ≤ 3`.
     - `leadSource "LeadSource"` NOT NULL DEFAULT 'BOOKING', CHECK `IN ('WEBSITE','BOOKING')`. Migration 1 has
       committed by then, so the value is usable.
     - `isActive BOOLEAN` NOT NULL DEFAULT true.
     - `createdAt`, `updatedAt`.
   - `event_types` keys and policy:
     - Prisma `@@unique([tenantId, slug])`, `@@unique([tenantId, id])`, `@@index([tenantId, isActive])` and
       `@@index([hostUserId])`.
     - SQL-only `UNIQUE (tenantId, lower(name))`.
     - RLS policy `event_types_tenant_isolation` with USING and WITH CHECK, in the `DO $$ … duplicate_object` form.
   - **`booking_attempts`** (abuse counters, multi-process safe without Redis):
     - Columns: `id`, `tenantId` FK CASCADE, `eventTypeId` NULL, `emailHash CHAR(64)`, `ipHash CHAR(64)`,
       `createdAt`.
     - Indexes: `(tenantId, emailHash, createdAt)`, `(tenantId, ipHash, createdAt)`, `(eventTypeId, createdAt)`.
     - RLS. Raw emails and IPs are never stored; the hashes are salted HMAC-SHA256.
   - **`tenants`** columns:
     - `bookingHandle VARCHAR(40)` NULL, CHECK `~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length BETWEEN 3 AND 40`, added
       NOT VALID → VALIDATE.
     - `bookingPrivacyUrl VARCHAR(500)` NULL, CHECK `LIKE 'https://%'`.
     - The unique index comes in migration 3.
   - **`appointments`** columns. All are nullable and metadata-only, and no index is added to this populated table:
     - `eventTypeId TEXT`.
     - `leadId TEXT`.
     - `bookerName VARCHAR(200)`.
     - `bookerEmail VARCHAR(320)`.
     - `bookingAnswers JSONB`. Built server-side from the allowlisted keys only. Size CHECK
       `pg_column_size ≤ 4096`.
     - `bookedVia VARCHAR(20)`, CHECK `IN ('PUBLIC_LINK')`.
     - `bookingConsentAt TIMESTAMP(3)`.
     - `bookingConsentVersion VARCHAR(40)`.
     - Composite FK `appointments_tenantId_eventTypeId_fkey (tenantId, eventTypeId) → event_types(tenantId, id) ON
       DELETE SET NULL ("eventTypeId")` (PG ≥ 15; Supabase and local PG 16.11), with `SET LOCAL lock_timeout =
       '5s'`, NOT VALID → VALIDATE. All rows are NULL, so validation is trivial.
3. **`20261021120200_tenants_booking_handle_idx`**: `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
   "tenants_bookingHandle_key" ON "tenants"("bookingHandle")`. Multiple NULLs are allowed. The lowercase CHECK makes
   it case-insensitive. Prisma `@unique`.
4. **`20261021120300_leads_tenant_id_key`**: `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
   "leads_tenantId_id_key" ON "leads"("tenantId","id")`. Prisma `@@unique([tenantId, id])` on Lead, which is the
   DBA-012 composite target.
5. **`20261021120400_appointments_lead_fk`**: `SET LOCAL lock_timeout='5s'`, then the composite FK `(tenantId,
   leadId) → leads(tenantId, id) ON DELETE SET NULL ("leadId")` NOT VALID, then VALIDATE.

Each header carries the Class A bullets, the lock notes (gate 6: CONCURRENTLY for the populated `tenants`/`leads`;
FK adds NOT VALID with lock_timeout), and a recovery plan. Recovery is forward-only. Operational rollback is to clear
the handles, which turns booking off. A down-migration is Class C. Production applies via `prisma migrate deploy`
**before** the API ships (L13). The `schema.prisma` SQL-only comment block lists every CHECK, the lower-name index
and the RLS policies.

### Domain and validators

- `packages/domain/src/legal/appointments/event-types.ts` (domain constants):
  - `EVENT_LOCATION_TYPES`.
  - `EVENT_TYPE_REQUIRED_FIELDS = ['phone','company','notes']`.
  - `EVENT_TYPE_LEAD_SOURCES = ['WEBSITE','BOOKING']`.
  - `BOOKING_RESERVED_HANDLES`.
  - `BOOKING_NOTICE_MINUTES = 60`.
  - `BOOKING_HORIZON_DAYS = 60`.
  - `BOOKING_SLOT_STEP_MINUTES = 15`.
  - `BOOKING_CONSENT_VERSION`.
- Per-type notice/horizon settings are a follow-up task.
- `LeadSource` gains `BOOKING` in four places: the Prisma enum, domain `LEAD_SOURCES` (Lead.ts:26-34), the validators,
  and `enum-consistency.spec.ts`. UI lead-source labels and filters get a "Booking" label.
- `packages/domain/src/legal/appointments/listOpenSlots.ts`. This is a pure function that **composes the PG-202
  `generateCandidates`** (AvailabilityPolicy.ts:416) with `stepMinutes: 15`. There is no second generator.
  - Inputs: `{rules, from, days, durationMinutes, buffers, busy[], now, maxDaily, bookedPerDay}`.
  - Uses the firm timezone and ADR-081 ranges and closures. A candidate must fit in one range on its local start day.
  - Excludes a candidate when `[start − bufferBefore, end + bufferAfter]` overlaps busy time. The overlap uses
    **exactly** the `ConflictDetector` buffer semantics, enforced by a parity test.
  - Also excludes candidates before `now + notice`, after `now + horizon`, and on days that hit the cap.
  - Output is grouped per day, at most 48 slots per day.
  - Unconfigured firms never reach it (Q10).
- `packages/validators/src/event-types.ts`:
  - `eventTypeInputSchema`: every field above, with `colorToken` typed as `string` per playbook §4 and narrowed by an
    allowlist refine. `superRefine` rules: VIDEO details must be a valid https URL; IN_PERSON details are required;
    `requiredFields` may not contain duplicates.
  - `eventTypeCatalogSchema`: an array whose **superRefine rejects duplicate booking slugs** (case-insensitive,
    error at `[i,'slug']` of the second item) per the row DoD, and duplicate names. The client checks it on the draft
    catalogue, and the server checks it against existing rows before writes.
  - `bookingLinkSchema`: `{handle | null, privacyUrl | null}` with format, reserved words and https.
  - All public schemas are `.strict()`:
    - `publicBookingLookupSchema {handle, slug}`.
    - `publicSlotsInputSchema {handle, slug, fromDate YYYY-MM-DD, days 1..14}`.
    - `publicBookInputSchema`:
      - `{handle, slug, start ISO, name}`. `name` is 1..200, trimmed, with control characters and CR/LF stripped.
      - `email`: `z.email()`, lowercased, ≤ 320.
      - `answers`: `{phone? ≤ 40, company? ≤ 200, notes? ≤ 1000}`, strict.
      - `consent: z.literal(true)`.
      - `__honeypot: z.literal('').optional()`, with a server short-circuit.
  - Required answers are enforced on the server against the stored `requiredFields`.

### API

**`apps/api/src/modules/calendar/event-types.router.ts`**
- Nested as `calendar.eventTypes` (calendar.router.ts:19, like availability).
- Runs on plain `tenantProcedure`. Calendar is core, so there is no LEGAL gate.
- Writes require `isAvailabilityAdminRole` (availability-roles.ts:12; ADMIN or MANAGER). Do not add a new role helper.
- Procedures:
  - `list` (members): returns `{items, canEdit, bookingLink: {handle, privacyUrl, availabilityConfigured}}`. Each item
    carries the host display name and a `hostAvailable` flag.
  - `listActive` (members): used by the picker.
  - `create`, `update` (admin): run in `$transaction`. Checks before the write:
    - 50-per-tenant cap.
    - Catalogue superRefine against the existing rows.
    - Duration within the tenant's AppointmentSettings min..max.
    - The host must be an active user of the tenant (`tenantUserWhere`, ADR-071); otherwise NOT_FOUND.
    - P2002 maps to CONFLICT ("slug in use" or "name in use").
  - `delete` (admin): `$transaction` containing an ownership `findFirst({id, tenantId})` and `deleteMany({id,
    tenantId})`. The FK sets `eventTypeId` NULL on appointments. A foreign id returns NOT_FOUND.
  - `setBookingLink` (admin): sets or clears the handle and privacy URL. P2002 maps to CONFLICT "That booking handle
    is taken".
- Every query and write carries an explicit `tenantId` (tenant-context.ts:131-135).
- The audit logger (contact-types.router.ts:206-222 pattern) records create, update, delete and setBookingLink.

**`apps/api/src/modules/calendar/public-booking.router.ts`**
- Registered at the root as `publicBooking` and built on `publicProcedure`.
- **Lookup.** Exactly one query in every case: `eventType.findFirst({ where: { slug, isActive: true, tenant: {
  bookingHandle: handle } }, select: allowlist + tenant.{name, bookingPrivacyUrl, appointmentSettings.{defaultTimezone,
  availabilityConfiguredAt, buffers, defaultReminderMinutes}} + the host's tenant-membership/active fields })` via
  `ctx.prisma`.
  - The gate fields are selected in that same query, so every miss path runs one query and nothing else.
  - The API role bypasses RLS, and `tenants` has RLS with no policies
    (20260407000000_enable_rls_on_remaining_public_tables:54). The plan cites where the API DB role is configured, and
    ADR-083 states it.
  - The gates are evaluated in memory: the type exists, `availabilityConfiguredAt` is set, and the host is an active member.
  - Any failure, whether unknown handle, unknown slug, inactive type, no availability or unavailable host, throws the
    **identical** `NOT_FOUND "This booking page is not available."` after the same single DB call (R3).
- `getEventType({handle, slug})` returns `{firmName, eventName, durationMinutes, description, locationType, requiredFields,
  timezone, colorToken, privacyUrl}`. It omits the host name, ids and emails.
- `listSlots({handle, slug, fromDate, days})`:
  - `fromDate` must be within [today, today + 60] in the firm timezone.
  - Runs one availability load and one busy query for the host: `OR [{organizerId: host}, {attendees: {some: {userId:
    host}}}]`, status not CANCELLED/NO_SHOW, `tenantId`, in the window. This is the PrismaAppointmentRepository.ts:204,
    278-279 predicate.
  - Runs one per-day count for the cap.
  - Returns `{days: [{date, slots: [{start, end}]}]}` as UTC ISO.
  - Rate limit: a dedicated `PublicRateLimiter` (windowMs 500, about 2 per second, so date clicks are not
    throttled) per salted IP hash, plus the PUBLIC tier.
- **Retention.**
  - Inside `book` step 4, after the lookup and gates pass and before the cap counts, delete this tenant's
    `booking_attempts` rows older than 48 h. That window is longer than the 24 h email cap. Miss paths run no
    DELETE, which keeps AC-014's single call. The table stays bounded, and no new worker is needed.
  - Booker PII on appointments (`bookerName/bookerEmail/bookingAnswers`) follows the appointment record and is covered
    by DSAR (AC-022).
  - A purge rule for that booker PII is a **tracked follow-up task** under the PG-206 retention policies, named in the
    PRD addendum.
- `book(input)`, in this order:
  1. Strict validation. A filled honeypot gets a **fake success** with zero DB calls.
  2. Lookup and gates, giving the identical NOT_FOUND.
  3. Required answers.
  4. Abuse caps counted from `booking_attempts`: per tenant+emailHash ≥ 3 per 24 h, per tenant+ipHash ≥ 10 per hour,
     per eventType ≥ 30 per hour. A hit returns a generic TOO_MANY_REQUESTS (R1, R6).
     - Record the attempt row before the transaction.
     - The salt is `BOOKING_IP_SALT`. Production refuses to run without it, following public-feedback.router.ts:78-84.
       Dev and test use a local salt.
  5. `ctx.prisma.$transaction(async tx => …)`:
     - `SELECT set_config('app.current_tenant_id', tenantId, true)`.
     - `SET LOCAL lock_timeout = '2s'`.
     - `$executeRaw SELECT pg_advisory_xact_lock(hashtextextended('booking:' || tenantId, 0))`. This is a
       **per-tenant** lock, so it serialises bookings per firm and covers both host conflicts and the tenant-wide
       daily cap (R5). Precedent: scheduled-reports.router.ts:106-110.
     - Re-check: `start` must be a member of the slot set regenerated by `listOpenSlots` for that day, with the same
       inputs re-read inside the transaction. Otherwise CONFLICT "That time is no longer available."
     - Lead resolution (Q11, R7). Look up Lead and Contact `{tenantId, email: {equals, mode: 'insensitive'}}` in both
       branches.
       - Booking-created lead found (`source ∈ {BOOKING, WEBSITE}` with a prior `bookedVia` appointment): link `leadId`.
       - No match: call the new public `LeadService.createLeadInTransaction(props, tx)`
         (packages/application/src/services/LeadService.ts). It wraps `Lead.create`, `leadRepository.save(lead,
         undefined, tx)` and the existing private `publishEvents(lead, tx)` (:761). It runs no duplicate pre-check and
         opens no transaction of its own. `createLead` (:108-149) is refactored to call it inside its
         `transactionManager.run`, with no behaviour change. `save` alone does **not** publish LeadCreated, and
         ADR-011 zero-lost-events requires the outbox row. The plan must confirm the Prisma `tx` satisfies
         `RepositoryTransaction` (how `transactionManager.run` builds its handle).
         - Props: `{email, firstName/lastName split on the first whitespace run, company, phone, source:
           eventType.leadSource, ownerId: hostUserId, tenantId}`.
         - If `PhoneNumber` validation fails, the phone is dropped from the lead and the raw value stays in the answers.
         - Link `leadId`.
       - A "booking-created lead" is a Lead with `{tenantId, lower(email)}` that has an appointment with
         `bookedVia='PUBLIC_LINK'` and `leadId = that lead`. A staff-created lead with the same email is **not**
         booking-created (test).
       - Any other match (existing non-booking lead, or a contact): no link and no modification. Set
         `matchedExistingRecord = true` for the host email only.
       - The response is identical in every branch.
     - `tx.appointment.create`, written directly. ADR-083 exception: the repository/use case cannot join this
       transaction and lacks the new columns (PrismaAppointmentRepository.ts:490-515). Values:
       - Title `"<eventName> with <name>"`, capped at 200.
       - Description = event type description; location = details; `appointmentType`.
       - `status SCHEDULED`; `organizerId = hostUserId`.
       - Buffers snapshotted from AppointmentSettings; `reminderMinutes = defaultReminderMinutes`; timezone = firm tz.
       - `eventTypeId`, `leadId`, booker fields, `bookedVia 'PUBLIC_LINK'`, consent time and version.
  6. After commit, all detached and failure-tolerant. Nothing in this step changes the response, and logs contain no PII:
     - `enqueueLeadScoring(lead)` for a new lead. This is the shared helper **extracted** from lead.router.ts:532-559;
       `lead.create` is refactored to call it, with a regression test.
     - A system lead activity row.
     - Appointment side effects via the **extracted** `onAppointmentCreated` (moved from appointments.router.ts to
       `modules/legal/appointment-side-effects.ts`) with `{sendIcs: false}`. This keeps the reminder and the
       AppointmentCreatedEvent, and drops the placeholder-recipient ICS.
     - Two emails via `adapters.notificationService.sendEmail({to, subject, textBody, htmlBody, replyTo?})`:
       - **Booker:** fixed template. Subject `"Booking confirmed: <eventName>"` with CR/LF stripped (the event name is
         admin-authored). The body has the escaped name, the time in both the visitor and firm timezones, and the
         location. It never echoes the free-text answers. It says "contact the firm to change this". No ICS.
       - **Host:** to the host user's stored email. It carries the escaped booker name, email and answers, the note
         "email not verified", and when `matchedExistingRecord` is set, "matches an existing record in your CRM".
       - Both use a new shared, unit-tested `escapeHtml`. None exists today (security R3 #9).
  7. Return `{startsAt, endsAt, timezone}` and no ids.
- Errors are generic, never `error.message`.
- No redirect or return-URL parameters exist.
- `book` never reads the session cookie for authorisation.

**`appointments.create`** (legal/appointments.router.ts:110-126, :496):
- Adds optional `eventTypeId`.
- It is verified next to `assertAppointmentRefsInTenant` (:499) as `{id, tenantId, isActive}`, with the same NOT_FOUND shape.
- After the use case returns, it is persisted with `prismaWithTenant.appointment.updateMany({where:{id, tenantId}, data:{eventTypeId}})`.
  This is nullable metadata, and a failure loses only the link.
- `updateAppointmentSchema` is untouched. #890 is an open issue, not code. Rebase on main first.

**Registration and wiring:**
- `router.ts` adds `publicBooking`, and `calendar.router.ts` nests `eventTypes`.
- `packages/db/src/index.ts` exports `EventType` and `BookingAttempt`.
- No new container service: the notification adapter (container.ts:270-296) already falls back to the mock.

### Web

**`/calendar/event-types`:**
- `page.tsx` is a server shell: `Suspense fallback={<EventTypesLoading/>}` + `EventTypesContent` (availability/page.tsx:13-18).
- `EventTypesLoading.tsx` is a skeleton that mirrors the bento (playbook §1).
- `EventTypesContent.tsx` follows ContactTypesContent:
  - `PageHeader` (title/description only).
  - A 12-column bento: an 8-column "Event types" card and a 4-column "Booking link" card.
  - The "New Event Type" CTA sits in the 8-column card's `SectionHeader` action slot. It is size sm, Title Case, with
    no icon, per playbook §1/§3 and the PG-205 precedent (ContactTypesContent :187-198). It calls
    `listRef.current?.openCreate()`.
  - Read-only note for non-editors; inline CONFLICT handling; NOT_FOUND fallback for an unreleased API; toasts.
- `components/EventTypeList.tsx` is `forwardRef<EventTypeListHandle>` with `useImperativeHandle({openCreate})`. This is
  playbook §4's TagsTab contract, with the PG-202/PG-205 interpretation: no tags subject, the same interface.
  - Rows show the swatch (`swatchClass` with slate fallback), duration, location, host (or "host unavailable"), an active
    badge, and "Copy link" when booking is available.
  - Empty: `EmptyState entity="appointments" phase="passive" size="sm" className="py-4 px-3 gap-2"` with no action
    button (§2).
- `components/EventTypeDialog.tsx` is a shadcn Dialog:
  - 18-swatch RadioGroup with text labels; `openEdit` narrows unknown legacy tokens to 'slate' (§4).
  - Required-fields checklist; lead-source radio; active switch.
  - Host combobox via `api.user.list` (user.router.ts:158-200, search-as-you-type, limit 50).
  - Location type with conditional details.
  - Inline slug/name CONFLICT messages.
- Delete uses `ConfirmationDialog` with focus restore.
- `components/BookingLinkCard.tsx`:
  - Handle and privacy-URL inputs.
  - Full URL preview and a copy button.
  - States: "Booking is off: set a handle" and "Booking is off: set your availability first", with a link to
    `/calendar/availability` (Q10).
- `apps/web/src/components/calendar/event-type-colors.ts` reuses `lib/color-tokens.ts`.
- `CalendarSettingsPanel.tsx:19` copy changes to "Meeting types & booking links".

**AppointmentForm** (`components/appointments/AppointmentForm.tsx`) and `appointments/new/page.tsx`:
- The page fetches `api.calendar.eventTypes.listActive`, gated like `settingsQuery` (:56-80) so the picker does not pop in.
- An "Event type" select (lowercase "type", so `getByLabelText(/Type/)` at AppointmentForm.test.tsx:108 still has one match)
  sits above Type. It appears in create mode only.
- On select:
  - Set `appointmentType`.
  - Fill location and description only if they are empty.
  - Do not set the title.
- `endTime = startTime + duration` is recomputed whenever `startTime` changes while a type is selected, unless the user has
  edited endTime ("end touched"). It is untouched while `startTime` is empty.
- Clearing the select keeps the values.
- Submit carries `eventTypeId`.
- AppointmentDetail is unchanged (out of scope).

**Public page** `apps/web/src/app/(public)/book/[handle]/[slug]/page.tsx` + `BookingContent.tsx` + `loading.tsx`:
- `/book` is added to the chrome-free list in `PublicLayoutShell.tsx` (:31-41): no marketing header or footer, and no
  feedback FAB. It is also added to the `navigation.tsx:25-35` hide list, so a logged-in staff member sees no app bar
  there (test). The page has a minimal header with the firm name and a "Powered by Aurora" footer link.
- `generateMetadata` gives a generic title and `robots: {index:false, follow:false}`.
- `app/robots.ts` disallows `/book/`. The page is absent from `app/sitemap.ts`. `/book` stays out of `PROTECTED_ROUTE_PREFIXES`.
- Flow:
  - Event summary.
  - 14-day date strip: a radiogroup with roving tabindex and arrow keys, `aria-checked`, and an aria-live slot count.
  - Slot radiogroup, with times shown in the **visitor's local timezone** and the firm timezone secondary. Times are
    formatted on the client only to avoid hydration mismatch.
  - Form: name, email, required fields, consent checkbox (firm privacy URL or `/privacy`, Q12), honeypot.
  - Confirmation panel; focus moves to its heading.
- The honeypot sits in an off-screen wrapper. The input has `tabIndex={-1}` and `autoComplete="off"`; the wrapper is
  visually hidden but not `display:none`. No `aria-hidden` goes on a focusable element.
- States:
  - Not-available (NOT_FOUND).
  - "No open times in the next 14 days".
  - Loading skeleton.
  - 409: refetch slots, keep the form values.
  - 429 message.
- L11: no server-only imports in `BookingContent`, and validators imported by subpath.

## Components

| File | Action | Reuse |
|---|---|---|
| `apps/web/src/app/calendar/event-types/page.tsx` | REWRITE | COMPOSES Suspense + content (availability/page.tsx) |
| `…/event-types/EventTypesContent.tsx`, `EventTypesLoading.tsx` | CREATE | COMPOSES PageHeader + SectionHeader + Card + ConfirmationDialog |
| `…/event-types/components/EventTypeList.tsx` | CREATE | EXTENDS ContactTypeList (forwardRef); REUSES EmptyState |
| `…/event-types/components/EventTypeDialog.tsx` | CREATE | EXTENDS ContactTypeDialog (Dialog, RadioGroup, Switch, Select/Combobox) |
| `…/event-types/components/BookingLinkCard.tsx` | CREATE | COMPOSES Card + Input + Button |
| `apps/web/src/components/calendar/event-type-colors.ts` | CREATE | REUSES lib/color-tokens.ts |
| `apps/web/src/app/(public)/book/[handle]/[slug]/{page,BookingContent,loading}.tsx` | CREATE | NEW (justified): no public scheduling UI exists; COMPOSES `@intelliflow/ui` primitives |
| `apps/web/src/app/(public)/_components/PublicLayoutShell.tsx` | MODIFY | chrome-free list |
| `apps/web/src/components/appointments/AppointmentForm.tsx`, `apps/web/src/app/appointments/new/page.tsx` | MODIFY | picker |
| `apps/web/src/components/calendar/CalendarSettingsPanel.tsx`, `apps/web/src/app/robots.ts` | MODIFY | copy, disallow |
| `apps/api/src/modules/calendar/{event-types,public-booking}.router.ts`, `booking-email.ts`, `booking-abuse.ts` | CREATE | contact-types/availability/public-feedback patterns |
| `apps/api/src/modules/lead/lead-scoring-enqueue.ts` | CREATE (extract) | from lead.router.ts:532-559 |
| `packages/application/src/services/LeadService.ts` | MODIFY | adds public `createLeadInTransaction`; `createLead` delegates to it |
| `apps/api/src/modules/legal/appointment-side-effects.ts` | CREATE (extract) | from appointments.router.ts onAppointmentCreated |
| `apps/api/src/modules/legal/appointments.router.ts`, `lead/lead.router.ts`, `calendar/calendar.router.ts`, `router.ts` | MODIFY | |
| `apps/api/src/security/html-escape.ts` (or shared util) | CREATE | NEW (justified): grep found no escapeHtml |
| `packages/domain/src/legal/appointments/{event-types,listOpenSlots}.ts`, `crm/lead/Lead.ts` | CREATE/MODIFY | composes generateCandidates |
| `packages/validators/src/event-types.ts`, `lead.ts`, index | CREATE/MODIFY | |
| `packages/db/prisma/schema.prisma`, 5 migrations, `packages/db/src/index.ts` | MODIFY/CREATE | |

## Interfaces & Contracts

As defined above. The public DTOs are explicit `select` allowlists. Snapshot tests assert that `organizerId`, `email`,
`tenantId`, `title`, `attendees`, `hostUserId` and every id are absent.

## Integration Points

- PG-202 availability: rules, `loadTenantAvailability`, `assertAppointmentWithinAvailability` for the cap, and
  `availabilityConfiguredAt`.
- PG-189 AppointmentSettings: timezone, buffers, reminder, min/max duration.
- Lead domain and outbox, and the AI scoring queue.
- Notification adapter.
- Appointment create and its side effects.
- User list (host).

## Runtime Wiring & Replacement Paths

| Surface | Must Be Called By | Replaces / Blocks | Notes |
|---|---|---|---|
| `calendar.eventTypes.list/create/update/delete` | `EventTypesContent`/`EventTypeDialog` | the "coming soon" stub | |
| `calendar.eventTypes.setBookingLink` | `BookingLinkCard` | — | |
| `calendar.eventTypes.listActive` | `appointments/new/page.tsx` → picker | — | |
| `appointments.create.eventTypeId` | AppointmentForm submit | — | |
| `publicBooking.getEventType/listSlots/book` | `BookingContent` | — | the only public write |
| `listOpenSlots` | `listSlots` and the `book` re-check | — | single source |
| `enqueueLeadScoring` | `lead.create` (refactored) + `book` | the inline IIFE in lead.router.ts:532-559 | regression test |
| `onAppointmentCreated` (extracted) | `appointments.create`/reschedule + `book` | the module-private function | `sendIcs:false` for book |
| `escapeHtml` | `booking-email.ts` | — | |

## Navigation & Reachability

- `/calendar/event-types`: sidebar `configs/calendar.ts:12` (exists, icon `category`), `CalendarSettingsPanel.tsx:17-21`
  (exists, copy updated), settings layout via `_layout-shell.tsx:26`. Reachable: YES.
- `/book/[handle]/[slug]`: public by design and not in app navigation. It is reached by the URL copied from the Booking
  link card. Recorded in `navigation-reachability-audit.md` as "external entry (PG-203)", which is not a waiver.

## Acceptance Criteria

**Settings**
- AC-001: `/calendar/event-types` renders PageHeader, the bento and a loading skeleton with real data. The stub text is gone.
- AC-002: The empty catalogue shows `EmptyState entity="appointments" phase="passive"` with no action button. The CTA
  lives in the SectionHeader.
- AC-003: ADMIN and MANAGER can create, edit and delete. Other roles get a read-only view, and the server returns FORBIDDEN.
- AC-004: Validation:
  - Name 1..100, unique per tenant, case-insensitive.
  - Slug kebab 1..60, unique per tenant: superRefine on the catalogue plus a DB unique mapped to CONFLICT.
  - Duration 5..480 and within the tenant's min..max.
  - VIDEO details must be an https URL; IN_PERSON details are required.
  - Colour is one of the 18 tokens; requiredFields from the allowlist; at most 50 types.
- AC-005: The host must be an active member of the tenant. A foreign host returns NOT_FOUND. A host who later becomes
  inactive is flagged "host unavailable", and that type's public page is not available.
- AC-006: Delete runs in a `$transaction` with an ownership check. Linked appointments keep existing with `eventTypeId`
  NULL. A foreign id returns NOT_FOUND.
- AC-007: Booking link:
  - The handle can be set, changed or cleared: format 3..40, reserved words rejected, globally unique (CONFLICT).
  - The privacy URL is optional and must be https.
  - The card shows the full URL with copy, or the precise "off" reason (no handle, or no availability).
- AC-008: `EventTypeList` exposes `{openCreate}` through a forwardRef handle, and the SectionHeader CTA uses it (playbook §4).
- AC-009: `isActive` is wired: inactive types are hidden from the picker and the public page. PG-203 adds no other
  Boolean and no AI toggle (Q9).

**Appointment form**
- AC-010: The New Appointment form lists active types. Selecting one follows the prefill rules above. The created appointment
  stores `eventTypeId`. A foreign or inactive id returns NOT_FOUND. The existing AppointmentForm tests stay green.

**Public booking**
- AC-011: `/book/<handle>/<slug>` shows the summary and 14 days of slots computed by `listOpenSlots`. Slots honour:
  - availability ranges and closures;
  - buffers, with parity to ConflictDetector;
  - host busy time (as organiser or attendee);
  - 60-minute notice and a 60-day horizon;
  - the daily cap.
  Times are shown in the visitor's timezone, with the firm timezone also shown.
- AC-012: A successful `book` creates exactly one SCHEDULED appointment for the host with all booking fields. The server
  re-checks inside a transaction under a per-tenant advisory lock with transaction-local tenant config. Two concurrent
  books for one slot produce exactly one success and one CONFLICT (R5).
- AC-013: Tenant scope comes only from the handle. A body carrying `tenantId`, `hostId`, `hostUserId` or `leadId` fails
  strict validation on all three public procedures. Every query has an explicit `tenantId` (R2).
- AC-014: Unknown handle, unknown slug, inactive type, firm without availability and unavailable host return an identical
  NOT_FOUND (code, message, data) through the same DB-call sequence (R3, Q10).
- AC-015: Input validation:
  - Lengths are capped and control characters stripped. A missing required answer returns BAD_REQUEST, and consent is
    required.
  - A filled honeypot gets a fake success with zero DB calls.
  - `fromDate` is bounded and `days` ≤ 14 (R4).
- AC-016: Emails:
  - The booker confirmation and the host notification each go to the right address.
  - Fixed subjects with CR/LF stripped; every interpolated value is HTML-escaped; no free-text answers go to the booker.
  - The host email flags an unverified email and any match with an existing record.
  - A failed email does not undo the booking. Tests use the mock adapter only (R4).
- AC-017: Abuse caps come from `booking_attempts`, counted with salted hashes: email 3 per 24 h, IP 10 per hour, event type
  30 per hour. *Exec adaptation (owner ruling 2026-10-21, Category A): the event-type cap counts landed public bookings
  (`appointments.bookedVia = 'PUBLIC_LINK'`), not attempts, so junk cannot lock real visitors out; email and IP still
  count every attempt.* There is also a `listSlots` per-IP limiter. A production start without `BOOKING_IP_SALT` refuses (R1, R6).
- AC-018: Leads (Q11, R7):
  - No match: create a Lead with the event type's source and owner = host, via
    `LeadService.createLeadInTransaction`. LeadCreated lands in the outbox in the same transaction, which the
    integration suite asserts.
  - A booking-created lead is linked.
  - Any other existing lead or contact is neither linked nor modified, and only the host email flags it.
  - The response and DB-call shape are identical across branches.
- AC-019: Every lead created by a booking is queued for AI scoring through the shared `enqueueLeadScoring`, and
  `lead.create` still enqueues exactly as before (Q8, Q9).
- AC-020: Public responses are allowlisted DTOs (snapshot test).
- AC-021: `/book` is noindex, disallowed in robots, absent from the sitemap, reachable without login, and rendered without
  marketing chrome.
- AC-022: GDPR:
  - Consent time and version are stored on the appointment.
  - The privacy link is the firm's URL, falling back to `/privacy` (Q12).
  - The DSAR export and erasure paths cover `appointments.bookerEmail`/`bookerName`/`bookingAnswers` for the data
    subject's email. Raw IPs and emails are never stored in `booking_attempts`.

**Cross-cutting**
- AC-023: Cross-tenant negative tests:
  - Router unit tests: NOT_FOUND for foreign ids, and every call scoped to the tenant.
  - Real-DB `tests/integration/event-types.test.ts`:
    - RLS hides tenant B's event_types and booking_attempts from A.
    - B's handle books only into B.
    - The `book` transaction under the non-bypass role sees only its own tenant.
    - Tenant delete works with event types present.
- AC-024: The six migrations are Class A, with named CHECKs, RLS, lock notes and a recovery plan. The integration suite
  applies their SQL itself (L14) without replaying `ALTER TYPE`, and runs CONCURRENTLY statements alone.
- AC-025: Registries are updated for the new page (count 214→215 in every surface listed in Test Requirements). The PRD
  addendum and ADR-083 exist. The follow-up tasks and issues listed in Risks exist.
- AC-026: WCAG 2.1 AA: axe-clean component tests; keyboard-operable date/slot radiogroups and the dialog; labelled
  controls; focus management.
- AC-027: Lighthouse ≥ 90 for both pages:
  - `/calendar/event-types` via the authenticated PG-198 Path C recipe.
  - The public booking page via a production build with a seeded handle and availability.
  - If it cannot be measured, the result is NEEDS_HUMAN with the reason, never faked.

## Non-Functional

- NF-001: `listSlots` p95 < 300 ms for 14 days: one lookup, one availability load, one busy query, one count.
- NF-002: No PII (email, IP, answers) in logs.
- NF-003: L11: thin web routes, no heavy server-only imports.
- NF-004: Booking transaction holds the tenant lock < 200 ms typical; `lock_timeout 2s` → CONFLICT "try again".

## Test Requirements

| AC | Test file(s) |
|---|---|
| 001, 002, 008 | `apps/web/src/app/calendar/event-types/__tests__/page.test.tsx`, `EventTypesContent.test.tsx`, `components/__tests__/EventTypeList.test.tsx` |
| 003, 005, 006, 007, 009 | `apps/api/src/modules/calendar/__tests__/event-types.router.test.ts`; web `BookingLinkCard.test.tsx`, `EventTypeDialog.test.tsx` |
| 004 | `packages/validators/src/__tests__/event-types.test.ts` + router test |
| 010 | `apps/web/src/components/appointments/__tests__/AppointmentForm.test.tsx` (extend), `apps/web/src/app/appointments/new/__tests__/*` (extend or create), `apps/api/src/modules/legal/__tests__/appointments.router.test.ts` (extend: eventTypeId accepted, foreign/inactive NOT_FOUND) |
| 011 | `packages/domain/src/legal/appointments/__tests__/listOpenSlots.test.ts`: `now` injected; fixtures relative to `now`; fixed far-future dates only for DST; spring-forward and fall-back in Europe/London and America/New_York; closures; buffers parity with ConflictDetector; cap; notice boundary at exactly 60; horizon; grid; per-day cap 48 |
| 012-020 | `apps/api/src/modules/calendar/__tests__/public-booking.router.test.ts` (createPublicContext :443; mocks for notificationService resolve/reject, the queue helper and the limiter reset). Covers: identical NOT_FOUND across all five cases (deep-equal and call sequence); strict bodies on three procedures; honeypot zero calls; caps; salt refusal; lock `$executeRaw` before the busy query; re-check CONFLICT; lead branches with an identical response; phone fallback; P2002 race → CONFLICT; emails escaped (a `<script>`/CRLF case); email failure tolerated; DTO snapshot; enqueue called for a new lead only; generic errors |
| 016 | `apps/api/src/modules/calendar/__tests__/booking-email.test.ts`, `apps/api/src/security/__tests__/html-escape.test.ts` |
| 019 | `apps/api/src/modules/lead/__tests__/lead-scoring-enqueue.test.ts` + the existing lead router tests (regression) |
| 021 | `apps/web/src/app/__tests__/robots.test.ts` (extend), `sitemap.test.ts`, `apps/web/src/__tests__/root-proxy.test.ts` (extend: `/book/x/y` unauthenticated passes), `(public)/_components/__tests__/PublicLayoutShell.test.tsx` (extend), `(public)/book/[handle]/[slug]/__tests__/page.test.tsx` (metadata noindex), `BookingContent.test.tsx` (flow, honeypot not reachable, states, axe) |
| 022 | public-booking router test (consent stored) + DSAR test (extend the existing DSAR collector test) |
| 023, 024 | `tests/integration/event-types.test.ts` (`describeDb`, prefixed tenants + sweep, schema lock; CHECKs, uniques, FKs incl. SET NULL column list, RLS, tenant cascade). Deterministic lock test: transaction A takes the lock and parks; B's wait is confirmed in `pg_locks`; release A; exactly one row. Lock-free control expects a double booking |
| 025 | `apps/web/src/app/__tests__/sitemap-reconciliation.test.ts` (214→215 with a PG-203 comment) and the doc totals: `docs/design/{sitemap,page-registry,PAGE_MAP_AND_FLOWS,information-architecture,navigation-reachability-audit,ui-flow-mapping}.md`, regenerated `docs/design/content-audit.md` + `artifacts/reports/content-audit-results.json` |
| 026 | axe in each web component test |
| 027 | Lighthouse evidence JSON (.txt/.json, never .log; L14) |

Existing suites to rerun as full package runs: `@intelliflow/validators`, `@intelliflow/domain`, `@intelliflow/application`
(if touched), `@intelliflow/adapters` (if touched), `@intelliflow/api`, `@intelliflow/web`, plus the `integration`
project file `tests/integration/event-types.test.ts`. Explicitly: sitemap/ia/ui-flow reconciliation,
route-total-consistency, content-audit, robots/sitemap/root-proxy/session, appointments router, availability, lead router,
`enum-consistency.spec.ts`, `rls-tenant-isolation.test.ts` (add event_types and booking_attempts).

Diff coverage (L2): every changed router branch has a mocked unit test, including the advisory-lock call order, the P2002
race, the email failure and the salt refusal. The integration tests do not count toward coverage.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| First unauthenticated write: spam, enumeration, email abuse | R1-R7 → AC-012..AC-018; DB-counted caps that are multi-process safe; fake honeypot success |
| PUBLIC tier passes through without Redis and keys on the leftmost XFF (rate-limit.ts:411-424; trpc.ts:91-93) | Booking does not rely on it (DB caps + rightmost-XFF limiter); the pre-existing gap is filed as a **gh issue** |
| Tenant config not applied to the transaction connection (tenant-context.ts:177-190) | `set_config(...,true)` as the first statement in the transaction; real-DB test under the non-bypass role |
| Double booking and the cross-host cap race | per-tenant advisory lock + regenerated-slot membership check |
| Lead unique race aborts the transaction (25P02) | Only a staff create can race (bookings are serialised per tenant) → CONFLICT "try again"; tested |
| Anonymous input polluting real client records | Q11: no auto-link; the host flag only |
| `db:push` CI DB lacks CHECK/RLS | integration suite applies the SQL itself (L14) |
| Prisma enum ADD VALUE + use in one transaction (55P04) | migration 1 runs alone |
| Index builds on hot `tenants`/`leads` | CONCURRENTLY single-statement migrations 3-4 |
| Placeholder ICS recipients (AppointmentIcsEventHandler.ts:245-258) | the public path uses `sendIcs:false`; the existing defect is filed as a **gh issue** |
| Unverified booker email | the host email says so; no ICS to the booker; cancel link deferred |
| "AI defaults false" playbook rule contradicts the owner | **gh issue** + debt ledger + findings doc |
| No self-service cancel or reschedule | follow-up **task** (create-task) named in the PRD addendum; the confirmation says to contact the firm |
| Per-type notice and horizon fixed in code | follow-up task |
| Booker PII on appointments has no purge rule | DSAR covers it now; a purge rule under the PG-206 retention policies is a follow-up task. `booking_attempts` is pruned at 48 h on every `book` call |
| Lead outbox event lost if persisted via `save` only | `LeadService.createLeadInTransaction` publishes in the same tx (ADR-011); outbox-row integration test |
| Scope vs maxIter 20 | the runner is informed; tell the runner before any cut |

## Agent Sign-offs

Round 4 ran in two passes. Each agent's verdict text is in the discussion log.

| Agent | Round 4.1 | Round 4.2 | Files verified (by tool, this session) |
|---|---|---|---|
| Backend-Architect | REJECTED (LeadCreated outbox lost via `save`) | **APPROVED** | LeadService.ts:109-149,761; PrismaLeadRepository.ts:92-98; RLS migration :54; PrismaAppointmentRepository.ts; availability-enforcement.ts; AvailabilityPolicy.ts; appointments.router.ts |
| Data-Engineer | **APPROVED** | — | spec Data; tenant_quotas_usage migration; contact-types.test.ts; local test DB catalog (read-only) |
| Frontend-Lead | **APPROVED** | — | PublicLayoutShell.tsx; navigation.tsx; AppointmentForm.test.tsx |
| Security-Lead | APPROVED with 2 must-fix | **APPROVED** (prune ordering fixed after) | tenant-context.ts; client-ip.ts; public-rate-limiter.ts; trpc.ts; public-feedback.router.ts; schema.prisma |
| Domain-Expert | **APPROVED** | — | LeadService.ts:141; Lead.ts:232-285; lead.router.ts:489-559 |
| Test-Engineer | **APPROVED** | — | spec; ruling |

**Consensus: 6/6 APPROVED (100%) after Round 4.2. No unresolved blocking issue.**

Open plan-time items:
- The Prisma `tx` satisfies `RepositoryTransaction` (backend).
- Cite where the API DB role (BYPASSRLS) is configured, in ADR-083 (security).
- `ensureMigrationSql` skips `ALTER TYPE` and runs the CONCURRENTLY files alone (data).
- A recording-prisma tenantId helper (test).
- A test that a staff WEBSITE lead with the same email is not linked (domain/test).
- `/book` is added to the navigation hide list (frontend).
