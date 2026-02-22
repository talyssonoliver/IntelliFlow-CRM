# Integrations Dependency Chain

**Generated**: 2026-02-04 **Purpose**: Hexagonal architecture dependency chains
for Integration features

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

## 1. External APIs & Webhooks

### Overview

| Layer       | Task ID         | Status | Description                         |
| ----------- | --------------- | ------ | ----------------------------------- |
| Domain      | IFC-099         | ⬜     | Webhook Framework                   |
| Validators  | webhook.ts      | ⬜     | Webhook schemas                     |
| Application | IFC-114         | ⬜     | Rate Limiting & DDoS                |
| Adapters    | -               | ⬜     | Webhook adapters                    |
| API         | webhooks.router | ⬜     | Webhook router                      |
| UI          | PG-114, PG-115  | ⬜     | Integration Catalog, Webhook Config |
| UI          | PG-171          | ✅     | Integration Resources Page          |

### Dependency Diagram

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
    │  & DDoS          │          │      ⬜          │          │      ⬜          │
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
```

### Dependency Chain

```
IFC-099 (Webhooks) ⬜ ──┬──► IFC-114 (Rate Limit) ⬜ ──► webhooks.router ⬜ ──┬──► PG-114 (Catalog) ⬜
                       ├──► webhook.ts (Val) ⬜ ──────────────────────────────┴──► PG-115 (Config) ⬜
                       └──► IFC-036 (WhatsApp) ⬜ ────────────────────────────────────────────────────┘
```

---

## 2. Observability Stack

### Overview

| Layer       | Task ID              | Status | Description               |
| ----------- | -------------------- | ------ | ------------------------- |
| Domain      | ENV-008-AI           | ✅     | OpenTelemetry Setup       |
| Validators  | traces.ts            | ⬜     | Trace schemas             |
| Application | IFC-116              | ⬜     | Metrics Collection        |
| Adapters    | IFC-142              | ⬜     | Alerting & SLOs           |
| API         | -                    | ⬜     | Metrics router            |
| UI          | TRACK-001, TRACK-006 | 🔶     | Status ✅ & Build ⬜ Dashboards |

### Dependency Diagram

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
    │  Collection      │          │  & SLOs          │          │      ⬜          │
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
              │      ✅          │              │      ⬜          │
              └──────────────────┘              └──────────────────┘
```

### Dependency Chain

```
ENV-008-AI (OTel) ✅ ──┬──► IFC-116 (Metrics) ⬜ ──► Grafana Dashboards ⬜ ──┬──► TRACK-001 (Status) ✅
                       ├──► IFC-142 (Alerting) ⬜ ────────────────────────────┴──► TRACK-006 (Build) ⬜
                       └──► traces.ts (Val) ⬜ ───────────────────────────────────────────────────────┘
```

---

## Summary

| Chain                  | Status        | Blocking Issues                      |
| ---------------------- | ------------- | ------------------------------------ |
| External APIs/Webhooks | ⬜ All New    | IFC-099, IFC-114 need implementation |
| Observability Stack    | ⬜ Mostly New | IFC-116, IFC-142 need implementation |

### Prerequisites for Implementation

1. **External APIs/Webhooks**:
   - IFC-099: Webhook Framework design
   - IFC-114: Rate limiting infrastructure
   - IFC-036: WhatsApp Business API integration

2. **Observability Stack**:
   - ENV-008-AI: ✅ Already complete
   - IFC-116: Metrics collection implementation
   - IFC-142: Alerting rules and SLO definitions
