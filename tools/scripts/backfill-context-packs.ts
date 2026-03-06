/**
 * Backfill Context Packs for Completed Tasks
 *
 * Scans Sprint_plan.csv for all Completed tasks, checks if context_pack.md
 * exists at the canonical sprint-based path, and generates it if missing.
 *
 * Usage: npx tsx tools/scripts/backfill-context-packs.ts [--dry-run]
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildContextPack, generateRunId } from './lib/context-pack-builder.js';
import { findRepoRoot, resolveSprintPlanPath, parseSprintCsv } from './lib/validation-utils.js';

const dryRun = process.argv.includes('--dry-run');
const repoRoot = findRepoRoot();
const csvPath = resolveSprintPlanPath(repoRoot);

if (!csvPath) {
  console.error('Sprint_plan.csv not found');
  process.exit(1);
}

const csvContent = readFileSync(csvPath, 'utf-8');
const { tasks, errors } = parseSprintCsv(csvContent);

if (errors.length > 0) {
  console.error('CSV parse errors:', errors);
  process.exit(1);
}

console.log(`Found ${tasks.length} total tasks`);
console.log(dryRun ? '=== DRY RUN ===' : '=== GENERATING ===');
console.log('');

let generated = 0;
let skipped = 0;
let alreadyExists = 0;
let failed = 0;

for (const task of tasks) {
  const taskId = task['Task ID'];
  const status = task['Status'];
  const sprintStr = task['Target Sprint'];

  // Only process completed tasks
  if (status !== 'Completed') {
    skipped++;
    continue;
  }

  const sprintNumber = parseInt(sprintStr || '0', 10);
  if (isNaN(sprintNumber)) {
    skipped++;
    continue;
  }

  // Check if context_pack.md already exists
  const packPath = join(
    repoRoot,
    '.specify',
    'sprints',
    `sprint-${sprintNumber}`,
    'attestations',
    taskId,
    'context_pack.md'
  );

  if (existsSync(packPath)) {
    alreadyExists++;
    continue;
  }

  // Check if task has FILE: prerequisites (no prereqs = empty pack, still worth creating)
  const prereqs = task['Pre-requisites'] || '';
  const hasFilePrereqs = prereqs.includes('FILE:');

  if (dryRun) {
    console.log(
      `  [WOULD GENERATE] ${taskId} (sprint-${sprintNumber}) ${hasFilePrereqs ? '' : '(no FILE: prereqs)'}`
    );
    generated++;
    continue;
  }

  const runId = generateRunId(taskId);
  const result = buildContextPack(taskId, runId, repoRoot, { backfilled: true });

  if (result.success) {
    generated++;
    const fileCount = result.manifest.files.filter((f) => f.included).length;
    console.log(`  [OK] ${taskId} → sprint-${sprintNumber} (${fileCount} files)`);
  } else {
    failed++;
    console.error(`  [FAIL] ${taskId}: ${result.errors.join(', ')}`);
  }
}

console.log('');
console.log('=== Summary ===');
console.log(`  Generated:      ${generated}`);
console.log(`  Already exists:  ${alreadyExists}`);
console.log(`  Skipped (non-completed): ${skipped}`);
console.log(`  Failed:          ${failed}`);
