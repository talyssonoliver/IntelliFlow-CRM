# Disk Space & Maintenance Runbook — IntelliFlow CRM

**Document ID**: MAINT-001  
**Version**: 1.1.0  
**Last Updated**: 2026-04-16  
**Owner**: Engineering Lead / On-Call SRE  
**Related alerts**: `infra/monitoring/alerts-config.yaml` (disk-space section)

---

## 1. Overview

This runbook covers developer-workstation and CI disk/cache maintenance for
IntelliFlow CRM. It applies to local development machines, CI runners, and the
Railway/Vercel build environment.

### 1.1 Scope

| Environment             | Applies? | Primary concern                   |
| ----------------------- | -------- | --------------------------------- |
| Developer workstation   | Yes      | pnpm store, .next, .turbo growth  |
| GitHub Actions runner   | Yes      | Disk quota per job                |
| Railway (API/AI worker) | Yes      | Container layer bloat on redeploy |
| Vercel (web app)        | Partial  | Build cache; Vercel manages disk  |

### 1.2 Related Runbooks

- `./workers-runbook.md` — Worker service operations
- `./monitoring-runbook.md` — Prometheus / Grafana stack
- `../engineering-playbook.md` — General engineering process

---

## 2. Quick Reference Commands

| Command            | Description                                  | When to use                     |
| ------------------ | -------------------------------------------- | ------------------------------- |
| `pnpm disk:check`  | Check available disk space                   | Daily / before large operations |
| `pnpm clean:build` | Remove build artifacts (.next, dist, .turbo) | After builds, before commits    |
| `pnpm clean:full`  | Full cleanup (build + node_modules caches)   | Weekly / when disk is low       |
| `pnpm maintenance` | Complete maintenance routine                 | Weekly / monthly                |
| `pnpm store prune` | Prune unreferenced pnpm store packages       | Monthly or when store >5 GB     |

---

## 3. Monitoring Thresholds

| Level    | Free Space | Pre-commit hook  | Recommended action         |
| -------- | ---------- | ---------------- | -------------------------- |
| OK       | > 10 GB    | No action        | No action needed           |
| Caution  | 5–10 GB    | Warn             | Run `pnpm clean:build`     |
| Warning  | 1–5 GB     | Warn             | Run `pnpm clean:full`      |
| Critical | < 1 GB     | **Block commit** | Run emergency cleanup (§6) |

### 3.1 Pre-commit Hook Behaviour

The pre-commit hook at `.husky/pre-commit` automatically checks disk space:

- **Blocks commit** if < 1 GB free (critical threshold)
- **Warns** if < 5 GB free (caution threshold) but does not block
- Hook runs `pnpm disk:check` internally

---

## 4. What Gets Cleaned

| Target               | Typical size impact | Command                                  |
| -------------------- | ------------------- | ---------------------------------------- |
| pnpm store           | 1–10 GB             | `pnpm store prune`                       |
| npm cache            | 0.5–2 GB            | `npm cache clean --force`                |
| `.next` folders      | 0.5–2 GB            | `pnpm clean:build`                       |
| `.turbo` cache       | 0.5–5 GB            | `pnpm clean:build`                       |
| `dist` folders       | 0.1–0.5 GB          | `pnpm clean:build`                       |
| `node_modules`       | 2–8 GB              | `pnpm clean:full` (removes + reinstalls) |
| `artifacts/coverage` | 0.5–3 GB            | Manual: `rm -rf artifacts/coverage/.tmp` |
| Git objects          | 0.1–1 GB            | `git gc --prune=now`                     |

---

## 5. Weekly Maintenance Schedule

Run every Friday or before starting a new sprint:

```bash
# 1. Check current disk space
pnpm disk:check

# 2. Run full maintenance routine (build artifacts + caches)
pnpm maintenance

# 3. Prune pnpm store (keep only packages in current lockfile)
pnpm store prune

# 4. Verify disk space recovered
pnpm disk:check

# 5. Run a clean build to confirm everything still works
pnpm build
```

Expected outcome: at least 2–3 GB recovered on a typical workstation after a
week of active development.

---

## 6. Monthly Maintenance Schedule

Run at the start of each calendar month or after completing a sprint milestone:

```bash
# 1. Run weekly procedure first (§5)

# 2. Clean coverage artifacts
rm -rf artifacts/coverage/.tmp
# Note: do NOT delete artifacts/coverage/ — SonarQube data lives there

# 3. Git garbage collection
git gc --prune=now

# 4. Check for large files accidentally tracked by git
git rev-list --objects --all | \
  git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' | \
  awk '/^blob/ { print $3, $4 }' | sort -rn | head -20

# 5. Review and prune local branches
git branch --merged | grep -v 'master\|sprint-' | xargs -r git branch -d
# WARNING: only delete branches confirmed merged — check with git log first

# 6. Verify pnpm integrity
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
```

