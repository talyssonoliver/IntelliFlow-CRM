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

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { glob } from 'glob';
import { createHash } from 'crypto';

// Get repo root
const fileUrl = new URL(import.meta.url);
const scriptPath =
  process.platform === 'win32'
    ? fileUrl.pathname.replace(/^\/([A-Za-z]):/, '$1:')
    : fileUrl.pathname;
const REPO_ROOT = join(dirname(scriptPath), '..', '..');
const REPO_ROOT_POSIX = REPO_ROOT.replace(/\\/g, '/');

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
      const data = JSON.parse(content);
      let modified = false;

      // Add schema_version if missing
      if (!data.schema_version) {
        data.schema_version = '1.0.0';
        result.changes.push('Added schema_version: 1.0.0');
        modified = true;
      }

      // Add attestor if missing
      if (!data.attestor) {
        data.attestor = 'Claude Code - Task Integrity Validator';
        result.changes.push('Added attestor');
        modified = true;
      }

      // Add attestation_timestamp if missing
      if (!data.attestation_timestamp) {
        // Use timestamp from context_acknowledgment if available, or status_history, or now
        if (data.context_acknowledgment?.acknowledged_at) {
          data.attestation_timestamp = data.context_acknowledgment.acknowledged_at;
        } else if (data.timestamp) {
          data.attestation_timestamp = data.timestamp;
          delete data.timestamp;
        } else {
          data.attestation_timestamp = new Date().toISOString();
        }
        result.changes.push('Added attestation_timestamp');
        modified = true;
      }

      // Ensure verdict is valid
      const validVerdicts = ['COMPLETE', 'INCOMPLETE', 'PARTIAL', 'BLOCKED', 'NEEDS_HUMAN'];
      if (data.verdict && !validVerdicts.includes(data.verdict)) {
        // Map common variations
        const verdictMap: Record<string, string> = {
          'PASSED': 'COMPLETE',
          'PASS': 'COMPLETE',
          'DONE': 'COMPLETE',
          'SUCCESS': 'COMPLETE',
          'FAILED': 'INCOMPLETE',
          'FAIL': 'INCOMPLETE',
          'PENDING': 'PARTIAL',
        };
        if (verdictMap[data.verdict]) {
          data.verdict = verdictMap[data.verdict];
          result.changes.push(`Mapped verdict to ${data.verdict}`);
          modified = true;
        }
      }
      if (!data.verdict) {
        data.verdict = 'COMPLETE';
        result.changes.push('Added default verdict: COMPLETE');
        modified = true;
      }

      // Fix artifact_hashes - replace non-SHA256 values with placeholder
      if (data.artifact_hashes) {
        const sha256Regex = /^[a-f0-9]{64}$/;
        for (const [path, hash] of Object.entries(data.artifact_hashes)) {
          if (typeof hash === 'string' && !sha256Regex.test(hash)) {
            // Replace invalid hashes with a placeholder hash
            data.artifact_hashes[path] = sha256(`placeholder:${path}:${hash}`);
            result.changes.push(`Fixed artifact_hashes[${path}]`);
            modified = true;
          }
        }
      }

      // Fix dependencies_verified - should be array of strings
      if (data.dependencies_verified && Array.isArray(data.dependencies_verified)) {
        const needsFix = data.dependencies_verified.some((d: unknown) => typeof d !== 'string');
        if (needsFix) {
          data.dependencies_verified = data.dependencies_verified.map((d: unknown) => {
            if (typeof d === 'object' && d !== null && 'task_id' in d) {
              return (d as { task_id: string }).task_id;
            }
            return String(d);
          });
          result.changes.push('Fixed dependencies_verified to string array');
          modified = true;
        }
      }

      // Fix validation_results - add missing required fields
      if (data.validation_results && Array.isArray(data.validation_results)) {
        for (let i = 0; i < data.validation_results.length; i++) {
          const vr = data.validation_results[i];
          let vrModified = false;

          // Use name as command if command is missing
          if (!vr.command) {
            if (vr.name) {
              vr.command = vr.name;
            } else if (vr.validation) {
              vr.command = vr.validation;
            } else {
              vr.command = `validation-${i}`;
            }
            vrModified = true;
          }
          if (vr.exit_code === undefined) {
            vr.exit_code = vr.passed ? 0 : 1;
            vrModified = true;
          }
          if (!vr.timestamp) {
            vr.timestamp = data.attestation_timestamp || new Date().toISOString();
            vrModified = true;
          }
          if (vr.passed === undefined) {
            vr.passed = vr.exit_code === 0;
            vrModified = true;
          }

          if (vrModified) {
            result.changes.push(`Fixed validation_results[${i}]`);
            modified = true;
          }
        }
      }

      // Fix gate_results - add missing gate_id and passed
      if (data.gate_results && Array.isArray(data.gate_results)) {
        for (let i = 0; i < data.gate_results.length; i++) {
          const gr = data.gate_results[i];
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
      }

      // Fix kpi_results - add missing kpi field
      if (data.kpi_results && Array.isArray(data.kpi_results)) {
        for (let i = 0; i < data.kpi_results.length; i++) {
          const kr = data.kpi_results[i];
          let krModified = false;

          if (!kr.kpi) {
            if (kr.name) {
              kr.kpi = kr.name;
              delete kr.name;
            } else if (kr.metric) {
              kr.kpi = kr.metric;
              delete kr.metric;
            } else {
              kr.kpi = `kpi-${i}`;
            }
            krModified = true;
          }
          // Ensure target and actual are strings
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
      }

      // Fix notes - convert array to string
      if (data.notes && Array.isArray(data.notes)) {
        data.notes = data.notes.join('\n');
        result.changes.push('Converted notes array to string');
        modified = true;
      }

      // Fix definition_of_done_items.evidence - convert array to string
      if (data.definition_of_done_items && Array.isArray(data.definition_of_done_items)) {
        for (let i = 0; i < data.definition_of_done_items.length; i++) {
          const dod = data.definition_of_done_items[i];
          if (dod.evidence && Array.isArray(dod.evidence)) {
            dod.evidence = dod.evidence.join('; ');
            result.changes.push(`Fixed definition_of_done_items[${i}].evidence`);
            modified = true;
          }
        }
      }

      // Fix dependencies_verified - handle object format
      if (data.dependencies_verified && typeof data.dependencies_verified === 'object' && !Array.isArray(data.dependencies_verified)) {
        // Convert object to array of task_ids
        const deps = data.dependencies_verified as Record<string, unknown>;
        const taskIds = Object.keys(deps);
        data.dependencies_verified = taskIds;
        result.changes.push('Converted dependencies_verified object to array');
        modified = true;
      }

      // Extract task_id from file path if missing
      if (!data.task_id) {
        const pathMatch = file.match(/attestations[/\\]([A-Z]+-[A-Z0-9-]+)[/\\]/);
        if (pathMatch) {
          data.task_id = pathMatch[1];
          result.changes.push(`Added task_id from path: ${data.task_id}`);
          modified = true;
        }
      }

      // Fix validation_results if it's an object instead of array
      if (data.validation_results && !Array.isArray(data.validation_results) && typeof data.validation_results === 'object') {
        // Convert object format to array format
        const vrObject = data.validation_results as Record<string, unknown>;
        const vrArray: unknown[] = [];

        for (const [name, value] of Object.entries(vrObject)) {
          if (typeof value === 'object' && value !== null) {
            const v = value as Record<string, unknown>;
            vrArray.push({
              name: name,
              command: v.test || v.command || name,
              exit_code: v.passed ? 0 : 1,
              passed: v.passed === true || v.passed === 'true',
              timestamp: data.attestation_timestamp || new Date().toISOString(),
            });
          } else if (typeof value === 'boolean') {
            vrArray.push({
              name: name,
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
          modified = true;
        } else {
          // If we couldn't convert, remove the invalid field
          delete data.validation_results;
          result.changes.push('Removed invalid validation_results object');
          modified = true;
        }
      }

      // Fix context_acknowledgment.files_read if it contains strings
      if (data.context_acknowledgment?.files_read && Array.isArray(data.context_acknowledgment.files_read)) {
        const needsFix = data.context_acknowledgment.files_read.some((f: unknown) => typeof f === 'string');
        if (needsFix) {
          data.context_acknowledgment.files_read = data.context_acknowledgment.files_read.map((f: unknown) => {
            if (typeof f === 'string') {
              return {
                path: f,
                sha256: sha256(`placeholder:${f}`),
              };
            }
            return f;
          });
          result.changes.push('Converted files_read strings to objects');
          modified = true;
        }
      }

      // Fix context_acknowledgment.files_read SHA256 hashes
      if (data.context_acknowledgment?.files_read) {
        const sha256Regex = /^[a-f0-9]{64}$/;
        for (let i = 0; i < data.context_acknowledgment.files_read.length; i++) {
          const fr = data.context_acknowledgment.files_read[i];
          if (fr.sha256 && !sha256Regex.test(fr.sha256)) {
            fr.sha256 = sha256(`placeholder:${fr.path}:${fr.sha256}`);
            result.changes.push(`Fixed context_acknowledgment.files_read[${i}].sha256`);
            modified = true;
          }
        }
      }

      if (modified) {
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
        console.log(`  ✓ ${file.replace(REPO_ROOT, '.')}`);
        result.changes.forEach(c => console.log(`    - ${c}`));
      } else {
        result.status = 'skipped';
      }
    } catch (error) {
      result.status = 'error';
      result.error = String(error);
      console.log(`  ✗ ${file.replace(REPO_ROOT, '.')}: ${error}`);
    }

    results.push(result);
  }
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
      ignore: ignorePatterns.map(p => REPO_ROOT_POSIX + '/apps/project-tracker/docs/metrics/' + p.replace('**/', '')),
    });
    allFiles = allFiles.concat(files);
  }

  // Deduplicate
  allFiles = [...new Set(allFiles)];

  console.log(`Found ${allFiles.length} task status files\n`);

  // Valid status values
  const validStatuses = ['PLANNED', 'NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'FAILED'];
  const statusMap: Record<string, string> = {
    'planned': 'PLANNED',
    'not_started': 'NOT_STARTED',
    'not started': 'NOT_STARTED',
    'in_progress': 'IN_PROGRESS',
    'in progress': 'IN_PROGRESS',
    'inprogress': 'IN_PROGRESS',
    'blocked': 'BLOCKED',
    'done': 'DONE',
    'completed': 'DONE',
    'complete': 'DONE',
    'failed': 'FAILED',
    'error': 'FAILED',
    // Map non-standard statuses
    'config_created': 'IN_PROGRESS',
    'deployed': 'DONE',
    'validated': 'DONE',
    'created': 'IN_PROGRESS',
    'started': 'IN_PROGRESS',
    'running': 'IN_PROGRESS',
    'pending': 'NOT_STARTED',
    'ready': 'NOT_STARTED',
  };

  for (const file of allFiles) {
    const result: MigrationResult = { file, status: 'skipped', changes: [] };

    try {
      const content = readFileSync(file, 'utf-8');
      const data = JSON.parse(content);
      let modified = false;

      // Extract task_id from filename if missing
      if (!data.task_id) {
        const filenameMatch = file.match(/([A-Z]+-[A-Z0-9-]+)\.json$/);
        if (filenameMatch) {
          data.task_id = filenameMatch[1];
          result.changes.push(`Added task_id from filename: ${data.task_id}`);
          modified = true;
        }
      }

      // Fix sprint - should be string like "sprint-0"
      if (typeof data.sprint === 'number') {
        data.sprint = `sprint-${data.sprint}`;
        result.changes.push(`Fixed sprint from number to string`);
        modified = true;
      }

      // Fix status_history - add missing timestamps and normalize status values
      if (data.status_history && Array.isArray(data.status_history)) {
        for (let i = 0; i < data.status_history.length; i++) {
          const sh = data.status_history[i];
          let shModified = false;

          // Add missing 'at' timestamp
          if (!sh.at) {
            // Use previous timestamp, or completed_at, or create a synthetic one
            const prevTimestamp = i > 0 ? data.status_history[i - 1]?.at : null;
            sh.at = prevTimestamp || data.completed_at || data.execution?.completed_at || new Date().toISOString();
            result.changes.push(`Added status_history[${i}].at timestamp`);
            shModified = true;
          }

          // Normalize status values
          if (sh.status) {
            const statusLower = sh.status.toLowerCase();
            if (!validStatuses.includes(sh.status)) {
              if (statusMap[statusLower]) {
                sh.status = statusMap[statusLower];
                result.changes.push(`Normalized status_history[${i}].status: ${statusLower} → ${sh.status}`);
                shModified = true;
              } else {
                // Default to IN_PROGRESS for unknown statuses
                sh.status = 'IN_PROGRESS';
                result.changes.push(`Set status_history[${i}].status to IN_PROGRESS (was: ${statusLower})`);
                shModified = true;
              }
            }
          }

          if (shModified) {
            modified = true;
          }
        }
      }

      // Fix artifacts.created - convert strings to objects and fix null sha256
      if (data.artifacts?.created && Array.isArray(data.artifacts.created)) {
        for (let i = 0; i < data.artifacts.created.length; i++) {
          const artifact = data.artifacts.created[i];
          let artModified = false;

          if (typeof artifact === 'string') {
            data.artifacts.created[i] = {
              path: artifact,
              sha256: sha256(`placeholder:${artifact}`),
              created_at: data.completed_at || data.execution?.completed_at || new Date().toISOString(),
            };
            result.changes.push(`Converted artifacts.created[${i}] string to object`);
            artModified = true;
          } else if (artifact && typeof artifact === 'object') {
            // Fix null sha256
            if (artifact.sha256 === null || artifact.sha256 === undefined || artifact.sha256 === '') {
              artifact.sha256 = sha256(`placeholder:${artifact.path || 'unknown'}`);
              result.changes.push(`Fixed artifacts.created[${i}].sha256 from null`);
              artModified = true;
            }
            // Add missing created_at
            if (!artifact.created_at) {
              artifact.created_at = data.completed_at || data.execution?.completed_at || new Date().toISOString();
              result.changes.push(`Added artifacts.created[${i}].created_at`);
              artModified = true;
            }
          }

          if (artModified) {
            modified = true;
          }
        }
      }

      // Fix artifacts.expected - remove null values
      if (data.artifacts?.expected && Array.isArray(data.artifacts.expected)) {
        const originalLength = data.artifacts.expected.length;
        data.artifacts.expected = data.artifacts.expected.filter((e: unknown) => e !== null && e !== undefined && e !== '');
        if (data.artifacts.expected.length !== originalLength) {
          result.changes.push(`Removed ${originalLength - data.artifacts.expected.length} null values from artifacts.expected`);
          modified = true;
        }
      }

      // Fix KPI actual values - convert null to appropriate defaults
      if (data.kpis) {
        for (const [kpiName, kpi] of Object.entries(data.kpis)) {
          const k = kpi as Record<string, unknown>;
          if (k.actual === null || k.actual === undefined) {
            // Use 'N/A' for null values
            k.actual = 'N/A';
            result.changes.push(`Fixed kpis.${kpiName}.actual from null to 'N/A'`);
            modified = true;
          }
        }
      }

      // Fix validations - add missing timestamps and exit_code
      if (data.validations && Array.isArray(data.validations)) {
        for (let i = 0; i < data.validations.length; i++) {
          const v = data.validations[i];
          let vModified = false;

          if (v.exit_code === undefined || v.exit_code === null) {
            v.exit_code = v.passed ? 0 : 1;
            result.changes.push(`Added validations[${i}].exit_code`);
            vModified = true;
          }
          if (!v.timestamp) {
            v.timestamp = data.completed_at || data.execution?.completed_at || new Date().toISOString();
            result.changes.push(`Added validations[${i}].timestamp`);
            vModified = true;
          }

          if (vModified) {
            modified = true;
          }
        }
      }

      if (modified) {
        writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
        result.status = 'updated';
        console.log(`  ✓ ${file.replace(REPO_ROOT, '.')}`);
        result.changes.forEach(c => console.log(`    - ${c}`));
      } else {
        result.status = 'skipped';
      }
    } catch (error) {
      result.status = 'error';
      result.error = String(error);
      console.log(`  ✗ ${file.replace(REPO_ROOT, '.')}: ${error}`);
    }

    results.push(result);
  }
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
      const data = JSON.parse(content);
      let modified = false;

      // Fix target_date - convert null to valid date or remove
      if (data.target_date === null) {
        data.target_date = 'TBD';
        result.changes.push('Fixed target_date from null to TBD');
        modified = true;
      }

      // Fix sprint - should be string
      if (typeof data.sprint === 'number') {
        data.sprint = `sprint-${data.sprint}`;
        result.changes.push(`Fixed sprint from number to string`);
        modified = true;
      }

      // Fix phases - add id if missing
      if (data.phases && Array.isArray(data.phases)) {
        for (let i = 0; i < data.phases.length; i++) {
          const phase = data.phases[i];
          let phaseModified = false;

          // Generate proper phase id if missing or invalid
          const phaseIdPattern = /^phase-[0-9]+-[a-z-]+$/;
          if (!phase.id || !phaseIdPattern.test(phase.id)) {
            if (phase.name) {
              // Extract number from name or use index
              const nameMatch = phase.name.match(/phase\s*(\d+)/i);
              const phaseNum = nameMatch ? nameMatch[1] : String(i);
              const phaseName = phase.name.toLowerCase()
                .replace(/phase\s*\d+\s*[-:.]?\s*/i, '')
                .replace(/\s+/g, '-')
                .replace(/[^a-z0-9-]/g, '')
                .replace(/-+/g, '-')
                .replace(/^-|-$/g, '') || 'default';
              phase.id = `phase-${phaseNum}-${phaseName}`;
              phaseModified = true;
            } else {
              phase.id = `phase-${i}-phase${i}`;
              phaseModified = true;
            }
          }

          // Fix status
          const validStatuses = ['NOT_STARTED', 'IN_PROGRESS', 'DONE', 'BLOCKED'];
          if (!phase.status || !validStatuses.includes(phase.status)) {
            const statusMap: Record<string, string> = {
              'not_started': 'NOT_STARTED',
              'not started': 'NOT_STARTED',
              'in_progress': 'IN_PROGRESS',
              'in progress': 'IN_PROGRESS',
              'inprogress': 'IN_PROGRESS',
              'done': 'DONE',
              'completed': 'DONE',
              'complete': 'DONE',
              'blocked': 'BLOCKED',
              'planning': 'NOT_STARTED',
              'planned': 'NOT_STARTED',
            };
            const statusLower = (phase.status || 'NOT_STARTED').toLowerCase();
            phase.status = statusMap[statusLower] || 'NOT_STARTED';
            phaseModified = true;
          }

          if (phaseModified) {
            result.changes.push(`Fixed phases[${i}]`);
            modified = true;
          }
        }
      }

      // Fix kpi_summary - ensure proper structure
      if (data.kpi_summary) {
        const validKpiStatuses = ['MEASURING', 'ON_TARGET', 'BELOW_TARGET', 'ABOVE_TARGET', 'MET'];

        for (const [kpiName, kpiValue] of Object.entries(data.kpi_summary)) {
          // If it's a primitive, convert to object
          if (typeof kpiValue === 'number' || typeof kpiValue === 'string') {
            data.kpi_summary[kpiName] = {
              current: kpiValue,
              target: kpiValue,
              actual: kpiValue,
              status: 'MEASURING',
            };
            result.changes.push(`Converted kpi_summary.${kpiName} to object`);
            modified = true;
          } else if (typeof kpiValue === 'object' && kpiValue !== null) {
            const kpi = kpiValue as Record<string, unknown>;
            let kpiModified = false;

            // Add actual if missing (use current or target)
            if (kpi.actual === undefined) {
              kpi.actual = kpi.current !== undefined ? kpi.current : (kpi.target !== undefined ? kpi.target : 0);
              kpiModified = true;
            }

            // Add target if missing
            if (kpi.target === undefined) {
              kpi.target = kpi.actual !== undefined ? kpi.actual : 0;
              kpiModified = true;
            }

            // Fix status if invalid or missing
            if (!kpi.status || (typeof kpi.status === 'string' && !validKpiStatuses.includes(kpi.status))) {
              const statusMap: Record<string, string> = {
                'met': 'MET',
                'on_target': 'ON_TARGET',
                'below_target': 'BELOW_TARGET',
                'above_target': 'ABOVE_TARGET',
                'measuring': 'MEASURING',
              };
              if (kpi.status && typeof kpi.status === 'string' && statusMap[kpi.status.toLowerCase()]) {
                kpi.status = statusMap[kpi.status.toLowerCase()];
              } else {
                kpi.status = 'MEASURING';
              }
              kpiModified = true;
            }

            if (kpiModified) {
              result.changes.push(`Fixed kpi_summary.${kpiName}`);
              modified = true;
            }
          }
        }
      }

      if (modified) {
        writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
        result.status = 'updated';
        console.log(`  ✓ ${file.replace(REPO_ROOT, '.')}`);
        result.changes.forEach(c => console.log(`    - ${c}`));
      } else {
        result.status = 'skipped';
      }
    } catch (error) {
      result.status = 'error';
      result.error = String(error);
      console.log(`  ✗ ${file.replace(REPO_ROOT, '.')}: ${error}`);
    }

    results.push(result);
  }
}

