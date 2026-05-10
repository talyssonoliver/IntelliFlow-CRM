#!/usr/bin/env node
/**
 * tools/scripts/worktree-pool/acquire.mjs
 *
 * Wave 2b — Worktree Pool: acquire a free slot.
 *
 * Usage: node tools/scripts/worktree-pool/acquire.mjs <task-id>
 *
 * Exits 0 and prints the absolute slot path on stdout on success.
 * Exits 1 with "pool exhausted; queue position N" if no slot is free.
 *
 * Liveness check (Windows-safe):
 *   A lease is considered dead if ANY of:
 *   - now > expires_at
 *   - process.kill(pid, 0) throws (process gone)
 *   - session_id is absent (unknown) — conservative: trust pid check only
 *
 * Dead leases are auto-reaped (lease file deleted) before slot selection.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ── helpers ────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const POOL_DIR = path.join(REPO_ROOT, '.claude', 'worktree-pool');
const LEASES_DIR = path.join(POOL_DIR, 'leases');
const CONFIG_PATH = path.join(POOL_DIR, 'config.json');

const LEASE_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours

function run(cmd, cwd) {
  return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] }).trim();
}

function runQuiet(cmd, cwd = REPO_ROOT) {
  try {
    execSync(cmd, { cwd, encoding: 'utf8', stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Return true if the process identified by pid is still alive. */
function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Read and parse a JSON file, returning null on any error. */
function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

// ── arg validation ─────────────────────────────────────────────────────────

const taskId = process.argv[2];
if (!taskId) {
  console.error('Usage: node acquire.mjs <task-id>');
  process.exit(1);
}

// ── load pool config ───────────────────────────────────────────────────────

if (!fs.existsSync(CONFIG_PATH)) {
  console.error('[acquire] Pool not initialised. Run init.mjs first.');
  process.exit(1);
}

const config = readJson(CONFIG_PATH);
if (!config || !config.slot_count) {
  console.error('[acquire] config.json is invalid. Re-run init.mjs.');
  process.exit(1);
}

const { slot_count: slotCount } = config;

// ── ensure leases dir ──────────────────────────────────────────────────────

fs.mkdirSync(LEASES_DIR, { recursive: true });

// ── reap stale leases ──────────────────────────────────────────────────────

const now = Date.now();

function reapLeaseFile(leasePath) {
  try {
    fs.unlinkSync(leasePath);
    console.error(`[acquire] auto-reaped stale lease: ${path.basename(leasePath)}`);
  } catch {
    // ignore — another process may have already removed it
  }
}

const leaseFiles = fs.existsSync(LEASES_DIR)
  ? fs.readdirSync(LEASES_DIR).filter((f) => f.endsWith('.lease.json'))
  : [];

for (const leaseFile of leaseFiles) {
  const leasePath = path.join(LEASES_DIR, leaseFile);
  const lease = readJson(leasePath);
  if (!lease) {
    reapLeaseFile(leasePath);
    continue;
  }

  const expired = now > new Date(lease.expires_at).getTime();
  const pidDead = lease.pid ? !isProcessAlive(lease.pid) : true;

  if (expired || pidDead) {
    reapLeaseFile(leasePath);
  }
}

// ── find a free slot ───────────────────────────────────────────────────────

// Build set of currently-leased slot names.
const leasedSlots = new Set();
const remainingLeaseFiles = fs.existsSync(LEASES_DIR)
  ? fs.readdirSync(LEASES_DIR).filter((f) => f.endsWith('.lease.json'))
  : [];

for (const leaseFile of remainingLeaseFiles) {
  const lease = readJson(path.join(LEASES_DIR, leaseFile));
  if (lease && lease.slot) {
    leasedSlots.add(lease.slot);
  }
}

let freeSlot = null;
for (let i = 1; i <= slotCount; i++) {
  const slotName = `slot-${i}`;
  if (!leasedSlots.has(slotName)) {
    freeSlot = slotName;
    break;
  }
}

if (!freeSlot) {
  const queuePos = leasedSlots.size - slotCount + 1;
  console.error(`pool exhausted; queue position ${queuePos}`);
  process.exit(1);
}

// ── prepare the slot worktree ──────────────────────────────────────────────

const slotPath = path.join(POOL_DIR, freeSlot);

if (!fs.existsSync(slotPath)) {
  console.error(`[acquire] Slot directory missing: ${slotPath}. Re-run init.mjs.`);
  process.exit(1);
}

// Fetch latest from remote (best-effort; non-fatal if offline).
const fetchOk = runQuiet('git fetch --quiet', slotPath);
if (!fetchOk) {
  console.error('[acquire] WARNING: git fetch failed (offline?). Using current state.');
}

// Determine base: prefer origin/main, fall back to origin/master.
const hasOriginMain = runQuiet('git rev-parse --verify origin/main', slotPath);
const base = hasOriginMain ? 'origin/main' : 'origin/master';

// Reset to base.
try {
  run(`git reset --hard ${base}`, slotPath);
} catch (err) {
  console.error(`[acquire] Could not reset slot to ${base}: ${err.message}`);
  process.exit(1);
}

// Create or force-checkout the agent branch.
const agentBranch = `agent/${taskId}`;
const slotBranch = `pool/${freeSlot}`;
const branchExists = runQuiet(`git rev-parse --verify ${agentBranch}`, slotPath);

if (branchExists) {
  // The branch already exists (e.g. from a previous run). We must first
  // switch off it before we can delete it. Checkout the pool branch, which
  // we know exists, then delete the stale agent branch.
  const currentBranch = run('git rev-parse --abbrev-ref HEAD', slotPath);
  if (currentBranch === agentBranch) {
    // Need to switch away. Reset --hard already ran above (against origin/main
    // or origin/master), but HEAD is still on the agent branch. Check out the
    // slot's pool branch first.
    try {
      run(`git checkout ${slotBranch}`, slotPath);
    } catch {
      // If pool branch is somehow gone, detach HEAD to the base commit so we
      // can still delete the agent branch.
      run(`git checkout --detach ${base}`, slotPath);
    }
  }
  runQuiet(`git branch -D ${agentBranch}`, slotPath);
}

try {
  run(`git checkout -b ${agentBranch}`, slotPath);
} catch (err) {
  console.error(`[acquire] Could not create branch ${agentBranch}: ${err.message}`);
  process.exit(1);
}

// ── write lease file ───────────────────────────────────────────────────────

const acquiredAt = new Date();
const expiresAt = new Date(acquiredAt.getTime() + LEASE_DURATION_MS);
const sessionId = process.env.CLAUDE_SESSION_ID || 'unknown';
const pid = process.pid;

const lease = {
  slot: freeSlot,
  task_id: taskId,
  branch: agentBranch,
  acquired_at: acquiredAt.toISOString(),
  expires_at: expiresAt.toISOString(),
  pid,
  session_id: sessionId,
  extension_count: 0,
};

const leaseFile = path.join(LEASES_DIR, `${freeSlot}.lease.json`);
fs.writeFileSync(leaseFile, JSON.stringify(lease, null, 2) + '\n', 'utf8');

// ── success ────────────────────────────────────────────────────────────────

// Print ONLY the slot path on stdout (consumed by caller).
process.stdout.write(slotPath + '\n');

// Diagnostics to stderr so they don't pollute the captured stdout.
process.stderr.write(`[acquire] ${freeSlot} → task=${taskId} branch=${agentBranch} expires=${expiresAt.toISOString()}\n`);
