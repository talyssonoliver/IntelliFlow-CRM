# Core CRM Domain - Dependency Chain Analysis

**Generated**: 2026-02-03
**Purpose**: Ensure complete hexagonal architecture implementation with no orphaned tasks

---

## Executive Summary

The **Core CRM** domain covers 6 primary entities: Lead, Contact, Account, Opportunity/Deal, Task, and Ticket. Analysis reveals significant gaps in router and frontend layers.

| Entity | Domain | Database | Adapter | Router | Frontend | Status |
|--------|--------|----------|---------|--------|----------|--------|
| Lead | IFC-101 | IFC-017 | IFC-107 | IFC-013 | IFC-004 | COMPLETE |
| Contact | IFC-102 | IFC-017 | IFC-107 | MISSING | MISSING | ORPHAN |
| Account | IFC-103 | IFC-017 | IFC-107 | MISSING | MISSING | ORPHAN |
| Opportunity | IFC-104 | IFC-017 | IFC-107 | MISSING | PG-131* | PARTIAL |
| Task | IFC-105 | IFC-017 | IFC-107 | MISSING | MISSING | ORPHAN |
| Ticket | MISSING | MISSING | MISSING | MISSING | MISSING | ORPHAN |

*PG-131 is Deal Forecast only, no list/detail page

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
    │    IFC-013      │  │    ❌ MISSING    │  │    ❌ MISSING    │  │    ❌ MISSING    │  │    ❌ MISSING    │
    │  lead.router.ts │  │ contact.router  │  │ account.router  │  │opportunity.router│ │  task.router    │
    │                 │  │                 │  │                 │  │                 │  │                 │
    │  - lead.list    │  │  Need:          │  │  Need:          │  │  Need:          │  │  Need:          │
    │  - lead.get     │  │  - contact.list │  │  - account.list │  │  - deal.list    │  │  - task.list    │
    │  - lead.create  │  │  - contact.get  │  │  - account.get  │  │  - deal.get     │  │  - task.get     │
    │  - lead.update  │  │  - contact.CRUD │  │  - account.CRUD │  │  - deal.CRUD    │  │  - task.CRUD    │
    │  - lead.delete  │  │                 │  │                 │  │  - forecast     │  │  - assign       │
    │                 │  │                 │  │                 │  │                 │  │                 │
    │  COMPLETED ✅   │  │  CREATE: IFC-184│  │  COMPLETED ✅   │  │  CREATE: IFC-186│  │  CREATE: IFC-187│
    │  Sprint 6       │  │                 │  │                 │  │                 │  │                 │
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
    │  COMPLETED ✅   │  │  CREATE: PG-133 │  │  CREATE: PG-134 │  │  - /deals list  │  │  CREATE: PG-136 │
    │  Sprint 2       │  │                 │  │                 │  │  CREATE: PG-135 │  │                 │
    └─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘
```

---

## TICKET Entity - Completely Missing

```
    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  TICKET ENTITY - ALL LAYERS MISSING                                         ❌ CRITICAL   ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

    ┌─────────────────────────┐
    │    ✅ COMPLETED         │
    │  Ticket Aggregate       │    Need to create complete chain:
    │                         │
    │  Required components:   │    IFC-188: Ticket Domain Entity (Sprint 4)
    │  - TicketId VO          │    IFC-189: Ticket tRPC Router (Sprint 5)
    │  - TicketStatus enum    │    PG-137: Ticket Management UI (Sprint 6)
    │  - TicketPriority enum  │
    │  - SLAStatus            │
    │  - Assignee             │
    │  - Category             │
    │                         │
    │  ALL LAYERS NEEDED      │
    └─────────────────────────┘
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

| New Task ID | Entity | Description | Dependencies | Sprint |
|-------------|--------|-------------|--------------|--------|
| IFC-184 | Contact | Contact tRPC Router - CRUD + search | IFC-102, IFC-107, IFC-003 | 4 |
| IFC-185 | Account | Account tRPC Router - CRUD + hierarchy | IFC-103, IFC-107, IFC-003 | 4 |
| IFC-186 | Deal | Deal/Opportunity tRPC Router - CRUD + pipeline | IFC-104, IFC-107, IFC-003 | 5 |
| IFC-187 | Task | Task tRPC Router - CRUD + assign + timeline | IFC-105, IFC-107, IFC-003 | 5 |
| IFC-188 | Ticket | Ticket Domain Entity - aggregate + validators | IFC-002, IFC-003 | 4 |
| IFC-189 | Ticket | Ticket tRPC Router - CRUD + SLA + escalation | IFC-188, IFC-003 | 5 |

### Frontend Pages (Missing)

| New Task ID | Entity | Description | Dependencies | Sprint |
|-------------|--------|-------------|--------------|--------|
| PG-133 | Contact | Contact List & Detail Pages | IFC-184 | 5 |
| PG-134 | Account | Account List & Detail Pages | IFC-185 | 5 |
| PG-135 | Deal | Deal List Page (pipeline view) | IFC-186 | 6 |
| PG-136 | Task | Task Management UI | IFC-187 | 6 |
| PG-137 | Ticket | Ticket Management UI | IFC-189 | 6 |

---

## Orphan Status Summary

| Entity | Backend Orphan? | Frontend Orphan? | Action Required |
|--------|-----------------|------------------|-----------------|
| Lead | No | No | None - Complete |
| Contact | No (domain exists) | YES | Create IFC-184, PG-133 |
| Account | No (router done ✅) | YES | Create PG-134 |
| Opportunity | No (domain exists) | PARTIAL | Create IFC-186, PG-135 |
| Task | No (domain exists) | YES | Create IFC-187, PG-136 |
| Ticket | No (domain done ✅) | YES | Create IFC-189, PG-137 |

**Total New Tasks Required: 11**
- 6 Backend (IFC-184 to IFC-189)
- 5 Frontend (PG-133 to PG-137)
