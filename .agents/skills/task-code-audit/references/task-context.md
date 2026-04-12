# Task Context

Use the workflow artifacts to understand what the task intended to change, but
always treat the codebase as ground truth.

## Artifact Roles

| Artifact      | Canonical path                                                                   | Use it for                                                                          | Do not treat it as                           |
| ------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------- |
| Task row      | `apps/project-tracker/docs/metrics/_global/Sprint_plan_*.csv`                    | Sprint number, description, dependencies, artifacts, validation method              | Proof that the code is correct               |
| Spec          | `.specify/sprints/sprint-{N}/specifications/{TASK_ID}-spec.md`                   | Acceptance criteria, invariants, runtime intent, negative paths, integration points | Proof that the implementation matches intent |
| Plan          | `.specify/sprints/sprint-{N}/planning/{TASK_ID}-plan.md`                         | Exact files, RED/GREEN steps, expected runtime wiring, affected regressions         | Proof that every checkbox reflects real code |
| Exec delivery | `.specify/sprints/sprint-{N}/execution/{TASK_ID}/{RUN_ID}/{TASK_ID}-delivery.md` | Claimed implementation summary, files touched, claimed validations                  | Proof that the code really behaves that way  |
| Attestation   | `.specify/sprints/sprint-{N}/attestations/{TASK_ID}/attestation.json`            | Supporting evidence, context pack, run metadata                                     | A substitute for reading the code            |

## Resolve the Task Row

Do not read the full `Sprint_plan.csv` directly. Search the split files:

```powershell
rg -n "<TASK_ID>" apps/project-tracker/docs/metrics/_global/Sprint_plan_*.csv
```

Extract at least:

- `Task ID`
- `Description`
- `Dependencies`
- `Status`
- `Target Sprint`
- `Artifacts To Track`
- `Validation Method`

## Load Artifacts in This Order

1. Task row from the split sprint-plan file
2. Spec for expected behavior and integration points
3. Plan for exact files, runtime wiring, and validation scope
4. Latest exec delivery report, if present
5. Attestation or context pack, if present
6. Real implementation and related tests

If spec or plan is missing, continue with a code-first audit and state the
missing context as a limitation.

## What to Extract

### From the spec

- Acceptance criteria
- Claimed business rules and invariants
- Explicit runtime caller or integration point
- Declared out-of-scope items
- Performance or security expectations

### From the plan

- Exact files to create or modify
- Steps that replace a legacy path or add a new runtime path
- Validation matrix and directly affected regression suites
- Layer boundaries the task is supposed to respect

### From exec artifacts

- Claimed files changed
- Claimed tests and validations
- Claimed completion gates
- Delivery statements that can be checked against runtime code

## Translate Artifacts Into Code Scope

Start with plan and delivery paths, then expand to:

- Direct callers and callees
- Zod validators and DTO schemas
- Domain entities, application services, adapters, or Prisma queries touched by
  the feature
- Router, server action, or page/component entrypoints that expose the behavior
- Related tests that should fail if the behavior regresses

Prefer real runtime wiring over isolated helpers. If a task claims a new route,
service, or component but the production caller still bypasses it, treat that as
a likely defect.

## Conflict Resolution

- Spec and plan define intended behavior.
- Delivery and attestation define claimed behavior.
- Code and tests define actual behavior.

When they conflict:

1. Trust actual runtime behavior over delivery claims.
2. Use spec and plan to explain why the mismatch matters.
3. Record any remaining uncertainty as an open question.
