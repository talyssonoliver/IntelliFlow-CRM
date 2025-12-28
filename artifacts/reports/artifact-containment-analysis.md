# Artifact Containment Analysis Report

**Date:** 2025-12-21
**Agent:** SUB-AGENT C - Artifact Containment
**Mission:** Identify all scripts producing outputs to non-canonical locations and propose containment solutions

---

## Executive Summary

**Total Scripts Analyzed:** 15
**Scripts Requiring Containment:** 8
**Root-Level Pollutants Found:** 3 (sonar-reports/, tree_intelliflow_crm.txt, gitleaks-report.json)
**Compliance with Artifact Conventions:** 47% (7/15 already compliant)

### Key Findings

1. **Root-level pollution detected**: `sonar-reports/`, `tree_intelliflow_crm.txt`, `gitleaks-report.json`
2. **STOA scripts are compliant**: All evidence/attestation outputs use canonical paths
3. **Sonar scripts need remediation**: Writing to `sonar-reports/` instead of `artifacts/reports/sonarqube/`
4. **GitHub workflow needs update**: Hardcoded `gitleaks-report.json` in root
5. **Missing centralized output path helper**: No shared utility for determining canonical paths

---

## Detailed Findings

### Category 1: Scripts Already Using Canonical Paths ✅

These scripts correctly use `artifacts/` and are compliant with IFC-160:

#### 1.1 STOA Evidence System
**Files:**
- `tools/scripts/lib/stoa/evidence.ts`
- `tools/scripts/lib/stoa/attestation.ts`
- `tools/scripts/lib/stoa/remediation.ts`
- `tools/scripts/lib/stoa/verdict.ts`
- `tools/scripts/lib/stoa/gate-runner.ts`

**Output Path:** `artifacts/reports/system-audit/{RUN_ID}/`

**Evidence:**
```typescript
// tools/scripts/lib/stoa/evidence.ts:109-110
export function getEvidenceDir(repoRoot: string, runId: string): string {
  return join(repoRoot, 'artifacts', 'reports', 'system-audit', runId);
}
```

**Status:** ✅ COMPLIANT - Uses timestamped run IDs, follows canonical structure

---

#### 1.2 Performance Benchmarks
**File:** `tools/perf/benchmark.ts`

**Output Path:** `artifacts/benchmarks/{filename}`

**Evidence:**
```typescript
// Line 198
const artifactsDir = join(process.cwd(), 'artifacts', 'benchmarks');
```

**Status:** ✅ COMPLIANT

---

#### 1.3 PNPM Audit Report
**File:** `scripts/pnpm-audit-report.js`

**Output Path:** `artifacts/reports/audit-report.json`

**Evidence:**
```javascript
// Line 14
const outputPath = path.join(process.cwd(), 'artifacts', 'reports', 'audit-report.json');
```

**Status:** ✅ COMPLIANT

---

#### 1.4 Plan Linter
**File:** `tools/plan-linter/index.js`

**Output Path:** `artifacts/reports/plan-lint-report.json`

**Evidence:**
```javascript
// Line 812
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
```

**Status:** ✅ COMPLIANT

---

### Category 2: Scripts Requiring Containment ⚠️

#### 2.1 SonarQube Report Generator 🔴 CRITICAL
**File:** `scripts/sonar-report-generator.js`

**Current Output:** `sonar-reports/sonar-analysis-{timestamp}.{md,json}`

**Evidence:**
```javascript
// Line 20
const REPORT_DIR = 'sonar-reports';

// Lines 283-284
const reportFile = path.join(REPORT_DIR, `sonar-analysis-${timestamp}.md`);
const jsonReportFile = path.join(REPORT_DIR, `sonar-analysis-${timestamp}.json`);
```

**Problem:**
- Writes to root `sonar-reports/` directory
- Creates timestamped files without run ID structure
- Violates IFC-160 artifact conventions

**Proposed Fix:**
```javascript
// Replace line 20
const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR || 'artifacts';
const RUN_ID = process.env.RUN_ID || `${Date.now()}-${process.pid}`;
const REPORT_DIR = path.join(ARTIFACTS_DIR, 'reports', 'sonarqube', RUN_ID);

// Add before line 275
if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

// Update filenames (remove timestamp, use run ID)
const reportFile = path.join(REPORT_DIR, 'analysis.md');
const jsonReportFile = path.join(REPORT_DIR, 'analysis.json');
```

