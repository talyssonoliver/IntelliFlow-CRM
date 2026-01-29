/**
 * Centralized schema path definitions
 *
 * Use these constants instead of hardcoding schema URLs.
 * All schemas are stored locally in the repository.
 */

import * as path from 'path';

// Base path for all metric schemas (relative to project root)
export const SCHEMAS_DIR = 'apps/project-tracker/docs/metrics/schemas';

// Schema filenames
export const SCHEMA_FILES = {
  ATTESTATION: 'attestation.schema.json',
  TASK_STATUS: 'task-status.schema.json',
  PHASE_SUMMARY: 'phase-summary.schema.json',
  SPRINT_SUMMARY: 'sprint-summary.schema.json',
  TRACEABILITY: 'traceability.schema.json',
  TASK_REGISTRY: 'task-registry.schema.json',
  KPI_DEFINITIONS: 'kpi-definitions.schema.json',
  DEPENDENCY_GRAPH: 'dependency-graph.schema.json',
  VULNERABILITY_BASELINE: 'vulnerability-baseline.schema.json',
} as const;

/**
 * Get the relative path from a file to a schema
 * @param fromDir - Directory of the file that will reference the schema
 * @param schemaName - One of SCHEMA_FILES values
 * @param projectRoot - Project root directory (defaults to process.cwd())
 */
export function getRelativeSchemaPath(
  fromDir: string,
  schemaName: keyof typeof SCHEMA_FILES,
  projectRoot: string = process.cwd()
): string {
  const schemaPath = path.join(projectRoot, SCHEMAS_DIR, SCHEMA_FILES[schemaName]);
  const relativePath = path.relative(fromDir, schemaPath);
  // Normalize to forward slashes for JSON compatibility
  return relativePath.replace(/\\/g, '/');
}

/**
 * Get the absolute path to a schema file
 * @param schemaName - One of SCHEMA_FILES values
 * @param projectRoot - Project root directory (defaults to process.cwd())
 */
export function getAbsoluteSchemaPath(
  schemaName: keyof typeof SCHEMA_FILES,
  projectRoot: string = process.cwd()
): string {
  return path.join(projectRoot, SCHEMAS_DIR, SCHEMA_FILES[schemaName]);
}

/**
 * Get the schema $id value (for use within schema definitions)
 * This is a URI identifier, not a URL - it doesn't need to resolve
 * @param schemaName - One of SCHEMA_FILES values
 */
export function getSchemaId(schemaName: keyof typeof SCHEMA_FILES): string {
  return SCHEMA_FILES[schemaName];
}
