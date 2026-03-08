---
name: plan-session
description: Generate a TDD execution plan from a specification document. Decomposes acceptance criteria into RED-GREEN-REFACTOR steps. Phase 2 of the MATOP workflow.
---

# Plan Session Skill

Generates a TDD execution plan from an existing specification. Spawns a mandatory Plan-Reviewer agent for ALL tasks before finalising the plan.

## Shared Workflow Library

Reference: `tools/scripts/lib/workflow/`
Key functions: `SESSION_CONFIG.plan`, `getTaskPaths()`, `getSprintForTask()`, `canProceedToSession()`, `getSessionStartStatus()` → "Planning", `getSessionSuccessStatus()` → "Plan Complete"

**See references/workflow-library.md**

## Status Updates (MANDATORY)

| Event | Status | Percent Complete |
|-------|--------|-----------------|
| Session Start | `Planning` | 30% |
| Session Success | `Plan Complete` | 50% |
| Session Failure | `Spec Complete` | 20% |

Update `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv` with the Edit tool at each event.

**See references/status-and-pmbok.md** for PERT calculation and Planned Finish rules.

## Phase Table

| Phase | Action | Reference |
|-------|--------|-----------|
| 0 | Load spec, check prerequisites | **references/context-loading.md** |
| 1 | Dependency chain + deep verification | **references/dependency-verification.md** |
| 2 | Decompose to RED/GREEN/REFACTOR/VALIDATION | **references/tdd-phases.md** |
| 3 | CSV artifact alignment check | **references/csv-alignment.md** |
| 4 | Spawn Plan-Reviewer (ALWAYS) | **references/plan-reviewer.md** |
| 5 | Write plan file + update CSV | **references/output-format.md** |

## Non-Negotiable Plan Rules

- Every step must use exact file paths and exact validation commands. Avoid placeholders like `pnpm run test` unless the plan explicitly intends a full-suite final run.
- Plans must include runtime wiring for every new surface (who calls it in production) and a replacement/removal step when a legacy path is being superseded.
- Plans must include a validation matrix that covers new tests plus directly affected existing regression suites.
- Plans must not rely on "create file now, wire later" unless a later step names the exact consumer and validation command.

## Agent Mode

| Mode | When Used |
|------|-----------|
| Subagent (default) | Teams disabled OR simple task |
| Agent Team | `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` AND complex task |

Complexity threshold: >3 TDD phases, OR >5 files, OR cross-package (≥2 packages).
**Token cost warning**: Spawning Plan-Reviewer adds ~1x additional token cost.

## Output Paths

```
.specify/sprints/sprint-{N}/
├── context/<TASK_ID>/<TASK_ID>-plan-session.json
└── planning/<TASK_ID>-plan.md
```

## Related Commands

- `/spec-session` — Generate specification (must exist before running this)
- `/hydrate-context` — Standalone context hydration
- `/matop-execute` — Full MATOP workflow (runs this automatically)

## Validation Commands

These are baseline examples only. The actual plan must still emit task-scoped commands in its `## Validation Matrix`.

| Check | Command |
|-------|---------|
| TypeScript | `pnpm run typecheck` |
| Tests | `pnpm run test` |
| Lint | `pnpm run lint` |
| Build | `pnpm run build` |
| Coverage | `pnpm run test -- --coverage` |