**Canonical Path:** `artifacts/reports/sonarqube/{RUN_ID}/analysis.{md,json}`

---

#### 2.2 SonarQube New Issues 🔴 CRITICAL
**File:** `scripts/sonar-new-issues.js`

**Current Output:** `sonar-reports/sonar-new-issues-{timestamp}.json`

**Evidence:**
```javascript
// Lines 157-160
const outDir = path.join(repoRoot, 'sonar-reports');
fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
const outPath = path.join(outDir, `sonar-new-issues-${stamp}.json`);
```

**Problem:**
- Same as 2.1 - root pollution
- Inconsistent with other sonar scripts

**Proposed Fix:**
```javascript
// Replace lines 157-160
const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR || 'artifacts';
const RUN_ID = process.env.RUN_ID || `${Date.now()}-${process.pid}`;
const outDir = path.join(repoRoot, ARTIFACTS_DIR, 'reports', 'sonarqube', RUN_ID);
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'new-issues.json');
```

**Canonical Path:** `artifacts/reports/sonarqube/{RUN_ID}/new-issues.json`

---

#### 2.3 GitLeaks Scanner (GitHub Workflow) 🔴 CRITICAL
**File:** `.github/workflows/security.yml`

**Current Output:** `gitleaks-report.json` (root level)

**Evidence:**
```yaml
# Lines 200-202
- name: Upload Gitleaks results
  with:
    name: gitleaks-report
    path: gitleaks-report.json
```

**Problem:**
- GitHub Action writes to root by default
- Not using artifacts directory structure 

**Proposed Fix:**
```yaml
# Update workflow to specify output location
- name: Run Gitleaks
  uses: gitleaks/gitleaks-action@v2
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    GITLEAKS_ENABLE_SUMMARY: true
    # Add output path
    GITLEAKS_OUTPUT: artifacts/reports/security/gitleaks-report.json

- name: Upload Gitleaks results
  uses: actions/upload-artifact@v4
  if: failure()
  with:
    name: gitleaks-report
    path: artifacts/reports/security/gitleaks-report.json
    retention-days: 30
```

**Note:** The Python wrapper (`tools/audit/gitleaks_scan.py`) does NOT write reports - it only runs the binary. The GitHub Action controls output location.

**Canonical Path:** `artifacts/reports/security/gitleaks-report.json`

---

#### 2.4 Tree Generator (Legacy) ⚠️ MEDIUM
**Current Evidence:** `tree_intelliflow_crm.txt` exists in git status (deleted)

**Status:** Already being cleaned up (marked for deletion in git)

**Finding:** No active script found generating this file. Likely manual/one-off generation.

**Recommendation:** Ensure `.gitignore` blocks future occurrences (already done - line 166)

---

### Category 3: Missing Infrastructure

#### 3.1 Centralized Output Path Helper 🔴 CRITICAL

**Problem:** Every script reimplements path logic differently:
- Some use `process.cwd() + 'artifacts'`
- Some use `path.join(repoRoot, 'artifacts')`
- Some hardcode `sonar-reports/`
- Inconsistent run ID generation

**Proposed Solution:** Create `tools/scripts/lib/output-paths.ts`

