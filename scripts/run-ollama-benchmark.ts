/**
 * Ollama Real Benchmark Script (IFC-174)
 *
 * Runs ACTUAL benchmarks against a local Ollama instance.
 * Measures real latency, accuracy, and cost metrics.
 *
 * Usage:
 *   npx tsx scripts/run-ollama-benchmark.ts
 *
 * Prerequisites:
 *   - Ollama running at http://localhost:11434
 *   - mistral model pulled: ollama pull mistral
 *
 * Output:
 *   - artifacts/benchmarks/accuracy-benchmarks.json (replaces simulated data)
 *   - artifacts/reports/ollama-real-benchmark-report.json (detailed report)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ============================================================================
// Utilities
// ============================================================================

function findProjectRoot(): string {
  let dir = __dirname;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const projectRoot = findProjectRoot();

function loadEnvFiles(): void {
  const envFiles = [
    path.join(projectRoot, '.env'),
    path.join(projectRoot, '.env.local'),
    path.join(projectRoot, '.env.development'),
  ];

  for (const envFile of envFiles) {
    if (fs.existsSync(envFile)) {
      const content = fs.readFileSync(envFile, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) continue;
        const key = trimmed.slice(0, eqIndex).trim();
        let value = trimmed.slice(eqIndex + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
}

loadEnvFiles();

// Force Ollama provider BEFORE importing scoring chain
// Override .env.development default (llama2) — benchmark targets mistral:7b
process.env.AI_PROVIDER = 'ollama';
process.env.OLLAMA_MODEL = 'mistral';

// ============================================================================
// Ollama Availability
// ============================================================================

async function checkOllamaAvailable(): Promise<boolean> {
  const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function getOllamaVersion(): Promise<string> {
  const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  try {
    const response = await fetch(`${baseUrl}/api/version`, {
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const data = (await response.json()) as { version: string };
      return data.version;
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

// ============================================================================
// Statistics
// ============================================================================

function sampleStdDev(arr: number[]): number {
  if (arr.length <= 1) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const squareDiffs = arr.map((v) => Math.pow(v - mean, 2));
  // NF-004: sample stddev uses (n-1) denominator
  return Math.sqrt(
    squareDiffs.reduce((a, b) => a + b, 0) / (arr.length - 1)
  );
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// ============================================================================
// Test Leads (reused from run-accuracy-benchmark.ts)
// ============================================================================

const TEST_LEADS = [
  // High quality (expected score: 80-100)
  {
    email: 'cto@enterprise.com',
    firstName: 'Sarah',
    lastName: 'Johnson',
    company: 'Enterprise Corp',
    title: 'Chief Technology Officer',
    phone: '+1-555-0100',
    source: 'REFERRAL' as const,
  },
  {
    email: 'vp.sales@bigcorp.com',
    firstName: 'Michael',
    lastName: 'Chen',
    company: 'BigCorp Industries',
    title: 'VP of Sales',
    phone: '+1-555-0101',
    source: 'WEBSITE' as const,
  },
  // Medium quality (expected score: 50-79)
  {
    email: 'manager@midsize.com',
    firstName: 'Emily',
    lastName: 'Davis',
    company: 'MidSize LLC',
    title: 'Marketing Manager',
    source: 'EVENT' as const,
  },
  {
    email: 'analyst@startup.io',
    firstName: 'James',
    company: 'Startup Inc',
    source: 'SOCIAL' as const,
  },
  // Low quality (expected score: 0-49)
  {
    email: 'info@unknown.com',
    source: 'COLD_CALL' as const,
  },
  {
    email: 'test@gmail.com',
    firstName: 'Test',
    source: 'OTHER' as const,
  },
];

// ============================================================================
// Benchmark Runner
// ============================================================================

interface BenchmarkRawResult {
  lead: (typeof TEST_LEADS)[number];
  result: {
    score: number;
    confidence: number;
    factors: Array<{ name: string; impact: number; reasoning: string }>;
    modelVersion: string;
  };
  latencyMs: number;
  tier: 'high' | 'medium' | 'low';
  iteration: number;
  error: boolean;
}

async function runBenchmark(): Promise<void> {
  console.log('='.repeat(70));
  console.log('  IFC-174: REAL OLLAMA BENCHMARK');
  console.log('  Testing actual Ollama inference with lead scoring');
  console.log('='.repeat(70));
  console.log();

  // Check availability (AC-005)
  const available = await checkOllamaAvailable();
  if (!available) {
    console.log('ERROR: Ollama is not available at http://localhost:11434');
    console.log();
    console.log('Setup instructions:');
    console.log(
      '  1. docker compose -f docker-compose.yml -f docker-compose.ollama.yml up -d ollama'
    );
    console.log(
      '  2. docker exec intelliflow-ollama ollama pull mistral'
    );
    console.log('  3. Verify: curl http://localhost:11434/api/tags');
    console.log('  4. Re-run: npx tsx scripts/run-ollama-benchmark.ts');
    console.log();
    console.log('NF-001: Exiting without writing any data.');
    process.exit(1);
  }

  const ollamaVersion = await getOllamaVersion();
  const model = process.env.OLLAMA_MODEL || 'mistral';
  console.log(`Ollama version: ${ollamaVersion}`);
  console.log(`Model: ${model}`);
  console.log();

  // Import scoring chain (after AI_PROVIDER=ollama is set)
  let leadScoringChain: any;
  try {
    // On Windows, dynamic import needs file:// URL for absolute paths
    const scoringChainPath = path.join(
      projectRoot,
      'apps/ai-worker/src/chains/scoring.chain'
    );
    const importPath =
      process.platform === 'win32'
        ? `file:///${scoringChainPath.replace(/\\/g, '/')}`
        : scoringChainPath;
    const scoringModule = await import(importPath);
    leadScoringChain = scoringModule.leadScoringChain;
    console.log('Loaded scoring chain\n');
  } catch (error) {
    console.log('Failed to load AI worker modules:', error);
    console.log(
      'Make sure to build the ai-worker package first: pnpm --filter ai-worker build'
    );
    process.exit(1);
  }

  // Warmup (avoid cold-start skew)
  console.log('Running warmup (1 lead, discarded)...');
  try {
    await leadScoringChain.scoreLead(TEST_LEADS[0]);
    console.log('Warmup complete\n');
  } catch (error) {
    console.log('Warmup failed:', error);
    console.log('Continuing anyway...\n');
  }

  // Main benchmark: 6 leads x 5 iterations = 30 operations (NF-005)
  const iterations = 5;
  const allResults: BenchmarkRawResult[] = [];
  let errors = 0;

  console.log(
    `Running benchmark: ${TEST_LEADS.length} leads x ${iterations} iterations = ${TEST_LEADS.length * iterations} operations`
  );
  console.log();

  for (let iter = 0; iter < iterations; iter++) {
    process.stdout.write(`  Iteration ${iter + 1}/${iterations}: `);

    for (let i = 0; i < TEST_LEADS.length; i++) {
      const lead = TEST_LEADS[i];
      const tier: 'high' | 'medium' | 'low' =
        i < 2 ? 'high' : i < 4 ? 'medium' : 'low';

      // NF-003: performance.now() for sub-millisecond precision
      const start = performance.now();

      try {
        const result = await leadScoringChain.scoreLead(lead);
        const latencyMs = performance.now() - start;
        allResults.push({
          lead,
          result,
          latencyMs,
          tier,
          iteration: iter,
          error: false,
        });
        process.stdout.write('.');
      } catch (error) {
        const latencyMs = performance.now() - start;
        errors++;
        allResults.push({
          lead,
          result: {
            score: 0,
            confidence: 0,
            factors: [],
            modelVersion: 'error:v1',
          },
          latencyMs,
          tier,
          iteration: iter,
          error: true,
        });
        process.stdout.write('x');
      }
    }
    console.log();
  }

  console.log();

  // Compute statistics
  const successfulResults = allResults.filter((r) => !r.error);
  const scores = successfulResults.map((r) => r.result.score);
  const confidences = successfulResults.map((r) => r.result.confidence);
  const latencies = successfulResults.map((r) => r.latencyMs);

  const highScores = successfulResults
    .filter((r) => r.tier === 'high')
    .map((r) => r.result.score);
  const mediumScores = successfulResults
    .filter((r) => r.tier === 'medium')
    .map((r) => r.result.score);
  const lowScores = successfulResults
    .filter((r) => r.tier === 'low')
    .map((r) => r.result.score);

  const avgHighQuality = avg(highScores);
  const avgMediumQuality = avg(mediumScores);
  const avgLowQuality = avg(lowScores);
  const scoreDifferentiation = avgHighQuality - avgLowQuality;

  // Factor completeness: % of results with >=4 factors and reasoning >=10 chars
  const factorComplete = successfulResults.filter((r) => {
    const hasEnoughFactors = r.result.factors.length >= 4;
    const allHaveReasoning = r.result.factors.every(
      (f) => f.reasoning && f.reasoning.length >= 10
    );
    return hasEnoughFactors && allHaveReasoning;
  });
  const factorCompletenessPct =
    successfulResults.length > 0
      ? (factorComplete.length / successfulResults.length) * 100
      : 0;

  const totalOps = allResults.length;
  const errorRate = errors / totalOps;

  // KPI validation
  const latencyP95 = percentile(latencies, 95);
  const kpiValidation = {
    latency_p95_under_2s: latencyP95 < 2000,
    score_differentiation_adequate: scoreDifferentiation >= 20,
    error_rate_under_5pct: errorRate < 0.05,
    factor_completeness_above_80pct: factorCompletenessPct >= 80,
    all_targets_met:
      latencyP95 < 2000 &&
      scoreDifferentiation >= 20 &&
      errorRate < 0.05 &&
      factorCompletenessPct >= 80,
  };

  // Print summary
  console.log('='.repeat(70));
  console.log('  BENCHMARK RESULTS');
  console.log('='.repeat(70));
  console.log();

  console.log(`Model: ollama/${model}`);
  console.log(
    `Operations: ${totalOps} (${errors} errors, ${(errorRate * 100).toFixed(1)}% error rate)`
  );
  console.log();

  console.log('Scoring Accuracy:');
  console.log(
    `  Average Score: ${avg(scores).toFixed(1)} (stddev=${sampleStdDev(scores).toFixed(1)})`
  );
  console.log(
    `  Average Confidence: ${(avg(confidences) * 100).toFixed(1)}%`
  );
  console.log(`  High Quality Avg: ${avgHighQuality.toFixed(1)}`);
  console.log(`  Medium Quality Avg: ${avgMediumQuality.toFixed(1)}`);
  console.log(`  Low Quality Avg: ${avgLowQuality.toFixed(1)}`);
  console.log(
    `  Score Differentiation: ${scoreDifferentiation.toFixed(1)}`
  );
  console.log(
    `  Factor Completeness: ${factorCompletenessPct.toFixed(1)}%`
  );
  console.log();

  console.log('Latency:');
  console.log(`  Average: ${avg(latencies).toFixed(0)}ms`);
  console.log(`  p50: ${percentile(latencies, 50).toFixed(0)}ms`);
  console.log(`  p95: ${latencyP95.toFixed(0)}ms`);
  console.log(`  p99: ${percentile(latencies, 99).toFixed(0)}ms`);
  console.log();

  console.log('Cost: $0.00 (Ollama is free)');
  console.log();

  console.log('='.repeat(70));
  console.log('  KPI VALIDATION');
  console.log('='.repeat(70));
  console.log();
  console.log(
    `  p95 latency < 2000ms: ${kpiValidation.latency_p95_under_2s ? 'PASS' : 'FAIL'} (${latencyP95.toFixed(0)}ms)`
  );
  console.log(
    `  Score diff >= 20: ${kpiValidation.score_differentiation_adequate ? 'PASS' : 'FAIL'} (${scoreDifferentiation.toFixed(1)})`
  );
  console.log(
    `  Error rate < 5%: ${kpiValidation.error_rate_under_5pct ? 'PASS' : 'FAIL'} (${(errorRate * 100).toFixed(1)}%)`
  );
  console.log(
    `  Factor completeness >= 80%: ${kpiValidation.factor_completeness_above_80pct ? 'PASS' : 'FAIL'} (${factorCompletenessPct.toFixed(1)}%)`
  );
  console.log();

  // Write accuracy-benchmarks.json (AC-003)
  const timestamp = new Date().toISOString();
  const accuracyBenchmarks = {
    $schema: '../schemas/benchmark.schema.json',
    benchmark_id: 'IFC-174-ollama-benchmark',
    title: 'AI Model Accuracy Benchmarks for Lead Scoring',
    description:
      'Real benchmark results from actual Ollama inference operations (IFC-174)',
    timestamp,
    environment: {
      node: process.version,
      platform: process.platform,
      ollama_version: ollamaVersion,
      model,
    },
    test_configuration: {
      test_leads_count: TEST_LEADS.length,
      iterations_per_lead: iterations,
      total_operations: totalOps,
      warmup_runs: 1,
      lead_categories: {
        high: 2,
        medium: 2,
        low: 2,
      },
    },
    results: {
      models: [
        {
          model_id: model,
          provider: 'ollama' as const,
          accuracy_metrics: {
            avg_score: Number(avg(scores).toFixed(2)),
            score_std_dev: Number(sampleStdDev(scores).toFixed(2)),
            avg_confidence: Number(avg(confidences).toFixed(3)),
            high_quality_avg: Number(avgHighQuality.toFixed(2)),
            medium_quality_avg: Number(avgMediumQuality.toFixed(2)),
            low_quality_avg: Number(avgLowQuality.toFixed(2)),
            score_differentiation: Number(
              scoreDifferentiation.toFixed(2)
            ),
            factor_completeness_pct: Number(
              factorCompletenessPct.toFixed(2)
            ),
          },
          latency_ms: {
            avg: Number(avg(latencies).toFixed(2)),
            p50: Number(percentile(latencies, 50).toFixed(2)),
            p95: Number(percentile(latencies, 95).toFixed(2)),
            p99: Number(percentile(latencies, 99).toFixed(2)),
          },
          cost_per_1k_leads_usd: 0,
          error_rate: Number(errorRate.toFixed(4)),
          runs: successfulResults.length,
        },
      ],
    },
    kpi_validation: kpiValidation,
    conclusions: [
      `Tested ollama/${model} with ${totalOps} real scoring operations`,
      `Average latency: ${avg(latencies).toFixed(0)}ms (p95: ${latencyP95.toFixed(0)}ms)`,
      `Score differentiation: ${scoreDifferentiation.toFixed(1)} points between high and low quality leads`,
      `Factor completeness: ${factorCompletenessPct.toFixed(1)}%`,
      'Cost per 1K leads: $0.00 (Ollama is free)',
      errors > 0
        ? `Error rate: ${(errorRate * 100).toFixed(1)}%`
        : 'No errors during benchmark',
    ],
  };

  const benchmarkPath = path.join(
    projectRoot,
    'artifacts/benchmarks/accuracy-benchmarks.json'
  );
  fs.writeFileSync(benchmarkPath, JSON.stringify(accuracyBenchmarks, null, 2));
  console.log(`Accuracy benchmarks written to: ${benchmarkPath}`);

  // Write detailed report (AC-004)
  const report = {
    report_id: 'IFC-174-ollama-real-benchmark-report',
    title: 'Real Ollama Benchmark Report',
    description:
      'Comprehensive benchmark of Ollama mistral model for lead scoring with real inference',
    task_reference: 'IFC-174',
    dependencies: ['IFC-085', 'IFC-168'],
    timestamp,
    methodology: {
      approach:
        'Score 6 test leads across 5 iterations using real Ollama inference',
      warmup:
        '1 warmup lead scored and discarded to avoid cold-start model loading skew',
      timing: 'performance.now() for sub-millisecond precision (NF-003)',
      statistics: 'Sample standard deviation with n-1 denominator (NF-004)',
      minimum_operations: `${totalOps} operations (>= 30 MIN_SAMPLE_SIZE per AIConstants.ts)`,
      lead_distribution:
        '2 high-quality (C-suite, corporate), 2 medium (managers), 2 low (free email)',
      provider: `Ollama ${ollamaVersion} with ${model} model`,
    },
    environment: {
      node: process.version,
      platform: process.platform,
      ollama_version: ollamaVersion,
      model,
      benchmark_date: timestamp,
    },
    summary: {
      total_operations: totalOps,
      successful_operations: successfulResults.length,
      error_count: errors,
      error_rate: Number(errorRate.toFixed(4)),
      avg_score: Number(avg(scores).toFixed(2)),
      score_std_dev: Number(sampleStdDev(scores).toFixed(2)),
      avg_confidence: Number(avg(confidences).toFixed(3)),
      avg_latency_ms: Number(avg(latencies).toFixed(2)),
      p50_latency_ms: Number(percentile(latencies, 50).toFixed(2)),
      p95_latency_ms: Number(percentile(latencies, 95).toFixed(2)),
      p99_latency_ms: Number(percentile(latencies, 99).toFixed(2)),
      score_differentiation: Number(scoreDifferentiation.toFixed(2)),
      factor_completeness_pct: Number(factorCompletenessPct.toFixed(2)),
      cost_per_1k_leads_usd: 0,
    },
    tier_breakdown: {
      high: {
        count: highScores.length,
        avg_score: Number(avgHighQuality.toFixed(2)),
        std_dev: Number(sampleStdDev(highScores).toFixed(2)),
      },
      medium: {
        count: mediumScores.length,
        avg_score: Number(avgMediumQuality.toFixed(2)),
        std_dev: Number(sampleStdDev(mediumScores).toFixed(2)),
      },
      low: {
        count: lowScores.length,
        avg_score: Number(avgLowQuality.toFixed(2)),
        std_dev: Number(sampleStdDev(lowScores).toFixed(2)),
      },
    },
    kpi_validation: kpiValidation,
    conclusions: accuracyBenchmarks.conclusions,
  };

  const reportPath = path.join(
    projectRoot,
    'artifacts/reports/ollama-real-benchmark-report.json'
  );
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Detailed report written to: ${reportPath}`);
  console.log();
  console.log('='.repeat(70));
}

runBenchmark().catch((error) => {
  console.error('Benchmark failed:', error);
  process.exit(1);
});
