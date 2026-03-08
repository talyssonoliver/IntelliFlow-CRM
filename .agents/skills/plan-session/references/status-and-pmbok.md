# Plan Session — Status Updates & PMBOK Schedule

## CRITICAL: Status Updates

**You MUST update Sprint_plan.csv status AND Percent Complete at these points:**

| Event | Update Status To | Percent Complete | Action |
|-------|------------------|------------------|--------|
| **Session Start** | `Planning` | 30% | Edit CSV before starting work |
| **Session Success** | `Plan Complete` | 50% | Edit CSV after plan is written |
| **Session Failure** | `Spec Complete` | 20% | Edit CSV if session fails (rollback to spec) |

### PMBOK Schedule Updates

At plan session **START**:
1. Update `Percent Complete` to **30%** in Sprint_plan.csv

At plan session **END** (success):
1. Update `Percent Complete` to **50%** in Sprint_plan.csv
2. Calculate estimated duration from TDD breakdown (sum of all phase estimates)
3. If `Planned Finish` column is empty, calculate and set it:
   - Read `Planned Start` from CSV
   - Add PERT-estimated duration (from TDD effort estimation)
   - Set `Planned Finish` = `Planned Start` + estimated duration (in business days)

**PERT Duration Calculation**:
```
PERT Estimate = (Optimistic + 4 * Most Likely + Pessimistic) / 6

Example: Estimate (O/M/P) = "120/240/480"
PERT = (120 + 4*240 + 480) / 6 = 260 minutes (~4.3 hours)
```

**Example CSV Update**:
```
# Before: Status=Spec Complete, Percent Complete=20, Planned Finish=
# After:  Status=Plan Complete, Percent Complete=50, Planned Finish=2026-02-03
```

### Requirements Flow (Documentação de Requisitos)
- Treat the plan as **Documentação de Requisitos**: derive steps/tests directly from the analyzed needs in the spec.
- **PRD/ADR Traceability (MANDATORY)**:
  1. Read the spec's `## Related Documents` section to get PRD/ADR paths
  2. Verify each file exists on disk — if missing, create it before proceeding
  3. Include PRD/ADR paths in the plan's "Files to Modify" section
  4. For PRDs: add a plan step to update PRD status from "Draft" to "In Progress"
  5. For ADRs with status "Proposed": add a plan step to update to "Accepted" after implementation validates the decision
  6. The Plan-Reviewer's category BB will verify this — missing PRD/ADR = REVISE verdict
- If an ADR or PRD is missing and was not created by spec-session, create the entry (stub if needed) and reference it in the plan before proceeding.

### How to Update Status

Use the Edit tool to update the Status column in `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`:

```
# Find the task row and change the Status column value
# Example: Change "Spec Complete" to "Planning" at session start
```

**This is MANDATORY** - failing to update status breaks workflow tracking and UI synchronization.
