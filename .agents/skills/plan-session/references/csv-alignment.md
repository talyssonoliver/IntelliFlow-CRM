# Plan Session — CSV Artifact Alignment Check

## CSV Artifact Alignment Check (MANDATORY — after TDD decomposition)

Before writing the final plan file, cross-reference the generated "Files to
Create/Modify" against Sprint_plan.csv "Artifacts To Track" for the task.

### Steps

1. Read the task row from Sprint_plan.csv
2. Parse the "Artifacts To Track" column (handling `ARTIFACT:`, `EVIDENCE:`,
   `FILE:` prefixes)
3. Compare each CSV artifact path against the plan's file lists
4. Report discrepancies:

| Condition                                | Level | Action                                    |
| ---------------------------------------- | ----- | ----------------------------------------- |
| CSV artifact not in plan                 | WARN  | May need plan adjustment or CSV cleanup   |
| Plan file not in CSV                     | INFO  | Will need CSV update after implementation |
| CSV artifact completely absent from plan | ASK   | Ask user before proceeding                |

### Automated check

```bash
npx tsx tools/scripts/validate-artifacts.ts <TASK_ID>
```

If any CSV artifact is completely absent from the plan AND cannot be explained
by scope changes, ask the user whether to adjust the plan or update the CSV
before writing the plan file.

This prevents the common failure mode where plans diverge from CSV artifact
expectations, causing Gate 2.5 failures during `/exec-gates`.
