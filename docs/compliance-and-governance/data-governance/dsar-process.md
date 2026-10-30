# Data Subject Request (DSAR) Process - PG-203

**Version**: 2.0 **Effective Date**: 2026-10-24 **Deadline**: one calendar month
from confirmation (one extension of 1 or 2 months) **Owner**: the firm's
administrators (the controller), with Aurora's help as processor

---

## Overview

This document describes how a person asks a firm to act on their personal data
(UK GDPR Articles 15 to 21), and how the firm answers inside Aurora.

It replaces version 1.0 (IFC-140). That version described a workflow that was
never wired up. The old `dsar-workflow.ts`, its router and its mocks were
removed in PG-203 (a search of the tree finds no file by that name). See the
correction in `docs/architecture/adr/ADR-007-data-governance.md`.

Sources of truth:

- Spec: `.specify/sprints/sprint-18/specifications/PG-203-spec.md` (Addendum A)
- Owner rulings Q16 to Q22:
  `.specify/sprints/sprint-18/context/PG-203/PG-203-owner-ruling.md`
- Code: `packages/domain/src/legal/privacy/dsar.ts`,
  `packages/application/src/services/DataSubjectRequestService.ts`,
  `apps/api/src/modules/privacy/`

## Roles

| Role                        | Who                                                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Controller                  | The firm (the tenant) that uses the CRM. Every request is addressed to one firm.                           |
| Processor                   | Aurora, the CRM provider. It gives the firm the tools and assistance, under its data processing agreement. |
| Request handler             | A firm user with the ADMIN role. Managers and owners are not included.                                     |
| Data subject (the "person") | Identified by the firm and the exact normalised email address (trimmed, lower case, no `+tag` folding).    |

A user id is never the subject. A request about one firm never reaches another
firm's data.

## Supported Request Types

| Request Type      | UK GDPR Article | What happens                                                                                         |
| ----------------- | --------------- | ---------------------------------------------------------------------------------------------------- |
| **Access**        | Article 15      | Export link emailed after confirmation. The firm then finishes the request (see Access below).       |
| **Portability**   | Article 20      | Same export as Access, in JSON.                                                                      |
| **Erasure**       | Article 17      | An admin reviews, then runs one erasure. See Erasure below.                                          |
| **Rectification** | Article 16      | An admin records the decision and corrects the record in the CRM by hand.                            |
| **Restriction**   | Article 18      | A restriction starts when the request is confirmed. It stays until an admin lifts it.                |
| **Objection**     | Article 21      | A restriction starts when an admin completes the request. A marketing objection needs a manual stop. |

---

## How a request comes in

### Public request page (owner Q16)

- Address: `/dsar/<booking handle>`. The firm is found by its booking handle.
  The page is linked from the booking page footer ("Your data rights") and from
  the booking confirmation email.
- The form asks for the request type, an email address, optional details, a
  consent tick and a hidden honeypot field. An objection also asks what it is
  about (marketing or other).
- The page replies "check your email". It gives the same reply whether or not
  the address matches any data, so it cannot be used to find out who is a
  client.
- An unknown handle, or a firm whose booking page is off, gets the same "page
  not available" answer.
- The firm's internal tenant slug is never shown (it contains the admin's
  account id).
- A firm with no booking handle cannot receive public requests. It logs them in
  the app (below).

### Logged by staff

- An admin chooses **Log a request** on `/settings/privacy-requests` for a
  person who asked in person, by phone or by post.
- The admin must record how identity was checked (in person with ID, a call back
  to a known client, a signed letter, or other) and a note of at least 20
  characters.
- The request starts as confirmed. The deadline runs from the date received.
  That date may be backdated by up to 30 days, with a reason.
- A person who is blocked by the abuse limits below can ask the firm, which logs
  the request this way.

### Abuse limits

- Per client address limits on every public step, the same limiters as public
  booking, applied before any database read.
- At most 3 requests per firm and email address per 24 hours.
- At most 10 per firm and client address per hour.
- At most 3 per email address per 24 hours across all firms (this one also
  ignores `+tag` variants).
- At most 50 public submissions per firm per 24 hours, whatever the address or
  IP (owner Q24); the 51st gets the same generic reply.
- Public requests that were never confirmed are deleted 7 days after their link
  expired, by the hourly deadline job under its advisory lock. Verified,
  completed and staff-logged requests are never purged. Expired unconfirmed
  requests no longer appear in the admin list.
- If the same type and email already has a request awaiting confirmation that is
  less than an hour old, no new email is sent. The reply is unchanged.
- A filled honeypot gets the normal reply and no database work.

## Identity verification

- **Public requests**: the person must click a link sent to the address they
  gave. Owning the address is the identity check.
- The link is single use and valid for 24 hours. After that the person must ask
  again.
