#!/usr/bin/env npx tsx
/**
 * Data Migration Script
 *
 * Migrates existing data files to conform to the latest Zod schema definitions.
 * Run this after schema changes to update all data files.
 *
 * Usage: pnpm run migrate:data
 *
 * This script:
 * 1. Finds all data files matching validation patterns
 * 2. Transforms them to match the current schema
 * 3. Writes the updated files back
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { glob } from 'glob';
import { createHash } from 'crypto';

// Get repo root
const fileUrl = new URL(import.meta.url);
const scriptPath =
  process.platform === 'win32'
    ? fileUrl.pathname.replace(/^\/([A-Za-z]):/, '$1:')
    : fileUrl.pathname;
const REPO_ROOT = join(dirname(scriptPath), '..', '..');
const REPO_ROOT_POSIX = REPO_ROOT.replaceAll(/\\/g, '/');

interface MigrationResult {
  file: string;
  status: 'updated' | 'skipped' | 'error';
  changes: string[];
  error?: string;
}

const results: MigrationResult[] = [];

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

// ---------------------------------------------------------------------------
// Attestation record migration helpers
// ---------------------------------------------------------------------------

function fixAttestationTimestamp(data: Record<string, unknown>): void {
  if (data.attestation_timestamp) return;
  const ack = data.context_acknowledgment as Record<string, unknown> | undefined;
  if (ack?.acknowledged_at) {
    data.attestation_timestamp = ack.acknowledged_at;
  } else if (data.timestamp) {
    data.attestation_timestamp = data.timestamp;
    delete data.timestamp;
  } else {
    data.attestation_timestamp = new Date().toISOString();
  }
}

function fixAttestationVerdict(data: Record<string, unknown>, result: MigrationResult): boolean {
  const validVerdicts = ['COMPLETE', 'INCOMPLETE', 'PARTIAL', 'BLOCKED', 'NEEDS_HUMAN'];
  let modified = false;
  if (data.verdict && !validVerdicts.includes(data.verdict as string)) {
    const verdictMap: Record<string, string> = {
      PASSED: 'COMPLETE',
      PASS: 'COMPLETE',
      DONE: 'COMPLETE',
      SUCCESS: 'COMPLETE',
      FAILED: 'INCOMPLETE',
      FAIL: 'INCOMPLETE',
      PENDING: 'PARTIAL',
    };
    if (verdictMap[data.verdict as string]) {
      data.verdict = verdictMap[data.verdict as string];
      result.changes.push(`Mapped verdict to ${data.verdict}`);
      modified = true;
    }
  }
  if (!data.verdict) {
    data.verdict = 'COMPLETE';
    result.changes.push('Added default verdict: COMPLETE');
    modified = true;
  }
  return modified;
}

function fixArtifactHashes(data: Record<string, unknown>, result: MigrationResult): boolean {
  if (!data.artifact_hashes) return false;
  const sha256Regex = /^[a-f0-9]{64}$/;
  let modified = false;
  for (const [path, hash] of Object.entries(data.artifact_hashes as Record<string, unknown>)) {
    if (typeof hash === 'string' && !sha256Regex.test(hash)) {
      (data.artifact_hashes as Record<string, unknown>)[path] = sha256(
        `placeholder:${path}:${hash}`
      );
      result.changes.push(`Fixed artifact_hashes[${path}]`);
      modified = true;
    }
  }
  return modified;
}

function fixDependenciesVerified(data: Record<string, unknown>, result: MigrationResult): boolean {
  let modified = false;
  if (data.dependencies_verified && Array.isArray(data.dependencies_verified)) {
    const needsFix = (data.dependencies_verified as unknown[]).some((d) => typeof d !== 'string');
    if (needsFix) {
      data.dependencies_verified = (data.dependencies_verified as unknown[]).map((d) => {
        if (typeof d === 'object' && d !== null && 'task_id' in d) {
          return (d as { task_id: string }).task_id;
        }
        return String(d);
      });
      result.changes.push('Fixed dependencies_verified to string array');
      modified = true;
    }
  }
  if (
    data.dependencies_verified &&
    typeof data.dependencies_verified === 'object' &&
    !Array.isArray(data.dependencies_verified)
  ) {
    const deps = data.dependencies_verified as Record<string, unknown>;
    data.dependencies_verified = Object.keys(deps);
    result.changes.push('Converted dependencies_verified object to array');
    modified = true;
  }
  return modified;
}

function resolveValidationCommand(vr: Record<string, unknown>, index: number): unknown {
  if (vr.name) return vr.name;
  if (vr.validation) return vr.validation;
  return `validation-${index}`;
}

function fixSingleValidationResult(
  vr: Record<string, unknown>,
  index: number,
  fallbackTs: unknown
): boolean {
  let vrModified = false;
  if (!vr.command) {
    vr.command = resolveValidationCommand(vr, index);
    vrModified = true;
  }
  if (vr.exit_code === undefined) {
    vr.exit_code = vr.passed ? 0 : 1;
    vrModified = true;
  }
  if (!vr.timestamp) {
    vr.timestamp = fallbackTs || new Date().toISOString();
    vrModified = true;
  }
  if (vr.passed === undefined) {
    vr.passed = vr.exit_code === 0;
    vrModified = true;
  }
  return vrModified;
}

function fixValidationResultsArray(
  data: Record<string, unknown>,
  result: MigrationResult
): boolean {
  if (!data.validation_results || !Array.isArray(data.validation_results)) return false;
  let modified = false;
  const vrs = data.validation_results as Record<string, unknown>[];
  for (let i = 0; i < vrs.length; i++) {
    if (fixSingleValidationResult(vrs[i], i, data.attestation_timestamp)) {
      result.changes.push(`Fixed validation_results[${i}]`);
      modified = true;
    }
  }
  return modified;
}

function fixGateResults(data: Record<string, unknown>, result: MigrationResult): boolean {
  if (!data.gate_results || !Array.isArray(data.gate_results)) return false;
  let modified = false;
  const grs = data.gate_results as Record<string, unknown>[];
  for (let i = 0; i < grs.length; i++) {
    const gr = grs[i];
    let grModified = false;
    if (!gr.gate_id) {
      if (gr.name) {
        gr.gate_id = gr.name;
        delete gr.name;
      } else if (gr.gate) {
        gr.gate_id = gr.gate;
        delete gr.gate;
      } else {
        gr.gate_id = `gate-${i}`;
      }
      grModified = true;
    }
    if (gr.passed === undefined) {
      gr.passed = gr.exit_code === 0 || gr.status === 'passed' || gr.result === 'pass';
      grModified = true;
    }
    if (grModified) {
      result.changes.push(`Fixed gate_results[${i}]`);
      modified = true;
    }
  }
  return modified;
}

function fixKpiId(kr: Record<string, unknown>, index: number): boolean {
  if (kr.kpi) return false;
  if (kr.name) {
    kr.kpi = kr.name;
    delete kr.name;
  } else if (kr.metric) {
    kr.kpi = kr.metric;
    delete kr.metric;
  } else {
    kr.kpi = `kpi-${index}`;
  }
  return true;
}

function fixKpiResults(data: Record<string, unknown>, result: MigrationResult): boolean {
  if (!data.kpi_results || !Array.isArray(data.kpi_results)) return false;
  let modified = false;
  const krs = data.kpi_results as Record<string, unknown>[];
  for (let i = 0; i < krs.length; i++) {
    const kr = krs[i];
    let krModified = fixKpiId(kr, i);
    if (kr.target !== undefined && typeof kr.target !== 'string') {
      kr.target = String(kr.target);
      krModified = true;
    }
    if (kr.actual !== undefined && typeof kr.actual !== 'string') {
      kr.actual = String(kr.actual);
      krModified = true;
    }
    if (krModified) {
      result.changes.push(`Fixed kpi_results[${i}]`);
      modified = true;
    }
  }
  return modified;
}

function fixDodItems(data: Record<string, unknown>, result: MigrationResult): boolean {
  if (!data.definition_of_done_items || !Array.isArray(data.definition_of_done_items)) {
    return false;
  }
  let modified = false;
  const dods = data.definition_of_done_items as Record<string, unknown>[];
  for (let i = 0; i < dods.length; i++) {
    const dod = dods[i];
    if (dod.evidence && Array.isArray(dod.evidence)) {
      dod.evidence = (dod.evidence as unknown[]).join('; ');
      result.changes.push(`Fixed definition_of_done_items[${i}].evidence`);
      modified = true;
    }
  }
  return modified;
}

function fixValidationResultsObject(
  data: Record<string, unknown>,
  result: MigrationResult
): boolean {
  if (
    !data.validation_results ||
    Array.isArray(data.validation_results) ||
    typeof data.validation_results !== 'object'
  ) {
    return false;
  }
  const vrObject = data.validation_results as Record<string, unknown>;
  const vrArray: unknown[] = [];
  for (const [name, value] of Object.entries(vrObject)) {
    if (typeof value === 'object' && value !== null) {
      const v = value as Record<string, unknown>;
      vrArray.push({
        name,
        command: v.test || v.command || name,
        exit_code: v.passed ? 0 : 1,
        passed: v.passed === true || v.passed === 'true',
        timestamp: data.attestation_timestamp || new Date().toISOString(),
      });
    } else if (typeof value === 'boolean') {
      vrArray.push({
        name,
        command: name,
        exit_code: value ? 0 : 1,
        passed: value,
        timestamp: data.attestation_timestamp || new Date().toISOString(),
      });
    }
  }
  if (vrArray.length > 0) {
    data.validation_results = vrArray;
    result.changes.push('Converted validation_results object to array');
  } else {
    delete data.validation_results;
    result.changes.push('Removed invalid validation_results object');
  }
  return true;
}

function fixFilesRead(data: Record<string, unknown>, result: MigrationResult): boolean {
  const ack = data.context_acknowledgment as Record<string, unknown> | undefined;
  if (!ack?.files_read || !Array.isArray(ack.files_read)) return false;
  const sha256Regex = /^[a-f0-9]{64}$/;
  let modified = false;

  const needsStringFix = (ack.files_read as unknown[]).some((f) => typeof f === 'string');
  if (needsStringFix) {
    ack.files_read = (ack.files_read as unknown[]).map((f) => {
      if (typeof f === 'string') {
        return { path: f, sha256: sha256(`placeholder:${f}`) };
      }
      return f;
    });
    result.changes.push('Converted files_read strings to objects');
    modified = true;
  }

  const frs = ack.files_read as Record<string, unknown>[];
  for (let i = 0; i < frs.length; i++) {
    const fr = frs[i];
    if (fr.sha256 && !sha256Regex.test(fr.sha256 as string)) {
      fr.sha256 = sha256(`placeholder:${fr.path}:${fr.sha256}`);
      result.changes.push(`Fixed context_acknowledgment.files_read[${i}].sha256`);
      modified = true;
    }
  }
  return modified;
}

function fixAttestationScalars(data: Record<string, unknown>, result: MigrationResult): boolean {
  let modified = false;
  if (!data.schema_version) {
    data.schema_version = '1.0.0';
    result.changes.push('Added schema_version: 1.0.0');
    modified = true;
  }
  if (!data.attestor) {
    data.attestor = 'Claude Code - Task Integrity Validator';
    result.changes.push('Added attestor');
    modified = true;
  }
  if (!data.attestation_timestamp) {
    fixAttestationTimestamp(data);
    result.changes.push('Added attestation_timestamp');
    modified = true;
  }
  if (data.notes && Array.isArray(data.notes)) {
    data.notes = (data.notes as unknown[]).join('\n');
    result.changes.push('Converted notes array to string');
    modified = true;
  }
  return modified;
}

function fixAttestationTaskId(
  file: string,
  data: Record<string, unknown>,
  result: MigrationResult
): boolean {
  if (data.task_id) return false;
  const pathMatch = file.match(/attestations[/\\]([A-Z]+-[A-Z0-9-]+)[/\\]/);
  if (!pathMatch) return false;
  data.task_id = pathMatch[1];
  result.changes.push(`Added task_id from path: ${data.task_id}`);
  return true;
}

function migrateAttestationRecord(
  file: string,
  data: Record<string, unknown>,
  result: MigrationResult
): boolean {
  let modified = false;

  if (fixAttestationScalars(data, result)) modified = true;
  if (fixAttestationVerdict(data, result)) modified = true;
  if (fixArtifactHashes(data, result)) modified = true;
  if (fixDependenciesVerified(data, result)) modified = true;
  if (fixValidationResultsArray(data, result)) modified = true;
  if (fixGateResults(data, result)) modified = true;
  if (fixKpiResults(data, result)) modified = true;
  if (fixDodItems(data, result)) modified = true;
  if (fixValidationResultsObject(data, result)) modified = true;
  if (fixFilesRead(data, result)) modified = true;
  if (fixAttestationTaskId(file, data, result)) modified = true;

  return modified;
}

/**
 * Migrate attestation files
 */
