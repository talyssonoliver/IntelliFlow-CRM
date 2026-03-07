# Complete Dependency Chains - All Domains

**Generated**: 2026-02-04 **Purpose**: Detailed hexagonal architecture
dependency chains for all features

---

## Legend

```
✅ = Completed
⏳ = In Progress (% shown)
⬜ = Backlog (0%)
❌ = Missing (needs creation)

Layers:
  Domain     → Core business logic, aggregates, value objects
  Validators → Zod schemas derived from domain constants
  Application→ Use cases, ports, business rules
  Database   → Prisma schema, migrations, RLS
  Adapters   → Repository implementations
  API        → tRPC routers
  UI         → Next.js pages, React components

| Domain | Entities/Features | Count |
| :--- | :--- | :--: |
| **Core CRM Entities** | Lead, Contact, Account, Opportunity/Deal, Task, Ticket | 6 |
| **Legal Domain** | Case/Matter, Appointment, Document, Email | 4 |
| **AI/Intelligence** | Lead Scoring, AI Agents, AI Output Review, RAG, Next Best Action,<br>AI Monitoring, Sentiment, Churn, Auto-Response, AI Chain Versioning, Ticket Routing | 11 |
| **Platform Infrastructure** | Domain Events, Workflow Engine, Notifications, Home Page, RBAC/Audit,<br>Multi-Tenancy, Security/Secrets, Analytics, Release Governance, Caching | 10 |
| **Integrations** | External APIs/Webhooks, Observability Stack | 2 |
| **Business Workflows** | Lead Qualification, Smart Lead Routing, DSAR, Legal Case Workflows | 4 |
| **TOTAL** | | **36** |
```

---

## Related Documentation Files

This master document is supported by domain-specific dependency chain files for
detailed reference:

| File                                                                                           | Domain                  | Chains Covered                                                                               |
| ---------------------------------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------- |
| [`complete-dependency-chains.md`](./complete-dependency-chains.md)                             | **Master**              | All 36 chains (this file)                                                                    |
| [`core-crm-dependency-chain.md`](./core-crm-dependency-chain.md)                               | Core CRM                | Lead, Contact, Account, Opportunity, Task, Ticket                                            |
| [`legal-scheduling-dependency-chain.md`](./legal-scheduling-dependency-chain.md)               | Legal                   | Case/Matter, Appointment, Document, Email                                                    |
| [`ai-intelligence-dependency-chain.md`](./ai-intelligence-dependency-chain.md)                 | AI/Intelligence         | Lead Scoring, AI Agents, RAG, NBA, Monitoring, Sentiment, Churn, Auto-Response, Versioning   |
| [`ai-output-review-dependency-chain.md`](./ai-output-review-dependency-chain.md)               | AI Output Review        | Review Queue, Review API, Feedback Loop                                                      |
| [`security-platform-dependency-chain.md`](./security-platform-dependency-chain.md)             | Security/Platform       | RBAC/Audit, Analytics                                                                        |
| [`auth-public-pages-dependency-chain.md`](./auth-public-pages-dependency-chain.md)             | Auth/Public             | Home Page, Notifications, SSO Callback (PG-024 ✅), Auth Flows (IFC-120 ✅)                  |
| [`platform-infrastructure-dependency-chain.md`](./platform-infrastructure-dependency-chain.md) | Platform Infrastructure | Workflow Engine, Multi-Tenancy, Security/Secrets, Release Governance, Caching, Domain Events |
| [`integrations-dependency-chain.md`](./integrations-dependency-chain.md)                       | Integrations            | External APIs/Webhooks, Observability Stack                                                  |
| [`business-workflows-dependency-chain.md`](./business-workflows-dependency-chain.md)           | Business Workflows      | Lead Qualification, Smart Routing, DSAR, Legal Case Workflows                                |

### Maintenance Instructions

When implementing new features or modifying existing ones:

1. **Check this document first** - Identify which dependency chain applies
2. **Follow hexagonal layers** - Domain → Validators → Application → Database →
   Adapters → API → UI
3. **Update status indicators** - Mark tasks as ✅ when complete, ⏳ when in
   progress
4. **Add new chains** - If creating a new entity/feature, add its dependency
   chain here
5. **Keep domain-specific files in sync** - Update the relevant domain file
   alongside this master
6. **Update page documentation when UI layer ships** - When a UI task (the
   rightmost node in a chain) is completed and creates `page.tsx` files, update:
   - `docs/design/PAGE_MAP_AND_FLOWS.md` — add route entries, update total count
   - `docs/design/sitemap.md` — update total page count
   - `docs/design/navigation-reachability-audit.md` — add reachability row
   - This is enforced by TC-31 (automated) and plan-reviewer category CC

---

# CORE CRM DOMAIN

## Lead Entity (COMPLETE)

```
                                    ┌──────────────────┐
                                    │    IFC-101       │
                                    │  Lead Domain     │
                                    │      ✅          │
                                    └────────┬─────────┘
                                             │
              ┌──────────────────────────────┼──────────────────────────────┐
              │                              │                              │
              ▼                              ▼                              ▼
    ┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
    │  lead.ts (Val)   │          │    IFC-108       │          │    IFC-017       │
    │  Validators      │          │  Domain Services │          │  Database        │
    │      ✅          │          │      ✅          │          │      ✅          │
    └────────┬─────────┘          └────────┬─────────┘          └────────┬─────────┘
             │                              │                              │
             └──────────────────────────────┼──────────────────────────────┘
                                            │
                                            ▼
                                 ┌──────────────────┐
                                 │    IFC-107       │
                                 │  Adapters        │
                                 │  (Repository)    │
                                 │      ✅          │
                                 └────────┬─────────┘
                                          │
                                          ▼
                                 ┌──────────────────┐
                                 │    IFC-013       │
                                 │  lead.router.ts  │
                                 │      ✅          │
                                 └────────┬─────────┘
                                          │
                         ┌────────────────┼────────────────┐
                         │                │                │
                         ▼                ▼                ▼
              ┌──────────────────┐ ┌──────────────┐ ┌──────────────────┐
              │    IFC-004       │ │   IFC-005    │ │    IFC-023       │
              │  Lead Capture UI │ │  AI Scoring  │ │  Explainability  │
              │      ✅          │ │      ✅      │ │      ✅          │
              └──────────────────┘ └──────────────┘ └──────────────────┘

Dependency Chain:
  IFC-101 (Domain) ──┬──► lead.ts (Validators) ──► IFC-108 (Services) ──► IFC-107 (Adapters) ──► IFC-013 (API) ──┬──► IFC-004 (UI)
                     │                                                                                           ├──► IFC-005 (AI)
                     └──► IFC-017 (Database) ────────────────────────────────────────────────────────────────────┘    └──► IFC-023 (Explainability)
```

---

## Contact Entity (GAPS IDENTIFIED)

```
                                    ┌──────────────────┐
                                    │    IFC-102       │
                                    │  Contact Domain  │
                                    │      ✅          │
                                    └────────┬─────────┘
                                             │
              ┌──────────────────────────────┼──────────────────────────────┐
              │                              │                              │
              ▼                              ▼                              ▼
    ┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
    │  contact.ts (Val)│          │    IFC-108       │          │    IFC-017       │
    │  Validators      │          │  Domain Services │          │  Database        │
    │      ✅          │          │      ✅          │          │      ✅          │
    └────────┬─────────┘          └────────┬─────────┘          └────────┬─────────┘
             │                              │                              │
             └──────────────────────────────┼──────────────────────────────┘
                                            │
                                            ▼
                                 ┌──────────────────┐
                                 │    IFC-107       │
                                 │  Adapters        │
                                 │  (Repository)    │
                                 │      ✅          │
                                 └────────┬─────────┘
                                          │
                                          ▼
                                 ┌──────────────────┐
                                 │    IFC-184       │
                                 │contact.router.ts │
                                 │      ⬜ NEW      │
                                 └────────┬─────────┘
                                          │
                                          ▼
                                 ┌──────────────────┐
                                 │    PG-133        │
                                 │  Contact Pages   │
                                 │      ⬜ NEW      │
                                 └──────────────────┘

Dependency Chain:
  IFC-102 (Domain) ──┬──► contact.ts (Validators) ──► IFC-108 (Services) ──► IFC-107 (Adapters) ──► IFC-184 (API) ⬜ ──► PG-133 (UI) ⬜
                     │
                     └──► IFC-017 (Database) ────────────────────────────────────────────────────────────────────────────┘
```

---

## Account Entity (GAPS IDENTIFIED)

```
                                    ┌──────────────────┐
                                    │    IFC-103       │
                                    │  Account Domain  │
                                    │      ✅          │
                                    └────────┬─────────┘
                                             │
              ┌──────────────────────────────┼──────────────────────────────┐
              │                              │                              │
              ▼                              ▼                              ▼
    ┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
    │  account.ts (Val)│          │    IFC-108       │          │    IFC-017       │
    │  Validators      │          │  Domain Services │          │  Database        │
    │      ✅          │          │      ✅          │          │      ✅          │
    └────────┬─────────┘          └────────┬─────────┘          └────────┬─────────┘
             │                              │                              │
             └──────────────────────────────┼──────────────────────────────┘
                                            │
                                            ▼
                                 ┌──────────────────┐
                                 │    IFC-107       │
                                 │  Adapters        │
                                 │      ✅          │
                                 └────────┬─────────┘
                                          │
                                          ▼
                                 ┌──────────────────┐
                                 │    IFC-185       │
                                 │account.router.ts │
                                 │   ✅ COMPLETED   │
                                 └────────┬─────────┘
                                          │
                                          ▼
                                 ┌──────────────────┐
                                 │    PG-134        │
                                 │  Account Pages   │
                                 │      ⬜ NEW      │
                                 └──────────────────┘

Dependency Chain:
  IFC-103 (Domain) ──┬──► account.ts (Validators) ──► IFC-108 (Services) ──► IFC-107 (Adapters) ──► IFC-185 (API) ✅ ──► PG-134 (UI) ✅
                     │
                     └──► IFC-017 (Database) ────────────────────────────────────────────────────────────────────────────┘
```

---

## Opportunity/Deal Entity (GAPS IDENTIFIED)

