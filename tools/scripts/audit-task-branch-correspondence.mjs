#!/usr/bin/env node
/**
 * audit-task-branch-correspondence.mjs
 *
 * Detects orphaned tasks: Status=Completed in Sprint_plan.csv but
 * no corresponding remote branch agent/<TASK_ID> (or branch exists but
 * has no commits past origin/main).
 *
 * Usage:
 *   node audit-task-branch-correspondence.mjs [--task <ID>] [--sprint <N>] [--all] [--strict]
 *
 * Writes results to artifacts/reports/orphans.jsonl (append-only).
 * Exit non-zero only when --strict is passed and orphans are found.
 */

import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const CSV_PATH = join(
  REPO_ROOT,
  'apps',
  'project-tracker',
  'docs',
  'metrics',
  '_global',
  'Sprint_plan.csv'
);
const ORPHANS_JSONL = join(REPO_ROOT, 'artifacts', 'reports', 'orphans.jsonl');

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const taskFlag = args.indexOf('--task');
const sprintFlag = args.indexOf('--sprint');
const isAll = args.includes('--all') || args.length === 0;
const isStrict = args.includes('--strict');

const singleTask = taskFlag !== -1 ? args[taskFlag + 1] : null;
const singleSprint = sprintFlag !== -1 ? parseInt(args[sprintFlag + 1], 10) : null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function gitExec(cmd) {
  const result = spawnSync('git', ['-C', REPO_ROOT, ...cmd.split(' ')], {
    encoding: 'utf8',
    timeout: 30_000,
  });
  return { stdout: (result.stdout || '').trim(), stderr: (result.stderr || '').trim(), status: result.status };
}

/** Returns the SHA of a path on origin/main, or null if not found */
function masterFileSha(filePath) {
  const result = spawnSync('git', ['-C', REPO_ROOT, 'cat-file', '-p', `origin/main:${filePath}`], {
    encoding: 'utf8',
    timeout: 15_000,
  });
  if (result.status !== 0) return null;
  return createHash('sha256').update(result.stdout).digest('hex');
}

/** Parse Sprint_plan.csv into array of objects */
function parseCSV(csvPath) {
  if (!existsSync(csvPath)) throw new Error(`CSV not found: ${csvPath}`);
  const raw = readFileSync(csvPath, 'utf8');
  const lines = raw.split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim());

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Simple CSV parse — handles quoted fields naively (no embedded commas inside quotes for these fields)
    const values = [];
    let cur = '';
    let inQuote = false;
    for (let c = 0; c < line.length; c++) {
      if (line[c] === '"') {
        inQuote = !inQuote;
      } else if (line[c] === ',' && !inQuote) {
        values.push(cur.trim());
        cur = '';
      } else {
        cur += line[c];
      }
    }
    values.push(cur.trim());

    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = values[j] ?? '';
    }
    rows.push(obj);
  }
  return rows;
}

/** Look up branch_url from task-status JSON if it exists */
function getBranchUrl(taskId, sprint) {
  try {
    const statusPath = join(
      REPO_ROOT,
      'apps',
      'project-tracker',
      'docs',
      'metrics',
      `sprint-${sprint}`,
      `${taskId}.json`
    );
    if (existsSync(statusPath)) {
      const data = JSON.parse(readFileSync(statusPath, 'utf8'));
      if (data.branch_url) return data.branch_url;
    }
  } catch {
    // ignore
  }
  return null;
}

/** Infer branch name from task ID (may have custom branch_url) */
function getBranchName(taskId, sprint) {
  const url = getBranchUrl(taskId, sprint);
  if (url) {
    // extract from URL: https://github.com/.../tree/agent/<TASK_ID>
    const match = url.match(/\/tree\/(.+)$/);
    if (match) return match[1];
  }
  return `agent/${taskId}`;
}

