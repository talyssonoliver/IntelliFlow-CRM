# PG-203 owner ruling

Date: 2026-10-20 (asked by the PG-203 lane in AskUserQuestion modals, answered by Talysson)

## Q1 - where tenant event types are used
Options: A applied at appointment creation (picker + nullable eventTypeId) / B settings catalog only /
C A plus a public booking page at /book/<slug>.
Answer: **C - A + public booking page.**

## Q2 - booking slug and required form fields
Answer: "Store, validate, mark not live".

## Q3 - clarification (Q1=C and Q2 conflicted)
Options: build the booking page in PG-203 with the slug live / picker now and booking page as follow-up /
build it as a second PR.
Answer: **Build it in PG-203, slug live.**

## Effective ruling
PG-203 ships, in one PR:
1. Event types settings CRUD at /calendar/event-types (row DoD).
2. An event-type picker in the appointment form that pre-fills duration, location and description and
   stores a nullable eventTypeId on the appointment (additive migration).
3. A public booking page reached by the event type's booking slug, using the required form fields and
   PG-202 availability, that creates an appointment. The slug is live, not a placeholder.

## Q4-Q6 - public booking flow (same session, AskUserQuestion)
- Booker record: **find-or-create Lead** - match an existing Lead/Contact by email in the tenant, else
  create a Lead (source: booking). The appointment links to it and keeps name, email and form answers.
- Host: **a host user set per event type** (required; defaults to its creator). Offered slots = firm
  availability (PG-202) minus that host's existing appointments.
- Email: **confirmation to the booker and a notification to the host** via the existing Resend email
  adapter. Never real mail from tests or local dev.

## Runner allocation
ADR number for PG-203: ADR-083 (runner projects-8c; ADR-082 = PG-199, ADR-084 = PG-208).

## Runner requirements for the public booking endpoint (projects-8c, 2026-10-20)
Each one becomes a spec acceptance criterion with tests:
1. Rate-limit per IP and per slug, using the existing limiter.
2. Tenant scoping comes only from the slug, which resolves to one tenant. Never trust a tenantId or hostId
   from the body.
3. No enumeration: an unknown or disabled slug returns the same 404 shape.
4. Validate email and name with zod and cap their lengths. Email bodies contain no HTML from user input;
   escape everything.
5. Re-check the slot server-side inside a transaction so a double booking cannot race; add a DB
   constraint if feasible.
6. Email spam cap: at most one confirmation per email+slot, and a cap per email per day.
7. Lead find-or-create must not reveal whether the email already exists.
The adversarial review gets a security lens for this endpoint. Tests stub Resend and never send real
email. If maxIter gets tight, tell the runner before cutting scope.

## Q7 - public booking URL (AskUserQuestion, after security exploration)
Context: Tenant.slug is auto-built as `${orgName}-${supabaseUser.id}` (apps/api/src/context.ts:489), so
publishing it leaks the admin's auth user UUID.
Answer: **new firm booking handle** - a nullable, admin-chosen, unique `bookingHandle` on Tenant
(e.g. /book/smith-law/consultation). Set on the Event Types page; public booking is off until it is set.

## Q8 - lead source and AI scoring for booking leads
Owner's words (verbatim): "Ai default false is a red flag that someone done wrongly as it is one of the
most important things of the ai crm and we show it on our landing page. The source the user could choose
from their website or new booking source".
Effective ruling:
- The row's DoD item "AI defaults FALSE" is REJECTED by the owner. Booking leads get AI scoring exactly
  like any other lead (scoring queued on create). Any AI toggle PG-203 adds defaults to TRUE and is wired.
- Lead source for booking leads is chosen by the admin per event type: WEBSITE or a new BOOKING value
  (LeadSource enum gains BOOKING, additive enum migration).
- Follow-up: the "AI defaults FALSE" rule in docs/planning/module-settings-playbook.md is itself the red
  flag; track it as an issue (out of PG-203's scope to rewrite the playbook for other modules).

## Q9-Q12 - after Round 3 CHALLENGE (AskUserQuestion, 2026-10-21)
- Q9 AI scoring switch: **always score, no switch.** Every lead a booking creates is AI-scored like any other
  lead. There is no per-event-type AI toggle (the `aiScoringEnabled` column is dropped from the design).
- Q10 Firm with no saved availability: **no public booking until hours are set.** The booking link stays off
  (identical not-available state). The Event Types page says so.
- Q11 Booking email matches an existing lead/contact: **don't auto-link; flag it to the host.** Link only leads
  the booking itself created (or earlier booking-created leads). For other matches the host email says the address
  matches an existing record, and the host links it in-app. This supersedes the "link it" part of Q4.
- Q12 Privacy notice: **the firm's URL is optional, with Aurora's /privacy as the fallback.** Store the consent
  time and the notice version on the booking.

## Q13 - broken DSAR workflow (AskUserQuestion, during exec, 2026-10-21 local)
Finding: apps/api/src/workflow/dsar-workflow.ts calls Prisma accessors that do not exist (db.leads, db.consents,
db.data_subject_requests, db.legal_holds, db.audit_logs ...), so every DSAR request fails at runtime.
Options: track it and leave the fix to a follow-up / fix DSAR in PG-203.
Answer: **Fix DSAR in PG-203.** The workflow is rewritten to the real Prisma models, and the booker fields
(appointments.bookerName/bookerEmail/bookingAnswers) are covered by its export and erasure.

## Q14 - DSAR scope after scoping (AskUserQuestion, during exec)
Scoping found DSAR broken end to end:
- the DSAR tables and anonymize_record were never applied anywhere (absent from the prod schema snapshot and
  from every Prisma migration);
- the subject is keyed on a placeholder UUID;
- a public GET can trigger an erasure;
- there are no /dsar web pages and no SLA job.
Options: backend fix in PG-203 / full end to end in PG-203 / own task.
Answer: **Full end to end in PG-203.** This covers the backend fix (Prisma models + Class A migration, a workflow
keyed on tenant + email, anonymise-in-place erasure, verify as a mutation, integration tests), the public /dsar
request and verify pages, and the SLA alert job. The runner asks that DSAR be a separate commit with its own
tests, and that it is told before any scope is cut.

## Q15 — per-event-type booking cap (2026-10-21, AskUserQuestion in the PG-203 lane)

Question: the 30/hour per-event-type cap counted every attempt, failed ones included, so 3 IPs of junk could block real bookers for the hour (codex fp 2d974acf). How should it count?

Answer: **Count real bookings (Recommended)**: the 30/hour cap counts only bookings that actually landed; the email (3/day) and IP (10/hour) caps still count every attempt.
