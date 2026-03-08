# Compliance Check — Section 6: CSV Artifact Completeness vs Plan (BLOCKING)

**CRITICAL**: The Sprint_plan.csv `Artifacts To Track` column must list ALL significant
deliverables from the plan. This catches the gap where a plan specifies a file (e.g., an
integration test) but the CSV doesn't track it, so compliance checks never verify its existence.

**How to validate:**

```
1. Read plan: .specify/sprints/sprint-{N}/planning/{{task_id}}-plan.md
2. Extract ALL file paths from "Files to Create:" and "Files to Modify:" sections
3. Read Sprint_plan.csv "Artifacts To Track" for this task
4. Parse ARTIFACT: entries from CSV
5. For EACH file in the plan:
   a. Check if it exists on disk (already covered by Section 4)
   b. Check if it appears in CSV "Artifacts To Track" (either as ARTIFACT: or bare path)
6. Report any plan files NOT tracked in CSV
```

**What to flag:**
- Plan specifies HIGH priority deliverables (test files, integration tests, core implementation)
  that are missing from CSV → **FAIL** (must be added to CSV before marking complete)
- Plan specifies files that don't exist AND aren't in CSV → **FAIL** (deliverable was skipped
  and tracking was never set up to catch it)

**Common failure mode** (IFC-150 pattern): Plan Step 4.1 specifies
`event-flow.integration.test.ts` at HIGH priority, but CSV `Artifacts To Track` only lists
8 other files. The test is never created, IFC-150.json shows `missing: []`, and no gate catches it.

| Check | Requirement |
|-------|-------------|
| Plan files in CSV | Every plan deliverable should be tracked in CSV Artifacts To Track |
| Missing + untracked | Files in plan but not on disk AND not in CSV → FAIL |
| Missing + tracked | Files in plan, not on disk, but in CSV → covered by Section 4 |
| Exists + untracked | Files in plan, on disk, but not in CSV → FAIL |

**BLOCKING RULE:**
- Plan file missing from disk AND missing from CSV tracking → **FAIL**
- Plan file exists but not in CSV tracking → **FAIL** (add to CSV before task can complete)
