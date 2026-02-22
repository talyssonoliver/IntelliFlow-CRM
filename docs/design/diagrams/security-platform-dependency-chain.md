# Security & Platform Infrastructure - Dependency Chain Analysis

**Generated**: 2026-02-03 **Purpose**: Ensure complete hexagonal architecture
implementation with no orphaned tasks

---

## Executive Summary

The **Security & Platform** domain covers RBAC, Audit Logging, Encryption,
Notifications, Events, and Analytics. Backend infrastructure is **mostly
complete**, but several critical routers are **missing or incomplete**.

| Feature       | Domain        | Application | Adapter     | Router      | Frontend       | Status          |
| ------------- | ------------- | ----------- | ----------- | ----------- | -------------- | --------------- |
| RBAC          | IFC-098       | IFC-098     | IFC-098     | Partial     | PG-108-111     | PARTIAL         |
| Audit Log     | IFC-124       | IFC-124     | IFC-124     | Complete    | PG-112         | PARTIAL         |
| Encryption    | IFC-113       | IFC-113     | IFC-113     | N/A         | PG-120         | PARTIAL         |
| Notifications | IFC-157       | IFC-157     | IFC-170/171 | **MISSING** | PG-116, PG-130 | **BLOCKED**     |
| Events        | IFC-150       | IFC-151     | IFC-150     | Complete    | N/A            | COMPLETE        |
| Home Page     | IFC-182       | IFC-182     | IFC-182     | Complete    | PG-129         | ROUTER COMPLETE |
| Analytics     | ANALYTICS-001 | IFC-37      | IFC-38      | IFC-200     | Dashboard      | COMPLETE        |

---

## Full Dependency Diagram

```
                    ┌─────────────────────────────────────────────────────────────────────────┐
                    │                    SECURITY & PLATFORM INFRASTRUCTURE                    │
                    │           RBAC, Audit, Encryption, Notifications, Events, Analytics     │
                    └─────────────────────────────────────────────────────────────────────────┘

    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  SECURITY FOUNDATION (Sprint 0-3)                                         ✅ COMPLETE    ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

    ┌─────────────────────────┐    ┌─────────────────────────┐    ┌─────────────────────────┐
    │      EXC-SEC-001        │    │       IFC-072           │    │       IFC-098           │
    │  Secrets Management     │    │   Zero Trust Model      │    │   RBAC/ABAC System      │
    │                         │    │                         │    │                         │
    │  - HashiCorp Vault      │    │  - Zero trust design    │    │  - Role definitions     │
    │  - Access policies      │    │  - Network policies     │    │  - Permission grants    │
    │  - Secret rotation      │    │  - mTLS ready           │    │  - ABAC attributes      │
    │                         │    │                         │    │  - Audit trail          │
    │  Status: COMPLETED ✅   │    │  Status: COMPLETED ✅   │    │                         │
    │  Sprint: 0              │    │  Sprint: 3              │    │  Status: COMPLETED ✅   │
    │                         │    │                         │    │  Sprint: 5              │
    └─────────────────────────┘    └────────────┬────────────┘    └────────────┬────────────┘
                                                │                              │
                                                └──────────────┬───────────────┘
                                                               │
    ╔══════════════════════════════════════════════════════════╩════════════════════════════════╗
    ║  DATA PROTECTION LAYER (Sprint 7-10)                                      ✅ COMPLETE    ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

    ┌─────────────────────────┐    ┌─────────────────────────┐    ┌─────────────────────────┐
    │       IFC-113           │    │       IFC-114           │    │       IFC-127           │
    │  Data Encryption        │    │   Rate Limiting         │    │  Tenant Isolation       │
    │                         │    │                         │    │                         │
    │  - At-rest encryption   │    │  - API rate limits      │    │  - RLS policies         │
    │  - In-transit (TLS)     │    │  - DDoS protection      │    │  - Application layer    │
    │  - Key rotation         │    │  - Upstash Redis        │    │  - Zero cross-tenant    │
    │                         │    │                         │    │                         │
    │  Status: COMPLETED ✅   │    │  Status: COMPLETED ✅   │    │  Status: COMPLETED ✅   │
    │  Sprint: 10             │    │  Sprint: 7              │    │  Sprint: 10             │
    └─────────────────────────┘    └─────────────────────────┘    └─────────────────────────┘

    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  AUDIT & COMPLIANCE LAYER                                                 ✅ COMPLETE    ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

                    ┌─────────────────────────────┐         ┌─────────────────────────────┐
                    │        IFC-124              │         │        IFC-140              │
                    │   Audit Logging             │         │   Data Governance           │
                    │                             │         │                             │
                    │  - Event aggregation        │         │  - DSAR workflows           │
                    │  - Encrypted storage        │         │  - Retention policies       │
                    │  - Compliance reports       │         │  - Legal hold               │
                    │  - GDPR, SOC2, ISO 27001    │         │                             │
                    │                             │         │  Status: COMPLETED ✅       │
                    │  Status: COMPLETED ✅       │ ───────►│  Sprint: 11                 │
                    │  Sprint: 9                  │         │                             │
                    └─────────────────────────────┘         └─────────────────────────────┘

    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  RESILIENCE & INFRASTRUCTURE                                              ✅ COMPLETE    ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

    ┌─────────────────────────┐    ┌─────────────────────────┐    ┌─────────────────────────┐
    │       IFC-122           │    │       IFC-121           │    │       IFC-143           │
    │  Circuit Breaker        │    │   Secret Rotation       │    │  Threat Modeling        │
    │                         │    │                         │    │                         │
    │  - Retry policies       │    │  - Periodic rotation    │    │  - Penetration tests    │
    │  - Fallback handling    │    │  - Dependency updates   │    │  - Security review      │
    │  - Degradation modes    │    │  - Vulnerability scans  │    │  - Attack surface       │
    │                         │    │                         │    │                         │
    │  Status: COMPLETED ✅   │    │  Status: COMPLETED ✅   │    │  Status: COMPLETED ✅   │
    │  Sprint: 7              │    │  Sprint: 10             │    │  Sprint: 11             │
    └─────────────────────────┘    └─────────────────────────┘    └─────────────────────────┘
```

