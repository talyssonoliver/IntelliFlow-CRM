# GDPR Compliance Assessment

**Task:** ENV-016-AI - GDPR and Data Privacy Compliance **Generated:**
2025-12-23 **Last Reviewed:** 2026-10-24 (data subject rights) **Status:**
Completed **Regulation:** EU General Data Protection Regulation (GDPR) 2016/679

## Executive Summary

This document assesses IntelliFlow CRM's compliance with GDPR requirements. As a
CRM system processing personal data of EU and UK residents, GDPR compliance is
mandatory. The checklist
(`docs/compliance-and-governance/compliance/gdpr-compliance-checklist.csv`)
tracks 35 controls. The data subject rights controls (GDPR-005 to GDPR-010,
GDPR-021, GDPR-023 and GDPR-031) were re-assessed on 2026-10-24 after PG-203
built the data subject request process. Some are now **Partial**: the code
exists and is tested, but the gaps listed in
`docs/compliance-and-governance/data-governance/dsar-process.md` remain. The
other rows have not been re-verified since 2025-12-29. Remaining work also
covers UI settings pages (Sprint 28).

## Controller and Processor

This statement covers the personal data a firm puts into the CRM about its own
clients, leads and contacts (Spec PG-203, Addendum A, "Roles and identity").

- **The firm is the controller.** Each firm that uses the CRM (a tenant) decides
  why and how its clients' data is processed. It answers its clients' requests,
  and the legal duties in Articles 12 to 22 are the firm's.
- **Aurora, the CRM provider, is the processor.** It processes that data on the
  firm's instructions and gives the firm assistance under its data processing
  agreement. The tools for that assistance are the data request pages and the
  admin queue described below.
- **Sub-processors** named to data subjects in the export are hosting and
  database, the email provider, and the AI provider used for lead scoring.
- **One request, one firm.** Every data subject request is addressed to a single
  firm and reaches only that firm's data. The person is identified by the firm
  and their exact normalised email address.
- **Retention and transfers are the firm's.** Aurora does not state a retention
  period for a firm. The export points to the firm's own privacy notice.
- This document does not set out Aurora's own role for the account data of the
  firm's users. That is outside what PG-203 decided and is not claimed here.

## Scope

### Data Categories Processed

| Category         | Examples                     | Lawful Basis                   |
| ---------------- | ---------------------------- | ------------------------------ |
| Contact Data     | Name, email, phone           | Legitimate interest / Contract |
| Company Data     | Company name, industry, size | Legitimate interest            |
| Interaction Data | Meeting notes, emails        | Contract performance           |
| AI Scoring Data  | Lead scores, predictions     | Legitimate interest            |

### Data Subjects

- Business contacts (leads, prospects)
- Customer contacts
- Partner contacts
- Internal users (employees)

## GDPR Article Compliance

### Chapter II - Principles (Articles 5-11)

| Article      | Requirement                        | Implementation                                                                                                              | Status      |
| ------------ | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Art. 5(1)(a) | Lawfulness, fairness, transparency | Privacy policy published (`docs/legal/privacy-policy.md`); consent via `consents` table; cookie consent component (IFC-143) | Implemented |
| Art. 5(1)(b) | Purpose limitation                 | Purpose tracked in `gdpr_metadata` table                                                                                    | Implemented |
| Art. 5(1)(c) | Data minimization                  | `data_minimized` flag; `anonymize_record()` function                                                                        | Implemented |
| Art. 5(1)(d) | Accuracy                           | User can update records; Zod validation                                                                                     | Implemented |
| Art. 5(1)(e) | Storage limitation                 | Automated retention via `schedule_deletion_by_retention()` (PUBLIC 7yr, INTERNAL 3yr, CONFIDENTIAL 10yr)                    | Implemented |
| Art. 5(1)(f) | Integrity and confidentiality      | AES-256 at rest, TLS 1.3 in transit, RLS + RBAC                                                                             | Implemented |
| Art. 6       | Lawful basis                       | Lawful basis tracked in `gdpr_metadata` (consent, contract, legitimate_interests, etc.)                                     | Implemented |
| Art. 7       | Consent conditions                 | `consents` table with audit trail, IP + user agent captured; cookie consent banner (EXP-ARTIFACTS-002)                      | Implemented |

### Chapter III - Rights of Data Subject (Articles 12-23)

Rights are exercised through the data subject request process built in PG-203
(`docs/compliance-and-governance/data-governance/dsar-process.md`). The old
IFC-140 workflow (`dsar-workflow.ts`) was never wired and has been removed.

