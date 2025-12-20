# Validation Scripts Guide

This document describes the validation scripts used in the IntelliFlow CRM
monorepo for Sprint 0 governance.

## Overview

The validation system consists of two complementary scripts:

| Script                 | Purpose                                    | Command                         |
| ---------------------- | ------------------------------------------ | ------------------------------- |
| `validate:sprint0`     | Structure, completion, hygiene, uniqueness | `pnpm run validate:sprint0`     |
| `validate:sprint-data` | CSV/JSON data consistency                  | `pnpm run validate:sprint-data` |

## Quick Start

```bash
# Run both validators (default mode - warnings don't fail)
pnpm run validate:sprint0
pnpm run validate:sprint-data

# Run in strict mode (warnings become failures)
pnpm run validate:sprint0 --strict
pnpm run validate:sprint-data --strict

# Or via environment variable
VALIDATION_STRICT=1 pnpm run validate:sprint0
```

## Sprint 0 Validation (`validate:sprint0`)

Validates Sprint 0 readiness across multiple gates.

### Gates

#### Gate 1: Baseline Structure

Checks that essential files and directories exist:

- Monorepo files: `package.json`, `pnpm-workspace.yaml`, `turbo.json`
- Directories: `apps/`, `packages/`, `tests/`, `artifacts/`
- Configuration: `tsconfig.json`, `vitest.config.ts`, `playwright.config.ts`
- Core packages: `packages/domain`, `packages/validators`, `packages/db`
- Sprint tracking: `apps/project-tracker/docs/metrics/sprint-0`

**Severity**: FAIL if missing

#### Gate 2: Sprint 0 Completion

Checks if all Sprint 0 tasks in `Sprint_plan.csv` are Done/Completed.

**Severity**:

- WARN if incomplete (default mode - exit 0)
- FAIL if incomplete (strict mode - exit 1)

#### Gate 3: Docs Hygiene

Detects ignored/untracked runtime artifacts in forbidden docs areas:

- `apps/project-tracker/docs/artifacts/**`
- `apps/project-tracker/docs/metrics/**` where subpaths include: `.locks/`,
  `.status/`, `logs/`, `backups/`, `artifacts/`
- Uses `git ls-files -o -i --exclude-standard apps/project-tracker/docs` for
  detection
- Default allowlist: `apps/project-tracker/docs/.specify/`
- Optional allowlist config: `tools/scripts/hygiene-allowlist.json` (JSON
  `string[]` or `{ "allowlist": string[] }`)

**Severity**: WARN (default) / FAIL (strict)

#### Gate 4: Canonical Uniqueness

Ensures source-of-truth files exist exactly once in tracked files:

- `Sprint_plan.csv`
- `Sprint_plan.json`
- `task-registry.json`
- `dependency-graph.json`

**Severity**:

- PASS: Exactly one tracked copy found
- FAIL: Missing or duplicates (count != 1)

### Output Example

```
======================================================================
IntelliFlow CRM - Sprint 0 Validation
======================================================================

Mode: DEFAULT
Repo: C:\taly\intelliFlow-CRM

Gate 1: Baseline Structure
[PASS] Baseline: Root package.json: Exists
[PASS] Baseline: pnpm-workspace.yaml: Exists
...

Gate 2: Sprint 0 Completion
[WARN] Sprint Completion: 5/27 tasks NOT complete
       Total Sprint 0 tasks: 27
       Completed: 22
       Incomplete: 5

Gate 3: Docs Hygiene (no runtime artifacts)
[PASS] Docs Hygiene: No runtime artifacts found under docs/

Gate 4: Canonical Uniqueness
[PASS] Uniqueness: Sprint_plan.csv: Exactly one copy found

----------------------------------------------------------------------
Validation Summary
----------------------------------------------------------------------
Mode: DEFAULT
PASS: 24
WARN: 1
FAIL: 0
----------------------------------------------------------------------

[OK] Sprint 0 baseline validations passed (with warnings).
     Run with --strict to treat warnings as failures.
```

## Sprint Data Validation (`validate:sprint-data`)

Validates data consistency between `Sprint_plan.csv` and JSON task files.

### Gates

#### Gate 1: CSV Structure

- Checks for duplicate Task IDs
- Validates status values against allowed list: `Done`, `Completed`,
  `In Progress`, `Blocked`, `Planned`, `Backlog`

**Severity**: FAIL if invalid

#### Gate 2: Sprint 0 Task Counts

- Counts tasks by status in CSV
- Compares counts with `_summary.json`
- Reports any mismatches

**Severity**: WARN if counts mismatch

#### Gate 3: JSON File Consistency

- **Orphaned Files**: JSON files with task_ids not in CSV
- **Missing Files**: Sprint 0 tasks without corresponding JSON files
- **Status Mismatches**: JSON status != expected status from CSV

**Severity**: WARN for inconsistencies

### Output Example

