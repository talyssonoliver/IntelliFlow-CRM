#!/usr/bin/env npx tsx
/**
 * Migration Script: Move old task-based .specify/{TASK_ID}/ folders to sprint-based structure
 *
 * Migrates from:
 *   .specify/{TASK_ID}/context/       -> .specify/sprints/sprint-{N}/context/{TASK_ID}/
 *   .specify/{TASK_ID}/specifications/ -> .specify/sprints/sprint-{N}/specifications/
 *   .specify/{TASK_ID}/planning/      -> .specify/sprints/sprint-{N}/planning/
 *
 * Usage:
 *   npx tsx tools/scripts/migrate-specify-to-sprints.ts [--dry-run] [--verbose]
 */

import { join, dirname, basename } from 'node:path';
import { existsSync, readdirSync, statSync, mkdirSync, renameSync, rmSync, copyFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';

// Configuration
const PROJECT_ROOT = join(__dirname, '..', '..');
const SPECIFY_DIR = join(PROJECT_ROOT, '.specify');
const SPRINTS_DIR = join(SPECIFY_DIR, 'sprints');
const SPRINT_PLAN_CSV = join(PROJECT_ROOT, 'apps', 'project-tracker', 'docs', 'metrics', '_global', 'Sprint_plan.csv');

// CLI flags
const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function log(message: string, color: keyof typeof colors = 'reset'): void {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logVerbose(message: string): void {
  if (VERBOSE) {
    console.log(`${colors.dim}  ${message}${colors.reset}`);
  }
}

interface TaskRecord {
  'Task ID': string;
  'Target Sprint': string;
  [key: string]: string;
}

interface MigrationResult {
  taskId: string;
  targetSprint: number;
  filesMoved: number;
  filesSkipped: number;
  errors: string[];
}

/**
 * Load task -> sprint mapping from Sprint_plan.csv
 */
function loadTaskSprintMapping(): Map<string, number> {
  const csvContent = readFileSync(SPRINT_PLAN_CSV, 'utf-8');
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
  }) as TaskRecord[];

  const mapping = new Map<string, number>();
  for (const record of records) {
    const taskId = record['Task ID'];
    const sprintStr = record['Target Sprint'];

    // Handle "Continuous" or empty values
    if (!sprintStr || sprintStr === 'Continuous') {
      // Default to sprint-0 for continuous tasks
      mapping.set(taskId, 0);
    } else {
      const sprint = parseInt(sprintStr, 10);
      if (!isNaN(sprint)) {
        mapping.set(taskId, sprint);
      }
    }
  }

  log(`Loaded ${mapping.size} task-to-sprint mappings from CSV`, 'cyan');
  return mapping;
}

/**
 * Find old task-based folders in .specify/ (exclude sprints/, memory/, etc.)
 */
function findOldTaskFolders(): string[] {
  const entries = readdirSync(SPECIFY_DIR);
  const taskFolders: string[] = [];

  for (const entry of entries) {
    const fullPath = join(SPECIFY_DIR, entry);

    // Skip non-directories
    if (!statSync(fullPath).isDirectory()) continue;

    // Skip known utility folders
    if (['sprints', 'memory', 'planning', 'specifications'].includes(entry)) continue;

    // Match task ID patterns (IFC-XXX, PG-XXX, ENV-XXX-AI, etc.)
    if (/^[A-Z]+-\d+(-[A-Z]+)?$/.test(entry)) {
      taskFolders.push(entry);
    }
  }

  return taskFolders;
}

/**
 * Ensure target directory exists
 */
function ensureDir(dir: string): void {
  if (!DRY_RUN && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    logVerbose(`Created directory: ${dir}`);
  }
}

/**
 * Move or copy a file to new location
 */
function moveFile(src: string, dest: string): boolean {
  if (!existsSync(src)) {
    logVerbose(`Source not found: ${src}`);
    return false;
  }

  if (existsSync(dest)) {
    logVerbose(`Destination exists, skipping: ${dest}`);
    return false;
  }

  if (DRY_RUN) {
    logVerbose(`[DRY-RUN] Would move: ${basename(src)} -> ${dest}`);
    return true;
  }

  try {
    ensureDir(dirname(dest));
    // Use copy + delete instead of rename (works across filesystems)
    copyFileSync(src, dest);
    logVerbose(`Moved: ${basename(src)}`);
    return true;
  } catch (error) {
    log(`  Error moving ${src}: ${error}`, 'red');
    return false;
  }
}

/**
 * Migrate a single task folder to sprint-based location
 */
