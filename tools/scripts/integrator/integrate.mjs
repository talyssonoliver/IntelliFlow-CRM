#!/usr/bin/env node
/**
 * Wave 3.2 — Single-Writer Integrator with Rollback Policy
 *
 * Picks up agent/<TASK_ID> branches in dependency-graph order, rebases onto
 * origin/main, runs scoped validation, then fast-forward merges.
 *
 * Rollback Policies:
 *   R1 — Rebase conflict:    label PR "needs-rework", set CSV Status=Needs Rework
 *   R2 — Validation failure: comment log URL, preserve integrate/<TASK_ID> branch
 *   R3 — PR closed w/o merge: delete remote branch, revert CSV Status to In Progress
 *   R4 — Lease expired:      same as R3 + record in artifacts/reports/abandoned-tasks.jsonl
 *
 * Run modes:
 *   --once        Single pass then exit
 *   --watch       Loop every 60 s
 *   --dry-run     DEFAULT. Prints planned operations; NO mutations
 *   --no-dry-run  Required for real action
 *
 * Usage:
 *   node integrate.mjs --dry-run          (same as default)
 *   node integrate.mjs --once --dry-run
 *   node integrate.mjs --once --no-dry-run
 *   node integrate.mjs --watch --no-dry-run
 */

import { execSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Constants & configuration
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');

const DEPENDENCY_GRAPH_PATH = join(
  REPO_ROOT,
  'apps/project-tracker/docs/metrics/_global/dependency-graph.json'
);
const SPRINT_PLAN_CSV_PATH = join(
  REPO_ROOT,
  'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv'
);
const ORPHANS_JSONL_PATH = join(REPO_ROOT, 'artifacts/reports/orphans.jsonl');
const ABANDONED_JSONL_PATH = join(REPO_ROOT, 'artifacts/reports/abandoned-tasks.jsonl');

/** Minimum age (seconds) a branch must be before the integrator touches it */
const MIN_BRANCH_AGE_SECONDS = parseInt(process.env.MIN_BRANCH_AGE_SECONDS ?? '300', 10);

/** How long (seconds) a PR can sit open before R4 triggers */
const LEASE_EXPIRY_SECONDS = parseInt(process.env.LEASE_EXPIRY_SECONDS ?? '86400', 10); // 24h

const WATCH_INTERVAL_MS = 60_000; // 60 s

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);

/** --dry-run is the default; must pass --no-dry-run to execute real actions */
const isDryRun = !argv.includes('--no-dry-run');
const isWatch = argv.includes('--watch');
const isOnce = argv.includes('--once') || (!isWatch);

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------

function log(msg) {
  console.log(`[integrator] ${msg}`);
}

function logDry(msg) {
  console.log(`[DRY-RUN]   ${msg}`);
}

function logError(msg) {
  console.error(`[integrator][ERROR] ${msg}`);
}

// ---------------------------------------------------------------------------
// Git helpers (safe wrappers — all throw on non-zero in real mode)
// ---------------------------------------------------------------------------

function git(args, opts = {}) {
  const { cwd = REPO_ROOT, capture = false } = opts;
  if (isDryRun && !opts.readOnly) {
    logDry(`git ${args}`);
    return '';
  }
  const result = spawnSync('git', args.split(' ').filter(Boolean), {
    cwd,
    encoding: 'utf-8',
    stdio: capture ? 'pipe' : 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`git ${args} failed (exit ${result.status}):\n${result.stderr ?? ''}`);
  }
  return (result.stdout ?? '').trim();
}

function gitRead(args) {
  return git(args, { readOnly: true, capture: true });
}

// ---------------------------------------------------------------------------
// gh CLI helper (GitHub CLI)
// ---------------------------------------------------------------------------

function gh(args, { allowFail = false } = {}) {
  if (isDryRun) {
    logDry(`gh ${args}`);
    return '';
  }
  const result = spawnSync('gh', args.split(' ').filter(Boolean), {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    stdio: 'pipe',
    env: { ...process.env },
  });
  if (!allowFail && result.status !== 0) {
    throw new Error(`gh ${args} failed (exit ${result.status}):\n${result.stderr ?? ''}`);
  }
  return (result.stdout ?? '').trim();
}