```
                                    ┌──────────────────┐
                                    │    IFC-104       │
                                    │  Opportunity     │
                                    │  Domain  ✅      │
                                    └────────┬─────────┘
                                             │
              ┌──────────────────────────────┼──────────────────────────────┐
              │                              │                              │
              ▼                              ▼                              ▼
    ┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
    │opportunity.ts    │          │    IFC-108       │          │    IFC-017       │
    │  Validators ✅   │          │  Domain Services │          │  Database        │
    │                  │          │      ✅          │          │      ✅          │
    └────────┬─────────┘          └────────┬─────────┘          └────────┬─────────┘
             │                              │                              │
             └──────────────────────────────┼──────────────────────────────┘
                                            │
                                            ▼
                                 ┌──────────────────┐
                                 │    IFC-107       │
                                 │  Adapters ✅     │
                                 └────────┬─────────┘
                                          │
                                          ▼
                                 ┌──────────────────┐
                                 │    IFC-186       │
                                 │  deal.router.ts  │
                                 │      ✅          │
                                 └────────┬─────────┘
                                          │
                         ┌────────────────┴────────────────┐
                         │                                 │
                         ▼                                 ▼
              ┌──────────────────┐              ┌──────────────────┐
              │    PG-135        │              │    PG-131        │
              │  Pipeline Page   │              │  Forecast Page   │
              │      ✅ DONE     │              │      ✅ DONE     │
              └────────┬─────────┘              └──────────────────┘
                       │
                       ▼
              ┌──────────────────┐
              │    IFC-064       │
              │  Kanban Drag-Drop│
              │  Persistence     │
              │      ✅ DONE     │
              └──────────────────┘

Dependency Chain:
  IFC-104 (Domain) ──┬──► opportunity.ts (Val) ──► IFC-108 (Services) ──► IFC-107 (Adapters) ──► IFC-186 (API) ✅ ──┬──► PG-135 (Pipeline) ✅ ──► IFC-064 (DnD Persist) ✅
                     │                                                                                              │
                     └──► IFC-017 (Database) ───────────────────────────────────────────────────────────────────────┴──► PG-131 (Forecast) ✅

Cross-Domain: Lead → Deal Conversion (IFC-062 ✅):
  IFC-061 (Lead Convert Use Case) ✅ ──► IFC-062 (Lead to Deal) ✅ ──► lead.convertToDeal endpoint
  IFC-104 (Opportunity Domain) ✅ ────────────┘                        (sourceLeadId traceability)

Deal Won Closure Workflow (IFC-065 ✅):
  IFC-091 (Deals Pipeline Kanban) ✅ ──┐
                                       ├──► IFC-065 (Deal Won Closure) ✅
  IFC-092 (Deal Forecasting) ✅ ───────┘
  CloseDealWonUseCase → OpportunityService.markAsWon() → DealWonEnrichedEvent
  Fire-and-forget: enriched event + notification dispatch
```

---

## Task Entity (GAPS IDENTIFIED)

```
                                    ┌──────────────────┐
                                    │    IFC-105       │
                                    │  Task Domain     │
                                    │      ✅          │
                                    └────────┬─────────┘
                                             │
              ┌──────────────────────────────┼──────────────────────────────┐
              │                              │                              │
              ▼                              ▼                              ▼
    ┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
    │  task.ts (Val)   │          │    IFC-108       │          │    IFC-017       │
    │  Validators ✅   │          │  Domain Services │          │  Database        │
    │                  │          │      ✅          │          │      ✅          │
    └────────┬─────────┘          └────────┬─────────┘          └────────┬─────────┘
             │                              │                              │
             └──────────────────────────────┼──────────────────────────────┘
                                            │
                                            ▼
                                 ┌──────────────────┐
                                 │    IFC-107       │
                                 │  Adapters ✅     │
                                 └────────┬─────────┘
                                          │
                                          ▼
                                 ┌──────────────────┐
                                 │    IFC-187       │
                                 │  task.router.ts  │
                                 │      ⬜ NEW      │
                                 └────────┬─────────┘
                                          │
                                          ▼
                                 ┌──────────────────┐
                                 │    PG-136        │
                                 │  Task Pages      │
                                 │      ✅ DONE     │
                                 └──────────────────┘

Dependency Chain:
  IFC-105 (Domain) ──┬──► task.ts (Validators) ──► IFC-108 (Services) ──► IFC-107 (Adapters) ──► IFC-187 (API) ✅ ──► PG-136 (UI) ✅
                     │
                     └──► IFC-017 (Database) ────────────────────────────────────────────────────────────────────────┘
```

---

## Ticket Entity (ALL NEW)

```
                                    ┌──────────────────┐
                                    │    IFC-188       │
                                    │  Ticket Domain   │
                                    │   ✅ COMPLETED   │
                                    └────────┬─────────┘
                                             │
              ┌──────────────────────────────┼──────────────────────────────┐
              │                              │                              │
              ▼                              ▼                              ▼
    ┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
    │  ticket.ts (Val) │          │  Domain Services │          │    IFC-017       │
    │  (in IFC-188)    │          │  (in IFC-188)    │          │  Database        │
    │   ✅ COMPLETED   │          │   ✅ COMPLETED   │          │  (add ticket)    │
    └────────┬─────────┘          └────────┬─────────┘          └────────┬─────────┘
             │                              │                              │
             └──────────────────────────────┼──────────────────────────────┘
                                            │
                                            ▼
                                 ┌──────────────────┐
                                 │  (in IFC-189)    │
                                 │  Ticket Adapter  │
                                 │      ⬜ NEW      │
                                 └────────┬─────────┘
                                          │
                                          ▼
                                 ┌──────────────────┐
                                 │    IFC-189       │
                                 │ ticket.router.ts │
                                 │      ⬜ NEW      │
                                 └────────┬─────────┘
                                          │
                                          ▼
                                 ┌──────────────────┐
                                 │    PG-137        │
                                 │  Ticket Pages    │
                                 │      ✅ DONE     │
                                 └──────────────────┘

Dependency Chain:
  IFC-188 (Domain) ✅ ──┬──► ticket.ts (Validators) ✅ ──► (Services) ✅ ──► (Adapters) ✅ ──► IFC-189 (API) ✅ ──► PG-137 (UI) ✅
                     │                                                                                           └──► PG-046 (Support Portal) ✅
                     └──► IFC-017 (Database) ─────────────────────────────────────────────────────────────────────────┘

Support Portal Chain:
  PG-046: /support/tickets → SupportTicketList → TicketList → useTicketFilters → api.ticket.list → TicketService (container.ts:247)
```

---

# LEGAL/SCHEDULING DOMAIN

## Case/Matter Entity (UI MISSING)

```
                                    ┌──────────────────┐
                                    │    IFC-136       │
                                    │  Case Domain     │
                                    │      ✅          │
                                    └────────┬─────────┘
                                             │
              ┌──────────────────────────────┼──────────────────────────────┐
              │                              │                              │
              ▼                              ▼                              ▼
    ┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
    │  case.ts (Val)   │          │    IFC-139       │          │    IFC-017       │
    │  Validators ✅   │          │  Agent Tools     │          │  Database ✅     │
    └────────┬─────────┘          │      ✅          │          └────────┬─────────┘
             │                    └────────┬─────────┘                    │
             │                              │                              │
             └──────────────────────────────┼──────────────────────────────┘
                                            │
                                            ▼
                                 ┌──────────────────┐
                                 │    IFC-152       │
                                 │  Document Model  │
                                 │      ✅          │
                                 └────────┬─────────┘
                                          │
                                          ▼
                                 ┌──────────────────┐
                                 │ cases.router.ts  │
                                 │      ✅          │
                                 └────────┬─────────┘
                                          │
                         ┌────────────────┴────────────────┐
                         │                                 │
                         ▼                                 ▼
              ┌──────────────────┐              ┌──────────────────┐
              │    PG-138        │              │    IFC-147       │
              │  Case Pages      │              │  Timeline UI     │
              │      ✅ DONE      │              │      ✅          │
              └──────────────────┘              └──────────────────┘

Dependency Chain:
  IFC-136 (Domain) ──┬──► case.ts (Val) ──► IFC-139 (Agent) ──► IFC-152 (Doc) ──► cases.router (API) ✅ ──┬──► PG-138 (UI) ✅
                     │                                                                                     │
                     └──► IFC-017 (Database) ──────────────────────────────────────────────────────────────┴──► IFC-147 (Timeline) ✅
```

---

## Appointment Entity (UI MISSING)

```
                                    ┌──────────────────┐
                                    │    IFC-137       │
                                    │  Appointment     │
                                    │  Domain ✅       │
                                    └────────┬─────────┘
                                             │
              ┌──────────────────────────────┼──────────────────────────────┐
              │                              │                              │
              ▼                              ▼                              ▼
    ┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
    │appointment.ts    │          │    IFC-138       │          │    IFC-017       │
    │  Validators ✅   │          │  Calendar Sync   │          │  Database ✅     │
    └────────┬─────────┘          │      ✅          │          └────────┬─────────┘
             │                    └────────┬─────────┘                    │
             │                              │                              │
             └──────────────────────────────┼──────────────────────────────┘
                                            │
                                            ▼
                                 ┌──────────────────┐
                                 │    IFC-172       │
                                 │  MS Calendar     │
                                 │      ✅          │
                                 └────────┬─────────┘
                                          │
                                          ▼
                                 ┌──────────────────┐
                                 │appointments.router│
                                 │      ✅          │
                                 └────────┬─────────┘
                                          │
                         ┌────────────────┴────────────────┐
                         │                                 │
                         ▼                                 ▼
              ┌──────────────────┐              ┌──────────────────┐
              │    PG-139        │              │    IFC-158       │
              │  Scheduling UI   │              │  ICS/Comms       │
              │      ✅          │              │      ✅          │
              └──────────────────┘              └──────────────────┘

Dependency Chain:
  IFC-137 (Domain) ──┬──► appointment.ts (Val) ──► IFC-138 (Calendar) ──► IFC-172 (MS) ──► appointments.router ✅ ──┬──► PG-139 (UI) ✅ ──► PG-154 (Coverage) ✅
                     │                                │                                                              │
                     │                                └──► IFC-224 (Webhook Ingestion):
                     │                                       Google route handler → GoogleCalendarAdapter.parseWebhookPayload → CalendarWebhookService
                     │                                       Microsoft route handler → MicrosoftCalendarAdapter.parseWebhookPayload → CalendarWebhookService
                     │                                       CalendarWebhookService → CalendarSyncServicePort → CalendarSyncServiceAdapter (stub)
                     │                                                                                                │
                     └──► IFC-017 (Database) ────────────────────────────────────────────────────────────────────────┴──► IFC-158 (ICS) ✅
```

---

## Document Entity (UI MISSING)

