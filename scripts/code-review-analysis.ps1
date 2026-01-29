#!/usr/bin/env pwsh
# Comprehensive Code Review Analysis for IntelliFlow CRM
# Analyzes all 25 workspace packages systematically
#
# Output path: .specify/sprints/sprint-{N}/reports/code-review/{runId}/
# With -LinkToGates: Also copies to STOA gates directory

param(
    [int]$Sprint = 0,                    # Target sprint number
    [string]$TaskId = "",                # Optional task for STOA gate linkage
    [switch]$Quick,
    [switch]$Full,
    [string]$Package = "",
    [switch]$GenerateReport,
    [switch]$CleanOldReports,
    [int]$KeepReports = 5,
    [switch]$LinkToGates,                # Route key outputs to STOA gates/
    [switch]$UseLegacyPath               # Use old artifacts/reports/ path (deprecated)
)

$ErrorActionPreference = "Continue"
$scriptStartTime = Get-Date

# Generate run ID in STOA-compatible format: YYYYMMDD-HHMMSS-UUID
$runId = "$(Get-Date -Format 'yyyyMMdd-HHmmss')-$([guid]::NewGuid().ToString().Substring(0,8))"

# Determine output path
if ($UseLegacyPath) {
    Write-Host "⚠️  Warning: -UseLegacyPath is deprecated. Use sprint-based paths instead." -ForegroundColor Yellow
    $reportPath = "artifacts/reports/code-review-$(Get-Date -Format 'yyyy-MM-dd-HHmmss')"
    $latestLink = "artifacts/reports/code-review-latest"
} else {
    # Sprint-based canonical path
    $reportPath = ".specify/sprints/sprint-$Sprint/reports/code-review/$runId"
    $latestLink = ".specify/sprints/sprint-$Sprint/reports/code-review/latest"
}

New-Item -ItemType Directory -Path $reportPath -Force | Out-Null

# Create symlink to latest report for easy access
if (Test-Path $latestLink) {
    Remove-Item $latestLink -Force -Recurse -ErrorAction SilentlyContinue
}
New-Item -ItemType Junction -Path $latestLink -Target (Resolve-Path $reportPath).Path -Force -ErrorAction SilentlyContinue | Out-Null

# STOA gates directory for linkage
$gatesDir = $null
if ($LinkToGates -and $TaskId) {
    $gatesDir = ".specify/sprints/sprint-$Sprint/execution/$TaskId/$runId/matop/gates"
    New-Item -ItemType Directory -Path $gatesDir -Force | Out-Null
    Write-Host "📎 STOA gate linkage enabled: $gatesDir" -ForegroundColor Cyan
}

# Clean old reports if requested (keep only last N)
if ($CleanOldReports) {
    Write-Host "🧹 Cleaning old reports (keeping last $KeepReports)..." -ForegroundColor Yellow

    # Clean sprint-based reports
    $sprintReportsDir = ".specify/sprints/sprint-$Sprint/reports/code-review"
    if (Test-Path $sprintReportsDir) {
        $oldReports = Get-ChildItem $sprintReportsDir -Directory |
            Where-Object { $_.Name -match "^\d{8}-\d{6}-[a-f0-9]{8}$" } |
            Sort-Object Name -Descending |
            Select-Object -Skip $KeepReports

        if ($oldReports) {
            $oldReports | ForEach-Object {
                Write-Host "   Removing: $($_.Name)" -ForegroundColor Gray
                Remove-Item $_.FullName -Recurse -Force
            }
            Write-Host "   ✓ Cleaned $($oldReports.Count) old report(s)" -ForegroundColor Green
        } else {
            Write-Host "   ✓ No old reports to clean" -ForegroundColor Green
        }
    }

    # Also clean legacy path if it exists
    if (Test-Path "artifacts/reports") {
        $legacyReports = Get-ChildItem "artifacts/reports" -Directory |
            Where-Object { $_.Name -match "^code-review-\d{4}-\d{2}-\d{2}-\d{6}$" } |
            Sort-Object Name -Descending |
            Select-Object -Skip $KeepReports

        if ($legacyReports) {
            $legacyReports | ForEach-Object {
                Write-Host "   Removing (legacy): $($_.Name)" -ForegroundColor Gray
                Remove-Item $_.FullName -Recurse -Force
            }
            Write-Host "   ✓ Cleaned $($legacyReports.Count) legacy report(s)" -ForegroundColor Green
        }
    }
}

