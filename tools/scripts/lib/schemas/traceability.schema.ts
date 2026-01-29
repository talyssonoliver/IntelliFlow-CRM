/**
 * Traceability Schema Definition
 *
 * This is the SINGLE SOURCE OF TRUTH for the traceability matrix structure.
 * The JSON schema is auto-generated from this Zod definition.
 *
 * To regenerate JSON schema: pnpm run generate:schemas
 */

import { z } from 'zod';

// Version pattern (semver)
const versionPattern = /^\d+\.\d+\.\d+$/;

// Capability ID pattern (e.g., CAP-001)
const capabilityIdPattern = /^CAP-\d+$/;

// Task ID pattern (e.g., IFC-001)
const taskIdPattern = /^IFC-\d+$/;

// Capability definition
export const capabilitySchema = z.object({
  capability_id: z.string().regex(capabilityIdPattern).describe('Unique identifier for the capability'),
  name: z.string().describe('Human-readable name of the capability'),
  description: z.string().describe('Detailed description of what the capability does'),
  domain_services: z.array(z.string()).optional().describe('File paths to domain service implementations'),
  api_endpoints: z.array(z.string()).optional().describe('API endpoint file paths or descriptions'),
  ui_components: z.array(z.string()).optional().describe('UI component file paths'),
  tests: z.array(z.string()).optional().describe('Test file paths or directories'),
  sprint_tasks: z.array(z.string().regex(taskIdPattern)).optional().describe('Task IDs that implement this capability'),
});

// Coverage summary
export const coverageSummarySchema = z.object({
  total_capabilities: z.number().int().min(0).describe('Total number of capabilities defined'),
  with_domain_services: z.number().int().min(0).optional().describe('Number of capabilities with domain services'),
  with_api_endpoints: z.number().int().min(0).optional().describe('Number of capabilities with API endpoints'),
  with_ui_components: z.number().int().min(0).optional().describe('Number of capabilities with UI components'),
  with_tests: z.number().int().min(0).optional().describe('Number of capabilities with tests'),
  traceability_coverage_percentage: z.number().min(0).max(100).describe('Percentage of traceability coverage'),
});

// Main traceability schema
export const traceabilitySchema = z.object({
  $schema: z.string().optional().describe('JSON Schema reference'),
  title: z.string().describe('Title of the traceability matrix'),
  description: z.string().describe('Description of the traceability matrix purpose'),
  created_at: z.string().datetime().describe('ISO 8601 timestamp when the matrix was created'),
  task_reference: z.string().optional().describe('Reference to the task that created this matrix'),
  version: z.string().regex(versionPattern).optional().describe('Semantic version of the matrix'),
  capabilities: z.array(capabilitySchema).describe('Array of business capabilities with their traceability links'),
  coverage_summary: coverageSummarySchema.describe('Summary statistics of traceability coverage'),
  validated_by: z.string().describe('Identifier of the system or person who validated this matrix'),
  validated_at: z.string().datetime().describe('ISO 8601 timestamp when the matrix was validated'),
});

// Export TypeScript types inferred from Zod schema
export type Traceability = z.infer<typeof traceabilitySchema>;
export type Capability = z.infer<typeof capabilitySchema>;
export type CoverageSummary = z.infer<typeof coverageSummarySchema>;
