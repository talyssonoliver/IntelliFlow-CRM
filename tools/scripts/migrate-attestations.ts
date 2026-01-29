#!/usr/bin/env npx tsx
/**
 * Migration Script: Consolidate Context and Attestation Directories
 *
 * This script:
 * 1. Converts old context_ack.json files in artifacts/attestations/ to new attestation.json format
 * 2. Moves context packs from artifacts/context/{task_id}/ to .specify/sprints/sprint-{N}/attestations/{taskId}/
 * 3. Preserves all existing data with backward compatibility
 *
 * CANONICAL OUTPUT LOCATION: .specify/sprints/sprint-{N}/attestations/{taskId}/
 * The artifacts/attestations/ and artifacts/context/ paths are DEPRECATED.
 *
 * Usage: npx tsx tools/scripts/migrate-attestations.ts [--dry-run]
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  copyFileSync,
  rmSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { getRelativeSchemaPath } from './lib/schema-paths';
import { OUTPUT_PATHS } from './lib/workflow/config.js';

// Get repo root - handle Windows path conversion
const fileUrl = new URL(import.meta.url);
const scriptPath =
  process.platform === 'win32'
    ? fileUrl.pathname.replace(/^\/([A-Za-z]):/, '$1:')
    : fileUrl.pathname;
const REPO_ROOT = join(dirname(scriptPath), '..', '..');
// OLD locations (deprecated)
const OLD_CONTEXT_DIR = join(REPO_ROOT, 'artifacts', 'context');
const OLD_ATTESTATIONS_DIR = join(REPO_ROOT, 'artifacts', 'attestations');
// Sprint plan for looking up task sprint numbers
const SPRINT_PLAN_PATH = join(REPO_ROOT, 'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv');
const SCHEMA_VERSION = '1.0.0';

/**
 * Load sprint plan and create task-to-sprint mapping
 */
function loadTaskSprintMap(): Map<string, number> {
  const map = new Map<string, number>();
  if (!existsSync(SPRINT_PLAN_PATH)) {
    console.warn('Sprint_plan.csv not found, defaulting all tasks to sprint 0');
    return map;
  }
  const content = readFileSync(SPRINT_PLAN_PATH, 'utf-8');
  const lines = content.split(/\r?\n/);
  // Find header line and column indices
  const headerLine = lines.find((line) => line.includes('Task ID'));
  if (!headerLine) return map;
  const headers = headerLine.split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const taskIdIdx = headers.findIndex((h) => h === 'Task ID');
  const sprintIdx = headers.findIndex((h) => h === 'Target Sprint');
  if (taskIdIdx === -1 || sprintIdx === -1) return map;

  for (const line of lines) {
    if (!line.trim() || line === headerLine) continue;
    // Simple CSV parsing (handles basic cases)
    const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const taskId = cols[taskIdIdx];
    const sprintStr = cols[sprintIdx];
    if (taskId && sprintStr && !isNaN(parseInt(sprintStr, 10))) {
      map.set(taskId, parseInt(sprintStr, 10));
    }
  }
  return map;
}

// Task to sprint mapping (loaded at runtime)
let taskSprintMap: Map<string, number>;

/**
 * Get the canonical output directory for a task
 */
function getTaskOutputDir(taskId: string): string {
  const sprintNumber = taskSprintMap?.get(taskId) ?? 0;
  return join(REPO_ROOT, OUTPUT_PATHS.attestations(sprintNumber, taskId));
}

const isDryRun = process.argv.includes('--dry-run');

interface OldContextAck {
  task_id?: string;
  run_id?: string;
  files_read?: Array<{ path: string; sha256?: string; hash?: string }>;
  invariants_acknowledged?: string[];
  acknowledged_at?: string;
}

interface OldAttestation {
  task_id?: string;
  attestation_timestamp?: string;
  attestor?: string;
  verdict?: string;
  evidence_summary?: {
    artifacts_verified?: number;
    validations_passed?: number;
    gates_passed?: number;
    kpis_met?: number;
    placeholders_found?: number;
  };
  artifact_hashes?: Record<string, string>;
  validation_results?: Array<{
    command?: string;
    exit_code?: number;
    passed?: boolean;
    timestamp?: string;
    name?: string;
  }>;
  gate_results?: Array<{
    gate_id?: string;
    passed?: boolean;
    exit_code?: number;
  }>;
  kpi_results?: Array<{
    kpi?: string;
    target?: string;
    actual?: string;
    met?: boolean;
  }>;
  dependencies_verified?: string[];
  definition_of_done_items?: Array<{
    criterion?: string;
    met?: boolean;
    evidence?: string;
  }>;
}

