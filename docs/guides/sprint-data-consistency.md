# Sprint Data Consistency Guide

## Overview

The IntelliFlow CRM project uses **Sprint_plan.csv** as the **Single Source of
Truth** for all task data. This guide explains how to maintain data consistency
and prevent synchronization issues.

## Validation Systems (Two Systems, Two Purposes)

We have **2 validation systems** that work together:

1. **`validation.yaml`** - Task completion validation (used by orchestrator)
   - **Purpose:** Determines if a task is actually DONE
   - **Validates:** Artifacts exist, commands succeed, criteria met
   - **Used by:** `orchestrator.sh` automation
   - **Example:** "ENV-001-AI is done when monorepo structure exists and builds
     pass"

2. **`sprint0-validation.ts`** - Infrastructure validation
   - **Purpose:** Confirms development environment is ready
   - **Validates:** Files, configs, tools, directories exist
   - **Used by:** `pnpm run validate:sprint0`
   - **Example:** "Check .eslintrc.js exists, Docker running, TypeScript
     configured"

**Note:** Data consistency (CSV ↔ JSON sync) is automatically validated by
`sync-metrics.ts` - no separate script needed!

## Architecture

```
Sprint_plan.csv (SOURCE OF TRUTH)
    ↓ (sync)
    ├── Sprint_plan.json (derived)
    ├── task-registry.json (derived)
    ├── sprint-0/_summary.json (derived)
    └── sprint-0/**/*.json (derived task files)
```

## Status Values

**Allowed CSV Status Values:**

- `Done` / `Completed` → JSON: `DONE`
- `In Progress` → JSON: `IN_PROGRESS`
- `Blocked` → JSON: `BLOCKED`
- `Planned` → JSON: `PLANNED`
- `Backlog` → JSON: `BACKLOG`

⚠️ **Any other status value will cause validation errors!**

## Workflows

### 1. Updating Task Status (Correct Way)

```bash
# Step 1: Edit the CSV file
# Edit apps/project-tracker/docs/metrics/_global/Sprint_plan.csv
# Change Status column to one of: Done, In Progress, Blocked, Planned, Backlog

# Step 2: Sync all derived files (includes automatic validation)
pnpm run sync:metrics

# Step 3: Commit if sync succeeds
git add apps/project-tracker/docs/metrics/
git commit -m "update: Sprint 0 task statuses"
```

### 2. Before Committing Sprint Changes

```bash
# Sync will automatically validate data consistency
pnpm run sync:metrics

# If you see warnings about orphaned files, delete them or add to CSV
# If you see errors, fix the CSV and run sync again
```

### 3. Recovering from Inconsistent Data

```bash
# If you have inconsistent data between CSV and JSON files:

# 1. Re-sync from CSV (includes validation)
pnpm run sync:metrics

# 2. Review changes
git diff apps/project-tracker/docs/metrics/

# 3. Commit synchronized data
git add apps/project-tracker/docs/metrics/
git commit -m "fix: synchronize Sprint metrics from CSV"
```

## Common Issues & Solutions

### Issue 1: Status Mismatch

**Error:**
`Task ENV-XXX: Status mismatch - CSV: "Backlog" → JSON should be: "BACKLOG" but got: "PLANNED"`

**Cause:** JSON files were updated manually or sync script had a bug.

**Solution:**

```bash
pnpm run sync:metrics
```

### Issue 2: Count Mismatch

**Error:** `_summary.json total (25) doesn't match CSV (27)`

**Cause:** \_summary.json was updated manually or tasks were added/removed from
CSV.

**Solution:**

```bash
pnpm run sync:metrics
```

### Issue 3: Invalid Status Value

**Error:**
`Task ENV-XXX: Invalid status "Work In Progress". Allowed: Done, Completed, In Progress, Blocked, Planned, Backlog`

**Cause:** Typo or non-standard status value in CSV.

**Solution:**

1. Open `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`
2. Find the task with invalid status
3. Change to one of the allowed values
4. Run `pnpm run sync:metrics`

