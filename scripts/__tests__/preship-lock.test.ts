/**
 * Tests for scripts/preship-lock.mjs and scripts/preship-watchdog.mjs: one gate
 * per machine, and no step left running when a gate dies.
 *
 * Every lock lives in its own os.tmpdir() file; no test touches the real
 * machine-wide lock. The "step" processes are real `node` children, so killTree
 * and the PID checks run against the operating system, not a mock.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';

import {
  acquire,
  isAlive,
  isLive,
  LOCK_MAX_AGE_MS,
  readLock,
  reapStale,
  recordChild,
  release,
  sameProcess,
} from '../preship-lock.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WATCHDOG = path.resolve(HERE, '../preship-watchdog.mjs');

const spawned: ChildProcess[] = [];
const lockFiles: string[] = [];

function tmpLock(): string {
  const p = path.join(
    os.tmpdir(),
    `preship-lock-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.lock`
  );
  lockFiles.push(p);
  return p;
}

/** A real long-running process standing in for a gate step. */
function longRunning(): ChildProcess {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    stdio: 'ignore',
    detached: process.platform !== 'win32',
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

async function waitFor(check: () => boolean, ms = 15000): Promise<boolean> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (check()) return true;
    await new Promise((r) => setTimeout(r, 200));
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
  for (const f of lockFiles.splice(0)) fs.rmSync(f, { force: true });
});

describe('acquire', () => {
  it('takes a free lock and records this process as the owner', async () => {
    const lockPath = tmpLock();
    const record = await acquire({ repo_root: 'r', branch: 'b', head: 'h' }, { lockPath });
    expect(record.gate_pid).toBe(process.pid);
    expect(readLock(lockPath)).toMatchObject({ gate_pid: process.pid, branch: 'b' });
  });

  it('waits while another live gate holds the lock, then takes it', async () => {
    const lockPath = tmpLock();
    const holder = longRunning();
    await waitFor(() => isAlive(holder.pid!));
    fs.writeFileSync(
      lockPath,
      JSON.stringify({ gate_pid: holder.pid, acquired_at_ms: Date.now() + 5000, branch: 'other' })
    );
    const logs: string[] = [];
    let polls = 0;
    const record = await acquire(
      { branch: 'mine' },
      {
        lockPath,
        log: (m: string) => logs.push(m),
        // The holder finishes after two polls.
        sleep: async () => {
          polls += 1;
          if (polls === 2) fs.unlinkSync(lockPath);
        },
      }
    );
    expect(polls).toBe(2);
    expect(logs.join('\n')).toMatch(/another gate is running .*other/);
    expect(record.branch).toBe('mine');
  });

  it('clears a lock whose gate died and stops the step it left running', async () => {
    const lockPath = tmpLock();
    const orphan = longRunning();
    await waitFor(() => isAlive(orphan.pid!));
    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        gate_pid: deadPid(),
        acquired_at_ms: Date.now(),
        child_pid: orphan.pid,
        child_step: 'build',
        child_started_ms: Date.now(),
      })
    );
    const logs: string[] = [];
    await acquire({}, { lockPath, log: (m: string) => logs.push(m) });
    expect(await waitFor(() => !isAlive(orphan.pid!))).toBe(true);
    expect(logs.join('\n')).toMatch(/cleared a stale lock .* stopped the step/);
    expect(readLock(lockPath)?.gate_pid).toBe(process.pid);
  });
});

describe('isLive', () => {
  it('treats a lock older than the maximum age as stale even with a live owner', () => {
    const now = Date.now();
    expect(isLive({ gate_pid: process.pid, acquired_at_ms: now }, now)).toBe(true);
    expect(isLive({ gate_pid: process.pid, acquired_at_ms: now - LOCK_MAX_AGE_MS - 1 }, now)).toBe(
      false
    );
  });

  it('treats a missing or malformed record as stale', () => {
    expect(isLive(null)).toBe(false);
    expect(isLive({ gate_pid: 'x' })).toBe(false);
  });
});

describe('sameProcess', () => {
  it('says no for a dead PID and yes for this process', () => {
    expect(sameProcess(deadPid(), Date.now())).toBe('no');
    expect(sameProcess(process.pid, Date.now())).toBe('yes');
  });

  it('says no when the process started after the record (a reused PID)', () => {
    expect(sameProcess(process.pid, Date.now() - 3_600_000)).toBe('no');
  });
});

describe('reapStale', () => {
  it('never stops a process that reused the recorded PID', async () => {
    const lockPath = tmpLock();
    const bystander = longRunning();
    await waitFor(() => isAlive(bystander.pid!));
    // Recorded an hour before this process existed: it cannot be the step.
    const record = {
      gate_pid: deadPid(),
      acquired_at_ms: Date.now() - 3_600_000,
      child_pid: bystander.pid,
      child_started_ms: Date.now() - 3_600_000,
    };
    fs.writeFileSync(lockPath, JSON.stringify(record));
    expect(reapStale(record, lockPath)).toBeNull();
    expect(isAlive(bystander.pid!)).toBe(true);
    expect(fs.existsSync(lockPath)).toBe(false);
  });
});

describe('recordChild and release', () => {
  it('only the owner can record a step or release the lock', async () => {
    const lockPath = tmpLock();
    fs.writeFileSync(lockPath, JSON.stringify({ gate_pid: deadPid(), acquired_at_ms: 1 }));
    recordChild(1234, 'lint', lockPath);
    expect(readLock(lockPath).child_pid).toBeUndefined();
    release(lockPath);
    expect(fs.existsSync(lockPath)).toBe(true);

    fs.unlinkSync(lockPath);
    await acquire({}, { lockPath });
    recordChild(1234, 'lint', lockPath);
    expect(readLock(lockPath)).toMatchObject({ child_pid: 1234, child_step: 'lint' });
    recordChild(null, null, lockPath);
    expect(readLock(lockPath)).toMatchObject({ child_pid: null, child_step: null });
    release(lockPath);
    expect(fs.existsSync(lockPath)).toBe(false);
  });
});

describe('preship-watchdog', () => {
  it('stops the recorded step and clears the lock when the gate is killed', async () => {
    const lockPath = tmpLock();
    const gate = longRunning();
    const step = longRunning();
    await waitFor(() => isAlive(gate.pid!) && isAlive(step.pid!));
    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        gate_pid: gate.pid,
        acquired_at_ms: Date.now(),
        child_pid: step.pid,
        child_step: 'build',
        child_started_ms: Date.now(),
      })
    );
    const watchdog = spawn(process.execPath, [WATCHDOG, String(gate.pid), lockPath], {
      stdio: 'ignore',
    });
    spawned.push(watchdog);

    gate.kill('SIGKILL');
    expect(await waitFor(() => !isAlive(step.pid!), 20000)).toBe(true);
    expect(await waitFor(() => !fs.existsSync(lockPath))).toBe(true);
  });

  it('leaves everything alone while the gate is alive', async () => {
    const lockPath = tmpLock();
    const gate = longRunning();
    const step = longRunning();
    await waitFor(() => isAlive(gate.pid!) && isAlive(step.pid!));
    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        gate_pid: gate.pid,
        acquired_at_ms: Date.now(),
        child_pid: step.pid,
        child_started_ms: Date.now(),
      })
    );
    const watchdog = spawn(process.execPath, [WATCHDOG, String(gate.pid), lockPath], {
      stdio: 'ignore',
    });
    spawned.push(watchdog);
    await new Promise((r) => setTimeout(r, 5000));
    expect(isAlive(step.pid!)).toBe(true);
    expect(fs.existsSync(lockPath)).toBe(true);
  });
});
