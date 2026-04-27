#!/usr/bin/env node
/**
 * Wave 0 — Worktree audit + migration helper.
 *
 * Enumerates every git worktree under `.claude/worktrees/` and
 * `.claude/worktree-pool/`, classifies each as `clean-delete` or `archive`,
 * and (in --plan mode) writes an evidence report.
 *
 * --plan  (default, fully safe)
 *   Reads git metadata and compares working-tree file bytes vs master.
 *   Writes `artifacts/reports/worktree-migration-<ISO>.md`. Exit 0.
 *
 * --apply  (human-facing, prints commands but NEVER executes them)
 *   Reads the most recent plan report and prints the exact shell commands
 *   a human would run.  Reminds the user that
 *   `.claude/hooks/git-destructive-guard.mjs` blocks destructive ops from
 *   any agent shell.
 *
 * Exit codes:
 *   0 — completed successfully
 *   1 — fatal error (bad args, git not available, etc.)
 *
 * Usage:
 *   node tools/scripts/worktree-pool/migrate-existing.mjs [--plan|--apply]
 *
 * Style modelled after tools/scripts/exec-preflight/check-nav-wiring.mjs
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { execSync, spawnSync } from 'node:child_process';

// ─── helpers ────────────────────────────────────────────────────────────────

function info(msg) {
  process.stdout.write(`${msg}\n`);
}

function warn(msg) {
  process.stderr.write(`[WARN] ${msg}\n`);
}

function die(msg) {
  process.stderr.write(`[FATAL] ${msg}\n`);
  process.exit(1);
}

/**
 * Run a command and return trimmed stdout.  Returns '' on non-zero exit.
 */
function run(cmd, cwd) {
  const result = spawnSync(cmd, { shell: true, cwd, encoding: 'utf8' });
  if (result.error) return '';
  return (result.stdout || '').trim();
}

/**
 * Run a command and return trimmed stdout, or throw on non-zero exit.
 */
function runStrict(cmd, cwd) {
  const result = spawnSync(cmd, { shell: true, cwd, encoding: 'utf8' });
  if (result.error) throw new Error(result.error.message);
  if (result.status !== 0) {
    throw new Error(
      `Command failed (exit ${result.status}): ${cmd}\n${result.stderr || ''}`
    );
  }
  return (result.stdout || '').trim();
}

/**
 * SHA-256 of a Buffer or string.
 */
function sha256(data) {
  return createHash('sha256')
    .update(typeof data === 'string' ? Buffer.from(data, 'utf8') : data)
    .digest('hex');
}

/**
 * Parse `git worktree list --porcelain` output into an array of objects.
 */
