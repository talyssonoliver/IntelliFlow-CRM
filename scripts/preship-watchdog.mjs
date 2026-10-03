#!/usr/bin/env node
/**
 * Detached companion of scripts/pre-ship.mjs. It stops a gate's work in the two
 * ways a gate can be orphaned without its own signal handlers running:
 *
 *   - the gate is killed: the step it was running keeps going with no parent;
 *   - something ABOVE the gate is killed (`git push`, the hook shell): the gate
 *     survives and keeps building for a push that no longer exists.
 *
 * Either way it stops the step the lock recorded, ends the gate if it is still
 * alive, and clears the lock (see preship-lock.mjs).
 *
 * Usage: node scripts/preship-watchdog.mjs <gatePid> <lockPath> [ancestorPids]
 *   ancestorPids: comma-separated PIDs above the gate, as recorded at its start.
 */

import { isAlive, readLock, reapStale } from './preship-lock.mjs';

const gatePid = Number.parseInt(process.argv[2], 10);
const lockPath = process.argv[3];
const ancestors = (process.argv[4] || '')
  .split(',')
  .map((v) => Number.parseInt(v, 10))
  .filter((v) => Number.isInteger(v) && v > 0);
const POLL_MS = 2000;

if (!Number.isInteger(gatePid) || !lockPath) process.exit(2);

const timer = setInterval(() => {
  const record = readLock(lockPath);
  // The gate released the lock, or the lock now belongs to another gate: done.
  if (!record || record.gate_pid !== gatePid) {
    clearInterval(timer);
    return;
  }
  const gateAlive = isAlive(gatePid);
  if (gateAlive && ancestors.every(isAlive)) return;
  clearInterval(timer);
  reapStale(record, lockPath);
  // Orphaned from above: nothing is waiting for this gate's verdict any more.
  if (gateAlive) {
    try {
      process.kill(gatePid, 'SIGKILL');
    } catch {
      /* exited on its own meanwhile */
    }
  }
}, POLL_MS);
