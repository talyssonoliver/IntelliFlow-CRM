# PRD: Analytics & Reporting UX

**Version:** 1.0  
**Date:** 2026-02-02  
**Owners:** Product Lead, Data Lead  
**Related Tasks:** IFC-037, IFC-038, IFC-096  
**Decision Records:** ADR-016-analytics-integrity.md

## Summary
Ship real-time analytics dashboards that read live Supabase data, maintain freshness SLAs, and meet performance and data-quality targets.

## Goals
- Real-time dashboards with p95 update latency <1s.
- No placeholder or static JSON in production.
- Actionable KPIs with data-quality checks in CI.

## Non-Goals
- Predictive ML scoring (covered in AI PRD).
- Back-office financial reporting.

## Users & Use Cases
- Sales leaders: monitor pipeline velocity, conversion, SLA compliance.
- CS managers: ticket SLA adherence, churn indicators.
- Execs: top KPIs snapshot with drill-downs.

## Functional Requirements
- Charts backed by Supabase realtime channels; fallback polling only for outages.
- KPI definitions versioned; data-quality assertions (non-null, non-placeholder) in CI.
- Export baseline metrics and latency recordings as artifacts.

## Non-Functional Requirements
- Performance: dashboard TTI <1s P95; bundle budget 200KB/route.
- Observability: traces/spans for dashboard queries; perf video + latency JSON artifacts.
- Accessibility: WCAG AA for charts and tables.

## Metrics
- Freshness p95 <1s; error rate <0.1% on realtime stream.
- Lighthouse perf >90 on dashboard route.
- Zero placeholder assertions failing in CI.

## Acceptance Criteria
- Realtime perf artifacts present (video + latency JSON) and passing gates.
- E2E test that queries live fixtures and fails on placeholder data.
- Lighthouse + axe reports attached.

## Dependencies
- ADR-001, ADR-003, ADR-004, ADR-007, ADR-016.

## Risks / Mitigations
- Risk: Realtime channel throttling → Mitigate with backoff and fallback polling.
- Risk: Data-quality regressions → Mitigate with CI assertions and seeded fixtures.