```
                                    ┌──────────────────┐
                                    │    IFC-152       │
                                    │  Document Domain │
                                    │      ✅          │
                                    └────────┬─────────┘
                                             │
              ┌──────────────────────────────┼──────────────────────────────┐
              │                              │                              │
              ▼                              ▼                              ▼
    ┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
    │    IFC-153       │          │    IFC-154       │          │    IFC-155       │
    │  Ingestion       │          │  OCR/Extract     │          │  Search Index    │
    │      ✅          │          │      ✅          │          │      ✅          │
    └────────┬─────────┘          └────────┬─────────┘          └────────┬─────────┘
             │                              │                              │
             └──────────────────────────────┼──────────────────────────────┘
                                            │
                                            ▼
                                 ┌──────────────────┐
                                 │documents.router  │
                                 │      ✅          │
                                 └────────┬─────────┘
                                          │
                                          ▼
                                 ┌──────────────────┐
                                 │    PG-140        │
                                 │  Document UI     │
                                 │      ✅ DONE     │
                                 └──────────────────┘

Dependency Chain:
  IFC-152 (Domain) ──┬──► IFC-153 (Ingestion) ──► IFC-154 (OCR) ──► IFC-155 (Index) ✅ ──► documents.router ✅ ──► PG-140 (UI) ✅
                     │
                     └──► IFC-017 (Database) ───────────────────────────────────────────────────────────────────────┘
```

---

## Email Entity (UI MISSING)

```
                                    ┌──────────────────┐
                                    │    IFC-144       │
                                    │  Email Domain    │
                                    │      ✅          │
                                    └────────┬─────────┘
                                             │
              ┌──────────────────────────────┼──────────────────────────────┐
              │                              │                              │
              ▼                              ▼                              ▼
    ┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
    │    IFC-173       │          │    IFC-157       │          │    IFC-017       │
    │  Inbound Parse   │          │  Notifications   │          │  Database ✅     │
    │      ✅          │          │      ✅          │          └────────┬─────────┘
    └────────┬─────────┘          └────────┬─────────┘                    │
             │                              │                              │
             └──────────────────────────────┼──────────────────────────────┘
                                            │
                                            ▼
                                 ┌──────────────────┐
                                 │ inbound.router   │
                                 │      ✅          │
                                 └────────┬─────────┘
                                          │
                                          ▼
                                 ┌──────────────────┐
                                 │    PG-141        │
                                 │  Email UI        │
                                 │      ✅ DONE     │
                                 └──────────────────┘

Dependency Chain:
  IFC-144 (Domain) ──┬──► IFC-173 (Parse) ──► IFC-157 (Notify) ──► inbound.router ✅ ──► PG-141 (UI) ✅
                     │
                     └──► IFC-017 (Database) ─────────────────────────────────────────────────────────┘
```

---

# AI/INTELLIGENCE DOMAIN

## AI Output Review (COMPLETE - All 7 Layers)

```
                                    ┌──────────────────┐
                                    │    IFC-128       │
                                    │  Review Domain   │
                                    │      ✅          │
                                    └────────┬─────────┘
                                             │
              ┌──────────────────────────────┼──────────────────────────────┐
              │                              │                              │
              ▼                              ▼                              ▼
    ┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
    │    IFC-176       │          │    IFC-177       │          │    IFC-178       │
    │  Validators      │          │  Application     │          │  Database        │
    │      ✅          │          │      ✅          │          │      ✅          │
    └────────┬─────────┘          └────────┬─────────┘          └────────┬─────────┘
             │                              │                              │
             └──────────────────────────────┼──────────────────────────────┘
                                            │
                                            ▼
                                 ┌──────────────────┐
                                 │    IFC-179       │
                                 │  Adapters        │
                                 │      ✅          │
                                 └────────┬─────────┘
                                          │
                                          ▼
                                 ┌──────────────────┐
                                 │    IFC-180       │
                                 │  ai-review.router│
                                 │      ✅          │
                                 └────────┬─────────┘
                                          │
                                          ▼
                                 ┌──────────────────┐
                                 │    IFC-181       │
                                 │  Review Queue UI │
                                 │      ✅          │
                                 │  /agent-approvals│
                                 │  /ai-review      │
                                 └──────────────────┘

Dependency Chain:
  IFC-128 (Domain) ✅ ──┬──► IFC-176 (Validators) ✅ ──► IFC-177 (Application) ✅ ──► IFC-179 (Adapters) ✅ ──► IFC-180 (API) ✅ ──► IFC-181 (UI) ✅
                        │
                        └──► IFC-178 (Database) ✅ ────────────────────────────────────────────────────────────────────────────────────┘
  Related: PG-150 (AI Review History at /agent-approvals/history, Sprint 7)
```

---

## Auto-Response Chain (COMPLETE)

```
                                    ┌──────────────────┐
                                    │    IFC-028       │
                                    │  Workflow Engine │
                                    │      ✅          │
                                    └────────┬─────────┘
                                             │
                                             ▼
                                    ┌──────────────────┐
                                    │    IFC-029       │
                                    │  Auto-Response   │
                                    │  Chain ✅        │
                                    └────────┬─────────┘
                                             │
              ┌──────────────────────────────┼──────────────────────────────┐
              │                              │                              │
              ▼                              ▼                              ▼
    ┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
    │    IFC-149       │          │    IFC-030       │          │    IFC-031       │
    │  Action Preview  │          │  Lead Routing    │          │  Workflow Builder│
    │      ✅          │          │      ✅          │          │      ⬜          │
    └──────────────────┘          └────────┬─────────┘          └──────────────────┘
                                           │
                                           ▼
                                 ┌──────────────────┐
                                 │    PG-132        │
                                 │  Routing UI      │
                                 │      ⬜          │
                                 └──────────────────┘

Dependency Chain:
  IFC-028 (Workflow) ✅ ──► IFC-029 (Auto-Response) ✅ ──┬──► IFC-149 (Preview UI) ✅
                                                         ├──► IFC-030 (Routing) ✅ ──► PG-132 (UI) ✅
                                                         └──► IFC-031 (Builder) ⬜
```

---

## Lead Scoring Pipeline (COMPLETE)

```
                                    ┌──────────────────┐
                                    │    IFC-005       │
                                    │  AI Lead Scoring │
                                    │      ✅          │
                                    └────────┬─────────┘
                                             │
              ┌──────────────────────────────┼──────────────────────────────┐
              │                              │                              │
              ▼                              ▼                              ▼
    ┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
    │    IFC-020       │          │  scoring.chain.ts│          │    IFC-022       │
    │  LangChain       │          │  Validators      │          │  Structured      │
    │  Integration     │          │      ✅          │          │  Outputs         │
    │      ✅          │          └────────┬─────────┘          │      ✅          │
    └────────┬─────────┘                    │                    └────────┬─────────┘
             │                              │                              │
             └──────────────────────────────┼──────────────────────────────┘
                                            │
                                            ▼
                                 ┌──────────────────┐
                                 │    IFC-164       │
                                 │  Ollama Benchmark│
                                 │      ✅          │
                                 └────────┬─────────┘
                                          │
                         ┌────────────────┴────────────────┐
                         │                                 │
                         ▼                                 ▼
              ┌──────────────────┐              ┌──────────────────┐
              │    IFC-023       │              │    IFC-024       │
              │  Explainability  │              │  Human-in-Loop   │
              │  UI              │              │  Feedback        │
              │      ✅          │              │      ⬜          │
              └──────────────────┘              └──────────────────┘

Dependency Chain:
  IFC-005 (Scoring) ✅ ──┬──► IFC-020 (LangChain) ✅ ──► IFC-164 (Ollama) ✅ ──┬──► IFC-023 (Explain) ✅
                        ├──► scoring.chain.ts (Val) ✅ ────────────────────────┘
                        ├──► IFC-022 (Structured) ✅ ──► IFC-024 (Feedback) ⬜
                        └──► IFC-085 (Ollama Config) ✅ ──► IFC-174 (Real Benchmark) ✅
                                                            └──► IFC-168 (Scoring Job) ✅
```

---

## Sentiment Analysis (COMPLETE)

```
                                    ┌──────────────────┐
                                    │    IFC-039       │
                                    │  sentiment.chain │
                                    │      ✅          │
                                    └────────┬─────────┘
                                             │
              ┌──────────────────────────────┴──────────────────────────────┐
              │                                                             │
              ▼                                                             ▼
    ┌──────────────────┐                                         ┌──────────────────┐
    │  sentimentInput  │                                         │  sentimentResult │
    │  Schema ✅       │                                         │  Schema ✅       │
    └────────┬─────────┘                                         └────────┬─────────┘
             │                                                             │
             └─────────────────────────────┬───────────────────────────────┘
                                           │
                                           ▼
                                 ┌──────────────────┐
                                 │  timeline.router │
                                 │  (partial) ✅    │
                                 └────────┬─────────┘
                                          │
                                          ▼
                                 ┌──────────────────┐
                                 │    PG-142        │
                                 │  Sentiment UI    │
                                 │      ✅ DONE     │
                                 └──────────────────┘

Dependency Chain:
  IFC-039 (Chain) ✅ ──► sentimentSchemas (Val) ✅ ──► timeline.router (partial) ✅ ──► PG-142 (UI) ✅
```

---

## Churn Risk (UI MISSING)

```
                                    ┌──────────────────┐
                                    │    IFC-095       │
                                    │  churn-risk.chain│
                                    │      ✅          │
                                    └────────┬─────────┘
                                             │
              ┌──────────────────────────────┴──────────────────────────────┐
              │                                                             │
              ▼                                                             ▼
    ┌──────────────────┐                                         ┌──────────────────┐
    │  churnRiskInput  │                                         │  churnRiskResult │
    │  Schema ✅       │                                         │  Schema ✅       │
    └────────┬─────────┘                                         └────────┬─────────┘
             │                                                             │
             └─────────────────────────────┬───────────────────────────────┘
                                           │
                                           ▼
                                 ┌──────────────────┐
                                 │intelligence.router│
                                 │  (partial) ✅    │
                                 └────────┬─────────┘
                                          │
                                          ▼
                                 ┌──────────────────┐
                                 │    PG-143        │
                                 │  Churn Dashboard │
                                 │      ⬜ NEW      │
                                 └──────────────────┘

Dependency Chain:
  IFC-095 (Chain) ✅ ──► churnRiskSchemas (Val) ✅ ──► intelligence.router (partial) ✅ ──► PG-143 (UI) ⬜
```

---

## RAG/Search (UI MISSING)

```
                                    ┌──────────────────┐
                                    │    IFC-039       │
                                    │  rag-context.chain│
                                    │      ✅          │
                                    └────────┬─────────┘
                                             │
              ┌──────────────────────────────┼──────────────────────────────┐
              │                              │                              │
              ▼                              ▼                              ▼
    ┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
    │    IFC-155       │          │    IFC-156       │          │    IFC-148       │
    │  Search Index    │          │  Case RAG Tool   │          │  Zep Memory      │
    │      ✅          │          │      ✅          │          │      ✅          │
    └────────┬─────────┘          └────────┬─────────┘          └────────┬─────────┘
             │                              │                              │
             └──────────────────────────────┼──────────────────────────────┘
                                            │
                                            ▼
                                 ┌──────────────────┐
                                 │    PG-144        │
                                 │  AI Search UI    │
                                 │      ✅ DONE     │
                                 └──────────────────┘

Dependency Chain:
  IFC-039 (RAG) ✅ ──┬──► IFC-155 (Index) ✅ ──► IFC-156 (RAG Tool) ✅ ──► PG-144 (UI) ✅
                     │
                     └──► IFC-148 (Zep) ✅ ──────────────────────────────────────────────┘
```

