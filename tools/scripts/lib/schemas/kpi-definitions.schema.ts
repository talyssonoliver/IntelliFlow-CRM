/**
 * KPI Definitions Schema Definition
 *
 * This is the SINGLE SOURCE OF TRUTH for the KPI definitions structure.
 * The JSON schema is auto-generated from this Zod definition.
 *
 * To regenerate JSON schema: pnpm run generate:schemas
 */

import { z } from 'zod';

// Version pattern (semver)
const versionPattern = /^\d+\.\d+\.\d+$/;

// Unit types
export const kpiUnitSchema = z.enum([
  'milliseconds',
  'seconds',
  'minutes',
  'percent',
  'count',
  'boolean',
  'dollars',
]);

// KPI definition
export const kpiDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  unit: kpiUnitSchema,
  targets: z.record(z.string(), z.union([z.number(), z.boolean()])),
  measurement_method: z.string(),
  validation_command: z.string().nullable().optional(),
});

// Category with KPIs
export const kpiCategorySchema = z.object({
  name: z.string(),
  kpis: z.record(z.string(), kpiDefinitionSchema),
});

// Measurement schedule
export const measurementScheduleSchema = z.object({
  continuous: z.array(z.string()).optional(),
  per_task: z.array(z.string()).optional(),
  per_sprint: z.array(z.string()).optional(),
  weekly: z.array(z.string()).optional(),
  on_demand: z.array(z.string()).optional(),
});

// Main KPI definitions schema
export const kpiDefinitionsSchema = z.object({
  $schema: z.string().optional(),
  version: z.string().regex(versionPattern),
  last_updated: z.string().datetime(),
  description: z.string().optional(),
  categories: z.record(z.string(), kpiCategorySchema),
  measurement_schedule: measurementScheduleSchema,
});

// Export TypeScript types inferred from Zod schema
export type KpiDefinitions = z.infer<typeof kpiDefinitionsSchema>;
export type KpiUnit = z.infer<typeof kpiUnitSchema>;
export type KpiDefinition = z.infer<typeof kpiDefinitionSchema>;
export type KpiCategory = z.infer<typeof kpiCategorySchema>;
export type MeasurementSchedule = z.infer<typeof measurementScheduleSchema>;
