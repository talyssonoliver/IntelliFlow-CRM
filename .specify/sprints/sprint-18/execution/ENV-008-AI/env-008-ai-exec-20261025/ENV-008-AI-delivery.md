# Delivery Report: ENV-008-AI

**Run ID**: env-008-ai-exec-20261025
**Date**: 2026-10-25
**Task**: ENV-008-AI, Automated Observability with Predictive Monitoring (re-scoped by owner ruling A)
**Branch**: `feat/env-008-ai-env008`, not pushed (the runner ships)

## Implementation Summary

### Files Created
| File | Purpose |
|---|---|
| `infra/monitoring/grafana/cloud/slos.json` | 3 production SLOs: api availability (fast and slow burn alerts), api latency, ai-worker LLM success |
| `tools/scripts/observability/apply-grafana-slos.mjs` (+ `.d.mts`) | applies the SLOs by fixed uuid (GET, then POST or PUT); fails on a uuid mismatch |
| `infra/monitoring/grafana/cloud/dashboard-production.json` | service dashboard, uid `env008-production`, 5 panels |
| `tools/scripts/observability/apply-grafana-dashboard.mjs` (+ `.d.mts`) | saves the dashboard into the production folder |
| `tools/scripts/observability/apply-railway-self-healing.mjs` (+ `.d.mts`) | reads and sets the Railway restart policy and health checks for api and combined-worker (ai-worker while it exists); the api live-probe guard, bound to the api's Railway host |
| `.github/workflows/grafana-slos.yml`, `grafana-dashboard.yml`, `railway-self-healing.yml` | CI apply on merge, one workflow per resource |
| 5 test files under `tools/scripts/__tests__/` | SLO, dashboard, Railway, workflow-contract and descriptive-content tests |
| `.specify/sprints/sprint-18/findings/ENV-008-AI-findings.md` | fixed and tracked findings |

### Files Modified
| File | Change |
|---|---|
| `tools/scripts/lib/grafana-provisioning.mjs` | 503 retry (8 attempts over 255 s), `redactBody`, `requireEnv`, header naming its 4 callers |
| `apply-grafana-alert-rules.mjs`, `apply-synthetic-monitoring.mjs` (+ `.d.mts`) | `sleep` threaded through; error bodies redacted; shared env check |
| `.github/workflows/grafana-alert-rules.yml` | timeout 5 → 12 minutes and the header comment only |
| `infra/monitoring/self-healing-rules.yaml`, `anomaly-detection.json` | rewritten as descriptive records |
| `infra/monitoring/otel-config.yaml` | production-topology comments only (still a valid collector config) |
| 3 observability docs, ADR-087, 2 dependency-chain docs | production topology; workflows, guard and issues; ENV-008-AI marked ⏳ |
| `artifacts/metrics/debt-ledger.yaml` | 6 new items; `debt_002` resolved |
| `Sprint_plan.csv` (+ split A), the spec (dated AC-006 note) | status In Progress; EVIDENCE path moved to sprint-18 |

### Test Files
| Test File | Tests | Status |
|---|---|---|
| the 8 task test files | 188 | pass (`task-tests.txt`) |
| regression: `workflow-secret-lint` + `observability/__tests__/` | 20 | pass (`regression-tests.txt`) |
| full root project | 2777 (+2 skipped) | pass (`root-full-tests.txt`) |

## TDD Execution
| Step | Description | RED | GREEN | REFACTOR |
|---|---|---|---|---|
| 1-8 | tests for the lib, the alert-rules and synthetic scripts, SLOs, dashboard, Railway, workflows, descriptive content | `ea3cd5ef1`: 30 failed / 48 passed (`red-checkpoint.txt`) | | |
| 9-15 | lib, scripts, configs, workflows | | `f2bfe54da` | |
| 16-18 | descriptive files, docs, ADR, spec note | | `caa46188a` | |
| 19 | `requireEnv`, CSV evidence path, chains | | | `f15ce5903` |
| review | STOA and independent-review fixes, each test first (6 and 4 RED) | `e0b478906` | `e0b478906` | |

