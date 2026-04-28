#!/usr/bin/env node
/**
 * declare-intent.mjs — Declare a long-hold intent for a task.
 *
 * Usage: node tools/scripts/locks/declare-intent.mjs <task-id> <duration-min> <path1> [path2 ...] [--refresh]
 *
 * Validates:
 *   - duration-min <= 240 (4h hard cap)
 *   - Only one intent file per task at a time
 *   - --refresh allows at most 1 refresh of an existing intent
 *
 * Writes .claude/locks/intents/<task-id>.json with:
 *   { task_id, declared_at, expires_at, files[], duration_min, refresh_count }
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const LOCKS_DIR = path.join(REPO_ROOT, '.claude', 'locks');
const INTENTS_DIR = path.join(LOCKS_DIR, 'intents');
const AUDIT_LOG = path.join(LOCKS_DIR, 'audit.jsonl');

const MAX_DURATION_MIN = 240; // 4-hour hard cap
const MAX_REFRESHES = 1;

function appendAuditLog(entry) {
  try {
    fs.mkdirSync(LOCKS_DIR, { recursive: true });
    fs.appendFileSync(AUDIT_LOG, JSON.stringify(entry) + '\n');
  } catch (err) {
    process.stderr.write(`[declare-intent] audit log write failed: ${err.message}\n`);
  }
}

function intentFilePath(taskId) {
  return path.join(INTENTS_DIR, `${taskId}.json`);
}

async function main() {
  const args = process.argv.slice(2);
  const isRefresh = args.includes('--refresh');
  const filteredArgs = args.filter((a) => a !== '--refresh');

  if (filteredArgs.length < 3) {
    process.stderr.write(
      'Usage: declare-intent.mjs <task-id> <duration-min> <path1> [path2 ...] [--refresh]\n'
    );
    process.exit(2);
  }

  const [taskId, durationStr, ...files] = filteredArgs;

  if (!taskId) {
    process.stderr.write('[declare-intent] task-id is required\n');
    process.exit(2);
  }

  const durationMin = parseInt(durationStr, 10);
  if (isNaN(durationMin) || durationMin <= 0) {
    process.stderr.write(`[declare-intent] duration-min must be a positive integer, got: ${durationStr}\n`);
    process.exit(2);
  }

  if (durationMin > MAX_DURATION_MIN) {
    process.stderr.write(
      `[declare-intent] duration ${durationMin}min exceeds hard cap of ${MAX_DURATION_MIN}min (4h)\n`
    );
    process.exit(1);
  }

  if (files.length === 0) {
    process.stderr.write('[declare-intent] at least one file path is required\n');
    process.exit(2);
  }

  fs.mkdirSync(INTENTS_DIR, { recursive: true });

  const intentPath = intentFilePath(taskId);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + durationMin * 60 * 1000).toISOString();

  // Check for existing intent
  let refreshCount = 0;
  if (fs.existsSync(intentPath)) {
    if (!isRefresh) {
      let existing;
      try {
        existing = JSON.parse(fs.readFileSync(intentPath, 'utf8'));
      } catch {
        existing = null;
      }
      const expiresAtExisting = existing?.expires_at ? new Date(existing.expires_at) : null;
      const isExpired = expiresAtExisting && expiresAtExisting < now;

      if (isExpired) {
        // Existing intent is expired — allow overwrite without --refresh
        process.stdout.write(`[declare-intent] existing intent for ${taskId} is expired, overwriting\n`);
        refreshCount = 0;
      } else {
        process.stderr.write(
          `[declare-intent] intent already exists for ${taskId}. Use --refresh to update (max ${MAX_REFRESHES} refresh).\n`
        );
        process.exit(1);
      }
    } else {
      // --refresh path: check refresh count
      let existing;
      try {
        existing = JSON.parse(fs.readFileSync(intentPath, 'utf8'));
      } catch {
        existing = null;
      }

      refreshCount = (existing?.refresh_count ?? 0) + 1;

      if (refreshCount > MAX_REFRESHES) {
        process.stderr.write(
          `[declare-intent] max refreshes (${MAX_REFRESHES}) reached for ${taskId}. Cannot refresh again.\n`
        );
        process.exit(1);
      }

      process.stdout.write(`[declare-intent] refreshing intent for ${taskId} (refresh #${refreshCount})\n`);
    }
  }

  const intentData = {
    task_id: taskId,
    declared_at: now.toISOString(),
    expires_at: expiresAt,
    duration_min: durationMin,
    files: [...files].sort(), // sort for consistent output
    refresh_count: refreshCount,
  };

  try {
    fs.writeFileSync(intentPath, JSON.stringify(intentData, null, 2) + '\n');
  } catch (err) {
    process.stderr.write(`[declare-intent] failed to write intent file: ${err.message}\n`);
    process.exit(1);
  }

  appendAuditLog({
    event: refreshCount > 0 ? 'intent-refresh' : 'intent-declare',
    task_id: taskId,
    duration_min: durationMin,
    declared_at: now.toISOString(),
    expires_at: expiresAt,
    files,
    refresh_count: refreshCount,
  });

  process.stdout.write(
    `[declare-intent] intent declared for ${taskId}: ${files.length} file(s), expires at ${expiresAt}\n`
  );
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`[declare-intent] fatal: ${err.message}\n`);
  process.exit(1);
});
