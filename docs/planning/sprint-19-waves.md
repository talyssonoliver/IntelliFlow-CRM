# Sprint 19 — Execution Waves (0–5)

**Task:** PM-OPS-003 · **Generated:** 2026-07-22 · WIP cap **3** concurrent
task-executors (orchestrator); **1 heavy gate + 1 merge at a time**. Each task
ships as its own PR from an isolated worktree; each flips only its own CSV row.
Every wave has an **entry gate**, **exit gate**, and **rollback**.

Committed S19 core (10 tasks, ~7.3 weighted slots ≈ effective capacity). Waves
are ordered by dependency + risk; safe parallelism is called out per wave.

---

## Wave 0 — Audit close-out & guardrails

| Task                                           | Prio | Parallel? |
| ---------------------------------------------- | ---- | --------- |
| ENG-OPS-002 (parent audit close-out; 90%→100%) | P0   | solo      |

- **Entry:** ENG-OPS-002 baseline (#599) + remediation plan (#600) merged (✅).
- **Work:** finalize debt-ledger reconciliation of the 177-provenance-gap list;
  confirm R01/R02/R03/R10 shipped; attest ENG-OPS-002.
- **Exit gate:** `attestation.json` present with provenance; debt ledger records
  the 177 + the 18 missing-attestation IDs (handoff to R16).
- **Rollback:** none (documentation/ledger only; no code).

## Wave 1 — Reopened-completion remediation (unblock trust)

| Task                                                                                                    | Prio | Parallel?      |
| ------------------------------------------------------------------------------------------------------- | ---- | -------------- |
| IFC-306 (fix dead compliance timeline endpoint + 7 stale statuses)                                      | P1   | ‖ with IFC-304 |
| IFC-304 (build Article Analytics for real: component + `getAnalytics` tRPC + view/search-term tracking) | P1   | ‖ with IFC-306 |

- **Entry:** CSV reclassified to Backlog (✅ this task); phantom/dead-endpoint
  evidence recorded in `audit-findings-triage.json`.
- **Parallelism:** independent modules (compliance vs help-article) → run both,
  WIP 2.
- **Exit gate:** IFC-306 — timeline API returns the 22 real events (integration
  assertion against the real file path, not a mock); 0 stale statuses. IFC-304 —
  `article-analytics.tsx` renders real views/feedback/most-least-helpful/search
  terms; `getAnalytics` procedure exists + tested ≥90% scoped coverage. Both
  attested with provenance.
- **Rollback:** revert the single task PR; row returns to Backlog. No blast
  radius (isolated modules).

## Wave 2 — Core CRM pages (fan-out roots first)

| Task                   | Prio | Parallel? |
| ---------------------- | ---- | --------- |
| PG-064 (Contacts List) | P1   | ‖ (WIP 3) |
| PG-065 (Contact 360)   | P1   | ‖ (WIP 3) |
| PG-069 (Accounts List) | P1   | ‖ (WIP 3) |

- **Entry:** deps IFC-089 / IFC-090 Completed (✅). IFC-305 confirmed
  **deferred** (S20) so no concurrent edit contention on
  `contacts/[id]/page.tsx`.
- **Parallelism:** three independent pages → WIP 3 (the cap). PG-064 and PG-065
  are fan-out roots (their S20 dependents PG-067/068/066 start next sprint).
- **Exit gate:** each page — Lighthouse ≥90 / A11y ≥90, real tRPC data (no
  mock/fake), ≥90% scoped coverage, 4 validations green.
- **Rollback:** per-page PR revert; independent.

## Wave 3 — Governance & quality hardening

| Task                                                               | Prio | Parallel?                                  |
| ------------------------------------------------------------------ | ---- | ------------------------------------------ |
| R13 (flaky-test lint gate + reconcile 21 skips)                    | P1   | ‖ with R16                                 |
| R16 (backfill 18 missing S18 attestations + 177-provenance ledger) | P1   | ‖ with R13 (heaviest task; slip candidate) |

- **Entry:** Wave 0 debt-ledger handoff done; R02/R10 (skip-reducing fixes)
  merged so R13's "reconcile 21 skips" starts from the reduced set.
- **Parallelism:** R13 (eslint config) and R16 (attestation files) touch
  disjoint paths → parallel, WIP 2.
- **Exit gate:** R13 — `no-disabled-tests` rule active with issue-linked
  allow-list; 21 skips reconciled (fixed or issue-linked). R16 — 18 tasks have
  canonical `attestation.json` with `git_commit`; `pnpm validate:sprint-data`
  green; debt ledger updated.
- **Rollback:** R13 revert restores prior eslint config (no lost work). R16 is
  additive (new attestation files) — revert just removes them.
- **Capacity note:** R16 (~740 PERT-min ≈ 2 slots) is the designated **slip
  candidate**: if Wave 2 runs long or velocity dips below 5 feat-PR/wk, R16
  moves to S20 (it is governance backfill, not feature delivery).

## Wave 4 — Load test (critical path, no preemption)

| Task                                                 | Prio | Parallel?       |
| ---------------------------------------------------- | ---- | --------------- |
| IFC-033 (k6 load testing — 5000 leads/hr automation) | P0   | solo, protected |

- **Entry:** deps IFC-030/IFC-032 Completed (✅); **Docker UP** (29.6.2
  verified); k6 scenarios written; OTel/Grafana target reachable.
- **No-preemption:** an executor slot is reserved; no P2/P3 work may delay this.
- **Exit gate:** `GATE:real-benchmark-data` — `load-test-report.html` with
  **real k6 timestamps + throughput** (template report is a hard FAIL),
  `bottleneck-analysis.md`, `grafana-load-test.png`. Feeds R14 (pg_trgm, S20) if
  search is the bottleneck.
- **Rollback:** if k6 cannot produce real data (Docker/infra down) → **block, do
  not fabricate**; escalate infra; slip IFC-033/IFC-034 to S20. (RISK-S19-02.)

## Wave 5 — Investment gate (decision node)

| Task                          | Prio | Parallel? |
| ----------------------------- | ---- | --------- |
| IFC-034 (Gate-3 £3000 review) | P0   | solo      |

- **Entry:** IFC-033 exit artifacts exist and pass the real-benchmark gate.
- **Work:** ROI + stability + scale plan from **real** load-test numbers →
  `automation-roi-analysis.xlsx`, `stability-report.pdf`, `scale-plan.pptx`,
  `investment-recommendation.docx`.
- **Exit gate:** CFO/CEO sign-off recorded; Go / No-Go / Defer verdict written.
- **Rollback:** decision node — "rollback" = No-Go/defer verdict; downstream
  scale tasks stay Backlog. No code to revert.

---

## Parallelism & safety summary

- **Max concurrency:** 3 (Waves 2, 3 use it; Waves 0/4/5 are solo/protected).
- **Serialized points:** one heavy gate + one merge at a time (avoids
  Sprint_plan.csv conflicts — one PR = one row flip, rebased on latest main).
- **Cross-wave gate:** no wave's exit is "self-attested"; each requires the
  binary completion gates (TDD, ≥90% scoped coverage, architecture tests,
  security scan where applicable, attestation with provenance) — see
  `sprint-19-execution-plan.md` §Quality Gates.
- **Global rollback posture:** every task is an isolated squash PR →
  single-commit revert, task returns to Backlog, zero cross-task blast radius
  (RISK register §3).
