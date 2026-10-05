/**
 * In-process tests for the pre-ship gate's step tracking and cleanup
 * (scripts/lib/preship-gate.mjs) and the watchdog's decision loop
 * (scripts/preship-watchdog.mjs).
 *
 * Every dependency (spawn, kill, clock, filesystem) is injected, so nothing here
 * starts a real process. The same behaviour is also proven end to end, through real
 * child processes, in preship-process.test.ts; those children are invisible to the
 * coverage report, which is why these exist.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { commandFor, createGate } from '../lib/preship-gate.mjs';
import { parseArgs, startWatch, watchTick } from '../preship-watchdog.mjs';

const tmpDirs: string[] = [];
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'preship-gate-unit-'));
  tmpDirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const step = { id: 'typecheck', cmd: ['pnpm', 'run', 'typecheck'] };

/** A fake step process: stdout/stderr streams plus the 'close' and 'error' events. */
function fakeChild(pid: number | undefined = 4321) {
  const c = new EventEmitter() as EventEmitter & {
    pid?: number;
    stdout: PassThrough;
    stderr: PassThrough;
    unref: () => void;
  };
  c.pid = pid;
  c.stdout = new PassThrough();
  c.stderr = new PassThrough();
  c.unref = vi.fn();
  return c;
}

type Calls = Record<string, unknown[][]>;

/** A gate wired to fakes; `calls` records every injected call. */
function makeGate(over: Record<string, unknown> = {}, deps: Record<string, unknown> = {}) {
  const calls: Calls = {};
  const rec =
    <T>(name: string, impl: (...a: any[]) => T) =>
    (...a: any[]): T => {
      (calls[name] ||= []).push(a);
      return impl(...a);
    };
  const out: string[] = [];
  const gate = createGate({
    repoRoot: '/work/intelliflow-wt',
    gatePid: 777,
    platform: 'linux',
    stateFile: '/state/gate-777.json',
    watchdogScript: '/scripts/preship-watchdog.mjs',
    write: (t: string) => out.push(t),
    ...over,
    deps: {
      writeGateState: rec('writeGateState', () => {}),
      killTree: rec('killTree', () => {}),
      ancestorsOf: rec('ancestorsOf', () => [11, 12]),
      installExitHandlers: rec('installExitHandlers', () => () => {}),
      spawn: rec('spawn', () => fakeChild()),
      unlink: rec('unlink', () => {}),
      now: () => 1_000,
      execPath: '/bin/node',
      tmpdir: () => '/tmp-dir',
      ...deps,
    },
  });
  return { gate, calls, out };
}

describe('commandFor', () => {
  it('argv on POSIX, one quoted command string on Windows', () => {
    expect(commandFor(['pnpm', 'run', 'x'], 'linux')).toEqual(['pnpm', ['run', 'x']]);
    expect(commandFor(['node', 'a b.js', '--k'], 'win32')).toEqual(['node "a b.js" --k', []]);
    expect(commandFor(['pnpm', 'run', 'x'])).toHaveLength(2);
  });
});

describe('gate.ensureWatchdog', () => {
  it('starts one detached watchdog from outside the repo, handing it the pids above the gate', () => {
    const { gate, calls } = makeGate();
    gate.ensureWatchdog();
    gate.ensureWatchdog();
    expect(calls.spawn).toHaveLength(1);
    expect(calls.ancestorsOf).toEqual([[777]]);
    const [exe, args, opts] = calls.spawn[0] as [string, string[], any];
    expect(exe).toBe('/bin/node');
    expect(args).toEqual(['/scripts/preship-watchdog.mjs', '777', '/state/gate-777.json', '11,12']);
    expect(opts).toMatchObject({
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      cwd: '/tmp-dir',
    });
  });

  it('by default the watchdog runs in os.tmpdir(), never in the repo', () => {
    const spawnFn = vi.fn(() => fakeChild());
    const gate = createGate({
      repoRoot: process.cwd(),
      gatePid: 777,
      deps: { spawn: spawnFn, ancestorsOf: () => [], writeGateState: () => {} },
    });
    gate.ensureWatchdog();
    const opts = spawnFn.mock.calls[0][2] as { cwd: string };
    expect(opts.cwd).toBe(os.tmpdir());
    expect(opts.cwd).not.toBe(process.cwd());
  });

  it('a watchdog that cannot start is not fatal', () => {
    const { gate } = makeGate(
      {},
      {
        spawn: () => {
          throw new Error('EAGAIN');
        },
      }
    );
    expect(() => gate.ensureWatchdog()).not.toThrow();
  });

  it('a state file that cannot be written does not stop the gate', () => {
    const { gate } = makeGate(
      {},
      {
        writeGateState: () => {
          throw new Error('disk full');
        },
      }
    );
    expect(() => gate.ensureWatchdog()).not.toThrow();
  });
});

