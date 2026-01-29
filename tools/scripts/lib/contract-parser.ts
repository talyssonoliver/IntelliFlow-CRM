/**
 * CSV Contract Parser for IntelliFlow CRM
 *
 * Implements deterministic enforcement of contract tags in CSV columns:
 * - Pre-requisites: FILE:, DIR:, ENV:, POLICY:, GLOB:, IMPLEMENTS: (flow reference)
 * - Artifacts To Track: ARTIFACT: (file paths) + EVIDENCE: (governance)
 * - Validation Method: VALIDATE:, AUDIT:, GATE:
 *
 * GLOB: vs FILE: distinction:
 * - FILE: requires exact file path, validated by file existence check
 * - GLOB: requires wildcard pattern, validated by deterministic expansion + hashing
 *
 * IMPLEMENTS: tag (new):
 * - References user flows (FLOW-XXX) that the task implements
 * - Value format: FLOW-001, FLOW-002, etc.
 * - Validated against apps/project-tracker/docs/metrics/_global/flows/FLOW-XXX.md
 *
 * Includes NOELLIPSIS rule enforcement: "..." in contract fields is invalid.
 *
 * @module tools/scripts/lib/contract-parser
 */

import { isStrictMode, type Severity } from './validation-utils.js';

// ============================================================================
// Types
// ============================================================================

export interface ContractTag {
  type:
    | 'FILE'
    | 'DIR'
    | 'ENV'
    | 'POLICY'
    | 'GLOB'
    | 'IMPLEMENTS'
    | 'ARTIFACT'
    | 'EVIDENCE'
    | 'VALIDATE'
    | 'AUDIT'
    | 'GATE';
  value: string;
  raw: string;
}

export interface ParsedContract {
  prerequisites: ContractTag[];
  artifacts: ContractTag[];
  validations: ContractTag[];
  errors: ContractError[];
  hasEllipsis: boolean;
}

export interface ContractError {
  field: 'Pre-requisites' | 'Artifacts To Track' | 'Validation Method';
  message: string;
  severity: Severity;
}

export interface ContractValidationResult {
  taskId: string;
  valid: boolean;
  contract: ParsedContract;
  severity: Severity;
}

// ============================================================================
// Constants
// ============================================================================

const PREREQUISITE_TAGS = ['FILE', 'DIR', 'ENV', 'POLICY', 'GLOB', 'IMPLEMENTS'] as const;
const ARTIFACT_TAGS = ['ARTIFACT', 'EVIDENCE'] as const;
const VALIDATION_TAGS = ['VALIDATE', 'AUDIT', 'GATE'] as const;

const TAG_PATTERN = /^([A-Z]+):(.+)$/;
const ELLIPSIS_PATTERN = /\.\.\./;

// ============================================================================
// Parser Implementation
// ============================================================================

/**
 * Parse a single contract tag string (e.g., "FILE:path/to/file.ts").
 */
export function parseTag(raw: string): ContractTag | null {
  const trimmed = raw.trim();
  const match = trimmed.match(TAG_PATTERN);

  if (!match) {
    return null;
  }

  const [, type, value] = match;
  const upperType = type.toUpperCase();

  const allTags = [...PREREQUISITE_TAGS, ...ARTIFACT_TAGS, ...VALIDATION_TAGS];
  if (!allTags.includes(upperType as (typeof allTags)[number])) {
    return null;
  }

  return {
    type: upperType as ContractTag['type'],
    value: value.trim(),
    raw: trimmed,
  };
}

/**
 * Parse a semicolon-separated list of contract tags from a CSV field.
 */
export function parseTagList(fieldValue: string): ContractTag[] {
  if (!fieldValue || typeof fieldValue !== 'string') {
    return [];
  }

  const parts = fieldValue.split(';');
  const tags: ContractTag[] = [];

  for (const part of parts) {
    const tag = parseTag(part);
    if (tag) {
      tags.push(tag);
    }
  }

  return tags;
}

/**
 * Check if a field contains ellipsis placeholder ("...").
 */
export function containsEllipsis(value: string): boolean {
  return ELLIPSIS_PATTERN.test(value);
}

/**
 * Parse the contract from a task row's contract columns.
 */
export function parseTaskContract(
  prerequisites: string,
  artifactsToTrack: string,
  validationMethod: string
): ParsedContract {
  const errors: ContractError[] = [];
  let hasEllipsis = false;

  // Check for ellipsis in each field
  const fields = [
    { name: 'Pre-requisites' as const, value: prerequisites },
    { name: 'Artifacts To Track' as const, value: artifactsToTrack },
    { name: 'Validation Method' as const, value: validationMethod },
  ];

  for (const field of fields) {
    if (containsEllipsis(field.value)) {
      hasEllipsis = true;
      errors.push({
        field: field.name,
        message: `NOELLIPSIS: Field contains literal "..." placeholder`,
        severity: isStrictMode() ? 'FAIL' : 'WARN',
      });
    }
  }

  // Parse tags from each field
  const allPrereqTags = parseTagList(prerequisites);
  const allArtifactTags = parseTagList(artifactsToTrack);
  const allValidationTags = parseTagList(validationMethod);

  // Filter to valid tag types for each field
  const prerequisiteTags = allPrereqTags.filter((t) =>
    PREREQUISITE_TAGS.includes(t.type as (typeof PREREQUISITE_TAGS)[number])
  );

  const artifactTags = allArtifactTags.filter((t) =>
    ARTIFACT_TAGS.includes(t.type as (typeof ARTIFACT_TAGS)[number])
  );

  const validationTags = allValidationTags.filter((t) =>
    VALIDATION_TAGS.includes(t.type as (typeof VALIDATION_TAGS)[number])
  );

  return {
    prerequisites: prerequisiteTags,
    artifacts: artifactTags,
    validations: validationTags,
    errors,
    hasEllipsis,
  };
}

