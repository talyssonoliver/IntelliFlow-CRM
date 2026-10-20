# ADR-083: Tenant Event Types and an Unauthenticated Public Booking Endpoint

**Status:** Accepted (PG-203 spec consensus 6/6, 2026-10-21)

**Date:** 2026-10-21

**Deciders:** Talysson (owner rulings 2026-10-20/21, Q1-Q12), PG-203 spec
session, runner projects-8c (security requirements R1-R7)

**Technical Story:** PG-203 — Module Settings - Event Types
(`/calendar/event-types`)

## Context and Problem Statement

`/calendar/event-types` is a "coming soon" stub. The owner ruled that PG-203
ships three things:

- tenant event types (meeting templates);
- a picker that applies a type to the New Appointment form;
- a **live public booking page** at `/book/<handle>/<slug>`, where an anonymous
  visitor books a slot with the event type's host.

The booking creates an Appointment, may create a Lead, and sends email.

Until now the API had no unauthenticated endpoint that writes tenant data.
`publicProcedure` (`apps/api/src/trpc.ts:98`) carries no tenant context. The
only public writer, public feedback, writes a tenant-less table through
`apiPrisma` (`container.ts:332`).

Three more constraints shape the design:

- `Tenant.slug` embeds the admin's auth user UUID
  (`apps/api/src/context.ts:489`), so it cannot appear in a URL.
- `createTenantScopedPrisma` sets `app.current_tenant_id` with a session-level
  SET on the base client (`security/tenant-context.ts:177-190`), which does not
  reliably reach an interactive `$transaction` connection.
- The repository and `ScheduleAppointmentUseCase` persist in their own
  transaction and do not map the new columns
  (`PrismaAppointmentRepository.ts:490-515`).

How should a public booking resolve the tenant, stay tenant-safe, avoid double
booking, and resist abuse, without weakening isolation elsewhere?

## Decision Drivers

- Owner rulings:
  - live booking page (Q1/Q3);
  - a find-or-create Lead with the source chosen per event type, WEBSITE or
    BOOKING (Q4/Q8);
  - a host per event type (Q5);
  - booker and host emails via Resend (Q6);
  - a separate firm booking handle (Q7);
  - leads always AI-scored (Q8/Q9);
  - no booking before availability is saved (Q10);
  - no auto-linking of existing records (Q11);
  - the firm's privacy URL, falling back to `/privacy` (Q12).
- Runner R1-R7: rate limits per IP and per slug; tenant from the slug only; no
  enumeration; validation and escaping; a server re-check in a transaction;
  email caps; no existence oracle.
- `tenant-context.ts:131-135`: RLS is not the tenant boundary, and every query
  carries an explicit `tenantId`.
- Class A migrations only (ADR-069): no index on populated tables except via
  `CONCURRENTLY`.

## Considered Options

1. Public URL by `Tenant.slug`. Rejected because it leaks the auth UUID.
2. A globally unique event slug. Rejected because firms would compete for common
   names.
3. **A firm `bookingHandle` (nullable, unique, admin-chosen) plus a per-tenant
   event slug.** Chosen (Q7).

Concurrency options:

- (a) A unique index on `appointments(organizerId, startTime)`. Rejected: a new
  index on a hot table, and it does not cover the overlap or the daily cap.
- (b) SERIALIZABLE isolation. Rejected: retries, and a Prisma
  interactive-transaction retry loop.
- (c) **A per-tenant `pg_advisory_xact_lock` and a re-check against the
  regenerated slot set.** Chosen. Precedent:
  `scheduled-reports.router.ts:106-110`.

Abuse counters:

- An in-process `PublicRateLimiter` alone. Rejected: it is per process, and the
  PUBLIC tier passes through without Redis.
- **A `booking_attempts` table with salted hashes.** Chosen, with the limiter as
  a first line.

## Decision Outcome

Chosen: option 3 with the concurrency and abuse-counter choices above.

