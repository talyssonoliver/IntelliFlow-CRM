# Runtime Path Linter - Policy Documentation

## Overview

The **Runtime Path Linter** prevents artifact hygiene regressions by enforcing strict policies on where files can be located in the repository. It detects:

- Files in **forbidden paths** (including git-ignored files)
- **Duplicate canonical files** (Sprint_plan.csv, task-registry.json, etc.)
- **Policy-pending violations** with approaching deadlines
- **Local vs CI enforcement** modes (WARN locally, FAIL in CI)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Runtime Path Linter                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐      ┌──────────────┐                    │
│  │   Policy     │─────▶│   Linter     │                    │
│  │   YAML       │      │   Engine     │                    │
│  └──────────────┘      └──────┬───────┘                    │
│                                │                            │
│                                ▼                            │
│  ┌──────────────────────────────────────────┐              │
│  │         File Detection Layer              │              │
│  │  • git ls-files (tracked)                │              │
│  │  • git ls-files -o -i (ignored)          │              │
│  │  • git ls-files -o (untracked)           │              │
│  │  • git diff (PR mode)                    │              │
│  └──────────────┬───────────────────────────┘              │
│                 │                                           │
│                 ▼                                           │
│  ┌──────────────────────────────────────────┐              │
│  │         Validation Rules                 │              │
│  │  • Forbidden path detection              │              │
│  │  • Canonical file verification           │              │
│  │  • Duplicate detection                   │              │
│  │  • Policy-pending enforcement            │              │
│  └──────────────┬───────────────────────────┘              │
│                 │                                           │
│                 ▼                                           │
│  ┌──────────────────────────────────────────┐              │
│  │         Reporting Layer                  │              │
│  │  • Console output                        │              │
│  │  • JSON report                           │              │
│  │  • Markdown summary                      │              │
│  │  • GitHub PR comments                    │              │
│  └──────────────────────────────────────────┘              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Policy Structure

### 1. Canonical Files

Files that **MUST** have exactly one copy:

```yaml
canonical:
  - path: 'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv'
    description: 'Single source of truth for all sprint tasks'
    referenced_by:
      - 'apps/project-tracker/app/api/sprint-plan/route.ts'
      - 'tools/plan-linter/index.js'
```

**Violations:**
- ❌ Multiple copies detected → ERROR
- ❌ Canonical file missing (strict mode) → ERROR

### 2. Forbidden Paths

Patterns that **MUST NOT** exist anywhere:

```yaml
forbidden:
  - pattern: '/*.json'
    exceptions: ['package.json', 'tsconfig.json']
    severity: 'error'
    message: 'Root-level JSON files are forbidden'
    fix: 'Move to artifacts/misc/ or delete'
```

**Examples:**
- ❌ `Sprint_plan_backup.csv` (root level)
- ❌ `apps/project-tracker/docs/metrics/logs/build.log`
- ❌ `src/debug.log`
- ✅ `artifacts/logs/build.log`

### 3. Policy Pending (Migration in Progress)

Transitional rules with deadlines:

```yaml
policy_pending:
  - pattern: 'apps/project-tracker/docs/artifacts/**/*'
    deadline: '2025-01-15'
    severity_local: 'warning'  # Local: WARN
    severity_ci: 'error'        # CI: FAIL
    reason: 'Migration from docs/artifacts to artifacts/ in progress'
```

**Enforcement:**
- **Local mode**: Shows warning
- **CI mode**: Fails build
- **Expired deadline**: Always fails (strict mode)

### 4. Allowed Patterns

Explicitly permitted locations:

```yaml
allowed:
  - pattern: 'artifacts/logs/**/*'
    description: 'Application and build logs'

  - pattern: 'apps/project-tracker/docs/metrics/sprint-*/**/*.json'
    description: 'Sprint-specific task and phase metrics'
    exclude_patterns:
      - '**/*.lock'
      - '**/*.bak'
```

### 5. Duplicate Rules

Files that must be unique:

```yaml
duplicate_rules:
  - filename: 'Sprint_plan.csv'
    max_copies: 1
    canonical_path: 'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv'
    severity: 'error'
```

## Enforcement Modes

### Local Mode (Default)

```bash
pnpm tsx tools/audit/runtime-path-linter.ts
```

**Behavior:**
- Scans tracked files only
- `policy_pending` → WARNING
- Warnings don't fail
- Outputs to console

### Strict Mode (CI)

```bash
pnpm tsx tools/audit/runtime-path-linter.ts --strict
```

**Behavior:**
- Scans tracked + ignored files (drift detection)
- `policy_pending` → ERROR
- Expired deadlines → ERROR
- Canonical files must exist
- Duplicates always fail

**Triggers:**
- `--strict` flag
- `CI=true` environment variable
- `STRICT_VALIDATION=true` environment variable

