# IFC-248 — Session Issues Log

Task: **IFC-248 — Lead List & Create Page Tests** (Lane A, persona:
test-engineer)

This is a CANDID, severity-ordered record of every issue, mistake, workaround,
protocol mismatch, and gate failure encountered while shipping IFC-248. It is
the feedback loop that hardens the next agent's prompt.

## Timeline (real timestamps)

| Milestone             | Time (local)     | Notes                                     |
| --------------------- | ---------------- | ----------------------------------------- |
| Worktree provisioned  | 2026-06-28 20:20 | `feat/ifc-248` off origin/main 2de1aef52  |
| Spec done             | 2026-06-28 20:33 | 3 personas (test/frontend/domain), 28 ACs |
| Plan done             | 2026-06-28 20:48 | plan-reviewer subagent: 2 ERRORs caught   |
| Exec impl done        | 2026-06-28 21:08 | lead-list 37%->100% lines; +37 tests      |
| Exec/attestation done | _pending_        |                                           |
| PR opened             | _pending_        |                                           |
| PR merged             | _pending_        |                                           |

## Issues (severity-ordered — updated as they occur)

### MEDIUM — plan-reviewer subagent caught 2 real ERRORs the author missed (this is the gate working)

- **What happened**: The mandatory plan-reviewer subagent found (1) a global
  `useLeadRecentViews` mock that would have silently broken the existing
  `view=recent` test after the STEP-1 mock widening, and (2) a DataTable mock
  that referenced `columns`/`bulkActions` without destructuring them — a silent
  no-op that would have made the ≥90% coverage target unreachable WITHOUT any
  error. Plus a WARN (USER T7 branch missing explicit `findMany`/`count` mocks).
- **Why it matters**: Both ERRORs are "fake-green/silent-fail" traps — exactly
  the class the plan-reviewer gate exists to catch before exec wastes cycles.
- **Fix / prevention**: All applied to the plan before exec
  (per-test-overridable hook mock + migrate the `view=recent` test; explicit
  `columns: any[]` + `bulkActions` destructuring; explicit USER-branch mocks).
  Confirms the build-first prohibition pays off: had I hand-authored + built
  first, these would have surfaced only deep into a 20-min pre-ship cycle.

### LOW — spec-session template omits a `## Related Documents` section (BB-100)

- The plan-reviewer flagged the spec had no `## Related Documents` section
  (mandatory per rule BB-100). Added it post-hoc (`PRD: N/A`, `ADR: N/A`).
  Prevention: the `/spec-session` output template should always emit a Related
  Documents section, even as `N/A`, for test-only tasks.

### LOW — Protocol tension: spec-session mandates a CSV status write, dispatch forbids touching the control plane

- **What happened**: The `/spec-session` skill marks a "MANDATORY" status update
  to `Sprint_plan.csv` (Specifying 10% / Spec Complete 20%). The dispatch prompt
  is explicit and more specific: "You NEVER commit to local main or touch the
  control plane (doing so DIVERGES it)" and "The CSV flip is the ORCHESTRATOR's
  job, NOT yours."
- **Why it matters**: Editing the canonical CSV in a feature branch is what
  produced the IFC-302 hand-off divergence (per project memory). Committing CSV
  status churn would also fight the orchestrator's eventual flip.
- **Decision / prevention**: I am NOT modifying `Sprint_plan.csv`. The pipeline
  artifacts under `.specify/` (spec/plan/attestation) are the real, tracked
  deliverables; the orchestrator owns every CSV transition. Recommendation for
  the next prompt: have `/full-pipeline` / `/spec-session` SKIP the CSV write
  when running under the standalone-worktree executor model, to remove this
  recurring contradiction.

### INFO — Task is a DELTA, not a from-scratch build (matches the artifact precheck)

- The create page (`NewLeadForm.tsx`) is already at 93.9% stmt / 96.4% lines and
  `bulk-actions.ts` has 51 tests. The genuine gap is `lead-list.tsx` component
  integration (36.9% → target ≥90%) + the API `lead.list` role filter. Scoping
  to the gap (not re-building covered surfaces) is the whole point of spec
  Phase 0.

### INFO — Shell cwd resets to the main repo after every Bash call

- Each Bash invocation reports "Shell cwd was reset to C:\...\intelliFlow-CRM".
  Mitigation: every command is prefixed with `cd <worktree> &&`. No impact, but
  worth noting so the next agent doesn't assume `cd` persists.

## Net assessment

_pending — to be written at the end._
