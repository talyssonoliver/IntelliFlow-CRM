# Plan Session — TDD Phase Structure

## TDD Phase Structure

Every plan step must specify:

- Exact file paths
- Exact validation commands for that step
- The real runtime consumer for any new surface
- Existing regression suites that must be rerun after the step lands

### Phase 1: RED (Write Failing Tests)

For each component in the specification:

1. Create test file at `{dir}/__tests__/{component}.test.ts`
2. Write tests for acceptance criteria
3. Verify tests fail (implementation doesn't exist)
4. Identify existing test files that cover adjacent behavior and must be rerun
   later

### Phase 2: GREEN (Make Tests Pass)

For each component:

1. Create/modify implementation file
2. Implement minimum code to pass tests
3. Run tests to verify green
4. Wire new behavior into the real production caller (component, route, handler,
   service, command, etc.)
5. If replacing an existing path, remove or bypass the old implementation path
   in the same plan

### Phase 3: REFACTOR (Clean Up)

1. Review implementation for duplication
2. Apply project patterns
3. Ensure all tests still pass
4. Run lint and type checks

### Phase 4: VALIDATION (Final Check)

1. Run the plan's validation matrix (all exact commands listed in the plan)
2. Verify new tests and touched existing regression suites both pass
3. Verify coverage thresholds
4. Run build
5. Check all acceptance criteria

## Anti-Patterns (Reject These)

- Generic validation commands with no file or package scope
- Plans that create a server-side API but never route the UI/runtime through it
- Plans that leave the legacy implementation path active while claiming the new
  path replaces it
- Validation sections that only mention new tests while skipping touched
  existing suites
- Security work without explicit negative-path validation

## Example Plan Output

```markdown
# Execution Plan: IFC-101

## Preflight Checks

1. Verify dependencies installed
2. TypeScript compilation passes
3. Existing tests pass

## Estimated Effort

| Phase          | Estimate                    |
| -------------- | --------------------------- |
| Tests          | ~2 file(s) - 30-60 minutes  |
| Implementation | ~3 file(s) - 60-135 minutes |
| Integration    | ~3 file(s) - 30-60 minutes  |
| **Total**      | **2-4 hours**               |

## Execution Steps

### Phase 1: RED - Write Failing Tests

#### Step 1: Write failing tests for LeadEntity

**Type:** test **Files to Create:**

- `packages/domain/src/crm/lead/__tests__/Lead.test.ts`

**Acceptance Criteria Addressed:**

- Lead entity validates required fields
- Lead score calculation works correctly

**Validation:**

- [ ] Tests should fail initially
- [ ] Verify test structure follows project patterns

### Phase 2: GREEN - Make Tests Pass

#### Step 2: Implement LeadEntity

**Type:** implementation **Files to Create:**

- `packages/domain/src/crm/lead/Lead.ts`

**Validation:**

- [ ] TypeScript compiles
- [ ] Related tests pass

> **Checkpoint:** All tests pass `pnpm run test`

### Phase 3: REFACTOR - Clean Up

#### Step 4: Refactor and optimize

**Type:** implementation **Files to Modify:**

- All implementation files

**Validation:**

- [ ] Lint passes
- [ ] All tests still pass

## Final Validation

1. Run full test suite
2. Verify coverage ≥90%
3. Build project
4. Check all acceptance criteria

## Integration Checkpoints Summary

| After Step | Verification        | Command              |
| ---------- | ------------------- | -------------------- |
| 1          | Test files compile  | `pnpm run typecheck` |
| 3          | All tests pass      | `pnpm run test`      |
| 4          | Code quality passes | `pnpm run lint`      |
```

## Example Session Output

```
User: /plan-session IFC-101

Claude Code:
[Plan Session] Task: IFC-101 - Lead Domain Model
[Plan Session] Session ID: plan-IFC-101-b2c3d4e5

[Loading Specification]
Source: .specify/sprints/sprint-2/specifications/IFC-101-spec.md
Components: 3
Acceptance Criteria: 8

[Generating Preflight Checks]
1. Verify dependencies installed
2. TypeScript compilation passes
3. Verify dependency IFC-002 complete
4. Verify dependency IFC-106 complete

[Decomposing to TDD Steps]

Phase 1: RED (3 steps)
- Step 1: Write failing tests for Lead entity
- Step 2: Write failing tests for LeadService
- Step 3: Write failing tests for LeadRouter

Phase 2: GREEN (4 steps)
- Step 4: Implement Lead entity
- Step 5: Implement LeadService
- Step 6: Implement LeadRouter
- Step 7: Integrate components

Phase 3: REFACTOR (1 step)
- Step 8: Refactor and optimize

Phase 4: VALIDATION (1 step)
- Step 9: Final validation

[Effort Estimation]
- Tests: ~3 file(s) - 45-90 minutes
- Implementation: ~4 file(s) - 80-180 minutes
- Integration: ~3 file(s) - 30-60 minutes
- Total: 2.5-5.5 hours

[Output]
Plan written to: .specify/sprints/sprint-2/planning/IFC-101-plan.md
Session saved to: .specify/sprints/sprint-2/context/IFC-101/IFC-101-plan-session.json
```
