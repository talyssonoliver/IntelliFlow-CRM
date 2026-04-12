# Compliance Check — Section 10: PRD/ADR Governance

**Blocking**: Yes — user-facing tasks without PRD, or architectural tasks
without ADR, fail compliance.

## Purpose

Verifies that governance documents (PRDs and ADRs) were created/updated as part
of task delivery. These documents are the project's institutional memory —
without them, future tasks in the same feature area lack context.

## Verification Steps

### Step 1: Read Spec's Related Documents

Read the spec at `.specify/sprints/sprint-{N}/specifications/{TASK_ID}-spec.md`.
Find the `## Related Documents` section and extract the table rows.

If no `## Related Documents` section exists (older spec format):

- Determine applicability based on task type rules (Step 2)
- If PRD/ADR should exist, check if they were created anyway

### Step 2: Determine Applicability

| Task Type                 | PRD Required                | ADR Required                   |
| ------------------------- | --------------------------- | ------------------------------ |
| PG-\* (page/UI)           | YES                         | Only if architectural decision |
| IFC-\* with UI components | YES                         | If new pattern/technology      |
| IFC-\* backend-only       | NO (unless user-facing API) | If new pattern/technology      |
| ENV-\* (infrastructure)   | NO                          | YES                            |
| TRACK-_, EXC-_ (tooling)  | NO                          | Only if process decision       |

### Step 3: Verify PRD Exists (if applicable)

If PRD is required:

1. Check spec's Related Documents for PRD path
2. Verify the file exists at that path on disk
3. Verify the PRD contains the task ID in its `Related Tasks` field
4. Verify PRD `Last Updated` date is recent (within the task's execution window)

**Result**:

- PRD exists with task ID → PASS
- PRD exists without task ID → WARN (task ID not linked)
- PRD does not exist → FAIL
- PRD not applicable → SKIP (with reason)

### Step 4: Verify ADR Exists (if applicable)

If ADR is required:

1. Check spec's Related Documents for ADR path
2. Verify the file exists at that path on disk
3. Verify the ADR's `Technical Story` references the task ID
4. Verify ADR status is "Accepted" (not still "Proposed" after exec completes)

**Result**:

- ADR exists and Accepted → PASS
- ADR exists but still Proposed → WARN (should be Accepted post-implementation)
- ADR does not exist → FAIL
- ADR not applicable → SKIP (with reason)

### Step 5: Cross-reference with ADR README

If a new ADR was created during this task:

1. Read `docs/planning/adr/README.md`
2. Verify the new ADR appears in the index table
3. If missing from index → WARN (README needs update)

## Output Format

```
[Section 10: PRD/ADR Governance]
Task: {TASK_ID}
Task Type: {PG/IFC/ENV/...}

PRD Check:
  Required: YES/NO (reason)
  Path: docs/planning/prd-{area}.md
  Exists: YES/NO
  Task ID linked: YES/NO
  Status: PASS/FAIL/WARN/SKIP

ADR Check:
  Required: YES/NO (reason)
  Path: docs/planning/adr/ADR-{NNN}-{slug}.md
  Exists: YES/NO
  Status field: Accepted/Proposed
  Status: PASS/FAIL/WARN/SKIP

ADR README Index:
  New ADR created: YES/NO
  Indexed in README: YES/NO/N/A
  Status: PASS/WARN/N/A

Overall Section 10: PASS/FAIL
```

## Failure Recovery

If Section 10 fails:

1. Create the missing PRD/ADR using templates at:
   - `docs/planning/prd-template.md`
   - `docs/planning/adr/template.md`
2. Link the task ID in the document
3. Update ADR README index if needed
4. Re-run compliance check
