# Runtime Path Linter - Quick Reference

> **TL;DR**: Keep artifacts organized. One canonical copy of critical files. No runtime files in docs/. CI enforces strictly.

---

## Quick Commands

```bash
# Local check (warnings only)
pnpm tsx tools/audit/runtime-path-linter.ts

# Strict check (like CI)
pnpm tsx tools/audit/runtime-path-linter.ts --strict

# Generate reports
pnpm tsx tools/audit/runtime-path-linter.ts --format=all

# Verbose output
pnpm tsx tools/audit/runtime-path-linter.ts --verbose
```

---

## File Location Rules

### ✅ ALLOWED

```
artifacts/
├── logs/           # All .log files
├── reports/        # HTML, PDF reports
├── metrics/        # Runtime metrics
├── misc/           # Config files, test data
└── coverage/       # Test coverage

apps/project-tracker/docs/metrics/
├── _global/
│   ├── Sprint_plan.csv     # ONE copy only
│   ├── Sprint_plan.json    # ONE copy only
│   └── task-registry.json  # ONE copy only
├── schemas/        # JSON schemas
└── sprint-*/       # Sprint metrics (*.json only)
```

### ❌ FORBIDDEN

```
❌ /*.log                    # Root-level logs
❌ /*.csv                    # Root-level CSVs
❌ /*.json (except pkg.json) # Root-level JSONs
❌ docs/metrics/.locks/      # Runtime locks
❌ docs/metrics/logs/        # Logs in docs
❌ docs/metrics/**/*.bak     # Backup files
❌ src/**/*.log              # Logs in source
❌ Sprint_plan.csv (duplicate)  # Only ONE allowed
```

---

## Common Fixes

### Fix: Root-Level Artifact

```bash
# Move to artifacts
mkdir -p artifacts/logs
mv debug.log artifacts/logs/

# Or ignore if runtime-generated
echo "debug.log" >> .gitignore
```

### Fix: Runtime File in docs/metrics

```bash
# Delete runtime artifacts
rm -rf apps/project-tracker/docs/metrics/.locks

# Add to .gitignore
echo "apps/project-tracker/docs/metrics/.locks/" >> .gitignore
```

### Fix: Duplicate Canonical File

```bash
# Keep only canonical location
rm Sprint_plan_backup.csv

# Canonical: apps/project-tracker/docs/metrics/_global/Sprint_plan.csv
```

### Fix: Policy Pending (Migration)

```bash
# Option 1: Run migration script
pnpm tsx tools/audit/migrate-artifacts.ts

# Option 2: Manual move
mkdir -p artifacts/misc
mv apps/project-tracker/docs/artifacts/file.json artifacts/misc/
```

---

## Severity Levels

| Local Mode | CI Mode | Meaning |
|------------|---------|---------|
| ❌ ERROR | ❌ ERROR | Forbidden path, duplicate |
| ⚠️ WARNING | ❌ ERROR | Policy pending (active) |
| ⚠️ WARNING | ❌ ERROR | Policy pending (expired) |
| ⚠️ WARNING | ⚠️ WARNING | Canonical missing (non-strict) |
| ℹ️ INFO | ℹ️ INFO | Informational only |

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | ✅ Success |
| 1 | ❌ Violation (forbidden/duplicate) |
| 2 | ❌ Canonical file missing |
| 3 | ❌ Policy deadline expired |
| 4 | ❌ Config error |

---

## Canonical Files (ONE COPY ONLY)

```
✅ apps/project-tracker/docs/metrics/_global/Sprint_plan.csv
✅ apps/project-tracker/docs/metrics/_global/Sprint_plan.json
✅ apps/project-tracker/docs/metrics/_global/task-registry.json
✅ apps/project-tracker/docs/metrics/_global/dependency-graph.json

❌ ANY other location for these files
```

---

## CI Integration

### When It Runs
- Pull requests to `main`/`develop`
- Pushes to `main`/`develop`
- Manual workflow dispatch

### What It Checks
1. ✅ No forbidden paths
2. ✅ No duplicates
3. ✅ Canonical files exist
4. ✅ Policy pending enforced
5. ✅ .gitignore coverage

### PR Comment
If violations detected, bot comments on PR with:
- List of violations
- Suggested fixes
- Links to docs

---

## Skipping Linter

### Local
```bash
export SKIP_RUNTIME_PATH_LINT=true
git commit -m "..."
```

### CI
❌ **Not recommended** - Use `policy_pending` for temporary exceptions

---

## Policy Pending (Migration Items)

Active migrations with deadlines:

| Pattern | Deadline | Status |
|---------|----------|--------|
| `docs/artifacts/**/*` | 2025-01-15 | ⏳ Migrating to `artifacts/` |
| `local-*` audit runs | 2025-01-31 | ⏳ Should be .gitignored |

**Actions**:
- Before deadline: Local = WARN, CI = ERROR
- After deadline: Local = ERROR, CI = ERROR

---

## Examples

### Example 1: PR Fails Lint

```
❌ CI failed: runtime-path-lint

Violations:
  ✗ Sprint_plan_backup.csv
    [forbidden-path] Root-level CSV files forbidden
    Fix: Move to artifacts/metrics/

Fix:
  mv Sprint_plan_backup.csv artifacts/metrics/
  git add artifacts/metrics/Sprint_plan_backup.csv
  git rm Sprint_plan_backup.csv
  git commit --amend --no-edit
  git push -f
```

### Example 2: Policy Pending Warning

```
⚠️ Local warning

  ⚠ apps/project-tracker/docs/artifacts/test.json
    [policy-pending] Deprecated (Deadline: 2025-01-15, 25 days)
    Fix: Run migration script

Action:
  pnpm tsx tools/audit/migrate-artifacts.ts
```

### Example 3: Duplicate Detection

```
❌ CI failed: duplicate-violation

  ✗ Sprint_plan.csv (apps/project-tracker/backups/)
    [duplicate] Multiple copies detected
    Fix: Delete - canonical at docs/metrics/_global/

Fix:
  rm apps/project-tracker/backups/Sprint_plan.csv
```

---

## Help & Docs

- **Policy**: `tools/audit/policies/runtime-path-policy.yml`
- **Full Docs**: `tools/audit/policies/README.md`
- **Design**: `artifacts/reports/runtime-path-linter-design.md`
- **GitHub Workflow**: `.github/workflows/runtime-path-lint.yml`

---

## Troubleshooting

### Q: Linter fails but I don't see violations

**A**: Check artifacts uploaded to GitHub Actions:
```
Actions → Runtime Path Linting → Artifacts → runtime-path-lint-results
```

### Q: How do I add an exception?

**A**: Edit policy YAML:
```yaml
forbidden:
  - pattern: '/*.json'
    exceptions:
      - 'package.json'
      - 'my-special-file.json'  # Add here
```

### Q: Linter too strict in local development?

**A**: Don't use `--strict` flag locally:
```bash
# Local (warnings only)
pnpm tsx tools/audit/runtime-path-linter.ts

# CI (errors)
pnpm tsx tools/audit/runtime-path-linter.ts --strict
```

### Q: Need temporary exception during migration?

**A**: Use `policy_pending` section:
```yaml
policy_pending:
  - pattern: 'my-migration/**/*'
    deadline: '2025-02-01'
    severity_local: 'warning'
    severity_ci: 'error'
```

---

**Last Updated**: 2025-12-21
**Version**: 1.0.0
**Maintainer**: Tech Lead
