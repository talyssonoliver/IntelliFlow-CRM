# Fix Incomplete Tasks — Analysis Process

## §1 Get Flagged Tasks

Fetch the task list from the executive metrics API — use BOTH integrity and plan
deliverables sections:

```bash
curl -s http://localhost:3002/api/metrics/executive | python -c "
import json, sys
data = json.load(sys.stdin)
tasks = {}
for d in data['completion_integrity_details']:
    tasks[d['task_id']] = {'issues': d['issues'], 'source': 'integrity'}
for d in data['incomplete_plan_deliverables_details']:
    tid = d['task_id']
    if tid in tasks:
        tasks[tid]['plan_gap'] = d
    else:
        tasks[tid] = {'issues': [f\"Files {d['verified_files']}/{d['total_files']}\", f\"Steps {d['checkbox_checked']}/{d['checkbox_total']}\"], 'source': 'plan_gap', 'plan_gap': d}
for tid, info in sorted(tasks.items()):
    print(f\"{tid}: {'; '.join(info['issues'][:3])}\")
print(f'\\nTotal: {len(tasks)} tasks')
"
```

If `--task TASK_ID` was provided, filter to just that one task.

Sort tasks by sprint number (ascending), then by dependency order.

## §2A Load Context (Phase A)

1. **Read the task from Sprint_plan.csv** (use split files A-E based on task
   range) Extract: Task ID, Section, Description, Dependencies, Definition of
   Done, KPIs, Target Sprint, Artifacts To Track, Validation Method

2. **Locate the plan file**:

   ```
   .specify/sprints/sprint-{N}/planning/{TASK_ID}-plan.md
   ```

   If no plan file exists, skip to Phase D (validation-only repair).

3. **Locate existing attestation** (may or may not exist):

   ```
   .specify/sprints/sprint-{N}/attestations/{TASK_ID}/attestation.json
   ```

4. **Determine affected packages** from the plan's file paths:
   - `apps/web/...` → package = `web`
   - `apps/api/...` → package = `api`
   - `packages/domain/...` → package = `@intelliflow/domain`
   - etc.

## Task Categories — How to Handle Each

### Category 1: All code done, just missing attestation

**Most common.** Plan checkboxes may be 100% or close. Files all exist.

- Verify code is real (not placeholder)
- Run 4 validations
- Create attestation
- Check any remaining plan checkboxes

### Category 2: Code done, plan checkboxes unchecked

Plan has `- [ ]` items but the work was actually completed.

- Verify each unchecked step against codebase
- Mark verified steps as `- [x]`
- Create attestation with validation results

### Category 3: Partial implementation — some steps not done

Plan has `- [ ]` items and the code genuinely doesn't exist.

- Read the plan step and surrounding context
- Implement the missing code
- Run tests to verify
- Mark checkbox as `- [x]`
- Create attestation

### Category 4: Legacy/sprint-0 tasks — no plan file exists

Early tasks (EXC-_, AI-SETUP-_, ENV-\*) often have no plan file.

- Only check: attestation existence and 4 validations
- If code artifacts exist and validations pass → create attestation
- Don't try to retroactively create plan checkboxes

### Category 5: Tasks with attestation but <4 validations

Attestation exists but is missing some of the 4 required validations.

- Read existing attestation
- Run the missing validations
- Update attestation with new results (preserve existing data)
- Ensure exactly 4 entries in `validation_results`
