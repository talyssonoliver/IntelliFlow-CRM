# Core CRM Domain - Dependency Chain Analysis

**Generated**: 2026-02-03 **Purpose**: Ensure complete hexagonal architecture
implementation with no orphaned tasks

---

## Executive Summary

The **Core CRM** domain covers 6 primary entities: Lead, Contact, Account,
Opportunity/Deal, Task, and Ticket. Analysis reveals significant gaps in router
and frontend layers.

| Entity      | Domain  | Database | Adapter | Router  | Frontend | Status   |
| ----------- | ------- | -------- | ------- | ------- | -------- | -------- |
| Lead        | IFC-101 | IFC-017  | IFC-107 | IFC-013 | IFC-004  | COMPLETE |
| Contact     | IFC-102 | IFC-017  | IFC-107 | MISSING | MISSING  | ORPHAN   |
| Account     | IFC-103 | IFC-017  | IFC-107 | MISSING | MISSING  | ORPHAN   |
| Opportunity | IFC-104 | IFC-017  | IFC-107 | MISSING | PG-131\* | PARTIAL  |
| Task        | IFC-105 | IFC-017  | IFC-107 | IFC-187 | MISSING  | PARTIAL  |
| Ticket      | IFC-188 | IFC-017  | IFC-107 | IFC-189 | PG-137✅ | COMPLETE |

\*PG-131 is Deal Forecast only, no list/detail page

---

## Full Dependency Diagram