```
======================================================================
IntelliFlow CRM - Sprint Data Validation
======================================================================

Mode: DEFAULT
Repo: C:\taly\intelliFlow-CRM

Resolved paths:
  CSV: C:\taly\intelliFlow-CRM\apps\project-tracker\docs\metrics\_global\Sprint_plan.csv
  Metrics: C:\taly\intelliFlow-CRM\apps\project-tracker\docs\metrics

Parsed 303 tasks from CSV

Gate 1: CSV Structure
[PASS] CSV: Task ID Uniqueness: All 303 Task IDs are unique
[PASS] CSV: Status Values: All status values are valid

Gate 2: Sprint 0 Task Counts
   Sprint 0 tasks: 27
   - Completed: 22
   - In Progress: 3
   - Planned: 2
[PASS] Summary: Count Consistency: _summary.json counts match CSV

Gate 3: JSON File Consistency
   Found 27 task JSON files
[PASS] JSON: Orphaned Files: No orphaned JSON files
[PASS] JSON: Missing Files: All Sprint 0 tasks have JSON files
[PASS] JSON: Status Consistency: All JSON statuses match CSV

----------------------------------------------------------------------
Validation Summary
----------------------------------------------------------------------
PASS: 6
WARN: 0
FAIL: 0

[OK] Sprint data consistency checks passed.

Note: This validates DATA CONSISTENCY only. It does NOT:
      - Verify sprint completion (use validate:sprint0 for that)
      - Run tests or code quality checks
```

## Strict Mode

Strict mode treats all WARNINGs as FAILUREs, causing exit code 1.

### Enabling Strict Mode

```bash
# Via CLI flag
pnpm run validate:sprint0 --strict
pnpm run validate:sprint0 -s

# Via environment variable
VALIDATION_STRICT=1 pnpm run validate:sprint0
VALIDATION_STRICT=true pnpm run validate:sprint0
```

### Use Cases

| Scenario          | Mode                       |
| ----------------- | -------------------------- |
| Local development | Default (allow warnings)   |
| CI/CD pipeline    | Strict (fail on warnings)  |
| Pre-commit hook   | Default (quick feedback)   |
| Release gate      | Strict (enforce all rules) |

## Exit Codes

| Code | Default Mode           | Strict Mode      |
| ---- | ---------------------- | ---------------- |
| 0    | All PASS, or PASS+WARN | All PASS only    |
| 1    | Any FAIL               | Any FAIL or WARN |

## CSV Path Resolution

Both scripts resolve `Sprint_plan.csv` using this priority:

1. `SPRINT_PLAN_PATH` environment variable (absolute or repo-relative)
2. `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv` (canonical)
3. `Sprint_plan.csv` at repo root (fallback)

```bash
# Override CSV location
SPRINT_PLAN_PATH=/custom/path/Sprint_plan.csv pnpm run validate:sprint0
```

## Fixing Issues

### Sprint Completion Issues

If Sprint 0 tasks are incomplete:

1. Review incomplete tasks in `Sprint_plan.csv`
2. Complete the work or update status appropriately
3. Re-run validation

### Hygiene Violations

If runtime artifacts are found under docs:

```bash
# Run migration script to move files
pwsh -File tools/scripts/migrate-runtime-artifacts.ps1

# Or manually move files to artifacts/
```

### Data Sync Issues

If JSON counts don't match CSV:

```bash
# Sync all JSON files from CSV
cd apps/project-tracker && npx tsx scripts/sync-metrics.ts
```

### Uniqueness Violations

If multiple copies of canonical files exist:

1. Identify all locations: `git ls-files | grep Sprint_plan.csv`
2. Keep only the canonical location
3. Delete or rename duplicates
4. Update any hardcoded paths

## Testing

Run the validation test suite:

```bash
pnpm vitest run tools/scripts/lib/validation-utils.test.ts
```

The test suite covers:

- Strict mode detection (CLI flag, env var)
- Severity promotion (WARN -> FAIL in strict)
- CSV parsing (BOM, quotes, missing headers)
- Sprint completion logic
- Hygiene allowlist matching
- Summary and exit code calculation
- Negative tests (expected failures)

## Architecture

```
tools/scripts/
├── lib/
│   ├── validation-utils.ts      # Shared utilities
│   └── validation-utils.test.ts # Unit tests
├── sprint0-validation.ts        # Sprint 0 validator
└── validate-sprint-data.ts      # Data consistency validator
```

### Key Functions

| Function                        | Purpose                                       |
| ------------------------------- | --------------------------------------------- |
| `isStrictMode()`                | Detect --strict flag or VALIDATION_STRICT env |
| `effectiveSeverity()`           | Promote WARN to FAIL in strict mode           |
| `resolveSprintPlanPath()`       | Find Sprint_plan.csv with priority            |
| `parseSprintCsv()`              | Parse CSV with BOM/quote handling             |
| `checkSprintCompletion()`       | Count Done/Completed vs total                 |
| `findIgnoredRuntimeArtifacts()` | Git-based hygiene detection                   |
| `checkCanonicalUniqueness()`    | Ensure single source-of-truth                 |
| `createSummary()`               | Aggregate gate results                        |
| `getExitCode()`                 | Determine exit code from summary              |