/**
 * Validate a task's contract and return a result with severity.
 */
export function validateTaskContract(
  taskId: string,
  prerequisites: string,
  artifactsToTrack: string,
  validationMethod: string
): ContractValidationResult {
  const contract = parseTaskContract(prerequisites, artifactsToTrack, validationMethod);

  // Determine overall validity and severity
  let valid = true;
  let severity: Severity = 'PASS';

  if (contract.errors.length > 0) {
    valid = false;
    // Find the most severe error
    const hasFail = contract.errors.some((e) => e.severity === 'FAIL');
    severity = hasFail ? 'FAIL' : 'WARN';
  }

  return {
    taskId,
    valid,
    contract,
    severity,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extract all FILE: prerequisites from a parsed contract.
 */
export function getFilePrerequisites(contract: ParsedContract): string[] {
  return contract.prerequisites.filter((t) => t.type === 'FILE').map((t) => t.value);
}

/**
 * Extract all DIR: prerequisites from a parsed contract.
 */
export function getDirPrerequisites(contract: ParsedContract): string[] {
  return contract.prerequisites.filter((t) => t.type === 'DIR').map((t) => t.value);
}

/**
 * Extract all ENV: prerequisites from a parsed contract.
 */
export function getEnvPrerequisites(contract: ParsedContract): string[] {
  return contract.prerequisites.filter((t) => t.type === 'ENV').map((t) => t.value);
}

/**
 * Extract all POLICY: prerequisites from a parsed contract.
 */
export function getPolicyPrerequisites(contract: ParsedContract): string[] {
  return contract.prerequisites.filter((t) => t.type === 'POLICY').map((t) => t.value);
}

/**
 * Extract all GLOB: prerequisites from a parsed contract.
 * These are wildcard patterns that require deterministic expansion.
 */
export function getGlobPrerequisites(contract: ParsedContract): string[] {
  return contract.prerequisites.filter((t) => t.type === 'GLOB').map((t) => t.value);
}

/**
 * Extract all IMPLEMENTS: flow references from a parsed contract.
 * These reference user flows (FLOW-XXX) that the task implements.
 * Returns flow IDs like ['FLOW-001', 'FLOW-015'] for validation against
 * apps/project-tracker/docs/metrics/_global/flows/FLOW-XXX.md
 */
export function getImplementsFlows(contract: ParsedContract): string[] {
  return contract.prerequisites.filter((t) => t.type === 'IMPLEMENTS').map((t) => t.value);
}

/**
 * Get the file path for a flow reference.
 * @param flowId - Flow ID (e.g., 'FLOW-001')
 * @returns Path to the flow file
 */
export function getFlowFilePath(flowId: string): string {
  return `apps/project-tracker/docs/metrics/_global/flows/${flowId}.md`;
}

/**
 * Check if a contract requires context acknowledgement.
 */
export function requiresContextAck(contract: ParsedContract): boolean {
  return contract.artifacts.some((t) => t.type === 'EVIDENCE' && t.value === 'context_ack');
}

/**
 * Get all EVIDENCE: artifacts from a parsed contract.
 */
export function getEvidenceArtifacts(contract: ParsedContract): string[] {
  return contract.artifacts.filter((t) => t.type === 'EVIDENCE').map((t) => t.value);
}

/**
 * Get all ARTIFACT: file paths from a parsed contract.
 * These are actual files that validators check exist.
 */
export function getArtifactPaths(contract: ParsedContract): string[] {
  return contract.artifacts.filter((t) => t.type === 'ARTIFACT').map((t) => t.value);
}

/**
 * Get all VALIDATE: commands from a parsed contract.
 */
export function getValidateCommands(contract: ParsedContract): string[] {
  return contract.validations.filter((t) => t.type === 'VALIDATE').map((t) => t.value);
}

/**
 * Get all AUDIT: tool IDs from a parsed contract.
 */
export function getAuditToolIds(contract: ParsedContract): string[] {
  return contract.validations.filter((t) => t.type === 'AUDIT').map((t) => t.value);
}

/**
 * Get all GATE: identifiers from a parsed contract.
 */
export function getGateIds(contract: ParsedContract): string[] {
  return contract.validations.filter((t) => t.type === 'GATE').map((t) => t.value);
}

// ============================================================================
// Batch Processing
// ============================================================================

export interface TaskContractRow {
  taskId: string;
  prerequisites: string;
  artifactsToTrack: string;
  validationMethod: string;
}

/**
 * Validate contracts for multiple tasks.
 */
export function validateTaskContracts(tasks: TaskContractRow[]): ContractValidationResult[] {
  return tasks.map((task) =>
    validateTaskContract(
      task.taskId,
      task.prerequisites,
      task.artifactsToTrack,
      task.validationMethod
    )
  );
}

/**
 * Filter tasks that require context acknowledgement.
 */
export function filterTasksRequiringContextAck(
  results: ContractValidationResult[]
): ContractValidationResult[] {
  return results.filter((r) => requiresContextAck(r.contract));
}

/**
 * Get summary statistics for contract validation results.
 */
export function getContractValidationSummary(results: ContractValidationResult[]): {
  total: number;
  valid: number;
  invalid: number;
  withEllipsis: number;
  requireContextAck: number;
} {
  return {
    total: results.length,
    valid: results.filter((r) => r.valid).length,
    invalid: results.filter((r) => !r.valid).length,
    withEllipsis: results.filter((r) => r.contract.hasEllipsis).length,
    requireContextAck: results.filter((r) => requiresContextAck(r.contract)).length,
  };
}
