# Plan Session — Output Format

## Output

Plan is written to the sprint-based directory. All files are prefixed with
`{TASK_ID}-` for self-identification:

```
.specify/sprints/sprint-{N}/
├── context/<TASK_ID>/
│   └── <TASK_ID>-plan-session.json     # Session state
└── planning/
    └── <TASK_ID>-plan.md               # TDD execution plan
```

Where `{N}` is the task's Target Sprint from Sprint_plan.csv.

## Plan Document Structure

```markdown
# Execution Plan: <TASK_ID>

## Preflight Checks

1. Verify dependencies installed
2. TypeScript compilation passes
3. Existing tests pass

## Implementation Reality Checks

| Surface           | Production Consumer        | Replaces / Blocks    | Verification Command                        |
| ----------------- | -------------------------- | -------------------- | ------------------------------------------- |
| `auth.resolveSso` | `SsoEntryForm` submit path | direct client lookup | `pnpm --dir apps/web exec vitest run "..."` |

## Estimated Effort

| Phase          | Estimate                    |
| -------------- | --------------------------- |
| Tests          | ~2 file(s) - 30-60 minutes  |
| Implementation | ~3 file(s) - 60-135 minutes |
| Integration    | ~3 file(s) - 30-60 minutes  |
| **Total**      | **2-4 hours**               |

## Execution Steps

### Phase 1: RED - Write Failing Tests

...

### Phase 2: GREEN - Make Tests Pass

...

### Phase 3: REFACTOR - Clean Up

...

## Final Validation

1. Run all commands from the Validation Matrix
2. Verify coverage ≥90%
3. Build project
4. Check all acceptance criteria

## Validation Matrix

| Scope                  | Purpose                                    | Command                                                         |
| ---------------------- | ------------------------------------------ | --------------------------------------------------------------- |
| New tests              | Verify task-specific additions             | `pnpm --dir apps/web exec vitest run "src/...new.test.ts"`      |
| Touched existing tests | Prevent regressions in modified code paths | `pnpm --dir apps/web exec vitest run "src/...existing.test.ts"` |
| Package build gates    | Type/lint/build                            | `pnpm --filter <pkg> build`                                     |

## Integration Checkpoints Summary

| After Step | Verification        | Command              |
| ---------- | ------------------- | -------------------- |
| 1          | Test files compile  | `pnpm run typecheck` |
| 3          | All tests pass      | `pnpm run test`      |
| 4          | Code quality passes | `pnpm run lint`      |
```

## Important Format Rules

- **Files to Create:** and **Files to Modify:** MUST use plural block format
  with newline + list:
  ```
  **Files to Create:**
  - `path/to/file.ts`
  ```
  NOT singular inline: `**File to Create:** \`path\``
- Checkboxes use standard markdown: `- [ ] task description`
- All plan steps are numbered sequentially across all phases
- `## Implementation Reality Checks` is mandatory when runtime behavior changes
- `## Validation Matrix` is mandatory and must use executable commands, not
  vague prose
