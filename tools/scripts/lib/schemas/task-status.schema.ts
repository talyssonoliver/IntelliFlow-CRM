/**
 * Task Status Schema Definition
 *
 * This is the SINGLE SOURCE OF TRUTH for the task status structure.
 * The JSON schema is auto-generated from this Zod definition.
 *
 * To regenerate JSON schema: pnpm run generate:schemas
 */

import { z } from 'zod';

// ISO 8601 datetime pattern - accepts Z suffix or +/-HH:MM offset
const isoDatetimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

// Helper for lenient datetime validation (accepts both Z and offset formats)
const lenientDatetime = () => z.string().regex(isoDatetimePattern, 'Invalid ISO datetime');

// SHA256 hash pattern
const sha256Pattern = /^[a-f0-9]{64}$/;

// Task ID pattern
const taskIdPattern = /^[A-Z]+-[A-Z0-9-]+$/;

// Task status values (supports both uppercase and title case for backwards compatibility)
export const taskStatusSchema = z.enum([
  'PLANNED',
  'Planned',
  'BACKLOG',
  'Backlog',
  'IN_PROGRESS',
  'In Progress',
  'VALIDATING',
  'Validating',
  'DONE',
  'Completed',
  'BLOCKED',
  'Blocked',
  'FAILED',
  'Failed',
  'NEEDS_HUMAN',
  'Needs Human',
  'IN_REVIEW',
  'In Review',
]);

// Dependencies object
export const taskDependenciesSchema = z.object({
  required: z.array(z.string()).describe('List of prerequisite task IDs'),
  verified_at: lenientDatetime().nullable().optional().describe('ISO 8601 timestamp when dependencies were verified (null if not yet verified)'),
  all_satisfied: z.boolean().describe('Whether all dependencies are satisfied'),
  notes: z.string().optional().describe('Additional notes about dependency status'),
});

// Status history entry
export const statusHistoryEntrySchema = z.object({
  status: taskStatusSchema,
  at: lenientDatetime(),
  note: z.string().optional(),
});

// Execution details
export const executionSchema = z.object({
  started_at: lenientDatetime().nullable().optional().describe('When execution started (null if not started)'),
  completed_at: lenientDatetime().nullable().optional().describe('When execution completed (null if not completed)'),
  duration_minutes: z.number().nullable().optional().describe('Execution duration in minutes'),
  executor: z.string().optional().describe('Who/what executed the task (human, agent, etc.)'),
  agents: z.array(z.string()).optional().describe('List of AI agents involved in execution'),
  execution_log: z.string().optional().describe('Path to detailed execution log file'),
  log_path: z.string().optional().describe('Alternative path to execution log (alias for execution_log)'),
  retry_count: z.number().int().min(0).optional().default(0).describe('Number of retry attempts'),
  last_error: z.string().nullable().optional().describe('Last error message if task failed (null if no error)'),
});

// Artifact entry (detailed format with hash verification)
export const artifactEntrySchema = z.object({
  path: z.string(),
  sha256: z.string().regex(sha256Pattern),
  created_at: lenientDatetime(),
});

// Artifact item - accepts either a string path or a detailed object
// This provides backwards compatibility with older files that just list paths
export const artifactItemSchema = z.union([
  z.string().describe('Simple file path'),
  artifactEntrySchema.describe('Detailed artifact with hash verification'),
]);

// Missing reason - can be a simple string or a detailed object mapping reasons by artifact
export const missingReasonSchema = z.union([
  z.string().describe('Simple explanation for missing artifacts'),
  z.record(z.string(), z.object({
    reason: z.string(),
  }).passthrough()).describe('Detailed explanations by artifact key'),
]);

// Artifacts object
export const artifactsSchema = z.object({
  expected: z.array(z.string()).optional().describe('List of expected file paths or patterns'),
  created: z.array(artifactItemSchema).optional().describe('Artifacts actually created - can be paths or detailed objects with hashes'),
  missing: z.array(z.string()).optional().describe('Expected artifacts that were not created'),
  missing_reason: missingReasonSchema.optional().describe('Explanation for why artifacts are missing - can be string or object'),
});

