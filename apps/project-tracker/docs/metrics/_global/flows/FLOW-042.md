# FLOW-042: Insights Dashboard

## Overview

| Property          | Value                              |
| ----------------- | ---------------------------------- |
| **Flow ID**       | FLOW-042                           |
| **Name**          | Insights Dashboard                 |
| **Category**      | Analytics                          |
| **Priority**      | High                               |
| **Sprint**        | 9                                  |
| **Related Tasks** | IFC-096, IFC-037, IFC-038, IFC-092 |

## Description

Real-time analytics dashboard that surfaces CRM insights through interactive
widgets backed by live Supabase data. Sales leaders monitor pipeline velocity
and conversion; CS managers track SLA adherence and churn; execs get KPI
snapshots with drill-downs. All data streams through Supabase realtime channels
with fallback polling.

---

## Actors

- **Sales Leader**: Monitors pipeline velocity, conversion rates, SLA compliance
- **CS Manager**: Tracks ticket SLA adherence, churn indicators
- **Executive**: Views KPI snapshots with drill-down capability
- **System**: Streams real-time data via Supabase realtime channels
- **Analytics Service**: Aggregates and computes metrics from CRM entities

---

## Pre-conditions

- User authenticated with valid tenant session
- User has `analytics:read` permission (view) or `analytics:admin` (configure)
- At least one data source seeded (leads, deals, contacts, or tickets)
- Supabase realtime channels configured and accessible
- Analytics service available in DI container

---

## User Journey

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        INSIGHTS DASHBOARD FLOW                              │
└─────────────────────────────────────────────────────────────────────────────┘

[User] navigates to /analytics
         │
         ▼
┌─────────────────┐
│ Analytics Page   │ (apps/web/src/app/analytics/page.tsx)
│                  │ - Load saved dashboard config
│                  │ - Subscribe to realtime channels
│                  │ - Render widget grid
└────────┬─────────┘
         │
         ├─────────────────────────┬──────────────────────┐
         ▼                         ▼                      ▼
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│ KPI Summary     │   │ Deals Won Trend │   │ Traffic Sources  │
│ Cards           │   │ Chart           │   │ Chart            │
│ - Revenue       │   │ - Monthly bars  │   │ - Pie/donut      │
│ - Leads         │   │ - Comparison    │   │ - Source labels   │
│ - Deals         │   │ - Growth %      │   │ - % breakdown    │
│ - Contacts      │   │                 │   │                  │
└────────┬────────┘   └────────┬────────┘   └────────┬────────┘
         │                     │                      │
         └─────────────────────┼──────────────────────┘
                               ▼
                  ┌─────────────────────┐
                  │ Analytics Router    │ (apps/api/src/modules/analytics/)
                  │ - dealsWonTrend     │
                  │ - growthMetrics     │
                  │ - trafficSources    │
                  │ - activityFeed      │
                  │ - leadStats         │
                  └────────┬────────────┘
                           │
                           ▼
                  ┌─────────────────────┐
                  │ Analytics Service   │ (packages/application/)
                  │ - Tenant-scoped     │
                  │ - Aggregation       │
                  │ - Caching (5s TTL)  │
                  └────────┬────────────┘
                           │
                           ▼
                  ┌─────────────────────┐
                  │ Supabase Realtime   │
                  │ - Channel subscribe │
                  │ - Fallback polling  │
                  │ - Event: INSERT,    │
                  │   UPDATE, DELETE    │
                  └─────────────────────┘
```

---

## Flow Steps

### Step 1: Dashboard Load

**Trigger**: User navigates to `/analytics` via sidebar

**Input**:

```typescript
interface DashboardLoadParams {
  tenantId: string; // From auth context
  dateRange?: {
    start: Date;
    end: Date;
  };
  savedConfigId?: string; // Previously saved dashboard layout
}
```

**Actions**:

1. Load saved dashboard configuration (widget layout, filters)
2. Fetch initial KPI data via tRPC batch query
3. Subscribe to Supabase realtime channels for live updates
4. Render widget grid with skeleton loading states

---

### Step 2: KPI Summary Cards

**Location**: `apps/web/src/app/analytics/page.tsx`

**Metrics Displayed**:

| KPI              | Source              | Computation                            |
| ---------------- | ------------------- | -------------------------------------- |
| Revenue (period) | Opportunities (WON) | SUM(value) with period filter          |
| Revenue Growth   | Opportunities (WON) | (current - previous) / previous \* 100 |
| New Leads        | Leads               | COUNT where createdAt in period        |
| Lead Growth      | Leads               | Period-over-period % change            |
| Active Deals     | Opportunities       | COUNT where stage != WON/LOST          |
| Deal Growth      | Opportunities       | Period-over-period % change            |
| Total Contacts   | Contacts            | COUNT(active) in tenant                |
| Contact Growth   | Contacts            | Period-over-period % change            |

**tRPC Endpoint**: `analytics.growthMetrics`

```typescript
interface GrowthMetrics {
  revenue: { current: number; previous: number; change: number };
  leads: { current: number; previous: number; change: number };
  deals: { current: number; previous: number; change: number };
  contacts: { current: number; previous: number; change: number };
}
```

---

### Step 3: Deals Won Trend Chart

**tRPC Endpoint**: `analytics.dealsWonTrend`

**Input**: `{ months: 6 }` (configurable 1-12)

**Output**:

```typescript
interface DealsWonTrend {
  month: string; // "Jan", "Feb", etc.
  count: number; // Deals won in month
  value: number; // Total revenue from won deals
}
[];
```

**Visualization**: Bar chart with monthly buckets, hover tooltip showing count +
value

---

### Step 4: Traffic Source Distribution

**tRPC Endpoint**: `analytics.trafficSources`

**Output**:

```typescript
interface TrafficSource {
  source: string; // "WEBSITE", "REFERRAL", "COLD_CALL", etc.
  count: number; // Lead count from source
  percentage: number; // Proportion of total
}
[];
```

**Visualization**: Donut chart with labeled segments and legend

---

### Step 5: Real-Time Updates

**Supabase Realtime Integration**:

```typescript
// Subscribe to relevant tables for live updates
const channel = supabase
  .channel('analytics-live')
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'Lead' },
    handleLeadChange
  )
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'Opportunity' },
    handleDealChange
  )
  .subscribe();
