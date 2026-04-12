# Phase 2: Execute Implementation (TDD)

## Generate Run ID

```javascript
const runId =
  new Date()
    .toISOString()
    .replace(/[:\-T]/g, '')
    .slice(0, 14) +
  '-' +
  require('crypto').randomBytes(4).toString('hex');
// Example: 20260123201500-a1b2c3d4
```

## Update Task Status

Update Sprint_plan.csv: Status → "In Progress"

## Create Execution Directory

```
.specify/sprints/sprint-{N}/execution/{{task_id}}/{run_id}/
├── implementation/
│   ├── steps-completed.json
│   └── files-modified.json
└── matop/
```

## TDD Workflow (for each plan step)

### RED Phase — Write Failing Test First

- Read step description from plan
- Identify test file to create
- Write test that fails (Vitest patterns)
- Run test to verify it fails for the right reason:
  ```bash
  pnpm --filter <package> test <test-file> -- --run
  ```

### GREEN Phase — Implement Minimal Code

- Read implementation requirements
- Use Write/Edit tools to create/modify files
- Implement minimal code to pass the test
- Run test to verify green
- Wire the new/changed behavior into the real production caller before moving to
  the next step
- If the plan says this change replaces an older path, update the old path now
  so it no longer bypasses the new logic
- Re-run any directly touched existing test files named in the plan's Validation
  Matrix

### REFACTOR Phase — Clean Up

- Apply project patterns from hydrated context
- Remove duplication, improve readability
- Verify tests still pass
- Keep runtime wiring intact after refactor (do not revert to a bypass path)

### MANDATORY: Update Plan Checkboxes After Each Step

After completing each plan step (RED/GREEN/REFACTOR cycle), **immediately** use
the Edit tool to check off the corresponding checkboxes in the plan file:

```
Edit plan file: `- [ ]` → `- [x]` for each completed item
```

**Rules:**

- Check off items **incrementally** as you complete them, NOT in bulk at the end
- This is critical for context-loss resilience: if the session runs out of
  context, the next session can see exactly which steps are done
- Gate 1 (Plan Checkbox Verification) will BLOCK if any unchecked items remain
- If a step is partially complete, leave its checkbox unchecked until fully done

## Log Progress

```json
// steps-completed.json
{
  "steps": [
    {
      "step_number": 1,
      "description": "Wire CSRF token into login form",
      "status": "completed",
      "tdd_phases": {
        "red": { "completed": true, "test_file": "..." },
        "green": { "completed": true, "impl_file": "..." },
        "refactor": { "completed": true }
      },
      "validation_commands": [
        "pnpm --dir apps/web exec vitest run \"src/...\""
      ],
      "completed_at": "2026-01-23T20:15:00Z"
    }
  ]
}
```

## Run Required Commands

- Database migrations (if needed)
- Package installations (if needed)
- Build to verify (if needed)
- Plan-defined validation matrix commands (MANDATORY)
