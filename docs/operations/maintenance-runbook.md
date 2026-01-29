# Disk Space & Maintenance Runbook

## Quick Commands

| Command | Description | When to Use |
|---------|-------------|-------------|
| `pnpm disk:check` | Check available disk space | Daily / Before large operations |
| `pnpm clean:build` | Remove build artifacts (.next, dist, .turbo) | After builds, before commits |
| `pnpm clean:full` | Full cleanup (build + caches) | Weekly / When disk is low |
| `pnpm maintenance` | Complete maintenance routine | Weekly / Monthly |

## Automated Protections

### Pre-commit Hook
The pre-commit hook automatically checks disk space:
- **Blocks commit** if <1GB free (critical)
- **Warns** if <5GB free (caution)

### What Gets Cleaned

| Target | Size Impact | Command |
|--------|-------------|---------|
| pnpm store | 1-10GB | `pnpm store prune` |
| npm cache | 0.5-2GB | `npm cache clean --force` |
| .next folders | 0.5-2GB | `pnpm clean:build` |
| .turbo cache | 0.5-5GB | `pnpm clean:build` |
| dist folders | 0.1-0.5GB | `pnpm clean:build` |
| Git objects | 0.1-1GB | `git gc --prune=now` |

## Weekly Maintenance Schedule

Run every Friday or before starting new sprint:

```bash
# 1. Check current disk space
pnpm disk:check

# 2. Run full maintenance
pnpm maintenance

# 3. Verify space recovered
pnpm disk:check
```

## Emergency: Disk Full

If disk is 100% full:

```bash
# 1. Quick cleanup (no install needed)
rm -rf apps/*/.next .turbo apps/*/.turbo packages/*/.turbo

# 2. Prune pnpm store
pnpm store prune

# 3. Clean npm cache
npm cache clean --force

# 4. Clean Windows temp (PowerShell)
Remove-Item -Path "$env:TEMP\*" -Recurse -Force -ErrorAction SilentlyContinue

# 5. Git garbage collection
git gc --aggressive --prune=now
```

## Monitoring Thresholds

| Level | Free Space | Action |
|-------|------------|--------|
| OK | >10GB | No action needed |
| Caution | 5-10GB | Run `pnpm clean:build` |
| Warning | 1-5GB | Run `pnpm clean:full` |
| Critical | <1GB | Run emergency cleanup |

## Common Space Hogs

1. **pnpm store** (`~/.pnpm-store/`) - Shared package cache
2. **node_modules** - Project dependencies (use hard links via .npmrc)
3. **Build artifacts** (.next, dist, .turbo)
4. **Test coverage** (artifacts/coverage/)
5. **Git objects** (.git/objects/)

## Prevention Best Practices

1. Run `pnpm maintenance` weekly
2. Don't commit large binary files
3. Use `.gitignore` for generated files
4. Clean before major installs/upgrades
5. Monitor with `pnpm disk:check` regularly
