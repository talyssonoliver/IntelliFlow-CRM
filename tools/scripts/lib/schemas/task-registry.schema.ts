/**
 * Task Registry Schema Definition
 *
 * This is the SINGLE SOURCE OF TRUTH for the task registry structure.
 * The JSON schema is auto-generated from this Zod definition.
 *
 * To regenerate JSON schema: pnpm run generate:schemas
 */

import { z } from 'zod';

// Version pattern (semver)
const versionPattern = /^\d+\.\d+\.\d+$/;

// Sprint entry metrics
export const sprintEntrySchema = z.object({
  name: z.string().optional(),
  total_tasks: z.number().int().min(0),
  completed: z.number().int().min(0),
  in_progress: z.number().int().min(0),
  validating: z.number().int().min(0).optional(),
  blocked: z.number().int().min(0),
  planned: z.number().int().min(0).optional(),
  backlog: z.number().int().min(0).optional(),
  failed: z.number().int().min(0).optional(),
  needs_human: z.number().int().min(0).optional(),
  in_review: z.number().int().min(0).optional(),
  not_started: z.number().int().min(0).optional(),
  tasks: z.array(z.string()).optional(),
});

// Task status enum for registry
export const registryTaskStatusSchema = z.enum([
  'DONE',
  'IN_PROGRESS',
  'BLOCKED',
  'PLANNED',
  'FAILED',
  'BACKLOG',
  'VALIDATING',
  'NEEDS_HUMAN',
  'IN_REVIEW',
]);

// Tasks by status - arrays of task IDs
export const tasksByStatusSchema = z.object({
  DONE: z.array(z.string()).optional(),
  IN_PROGRESS: z.array(z.string()).optional(),
  BLOCKED: z.array(z.string()).optional(),
  PLANNED: z.array(z.string()).optional(),
  FAILED: z.array(z.string()).optional(),
  BACKLOG: z.array(z.string()).optional(),
  VALIDATING: z.array(z.string()).optional(),
  NEEDS_HUMAN: z.array(z.string()).optional(),
  IN_REVIEW: z.array(z.string()).optional(),
});

// Task detail entry
export const taskDetailSchema = z.object({
  section: z.string(),
  description: z.string(),
  owner: z.string(),
  status: registryTaskStatusSchema,
  sprint: z.number().int(),
  completed_at: z.string().datetime().optional(),
  duration_minutes: z.number().int().min(0).optional(),
  metrics_file: z.string().optional(),
});

// Main task registry schema
export const taskRegistrySchema = z.object({
  $schema: z.string().optional(),
  version: z.string().regex(versionPattern),
  last_updated: z.string().datetime(),
  total_tasks: z.number().int().min(0),
  sprints: z.record(z.string(), sprintEntrySchema),
  tasks_by_status: tasksByStatusSchema,
  tasks_by_section: z.record(z.string(), z.array(z.string())).optional(),
  task_details: z.record(z.string(), taskDetailSchema).optional(),
});

// Export TypeScript types inferred from Zod schema
export type TaskRegistry = z.infer<typeof taskRegistrySchema>;
export type SprintEntry = z.infer<typeof sprintEntrySchema>;
export type RegistryTaskStatus = z.infer<typeof registryTaskStatusSchema>;
export type TasksByStatus = z.infer<typeof tasksByStatusSchema>;
export type TaskDetail = z.infer<typeof taskDetailSchema>;
