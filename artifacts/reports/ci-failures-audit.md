# CI/CD Failures Audit
Generated: 2026-04-19 | Branch context: sprint-17 (all scheduled jobs run against master)

---

## Summary

| Category | Count | Fixable By |
|---|---|---|
| Workflow code bugs | 2 | Agent (code fix + commit) |
| Missing GitHub Secrets | 5 secret groups | Manual (repo owner action) |
| Real code failures on master | 5 checks | Agent (code fix + commit) |
| Dependency vulnerabilities | 26 (2 critical, 3 high) | Agent (pnpm update) |

**All scheduled workflows run on `master`.** `sprint-17` has not been merged yet.
Most `master` failures predate this session and are chronic (30+ consecutive runs failing).

---

## Workflow Inventory (28 total)

| File | Status | Trigger |
|---|---|---|
| `api-inventory-drift.yml` | FAILING (was fixed today) | schedule |
| `artifact-lint.yml` | unknown | push/PR |
| `blue-green-deploy.yml` | unknown | manual |
| `cd.yml` | unknown | push to main |
| `ci.yml` | unknown | push/PR |
| `codebase-inventory-drift.yml` | FAILING (was fixed today) | schedule |
| `content-audit.yml` | unknown | schedule |
| `dependency-scan.yml` | unknown | push/PR |
| `governance-metrics.yml` | unknown | schedule |
| `image-scan.yml` | FAILING — bug in workflow | schedule/push |
| `migration.yml` | unknown | push |
| `performance-gate.yml` | unknown | push/PR |
| `pr-checks.yml` | unknown | PR |
| `release.yml` | unknown | tag push |
| `runtime-path-lint.yml` | unknown | push/PR |
| `secret-rotation.yml` | FAILING — bug + missing secrets | schedule |
| `security-sbom.yml` | unknown | schedule |
| `security.yml` | FAILING — real vulnerabilities | schedule/push |
| `signing.yml` | unknown | push |
| `sonar.yml` | unknown | push |
| `sprint-completion-audit.yml` | unknown | schedule |
| `system-audit-integrity.yml` | FAILING — multiple checks | schedule |
| `system-audit-nightly.yml` | FAILING — multiple checks | schedule |
| `system-audit.yml` | unknown | schedule |
| `terraform-drift.yml` | FAILING — missing secrets | schedule |
| `terraform.yml` | unknown | push to main |
| `validate-sprint-data.yml` | unknown | push |
| `validate-sprint.yml` | unknown | push |

---

## Failing Workflows — Detailed Analysis

---

### 1. Terraform Drift Detection
**File:** `.github/workflows/terraform-drift.yml`
**Status:** FAILING — 30+ consecutive daily runs
**Root cause:** Missing GitHub Actions secrets

**Secrets required (none configured):**
| Secret | Used for |
|---|---|
| `AWS_ACCESS_KEY_ID` | `aws-actions/configure-aws-credentials@v4` |
| `AWS_SECRET_ACCESS_KEY` | `aws-actions/configure-aws-credentials@v4` |
| `SUPABASE_ACCESS_TOKEN` | `TF_VAR_supabase_access_token` |
| `VERCEL_API_TOKEN` | `TF_VAR_vercel_api_token` |
| `RAILWAY_TOKEN` | `TF_VAR_railway_token` |
| `DB_PASSWORD` | `TF_VAR_supabase_db_password` |

**Log evidence:**
```
##[error]Credentials could not be loaded, please check your action inputs:
Could not load credentials from any providers
```

**Fix type:** MANUAL — add secrets at:
`https://github.com/talyssonoliver/IntelliFlow-CRM/settings/secrets/actions`

**Workflow fix needed:** None (workflow code is correct)
- [ ] Add `AWS_ACCESS_KEY_ID` secret
- [ ] Add `AWS_SECRET_ACCESS_KEY` secret
- [ ] Add `SUPABASE_ACCESS_TOKEN` secret
- [ ] Add `VERCEL_API_TOKEN` secret
- [ ] Add `RAILWAY_TOKEN` secret
- [ ] Add `DB_PASSWORD` secret

---

### 2. Container Image Security Scan
**File:** `.github/workflows/image-scan.yml`
**Status:** FAILING — workflow code bug
**Root cause:** `trivy` binary called directly without installation in `Scan Compose Images` job

**Log evidence:**
```
/home/runner/work/_temp/143820f5.sh: line 1: trivy: command not found
##[error]Process completed with exit code 127.
```

**Fix type:** AGENT — add trivy install step to the `Scan Compose Images` job

**Workflow fix needed:**
- [ ] Add `aquasecurity/trivy-action` or `apt-get install trivy` before the raw `trivy` call in the `Scan Compose Images` job

---

### 3. Secret Rotation
**File:** `.github/workflows/secret-rotation.yml`
**Status:** FAILING — two separate issues
**Root cause A:** `pnpm` not on PATH when `actions/setup-node@v4` runs with `cache: 'pnpm'` but `pnpm/action-setup@v4` hasn't run yet
**Root cause B:** `VAULT_ADDR` and `VAULT_TOKEN` secrets are empty (HashiCorp Vault not configured)

**Log evidence:**
```
VAULT_ADDR:
VAULT_TOKEN:
##[error]Unable to locate executable file: pnpm. Please verify either the file
path exists or the file can be found within a directory specified by the PATH
```

**Fix type:**
- AGENT — reorder `pnpm/action-setup@v4` to run BEFORE `actions/setup-node@v4` (so pnpm is available for caching)
- MANUAL — add `VAULT_ADDR` and `VAULT_TOKEN` secrets (or disable the Vault integration)

