# IntelliFlow CRM - Integration Backlog

> **Location**: `docs/design/integration-backlog.md`
> **Last Updated**: 2026-02-02
> **Purpose**: Track backend integration tasks with detailed page specifications
> **Cross-referenced with**: `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`

---

## Sprint Plan Cross-Reference Summary

This section maps integration tasks to existing Sprint Plan entries.

### Tasks Found in Sprint_plan.csv

| Integration Task | Sprint Plan ID | Sprint | Status | Description |
|-----------------|---------------|--------|--------|-------------|
| Billing Portal | PG-025 | 14 | Backlog | Billing portal with Stripe |
| Billing Checkout | PG-026 | 14 | Backlog | Payment checkout page |
| Billing Invoices | PG-027 | 14 | Backlog | Invoice list page |
| Billing Invoice Detail | PG-028 | 14 | Backlog | Invoice detail page |
| Billing Payment Methods | PG-029 | 14 | Backlog | Payment methods management |
| Billing Subscriptions | PG-030 | 14 | Backlog | Subscription management |
| Billing Receipts | PG-031 | 14 | **Completed** | Receipt list |
| Dashboard | PG-058 | 18 | Backlog | Main dashboard with KPIs |
| Reports List | PG-101 | 25 | Backlog | Report library |
| Custom Reports | PG-102 | 25 | Backlog | Report builder |
| Report Schedules | PG-103 | 25 | Backlog | Scheduled reports |
| Settings > Notifications | PG-116 | 27 | Backlog | Notification preferences |
| Settings > Integrations | PG-115 | 27 | Backlog | Integration catalog |
| Accounts List | PG-069 | 19 | Backlog | Accounts list page |
| Account Detail | PG-070 | 20 | Backlog | Account 360 view |
| Account Edit | PG-071 | 20 | Backlog | Account editor |
| Account Import | PG-072 | 20 | Backlog | Account import |
| Calendar | PG-083 | 22 | Backlog | Calendar view |
| Workflow Builder | IFC-031 | 17 | Backlog | Visual workflow builder |
| Activity Feed | IFC-069 | 14 | Backlog | Unified activity feed service |
| Analytics Dashboard | IFC-037 | 21 | Backlog | Analytics dashboard design |
| Analytics Implementation | IFC-038 | 22 | Backlog | Analytics with real-time |

### Tasks ADDED to Sprint_plan.csv ✅

The following integration tasks have been added to the Sprint Plan:

| Task ID | Description | Sprint | Dependencies | Status |
|---------|-------------|--------|--------------|--------|
| **IFC-182** | Dashboard tRPC Router (welcome, feed, widgets, pins, goals) | 13 | IFC-003, IFC-089 | Backlog |
| **IFC-183** | Notifications tRPC Router (list, read, preferences, subscription) | 13 | IFC-003 | Backlog |
| **PG-129** | Authenticated Home Page (`/` route) | 14 | IFC-182, IFC-069, IFC-095 | Backlog |
| **PG-130** | Notifications Inbox (`/notifications`) | 14 | IFC-183 | Backlog |
| **PG-131** | Deal Forecast UI (`/deals/[id]/forecast`, `/deals/forecast`) | 14 | IFC-092, IFC-095 | Backlog |

**Dependency Order** (no forward dependencies):
1. Sprint 13: Backend routers (IFC-182, IFC-183)
2. Sprint 14: Frontend pages (PG-129, PG-130, PG-131)

---

## Integration Status Summary

| Priority | Symbol | Count | In Sprint Plan |
|----------|--------|-------|----------------|
| Critical | 🔴 | 6 | ✅ All 6 in Sprint Plan |
| Partial | 🟡 | 6 | 4 found, 2 partial |
| Planned | ⏳ | 11 | ✅ All 11 in Sprint Plan |

---

## ✅ RESOLVED: Critical Tasks Added

The following critical tasks have been added to `Sprint_plan.csv`:

### NEW-001: Authenticated Home Page

**Proposed Sprint Plan Entry:**