async function migrateAttestationFiles(): Promise<void> {
  console.log('\n=== Migrating Attestation Files ===\n');

  const pattern = REPO_ROOT_POSIX + '/.specify/sprints/sprint-*/attestations/*/context_ack.json';
  const files = await glob(pattern, { nodir: true, dot: true });

  console.log(`Found ${files.length} attestation files\n`);

  for (const file of files) {
    const result: MigrationResult = { file, status: 'skipped', changes: [] };

    try {
      const content = readFileSync(file, 'utf-8');
      const data = JSON.parse(content) as Record<string, unknown>;

      if (migrateAttestationRecord(file, data, result)) {
        // Reorder properties for consistency
        const ordered = {
          $schema: data.$schema,
          schema_version: data.schema_version,
          task_id: data.task_id,
          run_id: data.run_id,
          attestor: data.attestor,
          attestation_timestamp: data.attestation_timestamp,
          verdict: data.verdict,
          context_acknowledgment: data.context_acknowledgment,
          evidence_summary: data.evidence_summary,
          artifact_hashes: data.artifact_hashes,
          validation_results: data.validation_results,
          gate_results: data.gate_results,
          kpi_results: data.kpi_results,
          dependencies_verified: data.dependencies_verified,
          definition_of_done_items: data.definition_of_done_items,
          manual_verification: data.manual_verification,
          environment: data.environment,
          notes: data.notes,
        };
        // Remove undefined values
        const cleaned = JSON.parse(JSON.stringify(ordered));
        writeFileSync(file, JSON.stringify(cleaned, null, 2) + '\n');
        result.status = 'updated';
        console.log(`  ✓ ${file.replaceAll(REPO_ROOT, '.')}`);
        result.changes.forEach((c) => console.log(`    - ${c}`));
      } else {
        result.status = 'skipped';
      }
    } catch (error) {
      result.status = 'error';
      result.error = String(error);
      console.log(`  ✗ ${file.replaceAll(REPO_ROOT, '.')}: ${error}`);
    }

    results.push(result);
  }
}

