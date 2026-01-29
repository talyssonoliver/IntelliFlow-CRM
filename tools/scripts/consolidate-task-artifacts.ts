#!/usr/bin/env npx tsx
/**
 * Consolidate Task Artifacts Script
 *
 * This script:
 * 1. Moves scattered validation files to attestation folders
 * 2. Cleans up orphaned sprint directories
 * 3. Creates missing sprint directories based on CSV
 * 4. Reports on file organization status
 *
 * Usage: npx tsx tools/scripts/consolidate-task-artifacts.ts [--dry-run]
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { join, dirname, basename } from 'node:path';
import Papa from 'papaparse';

// Get repo root - handle Windows path conversion
const fileUrl = new URL(import.meta.url);
const scriptPath =
  process.platform === 'win32'
    ? fileUrl.pathname.replace(/^\/([A-Za-z]):/, '$1:')
    : fileUrl.pathname;
const REPO_ROOT = join(dirname(scriptPath), '..', '..');

const ATTESTATIONS_DIR = join(REPO_ROOT, 'artifacts', 'attestations');
const METRICS_DIR = join(REPO_ROOT, 'apps', 'project-tracker', 'docs', 'metrics');
const VALIDATION_DIR = join(REPO_ROOT, 'artifacts', 'reports', 'validation');
const CSV_PATH = join(METRICS_DIR, '_global', 'Sprint_plan.csv');

const isDryRun = process.argv.includes('--dry-run');

function log(message: string): void {
  console.log(`${isDryRun ? '[DRY-RUN] ' : ''}${message}`);
}

/** Raw CSV row from Papa parse */
interface RawCSVRow {
  'Task ID'?: string;
  'Target Sprint'?: string;
  Status?: string;
  [key: string]: string | undefined;
}

interface SprintInfo {
  sprintNumber: number;
  taskCount: number;
  tasks: string[];
}

function loadSprintInfo(): Map<number, SprintInfo> {
  const sprints = new Map<number, SprintInfo>();

  if (!existsSync(CSV_PATH)) {
    console.error(`CSV not found: ${CSV_PATH}`);
    return sprints;
  }

  const csvContent = readFileSync(CSV_PATH, 'utf-8');
  const { data } = Papa.parse(csvContent, { header: true, skipEmptyLines: true });

  for (const row of data as RawCSVRow[]) {
    const taskId = row['Task ID'];
    const sprintRaw = row['Target Sprint'];
    if (!taskId || !sprintRaw) continue;

    const sprintNum = parseInt(sprintRaw, 10);
    if (isNaN(sprintNum) || sprintNum < 0) continue;

    if (!sprints.has(sprintNum)) {
      sprints.set(sprintNum, { sprintNumber: sprintNum, taskCount: 0, tasks: [] });
    }

    const sprint = sprints.get(sprintNum)!;
    sprint.taskCount++;
    sprint.tasks.push(taskId);
  }

  return sprints;
}

function moveValidationFiles(): { moved: number; skipped: number } {
  log('\n=== Moving Scattered Validation Files ===');
  let moved = 0;
  let skipped = 0;

  if (!existsSync(VALIDATION_DIR)) {
    log('No validation directory found - skipping');
    return { moved, skipped };
  }

  const files = readdirSync(VALIDATION_DIR).filter((f) => f.endsWith('.json'));

  for (const file of files) {
    // Extract task ID from filename like "validation-ENV-007-AI.json"
    const match = file.match(/^validation-([A-Z]+-[A-Z0-9-]+)\.json$/);
    if (!match) {
      log(`  Skipped ${file}: doesn't match pattern`);
      skipped++;
      continue;
    }

    const taskId = match[1];
    const sourcePath = join(VALIDATION_DIR, file);
    const targetDir = join(ATTESTATIONS_DIR, taskId);
    const targetPath = join(targetDir, 'validation.json');

    // Create target directory if needed
    if (!existsSync(targetDir)) {
      if (!isDryRun) {
        mkdirSync(targetDir, { recursive: true });
      }
      log(`  Created ${taskId}/`);
    }

    // Skip if already exists
    if (existsSync(targetPath)) {
      log(`  Skipped ${file}: already exists in attestation folder`);
      skipped++;
      continue;
    }

    if (!isDryRun) {
      copyFileSync(sourcePath, targetPath);
    }
    log(`  Moved ${file} → ${taskId}/validation.json`);
    moved++;
  }

  return { moved, skipped };
}