```csv
Task ID: PG-HOME-001
Section: Core CRM
Description: Authenticated Home Page - Welcome summary, activity feed, AI insights, pinned items, goals
Owner: CRM FE+BE (STOA-Foundation)
Dependencies: IFC-089,IFC-095,IFC-069
Pre-requisites: FILE:docs/design/integration-backlog.md;FILE:apps/api/src/modules/contact/contact.router.ts
Definition of Done: Response <200ms, Lighthouse ≥90, real-time feed working
Status: Backlog
KPIs: Page loads <500ms; activity feed real-time; AI insights displayed
Target Sprint: 14
Artifacts: apps/web/src/app/(authenticated)/page.tsx;apps/api/src/modules/dashboard/dashboard.router.ts
```

**Required New APIs:**
- `dashboard.getWelcomeSummary` - Query
- `dashboard.getActivityFeed` - Query (paginated)
- `dashboard.getPinnedItems` - Query
- `dashboard.getGoals` - Query
- `intelligence.getDailyInsights` - Query
- `dashboard.pinItem` / `dashboard.unpinItem` - Mutations

---

### NEW-002: Notifications Inbox Page

**Proposed Sprint Plan Entry:**

```csv
Task ID: PG-NOTIF-001
Section: Core CRM
Description: Notifications Inbox Page - List, mark read, real-time updates via WebSocket
Owner: Platform FE+BE (STOA-Foundation)
Dependencies: PG-116
Pre-requisites: FILE:docs/design/integration-backlog.md;FILE:apps/web/src/app/(settings)/settings/notifications/page.tsx
Definition of Done: Response <200ms, Lighthouse ≥90, real-time notifications
Status: Backlog
KPIs: Notifications load <300ms; real-time via WebSocket; mark all as read works
Target Sprint: 14
Artifacts: apps/web/src/app/notifications/page.tsx;apps/api/src/modules/notifications/notifications.router.ts
```

**Required New APIs:**
- `notifications.list` - Query (paginated)
- `notifications.getUnreadCount` - Query
- `notifications.markAsRead` - Mutation
- `notifications.markAllAsRead` - Mutation
- `notifications.delete` - Mutation
- `notifications.onNew` - Subscription (real-time)

---

### NEW-003: Deal Forecast UI Pages

**Proposed Sprint Plan Entry:**

```csv
Task ID: PG-FORECAST-001
Section: Core CRM
Description: Deal Forecast Pages - /deals/[id]/forecast with AI probability, risk factors, recommendations
Owner: CRM FE+BE (STOA-Intelligence)
Dependencies: IFC-092,IFC-095
Pre-requisites: FILE:apps/api/src/modules/opportunity/opportunity.router.ts;FILE:apps/api/src/modules/intelligence/intelligence.router.ts
Definition of Done: Response <500ms, AI predictions displayed, risk factors shown
Status: Backlog
KPIs: Forecast loads <500ms; probability gauge accurate; recommendations actionable
Target Sprint: 14
Artifacts: apps/web/src/app/deals/[id]/forecast/page.tsx;apps/web/src/app/deals/forecast/page.tsx
```

**Note**: Backend APIs exist in `intelligence.*` router but need to be connected to UI.

---

### NEW-004: Dashboard Router

**Proposed Sprint Plan Entry:**

```csv
Task ID: IFC-DASH-001
Section: Infrastructure
Description: Dashboard tRPC Router - Welcome summary, activity feed, widgets, pins, goals
Owner: Backend Dev (STOA-Domain)
Dependencies: IFC-003,IFC-089
Pre-requisites: FILE:apps/api/src/router.ts;FILE:apps/api/src/trpc.ts
Definition of Done: All dashboard endpoints implemented, tested, wired to router
Status: Backlog
KPIs: All endpoints <200ms; test coverage >=90%
Target Sprint: 14
Artifacts: apps/api/src/modules/dashboard/dashboard.router.ts;packages/validators/src/dashboard.ts
```

---

### NEW-005: Notifications Router

**Proposed Sprint Plan Entry:**

