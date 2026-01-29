/**
 * Migration Script: Unify .specify, artifacts/attestations, and metrics into sprint-based structure
 *
 * This script migrates all task data to the new unified structure:
 * - .specify/sprints/sprint-{N}/specifications/
 * - .specify/sprints/sprint-{N}/planning/
 * - .specify/sprints/sprint-{N}/context/
 * - .specify/sprints/sprint-{N}/attestations/
 * - .specify/sprints/sprint-{N}/evidence/
 * - .specify/sprints/sprint-{N}/_summary.json
 *
 * Usage: npx tsx tools/scripts/migrate-to-unified-structure.ts [--dry-run]
 */

import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { readdir, readFile, copyFile, mkdir, stat } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';

const PROJECT_ROOT = join(__dirname, '..', '..');
const SPECIFY_DIR = join(PROJECT_ROOT, '.specify');
const ARTIFACTS_ATTESTATIONS = join(PROJECT_ROOT, 'artifacts', 'attestations');
const METRICS_DIR = join(PROJECT_ROOT, 'apps', 'project-tracker', 'docs', 'metrics');
const SPRINT_PLAN_CSV = join(METRICS_DIR, '_global', 'Sprint_plan.csv');

interface TaskRecord {
  'Task ID': string;
  'Target Sprint': string;
  [key: string]: string;
}

interface MigrationResult {
  source: string;
  destination: string;
  status: 'copied' | 'skipped' | 'error';
  reason?: string;
}

const DRY_RUN = process.argv.includes('--dry-run');

async function loadTaskSprintMapping(): Promise<Map<string, number>> {
  const csvContent = await readFile(SPRINT_PLAN_CSV, 'utf-8');
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
  }) as TaskRecord[];

  const mapping = new Map<string, number>();
  for (const record of records) {
    const taskId = record['Task ID'];
    const sprint = parseInt(record['Target Sprint'], 10);
    if (taskId && !isNaN(sprint)) {
      mapping.set(taskId, sprint);
    }
  }

  console.log(`Loaded ${mapping.size} task-to-sprint mappings`);
  return mapping;
}

async function copyFileIfNeeded(
  source: string,
  dest: string,
  results: MigrationResult[]
): Promise<void> {
  try {
    if (!existsSync(source)) {
      results.push({ source, destination: dest, status: 'skipped', reason: 'Source not found' });
      return;
    }

    if (existsSync(dest)) {
      results.push({ source, destination: dest, status: 'skipped', reason: 'Destination exists' });
      return;
    }

    if (DRY_RUN) {
      console.log(`[DRY-RUN] Would copy: ${source} -> ${dest}`);
      results.push({ source, destination: dest, status: 'copied', reason: 'Dry run' });
      return;
    }

    // Ensure destination directory exists
    await mkdir(join(dest, '..'), { recursive: true });
    await copyFile(source, dest);
    results.push({ source, destination: dest, status: 'copied' });
    console.log(`Copied: ${source} -> ${dest}`);
  } catch (error) {
    results.push({
      source,
      destination: dest,
      status: 'error',
      reason: error instanceof Error ? error.message : String(error),
    });
    console.error(`Error copying ${source}: ${error}`);
  }
}

async function copyDirectoryIfNeeded(
  source: string,
  dest: string,
  results: MigrationResult[]
): Promise<void> {
  try {
    if (!existsSync(source)) {
      results.push({ source, destination: dest, status: 'skipped', reason: 'Source not found' });
      return;
    }

    const sourceStat = await stat(source);
    if (!sourceStat.isDirectory()) {
      // It's a file, use copyFileIfNeeded
      await copyFileIfNeeded(source, dest, results);
      return;
    }

    if (DRY_RUN) {
      console.log(`[DRY-RUN] Would copy directory: ${source} -> ${dest}`);
      results.push({ source, destination: dest, status: 'copied', reason: 'Dry run (directory)' });
      return;
    }

    // Ensure destination directory exists
    await mkdir(dest, { recursive: true });

    const entries = await readdir(source, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = join(source, entry.name);
      const destPath = join(dest, entry.name);

      if (entry.isDirectory()) {
        await copyDirectoryIfNeeded(srcPath, destPath, results);
      } else {
        await copyFileIfNeeded(srcPath, destPath, results);
      }
    }
  } catch (error) {
    results.push({
      source,
      destination: dest,
      status: 'error',
      reason: error instanceof Error ? error.message : String(error),
    });
    console.error(`Error copying directory ${source}: ${error}`);
  }
}