- **Tenant resolution.**
  - A single lookup on every path:
    `eventType.findFirst({slug, isActive, tenant: {bookingHandle}})`, run on the
    API role, which bypasses RLS. `tenants` has RLS with no policies.
  - Unknown handle, unknown slug, inactive type, no saved availability, or an
    inactive host all return one identical NOT_FOUND through the same DB-call
    sequence.
  - No tenant, host or lead id is ever accepted from the body; all public
    schemas are `.strict()`.
- **Booking transaction.** `ctx.prisma.$transaction` runs:
  1. `set_config('app.current_tenant_id', tid, true)`, which is
     transaction-local;
  2. `SET LOCAL lock_timeout`;
  3. the per-tenant advisory lock;
  4. a membership check of `start` in the regenerated `listOpenSlots` set;
  5. lead resolution;
  6. `tx.appointment.create`.

  Every query also carries an explicit `tenantId`.

- **Exception to the repository rule.** The public booking writes the
  appointment with `tx.appointment.create` directly. The repository and use case
  cannot join the caller's transaction and lack the booking columns. Side
  effects are replayed after commit through the extracted
  `onAppointmentCreated({sendIcs:false})`. The existing ICS handler uses
  placeholder recipients, so the public path does not use it.
- **The booker is not an attendee.** `AppointmentAttendee` is user-only
  (`schema.prisma:2147`). Booker identity lives in `bookerName`, `bookerEmail`
  and `bookingAnswers`, plus `leadId` when the booking created the lead.
- **Leads.**
  - No match: a new Lead is created through the domain factory and
    `leadRepository.save(lead, opts, tx)`, keeping LeadCreated and the outbox.
    It is always queued for AI scoring through the shared `enqueueLeadScoring`.
  - An existing non-booking lead or contact is never linked or modified. Only
    the host email flags the match (Q11).
- **Slots.** `listOpenSlots` is pure domain code composing the PG-202
  `generateCandidates`. It applies the ADR-081 ranges and closures, buffers with
  ConflictDetector parity, host busy time as organiser or attendee, 60 minutes
  of notice, a 60-day horizon, a 15-minute grid and the daily cap. Firms with no
  saved availability are not bookable (Q10).
- **Abuse.**
  - `booking_attempts` holds salted HMAC hashes of email and IP, never raw
    values. Caps: email 3 per 24 h, IP 10 per hour, event type 30 per hour.
  - `listSlots` has a rightmost-XFF per-IP limiter.
  - A filled honeypot gets a fake success.
  - `BOOKING_IP_SALT` is required in production.
- **Email.** Fixed templates with a shared `escapeHtml`. Subjects contain only
  the admin-authored event name, with CR/LF stripped. Free text is never echoed
  to the booker. The host email marks the booker's email as unverified. An email
  failure never undoes a booking.
- **Data.** Five Class A migrations:
  1. enum `ADD VALUE`, alone;
  2. tables, columns, CHECKs, FKs and RLS;
  3. `CONCURRENTLY` unique `tenants.bookingHandle`;
  4. `CONCURRENTLY` unique `leads(tenantId, id)`;
  5. the composite `appointments.leadId` FK with
     `ON DELETE SET NULL ("leadId")`.

  `appointments.eventTypeId` has a composite FK with
  `ON DELETE SET NULL ("eventTypeId")`.

### Consequences

- Good:
  - Bookings are tenant-safe, race-free and abuse-capped without Redis.
  - Existing CRM records cannot be polluted from anonymous input.
  - The new public surface is one router with allowlisted DTOs.
- Bad:
  - Bookings are serialised per tenant. This is acceptable at firm scale, and
    the lock is short.
  - The booker's email is unverified. The host email says so, and self-service
    cancel or reschedule is deferred to a follow-up task.
  - The repository bypass must be kept in sync if appointment columns change.
- Follow-ups:
  - self-service cancel and reschedule (signed token);
  - per-type notice and horizon settings;
  - a gh issue for the PUBLIC tier's leftmost-XFF keying and Redis pass-through;
  - a gh issue for the placeholder ICS recipients;
  - a gh issue for the playbook's "AI defaults false" rule.