Write-Host "🔍 IntelliFlow CRM - Code Review Analysis" -ForegroundColor Cyan
Write-Host "=" * 60

# Get all workspace packages
$workspaces = pnpm list -r --depth -1 --json 2>$null | ConvertFrom-Json
$packageCount = $workspaces.Count

Write-Host "`n📦 Found $packageCount workspace packages" -ForegroundColor Green

# 1. Type Safety Analysis
Write-Host "`n[1/8] 🔧 TypeScript Type Safety..." -ForegroundColor Yellow
$typecheckStart = Get-Date
if ($Package) {
    pnpm --filter $Package typecheck 2>&1 | Tee-Object "$reportPath/typecheck.txt"
} else {
    # Exclude project-tracker (temporary dev tool, will be removed after MVP)
    pnpm -r --filter '!@intelliflow/project-tracker' typecheck 2>&1 | Tee-Object "$reportPath/typecheck.txt"
}
$typecheckDuration = (Get-Date) - $typecheckStart
Write-Host "   ✓ Completed in $($typecheckDuration.TotalSeconds)s" -ForegroundColor Green

# 2. Linting Analysis
Write-Host "`n[2/8] 📋 ESLint Code Quality..." -ForegroundColor Yellow
$lintStart = Get-Date
if ($Package) {
    pnpm --filter $Package lint 2>&1 | Tee-Object "$reportPath/lint.txt"
} else {
    pnpm -r lint 2>&1 | Tee-Object "$reportPath/lint.txt"
}
$lintDuration = (Get-Date) - $lintStart
Write-Host "   ✓ Completed in $($lintDuration.TotalSeconds)s" -ForegroundColor Green

