/**
 * CI Cost Metrics Schema Definition
 *
 * Zod source-of-truth for the artifact emitted by
 * `tools/scripts/parse-actions-usage.mjs --emit-json`. Paired with
 * `ci-cost-metrics-provenance.schema.ts` for the freshness sidecar.
 *
 * JSON-Schema mirror (for editor tooling + docs):
 *   apps/project-tracker/docs/metrics/schemas/ci-cost-metrics.schema.json
 *   apps/project-tracker/docs/metrics/schemas/ci-cost-metrics-provenance.schema.json
 *
 * The runbook is at docs/operations/runbooks/ci-cost-monitoring.md.
 */

import { z } from 'zod';

const SHA256 = z.string().regex(/^[a-f0-9]{64}$/, 'must be lowercase 64-hex sha256');

const workflowStatsSchema = z.object({
  minutes: z.number().min(0),
  cost: z.number().min(0),
  runs: z.number().int().min(0),
});

const userStatsSchema = z.object({
  minutes: z.number().min(0),
  cost: z.number().min(0),
});

export const ciCostMetricsSchema = z
  .object({
    schema_version: z.literal('1.0.0'),
    generated_at: z.string().datetime(),
    source: z
      .object({
        path: z.string().min(1),
        sha256: SHA256,
        min_date: z.string().nullable(),
        max_date: z.string().nullable(),
        rows: z.number().int().min(0),
      })
      .strict(),
    totals: z
      .object({
        compute_minutes: z.number().min(0),
        compute_cost_usd: z.number().min(0).describe('Linux runner compute spend only'),
        storage_cost_usd: z.number().min(0).describe('Actions cache + artifact storage spend'),
        grand_total_usd: z.number().min(0).describe('compute_cost_usd + storage_cost_usd'),
        days_covered: z.number().int().min(0),
      })
      .strict(),
    by_workflow: z.record(z.string(), workflowStatsSchema),
    by_user: z.record(z.string(), userStatsSchema),
    by_day: z.record(z.string(), userStatsSchema),
    by_user_workflow: z.record(z.string(), workflowStatsSchema),
  })
  .strict();

export type CiCostMetrics = z.infer<typeof ciCostMetricsSchema>;

export const ciCostMetricsProvenanceSchema = z
  .object({
    schema_version: z.literal('1.0.0'),
    artifact_file: z.string().min(1),
    artifact_sha256: SHA256,
    generated_at: z.string().datetime(),
    git_head: z.string(),
    source_csv_path: z.string().min(1),
    source_csv_sha256: SHA256,
    source_csv_min_date: z.string().nullable(),
    source_csv_max_date: z.string().nullable(),
    source_csv_rows: z.number().int().min(0),
    latest_observed_workflow_run_at: z
      .string()
      .datetime()
      .nullable()
      .describe(
        'ISO 8601 timestamp of the most recent workflow run observed via gh API at generation time. null if not collected. Used for the "runs since CSV export" staleness check.'
      ),
    collected_by: z.string().min(1),
    collection_method: z.enum([
      'manual_csv_export',
      'gh_actions_api',
      'billing_api',
      'automated_pipeline',
    ]),
    confidence: z.enum(['low', 'medium', 'high']),
    staleness_threshold_days: z.number().int().min(1),
    is_stale: z.boolean(),
    stale_reason: z.string().nullable(),
  })
  .strict();

export type CiCostMetricsProvenance = z.infer<typeof ciCostMetricsProvenanceSchema>;
