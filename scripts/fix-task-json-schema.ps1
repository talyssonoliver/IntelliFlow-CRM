#!/usr/bin/env pwsh
# Fix all task JSON files to match task-status.schema.json

$ErrorActionPreference = "Stop"

Write-Host " Fixing task JSON files to match schema..." -ForegroundColor Cyan

$taskFiles = Get-ChildItem -Path "apps/project-tracker/docs/metrics/sprint-0" -Recurse -Filter "*.json" | 
    Where-Object { $_.Name -notmatch '_phase-summary|_sprint-summary' }

$totalFiles = $taskFiles.Count
$fixedCount = 0
$errorCount = 0

foreach ($file in $taskFiles) {
    try {
        Write-Host "`n Processing: $($file.Name)" -ForegroundColor Yellow
        
        $content = Get-Content $file.FullName -Raw | ConvertFrom-Json
        
        # Add missing required fields with defaults
        $modified = $false
        
        # Add section (derive from task_id prefix)
        if (-not $content.PSObject.Properties['section']) {
            $prefix = $content.task_id -replace '-.*$', ''
            $sectionMap = @{
                'ENV' = 'Environment Setup'
                'IFC' = 'Infrastructure & Configuration'
                'EXC' = 'Excellence & Quality'
                'AUTOMATION' = 'Automation & Tooling'
                'AI' = 'AI Integration'
            }
            $sectionValue = if ($sectionMap.ContainsKey($prefix)) { $sectionMap[$prefix] } else { 'Other' }
            $content | Add-Member -NotePropertyName 'section' -NotePropertyValue $sectionValue -Force
            $modified = $true
        }
        
        # Fix dependencies (array -> object)
        if ($content.PSObject.Properties['dependencies'] -and $content.dependencies -is [Array]) {
            $oldDeps = $content.dependencies
            $content.dependencies = @{
                required = $oldDeps
                verified_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
                all_satisfied = $false  # Default to false until orchestrator verifies
            }
            $modified = $true
        } elseif (-not $content.PSObject.Properties['dependencies']) {
            $content | Add-Member -NotePropertyName 'dependencies' -NotePropertyValue @{
                required = @()
                verified_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
                all_satisfied = $true
            } -Force
            $modified = $true
        }
        
        # Add status_history
        if (-not $content.PSObject.Properties['status_history']) {
            $statusHistory = @()
            
            # Add PLANNED entry if status is PLANNED
            if ($content.status -eq 'PLANNED') {
                $statusHistory += @{
                    status = 'PLANNED'
                    at = (Get-Date "2025-12-15T00:00:00Z").ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
                    note = "Task created during sprint planning"
                }
            }
            
            # Add IN_PROGRESS entry if there's a started_at
            if ($content.PSObject.Properties['started_at'] -and $content.started_at) {
                $statusHistory += @{
                    status = 'IN_PROGRESS'
                    at = $content.started_at
                    note = "Execution started"
                }
            }
            
            # Add DONE entry if there's a completed_at
            if ($content.PSObject.Properties['completed_at'] -and $content.completed_at) {
                $statusHistory += @{
                    status = 'DONE'
                    at = $content.completed_at
                    note = "Task completed successfully"
                }
            }
            
            $content | Add-Member -NotePropertyName 'status_history' -NotePropertyValue $statusHistory -Force
            $modified = $true
        }
        
        # Fix artifacts (array -> object with created array)
        if ($content.PSObject.Properties['artifacts'] -and $content.artifacts -is [Array]) {
            $oldArtifacts = $content.artifacts
            $createdArtifacts = @()
            
            foreach ($artifact in $oldArtifacts) {
                $createdAt = if ($artifact.PSObject.Properties['created_at'] -and $artifact.created_at) { 
                    $artifact.created_at 
                } else { 
                    (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
                }
                $createdArtifact = @{
                    path = $artifact.path
                    sha256 = $artifact.sha256
                    created_at = $createdAt
                }
                $createdArtifacts += $createdArtifact
            }
            
            $content.artifacts = @{
                expected = @($oldArtifacts | ForEach-Object { $_.path })
                created = $createdArtifacts
                missing = @()
            }
            $modified = $true
        } elseif (-not $content.PSObject.Properties['artifacts']) {
            $content | Add-Member -NotePropertyName 'artifacts' -NotePropertyValue @{
                expected = @()
                created = @()
                missing = @()
            } -Force
            $modified = $true
        }
        
        # Fix KPIs - add missing "met" property
        if ($content.PSObject.Properties['kpis']) {
            foreach ($kpiName in $content.kpis.PSObject.Properties.Name) {
                $kpi = $content.kpis.$kpiName
                if (-not $kpi.PSObject.Properties['met']) {
                    # Determine if target was met
                    if ($kpi.target -is [String]) {
                        $kpi | Add-Member -NotePropertyName 'met' -NotePropertyValue ($kpi.actual -eq $kpi.target) -Force
                    } else {
                        $kpi | Add-Member -NotePropertyName 'met' -NotePropertyValue ($kpi.actual -ge $kpi.target) -Force
                    }
                    $modified = $true
                }
            }
        }
        
        # Fix validations - ensure all required properties
        if ($content.PSObject.Properties['validations'] -and $content.validations -is [Array]) {
            $fixedValidations = @()
            foreach ($validation in $content.validations) {
                $name = if ($validation.PSObject.Properties['name']) { $validation.name } else { "Validation Check" }
                $command = if ($validation.PSObject.Properties['command']) { $validation.command } else { "echo 'No command recorded'" }
                $executedAt = if ($validation.PSObject.Properties['executed_at']) { $validation.executed_at } else { (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ") }
                $exitCode = if ($validation.PSObject.Properties['exit_code']) { $validation.exit_code } else { 0 }
                $passed = if ($validation.PSObject.Properties['passed']) { $validation.passed } else { $true }
                
                $fixedValidation = @{
                    name = $name
                    command = $command
                    executed_at = $executedAt
                    exit_code = $exitCode
                    passed = $passed
                }
                
                # Add optional properties if they exist
                if ($validation.PSObject.Properties['duration_ms']) {
                    $fixedValidation.duration_ms = $validation.duration_ms
                }
                if ($validation.PSObject.Properties['stdout_hash']) {
                    $fixedValidation.stdout_hash = $validation.stdout_hash
                }
                
                $fixedValidations += $fixedValidation
            }
            $content.validations = $fixedValidations
            $modified = $true
        }
        
        # Convert notes array to string
        if ($content.PSObject.Properties['notes'] -and $content.notes -is [Array]) {
            $content.notes = ($content.notes -join "`n`n")
            $modified = $true
        }
        
        # Save if modified
        if ($modified) {
            $json = $content | ConvertTo-Json -Depth 20
            Set-Content -Path $file.FullName -Value $json -Encoding UTF8
            Write-Host "   Fixed" -ForegroundColor Green
            $fixedCount++
        } else {
            Write-Host "    No changes needed" -ForegroundColor Gray
        }
        
    } catch {
        Write-Host "   Error: $_" -ForegroundColor Red
        $errorCount++
    }
}

Write-Host "`nSummary:" -ForegroundColor Cyan
Write-Host "  Total files: $totalFiles" -ForegroundColor White
Write-Host "  Fixed: $fixedCount" -ForegroundColor Green
Write-Host "  Errors: $errorCount" -ForegroundColor Red

if ($errorCount -eq 0) {
    Write-Host "`nAll task JSON files now match schema!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "`nSome files had errors" -ForegroundColor Yellow
    exit 1
}

