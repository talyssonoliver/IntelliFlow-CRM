/**
 * Task-contract validator (ADR-070).
 *
 * Validates a dispatch contract JSON against the 20-field schema.
 * Checks for duplicate agentLeaseId against the per-machine active-leases log.
 * Exits 0 on valid contract; 1 on validation failure.
 *
 * Usage (CLI):
 *   npx tsx tools/scripts/orchestration/validate-task-contract.ts \
 *     --contract .specify/sprints/sprint-19/spec/ORCH-002/contract.json \
 *     [--leases-file .orchestration/active-leases.jsonl]
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ─── Types ───────────────────────────────────────────────────────────────────

export type RiskClass = 'Low' | 'Medium' | 'High' | 'Critical';
export type Priority = 'low' | 'medium' | 'high' | 'critical';

export interface TaskContract {
  taskId: string;
  approvedOutcome: string;
  acceptanceCriteria: string | string[];
  baselineMainSha: string;
  specHash: string;
  policyVersion: string;
  dependencySnapshot: string;
  riskClass: RiskClass;
  priority: Priority;
  estimatedEffort: string;
  timeBudget: string;
  retryBudget: number;
  validationProfile: string | string[];
  expectedArtifacts: string[];
  branch: string;
  worktree: string;
  agentLeaseId: string;
  leaseExpiry: string;
  allowedMutationScope: string[];
  humanEscalationConditions: string | string[];
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// ─── Required fields and their types ─────────────────────────────────────────

const REQUIRED_FIELDS: (keyof TaskContract)[] = [
  'taskId',
  'approvedOutcome',
  'acceptanceCriteria',
  'baselineMainSha',
  'specHash',
  'policyVersion',
  'dependencySnapshot',
  'riskClass',
  'priority',
  'estimatedEffort',
  'timeBudget',
  'retryBudget',
  'validationProfile',
  'expectedArtifacts',
  'branch',
  'worktree',
  'agentLeaseId',
  'leaseExpiry',
  'allowedMutationScope',
  'humanEscalationConditions',
];

const RISK_CLASS_VALUES: RiskClass[] = ['Low', 'Medium', 'High', 'Critical'];
const PRIORITY_VALUES: Priority[] = ['low', 'medium', 'high', 'critical'];

// Simple non-empty string fields with no additional pattern constraints.
const SIMPLE_STRING_FIELDS: (keyof TaskContract)[] = [
  'approvedOutcome',
  'specHash',
  'policyVersion',
  'dependencySnapshot',
  'estimatedEffort',
  'worktree',
  'agentLeaseId',
];

// Fields that accept a non-empty string or a non-empty string[].
const STRING_OR_ARRAY_FIELDS: (keyof TaskContract)[] = [
  'acceptanceCriteria',
  'validationProfile',
  'humanEscalationConditions',
];

// Fields that require a non-empty string[].
const STRING_ARRAY_FIELDS: (keyof TaskContract)[] = ['expectedArtifacts', 'allowedMutationScope'];

// ─── Field-level helpers ──────────────────────────────────────────────────────

function pushError(errors: ValidationError[], field: string, message: string): void {
  errors.push({ field, message });
}

function validateSimpleString(
  c: Record<string, unknown>,
  field: string,
  errors: ValidationError[]
): void {
  if (typeof c[field] !== 'string' || (c[field] as string).trim() === '') {
    pushError(errors, field, 'must be a non-empty string');
  }
}

function validatePatternString(
  c: Record<string, unknown>,
  field: string,
  pattern: RegExp,
  message: string,
  errors: ValidationError[]
): void {
  if (typeof c[field] !== 'string' || !pattern.test(c[field] as string)) {
    pushError(errors, field, message);
  }
}

function validateEnumField<T extends string>(
  c: Record<string, unknown>,
  field: string,
  values: T[],
  errors: ValidationError[]
): void {
  if (!values.includes(c[field] as T)) {
    pushError(errors, field, `must be one of: ${values.join(', ')}`);
  }
}

function validateStringOrArrayField(
  c: Record<string, unknown>,
  field: string,
  errors: ValidationError[]
): void {
  if (!isStringOrNonEmptyStringArray(c[field])) {
    pushError(errors, field, 'must be a non-empty string or a non-empty string array');
  }
}

function validateStringArrayField(
  c: Record<string, unknown>,
  field: string,
  errors: ValidationError[]
): void {
  const v = c[field];
  if (
    !Array.isArray(v) ||
    v.length === 0 ||
    !v.every((a) => typeof a === 'string' && a.trim() !== '')
  ) {
    pushError(errors, field, 'must be a non-empty array of non-empty strings');
  }
}

function validateTaskIdField(c: Record<string, unknown>, errors: ValidationError[]): void {
  if (typeof c.taskId !== 'string' || c.taskId.trim() === '') {
    pushError(errors, 'taskId', 'must be a non-empty string');
  } else if (!/^[A-Z][A-Z0-9_-]+-[0-9]/.test(c.taskId)) {
    pushError(errors, 'taskId', 'must match pattern ^[A-Z][A-Z0-9_-]+-[0-9] (e.g. ORCH-002)');
  }
}

function validateBranchField(c: Record<string, unknown>, errors: ValidationError[]): void {
  if (typeof c.branch !== 'string' || c.branch.trim() === '') {
    pushError(errors, 'branch', 'must be a non-empty string');
  } else if (!/^[a-zA-Z0-9][a-zA-Z0-9_./-]*$/.test(c.branch)) {
    pushError(errors, 'branch', 'must be a valid git branch name (alphanumeric, ., _, /, -)');
  }
}

function validateRetryBudgetField(c: Record<string, unknown>, errors: ValidationError[]): void {
  if (typeof c.retryBudget !== 'number' || !Number.isInteger(c.retryBudget) || c.retryBudget < 0) {
    pushError(errors, 'retryBudget', 'must be a non-negative integer');
  }
}

function validateLeaseExpiryField(c: Record<string, unknown>, errors: ValidationError[]): void {
  if (typeof c.leaseExpiry !== 'string' || !isIso8601(c.leaseExpiry)) {
    pushError(
      errors,
      'leaseExpiry',
      'must be an ISO 8601 datetime string (e.g. "2026-07-26T20:00:00Z")'
    );
  }
}

// ─── Validator ────────────────────────────────────────────────────────────────

export function validateTaskContract(contract: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (typeof contract !== 'object' || contract === null || Array.isArray(contract)) {
    return {
      valid: false,
      errors: [{ field: '(root)', message: 'contract must be a JSON object' }],
    };
  }

  const c = contract as Record<string, unknown>;

  for (const field of REQUIRED_FIELDS) {
    if (!(field in c) || c[field] === undefined || c[field] === null) {
      errors.push({ field, message: `required field '${field}' is missing or null` });
    }
  }

  if (errors.length > 0) return { valid: false, errors };

  validateTaskIdField(c, errors);
  for (const f of SIMPLE_STRING_FIELDS) validateSimpleString(c, f, errors);
  validatePatternString(
    c,
    'baselineMainSha',
    /^[0-9a-f]{7,40}$/,
    'must be a 7–40 character lowercase hex SHA',
    errors
  );
  validateEnumField(c, 'riskClass', RISK_CLASS_VALUES, errors);
  validateEnumField(c, 'priority', PRIORITY_VALUES, errors);
  validatePatternString(
    c,
    'timeBudget',
    /^[0-9]+(m|h|d)$/,
    'must match pattern ^[0-9]+(m|h|d)$ (e.g. "2h", "30m")',
    errors
  );
  validateRetryBudgetField(c, errors);
  for (const f of STRING_OR_ARRAY_FIELDS) validateStringOrArrayField(c, f, errors);
  for (const f of STRING_ARRAY_FIELDS) validateStringArrayField(c, f, errors);
  validateBranchField(c, errors);
  validateLeaseExpiryField(c, errors);

  return { valid: errors.length === 0, errors };
}

// ─── Duplicate lease check ────────────────────────────────────────────────────

export interface LeaseRecord {
  agentLeaseId: string;
  taskId: string;
  acquiredAt: string;
  status: 'active' | 'released' | 'expired';
}

/**
 * Reads the per-machine active-leases JSONL file and checks whether leaseId
 * is already recorded as active. Returns true if a duplicate is found.
 *
 * Falls back to false (no duplicate) if the file does not exist — an absent
 * log means no prior leases have been recorded on this machine.
 */