---

## Events & Notifications Infrastructure

```
    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  DOMAIN EVENTS INFRASTRUCTURE                                             ✅ COMPLETE    ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

                    ┌─────────────────────────────┐         ┌─────────────────────────────┐
                    │        IFC-150              │         │        IFC-151              │
                    │   Domain Events             │         │   Event Consumers           │
                    │                             │         │                             │
                    │  - Event contracts          │         │  - Retry policies           │
                    │  - Versioning               │         │  - Dead letter queue        │
                    │  - Outbox pattern           │         │  - Exponential backoff      │
                    │  - Idempotency              │         │  - DLQ triage runbook       │
                    │                             │         │                             │
                    │  Status: COMPLETED ✅       │ ───────►│  Status: COMPLETED ✅       │
                    │  Sprint: 8                  │         │  Sprint: 9                  │
                    │  Files:                     │         │                             │
                    │  - docs/events/contracts    │         │                             │
                    │  - adapters/events/*        │         │                             │
                    └─────────────────────────────┘         └─────────────────────────────┘

    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  NOTIFICATION SYSTEM                                                  ⚠️ ROUTER MISSING  ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

    ┌─────────────────────────────────────────────────────────────────────────────────────────┐
    │                           NOTIFICATION SERVICE CHAIN                                     │
    └─────────────────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────┐    ┌─────────────────────────┐    ┌─────────────────────────┐
    │       IFC-157           │    │       IFC-170           │    │       IFC-171           │
    │  Notification Service   │    │   SMS Channel           │    │   Webhook Channel       │
    │                         │    │                         │    │                         │
    │  - Unified delivery     │    │  - Twilio integration   │    │  - Webhook delivery     │
    │  - Email channel        │    │  - Template support     │    │  - Retry logic          │
    │  - Preferences          │    │  - Delivery tracking    │    │  - Signature verify     │
    │                         │    │                         │    │                         │
    │  Status: COMPLETED ✅   │    │  Status: COMPLETED ✅   │    │  Status: COMPLETED ✅   │
    │  Sprint: 11             │    │  Sprint: 12             │    │  Sprint: 12             │
    └────────────┬────────────┘    └────────────┬────────────┘    └────────────┬────────────┘
                 │                              │                              │
                 └──────────────────────────────┴──────────────────────────────┘
                                                │
                                                ▼
                              ┌─────────────────────────────────────────┐
                              │          ❌ IFC-183 MISSING             │
                              │     Notifications tRPC Router           │
                              │                                         │
                              │  Required endpoints:                    │
                              │  - notifications.list                   │
                              │  - notifications.getUnreadCount         │
                              │  - notifications.markAsRead             │
                              │  - notifications.markAllAsRead          │
                              │  - notifications.delete                 │
                              │  - notifications.getPreferences         │
                              │  - notifications.updatePreferences      │
                              │  - notifications.onNew (subscription)   │
                              │                                         │
                              │  Status: BACKLOG ❌                     │
                              │  Sprint: 13                             │
                              │  BLOCKING: PG-130 (Notifications Inbox) │
                              └─────────────────────────────────────────┘
                                                │
                                                ▼
    ┌─────────────────────────────────────────────────────────────────────────────────────────┐
    │                           FRONTEND - BLOCKED                                             │
    └─────────────────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────┐                            ┌─────────────────────────┐
    │       PG-116            │                            │       PG-130            │
    │  Notification Prefs UI  │                            │  Notifications Inbox    │
    │                         │                            │                         │
    │  - Channel preferences  │                            │  - Notification list    │
    │  - Frequency settings   │                            │  - Mark as read         │
    │  - Quiet hours          │                            │  - Delete/dismiss       │
    │                         │                            │  - Real-time updates    │
    │  Status: BACKLOG        │                            │                         │
    │  Sprint: 27             │                            │  Status: BACKLOG        │
    │  Deps: IFC-157 ✅       │                            │  Sprint: 14             │
    │                         │                            │  Deps: IFC-183 ❌       │
    └─────────────────────────┘                            └─────────────────────────┘
```

