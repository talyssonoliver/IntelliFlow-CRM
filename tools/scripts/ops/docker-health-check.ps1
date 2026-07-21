<#
.SYNOPSIS
    Detects a wedged Docker Desktop / WSL2 backend and auto-recovers it.

.DESCRIPTION
    Docker Desktop's WSL2 backend can silently wedge: the `docker-desktop`
    distro shows as Stopped while `com.docker.backend` / the GUI keep running,
    and every `docker` CLI call hangs. This happened once and blocked the
    pipeline for ~14 hours (GitHub #580).

    This script is the unattended health probe. It is idempotent: on a healthy
    host it logs one INFO line and exits 0. When it detects the wedge state it
    quits Docker Desktop, runs `wsl.exe --shutdown`, relaunches Docker Desktop,
    and logs each step.

    A wedge is declared when EITHER of these is true:
      * the `docker-desktop` distro is NOT in `wsl.exe --list --running`, OR
      * `docker ps` hangs past the timeout or returns non-zero.

    Recovery is skipped (and logged as WARN) when the pause flag file exists:
      %LOCALAPPDATA%\intelliflow-docker-ha.pause
    Create that file for planned Docker maintenance so the scheduled task does
    not fight you.

.PARAMETER DockerTimeoutSeconds
    How long to wait for `docker ps` before treating it as hung. Default 20.

.PARAMETER LogRetentionDays
    Age (days) beyond which log lines are pruned on each run. Default 7.

.PARAMETER WhatIf
    Detect and log only; do not kill or relaunch anything. Useful for dry runs.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\docker-health-check.ps1

.NOTES
    Runbook: docs/runbooks/docker-ha.md
    Issue:   https://github.com/talyssonoliveira/intelliFlow-CRM/issues/580
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [int]$DockerTimeoutSeconds = 20,
    [int]$LogRetentionDays = 7
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# --- Constants -------------------------------------------------------------
$LocalAppData = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { Join-Path $env:USERPROFILE 'AppData\Local' }
$LogPath      = Join-Path $LocalAppData 'intelliflow-docker-health.log'
$PauseFlag    = Join-Path $LocalAppData 'intelliflow-docker-ha.pause'
$DistroName   = 'docker-desktop'

# Candidate install locations for Docker Desktop.exe (first match wins).
$DockerDesktopCandidates = @(
    (Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Docker\Docker\Docker Desktop.exe'),
    (Join-Path $LocalAppData 'Docker\Docker Desktop.exe')
) | Where-Object { $_ }

# --- Logging ---------------------------------------------------------------
function Write-Log {
    param(
        [ValidateSet('INFO', 'WARN', 'ERROR')]
        [string]$Level,
        [Parameter(Mandatory)]
        [string]$Message
    )
    $line = ('{0} [{1}] {2}' -f (Get-Date -Format 'yyyy-MM-ddTHH:mm:ssK'), $Level, $Message)
    try {
        $dir = Split-Path -Parent $LogPath
        if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
        Add-Content -Path $LogPath -Value $line -Encoding UTF8
    } catch {
        # Logging must never crash the probe.
        Write-Warning ("log write failed: {0}" -f $_.Exception.Message)
    }
    Write-Host $line
}

function Invoke-LogRotation {
    param([int]$RetentionDays)
    if ($RetentionDays -le 0) { return }
    if (-not (Test-Path $LogPath)) { return }
    try {
        $cutoff = (Get-Date).AddDays(-$RetentionDays)
        $kept = Get-Content -Path $LogPath -Encoding UTF8 | Where-Object {
            if ($_ -match '^(?<ts>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^\s]*)') {
                try { [datetimeoffset]::Parse($Matches['ts']).LocalDateTime -ge $cutoff }
                catch { $true }   # unparseable timestamp -> keep
            } else {
                $true             # non-timestamped line (e.g. wrapped) -> keep
            }
        }
        Set-Content -Path $LogPath -Value $kept -Encoding UTF8
    } catch {
        Write-Warning ("log rotation failed: {0}" -f $_.Exception.Message)
    }
}

# --- Health checks ---------------------------------------------------------
function Test-DistroRunning {
    <# Returns $true when the docker-desktop distro appears in `wsl -l --running`. #>
    try {
        # WSL emits UTF-16LE; normalise so the -match works regardless of console codepage.
        $prev = [Console]::OutputEncoding
        [Console]::OutputEncoding = [System.Text.Encoding]::Unicode
        try {
            $running = & wsl.exe --list --running 2>$null
        } finally {
            [Console]::OutputEncoding = $prev
        }
        $text = ($running -join "`n") -replace "`0", ''
        return ($text -match [regex]::Escape($DistroName))
    } catch {
        Write-Log WARN ("could not query WSL distro list: {0}" -f $_.Exception.Message)
        return $false
    }
}

function Test-DockerResponsive {
    <# Runs `docker ps` in a child process bounded by a timeout. #>
    param([int]$TimeoutSeconds)
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = 'docker'
    $psi.Arguments = 'ps --quiet'
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true

    try {
        $proc = [System.Diagnostics.Process]::Start($psi)
    } catch {
        Write-Log WARN ("docker CLI not launchable: {0}" -f $_.Exception.Message)
        return $false
    }

    if (-not $proc.WaitForExit($TimeoutSeconds * 1000)) {
        Write-Log WARN ("docker ps hung past {0}s -- killing probe process" -f $TimeoutSeconds)
        try { $proc.Kill() } catch { }
        return $false
    }
    return ($proc.ExitCode -eq 0)
}

# --- Recovery --------------------------------------------------------------
function Stop-DockerDesktop {
    $procs = Get-Process -Name 'Docker Desktop', 'com.docker.backend', 'com.docker.service' -ErrorAction SilentlyContinue
    if (-not $procs) {
        Write-Log INFO 'no Docker Desktop processes to stop'
        return
    }
    foreach ($p in $procs) {
        if ($PSCmdlet.ShouldProcess($p.ProcessName, 'Stop-Process')) {
            try {
                Stop-Process -Id $p.Id -Force -ErrorAction Stop
                Write-Log INFO ("stopped process {0} (pid {1})" -f $p.ProcessName, $p.Id)
            } catch {
                Write-Log WARN ("failed to stop {0} (pid {1}): {2}" -f $p.ProcessName, $p.Id, $_.Exception.Message)
            }
        }
    }
}

function Invoke-WslShutdown {
    if ($PSCmdlet.ShouldProcess('WSL', 'wsl --shutdown')) {
        try {
            & wsl.exe --shutdown 2>&1 | Out-Null
            Write-Log INFO 'ran wsl --shutdown'
        } catch {
            Write-Log ERROR ("wsl --shutdown failed: {0}" -f $_.Exception.Message)
        }
    }
}

function Start-DockerDesktop {
    $exe = $DockerDesktopCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $exe) {
        Write-Log ERROR ("Docker Desktop.exe not found in: {0}" -f ($DockerDesktopCandidates -join '; '))
        return
    }
    if ($PSCmdlet.ShouldProcess($exe, 'Start-Process')) {
        try {
            Start-Process -FilePath $exe | Out-Null
            Write-Log INFO ("relaunched Docker Desktop: {0}" -f $exe)
        } catch {
            Write-Log ERROR ("failed to relaunch Docker Desktop: {0}" -f $_.Exception.Message)
        }
    }
}

# --- Main ------------------------------------------------------------------
$exitCode = 0
try {
    Invoke-LogRotation -RetentionDays $LogRetentionDays

    if (Test-Path $PauseFlag) {
        Write-Log WARN ("pause flag present ({0}) -- skipping health check" -f $PauseFlag)
        exit 0
    }

    $distroUp    = Test-DistroRunning
    $dockerOk    = Test-DockerResponsive -TimeoutSeconds $DockerTimeoutSeconds
    $healthy     = $distroUp -and $dockerOk

    if ($healthy) {
        Write-Log INFO ("healthy -- distro '{0}' running, docker ps OK" -f $DistroName)
        exit 0
    }

    Write-Log ERROR ("wedge detected -- distroRunning={0} dockerResponsive={1}" -f $distroUp, $dockerOk)

    if ($WhatIfPreference) {
        Write-Log WARN 'WhatIf mode -- recovery actions skipped'
        exit 0
    }

    Write-Log INFO 'starting recovery: stop -> wsl shutdown -> relaunch'
    Stop-DockerDesktop
    Invoke-WslShutdown
    Start-DockerDesktop
    Write-Log INFO 'recovery sequence issued (Docker Desktop may take 1-2 min to become responsive)'
    $exitCode = 0
} catch {
    Write-Log ERROR ("unhandled failure: {0}" -f $_.Exception.Message)
    $exitCode = 1
}

exit $exitCode
