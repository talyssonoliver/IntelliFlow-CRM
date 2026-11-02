## Compliance Check Results

**Task**: ENV-008-AI
**Checked At**: 2026-10-25, at HEAD `e0b478906` (branch `feat/env-008-ai-env008`)
**Run by**: `/compliance-check ENV-008-AI` inside `/exec`. Section 6c (phrase audit) and the attestation-coverage half of Section 4 were re-run after the attestation was written; their results are at the end.

### Design Compliance

N/A: not a UI task. No `apps/web` or `packages/ui` change.

### Source of Truth

| Check | Status | Details |
|---|---|---|
| Sprint_plan.csv | PASS | ENV-008-AI is `In Progress` (exec running); EVIDENCE path moved to `.specify/sprints/sprint-18/attestations/ENV-008-AI/attestation.json` (Category A); split A regenerated; against the merge base `e7ce625b2`, only row ENV-008-AI differs |

### Plan Deliverables (Section 4, blocking)

| Check | Status | Details |
|---|---|---|
| Files exist at planned paths | PASS | 39/40 before the attestation; the 40th is the attestation itself, written next |
| Attestation covers all files | see end | checked after the write |
| No path deviations | PASS | every file is at its planned path; no re-export shims |

### Context Acknowledgement (Section 5, blocking)

| Check | Status | Details |
|---|---|---|
| Required | No | the CSV `Artifacts To Track` has no `EVIDENCE:context_ack` |

### CSV vs Plan Artifact Tracking (Section 6, blocking)

| Check | Status | Details |
|---|---|---|
| Plan files tracked in CSV | WARN | 7/40: the CSV keeps its 6 descriptive artifacts plus the EVIDENCE path; the plan records this as INFO (plan §CSV Artifact Alignment) |
| Untracked + missing from disk | PASS | 0 (`validate-artifacts.txt`; the only missing file was the attestation) |
| Untracked + exists on disk | WARN | 33 files (scripts, tests, workflows, configs); the attestation `artifact_hashes` names all of them |

### Validation Summary (Section 3)

ENV tasks map to the root project. Every number below comes from the logs in `execution/ENV-008-AI/`, each run at `e0b478906`.

| Check | Status | Details |
|---|---|---|
| Tests | PASS | 8 task files, 188 passed (`task-tests.txt`); regression 20 passed (`regression-tests.txt`); full root project 121 files, 2777 passed, 2 skipped (`root-full-tests.txt`) |
| Typecheck | PASS | `pnpm run typecheck` 38/38 (turbo cache: no package input changed) plus the sonar guard (`typecheck.txt`); test-file `tsc`: only the 3 pre-existing baseline errors (`tsc-test-files.txt`) |
| Linter | PASS | eslint and prettier on every touched file, exit 0 (`lint-format.txt`); `pnpm run lint` 36/36 (`lint-repo.txt`) |
| Build | PASS | `pnpm run build` 20/20 (`build.txt`) |
| Validators build | N/A | validators unchanged |

### Coverage Comparison (scope: `tools/scripts/lib/grafana-provisioning.mjs` + `tools/scripts/observability/*.mjs`)

| Metric | Before (3 files) | After (6 files) | Delta |
|---|---|---|---|
| Statements | 85.56% | 92.69% | +7.13 |
| Branches | 77.08% | 82.94% | +5.86 |
| Functions | 88.23% | 89.47% | +1.24 |
| Lines | 88.69% | 93.71% | +5.02 |
| Diff coverage (changed lines, the NF-003 gate) | n/a | 93.6% (456/487) | above the 80% floor |

Before: `artifacts/coverage/ENV-008-AI-before.json`. After: `coverage-run.txt` and `diff-coverage.txt`. The repo-wide 90% global threshold is not met for functions in this narrow tooling scope (89.47%). It was not met at baseline either (88.23%), and the task's gate is NF-003 (diff coverage).

### Key Objectives (Section 8)

| Objective | Status | Notes |
|---|---|---|
| Code Quality | PASS | shared client and `requireEnv` (DRY); `.d.mts` types; no ignore pragmas |
| Integration | PASS | each script has a real caller (its workflow), checked by `env008-workflows.test.ts`; same "as code, applied by CI on merge" pattern as IFC-032 |
| Security | WARN | change-specific checks hold (STOA-security). The inherited `pnpm audit` advisories are fixed on main by #1008, and #1016 tracks the rest. #1031 (token scope) and #1032 (Production branch policy) are tracked |
| Performance | N/A | CI tooling; the 503 retry is bounded (255 s per call, 12-minute job) |
| Availability | PASS | the alert-rules workflow becomes recoverable from 503; the Railway restart policy plus a probe-gated deploy check |
| Maintainability | PASS | one workflow per resource; descriptive records pinned by tests |
| Documentation | PASS | ADR-087, the three observability guides, findings doc, dependency chains |

### Architecture Compliance (Section 9)

| Layer Modified | Compliant | Notes |
|---|---|---|
| Domain / Validators / Application / Adapters / API / Frontend | N/A | none modified; tooling, CI and infra only |

### PRD/ADR Governance (Section 10)

| Check | Status | Details |
|---|---|---|
| PRD | N/A | infrastructure task |
| ADR | PASS | ADR-087, Accepted (spec consensus 4/4), README row present, updated with the r4 amendments and the issue links |

### Accessibility Doc Gate (Section 11) and Navigation Wiring (Section 12)

N/A: no routes. `check-nav-wiring.mjs ENV-008-AI 18` says "plan does not create any page.tsx".

### Lighthouse Evidence (Section 13)

N/A: no Lighthouse KPI. Re-run after the attestation.

---

**Overall Verdict (before attestation)**: **WARN**

### Warnings

- 33 plan files are not in the CSV `Artifacts To Track` (INFO in the plan; the attestation lists them).
- Inherited `pnpm audit` advisories on the old merge base. Re-check after origin/main is merged in.
- The repo-wide 90% global coverage threshold is not met for functions in the tooling scope (89.47%; baseline 88.23%).
- Production evidence exists only after merge: SLOs present, dashboard present, Railway read-back, alert-rules workflow green. It is NEEDS_HUMAN by owner ruling 2.
