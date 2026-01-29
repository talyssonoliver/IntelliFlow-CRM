# IntelliFlow CRM - Systematic Code Review Guide

**Last Updated:** January 25, 2026
**Test Status:** ✅ Fully Validated
**Duration:** ~154 seconds (full analysis)

---

## 📋 Table of Contents

1. [Executive Summary](#executive-summary)
2. [Quick Start](#quick-start)
3. [Analysis Results](#analysis-results)
4. [How Reports Are Generated](#how-reports-are-generated)
5. [Usage Patterns](#usage-patterns)
6. [STOA Integration](#stoa-integration)
7. [Fixing Issues Found](#fixing-issues-found)
8. [CI/CD Integration](#cicd-integration)

---

## 📊 Executive Summary

### What This System Does

**Systematically analyzes all 26 workspace packages** to identify:
- TypeScript compilation errors
- Code quality issues (ESLint)
- Dead/unused code
- Dependency problems
- Circular dependencies
- Test coverage gaps
- Architecture violations
- High complexity functions

### Current Codebase Health (January 23, 2026)

| Metric | Status | Details |
|--------|--------|---------|
| **TypeScript Errors** | 🔴 **4 ERRORS** | Blocking API deployment |
| **Packages** | ✅ **26 analyzed** | All packages scanned |
| **High Complexity** | ⚠️ **283 files** | 33% need refactoring |
| **Average Complexity** | ⚠️ **19.39** | Target: <15 |
| **Test Coverage** | ℹ️ **Reports ready** | Per-package breakdown available |
| **Architecture** | ✅ **Validated** | Boundary tests pass |

### Priority Packages (Need Immediate Review)

**🔴 CRITICAL (4 packages - Score ≥60)**
1. `@intelliflow/web` (Score: 75) - 329 files, 81K LOC, missing tests
2. `@intelliflow/api` (Score: 65) - **HAS BLOCKING ERRORS**
3. `@intelliflow/application` (Score: 65) - Critical business logic
4. `@intelliflow/domain` (Score: 65) - Core domain model

**🟠 HIGH (5 packages - Score 40-59)**
5. `@intelliflow/ui` (Score: 55)
6. `@intelliflow/validators` (Score: 50)
7. `@intelliflow/adapters` (Score: 45)
8. `@intelliflow/typescript-config` (Score: 45)
9. `@intelliflow/plan-linter` (Score: 45)

---

## 🚀 Quick Start

### 1. Identify Priority Packages (30 seconds)

```bash
# Sprint-based output (recommended)
node scripts/prioritize-reviews.js --sprint=0

# Legacy path (deprecated)
node scripts/prioritize-reviews.js --legacy
```

**Output:** `.specify/sprints/sprint-0/reports/code-review/package-review/REVIEW-PRIORITY.md`

### 2. Run Analysis

**Quick Mode (2-3 minutes) - Daily use:**
```powershell
# Sprint 0 (default)
pwsh scripts/code-review-analysis.ps1 -Sprint 0 -Quick -CleanOldReports -KeepReports 3

# Other sprints
pwsh scripts/code-review-analysis.ps1 -Sprint 3 -Quick
```

**Full Mode (10-15 minutes) - Weekly deep dive:**
```powershell
pwsh scripts/code-review-analysis.ps1 -Sprint 0 -Full -CleanOldReports -KeepReports 3
```

**With STOA Gate Linkage (for task execution):**
```powershell
pwsh scripts/code-review-analysis.ps1 -Sprint 0 -TaskId "IFC-001" -LinkToGates -Quick
```

**Package-Specific:**
```powershell
pwsh scripts/code-review-analysis.ps1 -Sprint 0 -Package "@intelliflow/api" -Full
```

### 3. Review Reports

```powershell
# Find latest report (sprint-based path)
$latest = Get-ChildItem ".specify/sprints/sprint-0/reports/code-review" -Directory |
    Where-Object { $_.Name -match '^\d{8}-\d{6}-[a-f0-9]{8}$' } |
    Sort-Object Name -Descending |
    Select-Object -First 1

# Open key reports
code "$($latest.FullName)/typecheck.txt"
code "$($latest.FullName)/complexity.json"
code "$($latest.FullName)/summary.json"

# Or use the 'latest' junction
code ".specify/sprints/sprint-0/reports/code-review/latest/typecheck.txt"
```

---

## 🔍 Analysis Results (Latest Run)

### Critical Issues Found

#### 1. TypeScript Errors (🔴 BLOCKS DEPLOYMENT)

**Package:** `@intelliflow/api`  
**Count:** 4 errors  
**Impact:** API cannot build

```typescript
// apps/api/src/container.ts:19
error TS2305: Module '"@intelliflow/adapters"' has no exported member 'TicketService'

// apps/api/src/container.ts:20  
error TS2305: Module '"@intelliflow/adapters"' has no exported member 'AnalyticsService'

// apps/api/src/test/integration-setup.ts:29
error TS2305: Module '"@intelliflow/adapters"' has no exported member 'TicketService'

// apps/api/src/test/integration-setup.ts:30
error TS2305: Module '"@intelliflow/adapters"' has no exported member 'AnalyticsService'
```

**Root Cause:** Missing exports in `packages/adapters/src/index.ts`

**Fix:** [See Fixing Issues section](#fix-1-typescript-errors-in-api)

#### 2. High Complexity Functions (⚠️ REFACTOR NEEDED)

**Total:** 283 files with complexity >20  
**Worst Offenders:**

| File | Complexity | Lines | Issue |
|------|------------|-------|-------|
| `statistical-analysis.ts` | 73 | 774 | Unmaintainable |
| `feedback-analytics-generator.ts` | 43 | 614 | Too complex |
| `base.agent.ts` | 38 | 321 | Needs splitting |
| `email-writer.agent.ts` | 36 | 315 | High branching |
| `embedding.chain.ts` | 31 | 364 | Refactor candidates |

**Impact:** Hard to test, bug-prone, difficult to maintain

**Fix:** [See Fixing Issues section](#fix-2-high-complexity-files)

#### 3. Dead Code Detection Issues (⚠️ TOOLING ERROR)

**Status:** Knip command failed  
**Error:** `Invalid issue type: unlisted unresolved`

**Root Cause:** Incorrect Knip parameters in script

```powershell
# Current (broken):
pnpm knip --exclude unlisted,unresolved

# Should be:
pnpm knip --exclude=unlisted --exclude=unresolved
```

**Fix:** [See Fixing Issues section](#fix-3-knip-dead-code-detection)

#### 4. Circular Dependencies (⚠️ TOOLING MISSING)

**Status:** `madge` not installed globally  
**Error:** `The term 'madge' is not recognized`

**Fix:**
```bash
pnpm add -g madge
# or
npm install -g madge
```

#### 5. Test Coverage Summary

**Total Coverage:** Available per package in `coverage-summary.json` (118 KB)

**Format:**
```json
{
  "total": {
    "lines": {"pct": 65.3},
    "statements": {"pct": 64.1},
    "functions": {"pct": 72.1},
    "branches": {"pct": 58.7}
  }
}
```

**Next Step:** Review coverage gaps and add tests for critical paths

---

## 📁 How Reports Are Generated

### Report Structure

Each analysis creates a **timestamped directory** using sprint-based paths:

```
.specify/sprints/sprint-{N}/
├── reports/
│   └── code-review/
│       ├── 20260125-143022-abc123/     ← Latest run (runId format: YYYYMMDD-HHMMSS-UUID)
│       │   ├── typecheck.txt           - TypeScript errors
│       │   ├── lint.txt                - ESLint issues
│       │   ├── deadcode.json           - Unused code
│       │   ├── dependencies.json       - Unused deps
│       │   ├── outdated.json           - Package updates
│       │   ├── duplicates.json         - Duplicate deps
│       │   ├── circular-deps.json      - Import cycles
│       │   ├── coverage.txt            - Coverage summary
│       │   ├── coverage-summary.json   - Detailed coverage
│       │   ├── architecture.txt        - Boundary tests
│       │   ├── complexity.json         - Complexity metrics
│       │   └── summary.json            - STOA-compatible metadata
│       │
│       ├── 20260124-102030-def456/     ← Previous run (kept)
│       ├── latest/                      ← Junction to latest run
│       └── package-review/              ← Package priorities
│           ├── REVIEW-PRIORITY.md
│           ├── package-analysis.json
│           └── package-review-priorities.csv
│
└── execution/{taskId}/{runId}/matop/
    └── gates/                           ← STOA gate logs (when -LinkToGates)
        ├── turbo-typecheck.log
        └── eslint.log
```

**Note:** Legacy path `artifacts/reports/code-review-*` is deprecated. Use `-UseLegacyPath` flag only for backwards compatibility.

### Automatic Cleanup

**Reports are NOT overwritten** - each run creates new timestamped folder.

**Cleanup mechanism:**
```powershell
-CleanOldReports -KeepReports 3
```

- Keeps 3 most recent reports per sprint
- Deletes older reports automatically
- Prevents disk space accumulation
- Cleans both sprint-based and legacy paths

### Report Sizes

| Mode | Per Report | 10 Reports | Use Case |
|------|------------|------------|----------|
| **Quick** | ~8 KB | ~80 KB | Daily checks |
| **Full** | ~280 KB | ~2.8 MB | Weekly reviews |

---

## 🎯 Usage Patterns

### Daily Standup (Team)

```powershell
# Quick health check (2-3 min)
pwsh scripts/code-review-analysis.ps1 -Sprint 0 -Quick -CleanOldReports -KeepReports 2

# Review critical errors only
code ".specify/sprints/sprint-0/reports/code-review/latest/typecheck.txt"
```

### Weekly Deep Dive (Lead Developer)

```powershell
# Full analysis (10-15 min)
pwsh scripts/code-review-analysis.ps1 -Sprint 0 -Full -CleanOldReports -KeepReports 4

# Review all reports
$latest = Get-ChildItem ".specify/sprints/sprint-0/reports/code-review" -Directory |
    Where-Object { $_.Name -ne "latest" -and $_.Name -ne "package-review" } |
    Sort-Object Name -Descending | Select-Object -First 1
code $latest.FullName
```

### Pre-Release (QA)

```powershell
# Full analysis, keep for audit
pwsh scripts/code-review-analysis.ps1 -Sprint 0 -Full

# Generate release report with package priorities
node scripts/prioritize-reviews.js --sprint=0
```

### STOA Task Execution (AI Agents)

```powershell
# Run with STOA gate linkage for task tracking
pwsh scripts/code-review-analysis.ps1 -Sprint 0 -TaskId "IFC-001" -LinkToGates -Quick

# Verify gate outputs
ls ".specify/sprints/sprint-0/execution/IFC-001/*/matop/gates/"
```

### Package-Specific Review (After Changes)

```powershell
# Focus on modified package
pwsh scripts/code-review-analysis.ps1 `
  -Sprint 0 `
  -Package "@intelliflow/domain" `
  -Full `
  -CleanOldReports `
  -KeepReports 2
```

---

## 🔗 STOA Integration

The code review workflow is integrated with the STOA (Specialized Technical Oversight Agent) gate-runner for automated task validation.

### Gate Registration

Code review gates are registered in `audit-matrix.yml`:

| Gate ID | Tier | Description |
|---------|------|-------------|
| `code-review-analysis` | 2 | Quick code review (typecheck, lint) |
| `code-review-full` | 2 | Full analysis with coverage and complexity |
| `package-review-priority` | 2 | Package prioritization analysis |

### Running via STOA

When executing tasks through the MATOP (Multi-Agent Task Orchestration Protocol), code review gates can be triggered automatically:

```bash
# Via gate-runner
npx tsx tools/stoa/run-stoa.ts foundation IFC-001

# The gate-runner substitutes placeholders:
# {sprint} -> task's target sprint
# {taskId} -> task ID
# {runId} -> unique run ID
# {gatesDir} -> gates output directory
```

### Gate Linkage

When using `-LinkToGates`, key outputs are copied to the STOA gates directory:

```
.specify/sprints/sprint-0/execution/IFC-001/{runId}/matop/
├── gates/
│   ├── turbo-typecheck.log    ← From typecheck.txt
│   └── eslint.log             ← From lint.txt
└── summary.json               ← MATOP execution summary
```

This enables:
- **Audit trail**: All gate outputs preserved per task execution
- **Evidence integrity**: SHA256 hashes in evidence bundles
- **Verdict generation**: STOA verdicts based on gate results

### Summary.json Format (STOA-Compatible)

```json
{
  "runId": "20260125-143022-abc123",
  "taskId": "IFC-001",
  "sprint": 0,
  "startedAt": "2026-01-25T14:30:22.000Z",
  "completedAt": "2026-01-25T14:32:45.000Z",
  "mode": "code-review",
  "scope": "Full monorepo",
  "duration": {
    "typecheck": 45.2,
    "lint": 23.1
  },
  "linkedToGates": true,
  "gatesDir": ".specify/sprints/sprint-0/execution/IFC-001/20260125-143022-abc123/matop/gates"
}
```

### Path Functions (TypeScript)

For programmatic access, use the path functions from `tools/scripts/lib/code-review/paths.ts`:

```typescript
import {
  getCodeReviewDir,
  getPackageReviewDir,
  getGatesLinkageDir,
  generateCodeReviewRunId,
} from '../tools/scripts/lib/code-review/paths.js';

// Get report directory
const reportDir = getCodeReviewDir(repoRoot, sprint, runId);
// => .specify/sprints/sprint-0/reports/code-review/20260125-143022-abc123/

// Get package review directory
const pkgDir = getPackageReviewDir(repoRoot, sprint);
// => .specify/sprints/sprint-0/reports/code-review/package-review/

// Get STOA gates directory
const gatesDir = getGatesLinkageDir(repoRoot, sprint, taskId, runId);
// => .specify/sprints/sprint-0/execution/IFC-001/20260125-143022-abc123/matop/gates/
```

---

## 🔧 Fixing Issues Found

> **⚠️ IMPORTANT NOTE:** The current workflow only **validates and reports** issues.  
> **It does NOT automatically fix** any problems found.  
> You must manually address each issue below.

### Fix 1: TypeScript Errors in API

**Problem:** `@intelliflow/api` imports non-existent exports from `@intelliflow/adapters`

**Solution:**

1. **Option A - Export the missing services:**

```typescript
// packages/adapters/src/index.ts

// Add missing exports
export { TicketService } from './services/ticket.service';
export { AnalyticsService } from './services/analytics.service';
```

2. **Option B - Remove unused imports:**

```typescript
// apps/api/src/container.ts

// Remove if not actually needed:
// import { TicketService, AnalyticsService } from '@intelliflow/adapters';
```

3. **Verify fix:**

```bash
cd apps/api
pnpm typecheck
# Should show 0 errors
```

### Fix 2: High Complexity Files

**Problem:** 283 files with complexity >20 (target: <15)

**Top Priority:** `statistical-analysis.ts` (complexity: 73)

**Refactoring Strategy:**

```typescript
// BEFORE: statistical-analysis.ts (complexity: 73)
export function analyzeStatistics(data: Data): Result {
  // 774 lines of complex nested logic
  if (condition1) {
    if (condition2) {
      if (condition3) {
        // Deep nesting...
      }
    }
  }
  // Many more branches...
}

// AFTER: Break into smaller functions
export function analyzeStatistics(data: Data): Result {
  const cleaned = cleanData(data);              // complexity: 5
  const validated = validateData(cleaned);      // complexity: 4
  const transformed = transformData(validated); // complexity: 6
  const calculated = calculateMetrics(transformed); // complexity: 7
  return formatResults(calculated);             // complexity: 3
}
// Total: 5 functions, average complexity: 5
```

**Action Plan:**

1. **Identify refactoring candidates:**
```powershell
$complexity = Get-Content artifacts/reports/code-review-*/complexity.json | ConvertFrom-Json
$complexity.packages | Where-Object { $_.complexity -gt 30 } | Format-Table
```

2. **Extract functions:**
   - Break large functions into 4-6 smaller ones
   - Each function should do ONE thing
   - Target complexity <10 per function

3. **Add tests for each extracted function**

4. **Re-run analysis:**
```powershell
pwsh scripts/code-review-analysis.ps1 -Full
# Check complexity.json - should see reduction
```

### Fix 3: Knip Dead Code Detection

**Status:** ✅ FIXED (January 25, 2026)

The Knip command syntax has been corrected in `scripts/code-review-analysis.ps1`:

```powershell
# Now uses correct syntax:
pnpm knip --exclude=unlisted --exclude=unresolved --reporter json
```

**Alternative config file approach:**

```json
// knip.json
{
  "$schema": "https://unpkg.com/knip@5/schema.json",
  "exclude": ["unlisted", "unresolved"],
  // ... rest of config
}
```

Then run:
```bash
pnpm knip --reporter json
```

### Fix 4: Install Missing Tools

**Problem:** `madge` not installed for circular dependency detection

**Note:** The analysis script now includes automatic detection and will warn if madge is not installed, rather than failing silently.

**Fix:**

```bash
# Install globally (recommended)
pnpm add -g madge

# Or locally per project
pnpm add -D madge

# Verify installation
madge --version
```

**Then re-run full analysis:**
```powershell
pwsh scripts/code-review-analysis.ps1 -Sprint 0 -Full
# circular-deps.json should now contain data instead of { "skipped": true }
```

### Fix 5: Improve Test Coverage

**Current State:** Coverage data available in `coverage-summary.json`

**View coverage:**
```bash
# Open HTML coverage report
start artifacts/coverage/index.html

# Or check JSON
$coverage = Get-Content artifacts/reports/code-review-*/coverage-summary.json | ConvertFrom-Json
$coverage.total.lines.pct  # Overall line coverage %
```

**Target Goals:**
- Critical packages (api, domain, application): >80%
- High priority packages: >70%
- All packages: >60%

**Action Plan:**

1. **Identify gaps:**
```powershell
$coverage = Get-Content artifacts/reports/code-review-*/coverage-summary.json | ConvertFrom-Json
$coverage.PSObject.Properties | 
  Where-Object { $_.Value.lines.pct -lt 60 } |
  Select-Object Name, @{N='Coverage';E={$_.Value.lines.pct}} |
  Sort-Object Coverage
```

2. **Add tests for uncovered code**

3. **Focus on critical paths first** (authentication, payments, data access)

### Fix 6: Plan Linter Governance Issues

**Problem:** 39 governance errors in Sprint 0 tasks

**Sample errors:**
```
[TIER_A_GATES_REQUIRED] Tier A task IFC-093 missing gate_profile
[TIER_A_OWNER_REQUIRED] Tier A task IFC-093 missing acceptance_owner
[TIER_A_EVIDENCE_REQUIRED] Tier A task IFC-093 missing evidence_required
```

**Fix:** Update Sprint plan CSV with required governance fields

**Location:** `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`

**Required fields for Tier A tasks:**
- `gate_profile`
- `acceptance_owner`
- `evidence_required`

---

## 🤖 CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/code-quality.yml
name: Code Quality Check

on:
  pull_request:
    branches: [main, develop]
  schedule:
    - cron: '0 8 * * *'  # Daily at 8 AM

env:
  SPRINT: 0  # Current sprint number

jobs:
  quick-check:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v3

      - uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Install dependencies
        run: pnpm install

      - name: Quick Code Review
        run: pwsh scripts/code-review-analysis.ps1 -Sprint $env:SPRINT -Quick

      - name: Check for TypeScript Errors
        run: |
          $reportDir = ".specify/sprints/sprint-$env:SPRINT/reports/code-review/latest"
          $errors = Select-String -Path "$reportDir/typecheck.txt" -Pattern "error TS"
          if ($errors.Count -gt 0) {
            Write-Error "Found $($errors.Count) TypeScript errors"
            exit 1
          }

      - name: Upload Reports
        uses: actions/upload-artifact@v3
        with:
          name: code-review-reports
          path: .specify/sprints/sprint-${{ env.SPRINT }}/reports/code-review/

  full-analysis:
    runs-on: windows-latest
    if: github.event_name == 'schedule'
    steps:
      - uses: actions/checkout@v3

      - uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Install dependencies
        run: pnpm install

      - name: Install madge globally
        run: pnpm add -g madge

      - name: Full Code Review
        run: pwsh scripts/code-review-analysis.ps1 -Sprint $env:SPRINT -Full -CleanOldReports -KeepReports 5

      - name: Generate Package Priorities
        run: node scripts/prioritize-reviews.js --sprint=$env:SPRINT

      - name: Upload Full Reports
        uses: actions/upload-artifact@v3
        with:
          name: full-code-review
          path: .specify/sprints/sprint-${{ env.SPRINT }}/reports/code-review/
```

### Quality Gates

**Block PR merge if:**
- TypeScript errors > 0
- New files with complexity > 30
- Test coverage drops >5%

```yaml
- name: Quality Gate
  run: |
    $reportDir = ".specify/sprints/sprint-$env:SPRINT/reports/code-review/latest"

    # Check TypeScript
    $tsErrors = (Select-String "$reportDir/typecheck.txt" -Pattern "error TS").Count
    if ($tsErrors -gt 0) {
      Write-Error "TypeScript errors: $tsErrors"
      exit 1
    }

    # Check complexity
    $complexity = Get-Content "$reportDir/complexity.json" | ConvertFrom-Json
    $highComplexity = ($complexity.packages | Where-Object {$_.complexity -gt 30}).Count
    if ($highComplexity -gt 283) {  # Current baseline
      Write-Error "New high complexity files added"
      exit 1
    }

    Write-Host "Quality gates passed"
```

---

## 📊 Tracking Progress Over Time

### Export Metrics for Trending

```powershell
$sprint = 0
$baseDir = ".specify/sprints/sprint-$sprint/reports/code-review"

# Track TypeScript errors over time
Get-ChildItem $baseDir -Directory |
  Where-Object { $_.Name -match '^\d{8}-\d{6}-[a-f0-9]{8}$' } |
  Sort-Object Name |
  ForEach-Object {
    $runId = $_.Name
    $errors = (Select-String "$($_.FullName)/typecheck.txt" -Pattern "error TS").Count
    [PSCustomObject]@{
      RunId = $runId
      TypeScriptErrors = $errors
    }
  } | Export-Csv "$baseDir/typescript-errors-trend.csv" -NoTypeInformation

# Track complexity over time
Get-ChildItem $baseDir -Directory |
  Where-Object { $_.Name -match '^\d{8}-\d{6}-[a-f0-9]{8}$' } |
  Sort-Object Name |
  ForEach-Object {
    $runId = $_.Name
    $complexity = Get-Content "$($_.FullName)/complexity.json" | ConvertFrom-Json
    [PSCustomObject]@{
      RunId = $runId
      AvgComplexity = $complexity.summary.averageComplexity
      HighComplexityFiles = $complexity.summary.highComplexityFiles
    }
  } | Export-Csv "$baseDir/complexity-trend.csv" -NoTypeInformation
```

### Visualize Trends

Import CSV files into Excel/Google Sheets and create charts:
- TypeScript errors over time → Should trend to 0
- Average complexity → Should trend down to <15
- Test coverage → Should trend up to >70%

---

## ✅ Success Criteria

**After completing systematic reviews, the codebase should have:**

- [ ] **Zero TypeScript errors** (currently: 4)
- [ ] **Average complexity <15** (currently: 19.39)
- [ ] **<100 high complexity files** (currently: 283)
- [ ] **Test coverage >70% for critical packages**
- [ ] **No circular dependencies**
- [ ] **All unused dependencies removed**
- [ ] **All governance issues resolved** (plan-linter)
- [ ] **Architecture boundaries validated**

---

## 🎓 Key Takeaways

### What This Workflow Does ✅

1. **Identifies 26 packages** by priority (4 critical, 5 high, 6 medium, 11 low)
2. **Runs 8 comprehensive checks** (typecheck, lint, dead code, deps, circular, coverage, architecture, complexity)
3. **Generates 12 report files** (~280 KB per full run)
4. **Auto-cleans old reports** (keeps last N runs)
5. **Provides actionable metrics** (what's broken, where, how bad)

### What This Workflow Does NOT Do ❌

1. **Does NOT automatically fix** any issues found
2. **Does NOT refactor** complex code
3. **Does NOT write tests** for coverage gaps
4. **Does NOT resolve** circular dependencies
5. **Does NOT update** outdated packages
6. **Requires manual intervention** for all fixes

### Next Actions Required

1. **Fix TypeScript errors** in `@intelliflow/api` ([Fix 1](#fix-1-typescript-errors-in-api))
2. **Refactor high complexity files** ([Fix 2](#fix-2-high-complexity-files))
3. **Fix Knip command** ([Fix 3](#fix-3-knip-dead-code-detection))
4. **Install madge** ([Fix 4](#fix-4-install-missing-tools))
5. **Improve test coverage** ([Fix 5](#fix-5-improve-test-coverage))
6. **Update Sprint governance** ([Fix 6](#fix-6-plan-linter-governance-issues))

---

## 📞 Support

**Questions?** Check existing reports:
- Package priorities: `.specify/sprints/sprint-0/reports/code-review/package-review/REVIEW-PRIORITY.md`
- Latest analysis: `.specify/sprints/sprint-0/reports/code-review/latest/`
- Trend data: `.specify/sprints/sprint-0/reports/code-review/*-trend.csv`
- STOA gate outputs: `.specify/sprints/sprint-0/execution/{taskId}/{runId}/matop/gates/`

**Commands:**
```powershell
# Quick reference
pwsh scripts/code-review-analysis.ps1 -?
node scripts/prioritize-reviews.js --help

# Available parameters
# -Sprint N        : Target sprint number (default: 0)
# -TaskId ID       : Task ID for STOA gate linkage
# -LinkToGates     : Copy outputs to STOA gates directory
# -Quick           : Fast analysis (typecheck + lint only)
# -Full            : Complete analysis with all checks
# -CleanOldReports : Remove old reports
# -KeepReports N   : Number of reports to keep (default: 5)
# -UseLegacyPath   : Use deprecated artifacts/reports/ path
```

**Path Functions (TypeScript):**
```typescript
import { getCodeReviewDir, getPackageReviewDir } from './tools/scripts/lib/code-review/paths.js';
```

---

**Last Updated:** January 25, 2026
**Analysis Duration:** 154 seconds (full mode)
**Path Migration:** Completed - now uses `.specify/sprints/` structure
**Next Review Due:** February 1, 2026 (weekly cadence)
