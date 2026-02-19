# Legal/Scheduling Domain - Dependency Chain Analysis

**Generated**: 2026-02-03 **Purpose**: Ensure complete hexagonal architecture
implementation with no orphaned tasks

---

## Executive Summary

The **Legal/Scheduling** domain covers Case Management, Appointments, Documents,
and Timeline features. Backend infrastructure is **100% complete**, but
**frontend pages are missing**.

| Feature       | Domain  | Database | Adapter     | Router              | Frontend  | Status   |
| ------------- | ------- | -------- | ----------- | ------------------- | --------- | -------- |
| Case/Matter   | IFC-136 | IFC-017  | IFC-152     | cases.router        | MISSING   | ORPHAN   |
| Appointment   | IFC-137 | IFC-017  | IFC-138     | appointments.router | MISSING   | ORPHAN   |
| Documents     | IFC-152 | IFC-017  | IFC-153/154 | documents.router    | MISSING   | ORPHAN   |
| Timeline      | IFC-147 | IFC-017  | IFC-159     | timeline.router     | IFC-147\* | PARTIAL  |
| Calendar Sync | IFC-138 | IFC-017  | IFC-172     | -                   | N/A       | COMPLETE |

_IFC-147 creates timeline UI but no formal PG-_ task exists

---

## Full Dependency Diagram

