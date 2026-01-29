/**
 * Dependency Graph Schema Definition
 *
 * This is the SINGLE SOURCE OF TRUTH for the dependency graph structure.
 * The JSON schema is auto-generated from this Zod definition.
 *
 * To regenerate JSON schema: pnpm run generate:schemas
 */

import { z } from 'zod';

// Version pattern (semver)
const versionPattern = /^\d+\.\d+\.\d+$/;

// Node status
export const nodeStatusSchema = z.enum(['DONE', 'IN_PROGRESS', 'BLOCKED', 'PLANNED', 'FAILED', 'BACKLOG', 'VALIDATING', 'NEEDS_HUMAN', 'IN_REVIEW']);

// Dependency type
export const dependencyTypeSchema = z.enum(['REQUIRED', 'OPTIONAL', 'BLOCKED_BY']);

// Graph node
export const graphNodeSchema = z.object({
  task_id: z.string(),
  sprint: z.number().int(),
  status: nodeStatusSchema,
  dependencies: z.array(z.string()),
  dependents: z.array(z.string()),
});

// Critical path
export const criticalPathSchema = z.object({
  name: z.string(),
  tasks: z.array(z.string()),
  total_duration_estimate_minutes: z.number().int().min(0),
  completion_percentage: z.number().min(0).max(100),
  blocking_status: z.string(),
});

// Cross-sprint dependency
export const crossSprintDependencySchema = z.object({
  from_task: z.string(),
  to_task: z.string(),
  from_sprint: z.number().int(),
  to_sprint: z.number().int(),
  dependency_type: dependencyTypeSchema,
  description: z.string().optional(),
});

// Dependency violation
export const dependencyViolationSchema = z.object({
  task_id: z.string().optional(),
  violation: z.string().optional(),
});

// Main dependency graph schema
export const dependencyGraphSchema = z.object({
  $schema: z.string().optional(),
  version: z.string().regex(versionPattern),
  last_updated: z.string().datetime(),
  description: z.string().optional(),
  nodes: z.record(z.string(), graphNodeSchema),
  critical_paths: z.array(criticalPathSchema),
  cross_sprint_dependencies: z.array(crossSprintDependencySchema).optional(),
  blocked_tasks: z.array(z.string()).optional(),
  ready_to_start: z.array(z.string()),
  dependency_violations: z.array(dependencyViolationSchema).optional(),
  parallel_execution_groups: z.record(z.string(), z.record(z.string(), z.array(z.string()))).optional(),
});

// Export TypeScript types inferred from Zod schema
export type DependencyGraph = z.infer<typeof dependencyGraphSchema>;
export type NodeStatus = z.infer<typeof nodeStatusSchema>;
export type DependencyType = z.infer<typeof dependencyTypeSchema>;
export type GraphNode = z.infer<typeof graphNodeSchema>;
export type CriticalPath = z.infer<typeof criticalPathSchema>;
export type CrossSprintDependency = z.infer<typeof crossSprintDependencySchema>;
export type DependencyViolation = z.infer<typeof dependencyViolationSchema>;