---

## Home Page & Analytics

```
    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  HOME PAGE CHAIN                                                       ⚠️ 75% COMPLETE   ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

                    ┌─────────────────────────────┐         ┌─────────────────────────────┐
                    │        IFC-182              │         │        PG-129               │
                    │   Home Page tRPC Router     │         │   Authenticated Home Page   │
                    │                             │         │                             │
                    │  Endpoints:                 │         │  Components:                │
                    │  - home.getWelcomeSummary   │         │  - Welcome message          │
                    │  - home.getAIInsights       │ ───────►│  - AI insights widget       │
                    │  - home.getActivityFeed     │         │  - Activity feed            │
                    │  - home.getDailyGoal        │         │  - Daily goal tracker       │
                    │  - home.getPinnedItems      │         │  - Pinned items             │
                    │  - home.pinItem             │         │                             │
                    │  - home.unpinItem           │         │  Status: IN PROGRESS        │
                    │                             │         │  Sprint: 14                 │
                    │  Status: 75% COMPLETE ⚠️    │         │  Progress: 60%              │
                    │  Sprint: 13                 │         │                             │
                    └─────────────────────────────┘         └─────────────────────────────┘

    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  ANALYTICS CHAIN                                                       ⚠️ INCOMPLETE     ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

    ┌─────────────────────────┐    ┌─────────────────────────┐    ┌─────────────────────────┐
    │     ANALYTICS-001       │    │       IFC-037           │    │       IFC-038           │
    │  Privacy Analytics      │    │   Dashboard Design      │    │   Implementation        │
    │                         │    │                         │    │                         │
    │  - Event schema         │    │  - KPI definitions      │    │  - Real-time updates    │
    │  - Privacy baseline     │    │  - Figma mockups        │    │  - Supabase integration │
    │  - Collection config    │    │  - Stakeholder review   │    │  - Charts               │
    │                         │    │                         │    │                         │
    │  Status: COMPLETED ✅   │    │  Status: BACKLOG ⚠️     │    │  Status: BACKLOG ⚠️     │
    │  Sprint: 0              │    │  Sprint: 21             │    │  Sprint: 22             │
    └─────────────────────────┘    └─────────────────────────┘    └─────────────────────────┘
                                                │
                                                ▼
                              ┌─────────────────────────────────────────┐
                              │          ✅ COMPLETE (IFC-200)          │
                              │     Analytics tRPC Router               │
                              │                                         │
                              │  Implemented endpoints:                 │
                              │  - analytics.dealsWonTrend              │
                              │  - analytics.growthTrends               │
                              │  - analytics.trafficSources             │
                              │  - analytics.recentActivity             │
                              │  - analytics.leadStats                  │
                              │  - analytics.exportMetrics              │
                              │  - analytics.exportConversionFunnel     │
                              │                                         │
                              │  Status: COMPLETED ✅                   │
                              │  Sprint: 29                             │
                              └─────────────────────────────────────────┘
```

