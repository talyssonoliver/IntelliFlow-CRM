/**
 * One pre-ship gate per machine, and nothing left running when one dies.
 *
 * WHY
 * ---
 * The gate peaks at four Vitest workers (4 GB heap each) plus a `next build`.
 * Two gates at once (two worktrees, two sessions) double that on one machine.
 * And when a gate was killed from outside (on 2026-10-02 Claude Code stopped
 * five pushes for low memory), the step it was running kept going with no
 * parent: one orphaned `next build` reached 4.7 GB, so every retry started
 * with less free memory than the last.
 *
 * WHAT
 * ----
 * - A machine-wide lock file (in the OS temp dir, shared by every worktree). A
 *   second gate waits for the first instead of running beside it.
 * - The lock records the running step's process, so the step's whole tree can
 *   be stopped: by the gate's own signal handlers, by a detached watchdog when
 *   the gate is killed outright, and, failing both, by the next gate, which
 *   finds the stale lock and clears what it left behind.
 *
 * This only ever stops processes the lock itself recorded, and checks each is
 * the same process (started after the lock was taken) before stopping it, so a
 * reused PID is never touched.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const LOCK_PATH =
  process.env.PRESHIP_LOCK_PATH || path.join(os.tmpdir(), 'intelliflow-preship.lock');

/** A lock older than this is stale whatever its owner says (a hung gate). */
export const LOCK_MAX_AGE_MS = 4 * 60 * 60 * 1000;

/** Whether a process with this PID exists. */
export function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: it exists but belongs to someone else.
    return err.code === 'EPERM';
  }
}

/**
 * When a process started, in ms since the epoch, or null if unknown. Used to
 * tell the process the lock recorded from a later one that reused its PID.
 */
export function startTimeOf(pid) {
  if (!isAlive(pid)) return null;
  if (process.platform === 'win32') {
    const r = spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `$p = Get-Process -Id ${Number(pid)} -ErrorAction SilentlyContinue; ` +
          `if ($p) { [DateTimeOffset]::new($p.StartTime).ToUnixTimeMilliseconds() }`,
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 }
    );
    const ms = Number.parseInt((r.stdout || '').trim(), 10);
    return Number.isFinite(ms) ? ms : null;
  }
  const r = spawnSync('ps', ['-o', 'lstart=', '-p', String(pid)], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 5000,
  });
  const ms = Date.parse((r.stdout || '').trim());
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Whether `pid` is still the process recorded at `recordedAtMs`: 'yes' (alive,
 * and started no later than the record), 'no' (gone, or started after it, so
 * the PID was reused) or 'unknown' (alive, but its start time could not be
 * read, e.g. the probe timed out on a loaded machine). `slackMs` covers clock
 * granularity.
 */
export function sameProcess(pid, recordedAtMs, slackMs = 2000) {
  if (!isAlive(pid)) return 'no';
  const started = startTimeOf(pid);
  if (started === null) return 'unknown';
  return started <= recordedAtMs + slackMs ? 'yes' : 'no';
}

/**
 * The PIDs above `pid`, nearest first, up to `depth` levels. The gate runs
 * under `git push` -> the husky hook shell -> pnpm; when something kills the
 * push from above (Claude Code's memory reaper did, on 2026-10-02), the gate
 * itself survives as an orphan and keeps building for a push that no longer
 * exists. The watchdog stops it when any of these disappears.
 */
export function ancestorsOf(pid, depth = 6) {
  if (process.platform === 'win32') {
    const r = spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `$all = @{}; Get-CimInstance Win32_Process | ForEach-Object { $all[[int]$_.ProcessId] = $_ }; ` +
          `$p = $all[${Number(pid)}]; $out = @(); ` +
          `for ($i = 0; $i -lt ${Number(depth)} -and $p; $i++) { ` +
          `$q = $all[[int]$p.ParentProcessId]; ` +
          // A parent created after its child is a reused PID, not the parent.
          `if (-not $q -or $q.CreationDate -gt $p.CreationDate) { break }; ` +
          `$out += $q.ProcessId; $p = $q }; $out -join ','`,
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000 }
    );
    return (r.stdout || '')
      .trim()
      .split(',')
      .map((v) => Number.parseInt(v, 10))
      .filter((v) => Number.isInteger(v) && v > 4);
  }
  const out = [];
  let current = pid;
  for (let i = 0; i < depth; i++) {
    const r = spawnSync('ps', ['-o', 'ppid=', '-p', String(current)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    });
    const parent = Number.parseInt((r.stdout || '').trim(), 10);
    if (!Number.isInteger(parent) || parent <= 1) break;
    out.push(parent);
    current = parent;
  }
  return out;
}

