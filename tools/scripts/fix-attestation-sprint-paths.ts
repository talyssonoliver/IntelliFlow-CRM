#!/usr/bin/env npx tsx
/**
 * Fix Attestation Sprint Path Mismatches
 *
 * Moves attestation directories from wrong sprint folders to the correct
 * sprint folder (matching CSV Target Sprint). Merges into existing
 * destination dirs, overwrites batch-generated files with real execution
 * data, cleans prefixed filename duplicates, and removes emptied source dirs.
 *
 * Also patches the "Artifacts To Track" CSV column when it references
 * the wrong sprint path.
 *
 * Reuses:
 *   - getSprintForTask() from lib/workflow/utils.ts
 *   - OUTPUT_PATHS from lib/workflow/config.ts
 *   - sprintMismatches from current-state-report.json
 *
 * Usage:
 *   npx tsx tools/scripts/fix-attestation-sprint-paths.ts [--dry-run]
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';

import Papa from 'papaparse';

import { OUTPUT_PATHS } from './lib/workflow/config.js';
import { clearSprintCache, getSprintForTask } from './lib/workflow/utils.js';

// ── Paths ──────────────────────────────────────────────────────────────

const fileUrl = new URL(import.meta.url);
const scriptPath =
  process.platform === 'win32'
    ? fileUrl.pathname.replace(/^\/([A-Za-z]):/, '$1:')
    : fileUrl.pathname;
const REPO_ROOT = join(dirname(scriptPath), '..', '..');
const SPECIFY_SPRINTS = join(REPO_ROOT, '.specify', 'sprints');
const CSV_PATH = join(
  REPO_ROOT,
  'apps',
  'project-tracker',
  'docs',
  'metrics',
  '_global',
  'Sprint_plan.csv'
);
const REPORT_JSON = join(REPO_ROOT, 'artifacts', 'reports', 'current-state-report.json');

const DRY_RUN = process.argv.includes('--dry-run');

// ── Types ──────────────────────────────────────────────────────────────

interface SprintMismatch {
  taskId: string;
  csvSprint: number;
  attestationSprint: number;
}

interface MigrationAction {
  taskId: string;
  sourceDir: string;
  destDir: string;
  filesCopied: string[];
  prefixedRemoved: string[];
  sourceDirRemoved: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────

function log(msg: string): void {
  console.log(DRY_RUN ? `[DRY-RUN] ${msg}` : msg);
}

/**
 * Check if a filename is a task-ID-prefixed duplicate of a plain-name file.
 * e.g. "IFC-014-attestation.json" is a prefix of "attestation.json"
 */
function isPrefixedDuplicate(filename: string, taskId: string): boolean {
  const prefix = `${taskId}-`;
  if (!filename.startsWith(prefix)) return false;
  const plainName = filename.slice(prefix.length);
  // Only treat as duplicate if the plain version is a known canonical name
  const canonicalNames = [
    'attestation.json',
    'context_ack.json',
    'context_pack.md',
    'context_pack.manifest.json',
    'attestation-latest.json',
  ];
  return canonicalNames.includes(plainName) || /^attestation-\d{8}-\d{6}\.json$/.test(plainName);
}

/**
 * Detect ALL mismatches by scanning .specify/sprints/ against CSV Target Sprint.
 * Falls back to current-state-report.json if available.
 */
function loadMismatchesFromReport(): SprintMismatch[] | null {
  if (!existsSync(REPORT_JSON)) return null;
  try {
    const report = JSON.parse(readFileSync(REPORT_JSON, 'utf-8'));
    const list = report.inconsistencies?.sprintMismatches;
    if (Array.isArray(list) && list.length > 0) return list as SprintMismatch[];
  } catch {
    // Fall through to live detection
  }
  return null;
}

function scanSprintForMismatches(
  sprintDir: { name: string; isDirectory(): boolean },
  mismatches: SprintMismatch[]
): void {
  if (!sprintDir.isDirectory()) return;
  const match = /^sprint-(\d+)$/.exec(sprintDir.name);
  if (!match) return;
  const folderSprint = Number(match[1]);

  const attestationsDir = join(SPECIFY_SPRINTS, sprintDir.name, 'attestations');
  if (!existsSync(attestationsDir)) return;

  for (const taskDir of readdirSync(attestationsDir, { withFileTypes: true })) {
    if (!taskDir.isDirectory()) continue;
    const attestationFile = join(attestationsDir, taskDir.name, 'attestation.json');
    if (!existsSync(attestationFile)) continue;
    try {
      const csvSprint = getSprintForTask(taskDir.name, REPO_ROOT);
      if (csvSprint !== folderSprint) {
        mismatches.push({ taskId: taskDir.name, csvSprint, attestationSprint: folderSprint });
      }
    } catch {
      // Task not in CSV — skip (orphan, handled elsewhere)
    }
  }
}

function detectMismatches(): SprintMismatch[] {
  const fromReport = loadMismatchesFromReport();
  if (fromReport) return fromReport;

  clearSprintCache();
  const mismatches: SprintMismatch[] = [];
  for (const sprintDir of readdirSync(SPECIFY_SPRINTS, { withFileTypes: true })) {
    scanSprintForMismatches(sprintDir, mismatches);
  }
  return mismatches;
}

// ── Migration ──────────────────────────────────────────────────────────

function copyNonDuplicateFiles(
  sourceDir: string,
  destDir: string,
  taskId: string,
  action: MigrationAction
): void {
  const sourceFiles = readdirSync(sourceDir).filter((f) => statSync(join(sourceDir, f)).isFile());
  for (const file of sourceFiles) {
    if (isPrefixedDuplicate(file, taskId)) {
      action.prefixedRemoved.push(file);
      continue;
    }
    if (!DRY_RUN) copyFileSync(join(sourceDir, file), join(destDir, file));
    action.filesCopied.push(file);
  }
}

