# ADR-018: Performance and Load Testing Strategy

**Status:** Accepted  
**Date:** 2026-02-02  
**Deciders:** Performance Eng, DevOps, QA Lead (STOA-Quality)  
**Related Tasks:** IFC-047 (Performance Tests), supports IFC-033 (k6 load), IFC-040 (prod hardening)

## Context and Problem
- Performance testing was fragmented across tasks; no single strategy defined perf budgets, tooling, and evidence required to pass completion gates.

## Decision
1) **Budgets:** p99 latency <100ms for core endpoints; Lighthouse PWA scores >90; k6 load (5k leads/hour) p95 <200ms, error <0.1%.  
2) **Tooling:** k6 for load; Lighthouse CI for web; vitest micro-benchmarks optional.  
3) **Evidence:** `.lighthouserc.js`, `performance-budgets.json`, `regression-alerts.yaml`, k6 reports (HTML + screenshot), Lighthouse reports stored per run.  
4) **Gate:** Completion requires latest k6 + Lighthouse artifacts with non-placeholder data and passing budgets or documented waivers.

## Considered Options
- Manual perf spot-checks (rejected).  
- Single-tool-only (rejected: UI + API need coverage).  
- Dual-track k6 + Lighthouse with budgets (chosen).

## Consequences
**Positive:** Clear budgets, reproducible artifacts, aligns with MATOP Quality checks.  
**Negative:** Extra CI time; budgets may need tuning per release.

## Implementation Notes
- k6 script parametrized; env-driven user count and ramp.  
- Budgets stored in `artifacts/benchmarks/performance-budgets.json`; Lighthouse config under repo root.  
- Attach k6 outputs to attestation; hash-verified in completion gate.

## Verification
- MATOP Quality STOA must read k6 and Lighthouse outputs and enforce budgets.  
- Completion gate: presence of k6 HTML + screenshot + budgets JSON, with p99/p95 within targets or explicit waiver.

## Links
- Relates to ADR-007 Data Governance (metrics integrity) and ADR-015 Security (hardening).  
