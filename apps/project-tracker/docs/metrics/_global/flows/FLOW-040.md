# FLOW-040: DSAR Data Subject Requests and Erasure (UK GDPR Articles 15-21)

## Overview

| Property          | Value                                              |
| ----------------- | -------------------------------------------------- |
| **Flow ID**       | FLOW-040                                           |
| **Name**          | DSAR Data Subject Requests / Right to be Forgotten |
| **Category**      | Seguranca e Compliance                             |
| **Priority**      | Critical                                           |
| **Sprint**        | 11-12, 18                                          |
| **Related Tasks** | IFC-140, IFC-155, PG-203                           |

## Description

Handles data subject requests (DSAR) to a firm (the controller) about one
person, identified by the normalised email within that firm. The types are
access, rectification, erasure, restriction, portability and objection (UK GDPR
Articles 15 to 18, 20 and 21).

A person asks on the firm's public page, `/dsar/<bookingHandle>`, or staff log
the request for them. Access and portability are exported after email
verification. The other types wait for a firm ADMIN. Erasure anonymises the CRM
core in one transaction and lists the communications that need manual cleanup.
Restriction and erasure stop every AI path that sends the person's data to a
model.

The earlier version of this flow described a `DSARWorkflow` with a legal hold
check against a `legal_holds` table. That workflow and table never worked or
existed (see the PG-203 addendum in ADR-007). They are removed.

---

## Actors

- **Data Subject**: Asks the firm to act on their personal data
- **Firm ADMIN**: Decides erasure, rectification, restriction and objection on
  `/settings/privacy-requests`, logs staff requests and reviews what is withheld
- **System**: Sends the emails, builds the export, runs the erasure transaction
  and the SLA job
- **Audit Logger**: Records each admin action (ids, types and counts only)

---

## Pre-conditions

- The firm has a booking handle (public requests), or an ADMIN logs the request
- Public requests: the person controls the email address (the verification link)
- Staff-logged requests: the ADMIN records how identity was checked
  (`IN_PERSON_ID`, `KNOWN_CLIENT_CALLBACK`, `SIGNED_LETTER` or `OTHER`) and a
  note of at least 20 characters
- Erasure: the ADMIN confirms that no legal hold or retention duty applies (no
  legal-hold registry exists)
- `BOOKING_IP_SALT` is set in production (token and cap hashes fail closed
  without it)
- The migration `20261022120000_dsar_requests` is applied

---

## User Journey

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                  DSAR FLOW (UK GDPR Articles 15-21)                          │
└─────────────────────────────────────────────────────────────────────────────┘

[Data Subject] opens /dsar/<handle> (linked from the booking page footer and
         │      the booking confirmation email)           [Staff: logRequest]
         ▼                                                        │
┌─────────────────┐                                               │
│  Request form   │ (apps/web/src/app/(public)/dsar/[handle])      │
│                 │ - Type, email, details, consent, honeypot      │
└────────┬────────┘                                               │
         │ tRPC mutation privacy.submit                           │
         ▼                                                        │
┌─────────────────┐                                               │
│ privacy-public  │ - Per-IP limiter, then caps under advisory     │
│ .router         │   locks, same reply for any email              │
│                 │ - PENDING_VERIFICATION + hashed token          │
└────────┬────────┘ - Verification email (fragment link, 24h)      │
         │                                                        │
         ▼ person opens /dsar/<handle>/verify#r=<id>.<token>      │
┌─────────────────┐                                               │
│ privacy.verify  │ - Token read from fragment, sent in POST body  │
│                 │ - VERIFIED, deadline = +1 calendar month       │
└────────┬────────┘ - Emails person (due date) and firm admins     │
         │                                                        │
         ├── ACCESS / PORTABILITY ──────┐                           │
         │                              ▼                           │
         │                 ┌─────────────────────┐                  │
         │                 │ Export link emailed │ (72h, 5 downloads)│
         │                 │ privacy.downloadExport                 │
         │                 │ COMPLETED if nothing withheld          │
         │                 │ else VERIFIED until completeAccess     │
         │                 └─────────────────────┘                  │
         │                                                        │
         ├── RESTRICTION: restriction active from VERIFIED          │
         ▼◄─────────────────────────────────────────────────────────┘
