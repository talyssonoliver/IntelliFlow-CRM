/**
 * agent-context.mjs — shared utilities for hooks that need to reason about
 * the current agent's identity, the worktree-pool state, the lock registry,
 * and the running session set.
 *
 * Used by:
 *   - .claude/hooks/agent-tier-guard.mjs   (Edit/Write/Bash gating)
 *   - .claude/hooks/stop-guard.mjs          (lock + lease release on Stop)
 *   - tools/scripts/locks/{claim,release,sweep}.mjs (registry liveness)
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Walk up from the calling module to find the repo root (where .claude/agents/manifest.json lives). */
export function findRepoRoot(start) {
  let cur = resolve(start);
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(cur, '.claude', 'agents', 'manifest.json'))) return cur;
    if (existsSync(join(cur, '.claude')) && existsSync(join(cur, 'package.json'))) return cur;
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return start;
}

/** Liveness check that pairs PID and session_id (Windows-safe). */
export function isLiveAgent({ pid, session_id }, repoRoot) {
  // PID test
  let pidAlive = false;
  try {
    if (typeof pid === 'number' && pid > 0) {
      process.kill(pid, 0);
      pidAlive = true;
    }
  } catch {
    pidAlive = false;
  }
  if (!pidAlive) return false;

  // session_id presence test — read the spawner's status registry if available
  if (!session_id) return pidAlive;
  try {
    const statusDir = join(repoRoot, 'artifacts', 'logs', 'claude-sessions');
    if (!existsSync(statusDir)) return pidAlive;
    // The spawner writes <session-id>.json in a sibling directory; presence of
    // a "running" status file indicates the session is still tracked.
    const candidates = [
      join(repoRoot, 'apps', 'project-tracker', 'tmp', 'claude-sessions', `${session_id}.json`),
      join(statusDir, `${session_id}.json`),
    ];
    for (const c of candidates) {
      if (existsSync(c)) {
        try {
          const doc = JSON.parse(readFileSync(c, 'utf8'));
          if (doc && doc.status === 'running') return true;
        } catch {
          /* ignore */
        }
      }
    }
    // No matching session record found; PID alone (recycled-PID risk).
    // Default conservative: trust PID + return true. The CI sweep gates by
    // age (>30min) + this check, so the false-positive window is bounded.
    return pidAlive;
  } catch {
    return pidAlive;
  }
}

/** Read the contended-files seed list. Returns [] if missing. */
export function getContendedFiles(repoRoot) {
  const fp = join(repoRoot, '.claude', 'locks', 'contended-files.json');
  if (!existsSync(fp)) return [];
  try {
    const doc = JSON.parse(readFileSync(fp, 'utf8'));
    return Array.isArray(doc.contended_paths) ? doc.contended_paths : [];
  } catch {
    return [];
  }
}

/** Normalize a possibly-absolute path to repo-relative POSIX form. */
export function toRepoRelative(filePath, repoRoot) {
  if (!filePath) return '';
  let p = String(filePath).replace(/\\/g, '/');
  const root = String(repoRoot).replace(/\\/g, '/');
  if (isAbsolute(p) && p.toLowerCase().startsWith(root.toLowerCase())) {
    p = p.slice(root.length);
  }
  if (p.startsWith('/')) p = p.slice(1);
  return p;
}

/** Is `filePath` (any form) on the contended list? */
export function pathIsContended(filePath, repoRoot) {
  const rel = toRepoRelative(filePath, repoRoot);
  if (!rel) return false;
  const list = getContendedFiles(repoRoot);
  return list.includes(rel);
}

/** Sanitize a repo-relative path into the lock-file basename. */
export function lockFileName(repoRelPath) {
  return String(repoRelPath).replace(/[\\/]/g, '_') + '.lock';
}

/** Look up a claim record for a given path; returns the lock object or null. */
export function findClaim(repoRelPath, repoRoot) {
  const fp = join(repoRoot, '.claude', 'locks', lockFileName(repoRelPath));
  if (!existsSync(fp)) return null;
  try {
    return JSON.parse(readFileSync(fp, 'utf8'));
  } catch {
    return null;
  }
}

/** All locks currently held by `taskId`. */
export function locksHeldByTask(taskId, repoRoot) {
  const dir = join(repoRoot, '.claude', 'locks');
  if (!existsSync(dir)) return [];
  const out = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.lock')) continue;
    try {
      const doc = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      if (doc && doc.task_id === taskId) out.push({ file: f, ...doc });
    } catch {
      /* ignore */
    }
  }
  return out;
}

/** Convenience: what does this hook think its repo root is, given __dirname? */
export function repoRootFromHook(metaUrl) {
  const here = dirname(fileURLToPath(metaUrl));
  return findRepoRoot(resolve(here, '..', '..'));
}
