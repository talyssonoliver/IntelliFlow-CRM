# Result Parsing Reference

How to parse and interpret code review output files.

## Table of Contents

1. [Summary.json](#summaryjson)
2. [TypeScript Errors](#typescript-errors-typechecktxt)
3. [ESLint Issues](#eslint-issues-linttxt)
4. [Complexity Metrics](#complexity-metrics-complexityjson)
5. [Coverage Data](#coverage-data-coverage-summaryjson)
6. [Dead Code](#dead-code-deadcodejson)
7. [Package Priorities](#package-priorities-package-analysisjson)
8. [Circular Dependencies](#circular-dependencies-circular-depsjson)

---

## summary.json

Run metadata and timing information.

**Location**: `.specify/sprints/sprint-{N}/reports/code-review/latest/summary.json`

**Structure**:
```json
{
  "runId": "20260125-143022-abc12345",
  "taskId": "IFC-001",
  "sprint": 0,
  "startedAt": "2026-01-25T14:30:22.000Z",
  "completedAt": "2026-01-25T14:32:45.000Z",
  "mode": "code-review",
  "scope": "Full monorepo",
  "duration": {
    "typecheck": 45.2,
    "lint": 23.1,
    "deadcode": 12.5,
    "coverage": 89.3
  },
  "linkedToGates": true,
  "gatesDir": ".specify/sprints/sprint-0/execution/IFC-001/20260125-143022-abc12345/matop/gates"
}
```

**Extract with PowerShell**:
```powershell
$summary = Get-Content ".specify/sprints/sprint-0/reports/code-review/latest/summary.json" | ConvertFrom-Json
Write-Host "Run: $($summary.runId), Duration: $($summary.duration.typecheck + $summary.duration.lint)s"
```

---

## TypeScript Errors (typecheck.txt)

**Location**: `.specify/sprints/sprint-{N}/reports/code-review/latest/typecheck.txt`

**Format**: Turbo output with TypeScript compiler errors

**Pattern to extract errors**:
```powershell
$errors = Select-String -Path ".specify/sprints/sprint-0/reports/code-review/latest/typecheck.txt" -Pattern "error TS\d+"
$errorCount = $errors.Count
$uniqueErrors = $errors | ForEach-Object {
  if ($_ -match 'error (TS\d+)') { $matches[1] }
} | Sort-Object -Unique
```

**Common error codes**:
| Code | Meaning |
|------|---------|
| TS2305 | Module has no exported member |
| TS2339 | Property does not exist on type |
| TS2345 | Argument type mismatch |
| TS2322 | Type not assignable |
| TS7006 | Parameter implicitly has 'any' type |

**Extract file locations**:
```powershell
# Pattern: apps/api/src/file.ts(line,col): error TSxxxx
$fileErrors = Select-String -Path "typecheck.txt" -Pattern "^[^:]+:\d+:\d+.*error TS"
$affectedFiles = $fileErrors | ForEach-Object {
  if ($_ -match '^([^:]+):\d+:\d+') { $matches[1] }
} | Sort-Object -Unique
```

---

## ESLint Issues (lint.txt)

**Location**: `.specify/sprints/sprint-{N}/reports/code-review/latest/lint.txt`

**Count errors and warnings**:
```powershell
$lintContent = Get-Content ".specify/sprints/sprint-0/reports/code-review/latest/lint.txt" -Raw
$errorCount = ([regex]::Matches($lintContent, "\d+ error")).Count
$warningCount = ([regex]::Matches($lintContent, "\d+ warning")).Count
```

**Extract problem files**:
```powershell
# Files with issues have format: /path/to/file.ts
$problemFiles = Select-String -Path "lint.txt" -Pattern "^\s*\d+:\d+\s+(error|warning)" -Context 0,0
```

---

## Complexity Metrics (complexity.json)

**Location**: `.specify/sprints/sprint-{N}/reports/code-review/latest/complexity.json`

**Structure**:
```json
{
  "timestamp": "2026-01-25T14:32:45.000Z",
  "summary": {
    "totalFiles": 856,
    "totalLines": 125000,
    "averageComplexity": 19.39,
    "highComplexityFiles": 283
  },
  "packages": [
    {
      "file": "/apps/ai-worker/src/analytics/statistical-analysis.ts",
      "lines": 774,
      "complexity": 73,
      "warning": "High complexity"
    }
  ]
}
```

**Parse high complexity files**:
```powershell
$complexity = Get-Content ".specify/sprints/sprint-0/reports/code-review/latest/complexity.json" | ConvertFrom-Json

# Summary
Write-Host "Average complexity: $($complexity.summary.averageComplexity)"
Write-Host "High complexity files: $($complexity.summary.highComplexityFiles)"

# Top offenders (complexity > 30)
$critical = $complexity.packages | Where-Object { $_.complexity -gt 30 } | Sort-Object complexity -Descending
$critical | Select-Object -First 10 | Format-Table file, complexity, lines
```

**Thresholds**:
| Complexity | Status | Action |
|------------|--------|--------|
| 1-10 | Good | None |
| 11-20 | Acceptable | Monitor |
| 21-30 | High | Refactor when touched |
| >30 | Critical | Prioritize refactoring |

---

## Coverage Data (coverage-summary.json)

**Location**: `.specify/sprints/sprint-{N}/reports/code-review/latest/coverage-summary.json`

**Structure**:
```json
{
  "total": {
    "lines": { "total": 10000, "covered": 6530, "pct": 65.3 },
    "statements": { "total": 12000, "covered": 7692, "pct": 64.1 },
    "functions": { "total": 800, "covered": 577, "pct": 72.1 },
    "branches": { "total": 2000, "covered": 1174, "pct": 58.7 }
  },
  "/packages/domain/src/index.ts": {
    "lines": { "total": 50, "covered": 48, "pct": 96 }
  }
}
```

**Parse overall coverage**:
```powershell
$coverage = Get-Content ".specify/sprints/sprint-0/reports/code-review/latest/coverage-summary.json" | ConvertFrom-Json
Write-Host "Line coverage: $($coverage.total.lines.pct)%"
Write-Host "Branch coverage: $($coverage.total.branches.pct)%"
```

**Find low coverage packages**:
```powershell
$lowCoverage = $coverage.PSObject.Properties |
  Where-Object { $_.Name -ne "total" -and $_.Value.lines.pct -lt 60 } |
  Select-Object Name, @{N='Coverage';E={$_.Value.lines.pct}} |
  Sort-Object Coverage
```

---

## Dead Code (deadcode.json)

**Location**: `.specify/sprints/sprint-{N}/reports/code-review/latest/deadcode.json`

**Structure** (Knip output):
```json
{
  "files": ["src/unused-file.ts"],
  "dependencies": ["unused-package"],
  "devDependencies": ["unused-dev-package"],
  "exports": [
    { "name": "unusedExport", "file": "src/utils.ts", "line": 42 }
  ],
  "types": [
    { "name": "UnusedType", "file": "src/types.ts" }
  ]
}
```

**Parse results**:
```powershell
$deadcode = Get-Content ".specify/sprints/sprint-0/reports/code-review/latest/deadcode.json" | ConvertFrom-Json

Write-Host "Unused files: $($deadcode.files.Count)"
Write-Host "Unused dependencies: $($deadcode.dependencies.Count)"
Write-Host "Unused exports: $($deadcode.exports.Count)"
```

---

## Package Priorities (package-analysis.json)

**Location**: `.specify/sprints/sprint-{N}/reports/code-review/package-review/package-analysis.json`

**Structure**:
```json
{
  "timestamp": "2026-01-25T14:35:00.000Z",
  "sprint": 0,
  "totalPackages": 26,
  "priorityCounts": {
    "CRITICAL": 4,
    "HIGH": 5,
    "MEDIUM": 6,
    "LOW": 11
  },
  "packages": [
    {
      "name": "@intelliflow/web",
      "path": "apps/web",
      "score": 75,
      "priority": "CRITICAL",
      "metrics": {
        "sourceFiles": 329,
        "linesOfCode": 81000,
        "dependencies": 45,
        "coverage": { "lines": 42, "branches": 35 }
      },
      "risks": [
        "Large package (>50 files)",
        "High LOC (>5000 lines)",
        "Low test coverage (<50%)"
      ]
    }
  ]
}
```

**Parse priorities**:
```powershell
$analysis = Get-Content ".specify/sprints/sprint-0/reports/code-review/package-review/package-analysis.json" | ConvertFrom-Json

# Priority summary
$analysis.priorityCounts | Format-Table

# Critical packages
$critical = $analysis.packages | Where-Object { $_.priority -eq "CRITICAL" }
$critical | Select-Object name, score, @{N='Risks';E={$_.risks -join "; "}} | Format-Table
```

**Priority scoring**:
| Factor | Points |
|--------|--------|
| >20 dependencies | +10 |
| No test script | +20 |
| No typecheck script | +10 |
| >50 source files | +15 |
| >5000 LOC | +15 |
| Coverage <50% | +25 |
| Coverage <70% | +10 |
| No coverage data | +15 |
| Critical package | +20 |
| >10 TODO comments | +10 |

**Priority thresholds**:
| Score | Priority |
|-------|----------|
| >=60 | CRITICAL |
| 40-59 | HIGH |
| 20-39 | MEDIUM |
| <20 | LOW |

---

## Circular Dependencies (circular-deps.json)

**Location**: `.specify/sprints/sprint-{N}/reports/code-review/latest/circular-deps.json`

**Structure**:
```json
[
  {
    "package": "apps/api/src",
    "circular": [
      ["moduleA.ts", "moduleB.ts", "moduleC.ts", "moduleA.ts"]
    ]
  }
]
```

**Or if skipped**:
```json
{
  "skipped": true,
  "reason": "madge not installed"
}
```

**Parse results**:
```powershell
$circular = Get-Content ".specify/sprints/sprint-0/reports/code-review/latest/circular-deps.json" | ConvertFrom-Json

if ($circular.skipped) {
  Write-Host "Skipped: $($circular.reason)"
} else {
  $totalCycles = ($circular | ForEach-Object { $_.circular.Count } | Measure-Object -Sum).Sum
  Write-Host "Total circular dependency cycles: $totalCycles"
}
```
