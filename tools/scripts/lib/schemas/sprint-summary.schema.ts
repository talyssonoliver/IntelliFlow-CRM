/**
 * Sprint Summary Schema Definition
 *
 * This is the SINGLE SOURCE OF TRUTH for the sprint summary structure.
 * The JSON schema is auto-generated from this Zod definition.
 *
 * To regenerate JSON schema: pnpm run generate:schemas
 */

import { z } from 'zod';

// ISO 8601 datetime pattern - accepts Z suffix or +/-HH:MM offset
const isoDatetimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

// Helper for lenient datetime validation
const lenientDatetime = () => z.string().regex(isoDatetimePattern, 'Invalid ISO datetime');

// Sprint pattern (e.g., sprint-0)
const sprintPattern = /^sprint-[0-9]+$/;

// Phase pattern (e.g., phase-2-parallel, phase-0-phase0)
const phasePattern = /^phase-[0-9]+-[a-z0-9-]+$/;

// Phase status
export const phaseStatusSchema = z.enum(['NOT_STARTED', 'IN_PROGRESS', 'DONE', 'BLOCKED']);

// KPI status
export const kpiStatusSchema = z.enum([
  'MEASURING',
  'ON_TARGET',
  'BELOW_TARGET',
  'ABOVE_TARGET',
  'MET',
]);

// Phase entry in sprint
export const sprintPhaseSchema = z.object({
  id: z.string().regex(phasePattern),
  status: phaseStatusSchema,
  started_at: lenientDatetime().nullable().optional(),
  completed_at: lenientDatetime().nullable().optional(),
  // Extra fields allowed for backward compatibility
  phase_id: z.string().optional(),
  phase_name: z.string().optional(),
  name: z.string().optional(),
  phase: z.number().optional(),  // Phase index
  tasks: z.union([z.array(z.string()), z.number()]).optional(),  // Task list or count
  task_ids: z.array(z.string()).optional(),  // Alternative field for task list
  completed: z.number().optional(),  // Completed count
}).passthrough();

// Task summary counts
export const taskSummarySchema = z.object({
  total: z.number().int().min(0),
  done: z.number().int().min(0),
  in_progress: z.number().int().min(0),
  blocked: z.number().int().min(0),
  not_started: z.number().int().min(0),
  failed: z.number().int().min(0).optional(),
});

// KPI summary entry
export const kpiSummaryEntrySchema = z.object({
  target: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  actual: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  current: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),  // Alias for actual
  status: kpiStatusSchema,
  unit: z.string().optional(),
});

// Blocker entry
export const sprintBlockerSchema = z.object({
  task_id: z.string(),
  blocker: z.string(),
  owner: z.string(),
  raised_at: lenientDatetime(),
  resolved_at: lenientDatetime().nullable().optional(),
});

// =============================================================================
// PMBOK Schedule Management Schemas (Sprint-level)
// =============================================================================

// Schedule health status
export const scheduleHealthStatusSchema = z.enum([
  'ahead',      // SPI > 1.1
  'on_track',   // SPI 0.95-1.1
  'behind',     // SPI 0.8-0.95
  'critical',   // SPI < 0.8
]);

// Critical path summary
export const criticalPathSummarySchema = z.object({
  task_ids: z.array(z.string()).describe('Task IDs on the critical path'),
  total_duration_minutes: z.number().nullable().optional().describe('Total critical path duration'),
  completion_percentage: z.number().min(0).max(100).nullable().optional().describe('Critical path completion %'),
  bottleneck_task_id: z.string().nullable().optional().describe('Current bottleneck task'),
});

// Schedule variance (EVM)
export const scheduleVarianceSummarySchema = z.object({
  sv_minutes: z.number().nullable().optional().describe('Schedule Variance = EV - PV (in minutes)'),
  spi: z.number().nullable().optional().describe('Schedule Performance Index = EV / PV'),
  status: scheduleHealthStatusSchema.optional().describe('Schedule health status'),
});

// Sprint-level schedule
export const sprintScheduleSchema = z.object({
  // Sprint calendar
  sprint_start_date: z.string().nullable().optional().describe('Sprint start date (YYYY-MM-DD)'),
  sprint_end_date: z.string().nullable().optional().describe('Sprint end date (YYYY-MM-DD)'),
  working_hours_per_day: z.number().default(8).describe('Working hours per day'),
  working_days_per_week: z.number().default(5).describe('Working days per week'),

  // Critical path
  critical_path: criticalPathSummarySchema.optional().describe('Critical path analysis'),

  // Schedule performance (EVM)
  schedule_variance: scheduleVarianceSummarySchema.optional().describe('Schedule variance metrics'),

  // Computed at
  calculated_at: lenientDatetime().nullable().optional().describe('When schedule was last calculated'),
});

// Main sprint summary schema
export const sprintSummarySchema = z.object({
  sprint: z.string().regex(sprintPattern).describe('Sprint identifier (e.g., sprint-0)'),
  name: z.string().describe('Sprint name/title'),
  target_date: z.string().nullable().describe('Target completion date (YYYY-MM-DD) or null for unscheduled sprints'),
  started_at: lenientDatetime().nullable().optional(),
  completed_at: lenientDatetime().nullable().optional(),
  phases: z.array(sprintPhaseSchema).describe('Status of each phase in the sprint'),
  task_summary: taskSummarySchema,
  kpi_summary: z.record(z.string(), kpiSummaryEntrySchema).optional(),
  blockers: z.array(sprintBlockerSchema).optional().describe('Active blockers in the sprint'),

  // PMBOK Schedule Management
  schedule: sprintScheduleSchema.optional().describe('PMBOK schedule data (critical path, EVM metrics)'),
});

// Export TypeScript types inferred from Zod schema
export type SprintSummary = z.infer<typeof sprintSummarySchema>;
export type PhaseStatus = z.infer<typeof phaseStatusSchema>;
export type KpiStatus = z.infer<typeof kpiStatusSchema>;
export type SprintPhase = z.infer<typeof sprintPhaseSchema>;
export type TaskSummary = z.infer<typeof taskSummarySchema>;
export type KpiSummaryEntry = z.infer<typeof kpiSummaryEntrySchema>;
export type SprintBlocker = z.infer<typeof sprintBlockerSchema>;

// PMBOK Schedule Management types
export type ScheduleHealthStatus = z.infer<typeof scheduleHealthStatusSchema>;
export type CriticalPathSummary = z.infer<typeof criticalPathSummarySchema>;
export type ScheduleVarianceSummary = z.infer<typeof scheduleVarianceSummarySchema>;
export type SprintSchedule = z.infer<typeof sprintScheduleSchema>;
