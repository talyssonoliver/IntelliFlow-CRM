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
  targetSprint?: string | number;
  affectedPaths?: string[];
  kpis?: string;
  prerequisites?: string;
  validationMethod?: string;
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
  run_id: string;
  runId: string;
  taskId: string;
  started_at: string;
  finished_at: string;
  startedAt: string;
  completedAt: string;
  mode: string;
  scope: string;
  resolvedCsvPath: string;
  strictMode: boolean;
  stoaAssignment: StoaAssignment;
  gateSelection: GateSelectionResult;
  /** @deprecated Use result.overall_status instead */
  finalVerdict: VerdictType;
  /** UI-compatible result object */
  result: {
    overall_status: VerdictType;
  };
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

// ============================================================================
// Hydrated Context Types
// ============================================================================

/**
 * Dependency artifact with paths to spec, plan, attestation, and code files
 */
export interface DependencyArtifact {
  taskId: string;
  status?: string;
  hasSpec?: boolean;
  hasPlan?: boolean;
  specPath?: string;
  planPath?: string;
  attestationPath?: string;
  deliveryPath?: string;
  codeFiles?: string[];
  interfaces?: string[];
  patterns?: string[];
}

/**
 * Codebase pattern found during context hydration
 */
export interface CodebasePattern {
  filePath: string;
  lineNumber: number;
  keyword: string;
  snippet?: string;
  relevanceScore?: number;
}

/**
 * Project knowledge gathered during hydration
 */
export interface ProjectKnowledge {
  claudeMd?: string;
  architectureDocs?: string[];
  domainModels?: string[];
  schemas?: string[];
}

/**
 * Source of hydration data for traceability
 */
export interface HydrationSource {
  type: 'csv' | 'file' | 'grep' | 'glob' | 'task_metadata' | 'dependency_artifact' | 'codebase_pattern' | 'project_knowledge';
  path?: string;
  query?: string;
  timestamp?: string;
  loadedAt?: string;
}

/**
 * Full hydrated context for agent discussion
 */
export interface HydratedContext {
  taskId: string;
  taskMetadata: Task;
  section?: string;
  description?: string;
  definitionOfDone?: string;
  kpis?: string;
  prerequisites?: string;
  dependencies?: string[];
  artifacts?: string[];
  codebasePatterns: CodebasePattern[];
  relevantFiles?: string[];
  dependencyArtifacts: DependencyArtifact[];
  projectKnowledge?: ProjectKnowledge;
  sources?: HydrationSource[];
  hydratedAt?: string;
  contextHash?: string;
}

// ============================================================================
// Agent Types
// ============================================================================

/**
 * Agent role identifiers used in spec sessions
 * Human-readable names for better UX in discussion logs
 */
export type AgentRole =
  | 'Backend-Architect'
  | 'Frontend-Lead'
  | 'AI-Specialist'
  | 'Security-Lead'
  | 'DevOps-Lead'
  | 'Data-Engineer'
  | 'A11y-Expert'
  | 'Compliance'
  | 'Domain-Expert'
  | 'Test-Engineer';

/**
 * All available agent roles as const array for iteration
 */
export const AGENT_ROLES: readonly AgentRole[] = [
  'Backend-Architect',
  'Frontend-Lead',
  'AI-Specialist',
  'Security-Lead',
  'DevOps-Lead',
  'Data-Engineer',
  'A11y-Expert',
  'Compliance',
  'Domain-Expert',
  'Test-Engineer',
] as const;

/**
 * Agent profile with expertise and trigger conditions
 */
export interface AgentProfile {
  role: AgentRole;
  expertise: string[];
  triggerKeywords: RegExp;
  triggerPaths: RegExp[];
  alwaysInclude: boolean;
  priority: number;
}

/**
 * Result of agent selection for a task
 */
export interface AgentSelection {
  taskId: string;
  selectedAgents: AgentRole[];
  rationale?: string;
  domain?: string;
  taskDomain?: string;
  selectedAt?: string;
  selectionRationale?: Record<string, string>;
}

// ============================================================================
// Spec Session Types
// ============================================================================

export type SpecRoundType = 'ANALYSIS' | 'PROPOSAL' | 'CHALLENGE' | 'CONSENSUS';

export interface AgentContribution {
  agent: string;
  interpretation?: string;
  questions?: string[];
  concerns?: string[];
  proposal?: string;
  challenges?: string[];
  consensus?: string;
  timestamp: string;
}

export interface SpecSessionRound {
  roundNumber: number;
  roundType: SpecRoundType;
  topic: string;
  contributions: AgentContribution[];
  startedAt: string;
  completedAt?: string;
  consensusReached: boolean;
}

export interface SpecSession {
  sessionId: string;
  taskId: string;
  hydratedContext: HydratedContext;
  selectedAgents: AgentSelection;
  rounds: SpecSessionRound[];
  status: 'in_progress' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
}

// ============================================================================
// Specification Document Types
// ============================================================================

export interface SpecComponent {
  name: string;
  type: string;
  location: string;
  purpose: string;
}

export interface SpecIntegrationPoint {
  integratsWith: string;
  how: string;
  contract: string;
}

export interface SpecRisk {
  risk: string;
  mitigation: string;
}

export interface SpecificationDocument {
  taskId: string;
  sessionId: string;
  overview: string;
  technicalApproach: string;
  components: SpecComponent[];
  interfaces: string;
  integrationPoints: SpecIntegrationPoint[];
  acceptanceCriteria: string[];
  testRequirements: {
    unitTests: string[];
    integrationTests: string[];
    edgeCases: string[];
  };
  risks: SpecRisk[];
  agentSignoffs: Record<string, boolean>;
  generatedAt: string;
}