describe('gate.recordChild', () => {
  it('records pid, step and start time, then clears them', () => {
    const { gate, calls } = makeGate();
    gate.recordChild(55, 'unit-tests');
    expect(gate.state).toMatchObject({
      child_pid: 55,
      child_step: 'unit-tests',
      child_start_ms: 1_000,
    });
    expect(calls.writeGateState).toHaveLength(1);
    gate.recordChild(null, null);
    expect(gate.state).toMatchObject({ child_pid: null, child_step: null, child_start_ms: null });
    gate.recordChild(undefined, 'x');
    expect(gate.state.child_pid).toBeNull();
  });
});

describe('gate.shutdown', () => {
  it('stops the running step tree and removes the state file', () => {
    const { gate, calls } = makeGate();
    gate.currentChild = { pid: 99 };
    gate.shutdown();
    expect(calls.killTree).toEqual([[99]]);
    expect(calls.unlink).toEqual([['/state/gate-777.json']]);
    expect(gate.currentChild).toBeNull();
  });

  it('with no step it only drops the state file, and survives a missing one', () => {
    const { gate, calls } = makeGate(
      {},
      {
        unlink: () => {
          throw Object.assign(new Error('gone'), { code: 'ENOENT' });
        },
      }
    );
    expect(() => gate.shutdown()).not.toThrow();
    expect(calls.killTree).toBeUndefined();
  });
});

describe('gate.runStepProcess', () => {
  const run = (gate: ReturnType<typeof makeGate>['gate'], logPath: string) =>
    gate.runStepProcess(step, { logPath, env: { A: '1' }, cwd: '/c' });

  it('spawns the step as its own process group, logs stdout, appends stderr, reports the code', async () => {
    const child = fakeChild(4242);
    const seen: unknown[][] = [];
    const { gate } = makeGate(
      {},
      {
        spawn: (...a: unknown[]) => {
          seen.push(a);
          return child;
        },
      }
    );
    const logPath = path.join(tmp(), 'step.log');
    const p = run(gate, logPath);
    expect(gate.currentChild).toBe(child);
    expect(gate.state.child_pid).toBe(4242);
    expect(gate.state.child_step).toBe('typecheck');
    child.stdout.write('hello out\n');
    child.stderr.write('warn err');
    child.emit('error', new Error('boom'));
    child.emit('close', 3);
    await expect(p).resolves.toEqual({ status: 3 });
    const [file, args, opts] = seen.find((c) => c[0] === 'pnpm') as [string, string[], any];
    expect(file).toBe('pnpm');
    expect(args).toEqual(['run', 'typecheck']);
    expect(opts).toMatchObject({
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { A: '1' },
      cwd: '/c',
      shell: false,
      detached: true,
      windowsHide: true,
    });
    expect(gate.currentChild).toBeNull();
    expect(gate.state.child_pid).toBeNull();
    const log = fs.readFileSync(logPath, 'utf8');
    expect(log).toMatch(/^hello out\n/);
    expect(log).toMatch(/--- stderr ---\nwarn err\nError: boom/);
  });

  it('POSIX: after the step closes, anything it left behind is killed', async () => {
    const child = fakeChild(4243);
    const { gate, calls } = makeGate({}, { spawn: () => child });
    const p = run(gate, path.join(tmp(), 'a.log'));
    child.emit('close', 0);
    await expect(p).resolves.toEqual({ status: 0 });
    expect(calls.killTree).toEqual([[4243]]);
  });

  it('Windows: a quoted command string through a shell, not detached, and no group kill', async () => {
    const child = fakeChild(4244);
    const seen: unknown[][] = [];
    const { gate, calls } = makeGate(
      { platform: 'win32' },
      {
        spawn: (...a: unknown[]) => {
          seen.push(a);
          return child;
        },
      }
    );
    const p = gate.runStepProcess(
      { id: 's', cmd: ['node', 'a b.js'] },
      { logPath: path.join(tmp(), 'w.log'), env: {}, cwd: '/c' }
    );
    child.emit('close', 0);
    await p;
    const spawnCall = seen.find((c) => c[0] === 'node "a b.js"') as [string, string[], any];
    expect(spawnCall[1]).toEqual([]);
    expect(spawnCall[2]).toMatchObject({ shell: true, detached: false });
    expect(calls.killTree).toBeUndefined();
  });

  it('a clean step writes no stderr section; a step with no pid is not group-killed', async () => {
    const child = fakeChild(0);
    const { gate, calls } = makeGate({}, { spawn: () => child });
    const logPath = path.join(tmp(), 'n.log');
    const p = run(gate, logPath);
    child.stdout.write('only out');
    child.emit('close', null);
    await expect(p).resolves.toEqual({ status: null });
    expect(calls.killTree).toBeUndefined();
    expect(fs.readFileSync(logPath, 'utf8')).toBe('only out');
  });

  it('a spawn that throws is a failed step with the error in its log', async () => {
    const { gate } = makeGate(
      {},
      {
        spawn: vi
          .fn()
          .mockImplementationOnce(() => fakeChild()) // the watchdog
          .mockImplementationOnce(() => {
            throw new Error('ENOENT pnpm');
          }),
      }
    );
    const logPath = path.join(tmp(), 'e.log');
    await expect(run(gate, logPath)).resolves.toEqual({ status: null });
    await new Promise((r) => setTimeout(r, 50));
    expect(fs.readFileSync(logPath, 'utf8')).toBe('Error: ENOENT pnpm');
    expect(gate.currentChild).toBeNull();
  });
});