async function migrateSpecifications(
  taskSprintMap: Map<string, number>,
  results: MigrationResult[]
): Promise<void> {
  console.log('\n=== Migrating Specifications ===');

  // Check old flat location: .specify/specifications/{TASK-ID}-spec.md
  const oldSpecDir = join(SPECIFY_DIR, 'specifications');
  if (existsSync(oldSpecDir)) {
    const files = await readdir(oldSpecDir);
    for (const file of files) {
      if (file.endsWith('-spec.md')) {
        const taskId = file.replace('-spec.md', '');
        const sprint = taskSprintMap.get(taskId) ?? 0;
        const source = join(oldSpecDir, file);
        const dest = join(SPECIFY_DIR, 'sprints', `sprint-${sprint}`, 'specifications', file);
        await copyFileIfNeeded(source, dest, results);
      }
    }
  }

  // Check nested location: .specify/{TASK-ID}/specifications/{TASK-ID}-spec.md
  const specifyEntries = await readdir(SPECIFY_DIR, { withFileTypes: true });
  for (const entry of specifyEntries) {
    if (entry.isDirectory() && !['sprints', 'memory', 'context', 'planning', 'specifications'].includes(entry.name)) {
      const taskId = entry.name;
      const sprint = taskSprintMap.get(taskId) ?? 0;
      const taskSpecDir = join(SPECIFY_DIR, taskId, 'specifications');

      if (existsSync(taskSpecDir)) {
        const files = await readdir(taskSpecDir);
        for (const file of files) {
          if (file.endsWith('.md')) {
            const source = join(taskSpecDir, file);
            const dest = join(SPECIFY_DIR, 'sprints', `sprint-${sprint}`, 'specifications', file);
            await copyFileIfNeeded(source, dest, results);
          }
        }
      }
    }
  }
}

async function migratePlans(
  taskSprintMap: Map<string, number>,
  results: MigrationResult[]
): Promise<void> {
  console.log('\n=== Migrating Plans ===');

  // Check old flat location: .specify/planning/{TASK-ID}-plan.md
  const oldPlanDir = join(SPECIFY_DIR, 'planning');
  if (existsSync(oldPlanDir)) {
    const files = await readdir(oldPlanDir);
    for (const file of files) {
      if (file.endsWith('-plan.md') || file.endsWith('.md')) {
        const taskId = file.replace('-plan.md', '').replace('.md', '');
        const sprint = taskSprintMap.get(taskId) ?? 0;
        const source = join(oldPlanDir, file);
        const dest = join(SPECIFY_DIR, 'sprints', `sprint-${sprint}`, 'planning', file);
        await copyFileIfNeeded(source, dest, results);
      }
    }
  }

  // Check nested location: .specify/{TASK-ID}/planning/{TASK-ID}-plan.md
  const specifyEntries = await readdir(SPECIFY_DIR, { withFileTypes: true });
  for (const entry of specifyEntries) {
    if (entry.isDirectory() && !['sprints', 'memory', 'context', 'planning', 'specifications'].includes(entry.name)) {
      const taskId = entry.name;
      const sprint = taskSprintMap.get(taskId) ?? 0;
      const taskPlanDir = join(SPECIFY_DIR, taskId, 'planning');

      if (existsSync(taskPlanDir)) {
        const files = await readdir(taskPlanDir);
        for (const file of files) {
          if (file.endsWith('.md')) {
            const source = join(taskPlanDir, file);
            const dest = join(SPECIFY_DIR, 'sprints', `sprint-${sprint}`, 'planning', file);
            await copyFileIfNeeded(source, dest, results);
          }
        }
      }
    }
  }
}

async function migrateContext(
  taskSprintMap: Map<string, number>,
  results: MigrationResult[]
): Promise<void> {
  console.log('\n=== Migrating Context ===');

  // Check old flat location: .specify/context/{TASK-ID}/
  const oldContextDir = join(SPECIFY_DIR, 'context');
  if (existsSync(oldContextDir)) {
    const entries = await readdir(oldContextDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const taskId = entry.name;
        const sprint = taskSprintMap.get(taskId) ?? 0;
        const source = join(oldContextDir, taskId);
        const dest = join(SPECIFY_DIR, 'sprints', `sprint-${sprint}`, 'context', taskId);
        await copyDirectoryIfNeeded(source, dest, results);
      }
    }
  }

  // Check nested location: .specify/{TASK-ID}/context/
  const specifyEntries = await readdir(SPECIFY_DIR, { withFileTypes: true });
  for (const entry of specifyEntries) {
    if (entry.isDirectory() && !['sprints', 'memory', 'context', 'planning', 'specifications'].includes(entry.name)) {
      const taskId = entry.name;
      const sprint = taskSprintMap.get(taskId) ?? 0;
      const taskContextDir = join(SPECIFY_DIR, taskId, 'context');

      if (existsSync(taskContextDir)) {
        const source = taskContextDir;
        const dest = join(SPECIFY_DIR, 'sprints', `sprint-${sprint}`, 'context', taskId);
        await copyDirectoryIfNeeded(source, dest, results);
      }
    }
  }
}

