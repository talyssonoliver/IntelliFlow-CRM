# IFC-033 Specification: PHASE-005 — Load Testing with k6

**Task**: IFC-033 — PHASE-005: Load Testing with k6 **Sprint**: 19 **Status**:
Spec Complete (RETROSPECTIVE) **Date**: 2026-07-25 **Agents**: test-engineer /
Performance Eng (load-bearing), devops-lead, backend-architect

> ⚠ **RETROSPECTIVE ARTIFACT.** Reconstructed on 2026-07-25 from the
> **already-merged** implementation (PR #622, merge SHA `1235bcee1`, merged
> 2026-07-24) as part of the ENG-OPS-003 governance catch-up. It was **not**
> authored before implementation. Every claim below was verified against the
> merged code and the committed evidence files on `origin/main` @ `f4ec0b0cb`.
> IFC-033 already shipped a full ADR-068 attestation and its CSV flip in #622;
> this spec closes the remaining gate-2 artifact gap.

---

## Executive Summary

IFC-033 produces the **real benchmark evidence** that gates IFC-034 (the Gate-3
£3,000 investment review). The governing risk, carried in the sprint plan, is
**RISK-S19-02: a templated load-test report passed off as a real run.** The
specification therefore treats *provenance of the evidence* as a first-class
acceptance criterion, not just the performance numbers.

Scope: a k6 load test over the Sprint-19 critical paths — lead ingestion, tRPC
reads, and the DDD-001/002 atomic `lead → deal` conversion landed in #621 —
executed against a local, **prod-safe** target, with the run's own artifacts
(HTML report, Grafana screenshot, summary JSON) committed as evidence.

---

## Phase 0.75 — Codebase Exploration Evidence

Verified on `origin/main` @ `f4ec0b0cb`.

| Finding                                                   | File:Line                                              |
| --------------------------------------------------------- | ------------------------------------------------------ |
| Two-scenario k6 script (`ingest`, `convert`)              | `tools/scripts/k6/ifc-033-critical-path.js:95-116`     |
| k6 thresholds declared in-script (not asserted post-hoc)  | `tools/scripts/k6/ifc-033-critical-path.js:117`        |
| `setup()` provisions the run                              | `ifc-033-critical-path.js:127`                         |
| `handleSummary()` emits the committed summary JSON        | `ifc-033-critical-path.js:192`                         |
| Runner wrapper (`pnpm test:load`)                         | `tools/scripts/k6/run-ifc-033-load-test.mjs`           |
| Secret-free CI job                                        | `.github/workflows/performance-gate.yml`               |
| Grafana dashboard provisioning                            | `infra/monitoring/grafana/provisioning/dashboards/k6-load-test.json` |
| Atomic conversion under test (dependency)                 | landed in #621 (DDD-001/002)                           |
| Budget source                                             | ADR-018                                                |

---

## Acceptance Criteria

Each maps 1:1 to a gate recorded in the attestation.

| #   | Criterion                                                     | Budget (ADR-018) | Gate ID                     |
| --- | ------------------------------------------------------------- | ---------------- | --------------------------- |
| AC1 | Evidence is from an **actual** k6 run, with real timestamps   | no template      | `real-benchmark-data`       |
| AC2 | Lead throughput                                               | ≥ 5,000 /hour    | `throughput-5000-per-hour`  |
| AC3 | p95 latency on ingestion                                      | < 200 ms         | `p95-under-200ms`           |
| AC4 | Error rate                                                    | < 0.1 %          | `error-rate-under-0.1pct`   |
| AC5 | Atomic `lead → deal` conversion exercised under load          | > 0, 0 failures  | `atomic-conversion-exercised` |
| AC6 | A bottleneck is identified and documented                     | qualitative      | `bottleneck-identified`     |
| AC7 | Run never touches production                                  | hard constraint  | `prod-safe`                 |
| AC8 | Reproducible via a committed `pnpm test:load` entry point     | —                | `validate-pnpm-test-load`   |

---

## Measured Result (from the canonical 3-minute run)

| Metric                     | Budget      | Achieved      | Margin |
| -------------------------- | ----------- | ------------- | ------ |
| Leads/hour                 | 5,000       | **21,617**    | 4.3×   |
| p95 (ingestion)            | < 200 ms    | **11.6 ms**   | 17×    |
| Error rate                 | < 0.1 %     | **0 %**       | —      |
| Atomic conversions         | > 0         | **180**, 0 failures | — |
| Total requests / duration  | —           | 2,343 / 180 s | —      |
| Foreign leads visible under tenant role (RLS) | 0 | **0**    | —      |

---

## Prod-safety constraints (non-negotiable)

1. Target is local `apps/api` on `:4000` with the dev-auth fallback.
2. Database is the **local test DB on :5433**, never the production Supabase
   `DATABASE_URL`.
3. Tenant isolation is verified at the DB layer under a **non-superuser** role,
   so RLS is genuinely exercised rather than bypassed.
4. The CI job is **secret-free** — it cannot reach a credentialed environment.

---

## Known limitation (documented, not hidden)

The identified bottleneck is the **per-user AUTHENTICATED rate-limit tier**
(1,000 requests / 60 s, keyed by `userId`). Over-driving at ~26 req/s from a
single synthetic user drew a uniform 36 % `429` response rate. This is a
**harness artifact of single-user load generation, not a system throughput
ceiling** — a real multi-user population would not share one bucket. Recorded in
`docs/shared/bottleneck-analysis.md` so the number is not later misread as a
platform limit.

---

## Evidence

- Merge: PR #622, squash `1235bcee1`, 2026-07-24; base `15c1b4dec`
- Attestation:
  `.specify/sprints/sprint-19/attestations/IFC-033/attestation.json` (verdict
  `COMPLETE`, provenance ADR-068, 8/8 gates PASS)
- Context ack: `.specify/sprints/sprint-19/attestations/IFC-033/context_ack.json`
- Run artifacts: `docs/evidence/ifc-033/` (HTML report, Grafana PNG, summary
  JSON), mirrored to `artifacts/reports/` + `artifacts/benchmarks/`