```csv
Task ID: IFC-NOTIF-001
Section: Infrastructure
Description: Notifications tRPC Router - List, preferences, mark read, real-time subscription
Owner: Backend Dev (STOA-Domain)
Dependencies: IFC-003
Pre-requisites: FILE:apps/api/src/router.ts;FILE:apps/api/src/trpc.ts
Definition of Done: All notification endpoints implemented, WebSocket subscription working
Status: Backlog
KPIs: All endpoints <200ms; real-time latency <100ms; test coverage >=90%
Target Sprint: 14
Artifacts: apps/api/src/modules/notifications/notifications.router.ts;packages/validators/src/notifications.ts
```

---

## Tasks Already in Sprint Plan

### Billing Pages (Sprint 14)

| Task ID | Page | Status | Notes |
|---------|------|--------|-------|
| PG-025 | `/billing` | Backlog | Billing Portal - depends on IFC-099 |
| PG-026 | `/billing/checkout` | Backlog | Checkout with Stripe Elements |
| PG-027 | `/billing/invoices` | Backlog | Invoice list |
| PG-028 | `/billing/invoices/[id]` | Backlog | Invoice detail |
| PG-029 | `/billing/settings` | Backlog | Payment methods |
| PG-030 | `/billing/subscriptions` | Backlog | Subscription management |
| PG-031 | `/billing/receipts` | **Completed** | ✅ Receipt list |

---

### Dashboard & Analytics (Sprint 18-22)

| Task ID | Page | Status | Notes |
|---------|------|--------|-------|
| PG-058 | `/dashboard` | Backlog | Main dashboard - Sprint 18 |
| IFC-037 | Analytics Design | Backlog | Analytics dashboard design - Sprint 21 |
| IFC-038 | Analytics Implementation | Backlog | Analytics with real-time - Sprint 22 |

---

### Reports (Sprint 25)

| Task ID | Page | Status | Notes |
|---------|------|--------|-------|
| PG-101 | `/reports` | Backlog | Report library |
| PG-102 | `/reports/custom` | Backlog | Report builder |
| PG-103 | `/reports/schedules` | Backlog | Scheduled reports |

---

### Settings Pages (Sprint 27)

| Task ID | Page | Status | Notes |
|---------|------|--------|-------|
| PG-116 | `/settings/notifications` | Backlog | Notification preferences |
| PG-115 | `/settings/integrations` | Backlog | Integration catalog |

---

### Accounts (Sprint 19-20)

| Task ID | Page | Status | Notes |
|---------|------|--------|-------|
| PG-069 | `/accounts` | Backlog | Accounts list - Sprint 19 |
| PG-070 | `/accounts/[id]` | Backlog | Account detail - Sprint 20 |
| PG-071 | `/accounts/[id]/edit` | Backlog | Account editor - Sprint 20 |
| PG-072 | `/accounts/import` | Backlog | Account import - Sprint 20 |

---

### Calendar (Sprint 22)

| Task ID | Page | Status | Notes |
|---------|------|--------|-------|
| PG-083 | `/calendar` | Backlog | Calendar view - depends on PG-080 |

---

### Workflow Automation (Sprint 17)

| Task ID | Page | Status | Notes |
|---------|------|--------|-------|
| IFC-031 | Workflow Builder | Backlog | Visual workflow builder with React Flow |

---

### Activity Feed (Sprint 14)

| Task ID | Feature | Status | Notes |
|---------|---------|--------|-------|
| IFC-069 | Unified Activity Feed | Backlog | Feed service for all entities |

---

## Implementation Priority

### Phase 1: Sprint 13-14 - Critical Integration Tasks ✅

Backend routers in Sprint 13 (no forward dependencies):
1. **IFC-182** - Dashboard Router ✅ Added
2. **IFC-183** - Notifications Router ✅ Added

Frontend pages in Sprint 14 (depend on Sprint 13 routers):
3. **PG-129** - Authenticated Home Page ✅ Added
4. **PG-130** - Notifications Inbox ✅ Added
5. **PG-131** - Deal Forecast UI ✅ Added
6. PG-025 to PG-030 - Billing Pages (existing)
7. IFC-069 - Activity Feed (existing)

### Phase 2: Sprint 17-18

8. IFC-031 - Workflow Builder UI
9. PG-058 - Dashboard

### Phase 3: Sprint 19-22

10. PG-069 to PG-072 - Accounts section
11. IFC-037/IFC-038 - Analytics
12. PG-083 - Calendar

