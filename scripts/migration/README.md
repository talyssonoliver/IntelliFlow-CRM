# Artifact Migration Scripts

This directory contains migration scripts and mappings for reorganizing artifacts in the IntelliFlow CRM repository.

## Overview

As part of Sprint 0 (IFC-160), we've established strict conventions for artifact organization. This directory helps migrate existing artifacts to their correct locations.

## Files

### `artifact-move-map.csv`

A CSV file mapping old artifact locations to new standardized paths.

**Format:**
```csv
from,to,reason,status
"old/path/file.log","artifacts/logs/category/file.log","Reason for move","pending|completed|failed"
```

**Columns:**
- `from`: Original file path
- `to`: Target path in artifacts/ directory
- `reason`: Explanation for the migration
- `status`: Migration status (pending, completed, failed)

## Usage

### 1. Audit Mode

Generate a migration map by scanning the repository for misplaced artifacts:

```bash
pnpm run lint:artifacts:audit
```

This will:
- Scan the repository for artifacts in prohibited locations
- Generate/update `artifact-move-map.csv` with suggested moves
- Report statistics about misplaced artifacts

### 2. Review Migration Map

Open `artifact-move-map.csv` and review the suggested migrations:

```bash
cat scripts/migration/artifact-move-map.csv
```

Verify that:
- Source paths are correct
- Target paths follow conventions
- Reasons are accurate
- No critical files will be moved incorrectly

### 3. Manual Migration (Recommended)

For safety, manually migrate files using the map:

```bash
# For each entry in the CSV, run:
mkdir -p $(dirname "path/to/target")
mv "path/from/source" "path/to/target"
```

### 4. Automated Migration (Future)

An automated migration script is planned for future implementation:

```bash
# Not yet implemented
pnpm run artifacts:migrate
```

This will:
- Read `artifact-move-map.csv`
- Create backups of files to be moved
- Move files to new locations
- Update status column to "completed" or "failed"
- Generate migration report

## Migration Checklist

- [ ] Run audit mode to generate migration map
- [ ] Review generated `artifact-move-map.csv`
- [ ] Create backup of repository (just in case)
- [ ] Manually move critical files
- [ ] Run `pnpm run lint:artifacts` to verify
- [ ] Update .gitignore if needed
- [ ] Clean up old empty directories
- [ ] Commit changes
- [ ] Update status in CSV to "completed"

## Examples

### Example 1: Moving Build Logs

**Before:**
```
src/build.log
```

**After:**
```
artifacts/logs/build/build.log
```

**Command:**
```bash
mkdir -p artifacts/logs/build
mv src/build.log artifacts/logs/build/build.log
```

### Example 2: Moving Test Coverage

**Before:**
```
apps/web/coverage-report.html
```

**After:**
```
artifacts/reports/coverage/web-coverage.html
```

**Command:**
```bash
mkdir -p artifacts/reports/coverage
mv apps/web/coverage-report.html artifacts/reports/coverage/web-coverage.html
```

## Best Practices

1. **Backup First**: Always create a backup before migration
2. **Test Locally**: Run migration on a local branch first
3. **Verify Builds**: Ensure builds still work after migration
4. **Update CI/CD**: Update any CI/CD scripts that reference old paths
5. **Document Changes**: Update team about new artifact locations
6. **Clean Gradually**: Don't delete old directories immediately

## Troubleshooting

### Files Not Found

If the migration map references files that don't exist:
- They may have already been moved
- They may have been deleted
- Paths may be case-sensitive on some systems

**Solution:** Update the CSV to mark them as "completed" or remove the entry.

### Permission Denied

If you can't move files due to permissions:
- Check file permissions: `ls -la path/to/file`
- Ensure files aren't locked by running processes
- Run with appropriate permissions

### Build Breaks After Migration

If builds fail after migration:
- Check for hardcoded paths in build scripts
- Update import statements if needed
- Verify .gitignore patterns still match
- Clear build caches: `pnpm run clean`

## Post-Migration

After successful migration:

1. **Verify Linter Passes**:
   ```bash
   pnpm run lint:artifacts
   ```

2. **Run Full Build**:
   ```bash
   pnpm run build
   ```

3. **Run Tests**:
   ```bash
   pnpm run test
   ```

4. **Update Documentation**:
   - Update any documentation referencing old paths
   - Add migration notes to changelog

5. **Clean Up**:
   ```bash
   # Remove empty directories
   find . -type d -empty -delete
   ```

## Related Documentation

- [Artifact Path Conventions](../../docs/architecture/artifact-conventions.md)
- [Repository Layout](../../docs/architecture/repo-layout.md)
- [Artifact Path Linter](../../tools/lint/artifact-paths.ts)

## Support

For questions or issues with artifact migration:
- Check [artifact-conventions.md](../../docs/architecture/artifact-conventions.md)
- Run `pnpm run lint:artifacts` for violations
- Contact DevOps team via #dev-ops Slack channel