if (!$Quick) {
    # 3. Dead Code Detection
    Write-Host "`n[3/8] 🧹 Dead Code Analysis (Knip)..." -ForegroundColor Yellow
    $knipStart = Get-Date
    pnpm knip --exclude=unlisted --exclude=unresolved --reporter json 2>&1 | 
        Tee-Object "$reportPath/deadcode.json" |
        Out-Null
    $knipDuration = (Get-Date) - $knipStart
    Write-Host "   ✓ Completed in $($knipDuration.TotalSeconds)s" -ForegroundColor Green

    # 4. Dependency Analysis
    Write-Host "`n[4/8] 📦 Dependency Health Check..." -ForegroundColor Yellow
    $depStart = Get-Date
    
    # Check for unused dependencies
    Write-Host "   → Unused dependencies (depcheck)..."
    pnpm depcheck --json 2>&1 | Tee-Object "$reportPath/dependencies.json" | Out-Null
    
    # Check for outdated packages
    Write-Host "   → Outdated packages..."
    pnpm outdated -r --format json 2>&1 | Tee-Object "$reportPath/outdated.json" | Out-Null
    
    # Check for duplicate dependencies
    Write-Host "   → Duplicate dependencies..."
    pnpm list -r --depth 99 --json 2>&1 | 
        ConvertFrom-Json | 
        ForEach-Object { $_.dependencies } |
        Group-Object name |
        Where-Object { $_.Count -gt 1 } |
        ConvertTo-Json |
        Out-File "$reportPath/duplicates.json"
    
    $depDuration = (Get-Date) - $depStart
    Write-Host "   ✓ Completed in $($depDuration.TotalSeconds)s" -ForegroundColor Green

    # 5. Circular Dependencies
    Write-Host "`n[5/8] 🔄 Circular Dependency Detection..." -ForegroundColor Yellow
    $circularStart = Get-Date

    # Check if madge is installed
    $madgeInstalled = $null -ne (Get-Command madge -ErrorAction SilentlyContinue)
    if (-not $madgeInstalled) {
        Write-Host "   ⚠️  madge not installed. Run 'pnpm add -g madge' to enable circular dependency detection." -ForegroundColor Yellow
        @{ skipped = $true; reason = "madge not installed" } |
            ConvertTo-Json | Out-File "$reportPath/circular-deps.json"
        $circularDuration = (Get-Date) - $circularStart
        Write-Host "   ⏭️  Skipped (madge not available)" -ForegroundColor Gray
    } else {
        $packagesToCheck = @(
            "apps/web/src",
            "apps/api/src",
            "apps/ai-worker/src",
            "packages/domain/src",
            "packages/application/src",
            "packages/platform/src"
        )

        $circularReport = @()
        foreach ($pkg in $packagesToCheck) {
            if (Test-Path $pkg) {
                Write-Host "   → Checking $pkg..."
                $result = madge --circular --json $pkg 2>&1
                if ($LASTEXITCODE -ne 0 -and $result) {
                    $circularReport += @{
                        package = $pkg
                        circular = $result | ConvertFrom-Json
                    }
                }
            }
        }
        $circularReport | ConvertTo-Json -Depth 10 | Out-File "$reportPath/circular-deps.json"
        $circularDuration = (Get-Date) - $circularStart
        Write-Host "   ✓ Completed in $($circularDuration.TotalSeconds)s" -ForegroundColor Green
    }

    # 6. Test Coverage
    Write-Host "`n[6/8] 🧪 Test Coverage Analysis..." -ForegroundColor Yellow
    $coverageStart = Get-Date
    $env:NODE_ENV = "test"
    pnpm test:coverage --reporter=json --reporter=html 2>&1 | 
        Tee-Object "$reportPath/coverage.txt" |
        Out-Null
    
    if (Test-Path "artifacts/coverage/coverage-summary.json") {
        Copy-Item "artifacts/coverage/coverage-summary.json" "$reportPath/"
    }
    $coverageDuration = (Get-Date) - $coverageStart
    Write-Host "   ✓ Completed in $($coverageDuration.TotalSeconds)s" -ForegroundColor Green

    # 7. Architecture Boundary Tests
    Write-Host "`n[7/8] 🏗️  Architecture Boundaries..." -ForegroundColor Yellow
    $archStart = Get-Date
    pnpm test:architecture 2>&1 | Tee-Object "$reportPath/architecture.txt"
    $archDuration = (Get-Date) - $archStart
    Write-Host "   ✓ Completed in $($archDuration.TotalSeconds)s" -ForegroundColor Green

    # 8. Complexity Analysis
    Write-Host "`n[8/8] 📊 Code Complexity Metrics..." -ForegroundColor Yellow
    $complexityStart = Get-Date
    
    # Use TypeScript parser to analyze complexity
    $complexityReport = @{
        timestamp = Get-Date -Format "o"
        packages = @()
    }
    
    $sourceFiles = Get-ChildItem -Path "apps", "packages" -Recurse -Include "*.ts", "*.tsx" |
        Where-Object { 
            $_.FullName -notmatch "node_modules|dist|build|.next|coverage|test|spec" 
        }
    
    $totalFiles = $sourceFiles.Count
    $totalLines = 0
    $totalComplexity = 0
    
    Write-Host "   → Analyzing $totalFiles source files..."
    
    foreach ($file in $sourceFiles) {
        $lines = (Get-Content $file.FullName -Raw).Split("`n").Count
        $totalLines += $lines
        
        # Simple complexity heuristics
        $content = Get-Content $file.FullName -Raw
        $ifCount = ([regex]::Matches($content, "\bif\b")).Count
        $forCount = ([regex]::Matches($content, "\bfor\b")).Count
        $whileCount = ([regex]::Matches($content, "\bwhile\b")).Count
        $switchCount = ([regex]::Matches($content, "\bswitch\b")).Count
        $ternaryCount = ([regex]::Matches($content, "\?.*:")).Count
        
        $complexity = $ifCount + $forCount + $whileCount + $switchCount + $ternaryCount + 1
        $totalComplexity += $complexity
        
        if ($complexity -gt 20) {
            $complexityReport.packages += @{
                file = $file.FullName.Replace((Get-Location).Path, "")
                lines = $lines
                complexity = $complexity
                warning = "High complexity"
            }
        }
    }
    
    $complexityReport.summary = @{
        totalFiles = $totalFiles
        totalLines = $totalLines
        averageComplexity = [math]::Round($totalComplexity / $totalFiles, 2)
        highComplexityFiles = $complexityReport.packages.Count
    }
    
    $complexityReport | ConvertTo-Json -Depth 10 | Out-File "$reportPath/complexity.json"
    $complexityDuration = (Get-Date) - $complexityStart
    Write-Host "   ✓ Completed in $($complexityDuration.TotalSeconds)s" -ForegroundColor Green
}

# Generate Summary Report
Write-Host "`n" + ("=" * 60)
Write-Host "📊 ANALYSIS SUMMARY" -ForegroundColor Cyan
Write-Host ("=" * 60)