export function checkDuplicateLease(leaseId: string, leasesFilePath?: string): boolean {
  const filePath =
    leasesFilePath ?? path.join(process.cwd(), '.orchestration', 'active-leases.jsonl');

  if (!fs.existsSync(filePath)) return false;

  const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);

  for (const line of lines) {
    let record: LeaseRecord;
    try {
      record = JSON.parse(line) as LeaseRecord;
    } catch {
      continue;
    }
    if (record.agentLeaseId === leaseId && record.status === 'active') {
      return true;
    }
  }

  return false;
}

/**
 * Full validation including duplicate-lease check.
 */
export function validateContractWithLeaseCheck(
  contract: unknown,
  leasesFilePath?: string
): ValidationResult {
  const result = validateTaskContract(contract);

  if (!result.valid) return result;

  const c = contract as TaskContract;

  if (checkDuplicateLease(c.agentLeaseId, leasesFilePath)) {
    result.valid = false;
    result.errors.push({
      field: 'agentLeaseId',
      message: `duplicate active lease detected for agentLeaseId '${c.agentLeaseId}' — another agent holds this lease`,
    });
  }

  return result;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isStringOrNonEmptyStringArray(value: unknown): boolean {
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) {
    return value.length > 0 && value.every((v) => typeof v === 'string' && v.trim() !== '');
  }
  return false;
}

function isIso8601(value: string): boolean {
  // Accept full ISO 8601 datetime with optional timezone offset or Z.
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(value);
}

// ─── Testable CLI runner ──────────────────────────────────────────────────────

export interface CliIO {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  exit: (code: number) => never;
}

export function runValidateCli(args: string[], io: CliIO): void {
  const contractIdx = args.indexOf('--contract');
  const leasesIdx = args.indexOf('--leases-file');

  if (contractIdx === -1 || !args[contractIdx + 1]) {
    io.stderr('Usage: validate-task-contract.ts --contract <path> [--leases-file <path>]\n');
    io.exit(1);
  }

  const contractPath = args[contractIdx + 1]!;
  const leasesFile = leasesIdx !== -1 ? args[leasesIdx + 1] : undefined;

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(contractPath, 'utf-8'));
  } catch (e) {
    io.stderr(`Error reading contract file '${contractPath}': ${String(e)}\n`);
    io.exit(1);
  }

  const result = validateContractWithLeaseCheck(raw!, leasesFile);

  if (result.valid) {
    io.stdout('✓ Contract is valid.\n');
    io.exit(0);
  } else {
    io.stderr('✗ Contract is INVALID:\n');
    for (const err of result.errors) {
      io.stderr(`  [${err.field}] ${err.message}\n`);
    }
    io.exit(1);
  }
}

// Run CLI only when invoked directly (not when imported by tests)
/* c8 ignore next 6 */
if (import.meta.url === `file://${process.argv[1]}`) {
  runValidateCli(process.argv.slice(2), {
    stdout: process.stdout.write.bind(process.stdout),
    stderr: process.stderr.write.bind(process.stderr),
    exit: process.exit,
  });
}