```
                    ┌─────────────────────────────────────────────────────────────────────────┐
                    │                      LEGAL/SCHEDULING DOMAIN                             │
                    │              Cases, Appointments, Documents, Deadlines                   │
                    └─────────────────────────────────────────────────────────────────────────┘

    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  LAYER 1: DOMAIN ENTITIES (Aggregates)                                    ✅ ALL COMPLETE ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

    ┌─────────────────────────────┐         ┌─────────────────────────────┐
    │        IFC-136              │         │        IFC-137              │
    │   Case/Matter Aggregate     │         │   Appointment Aggregate     │
    │                             │         │                             │
    │  - CaseId, MatterId VO      │         │  - AppointmentId VO         │
    │  - CaseStatus enum          │         │  - ConflictDetector         │
    │  - Tasks, Deadlines         │         │  - Buffer rules             │
    │  - Parties, Lawyers         │         │  - Recurrence patterns      │
    │  - Timeline events          │         │  - Case linkage             │
    │                             │         │                             │
    │  Status: COMPLETED ✅       │         │  Status: COMPLETED ✅       │
    │  Sprint: 3                  │ ───────►│  Sprint: 4                  │
    │  Deps: IFC-002, IFC-003     │         │  Deps: IFC-136, IFC-003     │
    └─────────────────────────────┘         └─────────────────────────────┘
                 │                                       │
                 │                                       │
                 ▼                                       ▼
    ┌─────────────────────────────┐         ┌─────────────────────────────┐
    │        IFC-152              │         │        IFC-147              │
    │   Case Document Aggregate   │         │   Timeline & Deadlines      │
    │                             │         │                             │
    │  - Storage, versioning      │         │  - Deadline engine          │
    │  - ACL (tenant + case)      │         │  - Task display             │
    │  - Audit hooks              │         │  - Reminders                │
    │                             │         │                             │
    │  Status: COMPLETED ✅       │         │  Status: COMPLETED ✅       │
    │  Sprint: 11                 │         │  Sprint: 5                  │
    └─────────────────────────────┘         └─────────────────────────────┘

    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  LAYER 2: INTEGRATION LAYER (Calendar, Email, Documents)                  ✅ ALL COMPLETE ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

    ┌─────────────────────────┐  ┌─────────────────────────┐  ┌─────────────────────────┐
    │       IFC-138           │  │       IFC-144           │  │       IFC-153           │
    │  Calendar Integration   │  │   Email Integration     │  │  Document Ingestion     │
    │                         │  │                         │  │                         │
    │  - Google Calendar      │  │  - SPF/DKIM/DMARC       │  │  - Upload/email intake  │
    │  - Microsoft Calendar   │  │  - Inbound parsing      │  │  - AV scan              │
    │  - Bidirectional sync   │  │  - Attachments          │  │  - Metadata extraction  │
    │  - Webhooks             │  │  - OpenAPI spec         │  │  - Storage routing      │
    │  - Idempotency          │  │                         │  │                         │
    │                         │  │  Status: COMPLETED ✅   │  │  Status: COMPLETED ✅   │
    │  Status: COMPLETED ✅   │  │  Sprint: 10             │  │  Sprint: 12             │
    │  Sprint: 5              │  │                         │  │                         │
    └─────────────────────────┘  └─────────────────────────┘  └─────────────────────────┘
             │                            │                            │
             │                            │                            │
             ▼                            ▼                            ▼
    ┌─────────────────────────┐  ┌─────────────────────────┐  ┌─────────────────────────┐
    │       IFC-172           │  │       IFC-173           │  │       IFC-154           │
    │  Microsoft Calendar     │  │   Inbound Email Parse   │  │   OCR + Text Extract    │
    │  Complete Integration   │  │                         │  │                         │
    │                         │  │  - Parse endpoint       │  │  - PDF processing       │
    │  - OAuth flow           │  │  - Route to case/lead   │  │  - Image OCR            │
    │  - Full bidirectional   │  │  - Attachment handling  │  │  - Text extraction      │
    │  - Webhooks             │  │                         │  │                         │
    │                         │  │  Status: COMPLETED ✅   │  │  Status: COMPLETED ✅   │
    │  Status: COMPLETED ✅   │  │  Sprint: 13             │  │  Sprint: 12             │
    │  Sprint: 13             │  │                         │  │                         │
    └─────────────────────────┘  └─────────────────────────┘  └─────────────────────────┘

    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  LAYER 3: SEARCH & AI INTEGRATION                                          ✅ COMPLETE   ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

    ┌─────────────────────────────┐         ┌─────────────────────────────┐
    │        IFC-155              │         │        IFC-156              │
    │   Permissioned Indexing     │         │   Case RAG Tool             │
    │                             │         │                             │
    │  - pgvector embeddings      │         │  - Agent retrieval          │
    │  - Tenant + case ACL        │         │  - Permission constraints   │
    │  - Cross-tenant protection  │         │  - Citations                │
    │                             │         │  - Injection hardening      │
    │  Status: COMPLETED ✅        │         │                             │
    │  Sprint: 12                  │ ───────►│  Status: COMPLETED ✅       │
    │                             │         │  Sprint: 13                 │
    └─────────────────────────────┘         └─────────────────────────────┘

    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  LAYER 4: AGENT INTEGRATION                                                ✅ COMPLETE   ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

    ┌─────────────────────────────┐         ┌─────────────────────────────┐
    │        IFC-139              │         │        IFC-149              │
    │   Agent Tools               │         │   Action Preview UI         │
    │                             │         │                             │
    │  - Case/appointment search  │         │  - Diff preview             │
    │  - Create/update tools      │         │  - Rollback service         │
    │  - Approval workflows       │         │  - Approval tracking        │
    │                             │         │                             │
    │  Status: COMPLETED ✅       │ ───────►│  Status: COMPLETED ✅       │
    │  Sprint: 6                  │         │  Sprint: 6                  │
    └─────────────────────────────┘         └─────────────────────────────┘

    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  LAYER 5: tRPC ROUTERS (API Layer)                                        ✅ COMPLETE    ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

    ┌─────────────────────────┐  ┌─────────────────────────┐  ┌─────────────────────────┐
    │   cases.router.ts       │  │ appointments.router.ts  │  │  documents.router.ts    │
    │                         │  │                         │  │                         │
    │  - case.list            │  │  - appointment.list     │  │  - document.list        │
    │  - case.get             │  │  - appointment.get      │  │  - document.upload      │
    │  - case.create          │  │  - appointment.create   │  │  - document.download    │
    │  - case.update          │  │  - appointment.update   │  │  - document.versions    │
    │  - case.archive         │  │  - appointment.cancel   │  │  - document.permissions │
    │  - case.timeline        │  │  - appointment.reschedule│ │                         │
    │                         │  │                         │  │                         │
    │  Status: COMPLETED ✅   │  │  Status: COMPLETED ✅   │  │  Status: COMPLETED ✅   │
    └─────────────────────────┘  └─────────────────────────┘  └─────────────────────────┘

    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  LAYER 6: FRONTEND UI                                                  ❌ MAJOR GAPS     ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

    ┌─────────────────────────┐  ┌─────────────────────────┐  ┌─────────────────────────┐
    │    ❌ MISSING           │  │    ❌ MISSING           │  │    ❌ MISSING           │
    │  Case List/Detail       │  │  Appointment UI         │  │  Document Manager       │
    │                         │  │                         │  │                         │
    │  Need:                  │  │  Need:                  │  │  Need:                  │
    │  - /cases               │  │  - /appointments        │  │  - /documents           │
    │  - /cases/[id]          │  │  - /calendar            │  │  - /documents/[id]      │
    │  - Case detail view     │  │  - Scheduling UI        │  │  - Document viewer      │
    │  - Party management     │  │  - Conflict display     │  │  - Version history      │
    │  - Deadline tracking    │  │  - Calendar integration │  │  - ACL management       │
    │                         │  │                         │  │                         │
    │  DONE: PG-138 ✅        │  │  DONE: PG-139 ✅        │  │  CREATE: PG-140         │
    └─────────────────────────┘  └─────────────────────────┘  └─────────────────────────┘

                              ┌─────────────────────────────┐
                              │        IFC-147 ✅           │
                              │   Timeline UI (Partial)     │
                              │                             │
                              │  - Deadline engine display  │
                              │  - Task display             │
                              │  - Reminders                │
                              │                             │
                              │  Status: COMPLETED          │
                              │  (But no formal PG-* task)  │
                              └─────────────────────────────┘
```

---

## Communications & Notifications Layer