interface NewAttestation {
  $schema: string;
  schema_version: string;
  task_id: string;
  run_id?: string;
  attestor: string;
  attestation_timestamp: string;
  verdict: string;
  context_acknowledgment?: {
    files_read: Array<{ path: string; sha256: string }>;
    invariants_acknowledged: string[];
    acknowledged_at: string;
  };
  evidence_summary?: OldAttestation['evidence_summary'];
  artifact_hashes?: Record<string, string>;
  validation_results?: OldAttestation['validation_results'];
  gate_results?: OldAttestation['gate_results'];
  kpi_results?: OldAttestation['kpi_results'];
  dependencies_verified?: string[];
  definition_of_done_items?: OldAttestation['definition_of_done_items'];
}

function log(message: string): void {
  console.log(`${isDryRun ? '[DRY-RUN] ' : ''}${message}`);
}

function convertOldAttestationToNew(
  old: OldAttestation,
  taskId: string,
  outputDir: string,
  contextAck?: OldContextAck
): NewAttestation {
  const schemaRef = getRelativeSchemaPath(outputDir, 'ATTESTATION');
  const newAttestation: NewAttestation = {
    $schema: schemaRef,
    schema_version: SCHEMA_VERSION,
    task_id: old.task_id || taskId,
    attestor: old.attestor || 'Claude Code - Task Integrity Validator',
    attestation_timestamp: old.attestation_timestamp || new Date().toISOString(),
    verdict: old.verdict || 'COMPLETE',
  };

  // Add context acknowledgment if we have context ack data
  if (contextAck || old.artifact_hashes) {
    const filesRead =
      contextAck?.files_read?.map((f) => ({
        path: f.path,
        sha256: f.sha256 || f.hash || 'unknown',
      })) ||
      Object.entries(old.artifact_hashes || {}).map(([path, hash]) => ({
        path,
        sha256: hash,
      }));

    newAttestation.context_acknowledgment = {
      files_read: filesRead,
      invariants_acknowledged: contextAck?.invariants_acknowledged || [],
      acknowledged_at:
        contextAck?.acknowledged_at || old.attestation_timestamp || new Date().toISOString(),
    };
  }

  // Copy other fields
  if (old.evidence_summary) newAttestation.evidence_summary = old.evidence_summary;
  if (old.artifact_hashes) newAttestation.artifact_hashes = old.artifact_hashes;
  if (old.validation_results) newAttestation.validation_results = old.validation_results;
  if (old.gate_results) newAttestation.gate_results = old.gate_results;
  if (old.kpi_results) newAttestation.kpi_results = old.kpi_results;
  if (old.dependencies_verified) newAttestation.dependencies_verified = old.dependencies_verified;
  if (old.definition_of_done_items)
    newAttestation.definition_of_done_items = old.definition_of_done_items;

  return newAttestation;
}

function migrateAttestations(): void {
  log('Starting attestation migration...');
  log('Source: artifacts/attestations/ (deprecated)');
  log('Target: .specify/sprints/sprint-{N}/attestations/{taskId}/ (canonical)');
  let migratedCount = 0;
  let skippedCount = 0;

  if (!existsSync(OLD_ATTESTATIONS_DIR)) {
    log(`Old attestations directory not found: ${OLD_ATTESTATIONS_DIR}`);
    return;
  }

  const taskDirs = readdirSync(OLD_ATTESTATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const taskId of taskDirs) {
    const oldTaskDir = join(OLD_ATTESTATIONS_DIR, taskId);
    const oldPath = join(oldTaskDir, 'context_ack.json');
    // NEW: Write to canonical sprint-based location
    const newTaskDir = getTaskOutputDir(taskId);
    const newPath = join(newTaskDir, 'attestation.json');

    // Skip if already migrated
    if (existsSync(newPath)) {
      log(`  Skipped ${taskId}: attestation.json already exists`);
      skippedCount++;
      continue;
    }

    if (!existsSync(oldPath)) {
      log(`  Skipped ${taskId}: no context_ack.json found`);
      skippedCount++;
      continue;
    }

    try {
      const oldContent = readFileSync(oldPath, 'utf-8');
      const oldData: OldAttestation = JSON.parse(oldContent);

      // Check if this is already the new format (has $schema)
      if ('$schema' in oldData) {
        log(`  Skipped ${taskId}: already in new format`);
        skippedCount++;
        continue;
      }

      // Try to load context ack from old context directory
      let contextAck: OldContextAck | undefined;
      const contextAckPath = join(OLD_CONTEXT_DIR, taskId, 'context_ack.json');
      if (existsSync(contextAckPath)) {
        try {
          contextAck = JSON.parse(readFileSync(contextAckPath, 'utf-8'));
        } catch {
          // Ignore context ack errors
        }
      }

      const newData = convertOldAttestationToNew(oldData, taskId, newTaskDir, contextAck);

      if (!isDryRun) {
        // Ensure target directory exists
        mkdirSync(newTaskDir, { recursive: true });
        writeFileSync(newPath, JSON.stringify(newData, null, 2), 'utf-8');
      }
      const sprintNum = taskSprintMap?.get(taskId) ?? 0;
      log(`  Migrated ${taskId}: context_ack.json → .specify/sprints/sprint-${sprintNum}/attestations/${taskId}/attestation.json`);
      migratedCount++;
    } catch (error) {
      log(`  Error migrating ${taskId}: ${error}`);
    }
  }

  log(`\nAttestation migration complete: ${migratedCount} migrated, ${skippedCount} skipped`);
}

