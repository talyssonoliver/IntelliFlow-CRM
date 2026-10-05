/**
 * The pre-ship gate's share of the machine's test slots, and a clean exit.
 *
 * WHY
 * ---
 * On 2026-10-02 five pushes were stopped for low memory, and on 2026-10-05 ten
 * gates and pre-ships ran at once on one 64 GB machine. Each gate peaks at four
 * Vitest workers plus a `next build` (one orphaned build reached 4.7 GB). The
 * owner's rule is AT MOST THREE FULL TEST RUNS AT ONCE, MACHINE-WIDE. A rule in
 * a README is advice, so this is the lock.
 *
 * THE SLOTS
 * ---------
 * Three directories, slot1.lock .. slot3.lock, in the SHARED slot directory
 * (default ~/ops/test-slots, override PRESHIP_SLOT_DIR). `mkdir` is atomic, so
 * whoever creates one holds it. Inside, owner.json says who, in the format the
 * shared wrapper (ops/test-slots/with-slot.mjs) writes and reads, so a gate and
 * a `with-slot` run share the same three slots: pid, pidStart, repo, branch,
 * cwd, command, label, startedAt, nonce, childPid, childStart. info.txt is the
 * same facts for a human.
 *
 * A gate takes a slot lazily, only when about to run a heavy step (see
 * `heavy: true` in pre-ship.mjs), and holds it to the end of the run.
 *
 * STALE (README rule): a slot is reclaimed only when its owner is gone (pid
 * dead, or reused by another process) AND it is older than the age limit (45
 * min, PRESHIP_SLOT_MAX_AGE_MIN). A slot with no readable owner is judged by
 * age alone, after a short grace for the window between mkdir and the write.
 * A live owner is never reclaimed, however long its gate has run.
 *
 * RELEASE removes ONLY the slot this process took: the slot's nonce must match
 * ours. A failed mkdir never leads to a removal, and a reaper that loses a race
 * puts the slot back.
 *
 * Exit paths: success, failure, SIGINT/SIGTERM/SIGHUP/SIGBREAK and an uncaught
 * exception all run `release` (installExitHandlers). A hard kill (taskkill /F)
 * runs no handler at all, so a detached watchdog (preship-watchdog.mjs) watches
 * the gate through its state file, stops the step tree it recorded, and
 * releases the slot.
 *
 * Only processes this file recorded are ever stopped, and each only after its
 * start time is confirmed, so a reused PID is never touched.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

/** Default shared slot directory: the same one with-slot.mjs uses. */
export const DEFAULT_SLOT_DIR = path.join(os.homedir(), 'ops', 'test-slots');
/** Used when the shared directory cannot be created. Machine-wide, not shared with other tools. */
export const FALLBACK_SLOT_DIR = path.join(os.tmpdir(), 'intelliflow-preship-slots');
export const SLOT_COUNT = Number(process.env.PRESHIP_SLOT_COUNT || 3);
export const SLOT_MAX_AGE_MS = Number(process.env.PRESHIP_SLOT_MAX_AGE_MIN || 45) * 60_000;
/** owner.json is written a few ms after mkdir; do not judge a slot inside that window. */
export const WRITE_GRACE_MS = 60_000;

// ---- processes ----------------------------------------------------------------

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