---

## AI Chain Versioning (UI IN PROGRESS)

```
                                    ┌──────────────────┐
                                    │    IFC-086       │
                                    │  Chain Versioning│
                                    │      ✅          │
                                    └────────┬─────────┘
                                             │
              ┌──────────────────────────────┼──────────────────────────────┐
              │                              │                              │
              ▼                              ▼                              ▼
    ┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
    │chain-version.ts  │          │ChainVersionService│         │    IFC-148       │
    │  Validators ✅   │          │      ✅          │          │  Zep Memory      │
    └────────┬─────────┘          └────────┬─────────┘          │      ✅          │
             │                              │                    └────────┬─────────┘
             └──────────────────────────────┼─────────────────────────────┘
                                            │
                                            ▼
                                 ┌──────────────────┐
                                 │chain-version.router│
                                 │      ✅          │
                                 └────────┬─────────┘
                                          │
                                          ▼
                                 ┌──────────────────┐
                                 │    PG-128        │
                                 │  AI Settings UI  │
                                 │      ⬜ 0%       │
                                 │  (Spec Complete) │
                                 └──────────────────┘

Dependency Chain:
  IFC-086 (Domain) ✅ ──► chain-version.ts (Val) ✅ ──► ChainVersionService ✅ ──► chain-version.router ✅ ──► PG-128 (UI) ⬜
                                                                    │
                                                             IFC-148 (Zep) ✅
```

---

# SECURITY & PLATFORM DOMAIN

## Notifications (ROUTER MISSING - BLOCKING)

```
                                    ┌──────────────────┐
                                    │    IFC-157       │
                                    │  Notification    │
                                    │  Service ✅      │
                                    └────────┬─────────┘
                                             │
              ┌──────────────────────────────┼──────────────────────────────┐
              │                              │                              │
              ▼                              ▼                              ▼
    ┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
    │    IFC-170       │          │    IFC-171       │          │notifications.ts  │
    │  SMS Channel     │          │  Webhook Channel │          │  Validators ✅   │
    │      ✅          │          │      ✅          │          └────────┬─────────┘
    └────────┬─────────┘          └────────┬─────────┘                    │
             │                              │                              │
             └──────────────────────────────┼──────────────────────────────┘
                                            │
                                            ▼
                                 ┌──────────────────┐
                                 │    IFC-183       │
                                 │notifications.router│
                                 │      ⬜ BLOCKING │
                                 └────────┬─────────┘
                                          │
                         ┌────────────────┴────────────────┐
                         │                                 │
                         ▼                                 ▼
              ┌──────────────────┐              ┌──────────────────┐
              │    PG-116        │              │    PG-130        │
              │  Prefs UI        │              │  Inbox UI        │
              │      ⬜ BLOCKED  │              │      ✅          │
              └──────────────────┘              └──────────────────┘

Dependency Chain:
  IFC-157 (Service) ✅ ──┬──► IFC-170 (SMS) ✅ ──► IFC-171 (Webhook) ✅ ──► IFC-183 (Router) ✅ ──┬──► PG-116 (Prefs) ⬜
                         │                                                                       │
                         └──► notifications.ts (Val) ✅ ─────────────────────────────────────────┴──► PG-130 (Inbox) ✅

⚠️ IFC-183 complete. PG-116 (Notification Prefs) still pending.

Runtime Wiring (IFC-222):
  NotificationsWorker.deliverSMS() ──► SMSChannel.deliver() ──► Twilio REST API
  NotificationsWorker.onStart()    ──► createSMSChannel() ──► SMSChannel.initialize()
  NotificationsWorker.onStop()     ──► SMSChannel.close()
  getDependencyHealth()            ──► SMSChannel.getStats() (circuit state)
```

---

## Analytics (ROUTER COMPLETE)

```
                              ┌──────────────────┐
                              │  ANALYTICS-001   │
                              │  Segmentation    │
                              │      ✅          │
                              └────────┬─────────┘
                                       │
           ┌───────────────────────────┼───────────────────────────┐
           │                           │                           │
           ▼                           ▼                           ▼
  ┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
  │    IFC-003       │       │    IFC-096       │       │    IFC-032       │
  │   tRPC Base      │       │  Custom Reports  │       │   (prereq)      │
  │      ✅          │       │      ✅          │       │      ✅          │
  └────────┬─────────┘       └────────┬─────────┘       └────────┬─────────┘
           │                          │                          │
           │                          ▼                          ▼
           │                 ┌──────────────────┐       ┌──────────────────┐
           │                 │    IFC-200       │       │    IFC-037       │
           │                 │  Adapter Layer   │       │  Dashboard Design│
           │                 │      ✅          │       │      ⬜ S21     │
           │                 └────────┬─────────┘       └────────┬─────────┘
           │                          │                          │
           └────────────┬─────────────┘                          │
                        │                                        │
                        ▼                                        │
               ┌──────────────────┐                              │
               │    IFC-190       │                              │
               │ analytics.router │                              │
               │      ✅          │                              │
               └────────┬─────────┘                              │
                        │                                        │
                        └──────────────┬─────────────────────────┘
                                       │
                                       ▼
                              ┌──────────────────┐
                              │    IFC-038       │
                              │  Analytics UI    │
                              │  (wires router)  │
                              │      ⬜ S22     │
                              └──────────────────┘

Backend (done):  ANALYTICS-001 ✅ + IFC-003 ✅ + IFC-096 ✅ ──► IFC-200 ✅ ──► IFC-190 ✅
Frontend (next): IFC-037 ⬜ ──► IFC-038 ⬜ (wires IFC-190 to UI)
```

---

## Home Page (ROUTER COMPLETE)

```
                                    ┌──────────────────┐
                                    │    IFC-182       │
                                    │  home.router     │
                                    │       ✅         │
                                    └────────┬─────────┘
                                             │
                                     ┌───────┴────────┐
                                     ▼                ▼
                            ┌──────────────────┐  ┌──────────────────┐
                            │    IFC-195       │  │    PG-129        │
                            │  Daily Goals     │  │  Home Page       │
                            │      ✅          │  │      ✅          │
                            └──────────────────┘  └───┬──────────────┘
                                     │                │
                                     ▼                ▼
                            ┌──────────────────┐  ┌──────────────────┐
                            │    PG-156        │  │    PG-157        │
                            │  Goal Settings   │  │  PinButton       │
                            │      ✅          │  │      ✅          │
                            └──────────────────┘  └──────────────────┘
                                                  Consumed by: deals/[id], contacts/[id],
                                                  leads/[id], TicketDetail, AccountDetail
                                                  Uses: useEntityPin → home tRPC routes

Dependency Chain:
  IFC-182 (Router) ✅ ──► IFC-195 (Daily Goals) ✅ ──► PG-156 (Goal Settings) ✅
                    ──► PG-129 (UI) ✅ ──► PG-157 (PinButton) ✅
                                         ──► PG-158 (DnD Reorder) ⏳
                                         ──► PG-166 (Lighthouse Audit) ✅
  PG-158 uses: @dnd-kit/sortable, DraggablePinnedItem.tsx → home.reorderPinnedItems
```

---

## RBAC/Audit (COMPLETE, UI BACKLOG)

```
                                    ┌──────────────────┐
                                    │    IFC-098       │
                                    │  RBAC System     │
                                    │      ✅          │
                                    └────────┬─────────┘
                                             │
              ┌──────────────────────────────┼──────────────────────────────┐
              │                              │                              │
              ▼                              ▼                              ▼
    ┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
    │    IFC-124       │          │    IFC-127       │          │    IFC-140       │
    │  Audit Logging   │          │  Tenant Isolation│          │  Data Governance │
    │      ✅          │          │      ✅          │          │      ✅          │
    └────────┬─────────┘          └────────┬─────────┘          └────────┬─────────┘
             │                              │                              │
             └──────────────────────────────┼──────────────────────────────┘
                                            │
                                            ▼
                              ┌────────────────────────────┐
                              │    Settings Routers ✅     │
                              └────────────┬───────────────┘
                                           │
              ┌────────────────────────────┬┴────────────────────────────┐
              │            │               │               │             │
              ▼            ▼               ▼               ▼             ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │   PG-108     │ │   PG-109     │ │   PG-110     │ │   PG-112     │ │   PG-120     │
    │   Users ⬜   │ │   Roles ⬜   │ │   Perms ⬜   │ │   Audit ⬜   │ │  Security ⬜ │
    └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘

Dependency Chain:
  IFC-098 (RBAC) ✅ ──┬──► IFC-124 (Audit) ✅ ──► Settings Routers ✅ ──┬──► PG-108 (Users) ⬜
                      ├──► IFC-127 (Tenant) ✅ ─────────────────────────┼──► PG-109 (Roles) ⬜
                      └──► IFC-140 (Governance) ✅ ─────────────────────┼──► PG-110 (Perms) ⬜
                                                                        ├──► PG-112 (Audit) ⬜
                                                                        └──► PG-120 (Security) ⬜
```

---

## AI Agents Framework (CORE AI INFRASTRUCTURE)

```
                                    ┌──────────────────┐
                                    │    IFC-021       │
                                    │  CrewAI Agents   │
                                    │      ✅          │
                                    └────────┬─────────┘
                                             │
              ┌──────────────────────────────┼──────────────────────────────┐
              │                              │                              │
              ▼                              ▼                              ▼
    ┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
    │    IFC-139       │          │    IFC-148       │          │    IFC-125       │
    │  Agent Tools     │          │  Zep Memory      │          │  AI Guardrails   │
    │  (Authorization) │          │  Integration     │          │                  │
    │      ✅          │          │      ✅          │          │      ✅          │
    └────────┬─────────┘          └────────┬─────────┘          └────────┬─────────┘
             │                              │                              │
             └──────────────────────────────┼──────────────────────────────┘
                                            │
                                            ▼
                                 ┌──────────────────┐
                                 │    IFC-149       │
                                 │  Action Preview  │
                                 │  & Approval      │
                                 │      ✅          │
                                 └────────┬─────────┘
                                          │
                         ┌────────────────┴────────────────┐
                         │                                 │
                         ▼                                 ▼
              ┌──────────────────┐              ┌──────────────────┐
              │ agent.router.ts  │              │    IFC-128       │
              │      ✅          │              │  AI Output Review│
              └────────┬─────────┘              │      ⏳          │
                       │                        └──────────────────┘
                       ▼
              ┌──────────────────┐
              │  Agent Action UI │
              │  (in workflows)  │
              │      ⬜          │
              └──────────────────┘

Dependency Chain:
  IFC-021 (Agents) ✅ ──┬──► IFC-139 (Tools Auth) ✅ ──► IFC-149 (Approval) ✅ ──► agent.router ✅ ──► UI ⬜
                        ├──► IFC-148 (Memory) ✅ ────────────────────────────────────────────────────┘
                        └──► IFC-125 (Guardrails) ✅ ──► IFC-128 (Review) ⏳ ────────────────────────┘
```

