/**
 * CI Failure Pattern Registry Schema Definition
 *
 * Zod source-of-truth for `artifacts/reports/ci-failures/registry.json`.
 * JSON-Schema mirror at
 * `apps/project-tracker/docs/metrics/schemas/ci-failure-registry.schema.json`.
 *
 * Each pattern carries a `verification_command` so the registry can be
 * machine-checked at audit time (see runbook
 * `docs/operations/runbooks/ci-cost-monitoring.md` for the one-liner).
 */

import { z } from 'zod';

export const ciFailurePatternSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/, 'lowercase kebab-case'),
    title: z.string().min(1),
    summary: z.string().min(1),
    first_seen: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'ISO date (YYYY-MM-DD)'),
    last_seen: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'ISO date (YYYY-MM-DD)'),
    occurrences: z.number().int().min(1),
    affected_workflows: z.array(z.string()),
    owner: z.string().min(1),
    guard_added: z.boolean(),
    guard_prs: z.array(z.string().url()),
    guard_pattern: z.string().min(1),
    verification_command: z.string().min(1),
    evidence: z.array(z.string()),
  })
  .strict();

export const ciFailureRegistrySchema = z
  .object({
    $schema: z.string().optional(),
    schema_version: z.literal('1.0.0'),
    generated_at: z.string().datetime(),
    owner: z.string().min(1),
    description: z.string().optional(),
    patterns: z.array(ciFailurePatternSchema),
  })
  .strict();

export type CiFailurePattern = z.infer<typeof ciFailurePatternSchema>;
export type CiFailureRegistry = z.infer<typeof ciFailureRegistrySchema>;
