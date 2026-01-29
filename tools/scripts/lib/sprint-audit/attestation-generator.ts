/**
 * Attestation Generator
 *
 * Generates task attestations that conform to the existing attestation.schema.json.
 * This replaces custom report types with the standard attestation format.
 *
 * @module tools/scripts/lib/sprint-audit/attestation-generator
 */

import * as fs from 'fs';
import * as path from 'path';
import { getRelativeSchemaPath, SCHEMA_FILES } from '../schema-paths';
import type {
  ArtifactVerification,
  ValidationResult,
  KpiResult,
  PlaceholderFinding,
  DependencyVerification,
  DefinitionOfDoneResult,
} from './types';

// =============================================================================
// Attestation Schema Types (matches attestation.schema.json)
// =============================================================================

export type AttestationVerdict = 'COMPLETE' | 'INCOMPLETE' | 'PARTIAL' | 'BLOCKED' | 'NEEDS_HUMAN';

export interface FileHash {
  path: string;
  sha256: string;
}

export interface ContextAcknowledgment {
  files_read: FileHash[];
  invariants_acknowledged: string[];
  acknowledged_at: string;
}

export interface EvidenceSummary {
  artifacts_verified: number;
  validations_passed: number;
  validations_failed: number;
  gates_passed: number;
  gates_failed: number;
  kpis_met: number;
  kpis_missed: number;
  placeholders_found: number;
}

export interface ValidationResultSchema {
  name?: string;
  command: string;
  exit_code: number;
  passed: boolean;
  timestamp: string;
  duration_ms?: number;
  stdout_hash?: string;
}

export interface GateResult {
  gate_id: string;
  passed: boolean;
  exit_code?: number;
  log_path?: string;
}

export interface KpiResultSchema {
  kpi: string;
  target: string;
  actual: string;
  met: boolean;
}

export interface DodItem {
  criterion: string;
  met: boolean;
  evidence?: string;
}

export interface TaskAttestation {
  $schema: string;
  schema_version: string;
  task_id: string;
  run_id?: string;
  attestor: string;
  attestation_timestamp: string;
  verdict: AttestationVerdict;
  context_acknowledgment?: ContextAcknowledgment;
  evidence_summary: EvidenceSummary;
  artifact_hashes: Record<string, string>;
  validation_results: ValidationResultSchema[];
  gate_results: GateResult[];
  kpi_results: KpiResultSchema[];
  dependencies_verified: string[];
  definition_of_done_items: DodItem[];
  notes?: string;
}

// =============================================================================
// Verdict Determination
// =============================================================================

export interface AuditFindings {
  artifacts: ArtifactVerification[];
  validations: ValidationResult[];
  kpis: KpiResult[];
  placeholders: PlaceholderFinding[];
  dependencies: DependencyVerification;
  definitionOfDone: DefinitionOfDoneResult;
  hasWaiver: boolean;
  waiverExpired: boolean;
  debtAllowed: boolean;
}

/**
 * Determines attestation verdict based on findings and waiver status
 */
export function determineVerdict(findings: AuditFindings): AttestationVerdict {
  const { artifacts, validations, kpis, placeholders, dependencies, hasWaiver, waiverExpired, debtAllowed } = findings;

  // Count critical issues
  const missingArtifacts = artifacts.filter((a) => a.status === 'missing').length;
  const stubArtifacts = artifacts.filter((a) => a.status === 'stub').length;
  const emptyArtifacts = artifacts.filter((a) => a.status === 'empty').length;
  const failedValidations = validations.filter((v) => !v.passed).length;
  const missedKpis = kpis.filter((k) => k.actual !== null && !k.met).length;
  const missingDeps = dependencies.missing.length;
  const placeholderCount = placeholders.length;

  // Blocked: missing dependencies
  if (missingDeps > 0) {
    return 'BLOCKED';
  }

  // Critical failures: missing artifacts or failed validations
  if (missingArtifacts > 0 || failedValidations > 0) {
    return 'INCOMPLETE';
  }

  // Check if issues are covered by waiver
  const hasIssues = stubArtifacts > 0 || emptyArtifacts > 0 || missedKpis > 0 || placeholderCount > 0;

  if (hasIssues) {
    // If waiver exists and not expired, and debt is allowed
    if (hasWaiver && !waiverExpired && debtAllowed) {
      // Issues are waived - still complete but with tracked debt
      return 'COMPLETE';
    }

    // If waiver expired
    if (hasWaiver && waiverExpired) {
      return 'INCOMPLETE'; // Waiver expired, must fix
    }

    // Issues without waiver - needs human review
    return 'NEEDS_HUMAN';
  }

  // All checks passed
  return 'COMPLETE';
}

// =============================================================================
// Attestation Generation
// =============================================================================

/**
 * Generates an attestation from audit findings
 */
