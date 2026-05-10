#!/usr/bin/env node
/**
 * tools/scripts/worktree-pool/init.mjs
 *
 * Wave 2b — Worktree Pool initialiser.
 *
 * Usage: node tools/scripts/worktree-pool/init.mjs
 *
 * Creates `.claude/worktree-pool/config.json` then provisions
 * `.claude/worktree-pool/slot-1 … slot-N` as git worktrees on
 * `pool/slot-N` branches (idempotent — safe to re-run).
 *
 * Note: node_modules is NOT installed here. Slots share content
 * through the pnpm hoisted store managed by the parent process.
 * Run `pnpm install` from the repo root once; all slots resolve
 * packages from the same content-addressable cache automatically.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

// ── helpers ────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');

/** Run a command, optionally in a specific cwd, returning trimmed stdout. */
function run(cmd, cwd = REPO_ROOT) {
  return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] }).trim();
}

/** Run a command, suppressing all output — for idempotent git ops. */
function runQuiet(cmd, cwd = REPO_ROOT) {
  try {
    execSync(cmd, { cwd, encoding: 'utf8', stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// ── constants ──────────────────────────────────────────────────────────────

const TIER_C_RAM_CEILING_GB = 6; // must match manifest / plan spec
const POOL_DIR = path.join(REPO_ROOT, '.claude', 'worktree-pool');
const CONFIG_PATH = path.join(POOL_DIR, 'config.json');
const LEASES_DIR = path.join(POOL_DIR, 'leases');

// ── compute pool size ──────────────────────────────────────────────────────

const totalBytes = os.totalmem();
const ramGb = totalBytes / (1024 ** 3);
const slotCount = Math.max(1, Math.floor(0.5 * ramGb / TIER_C_RAM_CEILING_GB));

console.log(`[init] System RAM: ${ramGb.toFixed(2)} GB`);
console.log(`[init] TIER_C_RAM_CEILING_GB: ${TIER_C_RAM_CEILING_GB}`);
console.log(`[init] Pool size: ${slotCount} slot(s)`);

// ── ensure directories ─────────────────────────────────────────────────────

fs.mkdirSync(POOL_DIR, { recursive: true });
fs.mkdirSync(LEASES_DIR, { recursive: true });

// ── write / update config.json ─────────────────────────────────────────────

const config = {
  slot_count: slotCount,
  ram_gb: parseFloat(ramGb.toFixed(2)),
  ceiling_gb: TIER_C_RAM_CEILING_GB,
  generated_at: new Date().toISOString(),
};

fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf8');
console.log(`[init] Wrote config.json → slot_count=${slotCount}`);

// ── provision slots ────────────────────────────────────────────────────────

for (let i = 1; i <= slotCount; i++) {
  const slotName = `slot-${i}`;
  const branchName = `pool/${slotName}`;
  const slotPath = path.join(POOL_DIR, slotName);

  if (fs.existsSync(slotPath)) {
    // Slot already exists — verify it is a valid worktree, then skip.
    const worktreeList = run('git worktree list --porcelain');
    if (worktreeList.includes(slotPath.replace(/\\/g, '/'))) {
      console.log(`[init] ${slotName} — already exists, skipping`);
      continue;
    }
    // Path exists but not registered as a worktree (partial / stale) — remove and recreate.
    console.log(`[init] ${slotName} — stale path found, removing before recreating`);
    fs.rmSync(slotPath, { recursive: true, force: true });
  }

  // Ensure the branch exists locally (or on the remote) before adding the worktree.
  const branchExists = runQuiet(`git rev-parse --verify ${branchName}`);
  const remoteBranchExists = runQuiet(`git rev-parse --verify origin/${branchName}`);

  if (!branchExists && !remoteBranchExists) {
    // Create from origin/main (fallback to master if main doesn't exist).
    const base = runQuiet('git rev-parse --verify origin/main') ? 'origin/main' : 'origin/master';
    run(`git branch ${branchName} ${base}`);
    console.log(`[init] ${slotName} — created branch ${branchName} from ${base}`);
  } else if (!branchExists && remoteBranchExists) {
    run(`git branch ${branchName} origin/${branchName}`);
    console.log(`[init] ${slotName} — created local tracking branch for origin/${branchName}`);
  }

  try {
    run(`git worktree add "${slotPath}" ${branchName}`);
    console.log(`[init] ${slotName} — worktree created at ${slotPath}`);
  } catch (err) {
    console.error(`[init] ${slotName} — FAILED to create worktree: ${err.message}`);
    process.exit(1);
  }
}

console.log('[init] Pool initialisation complete.');
console.log('[init] NOTE: node_modules is shared via parent pnpm hoisted store.');
console.log('[init]       Run `pnpm install` once from the repo root — all slots');
console.log('[init]       resolve packages from the same content-addressable cache.');
