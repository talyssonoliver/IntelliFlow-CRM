# Sprint 19 — Execution Plan

**Task:** PM-OPS-003 · **Generated:** 2026-07-22 · **Companion artifacts:**
`sprint-19-rebaseline.md`, `sprint-19-waves.md`, `sprint-19-capacity-plan.csv`,
`sprint-19-critical-path.md`, `sprint-19-risk-register.md`, and the machine
reports under `artifacts/reports/sprint-19/`.

## 1. Committed scope (10 tasks)

| #   | Task                                     | Prio | Wave | Remaining PERT  | Type          |
| --- | ---------------------------------------- | ---- | ---- | --------------- | ------------- |
| 1   | ENG-OPS-002 (audit close-out)            | P0   | 0    | ~96m (90% done) | remediation   |
| 2   | IFC-306 (compliance dead-endpoint fix)   | P1   | 1    | 30m             | reopened      |
| 3   | IFC-304 (Article Analytics — real build) | P1   | 1    | 195m            | reopened      |
| 4   | PG-064 (Contacts List)                   | P1   | 2    | 195m            | feature       |
| 5   | PG-065 (Contact 360)                     | P1   | 2    | 260m            | feature       |
| 6   | PG-069 (Accounts List)                   | P1   | 2    | 195m            | feature       |
| 7   | R13 (flaky-test lint gate)               | P1   | 3    | 95m             | remediation   |
| 8   | R16 (attestation/provenance backfill)    | P1   | 3    | 740m            | remediation   |
| 9   | IFC-033 (k6 load test)                   | P0   | 4    | 260m            | critical-path |
| 10  | IFC-034 (Gate-3 £3000 review)            | P0   | 5    | 120m            | critical-path |

**Total remaining:** ~36.5h PERT ≈ 9.4h empirical-adjusted (×0.258) active work
≈ 7.3 weighted delivery slots. See capacity CSV for the supply reconciliation
(≈7.4 effective slots → fits, near-zero slack).

## 2. Deferred to S20 (11 tasks) — not lost, re-tagged

PG-066, PG-067, PG-068, IFC-305, PG-210, IFC-313 (features); ENG-OPS-002.R04,
R07, R11, R15, R18 (remediation). Plus R05/R06/R08/R09/R12/R14 already S20 and
R17 backlog. Rationale per task in `scope-delta.json` /
`audit-findings-triage.json`.

## 3. Prioritization rules applied

1. **P0** = critical path (IFC-033→IFC-034) + audit close-out. Non-negotiable.
2. **P1** = blocks existing scope or readiness, OR a ready core CRM page:
   reopened trust-debt (IFC-304/306), fan-out pages (PG-064/065/069), governance
   readiness (R13/R16). Each **P1 enters before its dependent** (PG-064 before
   PG-067/068; PG-065 before PG-066 — dependents are in S20).
3. **P2/P3 do NOT auto-enter.** Secondary pages, heavy refactors (IFC-305),
   design-review-held Criticals (R04/R07), blocked items (R11), heavy
   non-blocking remediation (R15), triage (R18) → S20.
4. **Capacity gate:** demand (7.3 slots) ≈ supply (7.4). No room for P2 → all
   deferred. R16 is the in-sprint slip candidate if velocity dips.

## 4. Quality gates (mandatory — binary PASS/BLOCK, no WARN/SKIP)

Every committed task's PR must clear, before its CSV row flips to Completed:

1. **TDD**: RED→GREEN→REFACTOR; tests written first (per `/plan-session`).
2. **4 validations**: `typecheck`, `test`, `lint`, **`build`** — all green
   (build is non-negotiable; "Next compiles on demand" is not an excuse).
3. **Scoped coverage ≥90%** on changed lines (`GATE:coverage-gte-90`); mirrors
   Sonar `new_coverage`. `diff-coverage` in pre-ship must pass — regenerate real
   local coverage before push (Docker-up so integration/coverage steps run).
4. **Architecture tests** (`tests/architecture/`) green — no new hexagonal/layer
   violations; DDD boundaries intact.
5. **Security scan** where the task touches security surfaces (IFC-304 tenant
   scoping on analytics reads; R-tasks per stoa-security). `pnpm audit` clean.
6. **Attestation with provenance** (ADR-068): `attestation.json` with `run_id`,
   timestamp, `verdict`, `gate_results`, `artifact_hashes`, `git_commit`. No
   self-attestation; no template/fake-green.
7. **No mock/fake data** (critical rule): all displayed data from real sources;
   IFC-306's fix must make the API serve the real file, not a mock (its current
   green tests mock `fs` and hid the dead endpoint — add a real-path assertion).
8. **Pre-ship gate** (`scripts/pre-ship.mjs`, husky pre-push) green on every
   push — never bypassed (`PRESHIP_ALLOW_MISSING` only for a documented
   infra-down case, never to mask a real failure).

## 5. Merge discipline

- One task = one worktree = one PR = one CSV row flip; rebase each on latest
  `main` to avoid Sprint_plan.csv conflicts (resolve via
  `git show origin/main:…/Sprint_plan.csv`).
- One heavy gate + one merge at a time; autonomous merge only when CI is green
  (all required checks + Sonar QG).
- Co-dependent CI shims ride the same branch as the change that needs them.
- No AI co-author trailer (repo policy); commitlint-clean squash subject = PR
  title.

## 6. Definition of Done (sprint level)

Sprint 19 is Done when: (a) all 10 committed tasks Completed + attested; (b)
critical path IFC-033→IFC-034 delivered with **real** load-test evidence and a
recorded Gate-3 verdict; (c) 0 phantom completions remain (IFC-304/306 either
truly done or still Backlog — never falsely Completed); (d) governance readiness
closed (R16 backfill or explicit S20 slip recorded); (e) derived files
regenerated (`split-sprint-plan.ts`, `generate-context.ts`).
