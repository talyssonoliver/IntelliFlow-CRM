# Execution Plan: IFC-033 (RETROSPECTIVE)

**Task**: PHASE-005: Load Testing with k6 **Sprint**: 19 **Spec**:
`.specify/sprints/sprint-19/specifications/IFC-033-spec.md` **Date**: 2026-07-25

> ⚠ **RETROSPECTIVE ARTIFACT.** Reconstructed on 2026-07-25 from the merged
> implementation (PR #622, `1235bcee1`). Steps are checked because the merged
> code and committed evidence were **read and verified**, not because this plan
> drove the work. Provenance stated plainly rather than backdated.

---

## Preflight Checks

1. Branch is `feat/ifc-033-k6-load-test`, base `15c1b4dec` — ✅ (attestation
   `branch` / `base_commit`)
2. Dependencies Completed: IFC-030, IFC-032 — ✅ (CSV `Dependencies`)
3. The atomic conversion under test exists (DDD-001/002, #621) — ✅ merged
   `15c1b4dec` is the conversion commit's merge base
4. **Prod-safety preflight (July local baseline only)** — confirm the target DB is `:5433`, not Supabase:
   ```
   node -e "console.log(process.env.DATABASE_URL)"   # must be localhost:5433
   ```
5. **Production-run preflight (Phase 6, 2026-10-22)** — the spec amendment's
   "Production-run conditions" replace #4 for the deployed run: a fresh owner
   approval for this run (recorded), `BASE_URL` is the deployed API, a tenant
   created for load testing whose `lead.list` shows only `@loadtest.example.com`
   leads before load, writes through the API only, credentials only in the
   gitignored `.env.k6.local`. All checked on 2026-10-22 before S19 (S18).

---

## Implementation Reality Checks

| Surface                          | Production Consumer                  | Replaces / Blocks                       | Verification Command                          |
| -------------------------------- | ------------------------------------ | --------------------------------------- | --------------------------------------------- |
| `ifc-033-critical-path.js`       | k6 runtime only — no production code | N/A (new)                               | `pnpm test:load`                              |
| `run-ifc-033-load-test.mjs`      | `pnpm test:load` script              | N/A (new)                               | `pnpm test:load`                              |
| `performance-gate.yml`           | GitHub Actions                       | Adds a **secret-free** job              | workflow run                                  |
| `k6-load-test.json` (Grafana)    | Grafana provisioning                 | N/A (new dashboard)                     | dashboard renders                             |
| `docs/evidence/ifc-033/*`        | Audit evidence for IFC-034 Gate-3    | Blocks IFC-034 if templated             | manual provenance review                      |
| `prepare-ifc-033-tenant.mjs` (Phase 6) | Operator CLI before a deployed `pnpm test:load` | N/A (new)                  | `__tests__/prepare-ifc-033-tenant.test.ts`; S18 |
| `artifacts/benchmarks/ifc-033-deployed/*` (Phase 6) | Production-run evidence | Supersedes `docs/evidence/ifc-033/` as current | S19/S20 |

**Zero production runtime code changed.** IFC-033 adds tooling, CI, and
evidence only — the load test observes the system, it does not modify it.

---

## Execution Steps

### Phase 1 — Harness

- [x] **S1** — Author `ifc-033-critical-path.js` with two scenarios: `ingest`
      (lead creation + tRPC reads) and `convert` (atomic `lead → deal`).
- [x] **S2** — Declare thresholds **inside** the script
      (`http_req_duration{scenario:lead_ingestion} p(95)<200`,
      `http_req_failed rate<0.001`) so k6 itself fails the run — the budget is
      enforced by the tool, not asserted by hand afterwards.
- [x] **S3** — `handleSummary()` emits the summary JSON that becomes committed
      evidence.
- [x] **S4** — `run-ifc-033-load-test.mjs` wrapper + `pnpm test:load` script.

### Phase 2 — Observability

- [x] **S5** — Prometheus remote-write from k6; provision the
      `k6-load-test.json` Grafana dashboard.

### Phase 3 — Canonical run (prod-safe)

- [x] **S6** — Local `apps/api` on `:4000` with dev-auth; local test DB `:5433`.
- [x] **S7** — 3-minute canonical run. k6 exit 0, **no threshold crossings**.
- [x] **S8** — Capture the three evidence artifacts from *that* run: HTML report
      (real timestamps), Grafana PNG, summary JSON.
- [x] **S9** — Verify RLS at the DB layer under a **non-superuser** role:
      foreign-tenant leads visible = **0**.

### Phase 4 — Analysis

- [x] **S10** — Over-drive to find the ceiling; identify the per-user
      rate-limit tier (1,000/60 s, `userId`-keyed) as the binding constraint.
- [x] **S11** — Document in `docs/shared/bottleneck-analysis.md`, explicitly
      labelling it a **single-user harness artifact**, not a system ceiling.

### Phase 5 — CI + evidence

- [x] **S12** — Add the secret-free `performance-gate.yml` job.
- [x] **S13** — Commit evidence under `docs/evidence/ifc-033/`; mirror to
      `artifacts/`.
- [x] **S14** — ADR-068 attestation with 8 gate results; flip CSV to Completed.

---

### Phase 6 — Deployed-environment run (reopen #795, 2026-10-22)

#795 reopened IFC-033 because S6–S8 targeted `localhost:4000`. Its close criterion
(`attestations/IFC-033/task-tracking.json` blockers): a k6 run against a deployed
environment, with owner approval, and the dashboard taken from the hosted backend
production reports to. These steps were added on 2026-10-22 and record the work as
it was done. The owner's rulings are in
`.specify/sprints/sprint-18/context/IFC-033/IFC-033-owner-ruling.md`.

- [x] **S15** — Audit the merged deliverables against the DoD. Result: harness,
      reports, ADR and bottleneck doc hold. The only gap is the deployed target.
      There is no staging API or database (`cd.yml` `deploy-staging` builds only the web app;
      no STAGING vars or secrets), and the
      #887 nightly has never run (it stays queued for a self-hosted runner).
- [x] **S16** — Owner rulings: production, a dedicated tenant, a smaller run to cap
      the per-lead AI scoring cost (2 min at 23 leads per 15 s), synthetic data left in place.
- [x] **S17** — Harness changes, default behaviour unchanged: optional
      `K6_AUTH_TOKEN` Bearer header and `INGEST_TIME_UNIT`/`CONVERT_TIME_UNIT` in
      `ifc-033-critical-path.js`. New `prepare-ifc-033-tenant.mjs` (signup or login,
      seed lead, QUALIFIED pool through `lead.bulkUpdateStatus`, credentials only in
      the gitignored `.env.k6.local`), with unit tests in
      `__tests__/prepare-ifc-033-tenant.test.ts`. Note: the test file was written after
      the module, not RED-first. Review fixes in `02023bf9d`: honour
      `bulkUpdateStatus` `{successful, failed}` (it answers 200 on partial failure),
      unique default run tag, combined signup+login error, token expiry printed,
      `main()` injectable and tested (24 tests, 94.7 % lines).
- [x] **S18** — Provision the tenant on production. Verified before load: `lead.list`
      showed 21 leads, all synthetic.
- [x] **S19** — Production run, 2026-10-22 23:06:36Z to 23:08:54Z: 5,435 leads/hour,
      0 % errors, 20/20 conversions, client p95 1,137 ms (**FAIL** against 200 ms),
      k6 exit 99.
- [x] **S20** — Server-side evidence from Grafana Cloud: Prometheus p50/p95 by method,
      a Tempo trace breakdown, and dashboard `ifc033-prod-api-load` rendered to
      `artifacts/misc/grafana-load-test.png`.
- [x] **S21** — Bottleneck: about 147 ms per API-to-database round-trip
      (cross-region). Documented in `bottleneck-analysis.md` §0, tracked in #1001 and
      debt-ledger `PROD-API-DB-CROSS-REGION-LATENCY-001`. The owner ruled the task
      closes on throughput. (Cross-region is inferred: Supabase is `eu-central-1`; the
      Railway API region is unconfirmed.)
- [x] **S22** — Re-record the ADR-068 attestation for the production run: p95 as a
      measured FAIL under the owner waiver, verdict COMPLETE resting on the owner
      ruling. Then flip the CSV row through `tools/scripts/flip-task-status.mjs`.

**Files (Phase 6).** Created: `tools/scripts/k6/prepare-ifc-033-tenant.mjs`,
`tools/scripts/k6/__tests__/prepare-ifc-033-tenant.test.ts`,
`artifacts/benchmarks/ifc-033-deployed/k6-run-output.txt`,
`artifacts/benchmarks/ifc-033-deployed/server-side-telemetry.json`,
`artifacts/coverage/IFC-033-before.json`, `artifacts/coverage/IFC-033-after.json`.
Modified: `tools/scripts/k6/ifc-033-critical-path.js`,
`tools/scripts/k6/run-ifc-033-load-test.mjs`, `artifacts/reports/load-test-report.html`,
`artifacts/benchmarks/ifc-033-load-summary.json`, `artifacts/misc/grafana-load-test.png`,
`docs/shared/bottleneck-analysis.md`, `artifacts/metrics/debt-ledger.yaml`, this plan,
the spec, and the IFC-033 attestation files.

**AC traceability (Phase 6, production run):**

| AC  | Step(s)        | Evidence                                                                 |
| --- | -------------- | ------------------------------------------------------------------------ |
| AC1 | S19            | `k6-run-output.txt`, `load-test-report.html` (real timestamps)            |
| AC2 | S19            | 5,435 leads/hour, `ifc-033-load-summary.json`                            |
| AC3 | S19, S20, S22  | FAIL 1,137 ms client, recorded as FAIL under owner waiver                |
| AC4 | S19            | 0 % errors (0 / 391)                                                     |
| AC5 | S18, S19       | 20/20 conversions from the QUALIFIED pool                                |
| AC6 | S20, S21       | Tempo trace: about 147 ms per round-trip, `bottleneck-analysis.md` §0       |
| AC7 | S16, S18       | owner rulings, tenant verified synthetic-only before load                |
| AC8 | S17, S19       | `pnpm test:load` wrapper used for the run; exits 99 on the AC3 threshold |

## Verification (independently re-run 2026-07-25 on `origin/main` @ `f4ec0b0cb`)

> This table verifies the **July local baseline**. Its "8/8 PASS" and "Completed"
> rows were true then and were reopened by #795. The current evidence is Phase 6
> (`artifacts/benchmarks/ifc-033-deployed/`); `docs/evidence/ifc-033/` keeps the July run.

| Check                                        | Result                                                    |
| -------------------------------------------- | --------------------------------------------------------- |
| k6 script present with 2 scenarios           | ✅ `ifc-033-critical-path.js:95-116`                       |
| In-script thresholds (tool-enforced budget)  | ✅ `ifc-033-critical-path.js:117`                          |
| Runner + `pnpm test:load` wired              | ✅ `run-ifc-033-load-test.mjs`, `package.json`             |
| All 11 attested artifacts exist on main      | ✅ verified path-by-path                                   |
| Evidence dir populated                       | ✅ `docs/evidence/ifc-033/` (HTML + PNG + JSON)            |
| Attestation records 8/8 gates PASS           | ✅ verdict `COMPLETE`                                      |
| CSV already Completed / 100 %                | ✅ flipped in #622 (`csv_mutations`)                       |
| Bottleneck documented, not buried            | ✅ `docs/shared/bottleneck-analysis.md`                    |

---

## Residual

- The 36 % `429` rate under over-drive is a **single-user artifact**. A
  multi-user load profile (distinct `userId` per VU) would raise the observed
  ceiling. Worth a follow-up run before IFC-034's Gate-3 review if a higher
  headroom figure is needed. (The 4.3× margin was the July local run.)
- Production (Phase 6): throughput clears the budget at 1.09× (5,435/h at a
  deliberately capped rate, not a ceiling), but p95 fails, at 1,137 ms against 200 ms.
  The fix (co-locate `api` with the database) is an owner infra decision
  tracked in #1001. AC3 stays FAIL until a re-run after that fix passes.

---

## Plan-Reviewer Sign-off

<!-- plan-reviewer: subagent -->

**Verdict: APPROVED_WITH_CHANGES** (2026-10-23)

Verified against the branch diff (dd164c4ca..fed314f7a): S15-S21 are backed by
artifacts (k6-run-output.txt, server-side-telemetry.json, bottleneck-analysis
§0, debt-ledger entry, task-tracking resolutions, summary JSON with p95=false).
S17 states the test-after deviation honestly. Numbers match the owner ruling.

Required changes (plan text, no code):

1. Stale evidence: `docs/evidence/ifc-033/` still holds the July localhost
   run (not touched in this diff) while the Verification table cites it as
   current. Either refresh/annotate it or point the table at
   `artifacts/benchmarks/ifc-033-deployed/`.
2. Preflight #4 ("DATABASE_URL must be localhost:5433") and S6 contradict the
   amended AC7. Add a Phase 6 preflight (production target, tenant isolation,
   API-only writes) and mark the old one local-baseline only.
3. Add AC traceability for Phase 6 (AC1-AC8 to S15-S21); AC8 is not cited.
4. Add the missing step: re-record the ADR-068 attestation (p95 as measured
   FAIL, COMPLETE resting on the owner ruling) and the CSV/status update.
5. Add Files to Create/Modify for Phase 6 (prepare-ifc-033-tenant.mjs and its
   test are absent from the Reality Checks table); mention the 02023bf9d
   bulkUpdateStatus fix under S17.
6. Update the Residual section; its "4.3x margin clears the budget" claim is
   stale for the deployed run.

### Re-review (2026-10-23)

<!-- plan-reviewer: subagent -->

**Verdict: APPROVED.** All six required changes are present and accurate. S22 is
honestly left unticked; the task must not be closed or the CSV flipped until it
is done. Nit (non-blocking): preflight #5 cites the spec's "Production-run
conditions", which the spec's Reopen amendment does not use as a heading.
