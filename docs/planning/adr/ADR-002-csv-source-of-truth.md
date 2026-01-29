# ADR-002: CSV as Single Source of Truth for Plan Governance

**Status:** Accepted

**Date:** 2025-12-17

**Deciders:** Architecture Team, Delivery Lead

**Technical Story:** IFC-160, AUTOMATION-001

## Context and Problem Statement

The IntelliFlow project uses `Sprint_plan.csv` to track 303 tasks across 34
sprints. We need a governance system to validate plan integrity, track technical
debt, and ensure sprint-scoped dependencies are correct. Should we migrate to a
database, use an external tool like Jira, or keep CSV as the source of truth
with tooling around it?

## Decision Drivers

- Human-readable and git-diffable format
- Works offline and with any text editor
- No external dependencies or service costs
- Must support schema evolution (adding columns)
- Must prevent AI fabrication of progress
- Must be auditable with SHA256 hashes
- Must support sprint-scoped validation

## Considered Options

- **Option 1**: CSV with Python governance tooling
- **Option 2**: SQLite database with migrations
- **Option 3**: Jira/Linear integration
- **Option 4**: JSON files only

## Decision Outcome

Chosen option: "CSV with Python governance tooling", because it maintains human
readability, requires no external services, supports schema evolution via
append-only columns, and works perfectly with git for audit trails.

### Positive Consequences

- Human-readable diffs in pull requests
- No external service dependencies
- Works offline during development
- Easy to edit in any spreadsheet tool
- Schema evolution via non-breaking column additions
- Git provides complete audit history
- SHA256 hashes prevent fabrication

### Negative Consequences

- No relational queries (must build in Python)
- CSV parsing edge cases (commas, quotes)
- No concurrent write safety
- Must maintain Python tooling

## Pros and Cons of the Options

### CSV with Python Tooling

- Good, because it's human-readable and git-diffable
- Good, because it works with Excel/Google Sheets
- Good, because schema changes are append-only (safe)
- Good, because no external dependencies
- Good, because it supports offline editing
- Bad, because relational queries must be built in Python
- Bad, because CSV has edge cases with special characters

### SQLite Database

- Good, because it has SQL query support
- Good, because it's single-file and portable
- Good, because it has ACID transactions
- Bad, because it's not human-readable
- Bad, because schema migrations are harder
- Bad, because git diffs are meaningless

### Jira/Linear Integration

- Good, because it's designed for task tracking
- Good, because it has built-in workflows
- Good, because it supports concurrent access
- Bad, because it's an external dependency
- Bad, because it costs money
- Bad, because it's harder to automate
- Bad, because data export is limited

### JSON Files Only

- Good, because it's structured and typed
- Good, because it's widely supported
- Bad, because it's harder for humans to edit
- Bad, because git diffs are verbose
- Bad, because spreadsheet tools don't support it

## Links

- [Sprint Plan Location](../../../apps/project-tracker/docs/metrics/_global/Sprint_plan.csv)
- [Data Sync Documentation](../../../apps/project-tracker/docs/DATA_SYNC.md)
- [Metrics Infrastructure](../../../apps/project-tracker/docs/metrics/README.md)
- Related: ADR-003 Sprint-Scoped Validation

## Implementation Notes

### CSV Schema v2 Columns

The governance tooling adds these columns (if missing):

| Column            | Type   | Default | Description                     |
| ----------------- | ------ | ------- | ------------------------------- |
| Tier              | A/B/C  | C       | Task importance tier            |
| Gate Profile      | string | none    | Validation gates required       |
| Evidence Required | string | -       | Artifacts needed for completion |
| Acceptance Owner  | string | -       | Who signs off on completion     |

### Migration Command

```bash
cd tools/plan
python -m src.adapters.cli migrate --dry-run  # Preview
python -m src.adapters.cli migrate            # Execute
```

### Validation Criteria

- [x] CSV remains human-readable after migration
- [x] Git diff shows only new columns
- [x] Backup created before migration
- [x] Existing data preserved
- [x] Tests written for migration
- [x] Documentation updated

### Rollback Plan

1. Restore from `.csv.bak` backup file
2. Git revert the migration commit
3. Remove governance columns manually if needed