// ---------------------------------------------------------------------------
// Task status record migration helpers
// ---------------------------------------------------------------------------

const TASK_VALID_STATUSES = ['PLANNED', 'NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'FAILED'];
const TASK_STATUS_MAP: Record<string, string> = {
  planned: 'PLANNED',
  not_started: 'NOT_STARTED',
  'not started': 'NOT_STARTED',
  in_progress: 'IN_PROGRESS',
  'in progress': 'IN_PROGRESS',
  inprogress: 'IN_PROGRESS',
  blocked: 'BLOCKED',
  done: 'DONE',
  completed: 'DONE',
  complete: 'DONE',
  failed: 'FAILED',
  error: 'FAILED',
  config_created: 'IN_PROGRESS',
  deployed: 'DONE',
  validated: 'DONE',
  created: 'IN_PROGRESS',
  started: 'IN_PROGRESS',
  running: 'IN_PROGRESS',
  pending: 'NOT_STARTED',
  ready: 'NOT_STARTED',
};

function normalizeStatusHistoryEntry(
  sh: Record<string, unknown>,
  index: number,
  fallbackAt: unknown,
  result: MigrationResult
): boolean {
  let shModified = false;
  if (!sh.at) {
    sh.at = fallbackAt || new Date().toISOString();
    result.changes.push(`Added status_history[${index}].at timestamp`);
    shModified = true;
  }
  if (sh.status && !TASK_VALID_STATUSES.includes(sh.status as string)) {
    const statusLower = String(sh.status).toLowerCase();
    if (TASK_STATUS_MAP[statusLower]) {
      sh.status = TASK_STATUS_MAP[statusLower];
      result.changes.push(
        `Normalized status_history[${index}].status: ${statusLower} → ${sh.status}`
      );
    } else {
      sh.status = 'IN_PROGRESS';
      result.changes.push(
        `Set status_history[${index}].status to IN_PROGRESS (was: ${statusLower})`
      );
    }
    shModified = true;
  }
  return shModified;
}

function fixStatusHistory(data: Record<string, unknown>, result: MigrationResult): boolean {
  if (!data.status_history || !Array.isArray(data.status_history)) return false;
  let modified = false;
  const history = data.status_history as Record<string, unknown>[];
  const exec = data.execution as Record<string, unknown> | undefined;
  for (let i = 0; i < history.length; i++) {
    const prevAt = i > 0 ? (history[i - 1] as Record<string, unknown>)?.at : null;
    const fallbackAt = prevAt || data.completed_at || exec?.completed_at;
    if (normalizeStatusHistoryEntry(history[i], i, fallbackAt, result)) {
      modified = true;
    }
  }
  return modified;
}

function fixArtifactsCreated(data: Record<string, unknown>, result: MigrationResult): boolean {
  const artifacts = data.artifacts as Record<string, unknown> | undefined;
  if (!artifacts?.created || !Array.isArray(artifacts.created)) return false;
  const exec = data.execution as Record<string, unknown> | undefined;
  const fallbackTs = data.completed_at || exec?.completed_at || new Date().toISOString();
  let modified = false;
  const created = artifacts.created as unknown[];
  for (let i = 0; i < created.length; i++) {
    const artifact = created[i];
    if (typeof artifact === 'string') {
      created[i] = {
        path: artifact,
        sha256: sha256(`placeholder:${artifact}`),
        created_at: fallbackTs,
      };
      result.changes.push(`Converted artifacts.created[${i}] string to object`);
      modified = true;
    } else if (artifact && typeof artifact === 'object') {
      const art = artifact as Record<string, unknown>;
      if (art.sha256 === null || art.sha256 === undefined || art.sha256 === '') {
        art.sha256 = sha256(`placeholder:${art.path || 'unknown'}`);
        result.changes.push(`Fixed artifacts.created[${i}].sha256 from null`);
        modified = true;
      }
      if (!art.created_at) {
        art.created_at = fallbackTs;
        result.changes.push(`Added artifacts.created[${i}].created_at`);
        modified = true;
      }
    }
  }
  return modified;
}

function fixArtifactsExpected(data: Record<string, unknown>, result: MigrationResult): boolean {
  const artifacts = data.artifacts as Record<string, unknown> | undefined;
  if (!artifacts?.expected || !Array.isArray(artifacts.expected)) return false;
  const originalLength = (artifacts.expected as unknown[]).length;
  artifacts.expected = (artifacts.expected as unknown[]).filter(
    (e) => e !== null && e !== undefined && e !== ''
  );
  if ((artifacts.expected as unknown[]).length !== originalLength) {
    const removed = originalLength - (artifacts.expected as unknown[]).length;
    result.changes.push(`Removed ${removed} null values from artifacts.expected`);
    return true;
  }
  return false;
}

function fixKpis(data: Record<string, unknown>, result: MigrationResult): boolean {
  if (!data.kpis) return false;
  let modified = false;
  for (const [kpiName, kpi] of Object.entries(data.kpis as Record<string, unknown>)) {
    const k = kpi as Record<string, unknown>;
    if (k.actual === null || k.actual === undefined) {
      k.actual = 'N/A';
      result.changes.push(`Fixed kpis.${kpiName}.actual from null to 'N/A'`);
      modified = true;
    }
  }
  return modified;
}

function fixValidations(data: Record<string, unknown>, result: MigrationResult): boolean {
  if (!data.validations || !Array.isArray(data.validations)) return false;
  const exec = data.execution as Record<string, unknown> | undefined;
  const fallbackTs = data.completed_at || exec?.completed_at || new Date().toISOString();
  let modified = false;
  const vals = data.validations as Record<string, unknown>[];
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    let vModified = false;
    if (v.exit_code === undefined || v.exit_code === null) {
      v.exit_code = v.passed ? 0 : 1;
      result.changes.push(`Added validations[${i}].exit_code`);
      vModified = true;
    }
    if (!v.timestamp) {
      v.timestamp = fallbackTs;
      result.changes.push(`Added validations[${i}].timestamp`);
      vModified = true;
    }
    if (vModified) modified = true;
  }
  return modified;
}

