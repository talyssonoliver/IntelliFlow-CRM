/**
 * Process helpers for the pre-ship gate: stop a step's whole process tree, and
 * clean up after a gate that was killed without running its own handlers.
 *
 * WHY
 * ---
 * Each gate peaks at four Vitest workers plus a `next build` (one orphaned build
 * reached 4.7 GB on 2026-10-05). Machine-wide test slots are NOT taken here: they
 * come from the shared wrapper ops/test-slots/with-slot.mjs, which re-runs the
 * gate under a slot. What this file guarantees is that no step is ever orphaned.
 *
 * Exit paths: success, failure, SIGINT/SIGTERM/SIGHUP/SIGBREAK and an uncaught
 * exception all run the gate's cleanup (installExitHandlers). A hard kill
 * (taskkill /F) runs no handler at all, and so does the death of something ABOVE
 * the gate (the `git push`, the husky hook shell: Claude Code's low-memory reaper
 * kills those). A detached watchdog (preship-watchdog.mjs) therefore watches the
 * gate and everything above it through the gate's state file, and stops the step
 * tree it recorded when any of them is gone.
 *
 * Only processes this gate recorded are ever stopped, and each only after its
 * start time is confirmed, so a reused PID is never touched.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// ---- processes ----------------------------------------------------------------

/** Whether a process with this PID exists. */
export function isAlive(pid, kill = (p, sig) => process.kill(p, sig)) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: it exists but belongs to someone else.
    return err.code === 'EPERM';
  }
}

/** When a process started, in ms since the epoch, or null if gone or unreadable. */
export function startTimeOf(pid, deps = {}) {
  const { platform = process.platform, run = spawnSync, alive = isAlive } = deps;
  if (!alive(pid)) return null;
  if (platform === 'win32') {
    const r = run(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `$p = Get-Process -Id ${Number(pid)} -ErrorAction SilentlyContinue; ` +
          `if ($p) { [DateTimeOffset]::new($p.StartTime).ToUnixTimeMilliseconds() }`,
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000, windowsHide: true }
    );
    const ms = Number.parseInt((r.stdout || '').trim(), 10);
    return Number.isFinite(ms) ? ms : null;
  }
  const r = run('ps', ['-o', 'lstart=', '-p', String(pid)], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 5000,
  });
  const ms = Date.parse((r.stdout || '').trim());
  return Number.isFinite(ms) ? ms : null;
}

const sameStart = (a, b) =>
  typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 2000;

/**
 * Whether `pid` is still the process recorded with start time `recordedStartMs`:
 * 'yes', 'no' (gone, or a different process reused the PID) or 'unknown' (alive
 * but its start time could not be read, or nothing was recorded).
 */
export function sameProcess(pid, recordedStartMs, deps = {}) {
  const { alive = isAlive, startOf = startTimeOf } = deps;
  if (!alive(pid)) return 'no';
  if (typeof recordedStartMs !== 'number') return 'unknown';
  const started = startOf(pid);
  if (started === null) return 'unknown';
  return sameStart(started, recordedStartMs) ? 'yes' : 'no';
}

/** PIDs above `pid` (parent, grandparent, ...), nearest first. */
export function ancestorsOf(pid, depth = 6, deps = {}) {
  const { platform = process.platform, run = spawnSync } = deps;
  if (platform === 'win32') {
    const r = run(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `$all = @{}; Get-CimInstance Win32_Process | ForEach-Object { $all[[int]$_.ProcessId] = $_ }; ` +
          `$p = $all[${Number(pid)}]; $out = @(); ` +
          `for ($i = 0; $i -lt ${Number(depth)} -and $p; $i++) { ` +
          `$q = $all[[int]$p.ParentProcessId]; ` +
          // A parent created after its child is a reused PID, not the parent.
          `if (-not $q -or $q.CreationDate -gt $p.CreationDate) { break }; ` +
          `$out += $q.ProcessId; $p = $q }; $out -join ','`,
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000, windowsHide: true }
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
    const r = run('ps', ['-o', 'ppid=', '-p', String(current)], {
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

/** Stop a process and everything it started (Windows: taskkill /T /F by PID). */
export function killTree(pid, deps = {}) {
  const {
    platform = process.platform,
    run = spawnSync,
    alive = isAlive,
    kill = (p, sig) => process.kill(p, sig),
  } = deps;
  if (!alive(pid)) return;
  if (platform === 'win32') {
    run('taskkill', ['/PID', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      timeout: 30000,
      windowsHide: true,
    });
    return;
  }
  // POSIX steps are spawned detached, so each is its own process group.
  try {
    kill(-pid, 'SIGKILL');
  } catch {
    try {
      kill(pid, 'SIGKILL');
    } catch {
      /* already gone */
    }
  }
}

// ---- exit paths ---------------------------------------------------------------

/**
 * Run `cleanup` once on every way this process can end that it gets to run
 * code for: normal exit, SIGINT/SIGTERM/SIGHUP/SIGBREAK, an uncaught exception
 * and an unhandled rejection. `cleanup` must be synchronous.
 * @returns {() => void} uninstall
 */
export function installExitHandlers(cleanup, { exit = (c) => process.exit(c), log } = {}) {
  let done = false;
  const once = () => {
    if (done) return;
    done = true;
    try {
      cleanup();
    } catch {
      /* cleaning up must not mask the real exit */
    }
  };
  const handlers = [];
  const on = (ev, fn) => {
    process.on(ev, fn);
    handlers.push([ev, fn]);
  };
  on('exit', once);
  const codes = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129, SIGBREAK: 131 };
  for (const [sig, code] of Object.entries(codes)) {
    try {
      on(sig, () => {
        log?.(`pre-ship: ${sig} received; stopping the running step and releasing the slot.`);
        once();
        exit(code);
      });
    } catch {
      /* signal not supported on this platform */
    }
  }
  on('uncaughtException', (err) => {
    process.stderr.write(`pre-ship: uncaught exception: ${err?.stack || err}\n`);
    once();
    exit(1);
  });
  on('unhandledRejection', (err) => {
    process.stderr.write(`pre-ship: unhandled rejection: ${err?.stack || err}\n`);
    once();
    exit(1);
  });
  return () => {
    for (const [ev, fn] of handlers) process.off(ev, fn);
  };
}

function writeFileAtomic(file, text) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

// ---- gate state: what the watchdog needs --------------------------------------

export const STATE_DIR =
  process.env.PRESHIP_STATE_DIR || path.join(os.tmpdir(), 'intelliflow-preship-gates');

export const gateStatePath = (pid, dir = STATE_DIR) => path.join(dir, `gate-${pid}.json`);

/** Write this gate's record: its pid and start, and the step process tree it is running. */
export function writeGateState(state, dir = STATE_DIR) {
  fs.mkdirSync(dir, { recursive: true });
  writeFileAtomic(gateStatePath(state.gate_pid, dir), JSON.stringify(state, null, 2));
}

export function readGateState(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Clean up after a gate that is gone: stop the step tree it recorded (only on a
 * confirmed start-time match) and remove its state file.
 * @returns {{stopped: number|null}}
 */
export function reapGate(state, file) {
  let stopped = null;
  if (
    Number.isInteger(state?.child_pid) &&
    sameProcess(state.child_pid, state.child_start_ms) === 'yes'
  ) {
    killTree(state.child_pid);
    stopped = state.child_pid;
  }
  try {
    fs.unlinkSync(file);
  } catch {
    /* already gone */
  }
  return { stopped };
}