/** When a process started, in ms since the epoch, or null if gone or unreadable. */
export function startTimeOf(pid) {
  if (!isAlive(pid)) return null;
  if (process.platform === 'win32') {
    const r = spawnSync(
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
  const r = spawnSync('ps', ['-o', 'lstart=', '-p', String(pid)], {
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
export function sameProcess(pid, recordedStartMs) {
  if (!isAlive(pid)) return 'no';
  if (typeof recordedStartMs !== 'number') return 'unknown';
  const started = startTimeOf(pid);
  if (started === null) return 'unknown';
  return sameStart(started, recordedStartMs) ? 'yes' : 'no';
}

/** PIDs above `pid` (parent, grandparent, ...), nearest first. */
export function ancestorsOf(pid, depth = 6) {
  if (process.platform === 'win32') {
    const r = spawnSync(
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

/** Stop a process and everything it started (Windows: taskkill /T /F by PID). */
export function killTree(pid) {
  if (!isAlive(pid)) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      timeout: 30000,
      windowsHide: true,
    });
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

// ---- slot directory -----------------------------------------------------------

/**
 * Where the slots live. PRESHIP_SLOT_DIR wins, then TEST_SLOTS_DIR (the shared
 * wrapper's own override), then the shared default. A missing directory is
 * created; if it cannot be, fall back to a machine-wide temp directory and say
 * so, rather than run unlimited.
 * @returns {{dir: string, fellBack: boolean}}
 */
export function resolveSlotDir(env = process.env, log = () => {}) {
  const wanted = env.PRESHIP_SLOT_DIR || env.TEST_SLOTS_DIR || DEFAULT_SLOT_DIR;
  try {
    if (!fs.existsSync(wanted))
      log(`pre-ship: slot directory ${wanted} did not exist; creating it.`);
    fs.mkdirSync(wanted, { recursive: true });
    return { dir: wanted, fellBack: false };
  } catch (err) {
    log(
      `pre-ship: cannot use slot directory ${wanted} (${err.code || err.message}); ` +
        `falling back to ${FALLBACK_SLOT_DIR}. Other tools sharing ${wanted} will not see this run.`
    );
    fs.mkdirSync(FALLBACK_SLOT_DIR, { recursive: true });
    return { dir: FALLBACK_SLOT_DIR, fellBack: true };
  }
}

const slotPath = (dir, n) => path.join(dir, `slot${n}.lock`);

/** Read a slot: null when it does not exist. Never throws. */
export function readSlot(dir, n) {
  const p = slotPath(dir, n);
  let st;
  try {
    st = fs.statSync(p);
  } catch {
    return null;
  }
  const born = Math.min(st.birthtimeMs || st.mtimeMs, st.mtimeMs);
  let owner = null;
  try {
    owner = JSON.parse(fs.readFileSync(path.join(p, 'owner.json'), 'utf8'));
  } catch {
    /* none yet, or a hand-made slot */
  }
  let legacy = null;
  if (!owner) {
    try {
      legacy = fs
        .readdirSync(p)
        .map((f) => {
          try {
            return fs.readFileSync(path.join(p, f), 'utf8');
          } catch {
            return '';
          }
        })
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
    } catch {
      /* gone */
    }
  }
  const startedAt = owner?.startedAt ? Date.parse(owner.startedAt) : born;
  return {
    n,
    path: p,
    owner,
    legacy,
    born,
    startedAt: Number.isFinite(startedAt) ? startedAt : born,
  };
}

/** One line saying who holds a slot. */
export function describeSlot(s, now = Date.now()) {
  const mins = Math.round((now - s.startedAt) / 60_000);
  if (s.owner) {
    const who = s.owner.label || s.owner.repo || '?';
    return `slot${s.n} ${who}${s.owner.branch ? '@' + s.owner.branch : ''} pid ${s.owner.pid}, ${mins}m`;
  }
  return `slot${s.n} ${s.legacy ? s.legacy.slice(0, 60) : '(no owner yet)'}, ${mins}m`;
}

/**
 * Why this slot is stale, or null if it is genuinely busy. Owner gone AND older
 * than the age limit; a live owner is never stale.
 */
export function staleReason(s, now = Date.now(), maxAgeMs = SLOT_MAX_AGE_MS) {
  const age = now - s.startedAt;
  if (!s.owner || !Number.isInteger(s.owner.pid)) {
    // A crash between mkdir and the write, or a hand-made slot with no pid.
    if (now - s.born < WRITE_GRACE_MS) return null;
    return age > maxAgeMs ? `no owner record and older than ${maxAgeMs / 60_000} min` : null;
  }
  if (age <= maxAgeMs) return null;
  const alive = sameProcess(s.owner.pid, s.owner.pidStart);
  if (alive === 'no')
    return `owner pid ${s.owner.pid} is gone and the slot is older than ${maxAgeMs / 60_000} min`;
  return null; // 'yes' or 'unknown': fail safe, a live gate keeps its slot
}

function writeFileAtomic(file, text) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

function infoText(rec) {
  return [
    `session: ${rec.label}`,
    `repo: ${rec.repo}`,
    `branch: ${rec.branch ?? ''}`,
    `worktree: ${rec.cwd}`,
    `pid: ${rec.pid}`,
    `start: ${rec.startedAt}`,
    `command: ${rec.command}`,
    '',
  ].join('\n');
}

/**
 * Take the lowest free slot, or return null when all are taken. The mkdir is the
 * lock; nothing is ever removed on a failed mkdir.
 */
export function tryTakeSlot(dir, record, count = SLOT_COUNT) {
  for (let n = 1; n <= count; n++) {
    const p = slotPath(dir, n);
    try {
      fs.mkdirSync(p);
    } catch (err) {
      if (err.code === 'EEXIST') continue; // held by someone else: leave it alone
      throw err;
    }
    // We created it, so it is ours to fill in (and ours to undo if that fails).
    try {
      writeFileAtomic(path.join(p, 'owner.json'), JSON.stringify(record, null, 2));
      writeFileAtomic(path.join(p, 'info.txt'), infoText(record));
    } catch (err) {
      try {
        fs.rmSync(p, { recursive: true, force: true });
      } catch {
        /* nothing more to do */
      }
      throw err;
    }
    return n;
  }
  return null;
}

/**
 * Reclaim a stale slot. Rename first (atomic; one reaper wins), then check what
 * was taken is the slot that was judged, not a fresh one created in between.
 * Also stops the command tree its dead owner left running, on a confirmed match.
 * @returns {boolean} whether this call removed it
 */
export function reapSlot(s, why, { log = () => {}, reapLog } = {}) {
  const tomb = `${s.path}.reap-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
  try {
    fs.renameSync(s.path, tomb);
  } catch {
    return false; // someone else got it, or it was released
  }
  let took = null;
  try {
    took = JSON.parse(fs.readFileSync(path.join(tomb, 'owner.json'), 'utf8'));
  } catch {
    /* no owner record */
  }
  if ((took?.nonce ?? null) !== (s.owner?.nonce ?? null)) {
    try {
      fs.renameSync(tomb, s.path); // it changed hands: put it back
      return false;
    } catch {
      log(
        `pre-ship: WARNING slot${s.n} changed hands while being reclaimed and could not be put back.`
      );
    }
  }
  const o = s.owner;
  if (o?.childPid && sameProcess(o.childPid, o.childStart) === 'yes') {
    log(
      `pre-ship: slot${s.n}'s owner is gone; stopping the command it left running (pid ${o.childPid}).`
    );
    killTree(o.childPid);
  }
  try {
    fs.rmSync(tomb, { recursive: true, force: true });
  } catch {
    /* leftover tomb is harmless: its name is not a slot */
  }
  const line = `${new Date().toISOString()} reaped slot${s.n} (${describeSlot(s)}): ${why} [by pid ${process.pid}, pre-ship]`;
  log(`pre-ship: ${line}`);
  try {
    fs.appendFileSync(path.join(path.dirname(s.path), 'reap.log'), line + '\n');
  } catch {
    /* the log is a courtesy */
  }
  return true;
}

/**
 * Take a slot, waiting while all are held by live (or recent) owners.
 * @param {object} owner  {label, repo, branch, cwd, command}
 * @param {object} [opts] {dir, count, pollMs, log, sleep, now}
 * @returns {Promise<{n:number, dir:string, path:string, nonce:string, record:object}>}
 */
export async function acquireSlot(owner, opts = {}) {
  const log = opts.log || (() => {});
  const dir = opts.dir ?? resolveSlotDir(process.env, log).dir;
  const count = opts.count ?? SLOT_COUNT;
  const pollMs = opts.pollMs ?? 30_000;
  const sleep = opts.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const maxAgeMs = opts.maxAgeMs ?? SLOT_MAX_AGE_MS;
  const record = {
    pid: process.pid,
    pidStart: startTimeOf(process.pid),
    repo: owner.repo ?? path.basename(process.cwd()),
    branch: owner.branch ?? null,
    cwd: owner.cwd ?? process.cwd(),
    command: owner.command ?? 'pre-ship',
    label: owner.label ?? null,
    startedAt: null,
    nonce: crypto.randomBytes(8).toString('hex'),
    childPid: null,
    childStart: null,
  };
  let lastBeat = 0;
  for (;;) {
    record.startedAt = new Date().toISOString();
    const n = tryTakeSlot(dir, record, count);
    if (n) {
      return { n, dir, path: slotPath(dir, n), nonce: record.nonce, record: { ...record } };
    }
    const slots = Array.from({ length: count }, (_, i) => readSlot(dir, i + 1)).filter(Boolean);
    let reaped = false;
    for (const s of slots) {
      const why = staleReason(s, Date.now(), maxAgeMs);
      if (why && reapSlot(s, why, { log })) reaped = true;
    }
    if (reaped) continue;
    const now = Date.now();
    if (now - lastBeat >= (opts.beatMs ?? 120_000) || lastBeat === 0) {
      lastBeat = now;
      log(
        `pre-ship: waiting for a test slot (${slots.length}/${count} busy: ` +
          `${slots.map((s) => describeSlot(s, now)).join('; ')})`
      );
    }
    await sleep(pollMs + Math.floor(Math.random() * (pollMs / 2)));
  }
}

/** Whether `slot` is still the slot this process took (nonce match). */
function ownsSlot(slot) {
  try {
    return (
      JSON.parse(fs.readFileSync(path.join(slot.path, 'owner.json'), 'utf8')).nonce === slot.nonce
    );
  } catch {
    return false;
  }
}

/**
 * Release the slot if, and only if, it is still ours. Synchronous: it runs from
 * 'exit' handlers. Safe to call twice.
 * @returns {boolean} whether this call removed it
 */
export function releaseSlot(slot) {
  if (!slot || slot.released) return false;
  slot.released = true;
  if (!ownsSlot(slot)) return false; // already reaped, or never ours: touch nothing
  try {
    fs.rmSync(slot.path, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

/** Record the running step in the slot's owner.json, so a reaper can stop it. */
export function recordSlotChild(slot, pid, startMs) {
  if (!slot || !ownsSlot(slot)) return;
  try {
    const file = path.join(slot.path, 'owner.json');
    const cur = JSON.parse(fs.readFileSync(file, 'utf8'));
    cur.childPid = pid ?? null;
    cur.childStart = pid ? (startMs ?? null) : null;
    writeFileAtomic(file, JSON.stringify(cur, null, 2));
  } catch {
    /* best effort */
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

// ---- gate state: what the watchdog needs --------------------------------------

export const STATE_DIR =
  process.env.PRESHIP_STATE_DIR || path.join(os.tmpdir(), 'intelliflow-preship-gates');

export const gateStatePath = (pid, dir = STATE_DIR) => path.join(dir, `gate-${pid}.json`);

/** Write this gate's record: its pid and start, the step tree and the slot it holds. */
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
 * confirmed start-time match), release the slot it held (only if the nonce is
 * still its own) and remove its state file.
 * @returns {{stopped: number|null, released: boolean}}
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
  const released = state?.slot ? releaseSlot({ ...state.slot }) : false;
  try {
    fs.unlinkSync(file);
  } catch {
    /* already gone */
  }
  return { stopped, released };
}