---

## Next Best Action / NBA (AI RECOMMENDATIONS)

```
                                    ┌──────────────────┐
                                    │    IFC-095       │
                                    │  Prediction      │
                                    │  Intelligence    │
                                    │      ✅          │
                                    └────────┬─────────┘
                                             │
              ┌──────────────────────────────┼──────────────────────────────┐
              │                              │                              │
              ▼                              ▼                              ▼
    ┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
    │    IFC-039       │          │    IFC-166       │          │  nba.ts          │
    │  Advanced AI     │          │  NBA Demo Video  │          │  Validators      │
    │  Predictions     │          │      ⬜          │          │      ⬜ NEW      │
    │      ⬜          │          └────────┬─────────┘          └────────┬─────────┘
    └────────┬─────────┘                    │                              │
             │                              │                              │
             └──────────────────────────────┼──────────────────────────────┘
                                            │
                                            ▼
                                 ┌──────────────────┐
                                 │intelligence.router│
                                 │  (partial) ✅    │
                                 └────────┬─────────┘
                                          │
                         ┌────────────────┴────────────────┐
                         │                                 │
                         ▼                                 ▼
              ┌──────────────────┐              ┌──────────────────┐
              │    PG-145        │              │  Deal Insights   │
              │  NBA Dashboard   │              │  (in PG-131)     │
              │      ⬜ NEW      │              │      ✅ DONE     │
              └──────────────────┘              └──────────────────┘

Dependency Chain:
  IFC-095 (Prediction) ✅ ──┬──► IFC-039 (Advanced AI) ⬜ ──► intelligence.router ✅ ──┬──► PG-145 (NBA UI) ⬜
                            ├──► IFC-166 (Demo Video) ⬜ ─────────────────────────────┘
                            └──► nba.ts (Validators) ⬜ ──────────────────────────────┘
```

---

## AI Monitoring & Drift Detection (OBSERVABILITY)

```
                                    ┌──────────────────┐
                                    │    IFC-117       │
                                    │  AI Model        │
                                    │  Monitoring      │
                                    │      ✅          │
                                    └────────┬─────────┘
                                             │
              ┌──────────────────────────────┼──────────────────────────────┐
              │                              │                              │
              ▼                              ▼                              ▼
    ┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
    │  AUTOMATION-002  │          │    TRACK-004     │          │  ai-metrics.ts   │
    │  Drift Detection │          │  AI Metrics      │          │  Validators      │
    │  Automation      │          │  Dashboard       │          │      ⬜ NEW      │
    │      ⬜          │          │      ⬜          │          └────────┬─────────┘
    └────────┬─────────┘          └────────┬─────────┘                    │
             │                              │                              │
             └──────────────────────────────┼──────────────────────────────┘
                                            │
                                            ▼
                                 ┌──────────────────┐
                                 │ai-monitoring.router│
                                 │      ⬜ NEW      │
                                 └────────┬─────────┘
                                          │
                                          ▼
                                 ┌──────────────────┐
                                 │    PG-146        │
                                 │  AI Ops Dashboard│
                                 │      ⬜ NEW      │
                                 └──────────────────┘

Dependency Chain:
  IFC-117 (Monitoring) ✅ ──┬──► AUTOMATION-002 (Drift) ⬜ ──► ai-monitoring.router ⬜ ──► PG-146 (UI) ⬜
                            ├──► TRACK-004 (Metrics) ⬜ ────────────────────────────────────────────────┘
                            └──► ai-metrics.ts (Val) ⬜ ────────────────────────────────────────────────┘
```

---

## Domain Events Infrastructure (EVENT-DRIVEN)

```
                                    ┌──────────────────┐
                                    │    IFC-150       │
                                    │  Event Contracts │
                                    │  & Outbox        │
                                    │      ⬜          │
                                    └────────┬─────────┘
                                             │
              ┌──────────────────────────────┴──────────────────────────────┐
              │                                                             │
              ▼                                                             ▼
    ┌──────────────────┐                                         ┌──────────────────┐
    │    IFC-151       │                                         │  domain-events.ts│
    │  Consumer        │                                         │  Validators      │
    │  Framework       │                                         │      ⬜ NEW      │
    │      ⬜          │                                         └────────┬─────────┘
    └────────┬─────────┘                                                  │
             │                                                             │
             └─────────────────────────────┬───────────────────────────────┘
                                           │
                                           ▼
                                 ┌──────────────────┐
                                 │  OutboxRepository│
                                 │  (Adapter)       │
                                 │      ⬜ NEW      │
                                 └────────┬─────────┘
                                          │
                                          ▼
                                 ┌──────────────────┐
                                 │events-worker     │
                                 │  (Background)    │
                                 │      ⬜          │
                                 └──────────────────┘

Dependency Chain:
  IFC-150 (Contracts) ⬜ ──┬──► IFC-151 (Consumer) ⬜ ──► OutboxRepository ⬜ ──► events-worker ⬜
                          │
                          └──► domain-events.ts (Val) ⬜ ───────────────────────────────────────┘
```

---

## Workflow Engine (LANGGRAPH ORCHESTRATION)

```
                                    ┌──────────────────┐
                                    │    IFC-028       │
                                    │  Workflow Domain │
                                    │  (State Machine) │
                                    │      ✅          │
                                    └────────┬─────────┘
                                             │
              ┌──────────────────────────────┼──────────────────────────────┐
              │                              │                              │
              ▼                              ▼                              ▼
    ┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
    │    IFC-141       │          │  workflow.ts     │          │    IFC-017       │
    │  LangGraph       │          │  Validators      │          │  Database        │
    │  Integration     │          │      ✅          │          │  (workflow tbl)  │
    │      ⬜          │          └────────┬─────────┘          │      ⬜          │
    └────────┬─────────┘                    │                    └────────┬─────────┘
             │                              │                              │
             └──────────────────────────────┼──────────────────────────────┘
                                            │
                                            ▼
                                 ┌──────────────────┐
                                 │workflow.router   │
                                 │      ⬜          │
                                 └────────┬─────────┘
                                          │
                         ┌────────────────┴────────────────┐
                         │                                 │
                         ▼                                 ▼
              ┌──────────────────┐              ┌──────────────────┐
              │    IFC-031       │              │    PG-147        │
              │  Workflow Builder│              │  Workflow List   │
              │  (Visual)        │              │  & Status UI     │
              │      ⬜          │              │      ⬜ NEW      │
              └──────────────────┘              └──────────────────┘

Dependency Chain:
  IFC-028 (Domain) ✅ ──┬──► IFC-141 (LangGraph) ⬜ ──► workflow.router ⬜ ──┬──► IFC-031 (Builder) ⬜
                        ├──► workflow.ts (Val) ✅ ─────────────────────────┴──► PG-147 (List UI) ⬜
                        └──► IFC-017 (Database) ⬜ ─────────────────────────────────────────────────┘
```

---

## Multi-Tenancy & Isolation (SAAS INFRASTRUCTURE)

```
                                    ┌──────────────────┐
                                    │    IFC-098       │
                                    │  RBAC System     │
                                    │      ✅          │
                                    └────────┬─────────┘
                                             │
              ┌──────────────────────────────┼──────────────────────────────┐
              │                              │                              │
              ▼                              ▼                              ▼
    ┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
    │    IFC-127       │          │    IFC-140       │          │  tenant.ts       │
    │  Tenant          │          │  Data            │          │  Validators      │
    │  Isolation (RLS) │          │  Governance      │          │      ✅          │
    │      ✅          │          │      ✅          │          └────────┬─────────┘
    └────────┬─────────┘          └────────┬─────────┘                    │
             │                              │                              │
             └──────────────────────────────┼──────────────────────────────┘
                                            │
                                            ▼
                                 ┌──────────────────┐
                                 │ Per-Tenant Keys  │
                                 │ (Encryption)     │
                                 │      ✅          │
                                 └────────┬─────────┘
                                          │
                         ┌────────────────┴────────────────┐
                         │                                 │
                         ▼                                 ▼
              ┌──────────────────┐              ┌──────────────────┐
              │    PG-106        │              │    PG-107        │
              │  Organization    │              │  Billing         │
              │  Settings        │              │  Portal          │
              │      ⬜          │              │      ⬜          │
              └──────────────────┘              └──────────────────┘

Dependency Chain:
  IFC-098 (RBAC) ✅ ──┬──► IFC-127 (Tenant RLS) ✅ ──► Per-Tenant Keys ✅ ──┬──► PG-106 (Org Settings) ⬜
                      │                                                     │
                      └──► IFC-140 (Governance) ✅ ────────────────────────┴──► PG-107 (Billing) ⬜
```

---

## Security & Secrets Management (VAULT)

```
                                    ┌──────────────────┐
                                    │  EXC-SEC-001     │
                                    │  HashiCorp Vault │
                                    │  Setup           │
                                    │      ✅          │
                                    └────────┬─────────┘
                                             │
              ┌──────────────────────────────┼──────────────────────────────┐
              │                              │                              │
              ▼                              ▼                              ▼
    ┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
    │    IFC-113       │          │    IFC-121       │          │    IFC-143       │
    │  Encryption      │          │  Secret          │          │  Threat Model    │
    │  at Rest/Transit │          │  Rotation        │          │  STRIDE          │
    │      ⬜          │          │      ⬜          │          │      ⬜          │
    └────────┬─────────┘          └────────┬─────────┘          └────────┬─────────┘
             │                              │                              │
             └──────────────────────────────┼──────────────────────────────┘
                                            │
                                            ▼
                                 ┌──────────────────┐
                                 │    IFC-125       │
                                 │  AI Guardrails   │
                                 │      ✅          │
                                 └────────┬─────────┘
                                          │
                                          ▼
                                 ┌──────────────────┐
                                 │    PG-120        │
                                 │  Security        │
                                 │  Settings UI     │
                                 │      ⬜          │
                                 └──────────────────┘

Dependency Chain:
  EXC-SEC-001 (Vault) ✅ ──┬──► IFC-113 (Encryption) ⬜ ──► IFC-125 (Guardrails) ✅ ──► PG-120 (UI) ⬜
                           ├──► IFC-121 (Rotation) ⬜ ────────────────────────────────────────────────┘
                           └──► IFC-143 (Threat Model) ⬜ ────────────────────────────────────────────┘
```

---

## Release & Deployment Governance (CICD)

