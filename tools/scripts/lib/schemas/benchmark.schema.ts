/**
 * Benchmark Results Schema Definition
 *
 * This is the SINGLE SOURCE OF TRUTH for benchmark file structure.
 * The JSON schema is auto-generated from this Zod definition.
 *
 * To regenerate JSON schema: pnpm run generate:schemas
 */

import { z } from 'zod';

// Benchmark status
export const benchmarkStatusSchema = z.enum(['COMPLETED', 'PARTIAL', 'NOT_RUN', 'FAILED']);

// Individual result status
export const resultStatusSchema = z.enum(['PASS', 'FAIL', 'SKIP']);

// Budget threshold
export const budgetThresholdSchema = z.enum(['error', 'warn']);

// Individual benchmark result
export const benchmarkResultSchema = z.object({
  name: z.string().describe('Name/identifier for this benchmark'),
  description: z.string().optional().describe('Human-readable description'),
  iterations: z.number().int().min(0).describe('Number of iterations run'),
  totalTime: z.number().min(0).describe('Total time for all iterations'),
  avgTime: z.number().min(0).describe('Average time per iteration'),
  minTime: z.number().min(0).describe('Minimum time recorded'),
  maxTime: z.number().min(0).describe('Maximum time recorded'),
  p50: z.number().min(0).describe('50th percentile (median)'),
  p95: z.number().min(0).describe('95th percentile'),
  p99: z.number().min(0).describe('99th percentile'),
  timestamp: z.string().datetime().optional().describe('When this benchmark was run'),
  metadata: z.record(z.string(), z.unknown()).optional().describe('Additional metadata'),
  status: resultStatusSchema.optional().describe('Result status'),
});

// AI model benchmark result
export const modelBenchmarkSchema = z.object({
  model: z.string().describe('Model name/identifier'),
  provider: z.string().optional().describe('AI provider (openai, ollama, etc.)'),
  accuracy: z.number().min(0).max(100).optional().describe('Accuracy percentage'),
  latency_p95: z.number().min(0).optional().describe('95th percentile latency in ms'),
  cost_per_1k: z.number().min(0).optional().describe('Cost per 1000 operations'),
  samples: z.number().int().min(0).optional().describe('Number of samples tested'),
});

// Performance budget definition
export const performanceBudgetSchema = z.object({
  metric: z.string().describe('Name of the metric'),
  target: z.number().describe('Target value to meet'),
  unit: z.string().describe('Unit of measurement (ms, score, percentage)'),
  threshold: budgetThresholdSchema.optional().describe('Severity if target is exceeded'),
  description: z.string().optional().describe('Human-readable description of this budget'),
});

// Task context
export const taskContextSchema = z.object({
  original_task: z.string().optional().describe('Task ID that originally created this benchmark'),
  original_task_status: z.string().optional().describe('Status note about the original task'),
  follow_up_task: z.string().optional().describe('Follow-up task ID for completing real benchmarks'),
  follow_up_target_sprint: z.number().int().optional().describe('Target sprint for follow-up'),
  follow_up_description: z.string().optional().describe('Description of the follow-up task'),
});

// Environment details
export const benchmarkEnvironmentSchema = z.object({
  node: z.string().optional().describe('Node.js version'),
  platform: z.string().optional().describe('Operating system platform'),
  architecture: z.string().optional().describe('CPU architecture'),
  api_available: z.boolean().optional().describe('Whether API server was available'),
  database_available: z.boolean().optional().describe('Whether database was available'),
  openai_configured: z.boolean().optional().describe('Whether OpenAI API key was configured'),
  ollama_available: z.boolean().optional().describe('Whether Ollama server was available'),
}).passthrough();

// Results organized by category
export const benchmarkResultsSchema = z.object({
  api: z.array(benchmarkResultSchema).optional(),
  database: z.array(benchmarkResultSchema).optional(),
  frontend: z.array(benchmarkResultSchema).optional(),
  ai: z.array(benchmarkResultSchema).optional(),
  build: z.array(benchmarkResultSchema).optional(),
  models: z.array(modelBenchmarkSchema).optional().describe('AI model benchmark results'),
}).passthrough();

// KPI validation summary
export const kpiValidationSchema = z.object({
  benchmarks_run: z.boolean().optional().describe('Whether any benchmarks were actually executed'),
  api_tested: z.boolean().optional(),
  database_tested: z.boolean().optional(),
  build_tested: z.boolean().optional(),
  all_targets_met: z.boolean().optional().describe('Whether all performance targets were met'),
  violations: z.array(z.string()).optional().describe('List of budget violations'),
});

// References to related files
export const benchmarkReferencesSchema = z.object({
  sprintPlan: z.string().optional(),
  task: z.string().optional(),
  performanceBudgets: z.string().optional(),
  lighthouseConfig: z.string().optional(),
  benchmarkScript: z.string().optional(),
}).passthrough();

// Main benchmark schema
export const benchmarkSchema = z.object({
  $schema: z.string().optional().describe('Reference to JSON Schema file'),
  benchmark_id: z.string().describe('Unique identifier for this benchmark'),
  title: z.string().describe('Human-readable title for the benchmark'),
  description: z.string().optional().describe('Description of what this benchmark measures'),
  timestamp: z.string().datetime().describe('ISO 8601 timestamp of when benchmark was run'),
  status: benchmarkStatusSchema.describe('Overall status of the benchmark execution'),
  reason: z.string().optional().describe('Explanation for NOT_RUN or FAILED status'),

  task_context: taskContextSchema.optional(),
  environment: benchmarkEnvironmentSchema.optional(),

  prerequisites: z.array(z.string()).optional().describe('Instructions for running real benchmarks'),
  instructions: z.array(z.string()).optional().describe('Instructions (alias for prerequisites)'),

  budgets: z.union([
    z.array(performanceBudgetSchema),
    z.record(z.string(), z.object({}).passthrough())
  ]).optional().describe('Performance budget definitions - array or object format'),
  results: benchmarkResultsSchema.optional().describe('Benchmark results by category'),

  kpi_validation: kpiValidationSchema.optional().describe('Summary of KPI validation results'),
  references: benchmarkReferencesSchema.optional().describe('References to related files'),
});

// Export TypeScript types inferred from Zod schemas
export type Benchmark = z.infer<typeof benchmarkSchema>;
export type BenchmarkResult = z.infer<typeof benchmarkResultSchema>;
export type ModelBenchmark = z.infer<typeof modelBenchmarkSchema>;
export type PerformanceBudget = z.infer<typeof performanceBudgetSchema>;
export type BenchmarkStatus = z.infer<typeof benchmarkStatusSchema>;