describe('gate.installExit and gate.fatal', () => {
  it('installs shutdown as the exit cleanup, logging signals through the gate writer', () => {
    const { gate, calls, out } = makeGate();
    gate.installExit();
    const [cleanup, opts] = calls.installExitHandlers[0] as [
      () => void,
      { log: (m: string) => void },
    ];
    expect(cleanup).toBe(gate.shutdown);
    opts.log('SIGINT received');
    expect(out).toContain('\nSIGINT received\n');
  });

  it('fatal prints the stack, then cleans up', () => {
    const { gate, calls } = makeGate();
    const err: string[] = [];
    gate.fatal(new Error('kaput'), (t: string) => err.push(t));
    expect(err[0]).toMatch(/^pre-ship: Error: kaput/);
    expect(calls.unlink).toHaveLength(1);
    const plain: string[] = [];
    gate.fatal('just a string', (t: string) => plain.push(t));
    expect(plain).toEqual(['pre-ship: just a string\n']);
  });

  it('fatal writes to the real stderr by default', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const { gate } = makeGate();
    gate.fatal(new Error('x'));
    expect(spy).toHaveBeenCalled();
  });
});

describe('createGate defaults', () => {
  it('builds with real dependencies and writes progress to stdout', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const gate = createGate({ repoRoot: process.cwd() });
    expect(gate.state.gate_pid).toBe(process.pid);
    expect(gate.stateFile).toContain(`gate-${process.pid}.json`);
    const uninstall = gate.installExit();
    uninstall();
    spy.mockRestore();
  });
});

// ---- the watchdog --------------------------------------------------------------

describe('preship-watchdog: parseArgs', () => {
  it('reads pid, state file and ancestors, dropping junk', () => {
    expect(parseArgs(['123', '/s/g.json', '10,x,0,-4,20'])).toEqual({
      gatePid: 123,
      stateFile: '/s/g.json',
      ancestors: [10, 20],
      valid: true,
    });
    expect(parseArgs(['123', '/s/g.json']).ancestors).toEqual([]);
  });

  it('is invalid without a numeric gate pid or a state file', () => {
    expect(parseArgs([]).valid).toBe(false);
    expect(parseArgs(['abc', '/s']).valid).toBe(false);
    expect(parseArgs(['5']).valid).toBe(false);
  });
});

