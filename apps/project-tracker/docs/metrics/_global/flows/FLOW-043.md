# FLOW-043: Revenue Forecasting

## Overview

| Property          | Value                     |
| ----------------- | ------------------------- |
| **Flow ID**       | FLOW-043                  |
| **Name**          | Revenue Forecasting       |
| **Category**      | Analytics                 |
| **Priority**      | High                      |
| **Sprint**        | 7                         |
| **Related Tasks** | IFC-092, IFC-091, IFC-096 |

## Description

Deal-level revenue forecasting engine that predicts pipeline outcomes using
weighted probability, historical win-rate analysis, and stage-duration patterns.
Powers forecast views in deal pages, analytics dashboards, and executive
summaries. Target accuracy: >=85% (actual measured: 96.2%).

---

## Actors

- **Sales Rep**: Views forecast for their pipeline and individual deals
- **Sales Manager**: Reviews team-level forecast and adjusts commitments
- **Executive**: Views company-wide revenue forecast and variance analysis
- **Forecast Engine**: Computes weighted pipeline, best/worst case, and
  predicted close dates
- **System**: Triggers periodic re-computation and caches results

---

## Pre-conditions

- User authenticated with valid tenant session
- At least one opportunity with a stage and estimated value
- Opportunity pipeline stages defined with probability weights
- Historical deal data available for win-rate computation (fallback to defaults
  if insufficient)

---

## User Journey

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        REVENUE FORECASTING FLOW                             │
└─────────────────────────────────────────────────────────────────────────────┘

[User] views deal forecast
         │
         ├── Via /deals/[id]/forecast (deal-level)
         ├── Via /analytics (dashboard widget)
         └── Via /reports/forecast (executive summary)
         │
         ▼
┌─────────────────┐
│ Forecast UI     │ - Period selector (month/quarter/year)
│                 │ - Category filter (pipeline/commit/closed)
│                 │ - Owner filter (my deals / team / all)
└────────┬────────┘
         │
         ▼ tRPC query
┌─────────────────┐
│ Forecast Router  │ (apps/api/src/modules/opportunity/)
│                  │ - getForecast(period, filters)
│                  │ - getForecastBreakdown(groupBy)
│                  │ - getAccuracyBacktest()
└────────┬─────────┘
         │
         ▼
┌─────────────────┐
│ Forecast Engine  │ (apps/api/src/shared/forecast-algorithm)
│                  │
│ 1. Stage Weight  │ - Each stage has probability (0-100%)
│    Calculation   │ - PROSPECTING: 10%, QUALIFIED: 25%,
│                  │   PROPOSAL: 50%, NEGOTIATION: 75%,
│                  │   VERBAL_COMMIT: 90%, CLOSED_WON: 100%
│                  │
│ 2. Historical    │ - Actual win rate per stage (last 12mo)
│    Win Rate      │ - Overrides default weights when data
│                  │   is statistically significant (N>=20)
│                  │
│ 3. Pipeline      │ - Best Case: SUM(value) all open
│    Scenarios     │ - Weighted: SUM(value * probability)
│                  │ - Commit: SUM where probability >= 75%
│                  │ - Closed: SUM where stage = WON
│                  │
│ 4. Time-Based    │ - Average days in each stage
│    Prediction    │ - Predicted close date per deal
│                  │ - Aging alerts (stale deals)
└────────┬─────────┘
         │
         ▼
