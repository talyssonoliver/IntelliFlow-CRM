# ADR-043: AI Monitoring Data Persistence Strategy

**Status:** Proposed

**Date:** 2026-03-15

**Deciders:** Architecture Team, AI Team

**Technical Story:** IFC-297

## Context and Problem Statement

IntelliFlow CRM's AI monitoring system (drift detection, latency tracking,
hallucination checking, ROI tracking) uses in-memory singletons in the ai-worker
process. In a multi-process deployment (separate API and ai-worker), the API
process gets empty singleton instances — dashboards show all zeros. How should
we persist AI monitoring data so it's accessible across processes while
maintaining acceptable write latency?

## Decision Drivers

- Multi-process deployment: API and ai-worker run as separate processes
- Dashboard data must survive process restarts
- Write latency on the AI hot path must stay under 100ms
- Monitoring data is time-series in nature with natural retention windows
- Must support tenant-scoped queries for multi-tenant deployment
- Existing `PerformanceMetric` model is too generic for structured AI monitoring
  data
- Must not break existing singleton-based monitoring within ai-worker

## Considered Options

- **Option 1**: Unified `AIMonitoringEvent` Prisma model with periodic DB flush
- **Option 2**: Separate Prisma models per metric type (4 models)
- **Option 3**: Redis pub/sub with API-side in-memory cache
- **Option 4**: Extend existing `PerformanceMetric` model with JSON tags

## Decision Outcome

Chosen option: "Option 1 — Unified `AIMonitoringEvent` Prisma model with
periodic DB flush", because it provides a single, well-indexed table for all
monitoring data types while keeping the write path asynchronous via a flush
service. The existing singletons continue to serve as in-process caches for the
ai-worker, while the flush service periodically drains to PostgreSQL.

### Positive Consequences

- Single table simplifies queries, indexes, and retention policies
- Flush service decouples DB writes from AI hot path (no latency impact on
  chains)
- Existing singleton behavior preserved within ai-worker process
- Router queries DB directly — works across any number of processes
- Natural fit with existing Prisma/PostgreSQL infrastructure
- Tenant-scoped via `tenantId` field for multi-tenant support

### Negative Consequences

- Up to 60 seconds of data lag between event and DB availability
- Single table may grow large — requires periodic cleanup/retention job
- JSON `payload` field trades some query performance for schema flexibility

## Pros and Cons of the Options

### Option 1: Unified AIMonitoringEvent with flush

- Good, because single table simplifies management
- Good, because flush service keeps hot path fast
- Good, because `eventType` enum allows future metric types
- Bad, because JSON payload is not as queryable as dedicated columns

### Option 2: Separate models per metric type

- Good, because strongly typed columns per metric type
- Good, because optimal query performance per type
- Bad, because 4 models + 4 migrations + 4 repository classes = high complexity
- Bad, because adding new metric types requires new models

### Option 3: Redis pub/sub

- Good, because near-zero latency
- Good, because natural fit with existing BullMQ Redis
- Bad, because data lost on Redis restart (no persistence guarantee)
- Bad, because requires Redis Streams or custom pub/sub infrastructure
- Bad, because doesn't support complex time-range queries

### Option 4: Extend PerformanceMetric

- Good, because no new table needed
- Bad, because AI metrics need richer structure than generic tags
- Bad, because pollutes generic metrics table with AI-specific data
- Bad, because no type safety on the payload

## Implementation Notes

### Model Design

```prisma
model AIMonitoringEvent {
  id        String   @id @default(cuid())
  tenantId  String
  eventType String   // 'drift' | 'latency' | 'hallucination' | 'roi'
  payload   Json     // type-specific structured data
  metadata  Json?    // optional extra context
  recordedAt DateTime @default(now())
  createdAt DateTime @default(now())

  @@index([tenantId, eventType, recordedAt])
  @@index([eventType, recordedAt])
  @@index([recordedAt])
}
```

### Flush Service

- Runs in ai-worker process on 60-second interval
- Drains in-memory singleton buffers to DB via Prisma batch insert
- Target: < 100ms per flush cycle
- Graceful shutdown: flush remaining data before exit

### Router Rewrite

- All 5 monitoring endpoints switch from singleton import to Prisma queries
- Remove `loadAIMonitoringModule()` dynamic import
- Remove `AI_WORKER_COLOCATED` env var dependency

### Validation Criteria

- [ ] AIMonitoringEvent Prisma model created with migration
- [ ] Flush service writes metrics to DB every 60s
- [ ] Monitoring router queries DB instead of singletons
- [ ] Dashboards show real data in multi-process mode
- [ ] Flush latency < 100ms
- [ ] Coverage > 90%

### Rollback Plan

If DB persistence causes issues:

1. Re-enable singleton-based router endpoints (code still exists)
2. Disable flush service via env var
3. Revert migration if needed
