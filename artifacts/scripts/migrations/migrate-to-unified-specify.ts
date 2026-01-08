#!/usr/bin/env npx tsx
/**
 * Migration Script: Move artifacts to unified .specify/{TASK_ID}/ structure
 *
 * All files in the new structure are prefixed with {TASK_ID}- for self-identification.
 *
 * Migrates from:
 *   artifacts/attestations/{TASK_ID}/context_ack.json -> .specify/{TASK_ID}/attestations/{TASK_ID}-context_ack.json
 *   artifacts/attestations/{TASK_ID}/context_pack.md -> .specify/{TASK_ID}/attestations/{TASK_ID}-context_pack.md
 *   .specify/specifications/{TASK_ID}-spec.md -> .specify/{TASK_ID}/specifications/{TASK_ID}-spec.md
 *   .specify/planning/{TASK_ID}-plan.md -> .specify/{TASK_ID}/planning/{TASK_ID}-plan.md
 *   .specify/context/{TASK_ID}/hydrated-context.md -> .specify/{TASK_ID}/context/{TASK_ID}-hydrated-context.md
 *
 * Usage:
 *   npx tsx tools/scripts/migrate-to-unified-specify.ts [--dry-run] [--verbose]
 */

import { existsSync, readdirSync, mkdirSync, copyFileSync, rmSync, renameSync, statSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
/**
 * Find the repository root by looking for package.json
 */
function findRepoRoot(): string {
  let dir = process.cwd();
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, 'package.json'))) {
      return dir;
    }
    dir = dirname(dir);
  }
  return process.cwd();
}

interface MigrationResult {
  taskId: string;
  attestationsMoved: boolean;
  specMoved: boolean;
  planMoved: boolean;
  contextMoved: boolean;
  errors: string[];
}

interface MigrationSummary {
  total: number;
  migrated: number;
  skipped: number;
  errors: number;
  results: MigrationResult[];
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose');

function log(message: string, alwaysShow = false): void {
  if (verbose || alwaysShow) {
    console.log(message);
  }
}

function logError(message: string): void {
  console.error(`[ERROR] ${message}`);
}

function logSuccess(message: string): void {
  console.log(`[SUCCESS] ${message}`);
}

function logWarning(message: string): void {
  console.log(`[WARNING] ${message}`);
}

/**
 * Ensure directory exists
 */
function ensureDir(dir: string): void {
  if (!dryRun) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Copy a file to new location
 */
function copyFile(src: string, dest: string): boolean {
  if (!existsSync(src)) {
    return false;
  }

  if (dryRun) {
    log(`  [DRY-RUN] Would copy: ${src} -> ${dest}`);
    return true;
  }

  try {
    ensureDir(dirname(dest));
    copyFileSync(src, dest);
    log(`  Copied: ${src} -> ${dest}`);
    return true;
  } catch (error) {
    logError(`Failed to copy ${src}: ${error}`);
    return false;
  }
}

/**
 * Move a file to new location (copy + delete)
 */
function moveFile(src: string, dest: string): boolean {
  if (!existsSync(src)) {
    return false;
  }

  if (dryRun) {
    log(`  [DRY-RUN] Would move: ${src} -> ${dest}`);
    return true;
  }

  try {
    ensureDir(dirname(dest));
    copyFileSync(src, dest);
    rmSync(src);
    log(`  Moved: ${src} -> ${dest}`);
    return true;
  } catch (error) {
    logError(`Failed to move ${src}: ${error}`);
    return false;
  }
}

/**
 * Move a directory to new location
 */
function moveDirectory(src: string, dest: string): boolean {
  if (!existsSync(src)) {
    return false;
  }

  if (dryRun) {
    log(`  [DRY-RUN] Would move directory: ${src} -> ${dest}`);
    return true;
  }

  try {
    ensureDir(dirname(dest));

    // Copy all files recursively
    const files = readdirSync(src, { recursive: true, withFileTypes: true });
    for (const file of files) {
      if (file.isFile()) {
        const relativePath = file.path ? join(file.path, file.name).replace(src, '') : file.name;
        const srcFile = join(src, relativePath);
        const destFile = join(dest, relativePath);
        ensureDir(dirname(destFile));
        copyFileSync(srcFile, destFile);
      }
    }

    // Remove source directory
    rmSync(src, { recursive: true });
    log(`  Moved directory: ${src} -> ${dest}`);
    return true;
  } catch (error) {
    logError(`Failed to move directory ${src}: ${error}`);
    return false;
  }
}

/**
 * Get all task IDs from various sources
 */
function discoverTaskIds(repoRoot: string): Set<string> {
  const taskIds = new Set<string>();

  // From artifacts/attestations/
  const attestationsDir = join(repoRoot, 'artifacts', 'attestations');
  if (existsSync(attestationsDir)) {
    const entries = readdirSync(attestationsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        taskIds.add(entry.name);
      }
    }
  }

  // From .specify/specifications/
  const specificationsDir = join(repoRoot, '.specify', 'specifications');
  if (existsSync(specificationsDir)) {
    const files = readdirSync(specificationsDir);
    for (const file of files) {
      // Handle both {TASK_ID}-spec.md and {TASK_ID}.md
      const match = file.match(/^(.+?)(?:-spec)?\.md$/);
      if (match) {
        taskIds.add(match[1]);
      }
    }
  }

  // From .specify/planning/
  const planningDir = join(repoRoot, '.specify', 'planning');
  if (existsSync(planningDir)) {
    const files = readdirSync(planningDir);
    for (const file of files) {
      // Handle both {TASK_ID}-plan.md and {TASK_ID}.md
      const match = file.match(/^(.+?)(?:-plan)?\.md$/);
      if (match) {
        taskIds.add(match[1]);
      }
    }
  }

  // From .specify/context/
  const contextDir = join(repoRoot, '.specify', 'context');
  if (existsSync(contextDir)) {
    const entries = readdirSync(contextDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        taskIds.add(entry.name);
      }
    }
  }

