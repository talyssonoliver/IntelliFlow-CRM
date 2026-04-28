#!/usr/bin/env node
/**
 * sweep.mjs — Reap orphaned file-level locks.
 *
 * Usage: node tools/scripts/locks/sweep.mjs [--ci]
 *
 * For each .lock file in .claude/locks/:
 *   - If pid is alive AND session_id is present AND age < 30min: keep.
 *   - Otherwise: reap and append audit log with reason.
 *
 * Returns exit code = number of reaped locks (0 = clean).
 * In --ci mode, uses "orphaned-by-ci-sweep" as reason.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const LOCKS_DIR = path.join(REPO_ROOT, '.claude', 'locks');
const AUDIT_LOG = path.join(LOCKS_DIR, 'audit.jsonl');

// Locks older than 30 minutes are candidates for reaping during sweep
const SWEEP_STALE_MS = 30 * 60 * 1000;

const isCI = process.argv.includes('--ci');
const REAP_REASON = isCI ? 'orphaned-by-ci-sweep' : 'orphaned-by-sweep';

function appendAuditLog(entry) {
  try {
    fs.mkdirSync(LOCKS_DIR, { recursive: true });
    fs.appendFileSync(AUDIT_LOG, JSON.stringify(entry) + '\n');
  } catch (err) {
    process.stderr.write(`[sweep] audit log write failed: ${err.message}\n`);
  }
}

function isProcessAlive(pid) {
  if (typeof pid !== 'number' || isNaN(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a session_id is still active by consulting the project-tracker API.
 * Best-effort: if the API is unreachable, returns null (unknown).
 */
async function isSessionActive(sessionId) {
  if (!sessionId) return false;

  // In CI there's no local server, so skip API check
  if (isCI) return false;

  try {
    const url = 'http://localhost:3002/api/claude-session/list';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) return null; // API reachable but error — treat as unknown

    const data = await response.json();
    const sessions = Array.isArray(data) ? data : (data.sessions ?? []);
    return sessions.some(
      (s) => s.session_id === sessionId || s.id === sessionId
    );
  } catch {
    return null; // Best-effort: API not available
  }
}

async function main() {
  if (!fs.existsSync(LOCKS_DIR)) {
    process.stdout.write('[sweep] locks directory does not exist — nothing to sweep\n');
    process.exit(0);
  }

  const entries = fs.readdirSync(LOCKS_DIR).filter((e) => e.endsWith('.lock'));

  if (entries.length === 0) {
    process.stdout.write('[sweep] no lock files found\n');
    process.exit(0);
  }

  process.stdout.write(`[sweep] scanning ${entries.length} lock file(s)${isCI ? ' (CI mode)' : ''}...\n`);

  let reaped = 0;
  let kept = 0;

  for (const entry of entries) {
    const lockPath = path.join(LOCKS_DIR, entry);
    let lockData;

    try {
      lockData = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    } catch {
      // Unreadable lock file — reap it
      try { fs.unlinkSync(lockPath); } catch {}
      appendAuditLog({
        event: 'sweep-reap',
        lock_file: entry,
        reason: `${REAP_REASON}:unreadable`,
        reaped_at: new Date().toISOString(),
      });
      process.stdout.write(`[sweep] reaped ${entry} (unreadable)\n`);
      reaped++;
      continue;
    }

    const acquiredAt = new Date(lockData.acquired_at).getTime();
    const ageMs = Date.now() - acquiredAt;
    const pid = lockData.pid;
    const sessionId = lockData.session_id;

    // Liveness checks
    const pidAlive = isProcessAlive(pid);
    const sessionAlive = await isSessionActive(sessionId); // null = unknown

    const isAlive = pidAlive && (sessionAlive === true || sessionAlive === null);
    const isRecent = ageMs < SWEEP_STALE_MS;

    if (isAlive && isRecent) {
      process.stdout.write(
        `[sweep] keeping ${entry} (pid=${pid} alive, age=${Math.round(ageMs / 60000)}min)\n`
      );
      kept++;
      continue;
    }

    // Reap
    let reapReason = REAP_REASON;
    if (!pidAlive) reapReason += ':pid-dead';
    else if (!isRecent) reapReason += ':stale';
    else if (sessionAlive === false) reapReason += ':session-gone';

    try {
      fs.unlinkSync(lockPath);
    } catch (err) {
      process.stderr.write(`[sweep] failed to delete ${entry}: ${err.message}\n`);
      continue;
    }

    appendAuditLog({
      event: 'sweep-reap',
      lock_file: entry,
      lock: lockData,
      reason: reapReason,
      age_min: Math.round(ageMs / 60000),
      pid_alive: pidAlive,
      session_alive: sessionAlive,
      reaped_at: new Date().toISOString(),
    });

    process.stdout.write(
      `[sweep] reaped ${entry} (reason: ${reapReason}, age: ${Math.round(ageMs / 60000)}min)\n`
    );
    reaped++;
  }

  process.stdout.write(`[sweep] done. kept=${kept} reaped=${reaped}\n`);
  // Exit 0 — caller (GH Actions) checks audit log for details
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`[sweep] fatal: ${err.message}\n`);
  process.exit(1);
});
