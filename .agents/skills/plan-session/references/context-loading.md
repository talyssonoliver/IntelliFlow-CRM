# Plan Session — Context Loading & Prerequisites

## Prerequisites

A specification document must exist at (sprint-based path):
`.specify/sprints/sprint-{N}/specifications/<TASK_ID>-spec.md`

Where `{N}` is the task's Target Sprint from Sprint_plan.csv.

If no specification exists, run `/spec-session <TASK_ID>` first.

## What the Session Does (Phase Overview)

1. **Load Specification**
   - Parse specification markdown
   - Extract components, acceptance criteria, test requirements
   - Extract `## Related Documents` section → get PRD and ADR paths

2. **Verify PRD/ADR from Spec** (MANDATORY)
   - For each PRD/ADR path in the spec's Related Documents table:
     - Verify the file EXISTS on disk
     - If missing → STOP and run `/spec-session` Phase 0.97 to create it
   - Include PRD/ADR paths in plan's "Files to Modify" section
   - If spec has no Related Documents section → flag as plan-reviewer ERROR

3. **Generate Preflight Checks**
   - Dependency installation
   - TypeScript compilation
   - Existing test verification
   - Database migration status

4. **Decompose to TDD Steps**
   - **RED Phase**: Write failing tests
   - **GREEN Phase**: Implement to pass tests
   - **REFACTOR Phase**: Clean up and optimize
   - **VALIDATION Phase**: Final verification

5. **Generate Integration Checkpoints**
   - Checkpoints after each TDD phase
   - Commands to verify progress
   - Rollback points

6. **Estimate Effort**
   - Per-phase estimates
   - Total implementation time

## Integration with MATOP

Plan session is Phase 2 of the enhanced MATOP workflow:

```
Phase 0:   Context Hydration
Phase 0.5: Agent Selection
Phase 1:   Spec Session
Phase 2:   Plan Session    ← THIS COMMAND
Phase 3:   Gate Execution
```

When running `/matop-execute`, plan session runs automatically after spec session.
Use this command for standalone plan generation.