- The token is 32 random bytes. Only a keyed hash of it is stored, compared in
  constant time. A wrong, used or expired link returns one generic error.
- The token is in the URL fragment (`#r=<id>.<token>`), which browsers do not
  send to a server. The page reads it, removes it from the address bar and sends
  it in a POST body. Tokens and email addresses are not logged.
- `/dsar/*` is served with `Referrer-Policy: no-referrer` and
  `Cache-Control: no-store`, and `robots.txt` disallows it.
- **Staff-logged requests**: the recorded identity check above.
- A staff-logged **erasure** also needs a second admin to approve it when the
  firm has more than one admin. A firm with one admin must wait 24 hours, and
  the erasure can be cancelled in that time. The person is emailed a notice when
  it is logged, and the 24 hours count from when that notice was accepted by the
  email provider.

## Deadline and extension

- The deadline is one calendar month (Article 12(3)). If the target month is
  shorter, it is that month's last day.
- The clock starts when the person confirms (public) or on the date received
  (staff-logged).
- The confirmation email states the due date.
- An admin may extend **once**, by 1 or 2 months, only while the request is open
  and before the original deadline, and must give a reason. The person is
  emailed the new date and the reason.
- The effective deadline is the extended date if there is one, otherwise the
  original.
- `/settings/privacy-requests` lists open requests with overdue ones first.

## Handling each type

### Access and portability (Articles 15 and 20)

1. After confirmation the person is emailed a download link. It works for 72
   hours and at most 5 downloads. A download that fails to build does not count.
   The file is built live from the CRM, scoped to the firm and the exact email
   address, with a fixed list of fields per category and at most 500 rows each.
   The link is a POST download, not a URL that carries data.
2. The file is JSON. It holds the processing information (controller and its
   privacy notice, purposes, categories, recipients, sources, rights, AI use,
   and the right to complain to the ICO) and the data: leads, lead scores, lead
   and contact insights, contacts, activities, bookings (including booker fields
   and consent time), email records, tickets, chats, feedback, AI insights, the
   person's deals (name, value, stage and dates; deals of their contacts), tasks
   linked to their leads, contacts or deals (title, status, priority and dates)
   and the person's own data request history. Their own survey comments are
   exported because they are the person's words.
3. **Free text is withheld and counted** (owner Q17, compliance review). The
   automatic file leaves out staff notes, activity titles and descriptions,
   ticket subjects, email and chat bodies, reply drafts and documents, because
   they may be legally privileged or name other people. Owner Q23 and Q26 add:
   - `DESCRIPTIONS`: the descriptions of deals and tasks.
   - `AI_TEXT`: text written by AI (insight titles and descriptions,
     recommendations, next best action, score reasoning). Scores, stages and
     other structured values still export.
   - `STAFF_TEXT`: staff-written tags, lead qualification text (budget,
     authority, need, timeline), booking answers, and the staff notes on the
     person's own requests (identity check, late-receipt reason, extension
     reason, resolution note, marketing stop). The person's own request text is
     exported.
   - `OTHER_RECORDS`: calendar events, notifications and experiment records.
     They are on the erasure checklist, so the file counts them rather than
     leaving them out silently.

   The file lists each withheld category with a count, says the firm is
   reviewing it, and never says that an exemption applies. Rows past the 500 cap
   are counted as well.

4. When nothing at all is withheld the request completes at once. Otherwise it
   stays open. The admin reviews what was withheld and finishes it with
   **Complete**, giving a note and, per category, a reason. The system recounts
   what is withheld at that moment and refuses to complete (the admin sees "give
   a count and a reason for everything the export withholds") unless every
   category that still has a count above zero is covered with a count above zero
   and a reason. The person is then emailed what was withheld and why.
5. An admin can revoke a link sent to the wrong address, and can export the same
   file for a staff-handled request.
6. A person with no data still gets an answer: an empty file with the processing
   information.

Not built: CSV export, and sending the file directly to another controller
(Article 20(2)). See Known gaps.

### Erasure (Article 17, owner Q19)

An admin opens the request and sees a preview of the counts. To run it they must
confirm that no legal hold or retention duty applies. The confirmation text
names the SRA, anti-money-laundering and legal-claims retention duties. There is
no legal hold register in the system, so this confirmation is the check.

Everything below runs in **one database transaction**, after the request row is
locked, so a double click or two admins cannot run it twice. If any step fails,
nothing changes.

**Erased automatically** (anonymised in place, scoped to the firm and email):

| Data                         | Result                                                                                                                                                                                  |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Leads                        | Email becomes `erased-<row id>@erased.invalid`. Names, company, phone, location, qualification fields, UTM and referrer fields, tags and embedding are cleared, and the score is reset. |
| Contacts                     | Same address rule. First and last name become `Erased`. Contact details, notes field, tags and embedding are cleared.                                                                   |
| Lead and contact notes       | Text replaced with a marker. Embedding and search vector cleared.                                                                                                                       |
| Lead and contact activities  | Title replaced, description and metadata cleared.                                                                                                                                       |
| Lead files                   | File name cleared. The storage location is kept so the stored object can be found and deleted by hand.                                                                                  |
| AI scores and insights       | Deleted: lead scores, lead and contact insights, and insights about the person's deals.                                                                                                 |
| Bookings made with the email | Booker name, email, answers and consent fields cleared. The slot stays in the firm's calendar.                                                                                          |

Database triggers then stop AI-derived rows being written for an erased lead or
contact, and stop an old edit from writing the erased address back.

**Counted checklist** (kept, shown to the admin as counts, to be cleaned up by
hand):

- email records
- tickets
- chat conversations
- feedback surveys
- notifications about the person or their deals
- auto-response drafts
- contact reply drafts
- calendar events linked to the contact
- experiment assignments
- deals of the person's contacts (exported with their descriptions withheld; not
  erased, because the firm may need them for its own records, and the admin
  decides)
