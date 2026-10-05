/**
 * Tests for scripts/preship-process.mjs and scripts/preship-watchdog.mjs: no step
 * is ever orphaned, whether the gate ends normally, on a signal, by a hard kill, or
 * because something above it (the `git push`, the hook shell) died.
 *
 * Two layers. The in-process unit tests inject the platform and the process checks
 * (a coverage report cannot see into child processes, and one machine cannot run
 * both Windows and POSIX). The child-process tests run real `node` children, so
 * killTree, the PID checks, the exit handlers and the detached watchdog run
 * against the operating system, not a mock. State files live in fresh
 * os.tmpdir() directories.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';

import {
  ancestorsOf,
  gateStatePath,
  installExitHandlers,
  isAlive,
  killTree,
  readGateState,
  reapGate,
  sameProcess,
  startTimeOf,
  writeGateState,
} from '../preship-process.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS = path.resolve(HERE, '..');
const PROCESS_URL = pathToFileURL(path.join(SCRIPTS, 'preship-process.mjs')).href;
const WATCHDOG = path.join(SCRIPTS, 'preship-watchdog.mjs');
const isWin = process.platform === 'win32';

const spawned: ChildProcess[] = [];
const tmpDirs: string[] = [];

function tmpDir(prefix = 'preship-proc-'): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(d);
  return d;
}
const exists = (p: string) => fs.existsSync(p);

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
    await new Promise((r) => setTimeout(r, 100));
  }
  return check();
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

// ---- in-process units ----------------------------------------------------------

type Run = (cmd: string, args: string[], opts?: unknown) => { stdout?: string; status?: number };
const runReturning =
  (...outs: string[]): Run =>
  () => ({ stdout: outs.shift() ?? '' });

describe('isAlive', () => {
  it('rejects anything that is not a positive integer pid', () => {
    for (const bad of [0, -1, 1.5, Number.NaN, '12', undefined]) {
      expect(isAlive(bad as unknown as number)).toBe(false);
    }
  });

  it('is true when the signal is delivered, and when it is refused with EPERM', () => {
    expect(isAlive(10, () => true)).toBe(true);
    const eperm = () => {
      throw Object.assign(new Error('x'), { code: 'EPERM' });
    };
    expect(isAlive(10, eperm)).toBe(true);
  });

  it('is false for ESRCH (no such process) and any other failure', () => {
    const esrch = () => {
      throw Object.assign(new Error('x'), { code: 'ESRCH' });
    };
    expect(isAlive(10, esrch)).toBe(false);
    expect(
      isAlive(10, () => {
        throw new Error('weird');
      })
    ).toBe(false);
  });

  it('is true for this process on the real operating system', () => {
    expect(isAlive(process.pid)).toBe(true);
  });
});

describe('startTimeOf', () => {
  const alive = () => true;

  it('is null for a process that is not there', () => {
    expect(startTimeOf(5, { alive: () => false })).toBeNull();
  });

  it('Windows: reads epoch ms from PowerShell, null when it prints nothing usable', () => {
    const calls: unknown[][] = [];
    const run: Run = (...a) => {
      calls.push(a);
      return { stdout: ' 1700000000123\r\n' };
    };
    expect(startTimeOf(321, { platform: 'win32', run, alive })).toBe(1700000000123);
    expect(calls[0][0]).toBe('powershell');
    expect(String((calls[0][1] as string[]).at(-1))).toContain('Get-Process -Id 321');
    expect(startTimeOf(321, { platform: 'win32', run: runReturning(''), alive })).toBeNull();
    expect(startTimeOf(321, { platform: 'win32', run: () => ({}), alive })).toBeNull();
  });

  it('POSIX: parses ps lstart, null when it is unreadable', () => {
    const calls: unknown[][] = [];
    const run: Run = (...a) => {
      calls.push(a);
      return { stdout: 'Mon Oct  5 10:00:00 2026\n' };
    };
    expect(startTimeOf(321, { platform: 'linux', run, alive })).toBe(
      Date.parse('Mon Oct  5 10:00:00 2026')
    );
    expect(calls[0].slice(0, 2)).toEqual(['ps', ['-o', 'lstart=', '-p', '321']]);
    expect(startTimeOf(321, { platform: 'linux', run: runReturning('garbage'), alive })).toBeNull();
    expect(startTimeOf(321, { platform: 'linux', run: () => ({}), alive })).toBeNull();
  });

  it('answers for this very process with the real clock and platform', () => {
    const t = startTimeOf(process.pid);
    expect(t === null || t < Date.now()).toBe(true);
  });
});

describe('sameProcess', () => {
  it("is 'no' when gone, 'unknown' with no recorded or readable start, else compares within 2s", () => {
    expect(sameProcess(5, 1000, { alive: () => false })).toBe('no');
    expect(sameProcess(5, null as unknown as number, { alive: () => true })).toBe('unknown');
    expect(sameProcess(5, 1000, { alive: () => true, startOf: () => null })).toBe('unknown');
    expect(sameProcess(5, 1000, { alive: () => true, startOf: () => 2500 })).toBe('yes');
    expect(sameProcess(5, 1000, { alive: () => true, startOf: () => 3500 })).toBe('no');
  });
});

describe('ancestorsOf', () => {
  it('Windows: parses the PowerShell list, dropping system pids and junk', () => {
    const calls: unknown[][] = [];
    const run: Run = (...a) => {
      calls.push(a);
      return { stdout: '100,200,4,x,300\r\n' };
    };
    expect(ancestorsOf(900, 6, { platform: 'win32', run })).toEqual([100, 200, 300]);
    expect(calls[0][0]).toBe('powershell');
    expect(ancestorsOf(900, 6, { platform: 'win32', run: () => ({}) })).toEqual([]);
  });

  it('POSIX: walks ps ppid upward and stops at init, junk or the depth limit', () => {
    const parents = new Map([
      ['900', '800'],
      ['800', '700'],
      ['700', '1'],
    ]);
    const run: Run = (_c, args) => ({ stdout: parents.get(args[3]) ?? '' });
    expect(ancestorsOf(900, 6, { platform: 'linux', run })).toEqual([800, 700]);
    expect(ancestorsOf(900, 1, { platform: 'linux', run })).toEqual([800]);
    expect(ancestorsOf(555, 6, { platform: 'linux', run })).toEqual([]);
  });

  it('answers for this process on the real platform', () => {
    expect(Array.isArray(ancestorsOf(process.pid, 2))).toBe(true);
  });
});

describe('killTree with an injected platform', () => {
  it('does nothing for a process that is already gone', () => {
    const run = vi.fn();
    const kill = vi.fn();
    killTree(5, { alive: () => false, run, kill });
    expect(run).not.toHaveBeenCalled();
    expect(kill).not.toHaveBeenCalled();
  });

  it('Windows: taskkill /T /F by pid, no signals', () => {
    const run = vi.fn();
    const kill = vi.fn();
    killTree(77, { platform: 'win32', alive: () => true, run, kill });
    expect(run).toHaveBeenCalledWith('taskkill', ['/PID', '77', '/T', '/F'], expect.any(Object));
    expect(kill).not.toHaveBeenCalled();
  });

  it('POSIX: kills the whole process group', () => {
    const run = vi.fn();
    const kill = vi.fn();
    killTree(77, { platform: 'linux', alive: () => true, run, kill });
    expect(kill).toHaveBeenCalledWith(-77, 'SIGKILL');
    expect(kill).toHaveBeenCalledTimes(1);
    expect(run).not.toHaveBeenCalled();
  });

  it('POSIX: falls back to the single process when there is no group, and survives both failing', () => {
    const calls: number[] = [];
    const groupFails = (pid: number) => {
      calls.push(pid);
      if (pid < 0) throw new Error('ESRCH');
    };
    killTree(77, { platform: 'linux', alive: () => true, kill: groupFails });
    expect(calls).toEqual([-77, 77]);
    const bothFail = () => {
      throw new Error('ESRCH');
    };
    expect(() =>
      killTree(77, { platform: 'linux', alive: () => true, kill: bothFail })
    ).not.toThrow();
  });
});

describe('installExitHandlers (in process)', () => {
  const EVENTS = [
    'exit',
    'SIGINT',
    'SIGTERM',
    'SIGHUP',
    'SIGBREAK',
    'uncaughtException',
    'unhandledRejection',
  ];
  type Fn = (...a: unknown[]) => void;

  /** Install, and hand back exactly the listeners that call added, so they can be invoked directly. */
  function install(cleanup: () => void, opts?: Parameters<typeof installExitHandlers>[1]) {
    const before = new Map(EVENTS.map((e) => [e, new Set(process.listeners(e as never))]));
    const uninstall = installExitHandlers(cleanup, opts);
    const added = (e: string) =>
      process.listeners(e as never).filter((l) => !before.get(e)!.has(l)) as Fn[];
    return { uninstall, added };
  }

  it('runs the cleanup once however many ways the process ends, and uninstalls cleanly', () => {
    const cleanup = vi.fn();
    const { uninstall, added } = install(cleanup, { exit: vi.fn() });
    added('exit')[0]();
    added('exit')[0]();
    expect(cleanup).toHaveBeenCalledTimes(1);
    uninstall();
    expect(added('exit')).toHaveLength(0);
  });

  it('a cleanup that throws is swallowed', () => {
    const { uninstall, added } = install(
      () => {
        throw new Error('cleanup broke');
      },
      { exit: vi.fn() }
    );
    expect(() => added('exit')[0]()).not.toThrow();
    uninstall();
  });

  it.each([
    ['SIGINT', 130],
    ['SIGTERM', 143],
    ['SIGHUP', 129],
    ['SIGBREAK', 131],
  ])('%s logs, cleans up and exits %i', (sig, code) => {
    const cleanup = vi.fn();
    const exit = vi.fn();
    const log = vi.fn();
    const { uninstall, added } = install(cleanup, { exit, log });
    const handlers = added(sig);
    if (handlers.length === 0) {
      uninstall(); // SIGBREAK cannot be registered on every platform
      expect(sig).toBe('SIGBREAK');
      return;
    }
    handlers[0]();
    expect(log).toHaveBeenCalledWith(expect.stringContaining(sig));
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(code);
    uninstall();
  });

  it('a signal without a logger still cleans up and exits', () => {
    const cleanup = vi.fn();
    const exit = vi.fn();
    const { uninstall, added } = install(cleanup, { exit });
    added('SIGTERM')[0]();
    expect(exit).toHaveBeenCalledWith(143);
    expect(cleanup).toHaveBeenCalledTimes(1);
    uninstall();
  });

  it.each(['uncaughtException', 'unhandledRejection'])(
    '%s prints the error, cleans up and exits 1',
    (ev) => {
      const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const cleanup = vi.fn();
      const exit = vi.fn();
      const { uninstall, added } = install(cleanup, { exit });
      added(ev)[0](new Error('bad'));
      added(ev)[0]('a plain reason');
      expect(String(err.mock.calls[0][0])).toMatch(
        /^pre-ship: (uncaught exception|unhandled rejection): Error: bad/
      );
      expect(cleanup).toHaveBeenCalledTimes(1);
      expect(exit).toHaveBeenCalledWith(1);
      uninstall();
    }
  );

  it('defaults exit to process.exit', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const { uninstall, added } = install(() => {});
    added('SIGINT')[0]();
    expect(exitSpy).toHaveBeenCalledWith(130);
    uninstall();
  });
});