/** Check if a branch exists on remote and has commits past master */
function checkBranch(branchName) {
  // Step 1: ls-remote to check if branch exists
  const lsResult = gitExec(`ls-remote origin refs/heads/${branchName}`);
  if (!lsResult.stdout) {
    return { exists: false, hasCommits: false, reason: 'no_remote_branch' };
  }

  // Step 2: check if branch has commits past master
  // Need to fetch the branch ref first (ls-remote already gives us the SHA)
  const branchSha = lsResult.stdout.split('\t')[0];
  const masterResult = gitExec('rev-parse origin/main');
  const masterSha = masterResult.stdout;

  if (!masterSha) {
    return { exists: true, hasCommits: null, reason: 'cannot_check_master' };
  }

  // Count commits on branch not in master
  const countResult = spawnSync(
    'git',
    ['-C', REPO_ROOT, 'rev-list', '--count', `${masterSha}..${branchSha}`],
    { encoding: 'utf8', timeout: 15_000 }
  );

  const commitCount = parseInt(countResult.stdout?.trim() || '0', 10);
  if (commitCount === 0) {
    return {
      exists: true,
      hasCommits: false,
      reason: 'branch_empty_no_commits_past_master',
      branchSha,
    };
  }

  return { exists: true, hasCommits: true, branchSha, commitCount };
}

/** Load attestation artifact_hashes for a task */
function getAttestationHashes(taskId, sprint) {
  try {
    const attPath = join(
      REPO_ROOT,
      '.specify',
      'sprints',
      `sprint-${sprint}`,
      'attestations',
      taskId,
      'attestation.json'
    );
    if (existsSync(attPath)) {
      const att = JSON.parse(readFileSync(attPath, 'utf8'));
      return att.artifact_hashes || null;
    }
  } catch {
    // ignore
  }
  return null;
}

/** Cross-check attestation hashes against master */
function crossCheckHashes(taskId, sprint) {
  const hashes = getAttestationHashes(taskId, sprint);
  if (!hashes) return null;

  const mismatches = [];
  for (const [filePath, expectedHash] of Object.entries(hashes)) {
    const actualHash = masterFileSha(filePath);
    if (actualHash === null) {
      mismatches.push({ path: filePath, expected: expectedHash, actual: 'NOT_ON_MASTER' });
    } else if (actualHash !== expectedHash) {
      mismatches.push({ path: filePath, expected: expectedHash, actual: actualHash });
    }
  }
  return { total: Object.keys(hashes).length, mismatches };
}