async function migrateAttestations(
  taskSprintMap: Map<string, number>,
  results: MigrationResult[]
): Promise<void> {
  console.log('\n=== Migrating Attestations ===');

  // Migrate from artifacts/attestations/{TASK-ID}/
  if (existsSync(ARTIFACTS_ATTESTATIONS)) {
    const entries = await readdir(ARTIFACTS_ATTESTATIONS, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const taskId = entry.name;
        const sprint = taskSprintMap.get(taskId) ?? 0;
        const source = join(ARTIFACTS_ATTESTATIONS, taskId);
        const dest = join(SPECIFY_DIR, 'sprints', `sprint-${sprint}`, 'attestations', taskId);
        await copyDirectoryIfNeeded(source, dest, results);
      }
    }
  }

  // Migrate from .specify/{TASK-ID}/attestations/
  const specifyEntries = await readdir(SPECIFY_DIR, { withFileTypes: true });
  for (const entry of specifyEntries) {
    if (entry.isDirectory() && !['sprints', 'memory', 'context', 'planning', 'specifications'].includes(entry.name)) {
      const taskId = entry.name;
      const sprint = taskSprintMap.get(taskId) ?? 0;
      const taskAttestDir = join(SPECIFY_DIR, taskId, 'attestations');

      if (existsSync(taskAttestDir)) {
        const source = taskAttestDir;
        const dest = join(SPECIFY_DIR, 'sprints', `sprint-${sprint}`, 'attestations', taskId);
        await copyDirectoryIfNeeded(source, dest, results);
      }
    }
  }
}

async function migrateEvidence(
  taskSprintMap: Map<string, number>,
  results: MigrationResult[]
): Promise<void> {
  console.log('\n=== Migrating Evidence ===');

  // Migrate from .specify/{TASK-ID}/evidence/
  const specifyEntries = await readdir(SPECIFY_DIR, { withFileTypes: true });
  for (const entry of specifyEntries) {
    if (entry.isDirectory() && !['sprints', 'memory', 'context', 'planning', 'specifications'].includes(entry.name)) {
      const taskId = entry.name;
      const sprint = taskSprintMap.get(taskId) ?? 0;
      const taskEvidenceDir = join(SPECIFY_DIR, taskId, 'evidence');

      if (existsSync(taskEvidenceDir)) {
        const source = taskEvidenceDir;
        const dest = join(SPECIFY_DIR, 'sprints', `sprint-${sprint}`, 'evidence', taskId);
        await copyDirectoryIfNeeded(source, dest, results);
      }
    }
  }
}

async function migrateSprintSummaries(results: MigrationResult[]): Promise<void> {
  console.log('\n=== Migrating Sprint Summaries ===');

  // Migrate from apps/project-tracker/docs/metrics/sprint-{N}/_summary.json
  for (let sprint = 0; sprint <= 12; sprint++) {
    const source = join(METRICS_DIR, `sprint-${sprint}`, '_summary.json');
    const dest = join(SPECIFY_DIR, 'sprints', `sprint-${sprint}`, '_summary.json');

    if (existsSync(source)) {
      await copyFileIfNeeded(source, dest, results);
    }
  }
}

async function printSummary(results: MigrationResult[]): Promise<void> {
  const copied = results.filter((r) => r.status === 'copied').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  const errors = results.filter((r) => r.status === 'error').length;

  console.log('\n========================================');
  console.log('Migration Summary');
  console.log('========================================');
  console.log(`Total operations: ${results.length}`);
  console.log(`  Copied: ${copied}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Errors: ${errors}`);

  if (DRY_RUN) {
    console.log('\n[DRY-RUN MODE] No files were actually modified.');
    console.log('Run without --dry-run to perform the migration.');
  }

  if (errors > 0) {
    console.log('\nErrors:');
    for (const result of results.filter((r) => r.status === 'error')) {
      console.log(`  ${result.source}: ${result.reason}`);
    }
  }
}

async function main(): Promise<void> {
  console.log('========================================');
  console.log('Unified Structure Migration Script');
  console.log('========================================');
  console.log(`Project root: ${PROJECT_ROOT}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log('');

  const results: MigrationResult[] = [];

  // Load task-sprint mapping from CSV
  const taskSprintMap = await loadTaskSprintMapping();

  // Run migrations
  await migrateSpecifications(taskSprintMap, results);
  await migratePlans(taskSprintMap, results);
  await migrateContext(taskSprintMap, results);
  await migrateAttestations(taskSprintMap, results);
  await migrateEvidence(taskSprintMap, results);
  await migrateSprintSummaries(results);

  // Print summary
  await printSummary(results);
}

main().catch(console.error);