// Validation entry
export const validationEntrySchema = z.object({
  name: z.string(),
  command: z.string(),
  executed_at: lenientDatetime(),
  exit_code: z.number().int(),
  duration_ms: z.number().int().optional(),
  stdout_hash: z.string().optional().describe('SHA256 hash of stdout for verification'),
  passed: z.boolean(),
});

// KPI entry - target and actual can be any type
export const kpiEntrySchema = z.object({
  target: z.union([z.string(), z.number(), z.boolean()]).describe('Target value for the KPI'),
  actual: z.union([z.string(), z.number(), z.boolean()]).describe('Actual measured value'),
  met: z.boolean().describe('Whether target was met'),
  unit: z.string().optional(),
});

// Blocker entry
export const blockerEntrySchema = z.object({
  description: z.string(),
  raised_at: lenientDatetime(),
  resolved_at: lenientDatetime().nullable().optional(),
  resolution: z.string().optional(),
});

// =============================================================================
// PMBOK Schedule Management Schemas (Phase 040 - Target Completion)
// =============================================================================

// Dependency relationship types per PMBOK
export const dependencyTypeSchema = z.enum([
  'FS', // Finish-to-Start (default)
  'FF', // Finish-to-Finish
  'SS', // Start-to-Start
  'SF', // Start-to-Finish
]);

// Enhanced dependency with lag/lead times
export const scheduleDependencySchema = z.object({
  predecessor_id: z.string().describe('Task ID of the predecessor'),
  type: dependencyTypeSchema.default('FS').describe('Dependency relationship type'),
  lag_minutes: z.number().default(0).describe('Positive = lag (delay), negative = lead (overlap)'),
});

// Schedule constraint types per PMBOK
export const constraintTypeSchema = z.enum([
  'ASAP',  // As Soon As Possible (default)
  'ALAP',  // As Late As Possible
  'SNET',  // Start No Earlier Than
  'SNLT',  // Start No Later Than
  'FNET',  // Finish No Earlier Than
  'FNLT',  // Finish No Later Than
  'MSO',   // Must Start On
  'MFO',   // Must Finish On
]);

// Three-point PERT estimation
export const threePointEstimateSchema = z.object({
  optimistic_minutes: z.number().min(0).nullable().optional().describe('Optimistic duration (O)'),
  most_likely_minutes: z.number().min(0).nullable().optional().describe('Most likely duration (M)'),
  pessimistic_minutes: z.number().min(0).nullable().optional().describe('Pessimistic duration (P)'),
  expected_minutes: z.number().min(0).nullable().optional().describe('PERT Expected = (O + 4M + P) / 6'),
  standard_deviation: z.number().min(0).nullable().optional().describe('PERT SD = (P - O) / 6'),
});

// Planning data (set before execution)
export const planningSchema = z.object({
  // Three-point estimation
  estimate: threePointEstimateSchema.optional().describe('PERT three-point estimate'),

  // Planned dates (input)
  planned_start: lenientDatetime().nullable().optional().describe('Planned start date'),
  planned_finish: lenientDatetime().nullable().optional().describe('Planned finish date'),

  // Baseline dates (locked at sprint start for variance analysis)
  baseline_start: lenientDatetime().nullable().optional().describe('Baseline start date (locked)'),
  baseline_finish: lenientDatetime().nullable().optional().describe('Baseline finish date (locked)'),

  // Enhanced dependencies with types and lag/lead
  schedule_dependencies: z.array(scheduleDependencySchema).optional().describe('Dependencies with relationship types'),

  // Progress tracking
  percent_complete: z.number().min(0).max(100).default(0).describe('Task progress percentage'),

  // Constraint per PMBOK
  constraint_type: constraintTypeSchema.default('ASAP').describe('Schedule constraint type'),
  constraint_date: lenientDatetime().nullable().optional().describe('Constraint date for MSO/MFO/SNET/etc.'),
});

