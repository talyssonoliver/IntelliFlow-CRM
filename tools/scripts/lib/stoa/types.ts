/**
 * STOA (Specialised Task Ownership Agent) Framework Types
 *
 * Core type definitions for the STOA governance system.
 * Based on Framework.md v4.3 FINAL.
 *
 * @module tools/scripts/lib/stoa/types
 */

// ============================================================================
// STOA Roles
// ============================================================================

export type StoaRole =
  | 'Foundation'
  | 'Domain'
  | 'Intelligence'
  | 'Security'
  | 'Quality'
  | 'Automation';

export const STOA_ROLES: readonly StoaRole[] = [
  'Foundation',
  'Domain',
  'Intelligence',
  'Security',
  'Quality',
  'Automation',
] as const;

// ============================================================================
// Task Types
// ============================================================================

export interface Task {
  taskId: string;
  section?: string;
  description?: string;
  owner?: string;
  status?: string;
  dependencies?: string[];
  definitionOfDone?: string;
  targetSprint?: string;
  affectedPaths?: string[];
}

// ============================================================================
// Audit Matrix Types
// ============================================================================

export interface AuditMatrixTool {
  id: string;
  tier: 1 | 2 | 3;
  enabled: boolean;
  required: boolean;
  owner: string;
  scope: 'workspace' | 'repo' | 'git';
  command: string | null;
  thresholds?: Record<string, number | string>;
  expected_outputs?: string[];
  requires_env?: string[];
  order?: number;
  timeout_seconds?: number;
  ci_workflow?: string;
  stoas?: StoaRole[];
}

export interface AuditMatrix {
  schema_version: string;
  last_updated: string;
  maintainer: string;
  tools: AuditMatrixTool[];
}

// ============================================================================
// Gate Selection Types
// ============================================================================

export interface GateSelectionResult {
  execute: string[];
  waiverRequired: string[];
  skipped: string[];
}

export interface GateExecutionResult {
  toolId: string;
  exitCode: number;
  logPath: string;
  passed: boolean;
  duration: number;
  stdout?: string;
  stderr?: string;
}

// ============================================================================
// STOA Assignment Types
// ============================================================================

export interface StoaAssignment {
  taskId: string;
  leadStoa: StoaRole;
  supportingStoas: StoaRole[];
  derivedFrom: {
    prefix: boolean;
    keywords: string[];
    affectedPaths: string[];
    dependencies: string[];
  };
}

// ============================================================================
// Waiver Types
// ============================================================================

export type WaiverReason =
  | 'tool_not_installed'
  | 'env_var_missing'
  | 'known_false_positive'
  | 'deferred_to_sprint_N'
  | 'infrastructure_not_ready';

export interface WaiverRecord {
  toolId: string;
  reason: WaiverReason;
  owner: string;
  createdAt: string;
  expiresAt: string | null;
  approved: boolean;
  strictModeBehavior: 'WARN' | 'FAIL';
  justification?: string;
}

// ============================================================================
// STOA Verdict Types
// ============================================================================

export type VerdictType = 'PASS' | 'WARN' | 'FAIL' | 'NEEDS_HUMAN';

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface Finding {
  severity: FindingSeverity;
  source: string;
  message: string;
  recommendation: string;
}

export interface StoaVerdict {
  stoa: StoaRole;
  taskId: string;
  verdict: VerdictType;
  rationale: string;
  toolIdsSelected: string[];
  toolIdsExecuted: string[];
  waiversProposed: string[];
  findings: Finding[];
  timestamp: string;
}

// ============================================================================
// CSV Governance Types
// ============================================================================

export interface CsvRowChange {
  taskId: string;
  field: string;
  oldValue: string;
  newValue: string;
}

export interface CsvPatchProposal {
  runId: string;
  taskId: string;
  proposedAt: string;
  proposedBy: string;
  changes: CsvRowChange[];
  rationale: string;
  evidenceRefs: string[];
}

// ============================================================================
// Evidence Bundle Types
// ============================================================================

export interface EvidenceHash {
  path: string;
  sha256: string;
  size: number;
}

export interface EvidenceBundle {
  runId: string;
  taskId: string;
  timestamp: string;
  hashes: EvidenceHash[];
  gateSelection: GateSelectionResult;
  gateResults: GateExecutionResult[];
  waivers: WaiverRecord[];
  stoaVerdicts: StoaVerdict[];
  csvPatchProposal?: CsvPatchProposal;
}

export interface RunSummary {
  runId: string;
  taskId: string;
  startedAt: string;
  completedAt: string;
  resolvedCsvPath: string;
  strictMode: boolean;
  stoaAssignment: StoaAssignment;
  gateSelection: GateSelectionResult;
  finalVerdict: VerdictType;
  evidenceHashes: EvidenceHash[];
  waiverCount: number;
  findingsCount: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
}

// ============================================================================
// Status Mapping Types
// ============================================================================

export type CsvStatus = 'Completed' | 'Blocked' | 'In Progress' | 'Needs Human' | 'Planned';

export const VERDICT_TO_CSV_STATUS: Record<VerdictType, CsvStatus> = {
  PASS: 'Completed',
  WARN: 'Completed',
  FAIL: 'Blocked',
  NEEDS_HUMAN: 'Needs Human',
} as const;

// ============================================================================
// Human Packet Types
// ============================================================================

export interface HumanPacket {
  taskId: string;
  runId: string;
  createdAt: string;
  failingCommands: Array<{ command: string; exitCode: number }>;
  lastLogLines: string[];
  reproductionSteps: string[];
  suspectedRootCause: string;
  rollbackSuggestion?: string;
  recommendedNextAttempt: string;
}

// ============================================================================
// Path Validation Types
// ============================================================================

export interface PathResolutionResult {
  path: string | null;
  source: 'env' | 'canonical' | 'fallback' | 'not_found';
  severity: 'PASS' | 'WARN' | 'FAIL';
  message: string;
}

export interface UniquenessCheckResult {
  artifact: string;
  matchCount: number;
  matches: string[];
  severity: 'PASS' | 'FAIL';
  message: string;
}

// ============================================================================
// Preflight Check Types
// ============================================================================

export interface PreflightResult {
  passed: boolean;
  pathResolution: PathResolutionResult;
  uniquenessChecks: UniquenessCheckResult[];
  toolAvailability: Array<{
    toolId: string;
    available: boolean;
    reason?: string;
  }>;
  envVarChecks: Array<{
    toolId: string;
    variable: string;
    present: boolean;
  }>;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface StoaConfig {
  repoRoot: string;
  strictMode: boolean;
  auditMatrixPath: string;
  sprintPlanPath?: string;
  evidenceOutputDir: string;
  dryRun?: boolean;
}
