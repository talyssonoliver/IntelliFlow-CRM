# Fix Incomplete Tasks - Batch Evidence Validation

Iterates through all tasks marked "Completed" that are missing
evidence/artifacts, validates each one, and fixes issues before setting final
status.

## Usage

```bash
/fix-incomplete-tasks [--start-from TASK_ID] [--dry-run]
```

## Arguments

- `--start-from TASK_ID` (optional): Resume from a specific task ID
- `--dry-run` (optional): Analyze only, don't make changes

---

## CRITICAL INSTRUCTIONS

You are the **Task Integrity Validator**. Your mission is to iterate through
each task that the governance system has flagged as "Completed but missing
evidence" and ensure full compliance before allowing the task to remain
complete.

**NEVER use placeholder files. All evidence must be REAL.**

---

## Step 1: Get List of Incomplete Tasks

First, call the governance API to get the list of tasks requiring validation:

```bash
curl -s http://localhost:3002/api/governance/revert-incomplete | jq -r '.tasksWithMissingArtifacts[] | .taskId'
```

Or use the executive metrics API:

```bash
curl -s http://localhost:3002/api/metrics/executive | jq -r '.tasksRequiringRevertDetails[] | .taskId'
```

Store the full list and iterate through each one.

---

## Step 2: For EACH Task, Execute This Workflow

### 2.1 Load Task Data

Read the task from Sprint_plan.csv:

```
apps/project-tracker/docs/metrics/_global/Sprint_plan.csv
```

Extract these fields:

- Task ID
- Section
- Description
- Owner
- Dependencies
- Pre-requisites
- Definition of Done
- Status
- KPIs
- Target Sprint
- Artifacts To Track
- Validation Method

### 2.2 Parse Artifacts Column

The "Artifacts To Track" column uses these prefixes:

| Prefix      | Meaning                             | Action                                            |
| ----------- | ----------------------------------- | ------------------------------------------------- |
| `ARTIFACT:` | Code/config file that must exist    | Verify file exists, if not → task is NOT complete |
| `EVIDENCE:` | Attestation file proving completion | Create if valid, else → task is NOT complete      |
| `FILE:`     | Pre-requisite file                  | Verify exists before proceeding                   |
| `VALIDATE:` | Validation command to run           | Execute and record result                         |
| `GATE:`     | Quality gate check                  | Execute via STOA                                  |
| `AUDIT:`    | Audit check type                    | Record in evidence                                |
| `ENV:`      | Environment requirement             | Verify environment state                          |
| `POLICY:`   | Policy reference                    | Include in attestation                            |

### 2.3 Check for Placeholder Detection

**CRITICAL**: Scan all ARTIFACT: paths for placeholder content. A file is a
placeholder if:

1. Contains only comments like `# Placeholder` or `// TODO`
2. File size < 50 bytes with no meaningful content
3. Contains text like "placeholder", "stub", "todo", "fixme" as the main content
4. JSON files with empty objects `{}` or minimal stub data
5. Markdown files with only a title and no content

If ANY placeholder is detected:

- Log the placeholder file path
- Mark task as requiring fix
- Do NOT proceed to completion

### 2.4 Verify Pre-requisites

Check that all dependencies are actually complete:

```
1. Parse Dependencies field (comma-separated task IDs)
2. For each dependency:
   a. Check its Status in CSV
   b. If Status != "Completed" → this task cannot be complete
   c. If dependency has missing evidence → this task cannot be complete
```

### 2.5 Verify ARTIFACT: Paths Exist

For each `ARTIFACT:` path:

```
1. Check if file/directory exists on disk
2. If file exists:
   a. Verify it's not a placeholder (see 2.3)
   b. Calculate SHA256 hash
   c. Record in evidence bundle
3. If file doesn't exist:
   a. Can it be created by running a command? (e.g., build output)
   b. If yes, run the command and verify
   c. If no, mark task as INCOMPLETE
```

### 2.6 Execute VALIDATE: Commands

For each `VALIDATE:` instruction:

```
1. Parse the validation command
2. Execute in appropriate context
3. Capture stdout, stderr, exit code
4. If exit code != 0 → validation failed → task INCOMPLETE
5. Record results in evidence
```

### 2.7 Run GATE: Checks

For each `GATE:` reference:

```
1. Look up gate in audit-matrix.yml
2. Execute gate command
3. Compare result against threshold
4. If below threshold → gate failed → task INCOMPLETE
5. Record gate result in evidence
```

### 2.8 Verify KPIs Are Met

Parse the KPIs field and verify each metric:

Examples:

- `Coverage >90%` → Check coverage report, verify percentage
- `Response <200ms` → Check performance benchmarks
- `Lighthouse >90` → Check lighthouse report scores
- `Zero critical vulnerabilities` → Check security scan results

If ANY KPI is not met → task is INCOMPLETE

### 2.9 Verify Definition of Done

Parse the "Definition of Done" field. Each semicolon-separated item is a
criterion. Verify each criterion is actually met based on:

1. File existence checks
2. Content validation
3. Test results
4. Documentation completeness

