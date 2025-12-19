/**
 * Performance Benchmark Suite for IntelliFlow CRM
 *
 * Provides utilities for running performance benchmarks and validating
 * against performance budgets defined in the Sprint Plan.
 *
 * Targets (from Sprint Plan):
 * - API Response Time: p95 <100ms, p99 <200ms
 * - Frontend Load Time: First Contentful Paint <1s
 * - AI Scoring: <2s per lead
 * - Database Queries: <20ms for simple queries
 *
 * @module tools/perf/benchmark
 */

import { performance } from 'node:perf_hooks';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface BenchmarkResult {
  name: string;
  iterations: number;
  totalTime: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  p50: number;
  p95: number;
  p99: number;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface PerformanceBudget {
  metric: string;
  target: number;
  unit: 'ms' | 's' | 'MB' | 'score';
  threshold: 'error' | 'warn';
}

export interface BenchmarkSuite {
  name: string;
  description: string;
  results: BenchmarkResult[];
  budgets: PerformanceBudget[];
  passed: boolean;
  violations: string[];
  timestamp: string;
}

/**
 * Performance budgets aligned with Sprint Plan targets
 */
export const PERFORMANCE_BUDGETS: PerformanceBudget[] = [
  // API Performance
  { metric: 'api-p95', target: 100, unit: 'ms', threshold: 'error' },
  { metric: 'api-p99', target: 200, unit: 'ms', threshold: 'error' },
  { metric: 'api-avg', target: 50, unit: 'ms', threshold: 'warn' },

  // Frontend Performance
  { metric: 'fcp', target: 1000, unit: 'ms', threshold: 'error' }, // First Contentful Paint
  { metric: 'lcp', target: 2500, unit: 'ms', threshold: 'error' }, // Largest Contentful Paint
  { metric: 'fid', target: 100, unit: 'ms', threshold: 'error' }, // First Input Delay
  { metric: 'cls', target: 0.1, unit: 'score', threshold: 'error' }, // Cumulative Layout Shift
  { metric: 'tti', target: 3500, unit: 'ms', threshold: 'warn' }, // Time to Interactive

  // Database Performance
  { metric: 'db-query-simple', target: 20, unit: 'ms', threshold: 'error' },
  { metric: 'db-query-complex', target: 100, unit: 'ms', threshold: 'warn' },

  // AI Performance
  { metric: 'ai-scoring', target: 2000, unit: 'ms', threshold: 'error' },
  { metric: 'ai-prediction', target: 2000, unit: 'ms', threshold: 'warn' },

  // Build Performance
  { metric: 'build-full', target: 180000, unit: 'ms', threshold: 'warn' }, // 3 minutes
  { metric: 'test-suite', target: 900000, unit: 'ms', threshold: 'warn' }, // 15 minutes
];

/**
 * Runs a performance benchmark for a given function
 */
export async function benchmark<T>(
  name: string,
  fn: () => Promise<T> | T,
  options: {
    iterations?: number;
    warmup?: number;
    metadata?: Record<string, unknown>;
  } = {}
): Promise<BenchmarkResult> {
  const { iterations = 100, warmup = 10, metadata = {} } = options;

  const times: number[] = [];

  // Warmup runs
  for (let i = 0; i < warmup; i++) {
    await fn();
  }

  // Actual benchmark runs
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    const end = performance.now();
    times.push(end - start);
  }

  // Calculate statistics
  times.sort((a, b) => a - b);
  const totalTime = times.reduce((sum, t) => sum + t, 0);
  const avgTime = totalTime / iterations;
  const minTime = times[0];
  const maxTime = times[times.length - 1];
  const p50 = percentile(times, 50);
  const p95 = percentile(times, 95);
  const p99 = percentile(times, 99);

  return {
    name,
    iterations,
    totalTime,
    avgTime,
    minTime,
    maxTime,
    p50,
    p95,
    p99,
    timestamp: new Date().toISOString(),
    metadata,
  };
}

/**
 * Calculates percentile from sorted array
 */