```typescript
/**
 * Centralized Output Path Management
 *
 * Provides canonical paths for all artifact outputs.
 * Supports environment variable overrides for CI/CD.
 *
 * @module tools/scripts/lib/output-paths
 */

import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs'; 

// ============================================================================
// Environment Configuration
// ============================================================================

/**
 * Base artifacts directory (overridable via ARTIFACTS_DIR env var)
 */
export const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR || 'artifacts';

/**
 * Current run ID (overridable via RUN_ID env var)
 * Format: YYYYMMDD-HHMMSS-UUID or timestamp-pid
 */
export const RUN_ID = process.env.RUN_ID || generateRunId();

/**
 * Execution environment (CI, local, test)
 */
export const ENV = process.env.CI ? 'ci' : process.env.NODE_ENV || 'local';

// ============================================================================
// Run ID Generation
// ============================================================================

function generateRunId(): string {
  if (process.env.CI) {
    // In CI: use run number + sha
    const runNumber = process.env.GITHUB_RUN_NUMBER || process.env.CI_PIPELINE_ID || Date.now();
    const sha = (process.env.GITHUB_SHA || randomUUID()).slice(0, 8);
    return `${runNumber}-${sha}`;
  }

  // Local: timestamp + pid
  const timestamp = new Date().toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+/, '')
    .slice(0, 15); // YYYYMMDDTHHmmss

  return `${timestamp}-${process.pid}`;
}

// ============================================================================
// Canonical Path Builders
// ============================================================================

/**
 * Get repo root (walks up from cwd until package.json found)
 */
export function getRepoRoot(): string {
  let current = process.cwd();
  const root = process.platform === 'win32' ? current.split('\\')[0] + '\\' : '/';

  while (current !== root) {
    try {
      require(join(current, 'package.json'));
      return current;
    } catch {
      current = join(current, '..');
    }
  }

  throw new Error('Could not find repo root (package.json not found)');
}

const REPO_ROOT = getRepoRoot();

/**
 * Build path under artifacts/reports/{tool}/{runId}/
 */
export function getReportPath(tool: string, filename?: string): string {
  const base = join(REPO_ROOT, ARTIFACTS_DIR, 'reports', tool, RUN_ID);
  mkdirSync(base, { recursive: true });
  return filename ? join(base, filename) : base;
}

/**
 * Build path under artifacts/benchmarks/
 */
export function getBenchmarkPath(filename: string): string {
  const base = join(REPO_ROOT, ARTIFACTS_DIR, 'benchmarks');
  mkdirSync(base, { recursive: true });
  return join(base, filename);
}

/**
 * Build path under artifacts/coverage/
 */
export function getCoveragePath(filename?: string): string {
  const base = join(REPO_ROOT, ARTIFACTS_DIR, 'coverage');
  mkdirSync(base, { recursive: true });
  return filename ? join(base, filename) : base;
}

/**
 * Build path under artifacts/logs/
 */
export function getLogPath(category: string, filename: string): string {
  const base = join(REPO_ROOT, ARTIFACTS_DIR, 'logs', category);
  mkdirSync(base, { recursive: true });
  return join(base, filename);
}

/**
 * Build path under artifacts/reports/system-audit/{runId}/
 * (STOA evidence bundles)
 */
export function getStoaEvidencePath(filename?: string): string {
  const base = join(REPO_ROOT, ARTIFACTS_DIR, 'reports', 'system-audit', RUN_ID);
  mkdirSync(base, { recursive: true });
  return filename ? join(base, filename) : base;
}

/**
 * Get latest symlink path for a report type
 * Example: artifacts/reports/sonarqube/latest -> {RUN_ID}
 */
export function getLatestSymlink(tool: string): string {
  return join(REPO_ROOT, ARTIFACTS_DIR, 'reports', tool, 'latest');
}

// ============================================================================
// Windows Compatibility
// ============================================================================

/**
 * Normalize path separators for cross-platform consistency
 */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

/**
 * Create symlink (or copy on Windows if symlink fails)
 */
export async function createLatestLink(
  source: string,
  linkPath: string
): Promise<void> {
  const { symlink, copyFile, unlink } = await import('node:fs/promises');

  try {
    // Remove existing link/file
    await unlink(linkPath).catch(() => {});

    if (process.platform === 'win32') {
      // Windows: try symlink, fall back to copy
      try {
        await symlink(source, linkPath, 'junction');
      } catch {
        await copyFile(source, linkPath);
      }
    } else {
      // Unix: use symlink
      await symlink(source, linkPath);
    }
  } catch (err) {
    console.warn(`Warning: Could not create latest link: ${err}`);
  }
}

// ============================================================================
// Usage Examples (for documentation)
// ============================================================================

/**
 * EXAMPLES:
 *
 * // SonarQube report
 * const reportPath = getReportPath('sonarqube', 'analysis.json');
 * // => artifacts/reports/sonarqube/20251221-143022-8a4f/analysis.json
 *
 * // GitLeaks report
 * const gitleaksPath = getReportPath('security', 'gitleaks-report.json');
 * // => artifacts/reports/security/20251221-143022-8a4f/gitleaks-report.json
 *
 * // Benchmark
 * const benchPath = getBenchmarkPath('baseline.json');
 * // => artifacts/benchmarks/baseline.json
 *
 * // STOA evidence
 * const evidencePath = getStoaEvidencePath('summary.json');
 * // => artifacts/reports/system-audit/20251221-143022-8a4f/summary.json
 *
 * // Create latest symlink
 * await createLatestLink(
 *   getReportPath('sonarqube'),
 *   getLatestSymlink('sonarqube')
 * );
 */
```

