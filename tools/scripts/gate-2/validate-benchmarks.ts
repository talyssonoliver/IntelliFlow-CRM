/**
 * Gate 2 Validation Script: Benchmark Success Rate
 *
 * Purpose: Validates that authenticated benchmark endpoints pass at >95% rate.
 * This is a key quality gate for Gate 2 investment release.
 *
 * Expected behavior:
 * - EXIT 0: Benchmark success rate >= 95%
 * - EXIT 1: Benchmark success rate < 95%
 *
 * Usage: npx tsx tools/scripts/gate-2/validate-benchmarks.ts
 *
 * @see .specify/sprints/sprint-15/specifications/IFC-027-spec.md AC-007
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

interface K6Results {
  metrics: {
    http_req_failed?: {
      type: string;
      contains: string;
      values: {
        rate: number;
        passes?: number;
        fails?: number;
      };
    };
    http_req_duration?: {
      type: string;
      contains: string;
      values: {
        avg: number;
        min: number;
        med: number;
        max: number;
        'p(90)': number;
        'p(95)': number;
      };
    };
    http_reqs?: {
      type: string;
      contains: string;
      values: {
        count: number;
        rate: number;
      };
    };
  };
}

interface ValidationResult {
  gate: 'benchmarks';
  passed: boolean;
  exitCode: number;
  timestamp: string;
  threshold: number;
  actual: {
    successRate: number;
    failureRate: number;
    totalRequests: number | null;
    avgDuration: number | null;
    p95Duration: number | null;
  };
  gap: number;
}

const SUCCESS_THRESHOLD = 0.95; // 95% success rate

function validateBenchmarks(): ValidationResult {
  const benchmarkPath = join(process.cwd(), 'artifacts', 'benchmarks', 'k6-latest.json');

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Gate 2 Validation: Benchmark Success Rate                   ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Target Success Rate: ${(SUCCESS_THRESHOLD * 100).toFixed(0)}%`.padEnd(63) + '║');
  console.log(`║  Source: artifacts/benchmarks/k6-latest.json`.padEnd(63) + '║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  if (!existsSync(benchmarkPath)) {
    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│  ✗ FAIL: Benchmark results not found                        │');
    console.log('│  Run k6 benchmarks first:                                   │');
    console.log('│  k6 run artifacts/misc/k6/gate2-benchmark.js \\              │');
    console.log('│    --out json=artifacts/benchmarks/k6-latest.json           │');
    console.log('└─────────────────────────────────────────────────────────────┘');

    return {
      gate: 'benchmarks',
      passed: false,
      exitCode: 1,
      timestamp: new Date().toISOString(),
      threshold: SUCCESS_THRESHOLD,
      actual: {
        successRate: 0,
        failureRate: 1,
        totalRequests: null,
        avgDuration: null,
        p95Duration: null,
      },
      gap: SUCCESS_THRESHOLD,
    };
  }

  let results: K6Results;
  try {
    results = JSON.parse(readFileSync(benchmarkPath, 'utf-8'));
  } catch {
    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│  ✗ FAIL: Invalid benchmark results format                   │');
    console.log('└─────────────────────────────────────────────────────────────┘');

    return {
      gate: 'benchmarks',
      passed: false,
      exitCode: 1,
      timestamp: new Date().toISOString(),
      threshold: SUCCESS_THRESHOLD,
      actual: {
        successRate: 0,
        failureRate: 1,
        totalRequests: null,
        avgDuration: null,
        p95Duration: null,
      },
      gap: SUCCESS_THRESHOLD,
    };
  }

  const failureRate = results.metrics?.http_req_failed?.values?.rate ?? 0;
  const successRate = 1 - failureRate;
  const totalRequests = results.metrics?.http_reqs?.values?.count ?? null;
  const avgDuration = results.metrics?.http_req_duration?.values?.avg ?? null;
  const p95Duration = results.metrics?.http_req_duration?.values?.['p(95)'] ?? null;

  console.log('┌─────────────────────────────────────────────────────────────┐');
  console.log('│  Benchmark Results                                          │');
  console.log('├───────────────────────┬──────────────────────────────────────┤');
  console.log(`│ Success Rate          │ ${(successRate * 100).toFixed(2)}%`.padEnd(63) + '│');
  console.log(`│ Failure Rate          │ ${(failureRate * 100).toFixed(2)}%`.padEnd(63) + '│');

  if (totalRequests !== null) {
    console.log(`│ Total Requests        │ ${totalRequests}`.padEnd(63) + '│');
  }
  if (avgDuration !== null) {
    console.log(`│ Avg Duration          │ ${avgDuration.toFixed(2)}ms`.padEnd(63) + '│');
  }
  if (p95Duration !== null) {
    console.log(`│ P95 Duration          │ ${p95Duration.toFixed(2)}ms`.padEnd(63) + '│');
  }

  console.log('└───────────────────────┴──────────────────────────────────────┘');
  console.log('');

  const passed = successRate >= SUCCESS_THRESHOLD;
  const gap = Math.max(0, SUCCESS_THRESHOLD - successRate);

  if (passed) {
    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│  ✓ PASS: Benchmark success rate meets threshold             │');
    console.log(
      `│  ${(successRate * 100).toFixed(2)}% >= ${(SUCCESS_THRESHOLD * 100).toFixed(0)}%`.padEnd(
        62
      ) + '│'
    );
    console.log('└─────────────────────────────────────────────────────────────┘');
  } else {
    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│  ✗ FAIL: Benchmark success rate below threshold             │');
    console.log(
      `│  ${(successRate * 100).toFixed(2)}% < ${(SUCCESS_THRESHOLD * 100).toFixed(0)}%`.padEnd(
        62
      ) + '│'
    );
    console.log(`│  Gap: Need +${(gap * 100).toFixed(2)}% improvement`.padEnd(62) + '│');
    console.log('│                                                             │');
    console.log('│  Common causes:                                             │');
    console.log('│  - Missing authentication tokens in k6 scripts              │');
    console.log('│  - API server not running                                   │');
    console.log('│  - Rate limiting or throttling                              │');
    console.log('└─────────────────────────────────────────────────────────────┘');
  }

  return {
    gate: 'benchmarks',
    passed,
    exitCode: passed ? 0 : 1,
    timestamp: new Date().toISOString(),
    threshold: SUCCESS_THRESHOLD,
    actual: {
      successRate,
      failureRate,
      totalRequests,
      avgDuration,
      p95Duration,
    },
    gap,
  };
}

// Main execution
const result = validateBenchmarks();

// Save result to artifacts
const artifactsDir = join(process.cwd(), 'artifacts', 'gate-2');
if (!existsSync(artifactsDir)) {
  mkdirSync(artifactsDir, { recursive: true });
}

writeFileSync(join(artifactsDir, 'benchmark-validation.json'), JSON.stringify(result, null, 2));

console.log('');
console.log(`Result saved to: artifacts/gate-2/benchmark-validation.json`);

process.exit(result.passed ? 0 : 1);
