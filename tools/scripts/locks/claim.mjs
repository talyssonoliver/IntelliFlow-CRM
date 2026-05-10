#!/usr/bin/env node
/**
 * claim.mjs — Atomically claim file-level locks for a task.
 *
 * Usage: node tools/scripts/locks/claim.mjs <task-id> <path1> [path2 ...]
 *
 * Acquires locks in ALPHABETICAL ORDER (deadlock prevention via global ordering).
 * Uses fs.writeFileSync with {flag: 'wx'} for atomic exclusive creation.
 * On EEXIST: performs liveness check; reaps stale lock or rolls back and exits 1.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const LOCKS_DIR = path.join(REPO_ROOT, '.claude', 'locks');
const AUDIT_LOG = path.join(LOCKS_DIR, 'audit.jsonl');

const STALE_MS = 4 * 60 * 60 * 1000; // 4 hours

function sanitizePath(filePath) {
  // Replace / and \ with _, append .lock
  return filePath.replace(/[/\\]/g, '_') + '.lock';
}

function lockFilePath(filePath) {
  return path.join(LOCKS_DIR, sanitizePath(filePath));
}

function readBranchSync() {
  // Read HEAD file directly for zero-dependency branch detection
  try {
    const headFile = path.join(REPO_ROOT, '.git', 'HEAD');
    const head = fs.readFileSync(headFile, 'utf8').trim();
    if (head.startsWith('ref: refs/heads/')) {
      return head.slice('ref: refs/heads/'.length);
    }
    return head.slice(0, 8); // detached HEAD: use short sha
  } catch {
    return 'unknown';
  }
}

function getSessionId() {
  // Use environment variables that Claude Code / orchestrator sets
  return process.env.CLAUDE_SESSION_ID || process.env.SESSION_ID || `pid-${process.pid}`;
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function appendAuditLog(entry) {
  try {
    fs.mkdirSync(LOCKS_DIR, { recursive: true });
    fs.appendFileSync(AUDIT_LOG, JSON.stringify(entry) + '\n');
  } catch (err) {
    // Audit log failure is non-fatal; warn but continue
    process.stderr.write(`[claim] audit log write failed: ${err.message}\n`);
  }
}

function reapLock(lockPath, reason) {
  try {
    fs.unlinkSync(lockPath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    process.stderr.write('Usage: claim.mjs <task-id> <path1> [path2 ...]\n');
    process.exit(2);
  }

  const [taskId, ...rawPaths] = args;

  if (!taskId || rawPaths.length === 0) {
    process.stderr.write('Usage: claim.mjs <task-id> <path1> [path2 ...]\n');
    process.exit(2);
  }

  // DEADLOCK PREVENTION: sort paths alphabetically before acquiring
  const sortedPaths = [...rawPaths].sort();

  fs.mkdirSync(LOCKS_DIR, { recursive: true });

  const branch = readBranchSync();
  const sessionId = getSessionId();
  const pid = process.pid;
  const now = new Date().toISOString();

  const acquiredLocks = []; // track locks acquired in this call for rollback

  for (const filePath of sortedPaths) {
    const lockPath = lockFilePath(filePath);
    const lockData = {
      task_id: taskId,
      branch,
      pid,
      session_id: sessionId,
      acquired_at: now,
      file_path: filePath,
    };

    let acquired = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 2; // 1 reap attempt allowed

    while (!acquired && attempts < MAX_ATTEMPTS) {
      attempts++;
      try {
        fs.writeFileSync(lockPath, JSON.stringify(lockData, null, 2), { flag: 'wx' });
        acquired = true;
      } catch (err) {
        if (err.code !== 'EEXIST') {
          // Unexpected error — rollback and abort
          process.stderr.write(`[claim] unexpected error writing lock for ${filePath}: ${err.message}\n`);
          rollbackLocks(acquiredLocks);
          process.exit(1);
        }

        // Lock exists — check if it's stale
        let existingLock;
        try {
          existingLock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
        } catch {
          // Can't read lock — treat as stale and retry once
          if (attempts < MAX_ATTEMPTS) {
            reapLock(lockPath, 'unreadable');
            continue;
          }
          process.stderr.write(`[claim] cannot read existing lock for ${filePath}\n`);
          rollbackLocks(acquiredLocks);
          process.exit(1);
        }

        const acquiredAt = new Date(existingLock.acquired_at).getTime();
        const ageMs = Date.now() - acquiredAt;
        const isStale = ageMs > STALE_MS;
        const holderAlive = isProcessAlive(existingLock.pid);

        if (isStale && !holderAlive && attempts < MAX_ATTEMPTS) {
          // Reap stale orphaned lock and retry
          reapLock(lockPath, 'stale-liveness-failed');
          appendAuditLog({
            event: 'reap',
            reason: 'stale-liveness-failed',
            lock: existingLock,
            reaped_by: taskId,
            reaped_at: new Date().toISOString(),
          });
          continue;
        }

        // Lock is live or not stale enough — rollback and exit 1
        rollbackLocks(acquiredLocks);
        process.stderr.write(
          `[claim] blocked on ${filePath} held by ${existingLock.task_id} (age: ${Math.round(ageMs / 60000)}min)\n`
        );
        process.exit(1);
      }
    }

    if (!acquired) {
      rollbackLocks(acquiredLocks);
      process.stderr.write(`[claim] failed to acquire lock for ${filePath} after ${MAX_ATTEMPTS} attempts\n`);
      process.exit(1);
    }

    acquiredLocks.push({ lockPath, filePath });
    process.stdout.write(`[claim] locked ${filePath}\n`);
  }

  // All locks acquired — append audit event
  appendAuditLog({
    event: 'claim',
    task_id: taskId,
    branch,
    pid,
    session_id: sessionId,
    claimed_at: now,
    files: sortedPaths,
  });

  process.stdout.write(`[claim] acquired ${acquiredLocks.length} lock(s) for ${taskId}\n`);
  process.exit(0);
}

function rollbackLocks(locksToRelease) {
  for (const { lockPath, filePath } of locksToRelease) {
    try {
      fs.unlinkSync(lockPath);
      process.stderr.write(`[claim] rolled back lock for ${filePath}\n`);
    } catch {
      // Best-effort rollback
    }
  }
}

main().catch((err) => {
  process.stderr.write(`[claim] fatal: ${err.message}\n`);
  process.exit(1);
});