// Computed schedule data (populated by scheduler algorithm)
export const scheduleSchema = z.object({
  // Forward pass results
  early_start: lenientDatetime().nullable().optional().describe('Earliest possible start date'),
  early_finish: lenientDatetime().nullable().optional().describe('Earliest possible finish date'),

  // Backward pass results
  late_start: lenientDatetime().nullable().optional().describe('Latest allowable start date'),
  late_finish: lenientDatetime().nullable().optional().describe('Latest allowable finish date'),

  // Float/slack calculations
  total_float_minutes: z.number().nullable().optional().describe('Total float (LS - ES)'),
  free_float_minutes: z.number().nullable().optional().describe('Free float'),

  // Critical path indicator
  is_critical: z.boolean().default(false).describe('Task is on critical path (zero float)'),

  // Schedule variance (EVM)
  schedule_variance_minutes: z.number().nullable().optional().describe('SV = planned - actual'),
  schedule_performance_index: z.number().nullable().optional().describe('SPI = EV / PV'),
});

// Main task status schema
export const taskStatusObjectSchema = z.object({
  $schema: z.string().optional(),
  task_id: z.string().regex(taskIdPattern).describe('Unique task identifier (e.g., ENV-002-AI, EXC-SEC-001)'),
  section: z.string().optional().describe('Task category/section'),
  description: z.string().optional().describe('Brief description of the task'),
  owner: z.string().optional().describe('Task owner or responsible party'),
  sprint: z.string().optional().describe('Sprint identifier (e.g., sprint-0)'),
  phase: z.string().optional().describe('Phase within the sprint (e.g., phase-1-ai-foundation)'),
  stream: z.string().nullable().optional().describe('Parallel stream identifier (e.g., parallel-a, parallel-b, parallel-c)'),
  dependencies: taskDependenciesSchema.optional(),
  dependencies_resolved: z.array(z.string()).optional().describe('List of resolved dependency task IDs (legacy compatibility)'),
  status: taskStatusSchema.describe('Current task status'),
  started_at: lenientDatetime().nullable().optional().describe('ISO 8601 timestamp when task execution started (null if not started)'),
  completed_at: lenientDatetime().nullable().optional().describe('ISO 8601 timestamp when task was completed (null if not completed)'),
  target_duration_minutes: z.number().nullable().optional().describe('Expected duration in minutes'),
  actual_duration_minutes: z.number().nullable().optional().describe('Actual duration in minutes'),
  status_history: z.array(statusHistoryEntrySchema).optional().describe('Chronological history of status changes'),
  execution: executionSchema.optional(),
  artifacts: artifactsSchema.optional(),
  validations: z.array(validationEntrySchema).optional().describe('Validation commands executed to verify task completion'),
  kpis: z.record(z.string(), kpiEntrySchema).optional().describe('Key Performance Indicators for this task'),
  blockers: z.array(blockerEntrySchema).optional().describe('Any blockers encountered during task execution'),
  notes: z.string().optional().describe('Additional notes or context'),

  // PMBOK Schedule Management fields
  planning: planningSchema.optional().describe('PMBOK planning data (estimates, planned dates, constraints)'),
  schedule: scheduleSchema.optional().describe('Computed schedule data (early/late dates, float, critical path)'),
});

// Export TypeScript types inferred from Zod schema
export type TaskStatusObject = z.infer<typeof taskStatusObjectSchema>;
export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type TaskDependencies = z.infer<typeof taskDependenciesSchema>;
export type StatusHistoryEntry = z.infer<typeof statusHistoryEntrySchema>;
export type Execution = z.infer<typeof executionSchema>;
export type Artifacts = z.infer<typeof artifactsSchema>;
export type ValidationEntry = z.infer<typeof validationEntrySchema>;
export type KpiEntry = z.infer<typeof kpiEntrySchema>;
export type BlockerEntry = z.infer<typeof blockerEntrySchema>;

// PMBOK Schedule Management types
export type DependencyType = z.infer<typeof dependencyTypeSchema>;
export type ScheduleDependency = z.infer<typeof scheduleDependencySchema>;
export type ConstraintType = z.infer<typeof constraintTypeSchema>;
export type ThreePointEstimate = z.infer<typeof threePointEstimateSchema>;
export type Planning = z.infer<typeof planningSchema>;
export type Schedule = z.infer<typeof scheduleSchema>;