### 2.10 Generate Evidence Bundle

If ALL checks pass, create the evidence bundle:

```
artifacts/attestations/<TASK_ID>/
├── context_ack.json        # Main attestation file
├── artifact_hashes.json    # SHA256 hashes of all artifacts
├── validation_results.json # Results of VALIDATE: commands
├── gate_results.json       # Results of GATE: checks
└── kpi_verification.json   # KPI measurement results
```

**context_ack.json structure:**

```json
{
  "task_id": "<TASK_ID>",
  "attestation_timestamp": "<ISO8601>",
  "attestor": "Claude Code - Task Integrity Validator",
  "verdict": "COMPLETE",
  "evidence_summary": {
    "artifacts_verified": <count>,
    "validations_passed": <count>,
    "gates_passed": <count>,
    "kpis_met": <count>,
    "placeholders_found": 0
  },
  "artifact_hashes": {
    "<path>": "<sha256>"
  },
  "validation_results": [...],
  "gate_results": [...],
  "kpi_results": [...],
  "dependencies_verified": ["<dep_id>", ...],
  "definition_of_done_items": [
    {"criterion": "...", "met": true, "evidence": "..."}
  ]
}
```

### 2.11 Update Task Status

Based on validation results:

**If ALL checks pass:**

1. Create evidence bundle (2.10)
2. Ensure Status remains "Completed" in CSV
3. Log success and move to next task

**If ANY check fails:**

1. Change Status to "In Progress" in CSV
2. Log what failed and why
3. Create a remediation note in `artifacts/reports/remediation/<TASK_ID>.json`:

```json
{
  "task_id": "<TASK_ID>",
  "current_status": "In Progress",
  "issues_found": [
    {
      "type": "missing_artifact|placeholder|failed_validation|unmet_kpi|incomplete_dependency",
      "description": "...",
      "path_or_detail": "...",
      "suggested_fix": "..."
    }
  ],
  "blocked_by": ["<dependency_task_id>", ...],
  "estimated_effort": "..."
}
```

4. Move to next task

---

## Step 3: Summary Report

After iterating through all tasks, generate:

```
artifacts/reports/task-validation-summary-<timestamp>.json
```

```json
{
  "run_timestamp": "<ISO8601>",
  "total_tasks_analyzed": <count>,
  "tasks_validated_complete": ["<id>", ...],
  "tasks_reverted_to_in_progress": ["<id>", ...],
  "issues_by_type": {
    "missing_artifact": <count>,
    "placeholder_detected": <count>,
    "failed_validation": <count>,
    "unmet_kpi": <count>,
    "incomplete_dependency": <count>
  },
  "next_actions": [
    {"task_id": "...", "action": "...", "priority": "high|medium|low"}
  ]
}
```

---

## Iteration Order

Process tasks in this order for efficiency:

1. **Phase 0 tasks first** (foundational, others may depend on them)
2. **By dependency order** (tasks with no deps before tasks with deps)
3. **By Section** (group similar work)

---

## Error Handling

- If a task validation throws an error, log it and continue to next task
- Track all errors in the summary report
- Never leave the CSV in an inconsistent state
- Always write evidence atomically (all or nothing)

---

## Example Execution

```
/fix-incomplete-tasks

[Validator] Loading incomplete tasks from governance API...
[Validator] Found 63 tasks requiring validation

[Task 1/63] EXC-INIT-001 - Sprint 0 Environment Setup
  ├── Checking ARTIFACT: apps/project-tracker/...  ✓ exists
  ├── Checking ARTIFACT: tools/scripts/...         ✓ exists
  ├── Placeholder scan...                          ✓ no placeholders
  ├── Checking dependencies...                     ✓ none
  ├── Checking KPIs...                             ✓ all met
  ├── Creating evidence bundle...                  ✓ created
  └── Status: COMPLETE ✓

[Task 2/63] AI-SETUP-001 - Claude Code Configuration
  ├── Checking ARTIFACT: .claude/commands/...      ✓ exists
  ├── Placeholder scan...                          ✗ PLACEHOLDER DETECTED
  │   └── .claude/commands/example.md contains stub content
  ├── Status: REVERTED TO IN PROGRESS
  └── Remediation logged

[Task 3/63] ENV-001-AI - Automated Monorepo Creation
  ...

[Summary]
  Total analyzed: 63
  Validated complete: 45
  Reverted to in progress: 18

  Issues found:
  - 5 missing artifacts
  - 8 placeholder files
  - 3 failed validations
  - 2 unmet KPIs

  Report: artifacts/reports/task-validation-summary-2025-12-25T18-00-00.json
```

---

## Related Commands

- `/matop-execute <TASK_ID>` - Full MATOP validation for single task
- `/stoa-quality` - Quality STOA validation
- `/stoa-security` - Security STOA validation
- `/review-ai-output` - Review AI-generated code

---

## Configuration Files

- `audit-matrix.yml` - Gate definitions
- `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv` - Task source of
  truth
- `apps/project-tracker/docs/metrics/validation.yaml` - Validation rules