function removePrefixedDuplicatesFromDest(
  destDir: string,
  taskId: string,
  action: MigrationAction
): void {
  if (!existsSync(destDir) || DRY_RUN) return;
  for (const file of readdirSync(destDir)) {
    if (isPrefixedDuplicate(file, taskId)) {
      const fullPath = join(destDir, file);
      if (statSync(fullPath).isFile()) {
        rmSync(fullPath);
        action.prefixedRemoved.push(`(dest) ${file}`);
      }
    }
  }
}

function migrateAttestation(mismatch: SprintMismatch): MigrationAction | null {
  const { taskId, csvSprint, attestationSprint } = mismatch;
  const sourceDir = join(REPO_ROOT, OUTPUT_PATHS.attestations(attestationSprint, taskId));
  const destDir = join(REPO_ROOT, OUTPUT_PATHS.attestations(csvSprint, taskId));

  if (!existsSync(sourceDir)) {
    log(`  SKIP ${taskId}: source dir does not exist (${sourceDir})`);
    return null;
  }

  const action: MigrationAction = {
    taskId,
    sourceDir,
    destDir,
    filesCopied: [],
    prefixedRemoved: [],
    sourceDirRemoved: false,
  };

  if (!DRY_RUN) mkdirSync(destDir, { recursive: true });

  copyNonDuplicateFiles(sourceDir, destDir, taskId, action);
  removePrefixedDuplicatesFromDest(destDir, taskId, action);

  if (!DRY_RUN) rmSync(sourceDir, { recursive: true, force: true });
  action.sourceDirRemoved = true;

  return action;
}

// ── CSV Path Fix ───────────────────────────────────────────────────────

function fixCsvArtifactPaths(mismatches: SprintMismatch[]): number {
  if (!existsSync(CSV_PATH)) {
    log('WARNING: Sprint_plan.csv not found, skipping CSV path fix');
    return 0;
  }

  const csvContent = readFileSync(CSV_PATH, 'utf-8');
  const { data, meta } = Papa.parse<Record<string, string>>(csvContent, {
    header: true,
    skipEmptyLines: true,
  });

  // Build lookup: taskId -> { wrongSprint, correctSprint }
  const fixMap = new Map<string, { from: number; to: number }>();
  for (const m of mismatches) {
    fixMap.set(m.taskId, { from: m.attestationSprint, to: m.csvSprint });
  }

  let patchCount = 0;
  const artifactCol = 'Artifacts To Track';

  for (const row of data) {
    const taskId = row['Task ID'];
    if (!taskId) continue;
    const fix = fixMap.get(taskId);
    if (!fix) continue;

    const artifacts = row[artifactCol];
    if (!artifacts) continue;

    const wrongPattern = `sprint-${fix.from}`;
    const correctPattern = `sprint-${fix.to}`;

    if (artifacts.includes(wrongPattern)) {
      const updated = artifacts.replaceAll(wrongPattern, correctPattern);
      row[artifactCol] = updated;
      log(`  CSV FIX ${taskId}: ${wrongPattern} → ${correctPattern} in "${artifactCol}"`);
      patchCount++;
    }
  }

  if (patchCount > 0 && !DRY_RUN) {
    const output = Papa.unparse(data, {
      columns: meta.fields,
      newline: '\n',
    });
    writeFileSync(CSV_PATH, `${output}\n`, 'utf-8');
    log(`  Wrote ${CSV_PATH} (${patchCount} rows updated)`);
  }

  return patchCount;
}

// ── Main ───────────────────────────────────────────────────────────────

function main(): void {
  console.log('=== Fix Attestation Sprint Path Mismatches ===');
  if (DRY_RUN) console.log('Running in DRY-RUN mode — no files will be modified.\n');

  // Step 1: Detect mismatches
  const mismatches = detectMismatches();
  console.log(`Found ${mismatches.length} sprint mismatches.\n`);

  if (mismatches.length === 0) {
    console.log('Nothing to fix. All attestations are in the correct sprint folder.');
    return;
  }

  // Step 2: Migrate attestation directories
  console.log('--- Phase 1: Move attestation directories ---');
  const actions: MigrationAction[] = [];
  for (const mismatch of mismatches) {
    log(`${mismatch.taskId}: sprint-${mismatch.attestationSprint} → sprint-${mismatch.csvSprint}`);
    const action = migrateAttestation(mismatch);
    if (action) {
      actions.push(action);
      log(
        `  Copied ${action.filesCopied.length} files, removed ${action.prefixedRemoved.length} prefixed duplicates`
      );
    }
  }

  // Step 3: Fix CSV paths
  console.log('\n--- Phase 2: Fix CSV Artifacts To Track paths ---');
  const csvPatched = fixCsvArtifactPaths(mismatches);

  // Step 4: Summary
  console.log('\n--- Summary ---');
  console.log(`Attestation dirs migrated: ${actions.length}`);
  console.log(`Total files copied: ${actions.reduce((sum, a) => sum + a.filesCopied.length, 0)}`);
  console.log(
    `Prefixed duplicates removed: ${actions.reduce((sum, a) => sum + a.prefixedRemoved.length, 0)}`
  );
  console.log(`Source dirs removed: ${actions.filter((a) => a.sourceDirRemoved).length}`);
  console.log(`CSV rows patched: ${csvPatched}`);

  if (DRY_RUN) {
    console.log('\nRe-run without --dry-run to apply changes.');
  } else {
    console.log(
      '\nDone. Run `npx tsx apps/project-tracker/scripts/generate-current-state-report.ts` to verify.'
    );
  }
}

main();
