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
4. **Prod-safety preflight** — confirm the target DB is `:5433`, not Supabase:
   ```
   node -e "console.log(process.env.DATABASE_URL)"   # must be localhost:5433
   ```

---

## Implementation Reality Checks

| Surface                          | Production Consumer                  | Replaces / Blocks                       | Verification Command                          |
| -------------------------------- | ------------------------------------ | --------------------------------------- | --------------------------------------------- |
| `ifc-033-critical-path.js`       | k6 runtime only — no production code | N/A (new)                               | `pnpm test:load`                              |
| `run-ifc-033-load-test.mjs`      | `pnpm test:load` script              | N/A (new)                               | `pnpm test:load`                              |
| `performance-gate.yml`           | GitHub Actions                       | Adds a **secret-free** job              | workflow run                                  |
| `k6-load-test.json` (Grafana)    | Grafana provisioning                 | N/A (new dashboard)                     | dashboard renders                             |
| `docs/evidence/ifc-033/*`        | Audit evidence for IFC-034 Gate-3    | Blocks IFC-034 if templated             | manual provenance review                      |

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

## Verification (independently re-run 2026-07-25 on `origin/main` @ `f4ec0b0cb`)

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
  headroom figure is needed; the current 4.3× margin already clears the budget.