---

## Settings Pages Status Matrix

```
    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  SETTINGS PAGES (PG-104 to PG-123)                                                        ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

    ┌─────────────────────────────────────────────────────────────────────────────────────────┐
    │  PAGE       │ DESCRIPTION          │ BACKEND ROUTER │ STATUS      │ NOTES              │
    ├─────────────┼──────────────────────┼────────────────┼─────────────┼────────────────────┤
    │  PG-104     │ Settings Home        │ IFC-076 ✅     │ ✅ Done     │ Sprint 13          │
    │  PG-108     │ User Management      │ IFC-098 ✅     │ Backlog     │ Sprint 26          │
    │  PG-109     │ Roles Config         │ IFC-098 ✅     │ Backlog     │ Sprint 26          │
    │  PG-110     │ Permissions          │ IFC-098 ✅     │ Backlog     │ Sprint 26          │
    │  PG-111     │ Teams                │ IFC-098 ✅     │ Backlog     │ Sprint 26          │
    │  PG-112     │ Audit Log            │ IFC-124 ✅     │ Backlog     │ Sprint 27          │
    │  PG-113     │ API Keys             │ EXC-SEC-001 ✅ │ Backlog     │ Sprint 27          │
    │  PG-114     │ Webhooks             │ IFC-144 ✅     │ Backlog     │ Sprint 27          │
    │  PG-115     │ Integrations         │ IFC-144 ✅     │ Backlog     │ Sprint 27          │
    │  PG-116     │ Notification Prefs   │ IFC-183 ❌     │ Backlog     │ Router missing!    │
    │  PG-118     │ Data Retention       │ IFC-140 ✅     │ Backlog     │ Sprint 28          │
    │  PG-119     │ Compliance           │ IFC-124 ✅     │ Backlog     │ Sprint 28          │
    │  PG-120     │ Security (2FA)       │ IFC-098 ✅     │ Backlog     │ Sprint 28          │
    │  PG-121     │ Import/Export        │ IFC-070 ⚠️     │ Backlog     │ Unclear backend    │
    │  PG-122     │ Privacy Export       │ IFC-140 ✅     │ Backlog     │ Sprint 28          │
    │  PG-123     │ Privacy Delete       │ IFC-140 ✅     │ Backlog     │ Sprint 28          │
    └─────────────┴──────────────────────┴────────────────┴─────────────┴────────────────────┘

    Legend:
    ✅ = Backend router exists and is complete
    ⚠️ = Backend router unclear or partial
    ❌ = Backend router missing - BLOCKER
```

---

## AI Monitoring & Quality

