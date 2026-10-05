/**
 * Tests for scripts/preship-lock.mjs and scripts/preship-watchdog.mjs: at most
 * three full test runs at once on one machine, and nothing left running or held
 * when a gate dies.
 *
 * Every slot directory is a fresh os.tmpdir() directory; no test touches the
 * real shared one (~/ops/test-slots). The "step" and "gate" processes are real
 * `node` children, so killTree, the PID checks and the exit handlers run against
 * the operating system, not a mock.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';

import {
  acquireSlot,
  describeSlot,
  FALLBACK_SLOT_DIR,
  isAlive,
  killTree,
  readGateState,
  readSlot,
  reapGate,
  releaseSlot,
  resolveSlotDir,
  sameProcess,
  staleReason,
  tryTakeSlot,
  writeGateState,
} from '../preship-lock.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS = path.resolve(HERE, '..');
const REPO_ROOT = path.resolve(SCRIPTS, '..');
const LOCK_URL = pathToFileURL(path.join(SCRIPTS, 'preship-lock.mjs')).href;
const PRESHIP = path.join(SCRIPTS, 'pre-ship.mjs');
const WATCHDOG = path.join(SCRIPTS, 'preship-watchdog.mjs');
const isWin = process.platform === 'win32';

const spawned: ChildProcess[] = [];
const tmpDirs: string[] = [];

function tmpDir(prefix = 'preship-slots-'): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(d);
  return d;
}

const rec = (over: Record<string, unknown> = {}) => ({
  pid: process.pid,
  pidStart: null,
  repo: 'r',
  branch: 'b',
  cwd: '/w',
  command: 'pre-ship',
  label: 'me',
  startedAt: new Date().toISOString(),
  nonce: Math.random().toString(36).slice(2),
  ...over,
});

/** A real long-running process standing in for a gate step. */
function longRunning(): ChildProcess {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    stdio: 'ignore',
    detached: !isWin,
  });
  spawned.push(child);
  return child;
}

/** The PID of a process that has already exited. */
function deadPid(): number {
  const r = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], {
    encoding: 'utf8',
  });
  return Number.parseInt(r.stdout, 10);
}

async function waitFor(check: () => boolean, ms = 20000): Promise<boolean> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (check()) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return check();
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const slotDirOf = (dir: string, n: number) => path.join(dir, `slot${n}.lock`);
const exists = (p: string) => fs.existsSync(p);

/** Write a slot by hand, the way an owner that has since died would have left it. */
function plantSlot(dir: string, n: number, owner: Record<string, unknown> | null, ageMin = 0) {
  const p = slotDirOf(dir, n);
  fs.mkdirSync(p);
  if (owner) fs.writeFileSync(path.join(p, 'owner.json'), JSON.stringify(owner));
  if (ageMin) {
    const t = new Date(Date.now() - ageMin * 60_000);
    fs.utimesSync(p, t, t);
  }
  return p;
}