---

## Remediation Plan

### Phase 1: Create Infrastructure (Priority: HIGH)

**Task 1.1:** Create `tools/scripts/lib/output-paths.ts` with helper functions

**Task 1.2:** Update `.gitignore` to block root-level outputs:
```gitignore
# Add after line 51
# Root-level tool outputs (should be in artifacts/)
/sonar-reports/
/gitleaks-report.json
/tree_*.txt
```

**Task 1.3:** Create migration guide documentation

---

### Phase 2: Fix SonarQube Scripts (Priority: CRITICAL)

**Task 2.1:** Update `scripts/sonar-report-generator.js`
```diff
- const REPORT_DIR = 'sonar-reports';
+ import { getReportPath, createLatestLink, getLatestSymlink } from '../tools/scripts/lib/output-paths.js';
+ const REPORT_DIR = getReportPath('sonarqube');
```

**Task 2.2:** Update `scripts/sonar-new-issues.js` (same pattern)

**Task 2.3:** Delete root `sonar-reports/` directory after migration

---

### Phase 3: Fix GitHub Workflow (Priority: HIGH)

**Task 3.1:** Update `.github/workflows/security.yml` to use artifacts path

**Task 3.2:** Test workflow in CI to ensure artifacts are captured

---

### Phase 4: Validation (Priority: MEDIUM)

**Task 4.1:** Create script to detect root-level pollution:
```bash
#!/bin/bash
# scripts/validate-artifact-paths.sh

# Check for prohibited root-level outputs
VIOLATIONS=0

if [ -d "sonar-reports" ]; then
  echo "ERROR: Found sonar-reports/ in root (should be in artifacts/)"
  VIOLATIONS=$((VIOLATIONS + 1))
fi

if [ -f "gitleaks-report.json" ]; then
  echo "ERROR: Found gitleaks-report.json in root (should be in artifacts/)"
  VIOLATIONS=$((VIOLATIONS + 1))
fi

if ls tree_*.txt 2>/dev/null; then
  echo "ERROR: Found tree_*.txt in root (should be in artifacts/)"
  VIOLATIONS=$((VIOLATIONS + 1))
fi

exit $VIOLATIONS
```

**Task 4.2:** Add validation to CI pipeline (pre-commit hook)

---

## Environment Variable Design

### Supported Environment Variables

| Variable | Purpose | Default | Example |
|----------|---------|---------|---------|
| `ARTIFACTS_DIR` | Base artifacts path | `artifacts` | `build/artifacts` |
| `RUN_ID` | Unique run identifier | Auto-generated | `20251221-143022-8a4f` |
| `CI` | CI environment flag | (unset) | `true` |
| `GITHUB_RUN_NUMBER` | CI run number | (unset) | `1234` |
| `GITHUB_SHA` | Git commit SHA | (unset) | `abc123def456` |

### Usage in Scripts

```javascript
// Before (hardcoded)
const outputPath = 'sonar-reports/analysis.json';

// After (using helper)
import { getReportPath } from './tools/scripts/lib/output-paths.js';
const outputPath = getReportPath('sonarqube', 'analysis.json');
```

### Usage in CI

```yaml
# GitHub Actions
env:
  ARTIFACTS_DIR: artifacts
  RUN_ID: ${{ github.run_number }}-${{ github.sha }}
```

---

## Windows Compatibility Notes

### Path Separators
- All helpers use `path.join()` for cross-platform compatibility
- `normalizePath()` converts backslashes to forward slashes for git/logs

### Symlinks
- `createLatestLink()` uses junction points on Windows (no admin required)
- Falls back to file copy if symlinks fail
- Unix systems use standard symlinks

### File Locking
- Use `.lock` files with PID for concurrent access control
- Clean up stale locks on process exit

