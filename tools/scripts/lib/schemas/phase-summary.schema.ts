/**
 * Phase Summary Schema Definition
 *
 * This is the SINGLE SOURCE OF TRUTH for the phase summary structure.
 * The JSON schema is auto-generated from this Zod definition.
 *
 * To regenerate JSON schema: pnpm run generate:schemas
 */

import { z } from 'zod';

// Phase pattern (e.g., phase-2-parallel)
const phasePattern = /^phase-[0-9]+-[a-z-]+$/;

// Sprint pattern (e.g., sprint-0)
const sprintPattern = /^sprint-[0-9]+$/;

// Stream status
export const streamStatusSchema = z.enum(['NOT_STARTED', 'IN_PROGRESS', 'DONE', 'BLOCKED']);

// Stream definition
export const streamSchema = z.object({
  name: z.string().describe('Parallel stream name (e.g., parallel-a)'),
  tasks: z.array(z.string()).describe('Task IDs in this stream'),
  status: streamStatusSchema,
});

// Aggregated metrics
export const aggregatedMetricsSchema = z.object({
  total_tasks: z.number().int().min(0),
  done: z.number().int().min(0),
  in_progress: z.number().int().min(0),
  blocked: z.number().int().min(0),
  not_started: z.number().int().min(0),
  failed: z.number().int().min(0).optional(),
});

// KPI entry for phase - flexible target/actual types
export const phaseKpiSchema = z.object({
  target: z.union([z.string(), z.number(), z.boolean()]).optional(),
  actual: z.union([z.string(), z.number(), z.boolean()]).optional(),
  met: z.boolean().optional(),
});

// Main phase summary schema
export const phaseSummarySchema = z.object({
  phase: z.string().regex(phasePattern).describe('Phase identifier (e.g., phase-2-parallel)'),
  sprint: z.string().regex(sprintPattern).describe('Sprint identifier'),
  description: z.string().describe('Phase description'),
  streams: z.array(streamSchema).optional().describe('Parallel execution streams within this phase'),
  aggregated_metrics: aggregatedMetricsSchema,
  started_at: z.string().datetime().nullable().optional(),
  completed_at: z.string().datetime().nullable().optional(),
  target_duration_minutes: z.number().int().nullable().optional(),
  actual_duration_minutes: z.number().int().nullable().optional(),
  kpis: z.record(z.string(), phaseKpiSchema).optional(),
});

// Export TypeScript types inferred from Zod schema
export type PhaseSummary = z.infer<typeof phaseSummarySchema>;
export type StreamStatus = z.infer<typeof streamStatusSchema>;
export type Stream = z.infer<typeof streamSchema>;
export type AggregatedMetrics = z.infer<typeof aggregatedMetricsSchema>;
export type PhaseKpi = z.infer<typeof phaseKpiSchema>;