/** Get completion timestamp from attestation or task-status */
function getCompletedAt(taskId, sprint) {
  try {
    const attPath = join(
      REPO_ROOT,
      '.specify',
      'sprints',
      `sprint-${sprint}`,
      'attestations',
      taskId,
      'attestation.json'
    );
    if (existsSync(attPath)) {
      const att = JSON.parse(readFileSync(attPath, 'utf8'));
      return att.attestation_timestamp || null;
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Cutoff date for the agent/<TASK_ID> branch-naming convention. Tasks
 * completed before this date predate the convention; their work landed on
 * main through whatever process existed at the time, NOT via a dedicated
 * agent/<TASK_ID> branch. Flagging them as orphans is a false positive
 * that drowns out the real signal.
 *
 * Filter rule: if a Completed task has NO branch_url in its task-status
 * JSON AND its completed_at predates this cutoff, skip the audit entirely
 * (return null, don't write to orphans.jsonl). Tasks completed on/after
 * this date without a branch_url are real orphans — that's the bug class
 * the audit was built to detect.
 *
 * Override via env: AUDIT_CONVENTION_CUTOFF=YYYY-MM-DD
 */
const CONVENTION_CUTOFF = new Date(
  process.env.AUDIT_CONVENTION_CUTOFF || '2026-04-28T00:00:00Z'
).getTime();

/** Audit a single task. Returns an orphan record or null if healthy. */
function auditTask(row) {
  const taskId = (row['Task ID'] || '').trim();
  const status = (row['Status'] || '').trim().toLowerCase();
  const sprint = parseInt(row['Target Sprint'] || '0', 10);

  if (!taskId || (status !== 'completed' && status !== 'done')) return null;

  // Pre-naming-convention filter — drop the false-positive class that
  // dominated the first --all run (~395 of 399 hits). A task with no
  // branch_url AND completed_at before the convention adoption date never
  // had an agent/<TASK_ID> branch by design; flagging it is noise.
  const branchUrl = getBranchUrl(taskId, isNaN(sprint) ? 0 : sprint);
  const completedAtIso = getCompletedAt(taskId, isNaN(sprint) ? 0 : sprint);
  if (!branchUrl && completedAtIso) {
    const completedTs = Date.parse(completedAtIso);
    if (!Number.isNaN(completedTs) && completedTs < CONVENTION_CUTOFF) {
      return null; // pre-convention; not an orphan
    }
  }

  const branchName = getBranchName(taskId, isNaN(sprint) ? 0 : sprint);
  const branchCheck = checkBranch(branchName);

  let isOrphan = false;
  let reason = '';
  const evidence = {};

  if (!branchCheck.exists) {
    isOrphan = true;
    reason = 'no_remote_branch';
    evidence.branch = branchName;
  } else if (!branchCheck.hasCommits) {
    isOrphan = true;
    reason = branchCheck.reason || 'branch_empty';
    evidence.branch = branchName;
    evidence.branchSha = branchCheck.branchSha;
  }

  // Optional cross-check of attestation hashes (time-permitting)
  if (!isOrphan) {
    const hashCheck = crossCheckHashes(taskId, sprint);
    if (hashCheck && hashCheck.mismatches.length > 0) {
      isOrphan = true;
      reason = 'attestation_hash_mismatch';
      evidence.branch = branchName;
      evidence.hashMismatches = hashCheck.mismatches;
    }
  }

  if (!isOrphan) return null;

  const completedAt = getCompletedAt(taskId, sprint);

  return {
    task_id: taskId,
    sprint: isNaN(sprint) ? null : sprint,
    completed_at: completedAt,
    reason,
    evidence,
    detected_at: new Date().toISOString(),
  };
}

/** Write orphan to JSONL file (append-only) */
function appendOrphan(orphan) {
  const dir = dirname(ORPHANS_JSONL);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(ORPHANS_JSONL, JSON.stringify(orphan) + '\n', 'utf8');
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== audit-task-branch-correspondence ===');
  console.log(`Repo: ${REPO_ROOT}`);
  console.log(`Mode: ${singleTask ? `--task ${singleTask}` : singleSprint !== null ? `--sprint ${singleSprint}` : '--all'}`);
  console.log('');

  const rows = parseCSV(CSV_PATH);
  console.log(`Loaded ${rows.length} rows from Sprint_plan.csv`);

  let filteredRows = rows;
  if (singleTask) {
    filteredRows = rows.filter((r) => (r['Task ID'] || '').trim() === singleTask);
    if (filteredRows.length === 0) {
      console.error(`Task ${singleTask} not found in CSV`);
      process.exit(1);
    }
  } else if (singleSprint !== null) {
    filteredRows = rows.filter(
      (r) => parseInt(r['Target Sprint'] || '-1', 10) === singleSprint
    );
    console.log(`Filtered to sprint ${singleSprint}: ${filteredRows.length} rows`);
  }

  // Count completed tasks
  const completedRows = filteredRows.filter((r) => {
    const s = (r['Status'] || '').trim().toLowerCase();
    return s === 'completed' || s === 'done';
  });
  console.log(`Completed tasks to check: ${completedRows.length}`);
  console.log('');

  const orphans = [];
  let checked = 0;

  for (const row of completedRows) {
    const taskId = (row['Task ID'] || '').trim();
    if (!taskId) continue;

    process.stdout.write(`Checking ${taskId}... `);
    const orphan = auditTask(row);
    checked++;

    if (orphan) {
      process.stdout.write(`ORPHAN (${orphan.reason})\n`);
      orphans.push(orphan);
      appendOrphan(orphan);
    } else {
      process.stdout.write('OK\n');
    }
  }

  console.log('');
  console.log(`=== Results ===`);
  console.log(`Checked: ${checked}`);
  console.log(`Orphans found: ${orphans.length}`);

  if (orphans.length > 0) {
    console.log('');
    console.log('Orphan list:');
    for (const o of orphans) {
      console.log(
        `  ${o.task_id} (sprint ${o.sprint}) — ${o.reason} — completed: ${o.completed_at || 'unknown'}`
      );
    }
    console.log('');
    console.log(`Results appended to: ${ORPHANS_JSONL}`);
  } else {
    console.log('No orphans found. All completed tasks have landing branches.');
  }

  if (isStrict && orphans.length > 0) {
    console.error(`\nExit 1 (--strict mode, ${orphans.length} orphan(s) found)`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
