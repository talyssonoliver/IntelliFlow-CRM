# Sprint 19 — Rebaseline (PM-OPS-003)

**Generated:** 2026-07-22 · **Source of truth:** `Sprint_plan.csv` @
`origin/main` (pmops003 worktree) · **Readiness verdict: `CONDITIONALLY_READY`**
(see §7 and `artifacts/reports/sprint-19/readiness-report.json`).

> **Note on the missing spec file.** The referenced spec
> (`/sessions/.../893da4bf-PMOPS003.md` and `docs/planning/tasks/PM-OPS-003.md`)
> was not present on disk. This rebaseline was executed against the scope
> embedded in the task brief plus the real repository state. All numbers are
> derived from committed artifacts and git — nothing is fabricated.

## 1. Baseline (pre-rebaseline)

- **Sprint 19 = 27 CSV rows** (Target Sprint `19`): 15 feature/original tasks +
  12 ENG-OPS-002 remediation-family rows. The brief cited "15 tasks, 4
  Completed, 11 Backlog" — correct for the _feature_ set; the ENG-OPS-002 family
  (registered by #599/#600 after the brief's 597-task snapshot; CSV now 616+1
  rows) adds 12 more S19 rows.
- **Critical path:** IFC-033 (k6 load test) → IFC-034 (Gate-3 £3000 review).
- **Dependency integrity:** 0 missing dependencies across all 27 rows; Sprint-19
  subgraph is **acyclic**. One pre-existing cycle exists entirely within Sprint
  25 (IFC-040→IFC-115→IFC-071→IFC-040) — out of scope, logged (RISK-S19-07).

## 2. Validation of the 4 "Completed" tasks (evidence-based)

| Task                              | Verdict                                                                                                                                                     | Action                     |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| **PG-166** (Lighthouse audit)     | ✅ VALID — real LHCI: Perf 100 / A11y 100 / TTI 852ms, 3 real runs, attestation gates PASS                                                                  | keep Completed             |
| **IFC-312** (AI chains)           | ✅ VALID — 10 chain files exist, attestation w/ 92.97% coverage + self-critical audit-fix cycle                                                             | keep Completed             |
| **IFC-304** (Article Analytics)   | ❌ **PHANTOM COMPLETION** — `article-analytics.tsx` and `getAnalytics` tRPC **do not exist**; task-tracking admits component missing, `completed_at: null`  | **reclassified → Backlog** |
| **IFC-306** (Compliance Calendar) | ❌ **DEAD ENDPOINT** — timeline API reads a non-existent `artifacts/misc/…` path → serves empty array; 7 past events still `scheduled`; mocked tests hid it | **reclassified → Backlog** |

Both damning findings were **independently re-verified** (`ls`/`grep`) before
the CSV was touched. This directly satisfies the brief's "gaps IFC-304/IFC-306
tem que resolver ou classificar explícito": they are **classified explicitly**
as not genuinely complete and reopened — no fake attestation was written.
Genuinely completed S19 count drops 4 → **2** (+4 shipped remediation R-tasks).

## 3. Reassessment of the 11 remaining feature tasks

All dependencies exist and resolve; readiness summarized (full detail in
`dependency-validation.json`):

- **Ready now** (deps Completed): IFC-033, PG-064, PG-065, PG-069, IFC-305,
  PG-210, IFC-313.
- **Intra-sprint chained**: IFC-034←IFC-033; PG-066←PG-065; PG-067/068←PG-064.
- **Overlap flagged**: IFC-305 (componentize Leads+Contacts god-files: 2908L +
  2575L) shares `contacts/[id]/page.tsx` with PG-065 → boundary set (PG-065 =
  functional Contact 360; IFC-305 = structural extraction) and **IFC-305
  deferred to S20** so pages stabilize first (RISK-S19-06). IFC-313/PG-210 do
  **not** overlap IFC-305.
- **ENG-OPS-002 impact**: R02 (dedup fix, merged) unblocks PG-068 quality; R01
  (tenant-isolation, merged) reduces contact-data exposure relevant to the new
  contact pages.

## 4. Duplication scan (all 616 tasks + PRs + issues + specs + debt ledger)