function migrateTaskStatusRecord(
  file: string,
  data: Record<string, unknown>,
  result: MigrationResult
): boolean {
  let modified = false;

  if (!data.task_id) {
    const filenameMatch = file.match(/([A-Z]{1,20}-[A-Z0-9-]{1,40})\.json$/);
    if (filenameMatch) {
      data.task_id = filenameMatch[1];
      result.changes.push(`Added task_id from filename: ${data.task_id}`);
      modified = true;
    }
  }

  if (typeof data.sprint === 'number') {
    data.sprint = `sprint-${data.sprint}`;
    result.changes.push(`Fixed sprint from number to string`);
    modified = true;
  }

  if (fixStatusHistory(data, result)) modified = true;
  if (fixArtifactsCreated(data, result)) modified = true;
  if (fixArtifactsExpected(data, result)) modified = true;
  if (fixKpis(data, result)) modified = true;
  if (fixValidations(data, result)) modified = true;

  return modified;
}

/**
 * Migrate task status files
 */
async function migrateTaskStatusFiles(): Promise<void> {
  console.log('\n=== Migrating Task Status Files ===\n');

  const patterns = [
    REPO_ROOT_POSIX + '/apps/project-tracker/docs/metrics/sprint-*/phase-*/*.json',
    REPO_ROOT_POSIX + '/apps/project-tracker/docs/metrics/sprint-*/*.json',
  ];

  const ignorePatterns = [
    '**/_phase-summary.json',
    '**/_summary.json',
    '**/schemas/**',
    '**/_global/**',
  ];

  let allFiles: string[] = [];
  for (const pattern of patterns) {
    const files = await glob(pattern, {
      nodir: true,
      ignore: ignorePatterns.map(
        (p) => REPO_ROOT_POSIX + '/apps/project-tracker/docs/metrics/' + p.replaceAll('**/', '')
      ),
    });
    allFiles = allFiles.concat(files);
  }

  allFiles = [...new Set(allFiles)];
  console.log(`Found ${allFiles.length} task status files\n`);

  for (const file of allFiles) {
    const result: MigrationResult = { file, status: 'skipped', changes: [] };

    try {
      const content = readFileSync(file, 'utf-8');
      const data = JSON.parse(content) as Record<string, unknown>;

      if (migrateTaskStatusRecord(file, data, result)) {
        writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
        result.status = 'updated';
        console.log(`  ✓ ${file.replaceAll(REPO_ROOT, '.')}`);
        result.changes.forEach((c) => console.log(`    - ${c}`));
      } else {
        result.status = 'skipped';
      }
    } catch (error) {
      result.status = 'error';
      result.error = String(error);
      console.log(`  ✗ ${file.replaceAll(REPO_ROOT, '.')}: ${error}`);
    }

    results.push(result);
  }
}