export function generateAttestation(
  taskId: string,
  findings: AuditFindings,
  runId?: string,
  notes?: string,
  outputDir?: string
): TaskAttestation {
  const verdict = determineVerdict(findings);
  const now = new Date().toISOString();

  // Build artifact hashes map
  const artifactHashes: Record<string, string> = {};
  for (const artifact of findings.artifacts) {
    if (artifact.sha256 && artifact.status === 'found') {
      artifactHashes[artifact.path] = artifact.sha256;
    }
  }

  // Convert validation results to schema format
  const validationResults: ValidationResultSchema[] = findings.validations.map((v) => ({
    name: v.taskId,
    command: v.command,
    exit_code: v.exitCode,
    passed: v.passed,
    timestamp: v.timestamp,
    duration_ms: v.durationMs,
    stdout_hash: v.stdoutHash,
  }));

  // Convert KPI results to schema format
  const kpiResults: KpiResultSchema[] = findings.kpis
    .filter((k) => k.actual !== null)
    .map((k) => ({
      kpi: k.kpi,
      target: k.target,
      actual: k.actual || '',
      met: k.met,
    }));

  // Convert DoD items
  const dodItems: DodItem[] = findings.definitionOfDone.details.map((d) => ({
    criterion: d.criterion,
    met: d.verified,
    evidence: d.evidence,
  }));

  // Build evidence summary
  const evidenceSummary: EvidenceSummary = {
    artifacts_verified: findings.artifacts.filter((a) => a.status === 'found').length,
    validations_passed: findings.validations.filter((v) => v.passed).length,
    validations_failed: findings.validations.filter((v) => !v.passed).length,
    gates_passed: 0, // Will be populated by gate runner
    gates_failed: 0,
    kpis_met: findings.kpis.filter((k) => k.met).length,
    kpis_missed: findings.kpis.filter((k) => k.actual !== null && !k.met).length,
    placeholders_found: findings.placeholders.length,
  };

  // Calculate schema path - use relative path if outputDir provided, otherwise use filename only
  const schemaRef = outputDir
    ? getRelativeSchemaPath(outputDir, 'ATTESTATION')
    : SCHEMA_FILES.ATTESTATION;

  return {
    $schema: schemaRef,
    schema_version: '1.0.0',
    task_id: taskId,
    run_id: runId,
    attestor: 'sprint-completion-auditor',
    attestation_timestamp: now,
    verdict,
    evidence_summary: evidenceSummary,
    artifact_hashes: artifactHashes,
    validation_results: validationResults,
    gate_results: [], // Will be populated by gate runner
    kpi_results: kpiResults,
    dependencies_verified: findings.dependencies.attestationsFound,
    definition_of_done_items: dodItems,
    notes,
  };
}

// =============================================================================
// Attestation I/O
// =============================================================================

/**
 * Gets the attestation directory for a task (sprint-based structure)
 */
export function getAttestationDir(repoRoot: string, taskId: string, sprintNumber: number = 0): string {
  return path.join(repoRoot, '.specify', 'sprints', `sprint-${sprintNumber}`, 'attestations', taskId);
}

/**
 * Gets the latest attestation file path for a task
 */
export function getAttestationPath(repoRoot: string, taskId: string, sprintNumber: number = 0): string {
  return path.join(getAttestationDir(repoRoot, taskId, sprintNumber), 'attestation-latest.json');
}

/**
 * Generates a timestamp-based filename for attestations
 */
function generateAttestationFilename(timestamp: string): string {
  // Convert ISO timestamp to safe filename: 2025-12-29T10:30:00.000Z -> 20251229-103000
  const safe = timestamp.replace(/[-:]/g, '').replace('T', '-').split('.')[0];
  return `attestation-${safe}.json`;
}

/**
 * Writes an attestation to timestamped file (preserves history)
 *
 * IMPORTANT: This does NOT overwrite previous attestations.
 * Each audit run creates a new timestamped file, preserving full history.
 * A -latest.json file is also maintained for convenience.
 */
export async function writeAttestation(
  repoRoot: string,
  attestation: TaskAttestation,
  sprintNumber: number = 0
): Promise<string> {
  const dir = getAttestationDir(repoRoot, attestation.task_id, sprintNumber);
  await fs.promises.mkdir(dir, { recursive: true });

  // Write timestamped file (preserves history)
  const timestampedFilename = generateAttestationFilename(attestation.attestation_timestamp);
  const timestampedPath = path.join(dir, timestampedFilename);
  await fs.promises.writeFile(timestampedPath, JSON.stringify(attestation, null, 2), 'utf-8');

  // Also write/update -latest.json for convenience
  const latestPath = path.join(dir, 'attestation-latest.json');
  await fs.promises.writeFile(latestPath, JSON.stringify(attestation, null, 2), 'utf-8');

  console.log(`Attestation written to: ${timestampedPath}`);
  console.log(`  (also updated: attestation-latest.json)`);
  return timestampedPath;
}

/**
 * Reads the latest attestation for a task
 */
export async function readAttestation(
  repoRoot: string,
  taskId: string,
  sprintNumber: number = 0
): Promise<TaskAttestation | null> {
  const latestPath = path.join(getAttestationDir(repoRoot, taskId, sprintNumber), 'attestation-latest.json');

  if (fs.existsSync(latestPath)) {
    const content = await fs.promises.readFile(latestPath, 'utf-8');
    return JSON.parse(content) as TaskAttestation;
  }

  // Fallback: try attestation.json in the same sprint-based directory
  const attestationPath = path.join(getAttestationDir(repoRoot, taskId, sprintNumber), 'attestation.json');
  if (fs.existsSync(attestationPath)) {
    const content = await fs.promises.readFile(attestationPath, 'utf-8');
    return JSON.parse(content) as TaskAttestation;
  }

  return null;
}