```
    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  AI MONITORING (Model Drift, Latency, Quality)                            ✅ COMPLETE    ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

                              ┌─────────────────────────────────────────┐
                              │           IFC-117                       │
                              │   AI Model Monitoring                   │
                              │                                         │
                              │  - Drift detection (< 1 day)            │
                              │  - Latency tracking                     │
                              │  - Hallucination rate (< 5%)            │
                              │  - ROI tracking                         │
                              │                                         │
                              │  Dashboards:                            │
                              │  - infra/monitoring/ai-grafana.json     │
                              │                                         │
                              │  Status: COMPLETED ✅                   │
                              │  Sprint: 10                             │
                              └─────────────────────────────────────────┘
```

---

## Missing Tasks Summary (To Create)

### Backend Routers (Missing)

| New Task ID | Feature       | Description               | Dependencies              | Sprint | Priority     |
| ----------- | ------------- | ------------------------- | ------------------------- | ------ | ------------ |
| IFC-183     | Notifications | Notifications tRPC Router | IFC-157, IFC-170, IFC-171 | 13     | **CRITICAL** |
| IFC-200     | Analytics     | Analytics Adapter Layer   | ANALYTICS-001             | 29     | COMPLETE ✅  |

### Frontend Pages (Missing Routers Block Them)

| Task ID | Feature             | Description                 | Blocked By | Sprint |
| ------- | ------------------- | --------------------------- | ---------- | ------ |
| PG-116  | Notification Prefs  | Notification preferences UI | IFC-183    | 27     |
| PG-130  | Notifications Inbox | Notification list/inbox     | IFC-183    | 14     |

---

## Orphan Status Summary

| Feature          | Backend Complete? | Router Complete? | Frontend Task? | Action Required                 |
| ---------------- | ----------------- | ---------------- | -------------- | ------------------------------- |
| RBAC             | YES               | YES              | YES (Backlog)  | None                            |
| Audit Log        | YES               | YES              | YES (Backlog)  | None                            |
| Encryption       | YES               | N/A              | YES (Backlog)  | None                            |
| Tenant Isolation | YES               | YES              | N/A            | None                            |
| Domain Events    | YES               | YES              | N/A            | None                            |
| Notifications    | YES               | **NO**           | YES (Blocked)  | **Create IFC-183**              |
| Home Page        | YES               | 100%             | YES (60%)      | IFC-182 DONE — PG-129 unblocked |
| Analytics        | YES               | YES (IFC-200)    | YES (Backlog)  | IFC-200 DONE — Dashboard unblocked |

**Total New Tasks Required: 2**

- 2 Backend Routers (IFC-183, IFC-190)
- 0 Frontend (already tracked, just blocked)

---

## Critical Path

```
    ┌─────────────────────────────────────────────────────────────────────────────────────────┐
    │  PRIORITY 1: Notifications Router (IFC-183)                                              │
    │                                                                                          │
    │  IFC-157 (Complete) ─► IFC-183 (CREATE) ─► PG-130 (Unblocked) ─► PG-116 (Unblocked)    │
    │                                                                                          │
    │  BLOCKING: 2 frontend pages                                                              │
    └─────────────────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────────────────────────────┐
    │  PRIORITY 2: Home Page Router ✅ COMPLETE (IFC-182)                                      │
    │                                                                                          │
    │  IFC-182 (Complete) ─► All 8 endpoints done ─► PG-129 (Unblocked, currently 60%)       │
    │                                                                                          │
    │  UNBLOCKED: PG-129 Home Page UI can now proceed                                         │
    └─────────────────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────────────────────────────┐
    │  PRIORITY 3: Analytics Router — COMPLETED ✅ (IFC-200, Sprint 29)                       │
    │                                                                                          │
    │  ANALYTICS-001 (Complete) ─► IFC-200 (DONE) ─► IFC-038 (Unblocked) ─► Dashboard        │
    │                                                                                          │
    │  UNBLOCKED: Analytics dashboard implementation (IFC-038)                                 │
    └─────────────────────────────────────────────────────────────────────────────────────────┘
```