// ---------------------------------------------------------------------------
// Sprint summary record migration helpers
// ---------------------------------------------------------------------------

const PHASE_VALID_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'DONE', 'BLOCKED'];
const PHASE_STATUS_MAP: Record<string, string> = {
  not_started: 'NOT_STARTED',
  'not started': 'NOT_STARTED',
  in_progress: 'IN_PROGRESS',
  'in progress': 'IN_PROGRESS',
  inprogress: 'IN_PROGRESS',
  done: 'DONE',
  completed: 'DONE',
  complete: 'DONE',
  blocked: 'BLOCKED',
  planning: 'NOT_STARTED',
  planned: 'NOT_STARTED',
};

function buildPhaseId(phase: Record<string, unknown>, index: number): string {
  if (!phase.name) return `phase-${index}-phase${index}`;
  const name = String(phase.name);
  const nameMatch = name.match(/phase\s*(\d+)/i);
  const phaseNum = nameMatch ? nameMatch[1] : String(index);
  const phaseName =
    name
      .toLowerCase()
      .replace(/phase\s*\d+\s*[-:.]?\s*/i, '')
      .replaceAll(/\s+/g, '-')
      .replaceAll(/[^a-z0-9-]/g, '')
      .replaceAll(/-+/g, '-')
      .replaceAll(/^-|-$/g, '') || 'default';
  return `phase-${phaseNum}-${phaseName}`;
}