### Issue 4: Missing JSON File

**Error:** `Missing JSON file for Sprint 0 task: ENV-XXX`

**Cause:** Task was added to CSV but JSON file wasn't created.

**Solution:**

```bash
# Create the missing file manually or run:
pnpm run sync:metrics
```

### Issue 5: Orphaned JSON File

**Warning:**
`Orphaned JSON file: .../ENV-XXX.json (task ENV-XXX not in CSV or not Sprint 0)`

**Cause:** Task was removed from CSV or moved to different sprint, but JSON file
remains.

**Solution:**

1. Verify task should be removed
2. Delete the orphaned JSON file
3. Or update CSV to include the task if it was accidentally removed

## Automation Safeguards

### Automatic Validation in Sync

The `sync-metrics.ts` script automatically validates data after syncing:

- Detects orphaned JSON files (not in CSV)
- Warns about inconsistencies
- Fails if critical errors found
- No separate validation command needed!

## Best Practices

### ✅ DO

- Always edit `Sprint_plan.csv` first
- Run `sync:metrics` after CSV changes
- Run `validate:sprint-data` before committing
- Use exact status values (case-sensitive)
- Keep CSV as single source of truth

### ❌ DON'T

- Manually edit JSON files in `sprint-0/`
- Edit `_summary.json` manually
- Edit `task-registry.json` manually
- Use custom status values
- Commit without validation

## Sync Script Details

**Location:** `apps/project-tracker/scripts/sync-metrics.ts`

**What it does:**

1. Syncs all JSON files from CSV (Single Source of Truth)
2. Automatically validates data consistency
3. Detects orphaned files (warns but doesn't fail)
4. Updates task-registry.json, \_summary.json, phase summaries

**Exit Codes:**

- `0`: Sync and validation passed
- `1`: Sync or validation failed

## Scripts Reference

| Script                               | Purpose                                 | When to Use                 |
| ------------------------------------ | --------------------------------------- | --------------------------- |
| `pnpm run sync:metrics`              | Sync all JSON files from CSV + validate | After editing CSV (always!) |
| `pnpm run validate:sprint0`          | Validate infrastructure setup           | Environment checks          |
| `./orchestrator.sh validate TASK-ID` | Check if task is DONE                   | Task completion checks      |

## File Locations

```
apps/project-tracker/
├── docs/metrics/
│   ├── _global/
│   │   ├── Sprint_plan.csv          ← SOURCE OF TRUTH
│   │   ├── Sprint_plan.json         ← Derived (do not edit)
│   │   └── task-registry.json       ← Derived (do not edit)
│   └── sprint-0/
│       ├── _summary.json            ← Derived (do not edit)
│       └── phase-*/
│           └── *.json               ← Derived (do not edit)
├── lib/
│   └── data-sync.ts                 ← Sync logic
└── scripts/
    └── sync-metrics.ts              ← Sync script

tools/scripts/
└── validate-sprint-data.ts          ← Validation script
```

## Troubleshooting

### Sync script fails

```bash
# Check if running from correct directory
cd apps/project-tracker
npx tsx scripts/sync-metrics.ts

# Or use root command
pnpm run sync:metrics
```

### Validation script fails

```bash
# Run with verbose output
tsx tools/scripts/validate-sprint-data.ts

# Check specific issues
pnpm run validate:sprint-data
```

### Pre-commit hook blocked my commit

```bash
# Fix the issues
pnpm run sync:metrics
pnpm run validate:sprint-data

# Try commit again
git commit -m "your message"
```

## Support

If you encounter issues not covered here:

1. Check recent changes: `git log apps/project-tracker/docs/metrics/`
2. Review validation output carefully
3. Ensure you're using allowed status values
4. Run sync script and validate again
5. Check this documentation for updates

## Version History

- **v1.0** (2025-12-15): Initial data consistency framework
  - Added BACKLOG status support
  - Created validation script
  - Added CI workflow
  - Documented workflows
