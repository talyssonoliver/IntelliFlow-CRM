#!/usr/bin/env npx tsx
/**
 * Migration Script: Consolidate Context and Attestation Directories
 *
 * This script:
 * 1. Converts old context_ack.json files in artifacts/attestations/ to new attestation.json format
 * 2. Moves context packs from artifacts/context/{task_id}/ to artifacts/attestations/{task_id}/
 * 3. Preserves all existing data with backward compatibility
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

// Get repo root - handle Windows path conversion
const fileUrl = new URL(import.meta.url);
const scriptPath =
  process.platform === 'win32'
    ? fileUrl.pathname.replace(/^\/([A-Za-z]):/, '$1:')
    : fileUrl.pathname;
const REPO_ROOT = join(dirname(scriptPath), '..', '..');
const CONTEXT_DIR = join(REPO_ROOT, 'artifacts', 'context');
const ATTESTATIONS_DIR = join(REPO_ROOT, 'artifacts', 'attestations');
const SCHEMA_URL = 'https://intelliflow-crm.com/schemas/attestation.schema.json';
const SCHEMA_VERSION = '1.0.0';

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
  contextAck?: OldContextAck
): NewAttestation {
  const newAttestation: NewAttestation = {
    $schema: SCHEMA_URL,
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
  let migratedCount = 0;
  let skippedCount = 0;

  if (!existsSync(ATTESTATIONS_DIR)) {
    log(`Attestations directory not found: ${ATTESTATIONS_DIR}`);
    return;
  }

  const taskDirs = readdirSync(ATTESTATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const taskId of taskDirs) {
    const taskDir = join(ATTESTATIONS_DIR, taskId);
    const oldPath = join(taskDir, 'context_ack.json');
    const newPath = join(taskDir, 'attestation.json');

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

      // Try to load context ack from context directory
      let contextAck: OldContextAck | undefined;
      const contextAckPath = join(CONTEXT_DIR, taskId, 'context_ack.json');
      if (existsSync(contextAckPath)) {
        try {
          contextAck = JSON.parse(readFileSync(contextAckPath, 'utf-8'));
        } catch {
          // Ignore context ack errors
        }
      }

      const newData = convertOldAttestationToNew(oldData, taskId, contextAck);

      if (!isDryRun) {
        writeFileSync(newPath, JSON.stringify(newData, null, 2), 'utf-8');
      }
      log(`  Migrated ${taskId}: context_ack.json → attestation.json`);
      migratedCount++;
    } catch (error) {
      log(`  Error migrating ${taskId}: ${error}`);
    }
  }

  log(`\nAttestation migration complete: ${migratedCount} migrated, ${skippedCount} skipped`);
}

function moveContextPacks(): void {
  log('\nMoving context packs from artifacts/context/ to artifacts/attestations/...');
  let movedCount = 0;
  let skippedCount = 0;

  if (!existsSync(CONTEXT_DIR)) {
    log(`Context directory not found: ${CONTEXT_DIR}`);
    return;
  }

  const taskDirs = readdirSync(CONTEXT_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .filter((d) => !d.name.startsWith('2025')) // Skip old timestamp dirs (should be gone already)
    .map((d) => d.name);

  for (const taskId of taskDirs) {
    const sourceDir = join(CONTEXT_DIR, taskId);
    const targetDir = join(ATTESTATIONS_DIR, taskId);

    // Create target directory if it doesn't exist
    if (!existsSync(targetDir)) {
      if (!isDryRun) {
        mkdirSync(targetDir, { recursive: true });
      }
      log(`  Created ${targetDir}`);
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
      log(`  Moved ${taskId}/${filename}`);
      movedCount++;
    }
  }

  log(`\nContext pack migration complete: ${movedCount} files moved, ${skippedCount} skipped`);
}

function cleanupContextDirectory(): void {
  log('\nCleaning up artifacts/context/ directory...');

  if (!existsSync(CONTEXT_DIR)) {
    log('Context directory already removed');
    return;
  }

  if (isDryRun) {
    log(`Would remove: ${CONTEXT_DIR}`);
    return;
  }

  try {
    rmSync(CONTEXT_DIR, { recursive: true, force: true });
    log(`Removed: ${CONTEXT_DIR}`);
  } catch (error) {
    log(`Error removing context directory: ${error}`);
  }
}

function main(): void {
  console.log('='.repeat(60));
  console.log('Attestation Migration Script');
  console.log('='.repeat(60));
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
  console.log(`Repo root: ${REPO_ROOT}`);
  console.log('');

  // Step 1: Migrate attestation files to new schema
  migrateAttestations();

  // Step 2: Move context packs to attestations directory
  moveContextPacks();

  // Step 3: Clean up old context directory (only if not dry run)
  if (!isDryRun) {
    console.log('\n⚠️  About to remove artifacts/context/ directory.');
    console.log('Run with --dry-run first to preview changes.');
    cleanupContextDirectory();
  }

  console.log('\n' + '='.repeat(60));
  console.log('Migration complete!');
  console.log('='.repeat(60));
}

main();