function migrateTask(taskId: string, targetSprint: number): MigrationResult {
  const result: MigrationResult = {
    taskId,
    targetSprint,
    filesMoved: 0,
    filesSkipped: 0,
    errors: [],
  };

  const oldBase = join(SPECIFY_DIR, taskId);
  const newSprintDir = join(SPRINTS_DIR, `sprint-${targetSprint}`);

  if (!existsSync(oldBase)) {
    result.errors.push(`Old folder not found: ${oldBase}`);
    return result;
  }

  log(`\nMigrating ${taskId} -> sprint-${targetSprint}`, 'cyan');

  // 1. Migrate context files
  const oldContext = join(oldBase, 'context');
  if (existsSync(oldContext)) {
    const newContext = join(newSprintDir, 'context', taskId);
    ensureDir(newContext);

    for (const file of readdirSync(oldContext)) {
      const src = join(oldContext, file);
      if (statSync(src).isFile()) {
        const dest = join(newContext, file);
        if (moveFile(src, dest)) {
          result.filesMoved++;
        } else {
          result.filesSkipped++;
        }
      }
    }
  }

  // 2. Migrate specification files
  const oldSpecs = join(oldBase, 'specifications');
  if (existsSync(oldSpecs)) {
    const newSpecs = join(newSprintDir, 'specifications');
    ensureDir(newSpecs);

    for (const file of readdirSync(oldSpecs)) {
      const src = join(oldSpecs, file);
      if (statSync(src).isFile()) {
        const dest = join(newSpecs, file);
        if (moveFile(src, dest)) {
          result.filesMoved++;
        } else {
          result.filesSkipped++;
        }
      }
    }
  }

  // 3. Migrate planning files
  const oldPlanning = join(oldBase, 'planning');
  if (existsSync(oldPlanning)) {
    const newPlanning = join(newSprintDir, 'planning');
    ensureDir(newPlanning);

    for (const file of readdirSync(oldPlanning)) {
      const src = join(oldPlanning, file);
      if (statSync(src).isFile()) {
        const dest = join(newPlanning, file);
        if (moveFile(src, dest)) {
          result.filesMoved++;
        } else {
          result.filesSkipped++;
        }
      }
    }
  }

  // 4. Remove old directory (if not dry run and all files moved)
  if (!DRY_RUN && result.errors.length === 0) {
    try {
      rmSync(oldBase, { recursive: true });
      log(`  Removed old folder: ${oldBase}`, 'dim');
    } catch (error) {
      result.errors.push(`Failed to remove old folder: ${error}`);
    }
  }

  return result;
}

/**
 * Clean up empty root directories
 */
function cleanupEmptyDirs(): void {
  const emptyDirs = ['planning', 'specifications'];

  for (const dir of emptyDirs) {
    const fullPath = join(SPECIFY_DIR, dir);
    if (existsSync(fullPath)) {
      try {
        const contents = readdirSync(fullPath);
        if (contents.length === 0) {
          if (DRY_RUN) {
            log(`[DRY-RUN] Would remove empty dir: ${fullPath}`, 'yellow');
          } else {
            rmSync(fullPath, { recursive: true });
            log(`Removed empty directory: ${dir}`, 'dim');
          }
        }
      } catch (error) {
        log(`Error checking/removing ${dir}: ${error}`, 'red');
      }
    }
  }
}

/**
 * Main migration function
 */
async function main(): Promise<void> {
  log('\n========================================', 'cyan');
  log(' .specify/ Migration to Sprint Structure', 'cyan');
  log('========================================\n', 'cyan');

  if (DRY_RUN) {
    log('DRY RUN MODE - No changes will be made\n', 'yellow');
  }

  // Load mappings
  const taskSprintMap = loadTaskSprintMapping();

  // Find old task folders
  const oldFolders = findOldTaskFolders();
  log(`Found ${oldFolders.length} old task-based folders to migrate:`, 'cyan');
  for (const folder of oldFolders) {
    const sprint = taskSprintMap.get(folder) ?? 0;
    log(`  - ${folder} -> sprint-${sprint}`, 'dim');
  }

  // Migrate each folder
  const results: MigrationResult[] = [];
  for (const taskId of oldFolders) {
    const targetSprint = taskSprintMap.get(taskId);
    if (targetSprint === undefined) {
      log(`\nWARNING: No sprint mapping for ${taskId}, defaulting to sprint-0`, 'yellow');
    }
    const result = migrateTask(taskId, targetSprint ?? 0);
    results.push(result);
  }

  // Cleanup empty directories
  log('\nCleaning up empty directories...', 'cyan');
  cleanupEmptyDirs();

  // Summary
  log('\n========================================', 'cyan');
  log(' Migration Summary', 'cyan');
  log('========================================\n', 'cyan');

  let totalMoved = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const result of results) {
    const status = result.errors.length === 0 ? colors.green + 'OK' : colors.red + 'ERRORS';
    log(`${result.taskId}: ${result.filesMoved} moved, ${result.filesSkipped} skipped ${status}${colors.reset}`);
    if (result.errors.length > 0) {
      for (const error of result.errors) {
        log(`  - ${error}`, 'red');
      }
    }
    totalMoved += result.filesMoved;
    totalSkipped += result.filesSkipped;
    totalErrors += result.errors.length;
  }

  log(`\nTotal: ${totalMoved} files moved, ${totalSkipped} skipped, ${totalErrors} errors`, 'cyan');

  if (DRY_RUN) {
    log('\nTo execute migration, run without --dry-run flag', 'yellow');
  }
}

main().catch(console.error);