- tasks linked to the person's leads, contacts or deals (same)
- stored lead files (the objects behind the cleared file rows)

**Kept on purpose**: audit log entries (legal obligation). The erasure audit row
holds counts and the admin id, never erased values.

**Backups**: erased data stays in encrypted backups until they expire. It is put
beyond use and is never restored selectively. A restore must replay the
erasures, which are listed from the firm's completed erasure requests.

Known limits are in Known gaps (#1009, #1010, #1015).

### Rectification (Article 16)

The admin records the decision and corrects the lead or contact in the CRM. The
system does not change the data for them.

### Restriction and objection (Articles 18 and 21, owner Q18, Q21, Q22)

A restriction is one record per firm and email address. It is created:

- for a **restriction request**: when the person confirms, or when staff log it;
- for an **objection**: when an admin completes the request.

It stays until an admin lifts it from the "Processing restrictions" list. The
person is emailed **before** the restriction is lifted (Article 18(3)). If that
email is not accepted, the restriction stays. Rejecting a restriction request
also lifts it, after the same notice.

If a lead or contact's email is changed, the restriction moves to the new
address in the same update. A later request for the same person is merged into
the one active record.

**What a restriction or an erasure stops.** The system checks the person before
sending their data to a model, and writes a result only after checking again
under the person's row lock:

- AI lead scoring (on create, on update, manual scoring, queued jobs and the
  scheduled dispatcher)
- contact embeddings and the duplicate-detection embedding
- auto-response drafts
- the agent draft-message tool
- AI insights and predictions, including deals (checked through their contact)
- contact enrichment, tag suggestions and reply drafts
- RAG retrieval of notes, leads, contacts, tickets and deals for AI prompts

The lead and contact pages show a banner "Processing restricted (data request)".
A marketing objection shows "Do not send marketing (data request)".

**Marketing objection (Article 21(3)).** It is absolute, but the system does not
stop marketing by itself. To complete it the admin must tick that marketing to
the person has been stopped and say how (at least 10 characters). The person's
email then says the firm has confirmed that marketing has stopped. Automated
outreach suppression is not built (see Known gaps).

## Completion and refusal

- **Complete**: the admin adds a note. The person is emailed a completion
  notice.
- **Refuse**: the admin gives a reason. The person is emailed the reason and
  their right to complain.
- A refusal after the deadline is still allowed, but it is marked as late, the
  email says so, and the record shows the clock was breached.
- Every completion and refusal email carries the ICO complaint right and the
  right to a judicial remedy: "If you are not satisfied, you can complain to the
  Information Commissioner's Office (ico.org.uk) and you can seek a judicial
  remedy."
- Emails use fixed text. They never repeat what the person who made the request
  typed. They do include the reasons an admin typed when completing or refusing
  a request (for example, why a category was withheld), with line breaks removed
  and the text escaped in the HTML part.

### Grounds for refusal

The firm may refuse where the law allows it, for example a request that is
manifestly unfounded or excessive, or data the firm must keep by law. The system
does not decide this. The admin chooses and records the reason.

## Deadline alerts (plan D8)

A background job on the API server emails the firm's admins:

- once a confirmed request is within **7 days** of its effective deadline, or
  past it;
- again every **3 days** while it is overdue, until it is completed or refused;
- again if an extension moves the deadline into a new 7-day window.

Alerts go to the firm's ADMIN users. If the firm has no admin, they go to its
earliest-created active user. If there is no one, the job logs an error with the
tenant id only. The email holds the type, deadline, request reference and the
page link. It holds no personal data.

The job runs hourly by default. `DSAR_SLA_INTERVAL_MS` changes the interval, and
`0` turns it off. It does not run in tests or on serverless hosts. Only one
server instance sends at a time. It is one of the api's background jobs: with
`API_BACKGROUND_JOBS=off` on the api, the combined worker runs it
(`COMBINED_BACKGROUND_JOBS=on`). If neither runs it, `/health/detailed` reports
`degraded` once it has not ticked for three intervals.

Admins also get an email, with no personal data, when a request is confirmed.

## Admin queue

`/settings/privacy-requests` is for ADMIN users only. It shows open requests
(overdue first), closed requests and the active restrictions. Actions: log a
request, extend, complete, refuse, cancel an erasure, revoke an export link,
export for a staff-handled request, and lift a restriction.

Every change is tenant scoped and audit logged. The audit rows hold the request
id and the action, never the person's data. A staff export and a completed
erasure are audited before the result is returned; the write is retried once
and, if it still fails, logged by request id, firm and error class. Each
successful public export download writes a system-actor `EXPORT` row for the
request and firm, with no address, token or IP.

## Record keeping

- Each request is a row in `dsar_requests`: type, status, source, deadline,
  extension and reason, who resolved it, the resolution note, whether the
  deadline was breached, and the identity check for staff-logged requests.
  Restrictions are in `processing_restrictions`. Both tables are protected by
  row level security per firm.
- Requests are kept as the firm's record of how it answered. A firm that needs
  to set a retention period for them does so in its own policy. This document
  does not set one.
- The export includes the person's own request history.
- Short-lived booking abuse records hold only salted hashes and expire after 48
  hours (best effort, when the firm takes bookings). They are not exported.

## Training and review

Firm staff who handle requests should know this process. The system does not
track training. The previous training record was fabricated and was removed (see
`gdpr-compliance.md`).

## Known gaps

| Gap                                                                                                                                                                                                     | Issue or status     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| A rejected restriction can survive on an address changed during the rejection (fails safe: stays restricted).                                                                                           | #1007               |
| The erasure cleanup checklist is not stored. After the dialog closes, the admin loses the real counts.                                                                                                  | #1009               |
| AI-created tasks keep insight text about an erased person (tasks made before the erasure).                                                                                                              | #1010               |
| A failed rejection, completion or extension email is not retried and the admin is not told.                                                                                                             | #1014               |
| Conversations and messages carry no person key, so RAG, export and erasure cannot reach them.                                                                                                           | #1015               |
| An access request completed at verification can later withhold data added before the download, with the wrong note.                                                                                     | #1020               |
| AI search can return too few results when many matches are restricted (filtered after the row limit; fail-safe).                                                                                        | #1021               |
| Email suppressions and bounce receipts are not in the export or the erasure checklist.                                                                                                                  | #956                |
| Outreach and marketing suppression is manual. The system only records a restriction that blocks marketing.                                                                                              | IFC-315 (Sprint 19) |
| Erasure of communications (emails, tickets, chats, feedback, notifications, drafts) and stored files is manual.                                                                                         | IFC-316 (Sprint 19) |
| No CSV export and no direct transfer to another controller (Article 20(2)).                                                                                                                             | IFC-317 (Sprint 19) |
| No Article 19 notice to recipients of erased, corrected or restricted data.                                                                                                                             | IFC-318 (Sprint 19) |
| The firm's retention period and transfer safeguards are not stated by Aurora. The export links to the firm's privacy notice, or says the firm has not published one and the person may ask it directly. | By design           |

---

## Related Documentation

- [Retention Policy](./retention-policy.md)
- [GDPR Compliance Assessment](../compliance/gdpr-compliance.md)
- [GDPR Compliance Checklist](../compliance/gdpr-compliance-checklist.csv)
- [ADR-007 Data Governance](../../architecture/adr/ADR-007-data-governance.md)
- Migration:
  `packages/db/prisma/migrations/20261022120000_dsar_requests/migration.sql`

## Tests

- Domain rules: `packages/domain/src/legal/privacy/__tests__/dsar.test.ts`
- Service:
  `packages/application/src/services/__tests__/DataSubjectRequestService.test.ts`
- Adapters:
  `packages/adapters/src/repositories/__tests__/PrismaDsarAdapters.test.ts`
- API routers, email, token and deadline job:
  `apps/api/src/modules/privacy/__tests__/`
- Real database (RLS, caps, erasure, locks, deadline job):
  `tests/integration/dsar.test.ts`
- AI worker guards:
  `apps/ai-worker/src/lib/__tests__/data-request-guard.test.ts`
- Web pages: tests beside the pages under `apps/web/src/app/(public)/dsar/` and
  `apps/web/src/app/settings/privacy-requests/`
