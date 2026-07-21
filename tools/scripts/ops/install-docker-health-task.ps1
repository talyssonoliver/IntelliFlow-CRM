<#
.SYNOPSIS
    Registers (or refreshes) the Windows scheduled task that runs the Docker
    Desktop / WSL2 health check every 15 minutes.

.DESCRIPTION
    One-shot installer for the auto-restart HA probe (GitHub #580). Creates a
    scheduled task named `intelliflow-docker-health` that invokes
    docker-health-check.ps1 with `-ExecutionPolicy Bypass` so it runs unattended
    without code-signing. The task:
      * runs as the current interactive user,
      * fires only while that user is logged on,
      * repeats every 15 minutes indefinitely, starting shortly after registration.

    Re-running the installer replaces any existing task of the same name, so it
    is safe to run repeatedly (e.g. after editing the check script's path).

.PARAMETER IntervalMinutes
    Repetition interval in minutes. Default 15.

.PARAMETER TaskName
    Scheduled task name. Default 'intelliflow-docker-health'.

.PARAMETER Uninstall
    Remove the scheduled task instead of installing it.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\install-docker-health-task.ps1

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\install-docker-health-task.ps1 -Uninstall

.NOTES
    Runbook: docs/runbooks/docker-ha.md
    Verify:  Get-ScheduledTask -TaskName intelliflow-docker-health
#>
[CmdletBinding()]
param(
    [int]$IntervalMinutes = 15,
    [string]$TaskName = 'intelliflow-docker-health',
    [switch]$Uninstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$CheckScript = Join-Path $PSScriptRoot 'docker-health-check.ps1'

function Remove-ExistingTask {
    param([string]$Name)
    $existing = Get-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue
    if ($existing) {
        Unregister-ScheduledTask -TaskName $Name -Confirm:$false
        Write-Host ("Removed existing scheduled task '{0}'." -f $Name)
        return $true
    }
    return $false
}

# --- Uninstall path --------------------------------------------------------
if ($Uninstall) {
    if (Remove-ExistingTask -Name $TaskName) {
        Write-Host 'Uninstall complete.'
        exit 0
    }
    Write-Host ("No scheduled task named '{0}' found; nothing to remove." -f $TaskName)
    exit 0
}

# --- Preconditions ---------------------------------------------------------
if (-not (Test-Path $CheckScript)) {
    Write-Error ("Health check script not found: {0}" -f $CheckScript)
    exit 1
}
if ($IntervalMinutes -lt 1) {
    Write-Error ("IntervalMinutes must be >= 1 (got {0})." -f $IntervalMinutes)
    exit 1
}

# --- Build task definition -------------------------------------------------
$psExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'

$action = New-ScheduledTaskAction `
    -Execute $psExe `
    -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}"' -f $CheckScript)

# Repeat forever, first run 2 minutes after registration.
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) `
    -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes)

# Current interactive user, only when logged on, least privilege.
$principal = New-ScheduledTaskPrincipal `
    -UserId ('{0}\{1}' -f $env:USERDOMAIN, $env:USERNAME) `
    -LogonType Interactive `
    -RunLevel Limited

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

$description = 'IntelliFlow: detects a wedged Docker Desktop/WSL2 backend and auto-restarts it. Runbook: docs/runbooks/docker-ha.md (#580).'

# --- Register --------------------------------------------------------------
try {
    Remove-ExistingTask -Name $TaskName | Out-Null

    Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $action `
        -Trigger $trigger `
        -Principal $principal `
        -Settings $settings `
        -Description $description `
        -ErrorAction Stop | Out-Null

    Write-Host ("[OK] Registered scheduled task '{0}' (every {1} min, current user, when logged on)." -f $TaskName, $IntervalMinutes)
    Write-Host  "     Verify:  Get-ScheduledTask -TaskName $TaskName"
    Write-Host  "     Run now: Start-ScheduledTask -TaskName $TaskName"
    Write-Host ("     Log:     {0}" -f (Join-Path $env:LOCALAPPDATA 'intelliflow-docker-health.log'))
    exit 0
} catch {
    Write-Error ("[FAIL] Could not register scheduled task '{0}': {1}" -f $TaskName, $_.Exception.Message)
    exit 1
}
