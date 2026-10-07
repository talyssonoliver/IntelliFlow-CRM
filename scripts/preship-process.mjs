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

let clockTicks;
/** USER_HZ, the unit of /proc/<pid>/stat starttime (100 on every common Linux). */
function linuxClockTicks(run) {
  if (clockTicks === undefined) {
    const r = run('getconf', ['CLK_TCK'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    });
    const hz = Number.parseInt((r.stdout || '').trim(), 10);
    clockTicks = hz > 0 ? hz : 100;
  }
  return clockTicks;
}

/**
 * Linux start time from /proc, aligned to the wall clock NOW: Date.now() minus how
 * long ago the process started (uptime - starttime). `ps -o lstart=` cannot be
 * used here: it is whole seconds, and it is boot time + ticks, which drifts from
 * the wall clock; measured on WSL it read 1.0-1.9 s before a Date.now() taken
 * straight after the spawn, so a recorded start never matched within 2 s and the
 * watchdog refused to stop a live orphaned step. Null when /proc is unreadable.
 */
function linuxProcStartMs(pid, { read, now, ticks }) {
  try {
    const stat = read(`/proc/${Number(pid)}/stat`);
    // Field 2 (comm) may hold spaces and parentheses; fields resume after the last ')'.
    // The rest starts at field 3 (state), so starttime (field 22) is rest[19].
    const rest = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    const startTicks = Number(rest[19]);
    const uptimeSec = Number(read('/proc/uptime').split(' ')[0]);
    if (!Number.isFinite(startTicks) || !Number.isFinite(uptimeSec)) return null;
    return Math.round(now() - (uptimeSec - startTicks / ticks()) * 1000);
  } catch {
    return null;
  }
}

/** When a process started, in ms since the epoch, or null if gone or unreadable. */
export function startTimeOf(pid, deps = {}) {
  const {
    platform = process.platform,
    run = spawnSync,
    alive = isAlive,
    read = (p) => fs.readFileSync(p, 'utf8'),
    now = Date.now,
    ticks = () => linuxClockTicks(run),
  } = deps;
  if (!alive(pid)) return null;
  if (platform === 'linux') {
    const ms = linuxProcStartMs(pid, { read, now, ticks });
    if (ms !== null) return ms;
  }
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
  // Other POSIX (macOS), or Linux without a readable /proc.
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

/**
 * How far up ancestorsOf looks for the `git push`. The gate re-runs itself under
 * with-slot, so on Windows the push is 8 levels up: gate <- cmd (with-slot's
 * shell) <- with-slot <- pre-ship <- cmd <- pnpm <- cmd (pnpm.cmd) <- sh (the
 * hook) <- git. The old fixed depth of 6 stopped at the pnpm shim, so a killed
 * push left every watched PID alive and the gate held its slot for nobody.
 */
export const ANCESTOR_SEARCH_DEPTH = 12;
/** What ancestorsOf returns when no git is above (a manual `pnpm run pre-ship`): as before. */
export const ANCESTOR_FALLBACK_DEPTH = 6;

const isGit = (name) => /^git(\.exe)?$/i.test(path.basename(String(name ?? '')));

/**
 * The PIDs to watch above the gate: up to and including the `git` running the
 * push hook (and a git directly above it: Git for Windows' cmd\git.exe wrapper
 * starts the real git.exe), or, when there is no git within `depth` levels, the
 * nearest ANCESTOR_FALLBACK_DEPTH.
 */
function upToGit(chain) {
  const first = chain.findIndex((a) => isGit(a.name));
  if (first === -1) return chain.slice(0, ANCESTOR_FALLBACK_DEPTH).map((a) => a.pid);
  let last = first;
  while (last + 1 < chain.length && isGit(chain[last + 1].name)) last++;
  return chain.slice(0, last + 1).map((a) => a.pid);
}

/** PIDs above `pid` (parent, grandparent, ...), nearest first, ending at the push's git. */
export function ancestorsOf(pid, depth = ANCESTOR_SEARCH_DEPTH, deps = {}) {
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
          `$out += "$($q.ProcessId)|$($q.Name)"; $p = $q }; $out -join ','`,
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000, windowsHide: true }
    );
    const chain = (r.stdout || '')
      .trim()
      .split(',')
      .map((entry) => {
        const [id, name = ''] = entry.split('|');
        return { pid: Number.parseInt(id, 10), name: name.trim() };
      })
      .filter((a) => Number.isInteger(a.pid) && a.pid > 4);
    return upToGit(chain);
  }
  const ps = (field, of) =>
    (
      run('ps', ['-o', field, '-p', String(of)], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 5000,
      }).stdout || ''
    ).trim();
  const chain = [];
  let current = pid;
  for (let i = 0; i < depth; i++) {
    const parent = Number.parseInt(ps('ppid=', current), 10);
    if (!Number.isInteger(parent) || parent <= 1) break;
    chain.push({ pid: parent, name: ps('comm=', parent) });
    current = parent;
  }
  return upToGit(chain);
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
