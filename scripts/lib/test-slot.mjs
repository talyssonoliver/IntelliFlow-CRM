/**
 * The machine-wide test-slot semaphore, as IntelliFlow uses it.
 *
 * At most three full test runs at once on the owner's machine, across every
 * repository (owner ruling 2026-10-05: ten gates and pre-ships ran together and
 * memory ran out), and one IntelliFlow pre-ship at a time (standing rule the
 * same day: three at once left 1.6 GB free). The semaphore itself lives outside
 * every repository, at C:/Users/talys/ops/test-slots/with-slot.mjs
 * (TEST_SLOTS_DIR overrides), so all repos share one count; its README says how
 * slots are taken, waited for and reaped. Where it does not exist (another
 * machine, a hosted CI runner) commands run directly.
 *
 * Decisions are pure functions here so they are tested directly; the two
 * callers (scripts/pre-ship.mjs and scripts/with-test-slot.mjs) only spawn.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

export const DEFAULT_SLOTS_DIR = 'C:/Users/talys/ops/test-slots';
export const PRESHIP_GROUP = 'intelliflow-pre-ship';

/**
 * Path of the shared semaphore, or null when this machine has none.
 * @param {NodeJS.ProcessEnv} env
 * @param {(p: string) => boolean} [exists]
 */
export function sharedSemaphore(env, exists = fs.existsSync) {
  const p = path.join(env.TEST_SLOTS_DIR || DEFAULT_SLOTS_DIR, 'with-slot.mjs');
  return exists(p) ? p : null;
}

/**
 * Whether a pre-ship run should take a slot. --help/--list and --only subsets
 * are not full runs; CI is not this machine; TEST_SLOT_HELD means an outer run
 * already holds one.
 * @param {{help: boolean, list: boolean, only: string[] | null}} flags
 * @param {NodeJS.ProcessEnv} env
 */
export function preshipNeedsSlot(flags, env) {
  if (flags.help || flags.list || flags.only !== null) return false;
  return !env.TEST_SLOT_HELD && !env.CI;
}

/**
 * argv for re-running this pre-ship under the semaphore, one per machine.
 * @param {string} semaphore
 * @param {string} script absolute path of pre-ship.mjs
 * @param {string[]} args pre-ship's own arguments
 * @param {string} node
 */
export function preshipSlotArgv(semaphore, script, args, node = process.execPath) {
  return [
    semaphore,
    '--label',
    PRESHIP_GROUP,
    '--exclusive',
    PRESHIP_GROUP,
    '--',
    node,
    script,
    ...args,
  ];
}

/**
 * How scripts/with-test-slot.mjs launches its command: through the semaphore
 * when the machine has one, otherwise directly and without a shell, so no
 * command line is ever assembled and nothing needs quoting. The wrapped
 * commands are real executables (`node scripts/run-tests.js`), not .cmd shims.
 * @param {string[]} argv `[--label x] [--base n] -- <command...>`
 * @param {{env: NodeJS.ProcessEnv, node?: string, exists?: (p: string) => boolean}} ctx
 * @returns {{cmd: string, args: string[], options: object} | null} null on bad usage
 */
export function shimLaunch(argv, { env, node = process.execPath, exists = fs.existsSync }) {
  const sep = argv.indexOf('--');
  if (sep === -1 || sep === argv.length - 1) return null;
  const semaphore = sharedSemaphore(env, exists);
  if (semaphore) return { cmd: node, args: [semaphore, ...argv], options: {} };
  const words = argv.slice(sep + 1);
  return { cmd: words[0], args: words.slice(1), options: {} };
}

/**
 * Spawn with inherited stdio, forward Ctrl-C and kill so the semaphore
 * releases its slot (and the child's own exit cleanup runs), and resolve with
 * the child's exit code.
 * @param {string} cmd
 * @param {string[]} args
 * @param {object} [options]
 * @param {NodeJS.Process} [proc]
 * @returns {Promise<number>}
 */
export function runForwarding(cmd, args, options = {}, proc = process) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: 'inherit', ...options });
    const forward = (sig) => () => child.kill(sig);
    const handlers = ['SIGINT', 'SIGTERM', 'SIGHUP'].map((sig) => [sig, forward(sig)]);
    for (const [sig, h] of handlers) proc.on(sig, h);
    const done = (code) => {
      for (const [sig, h] of handlers) proc.off(sig, h);
      resolve(code);
    };
    child.on('exit', (code, signal) => done(signal ? 1 : (code ?? 1)));
    child.on('error', () => done(1));
  });
}
