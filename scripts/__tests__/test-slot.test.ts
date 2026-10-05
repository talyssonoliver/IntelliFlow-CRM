/**
 * scripts/lib/test-slot.mjs: the decisions pre-ship and with-test-slot.mjs make
 * about the machine-wide test-slot semaphore, plus a real child process for the
 * exit-code and signal forwarding.
 */
import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import {
  DEFAULT_SLOTS_DIR,
  PRESHIP_GROUP,
  preshipNeedsSlot,
  preshipSlotArgv,
  runForwarding,
  sharedSemaphore,
  shimLaunch,
} from '../lib/test-slot.mjs';

const full = { help: false, list: false, only: null };
const yes = () => true;
const no = () => false;

describe('sharedSemaphore', () => {
  it('finds with-slot.mjs in the default directory', () => {
    expect(sharedSemaphore({}, yes)).toBe(path.join(DEFAULT_SLOTS_DIR, 'with-slot.mjs'));
  });

  it('honours TEST_SLOTS_DIR', () => {
    expect(sharedSemaphore({ TEST_SLOTS_DIR: '/x/slots' }, yes)).toBe(
      path.join('/x/slots', 'with-slot.mjs')
    );
  });

  it('is null on a machine without the semaphore', () => {
    expect(sharedSemaphore({}, no)).toBeNull();
  });
});

describe('preshipNeedsSlot', () => {
  it('takes a slot for a full local run', () => {
    expect(preshipNeedsSlot(full, {})).toBe(true);
  });

  it('skips --help, --list and --only subsets', () => {
    expect(preshipNeedsSlot({ ...full, help: true }, {})).toBe(false);
    expect(preshipNeedsSlot({ ...full, list: true }, {})).toBe(false);
    expect(preshipNeedsSlot({ ...full, only: ['lint'] }, {})).toBe(false);
  });

  it('skips CI and a run that already holds a slot', () => {
    expect(preshipNeedsSlot(full, { CI: 'true' })).toBe(false);
    expect(preshipNeedsSlot(full, { TEST_SLOT_HELD: 'slot2' })).toBe(false);
  });
});

describe('preshipSlotArgv', () => {
  it('re-runs pre-ship exclusively in its group, keeping its arguments', () => {
    expect(
      preshipSlotArgv('/s/with-slot.mjs', '/r/scripts/pre-ship.mjs', ['--clean'], 'node')
    ).toEqual([
      '/s/with-slot.mjs',
      '--label',
      PRESHIP_GROUP,
      '--exclusive',
      PRESHIP_GROUP,
      '--',
      'node',
      '/r/scripts/pre-ship.mjs',
      '--clean',
    ]);
  });
});

describe('shimLaunch', () => {
  it('is null without a command after --', () => {
    expect(shimLaunch(['vitest'], { env: {}, exists: yes })).toBeNull();
    expect(shimLaunch(['--base', '2', '--'], { env: {}, exists: yes })).toBeNull();
  });

  it('hands everything to the semaphore when the machine has one', () => {
    const argv = ['--base', '2', '--', 'vitest', 'run'];
    const l = shimLaunch(argv, { env: {}, node: 'node', exists: yes });
    expect(l).toEqual({
      cmd: 'node',
      args: [path.join(DEFAULT_SLOTS_DIR, 'with-slot.mjs'), ...argv],
      options: {},
    });
  });

  it('runs the command directly elsewhere, without a shell', () => {
    const l = shimLaunch(['--', 'vitest', 'run', 'a b'], {
      env: {},
      exists: no,
    });
    expect(l).toEqual({ cmd: 'vitest', args: ['run', 'a b'], options: {} });
  });
});

describe('runForwarding', () => {
  it("resolves with the child's exit code", async () => {
    const proc = new EventEmitter() as unknown as NodeJS.Process;
    await expect(
      runForwarding(process.execPath, ['-e', 'process.exit(7)'], {}, proc)
    ).resolves.toBe(7);
    expect((proc as unknown as EventEmitter).listenerCount('SIGINT')).toBe(0);
  });

  it('forwards a signal to the child and resolves 1 when it is killed', async () => {
    const proc = new EventEmitter() as unknown as NodeJS.Process;
    const done = runForwarding(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], {}, proc);
    // Give the child a moment to start before signalling it.
    await new Promise((r) => setTimeout(r, 300));
    (proc as unknown as EventEmitter).emit('SIGTERM');
    await expect(done).resolves.toBe(1);
    expect((proc as unknown as EventEmitter).listenerCount('SIGTERM')).toBe(0);
  });

  it('resolves 1 when the command cannot start', async () => {
    const proc = new EventEmitter() as unknown as NodeJS.Process;
    await expect(runForwarding('definitely-not-a-command-xyz', [], {}, proc)).resolves.toBe(1);
  });
});
