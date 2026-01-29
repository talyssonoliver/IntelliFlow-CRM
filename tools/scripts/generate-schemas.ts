#!/usr/bin/env npx tsx
/**
 * Schema Generator
 *
 * Generates JSON schemas from Zod definitions using Zod v4's native toJSONSchema method.
 * This ensures schemas stay in sync with TypeScript types.
 *
 * Usage: pnpm run generate:schemas
 *
 * How it works:
 * 1. Reads Zod schema definitions from tools/scripts/lib/schemas/
 * 2. Uses Zod v4's native z.toJSONSchema() to convert to JSON Schema format
 * 3. Writes JSON files to apps/project-tracker/docs/metrics/schemas/
 *
 * To add a new schema:
 * 1. Create a .schema.ts file in tools/scripts/lib/schemas/
 * 2. Export a Zod schema with the naming convention: `{name}Schema`
 * 3. Add it to the SCHEMAS array below
 * 4. Run this script
 *
 * Note: Requires Zod v4+ for native JSON Schema support.
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { z } from 'zod';
import { vulnerabilityBaselineSchema } from './lib/schemas/vulnerability-baseline.schema';
import { attestationSchema } from './lib/schemas/attestation.schema';
import { taskStatusObjectSchema } from './lib/schemas/task-status.schema';
import { phaseSummarySchema } from './lib/schemas/phase-summary.schema';
import { sprintSummarySchema } from './lib/schemas/sprint-summary.schema';
import { taskRegistrySchema } from './lib/schemas/task-registry.schema';
import { dependencyGraphSchema } from './lib/schemas/dependency-graph.schema';
import { kpiDefinitionsSchema } from './lib/schemas/kpi-definitions.schema';
import { traceabilitySchema } from './lib/schemas/traceability.schema';
import { extractedTextSchema } from './lib/schemas/extracted-text.schema';
import { analyticsEventSchema } from './lib/schemas/analytics-event.schema';

// Get repo root
const fileUrl = new URL(import.meta.url);
const scriptPath =
  process.platform === 'win32'
    ? fileUrl.pathname.replace(/^\/([A-Za-z]):/, '$1:')
    : fileUrl.pathname;
const REPO_ROOT = join(dirname(scriptPath), '..', '..');
const OUTPUT_DIR = join(REPO_ROOT, 'apps', 'project-tracker', 'docs', 'metrics', 'schemas');

// Schema definitions to generate
interface SchemaDefinition {
  name: string;
  filename: string;
  schema: z.ZodType;
  title: string;
  description: string;
}

const SCHEMAS: SchemaDefinition[] = [
  {
    name: 'vulnerability-baseline',
    filename: 'vulnerability-baseline.schema.json',
    schema: vulnerabilityBaselineSchema,
    title: 'Vulnerability Baseline Schema',
    description: 'Schema for tracking security vulnerability baseline, scan results, and remediation status',
  },
  {
    name: 'attestation',
    filename: 'attestation.schema.json',
    schema: attestationSchema,
    title: 'Task Attestation Schema',
    description: 'Schema for task completion attestations combining context acknowledgment and verification evidence',
  },
  {
    name: 'task-status',
    filename: 'task-status.schema.json',
    schema: taskStatusObjectSchema,
    title: 'Task Status Schema',
    description: 'Schema for tracking individual task execution, artifacts, validations, and KPIs',
  },
  {
    name: 'phase-summary',
    filename: 'phase-summary.schema.json',
    schema: phaseSummarySchema,
    title: 'Phase Summary Schema',
    description: 'Schema for aggregating metrics across a sprint phase',
  },
  {
    name: 'sprint-summary',
    filename: 'sprint-summary.schema.json',
    schema: sprintSummarySchema,
    title: 'Sprint Summary Schema',
    description: 'Schema for aggregating metrics across an entire sprint',
  },
  {
    name: 'task-registry',
    filename: 'task-registry.schema.json',
    schema: taskRegistrySchema,
    title: 'Task Registry Schema',
    description: 'Schema for task-registry.json - all tasks across sprints',
  },
  {
    name: 'dependency-graph',
    filename: 'dependency-graph.schema.json',
    schema: dependencyGraphSchema,
    title: 'Dependency Graph Schema',
    description: 'Schema for dependency-graph.json - cross-sprint dependencies',
  },
  {
    name: 'kpi-definitions',
    filename: 'kpi-definitions.schema.json',
    schema: kpiDefinitionsSchema,
    title: 'KPI Definitions Schema',
    description: 'Schema for kpi-definitions.json - standardized KPI measurement definitions',
  },
  {
    name: 'traceability',
    filename: 'traceability.schema.json',
    schema: traceabilitySchema,
    title: 'Traceability Matrix Schema',
    description: 'Schema for IntelliFlow CRM Capability Traceability Matrix - links business capabilities to domain services, APIs, UIs, and tests',
  },
  {
    name: 'extracted-text',
    filename: 'extracted-text.schema.json',
    schema: extractedTextSchema,
    title: 'Extracted Text Artifact Schema',
    description: 'Schema for OCR-extracted text artifacts stored for search and RAG',
  },
  {
    name: 'analytics-event',
    filename: 'analytics-event.schema.json',
    schema: analyticsEventSchema,
    title: 'Analytics Event Schema',
    description: 'Schema for IntelliFlow analytics events',
  },
];

function generateSchema(def: SchemaDefinition): void {
  // Use Zod v4's native toJSONSchema method
  const jsonSchema = z.toJSONSchema(def.schema);

  // Build enhanced schema with metadata
  const enhancedSchema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: def.filename,
    title: def.title,
    description: def.description,
    ...jsonSchema,
  };

  // Remove the Zod v4 $schema if it differs
  if ((enhancedSchema as Record<string, unknown>)['$schema'] !== 'http://json-schema.org/draft-07/schema#') {
    (enhancedSchema as Record<string, unknown>)['$schema'] = 'http://json-schema.org/draft-07/schema#';
  }

  const outputPath = join(OUTPUT_DIR, def.filename);

  // Ensure directory exists
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  writeFileSync(outputPath, JSON.stringify(enhancedSchema, null, 2) + '\n');
  console.log(`✓ Generated ${def.filename}`);
}

function main(): void {
  console.log('Generating JSON schemas from Zod definitions...\n');

  let successCount = 0;
  let errorCount = 0;

  for (const def of SCHEMAS) {
    try {
      generateSchema(def);
      successCount++;
    } catch (error) {
      console.error(`✗ Failed to generate ${def.filename}: ${error}`);
      errorCount++;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Generated: ${successCount}`);
  console.log(`Failed: ${errorCount}`);

  if (errorCount > 0) {
    process.exit(1);
  }
}

main();