function percentile(sorted: number[], p: number): number {
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index % 1;

  if (lower === upper) {
    return sorted[lower];
  }

  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Validates benchmark results against performance budgets
 */
export function validateBudgets(
  results: BenchmarkResult[],
  budgets: PerformanceBudget[] = PERFORMANCE_BUDGETS
): { passed: boolean; violations: string[] } {
  const violations: string[] = [];

  for (const budget of budgets) {
    const result = results.find((r) => r.name === budget.metric);
    if (!result) {
      continue; // Skip if metric not benchmarked
    }

    // Determine which value to check (p95, p99, avg, etc.)
    let value: number;
    if (budget.metric.includes('p95')) {
      value = result.p95;
    } else if (budget.metric.includes('p99')) {
      value = result.p99;
    } else if (budget.metric.includes('avg')) {
      value = result.avgTime;
    } else {
      value = result.p95; // Default to p95
    }

    if (value > budget.target) {
      const severity = budget.threshold === 'error' ? 'ERROR' : 'WARNING';
      violations.push(
        `[${severity}] ${budget.metric}: ${value.toFixed(2)}${budget.unit} exceeds budget of ${budget.target}${budget.unit}`
      );
    }
  }

  return {
    passed: violations.filter((v) => v.includes('ERROR')).length === 0,
    violations,
  };
}

/**
 * Saves benchmark results to artifacts directory
 */
export function saveBenchmarkResults(
  suite: BenchmarkSuite,
  filename: string = 'baseline.json'
): void {
  const artifactsDir = join(process.cwd(), 'artifacts', 'benchmarks');

  // Ensure directory exists
  if (!existsSync(artifactsDir)) {
    mkdirSync(artifactsDir, { recursive: true });
  }

  const filepath = join(artifactsDir, filename);

  // Write results
  writeFileSync(filepath, JSON.stringify(suite, null, 2), 'utf-8');

  console.log(`\nBenchmark results saved to: ${filepath}`);
}

/**
 * Loads previous benchmark results for comparison
 */
export function loadBaselineResults(filename: string = 'baseline.json'): BenchmarkSuite | null {
  const filepath = join(process.cwd(), 'artifacts', 'benchmarks', filename);

  if (!existsSync(filepath)) {
    return null;
  }

  try {
    const content = readFileSync(filepath, 'utf-8');
    return JSON.parse(content) as BenchmarkSuite;
  } catch (error) {
    console.error(`Failed to load baseline results: ${error}`);
    return null;
  }
}

/**
 * Compares current results with baseline
 */
export function compareWithBaseline(
  current: BenchmarkResult[],
  baseline: BenchmarkSuite | null
): void {
  if (!baseline) {
    console.log('\nNo baseline found for comparison.');
    return;
  }

  console.log('\n=== Comparison with Baseline ===\n');

  for (const currentResult of current) {
    const baselineResult = baseline.results.find((r) => r.name === currentResult.name);

    if (!baselineResult) {
      console.log(`${currentResult.name}: NEW (no baseline)`);
      continue;
    }

    const p95Diff = currentResult.p95 - baselineResult.p95;
    const p95Change = (p95Diff / baselineResult.p95) * 100;
    const indicator = p95Diff > 0 ? '📈' : '📉';
    const sign = p95Diff > 0 ? '+' : '';

    console.log(
      `${currentResult.name}: ${indicator} ${sign}${p95Change.toFixed(1)}% (p95: ${currentResult.p95.toFixed(2)}ms vs ${baselineResult.p95.toFixed(2)}ms)`
    );
  }
}

/**
 * Prints benchmark results in a formatted table
 */
export function printResults(suite: BenchmarkSuite): void {
  console.log(`\n=== ${suite.name} ===`);
  console.log(`Description: ${suite.description}`);
  console.log(`Timestamp: ${suite.timestamp}\n`);

  console.log('┌────────────────────────────┬──────────┬──────────┬──────────┬──────────┐');
  console.log('│ Metric                     │ Avg      │ p50      │ p95      │ p99      │');
  console.log('├────────────────────────────┼──────────┼──────────┼──────────┼──────────┤');

  for (const result of suite.results) {
    const name = result.name.padEnd(26);
    const avg = `${result.avgTime.toFixed(2)}ms`.padStart(8);
    const p50 = `${result.p50.toFixed(2)}ms`.padStart(8);
    const p95 = `${result.p95.toFixed(2)}ms`.padStart(8);
    const p99 = `${result.p99.toFixed(2)}ms`.padStart(8);

    console.log(`│ ${name} │ ${avg} │ ${p50} │ ${p95} │ ${p99} │`);
  }

  console.log('└────────────────────────────┴──────────┴──────────┴──────────┴──────────┘');

  // Print budget validation
  console.log('\n=== Budget Validation ===\n');

  if (suite.passed) {
    console.log('✅ All performance budgets met!');
  } else {
    console.log('❌ Performance budget violations detected:\n');
    for (const violation of suite.violations) {
      console.log(`  ${violation}`);
    }
  }
}

/**
 * Creates a baseline benchmark suite
 */
export async function createBaselineSuite(): Promise<BenchmarkSuite> {
  console.log('Running baseline performance benchmarks...\n');

  const results: BenchmarkResult[] = [];

  // Example: API response time benchmark (simulated)
  results.push(
    await benchmark(
      'api-p95',
      async () => {
        // Simulate API call
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 50));
      },
      { iterations: 100, warmup: 10, metadata: { endpoint: '/api/trpc' } }
    )
  );

  // Example: Database query benchmark (simulated)
  results.push(
    await benchmark(
      'db-query-simple',
      async () => {
        // Simulate simple DB query
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 10));
      },
      { iterations: 100, warmup: 10, metadata: { query: 'SELECT * FROM leads' } }
    )
  );

  // Validate against budgets
  const validation = validateBudgets(results);

  const suite: BenchmarkSuite = {
    name: 'IntelliFlow CRM - Baseline Performance',
    description: 'Initial performance baseline for Sprint 0 (ENV-015-AI)',
    results,
    budgets: PERFORMANCE_BUDGETS,
    passed: validation.passed,
    violations: validation.violations,
    timestamp: new Date().toISOString(),
  };

  return suite;
}

/**
 * Main execution: Run baseline benchmarks if executed directly
 */
if (require.main === module) {
  (async () => {
    try {
      // Create baseline suite
      const suite = await createBaselineSuite();

      // Load previous baseline for comparison
      const baseline = loadBaselineResults();

      // Print results
      printResults(suite);

      // Compare with baseline
      if (baseline) {
        compareWithBaseline(suite.results, baseline);
      }

      // Save results
      saveBenchmarkResults(suite);

      // Exit with error code if budgets violated
      process.exit(suite.passed ? 0 : 1);
    } catch (error) {
      console.error('Benchmark failed:', error);
      process.exit(1);
    }
  })();
}
