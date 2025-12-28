/**
 * Sprint Orchestrator Types
 *
 * Core type definitions for the Sprint Orchestrator system that coordinates
 * SWARM (implementation) and MATOP (validation) execution across sprint phases.
 */

// =============================================================================
// Task Types
// =============================================================================

export type TaskStatus =
  | 'pending'
  | 'planned'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'needs_human'
  | 'blocked';

export type ExecutionMode = 'swarm' | 'matop' | 'manual';

export interface TaskPhaseEntry {
  taskId: string;
  description: string;
  section: string;
  owner: string;
  status: TaskStatus;
  dependencies: string[];
  parallelStreamId?: string;
  executionMode: ExecutionMode;
  definitionOfDone?: string;
  kpis?: string;
  artifactsToTrack?: string;
  validationMethod?: string;
}

// =============================================================================
// Phase Types
// =============================================================================

export type PhaseExecutionType = 'sequential' | 'parallel';

export interface ExecutionPhase {
  phaseNumber: number;
  name: string;
  executionType: PhaseExecutionType;
  tasks: TaskPhaseEntry[];
  estimatedDurationMinutes: number;
  blockedBy: string[];
}

export interface PhaseProgress {
  phaseNumber: number;
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  inProgressTasks: number;
  startedAt?: string;
  completedAt?: string;
}

// =============================================================================
// Parallel Stream Types
// =============================================================================

export interface ParallelStream {
  streamId: string; // A, B, C, etc.
  name: string;
  tasks: string[];
  sharedDependencies: string[];
  canRunWith: string[]; // Other stream IDs that can run concurrently
}

export interface DependencySignature {
  signature: string; // Sorted, joined dependency IDs
  tasks: string[];
}

// =============================================================================
// Sub-Agent Types
// =============================================================================

export type SubAgentType = 'swarm' | 'matop';

export type SubAgentStatus = 'spawned' | 'running' | 'completed' | 'failed' | 'timeout';

export interface SubAgentInfo {
  agentId: string;
  taskId: string;
  type: SubAgentType;
  status: SubAgentStatus;
  phase: number;
  streamId?: string;
  spawnedAt: string;
  completedAt?: string;
  error?: string;
  output?: string;
}

// =============================================================================
// Sprint Execution State
// =============================================================================

export interface SprintExecutionState {
  sprintNumber: number;
  runId: string;
  startedAt: string;
  completedAt?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused';
  currentPhase: number;
  totalPhases: number;
  phaseProgress: PhaseProgress[];
  activeSubAgents: SubAgentInfo[];
  completedTasks: string[];
  failedTasks: string[];
  needsHumanTasks: string[];
  blockers: BlockerInfo[];
}

export interface BlockerInfo {
  taskId: string;
  reason: string;
  raisedAt: string;
  resolvedAt?: string;
  resolution?: string;
}

// =============================================================================
// API Request/Response Types
// =============================================================================

// POST /api/sprint/generate-prompt
export interface GeneratePromptRequest {
  sprintNumber: number;
  format?: 'markdown' | 'json';
  outputPath?: string;
}

export interface GeneratePromptResponse {
  success: boolean;
  markdown?: string;
  json?: SprintPromptData;
  savedTo?: string;
  error?: string;
}

// GET /api/sprint/phases
export interface PhasesResponse {
  sprintNumber: number;
  totalTasks: number;
  phases: ExecutionPhase[];
  parallelStreams: ParallelStream[];
  dependencyGraph: DependencyGraphSummary;
}

export interface DependencyGraphSummary {
  totalNodes: number;
  readyToStart: string[];
  blocked: string[];
  completed: string[];
}

// POST /api/sprint/execute
export interface ExecuteRequest {
  sprintNumber: number;
  dryRun?: boolean;
  startFromPhase?: number;
  taskFilter?: string[]; // Only execute these tasks
}

export interface ExecuteResponse {
  success: boolean;
  runId: string;
  dryRun: boolean;
  phases: ExecutionPhase[];
  estimatedDurationMinutes: number;
  error?: string;
}

// GET /api/sprint/status
export interface StatusResponse {
  runId: string;
  state: SprintExecutionState;
  elapsedMinutes: number;
  estimatedRemainingMinutes: number;
}

// =============================================================================
// Sprint Prompt Data
// =============================================================================

export interface SprintPromptData {
  missionBrief: MissionBrief;
  overview: SprintOverview;
  dependencyGraph: string; // ASCII visualization
  executionStrategy: ExecutionStrategySection;
  taskSpecifications: TaskSpecification[];
  successCriteria: SuccessCriterion[];
  definitionOfDone: string[];
}

export interface MissionBrief {
  project: string;
  sprintNumber: number;
  theme: string;
  timeline: string;
  deliverables: string[];
}