┌──────────────────────────┐
│ /settings/privacy-       │ - privacy.admin.* (ADMIN only)
│ requests                 │ - list, extend, complete, reject,
│                          │   cancelErasure, liftRestriction, ...
└────────┬─────────────────┘
         │
         ├────────────── ERASURE ──────────────────────┐
         ▼                                             ▼
┌─────────────────┐                          ┌──────────────────┐
│ complete        │ (RESTRICTION, OBJECTION,  │ complete (erase) │
│ (other types)   │  RECTIFICATION)           │ one transaction  │
│ - Note          │ - Restriction row written │ - Request row    │
│ - Restriction / │   with the completion     │   FOR UPDATE     │
│   marketing tick│                           │ - Anonymise CRM  │
└────────┬────────┘                          │ - Checklist      │
         │                                    └────────┬─────────┘
         └──────────────────┬─────────────────────────┘
                            ▼
                  ┌─────────────────┐
                  │  Audit Log      │ - Action, request id, counts
                  │                 │ - Never erased values
                  └────────┬────────┘
                           ▼
                  ┌─────────────────┐
                  │  Completion     │ - Fixed-text email to the person
                  │  email          │ - ICO complaint right
                  └─────────────────┘

[SLA job] every hour, one replica: emails the firm's ADMINs for VERIFIED
requests within 7 days of the deadline, or overdue (repeat every 3 days)
```

---

## Flow Steps

### Step 1: Request Submission

**Trigger**: The data subject submits the public form, or an ADMIN logs a
request (`privacy.admin.logRequest`).

**Public input** (`privacy.submit`):

```typescript
interface DsarSubmit {
  handle: string; // the firm's booking handle
  type:
    | 'ACCESS'
    | 'ERASURE'
    | 'RECTIFICATION'
    | 'PORTABILITY'
    | 'RESTRICTION'
    | 'OBJECTION';
  email: string;
  details?: string; // up to 2000 characters
  objectionScope?: 'MARKETING' | 'OTHER'; // required for OBJECTION
  consent: true;
  __honeypot: string; // must be empty
}
```

**Validation and abuse controls**:

- A filled honeypot gets the normal reply with no database work
- Per-IP limiter runs before any read (the public booking limiters)
- Unknown handle and a firm with no handle return the same NOT_FOUND
- Caps under advisory locks: 3 per firm and email per day, 10 per IP hash per
  hour, and 3 per email across all firms per day (`+tag` stripped for this cap)
- Resend cooldown: the same firm, type and email with a pending request under an
  hour old sends no new email
- The reply is the same whether or not the email matches CRM data

---

### Step 2: Identity Verification

| Source        | Process                                                         |
| ------------- | --------------------------------------------------------------- |
| `PUBLIC_FORM` | Emailed link, single use, 24 hour expiry, token in URL fragment |
| `STAFF`       | The ADMIN records the identity method and note; starts VERIFIED |

**Token handling**: 32 random bytes, stored only as an HMAC under a key derived
from `BOOKING_IP_SALT`, compared with `timingSafeEqual`. An unknown id compares
against a dummy hash, and every failure returns one generic error. The page
reads the fragment once, strips it with `history.replaceState` and sends it in a
POST body. `/dsar/*` is served with `Referrer-Policy: no-referrer` and
`Cache-Control: no-store`.

**Output**: `VERIFIED` request with `verifiedAt` and
`slaDeadline = verifiedAt + 1 calendar month` (staff-logged: from `receivedOn`,
backdated up to 30 days with a reason). The person is emailed the due date and
the firm's admins are told a request arrived (no personal data). A `RESTRICTION`
creates its processing restriction in the same write.

---

### Step 3: Access and Portability

**Location**: `DataSubjectRequestService.issueExport` and `downloadExport`

- The export is computed live, scoped to the firm and the exact email, with a
  field allowlist per category and a cap of 500 rows each
- It contains the lead and contact profiles, their activity types and dates,
  appointments booked with the email (including consent time and version),
  communications metadata, the person's own request history, and the processing
  information (controller, purposes, recipients, rights, ICO complaint right, AI
  scoring)
- It withholds free-text notes, activity text, ticket subjects, message bodies,
  documents and rows beyond the cap, and lists them with counts
- The emailed link expires after 72 hours and allows 5 downloads. An ADMIN can
  revoke it (`revokeExport`)
- With nothing withheld, the request completes when the email is accepted.
  Otherwise it stays VERIFIED and the ADMIN finishes it with `completeAccess`,
  which tells the person what was withheld and why
- Staff can run the same export for a staff-handled request (`exportData`)

---

### Step 4: Admin Decision

**Location**: `/settings/privacy-requests`, all `privacy.admin.*` procedures
(`adminTenantProcedure`: ADMIN only, every query scoped to the tenant)

| Type          | Completion                                                                               |
| ------------- | ---------------------------------------------------------------------------------------- |
| ERASURE       | `complete` with `noHoldConfirmed`: runs Step 5                                           |
| RECTIFICATION | `complete` with a note; the ADMIN edits the record in the CRM                            |
| RESTRICTION   | Active from VERIFIED; `complete` records the note                                        |
| OBJECTION     | `complete` writes the restriction; MARKETING also needs the admin's tick and stop method |
| ACCESS/PORT.  | `completeAccess` (Step 3)                                                                |

An ADMIN can also `extend` (1 or 2 months, once, before the deadline; the person
is emailed), `reject` (the person is emailed the reason, the ICO complaint right
and the judicial remedy; after the deadline it is allowed but flagged as a
breached clock), and `liftRestriction` (the person is emailed first).

---

### Step 5: Erasure (Q19: CRM core automatic, communications as a checklist)

**Location**: `PrismaSubjectDataRepository.erase`

One transaction, scoped to the firm and the exact email. It re-reads the request
`FOR UPDATE` and runs only while it is VERIFIED, so a double click or a second
ADMIN gets a conflict.

| Entity                        | Method                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| Lead                          | Email becomes `erased-<row id>@erased.invalid`; profile, tracking, tags and embedding cleared |
| Contact                       | Same email rule; names become `Erased`; profile, tags and embedding cleared                   |
| Lead and contact notes        | Content replaced; embedding and search vector cleared                                         |
| Lead and contact activities   | Title replaced; description and metadata cleared                                              |
| Lead file rows                | Name replaced; storage locator kept for manual deletion                                       |
| Appointments booked with them | Booker name, email, answers and consent cleared; the slot stays                               |
| AI scores and insights        | Deleted (derived data)                                                                        |

**Communications checklist (counts, manual cleanup)**: email records, tickets,
chats, feedback surveys, notifications, auto-response and reply drafts, calendar
events, experiment assignments and stored lead files.

**Staff-logged erasure**: the person is emailed a notice first, and the run
needs a second ADMIN. A firm with one ADMIN waits 24 hours from the accepted
notice, and the ADMIN can cancel (`cancelErasure`).

**Database guards** (migration triggers): no AI-derived row is written again for
an erased person, an erased address cannot be changed back, and a restriction
follows a record whose email changes.

---

### Step 6: Audit Logging

**Location**: `privacy-admin.router.ts` (`audit`), through `getAuditLogger`

```typescript
interface DsarAuditEntry {
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'EXPORT';
  entityType: 'dsar_request';
  entityId: string; // the request id
  tenantId: string;
  actorId: string; // the ADMIN
  metadata: Record<string, unknown>; // change, counts, checklist; never values
}
```

The erasure entry (`DELETE`, `change: 'ERASED'`) holds counts and the checklist
and is awaited, so an erasure without its audit row fails visibly. Audit logs
themselves are kept.

---

### Step 7: Confirmation

**Outputs**:

1. **Email to the data subject**: fixed-text completion or rejection notice,
   with the ICO complaint right. It carries no visitor-typed text
2. **Page outcome**: the verify page shows the type and due date
3. **Admin queue**: overdue first, then nearest deadline

---

### Step 8: SLA Alerts

**Location**: `apps/api/src/modules/privacy/dsar-sla-scheduler.ts`

- Started from `startApiServer`; disabled under test, on serverless runtimes and
  when `DSAR_SLA_INTERVAL_MS=0`. The default interval is one hour
- Each tick takes `pg_try_advisory_xact_lock`, so one replica runs it
- It claims VERIFIED requests within 7 days of the effective deadline
  (`extendedUntil ?? slaDeadline`) or past it, with `FOR UPDATE SKIP LOCKED`
- It emails the firm's ADMINs (falling back to the owner), with the type,
  deadline, request id and page link and no personal data. Overdue requests
  alert again every 3 days

---

## Restriction Enforcement (owner Q18, Q21, Q22)

An active restriction, or an erased address, stops lead scoring, contact
embedding, auto-response and reply drafts, insights, predictions, enrichment,
tag suggestions and RAG retrieval for that person. Each path checks before the
model call and writes only under the lead or contact row lock and the address
lock (`dsar_subject_lock`), after a re-check. The lead and contact detail pages
show a "Processing restricted" banner. Outreach and marketing suppression is not
automated (follow-up task).

---

## Edge Cases

| Scenario                               | Handling                                                              |
| -------------------------------------- | --------------------------------------------------------------------- |
| Unknown handle, or firm has no handle  | Same NOT_FOUND as public booking; no enumeration                      |
| Email not in CRM                       | Same reply; the export completes with empty data                      |
| Filled honeypot                        | Fake success, no database calls                                       |
| Cap hit                                | TOO_MANY_REQUESTS; no email sent                                      |
| Repeat submit within an hour           | Same reply; no new email                                              |
| Expired, used or wrong link            | One generic "invalid or expired" error                                |
| Export link used 5 times               | Refused; the person contacts the firm                                 |
| Link sent to the wrong address         | ADMIN revokes the export link                                         |
| Double click or two admins on erasure  | Second gets a conflict; the erasure runs once                         |
| Staff erasure, notice email fails      | Refused until the person has been warned                              |
| Restriction lift, notice email fails   | Refused; the restriction stays                                        |
| Rejected RESTRICTION, notice fails     | Restriction kept; the ADMIN lifts it later                            |
| Record edited after erasure            | Database refuses to change the erased address back                    |
| AI job queued before erasure           | Re-checked before the model; result not written (guard + trigger)     |
| Address changed on a restricted record | Restriction is copied to the new address                              |
| Request past its deadline              | Alerts repeat every 3 days; completion is flagged as a breached clock |

---

## Technical Artifacts

### Domain, Validators and Application (IMPLEMENTED)

| Artifact          | Path                                                                                                                                                      | Status   |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| DSAR domain rules | `packages/domain/src/legal/privacy/dsar.ts`                                                                                                               | COMPLETE |
| DSAR validators   | `packages/validators/src/dsar.ts`                                                                                                                         | COMPLETE |
| Request service   | `packages/application/src/services/DataSubjectRequestService.ts`                                                                                          | COMPLETE |
| Ports             | `packages/application/src/ports/repositories/{DsarRepositoryPort,SubjectDataPort,ProcessingRestrictionPort}.ts`, `ports/external/DsarNotificationPort.ts` | COMPLETE |

### Database and Adapters (IMPLEMENTED)

| Artifact            | Path                                                                          | Status                                |
| ------------------- | ----------------------------------------------------------------------------- | ------------------------------------- |
| Migration (Class A) | `packages/db/prisma/migrations/20261022120000_dsar_requests/migration.sql`    | COMPLETE (apply before the API ships) |
| Request repository  | `packages/adapters/src/repositories/PrismaDsarRepository.ts`                  | COMPLETE                              |
| Subject data        | `packages/adapters/src/repositories/PrismaSubjectDataRepository.ts`           | COMPLETE                              |
| Restrictions        | `packages/adapters/src/repositories/PrismaProcessingRestrictionRepository.ts` | COMPLETE                              |

### API Layer (IMPLEMENTED)

| Artifact       | Path                                                          | Status   |
| -------------- | ------------------------------------------------------------- | -------- |
| Public router  | `apps/api/src/modules/privacy/privacy-public.router.ts`       | COMPLETE |
| Admin router   | `apps/api/src/modules/privacy/privacy-admin.router.ts`        | COMPLETE |
| Router merge   | `apps/api/src/modules/privacy/privacy.router.ts`              | COMPLETE |
| Emails, tokens | `apps/api/src/modules/privacy/dsar-email.ts`, `dsar-token.ts` | COMPLETE |
| SLA scheduler  | `apps/api/src/modules/privacy/dsar-sla-scheduler.ts`          | COMPLETE |

### AI Worker Guards (IMPLEMENTED)

| Artifact                                                                  | Path                                                     | Status   |
| ------------------------------------------------------------------------- | -------------------------------------------------------- | -------- |
| Data request guard                                                        | `apps/ai-worker/src/lib/data-request-guard.ts`           | COMPLETE |
| Embedding purge (IFC-155, case documents; not called by the DSAR erasure) | `apps/ai-worker/src/services/embedding-purge.service.ts` | COMPLETE |

### Frontend (IMPLEMENTED)

| Artifact           | Path                                                      | Status   |
| ------------------ | --------------------------------------------------------- | -------- |
| Request form       | `apps/web/src/app/(public)/dsar/[handle]/page.tsx`        | COMPLETE |
| Verify page        | `apps/web/src/app/(public)/dsar/[handle]/verify/page.tsx` | COMPLETE |
| Export page        | `apps/web/src/app/(public)/dsar/[handle]/export/page.tsx` | COMPLETE |
| Admin page         | `apps/web/src/app/settings/privacy-requests/page.tsx`     | COMPLETE |
| Restriction banner | `apps/web/src/components/privacy/RestrictionBanner.tsx`   | COMPLETE |

### Removed

| Artifact                                               | Reason                                    |
| ------------------------------------------------------ | ----------------------------------------- |
| `apps/api/src/workflow/dsar-workflow.ts` and its tests | Called Prisma accessors that do not exist |
| `apps/api/src/modules/privacy/dsar.router.ts`          | Replaced by the public and admin routers  |

---

## Compliance Requirements

| Regulation         | Requirement                 | Implementation                                                         |
| ------------------ | --------------------------- | ---------------------------------------------------------------------- |
| UK GDPR Art. 12    | Respond within one month    | `slaDeadline` (calendar month), extension to 2 more months, SLA alerts |
| UK GDPR Art. 15    | Access                      | Live export with processing information, withheld categories listed    |
| UK GDPR Art. 16    | Rectification               | Recorded; the ADMIN edits the record                                   |
| UK GDPR Art. 17    | Right to erasure            | Anonymise in place; communications as a manual checklist               |
| UK GDPR Art. 17(3) | Hold or retention exception | No legal-hold registry; the ADMIN confirms none applies                |
| UK GDPR Art. 18    | Restriction                 | `processing_restrictions`, enforced on every AI path                   |
| UK GDPR Art. 20    | Portability                 | JSON export                                                            |
| UK GDPR Art. 21    | Objection                   | Restriction row; marketing stop is manual and confirmed                |
| UK GDPR Art. 30    | Records of processing       | `dsar_requests` and audit log entries                                  |

Not implemented: Art. 19 notification to recipients, Art. 20(2) direct transfer
and a CSV export, and automated outreach suppression (follow-up tasks IFC-315 to
IFC-318).

---

## SLA Requirements

| Metric                   | Target                                                     |
| ------------------------ | ---------------------------------------------------------- |
| Verification link expiry | 24 hours                                                   |
| Export link expiry       | 72 hours, 5 downloads                                      |
| Response deadline        | One calendar month from verification                       |
| Extension                | 1 or 2 months, before the original deadline                |
| Admin alert              | From 7 days before the deadline; every 3 days when overdue |

---

## Success Metrics

| KPI                      | Target                             |
| ------------------------ | ---------------------------------- |
| DSAR completion rate     | 100% within the effective deadline |
| Audit trail completeness | 100% of admin actions logged       |
| Erased people re-written | 0 (database guards)                |

---

## Related Flows

- **FLOW-039**: Document Search (search indexes purged)
- **FLOW-028**: Audit Logging (admin actions logged)
- **FLOW-029**: Encryption Key Management (key rotation after purge)

---

## Open Issues

| Issue | Summary                                                                       |
| ----- | ----------------------------------------------------------------------------- |
| #1007 | A rejected restriction can survive on an address changed during the rejection |
| #1009 | Keep the erasure cleanup checklist on completed requests                      |
| #1010 | AI-created tasks keep insight text about an erased person                     |
| #1014 | A failed rejection or completion email is not retried or shown to the admin   |
| #1015 | Conversations and messages carry no person key (RAG, export, erasure)         |

---

## Implementation Tasks

| Task                | Sprint | Status                                         |
| ------------------- | ------ | ---------------------------------------------- |
| IFC-140             | 11     | IN PROGRESS                                    |
| IFC-155 (purge)     | 12     | COMPLETED                                      |
| PG-203 (DSAR, PR 2) | 18     | IN PROGRESS (migration applied before the API) |

---

_Flow documented: 2026-01-31_ _Last updated: 2026-10-24_