  return taskIds;
}

/**
 * Migrate a single task to unified structure
 */
function migrateTask(taskId: string, repoRoot: string): MigrationResult {
  const result: MigrationResult = {
    taskId,
    attestationsMoved: false,
    specMoved: false,
    planMoved: false,
    contextMoved: false,
    errors: [],
  };

  const specifyDir = join(repoRoot, '.specify');
  const taskDir = join(specifyDir, taskId);

  // Check if already migrated (task directory exists with new structure)
  const newAttestationsDir = join(taskDir, 'attestations');
  const newSpecificationsDir = join(taskDir, 'specifications');
  const newPlanningDir = join(taskDir, 'planning');
  const newContextDir = join(taskDir, 'context');
  const newEvidenceDir = join(taskDir, 'evidence');

  // Create task directory structure
  ensureDir(taskDir);
  ensureDir(newAttestationsDir);
  ensureDir(newSpecificationsDir);
  ensureDir(newPlanningDir);
  ensureDir(newContextDir);
  ensureDir(newEvidenceDir);

  // 1. Migrate attestations from artifacts/attestations/{TASK_ID}/
  // Files are renamed to include {TASK_ID}- prefix
  const legacyAttestationsDir = join(repoRoot, 'artifacts', 'attestations', taskId);
  if (existsSync(legacyAttestationsDir)) {
    const files = readdirSync(legacyAttestationsDir);
    let moved = 0;
    for (const file of files) {
      const src = join(legacyAttestationsDir, file);

      // Rename file to include taskId prefix if not already prefixed
      const newFileName = file.startsWith(`${taskId}-`) ? file : `${taskId}-${file}`;
      const dest = join(newAttestationsDir, newFileName);

      // Skip if already exists in new location
      if (existsSync(dest)) {
        log(`  Skipping (already exists): ${dest}`);
        continue;
      }

      if (statSync(src).isFile()) {
        if (copyFile(src, dest)) {
          moved++;
        }
      }
    }

    if (moved > 0) {
      result.attestationsMoved = true;
      log(`  Migrated ${moved} attestation files for ${taskId}`);
    }
  }

  // 2. Migrate specification from .specify/specifications/{TASK_ID}-spec.md or {TASK_ID}.md
  // New location uses {TASK_ID}-spec.md naming
  const specSources = [
    join(specifyDir, 'specifications', `${taskId}-spec.md`),
    join(specifyDir, 'specifications', `${taskId}.md`),
  ];
  const specDest = join(newSpecificationsDir, `${taskId}-spec.md`);

  if (!existsSync(specDest)) {
    for (const specSrc of specSources) {
      if (existsSync(specSrc)) {
        if (copyFile(specSrc, specDest)) {
          result.specMoved = true;
          break;
        }
      }
    }
  }

  // 3. Migrate plan from .specify/planning/{TASK_ID}-plan.md or {TASK_ID}.md
  // New location uses {TASK_ID}-plan.md naming
  const planSources = [
    join(specifyDir, 'planning', `${taskId}-plan.md`),
    join(specifyDir, 'planning', `${taskId}.md`),
  ];
  const planDest = join(newPlanningDir, `${taskId}-plan.md`);

  if (!existsSync(planDest)) {
    for (const planSrc of planSources) {
      if (existsSync(planSrc)) {
        if (copyFile(planSrc, planDest)) {
          result.planMoved = true;
          break;
        }
      }
    }
  }

  // 4. Migrate context from .specify/context/{TASK_ID}/
  // Files are renamed to include {TASK_ID}- prefix
  const legacyContextDir = join(specifyDir, 'context', taskId);
  if (existsSync(legacyContextDir)) {
    const files = readdirSync(legacyContextDir);
    let moved = 0;
    for (const file of files) {
      const src = join(legacyContextDir, file);

      // Rename file to include taskId prefix if not already prefixed
      const newFileName = file.startsWith(`${taskId}-`) ? file : `${taskId}-${file}`;
      const dest = join(newContextDir, newFileName);

      // Skip if already exists in new location
      if (existsSync(dest)) {
        log(`  Skipping (already exists): ${dest}`);
        continue;
      }

      if (statSync(src).isFile()) {
        if (copyFile(src, dest)) {
          moved++;
        }
      }
    }

    if (moved > 0) {
      result.contextMoved = true;
      log(`  Migrated ${moved} context files for ${taskId}`);
    }
  }

  return result;
}

