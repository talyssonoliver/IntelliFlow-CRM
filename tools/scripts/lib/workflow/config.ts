/**
 * Workflow Configuration
 *
 * Single source of truth for workflow rules, steps, and behavior.
 * Used by both UI and CLI to ensure consistent execution.
 */

import type { WorkflowSession, WorkflowStatus, StoaType } from './types';

/**
 * Session configuration - defines each workflow session
 */
export const SESSION_CONFIG = {
  spec: {
    name: 'SESSION 1: Spec',
    description: 'Generate task specification from requirements',
    cliCommand: '/spec-session',
    apiEndpoint: '/api/matop/spec',
    startStatus: 'Specifying' as WorkflowStatus,
    successStatus: 'Spec Complete' as WorkflowStatus,
    failureStatus: 'Backlog' as WorkflowStatus, // Return to backlog on spec failure
    outputArtifact: 'spec',
    outputPath: (sprintNumber: number, taskId: string) =>
      `.specify/sprints/sprint-${sprintNumber}/specifications/${taskId}-spec.md`,
  },
  plan: {
    name: 'SESSION 2: Plan',
    description: 'Generate TDD implementation plan from specification',
    cliCommand: '/plan-session',
    apiEndpoint: '/api/matop/plan',
    startStatus: 'Planning' as WorkflowStatus,
    successStatus: 'Plan Complete' as WorkflowStatus,
    failureStatus: 'Spec Complete' as WorkflowStatus, // Return to spec complete on plan failure
    outputArtifact: 'plan',
    outputPath: (sprintNumber: number, taskId: string) =>
      `.specify/sprints/sprint-${sprintNumber}/planning/${taskId}-plan.md`,
    prerequisite: 'spec', // Must have spec first
  },
  exec: {
    name: 'SESSION 3: Exec',
    description: 'Implement task using TDD and validate with MATOP',
    cliCommand: '/exec',
    apiEndpoint: '/api/sprint/execute',
    startStatus: 'In Progress' as WorkflowStatus,
    successStatus: 'Completed' as WorkflowStatus,
    failureStatus: 'Failed' as WorkflowStatus, // Mark as failed, don't rollback
    outputArtifact: 'delivery',
    outputPath: (sprintNumber: number, taskId: string, runId: string) =>
      `.specify/sprints/sprint-${sprintNumber}/execution/${taskId}/${runId}/${taskId}-delivery.md`,
    prerequisite: 'plan', // Must have plan first
  },
} as const;

/**
 * Valid status transitions
 * Maps current status to valid next statuses
 */
export const STATUS_TRANSITIONS: Record<WorkflowStatus, WorkflowStatus[]> = {
  Backlog: ['Planned', 'Specifying'],
  Planned: ['Specifying', 'Backlog'],
  Specifying: ['Spec Complete', 'Backlog', 'Blocked'],
  'Spec Complete': ['Planning', 'Specifying'], // Can re-spec if needed
  Planning: ['Plan Complete', 'Spec Complete', 'Blocked'],
  'Plan Complete': ['In Progress', 'Planning'], // Can re-plan if needed
  'In Progress': ['Validating', 'Completed', 'Failed', 'Blocked', 'Needs Human'],
  Validating: ['Completed', 'In Progress', 'Failed'], // Can return to In Progress for fixes
  Completed: ['In Review'], // Only forward to review
  Failed: ['In Progress', 'Plan Complete', 'Blocked'], // Can retry or investigate
  Blocked: ['Backlog', 'Planned', 'In Progress'], // Can unblock to various states
  'Needs Human': ['In Progress', 'Blocked', 'Failed'],
  'In Review': ['Completed', 'In Progress'], // Approve or request changes
};

/**
 * Statuses that allow starting a session
 */
export const SESSION_START_STATUSES: Record<WorkflowSession, WorkflowStatus[]> = {
  spec: ['Backlog', 'Planned', 'Spec Complete', 'Planning', 'Plan Complete'], // Can re-spec from various states
  plan: ['Spec Complete', 'Plan Complete'], // Must have spec, can re-plan
  exec: ['Plan Complete', 'Failed'], // Must have plan, can retry after failure
};

/**
 * Statuses that prevent starting a session
 */
export const SESSION_BLOCKED_STATUSES: Record<WorkflowSession, WorkflowStatus[]> = {
  spec: ['Specifying', 'Completed'], // Already specifying or done
  plan: ['Planning', 'Completed'], // Already planning or done
  exec: ['In Progress', 'Validating', 'Completed'], // Already executing or done
};

/**
 * STOA assignment rules based on task ID prefix
 */
