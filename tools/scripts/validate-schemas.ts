#!/usr/bin/env npx tsx
/**
 * Schema Validator
 *
 * Validates data files against their Zod schema definitions.
 * Run this in CI to ensure data files stay in sync with schemas.
 *
 * Usage: pnpm run validate:schemas
 *
 * Exit codes:
 * - 0: All validations passed
 * - 1: One or more validations failed
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { glob } from 'glob';
import { z } from 'zod';
import { vulnerabilityBaselineSchema } from './lib/schemas/vulnerability-baseline.schema.js';
import { attestationSchema } from './lib/schemas/attestation.schema.js';
import { taskStatusObjectSchema } from './lib/schemas/task-status.schema.js';
import { phaseSummarySchema } from './lib/schemas/phase-summary.schema.js';
import { sprintSummarySchema } from './lib/schemas/sprint-summary.schema.js';
import { taskRegistrySchema } from './lib/schemas/task-registry.schema.js';
import { dependencyGraphSchema } from './lib/schemas/dependency-graph.schema.js';
import { kpiDefinitionsSchema } from './lib/schemas/kpi-definitions.schema.js';
import { traceabilitySchema } from './lib/schemas/traceability.schema.js';
import { benchmarkSchema } from './lib/schemas/benchmark.schema.js';
// NOTE: extractedTextSchema and analyticsEventSchema not imported - no data files exist yet

// Get repo root
const fileUrl = new URL(import.meta.url);
const scriptPath =
  process.platform === 'win32'
    ? fileUrl.pathname.replace(/^\/([A-Za-z]):/, '$1:')
    : fileUrl.pathname;
const REPO_ROOT = join(dirname(scriptPath), '..', '..');
// Normalize to forward slashes for glob (required on Windows)
const REPO_ROOT_POSIX = REPO_ROOT.replace(/\\/g, '/');

// Schema to file pattern mappings
interface ValidationRule {
  name: string;
  schema: z.ZodType;
  patterns: string[];
  ignore?: string[];  // Glob patterns to ignore
}

const VALIDATION_RULES: ValidationRule[] = [
  // ✅ Working - keep as-is
  {
    name: 'Vulnerability Baseline',
    schema: vulnerabilityBaselineSchema,
    patterns: [
      'artifacts/misc/vulnerability-baseline.json',
    ],
  },
  // 🔧 FIX: Attestation - changed path to .specify/ with context_ack.json
  {
    name: 'Attestation',
    schema: attestationSchema,
    patterns: [
      '.specify/sprints/sprint-*/attestations/*/context_ack.json',
    ],
  },
  // 🔧 FIX: Task Status - use ignore option for summaries
  {
    name: 'Task Status',
    schema: taskStatusObjectSchema,
    patterns: [
      'apps/project-tracker/docs/metrics/sprint-*/phase-*/*.json',
      'apps/project-tracker/docs/metrics/sprint-*/*.json',  // flat structure (sprint-12)
    ],
    ignore: [
      'apps/project-tracker/docs/metrics/sprint-*/phase-*/_phase-summary.json',
      'apps/project-tracker/docs/metrics/sprint-*/_summary.json',
      'apps/project-tracker/docs/metrics/_global/**',
      'apps/project-tracker/docs/metrics/schemas/**',
    ],
  },
  {
    name: 'Phase Summary',
    schema: phaseSummarySchema,
    patterns: [
      'apps/project-tracker/docs/metrics/sprint-*/phase-*/_phase-summary.json',
    ],
  },
  {
    name: 'Sprint Summary',
    schema: sprintSummarySchema,
    patterns: [
      'apps/project-tracker/docs/metrics/sprint-*/_summary.json',
    ],
  },
  // ✅ Working - keep as-is
  {
    name: 'Task Registry',
    schema: taskRegistrySchema,
    patterns: [
      'apps/project-tracker/docs/metrics/_global/task-registry.json',
    ],
  },
  // ✅ Working - keep as-is
  {
    name: 'Dependency Graph',
    schema: dependencyGraphSchema,
    patterns: [
      'apps/project-tracker/docs/metrics/_global/dependency-graph.json',
    ],
  },
  // 🔧 FIX: KPI Definitions - correct path to _global/
  {
    name: 'KPI Definitions',
    schema: kpiDefinitionsSchema,
    patterns: [
      'apps/project-tracker/docs/metrics/_global/kpi-definitions.json',
    ],
  },
  {
    name: 'Traceability',
    schema: traceabilitySchema,
    patterns: [
      'artifacts/reports/traceability-matrix.json',
    ],
  },
  // Benchmark results
  {
    name: 'Benchmark',
    schema: benchmarkSchema,
    patterns: [
      'artifacts/benchmarks/baseline.json',
      'artifacts/benchmarks/accuracy-benchmarks.json',
    ],
  },
  // NOTE: Extracted Text and Analytics Event rules removed - no data files exist yet
];

interface ValidationResult {
  file: string;
  rule: string;
  valid: boolean;
  errors?: string[];
}

async function validateFile(
  filePath: string,
  schema: z.ZodType,
  ruleName: string
): Promise<ValidationResult> {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);

    const result = schema.safeParse(data);

    if (result.success) {
      return { file: filePath, rule: ruleName, valid: true };
    } else {
      // Zod v4 uses 'issues' instead of 'errors'
      const issues = result.error.issues || [];
      const errors = issues.map(
        (e: { path: (string | number)[]; message: string }) =>
          `  - ${e.path.join('.')}: ${e.message}`
      );
      return { file: filePath, rule: ruleName, valid: false, errors };
    }
  } catch (error) {
    return {
      file: filePath,
      rule: ruleName,
      valid: false,
      errors: [`  - Parse error: ${error}`],
    };
  }
}

async function main(): Promise<void> {
  console.log('Validating data files against Zod schemas...\n');

  const results: ValidationResult[] = [];

  for (const rule of VALIDATION_RULES) {
    console.log(`Checking: ${rule.name}`);

    for (const pattern of rule.patterns) {
      // Use forward slashes for glob patterns (required on Windows)
      const fullPattern = REPO_ROOT_POSIX + '/' + pattern;
      const files = await glob(fullPattern, {
        nodir: true,
        dot: true,  // Match dotfiles and directories like .specify/
        ignore: rule.ignore?.map(p => REPO_ROOT_POSIX + '/' + p) || []
      });

      for (const file of files) {
        if (!existsSync(file)) continue;

        const result = await validateFile(file, rule.schema, rule.name);
        results.push(result);

        if (result.valid) {
          console.log(`  ✓ ${file.replace(REPO_ROOT, '.')}`);
        } else {
          console.log(`  ✗ ${file.replace(REPO_ROOT, '.')}`);
          result.errors?.forEach((e) => console.log(e));
        }
      }
    }
  }

  // Summary
  const passed = results.filter((r) => r.valid).length;
  const failed = results.filter((r) => !r.valid).length;

  console.log(`\n=== Summary ===`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${results.length}`);

  if (failed > 0) {
    console.log('\n❌ Schema validation failed!');
    console.log('Fix the errors above or update the schema if the structure intentionally changed.');
    console.log('To regenerate schemas: pnpm run generate:schemas');
    process.exit(1);
  } else {
    console.log('\n✅ All schema validations passed!');
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
