#!/usr/bin/env pwsh
# Remove fake execution data from PLANNED tasks

$ErrorActionPreference = "Stop"

$taskFiles = Get-ChildItem -Path "apps/project-tracker/docs/metrics/sprint-0" -Recurse -Filter "*.json" | 
    Where-Object { $_.Name -notmatch '_summary' }

$cleanedCount = 0

foreach ($file in $taskFiles) {
    $content = Get-Content $file.FullName -Raw | ConvertFrom-Json
    $modified = $false
    
    # If status is PLANNED, remove execution data
    if ($content.status -eq 'PLANNED') {
        
        # Remove started_at and completed_at
        if ($content.PSObject.Properties['started_at']) {
            $content.PSObject.Properties.Remove('started_at')
            $modified = $true
        }
        if ($content.PSObject.Properties['completed_at']) {
            $content.PSObject.Properties.Remove('completed_at')
            $modified = $true
        }
        
        # Remove actual_duration_minutes
        if ($content.PSObject.Properties['actual_duration_minutes']) {
            $content.PSObject.Properties.Remove('actual_duration_minutes')
            $modified = $true
        }
        
        # Clear validations array (task not executed yet)
        if ($content.PSObject.Properties['validations'] -and $content.validations.Count -gt 0) {
            $content.validations = @()
            $modified = $true
        }
        
        # Clear status_history or keep only PLANNED entry
        if ($content.PSObject.Properties['status_history']) {
            $plannedEntry = $content.status_history | Where-Object { $_.status -eq 'PLANNED' } | Select-Object -First 1
            if ($plannedEntry) {
                $content.status_history = @($plannedEntry)
            } else {
                $content.status_history = @()
            }
            $modified = $true
        }
        
        # Ensure artifacts are empty for PLANNED tasks
        if ($content.PSObject.Properties['artifacts']) {
            if ($content.artifacts.created.Count -gt 0) {
                $content.artifacts.created = @()
                $modified = $true
            }
        }
    }
    
    # Save if modified
    if ($modified) {
        $json = $content | ConvertTo-Json -Depth 20
        # Fix Unicode escapes
        $json = $json -replace '\\u0027', "'" -replace '\\u003c', '<' -replace '\\u003e', '>'
        Set-Content -Path $file.FullName -Value $json -Encoding UTF8
        Write-Host "Cleaned: $($file.Name)" -ForegroundColor Green
        $cleanedCount++
    }
}

Write-Host "`nCleaned $cleanedCount PLANNED tasks" -ForegroundColor Cyan