// ---------------------------------------------------------------------------
// Dependency graph helpers
// ---------------------------------------------------------------------------

function loadDependencyGraph() {
  if (!existsSync(DEPENDENCY_GRAPH_PATH)) {
    throw new Error(`dependency-graph.json not found at ${DEPENDENCY_GRAPH_PATH}`);
  }
  return JSON.parse(readFileSync(DEPENDENCY_GRAPH_PATH, 'utf-8'));
}

/**
 * Returns an ordered list of task IDs from the dependency graph.
 * Priority: tasks in ready_to_start[], then rest in topological order.
 */
function getTopologicalOrder(graph) {
  const readyToStart = new Set(graph.ready_to_start ?? []);
  const nodes = graph.nodes ?? {};

  // Build adjacency + in-degree for Kahn's algorithm
  const inDegree = {};
  const adj = {}; // task_id -> dependents

  for (const id of Object.keys(nodes)) {
    inDegree[id] = 0;
    adj[id] = [];
  }
  for (const [id, node] of Object.entries(nodes)) {
    for (const dep of node.dependencies ?? []) {
      if (adj[dep]) {
        adj[dep].push(id);
        inDegree[id] = (inDegree[id] ?? 0) + 1;
      }
    }
  }

  // Kahn's — stable sort: ready_to_start first within each tier
  const queue = Object.keys(inDegree)
    .filter((id) => inDegree[id] === 0)
    .sort((a, b) => {
      const aReady = readyToStart.has(a) ? 0 : 1;
      const bReady = readyToStart.has(b) ? 0 : 1;
      return aReady - bReady || a.localeCompare(b);
    });

  const order = [];
  while (queue.length > 0) {
    const id = queue.shift();
    order.push(id);
    const dependents = (adj[id] ?? []).sort((a, b) => {
      const aReady = readyToStart.has(a) ? 0 : 1;
      const bReady = readyToStart.has(b) ? 0 : 1;
      return aReady - bReady || a.localeCompare(b);
    });
    for (const dep of dependents) {
      inDegree[dep]--;
      if (inDegree[dep] === 0) {
        queue.push(dep);
      }
    }
  }

  return order;
}

// ---------------------------------------------------------------------------
// Remote branch discovery
// ---------------------------------------------------------------------------

/**
 * Lists all agent/* branches on origin.
 * Returns array of { taskId, ref, latestCommitTimestamp }
 */
function listAgentBranches() {
  const raw = gitRead('ls-remote --sort=-version:refname origin refs/heads/agent/*');
  if (!raw) return [];

  const branches = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const [, ref] = line.split('\t');
    if (!ref) continue;
    const taskId = ref.replace('refs/heads/agent/', '');
    branches.push({ taskId, ref, remoteBranch: `agent/${taskId}` });
  }
  return branches;
}

/**
 * Returns the commit timestamp of the latest commit on a remote branch.
 * Uses git ls-remote + git cat-file tricks; falls back to -Infinity on error.
 */
function getBranchAge(remoteBranch) {
  try {
    // Fetch the specific branch tip to get its date
    const fetchResult = spawnSync(
      'git',
      ['fetch', 'origin', `${remoteBranch}:refs/remotes/origin/${remoteBranch}`, '--no-tags'],
      { cwd: REPO_ROOT, encoding: 'utf-8', stdio: 'pipe' }
    );
    if (fetchResult.status !== 0) return null;

    const ts = spawnSync(
      'git',
      ['log', '-1', '--format=%ct', `origin/${remoteBranch}`],
      { cwd: REPO_ROOT, encoding: 'utf-8', stdio: 'pipe' }
    );
    const epoch = parseInt((ts.stdout ?? '').trim(), 10);
    return isNaN(epoch) ? null : epoch;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Orphan filter
// ---------------------------------------------------------------------------

function loadOrphanedTaskIds() {
  if (!existsSync(ORPHANS_JSONL_PATH)) return new Set();
  const lines = readFileSync(ORPHANS_JSONL_PATH, 'utf-8')
    .split('\n')
    .filter(Boolean);
  const ids = new Set();
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj.task_id) ids.add(obj.task_id);
    } catch {
      // skip malformed lines
    }
  }
  return ids;
}

