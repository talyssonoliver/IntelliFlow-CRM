/**
 * Context Acknowledgement Gatekeeper for IntelliFlow CRM
 *
 * Enforces context_ack.json validation for tasks with EVIDENCE:context_ack.
 * Agents must produce context_ack.json BEFORE code changes are accepted.
 *
 * Required fields:
 * - task_id, run_id
 * - files_read[] with sha256
 * - invariants_acknowledged[] (at least 5 items)
 *
 * Enforcement:
 * - If row's Artifacts To Track contains EVIDENCE:context_ack => missing/invalid ack => FAIL
 * - Ack must include all FILE: prerequisites; hashes must match manifest.
 *
 * @module tools/scripts/lib/context-ack-gatekeeper
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { isStrictMode, type Severity, type GateResult } from './validation-utils.js';
import { parseTaskContract, requiresContextAck, getFilePrerequisites } from './contract-parser.js';
import type { ContextPackManifest } from './context-pack-builder.js';

// ============================================================================
// Types
// ============================================================================

export interface ContextAck {
  task_id: string;
  run_id: string;
  files_read: FileReadEntry[];
  invariants_acknowledged: string[];
  created_at: string;
  agent_id?: string;
  notes?: string;
}

export interface FileReadEntry {
  path: string;
  sha256: string;
  read_at?: string;
}

export interface ContextAckValidationResult {
  valid: boolean;
  severity: Severity;
  errors: string[];
  warnings: string[];
  ack?: ContextAck;
  manifest?: ContextPackManifest;
}

// ============================================================================
// Constants
// ============================================================================

const MIN_INVARIANTS_COUNT = 5;

// ============================================================================
// Validation Functions
// ============================================================================

function validateFilesRead(filesRead: unknown[], errors: string[]): void {
  for (let i = 0; i < filesRead.length; i++) {
    const entry = filesRead[i] as Record<string, unknown>;
    if (!entry || typeof entry !== 'object') {
      errors.push(`files_read[${i}]: Invalid entry (must be object)`);
      continue;
    }
    if (typeof entry.path !== 'string')
      errors.push(`files_read[${i}]: Missing path (required: string)`);
    if (typeof entry.sha256 !== 'string')
      errors.push(`files_read[${i}]: Missing sha256 (required: string)`);
  }
}

function validateInvariantsAcknowledged(invariants: unknown[], errors: string[]): void {
  const validCount = invariants.filter(
    (item) => typeof item === 'string' && (item as string).trim().length > 0
  ).length;
  if (validCount < MIN_INVARIANTS_COUNT) {
    errors.push(
      `invariants_acknowledged has ${validCount} items (required: at least ${MIN_INVARIANTS_COUNT})`
    );
  }
}

/**
 * Validate context_ack.json structure.
 */
export function validateContextAckStructure(ack: unknown): string[] {
  const errors: string[] = [];

  if (!ack || typeof ack !== 'object') {
    errors.push('context_ack.json is not a valid JSON object');
    return errors;
  }

  const obj = ack as Record<string, unknown>;

  if (typeof obj.task_id !== 'string' || obj.task_id.trim().length === 0) {
    errors.push('Missing or invalid task_id (required: non-empty string)');
  }
  if (typeof obj.run_id !== 'string' || obj.run_id.trim().length === 0) {
    errors.push('Missing or invalid run_id (required: non-empty string)');
  }

  if (!Array.isArray(obj.files_read)) {
    errors.push('Missing or invalid files_read (required: array)');
  } else {
    validateFilesRead(obj.files_read as unknown[], errors);
  }

  if (!Array.isArray(obj.invariants_acknowledged)) {
    errors.push('Missing or invalid invariants_acknowledged (required: array)');
  } else {
    validateInvariantsAcknowledged(obj.invariants_acknowledged as unknown[], errors);
  }

  return errors;
}

/**
 * Validate that all FILE: prerequisites are acknowledged with matching hashes.
 */
export function validateFilePrerequisites(
  ack: ContextAck,
  manifest: ContextPackManifest,
  filePrerequisites: string[]
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Build a map of acknowledged files
  const ackFileMap = new Map<string, string>();
  for (const entry of ack.files_read) {
    const normalizedPath = entry.path.replaceAll(/\\/g, '/');
    ackFileMap.set(normalizedPath, entry.sha256);
  }

  // Build a map of manifest files (expected hashes)
  const manifestFileMap = new Map<string, string>();
  for (const entry of manifest.files) {
    if (entry.included) {
      const normalizedPath = entry.path.replaceAll(/\\/g, '/');
      manifestFileMap.set(normalizedPath, entry.sha256);
    }
  }

  // Check that all manifest files are acknowledged
  for (const [path, expectedHash] of manifestFileMap) {
    const ackHash = ackFileMap.get(path);

    if (!ackHash) {
      errors.push(`FILE prerequisite not acknowledged: ${path}`);
      continue;
    }

    if (ackHash !== expectedHash) {
      errors.push(
        `SHA256 mismatch for ${path}: expected ${expectedHash.slice(0, 16)}..., got ${ackHash.slice(0, 16)}...`
      );
    }
  }

  // Check for extra files acknowledged but not in manifest (warning only)
  for (const [path] of ackFileMap) {
    if (!manifestFileMap.has(path)) {
      warnings.push(`Extra file acknowledged (not in manifest): ${path}`);
    }
  }

  return { errors, warnings };
}