describe('preship-watchdog: watchTick', () => {
  const target = { gatePid: 50, stateFile: '/s/gate-50.json', ancestors: [7, 8] };
  const state = { gate_pid: 50, child_pid: 9 };

  function tick(opts: { state?: unknown; alive?: number[]; killThrows?: boolean }) {
    const alive = new Set(opts.alive ?? []);
    const reapGate = vi.fn();
    const kill = vi.fn(() => {
      if (opts.killThrows) throw new Error('ESRCH');
    });
    const verdict = watchTick(target, {
      readGateState: () => ('state' in opts ? opts.state : state),
      isAlive: (p: number) => alive.has(p),
      reapGate,
      kill,
    });
    return { verdict, reapGate, kill };
  }

  it('done when the gate removed its state file, or the file belongs to another gate', () => {
    expect(tick({ state: null }).verdict).toBe('done');
    const other = tick({ state: { gate_pid: 51 }, alive: [50] });
    expect(other.verdict).toBe('done');
    expect(other.reapGate).not.toHaveBeenCalled();
  });

  it('waiting while the gate and every ancestor are alive: touches nothing', () => {
    const t = tick({ alive: [50, 7, 8] });
    expect(t.verdict).toBe('waiting');
    expect(t.kill).not.toHaveBeenCalled();
    expect(t.reapGate).not.toHaveBeenCalled();
  });

  it('a dead gate: no kill of the gate, its step tree is reaped', () => {
    const t = tick({ alive: [7, 8] });
    expect(t.verdict).toBe('reaped');
    expect(t.kill).not.toHaveBeenCalled();
    expect(t.reapGate).toHaveBeenCalledWith(state, '/s/gate-50.json');
  });

  it('a dead ancestor (the git push or the hook shell): the live gate is ended first, then reaped', () => {
    const t = tick({ alive: [50, 8] });
    expect(t.verdict).toBe('reaped');
    expect(t.kill).toHaveBeenCalledWith(50, 'SIGKILL');
    expect(t.reapGate).toHaveBeenCalledTimes(1);
  });

  it('every ancestor is checked, not just the nearest', () => {
    expect(tick({ alive: [50, 7] }).verdict).toBe('reaped');
    expect(tick({ alive: [50, 8] }).verdict).toBe('reaped');
  });

  it('a gate that exits while being ended does not stop the reap', () => {
    const t = tick({ alive: [50], killThrows: true });
    expect(t.verdict).toBe('reaped');
    expect(t.reapGate).toHaveBeenCalledTimes(1);
  });

  it('uses the real process checks and kill by default', () => {
    const missing = path.join(tmp(), 'no-such-gate.json');
    expect(watchTick({ gatePid: process.pid, stateFile: missing, ancestors: [] })).toBe('done');
  });

  it('reaps for real through the default reapGate when the gate is dead', () => {
    const file = path.join(tmp(), 'gate.json');
    const dead = 2 ** 22 + 12345; // beyond any real pid
    fs.writeFileSync(file, JSON.stringify({ gate_pid: dead, child_pid: null }));
    expect(watchTick({ gatePid: dead, stateFile: file, ancestors: [] })).toBe('reaped');
    expect(fs.existsSync(file)).toBe(false);
  });

  it('ends a live gate through the default kill when an ancestor is gone', () => {
    const file = path.join(tmp(), 'gate.json');
    const realKill = process.kill.bind(process);
    const killSpy = vi
      .spyOn(process, 'kill')
      .mockImplementation((pid: number, sig?: string | number) =>
        sig === 0 ? realKill(pid, 0) : true
      );
    fs.writeFileSync(file, JSON.stringify({ gate_pid: process.pid, child_pid: null }));
    const deadAncestor = 2 ** 22 + 999;
    expect(watchTick({ gatePid: process.pid, stateFile: file, ancestors: [deadAncestor] })).toBe(
      'reaped'
    );
    expect(killSpy).toHaveBeenCalledWith(process.pid, 'SIGKILL');
  });
});

describe('preship-watchdog: startWatch', () => {
  it('polls at the interval and stops itself once there is nothing left to watch', () => {
    vi.useFakeTimers();
    try {
      const verdicts = ['waiting', 'waiting', 'done'];
      let i = 0;
      const clear = vi.fn(clearInterval);
      let reads = 0;
      const stop = startWatch(
        { gatePid: 1, stateFile: '/s', ancestors: [] },
        {
          pollMs: 100,
          clearIntervalFn: clear,
          deps: {
            readGateState: () => {
              reads++;
              return verdicts[i++] === 'done' ? null : { gate_pid: 1 };
            },
            isAlive: () => true,
          },
        }
      );
      vi.advanceTimersByTime(100);
      vi.advanceTimersByTime(100);
      expect(clear).not.toHaveBeenCalled();
      vi.advanceTimersByTime(100);
      expect(clear).toHaveBeenCalledTimes(1);
      expect(reads).toBe(3);
      stop();
      expect(clear).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('defaults to the real timers and a 2s poll', () => {
    vi.useFakeTimers();
    try {
      const stop = startWatch({ gatePid: process.pid, stateFile: '/none', ancestors: [] });
      expect(vi.getTimerCount()).toBe(1);
      stop();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
