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
/**
 * The one lock a pre-ship runs under. It is the group for work on the local test
 * database too, because a push wrapped in that group runs its pre-ship nested and
 * so takes no lock of its own: two group names would let two pre-ships run at once.
 */
export const PRESHIP_GROUP = 'intelliflow-db';

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
 * Why a full pre-ship must not run in the slot it is nested in, or null when it may.
 * The semaphore passes a nested call straight through, so a slot taken without
 * PRESHIP_GROUP would let this run alongside another pre-ship. An owner record that
 * can't be read doesn't block: that says nothing about who holds what.
 * @param {{help: boolean, list: boolean, only: string[] | null}} flags
 * @param {NodeJS.ProcessEnv} env
 * @param {(p: string, encoding: 'utf8') => string} [read]
 * @returns {string | null}
 */
export function preshipGroupRefusal(flags, env, read = fs.readFileSync) {
  if (flags.help || flags.list || flags.only !== null) return null;
  if (!env.TEST_SLOT_HELD || env.CI) return null;
  const dir = env.TEST_SLOTS_DIR || DEFAULT_SLOTS_DIR;
  let owner;
  try {
    owner = JSON.parse(read(path.join(dir, `${env.TEST_SLOT_HELD}.lock`, 'owner.json'), 'utf8'));
  } catch {
    return null;
  }
  if (owner?.exclusive === PRESHIP_GROUP) return null;
  return (
    `pre-ship: this slot does not hold the ${PRESHIP_GROUP} group, so another pre-ship could ` +
    `run at the same time. Run it without a wrapper, or through with-slot.mjs with ` +
    `--exclusive ${PRESHIP_GROUP}.\n`
  );
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

/** The owner's escape hatch: run one heavy command outside the queue on purpose. */
export const OUTSIDE_SLOT_ENV = 'ALLOW_OUTSIDE_SLOT';

/** CI as the semaphore reads it: set, and neither "false" nor "0". */
function ciSet(env) {
  return Boolean(env.CI) && env.CI !== 'false' && env.CI !== '0';
}

/**
 * Why a heavy command (the web build, Lighthouse, the full suite or coverage)
 * must not run here, or null when it may. Owner ruling 2026-11-12, "enforce
 * it": heavy work runs only inside the test-slot queue. It may run when a slot
 * is held (with-slot.mjs sets TEST_SLOT_HELD for its child), under CI, with
 * ALLOW_OUTSIDE_SLOT=1, or on a machine with no semaphore (a contributor's
 * laptop, a Docker build), where there is no queue to join.
 * @param {string} what the command, as the message names it
 * @param {NodeJS.ProcessEnv} env
 * @param {(p: string) => boolean} [exists]
 * @returns {string | null}
 */
export function slotRefusal(what, env, exists = fs.existsSync) {
  if (env.TEST_SLOT_HELD || ciSet(env) || env[OUTSIDE_SLOT_ENV] === '1') return null;
  const semaphore = sharedSemaphore(env, exists);
  if (!semaphore) return null;
  const queue = semaphore.replaceAll('\\', '/');
  return [
    `${what} is a heavy command and runs only inside the test-slot queue.`,
    `  Queue it:  node ${queue} --label ${what} -- <the same command>`,
    '  `pnpm test` and `pnpm test:coverage` queue on their own, and a pre-ship gate',
    '  already holds a slot for everything it runs.',
    `  Owner override, for one deliberate run: ${OUTSIDE_SLOT_ENV}=1`,
    '',
  ].join('\n');
}

/**
 * Stop the process with exit code 2 when slotRefusal refuses; return otherwise.
 * @param {string} what
 * @param {{env?: NodeJS.ProcessEnv, exists?: (p: string) => boolean, stderr?: {write: (s: string) => unknown}, exit?: (code: number) => never}} [io]
 */
export function requireSlot(what, io = {}) {
  const {
    env = process.env,
    exists = fs.existsSync,
    stderr = process.stderr,
    exit = process.exit,
  } = io;
  const refusal = slotRefusal(what, env, exists);
  if (refusal === null) return;
  stderr.write(refusal);
  exit(2);
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