**Workflow fix needed:**
- [ ] Move `pnpm/action-setup@v4` step before `actions/setup-node@v4` in `check-rotation-due` job
- [ ] Same reorder in `rotate-secrets` job
- [ ] Add `VAULT_ADDR` and `VAULT_TOKEN` secrets (or make Vault optional with `continue-on-error`)

---

### 4. Security Scanning
**File:** `.github/workflows/security.yml`
**Status:** FAILING — real vulnerability findings
**Root cause:** Actual vulnerabilities detected in dependencies, not a workflow bug

**Failing jobs:**
| Job | Failure |
|---|---|
| Trivy Container & Filesystem Scan | Vulnerabilities found |
| OWASP Dependency Check | Vulnerabilities found |
| npm/pnpm Audit | `pnpm audit --audit-level=moderate` exits 1 |

**Vulnerabilities (pnpm audit — current local state):**
| Severity | Count | Key Packages |
|---|---|---|
| Critical | 2 | `protobufjs` (arbitrary code execution) — via `@testcontainers/` and `@langchain/` |
| High | 3 | `next` (DoS via Server Components) — `apps/project-tracker`; `basic-ftp` (2 CVEs) — via `@lhci/cli` |
| Moderate | 18 | Various transitive deps |
| Low | 3 | Various |

**Fix type:** AGENT — update vulnerable packages
- [ ] `protobufjs`: update via `pnpm update protobufjs` or patch `@testcontainers` / `@langchain`
- [ ] `next` in `apps/project-tracker`: update to patched version
- [ ] `basic-ftp`: update `@lhci/cli` or add `pnpm.overrides`

**Note:** `Secret Scanning` and `Baseline Validation` jobs within this workflow pass.

---

### 5. System Audit Integrity (Cache Bypass) + System Audit Nightly
**Files:** `.github/workflows/system-audit-integrity.yml`, `system-audit-nightly.yml`
**Status:** FAILING — multiple real failures on `master`

**Failing checks (from run 24621416817):**

| Check | Tier | Failure |
|---|---|---|
| `turbo-build` | 1 | Next.js build error: "Failed to collect page data for `/api/trpc/[trpc]`" |
| `eslint-max-warnings-0` | 1 | 95 ESLint warnings (0 errors allowed) |
| `pnpm-audit-high` | 1 | High severity deps (see Security Scanning above) |
| `semgrep-security-audit` | 1 | Security issues found by Semgrep |
| `trivy-image` | 1 | Vulnerable container images |
| `prettier-check` | 1 | Formatting issues on `master` |
| `commitlint` | 1 | Commit message format violations |
| `a11y-route-reconcile` | 1 | Accessibility route mismatch |

**Root cause of `turbo-build` failure:**
```
Error: Failed to collect page data for /api/trpc/[trpc]
type: 'Error'
@intelliflow/web#build exited (1)
```
Master is behind `sprint-17` by ~15+ commits. The tRPC route page data collection fails during Next.js static generation. This will likely self-resolve once `sprint-17` is merged to `master`.

**Fix type:** MIXED
- `turbo-build` → MERGE sprint-17 → master (likely fixes it)
- `prettier-check` → MERGE sprint-17 → master (already formatted in sprint-17)
- `eslint-max-warnings-0` → AGENT — fix 95 warnings (post-merge)
- `semgrep-security-audit` → AGENT — review and address findings
- `pnpm-audit-high` → AGENT — update packages (same as Security Scanning)
- `trivy-image` → AGENT — update base images / deps
- `commitlint` → MANUAL — ensure future commits follow convention
- `a11y-route-reconcile` → AGENT — investigate route mismatch

---

## Already Fixed This Session

| Workflow | Fix | Commit |
|---|---|---|
| Codebase Inventory Drift | Ran `sync:codebase-inventory`, committed `baseline.json` | `0b7b6249` |
| API Inventory Drift | Ran `sync:api-inventory`, committed `baseline.json` | `0b7b6249` |

---

## Action Plan (Ordered by Impact)

### Immediate (code fixes — no manual action needed)
1. **Fix `image-scan.yml`** — add trivy install step (5 min)
2. **Fix `secret-rotation.yml`** — reorder pnpm setup + add `continue-on-error` on Vault steps (5 min)
3. **Update vulnerable packages** — `protobufjs`, `next` in project-tracker, `basic-ftp` override (30 min)
4. **Merge sprint-17 → master** — fixes prettier, likely turbo-build, inventory drift (instant)

### Manual (requires repo owner)
5. **Add GitHub secrets** for Terraform: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `SUPABASE_ACCESS_TOKEN`, `VERCEL_API_TOKEN`, `RAILWAY_TOKEN`, `DB_PASSWORD`
6. **Add GitHub secrets** for Vault: `VAULT_ADDR`, `VAULT_TOKEN` (or disable Vault integration)

### Post-merge investigation
7. ESLint 95 warnings — audit and fix
8. Semgrep findings — review security report
9. a11y route reconciliation — investigate mismatch
10. commitlint — enforce going forward

---

## Notes

- All scheduled workflows target `master` branch exclusively
- `sprint-17` has never triggered any of these failures (push-triggered workflows only run on `main`/`develop`)
- The Terraform, Vault, and AWS failures have been occurring since before this sprint — pre-existing infrastructure gap
- Node.js 20 deprecation warning appears in all workflows (forced to Node 24 from June 2026) — not a current failure cause
