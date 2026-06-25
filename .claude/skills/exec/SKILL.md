---
name: exec
description: "Execute a task by implementing code via TDD based on spec and plan, then run MATOP validation. SESSION 3 of the STOA workflow."
license: IntelliFlow CRM Internal
---

# Exec - Task Implementation & Validation (SESSION 3)

You are executing **SESSION 3: Exec** of the STOA workflow for task: {{task_id}}

## Shared Workflow Library

Reference: `tools/scripts/lib/workflow/`
Key exports: `SESSION_CONFIG.exec`, `getTaskPaths(sprintNumber, taskId, runId)`, `getSprintForTask(taskId, repoRoot)`, `assignStoas(task)`, `calculateConsensus(verdicts)`, `getStatusFromVerdict(verdict)`, `canProceedToSession(task, 'exec')`

## Context

Project: IntelliFlow CRM | Architecture: Hexagonal/DDD, TypeScript strict | Coverage: >90% (domain >95%)
Workflow: Phase 0 → Phase 1 (Spec) → Phase 2 (Plan) → **Phase 3 (Exec)** ← THIS

## Current Task

- Task ID: {{task_id}}
- Sprint: Look up from `Sprint_plan.csv` "Target Sprint" column
- Spec: `.specify/sprints/sprint-{N}/specifications/{{task_id}}-spec.md`
- Plan: `.specify/sprints/sprint-{N}/planning/{{task_id}}-plan.md`

## Prerequisites Check

Verify before executing:
1. Specification exists at the spec path above
2. Plan exists at the plan path above
3. Task status is "Plan Complete" in Sprint_plan.csv

If missing: run `/spec-session {{task_id}}` or `/plan-session {{task_id}}`.

## MANDATORY Preflight Scripts (MUST RUN before Phase 1)

Before reading the spec/plan, run each preflight script and check that it exits 0.
These are deterministic gates — prompt-level instructions can be skimmed, these cannot.

| Preflight | Command | Blocks on |
|-----------|---------|-----------|
| Page Doc Co-Change | `node tools/scripts/exec-preflight/check-page-doc-cochange.mjs {{task_id}}` | Plan creates `page.tsx` but omits `PAGE_MAP_AND_FLOWS.md` / `sitemap.md` / `navigation-reachability-audit.md` from Files to Modify. Source: `references/phase1-context-loading.md` §3.2. |
| Plan-Reviewer Subagent | `node tools/scripts/exec-preflight/check-plan-reviewer-subagent.mjs {{task_id}}` | Plan's "Plan-Reviewer Sign-off" section contains self-review language with no real subagent marker. Source: plan-session SKILL.md + `phase1-context-loading.md` Gate CC. |
| Exec Readiness bundle | `node tools/scripts/exec-preflight/check-exec-readiness.mjs {{task_id}}` | Any of five checks BLOCK: (1) task JSON `$schema` path resolves; (2) session-start metrics (`started_at` + a `status_history` entry) recorded in `.specify/sprints/sprint-{N}/attestations/{{task_id}}/task-tracking.json` (ADR-067 Phase 2 — the canonical home; the per-task `docs/metrics` JSON is a generated cache); (3) `artifacts/coverage/{{task_id}}-before.json` exists; (4) every dep in `Dependencies` has an `attestation.json` on disk; (5) plan has `## Preflight Checks` section (WARN only). Remediation commands printed inline. |
| Task JSON schema sweep | `node tools/scripts/validate-task-json-schemas.mjs` | ANY task JSON under `apps/project-tracker/docs/metrics/` has an unresolvable `$schema`. `--fix` rewrites them. Prevents IDE schema-load errors and keeps schema validation honest. |
| Nav Wiring (Gate 12) | `node tools/scripts/exec-preflight/check-nav-wiring.mjs {{task_id}}` | Any new `apps/web/src/app/**/page.tsx` has zero inbound references from `apps/web/src/components/sidebar/configs/` OR any other app/component file. PG-180 pattern — unreachable pages. See `references/phase4-completion-gates.md` Gate 12. Also re-run at Phase 4.5 as Gate 12. |
| Worktree Landed (Gate 4b) | `node tools/scripts/exec-preflight/check-worktree-landed.mjs {{task_id}} {{sprint}}` | Worktree branch has uncommitted edits, zero commits beyond origin/main, or has not been pushed to remote. Prevents orphaned COMPLETE verdicts (IFC-227/IFC-031/PG-053/PG-054 pattern). See `references/phase4-completion-gates.md` Gate 4b. |
| Lighthouse Evidence (Gate 14) | `node tools/scripts/exec-preflight/check-lighthouse-evidence.mjs {{task_id}} {{sprint}}` | Any Lighthouse KPI with `met: true` has no backing report JSON in `artifacts/lighthouse/<TASK>/` with matching hash, OR `met: false` without a real human approver (not CI / bot / Claude / self). Artifact-based — unlike Guards 4/6/8 cannot be text-hacked. See `docs/claude-refs/lighthouse-playbook.md` for the canonical recipe BEFORE waiving. |

**Rule**: if any preflight exits non-zero, STOP. Do not proceed to Phase 1.
Fix the plan, rerun the preflight, then continue. A preflight failure is a
BLOCKER, not a warning.

Why this exists: PG-184 iteration 3 skipped the §3.2 gate because the exec
prompt pointed at a references file instead of mandating an executable check.
See `memory/feedback_exec_phase1_preflight.md`.

## Workflow Phases

