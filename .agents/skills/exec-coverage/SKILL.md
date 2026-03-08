---
name: exec-coverage
description: Captures test coverage BEFORE and AFTER implementation to show task impact. Sub-skill of /exec called at Phase 1.5 (before) and Phase 3 (after). Coverage data is stored in artifacts/coverage/coverage-summary.json and loaded automatically by the validation-summary API.
---

# Exec Coverage — Before/After Coverage Tracking

**Called by**: `/exec` Phase 1.5 (before) and Phase 3 (after)
**Can also run standalone**: Yes — to capture or recapture coverage snapshots

## Coverage Workflow

```
PHASE 1 (BEFORE): Run tests → parse coverage → store baseline
           ↓
PHASE 2: TDD Implementation (RED → GREEN → REFACTOR)
           ↓
PHASE 3 (AFTER): Run tests → parse coverage → compare with baseline
```

## Package Mapping

| Task Pattern | Package | Filter |
|---|---|---|
| `IFC-085`, `IFC-005`, `IFC-155`, `AI-SETUP-*` | `apps/ai-worker` | `@intelliflow/ai-worker` |
| `IFC-003`, `IFC-004` | `apps/api` | `@intelliflow/api` |
| `PG-*`, `IFC-090`, `IFC-091` | `apps/web` | `@intelliflow/web` |

To update mappings, edit `TASK_PACKAGE_MAP` in:
`apps/project-tracker/app/api/tasks/validation-summary/[taskId]/route.ts`

## Coverage Impact Rules

| Delta | Status | Action |
|---|---|---|
| Positive | GOOD | Coverage improved, proceed |
| Zero | OK | No regression, proceed |
| Negative | WARN | Coverage decreased, document reason |
| Large negative (>5%) | BLOCK | Significant regression, fix before completing |

## Important Note on Attestation

`coverage_metrics` is NOT a valid attestation schema field. Coverage data is loaded separately by the validation-summary API from `artifacts/coverage/coverage-summary.json`. Include coverage highlights in the attestation `notes` field instead.

**See references/coverage-process.md** for detailed before/after commands, display formats, and API support details.

## Related Skills

- `/exec` — parent skill
- `/exec-gates` Gate 7 — Coverage Measurement gate (separate from this; Gate 7 uses scoped coverage, this tracks package-wide before/after)