afterEach(() => {
  for (const c of spawned.splice(0)) {
    try {
      c.kill('SIGKILL');
    } catch {
      /* gone */
    }
  }
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

// ---- acquire ------------------------------------------------------------------

describe('acquireSlot', () => {
  it('takes slot1, then slot2, then slot3, each with owner.json and info.txt', async () => {
    const dir = tmpDir();
    const taken = [];
    for (let i = 1; i <= 3; i++) {
      taken.push(await acquireSlot({ label: `s${i}`, branch: 'br', cwd: '/wt' }, { dir }));
    }
    expect(taken.map((s) => s.n)).toEqual([1, 2, 3]);
    const owner = JSON.parse(fs.readFileSync(path.join(slotDirOf(dir, 1), 'owner.json'), 'utf8'));
    expect(owner).toMatchObject({ pid: process.pid, label: 's1', branch: 'br', cwd: '/wt' });
    expect(owner.nonce).toBe(taken[0].nonce);
    expect(Date.parse(owner.startedAt)).toBeGreaterThan(Date.now() - 60_000);
    const info = fs.readFileSync(path.join(slotDirOf(dir, 1), 'info.txt'), 'utf8');
    expect(info).toMatch(/session: s1/);
    expect(info).toMatch(/worktree: \/wt/);
    expect(info).toMatch(new RegExp(`pid: ${process.pid}`));
    expect(info).toMatch(/start: \d{4}-\d\d-\d\dT/);
  });

  it('never has more than three holders, and the fourth waits and names every holder', async () => {
    const dir = tmpDir();
    for (let i = 1; i <= 3; i++) await acquireSlot({ label: `holder${i}` }, { dir });
    const logs: string[] = [];
    let polls = 0;
    const fourth = await acquireSlot(
      { label: 'fourth' },
      {
        dir,
        log: (m: string) => logs.push(m),
        beatMs: 0,
        sleep: async () => {
          polls += 1;
          // The holder of slot2 finishes after the second poll.
          if (polls === 2) fs.rmSync(slotDirOf(dir, 2), { recursive: true });
        },
      }
    );
    expect(polls).toBe(2);
    expect(fourth.n).toBe(2);
    const waiting = logs.filter((l) => /waiting for a test slot/.test(l));
    expect(waiting.length).toBeGreaterThan(0);
    expect(waiting[0]).toMatch(/\(3\/3 busy:/);
    for (const who of ['holder1', 'holder2', 'holder3']) expect(waiting[0]).toContain(who);
    // The other two holders were left exactly as they were.
    expect(exists(slotDirOf(dir, 1))).toBe(true);
    expect(exists(slotDirOf(dir, 3))).toBe(true);
  });

  it('a failed mkdir never removes the slot that was in the way', () => {
    const dir = tmpDir();
    const originals: string[] = [];
    for (let i = 1; i <= 3; i++) {
      const owner = rec({ label: `held${i}`, nonce: `n${i}` });
      plantSlot(dir, i, owner);
      originals.push(fs.readFileSync(path.join(slotDirOf(dir, i), 'owner.json'), 'utf8'));
    }
    expect(tryTakeSlot(dir, rec())).toBeNull();
    for (let i = 1; i <= 3; i++) {
      expect(fs.readFileSync(path.join(slotDirOf(dir, i), 'owner.json'), 'utf8')).toBe(
        originals[i - 1]
      );
    }
  });

  it('two racing acquirers never get the same slot', async () => {
    const dir = tmpDir();
    const all = await Promise.all(
      Array.from({ length: 3 }, (_, i) => acquireSlot({ label: `r${i}` }, { dir }))
    );
    expect(new Set(all.map((s) => s.n)).size).toBe(3);
  });
});

// ---- stale reclaim ------------------------------------------------------------

describe('stale slots (owner gone AND older than 45 min)', () => {
  const noWait = (dir: string, extra: Record<string, unknown> = {}) => ({
    dir,
    count: 1,
    beatMs: 0,
    log: () => {},
    // If acquire has to wait, fail the test instead of looping for ever.
    sleep: async () => {
      throw new Error('waited');
    },
    ...extra,
  });

  it('reclaims a slot whose pid is gone and that is 50 min old, and logs it', async () => {
    const dir = tmpDir();
    plantSlot(dir, 1, rec({ pid: deadPid(), startedAt: minutesAgo(50), label: 'ghost' }), 50);
    const logs: string[] = [];
    const s = await acquireSlot(
      { label: 'mine' },
      noWait(dir, { log: (m: string) => logs.push(m) })
    );
    expect(s.n).toBe(1);
    expect(JSON.parse(fs.readFileSync(path.join(s.path, 'owner.json'), 'utf8')).label).toBe('mine');
    expect(fs.readFileSync(path.join(dir, 'reap.log'), 'utf8')).toMatch(/reaped slot1 .*ghost/);
    expect(logs.join('\n')).toMatch(/reaped slot1/);
  });

  it('does NOT reclaim a slot whose pid is gone but that is only 5 min old', async () => {
    const dir = tmpDir();
    plantSlot(dir, 1, rec({ pid: deadPid(), startedAt: minutesAgo(5), label: 'recent' }), 5);
    await expect(acquireSlot({ label: 'mine' }, noWait(dir))).rejects.toThrow('waited');
    expect(exists(slotDirOf(dir, 1))).toBe(true);
  });

  it('does NOT reclaim a slot whose owner is alive, however old', async () => {
    const dir = tmpDir();
    const holder = longRunning();
    await waitFor(() => isAlive(holder.pid!));
    plantSlot(
      dir,
      1,
      rec({ pid: holder.pid, startedAt: minutesAgo(180), label: 'long gate' }),
      180
    );
    await expect(acquireSlot({ label: 'mine' }, noWait(dir))).rejects.toThrow('waited');
    expect(exists(slotDirOf(dir, 1))).toBe(true);
  });

  it('reclaims when the owner pid was reused by a different process', async () => {
    const dir = tmpDir();
    // This test process is alive, but it did not start an hour ago.
    plantSlot(
      dir,
      1,
      rec({ pid: process.pid, pidStart: Date.now() - 3_600_000, startedAt: minutesAgo(50) }),
      50
    );
    const s = await acquireSlot({ label: 'mine' }, noWait(dir));
    expect(s.n).toBe(1);
  });

  it('a slot with no owner record is judged by age alone, after the write grace', () => {
    const dir = tmpDir();
    plantSlot(dir, 1, null, 0); // just made: the owner file may be a few ms away
    plantSlot(dir, 2, null, 50); // hand-made or crashed, and old
    const young = readSlot(dir, 1)!;
    const old = readSlot(dir, 2)!;
    expect(staleReason(young)).toBeNull();
    expect(staleReason(old)).toMatch(/no owner record and older than 45 min/);
    expect(describeSlot(old)).toMatch(/slot2/);
  });
});

// ---- release ------------------------------------------------------------------

describe('releaseSlot', () => {
  it('removes the slot this process took and nothing else', async () => {
    const dir = tmpDir();
    const a = await acquireSlot({ label: 'a' }, { dir });
    const b = await acquireSlot({ label: 'b' }, { dir });
    expect(releaseSlot(a)).toBe(true);
    expect(exists(a.path)).toBe(false);
    expect(exists(b.path)).toBe(true);
    expect(releaseSlot(a)).toBe(false); // a second release is a no-op
  });

  it('leaves a slot alone once someone else owns it (reaped, then re-taken)', async () => {
    const dir = tmpDir();
    const mine = await acquireSlot({ label: 'mine' }, { dir });
    // The slot was reaped as stale and another run took slot1 in the meantime.
    fs.rmSync(mine.path, { recursive: true });
    const theirs = plantSlot(dir, 1, rec({ label: 'theirs', nonce: 'someone-elses' }));
    expect(releaseSlot(mine)).toBe(false);
    expect(exists(theirs)).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(theirs, 'owner.json'), 'utf8')).label).toBe(
      'theirs'
    );
  });

  it('never removes a slot it never held', () => {
    const dir = tmpDir();
    const p = plantSlot(dir, 2, rec({ nonce: 'x' }));
    expect(releaseSlot({ path: p, nonce: 'not-x', n: 2 })).toBe(false);
    expect(exists(p)).toBe(true);
  });
});

