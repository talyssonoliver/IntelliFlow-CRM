# IFC-033 Specification: PHASE-005 — Load Testing with k6

**Task**: IFC-033 — PHASE-005: Load Testing with k6 **Sprint**: 19 **Status**:
Spec Complete (RETROSPECTIVE) **Date**: 2026-07-25 **Agents**: test-engineer /
Performance Eng (load-bearing), devops-lead, backend-architect **Amended**:
2026-10-22 (reopen #795, owner rulings). See "Reopen amendment" at the end; where
an earlier section conflicts with it, the amendment wins.

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
(HTML report, Grafana screenshot, summary JSON) committed as evidence. _(July
baseline scope. The 2026-10-22 amendment adds one owner-approved run against the
deployed production API; see "Reopen amendment".)_

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
| AC7 | Run never touches production _(superseded 2026-10-22, see amendment)_ | hard constraint  | `prod-safe`                 |
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

## Prod-safety constraints (July local baseline)

> Constraints 1–3 bound the 2026-07-24 local run and still bind any local re-run.
> For the deployed run they are **superseded** by the amended AC7 and the
> "Production-run conditions" in the amendment. Constraint 4 still holds.

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
  `.specify/sprints/sprint-19/attestations/IFC-033/attestation.json`. The July
  version (verdict `COMPLETE`, 8/8 gates PASS) covered only the local run; #795
  set it to `PARTIAL`. It is re-recorded for the production run, with p95 as a
  measured FAIL under the owner's waiver.
- Context ack: `.specify/sprints/sprint-19/attestations/IFC-033/context_ack.json`
- July run artifacts: `docs/evidence/ifc-033/` (HTML report, Grafana PNG, summary
  JSON). The production run's artifacts replaced the copies in
  `artifacts/reports/`, `artifacts/benchmarks/` and `artifacts/misc/`, plus
  `artifacts/benchmarks/ifc-033-deployed/`.

---

## Reopen amendment (2026-10-22, owner rulings)

#795 reopened IFC-033: the canonical run above targeted `localhost:4000`, while
the row's KPI ("System handles 5000 leads/hour") concerns the deployed system.
There is no staging API or database: the `deploy-staging` job
(`.github/workflows/cd.yml:59`) builds only the web app, and its API target falls
back to the production API. The nightly k6 job (`performance-gate.yml`) waits for
a self-hosted runner and has produced no report. The owner made three rulings
(`.specify/sprints/sprint-18/context/IFC-033/IFC-033-owner-ruling.md`): run against
**production** in a dedicated tenant, run smaller to cap the per-lead AI scoring
cost, and close the task on throughput, tracking p95. These change two acceptance
criteria. Neither is dropped: both are restated with the old wording kept.

**Waiver basis for AC3.** ADR-018 Decision 4 makes completion require "passing
budgets or documented waivers", and ADR-017 Decision 4 sets p95 < 200 ms per step.
The production run does not meet that budget. The owner's third ruling is the
documented waiver. The attestation records `p95-under-200ms` as **FAIL with
owner waiver**, never as PASS.

| #   | Old                                  | New                                                                                                                                                       | Evidence                                                                                           |
| --- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| AC3 | p95 < 200 ms (gate)                  | Measured and reported against 200 ms. **Production FAIL: 1,137 ms client, 2,024 ms POST server-side¹.** Owner waiver (ADR-018 Decision 4), gap tracked in #1001. AC3 stays FAIL until a re-run after the fix passes | k6 summary, Grafana Cloud, Tempo trace                                                             |
| AC7 | Run never touches production         | One owner-approved run against the **deployed production API**, under the "Production-run conditions" below                                         | owner rulings 2026-10-22; tenant verified to hold only synthetic leads before load                 |

¹ Server-side percentiles come from `histogram_quantile` over the OTel default
buckets (…, 1 s, 2.5 s, …), so they are interpolated within a bucket. The client
p95 (k6) is exact.

**Production-run conditions (bind every production run, including any re-run):**

1. **Approval is per run.** The 2026-10-22 approval covered one run: about 2 min,
   23 leads per 15 s, 20-lead conversion pool, about 205 leads and AI scoring calls in
   total. Any further production run needs a fresh owner approval. Until a new
   ruling says otherwise, these caps bind it.
2. **Own tenant only.** The run uses a tenant created for load testing through
   `auth.signup`, which provisions a new production tenant and user. Never a real
   customer tenant, and never another tenant's data. Before load, the tenant must
   be checked to contain only synthetic leads (`lead.list`, all
   `@loadtest.example.com`). Its only user must be the load-test account.
3. **API only.** Every write goes through the deployed API. Nothing writes to the
   database directly.
4. **Credentials.** The account email, password and access token live only in the
   gitignored `.env.k6.local`, and never in logs, docs, artifacts or commits. The
   access token is short-lived (its expiry is printed). Rotating or disabling the
   account belongs to the owner.
5. **Cleanup.** Synthetic data (`@loadtest.example.com`, tag `ifc-033-load-test`)
   stays in place. Deleting it, the tenant or the account is the owner's decision.
6. **Remediation scope.** Co-locating the API with Supabase `eu-central-1` is an
   owner infrastructure decision. It is tracked in #1001 and debt-ledger
   `PROD-API-DB-CROSS-REGION-LATENCY-001`, and is outside this task.

**Production result (2026-10-22 23:06:36Z to 23:08:54Z):**

| Criterion                 | Result                                    |
| ------------------------- | ----------------------------------------- |
| AC1 real run              | ✅ k6 output with real timestamps         |
| AC2 throughput            | ✅ 5,435 leads/hour (185 leads over k6's 122.5 s test-run duration) |
| AC3 p95                   | ❌ 1,137 ms (FAIL, owner waiver; #1001)    |
| AC4 error rate            | ✅ 0 % (0 / 391)                          |
| AC5 atomic conversion     | ✅ 20 / 20                                |
| AC6 bottleneck            | ✅ about 147 ms per API-to-database round-trip, from a Tempo trace. Cross-region is inferred: Supabase is `eu-central-1`, the Railway API region is unconfirmed |
| AC7 target                | ✅ as amended                             |
| AC8 `pnpm test:load`      | ✅ entry point used; exits 99 on the AC3 threshold, as designed |

Details: `docs/shared/bottleneck-analysis.md` §0.