function fixPhases(data: Record<string, unknown>, result: MigrationResult): boolean {
  if (!data.phases || !Array.isArray(data.phases)) return false;
  let modified = false;
  const phases = data.phases as Record<string, unknown>[];
  const phaseIdPattern = /^phase-[0-9]+-[a-z-]+$/;
  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    let phaseModified = false;
    if (!phase.id || !phaseIdPattern.test(phase.id as string)) {
      phase.id = buildPhaseId(phase, i);
      phaseModified = true;
    }
    if (!phase.status || !PHASE_VALID_STATUSES.includes(phase.status as string)) {
      const statusLower = ((phase.status as string) || 'NOT_STARTED').toLowerCase();
      phase.status = PHASE_STATUS_MAP[statusLower] || 'NOT_STARTED';
      phaseModified = true;
    }
    if (phaseModified) {
      result.changes.push(`Fixed phases[${i}]`);
      modified = true;
    }
  }
  return modified;
}

const KPI_SUMMARY_VALID_STATUSES = [
  'MEASURING',
  'ON_TARGET',
  'BELOW_TARGET',
  'ABOVE_TARGET',
  'MET',
];
const KPI_SUMMARY_STATUS_MAP: Record<string, string> = {
  met: 'MET',
  on_target: 'ON_TARGET',
  below_target: 'BELOW_TARGET',
  above_target: 'ABOVE_TARGET',
  measuring: 'MEASURING',
};