```
                    ┌─────────────────────────────────────────────────────────────────────────┐
                    │                         CORE CRM DOMAIN                                  │
                    │             Leads, Contacts, Accounts, Deals, Tasks, Tickets            │
                    └─────────────────────────────────────────────────────────────────────────┘

    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  LAYER 1: SHARED INFRASTRUCTURE (Foundation)                                              ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

    ┌─────────────────────────┐    ┌─────────────────────────┐    ┌─────────────────────────┐
    │       IFC-002           │    │       IFC-106           │    │       IFC-017           │
    │   Domain Model Design   │    │   Hexagonal Boundaries  │    │   Prisma Data Layer     │
    │        (DDD)            │    │                         │    │                         │
    │                         │    │  - Application ports    │    │  - Schema definitions   │
    │  - Bounded contexts     │    │  - Adapter interfaces   │    │  - Migrations           │
    │  - Entity patterns      │    │  - No domain→infra deps │    │  - pgvector config      │
    │                         │    │                         │    │                         │
    │  Status: COMPLETED      │    │  Status: COMPLETED      │    │  Status: COMPLETED      │
    └────────────┬────────────┘    └────────────┬────────────┘    └────────────┬────────────┘
                 │                              │                              │
                 └──────────────────────────────┴──────────────────────────────┘
                                                │
    ╔═══════════════════════════════════════════╩═══════════════════════════════════════════════╗
    ║  LAYER 2: DOMAIN ENTITIES (Aggregates)                                                    ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

    ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
    │    IFC-101      │  │    IFC-102      │  │    IFC-103      │  │    IFC-104      │  │    IFC-105      │
    │  Lead Aggregate │  │Contact Aggregate│  │Account Aggregate│  │  Opportunity    │  │ Task Aggregate  │
    │                 │  │                 │  │                 │  │   Aggregate     │  │                 │
    │  - LeadId VO    │  │  - ContactId VO │  │  - AccountId VO │  │  - Stage enum   │  │  - TaskId VO    │
    │  - Status enum  │  │  - Email VO     │  │  - Industry VO  │  │  - Probability  │  │  - Priority     │
    │  - Source enum  │  │  - Phone VO     │  │  - Revenue VO   │  │  - Value VO     │  │  - DueDate VO   │
    │  - Score VO     │  │  - Lifecycle    │  │  - Employees    │  │                 │  │  - Assignee     │
    │                 │  │                 │  │                 │  │                 │  │                 │
    │  COMPLETED ✅   │  │  COMPLETED ✅   │  │  COMPLETED ✅   │  │  COMPLETED ✅   │  │  COMPLETED ✅   │
    │  Sprint 2       │  │  Sprint 2       │  │  Sprint 2       │  │  Sprint 3       │  │  Sprint 3       │
    └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘
             │                    │                    │                    │                    │
             │                    │                    │                    │                    │
    ╔════════╧════════════════════╧════════════════════╧════════════════════╧════════════════════╧════════╗
    ║  LAYER 3: VALIDATORS (Zod Schemas)                                                                  ║
    ╚═════════════════════════════════════════════════════════════════════════════════════════════════════╝

                              ┌─────────────────────────────────────────┐
                              │     packages/validators/src/            │
                              │                                         │
                              │  - lead.ts         (leadStatusSchema)   │
                              │  - contact.ts      (contactSchema)      │
                              │  - account.ts      (accountSchema)      │
                              │  - opportunity.ts  (opportunitySchema)  │
                              │  - task.ts         (taskSchema)         │
                              │                                         │
                              │  All derive from domain constants       │
                              │  Status: COMPLETED ✅                   │
                              └─────────────────────────────────────────┘
                                                │
    ╔═══════════════════════════════════════════╩═══════════════════════════════════════════════╗
    ║  LAYER 4: ADAPTERS (Repository Implementations)                                           ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

                              ┌─────────────────────────────────────────┐
                              │           IFC-107                       │
                              │   Repository Implementations            │
                              │                                         │
                              │  - PrismaLeadRepository       ✅        │
                              │  - PrismaContactRepository    ✅        │
                              │  - PrismaAccountRepository    ✅        │
                              │  - PrismaOpportunityRepository ✅       │
                              │  - PrismaTaskRepository       ✅        │
                              │                                         │
                              │  Status: COMPLETED                      │
                              │  Sprint: 3                              │
                              └─────────────────────────────────────────┘
                                                │
    ╔═══════════════════════════════════════════╩═══════════════════════════════════════════════╗
    ║  LAYER 5: tRPC ROUTERS (API Layer)                                          ⚠️ GAPS HERE  ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

    ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
    │    IFC-013      │  │    ❌ MISSING    │  │    ❌ MISSING    │  │    IFC-186      │  │    ❌ MISSING    │
    │  lead.router.ts │  │ contact.router  │  │ account.router  │  │opportunity.router│ │  task.router    │
    │                 │  │                 │  │                 │  │                 │  │                 │
    │  - lead.list    │  │  Need:          │  │  Need:          │  │  Need:          │  │  Need:          │
    │  - lead.get     │  │  - contact.list │  │  - account.list │  │  - deal.list    │  │  - task.list    │
    │  - lead.create  │  │  - contact.get  │  │  - account.get  │  │  - deal.get     │  │  - task.get     │
    │  - lead.update  │  │  - contact.CRUD │  │  - account.CRUD │  │  - deal.CRUD    │  │  - task.CRUD    │
    │  - lead.delete  │  │                 │  │                 │  │  - forecast     │  │  - assign       │
    │                 │  │                 │  │                 │  │                 │  │                 │
    │  COMPLETED ✅   │  │  CREATE: IFC-184│  │  COMPLETED ✅   │  │  COMPLETED ✅   │  │  COMPLETED ✅   │
    │  Sprint 6       │  │                 │  │                 │  │  Sprint 5       │  │                 │
    └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘
             │                    │                    │                    │                    │
             │                    │                    │                    │                    │
    ╔════════╧════════════════════╧════════════════════╧════════════════════╧════════════════════╧════════╗
    ║  LAYER 6: FRONTEND UI (Next.js Pages)                                           ⚠️ MAJOR GAPS       ║
    ╚═════════════════════════════════════════════════════════════════════════════════════════════════════╝

    ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
    │    IFC-004      │  │    ❌ MISSING    │  │    ❌ MISSING    │  │   PG-131 ⚠️     │  │    ❌ MISSING    │
    │  Lead Capture   │  │ Contact Pages   │  │ Account Pages   │  │  Deal Forecast  │  │  Task Pages     │
    │                 │  │                 │  │                 │  │   (Partial)     │  │                 │
    │  - /leads       │  │  Need:          │  │  Need:          │  │                 │  │  Need:          │
    │  - /leads/new   │  │  - /contacts    │  │  - /accounts    │  │  - /deals/[id]/ │  │  - /tasks       │
    │  - /leads/[id]  │  │  - /contacts/   │  │  - /accounts/   │  │    forecast     │  │  - /tasks/[id]  │
    │                 │  │    [id]         │  │    [id]         │  │                 │  │                 │
    │                 │  │                 │  │                 │  │  MISSING:       │  │                 │
    │  COMPLETED ✅   │  │  CREATE: PG-133 │  │  COMPLETED ✅   │  │  COMPLETED ✅   │  │  COMPLETED ✅   │
    │  Sprint 2       │  │                 │  │  Sprint 5       │  │  PG-135 DONE    │  │  Sprint 6       │
    └─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘
```

