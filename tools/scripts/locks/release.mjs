#!/usr/bin/env node
/**
 * release.mjs — Release file-level locks held by a task.
 *
 * Usage:
 *   node tools/scripts/locks/release.mjs <task-id> --all
 *   node tools/scripts/locks/release.mjs <task-id> <path1> [path2 ...]
 *
 * --all: Release every lock held by <task-id>.
 * With paths: Release only the specified paths (validates task_id matches).
 * Each release is appended to the audit log.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const LOCKS_DIR = path.join(REPO_ROOT, '.claude', 'locks');
const AUDIT_LOG = path.join(LOCKS_DIR, 'audit.jsonl');

function sanitizePath(filePath) {
  return filePath.replace(/[/\\]/g, '_') + '.lock';
}

function lockFilePath(filePath) {
  return path.join(LOCKS_DIR, sanitizePath(filePath));
}

function appendAuditLog(entry) {
  try {
    fs.mkdirSync(LOCKS_DIR, { recursive: true });
    fs.appendFileSync(AUDIT_LOG, JSON.stringify(entry) + '\n');
  } catch (err) {
    process.stderr.write(`[release] audit log write failed: ${err.message}\n`);
  }
}

function readLockFile(lockPath) {
  try {
    return JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch {
    return null;
  }
}

function releaseLock(lockPath, taskId, filePath, reason = 'released') {
  const lockData = readLockFile(lockPath);

  if (!lockData) {
    process.stderr.write(`[release] lock file not found or unreadable: ${filePath}\n`);
    return false;
  }

  if (lockData.task_id !== taskId) {
    process.stderr.write(
      `[release] cannot release ${filePath}: held by ${lockData.task_id}, not ${taskId}\n`
    );
    return false;
  }

  try {
    fs.unlinkSync(lockPath);
  } catch (err) {
    process.stderr.write(`[release] failed to delete lock file for ${filePath}: ${err.message}\n`);
    return false;
  }

  appendAuditLog({
    event: 'release',
    task_id: taskId,
    file_path: filePath,
    released_at: new Date().toISOString(),
    reason,
    original_lock: lockData,
  });

  process.stdout.write(`[release] released ${filePath}\n`);
  return true;
}

function getAllLocksForTask(taskId) {
  try {
    const entries = fs.readdirSync(LOCKS_DIR);
    const result = [];

    for (const entry of entries) {
      if (!entry.endsWith('.lock')) continue;
      const lockPath = path.join(LOCKS_DIR, entry);
      const lockData = readLockFile(lockPath);
      if (lockData && lockData.task_id === taskId) {
        result.push({ lockPath, filePath: lockData.file_path || entry.replace(/\.lock$/, '') });
      }
    }

    return result;
  } catch (err) {
    if (err.code === 'ENOENT') return []; // locks dir doesn't exist yet
    throw err;
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    process.stderr.write('Usage: release.mjs <task-id> --all\n');
    process.stderr.write('       release.mjs <task-id> <path1> [path2 ...]\n');
    process.exit(2);
  }

  const [taskId, ...rest] = args;

  if (!taskId) {
    process.stderr.write('Usage: release.mjs <task-id> --all\n');
    process.exit(2);
  }

  const releaseAll = rest.includes('--all');
  const specificPaths = rest.filter((a) => a !== '--all');

  if (releaseAll && specificPaths.length > 0) {
    process.stderr.write('[release] cannot combine --all with specific paths\n');
    process.exit(2);
  }

  if (!releaseAll && specificPaths.length === 0) {
    process.stderr.write('[release] provide --all or at least one path\n');
    process.exit(2);
  }

  let released = 0;
  let failed = 0;

  if (releaseAll) {
    const locks = getAllLocksForTask(taskId);
    if (locks.length === 0) {
      process.stdout.write(`[release] no locks found for ${taskId}\n`);
      process.exit(0);
    }
    for (const { lockPath, filePath } of locks) {
      const ok = releaseLock(lockPath, taskId, filePath);
      if (ok) released++;
      else failed++;
    }
  } else {
    for (const filePath of specificPaths) {
      const lockPath = lockFilePath(filePath);
      const ok = releaseLock(lockPath, taskId, filePath);
      if (ok) released++;
      else failed++;
    }
  }

  process.stdout.write(`[release] released ${released} lock(s) for ${taskId}${failed > 0 ? `, ${failed} failed` : ''}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  process.stderr.write(`[release] fatal: ${err.message}\n`);
  process.exit(1);
});