| Article | Right                     | Implementation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Status               |
| ------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| Art. 12 | Time to respond           | Deadline of one calendar month from confirmation, one extension of 1 or 2 months with a reason emailed to the person, deadline alert job (`packages/domain/src/legal/privacy/dsar.ts`, `apps/api/src/modules/privacy/dsar-sla-scheduler.ts`)                                                                                                                                                                                                                                                                                                                 | Implemented          |
| Art. 15 | Right of access           | Emailed, expiring JSON export with the processing information, including deals and tasks. Free text (notes, bodies, documents, deal and task descriptions), AI-written text, staff tags and qualification text, booking answers, and calendar, notification and experiment records are withheld and counted until the firm reviews them (`PrismaSubjectDataRepository.buildExport`); completion is refused unless every withheld category has a count and a reason. The firm releases the withheld material by hand. Staff can also log and export a request | Partial              |
| Art. 16 | Right to rectification    | The firm records the decision and edits the record in the CRM; edits are audit logged. The system does not correct data itself                                                                                                                                                                                                                                                                                                                                                                                                                               | Implemented (manual) |
| Art. 17 | Right to erasure          | One transaction anonymises the CRM core in place (leads, contacts, notes, activities, AI scores and insights, booker fields). Emails, tickets, chats, feedback, notifications, drafts, stored files, calendar events, experiment records, deals and tasks are a counted checklist for the admin to clear by hand (#1009, #1010, #1015)                                                                                                                                                                                                                       | Partial              |
| Art. 18 | Right to restriction      | A per-firm restriction keyed on the email stops AI scoring, embeddings, drafts, insights, predictions and the other AI paths. An admin lifts it after telling the person. It does not stop outreach or marketing                                                                                                                                                                                                                                                                                                                                             | Partial              |
| Art. 20 | Data portability          | Same export as access, in JSON. No CSV, and no direct transfer to another controller (Art. 20(2))                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Partial              |
| Art. 21 | Right to object           | Objection requests create a restriction. For a marketing objection the admin must confirm marketing has stopped and say how; the system does not stop marketing automatically                                                                                                                                                                                                                                                                                                                                                                                | Partial              |
| Art. 22 | Automated decision-making | AI scores include confidence level + human override pattern. A score can set a new enquiry's status (qualified or unqualified) without a person first looking at it; the export says so and states that no decision with legal or similarly significant effect is made solely by automated means                                                                                                                                                                                                                                                             | Implemented          |

Not built: Article 19 notice to recipients, and automated outreach suppression.

### Chapter IV - Controller and Processor (Articles 24-43)

| Article    | Requirement            | Implementation                                                                                           | Status      |
| ---------- | ---------------------- | -------------------------------------------------------------------------------------------------------- | ----------- |
| Art. 25    | Privacy by design      | Hexagonal architecture, RLS                                                                              | Implemented |
| Art. 30    | Records of processing  | Processing activities documented                                                                         | Implemented |
| Art. 32    | Security of processing | See Security Controls below                                                                              | Implemented |
| Art. 33    | Breach notification    | Incident response plan with Sentry alerts (`docs/security/incident-response.md`)                         | Implemented |
| Art. 35    | DPIA                   | DPIA documented for AI scoring (`docs/security/dpia.md`), reviewed quarterly                             | Implemented |
| Art. 37-39 | DPO                    | DPO role implemented in RBAC (`packages/domain/src/shared/Permission.ts`) with access to all GDPR tables | Implemented |

## Technical Measures

### Data Protection by Design (Art. 25)

```
Architecture Principles:
├── Hexagonal architecture (domain isolation)
├── Row-Level Security (tenant isolation)
├── Type-safe APIs (prevent data leakage)
├── Audit logging (accountability)
└── Encryption (confidentiality)
```

### Security Measures (Art. 32)

| Measure          | Implementation                    | Evidence                     |
| ---------------- | --------------------------------- | ---------------------------- |
| Pseudonymization | User IDs instead of names in logs | `apps/api/src/tracing/`      |
| Encryption       | TLS 1.3, AES-256 at rest          | Supabase config              |
| Confidentiality  | RBAC, RLS policies                | `infra/supabase/migrations/` |
| Integrity        | Input validation, checksums       | Zod schemas                  |
| Availability     | Health checks, monitoring         | `infra/monitoring/`          |
| Resilience       | Error handling, retries           | tRPC middleware              |

### Data Subject Rights Implementation

All data subject rights are exercised through the data subject request process
built in PG-203. The firm (controller) answers; Aurora provides the tools.

- Public request pages at `/dsar/<booking handle>`
  (`apps/web/src/app/(public)/dsar/`), email verification with a single-use,
  hashed token carried in the URL fragment, and abuse limits.
- Admin queue at `/settings/privacy-requests` (ADMIN only,
  `apps/web/src/app/settings/privacy-requests/`).
- API: `apps/api/src/modules/privacy/` (public and admin routers, fixed-text
  emails, tokens, deadline alert job).
- Rules and workflow: `packages/domain/src/legal/privacy/dsar.ts`,
  `packages/application/src/services/DataSubjectRequestService.ts`.
- Storage: `dsar_requests` and `processing_restrictions` in migration
  `packages/db/prisma/migrations/20261022120000_dsar_requests/migration.sql`
  (row level security per firm).
- Tests: `packages/domain/src/legal/privacy/__tests__/dsar.test.ts`,
  `packages/application/src/services/__tests__/DataSubjectRequestService.test.ts`,
  `packages/adapters/src/repositories/__tests__/PrismaDsarAdapters.test.ts`,
  `apps/api/src/modules/privacy/__tests__/`, `tests/integration/dsar.test.ts`
  (real database),
  `apps/ai-worker/src/lib/__tests__/data-request-guard.test.ts`.

#### Right of Access (Art. 15)

```
Public request → emailed confirmation link (24 h, single use)
- Export link emailed after confirmation (72 h, at most 5 downloads)
- JSON: processing information + the person's data, capped at 500 rows per category
- Deals and tasks exported (descriptions withheld); notes, message bodies, documents,
  AI-written text, staff tags and qualification text, booking answers, and calendar,
  notification and experiment records withheld and counted until the firm reviews
  them; the firm then completes the request with a count and reason for each
- Deadline: one calendar month from confirmation
```

#### Right to Erasure (Art. 17)

```
Admin confirms no legal hold or retention duty applies (no hold register exists)
- One transaction, request row locked, runs once
- Anonymises leads, contacts, notes, activities, booker fields; deletes AI scores
  and insights; clears embeddings and search vectors
- Communications, stored files, calendar events, experiment records, deals and
  tasks: counted checklist, cleared by hand
- Audit log entries kept (legal obligation); erasure audit row holds counts only
- Staff-logged erasure: second admin, or a 24 h cancellable pause for a single admin
```

#### Right to Portability (Art. 20)

```
Same export as access, JSON only
- Includes leads, contacts, activities (metadata), bookings, communications metadata
- Not built: CSV, direct transfer to another controller (Art. 20(2))
```

#### Right to Restriction and Objection (Arts. 18 and 21)

```
processing_restrictions table (one active row per firm + email)
- Starts at confirmation (restriction) or completion (objection)
- Stops every AI path that sends the person's data to a model (owner Q18, Q21, Q22)
- Banner on the lead and contact pages
- Lifted only by an admin, after the person is told
- Marketing objection: admin must confirm marketing stopped; no automatic suppression
```

#### Consent Management (Art. 7)

```
consents table + cookie-consent component
- Consent recorded with IP + user agent
- Consent withdrawal tracked
- Cookie consent banner: packages/ui/src/components/cookie-consent/cookie-consent.tsx
- Implemented: IFC-143 (Sprint 11), EXP-ARTIFACTS-002 (Sprint 14)
```

## Data Processing Activities (Art. 30)

### Activity 1: Lead Management

| Field      | Value                              |
| ---------- | ---------------------------------- |
| Purpose    | Track and qualify sales leads      |
| Categories | Contact data, company data, scores |
| Recipients | Internal sales team                |
| Retention  | 3 years after last activity        |
| Security   | RLS, encryption, audit logs        |

### Activity 2: AI Lead Scoring

| Field              | Value                               |
| ------------------ | ----------------------------------- |
| Purpose            | Predict lead conversion probability |
| Categories         | Contact data, behavioral data       |
| Automated decision | Yes, with human override            |
| Recipients         | Sales team, AI system               |
| Retention          | Scores retained with lead data      |
| Security           | Model versioning, audit trail       |

### Activity 3: Email Communication

| Field      | Value                                  |
| ---------- | -------------------------------------- |
| Purpose    | Customer communication                 |
| Categories | Email addresses, communication history |
| Recipients | Internal users, email providers        |
| Retention  | 7 years (legal requirement)            |
| Security   | TLS in transit, encrypted at rest      |

## Data Protection Impact Assessment (Art. 35)

### Assessment Summary

| Factor              | Rating | Justification                             |
| ------------------- | ------ | ----------------------------------------- |
| Data sensitivity    | Medium | Business contacts, not special categories |
| Scale               | Low    | <10,000 records in MVP                    |
| Automated decisions | Medium | AI scoring with human review              |
| Vulnerable subjects | Low    | B2B contacts only                         |
| Overall risk        | Medium | Standard CRM processing                   |

### Risk Mitigation

| Risk                | Mitigation                                                 | Residual Risk |
| ------------------- | ---------------------------------------------------------- | ------------- |
| Unauthorized access | RLS, RBAC, audit logs                                      | Low           |
| Data breach         | Encryption, monitoring                                     | Low           |
| AI bias             | Model monitoring, human review                             | Low           |
| Over-retention      | Automated retention via `schedule_deletion_by_retention()` | Low           |

## International Transfers

### Current State

- Data stored in EU region (Supabase EU)
- No transfers to third countries
- Sub-processors: Supabase (EU), Vercel (EU edge)

### Safeguards

- Standard Contractual Clauses with processors
- Data processing agreements in place
- Transfer impact assessments completed

## Breach Response Plan

### Detection

1. Automated monitoring alerts
2. User reports
3. Security scanning

### Response Timeline

| Action                 | Timeline            | Owner         |
| ---------------------- | ------------------- | ------------- |
| Detection              | Immediate           | System        |
| Assessment             | <24 hours           | Security Lead |
| Containment            | <24 hours           | DevOps        |
| Authority notification | <72 hours           | DPO           |
| Subject notification   | Without undue delay | DPO           |

### Notification Template

```
Subject: Data Breach Notification - IntelliFlow CRM

Dear [Data Subject],

We are writing to inform you of a personal data breach...
[Details of breach, data affected, measures taken]

Contact: privacy@intelliflow-crm.com
```

## Compliance Roadmap

### Sprint 0 (Completed)

- [x] Privacy by design architecture
- [x] Data subject rights APIs
- [x] Security measures
- [x] Processing records
- [x] GDPR metadata schema (`gdpr_metadata`, `consents`) in
      `infra/supabase/migrations/`. The earlier `data_subject_requests` and
      `legal_holds` tables were never applied and have been replaced by
      `dsar_requests` and `processing_restrictions` (PG-203)

### Sprint 9-11 (Completed)

- [x] Encrypted audit logs and compliance reporting (IFC-124, Sprint 9)
- [x] Threat modeling and abuse-case analysis (IFC-143, Sprint 11)
- [x] Cookie consent mechanism (IFC-143, Sprint 11)
- [x] Penetration test executed and findings triaged (IFC-143, Sprint 11)

### Sprint 14 (Completed)

- [x] Cookie consent component with tests (EXP-ARTIFACTS-002)
- [x] Vulnerability baseline documentation (EXP-ARTIFACTS-003)

### Ongoing (Completed)

- [x] Risk management and compliance tracking (EXP-REPORTS-003)
- [x] Privacy policy publication (`docs/legal/privacy-policy.md`)
- [x] DPO role in RBAC (`packages/domain/src/shared/Permission.ts`)
- [x] Automated retention enforcement (`schedule_deletion_by_retention()`)
- [x] Breach detection via Sentry alerts
- [ ] GDPR training tracked (not started; the earlier training record was
      fabricated and was removed)

### Sprint 18 (PG-203, data subject requests)

- [x] Public request pages, email verification, admin queue, deadline alerts
- [x] Export, erasure of the CRM core, restriction and objection
- [ ] Known gaps tracked in issues #1007, #1009, #1010, #1014, #1015 and #956
- [ ] Outreach suppression, communications erasure, CSV export and Art. 19
      notice (IFC-315 to IFC-318, Sprint 19)

### Sprint 28 (Backlog — UI settings pages)

- [ ] Data Retention settings page (PG-118)
- [ ] Compliance dashboard page (PG-119)
- [ ] Privacy Export settings page (PG-122)
- [ ] Privacy Delete settings page (PG-123)

## Appendices

- A. Data Flow Diagrams: `docs/security/data-flows.md`
- B. DPIA Report: `docs/security/dpia.md`
- C. Processing Records: `artifacts/misc/processing-records.json`
- D. Security Baseline: `infra/monitoring/security-baseline.json`
- E. GDPR Compliance Checklist:
  `docs/compliance-and-governance/compliance/gdpr-compliance-checklist.csv` (35
  controls; the data subject rights rows were re-assessed 2026-10-24)
- F. Threat Model: `docs/security/threat-model.puml`
- G. Incident Response: `docs/security/incident-response.md`
- H. Transfer Impact Assessment:
  `docs/compliance-and-governance/compliance/transfer-impact-assessment.md`
- I. Cookie Consent Component:
  `packages/ui/src/components/cookie-consent/cookie-consent.tsx`

## Approval

| Role          | Name    | Date | Signature |
| ------------- | ------- | ---- | --------- |
| DPO           | Pending | -    | -         |
| Legal Counsel | Pending | -    | -         |
| CTO           | Pending | -    | -         |

---

_Originally generated as part of ENV-016-AI task completion (2025-12-23). The
Controller and Processor section, Chapter III and the data subject rights
sections were rewritten on 2026-10-24 for PG-203. Other sections were last
reviewed 2026-02-23._