// ---------------------------------------------------------------------------
// CSV helpers — Branch + Integration Status columns (columns 19 & 20)
// ---------------------------------------------------------------------------

const BRANCH_COL = 'Branch';
const INT_STATUS_COL = 'Integration Status';

/**
 * Updates the `Branch` and/or `Integration Status` columns for a given task ID
 * in Sprint_plan.csv.
 *
 * NOTE (Wave 3.2): This function directly edits the CSV. In a future wave this
 * should go through the lock-registry to prevent concurrent writes.
 * Dependency: lock-registry (Wave 3.3).
 */
function updateCsvColumns(taskId, updates) {
  if (isDryRun) {
    logDry(`CSV update for ${taskId}: ${JSON.stringify(updates)}`);
    return;
  }

  const csv = readFileSync(SPRINT_PLAN_CSV_PATH, 'utf-8');
  const lines = csv.split('\n');
  const header = lines[0];
  const cols = parseCSVHeader(header);
  const branchIdx = cols.indexOf(BRANCH_COL);
  const intStatusIdx = cols.indexOf(INT_STATUS_COL);

  if (branchIdx === -1 || intStatusIdx === -1) {
    logError(
      `CSV columns '${BRANCH_COL}' / '${INT_STATUS_COL}' not found. ` +
        'Run the split-sprint-plan migration first.'
    );
    return;
  }

  const updated = lines.map((line, i) => {
    if (i === 0) return line; // header
    const fields = parseCSVLine(line);
    if (!fields || fields[0]?.trim() !== taskId) return line;

    while (fields.length <= Math.max(branchIdx, intStatusIdx)) fields.push('');

    if ('branch' in updates) fields[branchIdx] = updates.branch;
    if ('integrationStatus' in updates) fields[intStatusIdx] = updates.integrationStatus;

    return fields.map(quoteCSVField).join(',');
  });

  writeFileSync(SPRINT_PLAN_CSV_PATH, updated.join('\n'), 'utf-8');
  log(`CSV updated for ${taskId}: ${JSON.stringify(updates)}`);
}

/**
 * Parse the CSV header row into a column-name array.
 * Handles quoted fields.
 */
function parseCSVHeader(headerLine) {
  return parseCSVLine(headerLine) ?? [];
}

/**
 * Minimal CSV line parser — handles double-quoted fields (including embedded
 * commas and newlines escaped as \n in the cell).
 * Returns null for blank lines.
 */
function parseCSVLine(line) {
  if (!line?.trim()) return null;
  const fields = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      // Quoted field
      let field = '';
      i++; // skip opening quote
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') {
          field += '"';
          i += 2;
        } else if (line[i] === '"') {
          i++; // skip closing quote
          break;
        } else {
          field += line[i++];
        }
      }
      fields.push(field);
      if (line[i] === ',') i++; // skip separator
    } else {
      // Unquoted field
      const end = line.indexOf(',', i);
      if (end === -1) {
        fields.push(line.slice(i));
        break;
      }
      fields.push(line.slice(i, end));
      i = end + 1;
    }
  }
  return fields;
}