## Usage

### CLI

```bash
# Basic lint (local mode)
pnpm tsx tools/audit/runtime-path-linter.ts

# Strict mode (CI)
pnpm tsx tools/audit/runtime-path-linter.ts --strict

# Generate JSON report
pnpm tsx tools/audit/runtime-path-linter.ts --format=json

# Generate markdown summary
pnpm tsx tools/audit/runtime-path-linter.ts --format=markdown

# Generate all reports
pnpm tsx tools/audit/runtime-path-linter.ts --format=all

# Verbose output
pnpm tsx tools/audit/runtime-path-linter.ts --verbose
```

### GitHub Actions

The linter runs automatically in CI:

```yaml
# .github/workflows/runtime-path-lint.yml
- name: Run runtime path linter
  env:
    CI: 'true'
    STRICT_VALIDATION: 'true'
  run: pnpm tsx tools/audit/runtime-path-linter.ts --strict --format=all
```

**Triggers:**
- Pull requests to `main` or `develop`
- Pushes to `main` or `develop`
- Manual workflow dispatch

## Detection Methods

### 1. Tracked Files

```bash
git ls-files
```

All files committed to the repository.

### 2. Ignored Files (Drift Detection)

```bash
git ls-files -o -i --exclude-standard
```

Files matching `.gitignore` patterns. Scanned in **strict mode only** to detect:
- Forbidden files that should never exist (even if ignored)
- Runtime artifacts that leaked into tracked locations

### 3. Untracked Files

```bash
git ls-files -o --exclude-standard
```

New files not yet committed or ignored.

### 4. PR Mode (Changed Files Only)

```bash
git diff --name-only origin/main...HEAD
```

Only scans files changed in the PR (reduces noise).

## Output Formats

### Console

```
🔍 Runtime Artifact Path Linter
Policy: tools/audit/policies/runtime-path-policy.yml
Mode: STRICT (CI)

Scanning 1523 files...

================================================================================
RESULTS
================================================================================

ERRORS (3)

  ✗ Sprint_plan_backup.csv
    [forbidden-path] Root-level CSV files are forbidden
    Fix: Move to artifacts/metrics/ or appropriate directory

  ✗ apps/project-tracker/docs/metrics/.locks/task-123.lock
    [forbidden-path] Lock files in docs/metrics are forbidden
    Fix: Delete - runtime-only files should not be tracked

  ✗ Sprint_plan.csv (duplicate)
    [duplicate-violation] Multiple Sprint_plan.csv files detected
    Fix: Delete duplicate - canonical copy is at apps/project-tracker/docs/metrics/_global/Sprint_plan.csv

Statistics:
  Files scanned: 1523
  Forbidden violations: 2
  Duplicate violations: 1
  Errors: 3
  Warnings: 0

✗ Linting failed with 3 error(s)
```

### JSON Report

```json
{
  "meta": {
    "generated_at": "2025-12-21T12:34:56.789Z",
    "schema_version": "1.0.0",
    "mode": "strict",
    "policy_file": "tools/audit/policies/runtime-path-policy.yml"
  },
  "result": {
    "passed": false,
    "violations": [
      {
        "file": "Sprint_plan_backup.csv",
        "rule": "forbidden-path",
        "severity": "error",
        "message": "Root-level CSV files are forbidden",
        "fix": "Move to artifacts/metrics/ or appropriate directory",
        "pattern": "/*.csv"
      }
    ],
    "stats": {
      "total_files_scanned": 1523,
      "forbidden_violations": 2,
      "duplicate_violations": 1,
      "errors": 3,
      "warnings": 0
    }
  }
}
```

### Markdown Summary

```markdown
# Runtime Path Lint Report

**Generated:** 2025-12-21T12:34:56.789Z
**Mode:** STRICT (CI)
**Status:** ✗ FAILED

## Summary

| Metric | Value |
|--------|-------|
| Files Scanned | 1523 |
| Errors | 3 |
| Warnings | 0 |
| Forbidden Violations | 2 |
| Duplicate Violations | 1 |

## Violations

### Errors

- **Sprint_plan_backup.csv**
  - Rule: `forbidden-path`
  - Message: Root-level CSV files are forbidden
  - Fix: Move to artifacts/metrics/ or appropriate directory
```

## Common Violations & Fixes

### 1. Root-Level Artifacts

**Problem:**
```
✗ debug.log
  [forbidden-path] Root-level log files are forbidden
```

**Fix:**
```bash
# Move to artifacts
mkdir -p artifacts/logs
mv debug.log artifacts/logs/

# Or add to .gitignore if runtime-generated
echo "debug.log" >> .gitignore
git rm --cached debug.log
```

### 2. Runtime Artifacts in docs/metrics

**Problem:**
```
✗ apps/project-tracker/docs/metrics/.locks/task-123.lock
  [forbidden-path] Lock files in docs/metrics are forbidden
```