// ---- the slot directory -------------------------------------------------------

describe('resolveSlotDir', () => {
  it('creates a missing directory and says so', () => {
    const base = tmpDir();
    const wanted = path.join(base, 'not', 'there', 'yet');
    const logs: string[] = [];
    const r = resolveSlotDir({ PRESHIP_SLOT_DIR: wanted }, (m: string) => logs.push(m));
    expect(r).toEqual({ dir: wanted, fellBack: false });
    expect(fs.statSync(wanted).isDirectory()).toBe(true);
    expect(logs.join('\n')).toMatch(/did not exist; creating it/);
  });

  it('falls back to a temp directory, and says so, when it cannot be created', () => {
    const base = tmpDir();
    const blocker = path.join(base, 'a-file');
    fs.writeFileSync(blocker, 'x');
    const logs: string[] = [];
    const r = resolveSlotDir(
      { PRESHIP_SLOT_DIR: path.join(blocker, 'slots') }, // a directory cannot live inside a file
      (m: string) => logs.push(m)
    );
    expect(r).toEqual({ dir: FALLBACK_SLOT_DIR, fellBack: true });
    expect(logs.join('\n')).toMatch(/falling back to/);
  });

  it('PRESHIP_SLOT_DIR beats TEST_SLOTS_DIR, and the default is ~/ops/test-slots', () => {
    const a = tmpDir();
    const b = tmpDir();
    expect(resolveSlotDir({ PRESHIP_SLOT_DIR: a, TEST_SLOTS_DIR: b }).dir).toBe(a);
    expect(resolveSlotDir({ TEST_SLOTS_DIR: b }).dir).toBe(b);
    const src = fs.readFileSync(path.join(SCRIPTS, 'preship-lock.mjs'), 'utf8');
    expect(src).toMatch(/DEFAULT_SLOT_DIR = path\.join\(os\.homedir\(\), 'ops', 'test-slots'\)/);
  });
});

