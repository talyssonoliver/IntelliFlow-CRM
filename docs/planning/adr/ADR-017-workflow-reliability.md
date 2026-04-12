# ADR-017: Workflow Reliability, Approvals, and Observability

**Status:** Accepted  
**Date:** 2026-02-02  
**Deciders:** Automation Lead, Backend Lead, QA Lead (STOA-Automation)  
**Related Tasks:** IFC-029 (Auto-Response with Approval Gate), IFC-030 (Smart
Lead Routing), IFC-032 (OpenTelemetry Monitoring), IFC-033 (Load Testing with
k6)

## Context and Problem

- Workflow features (LLM auto-response with approval, lead routing, telemetry,
  load tests) were planned/delivered without a unified reliability and
  observability contract.
- Approval gates and routing correctness need deterministic evidence before
  scaling traffic.

## Decision

1. **Approval Flow Guarantee:** LLM-generated responses must pass a
   human-approval state; audit log of decisions stored with trace-id.
2. **Routing Determinism:** Smart routing uses a scored, weighted algorithm;
   simulation results must use real seeded leads (no synthetic placeholders) and
   be repeatable.
3. **Observability Baseline:** All workflow steps emit OTel traces with
   route_id/workflow_id; trace-examples.json must contain real trace IDs from
   executed flows.
4. **Load/Resilience:** k6 tests target 5k leads/hour; success requires p95
   <200ms per step, error rate <0.1%; results recorded in
   `load-test-report.html` and Grafana screenshot.
5. **Gates in CI:** Integration tests assert approval gate behavior; routing
   simulation CSV checked for non-placeholder rows; OTel config linted.

## Considered Options

- Best-effort logging only (rejected: unverifiable).
- Heavy BPMN engine for all flows (rejected: overkill).
- Lean state machine + OTel + k6 validation (chosen).

## Consequences

**Positive:** Traceable approvals, reproducible routing sims, measurable SLOs,
clear pass/fail.  
**Negative:** More CI time (sim + k6 + trace checks); needs seeded datasets.

## Implementation Notes

- Approval workflow BPMN stored as artifact; include response-quality metrics
  JSON.
- Routing sim must source data from test DB fixtures; CSV checked into
  artifacts/misc.
- OTel collector config kept in repo; trace IDs captured after running real
  calls.
- k6 script under `artifacts/misc/k6/scripts/load-test.js` with environment
  parameters checked.

## Verification

- MATOP Automation + Foundation STOAs to parse simulation CSV,
  trace-examples.json, and k6 outputs; block on placeholders or missing traces.
- Completion gate: presence of approval workflow BPMN, routing simulation CSV
  (real data), trace-examples.json (real IDs), load-test-report.html.

## Links

- Builds on ADR-005 Workflow Engine, ADR-010 Architecture Boundary Enforcement,
  ADR-008 Audit Logging.