```

**Fallback**: If realtime channel disconnects, switch to 30s polling interval

---

### Step 6: Export

**Formats**:

- CSV: Raw data export for spreadsheet analysis
- PDF: Formatted dashboard snapshot for sharing

**tRPC Endpoint**: `analytics.export`

```typescript
interface ExportRequest {
  format: 'CSV' | 'PDF';
  dateRange: { start: Date; end: Date };
  widgets: string[]; // Widget IDs to include
}
```

---

## Edge Cases

| Scenario                         | Handling                                                      |
| -------------------------------- | ------------------------------------------------------------- |
| No data for period               | Show empty state with "No data available for selected period" |
| Realtime channel disconnects     | Switch to 30s polling; show "Live updates paused" indicator   |
| Export timeout (large dataset)   | Queue export, send download link via notification             |
| Concurrent dashboard viewers     | Each user gets independent realtime subscription              |
| Permission downgrade mid-session | Realtime subscription catches auth error, redirect to login   |
| Timezone differences             | All dates computed in user's configured timezone              |

---

## Technical Artifacts

### Backend (IMPLEMENTED)

| Artifact         | Path                                                                | Status   |
| ---------------- | ------------------------------------------------------------------- | -------- |
| Analytics Router | `apps/api/src/modules/analytics/analytics.router.ts`                | COMPLETE |
| Analytics Tests  | `apps/api/src/modules/analytics/__tests__/analytics.router.test.ts` | COMPLETE |
| PRD              | `docs/planning/prd-analytics-reporting.md`                          | COMPLETE |
| ADR              | `docs/architecture/adr/ADR-016-analytics-integrity.md`              | COMPLETE |

### Frontend (PARTIAL)

| Artifact       | Path                                                   | Status              |
| -------------- | ------------------------------------------------------ | ------------------- |
| Analytics Page | `apps/web/src/app/analytics/page.tsx`                  | PARTIAL             |
| Sidebar Config | `apps/web/src/components/sidebar/configs/analytics.ts` | COMPLETE            |
| Widget Builder | `apps/web/src/components/analytics/WidgetBuilder.tsx`  | **NOT IMPLEMENTED** |
| Export Handler | `apps/web/src/components/analytics/ExportButton.tsx`   | **NOT IMPLEMENTED** |

---

## Performance Requirements

| Metric                  | Target  |
| ----------------------- | ------- |
| Dashboard TTI           | <1s P95 |
| Bundle size per route   | <200KB  |
| Realtime update latency | <1s P95 |
| KPI query response      | <200ms  |
| Chart render time       | <300ms  |
| Lighthouse perf score   | >90     |

---

## Security Requirements

| Requirement      | Implementation                                   |
| ---------------- | ------------------------------------------------ |
| Tenant isolation | All queries include tenant_id filter             |
| Permission check | `analytics:read` required via protectedProcedure |
| Data freshness   | No placeholder or static JSON in production      |
| Export audit     | Export actions logged in audit trail             |
| Rate limiting    | Standard authenticated limits (1000 req/min)     |

---

## Success Metrics

| KPI                           | Target       | Validation                     |
| ----------------------------- | ------------ | ------------------------------ |
| Dashboard TTI p95             | <1s          | Lighthouse + latency artifacts |
| Realtime freshness p95        | <1s          | Latency recordings             |
| Error rate on realtime stream | <0.1%        | Observability traces           |
| Zero placeholder data         | 0 violations | CI assertions                  |
| Accessibility                 | WCAG AA      | axe reports                    |

---

## Related Flows

- **FLOW-043**: Revenue Forecasting (feeds forecast widget)
- **FLOW-020**: Activity Timeline (recent activity feed)
- **FLOW-047**: Authenticated Home Page (KPI summary cards shared)

---

## Implementation Tasks

| Task                         | Sprint | Status      |
| ---------------------------- | ------ | ----------- |
| IFC-096 (Custom Dashboards)  | 9      | COMPLETED   |
| IFC-037 (Analytics UI)       | TBD    | PLANNED     |
| IFC-038 (Advanced Analytics) | TBD    | PLANNED     |
| **Widget Builder UI**        | TBD    | NOT STARTED |
| **Export Handler**           | TBD    | NOT STARTED |

---

_Flow documented: 2026-02-09_ _Last updated: 2026-02-09_
