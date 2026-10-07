#!/usr/bin/env node
/**
 * Detached companion of scripts/pre-ship.mjs. It cleans up after a gate in the
 * two ways a gate can be orphaned without its own signal handlers running:
 *
 *   - the gate is killed (taskkill /F, SIGKILL): the step it was running keeps
 *     going with no parent, still holding a test slot;
 *   - something ABOVE the gate is killed (`git push`, the hook shell): the gate
 *     survives and keeps building for a push that no longer exists.
 *
 * Either way it stops the step's whole process tree (Windows: taskkill /T /F),
 * ends the gate if it is still alive, releases the test slot the gate held (only
 * if the slot's nonce is still the gate's own) and removes the gate's state file.
 *
 * Usage: node scripts/preship-watchdog.mjs <gatePid> <stateFile> [ancestorPids]
 *   ancestorPids: comma-separated PIDs above the gate, as recorded at its start.
 */

import { pathToFileURL } from 'node:url';
import { isAlive, readGateState, reapGate } from './preship-process.mjs';

/** Parse argv (after the script): gate pid, state file, comma-separated ancestor pids. */
export function parseArgs(argv) {
  const gatePid = Number.parseInt(argv[0], 10);
  const stateFile = argv[1];
  const ancestors = (argv[2] || '')
    .split(',')
    .map((v) => Number.parseInt(v, 10))
    .filter((v) => Number.isInteger(v) && v > 0);
  return { gatePid, stateFile, ancestors, valid: Number.isInteger(gatePid) && Boolean(stateFile) };
}

/**
 * One look at the gate. Returns 'done' (nothing left to watch: the gate finished
 * and removed its state file), 'waiting' (gate and everything above it are alive)
 * or 'reaped' (something is gone: the gate is ended if still alive, then its step
 * tree and slot are cleaned up).
 */
export function watchTick({ gatePid, stateFile, ancestors }, deps = {}) {
  const read = deps.readGateState ?? readGateState;
  const alive = deps.isAlive ?? isAlive;
  const reap = deps.reapGate ?? reapGate;
  const kill = deps.kill ?? ((pid, sig) => process.kill(pid, sig));
  const state = read(stateFile);
  if (!state || state.gate_pid !== gatePid) return 'done';
  const gateAlive = alive(gatePid);
  if (gateAlive && ancestors.every((p) => alive(p))) return 'waiting';
  // Orphaned from above: nothing is waiting for this gate's verdict any more.
  // End the gate first so it cannot start another step while the tree is stopped.
  // Only the gate process: it started this watchdog, so a tree kill would take it too.
  if (gateAlive) {
    try {
      kill(gatePid, 'SIGKILL');
    } catch {
      /* exited on its own meanwhile */
    }
  }
  reap(state, stateFile);
  return 'reaped';
}

/** Poll until the gate is done or reaped. Returns the interval handle's stop function. */
export function startWatch(
  target,
  { pollMs = 2000, deps, setIntervalFn = setInterval, clearIntervalFn = clearInterval } = {}
) {
  const timer = setIntervalFn(() => {
    if (watchTick(target, deps) !== 'waiting') clearIntervalFn(timer);
  }, pollMs);
  return () => clearIntervalFn(timer);
}

function main(argv = process.argv.slice(2)) {
  const target = parseArgs(argv);
  if (!target.valid) process.exit(2);
  startWatch(target, { pollMs: Number(process.env.PRESHIP_WATCHDOG_POLL_MS || 2000) });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