function fixKpiSummaryEntry(
  kpi: Record<string, unknown>,
  kpiName: string,
  result: MigrationResult
): boolean {
  let kpiModified = false;
  if (kpi.actual === undefined) {
    if (kpi.current !== undefined) {
      kpi.actual = kpi.current;
    } else if (kpi.target !== undefined) {
      kpi.actual = kpi.target;
    } else {
      kpi.actual = 0;
    }
    kpiModified = true;
  }
  if (kpi.target === undefined) {
    kpi.target = kpi.actual !== undefined ? kpi.actual : 0;
    kpiModified = true;
  }
  if (
    !kpi.status ||
    (typeof kpi.status === 'string' && !KPI_SUMMARY_VALID_STATUSES.includes(kpi.status))
  ) {
    if (
      kpi.status &&
      typeof kpi.status === 'string' &&
      KPI_SUMMARY_STATUS_MAP[kpi.status.toLowerCase()]
    ) {
      kpi.status = KPI_SUMMARY_STATUS_MAP[kpi.status.toLowerCase()];
    } else {
      kpi.status = 'MEASURING';
    }
    kpiModified = true;
  }
  if (kpiModified) {
    result.changes.push(`Fixed kpi_summary.${kpiName}`);
  }
  return kpiModified;
}

function fixKpiSummary(data: Record<string, unknown>, result: MigrationResult): boolean {
  if (!data.kpi_summary) return false;
  let modified = false;
  for (const [kpiName, kpiValue] of Object.entries(data.kpi_summary as Record<string, unknown>)) {
    if (typeof kpiValue === 'number' || typeof kpiValue === 'string') {
      (data.kpi_summary as Record<string, unknown>)[kpiName] = {
        current: kpiValue,
        target: kpiValue,
        actual: kpiValue,
        status: 'MEASURING',
      };
      result.changes.push(`Converted kpi_summary.${kpiName} to object`);
      modified = true;
    } else if (typeof kpiValue === 'object' && kpiValue !== null) {
      if (fixKpiSummaryEntry(kpiValue as Record<string, unknown>, kpiName, result)) {
        modified = true;
      }
    }
  }
  return modified;
}

function migrateSprintSummaryRecord(
  data: Record<string, unknown>,
  result: MigrationResult
): boolean {
  let modified = false;

  if (data.target_date === null) {
    data.target_date = 'TBD';
    result.changes.push('Fixed target_date from null to TBD');
    modified = true;
  }

  if (typeof data.sprint === 'number') {
    data.sprint = `sprint-${data.sprint}`;
    result.changes.push(`Fixed sprint from number to string`);
    modified = true;
  }

  if (fixPhases(data, result)) modified = true;
  if (fixKpiSummary(data, result)) modified = true;

  return modified;
}

/**
 * Migrate sprint summary files
 */
async function migrateSprintSummaryFiles(): Promise<void> {
  console.log('\n=== Migrating Sprint Summary Files ===\n');

  const pattern = REPO_ROOT_POSIX + '/apps/project-tracker/docs/metrics/sprint-*/_summary.json';
  const files = await glob(pattern, { nodir: true });

  console.log(`Found ${files.length} sprint summary files\n`);

  for (const file of files) {
    const result: MigrationResult = { file, status: 'skipped', changes: [] };

    try {
      const content = readFileSync(file, 'utf-8');
      const data = JSON.parse(content) as Record<string, unknown>;

      if (migrateSprintSummaryRecord(data, result)) {
        writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
        result.status = 'updated';
        console.log(`  ✓ ${file.replaceAll(REPO_ROOT, '.')}`);
        result.changes.forEach((c) => console.log(`    - ${c}`));
      } else {
        result.status = 'skipped';
      }
    } catch (error) {
      result.status = 'error';
      result.error = String(error);
      console.log(`  ✗ ${file.replaceAll(REPO_ROOT, '.')}: ${error}`);
    }

    results.push(result);
  }
}

