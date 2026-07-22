# Sprint 19 — Critical Path Analysis

**Task:** PM-OPS-003 · **Generated:** 2026-07-22 · **Source of truth:**
`apps/project-tracker/docs/metrics/_global/Sprint_plan.csv` @ `origin/main`
(pmops003 worktree). Dependency graph validated by DFS over all 616 CSV rows;
see `artifacts/reports/sprint-19/dependency-validation.json`.

## 1. Declared critical path (preserved)

```
IFC-033  (PHASE-005: Load Testing with k6)      ──FS──►  IFC-034 (PHASE-001: Gate 3 Review — £3000 Investment)
   260m PERT                                                120m PERT
```

This is the **investment-gate critical path**: the k6 load test (IFC-033) must
produce real throughput/bottleneck evidence before the Gate-3 £3000 scale
decision (IFC-034) can be reviewed. It is **explicitly preserved** in the
rebaseline and is the spine of Wave 4.

## 2. Upstream readiness of the critical path

| Task    | Dependencies     | Dep status                                           | Ready to start?                 |
| ------- | ---------------- | ---------------------------------------------------- | ------------------------------- |
| IFC-033 | IFC-030, IFC-032 | IFC-030 = Completed (S17); IFC-032 = Completed (S18) | **YES** — both satisfied        |
| IFC-034 | IFC-033          | Backlog (S19, intra-sprint)                          | Blocked until IFC-033 completes |

**Both upstream dependencies of IFC-033 are already Completed**, so the critical
path has no external blocker — it can start on day 1 of the sprint. IFC-034 is
gated only by IFC-033 (intra-sprint), so the chain is self-contained.

## 3. Critical-path length vs. sprint

- Critical-path work: **IFC-033 (260m) + IFC-034 (120m) = 380m ≈ 6.3h PERT** of
  the ~45h P0/P1 rebaselined load.
- The critical path is **not** the capacity binding constraint (governance
  remediation R15/R16 are heavier); it _is_ the schedule binding constraint
  because IFC-034 is a leadership investment gate with a hard sequencing
  requirement and external (CFO/CEO) sign-off.
- **Scheduling rule:** IFC-033 is scheduled in Wave 4 with no P2/P3 work allowed
  to preempt it. IFC-034 immediately follows in Wave 5 (gate/decision wave).

## 4. Secondary dependency chains inside Sprint 19

These are intra-sprint FS chains that shape wave ordering (all deps exist; none
cross-sprint-unsatisfied):

```
IFC-089 (Completed/S5) ──► PG-064 (Contacts List) ──► PG-067 (Import Contacts)
                                    └──────────────► PG-068 (Merge Contacts)
IFC-090 (Completed/S6) ──► PG-065 (Contact 360)  ──► PG-066 (Edit Contact)
IFC-089 (Completed/S5) ──► PG-069 (Accounts List)
IFC-226 (Completed/S16)──► IFC-305 (Componentize CRM detail pages)
IFC-311 (Completed/S18)──► PG-210 (reassign UI wiring)
IFC-312 (Completed/S19)──► IFC-313 (real inbox draftReply resolver)
ENG-OPS-002 (audit) ──► R04/R07/R11/R13/R15/R16/R18 (remediation family)
```

**PG-064 and PG-065 are fan-out roots** (each unblocks 1–2 downstream page
tasks) and are therefore prioritised early (Wave 2) so their dependents are not
starved.

## 5. Cross-sprint dependency integrity

- **0 missing dependencies** across all 27 Sprint-19 rows — every referenced
  dependency ID resolves to a real CSV task.
- **0 cycles in the Sprint-19 subgraph.**
- **1 pre-existing cycle outside scope:**
  `IFC-040 → IFC-115 → IFC-071 → IFC-040`, entirely within **Sprint 25** tasks
  (IFC-071 is Completed and lists IFC-040 as a dependency, which transitively
  points back through IFC-115). This is recorded as pre-existing data-integrity
  debt in the risk register (RISK-S19-07) and does **not** touch the Sprint-19
  execution graph. Recommended follow-up: break the S25 cycle by correcting
  IFC-071's dependency list (it is Completed, so the dependency is historically
  moot and should be pruned).

## 6. Critical-path protection controls

1. **No-preemption:** Wave 4 (IFC-033) runs with WIP reserved; P2/P3 tasks may
   not occupy an executor slot that would delay IFC-033.
2. **Evidence gate:** IFC-033 exit requires the real k6 artifacts
   (`load-test-report.html` with real timestamps, `bottleneck-analysis.md`,
   `grafana-load-test.png`) — the DoD forbids a template report. IFC-034 entry
   is blocked until those artifacts exist and pass `GATE:real-benchmark-data`.
3. **Gate-3 rollback:** IFC-034 is a decision node — its "rollback" is a
   No-Go/defer verdict recorded in `investment-recommendation.docx`, not a code
   revert. See waves doc, Wave 5.