---

## TICKET Entity - Chain Complete

```
    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  TICKET ENTITY - FULL HEXAGONAL CHAIN                                       ✅ COMPLETE  ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

    IFC-188 (Domain) ✅ → Validators ✅ → Services ✅ → IFC-017 (DB) ✅ → Adapters ✅ → IFC-189 (API) ✅ → PG-137 (UI) ✅

    ┌─────────────────────────┐    ┌─────────────────────────┐    ┌─────────────────────────┐
    │    ✅ IFC-188            │    │    ✅ IFC-189            │    │    ✅ PG-137             │
    │  Ticket Domain Entity   │    │  Ticket tRPC Router     │    │  Ticket Management UI   │
    │                         │    │                         │    │                         │
    │  - TicketId VO          │    │  - ticket.list          │    │  - TicketList           │
    │  - TicketStatus enum    │    │  - ticket.getById       │    │  - TicketDetail         │
    │  - TicketPriority enum  │    │  - ticket.create        │    │  - SLAIndicator         │
    │  - SLAStatus            │    │  - ticket.update        │    │  - EscalationAlert      │
    │  - State machine        │    │  - ticket.stats         │    │  - TicketForm           │
    │  - 627 lines            │    │  - Bulk ops (5)         │    │  - CustomerPortalView   │
    │                         │    │  - 13 endpoints         │    │                         │
    │  Sprint 4               │    │  Sprint 5               │    │  Sprint 6 (Plan Ready)  │
    └─────────────────────────┘    └─────────────────────────┘    └─────────────────────────┘

    Optional API Enhancements (Sprint 6, not hard blockers):
    ┌─────────────────────────┐  ┌─────────────────────────┐  ┌─────────────────────────┐
    │    ✅ IFC-205            │  │    ✅ IFC-206            │  │    ✅ IFC-207            │
    │  Ticket Full-Text       │  │  Ticket Stats           │  │  Query Performance      │
    │  Search                 │  │  Enhancement            │  │  Tracking               │
    │  (search param)         │  │  (SLA breakdown, sort)  │  │  (queryDurationMs)      │
    └─────────────────────────┘  └─────────────────────────┘  └─────────────────────────┘
```

---

## AI Integration Layer (Lead-specific)

```
    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  AI INTEGRATION (Lead Scoring Pipeline)                                      ✅ COMPLETE  ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

                              ┌─────────────────────────────────────────┐
                              │           IFC-005                       │
                              │   LangChain AI Scoring Prototype        │
                              │                                         │
                              │  - scoring.chain.ts                     │
                              │  - Structured output (Zod)              │
                              │  - Confidence scores                    │
                              │  - < 2s scoring latency                 │
                              │                                         │
                              │  Status: COMPLETED ✅                   │
                              │  Sprint: 2                              │
                              └─────────────────────────────────────────┘
                                                │
                                                ▼
                              ┌─────────────────────────────────────────┐
                              │           IFC-023                       │
                              │   AI Explainability UI                  │
                              │                                         │
                              │  - ScoreCard component                  │
                              │  - ScoreFactorList                      │
                              │  - ConfidenceIndicator                  │
                              │                                         │
                              │  Status: COMPLETED ✅                   │
                              │  Sprint: 13                             │
                              └─────────────────────────────────────────┘
```

