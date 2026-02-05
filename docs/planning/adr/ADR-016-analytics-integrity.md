# ADR-016: Real-Time Analytics Integrity and Performance

**Status:** Accepted  
**Date:** 2026-02-02  
**Deciders:** Data Eng, Frontend Lead, PM (STOA-Foundation)  
**Related Tasks:** IFC-037 (Analytics Dashboard Design), IFC-038 (Analytics Implementation)

## Context and Problem
- Analytics dashboard must show live Supabase data with <1s latency and no hardcoded values.
- Past work lacks a consolidated decision on freshness SLAs, validation, and data quality safeguards.

## Decision
1) **Freshness SLA:** p95 end-to-end update latency <1s from ingestion to UI render.  
2) **Data Source Contract:** All charts read from Supabase realtime channels; no mock or static JSON in production builds.  
3) **Data Quality Checks:** CI test must assert non-null KPIs and reject “placeholder” strings; UI e2e test exercises live query against seeded fixtures.  
4) **Performance Budget:** Dashboard initial load TTI <1s on P95 dev laptop; bundle size budget 200KB per route; lazy-load heavy charts.  
5) **Observability:** Emit trace/span ids for dashboard queries; include perf benchmark artifact `artifacts/misc/real-time-test-video.mp4` and latency metrics JSON.

## Considered Options
- Static snapshots with periodic refresh (rejected: violates real-time goal).
- Client-only polling (rejected: higher latency, cost).
- Supabase realtime + cache-aware UI with budgets (chosen).

## Consequences
**Positive:** Enforces live data, measurable latency, reproducible tests.  
**Negative:** Requires seeded realtime fixtures and perf tests in CI; tighter budgets may need tuning.

## Implementation Notes
- Add contract test: fail if any chart renders zero/placeholder when fixtures are loaded.
- Add Lighthouse/Playwright perf step targeting the analytics route; record metrics in artifacts.
- Ensure Supabase channel auth respects RLS (per ADR-004 multi-tenancy).

## Verification
- MATOP Domain + Quality STOAs must check latency artifact and non-placeholder assertions.
- Completion gate: presence of realtime perf artifacts and passing e2e/live-data check.

## Links
- Aligns with ADR-004 Multi-Tenancy, ADR-001 Modern Stack, ADR-003 Type-Safe API.