/** Stop a process and everything it started. */
export function killTree(pid) {
  if (!isAlive(pid)) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', timeout: 30000 });
    return;
  }
  // POSIX steps are spawned detached, so each is its own process group.
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* already gone */
    }
  }
}

export function readLock(lockPath = LOCK_PATH) {
  try {
    return JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch {
    return null;
  }
}

function writeLock(lockPath, record) {
  fs.writeFileSync(lockPath, JSON.stringify(record, null, 2));
}

/**
 * Whether a lock record still belongs to a running gate. A dead owner, a reused
 * owner PID, an unreadable record or one older than LOCK_MAX_AGE_MS are stale.
 */
export function isLive(record, now = Date.now()) {
  if (!record || !Number.isInteger(record.gate_pid) || !record.acquired_at_ms) return false;
  if (now - record.acquired_at_ms > LOCK_MAX_AGE_MS) return false;
  // Fail safe: an owner we cannot vouch for either way is treated as running.
  // Wrongly waiting costs minutes; wrongly reaping kills another gate's step.
  return sameProcess(record.gate_pid, record.acquired_at_ms) !== 'no';
}

/**
 * Clear what a dead gate left behind: stop the step it recorded (only if it is
 * still that same process) and remove its lock.
 * @returns {number|null} the PID that was stopped, if any
 */
export function reapStale(record, lockPath = LOCK_PATH) {
  let stopped = null;
  if (
    record &&
    Number.isInteger(record.child_pid) &&
    record.child_started_ms &&
    // Only a confirmed match is stopped; 'unknown' never kills anything.
    sameProcess(record.child_pid, record.child_started_ms) === 'yes'
  ) {
    killTree(record.child_pid);
    stopped = record.child_pid;
  }
  try {
    fs.unlinkSync(lockPath);
  } catch {
    /* someone else cleared it first */
  }
  return stopped;
}

/**
 * Take the machine-wide lock, waiting while another live gate holds it.
 * @param {object} owner  descriptive fields for the record (repo, branch, head)
 * @param {object} [opts]
 * @param {string} [opts.lockPath]
 * @param {number} [opts.pollMs]
 * @param {(msg: string) => void} [opts.log]
 * @param {(ms: number) => Promise<void>} [opts.sleep]
 * @returns {Promise<object>} the record written
 */
export async function acquire(owner, opts = {}) {
  const lockPath = opts.lockPath || LOCK_PATH;
  const pollMs = opts.pollMs ?? 10000;
  const log = opts.log || (() => {});
  const sleep = opts.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  let announced = false;
  let lastBeat = 0;
  for (;;) {
    const record = {
      ...owner,
      gate_pid: process.pid,
      acquired_at_ms: Date.now(),
      acquired_at: new Date().toISOString(),
      child_pid: null,
      child_step: null,
      child_started_ms: null,
    };
    try {
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeSync(fd, JSON.stringify(record, null, 2));
      fs.closeSync(fd);
      return record;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
    const held = readLock(lockPath);
    if (!isLive(held)) {
      const stopped = reapStale(held, lockPath);
      log(
        `pre-ship: cleared a stale lock from PID ${held?.gate_pid ?? '?'}` +
          (stopped ? ` and stopped the step it left running (PID ${stopped}).` : '.')
      );
      continue;
    }
    const now = Date.now();
    if (!announced) {
      announced = true;
      lastBeat = now;
      log(
        `pre-ship: another gate is running (${held.repo_root ?? '?'}, ` +
          `${held.branch ?? '?'}, since ${held.acquired_at ?? '?'}); waiting for it to finish.`
      );
    } else if (now - lastBeat >= 120000) {
      lastBeat = now;
      log(`pre-ship: still waiting (current step: ${held.child_step ?? 'between steps'}).`);
    }
    await sleep(pollMs);
  }
}

/** Record (or clear, with pid null) the step process the lock holder is running. */
export function recordChild(pid, step, lockPath = LOCK_PATH) {
  const record = readLock(lockPath);
  if (!record || record.gate_pid !== process.pid) return;
  record.child_pid = pid;
  record.child_step = pid ? step : null;
  record.child_started_ms = pid ? Date.now() : null;
  writeLock(lockPath, record);
}

/** Release the lock if this process holds it. */
export function release(lockPath = LOCK_PATH) {
  const record = readLock(lockPath);
  if (record && record.gate_pid === process.pid) {
    try {
      fs.unlinkSync(lockPath);
    } catch {
      /* already gone */
    }
  }
}