**Fix:**
```bash
# Delete runtime artifacts
rm -rf apps/project-tracker/docs/metrics/.locks

# Add to .gitignore
echo "apps/project-tracker/docs/metrics/.locks" >> .gitignore
```

### 3. Duplicate Canonical Files

**Problem:**
```
✗ Sprint_plan.csv (duplicate)
  [duplicate-violation] Multiple Sprint_plan.csv detected
```

**Fix:**
```bash
# Keep only canonical copy
rm Sprint_plan.csv
rm backups/Sprint_plan.csv

# Canonical location (DON'T delete this!)
# apps/project-tracker/docs/metrics/_global/Sprint_plan.csv
```

### 4. Policy Pending (Migration)

**Problem:**
```
⚠ apps/project-tracker/docs/artifacts/test.json
  [policy-pending] Runtime artifacts in docs/ are deprecated (Deadline: 2025-01-15, 25 days remaining)
```

**Fix:**
```bash
# Run migration script
pnpm tsx tools/audit/migrate-artifacts.ts

# Or manually move
mkdir -p artifacts/misc
mv apps/project-tracker/docs/artifacts/test.json artifacts/misc/
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success - no violations |
| 1 | Forbidden path violation or duplicate |
| 2 | Canonical file missing |
| 3 | Policy pending expired |
| 4 | Parse error or config error |

## Integration with CI

### Pre-Commit Hook

```bash
# .husky/pre-commit
#!/bin/sh

# Skip if environment variable set
if [ "$SKIP_RUNTIME_PATH_LINT" = "true" ]; then
  exit 0
fi

# Run linter (local mode)
pnpm tsx tools/audit/runtime-path-linter.ts
```

### GitHub Actions

```yaml
# .github/workflows/runtime-path-lint.yml
- name: Run runtime path linter
  env:
    CI: 'true'
  run: pnpm tsx tools/audit/runtime-path-linter.ts --strict
```

## Maintenance

### Adding New Forbidden Patterns

1. Edit `tools/audit/policies/runtime-path-policy.yml`
2. Add to `forbidden` section:

```yaml
forbidden:
  - pattern: 'new-pattern/**/*.ext'
    exceptions: []
    severity: 'error'
    message: 'Description of why forbidden'
    fix: 'How to fix the violation'
```

3. Run linter to test:

```bash
pnpm tsx tools/audit/runtime-path-linter.ts --strict
```

### Adding Policy Pending Items

For gradual migrations:

```yaml
policy_pending:
  - pattern: 'old-location/**/*'
    deadline: '2025-03-01'
    severity_local: 'warning'
    severity_ci: 'error'
    reason: 'Migration in progress'
    migration_target: 'new-location/'
    responsible: 'DevOps Engineer'
    message: 'Files are deprecated'
    fix: 'Run migration script'
```

**Timeline:**
1. **Week 1**: Add to `policy_pending` with warning
2. **Week 2-4**: Team migrates files
3. **Week 4**: Deadline passes → CI fails
4. **Week 5**: Move to `forbidden` section

### Extending the Linter

The linter is designed for extensibility:

```typescript
// tools/audit/runtime-path-linter.ts

class RuntimePathLinter {
  // Add custom check
  private checkCustomRule(files: string[]): void {
    for (const file of files) {
      // Custom logic
      if (violatesCustomRule(file)) {
        this.violations.push({
          file,
          rule: 'custom-rule',
          severity: 'error',
          message: 'Custom violation',
        });
      }
    }
  }
}
```

## FAQ

### Why scan ignored files?

**Drift detection**. Some files should NEVER exist, even if ignored:
- Lock files in `docs/metrics/`
- Secrets in any location
- Duplicates of canonical files

### What's the difference between forbidden and policy_pending?

- **Forbidden**: Never allowed, immediate failure
- **Policy pending**: Temporary allowance during migration, deadline-based enforcement

### Can I disable the linter?

**Local:**
```bash
export SKIP_RUNTIME_PATH_LINT=true
git commit -m "..."
```

**CI:**
Not recommended. Use `policy_pending` for temporary exceptions.

### How do I test policy changes?

```bash
# Dry-run against current state
pnpm tsx tools/audit/runtime-path-linter.ts --verbose

# Test strict mode
pnpm tsx tools/audit/runtime-path-linter.ts --strict
```

## References

- **Policy File**: `tools/audit/policies/runtime-path-policy.yml`
- **Linter Implementation**: `tools/audit/runtime-path-linter.ts`
- **CI Workflow**: `.github/workflows/runtime-path-lint.yml`
- **Data Sync Documentation**: `apps/project-tracker/docs/DATA_SYNC.md`
- **Sprint Plan Governance**: `docs/plan-governance.md`