```
                                    ┌──────────────────┐
                                    │    IFC-130       │
                                    │  Promotion       │
                                    │  Workflow        │
                                    │      ⬜          │
                                    └────────┬─────────┘
                                             │
              ┌──────────────────────────────┼──────────────────────────────┐
              │                              │                              │
              ▼                              ▼                              ▼
    ┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
    │    IFC-132       │          │    IFC-133       │          │    IFC-134       │
    │  SBOM            │          │  Artifact        │          │  Container       │
    │  Generation      │          │  Signing         │          │  Scanning        │
    │      ⬜          │          │      ⬜          │          │      ⬜          │
    └────────┬─────────┘          └────────┬─────────┘          └────────┬─────────┘
             │                              │                              │
             └──────────────────────────────┼──────────────────────────────┘
                                            │
                                            ▼
                                 ┌──────────────────┐
                                 │    IFC-112       │
                                 │  Blue/Green      │
                                 │  Deployment      │
                                 │      ⬜          │
                                 └────────┬─────────┘
                                          │
                                          ▼
                                 ┌──────────────────┐
                                 │  Release         │
                                 │  Dashboard       │
                                 │  (GitHub Actions)│
                                 │      ⬜          │
                                 └──────────────────┘

Dependency Chain:
  IFC-130 (Promotion) ⬜ ──┬──► IFC-132 (SBOM) ⬜ ──► IFC-112 (Blue/Green) ⬜ ──► Release Dashboard ⬜
                          ├──► IFC-133 (Signing) ⬜ ──────────────────────────────────────────────────┘
                          └──► IFC-134 (Scanning) ⬜ ─────────────────────────────────────────────────┘
```

---

## Caching & Performance (OPTIMIZATION)

```
                                    ┌──────────────────┐
                                    │    IFC-007       │
                                    │  Cache Strategy  │
                                    │  (Redis/CDN)     │
                                    │      ⬜          │
                                    └────────┬─────────┘
                                             │
              ┌──────────────────────────────┴──────────────────────────────┐
              │                                                             │
              ▼                                                             ▼
    ┌──────────────────┐                                         ┌──────────────────┐
    │    IFC-123       │                                         │  ENV-009-AI      │
    │  Query           │                                         │  Lighthouse      │
    │  Optimization    │                                         │  Scores          │
    │      ⬜          │                                         │      ✅          │
    └────────┬─────────┘                                         └────────┬─────────┘
             │                                                             │
             └─────────────────────────────┬───────────────────────────────┘
                                           │
                                           ▼
                                 ┌──────────────────┐
                                 │    IFC-033       │
                                 │  Load Testing    │
                                 │  (k6)            │
                                 │      ✅          │
                                 └────────┬─────────┘
                                          │
                                          ▼
                                 ┌──────────────────┐
                                 │  Performance     │
                                 │  Dashboard       │
                                 │      ⬜          │
                                 └──────────────────┘

Dependency Chain:
  IFC-007 (Cache) ⬜ ──┬──► IFC-123 (Query Opt) ⬜ ──► IFC-033 (Load Test) ✅ ──► Performance Dashboard ⬜
                      │
                      └──► ENV-009-AI (Lighthouse) ✅ ─────────────────────────────────────────────────┘
```

---

## External APIs & Webhooks (INTEGRATIONS)

```
                                    ┌──────────────────┐
                                    │    IFC-099       │
                                    │  Webhook         │
                                    │  Framework       │
                                    │      ⬜          │
                                    └────────┬─────────┘
                                             │
              ┌──────────────────────────────┼──────────────────────────────┐
              │                              │                              │
              ▼                              ▼                              ▼
    ┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
    │    IFC-114       │          │  webhook.ts      │          │    IFC-036       │
    │  Rate Limiting   │          │  Validators      │          │  WhatsApp API    │
    │  & DDoS          │          │      ⬜ NEW      │          │      ⬜          │
    │      ⬜          │          └────────┬─────────┘          └────────┬─────────┘
    └────────┬─────────┘                    │                              │
             │                              │                              │
             └──────────────────────────────┼──────────────────────────────┘
                                            │
                                            ▼
                                 ┌──────────────────┐
                                 │webhooks.router   │
                                 │      ⬜          │
                                 └────────┬─────────┘
                                          │
                         ┌────────────────┴────────────────┐
                         │                                 │
                         ▼                                 ▼
              ┌──────────────────┐              ┌──────────────────┐
              │    PG-114        │              │    PG-115        │
              │  Integration     │              │  Webhook Config  │
              │  Catalog         │              │  UI              │
              │      ⬜          │              │      ⬜          │
              └──────────────────┘              └──────────────────┘

Dependency Chain:
  IFC-099 (Webhooks) ⬜ ──┬──► IFC-114 (Rate Limit) ⬜ ──► webhooks.router ⬜ ──┬──► PG-114 (Catalog) ⬜
                         ├──► webhook.ts (Val) ⬜ ──────────────────────────────┴──► PG-115 (Config) ⬜
                         └──► IFC-036 (WhatsApp) ⬜ ────────────────────────────────────────────────────┘
```

---

## Observability Stack (MONITORING)

```
                                    ┌──────────────────┐
                                    │  ENV-008-AI      │
                                    │  OpenTelemetry   │
                                    │  Setup           │
                                    │      ✅          │
                                    └────────┬─────────┘
                                             │
              ┌──────────────────────────────┼──────────────────────────────┐
              │                              │                              │
              ▼                              ▼                              ▼
    ┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
    │    IFC-116       │          │    IFC-142       │          │  traces.ts       │
    │  Metrics         │          │  Alerting        │          │  Validators      │
    │  Collection      │          │  & SLOs          │          │      ⬜ NEW      │
    │      ⬜          │          │      ⬜          │          └────────┬─────────┘
    └────────┬─────────┘          └────────┬─────────┘                    │
             │                              │                              │
             └──────────────────────────────┼──────────────────────────────┘
                                            │
                                            ▼
                                 ┌──────────────────┐
                                 │  Grafana         │
                                 │  Dashboards      │
                                 │      ⬜          │
                                 └────────┬─────────┘
                                          │
                         ┌────────────────┴────────────────┐
                         │                                 │
                         ▼                                 ▼
              ┌──────────────────┐              ┌──────────────────┐
              │    TRACK-001     │              │    TRACK-006     │
              │  Status          │              │  Build Health    │
              │  Dashboard       │              │  Dashboard       │
              │      ✅          │              │      ✅          │
              └──────────────────┘              └──────────────────┘

Dependency Chain:
  ENV-008-AI (OTel) ✅ ──┬──► IFC-116 (Metrics) ⬜ ──► Grafana Dashboards ⬜ ──┬──► TRACK-001 (Status) ✅
                         ├──► IFC-142 (Alerting) ⬜ ────────────────────────────┴──► TRACK-006 (Build) ✅
                         └──► traces.ts (Val) ⬜ ───────────────────────────────────────────────────────┘
```

---

## Lead Qualification Workflow (BUSINESS PROCESS)

```
                                    ┌──────────────────┐
                                    │    IFC-004       │
                                    │  Lead Capture    │
                                    │      ✅          │
                                    └────────┬─────────┘
                                             │
                                             ▼
                                    ┌──────────────────┐
                                    │    IFC-005       │
                                    │  AI Lead         │
                                    │  Scoring         │
                                    │      ✅          │
                                    └────────┬─────────┘
                                             │
              ┌──────────────────────────────┴──────────────────────────────┐
              │                                                             │
              ▼                                                             ▼
    ┌──────────────────┐                                         ┌──────────────────┐
    │    IFC-024       │                                         │    IFC-030       │
    │  Human-in-Loop   │                                         │  Smart Routing   │
    │  Feedback        │                                         │      ✅          │
    │      ⬜          │                                         └────────┬─────────┘
    └────────┬─────────┘                                                  │
             │                                                             │
             └─────────────────────────────┬───────────────────────────────┘
                                           │
                                           ▼
                                 ┌──────────────────┐
                                 │    PG-132        │
                                 │  Routing UI      │
                                 │      ⬜          │
                                 └──────────────────┘

Dependency Chain:
  IFC-004 (Capture) ✅ ──► IFC-005 (Scoring) ✅ ──┬──► IFC-024 (Feedback) ⬜ ──► PG-132 (Routing UI) ✅
                                                  │
                                                  └──► IFC-030 (Routing) ✅ ──────────────────────────┘
```

---

## Smart Lead Routing (AUTOMATION)

```
                                    ┌──────────────────┐
                                    │    IFC-030       │
                                    │  Smart Lead      │
                                    │  Routing         │
                                    │      ✅          │
                                    └────────┬─────────┘
                                             │
              ┌──────────────────────────────┼──────────────────────────────┐
              │                              │                              │
              ▼                              ▼                              ▼
    ┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
    │  routing-rules.ts│          │  Load Balancer   │          │    IFC-017       │
    │  Validators      │          │  (Assignment)    │          │  Database        │
    │      ⬜ NEW      │          │      ⬜          │          │  (routing tbl)   │
    └────────┬─────────┘          └────────┬─────────┘          │      ⬜          │
             │                              │                    └────────┬─────────┘
             │                              │                              │
             └──────────────────────────────┼──────────────────────────────┘
                                            │
                                            ▼
                                 ┌──────────────────┐
                                 │routing.router    │
                                 │      ⬜          │
                                 └────────┬─────────┘
                                          │
                         ┌────────────────┴────────────────┐
                         │                                 │
                         ▼                                 ▼
              ┌──────────────────┐              ┌──────────────────┐
              │    PG-132        │              │  SLA Monitoring  │
              │  Routing Config  │              │  Dashboard       │
              │      ⬜          │              │      ⬜          │
              └──────────────────┘              └──────────────────┘

Dependency Chain:
  IFC-030 (Routing) ⏳ ──┬──► routing-rules.ts (Val) ⬜ ──► routing.router ⬜ ──┬──► PG-132 (Config UI) ✅
                        ├──► Load Balancer ⬜ ────────────────────────────────┴──► SLA Dashboard ⬜
                        └──► IFC-017 (Database) ⬜ ─────────────────────────────────────────────────┘
```

---

## DSAR Workflow (PRIVACY COMPLIANCE)

