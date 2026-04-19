# Spec Session — Output Format

## Output Paths

```
.specify/sprints/sprint-{N}/
├── context/<TASK_ID>/
│   ├── <TASK_ID>-hydrated-context.json
│   ├── <TASK_ID>-hydrated-context.md
│   └── <TASK_ID>-agent-selection.json
└── specifications/
    ├── <TASK_ID>-spec.md           # Unified specification
    └── <TASK_ID>-discussion.md     # Full agent discussion log
```

Where `{N}` is the task's Target Sprint from Sprint_plan.csv.

## Specification Document Structure

```markdown
# Specification: <TASK_ID>

## Overview

## Related Documents

## Technical Approach

## Components

## Interfaces & Contracts

## Integration Points

## Runtime Wiring & Replacement Paths

## Navigation & Reachability (UI tasks)

## Acceptance Criteria

## Test Requirements

## Risks & Mitigations

## Agent Sign-offs
```

### Related Documents Section (MANDATORY)

Every spec MUST include this section, populated during Phase 0.97:

```markdown
## Related Documents

| Type | Path                                      | Status            | Action                     |
| ---- | ----------------------------------------- | ----------------- | -------------------------- |
| PRD  | `docs/planning/prd-<area>.md`             | Draft/Updated     | Created/Updated/Referenced |
| ADR  | `docs/architecture/adr/ADR-NNN-<slug>.md` | Proposed/Accepted | Created/Updated/Referenced |
```

If PRD or ADR is not applicable, include the row with `N/A` and reason:

```markdown
| PRD | N/A | — | Infrastructure task, no user-facing feature |
```

This section enables downstream traceability: plan-session reads it to include
PRD/ADR paths in plan files, exec verifies the documents exist, and
compliance-check validates them at completion.

### Runtime Wiring & Replacement Paths Section (MANDATORY when behavior changes)

If the task adds, replaces, or hardens a runtime behavior, the spec MUST
include:

```markdown
## Runtime Wiring & Replacement Paths

| Surface           | Must Be Called By          | Replaces / Blocks           | Notes                                       |
| ----------------- | -------------------------- | --------------------------- | ------------------------------------------- |
| `auth.resolveSso` | `SsoEntryForm` submit flow | direct client config lookup | Client path must stop bypassing server path |
```

Rules:

- Every new route, procedure, server action, handler, hook, or shared helper
  must name at least one production caller
- If the task replaces an existing path, name the old path explicitly so exec
  can verify it was retired or bypassed
- If no runtime behavior changes, include `N/A` with a reason

### Generate Specification

Compile contributions from all agents across all rounds into unified spec with:

- Acceptance criteria (labeled AC-001, AC-002, etc.)
- Non-functional requirements (labeled NF-001, NF-002, etc.)
- Navigation entry (sidebar config file, key, icon, label) — for UI tasks
- Route path and layout wrapper — for UI tasks
- Parent/sibling pages that link to it — for UI tasks
- Runtime wiring requirements (production caller + replaced path, when
  applicable)
- Test requirements (labeled with expected new test file paths AND existing
  regression suites to rerun)
- Security-sensitive test requirements must include at least one negative-path
  assertion
- Risks with mitigations
- Agent sign-offs confirming files reviewed