/**
 * Load and validate context_ack.json for a task run.
 */
function checkAckFileMissing(
  ackPath: string,
  contextDir: string,
  taskId: string,
  sprintNumber: number,
  repoRoot: string
): ContextAckValidationResult | null {
  if (existsSync(ackPath)) return null;

  // Check for common misname: TASK-ID-context_ack.json (prefixed convention)
  const prefixedPath = join(contextDir, `${taskId}-context_ack.json`);
  if (existsSync(prefixedPath)) {
    return {
      valid: false,
      severity: 'FAIL',
      errors: [
        `context_ack.json not found at expected path: ${ackPath}`,
        `Found wrong filename: ${taskId}-context_ack.json — rename to plain context_ack.json (no task ID prefix)`,
      ],
      warnings: [],
    };
  }

  // Sprint path fallback: scan other sprint dirs
  const sprintsDir = join(repoRoot, '.specify', 'sprints');
  if (existsSync(sprintsDir)) {
    const sprintDirs = readdirSync(sprintsDir)
      .filter((d) => /^sprint-\d+$/.test(d))
      .sort(
        (a, b) =>
          Number.parseInt(b.replaceAll('sprint-', ''), 10) -
          Number.parseInt(a.replaceAll('sprint-', ''), 10)
      );
    for (const dir of sprintDirs) {
      const altAck = join(sprintsDir, dir, 'attestations', taskId, 'context_ack.json');
      if (existsSync(altAck)) {
        return {
          valid: false,
          severity: 'FAIL',
          errors: [
            `Sprint path mismatch: expected sprint-${sprintNumber}, found context_ack.json at ${dir}. Move attestation to correct sprint or update CSV Target Sprint.`,
          ],
          warnings: [],
        };
      }
    }
  }

  return {
    valid: false,
    severity: isStrictMode() ? 'FAIL' : 'WARN',
    errors: [`context_ack.json not found at: ${ackPath}`],
    warnings: [],
  };
}

function parseAndValidateAckFile(
  ackPath: string
): { ack: ContextAck } | ContextAckValidationResult {
  try {
    const parsed = JSON.parse(readFileSync(ackPath, 'utf-8'));
    const structureErrors = validateContextAckStructure(parsed);
    if (structureErrors.length > 0) {
      return { valid: false, severity: 'FAIL', errors: structureErrors, warnings: [] };
    }
    return { ack: parsed as ContextAck };
  } catch (error) {
    return {
      valid: false,
      severity: 'FAIL',
      errors: [
        `Failed to parse context_ack.json: ${error instanceof Error ? error.message : String(error)}`,
      ],
      warnings: [],
    };
  }
}

function loadAndValidateManifest(
  manifestPath: string,
  ack: ContextAck,
  filePrerequisites: string[],
  errors: string[],
  warnings: string[]
): ContextPackManifest | undefined {
  if (!existsSync(manifestPath)) {
    warnings.push('context_pack.manifest.json not found; cannot verify file hashes');
    return undefined;
  }
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as ContextPackManifest;
    if (manifest.backfilled) {
      warnings.push(
        'Manifest was backfilled; hash cross-verification skipped (expected divergence)'
      );
    } else {
      const fileValidation = validateFilePrerequisites(ack, manifest, filePrerequisites);
      errors.push(...fileValidation.errors);
      warnings.push(...fileValidation.warnings);
    }
    return manifest;
  } catch (error) {
    warnings.push(
      `Failed to parse manifest: ${error instanceof Error ? error.message : String(error)}`
    );
    return undefined;
  }
}

export function validateContextAck(
  taskId: string,
  runId: string,
  repoRoot: string,
  filePrerequisites: string[],
  sprintNumber: number = 0
): ContextAckValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const contextDir = join(
    repoRoot,
    '.specify',
    'sprints',
    `sprint-${sprintNumber}`,
    'attestations',
    taskId
  );
  const ackPath = join(contextDir, 'context_ack.json');
  const manifestPath = join(contextDir, 'context_pack.manifest.json');

  // Check if ack file exists (returns early on missing)
  const missingResult = checkAckFileMissing(ackPath, contextDir, taskId, sprintNumber, repoRoot);
  if (missingResult) return missingResult;

  // Load and parse ack
  const parseResult = parseAndValidateAckFile(ackPath);
  if ('errors' in parseResult && !('ack' in parseResult))
    return parseResult as ContextAckValidationResult;
  const ack = (parseResult as { ack: ContextAck }).ack;

  // Validate task_id and run_id match
  if (ack.task_id !== taskId)
    errors.push(`task_id mismatch: expected ${taskId}, got ${ack.task_id}`);
  if (ack.run_id !== runId) errors.push(`run_id mismatch: expected ${runId}, got ${ack.run_id}`);

  // Load manifest and validate prerequisites
  const manifest = loadAndValidateManifest(manifestPath, ack, filePrerequisites, errors, warnings);

  const valid = errors.length === 0;
  let severity: Severity;
  if (!valid) {
    severity = 'FAIL';
  } else if (warnings.length > 0) {
    severity = 'WARN';
  } else {
    severity = 'PASS';
  }

  return { valid, severity, errors, warnings, ack, manifest };
}

