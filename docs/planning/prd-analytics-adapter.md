# PRD: Analytics Adapter Layer (IFC-200)

## Business Rationale

The analytics router (`apps/api/src/modules/analytics/analytics.router.ts`)
provided dashboard endpoints but relied on `AnalyticsService` — a service that
directly consumed `PrismaClient`, violating hexagonal architecture. This
created:

1. **Untestable business logic** — service methods were coupled to Prisma,
   requiring database for any test
2. **No export pipeline** — metrics could only be viewed in the dashboard, not
   exported
3. **Performance issues** — serial N+1 queries in `getGrowthTrend` (loop per
   month)
4. **Broken normalization** — growth values were clamped to 0-100 range, making
   raw data inaccessible

## Requirements

### Functional

- **FR-001**: Create `AnalyticsAggregationService` in application layer
  accepting `AnalyticsRepository` port
- **FR-002**: Wire `PrismaAnalyticsRepository` (pre-existing) through DI
  container
- **FR-003**: Add `exportMetrics` endpoint for bulk metric export
- **FR-004**: Add `exportConversionFunnel` endpoint for pipeline analysis
- **FR-005**: Delete architecture-violating `AnalyticsService`

### Non-Functional

- **NF-001**: All analytics queries complete within 300ms (p95)
- **NF-002**: 100% of export endpoints use real data (no mocks)
- **NF-003**: Zero schema drift (TypeScript strict compilation)
- **NF-004**: Zero infrastructure imports in application service

## KPIs

| Metric                  | Target | Measurement                            |
| ----------------------- | ------ | -------------------------------------- |
| Service test coverage   | >=90%  | `vitest --coverage`                    |
| Router test coverage    | >=90%  | `vitest --coverage`                    |
| Architecture violations | 0      | No `PrismaClient` in application layer |
| Export endpoint count   | 2      | Router endpoint count                  |

## Spec-Identified Risks

| Risk                                                 | Severity | Mitigation                                                          |
| ---------------------------------------------------- | -------- | ------------------------------------------------------------------- |
| Decimal precision loss in revenue aggregation        | Medium   | Repository returns raw Prisma Decimal; service converts at boundary |
| Missing composite indexes on `(tenantId, createdAt)` | Low      | Existing indexes adequate for current data volumes                  |
| N+1 query history in growth trends                   | High     | Replaced serial loop with `Promise.all()` for parallel execution    |
| YoY off-by-one in 12-month window                    | Medium   | Fixed index calculation: `result[result.length - 12]`               |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│ Router Layer (apps/api)                             │
│   analytics.router.ts → 7 endpoints                │
└──────────────────────┬──────────────────────────────┘
                       │ uses
┌──────────────────────▼──────────────────────────────┐
│ Application Layer (packages/application)            │
│   AnalyticsAggregationService                       │
│   - accepts AnalyticsRepository port                │
│   - zero infrastructure imports                     │
└──────────────────────┬──────────────────────────────┘
                       │ depends on port
┌──────────────────────▼──────────────────────────────┐
│ Port (packages/application/ports)                   │
│   AnalyticsRepository interface (9 methods)         │
└──────────────────────┬──────────────────────────────┘
                       │ implemented by
┌──────────────────────▼──────────────────────────────┐
│ Adapter Layer (packages/adapters)                   │
│   PrismaAnalyticsRepository                         │
│   InMemoryAnalyticsRepository (test double)         │
└─────────────────────────────────────────────────────┘
```

## Completion

- **Task**: IFC-200
- **Sprint**: 29
- **Status**: Completed
- **Spec**: `.specify/sprints/sprint-29/specifications/IFC-200-spec.md`
- **Plan**: `.specify/sprints/sprint-29/planning/IFC-200-plan.md`