---

## Missing Tasks Summary (To Create)

### Backend Routers (Missing)

| New Task ID | Entity  | Description                                    | Dependencies              | Sprint |
| ----------- | ------- | ---------------------------------------------- | ------------------------- | ------ |
| IFC-184     | Contact | Contact tRPC Router - CRUD + search            | IFC-102, IFC-107, IFC-003 | 4      |
| IFC-185     | Account | Account tRPC Router - CRUD + hierarchy         | IFC-103, IFC-107, IFC-003 | 4      |
| IFC-186     | Deal    | Deal/Opportunity tRPC Router - CRUD + pipeline | IFC-104, IFC-107, IFC-003 | 5      |
| IFC-187     | Task    | Task tRPC Router - CRUD + assign + timeline    | IFC-105, IFC-107, IFC-003 | 5      |
| IFC-188     | Ticket  | Ticket Domain Entity - aggregate + validators  | IFC-002, IFC-003          | 4      |
| IFC-189     | Ticket  | Ticket tRPC Router - CRUD + SLA + escalation   | IFC-188, IFC-003          | 5      |

### Frontend Pages (Missing)

| New Task ID | Entity  | Description                                                                                                                         | Dependencies     | Sprint |
| ----------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------ |
| PG-133      | Contact | Contact List & Detail Pages                                                                                                         | IFC-184          | 5      |
| PG-134      | Account | Account List & Detail Pages                                                                                                         | IFC-185          | 5      |
| PG-135      | Deal    | Deal List Page (pipeline view)                                                                                                      | IFC-186          | 6      |
| IFC-064     | Deal    | Kanban Drag-Drop Persistence — moveStage mutation, optimistic updates with rollback, CLOSED_LOST reason modal, success/error toasts | IFC-091, IFC-063 | 14     |
| PG-136      | Task    | Task Management UI                                                                                                                  | IFC-187          | 6      |
| PG-137      | Ticket  | Ticket Management UI                                                                                                                | IFC-189          | 6      |

---

## Orphan Status Summary

| Entity      | Backend Orphan?     | Frontend Orphan? | Action Required                                                                    |
| ----------- | ------------------- | ---------------- | ---------------------------------------------------------------------------------- |
| Lead        | No                  | No               | None - Complete                                                                    |
| Contact     | No (domain exists)  | YES              | Create IFC-184, PG-133                                                             |
| Account     | No (router done ✅) | No (PG-134 ✅)   | Complete                                                                           |
| Opportunity | No (router done ✅) | No (PG-135 ✅)   | Complete — 6 components, 72 tests, DnD pipeline + IFC-064 ✅ drag-drop persistence |
| Task        | No (router done ✅) | No (PG-136 ✅)   | Complete — 9 components, 104 tests, tRPC integration                               |
| Ticket      | No (router done ✅) | No (PG-137 ✅)   | Complete — 7 components, 79 tests, tRPC integration                                |

**Total New Tasks Required: 10** (IFC-189 completed 2026-02-07)

## Cross-Cutting: PinButton (PG-157)

PinButton component (`apps/web/src/components/home/PinButton.tsx`) adds visible
pin/unpin toggle to all 5 entity detail page headers:

- `deals/[id]/page.tsx` → PinButton (entityType: opportunity)
- `contacts/[id]/page.tsx` → PinButton (entityType: contact)
- `leads/[id]/page.tsx` → PinButton (entityType: lead)
- `TicketDetail.tsx` → PinButton (entityType: ticket)
- `AccountDetail.tsx` → PinButton (entityType: account)

Dependency: PinButton → useEntityPin hook → home tRPC routes (getPinnedItems,
pinItem, unpinItem)

- 5 Backend (IFC-184 to IFC-188, IFC-189 ✅)
- 5 Frontend (PG-133 to PG-137)