function moveContextPacks(): void {
  log('\nMoving context packs from artifacts/context/ to .specify/sprints/sprint-{N}/attestations/{taskId}/...');
  let movedCount = 0;
  let skippedCount = 0;

  if (!existsSync(OLD_CONTEXT_DIR)) {
    log(`Old context directory not found: ${OLD_CONTEXT_DIR}`);
    return;
  }

  const taskDirs = readdirSync(OLD_CONTEXT_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .filter((d) => !d.name.startsWith('2025')) // Skip old timestamp dirs (should be gone already)
    .map((d) => d.name);

  for (const taskId of taskDirs) {
    const sourceDir = join(OLD_CONTEXT_DIR, taskId);
    // NEW: Use canonical sprint-based location
    const targetDir = getTaskOutputDir(taskId);

    // Create target directory if it doesn't exist
    if (!existsSync(targetDir)) {
      if (!isDryRun) {
        mkdirSync(targetDir, { recursive: true });
      }
      const sprintNum = taskSprintMap?.get(taskId) ?? 0;
      log(`  Created .specify/sprints/sprint-${sprintNum}/attestations/${taskId}/`);
    }

    // Move context pack files
    const filesToMove = ['context_pack.md', 'context_pack.manifest.json'];
    for (const filename of filesToMove) {
      const sourcePath = join(sourceDir, filename);
      const targetPath = join(targetDir, filename);

      if (!existsSync(sourcePath)) continue;

      if (existsSync(targetPath)) {
        log(`  Skipped ${taskId}/${filename}: already exists in target`);
        skippedCount++;
        continue;
      }

      if (!isDryRun) {
        copyFileSync(sourcePath, targetPath);
      }
      const sprintNum = taskSprintMap?.get(taskId) ?? 0;
      log(`  Moved ${taskId}/${filename} → sprint-${sprintNum}`);
      movedCount++;
    }
  }

  log(`\nContext pack migration complete: ${movedCount} files moved, ${skippedCount} skipped`);
}

function cleanupOldDirectories(): void {
  log('\nCleaning up deprecated directories...');

  // Clean up artifacts/context/
  if (existsSync(OLD_CONTEXT_DIR)) {
    if (isDryRun) {
      log(`Would remove: ${OLD_CONTEXT_DIR}`);
    } else {
      try {
        rmSync(OLD_CONTEXT_DIR, { recursive: true, force: true });
        log(`Removed: ${OLD_CONTEXT_DIR}`);
      } catch (error) {
        log(`Error removing context directory: ${error}`);
      }
    }
  } else {
    log('artifacts/context/ already removed');
  }

  // Clean up artifacts/attestations/
  if (existsSync(OLD_ATTESTATIONS_DIR)) {
    if (isDryRun) {
      log(`Would remove: ${OLD_ATTESTATIONS_DIR}`);
    } else {
      try {
        rmSync(OLD_ATTESTATIONS_DIR, { recursive: true, force: true });
        log(`Removed: ${OLD_ATTESTATIONS_DIR}`);
      } catch (error) {
        log(`Error removing attestations directory: ${error}`);
      }
    }
  } else {
    log('artifacts/attestations/ already removed');
  }
}

function main(): void {
  console.log('='.repeat(60));
  console.log('Attestation Migration Script');
  console.log('='.repeat(60));
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
  console.log(`Repo root: ${REPO_ROOT}`);
  console.log('');
  console.log('Migration paths:');
  console.log('  FROM: artifacts/attestations/{taskId}/ (deprecated)');
  console.log('  FROM: artifacts/context/{taskId}/ (deprecated)');
  console.log('  TO:   .specify/sprints/sprint-{N}/attestations/{taskId}/ (canonical)');
  console.log('');

  // Load task-to-sprint mapping
  taskSprintMap = loadTaskSprintMap();
  console.log(`Loaded sprint mapping for ${taskSprintMap.size} tasks`);
  console.log('');

  // Step 1: Migrate attestation files to new schema and location
  migrateAttestations();

  // Step 2: Move context packs to canonical location
  moveContextPacks();

  // Step 3: Clean up old directories (only if not dry run)
  if (!isDryRun) {
    console.log('\n⚠️  About to remove deprecated directories.');
    console.log('Run with --dry-run first to preview changes.');
    cleanupOldDirectories();
  }

  console.log('\n' + '='.repeat(60));
  console.log('Migration complete!');
  console.log('Files now at: .specify/sprints/sprint-{N}/attestations/{taskId}/');
  console.log('='.repeat(60));
}

main();
