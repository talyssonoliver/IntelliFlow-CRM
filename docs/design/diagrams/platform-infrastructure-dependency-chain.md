# Platform Infrastructure Dependency Chain

**Generated**: 2026-02-04 **Purpose**: Hexagonal architecture dependency chains
for Platform Infrastructure features

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

## 1. Workflow Engine (LangGraph Orchestration)

### Overview

| Layer       | Task ID         | Status | Description                     |
| ----------- | --------------- | ------ | ------------------------------- |
| Domain      | IFC-028         | ✅     | Workflow Domain (State Machine) |
| Validators  | workflow.ts     | ✅     | Workflow schemas                |
| Application | IFC-141         | ⬜     | LangGraph Integration           |
| Database    | IFC-017         | ⬜     | Workflow tables                 |
| Adapters    | -               | ⬜     | Workflow adapters               |
| API         | workflow.router | ⬜     | Workflow router                 |
| UI          | IFC-031, PG-147 | ⬜     | Visual Builder, Workflow List   |

### Dependency Diagram

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
              │      ⬜          │              │      ⬜          │
              └──────────────────┘              └──────────────────┘
```

### Dependency Chain

```
IFC-028 (Domain) ✅ ──┬──► IFC-141 (LangGraph) ⬜ ──► workflow.router ⬜ ──┬──► IFC-031 (Builder) ⬜
                      ├──► workflow.ts (Val) ✅ ─────────────────────────┴──► PG-147 (List UI) ⬜
                      └──► IFC-017 (Database) ⬜ ─────────────────────────────────────────────────┘
```

---

## 2. Multi-Tenancy & Isolation (SaaS Infrastructure)

### Overview

| Layer       | Task ID          | Status | Description            |
| ----------- | ---------------- | ------ | ---------------------- |
| Domain      | IFC-098          | ✅     | RBAC System            |
| Validators  | tenant.ts        | ✅     | Tenant schemas         |
| Application | IFC-127          | ✅     | Tenant Isolation (RLS) |
| Database    | IFC-140          | ✅     | Data Governance        |
| Adapters    | Per-Tenant Keys  | ✅     | Encryption per tenant  |
| API         | Settings routers | ✅     | Settings router        |
| UI          | PG-106, PG-107   | ⬜     | Organization, Billing  |

### Dependency Diagram

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
```

### Dependency Chain

```
IFC-098 (RBAC) ✅ ──┬──► IFC-127 (Tenant RLS) ✅ ──► Per-Tenant Keys ✅ ──┬──► PG-106 (Org Settings) ⬜
                    │                                                     │
                    └──► IFC-140 (Governance) ✅ ────────────────────────┴──► PG-107 (Billing) ⬜
```

---

## 3. Security & Secrets Management (Vault)

### Overview

| Layer       | Task ID     | Status | Description                |
| ----------- | ----------- | ------ | -------------------------- |
| Domain      | EXC-SEC-001 | ✅     | HashiCorp Vault Setup      |
| Validators  | -           | -      | N/A                        |
| Application | IFC-113     | ⬜     | Encryption at Rest/Transit |
| Adapters    | IFC-121     | ⬜     | Secret Rotation            |
| API         | IFC-143     | ⬜     | Threat Model STRIDE        |
| UI          | PG-120      | ⬜     | Security Settings UI       |

### Dependency Diagram

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
```

### Dependency Chain

```
EXC-SEC-001 (Vault) ✅ ──┬──► IFC-113 (Encryption) ⬜ ──► IFC-125 (Guardrails) ✅ ──► PG-120 (UI) ⬜
                         ├──► IFC-121 (Rotation) ⬜ ────────────────────────────────────────────────┘
                         └──► IFC-143 (Threat Model) ⬜ ────────────────────────────────────────────┘
```

---

## 4. Release & Deployment Governance (CI/CD)

### Overview

| Layer       | Task ID | Status | Description           |
| ----------- | ------- | ------ | --------------------- |
| Domain      | IFC-130 | ⬜     | Promotion Workflow    |
| Validators  | -       | -      | N/A                   |
| Application | IFC-132 | ⬜     | SBOM Generation       |
| Adapters    | IFC-133 | ⬜     | Artifact Signing      |
| API         | IFC-134 | ⬜     | Container Scanning    |
| UI          | IFC-112 | ⬜     | Blue/Green Deployment |

### Dependency Diagram

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
```

### Dependency Chain