```
    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  SCHEDULING COMMUNICATIONS (ICS, Reminders, Channels)                     ✅ COMPLETE    ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

    ┌─────────────────────────┐         ┌─────────────────────────────┐
    │       IFC-157           │         │        IFC-158              │
    │  Notification Service   │         │   Scheduling Communications │
    │                         │         │                             │
    │  - Email channel        │         │  - ICS invite generation    │
    │  - SMS (Twilio)         │ ───────►│  - Reschedule/cancel        │
    │  - Webhook              │         │  - Reminder triggers        │
    │  - Push notifications   │         │                             │
    │                         │         │  Status: COMPLETED ✅       │
    │  Status: COMPLETED ✅   │         │  Sprint: 11                 │
    │  Sprint: 11             │         │                             │
    └─────────────────────────┘         └─────────────────────────────┘
             │                                       │
             ▼                                       ▼
    ┌─────────────────────────┐         ┌─────────────────────────────┐
    │       IFC-170           │         │        IFC-171              │
    │   SMS Channel           │         │   Webhook Channel           │
    │                         │         │                             │
    │  - Twilio integration   │         │  - Webhook delivery         │
    │  - Template support     │         │  - Retry logic              │
    │  - Delivery tracking    │         │  - Signature verification   │
    │                         │         │                             │
    │  Status: COMPLETED ✅   │         │  Status: COMPLETED ✅       │
    │  Sprint: 12             │         │  Sprint: 12                 │
    └─────────────────────────┘         └─────────────────────────────┘
```

---

## Timeline Enrichment Chain

```
    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  TIMELINE ENRICHMENT (Documents, Comms, Agent Actions)                    ✅ COMPLETE    ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

                    ┌─────────────────────────────────────────┐
                    │              IFC-159                     │
                    │   Timeline Enrichment                    │
                    │                                         │
                    │  - Documents as timeline events         │
                    │  - Communications as events             │
                    │  - Agent actions as events              │
                    │  - Unified event aggregation            │
                    │                                         │
                    │  Dependencies:                          │
                    │  - IFC-147 (Base timeline)              │
                    │  - IFC-153 (Document ingestion)         │
                    │  - IFC-144 (Email integration)          │
                    │  - IFC-149 (Agent actions)              │
                    │  - IFC-148 (Zep memory)                 │
                    │                                         │
                    │  Status: COMPLETED ✅                   │
                    │  Sprint: 13                             │
                    └─────────────────────────────────────────┘
```

---

## Missing Tasks Summary (To Create)

### Frontend Pages (Missing - Backend Complete)

| New Task ID | Feature      | Description                                                    | Dependencies        | Sprint |
| ----------- | ------------ | -------------------------------------------------------------- | ------------------- | ------ |
| PG-138      | Cases        | Case List & Detail Pages - party management, deadline tracking | cases.router        | 7      |
| PG-139      | Appointments | Appointment Scheduling UI - calendar view, conflict display    | appointments.router | 7      |
| PG-140      | Documents    | Document Manager UI - viewer, version history, ACL             | documents.router    | 8      |
| PG-141      | Email        | Email Compose & History - thread view, attachments             | email.router        | 8      |

---

## Orphan Status Summary

| Feature         | Backend Complete? | Frontend Task?  | Action Required  |
| --------------- | ----------------- | --------------- | ---------------- |
| Case Management | YES               | YES ✅          | PG-138 COMPLETED |
| Appointments    | YES               | YES ✅          | PG-139 COMPLETED |
| Documents       | YES               | NO              | Create PG-140    |
| Timeline        | YES               | YES (IFC-147)\* | None             |
| Calendar Sync   | YES               | N/A (settings)  | None             |
| Email           | YES               | YES ✅          | PG-141 COMPLETED |

_IFC-147 creates timeline UI but should formalize as PG-_ for consistency

**Total New Tasks Required: 4**

- 4 Frontend (PG-138 to PG-141)
- 0 Backend (all complete)

---

## Backend Infrastructure Status

| Component         | Task                           | Status   | Notes                                 |
| ----------------- | ------------------------------ | -------- | ------------------------------------- |
| Domain Models     | IFC-136, IFC-137, IFC-152      | COMPLETE | All aggregates defined                |
| Database Schema   | IFC-017                        | COMPLETE | Migrations applied                    |
| tRPC Routers      | cases, appointments, documents | COMPLETE | All CRUD endpoints                    |
| Calendar Sync     | IFC-138, IFC-172               | COMPLETE | Google + Microsoft                    |
| Email Integration | IFC-144, IFC-173               | COMPLETE | Inbound + Outbound                    |
| Document Pipeline | IFC-153, IFC-154               | COMPLETE | Upload, OCR, storage                  |
| Search Indexing   | IFC-155                        | COMPLETE | FTS + embeddings with tenant/case ACL |
| Notifications     | IFC-157, IFC-170, IFC-171      | COMPLETE | All channels                          |
| Agent Tools       | IFC-139, IFC-156               | COMPLETE | RAG + CRUD tools                      |
| Timeline          | IFC-147, IFC-159               | COMPLETE | Enriched events                       |

**The Legal/Scheduling domain has strong backend infrastructure (100%) but needs
frontend pages to expose functionality to users.**