/**
 * Main migration function
 */
async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('MATOP Path Structure Migration');
  console.log('='.repeat(60));

  if (dryRun) {
    console.log('\n[DRY-RUN MODE] No files will be modified.\n');
  }

  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    logError('Could not find repository root');
    process.exit(1);
  }

  console.log(`Repository root: ${repoRoot}`);
  console.log('');

  // Discover all task IDs
  console.log('Discovering task IDs...');
  const taskIds = discoverTaskIds(repoRoot);
  console.log(`Found ${taskIds.size} tasks to potentially migrate.`);
  console.log('');

  if (taskIds.size === 0) {
    console.log('No tasks found to migrate.');
    return;
  }

  // Migrate each task
  const summary: MigrationSummary = {
    total: taskIds.size,
    migrated: 0,
    skipped: 0,
    errors: 0,
    results: [],
  };

  console.log('Migrating tasks...');
  console.log('-'.repeat(60));

  for (const taskId of taskIds) {
    log(`\nMigrating: ${taskId}`, true);

    const result = migrateTask(taskId, repoRoot);
    summary.results.push(result);

    const wasMigrated =
      result.attestationsMoved || result.specMoved || result.planMoved || result.contextMoved;

    if (wasMigrated) {
      summary.migrated++;
      const parts: string[] = [];
      if (result.attestationsMoved) parts.push('attestations');
      if (result.specMoved) parts.push('spec');
      if (result.planMoved) parts.push('plan');
      if (result.contextMoved) parts.push('context');
      logSuccess(`${taskId}: Migrated ${parts.join(', ')}`);
    } else {
      summary.skipped++;
      log(`  ${taskId}: Already migrated or nothing to migrate`, verbose);
    }

    if (result.errors.length > 0) {
      summary.errors++;
      for (const error of result.errors) {
        logError(`  ${error}`);
      }
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('Migration Summary');
  console.log('='.repeat(60));
  console.log(`Total tasks:      ${summary.total}`);
  console.log(`Migrated:         ${summary.migrated}`);
  console.log(`Skipped:          ${summary.skipped}`);
  console.log(`With errors:      ${summary.errors}`);

  if (dryRun) {
    console.log('\n[DRY-RUN] No files were actually modified.');
    console.log('Run without --dry-run to perform the migration.');
  } else {
    console.log('\nMigration complete.');
    console.log('\nNote: Legacy files have been copied (not deleted).');
    console.log('Review the migration results, then manually delete legacy directories:');
    console.log('  - artifacts/attestations/ (individual task folders)');
    console.log('  - .specify/specifications/ (task spec files)');
    console.log('  - .specify/planning/ (task plan files)');
    console.log('  - .specify/context/ (task context directories)');
  }
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