```
IFC-130 (Promotion) ⬜ ──┬──► IFC-132 (SBOM) ⬜ ──► IFC-112 (Blue/Green) ⬜ ──► Release Dashboard ⬜
                        ├──► IFC-133 (Signing) ⬜ ──────────────────────────────────────────────────┘
                        └──► IFC-134 (Scanning) ⬜ ─────────────────────────────────────────────────┘
```

---

## 5. Caching & Performance (Optimization)

### Overview

| Layer       | Task ID    | Status | Description                |
| ----------- | ---------- | ------ | -------------------------- |
| Domain      | IFC-007    | ⬜     | Cache Strategy (Redis/CDN) |
| Validators  | -          | -      | N/A                        |
| Application | IFC-123    | ⬜     | Query Optimization         |
| Adapters    | ENV-009-AI | ✅     | Lighthouse Scores          |
| API         | IFC-033    | ✅     | Load Testing (k6)          |
| UI          | Dashboard  | ⬜     | Performance Dashboard      |

### Dependency Diagram

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
```

### Dependency Chain

```
IFC-007 (Cache) ⬜ ──┬──► IFC-123 (Query Opt) ⬜ ──► IFC-033 (Load Test) ✅ ──► Performance Dashboard ⬜
                    │
                    └──► ENV-009-AI (Lighthouse) ✅ ─────────────────────────────────────────────────┘
```

---

## 6. Domain Events Infrastructure

### Overview

| Layer       | Task ID          | Status | Description              |
| ----------- | ---------------- | ------ | ------------------------ |
| Domain      | IFC-150          | ⬜     | Event Contracts & Outbox |
| Validators  | domain-events.ts | ⬜     | Event schemas            |
| Application | IFC-151          | ⬜     | Consumer Framework       |
| Adapters    | OutboxRepository | ⬜     | Outbox repository        |
| API         | -                | -      | N/A (internal)           |
| UI          | -                | -      | N/A (background)         |

### Dependency Diagram

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
    │  Framework       │                                         │      ⬜          │
    │      ⬜          │                                         └────────┬─────────┘
    └────────┬─────────┘                                                  │
             │                                                             │
             └─────────────────────────────┬───────────────────────────────┘
                                           │
                                           ▼
                                 ┌──────────────────┐
                                 │  OutboxRepository│
                                 │  (Adapter)       │
                                 │      ⬜          │
                                 └────────┬─────────┘
                                          │
                                          ▼
                                 ┌──────────────────┐
                                 │events-worker     │
                                 │  (Background)    │
                                 │      ⬜          │
                                 └──────────────────┘
```

### Dependency Chain

```
IFC-150 (Contracts) ⬜ ──┬──► IFC-151 (Consumer) ⬜ ──► OutboxRepository ⬜ ──► events-worker ⬜
                        │
                        └──► domain-events.ts (Val) ⬜ ───────────────────────────────────────┘
```

---

## Summary

| Chain               | Status        | Blocking Issues                  |
| ------------------- | ------------- | -------------------------------- |
| Workflow Engine     | ⬜ Mostly New | IFC-141 LangGraph not started    |
| Multi-Tenancy       | ⬜ UI Missing | PG-106, PG-107 needed            |
| Security/Secrets    | ⬜ Mostly New | IFC-113, IFC-121, IFC-143 needed |
| Release Governance  | ⬜ All New    | All tasks not started            |
| Caching/Performance | ⬜ Mostly New | IFC-007, IFC-123 needed          |
| Domain Events       | ⬜ All New    | IFC-150, IFC-151 needed          |

### Prerequisites for Implementation

1. **Workflow Engine**:
   - IFC-028: ✅ Already complete
   - IFC-141: LangGraph integration needed
   - PG-147: Workflow status UI needed

2. **Multi-Tenancy**:
   - Backend: ✅ All complete
   - PG-106, PG-107: Organization and billing UI needed

3. **Security/Secrets**:
   - EXC-SEC-001: ✅ Vault already setup
   - IFC-113, IFC-121, IFC-143: Security implementations needed

4. **Release Governance**:
   - All tasks need implementation
   - CI/CD pipeline integration required

5. **Caching/Performance**:
   - IFC-033: ✅ Load testing complete
   - IFC-007, IFC-123: Caching strategy needed

6. **Domain Events**:
   - IFC-150, IFC-151: Event infrastructure needed
   - OutboxRepository: Transactional outbox pattern