- **0 duplicate tasks** among the S19 backlog. IFC-230 (unify LeadForm) is
  Completed and distinct (form vs detail-page componentization).
- **11 open PRs** are all Dependabot/governance-metrics chores — **no overlap**.
- **Open issues** #318 (k6 nightly), #435 (lead email-uniqueness tenant leak),
  #576 (ModuleSettingsShell OCP), #441 (Sonar reliability-D), #452 (CodeQL/CVE)
  are **related follow-ups already tracked** — R18's Medium triage must
  reference them, **not re-create**.
- **Net-new remediation tasks created: 0.** The 29 Critical+High findings are
  already registered as R01–R18 (#600). Creating more would violate the "0
  remediation tasks duplicadas" constraint — so the correct output is
  sprint-assignment + prioritization of the existing set, not new rows.

## 5. Prioritization & scope decision

**Committed S19 (10, P0/P1):** IFC-033, IFC-034, ENG-OPS-002, IFC-304, IFC-306,
PG-064, PG-065, PG-069, R13, R16. **Deferred → S20 (11, P2/P3):** PG-066,
PG-067, PG-068, IFC-305, PG-210, IFC-313, R04, R07, R11, R15, R18.

Rules applied (see `scope-delta.json`): P0/P1 blockers of existing scope enter
before dependents; P2/P3 do not auto-enter; insufficient capacity → S20.

## 6. Capacity (real, multi-factor — not task-count proxy)

From the ENG-OPS-002 baseline git history + task-tracking sampling (2026-07-22):

| Factor               | Real value                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------- |
| Feature throughput   | **5.11 feat-PRs/week** (8-wk series 0–15; all-PR 20.78/wk)                               |
| Cycle time           | median **45 min/task** active; estimate-accuracy ratio **0.258** (PERT ~4× conservative) |
| Lead-time cadence    | median 0.47 day/feature                                                                  |
| Change-failure proxy | 5/55 = **9.1%**                                                                          |
| WIP                  | **3** concurrent executors; 1 heavy gate + 1 merge at a time                             |
| Availability         | solo maintainer + AI fleet; 40/60 active days; max 21 PRs/day                            |

- **Demand (committed):** 36.5h PERT remaining ≈ 9.4h empirical-adjusted ≈ **7.3
  weighted slots**.
- **Supply (2-wk sprint):** 10.2 PR-equiv − 9.1% rework − 20% buffer ≈ **7.4
  effective slots**.
- **Verdict:** demand ≈ supply → **fits with near-zero slack.** R16 (heaviest,
  ~2 slots) is the designated in-sprint slip candidate.

## 7. Readiness verdict: `CONDITIONALLY_READY`

Ready to execute, conditional on:

1. **Docker/k6 infra stays up** for Wave 4 (IFC-033) — real load-test evidence
   is a hard gate; no template report (RISK-S19-02). Docker verified UP
   (29.6.2).
2. **Capacity has no slack** — if feature velocity dips below ~5 PR/wk, **R16
   slips to S20** (governance backfill, not feature delivery).
3. **IFC-304/IFC-306 are real rebuilds**, not re-attestations — their reopening
   is an accepted scope addition this sprint.
4. **Accepted risks tracked, not resolved:** held Criticals R04/R07 need design
   sign-off (deferred S20); `validate:schemas` RED on main is advisory (R15
   deferred, not pre-ship-blocking); S25 dependency cycle logged.

Not `READY` (unconditional) because of the zero-slack capacity and the infra
dependency of the critical path; not `NOT_READY` because scope is dependency-
clean, acyclic, deduped, and fits effective capacity.

## 8. CSV mutations applied (verified surgical)

- `IFC-304`, `IFC-306`: Status **Completed → Backlog** (evidence-based reopen).
- `PG-066/067/068, IFC-305, PG-210, IFC-313`: Target Sprint **19 → 20**.
- `ENG-OPS-002.R04/R07/R11/R15/R18`: Target Sprint **19 → 20**.
- 13 rows edited, 617 rows intact, each edit re-parsed and verified. Derived
  files (`Sprint_plan_*.csv`, SESSION_CONTEXT, state report) regenerated.
