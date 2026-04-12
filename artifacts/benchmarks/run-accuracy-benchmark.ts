/**
 * Real AI Accuracy Benchmark Script
 *
 * This script runs ACTUAL benchmarks against configured AI providers.
 * It tests real lead scoring operations and measures actual performance.
 *
 * Usage:
 *   npx tsx artifacts/benchmarks/run-accuracy-benchmark.ts
 *
 * Requirements:
 *   - OPENAI_API_KEY in .env for OpenAI tests
 *   - Ollama running locally for Ollama tests
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// Find project root
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

// Load environment variables
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
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
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

// Test lead data with varying quality levels
const TEST_LEADS = [
  // High quality leads (expected score: 80-100)
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
  // Medium quality leads (expected score: 50-79)
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
  // Low quality leads (expected score: 0-49)
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

interface BenchmarkResult {
  model_id: string;
  provider: string;
  runs: number;
  accuracy_metrics: {
    avg_score: number;
    score_std_dev: number;
    avg_confidence: number;
    confidence_std_dev: number;
    high_quality_avg: number;
    medium_quality_avg: number;
    low_quality_avg: number;
    score_differentiation: number;
  };
  latency_ms: {
    avg: number;
    min: number;
    max: number;
    p50: number;
    p95: number;
    p99: number;
  };
  cost: {
    total_usd: number;
    per_lead_usd: number;
    per_1k_leads_usd: number;
  };
  errors: number;
  error_rate: number;
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function stdDev(arr: number[]): number {
  if (arr.length === 0) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const squareDiffs = arr.map(value => Math.pow(value - mean, 2));
  return Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / arr.length);
}

async function checkOllamaAvailable(): Promise<boolean> {
  const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function checkOpenAIAvailable(): Promise<boolean> {
  return !!process.env.OPENAI_API_KEY;
}

async function runBenchmark(): Promise<void> {
  console.log('═'.repeat(70));
  console.log('  REAL AI ACCURACY BENCHMARK');
  console.log('  Testing actual AI models with real scoring operations');
  console.log('═'.repeat(70));
  console.log();

  const results: BenchmarkResult[] = [];
  const availableProviders: string[] = [];

  // Check available providers
  const ollamaAvailable = await checkOllamaAvailable();
  const openaiAvailable = await checkOpenAIAvailable();

  console.log('📋 Provider Availability:');
  console.log(`   OpenAI: ${openaiAvailable ? '✅ Available (API key found)' : '❌ Not available (no OPENAI_API_KEY)'}`);
  console.log(`   Ollama: ${ollamaAvailable ? '✅ Available (server running)' : '❌ Not available (server not running)'}`);
  console.log();

  if (!ollamaAvailable && !openaiAvailable) {
    console.log('❌ No AI providers available. Cannot run real benchmarks.');
    console.log('   To run real benchmarks, either:');
    console.log('   1. Set OPENAI_API_KEY in .env.local');
    console.log('   2. Start Ollama server: ollama serve');
    console.log();

    // Save an honest "not run" result file
    const outputPath = path.join(projectRoot, 'artifacts/benchmarks/accuracy-benchmarks.json');
    const output = {
      $schema: '../schemas/benchmark.schema.json',
      benchmark_id: 'IFC-085-accuracy-benchmark',
      title: 'AI Model Accuracy Benchmarks for Lead Scoring',
      description: 'BENCHMARK NOT RUN - No AI providers available',
      timestamp: new Date().toISOString(),
      status: 'NOT_RUN',
      reason: 'No AI providers available. OPENAI_API_KEY not set and Ollama server not running.',
      environment: {
        node: process.version,
        platform: process.platform,
        openai_configured: openaiAvailable,
        ollama_available: ollamaAvailable,
      },
      instructions: [
        'To run real benchmarks, configure an AI provider:',
        '1. For OpenAI: Add OPENAI_API_KEY=sk-... to .env.local',
        '2. For Ollama: Install and run "ollama serve", then "ollama pull mistral"',
        'Then re-run: npx tsx artifacts/benchmarks/run-accuracy-benchmark.ts',
      ],
      results: {
        models: [],
      },
      kpi_validation: {
        benchmarks_run: false,
        all_targets_met: false,
      },
    };

    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`Status saved to: ${outputPath}`);
    console.log('Run this script again after configuring an AI provider.');
    process.exit(1);
  }

  // Import the scoring chain
  let leadScoringChain: any;
  let costTracker: any;

  try {
    const scoringModule = await import(path.join(projectRoot, 'apps/ai-worker/src/chains/scoring.chain'));
    leadScoringChain = scoringModule.leadScoringChain;

    const costModule = await import(path.join(projectRoot, 'apps/ai-worker/src/utils/cost-tracker'));
    costTracker = costModule.costTracker;

    console.log('✅ Loaded scoring chain and cost tracker\n');
  } catch (error) {
    console.log('❌ Failed to load AI worker modules:', error);
    console.log('   Make sure to build the ai-worker package first: pnpm --filter ai-worker build');
    process.exit(1);
  }

  // Test with current configured provider
  const currentProvider = process.env.AI_PROVIDER || 'openai';
  const currentModel = currentProvider === 'ollama'
    ? (process.env.OLLAMA_MODEL || 'mistral')
    : (process.env.OPENAI_MODEL || 'gpt-3.5-turbo');

  console.log(`📊 Running benchmark with ${currentProvider}/${currentModel}...`);
  console.log(`   Testing ${TEST_LEADS.length} leads x 3 iterations = ${TEST_LEADS.length * 3} scoring operations\n`);

  const iterations = 3;
  const scores: number[] = [];
  const confidences: number[] = [];
  const latencies: number[] = [];
  const highQualityScores: number[] = [];
  const mediumQualityScores: number[] = [];
  const lowQualityScores: number[] = [];
  let errors = 0;
  const startCost = costTracker?.getDailyCost?.() || 0;

  for (let iter = 0; iter < iterations; iter++) {
    console.log(`   Iteration ${iter + 1}/${iterations}...`);

    for (let i = 0; i < TEST_LEADS.length; i++) {
      const lead = TEST_LEADS[i];
      const startTime = performance.now();

      try {
        const result = await leadScoringChain.scoreLead(lead);
        const duration = performance.now() - startTime;

        latencies.push(duration);
        scores.push(result.score);
        confidences.push(result.confidence || 0.5);

        // Categorize by expected quality
        if (i < 2) {
          highQualityScores.push(result.score);
        } else if (i < 4) {
          mediumQualityScores.push(result.score);
        } else {
          lowQualityScores.push(result.score);
        }

        process.stdout.write('.');
      } catch (error) {
        errors++;
        process.stdout.write('x');
      }
    }
    console.log();
  }

  const endCost = costTracker?.getDailyCost?.() || 0;
  const totalCost = endCost - startCost;
  const totalRuns = TEST_LEADS.length * iterations;

  // Calculate metrics
  const avgHighQuality = highQualityScores.length > 0
    ? highQualityScores.reduce((a, b) => a + b, 0) / highQualityScores.length
    : 0;
  const avgMediumQuality = mediumQualityScores.length > 0
    ? mediumQualityScores.reduce((a, b) => a + b, 0) / mediumQualityScores.length
    : 0;
  const avgLowQuality = lowQualityScores.length > 0
    ? lowQualityScores.reduce((a, b) => a + b, 0) / lowQualityScores.length
    : 0;

  // Score differentiation: how well does the model distinguish quality tiers?
  // Higher is better (max 100 = perfect separation between high and low)
  const scoreDifferentiation = Math.min(100, Math.max(0, avgHighQuality - avgLowQuality));

  const result: BenchmarkResult = {
    model_id: currentModel,
    provider: currentProvider,
    runs: totalRuns - errors,
    accuracy_metrics: {
      avg_score: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
      score_std_dev: stdDev(scores),
      avg_confidence: confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0,
      confidence_std_dev: stdDev(confidences),
      high_quality_avg: avgHighQuality,
      medium_quality_avg: avgMediumQuality,
      low_quality_avg: avgLowQuality,
      score_differentiation: scoreDifferentiation,
    },
    latency_ms: {
      avg: latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
      min: latencies.length > 0 ? Math.min(...latencies) : 0,
      max: latencies.length > 0 ? Math.max(...latencies) : 0,
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
    },
    cost: {
      total_usd: totalCost,
      per_lead_usd: totalCost / (totalRuns - errors || 1),
      per_1k_leads_usd: (totalCost / (totalRuns - errors || 1)) * 1000,
    },
    errors,
    error_rate: errors / totalRuns,
  };

  results.push(result);

  // Print results
  console.log('\n' + '═'.repeat(70));
  console.log('  BENCHMARK RESULTS');
  console.log('═'.repeat(70));
  console.log();

  console.log(`Model: ${result.provider}/${result.model_id}`);
  console.log(`Runs: ${result.runs} (${result.errors} errors, ${(result.error_rate * 100).toFixed(1)}% error rate)`);
  console.log();

  console.log('Scoring Accuracy:');
  console.log(`  Average Score: ${result.accuracy_metrics.avg_score.toFixed(1)} (σ=${result.accuracy_metrics.score_std_dev.toFixed(1)})`);
  console.log(`  Average Confidence: ${(result.accuracy_metrics.avg_confidence * 100).toFixed(1)}%`);
  console.log(`  High Quality Leads Avg: ${result.accuracy_metrics.high_quality_avg.toFixed(1)}`);
  console.log(`  Medium Quality Leads Avg: ${result.accuracy_metrics.medium_quality_avg.toFixed(1)}`);
  console.log(`  Low Quality Leads Avg: ${result.accuracy_metrics.low_quality_avg.toFixed(1)}`);
  console.log(`  Score Differentiation: ${result.accuracy_metrics.score_differentiation.toFixed(1)} (higher=better tier separation)`);
  console.log();

  console.log('Latency:');
  console.log(`  Average: ${result.latency_ms.avg.toFixed(0)}ms`);
  console.log(`  p50: ${result.latency_ms.p50.toFixed(0)}ms`);
  console.log(`  p95: ${result.latency_ms.p95.toFixed(0)}ms`);
  console.log(`  p99: ${result.latency_ms.p99.toFixed(0)}ms`);
  console.log();

  console.log('Cost:');
  console.log(`  Total: $${result.cost.total_usd.toFixed(4)}`);
  console.log(`  Per Lead: $${result.cost.per_lead_usd.toFixed(6)}`);
  console.log(`  Per 1K Leads: $${result.cost.per_1k_leads_usd.toFixed(4)}`);
  console.log();

  // KPI Validation
  console.log('═'.repeat(70));
  console.log('  KPI VALIDATION');
  console.log('═'.repeat(70));
  console.log();

  const latencyTarget = 2000; // 2 seconds target for AI scoring
  const differentiationTarget = 20; // At least 20 points between high and low quality

  const latencyPassed = result.latency_ms.p95 < latencyTarget;
  const differentiationPassed = result.accuracy_metrics.score_differentiation >= differentiationTarget;

  console.log(`  Latency p95 < ${latencyTarget}ms: ${latencyPassed ? '✅ PASS' : '❌ FAIL'} (${result.latency_ms.p95.toFixed(0)}ms)`);
  console.log(`  Score Differentiation >= ${differentiationTarget}: ${differentiationPassed ? '✅ PASS' : '❌ FAIL'} (${result.accuracy_metrics.score_differentiation.toFixed(1)})`);
  console.log(`  Error Rate < 5%: ${result.error_rate < 0.05 ? '✅ PASS' : '❌ FAIL'} (${(result.error_rate * 100).toFixed(1)}%)`);
  console.log();

  // Save results
  const outputPath = path.join(projectRoot, 'artifacts/benchmarks/accuracy-benchmarks.json');
  const output = {
    $schema: '../schemas/benchmark.schema.json',
    benchmark_id: 'IFC-085-accuracy-benchmark',
    title: 'AI Model Accuracy Benchmarks for Lead Scoring',
    description: 'Real benchmark results from actual AI scoring operations',
    timestamp: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: process.platform,
      provider: currentProvider,
      model: currentModel,
    },
    test_configuration: {
      test_leads_count: TEST_LEADS.length,
      iterations_per_lead: iterations,
      total_operations: totalRuns,
      lead_categories: {
        high_quality: 2,
        medium_quality: 2,
        low_quality: 2,
      },
    },
    results: {
      models: results.map(r => ({
        model_id: r.model_id,
        provider: r.provider,
        accuracy_metrics: {
          avg_score: Number(r.accuracy_metrics.avg_score.toFixed(2)),
          score_std_dev: Number(r.accuracy_metrics.score_std_dev.toFixed(2)),
          avg_confidence: Number(r.accuracy_metrics.avg_confidence.toFixed(3)),
          high_quality_avg: Number(r.accuracy_metrics.high_quality_avg.toFixed(2)),
          medium_quality_avg: Number(r.accuracy_metrics.medium_quality_avg.toFixed(2)),
          low_quality_avg: Number(r.accuracy_metrics.low_quality_avg.toFixed(2)),
          score_differentiation: Number(r.accuracy_metrics.score_differentiation.toFixed(2)),
        },
        latency_ms: {
          avg: Number(r.latency_ms.avg.toFixed(2)),
          p50: Number(r.latency_ms.p50.toFixed(2)),
          p95: Number(r.latency_ms.p95.toFixed(2)),
          p99: Number(r.latency_ms.p99.toFixed(2)),
        },
        cost_per_1k_leads_usd: Number(r.cost.per_1k_leads_usd.toFixed(4)),
        error_rate: Number(r.error_rate.toFixed(4)),
        runs: r.runs,
      })),
    },
    kpi_validation: {
      latency_p95_under_2s: latencyPassed,
      score_differentiation_adequate: differentiationPassed,
      error_rate_under_5pct: result.error_rate < 0.05,
      all_targets_met: latencyPassed && differentiationPassed && result.error_rate < 0.05,
    },
    conclusions: [
      `Tested ${currentProvider}/${currentModel} with ${totalRuns} scoring operations`,
      `Average latency: ${result.latency_ms.avg.toFixed(0)}ms (p95: ${result.latency_ms.p95.toFixed(0)}ms)`,
      `Score differentiation: ${result.accuracy_metrics.score_differentiation.toFixed(1)} points between high and low quality leads`,
      `Cost per 1K leads: $${result.cost.per_1k_leads_usd.toFixed(4)}`,
      result.error_rate > 0 ? `Error rate: ${(result.error_rate * 100).toFixed(1)}%` : 'No errors during benchmark',
    ],
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`Results exported to: ${outputPath}`);
  console.log();
  console.log('═'.repeat(70));
}

// Run the benchmark
runBenchmark().catch((error) => {
  console.error('Benchmark failed:', error);
  process.exit(1);
});