┌─────────────────┐
│ Forecast Output  │
│                  │
│ ┌─────────────┐  │
│ │ Summary     │  │ - Total Pipeline: $X
│ │ Cards       │  │ - Weighted Forecast: $Y
│ │             │  │ - Best Case: $Z
│ │             │  │ - Commit: $W
│ └─────────────┘  │
│                  │
│ ┌─────────────┐  │
│ │ Stage       │  │ - Horizontal stacked bar
│ │ Breakdown   │  │ - Value per stage
│ │ Chart       │  │ - Deal count per stage
│ └─────────────┘  │
│                  │
│ ┌─────────────┐  │
│ │ Monthly     │  │ - Predicted close by month
│ │ Projection  │  │ - Actual vs forecast trend
│ │ Chart       │  │ - Variance highlighting
│ └─────────────┘  │
│                  │
│ ┌─────────────┐  │
│ │ Deal List   │  │ - Sortable by predicted close
│ │             │  │ - Weighted value column
│ │             │  │ - Risk indicators (aging, stale)
│ └─────────────┘  │
└──────────────────┘
```

---

## Flow Steps

### Step 1: Forecast Request

**Trigger**: User navigates to forecast view or forecast widget loads

**Input**:

```typescript
interface ForecastRequest {
  tenantId: string;
  period: 'MONTH' | 'QUARTER' | 'YEAR';
  startDate?: Date;
  endDate?: Date;
  ownerId?: string; // Filter by sales rep
  teamId?: string; // Filter by team
  category?: 'PIPELINE' | 'COMMIT' | 'CLOSED';
}
```

---

### Step 2: Weighted Pipeline Computation

**Location**: `apps/api/src/shared/forecast-algorithm`

**Default Stage Probabilities**:

| Stage         | Default Weight | Historical Override                 |
| ------------- | -------------- | ----------------------------------- |
| PROSPECTING   | 10%            | Uses actual win rate if N>=20 deals |
| QUALIFIED     | 25%            | Uses actual win rate if N>=20 deals |
| PROPOSAL      | 50%            | Uses actual win rate if N>=20 deals |
| NEGOTIATION   | 75%            | Uses actual win rate if N>=20 deals |
| VERBAL_COMMIT | 90%            | Uses actual win rate if N>=20 deals |
| CLOSED_WON    | 100%           | Always 100%                         |
| CLOSED_LOST   | 0%             | Always 0%                           |

**Computation**:

```typescript
interface ForecastResult {
  summary: {
    totalPipeline: number; // SUM of all open deal values
    weightedForecast: number; // SUM(value * stageProbability)
    bestCase: number; // SUM of all open + commit
    commitForecast: number; // SUM where probability >= 75%
    closedWon: number; // SUM of already won deals in period
  };
  byStage: {
    stage: string;
    dealCount: number;
    totalValue: number;
    weightedValue: number;
    avgDaysInStage: number;
  }[];
  byMonth: {
    month: string;
    predictedRevenue: number;
    actualRevenue: number;
    variance: number;
  }[];
  deals: {
    id: string;
    name: string;
    value: number;
    weightedValue: number;
    stage: string;
    probability: number;
    predictedCloseDate: Date;
    daysInCurrentStage: number;
    isStale: boolean; // Exceeds avg duration by 2x
    owner: { id: string; name: string };
  }[];
}
```

---

### Step 3: Historical Accuracy Backtest

**Endpoint**: `analytics.getAccuracyBacktest`

Computes forecast accuracy by comparing past predictions against actual
outcomes:

```typescript
interface AccuracyBacktest {
  periodsTested: number;
  overallAccuracy: number; // Target: >=85%, actual: 96.2%
  accuracyByStage: {
    stage: string;
    predicted: number;
    actual: number;
    accuracy: number;
  }[];
  confidenceInterval: {
    lower: number;
    upper: number;
    level: number; // 95% confidence
  };
}
```

---

### Step 4: Visualization Rendering

**Charts**:

| Chart              | Type                   | Data Source        |
| ------------------ | ---------------------- | ------------------ |
| Summary Cards      | Metric cards           | `summary` object   |
| Stage Breakdown    | Horizontal stacked bar | `byStage` array    |
| Monthly Projection | Line + bar combo       | `byMonth` array    |
| Deal Pipeline      | Sortable table         | `deals` array      |
| Accuracy Gauge     | Circular progress      | `AccuracyBacktest` |

**Interactivity**:

- Click stage bar to filter deal list
- Click month to drill into deals closing that month
- Sort deal table by value, probability, predicted close date
- Hover for tooltips with detailed metrics

---

## Edge Cases

| Scenario                             | Handling                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------- |
| No deals in pipeline                 | Show empty state: "No open deals. Create opportunities to see forecasts."       |
| Insufficient historical data         | Use default stage weights; show "Based on default probabilities" note           |
| All deals in PROSPECTING             | Weighted forecast heavily discounted; show warning about pipeline concentration |
| Stale deals (>2x avg stage duration) | Highlight in red; suggest review or stage change                                |
| Currency mixing                      | All values normalized to tenant's base currency                                 |
| Large pipeline (>1000 deals)         | Paginate deal list; aggregate charts computed server-side                       |

---

## Technical Artifacts

### Backend (IMPLEMENTED)

| Artifact           | Path                                                   | Status   |
| ------------------ | ------------------------------------------------------ | -------- |
| Forecast Algorithm | `apps/api/src/shared/forecast-algorithm`               | COMPLETE |
| Forecast Tests     | `apps/api/src/shared/forecast-algorithm.test.ts`       | COMPLETE |
| Accuracy Backtest  | `artifacts/metrics/accuracy-backtest.csv`              | COMPLETE |
| ADR                | `docs/architecture/adr/ADR-019-core-crm-foundation.md` | COMPLETE |
| PRD                | `docs/planning/prd-core-crm.md`                        | COMPLETE |

### Frontend (GAP)

| Artifact              | Path                                                        | Status              |
| --------------------- | ----------------------------------------------------------- | ------------------- |
| Forecast Page         | `apps/web/src/app/deals/forecast/page.tsx`                  | **NOT IMPLEMENTED** |
| Stage Breakdown Chart | `apps/web/src/components/analytics/StageBreakdownChart.tsx` | **NOT IMPLEMENTED** |
| Monthly Projection    | `apps/web/src/components/analytics/MonthlyProjection.tsx`   | **NOT IMPLEMENTED** |
| Accuracy Gauge        | `apps/web/src/components/analytics/AccuracyGauge.tsx`       | **NOT IMPLEMENTED** |

---

## Performance Requirements

| Metric                  | Target  |
| ----------------------- | ------- |
| Forecast query response | <500ms  |
| Backtest computation    | <2s     |
| Chart render time       | <300ms  |
| Dashboard TTI           | <1s P95 |

---

## Security Requirements

| Requirement             | Implementation                                              |
| ----------------------- | ----------------------------------------------------------- |
| Tenant isolation        | All queries scoped to tenant                                |
| Owner filtering         | Sales reps see own deals; managers see team; admins see all |
| Data integrity          | No placeholder data; all values from live database          |
| Forecast accuracy audit | Backtest results stored as artifact                         |

---

## Success Metrics

| KPI                       | Target             | Validation                   |
| ------------------------- | ------------------ | ---------------------------- |
| Forecast accuracy         | >=85%              | Backtest CSV (actual: 96.2%) |
| Win rate visibility       | Tracked per stage  | Analytics dashboard          |
| Pipeline value visibility | Total and weighted | Summary cards                |
| Query performance p95     | <500ms             | Performance monitoring       |

---

## Related Flows

- **FLOW-042**: Insights Dashboard (forecast widget embedded)
- **FLOW-020**: Activity Timeline (deal stage changes tracked)
- **FLOW-046**: Account Management (pipeline by account)

---

## Implementation Tasks

| Task                            | Sprint | Status      |
| ------------------------------- | ------ | ----------- |
| IFC-092 (Deal Forecasting)      | 7      | COMPLETED   |
| IFC-091 (Opportunity Aggregate) | 7      | COMPLETED   |
| IFC-096 (Custom Dashboards)     | 9      | COMPLETED   |
| **Forecast Page UI**            | TBD    | NOT STARTED |
| **Forecast Charts**             | TBD    | NOT STARTED |

---

_Flow documented: 2026-02-09_ _Last updated: 2026-02-09_
