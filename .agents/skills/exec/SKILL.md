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

### Phase 5: Update Status
Based on MATOP + Compliance verdict, update Sprint_plan.csv status.
**See `references/phase5-attestation-format.md`** for status decision matrix.

## Error Handling

1. **Prerequisite Missing** — Inform user, provide command to generate
2. **Test Fails in RED** — Expected, proceed to GREEN
3. **Test Fails in GREEN** — Fix code, don't skip to next step
4. **MATOP Gate Fails** — Log details, set FAIL, generate remediation
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

## Output Format

Always conclude with Exec Session Summary showing: task, run ID, steps completed, MATOP verdict, compliance verdict, status change, artifact paths.

## Protocol Rules

**See `references/exec-protocol.md`** for non-negotiable enforcement rules (commands must be executed, gates must pass, attestation must be accurate, hashes mandatory).

---

Begin by reading the specification and plan, then create a todo list for the implementation steps.