function cleanupOrphanedSprintDirs(validSprints: Map<number, SprintInfo>): {
  removed: string[];
  kept: string[];
} {
  log('\n=== Cleaning Up Sprint Directories ===');
  const removed: string[] = [];
  const kept: string[] = [];

  // Get existing sprint directories
  const entries = readdirSync(METRICS_DIR, { withFileTypes: true });
  const sprintDirs = entries
    .filter((e) => e.isDirectory() && e.name.startsWith('sprint-'))
    .map((e) => e.name);

  for (const dir of sprintDirs) {
    const match = dir.match(/^sprint-(\d+)$/);
    if (!match) continue;

    const sprintNum = parseInt(match[1], 10);
    const sprintInfo = validSprints.get(sprintNum);

    if (!sprintInfo) {
      log(`  Remove ${dir}: no tasks in CSV for this sprint`);
      if (!isDryRun) {
        rmSync(join(METRICS_DIR, dir), { recursive: true, force: true });
      }
      removed.push(dir);
      continue;
    }

    // Check if sprint directory is mostly empty (orphaned)
    const dirPath = join(METRICS_DIR, dir);
    const contents = readdirSync(dirPath, { withFileTypes: true });
    const taskFiles = contents.filter(
      (c) => c.isFile() && c.name.endsWith('.json') && !c.name.startsWith('_')
    );

    // If less than 10% of tasks have files, might be orphaned
    const coverage = taskFiles.length / sprintInfo.taskCount;
    if (coverage < 0.1 && sprintNum > 2) {
      log(
        `  Remove ${dir}: only ${taskFiles.length}/${sprintInfo.taskCount} tasks (${Math.round(coverage * 100)}% coverage)`
      );
      if (!isDryRun) {
        rmSync(dirPath, { recursive: true, force: true });
      }
      removed.push(dir);
    } else {
      log(`  Keep ${dir}: ${taskFiles.length}/${sprintInfo.taskCount} tasks`);
      kept.push(dir);
    }
  }

  return { removed, kept };
}

function createMissingSprintDirs(
  validSprints: Map<number, SprintInfo>,
  existingDirs: string[]
): string[] {
  log('\n=== Creating Missing Sprint Directories ===');
  const created: string[] = [];

  // Only create sequential sprint directories up to the highest existing one
  const existingNums = existingDirs
    .map((d) => parseInt(d.replace('sprint-', ''), 10))
    .filter((n) => !isNaN(n));
  const maxExisting = Math.max(...existingNums, 0);

  for (let i = 0; i <= maxExisting; i++) {
    const dirName = `sprint-${i}`;
    const dirPath = join(METRICS_DIR, dirName);

    if (!existsSync(dirPath) && validSprints.has(i)) {
      log(`  Create ${dirName}: ${validSprints.get(i)!.taskCount} tasks in CSV`);
      if (!isDryRun) {
        mkdirSync(dirPath, { recursive: true });
        // Create empty summary
        const summaryPath = join(dirPath, '_summary.json');
        writeFileSync(
          summaryPath,
          JSON.stringify(
            {
              sprint: dirName,
              name: `Sprint ${i}`,
              target_date: null,
              started_at: null,
              completed_at: null,
              phases: [],
              task_summary: {
                total: validSprints.get(i)!.taskCount,
                done: 0,
                in_progress: 0,
                blocked: 0,
                not_started: validSprints.get(i)!.taskCount,
                failed: 0,
              },
              notes: `Sprint ${i} - initialized`,
            },
            null,
            2
          ),
          'utf-8'
        );
      }
      created.push(dirName);
    }
  }

  return created;
}

function moveMisplacedTaskFiles(sprints: Map<number, SprintInfo>): {
  moved: number;
  errors: string[];
} {
  log('\n=== Moving Misplaced Task Files ===');
  let moved = 0;
  const errors: string[] = [];

  // Build task-to-sprint mapping
  const taskToSprint = new Map<string, number>();
  for (const [sprintNum, info] of sprints) {
    for (const taskId of info.tasks) {
      taskToSprint.set(taskId, sprintNum);
    }
  }

  // Scan all sprint directories for misplaced files
  const sprintDirs = readdirSync(METRICS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('sprint-'))
    .map((e) => e.name);

  for (const sprintDir of sprintDirs) {
    const currentSprint = parseInt(sprintDir.replace('sprint-', ''), 10);
    const dirPath = join(METRICS_DIR, sprintDir);

    // Find all task files recursively
    const findTaskFiles = (dir: string): { path: string; taskId: string }[] => {
      const results: { path: string; taskId: string }[] = [];
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...findTaskFiles(fullPath));
        } else if (entry.name.endsWith('.json') && !entry.name.startsWith('_')) {
          const taskId = entry.name.replace('.json', '');
          results.push({ path: fullPath, taskId });
        }
      }
      return results;
    };

    const taskFiles = findTaskFiles(dirPath);

    for (const { path: filePath, taskId } of taskFiles) {
      const correctSprint = taskToSprint.get(taskId);
      if (correctSprint === undefined) {
        log(`  Warning: ${taskId} not found in CSV`);
        continue;
      }

      if (correctSprint !== currentSprint) {
        const targetDir = join(METRICS_DIR, `sprint-${correctSprint}`);
        const targetPath = join(targetDir, `${taskId}.json`);

        // Ensure target directory exists
        if (!existsSync(targetDir)) {
          if (!isDryRun) {
            mkdirSync(targetDir, { recursive: true });
          }
        }

        // Move the file
        if (!isDryRun) {
          try {
            copyFileSync(filePath, targetPath);
            rmSync(filePath);
            log(`  Moved ${taskId}.json: sprint-${currentSprint} → sprint-${correctSprint}`);
            moved++;
          } catch (err) {
            errors.push(`Failed to move ${taskId}: ${err}`);
          }
        } else {
          log(`  Move ${taskId}.json: sprint-${currentSprint} → sprint-${correctSprint}`);
          moved++;
        }
      }
    }
  }

  return { moved, errors };
}