function parseWorktreeList(raw) {
  const entries = [];
  let current = {};
  for (const line of raw.split(/\r?\n/)) {
    if (line === '') {
      if (current.worktree) entries.push(current);
      current = {};
      continue;
    }
    if (line.startsWith('worktree ')) {
      current.worktree = line.slice('worktree '.length).trim();
    } else if (line.startsWith('HEAD ')) {
      current.HEAD = line.slice('HEAD '.length).trim();
    } else if (line.startsWith('branch ')) {
      const ref = line.slice('branch '.length).trim();
      current.branch = ref.replace(/^refs\/heads\//, '');
    } else if (line === 'bare') {
      current.bare = true;
    } else if (line === 'detached') {
      current.detached = true;
    } else if (line.startsWith('locked')) {
      current.locked = true;
      current.lockReason = line.slice('locked'.length).trim() || '';
    }
  }
  if (current.worktree) entries.push(current);
  return entries;
}

/**
 * Normalise a filesystem path so forward/back slashes don't confuse
 * substring matching on Windows.
 */
function normPath(p) {
  return p.replace(/\\/g, '/');
}

/**
 * Return true if the worktree path lives under one of the managed dirs.
 */
function isManagedWorktree(wtPath, repoRoot) {
  const n = normPath(wtPath);
  const nr = normPath(repoRoot);
  return (
    n.startsWith(nr + '/.claude/worktrees/') ||
    n.startsWith(nr + '/.claude/worktree-pool/')
  );
}

// ─── core classification ─────────────────────────────────────────────────────

/**
 * Compute commit distances vs master and dirty file list.
 * Returns { ahead, behind, dirtyFiles }
 *   dirtyFiles: Array of { path, status, wtHash, masterHash, verdict }
 */
function auditWorktree(wtPath, repoRoot, branch) {
  // Commit distances (branch may not exist if worktree is detached)
  let ahead = 0;
  let behind = 0;
  if (branch && !branch.startsWith('(')) {
    const aheadStr = run(
      `git rev-list --count master..${branch}`,
      repoRoot
    );
    const behindStr = run(
      `git rev-list --count ${branch}..master`,
      repoRoot
    );
    ahead = parseInt(aheadStr, 10) || 0;
    behind = parseInt(behindStr, 10) || 0;
  }

  // Dirty files
  const statusRaw = run('git status --porcelain', wtPath);
  const dirtyFiles = [];

  if (statusRaw) {
    for (const line of statusRaw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const status = line.slice(0, 2).trim();
      const filePath = line.slice(3).trim();

      // Untracked files (not in git) — compare existence in master
      if (status === '??' || status === '?') {
        dirtyFiles.push({
          path: filePath,
          status,
          wtHash: '(untracked)',
          masterHash: '(untracked — not in master)',
          verdict: 'DIFFERS', // untracked = potentially unique
        });
        continue;
      }

      // Read worktree copy
      const wtFileFull = join(wtPath, filePath);
      let wtHash = '(missing)';
      if (existsSync(wtFileFull)) {
        try {
          wtHash = sha256(readFileSync(wtFileFull));
        } catch {
          wtHash = '(read-error)';
        }
      }

      // Read master copy
      const masterContentRaw = run(`git show "master:${filePath}"`, repoRoot);
      let masterHash = '(not-in-master)';
      // spawnSync returns '' for non-zero; check if master has the file
      const masterExists = run(
        `git cat-file -e "master:${filePath}" && echo yes`,
        repoRoot
      );
      if (masterExists === 'yes') {
        masterHash = sha256(masterContentRaw);
      }

      const verdict = wtHash === masterHash ? 'SAME' : 'DIFFERS';
      dirtyFiles.push({ path: filePath, status, wtHash, masterHash, verdict });
    }
  }

  return { ahead, behind, dirtyFiles };
}

/**
 * Classify a worktree given its audit result.
 * Returns 'clean-delete' | 'archive'
 */
function classify(audit) {
  if (audit.ahead > 0) return 'archive';
  const hasUniqueDirty = audit.dirtyFiles.some((f) => f.verdict === 'DIFFERS');
  if (hasUniqueDirty) return 'archive';
  return 'clean-delete';
}

// ─── report writer ───────────────────────────────────────────────────────────

function buildReport(worktrees, repoRoot, isoTimestamp) {
  const lines = [];

  lines.push('# Worktree Migration Audit Report');
  lines.push('');
  lines.push(`**Generated**: ${isoTimestamp}`);
  lines.push(`**Repository**: ${repoRoot}`);
  lines.push(`**Master HEAD**: ${run('git rev-parse master', repoRoot)}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  const summary = { cleanDelete: 0, archive: 0 };

  for (const wt of worktrees) {
    const { path, branch, HEAD, audit, classification, locked, lockReason } =
      wt;
    lines.push(`## ${branch || HEAD.slice(0, 12)}`);
    lines.push('');
    lines.push(`- **Path**: \`${path}\``);
    lines.push(`- **Branch**: \`${branch || '(detached)'}\``);
    lines.push(`- **HEAD**: \`${HEAD}\``);
    if (locked) {
      lines.push(`- **Locked**: yes — ${lockReason}`);
    }
    lines.push(`- **Commits ahead of master**: ${audit.ahead}`);
    lines.push(`- **Commits behind master**: ${audit.behind}`);
    lines.push(`- **Dirty files**: ${audit.dirtyFiles.length}`);
    lines.push('');

    if (audit.dirtyFiles.length > 0) {
      lines.push('### Dirty file comparison');
      lines.push('');
      lines.push(
        '| Status | File | Verdict | WT SHA-256 (first 16) | Master SHA-256 (first 16) |'
      );
      lines.push(
        '|--------|------|---------|----------------------|--------------------------|'
      );
      for (const f of audit.dirtyFiles) {
        const wtShort =
          f.wtHash.length > 16 ? f.wtHash.slice(0, 16) : f.wtHash;
        const mShort =
          f.masterHash.length > 16 ? f.masterHash.slice(0, 16) : f.masterHash;
        lines.push(
          `| \`${f.status}\` | \`${f.path}\` | **${f.verdict}** | \`${wtShort}\` | \`${mShort}\` |`
        );
      }
      lines.push('');
    }

    lines.push(`### Classification: **${classification.toUpperCase()}**`);
    lines.push('');
    if (classification === 'clean-delete') {
      lines.push(
        '**Rationale**: branch has 0 commits ahead of master AND all dirty files ' +
          'match master byte-for-byte (or there are no dirty files). ' +
          'No unique work at risk.'
      );
      lines.push('');
      lines.push('**Recommended next step**: Human runs:');
      lines.push('```bash');
      lines.push(`git worktree remove --force "${path}"`);
      lines.push(`git branch -D "${branch}"`);
      lines.push('```');
      summary.cleanDelete++;
    } else {
      lines.push(
        '**Rationale**: branch has commits ahead of master OR has dirty files ' +
          'with content that differs from master. Unique work may be present.'
      );
      lines.push('');
      lines.push(
        '**Recommended next step**: Archive the branch, then human runs:'
      );
      lines.push('```bash');
      lines.push(
        `git push origin "${branch}":archive/"${branch}"  # preserve branch`
      );
      lines.push(`git worktree remove --force "${path}"`);
      lines.push(`git branch -D "${branch}"`);
      lines.push('```');
      summary.archive++;
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  // Summary table
  lines.push('## Summary');
  lines.push('');
  lines.push('| Classification | Count |');
  lines.push('|----------------|-------|');
  lines.push(`| clean-delete | ${summary.cleanDelete} |`);
  lines.push(`| archive | ${summary.archive} |`);
  lines.push('');
  lines.push(
    '> **Note**: `git worktree remove --force` and `git branch -D` are blocked ' +
      'by `.claude/hooks/git-destructive-guard.mjs` in any agent shell. ' +
      'A human must run the commands above in a plain terminal.'
  );

  return lines.join('\n');
}

// ─── --apply mode ────────────────────────────────────────────────────────────

function runApply(repoRoot) {
  const reportsDir = join(repoRoot, 'artifacts', 'reports');

  // Find most recent worktree-migration report
  let reportFiles = [];
  if (existsSync(reportsDir)) {
    reportFiles = readdirSync(reportsDir)
      .filter((f) => f.startsWith('worktree-migration-') && f.endsWith('.md'))
      .sort()
      .reverse();
  }

  if (reportFiles.length === 0) {
    die(
      'No worktree-migration-*.md found in artifacts/reports/. Run --plan first.'
    );
  }

  const reportPath = join(reportsDir, reportFiles[0]);
  info(`Reading most recent plan report: ${reportPath}`);
  info('');

  const content = readFileSync(reportPath, 'utf8');

  // Extract bash blocks from the report
  const bashBlocks = [...content.matchAll(/```bash\n([\s\S]*?)```/g)].map(
    (m) => m[1].trim()
  );

  if (bashBlocks.length === 0) {
    info('No commands found in the report (no worktrees to migrate).');
    return;
  }

  info('╔══════════════════════════════════════════════════════════════════╗');
  info('║  --apply mode: printing commands only — NOT executing them       ║');
  info('╚══════════════════════════════════════════════════════════════════╝');
  info('');
  info(
    'IMPORTANT: `.claude/hooks/git-destructive-guard.mjs` blocks the following'
  );
  info(
    'commands from any Claude agent shell: `git worktree remove`, `git branch -D`,'
  );
  info('`git push --force`, `git reset --hard`, `git clean -f`.');
  info('');
  info('A human operator must run these commands in a plain terminal:');
  info('');

  for (let i = 0; i < bashBlocks.length; i++) {
    info(`### Block ${i + 1}`);
    info('```bash');
    info(bashBlocks[i]);
    info('```');
    info('');
  }

  info('After running all commands, verify with:');
  info('```bash');
  info('git worktree list');
  info('```');
  info('The output should show only `master` (and any active pool slots).');
}

// ─── entrypoint ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const mode = args[0] === '--apply' ? 'apply' : 'plan';

// Determine repo root: walk up from CWD looking for a .git directory or file
function findRepoRoot() {
  let dir = resolve(process.cwd());
  for (let i = 0; i < 20; i++) {
    if (existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: use CWD (running from worktree, .git is a file)
  return resolve(process.cwd());
}

const REPO_ROOT = findRepoRoot();

if (mode === 'apply') {
  runApply(REPO_ROOT);
  process.exit(0);
}

// ─── --plan mode ─────────────────────────────────────────────────────────────

info('Enumerating worktrees...');
const rawList = run('git worktree list --porcelain', REPO_ROOT);
if (!rawList) die('`git worktree list --porcelain` returned no output.');

const allWorktrees = parseWorktreeList(rawList);
const managed = allWorktrees.filter(
  (wt) => isManagedWorktree(wt.worktree, REPO_ROOT)
);

info(`Found ${allWorktrees.length} total worktrees, ${managed.length} managed.`);

if (managed.length === 0) {
  info('No managed worktrees under .claude/worktrees/ or .claude/worktree-pool/.');
  info('Nothing to audit.');
  process.exit(0);
}

// Audit each managed worktree
const results = [];
for (const wt of managed) {
  const wtPath = wt.worktree;
  const branch = wt.branch || '';
  info(`Auditing: ${branch || wtPath} ...`);

  const audit = auditWorktree(wtPath, REPO_ROOT, branch);
  const classification = classify(audit);

  results.push({
    path: wtPath,
    branch,
    HEAD: wt.HEAD,
    locked: wt.locked || false,
    lockReason: wt.lockReason || '',
    audit,
    classification,
  });

  info(
    `  → ${classification} ` +
      `(ahead=${audit.ahead}, behind=${audit.behind}, ` +
      `dirty=${audit.dirtyFiles.length}, ` +
      `differs=${audit.dirtyFiles.filter((f) => f.verdict === 'DIFFERS').length})`
  );
}

// Write report
const isoTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
const reportsDir = join(REPO_ROOT, 'artifacts', 'reports');
mkdirSync(reportsDir, { recursive: true });
const reportPath = join(reportsDir, `worktree-migration-${isoTimestamp}.md`);

const reportContent = buildReport(results, REPO_ROOT, isoTimestamp);
writeFileSync(reportPath, reportContent, 'utf8');

info('');
info(`Report written to: ${reportPath}`);
info('');
info('Classification summary:');
for (const r of results) {
  info(`  ${r.branch || r.HEAD.slice(0, 12)}: ${r.classification}`);
}