describe('gate state files', () => {
  it('writes, reads back and reports a missing or corrupt file as null', () => {
    const dir = tmpDir();
    const state = { gate_pid: 4321, child_pid: null };
    writeGateState(state, dir);
    const file = gateStatePath(4321, dir);
    expect(path.basename(file)).toBe('gate-4321.json');
    expect(readGateState(file)).toEqual(state);
    expect(readGateState(path.join(dir, 'nope.json'))).toBeNull();
    fs.writeFileSync(file, '{broken');
    expect(readGateState(file)).toBeNull();
  });

  it('reapGate with no state, or no recorded step, only removes the file', () => {
    const dir = tmpDir();
    const file = path.join(dir, 'g.json');
    fs.writeFileSync(file, '{}');
    expect(reapGate(undefined, file)).toEqual({ stopped: null });
    expect(exists(file)).toBe(false);
    expect(reapGate({ child_pid: 'x' }, file)).toEqual({ stopped: null });
  });
});

// ---- every exit path runs the cleanup (real child processes) -------------------

/** A child that installs the exit handlers with a cleanup that leaves a marker, then ends in `mode`. */
function harness(dir: string): string {
  const file = path.join(dir, 'harness.mjs');
  fs.writeFileSync(
    file,
    `import fs from 'node:fs';
import { installExitHandlers } from ${JSON.stringify(PROCESS_URL)};
const mode = process.argv[2];
installExitHandlers(() => fs.writeFileSync(process.env.MARKER, 'cleaned'));
console.log('READY');
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

describe('the cleanup runs on every exit path', () => {
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
    it(`mode ${mode} exits ${code} having cleaned up`, () => {
      const dir = tmpDir('preship-exit-');
      const marker = path.join(dir, 'marker');
      const r = spawnSync(process.execPath, [harness(dir), mode], {
        env: { ...process.env, MARKER: marker },
        encoding: 'utf8',
        timeout: 30000,
      });
      expect(r.stdout).toMatch(/READY/);
      expect(r.status).toBe(code);
      expect(fs.readFileSync(marker, 'utf8')).toBe('cleaned');
    });
  }

  it.skipIf(isWin)('a real SIGTERM from outside runs the cleanup (POSIX)', async () => {
    const dir = tmpDir('preship-exit-');
    const marker = path.join(dir, 'marker');
    const child = spawn(process.execPath, [harness(dir), 'hold'], {
      env: { ...process.env, MARKER: marker },
      stdio: 'ignore',
    });
    spawned.push(child);
    await new Promise((r) => setTimeout(r, 1000));
    child.kill('SIGTERM');
    expect(await waitFor(() => exists(marker))).toBe(true);
  });
});

// ---- orphaned step trees and the watchdog (real child processes) ---------------

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

  it('reapGate stops the recorded step tree and removes the gate state file', async () => {
    const dir = tmpDir();
    const { step, grandchild } = await startStep();
    const state = { gate_pid: deadPid(), child_pid: step.pid, child_start_ms: Date.now() };
    const file = path.join(dir, 'gate.json');
    fs.writeFileSync(file, JSON.stringify(state));
    expect(reapGate(state, file)).toEqual({ stopped: step.pid });
    expect(await waitFor(() => !isAlive(step.pid!) && !isAlive(grandchild))).toBe(true);
    expect(exists(file)).toBe(false);
  });

  it('reapGate never stops a process that only reused the recorded pid', async () => {
    const dir = tmpDir();
    const bystander = longRunning();
    await waitFor(() => isAlive(bystander.pid!));
    const state = {
      gate_pid: deadPid(),
      child_pid: bystander.pid,
      child_start_ms: 1, // recorded long before this process started: a different process
    };
    const file = path.join(dir, 'gate.json');
    fs.writeFileSync(file, JSON.stringify(state));
    expect(sameProcess(bystander.pid!, 1)).toBe('no');
    expect(reapGate(state, file)).toEqual({ stopped: null });
    expect(isAlive(bystander.pid!)).toBe(true);
  });

  /** A gate with a step running (and a grandchild), and the real watchdog beside it. */
  async function startGate(dir: string, ancestors = '') {
    const stateDir = path.join(dir, 'state');
    const file = path.join(dir, 'gate-harness.mjs');
    fs.writeFileSync(
      file,
      `import { spawn } from 'node:child_process';
import { gateStatePath, writeGateState } from ${JSON.stringify(PROCESS_URL)};
const step = spawn(process.execPath, ['-e', ${JSON.stringify(STEP_SOURCE)}], { stdio: ['ignore', 'pipe', 'ignore'] });
step.stdout.once('data', (d) => {
  const state = { gate_pid: process.pid, child_pid: step.pid, child_start_ms: Date.now() };
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
    return { gate, ids, stateFile: path.join(stateDir, `gate-${ids.gate}.json`) };
  }

  it('a hard-killed gate: the watchdog stops the step tree and removes the state', async () => {
    const dir = tmpDir('preship-wd-');
    const { gate, ids, stateFile } = await startGate(dir);
    expect(isAlive(ids.step) && isAlive(ids.grandchild)).toBe(true);
    // SIGKILL is TerminateProcess on Windows: no handler of the gate runs.
    gate.kill('SIGKILL');
    expect(await waitFor(() => !isAlive(ids.step) && !isAlive(ids.grandchild))).toBe(true);
    expect(await waitFor(() => !exists(stateFile))).toBe(true);
    expect(readGateState(stateFile)).toBeNull();
  });

  it('a killed parent (git push, the hook shell): the watchdog ends the gate and its step tree', async () => {
    const dir = tmpDir('preship-wd-');
    const parent = longRunning(); // stands in for `git push`
    await waitFor(() => isAlive(parent.pid!));
    const { ids } = await startGate(dir, String(parent.pid));
    expect(isAlive(ids.gate)).toBe(true);
    process.kill(parent.pid!, 'SIGKILL');
    expect(await waitFor(() => !isAlive(ids.gate))).toBe(true);
    expect(await waitFor(() => !isAlive(ids.step) && !isAlive(ids.grandchild))).toBe(true);
  });

  it('leaves everything alone while the gate and its parents are alive', async () => {
    const dir = tmpDir('preship-wd-');
    const parent = longRunning();
    await waitFor(() => isAlive(parent.pid!));
    const { ids } = await startGate(dir, String(parent.pid));
    await new Promise((r) => setTimeout(r, 1200)); // several watchdog polls
    expect(isAlive(ids.gate) && isAlive(ids.step) && isAlive(ids.grandchild)).toBe(true);
  });
});

// ---- the real gate end to end ---------------------------------------------------

describe('pre-ship.mjs runs a step async, tracks it, and cleans up', () => {
  const cleanEnv = (): NodeJS.ProcessEnv => {
    const e: NodeJS.ProcessEnv = { ...process.env };
    for (const k of Object.keys(e)) if (k.startsWith('GIT_')) delete e[k];
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
    for (const f of ['pre-ship.mjs', 'preship-process.mjs', 'preship-watchdog.mjs']) {
      fs.copyFileSync(path.join(SCRIPTS, f), path.join(dir, 'scripts', f));
    }
    for (const lib of ['preship-test-scope.mjs', 'preship-report.mjs', 'preship-gate.mjs']) {
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
        `@echo off\r\necho step-ran > "%SEEN_FILE%"\r\necho to-the-log\r\nexit /b 0\r\n`
      );
    } else {
      const f = path.join(bin, 'pnpm');
      fs.writeFileSync(f, `#!/bin/sh\necho step-ran > "$SEEN_FILE"\necho to-the-log\n`);
      fs.chmodSync(f, 0o755);
    }
    const env = cleanEnv();
    const pathKey = Object.keys(env).find((k) => k.toLowerCase() === 'path') || 'PATH';
    env[pathKey] = `${bin}${path.delimiter}${env[pathKey] ?? ''}`;
    const stateDir = path.join(dir, 'state');
    Object.assign(env, {
      PRESHIP_STATE_DIR: stateDir,
      PRESHIP_WATCHDOG_POLL_MS: '100',
      SEEN_FILE: seen,
    });
    return { dir, seen, stateDir, env };
  }

  it('runs the step, streams its output to the step log, and leaves no state file behind', () => {
    const { dir, seen, stateDir, env } = gateRepo();
    const r = spawnSync(process.execPath, ['scripts/pre-ship.mjs', '--only=library-build'], {
      cwd: dir,
      env,
      encoding: 'utf8',
      timeout: 60000,
    });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(fs.readFileSync(seen, 'utf8')).toMatch(/step-ran/);
    const logs = fs
      .readdirSync(dir, { recursive: true })
      .map(String)
      .filter((f) => f.endsWith('library-build.log'));
    expect(logs.length).toBeGreaterThan(0);
    expect(fs.readFileSync(path.join(dir, logs[0]), 'utf8')).toMatch(/to-the-log/);
    expect(
      exists(stateDir) ? fs.readdirSync(stateDir).filter((f) => f.endsWith('.json')) : []
    ).toEqual([]);
  });

  it('a run with no step to execute starts no watchdog and writes no state', () => {
    const { dir, stateDir, env } = gateRepo();
    const r = spawnSync(process.execPath, ['scripts/pre-ship.mjs', '--only=__no_such_step__'], {
      cwd: dir,
      env,
      encoding: 'utf8',
      timeout: 60000,
    });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(exists(stateDir)).toBe(false);
  });
});