export const STOA_PREFIX_RULES: Record<string, StoaType> = {
  'ENV-': 'Foundation',
  'EP-': 'Foundation',
  'IFC-': 'Domain',
  'EXC-SEC-': 'Security',
  'SEC-': 'Security',
  'AI-': 'Intelligence',
  'AI-SETUP-': 'Intelligence',
  'AUTOMATION-': 'Automation',
  'PG-': 'Foundation', // Page components
};

/**
 * STOA keyword triggers for supporting STOAs
 */
export const STOA_KEYWORD_TRIGGERS: Record<StoaType, string[]> = {
  Foundation: ['docker', 'ci', 'deployment', 'infra', 'observability', 'monitoring', 'build', 'webpack', 'turbo'],
  Security: ['auth', 'jwt', 'token', 'secret', 'vault', 'rbac', 'permission', 'rate-limit', 'csrf', 'xss', 'injection'],
  Quality: ['coverage', 'e2e', 'test', 'vitest', 'playwright', 'mutation', 'quality', 'a11y', 'accessibility'],
  Domain: ['flow', 'business', 'domain', 'aggregate', 'entity', 'value-object', 'ddd'],
  Intelligence: ['prompt', 'agent', 'chain', 'embedding', 'llm', 'langchain', 'crewai', 'ai', 'ml'],
  Automation: ['pipeline', 'workflow', 'automation', 'cron', 'scheduled', 'trigger'],
};

/**
 * MATOP consensus rules
 */
export const MATOP_CONSENSUS = {
  /** If any STOA returns FAIL, overall verdict is FAIL */
  failOnAnyFail: true,
  /** If any STOA returns NEEDS_HUMAN, overall verdict is NEEDS_HUMAN */
  needsHumanOnAny: true,
  /** If no FAIL but any WARN, overall verdict is WARN */
  warnOnAnyWarn: true,
  /** Minimum number of STOAs that must pass for overall PASS */
  minPassCount: 1,
};

/**
 * TDD phase configuration
 */
export const TDD_CONFIG = {
  phases: ['red', 'green', 'refactor'] as const,
  /** Run tests after each phase */
  testAfterEachPhase: true,
  /** Fail fast if a phase fails */
  failFast: true,
  /** Maximum retries per phase */
  maxRetries: 2,
};

/**
 * Output directory structure (Sprint-Based)
 *
 * All paths now use sprint-based structure: .specify/sprints/sprint-{N}/...
 * sprintNumber is required as the first parameter.
 */
export const OUTPUT_PATHS = {
  /** Base directory for sprint */
  base: (sprintNumber: number) => `.specify/sprints/sprint-${sprintNumber}`,
  /** Context from Phase 0 */
  context: (sprintNumber: number, taskId: string) =>
    `.specify/sprints/sprint-${sprintNumber}/context/${taskId}`,
  /** Specifications from Phase 1 */
  specifications: (sprintNumber: number) =>
    `.specify/sprints/sprint-${sprintNumber}/specifications`,
  /** Plans from Phase 2 */
  planning: (sprintNumber: number) =>
    `.specify/sprints/sprint-${sprintNumber}/planning`,
  /** Attestations for completed work */
  attestations: (sprintNumber: number, taskId: string) =>
    `.specify/sprints/sprint-${sprintNumber}/attestations/${taskId}`,
  /** Execution artifacts from Phase 3 */
  execution: (sprintNumber: number, taskId: string, runId: string) =>
    `.specify/sprints/sprint-${sprintNumber}/execution/${taskId}/${runId}`,
  /** MATOP evidence within execution */
  matop: (sprintNumber: number, taskId: string, runId: string) =>
    `.specify/sprints/sprint-${sprintNumber}/execution/${taskId}/${runId}/matop`,
  /** Gate logs within MATOP */
  gates: (sprintNumber: number, taskId: string, runId: string) =>
    `.specify/sprints/sprint-${sprintNumber}/execution/${taskId}/${runId}/matop/gates`,
  /** STOA verdicts within MATOP */
  verdicts: (sprintNumber: number, taskId: string, runId: string) =>
    `.specify/sprints/sprint-${sprintNumber}/execution/${taskId}/${runId}/matop/stoa-verdicts`,
};

/**
 * File naming conventions
 */
export const FILE_NAMES = {
  spec: (taskId: string) => `${taskId}-spec.md`,
  plan: (taskId: string) => `${taskId}-plan.md`,
  delivery: (taskId: string) => `${taskId}-delivery.md`,
  context: (taskId: string) => `${taskId}-hydrated-context.json`,
  agentSelection: (taskId: string) => `${taskId}-agent-selection.json`,
  stepsCompleted: 'steps-completed.json',
  filesModified: 'files-modified.json',
  gateSelection: 'gate-selection.json',
  summary: 'summary.json',
  evidenceHashes: 'evidence-hashes.txt',
};