## Acceptance Criteria Validation
| Criterion | Status | Evidence |
|---|---|---|
| AC-001 503 retry, other statuses not retried, every script takes `sleep`, `redactBody` everywhere | PASS | `grafana-provisioning.test.ts`; 503 cases in all 4 Grafana script tests; `grep '${x.text}'` prints nothing |
| AC-002 3 SLOs, documented objectives, no `_bucket`, health excluded, caveats | PASS | `apply-grafana-slos.test.ts` (slos.json block) |
| AC-003 POST create, PUT update, dry run GETs only, env refused | PASS | `apply-grafana-slos.test.ts` (run block) |
| AC-004 burn alerts on availability only; latency and LLM name their own issue | PASS | test; #1001 and #1029 carry the "enable alerting" item |
| AC-005 dashboard uid, folder, 5 panels, metrics and services | PASS | `apply-grafana-dashboard.test.ts` |
| AC-006 independent apply per resource | PASS with deviation | three workflows instead of three jobs (plan r4/A2; dated spec note); `env008-workflows.test.ts` |
| AC-007 Railway read, write only differing keys on `--apply`, read-back, fail closed, ai-worker guard | PASS with addition | 39 tests incl. the api live-probe guard (plan r4/A1) |
| AC-008 Railway workflow: push applies, dispatch read-only, Production, secret in env only | PASS | `env008-workflows.test.ts` |
| AC-009 descriptive infra files | PASS | `env008-monitoring-content.test.ts` |
| AC-010 docs and ADR | PASS | grep checks (plan Steps 17-18) |
| AC-011 issues, ledger, findings | PASS (5 issues + #1032) | #1028, #1029, #1030, #1031, #1001 (reused), #1032 |
| AC-012 honest attestation | PASS | verdict NEEDS_HUMAN; 100% KPI `met:false`; EVIDENCE path sprint-18 |
| NF-001 no token, ID or body in logs | PASS | redaction and leak tests in every script test; gitleaks clean |
| NF-002 no dependency, no secret | PASS | `nf002-deps.txt` empty; workflows reuse `GRAFANA_SA_TOKEN`, `RAILWAY_TOKEN` and existing vars |
| NF-003 diff coverage >= 80% | PASS (93.6%); one-line guards: deviation | `diff-coverage.txt` |

## Definition of Done Validation
| DoD Item | Status | Evidence |
|---|---|---|
| OpenTelemetry AI-configured | met | Grafana `target_info` api and ai-worker (2026-10-22); otel-config comments |
| Anomaly detection active | met | Asserts rules in production (2026-10-22); anomaly-detection.json |
| Predictive alerts set | NEEDS_HUMAN | built; live after the first `grafana-slos.yml` run on main |
| Self-healing enabled | NEEDS_HUMAN | built; live after the first `railway-self-healing.yml` run on main |
| SLOs defined / dashboards live | NEEDS_HUMAN | built; live after merge |
| 100% services emit | not met (not claimed) | 2 of 6 apps; EP-001-AI |

## MATOP Validation
| STOA | Verdict | Notes |
|---|---|---|
| Foundation | PASS | |
| Automation | PASS | |
| Quality | WARN | gaps closed in `e0b478906`; logs re-run at HEAD |
| Security | PASS after merge (FAIL at `5162ed721`) | the only blocker was the inherited `pnpm audit`; after merging origin/main the criticals are gone (#1008), highs in #1016 |

**Consensus Verdict**: WARN after the merge (FAIL before it, on the inherited audit alone). See `stoa-verdicts.md`.

## Compliance Check Results
WARN, with no blocking item (`compliance-check.md`).

## Task Status
**Status Change**: Plan Complete → **In Progress**. The attestation verdict is NEEDS_HUMAN, with production evidence after merge (see the attestation notes). The CSV stays In Progress because `validate-sprint-data` (a required pre-ship step) accepts no "Needs Human" status; this follows the PG-199 precedent.