function quoteCSVField(value) {
  if (value == null) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// ---------------------------------------------------------------------------
// Attestation timestamp helper
// ---------------------------------------------------------------------------

/**
 * Reads the attestation.json for a task (if present) and returns the
 * attestation_timestamp as an epoch seconds integer, or null.
 */
function getAttestationTimestamp(taskId) {
  // Scan .specify/sprints/sprint-*/attestations/<TASK_ID>/attestation.json
  const specifyRoot = join(REPO_ROOT, '.specify/sprints');
  if (!existsSync(specifyRoot)) return null;

  try {
    const { readdirSync } = await_import_sync('node:fs');
    // Use execSync for a quick glob approach
    const result = spawnSync(
      'find',
      [
        specifyRoot,
        '-path',
        `*/attestations/${taskId}/attestation.json`,
        '-type',
        'f',
        '-maxdepth',
        '5',
      ],
      { encoding: 'utf-8', stdio: 'pipe' }
    );
    if (result.status !== 0 || !result.stdout.trim()) return null;
    const atPath = result.stdout.trim().split('\n')[0];
    const atJson = JSON.parse(readFileSync(atPath, 'utf-8'));
    const ts = atJson.attestation_timestamp;
    if (!ts) return null;
    return Math.floor(new Date(ts).getTime() / 1000);
  } catch {
    return null;
  }
}

// Windows-compatible attestation timestamp lookup
function findAttestationTimestamp(taskId) {
  try {
    const specifyRoot = join(REPO_ROOT, '.specify/sprints');
    if (!existsSync(specifyRoot)) return null;

    // Use git ls-files which works cross-platform
    const result = spawnSync(
      'git',
      ['ls-files', `--`, `.specify/sprints/*/attestations/${taskId}/attestation.json`],
      { cwd: REPO_ROOT, encoding: 'utf-8', stdio: 'pipe' }
    );
    if (result.status !== 0 || !result.stdout.trim()) return null;

    const relPath = result.stdout.trim().split('\n')[0];
    if (!relPath) return null;
    const absPath = join(REPO_ROOT, relPath.replace(/\//g, '/'));
    if (!existsSync(absPath)) return null;

    const atJson = JSON.parse(readFileSync(absPath, 'utf-8'));
    const ts = atJson.attestation_timestamp;
    if (!ts) return null;
    return Math.floor(new Date(ts).getTime() / 1000);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// JSONL report helpers
// ---------------------------------------------------------------------------

function ensureReportsDir() {
  const reportsDir = join(REPO_ROOT, 'artifacts/reports');
  if (!existsSync(reportsDir)) {
    mkdirSync(reportsDir, { recursive: true });
  }
}

function appendJsonl(filePath, obj) {
  if (isDryRun) {
    logDry(`JSONL append to ${filePath}: ${JSON.stringify(obj)}`);
    return;
  }
  ensureReportsDir();
  appendFileSync(filePath, JSON.stringify(obj) + '\n', 'utf-8');
}

// ---------------------------------------------------------------------------
// Workspace detection (turbo --filter)
// ---------------------------------------------------------------------------

/**
 * Given a list of changed files (from git diff), returns turbo --filter
 * expressions for affected workspaces.
 */
function detectAffectedWorkspaces(changedFiles) {
  const workspaceMap = {
    'apps/web/': '@intelliflow/web',
    'apps/api/': '@intelliflow/api',
    'apps/ai-worker/': '@intelliflow/ai-worker',
    'packages/db/': '@intelliflow/db',
    'packages/domain/': '@intelliflow/domain',
    'packages/application/': '@intelliflow/application',
    'packages/adapters/': '@intelliflow/adapters',
    'packages/validators/': '@intelliflow/validators',
    'packages/ui/': '@intelliflow/ui',
    'packages/api-client/': '@intelliflow/api-client',
  };

  const affected = new Set();
  for (const file of changedFiles) {
    for (const [prefix, workspace] of Object.entries(workspaceMap)) {
      if (file.startsWith(prefix)) {
        affected.add(workspace);
      }
    }
  }
  return Array.from(affected);
}

// ---------------------------------------------------------------------------
// Integration policies: R1-R4
// ---------------------------------------------------------------------------

/**
 * R1 — Rebase conflict.
 * Comment on PR with "needs-rework" label; set CSV Status=Needs Rework;
 * preserve remote branch.
 */
async function handleR1(taskId, conflictDetails) {
  log(`R1: rebase conflict on ${taskId}. Applying needs-rework policy.`);
  const body = [
    `## Integrator: Rebase Conflict Detected`,
    '',
    `Task **${taskId}** could not be rebased onto \`origin/main\` without conflicts.`,
    '',
    '**Conflict details:**',
    '```',
    conflictDetails,
    '```',
    '',
    'Please resolve conflicts locally and force-push the updated branch.',
    '',
    '_Automated by integrator (Wave 3.2)_',
  ].join('\n');

  gh(`pr comment agent/${taskId} --body "${body.replace(/"/g, '\\"')}"`, { allowFail: true });
  gh(`pr edit agent/${taskId} --add-label "needs-rework"`, { allowFail: true });
  updateCsvColumns(taskId, { integrationStatus: 'Needs Rework' });

  // Abort rebase if in progress
  git('rebase --abort', { readOnly: false });
}

/**
 * R2 — Validation failure.
 * Comment with log URL; set CSV Integration Status=Validation Failed;
 * preserve integrate/<TASK_ID> branch for inspection.
 */
function handleR2(taskId, validationOutput) {
  log(`R2: validation failure on ${taskId}. Preserving branch for inspection.`);
  const logSnippet = (validationOutput ?? '').slice(0, 2000);
  const body = [
    `## Integrator: Validation Failed`,
    '',
    `Task **${taskId}** passed rebase but failed scoped validation.`,
    '',
    '**Validation output (first 2 KB):**',
    '```',
    logSnippet,
    '```',
    '',
    `The branch \`integrate/${taskId}\` has been preserved locally for inspection.`,
    '',
    '_Automated by integrator (Wave 3.2)_',
  ].join('\n');

  gh(`pr comment agent/${taskId} --body "${body.replace(/"/g, '\\"')}"`, { allowFail: true });
  updateCsvColumns(taskId, { integrationStatus: 'Validation Failed' });

  // Return to main but preserve the failed integrate branch
  git('checkout main', { readOnly: false });
}

/**
 * R3 — PR closed without merge.
 * Delete remote branch; revert CSV Integration Status to In Progress; clear Branch column.
 */
function handleR3(taskId) {
  log(`R3: PR for ${taskId} closed without merge. Reverting status.`);
  git(`push origin --delete agent/${taskId}`, { readOnly: false });
  updateCsvColumns(taskId, { branch: '', integrationStatus: 'In Progress' });
}

/**
 * R4 — Lease expired (PR open too long without action).
 * Same as R3 + record in abandoned-tasks.jsonl.
 */
function handleR4(taskId, prOpenedAt) {
  log(`R4: lease expired for ${taskId}. Recording as abandoned.`);
  handleR3(taskId);
  appendJsonl(ABANDONED_JSONL_PATH, {
    task_id: taskId,
    abandoned_at: new Date().toISOString(),
    pr_opened_at: prOpenedAt ? new Date(prOpenedAt * 1000).toISOString() : null,
    reason: 'lease_expired',
  });
}

// ---------------------------------------------------------------------------
// Core integration: single branch
// ---------------------------------------------------------------------------

/**
 * Integrates a single agent/<TASK_ID> branch.
 * Returns 'merged' | 'conflict' | 'validation_failed' | 'skipped' | 'dry_run'
 */
function integrateBranch(taskId) {
  const branchName = `integrate/${taskId}`;
  const startTime = Math.floor(Date.now() / 1000);

  log(`Processing ${taskId} → ${branchName}`);

  if (isDryRun) {
    logDry(`Would perform:`);
    logDry(`  1. git fetch origin agent/${taskId}`);
    logDry(`  2. git checkout -b ${branchName} origin/agent/${taskId}`);
    logDry(`  3. git rebase origin/main`);
    logDry(`  4. Run scoped validation (turbo --filter <affected-workspaces>)`);
    logDry(`  5. git checkout main && git merge --ff-only ${branchName}`);
    logDry(`  6. git push origin main`);
    logDry(`  7. git push origin --delete agent/${taskId}`);
    logDry(`  8. Update CSV Branch='' and Integration Status=Merged`);
    logDry(`  9. Record metrics (integration_duration_seconds, time_from_completion_to_merge_seconds)`);
    return 'dry_run';
  }

  try {
    // 1. Fetch
    git(`fetch origin agent/${taskId}:refs/remotes/origin/agent/${taskId} --no-tags`);

    // 2. Create integrate branch
    // Clean up any stale branch from a previous attempt
    const existingBranch = spawnSync(
      'git',
      ['branch', '--list', branchName],
      { cwd: REPO_ROOT, encoding: 'utf-8', stdio: 'pipe' }
    );
    if ((existingBranch.stdout ?? '').trim()) {
      git(`branch -D ${branchName}`);
    }
    git(`checkout -b ${branchName} origin/agent/${taskId}`);

    // 3. Rebase onto origin/main
    const rebaseResult = spawnSync(
      'git',
      ['rebase', 'origin/main'],
      { cwd: REPO_ROOT, encoding: 'utf-8', stdio: 'pipe' }
    );
    if (rebaseResult.status !== 0) {
      const conflictDetails = (rebaseResult.stderr ?? '') + (rebaseResult.stdout ?? '');
      handleR1(taskId, conflictDetails);
      return 'conflict';
    }

    // 4. Detect affected workspaces
    const diffResult = spawnSync(
      'git',
      ['diff', '--name-only', 'origin/main', branchName],
      { cwd: REPO_ROOT, encoding: 'utf-8', stdio: 'pipe' }
    );
    const changedFiles = (diffResult.stdout ?? '').split('\n').filter(Boolean);
    const affectedWorkspaces = detectAffectedWorkspaces(changedFiles);

    // 5. Run scoped validation
    let validationOutput = '';
    let validationPassed = true;

    const runValidation = (cmd, label) => {
      log(`Validation [${label}]: ${cmd}`);
      const result = spawnSync('sh', ['-c', cmd], {
        cwd: REPO_ROOT,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      validationOutput += `\n--- ${label} (exit ${result.status}) ---\n`;
      validationOutput += result.stdout ?? '';
      validationOutput += result.stderr ?? '';
      if (result.status !== 0) {
        validationPassed = false;
        logError(`Validation [${label}] FAILED (exit ${result.status})`);
      }
      return result.status === 0;
    };

    if (affectedWorkspaces.length > 0) {
      const filterArgs = affectedWorkspaces.map((w) => `--filter="${w}"`).join(' ');
      // Check if turbo is available
      const turboCheck = spawnSync('npx', ['turbo', '--version'], {
        cwd: REPO_ROOT,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      if (turboCheck.status === 0) {
        runValidation(`npx turbo typecheck ${filterArgs}`, 'TypeScript');
        runValidation(`npx turbo test ${filterArgs}`, 'Tests');
        runValidation(`npx turbo build ${filterArgs}`, 'Build');
      } else {
        // Fallback to pnpm
        runValidation('pnpm typecheck', 'TypeScript');
        runValidation('pnpm test --run', 'Tests');
        runValidation('pnpm build', 'Build');
      }
    } else {
      log(`No recognized workspace changes detected; running global typecheck + lint.`);
      runValidation('pnpm typecheck', 'TypeScript');
      runValidation('pnpm lint', 'Lint');
    }

    if (!validationPassed) {
      handleR2(taskId, validationOutput);
      return 'validation_failed';
    }

    // 6. Fast-forward merge to main
    git('checkout main');
    git(`merge --ff-only ${branchName}`);

    // 7. Push main + delete remote agent branch
    git('push origin main');
    git(`push origin --delete agent/${taskId}`);

    // 8. Clean up local integrate branch
    git(`branch -d ${branchName}`);

    // 9. Record metrics
    const endTime = Math.floor(Date.now() / 1000);
    const integrationDuration = endTime - startTime;
    const attestationTs = findAttestationTimestamp(taskId);
    const timeFromCompletion = attestationTs ? endTime - attestationTs : null;

    log(`Merged ${taskId} in ${integrationDuration}s` +
      (timeFromCompletion !== null ? ` (${timeFromCompletion}s from attestation)` : ''));

    // 10. Update CSV
    updateCsvColumns(taskId, { branch: '', integrationStatus: 'Merged' });

    return 'merged';
  } catch (err) {
    logError(`Unexpected error integrating ${taskId}: ${err.message}`);
    // Best-effort cleanup: return to main
    spawnSync('git', ['checkout', 'main'], { cwd: REPO_ROOT, stdio: 'inherit' });
    return 'error';
  }
}

// ---------------------------------------------------------------------------
// Main integration pass
// ---------------------------------------------------------------------------

async function runIntegrationPass() {
  const nowEpoch = Math.floor(Date.now() / 1000);

  log('='.repeat(60));
  log(`Integration pass started at ${new Date().toISOString()}`);
  log(`Mode: ${isDryRun ? 'DRY-RUN (no mutations)' : 'REAL (mutations enabled)'}`);
  log('='.repeat(60));

  // 1. List agent branches on origin
  log('Step 1: Listing agent/* branches on origin...');
  const agentBranches = listAgentBranches();
  if (agentBranches.length === 0) {
    log('No agent/* branches found on origin. Nothing to integrate.');
    return;
  }
  log(`Found ${agentBranches.length} agent branch(es): ${agentBranches.map((b) => b.taskId).join(', ')}`);

  // 2. Min-age filter
  log(`Step 2: Applying min-age filter (MIN_BRANCH_AGE_SECONDS=${MIN_BRANCH_AGE_SECONDS})...`);
  const agedBranches = [];
  for (const branch of agentBranches) {
    if (isDryRun) {
      logDry(`Would check age of origin/${branch.remoteBranch} (skip in dry-run)`);
      agedBranches.push(branch);
      continue;
    }
    const ts = getBranchAge(branch.remoteBranch);
    if (ts === null) {
      log(`  Skipping ${branch.taskId}: could not determine branch age`);
      continue;
    }
    const ageSecs = nowEpoch - ts;
    if (ageSecs < MIN_BRANCH_AGE_SECONDS) {
      log(`  Skipping ${branch.taskId}: too young (${ageSecs}s < ${MIN_BRANCH_AGE_SECONDS}s)`);
      continue;
    }
    log(`  ${branch.taskId}: age ${ageSecs}s — OK`);
    agedBranches.push({ ...branch, latestCommitTs: ts });
  }
  if (agedBranches.length === 0) {
    log('All branches filtered by min-age. Nothing to integrate this pass.');
    return;
  }

  // 3. Orphan filter
  log('Step 3: Applying orphan filter...');
  const orphanIds = loadOrphanedTaskIds();
  const filteredBranches = agedBranches.filter((b) => {
    if (orphanIds.has(b.taskId)) {
      log(`  Skipping ${b.taskId}: already triaged as orphan`);
      return false;
    }
    return true;
  });
  if (filteredBranches.length === 0) {
    log('All branches filtered as orphans. Nothing to integrate this pass.');
    return;
  }

  // 4. Sort by dependency-graph topological order
  log('Step 4: Sorting by dependency-graph topological order...');
  const graph = loadDependencyGraph();
  const topoOrder = getTopologicalOrder(graph);
  const topoIndex = new Map(topoOrder.map((id, i) => [id, i]));

  const sortedBranches = [...filteredBranches].sort((a, b) => {
    const ia = topoIndex.get(a.taskId) ?? Infinity;
    const ib = topoIndex.get(b.taskId) ?? Infinity;
    return ia - ib;
  });

  if (isDryRun) {
    log('Step 5 (DRY-RUN): Planned integration order:');
    for (let i = 0; i < sortedBranches.length; i++) {
      const { taskId } = sortedBranches[i];
      const pos = topoIndex.get(taskId);
      logDry(
        `  [${i + 1}] ${taskId} (topo-pos: ${pos !== undefined ? pos : 'unknown'}) ` +
          `→ rebase origin/main → scoped validation → fast-forward merge`
      );
    }
    log('Step 6 (DRY-RUN): No mutations performed.');
    log('='.repeat(60));
    log('DRY-RUN complete. Pass --no-dry-run to execute real integrations.');
    log('='.repeat(60));
    return;
  }

  // 5. Integrate each branch
  log(`Step 5: Integrating ${sortedBranches.length} branch(es)...`);
  const results = { merged: 0, conflict: 0, validation_failed: 0, error: 0, skipped: 0 };

  for (const branch of sortedBranches) {
    const outcome = integrateBranch(branch.taskId);
    results[outcome] = (results[outcome] ?? 0) + 1;
  }

  log('='.repeat(60));
  log('Integration pass complete.');
  log(`  merged:           ${results.merged}`);
  log(`  conflict (R1):    ${results.conflict}`);
  log(`  validation (R2):  ${results.validation_failed}`);
  log(`  errors:           ${results.error}`);
  log('='.repeat(60));
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

log(`integrate.mjs starting — mode: ${isDryRun ? '--dry-run' : '--no-dry-run'}, loop: ${isWatch ? '--watch' : '--once'}`);

if (isWatch) {
  // Watch mode: loop every 60s
  (async () => {
    while (true) {
      await runIntegrationPass().catch((err) => logError(`Pass error: ${err.message}`));
      log(`Waiting ${WATCH_INTERVAL_MS / 1000}s before next pass...`);
      await new Promise((resolve) => setTimeout(resolve, WATCH_INTERVAL_MS));
    }
  })();
} else {
  // Once mode (default)
  runIntegrationPass()
    .then(() => process.exit(0))
    .catch((err) => {
      logError(err.message);
      process.exit(1);
    });
}