export interface SprintOverview {
  totalTasks: number;
  bySection: Record<string, number>;
  byExecutionMode: Record<ExecutionMode, number>;
  parallelStreamCount: number;
}

export interface ExecutionStrategySection {
  phases: PhaseStrategyEntry[];
  parallelSpawnSyntax: string[];
}

export interface PhaseStrategyEntry {
  phaseNumber: number;
  name: string;
  executionType: PhaseExecutionType;
  taskCount: number;
  parallelStreams?: string[];
  description: string;
}

export interface TaskSpecification {
  taskId: string;
  section: string;
  description: string;
  context: string;
  prerequisites: string[];
  tasks: string[];
  validation: string[];
  kpis: string[];
  artifacts: string[];
  executionMode: ExecutionMode;
  dependencies: string[];
}

export interface SuccessCriterion {
  category: string;
  metric: string;
  target: string;
  validationMethod: string;
}

// =============================================================================
// Event Types (for progress tracking)
// =============================================================================

export type SprintEventType =
  | 'sprint_started'
  | 'sprint_completed'
  | 'sprint_failed'
  | 'phase_started'
  | 'phase_completed'
  | 'phase_failed'
  | 'task_started'
  | 'task_completed'
  | 'task_failed'
  | 'task_needs_human'
  | 'subagent_spawned'
  | 'subagent_completed'
  | 'subagent_failed'
  | 'blocker_raised'
  | 'blocker_resolved';

export interface SprintEvent {
  type: SprintEventType;
  timestamp: string;
  runId: string;
  sprintNumber: number;
  phaseNumber?: number;
  taskId?: string;
  agentId?: string;
  details?: Record<string, unknown>;
}

// =============================================================================
// Configuration Types
// =============================================================================

export interface SprintOrchestratorConfig {
  maxParallelAgents: number;
  taskTimeoutMinutes: number;
  phaseTimeoutMinutes: number;
  autoRetryOnFailure: boolean;
  maxRetries: number;
  swarmConfig: SwarmConfig;
  matopConfig: MatopConfig;
}

export interface SwarmConfig {
  orchestratorPath: string;
  phases: string[]; // ['architect', 'enforcer', 'builder', 'gatekeeper', 'auditor']
  qualitativeReviewPath: string;
  blockersPath: string;
}

export interface MatopConfig {
  executorPath: string;
  stoaAgents: string[]; // ['foundation', 'domain', 'security', 'quality', 'intelligence', 'automation']
  evidencePath: string;
  attestationPath: string;
}

// =============================================================================
// Utility Types
// =============================================================================

export interface CSVTask {
  'Task ID': string;
  Section: string;
  Description: string;
  Owner: string;
  Dependencies: string;
  'Pre-requisites': string;
  'Definition of Done': string;
  KPIs: string;
  'Target Sprint': string;
  'Artifacts To Track': string;
  'Validation Method': string;
  Status: string;
}

export function csvTaskToPhaseEntry(csvTask: CSVTask): TaskPhaseEntry {
  const section = csvTask.Section.toLowerCase();
  let executionMode: ExecutionMode = 'manual';

  // Determine execution mode based on section keywords
  if (
    section.includes('implementation') ||
    section.includes('development') ||
    section.includes('coding') ||
    csvTask['Task ID'].startsWith('IFC-') ||
    csvTask['Task ID'].startsWith('PG-')
  ) {
    executionMode = 'swarm';
  } else if (
    section.includes('validation') ||
    section.includes('security') ||
    section.includes('quality') ||
    csvTask['Task ID'].startsWith('EXC-')
  ) {
    executionMode = 'matop';
  }

  return {
    taskId: csvTask['Task ID'],
    description: csvTask.Description,
    section: csvTask.Section,
    owner: csvTask.Owner,
    status: mapCSVStatus(csvTask.Status),
    dependencies: csvTask.Dependencies ? csvTask.Dependencies.split(',').map((d) => d.trim()) : [],
    executionMode,
    definitionOfDone: csvTask['Definition of Done'],
    kpis: csvTask.KPIs,
    artifactsToTrack: csvTask['Artifacts To Track'],
    validationMethod: csvTask['Validation Method'],
  };
}

function mapCSVStatus(status: string): TaskStatus {
  const statusMap: Record<string, TaskStatus> = {
    Backlog: 'pending',
    Planned: 'planned',
    'In Progress': 'in_progress',
    Completed: 'completed',
    Done: 'completed',
    Failed: 'failed',
    Blocked: 'blocked',
    'Needs Human': 'needs_human',
  };
  return statusMap[status] || 'pending';
}

export function generateRunId(sprintNumber: number | 'all'): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:]/g, '').slice(0, 15);
  const random = Math.random().toString(36).substring(2, 8);
  return `sprint${sprintNumber}-${timestamp}-${random}`;
}

export function getStreamLetter(index: number): string {
  return String.fromCharCode(65 + index); // A, B, C, ...
}