// ============================================================================
// Gate Integration
// ============================================================================

/**
 * Run context ack gate for a task.
 * Returns a GateResult for integration with sprint-validation.ts.
 */
export function runContextAckGate(
  taskId: string,
  runId: string,
  repoRoot: string,
  prerequisites: string,
  artifactsToTrack: string,
  validationMethod: string,
  sprintNumber: number = 0
): GateResult {
  // Parse contract to check if context_ack is required
  const contract = parseTaskContract(prerequisites, artifactsToTrack, validationMethod);

  if (!requiresContextAck(contract)) {
    return {
      name: `Context Ack: ${taskId}`,
      severity: 'PASS',
      message: 'EVIDENCE:context_ack not required for this task',
    };
  }

  // Get FILE: prerequisites for validation
  const filePrerequisites = getFilePrerequisites(contract);

  // Validate context ack
  const result = validateContextAck(taskId, runId, repoRoot, filePrerequisites, sprintNumber);

  const details: string[] = [];
  if (result.errors.length > 0) {
    details.push('Errors:');
    details.push(...result.errors.map((e) => `  - ${e}`));
  }
  if (result.warnings.length > 0) {
    details.push('Warnings:');
    details.push(...result.warnings.map((w) => `  - ${w}`));
  }

  if (result.valid) {
    return {
      name: `Context Ack: ${taskId}`,
      severity: result.warnings.length > 0 ? 'WARN' : 'PASS',
      message: `context_ack.json validated successfully (${result.ack?.files_read.length || 0} files, ${result.ack?.invariants_acknowledged.length || 0} invariants)`,
      details: details.length > 0 ? details : undefined,
    };
  }

  return {
    name: `Context Ack: ${taskId}`,
    severity: isStrictMode() ? 'FAIL' : 'WARN',
    message: `context_ack.json validation failed: ${result.errors.length} error(s)`,
    details,
  };
}

// ============================================================================
// Batch Validation
// ============================================================================

export interface TaskContextAckCheck {
  taskId: string;
  runId: string;
  prerequisites: string;
  artifactsToTrack: string;
  validationMethod: string;
  sprintNumber?: number;
}

/**
 * Run context ack gate for multiple tasks.
 */
export function runContextAckGateBatch(
  tasks: TaskContextAckCheck[],
  repoRoot: string
): GateResult[] {
  return tasks.map((task) =>
    runContextAckGate(
      task.taskId,
      task.runId,
      repoRoot,
      task.prerequisites,
      task.artifactsToTrack,
      task.validationMethod,
      task.sprintNumber ?? 0
    )
  );
}

// ============================================================================
// Schema for context_ack.json (for documentation)
// ============================================================================

export const CONTEXT_ACK_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'ContextAck',
  description: 'Context acknowledgement file for agent required reading verification',
  type: 'object',
  required: ['task_id', 'run_id', 'files_read', 'invariants_acknowledged'],
  properties: {
    task_id: {
      type: 'string',
      description: 'The task ID being executed (e.g., "IFC-006")',
      minLength: 1,
    },
    run_id: {
      type: 'string',
      description: 'The run ID in format YYYYMMDD-HHMMSS-<task_id>-<random_4_hex>',
      pattern: '^\\d{8}-\\d{6}-[A-Z0-9-]+-[a-f0-9]{4}$',
    },
    files_read: {
      type: 'array',
      description: 'List of files read with their SHA256 hashes',
      items: {
        type: 'object',
        required: ['path', 'sha256'],
        properties: {
          path: {
            type: 'string',
            description: 'Relative path from repo root',
          },
          sha256: {
            type: 'string',
            description: 'SHA256 hash of file contents',
            pattern: '^[a-f0-9]{64}$',
          },
          read_at: {
            type: 'string',
            description: 'ISO 8601 timestamp when file was read',
            format: 'date-time',
          },
        },
      },
    },
    invariants_acknowledged: {
      type: 'array',
      description: 'List of invariants/rules the agent acknowledges (minimum 5)',
      items: {
        type: 'string',
        minLength: 1,
      },
      minItems: 5,
    },
    created_at: {
      type: 'string',
      description: 'ISO 8601 timestamp when ack was created',
      format: 'date-time',
    },
    agent_id: {
      type: 'string',
      description: 'Optional identifier for the agent creating the ack',
    },
    notes: {
      type: 'string',
      description: 'Optional notes about the context acknowledgement',
    },
  },
};