$summary = @{
    # STOA-compatible fields
    runId = $runId
    taskId = if ($TaskId) { $TaskId } else { $null }
    sprint = $Sprint
    startedAt = $scriptStartTime.ToString("o")
    completedAt = (Get-Date).ToString("o")
    mode = "code-review"
    scope = if ($Package) { "Package: $Package" } else { "Full monorepo" }

    # Analysis metadata
    timestamp = Get-Date -Format "o"
    totalPackages = $packageCount
    analysisType = if ($Quick) { "Quick" } else { "Full" }
    duration = @{
        typecheck = $typecheckDuration.TotalSeconds
        lint = $lintDuration.TotalSeconds
    }
    reportPath = $reportPath

    # Gate linkage info
    linkedToGates = ($null -ne $gatesDir)
    gatesDir = $gatesDir
}

if (!$Quick) {
    $summary.duration.deadcode = $knipDuration.TotalSeconds
    $summary.duration.dependencies = $depDuration.TotalSeconds
    $summary.duration.circular = $circularDuration.TotalSeconds
    $summary.duration.coverage = $coverageDuration.TotalSeconds
    $summary.duration.architecture = $archDuration.TotalSeconds
    $summary.duration.complexity = $complexityDuration.TotalSeconds
}

$summary | ConvertTo-Json -Depth 10 | Out-File "$reportPath/summary.json"

# Copy key files to STOA gates directory if -LinkToGates is set
if ($gatesDir) {
    Write-Host "`n📎 Linking key outputs to STOA gates..." -ForegroundColor Cyan
    $gateLinkFiles = @(
        "typecheck.txt",
        "lint.txt"
    )
    foreach ($file in $gateLinkFiles) {
        $srcPath = "$reportPath/$file"
        if (Test-Path $srcPath) {
            $destFile = switch ($file) {
                "typecheck.txt" { "turbo-typecheck.log" }
                "lint.txt" { "eslint.log" }
                default { $file }
            }
            Copy-Item $srcPath "$gatesDir/$destFile" -Force
            Write-Host "   → Linked $file → $destFile" -ForegroundColor Gray
        }
    }
    Write-Host "   ✓ Gate linkage complete" -ForegroundColor Green
}

# Display Key Metrics
Write-Host "`n📈 Key Metrics:" -ForegroundColor Green
Write-Host "   • Packages analyzed: $packageCount"
Write-Host "   • TypeCheck duration: $([math]::Round($typecheckDuration.TotalSeconds, 2))s"
Write-Host "   • Lint duration: $([math]::Round($lintDuration.TotalSeconds, 2))s"

if (!$Quick) {
    Write-Host "   • Test coverage report: artifacts/coverage/index.html"
    
    if ($complexityReport.summary) {
        Write-Host "`n📊 Complexity Metrics:" -ForegroundColor Green
        Write-Host "   • Total source files: $($complexityReport.summary.totalFiles)"
        Write-Host "   • Total lines of code: $($complexityReport.summary.totalLines)"
        Write-Host "   • Average complexity: $($complexityReport.summary.averageComplexity)"
        Write-Host "   • High complexity files: $($complexityReport.summary.highComplexityFiles)"
    }
}

Write-Host "`n📁 Reports saved to: $reportPath" -ForegroundColor Yellow
Write-Host "   Run ID: $runId" -ForegroundColor Gray
Write-Host "   Sprint: $Sprint" -ForegroundColor Gray
if ($TaskId) {
    Write-Host "   Task ID: $TaskId" -ForegroundColor Gray
}
if ($gatesDir) {
    Write-Host "   Gates: $gatesDir" -ForegroundColor Gray
}

Write-Host "`nNext steps:" -ForegroundColor Cyan
Write-Host "  1. Review $reportPath/typecheck.txt for type errors"
Write-Host "  2. Review $reportPath/lint.txt for code quality issues"
if (!$Quick) {
    Write-Host "  3. Review $reportPath/deadcode.json for unused code"
    Write-Host "  4. Review $reportPath/dependencies.json for unused deps"
    Write-Host "  5. Review $reportPath/complexity.json for complex functions"
    Write-Host "  6. Open artifacts/coverage/index.html for coverage details"
}

Write-Host "`n✅ Code review analysis complete!" -ForegroundColor Green
Write-Host "   Use 'node scripts/prioritize-reviews.js --sprint=$Sprint' to generate package priorities" -ForegroundColor Gray
