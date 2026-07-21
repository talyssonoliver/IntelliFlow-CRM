# Runbook — Docker Desktop / WSL2 Auto-Restart HA

**Issue:**
[#580](https://github.com/talyssonoliveira/intelliFlow-CRM/issues/580) ·
**Owner:** infra/devops · **Applies to:** Windows dev/build hosts running the
Docker Desktop WSL2 backend.

## Why this exists

Docker Desktop's WSL2 backend can silently **wedge**: the `docker-desktop`
distro drops to `Stopped` while `com.docker.backend` and the GUI keep running,
so the process _looks_ alive but every `docker` CLI call hangs. This has
happened at least once and left the test DB (`intelliflow-postgres-test :5433`)
unreachable for ~14 hours, blocking every pre-ship gate. For a fleet of
concurrent agents, one wedge stalls every executor.

The fix is a Windows **scheduled task** that health-checks Docker every 15
minutes and auto-recovers on a detected wedge.

## Components

| File                                               | Role                                                              |
| -------------------------------------------------- | ----------------------------------------------------------------- |
| `tools/scripts/ops/docker-health-check.ps1`        | The probe. Detects the wedge and, if found, kills + relaunches.   |
| `tools/scripts/ops/install-docker-health-task.ps1` | One-shot installer/uninstaller for the scheduled task.            |
| `%LOCALAPPDATA%\intelliflow-docker-health.log`     | Timestamped INFO/WARN/ERROR log (auto-rotated, last 7 days).      |
| `%LOCALAPPDATA%\intelliflow-docker-ha.pause`       | Optional flag file — when present, the probe skips (maintenance). |

### How a wedge is detected

The probe marks the host **unhealthy** when **either**:

- `docker-desktop` is absent from `wsl.exe --list --running`, **or**
- `docker ps` hangs past the timeout (default 20s) or exits non-zero.

### What recovery does

On an unhealthy result the probe, in order:

1. `Stop-Process -Force` on `Docker Desktop`, `com.docker.backend`,
   `com.docker.service`.
2. `wsl.exe --shutdown`.
3. Relaunches `Docker Desktop.exe` (found under `Program Files` or
   `%LOCALAPPDATA%`).

Docker Desktop typically takes 1–2 minutes to become responsive again after a
relaunch. On a **healthy** host the probe logs a single INFO line and exits 0
(idempotent — safe to run as often as you like).

## Install

From the repo root, in **PowerShell**:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\scripts\ops\install-docker-health-task.ps1
```

This registers a scheduled task `intelliflow-docker-health` that runs the probe
every 15 minutes, **as the current user, only when logged on**, using
`-ExecutionPolicy Bypass` (no code-signing needed). Re-running the installer
safely replaces the existing task.

Options:

- `-IntervalMinutes 10` — change the cadence.
- `-TaskName <name>` — use a custom task name.

## Verify

```powershell
# Task is registered
Get-ScheduledTask -TaskName intelliflow-docker-health

# Last run result / next run time
Get-ScheduledTaskInfo -TaskName intelliflow-docker-health

# Force a run now and watch the log
Start-ScheduledTask -TaskName intelliflow-docker-health
Get-Content "$env:LOCALAPPDATA\intelliflow-docker-health.log" -Tail 20 -Wait
```

A healthy run appends a line like:

```
2026-07-21T15:50:00+01:00 [INFO] healthy -- distro 'docker-desktop' running, docker ps OK
```

## Test the recovery path manually

> ⚠️ This **kills and relaunches Docker Desktop** — running containers stop. Do
> it when the host is idle.

```powershell
# 1. Dry run (healthy host): logs INFO, exits 0, changes nothing.
powershell -ExecutionPolicy Bypass -File .\tools\scripts\ops\docker-health-check.ps1

# 2. Preview recovery without acting (no kill/relaunch):
powershell -ExecutionPolicy Bypass -File .\tools\scripts\ops\docker-health-check.ps1 -WhatIf

# 3. Simulate a wedge, then run the probe — it should detect + recover:
wsl.exe --terminate docker-desktop
powershell -ExecutionPolicy Bypass -File .\tools\scripts\ops\docker-health-check.ps1

# 4. Confirm Docker comes back (may take 1-2 min):
docker ps
```

Expected log during step 3:

```
[WARN]  docker ps hung past 20s -- killing probe process
[ERROR] wedge detected -- distroRunning=False dockerResponsive=False
[INFO]  starting recovery: stop -> wsl shutdown -> relaunch
[INFO]  stopped process com.docker.backend (pid ...)
[INFO]  ran wsl --shutdown
[INFO]  relaunched Docker Desktop: C:\Program Files\Docker\Docker\Docker Desktop.exe
```

## Planned maintenance — pausing the watcher

Before intentionally stopping Docker (upgrades, `wsl --shutdown` by hand, etc.),
drop the pause flag so the scheduled task does not fight you:

```powershell
New-Item -ItemType File -Path "$env:LOCALAPPDATA\intelliflow-docker-ha.pause" -Force
# ... do maintenance ...
Remove-Item "$env:LOCALAPPDATA\intelliflow-docker-ha.pause"
```

While the flag exists the probe logs a WARN and exits without acting.

## Logs

- **Location:** `%LOCALAPPDATA%\intelliflow-docker-health.log`
- **Format:** `<ISO-8601 timestamp> [INFO|WARN|ERROR] <message>`
- **Rotation:** on each run, lines older than 7 days are pruned in place
  (`-LogRetentionDays` on the check script tunes the window).

## Uninstall

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\scripts\ops\install-docker-health-task.ps1 -Uninstall
```

Or directly:

```powershell
Unregister-ScheduledTask -TaskName intelliflow-docker-health -Confirm:$false
```

The log file is left in place; delete it by hand if you want a clean slate.

## Troubleshooting

| Symptom                                              | Likely cause / fix                                                                                 |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Task registered but never runs                       | It only fires **while logged on**. Check `Get-ScheduledTaskInfo` `LastRunTime` / `LastTaskResult`. |
| `Docker Desktop.exe not found` in the log            | Non-standard install path. Edit `$DockerDesktopCandidates` in `docker-health-check.ps1`.           |
| Probe keeps recovering in a loop                     | Docker is genuinely broken (not just wedged). Drop the pause flag and investigate manually.        |
| Recovery ran but `docker ps` still fails after 2 min | Give it longer, or check Docker Desktop's own logs / WSL health (`wsl --status`).                  |