```
                                    ┌──────────────────┐
                                    │    IFC-140       │
                                    │  Data            │
                                    │  Governance      │
                                    │      ✅          │
                                    └────────┬─────────┘
                                             │
              ┌──────────────────────────────┼──────────────────────────────┐
              │                              │                              │
              ▼                              ▼                              ▼
    ┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
    │    IFC-058       │          │  dsar.ts         │          │  Retention       │
    │  Data Retention  │          │  Validators      │          │  Policy Engine   │
    │  Policies        │          │      ⬜ NEW      │          │      ⬜          │
    │      ⬜          │          └────────┬─────────┘          └────────┬─────────┘
    └────────┬─────────┘                    │                              │
             │                              │                              │
             └──────────────────────────────┼──────────────────────────────┘
                                            │
                                            ▼
                                 ┌──────────────────┐
                                 │dsar.router       │
                                 │      ⬜          │
                                 └────────┬─────────┘
                                          │
                         ┌────────────────┴────────────────┐
                         │                                 │
                         ▼                                 ▼
              ┌──────────────────┐              ┌──────────────────┐
              │    PG-122        │              │    PG-123        │
              │  Privacy Export  │              │  Data Deletion   │
              │      ⬜          │              │      ⬜          │
              └──────────────────┘              └──────────────────┘

Dependency Chain:
  IFC-140 (Governance) ✅ ──┬──► IFC-058 (Retention) ⬜ ──► dsar.router ⬜ ──┬──► PG-122 (Export) ⬜
                            ├──► dsar.ts (Val) ⬜ ─────────────────────────┴──► PG-123 (Deletion) ⬜
                            └──► Retention Engine ⬜ ────────────────────────────────────────────────┘
```

---

## Data Migration from Legacy (PLATFORM INFRASTRUCTURE)

```
    ┌──────────────────┐         ┌──────────────────┐
    │    IFC-017       │         │    IFC-070        │
    │ Prisma + Supabase│────────>│ Data Migration    │
    │   Data Layer     │         │  from Legacy      │
    │  (Sprint 6) DONE │         │  (Sprint 18)      │
    └──────────────────┘         └────────┬─────────┘
                                          │
                                          v
                                 ┌──────────────────┐
                                 │    PG-121         │
                                 │ Settings >        │
                                 │  Import/Export    │
                                 │  (Sprint 28)      │
                                 └──────────────────┘
```

**Dependency Chain:** IFC-017 (Prisma+Supabase, DONE) → **IFC-070** (Delta Sync
ETL, Reconciliation, Target Validation) → PG-121 (Import/Export UI)

**Key Artifacts:** `delta-sync.ts`, `reconciliation.ts`, `validate-target.ts`,
`data-validation-report.csv`, `migration-log.txt`, `rollback-procedure.md`,
`gdpr-migration-attestation.md`

---

## Legal Case Workflows (BUSINESS PROCESS)

```
                                    ┌──────────────────┐
                                    │    IFC-136       │
                                    │  Case Domain     │
                                    │      ✅          │
                                    └────────┬─────────┘
                                             │
              ┌──────────────────────────────┼──────────────────────────────┐
              │                              │                              │
              ▼                              ▼                              ▼
    ┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
    │    IFC-147       │          │    IFC-141       │          │    IFC-159       │
    │  Deadline        │          │  LangGraph       │          │  Case Timeline   │
    │  Tracking        │          │  Integration     │          │                  │
    │      ✅          │          │      ⬜          │          │      ✅          │
    └────────┬─────────┘          └────────┬─────────┘          └────────┬─────────┘
             │                              │                              │
             └──────────────────────────────┼──────────────────────────────┘
                                            │
                                            ▼
                                 ┌──────────────────┐
                                 │  Case Status     │
                                 │  Transitions     │
                                 │      ⬜          │
                                 └────────┬─────────┘
                                          │
                         ┌────────────────┴────────────────┐
                         │                                 │
                         ▼                                 ▼
              ┌──────────────────┐              ┌──────────────────┐
              │    PG-138        │              │  Deadline        │
              │  Case Pages      │              │  Alerts          │
              │      ⬜          │              │      ⬜          │
              └──────────────────┘              └──────────────────┘

Dependency Chain:
  IFC-136 (Case) ✅ ──┬──► IFC-147 (Deadlines) ✅ ──► Case Status Transitions ⬜ ──┬──► PG-138 (UI) ✅
                      ├──► IFC-141 (LangGraph) ⬜ ──────────────────────────────────┴──► Deadline Alerts ⬜
                      └──► IFC-159 (Timeline) ✅ ──────────────────────────────────────────────────────┘
```

---

# SUMMARY: ALL DEPENDENCY CHAINS (36 TOTAL)

## By Domain

| #                                | Domain      | Entity/Feature         | Chain Status                                                               |
| -------------------------------- | ----------- | ---------------------- | -------------------------------------------------------------------------- |
| **CORE CRM (6)**                 |
| 1                                | Core CRM    | Lead                   | ✅ Complete                                                                |
| 2                                | Core CRM    | Contact                | ⬜ Router + UI Missing                                                     |
| 3                                | Core CRM    | Account                | ⏳ UI Missing (Router ✅)                                                  |
| 4                                | Core CRM    | Opportunity/Deal       | ⬜ Router + UI Missing                                                     |
| 5                                | Core CRM    | Task                   | ⬜ Router + UI Missing                                                     |
| 6                                | Core CRM    | Ticket                 | ⏳ Domain ✅, Router + UI Missing                                          |
| **LEGAL DOMAIN (4)**             |
| 7                                | Legal       | Case/Matter            | ⬜ UI Missing                                                              |
| 8                                | Legal       | Appointment            | ⬜ UI Missing                                                              |
| 9                                | Legal       | Document               | ⬜ UI Missing                                                              |
| 10                               | Legal       | Email                  | ⬜ UI Missing                                                              |
| **AI/INTELLIGENCE (10)**         |
| 11                               | AI          | Lead Scoring Pipeline  | ✅ Complete                                                                |
| 12                               | AI          | AI Output Review       | ✅ All 7 Layers Complete                                                   |
| 13                               | AI          | Auto-Response          | ✅ Complete                                                                |
| 14                               | AI          | Sentiment Analysis     | ✅ Complete (PG-142, Sprint 7)                                             |
| 15                               | AI          | Churn Risk             | ⏳ UI Planned (PG-143, Sprint 7)                                           |
| 16                               | AI          | RAG/Search             | ✅ Complete (PG-144, Sprint 7)                                             |
| 17                               | AI          | AI Chain Versioning    | ⬜ UI Missing                                                              |
| 18                               | AI          | AI Agents Framework    | ⏳ UI Planned (PG-151, Sprint 8)                                           |
| 19                               | AI          | Next Best Action       | ⬜ All New                                                                 |
| 20                               | AI          | AI Monitoring/Drift    | ⏳ Router Complete (IFC-197 ✅), UI Planned (PG-146/151/152/153, Sprint 8) |
| **PLATFORM INFRASTRUCTURE (10)** |
| 21                               | Platform    | Notifications          | ⬜ Router Blocking                                                         |
| 22                               | Platform    | Analytics              | ⬜ Router Missing                                                          |
| 23                               | Platform    | Home Page              | ✅ Core Complete (PG-158 DnD pending)                                      |
| 24                               | Platform    | RBAC/Audit             | ⬜ UI Missing                                                              |
| 25                               | Platform    | Domain Events          | ⬜ All New                                                                 |
| 26                               | Platform    | Workflow Engine        | ⬜ Mostly New                                                              |
| 27                               | Platform    | Multi-Tenancy          | ⬜ UI Missing                                                              |
| 28                               | Platform    | Security/Secrets       | ⬜ Mostly New                                                              |
| 29                               | Platform    | Release Governance     | ⬜ All New                                                                 |
| 30                               | Platform    | Caching/Performance    | ⬜ Mostly New                                                              |
| **INTEGRATIONS (2)**             |
| 31                               | Integration | External APIs/Webhooks | ⬜ All New                                                                 |
| 32                               | Integration | Observability Stack    | ⬜ Mostly New                                                              |
| **BUSINESS WORKFLOWS (4)**       |
| 33                               | Workflow    | Lead Qualification     | ⬜ Partial                                                                 |
| 34                               | Workflow    | Smart Lead Routing     | ⬜ All New                                                                 |
| 35                               | Workflow    | DSAR Privacy           | ⬜ Mostly New                                                              |
| 36                               | Workflow    | Legal Case Workflows   | ⬜ Partial                                                                 |

---

## Complete Chains (Backend + Frontend) - 5 Total

```
Lead:          IFC-101 ──► validators ──► IFC-108 ──► IFC-107 ──► IFC-013 ──► IFC-004 ✅
Lead Scoring:  IFC-005 ──► IFC-020 ──► scoring.chain ──► IFC-164 ──► IFC-023 ✅
               IFC-085 ──► IFC-174 (Real Benchmark, validates IFC-085 accuracy) ✅
Auto-Response: IFC-028 ──► IFC-029 ──► IFC-149 ✅
Explainability:IFC-023 (part of Lead Scoring) ✅
AI Review:     IFC-128 ✅ ──► IFC-176 ✅ ──► IFC-177 ✅ ──► IFC-178 ✅ ──► IFC-179 ✅ ──► IFC-180 ✅ ──► IFC-181 ✅
```

## Chains In Progress - 1 Total

```
Home Page:     IFC-182 ✅ ──► IFC-195 ✅ ──► PG-156 ✅ ──► IFC-191 ✅ ──► PG-129 ✅ ──► PG-157 ✅ ──► PG-158 (DnD Reorder) ⏳
                                                                                         ──► PG-160 (AI Insights) ✅
                                                                                         ──► PG-166 (Lighthouse Audit) ✅
```

## Chains Missing UI Only (Router Exists) - 11 Total

```
Contact:       IFC-102 ──► validators ──► IFC-108 ──► IFC-107 ──► IFC-184 ⬜ ──► PG-133 ⬜
Account:       IFC-103 ──► validators ──► IFC-108 ──► IFC-107 ──► IFC-185 ✅ ──► PG-134 ✅
Opportunity:   IFC-104 ──► validators ──► IFC-108 ──► IFC-107 ──► IFC-186 ✅ ──► PG-135 ✅ ──► IFC-064 ✅
Task:          IFC-105 ──► validators ──► IFC-108 ──► IFC-107 ──► IFC-187 ✅ ──► PG-136 ✅
Case:          IFC-136 ──► validators ──► IFC-139 ──► cases.router ✅ ──► PG-138 ✅
Appointment:   IFC-137 ──► validators ──► IFC-138 ──► appointments.router ✅ ──► PG-139 ✅ ──► PG-154 ✅
Document:      IFC-152 ──► IFC-153 ──► IFC-154 ──► documents.router ✅ ──► PG-140 ✅
Email:         IFC-144 ──► IFC-173 ──► inbound.router ✅ ──► PG-141 ✅
Sentiment:     IFC-039 ──► timeline.router ✅ ──► PG-142 ✅
Churn:         IFC-095 ──► intelligence.router ✅ ──► PG-143 ⬜
RAG:           IFC-039 ──► IFC-155 ✅ ──► IFC-156 ✅ ──► PG-144 ✅
AI Settings:   IFC-086 ✅ ──► chain-version.router ✅ ──► PG-128 ⬜
Multi-Tenancy: IFC-098 ✅ ──► IFC-127 ✅ ──► Per-Tenant Keys ✅ ──► PG-106/107 ⬜
RBAC/Audit:    IFC-098 ✅ ──► IFC-124 ✅ ──► Settings Routers ✅ ──► PG-108/109/110/112/120 ⬜
AI Agents:     IFC-021 ✅ ──► IFC-139 ✅ ──► IFC-149 ✅ ──► agent.router ✅ ──► UI ⬜
```