// ---- every exit path releases the slot ---------------------------------------

/** A child that takes a slot, installs the exit handlers, then ends in `mode`. */
function harness(dir: string): string {
  const file = path.join(dir, 'harness.mjs');
  fs.writeFileSync(
    file,
    `import { acquireSlot, releaseSlot, installExitHandlers } from ${JSON.stringify(LOCK_URL)};
const mode = process.argv[2];
const slot = await acquireSlot({ label: 'child-' + mode }, { dir: process.env.SLOT_DIR, pollMs: 50 });
installExitHandlers(() => releaseSlot(slot));
console.log('READY ' + slot.n);
if (mode === 'exit0') process.exit(0);
if (mode === 'exit1') process.exit(1);
if (mode === 'throw') setTimeout(() => { throw new Error('boom'); }, 50);
if (mode === 'reject') setTimeout(() => { Promise.reject(new Error('boom')); }, 50);
if (mode.startsWith('SIG')) setTimeout(() => process.emit(mode), 50);
if (mode === 'hold') setInterval(() => {}, 1000);
`
  );
  return file;
}

function runHarness(dir: string, mode: string) {
  const slots = path.join(dir, 'slots');
  fs.mkdirSync(slots, { recursive: true });
  const r = spawnSync(process.execPath, [harness(dir), mode], {
    env: { ...process.env, SLOT_DIR: slots },
    encoding: 'utf8',
    timeout: 30000,
  });
  return { r, slot1: slotDirOf(slots, 1) };
}

describe('the slot is released on every exit path', () => {
  const cases: Array<[string, number]> = [
    ['exit0', 0],
    ['exit1', 1],
    ['throw', 1],
    ['reject', 1],
    ['SIGINT', 130],
    ['SIGTERM', 143],
    ['SIGBREAK', 131],
    ['SIGHUP', 129],
  ];
  for (const [mode, code] of cases) {
    it(`mode ${mode} exits ${code} and leaves no slot behind`, () => {
      const dir = tmpDir('preship-exit-');
      const { r, slot1 } = runHarness(dir, mode);
      expect(r.stdout).toMatch(/READY 1/);
      expect(r.status).toBe(code);
      expect(exists(slot1)).toBe(false);
    });
  }

  it.skipIf(isWin)('a real SIGTERM from outside releases the slot (POSIX)', async () => {
    const dir = tmpDir('preship-exit-');
    const slots = path.join(dir, 'slots');
    fs.mkdirSync(slots);
    const child = spawn(process.execPath, [harness(dir), 'hold'], {
      env: { ...process.env, SLOT_DIR: slots },
      stdio: 'ignore',
    });
    spawned.push(child);
    expect(await waitFor(() => exists(slotDirOf(slots, 1)))).toBe(true);
    child.kill('SIGTERM');
    expect(await waitFor(() => !exists(slotDirOf(slots, 1)))).toBe(true);
  });
});

// ---- orphans: the step tree and the hard-kill watchdog -------------------------

/** A "step" that starts a grandchild, like turbo starting vitest. Prints the grandchild pid. */
const STEP_SOURCE = `
const { spawn } = require('node:child_process');
const g = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
console.log(g.pid);
setInterval(() => {}, 1000);
`;

function startStep(): Promise<{ step: ChildProcess; grandchild: number }> {
  return new Promise((resolve, reject) => {
    const step = spawn(process.execPath, ['-e', STEP_SOURCE], {
      stdio: ['ignore', 'pipe', 'ignore'],
      detached: !isWin,
    });
    spawned.push(step);
    step.stdout!.once('data', (d) => resolve({ step, grandchild: Number.parseInt(String(d), 10) }));
    step.once('error', reject);
  });
}

