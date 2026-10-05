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

import { isAlive, readGateState, reapGate } from './preship-lock.mjs';

const gatePid = Number.parseInt(process.argv[2], 10);
const stateFile = process.argv[3];
const ancestors = (process.argv[4] || '')
  .split(',')
  .map((v) => Number.parseInt(v, 10))
  .filter((v) => Number.isInteger(v) && v > 0);
const POLL_MS = Number(process.env.PRESHIP_WATCHDOG_POLL_MS || 2000);

if (!Number.isInteger(gatePid) || !stateFile) process.exit(2);

const timer = setInterval(() => {
  const state = readGateState(stateFile);
  // The gate finished and removed its state file: nothing left to watch.
  if (!state || state.gate_pid !== gatePid) {
    clearInterval(timer);
    return;
  }
  const gateAlive = isAlive(gatePid);
  if (gateAlive && ancestors.every(isAlive)) return;
  clearInterval(timer);
  // Orphaned from above: nothing is waiting for this gate's verdict any more.
  // End the gate first so it cannot start another step while the tree is stopped.
  // Only the gate process: it started this watchdog, so a tree kill would take it too.
  if (gateAlive) {
    try {
      process.kill(gatePid, 'SIGKILL');
    } catch {
      /* exited on its own meanwhile */
    }
  }
  reapGate(state, stateFile);
}, POLL_MS);