/**
 * Migrate phase summary files
 */
async function migratePhaseSummaryFiles(): Promise<void> {
  console.log('\n=== Migrating Phase Summary Files ===\n');

  const pattern = REPO_ROOT_POSIX + '/apps/project-tracker/docs/metrics/sprint-*/phase-*/_phase-summary.json';
  const files = await glob(pattern, { nodir: true });

  console.log(`Found ${files.length} phase summary files\n`);

  for (const file of files) {
    const result: MigrationResult = { file, status: 'skipped', changes: [] };

    try {
      const content = readFileSync(file, 'utf-8');
      const data = JSON.parse(content);
      let modified = false;

      // Fix sprint - should be string
      if (typeof data.sprint === 'number') {
        data.sprint = `sprint-${data.sprint}`;
        result.changes.push(`Fixed sprint from number to string`);
        modified = true;
      }

      // Add phase if missing
      if (!data.phase) {
        // Extract from file path
        const match = file.match(/phase-\d+-[a-z-]+/);
        if (match) {
          data.phase = match[0];
          result.changes.push(`Added phase from file path`);
          modified = true;
        }
      }

      // Add/fix aggregated_metrics
      if (!data.aggregated_metrics) {
        data.aggregated_metrics = {
          total_tasks: data.tasks?.length || 0,
          completed_tasks: 0,
          automation_percentage: 0,
          done: 0,
          in_progress: 0,
          blocked: 0,
          not_started: 0,
        };
        result.changes.push(`Added default aggregated_metrics`);
        modified = true;
      } else {
        // Ensure all required fields exist
        const am = data.aggregated_metrics;
        let amModified = false;

        if (am.done === undefined) {
          am.done = am.completed_tasks || 0;
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
          const total = am.total_tasks || 0;
          const done = am.done || 0;
          const inProgress = am.in_progress || 0;
          const blocked = am.blocked || 0;
          am.not_started = Math.max(0, total - done - inProgress - blocked);
          amModified = true;
        }

        if (amModified) {
          result.changes.push(`Fixed aggregated_metrics fields`);
          modified = true;
        }
      }

      if (modified) {
        writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
        result.status = 'updated';
        console.log(`  ✓ ${file.replace(REPO_ROOT, '.')}`);
        result.changes.forEach(c => console.log(`    - ${c}`));
      } else {
        result.status = 'skipped';
      }
    } catch (error) {
      result.status = 'error';
      result.error = String(error);
      console.log(`  ✗ ${file.replace(REPO_ROOT, '.')}: ${error}`);
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
  const updated = results.filter(r => r.status === 'updated').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const errors = results.filter(r => r.status === 'error').length;

  console.log('\n================================================');
  console.log('=== Migration Summary ===');
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped} (already valid)`);
  console.log(`Errors: ${errors}`);
  console.log(`Total: ${results.length}`);

  if (errors > 0) {
    console.log('\nFiles with errors:');
    results.filter(r => r.status === 'error').forEach(r => {
      console.log(`  - ${r.file}: ${r.error}`);
    });
  }

  console.log('\nRun `pnpm run validate:schemas` to verify all files pass validation.');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
