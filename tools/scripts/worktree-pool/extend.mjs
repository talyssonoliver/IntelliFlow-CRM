#!/usr/bin/env node
/**
 * tools/scripts/worktree-pool/extend.mjs
 *
 * Wave 2b — Worktree Pool: extend a lease by 8 hours.
 *
 * Usage: node tools/scripts/worktree-pool/extend.mjs <task-id>
 *
 * Rules:
 *   - Maximum 3 extensions per lease (4th is refused).
 *   - Hard cap: total lease lifetime cannot exceed 24h from acquired_at.
 *   - Each extension adds 8 hours to the current expires_at (not to now).
 *
 * Exits 0 and prints new expiry on success.
 * Exits 1 with a descriptive message on failure.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ── helpers ────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const POOL_DIR = path.join(REPO_ROOT, '.claude', 'worktree-pool');
const LEASES_DIR = path.join(POOL_DIR, 'leases');

const EXTENSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours
const HARD_CAP_MS = 24 * 60 * 60 * 1000;           // 24 hours
const MAX_EXTENSIONS = 3;

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

// ── args ───────────────────────────────────────────────────────────────────

const taskId = process.argv[2];
if (!taskId) {
  console.error('Usage: node extend.mjs <task-id>');
  process.exit(1);
}

// ── find the lease ─────────────────────────────────────────────────────────

if (!fs.existsSync(LEASES_DIR)) {
  console.error(`[extend] No lease found for task-id: ${taskId} (leases directory missing)`);
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
    targetLease = { ...lease };
    break;
  }
}

if (!targetLease) {
  console.error(`[extend] No lease found for task-id: ${taskId}`);
  process.exit(1);
}

// ── extension count guard ──────────────────────────────────────────────────

const extensionCount = targetLease.extension_count ?? 0;
if (extensionCount >= MAX_EXTENSIONS) {
  console.error(
    `[extend] Lease for ${taskId} has already been extended ${extensionCount} time(s). ` +
    `Maximum ${MAX_EXTENSIONS} extensions allowed. Finalize or abandon the task.`
  );
  process.exit(1);
}

// ── 24h hard-cap check ─────────────────────────────────────────────────────

const acquiredAt = new Date(targetLease.acquired_at).getTime();
const now = Date.now();
const newExpiry = now + EXTENSION_DURATION_MS;

if (newExpiry - acquiredAt > HARD_CAP_MS) {
  console.error(
    `[extend] lease cannot be extended past 24h hard cap. ` +
    `Acquired at ${targetLease.acquired_at}. Finalize or abandon the task.`
  );
  process.exit(1);
}

// ── apply extension ────────────────────────────────────────────────────────

targetLease.expires_at = new Date(newExpiry).toISOString();
targetLease.extension_count = extensionCount + 1;

try {
  fs.writeFileSync(targetLeasePath, JSON.stringify(targetLease, null, 2) + '\n', 'utf8');
} catch (err) {
  console.error(`[extend] Failed to write updated lease: ${err.message}`);
  process.exit(1);
}

console.log(
  `[extend] ${targetLease.slot} (${taskId}) — extension ${targetLease.extension_count}/${MAX_EXTENSIONS}; ` +
  `new expiry: ${targetLease.expires_at}`
);
