# Business Workflows Dependency Chain

**Generated**: 2026-02-04 **Purpose**: Hexagonal architecture dependency chains
for Business Workflow features

---

## Legend

```
Status Indicators:
  ✅ = Completed
  ⏳ = In Progress
  ⬜ = Backlog/Not Started
  ❌ = Missing (needs creation)

Hexagonal Layers:
  Domain     -> Core business logic
  Validators -> Zod schemas
  Application-> Use cases, ports
  Database   -> Prisma schema, migrations
  Adapters   -> Repository implementations
  API        -> tRPC routers
  UI         -> Next.js pages
```

---

## 1. Lead Qualification Workflow

### Overview

| Layer       | Task ID | Status | Description            |
| ----------- | ------- | ------ | ---------------------- |
| Domain      | IFC-004 | ✅     | Lead Capture           |
| Validators  | lead.ts | ✅     | Lead schemas           |
| Application | IFC-005 | ✅     | AI Lead Scoring        |
| Adapters    | IFC-024 | ⬜     | Human-in-Loop Feedback |
| API         | IFC-030 | ⬜     | Smart Routing          |
| UI          | PG-132  | ✅     | Routing UI             |

### Dependency Diagram

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
    │  Feedback        │                                         │      ⬜          │
    │      ⬜          │                                         └────────┬─────────┘
    └────────┬─────────┘                                                  │
             │                                                             │
             └─────────────────────────────┬───────────────────────────────┘
                                           │
                                           ▼
                                 ┌──────────────────┐
                                 │    PG-132        │
                                 │  Routing UI      │
                                 │      ✅          │
                                 └──────────────────┘
```

### Dependency Chain

```
IFC-004 (Capture) ✅ ──► IFC-005 (Scoring) ✅ ──┬──► IFC-024 (Feedback) ⬜ ──► PG-132 (Routing UI) ✅
                                               │
                                               └──► IFC-030 (Routing) ⬜ ──────────────────────────┘
```

---

## 2. Smart Lead Routing

### Overview

| Layer       | Task ID          | Status | Description                   |
| ----------- | ---------------- | ------ | ----------------------------- |
| Domain      | IFC-030          | ⬜     | Smart Lead Routing            |
| Validators  | routing-rules.ts | ⬜     | Routing schemas               |
| Application | Load Balancer    | ⬜     | Assignment logic              |
| Database    | IFC-017          | ⬜     | Routing tables                |
| Adapters    | -                | ⬜     | Routing adapters              |
| API         | routing.router   | ⬜     | Routing router                |
| UI          | PG-132           | ✅     | Routing Config, SLA Dashboard |

### Dependency Diagram

```
                                    ┌──────────────────┐
                                    │    IFC-030       │
                                    │  Smart Lead      │
                                    │  Routing         │
                                    │      ⬜          │
                                    └────────┬─────────┘
                                             │
              ┌──────────────────────────────┼──────────────────────────────┐
              │                              │                              │
              ▼                              ▼                              ▼
    ┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
    │  routing-rules.ts│          │  Load Balancer   │          │    IFC-017       │
    │  Validators      │          │  (Assignment)    │          │  Database        │
    │      ⬜          │          │      ⬜          │          │  (routing tbl)   │
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
```

### Dependency Chain

```
IFC-030 (Routing) ⬜ ──┬──► routing-rules.ts (Val) ⬜ ──► routing.router ⬜ ──┬──► PG-132 (Config UI) ✅
                      ├──► Load Balancer ⬜ ────────────────────────────────┴──► SLA Dashboard ⬜
                      └──► IFC-017 (Database) ⬜ ─────────────────────────────────────────────────┘
```

---

## 3. DSAR Workflow (Privacy Compliance)

### Overview

| Layer       | Task ID          | Status | Description                   |
| ----------- | ---------------- | ------ | ----------------------------- |
| Domain      | IFC-140          | ✅     | Data Governance               |
| Validators  | dsar.ts          | ⬜     | DSAR schemas                  |
| Application | IFC-058          | ⬜     | Data Retention Policies       |
| Adapters    | Retention Engine | ⬜     | Policy engine                 |
| API         | dsar.router      | ⬜     | DSAR router                   |
| UI          | PG-122, PG-123   | ⬜     | Privacy Export, Data Deletion |

### Dependency Diagram

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
    │  Policies        │          │      ⬜          │          │      ⬜          │
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
```

### Dependency Chain

```
IFC-140 (Governance) ✅ ──┬──► IFC-058 (Retention) ⬜ ──► dsar.router ⬜ ──┬──► PG-122 (Export) ⬜
                          ├──► dsar.ts (Val) ⬜ ─────────────────────────┴──► PG-123 (Deletion) ⬜
                          └──► Retention Engine ⬜ ────────────────────────────────────────────────┘
```

---

## 4. Legal Case Workflows

### Overview

| Layer       | Task ID | Status | Description           |
| ----------- | ------- | ------ | --------------------- |
| Domain      | IFC-136 | ✅     | Case Domain           |
| Validators  | case.ts | ✅     | Case schemas          |
| Application | IFC-147 | ✅     | Deadline Tracking     |
| Adapters    | IFC-141 | ⬜     | LangGraph Integration |
| API         | IFC-159 | ✅     | Case Timeline         |
| UI          | PG-138  | ⬜     | Case Pages            |

### Dependency Diagram

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
```

### Dependency Chain

```
IFC-136 (Case) ✅ ──┬──► IFC-147 (Deadlines) ✅ ──► Case Status Transitions ⬜ ──┬──► PG-138 (UI) ⬜
                    ├──► IFC-141 (LangGraph) ⬜ ──────────────────────────────────┴──► Deadline Alerts ⬜
                    └──► IFC-159 (Timeline) ✅ ──────────────────────────────────────────────────────┘
```

---

## Summary

| Chain                | Status        | Blocking Issues                      |
| -------------------- | ------------- | ------------------------------------ |
| Lead Qualification   | ⬜ Partial    | IFC-024, IFC-030 need implementation |
| Smart Lead Routing   | ⬜ All New    | IFC-030 core routing not started     |
| DSAR Workflow        | ⬜ Mostly New | IFC-058, dsar.router needed          |
| Legal Case Workflows | ⬜ Partial    | IFC-141, PG-138 needed               |

### Prerequisites for Implementation

1. **Lead Qualification**:
   - IFC-004: ✅ Already complete
   - IFC-005: ✅ Already complete
   - IFC-024: Human feedback loop needed
   - IFC-030: Routing rules needed

2. **Smart Lead Routing**:
   - IFC-030: Full routing implementation
   - Database schema for routing rules
   - SLA monitoring infrastructure

3. **DSAR Workflow**:
   - IFC-140: ✅ Already complete
   - IFC-058: Data retention policy implementation
   - Retention policy engine
   - GDPR compliance verification

4. **Legal Case Workflows**:
   - IFC-136: ✅ Already complete
   - IFC-147: ✅ Already complete
   - IFC-159: ✅ Already complete
   - IFC-141: LangGraph workflow integration
   - PG-138: Case management UI