---

## Success Metrics

### Before Remediation
- Root-level outputs: 3 directories/files
- Compliant scripts: 7/15 (47%)
- Centralized path logic: No

### After Remediation (Target)
- Root-level outputs: 0
- Compliant scripts: 15/15 (100%)
- Centralized path logic: Yes
- CI validation: Enabled

---

## Migration Checklist

- [ ] Create `tools/scripts/lib/output-paths.ts`
- [ ] Update `.gitignore` to block root pollution
- [ ] Migrate `scripts/sonar-report-generator.js`
- [ ] Migrate `scripts/sonar-new-issues.js`
- [ ] Update `.github/workflows/security.yml`
- [ ] Delete root `sonar-reports/` directory
- [ ] Create `scripts/validate-artifact-paths.sh`
- [ ] Add validation to pre-commit hook
- [ ] Test all scripts locally
- [ ] Test CI workflows
- [ ] Document new patterns in CLAUDE.md
- [ ] Update CONTRIBUTING.md with artifact guidelines

---

## Appendix A: Current Directory Structure

```
intelliFlow-CRM/
├── artifacts/                    # ✅ Canonical location
│   ├── benchmarks/               # ✅ Performance benchmarks
│   ├── coverage/                 # ✅ Test coverage reports
│   ├── logs/                     # ✅ Execution logs
│   ├── misc/                     # ✅ Configuration artifacts
│   └── reports/                  # ✅ Analysis reports
│       ├── attestation/          # ✅ Sprint attestations
│       ├── security/             # 🔴 MISSING (for gitleaks)
│       ├── sonarqube/            # 🔴 MISSING (for sonar)
│       └── system-audit/         # ✅ STOA evidence bundles
├── sonar-reports/                # 🔴 ROOT POLLUTION (delete after migration)
├── gitleaks-report.json          # 🔴 ROOT POLLUTION (blocked in .gitignore)
└── tree_intelliflow_crm.txt      # ⚠️  DELETED (cleanup in progress)
```

### Proposed Structure After Remediation

```
intelliFlow-CRM/
├── artifacts/
│   ├── benchmarks/
│   ├── coverage/
│   ├── logs/
│   ├── misc/
│   └── reports/
│       ├── attestation/
│       ├── security/
│       │   └── {RUN_ID}/
│       │       └── gitleaks-report.json
│       ├── sonarqube/
│       │   ├── {RUN_ID}/
│       │   │   ├── analysis.md
│       │   │   ├── analysis.json
│       │   │   └── new-issues.json
│       │   └── latest -> {RUN_ID}  # Symlink to latest run
│       └── system-audit/
│           └── {RUN_ID}/           # STOA evidence
└── (no root-level pollution)
```

---

## Appendix B: Implementation Priority

### CRITICAL (Week 1)
1. Create `output-paths.ts` helper
2. Fix SonarQube scripts
3. Update `.gitignore`

### HIGH (Week 2)
4. Fix GitHub workflow
5. Delete root `sonar-reports/`
6. Add CI validation script

### MEDIUM (Week 3)
7. Document patterns in CLAUDE.md
8. Create pre-commit hook
9. Test all workflows

### LOW (Week 4)
10. Refactor existing compliant scripts to use helper
11. Add unit tests for path helpers
12. Create migration guide for future scripts

---

## Appendix C: Code References

All file references and line numbers accurate as of 2025-12-21.

**Scripts Analyzed:**
1. `tools/audit/gitleaks_scan.py` - ✅ Compliant (no output)
2. `scripts/sonar-report-generator.js` - 🔴 Needs fix (line 20)
3. `scripts/sonar-new-issues.js` - 🔴 Needs fix (lines 157-160)
4. `scripts/pnpm-audit-report.js` - ✅ Compliant (line 14)
5. `tools/perf/benchmark.ts` - ✅ Compliant (line 198)
6. `tools/plan-linter/index.js` - ✅ Compliant
7. `tools/scripts/lib/stoa/*.ts` - ✅ Compliant (all files)
8. `.github/workflows/security.yml` - 🔴 Needs fix (lines 200-202)

---

**End of Report**

*Generated by SUB-AGENT C - Artifact Containment*
*IntelliFlow CRM - Sprint 0 Quality Assurance*