function generateReport(sprints: Map<number, SprintInfo>): void {
  log('\n=== File Organization Report ===');

  // Count attestation folders
  const attestationCount = existsSync(ATTESTATIONS_DIR)
    ? readdirSync(ATTESTATIONS_DIR, { withFileTypes: true }).filter((e) => e.isDirectory()).length
    : 0;

  log(`\nAttestations: ${attestationCount} task folders in artifacts/attestations/`);

  // Count tasks per sprint in CSV
  log('\nTasks per Sprint (from CSV):');
  const sortedSprints = Array.from(sprints.entries()).sort((a, b) => a[0] - b[0]);
  for (const [num, info] of sortedSprints.slice(0, 10)) {
    const dirPath = join(METRICS_DIR, `sprint-${num}`);
    const exists = existsSync(dirPath);
    log(`  Sprint ${num}: ${info.taskCount} tasks ${exists ? '✓' : '✗ (no directory)'}`);
  }
  if (sortedSprints.length > 10) {
    log(`  ... and ${sortedSprints.length - 10} more sprints`);
  }

  // Check for task files in wrong sprint directories
  log('\nTask File Placement Check:');
  for (const [sprintNum, info] of sortedSprints.slice(0, 5)) {
    const dirPath = join(METRICS_DIR, `sprint-${sprintNum}`);
    if (!existsSync(dirPath)) continue;

    const findTaskFiles = (dir: string): string[] => {
      const results: string[] = [];
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...findTaskFiles(fullPath));
        } else if (entry.name.endsWith('.json') && !entry.name.startsWith('_')) {
          const taskId = entry.name.replace('.json', '');
          results.push(taskId);
        }
      }
      return results;
    };

    const filesInDir = findTaskFiles(dirPath);
    const wrongPlace = filesInDir.filter((t) => !info.tasks.includes(t));
    if (wrongPlace.length > 0) {
      log(
        `  Sprint ${sprintNum}: ${wrongPlace.length} files don't belong here: ${wrongPlace.join(', ')}`
      );
    }
  }
}

function main(): void {
  console.log('='.repeat(60));
  console.log('Task Artifacts Consolidation Script');
  console.log('='.repeat(60));
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
  console.log(`Repo root: ${REPO_ROOT}`);

  // Load sprint info from CSV
  const sprints = loadSprintInfo();
  log(`\nLoaded ${sprints.size} sprints from CSV`);

  // Step 1: Move scattered validation files
  const { moved, skipped } = moveValidationFiles();
  log(`\nValidation files: ${moved} moved, ${skipped} skipped`);

  // Step 2: Clean up orphaned sprint directories
  const { removed, kept } = cleanupOrphanedSprintDirs(sprints);
  log(`\nSprint directories: ${removed.length} removed, ${kept.length} kept`);

  // Step 3: Create missing sprint directories
  const created = createMissingSprintDirs(sprints, kept);
  log(`\nSprint directories created: ${created.length}`);

  // Step 4: Move misplaced task files to correct sprint directories
  const { moved: tasksMoved, errors: moveErrors } = moveMisplacedTaskFiles(sprints);
  log(`\nTask files moved: ${tasksMoved}`);
  if (moveErrors.length > 0) {
    log(`Errors: ${moveErrors.join(', ')}`);
  }

  // Step 5: Generate report
  generateReport(sprints);

  console.log('\n' + '='.repeat(60));
  console.log('Consolidation complete!');
  console.log('='.repeat(60));
}

main();