---

## 7. Quarterly Review

At the end of each quarter (or every ~8 sprints), perform these additional
checks:

### TODO: Quarterly review — to be authored

The following items should be documented in a quarterly review checklist:

- Review `artifacts/coverage/` storage growth trend
- Audit `.git/objects/` for unexpected large blobs (binary files committed
  accidentally)
- Review `pnpm-lock.yaml` for abandoned / unused dependencies
- Check Railway / Vercel build times — flag if >5 min (indicates bloat)
- Run `pnpm audit` for security vulnerabilities in dependencies
- Review Docker image sizes (`docker images` if local Docker is used)

---

## 8. Emergency Cleanup (Disk Full)

If disk is 100% full and commits or builds are blocked:

```bash
# Step 1: Quick cleanup — no package manager needed
rm -rf apps/*/.next .turbo apps/*/.turbo packages/*/.turbo

# Step 2: Prune pnpm store
pnpm store prune

# Step 3: Clean npm cache
npm cache clean --force

# Step 4 (Windows): Clean Windows temp files via PowerShell
# Run in PowerShell (not bash):
# Remove-Item -Path "$env:TEMP\*" -Recurse -Force -ErrorAction SilentlyContinue

# Step 5: Git garbage collection (aggressive)
git gc --aggressive --prune=now

# Step 6: Verify disk recovered
pnpm disk:check

# Step 7: Reinstall dependencies cleanly
pnpm install

# Step 8: Confirm build still passes
pnpm build
```

**Important**: After an emergency cleanup, verify `pnpm install` completes
successfully before pushing any commits — the cleanup may have removed
node_modules that were being relied upon.

---

## 9. Common Space Hogs — Investigation Guide

| Source              | Location                    | How to check size           |
| ------------------- | --------------------------- | --------------------------- |
| pnpm store          | `~/.pnpm-store/`            | `du -sh ~/.pnpm-store`      |
| node_modules (root) | `./node_modules/`           | `du -sh node_modules`       |
| .next (web)         | `apps/web/.next/`           | `du -sh apps/web/.next`     |
| .turbo cache        | `.turbo/`, `apps/*/.turbo/` | `du -sh .turbo`             |
| Coverage artifacts  | `artifacts/coverage/`       | `du -sh artifacts/coverage` |
| Git objects         | `.git/objects/`             | `git count-objects -vH`     |
| Docker images       | Docker Desktop / daemon     | `docker system df`          |

---

## 10. CI / GitHub Actions Maintenance

GitHub Actions runners have a 14 GB disk quota per job. If a job fails with
`No space left on device`:

```yaml
# Add this step at the start of the workflow to free runner disk:
- name: Free disk space
  run: |
    df -h
    sudo rm -rf /usr/share/dotnet /usr/local/lib/android /opt/ghc
    df -h
```

For persistent cache bloat in CI, review the `cache:` steps in
`.github/workflows/` — ensure `restore-keys` is narrow enough to avoid restoring
stale caches.

---

## 11. Prevention Best Practices

1. Run `pnpm maintenance` every Friday — 5 minutes now vs. 30 minutes debugging
   later.
2. Do not commit large binary files. If a binary is needed, use Git LFS or
   reference it from an external store.
3. Use `.gitignore` for all generated files: `.next`, `dist`, `.turbo`,
   `artifacts/coverage/.tmp`, `*.lcov`.
4. Monitor with `pnpm disk:check` before large operations (installs, builds,
   migrations).
5. Add `node_modules/.cache` to `.gitignore` if ever manually removed (some
   tools create it outside standard locations).

---

## 12. Escalation / On-Call

| Situation                                      | Action                                                |
| ---------------------------------------------- | ----------------------------------------------------- |
| Disk full on CI runner blocking PRs            | Add disk-free step to workflow (§10); notify Eng Lead |
| Local workstation cannot complete `pnpm build` | Emergency cleanup (§8); if still failing, escalate    |
| Railway deploy failing with disk error         | Check Railway volume limits; escalate to Eng Lead     |
| pnpm store corrupt (`ERR_PNPM_STORE_BROKEN`)   | `pnpm store path` → delete store dir → `pnpm install` |

**Primary contact**: Engineering Lead (see team contacts in
`docs/operations/raci.md`)

---

## 13. TODO: Sections to be authored

- Automated disk monitoring integration with Prometheus / alerting pipeline
- Railway volume management procedures (current limit, resize process)
- Docker layer cleanup procedures for local Docker Desktop users
- Vercel build cache purge process (via Vercel CLI / dashboard)
- Log rotation and `artifacts/` archival policy

---

**See also**:

- `docs/operations/README.md` — Operations directory overview
- `docs/operations/runbooks/monitoring-runbook.md` — Prometheus/Grafana stack
- `docs/operations/engineering-playbook.md` — General engineering practices
