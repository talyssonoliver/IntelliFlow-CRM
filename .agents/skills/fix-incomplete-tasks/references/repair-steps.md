# Fix Incomplete Tasks — Repair Steps

## §B Plan Step Verification (Phase B — THE CORE)

Read every checkbox line from the plan file. For EACH unchecked `- [ ]` item:

```
For each unchecked checkbox:
  1. Parse what the step describes (e.g., "Create TaskDetail component", "Add unit tests for X")
  2. Search the codebase to verify if the work was actually done:
     - File creation steps → check if file exists with real content
     - Component steps → check if component is exported and functional
     - Test steps → check if test file exists and tests pass
     - Hook/utility steps → check if exported from barrel
     - Type/interface steps → check if type exists in the correct file
     - Integration steps → check if wiring exists (imports, container, router)
  3. Decision:
     a. DONE BUT UNCHECKED → mark checkbox as [x] in plan file
     b. NOT DONE → implement it, then mark checkbox as [x]
     c. NOT APPLICABLE (plan is outdated) → mark [x] with note "(N/A — superseded)"
```

### Step Type Verification Table

| Step Type | Verification Method |
|-----------|-------------------|
| "Create `path/to/file.tsx`" | `test -f path/to/file.tsx` + file has >50 bytes of real content |
| "Add tests for X" | Test file exists + `npx vitest run <test-file> --reporter=verbose` passes |
| "Export from barrel" | Grep barrel file (`index.ts`) for the export name |
| "Add type/interface X" | Grep for `export (type\|interface) X` in target file |
| "Wire service in container" | Grep `container.ts` for class instantiation |
| "Add route to router" | Grep `router.ts` for route merge |
| "Implement hook useX" | File exists + exported from module |
| "Add accessibility" | Check for aria-label, role, tabIndex in component |
| "Add error handling" | Check for try/catch, error boundary, or error state in component |
| "Style with Tailwind" | Check component has className with Tailwind classes |

### If implementing missing code:
- Read surrounding files to understand patterns and conventions
- Follow existing code style in the same directory
- Add proper TypeScript types
- Include test coverage for new code
- Do NOT over-engineer — implement exactly what the plan step says

## §C Plan File Deliverables Check (Phase C)

Parse `**Files to Create:**` and `**Files to Modify:**` sections from plan.

For each listed file:
1. Check if file exists on disk
2. If missing: determine if it should exist (was it renamed? moved? is the plan wrong?)
3. If genuinely missing: create it following the plan's description
4. If plan path is wrong but file exists elsewhere: update the plan path

## §D Run the 4 Mandatory Validations (Phase D)

**ALL FOUR ARE REQUIRED. NO EXCEPTIONS.**

Determine the affected package(s) from Phase A, then run:

```bash
# 1. TypeScript
pnpm --filter <package> typecheck
# OR for multi-package: pnpm typecheck

# 2. Tests
npx vitest run <relevant-test-dir> --reporter=verbose
# Capture: pass count, fail count, duration

# 3. Lint
npx eslint <relevant-src-dir> --max-warnings=0
# OR: pnpm --filter <package> lint

# 4. Build
pnpm --filter <package> build
# NEVER SKIP BUILD. "Next.js compiles on demand" is NOT a valid excuse.
```

### If any validation fails:
1. Fix the issue (type error, test failure, lint error, build error)
2. Re-run that validation
3. Repeat until all 4 pass
4. Record actual exit codes and durations

### For scoped test coverage (when tests exist):
```bash
npx vitest run <test-dir> --coverage --coverage.include='<src-pattern>'
```
Thresholds: Statements >=90%, Branches >=80%, Functions >=90%, Lines >=90%

## §E Create/Update Attestation (Phase E)

Location:
```
.specify/sprints/sprint-{N}/attestations/{TASK_ID}/attestation.json
```

Create the directory if needed. The attestation MUST contain:

```json
{
  "$schema": "https://intelliflow-crm.com/schemas/attestation.schema.json",
  "schema_version": "1.0.0",
  "task_id": "<TASK_ID>",
  "run_id": "<TASK_ID>-validation-<YYYYMMDD>-<HHMMSS>",
  "attestor": "Claude Code — Task Completion Repair",
  "attestation_timestamp": "<ISO 8601>",
  "verdict": "COMPLETE",
  "evidence_summary": {
    "artifacts_verified": <count>,
    "validations_passed": 4,
    "validations_failed": 0,
    "gates_passed": 4,
    "gates_failed": 0,
    "kpis_met": <count>,
    "kpis_missed": 0,
    "placeholders_found": 0
  },
  "validation_results": [
    {
      "name": "TypeScript",
      "command": "<actual command run>",
      "passed": true,
      "exit_code": 0,
      "timestamp": "<ISO 8601>",
      "duration_ms": <actual ms>
    },
    {
      "name": "Tests",
      "command": "<actual command run>",
      "passed": true,
      "exit_code": 0,
      "timestamp": "<ISO 8601>",
      "duration_ms": <actual ms>
    },
    {
      "name": "Lint",
      "command": "<actual command run>",
      "passed": true,
      "exit_code": 0,
      "timestamp": "<ISO 8601>",
      "duration_ms": <actual ms>
    },
    {
      "name": "Build",
      "command": "<actual command run>",
      "passed": true,
      "exit_code": 0,
      "timestamp": "<ISO 8601>",
      "duration_ms": <actual ms>
    }
  ],
  "artifact_hashes": {
    "<path>": "<SHA256 from certutil -hashfile>"
  },
  "notes": "<what was fixed/verified>"
}
```

**Schema compliance**: Read `apps/project-tracker/docs/metrics/schemas/attestation.schema.json`
BEFORE writing. `additionalProperties: false` — no extra fields allowed.

**Hash calculation** (Windows):
```bash
certutil -hashfile <path> SHA256
```

## §F Verify Plan is 100% Complete (Phase F)

After all implementation and validation:

1. Re-read the plan file
2. Count checkboxes: total vs checked
3. If any remain unchecked → go back to Phase B for those items
4. **100% is the ONLY acceptable completion state for a "Completed" task**

## §G Log Result and Move to Next Task (Phase G)

Display per-task summary:
```
[Task N/M] PG-146 - Ticket Management Page
  Plan Steps:   50/51 → 51/51 (fixed 1 unchecked step)
  Plan Files:   10/10 (all present)
  Attestation:  CREATED (was missing)
  Validations:  4/4 passed (TypeScript ✓ Tests ✓ Lint ✓ Build ✓)
  Status:       REPAIRED ✓
```

## Error Handling

- If a task fails validation after 2 fix attempts → mark as BLOCKED, log reason, continue
- If plan file is corrupt/unreadable → skip plan analysis, do validation-only repair
- If build fails due to unrelated issue → log error, continue to next task
- Never leave the plan file in an inconsistent state (partial checkbox edits)
- Always write attestation atomically (write complete file, never partial)
