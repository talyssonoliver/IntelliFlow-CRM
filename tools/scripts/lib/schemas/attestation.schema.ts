/**
 * Attestation Schema Definition
 *
 * This is the SINGLE SOURCE OF TRUTH for the attestation structure.
 * The JSON schema is auto-generated from this Zod definition.
 *
 * To regenerate JSON schema: pnpm run generate:schemas
 */

import { z } from 'zod';

// ISO 8601 datetime pattern - accepts Z suffix or +/-HH:MM offset
const isoDatetimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

// Helper for lenient datetime validation
const lenientDatetime = () => z.string().regex(isoDatetimePattern, 'Invalid ISO datetime');

// Schema version
export const schemaVersionSchema = z.enum(['1.0.0']);

// Verdict types
export const verdictSchema = z.enum([
  'COMPLETE',
  'INCOMPLETE',
  'PARTIAL',
  'BLOCKED',
  'NEEDS_HUMAN',
]);

// SHA256 hash pattern
const sha256Pattern = /^[a-f0-9]{64}$/;

// File read entry
export const fileReadSchema = z.object({
  path: z.string().describe('File path relative to repo root'),
  sha256: z.string().regex(sha256Pattern).describe('SHA256 hash of file contents'),
});

// Context acknowledgment
export const contextAcknowledgmentSchema = z.object({
  files_read: z.array(fileReadSchema).optional().describe('List of prerequisite files that were read'),
  invariants_acknowledged: z.array(z.string()).optional().describe('List of invariants/constraints that were acknowledged'),
  acknowledged_at: lenientDatetime().optional().describe('When context was acknowledged'),
});

// Evidence summary
export const evidenceSummarySchema = z.object({
  artifacts_verified: z.number().int().min(0).optional().describe('Number of artifacts verified'),
  validations_passed: z.number().int().min(0).optional().describe('Number of validations that passed'),
  validations_failed: z.number().int().min(0).optional().describe('Number of validations that failed'),
  gates_passed: z.number().int().min(0).optional().describe('Number of gates that passed'),
  gates_failed: z.number().int().min(0).optional().describe('Number of gates that failed'),
  kpis_met: z.number().int().min(0).optional().describe('Number of KPIs met'),
  kpis_missed: z.number().int().min(0).optional().describe('Number of KPIs missed'),
  placeholders_found: z.number().int().min(0).optional().describe('Number of placeholder values found (should be 0)'),
});

// Validation result
export const validationResultSchema = z.object({
  name: z.string().optional().describe('Validation name'),
  command: z.string().describe('Command that was executed'),
  exit_code: z.number().int().describe('Exit code from command execution'),
  passed: z.boolean().describe('Whether validation passed'),
  timestamp: lenientDatetime().describe('When validation was executed'),
  duration_ms: z.number().int().optional().describe('Execution duration in milliseconds'),
  stdout_hash: z.string().optional().describe('SHA256 hash of stdout for verification'),
});

// Gate result
export const gateResultSchema = z.object({
  gate_id: z.string().describe('Gate identifier from audit-matrix.yml'),
  passed: z.boolean(),
  exit_code: z.number().int().optional(),
  score: z.number().optional().describe('Quantitative result of the gate (e.g. percentage)'),
  timestamp: lenientDatetime().optional(),
  log_path: z.string().optional().describe('Path to gate execution log'),
});

// KPI result
export const kpiResultSchema = z.object({
  kpi: z.string().describe('KPI name/description'),
  target: z.string().describe('Target value'),
  actual: z.string().describe('Actual measured value'),
  met: z.boolean().describe('Whether target was met'),
});

// Definition of Done item
export const dodItemSchema = z.object({
  criterion: z.string().describe('DoD criterion from Sprint_plan.csv'),
  met: z.boolean().describe('Whether criterion was met'),
  evidence: z.string().optional().describe('Evidence supporting the claim'),
});

// Manual verification
export const manualVerificationSchema = z.object({
  performed_by: z.string().optional().describe('Person who performed the manual verification'),
  performed_at: lenientDatetime().optional(),
  review_notes: z.string().optional(),
  items_checked: z.array(z.string()).optional(),
});

// Environment info
export const environmentSchema = z.object({
  os: z.string().optional(),
  node_version: z.string().optional(),
  git_commit: z.string().optional(),
  branch: z.string().optional(),
});

// Task ID pattern
const taskIdPattern = /^[A-Z]+-[A-Z0-9-]+$/;

// Main attestation schema
export const attestationSchema = z.object({
  $schema: z.string().optional().describe('Schema reference for validation'),
  schema_version: schemaVersionSchema.optional().describe('Schema version for backward compatibility'),
  task_id: z.string().regex(taskIdPattern).describe('Unique task identifier (e.g., ENV-002-AI, IFC-001)'),
  run_id: z.string().optional().describe('Execution run identifier (e.g., 20251225-181500)'),
  attestor: z.string().optional().describe("Entity that created the attestation (e.g., 'Claude Code - Task Integrity Validator')"),
  attestation_timestamp: lenientDatetime().optional().describe('ISO 8601 timestamp when attestation was created'),
  verdict: verdictSchema.optional().describe('Final verdict on task completion'),
  consensus_verdict: z.string().optional().describe('Alternative verdict field used by some attestation formats'),
  context_acknowledgment: contextAcknowledgmentSchema.optional().describe('Evidence that prerequisite files were read and understood'),
  evidence_summary: evidenceSummarySchema.optional().describe('Summary counts of verification evidence'),
  artifact_hashes: z.record(z.string(), z.string().regex(sha256Pattern)).optional().describe('Map of artifact paths to their SHA256 hashes'),
  validation_results: z.array(validationResultSchema).optional().describe('Results from validation commands'),
  gate_results: z.array(gateResultSchema).optional().describe('Results from audit-matrix gates'),
  kpi_results: z.array(kpiResultSchema).optional().describe('KPI verification results'),
  // dependencies_verified accepts both array (legacy) and object (new detailed format)
  dependencies_verified: z.union([
    z.array(z.string()),
    z.record(z.string(), z.object({
      status: z.string().optional(),
      verified_at: z.string().optional(),
      description: z.string().optional(),
      verified: z.boolean().optional(),
      verification_method: z.string().optional(),
    }).passthrough()),
  ]).optional().describe('Dependency verification - array of IDs or detailed object'),
  definition_of_done_items: z.array(dodItemSchema).optional().describe('Definition of Done verification'),
  manual_verification: manualVerificationSchema.optional().describe('Results from manual audit/review'),
  environment: environmentSchema.optional().describe('Environment details where attestation was generated'),
  notes: z.string().optional().describe('Additional notes or context'),
});

// Export TypeScript types inferred from Zod schema
export type Attestation = z.infer<typeof attestationSchema>;
export type Verdict = z.infer<typeof verdictSchema>;
export type SchemaVersion = z.infer<typeof schemaVersionSchema>;
export type ValidationResult = z.infer<typeof validationResultSchema>;
export type GateResult = z.infer<typeof gateResultSchema>;
export type KpiResult = z.infer<typeof kpiResultSchema>;