### Phase 4: Sprint 25-27

13. PG-101 to PG-103 - Reports
14. PG-115, PG-116 - Settings pages

---

## Router Status

### Existing Routers (25 total)

All routers listed in `apps/api/src/router.ts`:

| Router | Namespace | Status | Procedures |
|--------|-----------|--------|------------|
| auth | `auth.*` | ✅ Active | Auth flows |
| billing | `billing.*` | ✅ Active | Stripe integration |
| lead | `lead.*` | ✅ Active | Lead CRUD |
| contact | `contact.*` | ✅ Active | Contact CRUD |
| account | `account.*` | ✅ Active | Account CRUD |
| opportunity | `opportunity.*` | ✅ Active | Deal CRUD |
| pipelineConfig | `pipelineConfig.*` | ✅ Active | Pipeline stages |
| task | `task.*` | ✅ Active | Task CRUD |
| ticket | `ticket.*` | ✅ Active | Ticket CRUD |
| analytics | `analytics.*` | ✅ Active | Analytics queries |
| appointments | `appointments.*` | ✅ Active | Calendar appointments |
| documents | `documents.*` | ✅ Active | Document management |
| agent | `agent.*` | ✅ Active | AI agent tools |
| chainVersion | `chainVersion.*` | ✅ Active | AI chain versions |
| zepBudget | `zepBudget.*` | ✅ Active | Zep memory budget |
| intelligence | `intelligence.*` | ✅ Active | AI predictions |
| autoResponse | `autoResponse.*` | ✅ Active | Auto-response |
| audit | `audit.*` | ✅ Active | Audit logs |
| health | `health.*` | ✅ Active | Health checks |
| system | `system.*` | ✅ Active | System info |
| timeline | `timeline.*` | ✅ Active | Timeline entries |
| subscriptions | `subscriptions.*` | ✅ Active | WebSocket |
| integrations | `integrations.*` | ✅ Active | External integrations |
| email | `email.*` | ✅ Active | Inbound email |

### Routers to Create

| Router | Namespace | Task ID | Sprint | Status |
|--------|-----------|---------|--------|--------|
| Dashboard | `dashboard.*` | **IFC-182** | 13 | ✅ Added |
| Notifications | `notifications.*` | **IFC-183** | 13 | ✅ Added |
| Workflow | `workflow.*` | - | 17 | ⏳ Future |
| Admin | `admin.*` | - | 15+ | ⏳ Future |

---

## Action Items

### Completed ✅ (Added to Sprint_plan.csv on 2026-02-02)

1. [x] ~~Add PG-HOME-001~~ → **PG-129** - Authenticated Home Page (Sprint 14)
2. [x] ~~Add IFC-DASH-001~~ → **IFC-182** - Dashboard Router (Sprint 13)
3. [x] ~~Add PG-NOTIF-001~~ → **PG-130** - Notifications Inbox (Sprint 14)
4. [x] ~~Add IFC-NOTIF-001~~ → **IFC-183** - Notifications Router (Sprint 13)
5. [x] ~~Add PG-FORECAST-001~~ → **PG-131** - Deal Forecast UI Pages (Sprint 14)

### Verify Existing Tasks

6. [ ] Verify PG-025 to PG-031 billing tasks have correct dependencies
7. [x] IFC-069 activity feed linked to PG-129 (home page dependency)
8. [x] IFC-092 forecast backend linked to PG-131 (forecast UI dependency)

---

## Related Documents

| Document | Location | Purpose |
|----------|----------|---------|
| Sprint Plan | `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv` | Task tracking |
| UI Flow Mapping | `docs/design/ui-flow-mapping.md` | Route → Flow mapping |
| Sitemap | `docs/design/sitemap.md` | Complete route structure |
| tRPC Routes | `docs/api/trpc-routes.md` | API inventory |

---

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2026-02-02 | 3.0.0 | Added 5 missing tasks to Sprint_plan.csv (IFC-182, IFC-183, PG-129, PG-130, PG-131) |
| 2026-02-02 | 2.0.0 | Cross-referenced with Sprint_plan.csv, identified 5 missing tasks |
| 2026-02-02 | 1.0.0 | Initial integration backlog |