/**
 * Lists all attestation history for a task
 */
export async function listAttestationHistory(
  repoRoot: string,
  taskId: string,
  sprintNumber: number = 0
): Promise<TaskAttestation[]> {
  const dir = getAttestationDir(repoRoot, taskId, sprintNumber);

  if (!fs.existsSync(dir)) {
    return [];
  }

  const files = await fs.promises.readdir(dir);
  const history: TaskAttestation[] = [];

  for (const file of files) {
    // Match timestamped files like attestation-20251229-103000.json
    if (file.startsWith('attestation-') && file.endsWith('.json') && file !== 'attestation-latest.json') {
      try {
        const content = await fs.promises.readFile(path.join(dir, file), 'utf-8');
        history.push(JSON.parse(content) as TaskAttestation);
      } catch {
        // Skip invalid files
      }
    }
  }

  // Sort by timestamp (newest first)
  return history.sort((a, b) =>
    b.attestation_timestamp.localeCompare(a.attestation_timestamp)
  );
}

/**
 * Lists all attestations for a sprint
 */
export async function listSprintAttestations(
  repoRoot: string,
  taskIds: string[],
  sprintNumber: number = 0
): Promise<Map<string, TaskAttestation | null>> {
  const results = new Map<string, TaskAttestation | null>();

  for (const taskId of taskIds) {
    const attestation = await readAttestation(repoRoot, taskId, sprintNumber);
    results.set(taskId, attestation);
  }

  return results;
}

// =============================================================================
// Attestation Summary
// =============================================================================

export interface SprintAttestationSummary {
  sprintNumber: number;
  generatedAt: string;
  totalTasks: number;
  attestations: {
    complete: number;
    incomplete: number;
    partial: number;
    blocked: number;
    needsHuman: number;
    missing: number;
  };
  evidence: {
    artifactsVerified: number;
    validationsPassed: number;
    validationsFailed: number;
    kpisMet: number;
    kpisMissed: number;
    placeholdersFound: number;
  };
  tasks: Array<{
    taskId: string;
    verdict: AttestationVerdict | 'MISSING';
    issues: string[];
  }>;
}

/**
 * Generates a summary of attestations for a sprint
 */
export function generateSprintSummary(
  sprintNumber: number,
  attestations: Map<string, TaskAttestation | null>
): SprintAttestationSummary {
  const summary: SprintAttestationSummary = {
    sprintNumber,
    generatedAt: new Date().toISOString(),
    totalTasks: attestations.size,
    attestations: {
      complete: 0,
      incomplete: 0,
      partial: 0,
      blocked: 0,
      needsHuman: 0,
      missing: 0,
    },
    evidence: {
      artifactsVerified: 0,
      validationsPassed: 0,
      validationsFailed: 0,
      kpisMet: 0,
      kpisMissed: 0,
      placeholdersFound: 0,
    },
    tasks: [],
  };

  for (const [taskId, attestation] of attestations) {
    if (!attestation) {
      summary.attestations.missing++;
      summary.tasks.push({
        taskId,
        verdict: 'MISSING',
        issues: ['No attestation found'],
      });
      continue;
    }

    // Count by verdict
    switch (attestation.verdict) {
      case 'COMPLETE':
        summary.attestations.complete++;
        break;
      case 'INCOMPLETE':
        summary.attestations.incomplete++;
        break;
      case 'PARTIAL':
        summary.attestations.partial++;
        break;
      case 'BLOCKED':
        summary.attestations.blocked++;
        break;
      case 'NEEDS_HUMAN':
        summary.attestations.needsHuman++;
        break;
    }

    // Aggregate evidence
    summary.evidence.artifactsVerified += attestation.evidence_summary.artifacts_verified;
    summary.evidence.validationsPassed += attestation.evidence_summary.validations_passed;
    summary.evidence.validationsFailed += attestation.evidence_summary.validations_failed;
    summary.evidence.kpisMet += attestation.evidence_summary.kpis_met;
    summary.evidence.kpisMissed += attestation.evidence_summary.kpis_missed;
    summary.evidence.placeholdersFound += attestation.evidence_summary.placeholders_found;

    // Collect issues
    const issues: string[] = [];
    if (attestation.evidence_summary.validations_failed > 0) {
      issues.push(`${attestation.evidence_summary.validations_failed} validation(s) failed`);
    }
    if (attestation.evidence_summary.kpis_missed > 0) {
      issues.push(`${attestation.evidence_summary.kpis_missed} KPI(s) missed`);
    }
    if (attestation.evidence_summary.placeholders_found > 0) {
      issues.push(`${attestation.evidence_summary.placeholders_found} placeholder(s) found`);
    }

    summary.tasks.push({
      taskId,
      verdict: attestation.verdict,
      issues,
    });
  }

  return summary;
}
