#!/usr/bin/env node
/**
 * Detached companion of scripts/pre-ship.mjs. It watches the gate's PID; if the
 * gate dies without releasing its lock (killed from outside, so its own signal
 * handlers never ran), it stops the step the lock recorded and clears the lock.
 * Without it, that step keeps running with no parent (see preship-lock.mjs).
 *
 * Usage: node scripts/preship-watchdog.mjs <gatePid> <lockPath>
 */

import { isAlive, readLock, reapStale } from './preship-lock.mjs';

const gatePid = Number.parseInt(process.argv[2], 10);
const lockPath = process.argv[3];
const POLL_MS = 2000;

if (!Number.isInteger(gatePid) || !lockPath) process.exit(2);

const timer = setInterval(() => {
  const record = readLock(lockPath);
  // The gate released the lock, or the lock now belongs to another gate: done.
  if (!record || record.gate_pid !== gatePid) {
    clearInterval(timer);
    return;
  }
  if (isAlive(gatePid)) return;
  clearInterval(timer);
  reapStale(record, lockPath);
}, POLL_MS);
