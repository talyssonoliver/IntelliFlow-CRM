<#
.SYNOPSIS
    Migrates runtime artifacts from docs/metrics to artifacts/ directory.
.DESCRIPTION
    Idempotent migration script that:
    - Creates canonical folders under artifacts/
    - Moves ONLY runtime/generated data files
    - Writes move-map.csv for audit trail
    - Supports -DryRun mode
.PARAMETER DryRun
    If specified, shows what would be moved without making changes.
.EXAMPLE
    .\migrate-runtime-artifacts.ps1 -DryRun
    .\migrate-runtime-artifacts.ps1
#>

param(
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

# Determine repo root (script is in tools/scripts/)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent (Split-Path -Parent $ScriptDir)

$MetricsDir = Join-Path $RepoRoot "apps\project-tracker\docs\metrics"
$ArtifactsDir = Join-Path $RepoRoot "artifacts"
$MoveMapPath = Join-Path $ArtifactsDir "move-map.csv"
$Timestamp = Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ"

# Create canonical folders
$CanonicalFolders = @(
    "$ArtifactsDir\backups\sprint-plan",
    "$ArtifactsDir\logs\swarm",
    "$ArtifactsDir\misc\.locks",
    "$ArtifactsDir\misc\.status",
    "$ArtifactsDir\reports\validation"
)

Write-Host "=== IntelliFlow Runtime Artifact Migration ===" -ForegroundColor Cyan
Write-Host "Repo Root: $RepoRoot" -ForegroundColor DarkGray
Write-Host "Mode: $(if ($DryRun) { 'DRY RUN' } else { 'LIVE' })" -ForegroundColor Yellow
Write-Host ""

# Step A: Create canonical folders
Write-Host "[Step A] Creating canonical folders..." -ForegroundColor Green
foreach ($folder in $CanonicalFolders) {
    if (-not (Test-Path $folder)) {
        if ($DryRun) {
            Write-Host "  [DRY] Would create: $folder" -ForegroundColor DarkGray
        } else {
            New-Item -ItemType Directory -Path $folder -Force | Out-Null
            Write-Host "  Created: $folder" -ForegroundColor Green
        }
    } else {
        Write-Host "  Exists: $folder" -ForegroundColor DarkGray
    }
}

# Initialize move-map CSV
$MoveMap = @()

# Step B: Define migration rules
$MigrationRules = @(
    @{
        Source = "$MetricsDir\backups\*.csv"
        Dest = "$ArtifactsDir\backups\sprint-plan"
        Reason = "CSV backups are runtime artifacts"
    },
    @{
        Source = "$MetricsDir\logs\swarm\*.log"
        Dest = "$ArtifactsDir\logs\swarm"
        Reason = "Swarm logs are runtime artifacts"
    },
    @{
        Source = "$MetricsDir\logs\swarm\swarm-health.json"
        Dest = "$ArtifactsDir\logs\swarm"
        Reason = "Swarm health is runtime state"
    },
    @{
        Source = "$MetricsDir\artifacts\reports\*.json"
        Dest = "$ArtifactsDir\reports\validation"
        Reason = "Validation reports are runtime artifacts"
    }
)

# Step C: Execute migrations
Write-Host ""
Write-Host "[Step B] Migrating runtime files..." -ForegroundColor Green

foreach ($rule in $MigrationRules) {
    $files = Get-ChildItem -Path $rule.Source -ErrorAction SilentlyContinue

    foreach ($file in $files) {
        $destPath = Join-Path $rule.Dest $file.Name

        # Skip if destination exists (idempotent)
        if (Test-Path $destPath) {
            Write-Host "  [SKIP] Already exists: $destPath" -ForegroundColor DarkGray
            continue
        }

        if ($DryRun) {
            Write-Host "  [DRY] Would move: $($file.FullName) -> $destPath" -ForegroundColor DarkGray
        } else {
            Move-Item -Path $file.FullName -Destination $destPath -Force
            Write-Host "  Moved: $($file.Name)" -ForegroundColor Green
        }

        $MoveMap += [PSCustomObject]@{
            original_path = $file.FullName.Replace($RepoRoot + "\", "")
            new_path = $destPath.Replace($RepoRoot + "\", "")
            reason = $rule.Reason
            timestamp = $Timestamp
        }
    }
}

# Step D: Clean up empty folders
Write-Host ""
Write-Host "[Step C] Cleaning up empty folders..." -ForegroundColor Green

$FoldersToRemove = @(
    "$MetricsDir\.locks",
    "$MetricsDir\.status",
    "$MetricsDir\logs\swarm",
    "$MetricsDir\logs",
    "$MetricsDir\backups",
    "$MetricsDir\artifacts\reports",
    "$MetricsDir\artifacts"
)

foreach ($folder in $FoldersToRemove) {
    if (Test-Path $folder) {
        $items = Get-ChildItem -Path $folder -Recurse -ErrorAction SilentlyContinue
        if ($null -eq $items -or $items.Count -eq 0) {
            if ($DryRun) {
                Write-Host "  [DRY] Would remove empty: $folder" -ForegroundColor DarkGray
            } else {
                Remove-Item -Path $folder -Recurse -Force
                Write-Host "  Removed empty: $folder" -ForegroundColor Green
            }
        } else {
            Write-Host "  [SKIP] Not empty: $folder ($($items.Count) items)" -ForegroundColor Yellow
        }
    }
}

# Step E: Write move-map.csv
Write-Host ""
Write-Host "[Step D] Writing move-map.csv..." -ForegroundColor Green

if ($MoveMap.Count -gt 0) {
    if ($DryRun) {
        Write-Host "  [DRY] Would write $($MoveMap.Count) entries to $MoveMapPath" -ForegroundColor DarkGray
        Write-Host ""
        Write-Host "  Sample entries:" -ForegroundColor Cyan
        $MoveMap | Select-Object -First 3 | Format-Table -AutoSize
    } else {
        # Append to existing or create new
        if (Test-Path $MoveMapPath) {
            $MoveMap | Export-Csv -Path $MoveMapPath -NoTypeInformation -Append
        } else {
            $MoveMap | Export-Csv -Path $MoveMapPath -NoTypeInformation
        }
        Write-Host "  Written $($MoveMap.Count) entries to $MoveMapPath" -ForegroundColor Green
    }
} else {
    Write-Host "  No files migrated (all already in correct location or no files found)" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "=== Migration Complete ===" -ForegroundColor Cyan
Write-Host "No TypeScript import updates needed in P0 (only data files moved)." -ForegroundColor Yellow
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Run: pnpm typecheck" -ForegroundColor White
Write-Host "  2. Run: pnpm build" -ForegroundColor White
Write-Host "  3. Verify: http://localhost:3002/ loads correctly" -ForegroundColor White
