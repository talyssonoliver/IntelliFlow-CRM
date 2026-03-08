---
name: code-review
description: |
  Run comprehensive code review analysis on the IntelliFlow CRM codebase. Use this skill when the user asks to:
  - Run code review or code analysis
  - Check code quality, find issues, or analyze the codebase
  - Prioritize which packages need review
  - Run typecheck, lint, or quality checks
  - Find dead code, complexity issues, or coverage gaps
  - Prepare for PR review or release
  Supports quick mode (typecheck+lint, ~2-3 min) and full mode (all 8 checks, ~10-15 min).
---

# Code Review Skill

Analyze IntelliFlow CRM codebase quality using `code-review-analysis.ps1` and `prioritize-reviews.js`.

## Quick Reference

| Mode | Duration | Checks |
|------|----------|--------|
| Quick | 2-3 min | TypeScript, ESLint |
| Full | 10-15 min | TypeScript, ESLint, Knip, deps, circular, coverage, architecture, complexity |

## Workflow

### 1. Determine Sprint Context

Check current sprint from recent analysis or ask user:

```powershell
# Find most recent analysis to determine current sprint
$latestReports = Get-ChildItem ".specify/sprints" -Directory |
  Where-Object { $_.Name -match "^sprint-\d+$" } |
  Sort-Object { [int]($_.Name -replace "sprint-", "") } -Descending
```

Default: Sprint 0. If sprint 0 analysis exists and is recent (<24h), suggest next sprint or ask.

### 2. Run Analysis

**Quick mode** (default for daily checks):
```powershell
pwsh scripts/code-review-analysis.ps1 -Sprint <N> -Quick -CleanOldReports -KeepReports 3
```

**Full mode** (weekly deep dive or pre-release):
```powershell
pwsh scripts/code-review-analysis.ps1 -Sprint <N> -Full -CleanOldReports -KeepReports 3
```

**With task linkage** (for STOA/MATOP tracking):
```powershell
pwsh scripts/code-review-analysis.ps1 -Sprint <N> -TaskId "<TASK-ID>" -LinkToGates -Quick
```

**Package-specific**:
```powershell
pwsh scripts/code-review-analysis.ps1 -Sprint <N> -Package "@intelliflow/api" -Full
```

### 3. Run Package Prioritization

Always run after analysis to rank packages:
```bash
node scripts/prioritize-reviews.js --sprint=<N>
```

### 4. Parse and Summarize Results

Read key output files and extract findings. See [references/result-parsing.md](references/result-parsing.md) for parsing details.

**Report locations** (sprint-based):
```
.specify/sprints/sprint-{N}/reports/code-review/
├── latest/                    <- Junction to most recent run
│   ├── typecheck.txt          <- TypeScript errors
│   ├── lint.txt               <- ESLint issues
│   ├── deadcode.json          <- Unused code (Knip)
│   ├── complexity.json        <- Cyclomatic complexity
│   ├── coverage-summary.json  <- Test coverage
│   ├── circular-deps.json     <- Import cycles
│   ├── architecture.txt       <- Boundary tests
│   └── summary.json           <- Run metadata
└── package-review/
    ├── REVIEW-PRIORITY.md     <- Human-readable priorities
    ├── package-analysis.json  <- Detailed package data
    └── package-review-priorities.csv
```

### 5. Present Summary

Structure the summary as:

```markdown
## Code Review Summary - Sprint {N}

**Run ID**: {runId}
**Mode**: Quick/Full
**Duration**: {duration}s

### Critical Issues (Blocking)

| Type | Count | Location | Impact |
|------|-------|----------|--------|
| TypeScript Errors | X | @intelliflow/api | Blocks build |

### Warnings

| Type | Count | Details |
|------|-------|---------|
| High Complexity | X files | >20 cyclomatic complexity |
| Low Coverage | X packages | <70% line coverage |

### Package Priority

| Priority | Packages |
|----------|----------|
| CRITICAL | @intelliflow/web, @intelliflow/api |
| HIGH | @intelliflow/domain, @intelliflow/application |

### Sprint/Task Links

- **Sprint Plan**: `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`
- **Related Tasks**: IFC-xxx, IFC-yyy (based on affected packages)
- **Tracker**: http://localhost:3002/

### Reports

- Full report: `.specify/sprints/sprint-{N}/reports/code-review/latest/`
- Package priorities: `.specify/sprints/sprint-{N}/reports/code-review/package-review/REVIEW-PRIORITY.md`
```

### 6. Suggest Fixes

For each issue category, provide actionable fix guidance. See [references/fix-guidance.md](references/fix-guidance.md) for detailed patterns.

## Task-Sprint Mapping

Link findings to sprint plan tasks:

| Package | Related Tasks |
|---------|---------------|
| @intelliflow/domain | IFC-002, IFC-101-105 |
| @intelliflow/application | IFC-106, IFC-108 |
| @intelliflow/api | IFC-003, IFC-074 |
| @intelliflow/web | PG-001 through PG-026 |
| @intelliflow/adapters | IFC-106 |
| @intelliflow/validators | IFC-003 |

To find specific task relationships:
```powershell
# Search sprint plan for package-related tasks
Select-String -Path "apps/project-tracker/docs/metrics/_global/Sprint_plan.csv" -Pattern "domain|api|web"
```

## Parameters Reference

| Parameter | Description | Default |
|-----------|-------------|---------|
| `-Sprint` | Target sprint number | 0 |
| `-Quick` | TypeScript + ESLint only | false |
| `-Full` | All 8 analysis checks | false |
| `-Package` | Analyze specific package | all |
| `-TaskId` | Link to STOA task | none |
| `-LinkToGates` | Copy outputs to gates/ | false |
| `-CleanOldReports` | Remove old reports | false |
| `-KeepReports` | Number to retain | 5 |