## Chains Missing Router (BLOCKING) - 2 Total

```
Notifications: IFC-157 ✅ ──► IFC-170 ✅ ──► IFC-171 ✅ ──► IFC-183 ✅ ──► PG-130 ✅
Analytics:     ANALYTICS-001 ✅ ──► IFC-200 ✅ ──► IFC-190 ✅ ──► IFC-037 ⬜ ──► IFC-038 (UI) ⬜
```

## Chains Mostly/Completely New - 10 Total

```
Ticket:           IFC-188 ✅ ──► validators ✅ ──► adapter ✅ ──► IFC-189 ✅ ──► PG-137 ✅
NBA:              IFC-095 ✅ ──► IFC-039 ⬜ ──► nba.ts ⬜ ──► intelligence.router ──► PG-145 ⬜
AI Monitoring:    IFC-117 ✅ ──► AUTOMATION-002 ⬜ ──► TRACK-004 ⬜ ──► ai-monitoring.router ⬜ ──► PG-146 ⬜
Domain Events:    IFC-150 ⬜ ──► IFC-151 ⬜ ──► OutboxRepository ⬜ ──► events-worker ⬜
Workflow Engine:  IFC-028 ✅ ──► IFC-141 ⬜ ──► workflow.router ⬜ ──► IFC-031 ⬜ / PG-147 ⬜
Security/Secrets: EXC-SEC-001 ✅ ──► IFC-113 ⬜ ──► IFC-121 ⬜ ──► IFC-143 ⬜ ──► PG-120 ⬜
Security Dash:    EXC-SEC-001 ✅ ──► TRACK-005 (Security Dashboard UI) ✅
Release Gov:      IFC-130 ⬜ ──► IFC-132 ⬜ ──► IFC-133 ⬜ ──► IFC-134 ⬜ ──► IFC-112 ⬜
Caching/Perf:     IFC-007 ⬜ ──► IFC-123 ⬜ ──► IFC-033 ✅ ──► Performance Dashboard ⬜
External APIs:    IFC-099 ⬜ ──► IFC-114 ⬜ ──► IFC-036 ⬜ ──► webhooks.router ⬜ ──► PG-114/115 ⬜ | PG-171 ✅
Observability:    ENV-008-AI ✅ ──► IFC-116 ⬜ ──► IFC-142 ⬜ ──► Grafana ⬜ ──► TRACK-001 ✅ / TRACK-006 ✅
```

## Business Workflow Chains - 4 Total

```
Lead Qualification:   IFC-004 ✅ ──► IFC-005 ✅ ──► IFC-024 ⬜ ──► IFC-030 ⏳ ──► PG-132 ✅
Smart Routing:        IFC-030 ⏳ ──► routing-rules.ts ⬜ ──► routing.router ⬜ ──► PG-132 ✅
DSAR:                 IFC-140 ✅ ──► IFC-058 ⬜ ──► dsar.router ⬜ ──► PG-122/123 ⬜
Legal Case Workflows: IFC-136 ✅ ──► IFC-147 ✅ ──► IFC-141 ⬜ ──► Status Transitions ⬜ ──► PG-138 ✅
```

---

## Statistics

| Status                | Count  | Percentage |
| --------------------- | ------ | ---------- |
| ✅ Complete           | 4      | 11.1%      |
| ⏳ In Progress        | 2      | 5.6%       |
| ⬜ Missing UI         | 15     | 41.7%      |
| ⬜ Missing Router     | 2      | 5.6%       |
| ⬜ Mostly/All New     | 10     | 27.8%      |
| ⬜ Business Workflows | 3      | 8.3%       |
| **Total**             | **36** | **100%**   |

## Billing Portal Chain (Sprint 14)

```
IFC-198 (Billing Domain Core) ──┐
                                ├──→ PG-025 (Billing Portal) ──→ PG-027 (Invoices) ──→ PG-028 (Invoice Detail)
                                │                            └──→ PG-030 (Subscriptions) ✅
                                │
                                └──→ PG-026 (Checkout) ✅
```

- **PG-030**: Subscription management page with plan comparison,
  cancel/reactivation, proration estimates, reason selector
- Dependencies: PG-025 (tRPC billing router), IFC-198 (Billing domain aggregate)
- **PG-027**: Invoice list page with paginated table, PDF download/view, status
  badges, accessibility fixes
- Dependencies: PG-025 (tRPC billing router), IFC-198 (Invoice domain aggregate)
- **PG-028**: Invoice detail page — single-invoice fetch via
  `billing.getInvoice`, pay via `billing.payInvoice`, tax breakdown, invoice
  number, totals fix, link from invoice list
- Dependencies: PG-027 (Invoice list navigation), IFC-198 (StripeInvoice type +
  StripeInvoiceLineItem)
- Procedures: `billing.getInvoice` (query), `billing.payInvoice` (mutation)
- Adapter path: StripeInvoice → StripeInvoiceLineItem → mapToInvoice() →
  billing.router → invoice-detail.tsx

## Feedback Analytics Chain (Sprint 14)

```
IFC-090 (FeedbackSurvey Schema) ──┐
                                   ├──→ IFC-068 (Feedback Analytics Dashboard)
IFC-096 (Analytics Foundation)  ──┘

IFC-068 Layer Stack:
  Domain: SurveyConstants.ts (NPS/CSAT/CES calc, transitions, events)
  → Validators: feedback-survey.ts (Zod schemas)
  → Application: FeedbackSurveyRepositoryPort + FeedbackSurveyAnalyticsService
  → Adapters: PrismaFeedbackSurveyRepository ($queryRaw, date_trunc, tenant isolation)
  → API: feedbackSurvey.router.ts (getDashboardStats, getNPSTrend, getSentimentBreakdown, exportData)
  → Container: container.ts + context.ts (feedbackSurvey service wiring)
  → Web: hooks.ts + feedback/page.tsx + NpsGauge + NpsTrendChart + SentimentDistributionChart + NpsBreakdownBar
  → Sidebar: analytics.ts (Feedback Analytics item at /analytics/feedback)
  → Export: csv.ts (exportFeedbackSurveysToCSV) + pdf.ts (exportFeedbackReportToPDF)
```

- **IFC-068**: Full-stack feedback analytics dashboard with NPS gauge, trend
  charts, sentiment distribution, period/type filters, CSV/PDF export
- Dependencies: IFC-090 (FeedbackSurvey Prisma model), IFC-096 (Analytics
  sidebar + export infrastructure)

## Project Tracker Internal Dependencies

```
apps/project-tracker/lib/risk-domain.ts (TRACK-003)
  ← apps/project-tracker/app/api/tracking/risks/route.ts
  ← apps/project-tracker/components/tracking/RiskRegister.tsx
  ← apps/project-tracker/__tests__/tracking/RiskRegister.test.ts
  ← apps/project-tracker/__tests__/tracking/risk-api.test.ts
```

---

## 12. Developer Portal

### Documentation Pages Chain

```
PG-032 (Docs Index) ✅ ──► PG-034 (Webhooks Docs) ✅
                     └──► PG-033 (API Playground) ⬜
                     └──► PG-035 (Changelog) ✅
                     └──► PG-036 (SDK Guides) ✅
                     └──► PG-037 (CLI Docs) ✅
                     └──► PG-038 (Auth Guides) ✅
                     └──► PG-169 (Developer Guides) ✅
                     └──► PG-170 (Architecture Docs) ✅

PG-039 (Dev Apps) ✅ ──► PG-040 (New Dev App) ✅
                   └──► PG-041 (App Detail) ✅ ──► PG-042 (App Edit) ✅
```

---

## 13. Support / Help Center

### Help Center Chain

```
PG-043 (Help Center Index) ✅ ──► PG-044 (Help Search) ✅
                             └──► PG-045 (Article Detail) ⬜
```

---

## Accessibility Compliance Chain (Sprint 15)

```
DOC-007 (Gap Assessment) ─── COMPLETE
  └── DOC-008 (VPAT + CI Enforcement) ─── COMPLETE
        Artifacts:
          docs/compliance/vpat-2.5.md
          docs/compliance/wcag-conformance-statement.md
          tests/a11y/axe-core.spec.ts
          tests/a11y/vitest.config.ts
          tests/a11y/setup.ts
          docs/planning/adr/ADR-038-accessibility-architecture.md
        Config changes:
          lighthouserc.js (accessibility: warn→error)
          audit-matrix.yml (lighthouse-ci: tier 2, required)
          .github/workflows/pr-checks.yml (4 public URLs, configPath)
          apps/web/eslint.config.mjs (6 jsx-a11y rules: warn→error)
        └── DOC-012 (Quarterly Review Cadence) ─── COMPLETE
              Artifacts:
                docs/compliance/quarterly-a11y-review-template.md
              Consumers:
                A11Y-REVIEW-001 (Sprint 20) — first quarterly review instance
              Downstream:
                DOC-013 (ADR-038 Documentation Maintenance section) — COMPLETE
```

---

## Information Architecture Documentation Chain (Sprint 14)

```
DOC-002 (Sitemap Update) ─── COMPLETE
  ├── DOC-003 (PAGE_MAP_AND_FLOWS.md) ─── COMPLETE
  ├── DOC-004 (ui-flow-mapping.md) ─── COMPLETE
  ├── DOC-005 (page-registry.md) ─── COMPLETE
  │     Artifacts:
  │       docs/design/page-registry.md (103 routes, 20 sections)
  │     Regression Guard:
  │       apps/web/src/app/__tests__/sitemap-reconciliation.test.ts (TC-32)
  └── DOC-006 (Unified IA Reference) ─── BACKLOG
        Depends: DOC-002 + DOC-003 + DOC-004 + DOC-005
        Artifact: docs/design/information-architecture.md
```

---

## Notifications Dependency Chain

```
IFC-137 (NotificationService MVP)
  └── IFC-157 (MockNotificationServiceAdapter) ✅
        └── IFC-223 (Email Outbound Adapter — RealNotificationServiceAdapter) ✅
              Wire SendGridProvider to container.ts via env-based selection
```

## Critical Blockers

1. **IFC-183 (Notifications Router)** - Blocking PG-116 and PG-130
2. ~~**IFC-190 (Analytics Router)** - Blocking Analytics Dashboard~~ ✅ RESOLVED
   — Router complete, IFC-037 (Design) → IFC-038 (UI) next