describe('orphaned step trees', () => {
  it('killTree stops the step and everything it started', async () => {
    const { step, grandchild } = await startStep();
    expect(isAlive(step.pid!)).toBe(true);
    expect(isAlive(grandchild)).toBe(true);
    killTree(step.pid!);
    expect(await waitFor(() => !isAlive(step.pid!) && !isAlive(grandchild))).toBe(true);
  });

  it('reapGate stops the recorded step tree and releases the gate own slot', async () => {
    const dir = tmpDir();
    const slot = await acquireSlot({ label: 'gate' }, { dir });
    const { step, grandchild } = await startStep();
    const state = {
      gate_pid: deadPid(),
      child_pid: step.pid,
      child_start_ms: Date.now(),
      slot: { path: slot.path, nonce: slot.nonce },
    };
    const file = path.join(dir, 'gate.json');
    fs.writeFileSync(file, JSON.stringify(state));
    const out = reapGate(state, file);
    expect(out).toMatchObject({ stopped: step.pid, released: true });
    expect(await waitFor(() => !isAlive(step.pid!) && !isAlive(grandchild))).toBe(true);
    expect(exists(slot.path)).toBe(false);
    expect(exists(file)).toBe(false);
  });

  it('reapGate never stops a process that only reused the recorded pid, nor a slot that is not the gate own', async () => {
    const dir = tmpDir();
    const bystander = longRunning();
    await waitFor(() => isAlive(bystander.pid!));
    const theirs = plantSlot(dir, 1, rec({ nonce: 'theirs' }));
    const state = {
      gate_pid: deadPid(),
      child_pid: bystander.pid,
      child_start_ms: 1, // recorded long before this process started: a different process
      slot: { path: theirs, nonce: 'ours' },
    };
    const file = path.join(dir, 'gate.json');
    fs.writeFileSync(file, JSON.stringify(state));
    expect(sameProcess(bystander.pid!, 1)).toBe('no');
    expect(reapGate(state, file)).toEqual({ stopped: null, released: false });
    expect(isAlive(bystander.pid!)).toBe(true);
    expect(exists(theirs)).toBe(true);
  });

  /** A gate that holds a slot and has a step running, with the watchdog beside it. */
  async function startGate(dir: string, ancestors = '') {
    const slots = path.join(dir, 'slots');
    const stateDir = path.join(dir, 'state');
    fs.mkdirSync(slots, { recursive: true });
    const file = path.join(dir, 'gate-harness.mjs');
    fs.writeFileSync(
      file,
      `import { spawn } from 'node:child_process';
import { acquireSlot, gateStatePath, writeGateState } from ${JSON.stringify(LOCK_URL)};
const slot = await acquireSlot({ label: 'gate' }, { dir: process.env.SLOT_DIR });
const step = spawn(process.execPath, ['-e', ${JSON.stringify(STEP_SOURCE)}], { stdio: ['ignore', 'pipe', 'ignore'] });
step.stdout.once('data', (d) => {
  const state = { gate_pid: process.pid, child_pid: step.pid, child_start_ms: Date.now(),
    slot: { path: slot.path, nonce: slot.nonce } };
  writeGateState(state, process.env.STATE_DIR);
  const w = spawn(process.execPath, [${JSON.stringify(WATCHDOG)}, String(process.pid),
    gateStatePath(process.pid, process.env.STATE_DIR), process.env.ANCESTORS || ''],
    { detached: true, stdio: 'ignore' });
  w.unref();
  console.log(JSON.stringify({ gate: process.pid, step: step.pid, grandchild: Number(String(d).trim()) }));
});
setInterval(() => {}, 1000);
`
    );
    const gate = spawn(process.execPath, [file], {
      env: {
        ...process.env,
        SLOT_DIR: slots,
        STATE_DIR: stateDir,
        PRESHIP_STATE_DIR: stateDir,
        PRESHIP_WATCHDOG_POLL_MS: '200',
        ANCESTORS: ancestors,
      },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    spawned.push(gate);
    const ids = await new Promise<{ gate: number; step: number; grandchild: number }>((resolve) =>
      gate.stdout!.once('data', (d) => resolve(JSON.parse(String(d))))
    );
    return {
      gate,
      ids,
      slot1: slotDirOf(slots, 1),
      stateFile: path.join(stateDir, `gate-${ids.gate}.json`),
    };
  }

  it('a hard-killed gate: the watchdog stops the step tree, frees the slot, removes the state', async () => {
    const dir = tmpDir('preship-wd-');
    const { gate, ids, slot1, stateFile } = await startGate(dir);
    expect(exists(slot1)).toBe(true);
    expect(isAlive(ids.step) && isAlive(ids.grandchild)).toBe(true);
    // SIGKILL is TerminateProcess on Windows: no handler of the gate runs.
    gate.kill('SIGKILL');
    expect(await waitFor(() => !isAlive(ids.step) && !isAlive(ids.grandchild))).toBe(true);
    expect(await waitFor(() => !exists(slot1))).toBe(true);
    expect(await waitFor(() => !exists(stateFile))).toBe(true);
    expect(readGateState(stateFile)).toBeNull();
  });

  it('a killed parent (git push): the watchdog ends the gate and everything it held', async () => {
    const dir = tmpDir('preship-wd-');
    const parent = longRunning(); // stands in for `git push`
    await waitFor(() => isAlive(parent.pid!));
    const { ids, slot1 } = await startGate(dir, String(parent.pid));
    expect(isAlive(ids.gate)).toBe(true);
    process.kill(parent.pid!, 'SIGKILL');
    expect(await waitFor(() => !isAlive(ids.gate))).toBe(true);
    expect(await waitFor(() => !isAlive(ids.step) && !isAlive(ids.grandchild))).toBe(true);
    expect(await waitFor(() => !exists(slot1))).toBe(true);
  });

  it('leaves everything alone while the gate is alive', async () => {
    const dir = tmpDir('preship-wd-');
    const { ids, slot1 } = await startGate(dir);
    await new Promise((r) => setTimeout(r, 1200)); // several watchdog polls
    expect(isAlive(ids.gate) && isAlive(ids.step) && isAlive(ids.grandchild)).toBe(true);
    expect(exists(slot1)).toBe(true);
  });
});

// ---- pre-ship.mjs: which steps need a slot, and the real gate end to end ------

describe('pre-ship.mjs and the slot', () => {
  it('marks exactly the heavy steps (build, typecheck, test runs) as needing a slot', () => {
    const src = fs.readFileSync(PRESHIP, 'utf8');
    const heavy = [...src.matchAll(/id: '([a-z0-9-]+)',\n {4}heavy: true,/g)].map((m) => m[1]);
    expect(heavy.sort()).toEqual(
      [
        'build',
        'coverage',
        'e2e-full-matrix',
        'integration-tests',
        'library-build',
        'typecheck',
        'unit-tests',
      ].sort()
    );
  });

  const cleanEnv = (): NodeJS.ProcessEnv => {
    const e: NodeJS.ProcessEnv = { ...process.env };
    for (const k of Object.keys(e))
      if (k.startsWith('GIT_') || k.startsWith('TEST_SLOT')) delete e[k];
    delete e.CI;
    return e;
  };

  /** A throwaway repo holding the real gate, and a fake `pnpm` that records what it saw. */
  function gateRepo() {
    const dir = tmpDir('preship-gate-');
    const git = (args: string[]) =>
      spawnSync('git', args, { cwd: dir, env: cleanEnv(), encoding: 'utf8' });
    git(['init', '-q']);
    git(['config', 'user.email', 'test@example.com']);
    git(['config', 'user.name', 'test']);
    fs.mkdirSync(path.join(dir, 'scripts/lib'), { recursive: true });
    for (const f of ['pre-ship.mjs', 'preship-lock.mjs', 'preship-watchdog.mjs']) {
      fs.copyFileSync(path.join(SCRIPTS, f), path.join(dir, 'scripts', f));
    }
    for (const lib of ['preship-test-scope.mjs', 'preship-report.mjs']) {
      fs.copyFileSync(path.join(SCRIPTS, 'lib', lib), path.join(dir, 'scripts/lib', lib));
    }
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'seed']);
    const bin = path.join(dir, 'bin');
    fs.mkdirSync(bin);
    const seen = path.join(dir, 'seen.txt');
    if (isWin) {
      fs.writeFileSync(
        path.join(bin, 'pnpm.cmd'),
        `@echo off\r\ndir /b "%PRESHIP_SLOT_DIR%" > "%SEEN_FILE%"\r\necho held=%TEST_SLOT_HELD% >> "%SEEN_FILE%"\r\nexit /b 0\r\n`
      );
    } else {
      const f = path.join(bin, 'pnpm');
      fs.writeFileSync(
        f,
        `#!/bin/sh\nls "$PRESHIP_SLOT_DIR" > "$SEEN_FILE"\necho "held=$TEST_SLOT_HELD" >> "$SEEN_FILE"\n`
      );
      fs.chmodSync(f, 0o755);
    }
    const slots = path.join(dir, 'slots');
    const env = cleanEnv();
    const pathKey = Object.keys(env).find((k) => k.toLowerCase() === 'path') || 'PATH';
    env[pathKey] = `${bin}${path.delimiter}${env[pathKey] ?? ''}`;
    Object.assign(env, {
      PRESHIP_SLOT_DIR: slots,
      PRESHIP_SLOT_POLL_MS: '100',
      PRESHIP_SLOT_BEAT_MS: '0',
      PRESHIP_STATE_DIR: path.join(dir, 'state'),
      SEEN_FILE: seen,
    });
    return { dir, slots, seen, env };
  }

  it('a heavy step runs inside a slot (slot visible and TEST_SLOT_HELD set) and the slot is freed after', () => {
    const { dir, slots, seen, env } = gateRepo();
    const r = spawnSync(process.execPath, ['scripts/pre-ship.mjs', '--only=library-build'], {
      cwd: dir,
      env,
      encoding: 'utf8',
      timeout: 60000,
    });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toMatch(/test slot 1 taken/);
    const during = fs.readFileSync(seen, 'utf8');
    expect(during).toMatch(/slot1\.lock/);
    expect(during).toMatch(/held=slot1/);
    expect(fs.readdirSync(slots).filter((n) => n.endsWith('.lock'))).toEqual([]);
  });

  it('a light-only run takes no slot at all', () => {
    const { dir, slots, env } = gateRepo();
    const r = spawnSync(process.execPath, ['scripts/pre-ship.mjs', '--only=__no_such_step__'], {
      cwd: dir,
      env,
      encoding: 'utf8',
      timeout: 60000,
    });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).not.toMatch(/test slot/);
    expect(exists(slots)).toBe(false); // not even the directory was needed
  });

  it('CI and a run already under a slot (TEST_SLOT_HELD) are exempt', () => {
    for (const extra of [{ CI: 'true' }, { TEST_SLOT_HELD: 'slot2' }]) {
      const { dir, slots, env } = gateRepo();
      const r = spawnSync(process.execPath, ['scripts/pre-ship.mjs', '--only=library-build'], {
        cwd: dir,
        env: { ...env, ...extra },
        encoding: 'utf8',
        timeout: 60000,
      });
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(r.stdout).not.toMatch(/test slot/);
      expect(exists(slots)).toBe(false);
    }
  });

  it('with all three slots held it waits, naming the holders, and takes the one that frees up', async () => {
    const { dir, slots, seen, env } = gateRepo();
    fs.mkdirSync(slots, { recursive: true });
    const held: string[] = [];
    for (let i = 1; i <= 3; i++) {
      held.push(plantSlot(slots, i, rec({ label: `other-session-${i}`, nonce: `other${i}` })));
    }
    const gate = spawn(process.execPath, ['scripts/pre-ship.mjs', '--only=library-build'], {
      cwd: dir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    spawned.push(gate);
    let out = '';
    gate.stdout!.on('data', (d) => (out += d));
    gate.stderr!.on('data', (d) => (out += d));
    const exited = new Promise<number | null>((resolve) => gate.on('close', (c) => resolve(c)));
    expect(await waitFor(() => /waiting for a test slot \(3\/3 busy/.test(out), 30000)).toBe(true);
    for (const who of ['other-session-1', 'other-session-2', 'other-session-3'])
      expect(out).toContain(who);
    expect(exists(seen)).toBe(false); // the step has not started
    fs.rmSync(held[1], { recursive: true }); // slot2's holder finishes
    expect(await exited).toBe(0);
    expect(out).toMatch(/test slot 2 taken/);
    expect(fs.readFileSync(seen, 'utf8')).toMatch(/held=slot2/);
    // Its own slot is gone; the two others are untouched.
    expect(exists(held[0])).toBe(true);
    expect(exists(held[2])).toBe(true);
    expect(exists(slotDirOf(slots, 2))).toBe(false);
  });
});