### Phase 1: Load Context
Read spec, plan, and hydrated context. Includes Context Acknowledgement Gate if task requires `EVIDENCE:context_ack.json`.
**See `references/phase1-context-loading.md`**

### Phase 2: Execute Implementation (TDD + Runtime Wiring)
Generate run ID, create execution directory, implement via RED/GREEN/REFACTOR cycle, and ensure the real runtime path uses the new behavior before moving on.
**See `references/phase2-tdd-workflow.md`**

### Phase 2.5: Container Registration Check (backend/API tasks)
Verify new services are registered in `container.ts` + `context.ts`.
**See `references/phase2.5-container-check.md`**

### Phase 3: MATOP Validation
Execute the plan's validation matrix, then select STOAs, execute baseline + STOA-specific gates, and aggregate verdicts.
**See `references/phase3-matop-validation.md`**

### Phase 4: Generate Delivery Report
Create `{{task_id}}-delivery.md` with implementation summary, TDD log, AC validation, and only the validation commands that actually ran.
**See `references/phase5-attestation-format.md`**

### Phase 4.5: MANDATORY Completion Gates (BLOCKING)
ALL gates must pass: Context Ack, Plan Checkboxes, Artifact Hashes, Build Validation (4 commands), Scoped Coverage, STOA Gates.
**See `references/phase4-completion-gates.md`**

### Phase 4.6: Compliance Check (MANDATORY)
Invoke `/compliance-check` skill. Must pass before marking complete.

### Phase 5: Create Attestation & Update Status
Write `attestation.json` using `"verdict": "COMPLETE"` (NOT `"status": "Completed"` — the CSV status field and attestation verdict field are different).
Invoke `/exec-attestation` or follow `references/phase5-attestation-format.md` for the inline template.
Based on MATOP + Compliance verdict, update Sprint_plan.csv status.
**See `references/phase5-attestation-format.md`** for status decision matrix and attestation field rules.

## Error Handling

1. **Prerequisite Missing** — Inform user, provide command to generate
2. **Test Fails in RED** — Expected, proceed to GREEN
3. **Test Fails in GREEN** — Fix code, don't skip to next step
4. **MATOP Gate Fails** — Log details, set WARN/FAIL, generate remediation
5. **Build/Typecheck Fails** — Fix before proceeding
6. **Runtime Path Still Bypasses New Code** — Keep status "In Progress" until the production caller is actually rewired
7. **Related Regression Suite Fails** — Do not narrow validation scope to hide the failure; fix it or report task incomplete

## Architecture Constraints (MUST maintain)

1. **Hexagonal**: Domain CANNOT depend on infrastructure
2. **Type Safety**: No `any` without justification, strict null checks
3. **Coverage**: Domain >95%, Application >90%, Overall >90%
4. **DDD**: Business logic in domain layer, ports/interfaces for dependencies

## Execution Reality Rules (BLOCKING)

1. **No Stub-Only Compliance**: A new route, procedure, server action, helper, or file does not count if production code still bypasses it.
2. **Real Consumer Required**: Every new runtime surface must have a real caller by the end of exec.
3. **Replacement Means Replacement**: If the spec/plan says a legacy path is replaced or hardened, the old path must stop owning that behavior.
4. **Validation Claims Must Be Executed**: Delivery may only claim PASS for commands that actually ran in this session.
5. **Broader Failures Stay Visible**: If a touched existing suite fails, do not present a passing subset as complete validation.
6. **No Foreign Icon Libraries (PG-195 / ADR-046)**: Do NOT import from `lucide-react`, `@heroicons/react`, `react-icons`, `@radix-ui/react-icons`, or `react-feather`. Do NOT inline `<svg>` "icon" components that replace font-rendered icons. Icons MUST render as Material Symbols Outlined (`<span className="material-symbols-outlined">name</span>` or shared `Icon`/`IconBadge` wrappers). If the task introduces new icon names, regenerate the subsetted font (`node tools/scripts/subset-material-symbols.mjs`) and commit the updated `apps/web/public/fonts/MaterialSymbolsOutlined.woff2` + `artifacts/reports/material-symbols-glyph-audit.json`. See `docs/design/ICON_USAGE.md` for the full policy.

## Final Ralph-iteration Output (MANDATORY when closing the loop)

When you believe the task is complete and the Ralph loop should exit, **do
not paste a `<promise>…</promise>` tag yourself**. Instead run:

```
node tools/scripts/generate-final-report.mjs {{task_id}} --promise "<completion_promise from ralph state file>"
```

The script runs all four preflights, the workflow audit, and verifies the
attestation, then:
- Prints a consolidated report (preflights / audit / attestation sections)
- Emits `<promise>…</promise>` ONLY when every gate is green, exit 0
- Emits NO promise tag when anything is not green, exit 1

Your final agent output for the last Ralph iteration should be: (a) the
script's stdout verbatim, plus (b) a one-line hand-off. If the script did
not emit a promise tag, you MUST NOT fabricate one — that would be a false
completion claim. Instead, report the blockers and let Ralph fire the next
iteration to remediate.

This removes the one remaining judgment call from the agent: the script
decides whether the loop exits, not you.

## Output Format

Always conclude with Exec Session Summary showing: task, run ID, steps completed, MATOP verdict, compliance verdict, status change, artifact paths.

## Protocol Rules

**See `references/exec-protocol.md`** for non-negotiable enforcement rules (commands must be executed, gates must pass, attestation must be accurate, hashes mandatory).

---

Begin by reading the specification and plan, then create a todo list for the implementation steps.
