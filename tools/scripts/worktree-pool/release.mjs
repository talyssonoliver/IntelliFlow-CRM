#!/usr/bin/env node
/**
 * tools/scripts/worktree-pool/release.mjs
 *
 * Wave 2b — Worktree Pool: release a slot back to the pool.
 *
 * Usage:
 *   node tools/scripts/worktree-pool/release.mjs <task-id>
 *   node tools/scripts/worktree-pool/release.mjs <task-id> --force
 *
 * Without --force: only releases if the calling process's pid + session_id
 *   match what was recorded in the lease.
 * With --force:    releases regardless of ownership (used by sweeper / parent).
 *
 * The worktree directory and remote branch are left intact — only the
 * lease file is deleted. The slot is immediately available for re-use.
 *
 * Exits 0 on success, 1 on error.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ── helpers ────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const POOL_DIR = path.join(REPO_ROOT, '.claude', 'worktree-pool');
const LEASES_DIR = path.join(POOL_DIR, 'leases');

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

// ── args ───────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const taskId = args.find((a) => !a.startsWith('-'));
const force = args.includes('--force');

if (!taskId) {
  console.error('Usage: node release.mjs <task-id> [--force]');
  process.exit(1);
}

// ── find the lease ─────────────────────────────────────────────────────────

if (!fs.existsSync(LEASES_DIR)) {
  console.error(`[release] Leases directory does not exist: ${LEASES_DIR}`);
  process.exit(1);
}

const leaseFiles = fs.readdirSync(LEASES_DIR).filter((f) => f.endsWith('.lease.json'));
let targetLeasePath = null;
let targetLease = null;

for (const leaseFile of leaseFiles) {
  const leasePath = path.join(LEASES_DIR, leaseFile);
  const lease = readJson(leasePath);
  if (lease && lease.task_id === taskId) {
    targetLeasePath = leasePath;
    targetLease = lease;
    break;
  }
}

if (!targetLease) {
  console.error(`[release] No lease found for task-id: ${taskId}`);
  process.exit(1);
}

// ── ownership check ────────────────────────────────────────────────────────

if (!force) {
  const callerPid = process.pid;
  const callerSession = process.env.CLAUDE_SESSION_ID || 'unknown';

  // Allow if the caller's session_id matches (common case: session resumes
  // in a new shell process and has a different pid but same session token).
  const sessionMatch = callerSession !== 'unknown' && callerSession === targetLease.session_id;
  // Also allow if the pid matches exactly (same process calling release).
  const pidMatch = callerPid === targetLease.pid;

  if (!sessionMatch && !pidMatch) {
    console.error(
      `[release] Ownership mismatch — lease belongs to pid=${targetLease.pid} session=${targetLease.session_id}; ` +
      `caller is pid=${callerPid} session=${callerSession}. Use --force to override.`
    );
    process.exit(1);
  }
}

// ── delete the lease file only ─────────────────────────────────────────────
// The worktree directory and branch are left intact for reuse.

try {
  fs.unlinkSync(targetLeasePath);
} catch (err) {
  console.error(`[release] Failed to delete lease file: ${err.message}`);
  process.exit(1);
}

console.log(`released ${targetLease.slot} for ${taskId}`);