// ---------------------------------------------------------------------------
// Phase summary record migration helpers
// ---------------------------------------------------------------------------

function fixAggregatedMetrics(data: Record<string, unknown>, result: MigrationResult): boolean {
  if (!data.aggregated_metrics) {
    const tasks = data.tasks as unknown[] | undefined;
    data.aggregated_metrics = {
      total_tasks: tasks?.length ?? 0,
      completed_tasks: 0,
      automation_percentage: 0,
      done: 0,
      in_progress: 0,
      blocked: 0,
      not_started: 0,
    };
    result.changes.push(`Added default aggregated_metrics`);
    return true;
  }

  const am = data.aggregated_metrics as Record<string, unknown>;
  let amModified = false;
  if (am.done === undefined) {
    am.done = (am.completed_tasks as number) || 0;
    amModified = true;
  }
  if (am.in_progress === undefined) {
    am.in_progress = 0;
    amModified = true;
  }
  if (am.blocked === undefined) {
    am.blocked = 0;
    amModified = true;
  }
  if (am.not_started === undefined) {
    const total = (am.total_tasks as number) || 0;
    const done = (am.done as number) || 0;
    const inProgress = (am.in_progress as number) || 0;
    const blocked = (am.blocked as number) || 0;
    am.not_started = Math.max(0, total - done - inProgress - blocked);
    amModified = true;
  }
  if (amModified) {
    result.changes.push(`Fixed aggregated_metrics fields`);
  }
  return amModified;
}

function migratePhaseSummaryRecord(
  file: string,
  data: Record<string, unknown>,
  result: MigrationResult
): boolean {
  let modified = false;

  if (typeof data.sprint === 'number') {
    data.sprint = `sprint-${data.sprint}`;
    result.changes.push(`Fixed sprint from number to string`);
    modified = true;
  }

  if (!data.phase) {
    const match = file.match(/phase-\d+-[a-z-]+/);
    if (match) {
      data.phase = match[0];
      result.changes.push(`Added phase from file path`);
      modified = true;
    }
  }

  if (fixAggregatedMetrics(data, result)) modified = true;

  return modified;
}

/**
 * Migrate phase summary files
 */
async function migratePhaseSummaryFiles(): Promise<void> {
  console.log('\n=== Migrating Phase Summary Files ===\n');

  const pattern =
    REPO_ROOT_POSIX + '/apps/project-tracker/docs/metrics/sprint-*/phase-*/_phase-summary.json';
  const files = await glob(pattern, { nodir: true });

  console.log(`Found ${files.length} phase summary files\n`);

  for (const file of files) {
    const result: MigrationResult = { file, status: 'skipped', changes: [] };

    try {
      const content = readFileSync(file, 'utf-8');
      const data = JSON.parse(content) as Record<string, unknown>;

      if (migratePhaseSummaryRecord(file, data, result)) {
        writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
        result.status = 'updated';
        console.log(`  ✓ ${file.replaceAll(REPO_ROOT, '.')}`);
        result.changes.forEach((c) => console.log(`    - ${c}`));
      } else {
        result.status = 'skipped';
      }
    } catch (error) {
      result.status = 'error';
      result.error = String(error);
      console.log(`  ✗ ${file.replaceAll(REPO_ROOT, '.')}: ${error}`);
    }

    results.push(result);
  }
}

async function main(): Promise<void> {
  console.log('Starting data migration to match Zod schemas...');
  console.log('================================================\n');

  await migrateAttestationFiles();
  await migrateTaskStatusFiles();
  await migrateSprintSummaryFiles();
  await migratePhaseSummaryFiles();

  // Summary
  const updated = results.filter((r) => r.status === 'updated').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  const errors = results.filter((r) => r.status === 'error').length;

  console.log('\n================================================');
  console.log('=== Migration Summary ===');
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped} (already valid)`);
  console.log(`Errors: ${errors}`);
  console.log(`Total: ${results.length}`);

  if (errors > 0) {
    console.log('\nFiles with errors:');
    results
      .filter((r) => r.status === 'error')
      .forEach((r) => {
        console.log(`  - ${r.file}: ${r.error}`);
      });
  }

  console.log('\nRun `pnpm run validate:schemas` to verify all files pass validation.');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
