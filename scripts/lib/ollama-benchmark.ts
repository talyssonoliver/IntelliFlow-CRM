/**
 * Logic of the real Ollama benchmark (IFC-174), kept out of the CLI entry
 * (scripts/run-ollama-benchmark.ts) so it can be tested in-process: statistics,
 * KPI evaluation, report building, the iteration loop and the run orchestration
 * all take their I/O (fetch, the scoring chain, file writes, logging) as
 * arguments.
 */

// ============================================================================
// .env parsing
// ============================================================================

export function stripMatchingQuotes(value: string): string {
  const quoted =
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"));
  return quoted ? value.slice(1, -1) : value;
}

/** `KEY=value` -> [key, value]; null for blanks, comments and lines without `=`. */
export function parseEnvLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const eqIndex = trimmed.indexOf('=');
  if (eqIndex === -1) return null;
  const key = trimmed.slice(0, eqIndex).trim();
  const value = stripMatchingQuotes(trimmed.slice(eqIndex + 1).trim());
  return [key, value];
}

/** Apply `.env` file content to `env` without overriding keys that are already set. */
export function applyEnvContent(content: string, env: Record<string, string | undefined>): void {
  for (const line of content.split('\n')) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;
    const [key, value] = parsed;
    if (!env[key]) {
      env[key] = value;
    }
  }
}

// ============================================================================
// Ollama availability
// ============================================================================

type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal }
) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

const DEFAULT_BASE_URL = 'http://localhost:11434';

export async function checkOllamaAvailable(
  fetchFn: FetchLike,
  baseUrl: string = DEFAULT_BASE_URL
): Promise<boolean> {
  try {
    const response = await fetchFn(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
    return response.ok;
  } catch {
    return false;
  }
}

export async function getOllamaVersion(
  fetchFn: FetchLike,
  baseUrl: string = DEFAULT_BASE_URL
): Promise<string> {
  try {
    const response = await fetchFn(`${baseUrl}/api/version`, { signal: AbortSignal.timeout(5000) });
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

export function sampleStdDev(arr: number[]): number {
  if (arr.length <= 1) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const squareDiffs = arr.map((v) => Math.pow(v - mean, 2));
  // NF-004: sample stddev uses (n-1) denominator
  return Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / (arr.length - 1));
}

export function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

export function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// ============================================================================
// Test leads (reused from run-accuracy-benchmark.ts)
// ============================================================================

export const TEST_LEADS = [
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
// Benchmark runner
// ============================================================================

export type Tier = 'high' | 'medium' | 'low';

export interface BenchmarkRawResult {
  lead: (typeof TEST_LEADS)[number];
  result: {
    score: number;
    confidence: number;
    factors: Array<{ name: string; impact: number; reasoning: string }>;
    modelVersion: string;
  };
  latencyMs: number;
  tier: Tier;
  iteration: number;
  error: boolean;
}

export interface ScoringChain {
  scoreLead(lead: (typeof TEST_LEADS)[number]): Promise<BenchmarkRawResult['result']>;
}

/** The first two test leads are high quality, the next two medium, the rest low. */
export function tierForLeadIndex(index: number): Tier {
  if (index < 2) return 'high';
  if (index < 4) return 'medium';
  return 'low';
}

/** Score one lead, timing it; a failure becomes a zero-score error result. */
export async function scoreOneLead(
  chain: ScoringChain,
  lead: (typeof TEST_LEADS)[number],
  tier: Tier,
  iteration: number,
  now: () => number = () => performance.now()
): Promise<BenchmarkRawResult> {
  // NF-003: performance.now() for sub-millisecond precision
  const start = now();
  try {
    const result = await chain.scoreLead(lead);
    return { lead, result, latencyMs: now() - start, tier, iteration, error: false };
  } catch {
    return {
      lead,
      result: { score: 0, confidence: 0, factors: [], modelVersion: 'error:v1' },
      latencyMs: now() - start,
      tier,
      iteration,
      error: true,
    };
  }
}

/** All leads x `iterations`, printing one progress mark per operation. */
export async function runIterations(
  chain: ScoringChain,
  iterations: number,
  out: { write(text: string): void; log(...args: unknown[]): void },
  now?: () => number
): Promise<BenchmarkRawResult[]> {
  const allResults: BenchmarkRawResult[] = [];
  for (let iter = 0; iter < iterations; iter++) {
    out.write(`  Iteration ${iter + 1}/${iterations}: `);
    for (let i = 0; i < TEST_LEADS.length; i++) {
      const row = await scoreOneLead(chain, TEST_LEADS[i], tierForLeadIndex(i), iter, now);
      allResults.push(row);
      out.write(row.error ? 'x' : '.');
    }
    out.log();
  }
  return allResults;
}

export interface BenchmarkStats {
  totalOps: number;
  errors: number;
  errorRate: number;
  successful: BenchmarkRawResult[];
  scores: number[];
  confidences: number[];
  latencies: number[];
  highScores: number[];
  mediumScores: number[];
  lowScores: number[];
  avgHighQuality: number;
  avgMediumQuality: number;
  avgLowQuality: number;
  scoreDifferentiation: number;
  factorCompletenessPct: number;
  latencyP95: number;
}

export function computeStats(allResults: BenchmarkRawResult[]): BenchmarkStats {
  const successful = allResults.filter((r) => !r.error);
  const scoresOf = (tier: Tier) =>
    successful.filter((r) => r.tier === tier).map((r) => r.result.score);
  const highScores = scoresOf('high');
  const mediumScores = scoresOf('medium');
  const lowScores = scoresOf('low');
  const avgHighQuality = avg(highScores);
  const avgLowQuality = avg(lowScores);

  // Factor completeness: % of results with >=4 factors and reasoning >=10 chars
  const factorComplete = successful.filter(
    (r) =>
      r.result.factors.length >= 4 &&
      r.result.factors.every((f) => f.reasoning && f.reasoning.length >= 10)
  );
  const errors = allResults.length - successful.length;
  const latencies = successful.map((r) => r.latencyMs);

  return {
    totalOps: allResults.length,
    errors,
    errorRate: errors / allResults.length,
    successful,
    scores: successful.map((r) => r.result.score),
    confidences: successful.map((r) => r.result.confidence),
    latencies,
    highScores,
    mediumScores,
    lowScores,
    avgHighQuality,
    avgMediumQuality: avg(mediumScores),
    avgLowQuality,
    scoreDifferentiation: avgHighQuality - avgLowQuality,
    factorCompletenessPct:
      successful.length > 0 ? (factorComplete.length / successful.length) * 100 : 0,
    latencyP95: percentile(latencies, 95),
  };
}

export function evaluateKpis(stats: BenchmarkStats) {
  const latencyOk = stats.latencyP95 < 2000;
  const differentiationOk = stats.scoreDifferentiation >= 20;
  const errorsOk = stats.errorRate < 0.05;
  const completenessOk = stats.factorCompletenessPct >= 80;
  return {
    latency_p95_under_2s: latencyOk,
    score_differentiation_adequate: differentiationOk,
    error_rate_under_5pct: errorsOk,
    factor_completeness_above_80pct: completenessOk,
    all_targets_met: latencyOk && differentiationOk && errorsOk && completenessOk,
  };
}

const pf = (ok: boolean) => (ok ? 'PASS' : 'FAIL');

export function printSummary(
  stats: BenchmarkStats,
  kpis: ReturnType<typeof evaluateKpis>,
  model: string,
  log: (...args: unknown[]) => void
): void {
  log('='.repeat(70));
  log('  BENCHMARK RESULTS');
  log('='.repeat(70));
  log();

  log(`Model: ollama/${model}`);
  log(
    `Operations: ${stats.totalOps} (${stats.errors} errors, ${(stats.errorRate * 100).toFixed(1)}% error rate)`
  );
  log();

  log('Scoring Accuracy:');
  log(
    `  Average Score: ${avg(stats.scores).toFixed(1)} (stddev=${sampleStdDev(stats.scores).toFixed(1)})`
  );
  log(`  Average Confidence: ${(avg(stats.confidences) * 100).toFixed(1)}%`);
  log(`  High Quality Avg: ${stats.avgHighQuality.toFixed(1)}`);
  log(`  Medium Quality Avg: ${stats.avgMediumQuality.toFixed(1)}`);
  log(`  Low Quality Avg: ${stats.avgLowQuality.toFixed(1)}`);
  log(`  Score Differentiation: ${stats.scoreDifferentiation.toFixed(1)}`);
  log(`  Factor Completeness: ${stats.factorCompletenessPct.toFixed(1)}%`);
  log();

  log('Latency:');
  log(`  Average: ${avg(stats.latencies).toFixed(0)}ms`);
  log(`  p50: ${percentile(stats.latencies, 50).toFixed(0)}ms`);
  log(`  p95: ${stats.latencyP95.toFixed(0)}ms`);
  log(`  p99: ${percentile(stats.latencies, 99).toFixed(0)}ms`);
  log();

  log('Cost: $0.00 (Ollama is free)');
  log();

  log('='.repeat(70));
  log('  KPI VALIDATION');
  log('='.repeat(70));
  log();
  log(
    `  p95 latency < 2000ms: ${pf(kpis.latency_p95_under_2s)} (${stats.latencyP95.toFixed(0)}ms)`
  );
  log(
    `  Score diff >= 20: ${pf(kpis.score_differentiation_adequate)} (${stats.scoreDifferentiation.toFixed(1)})`
  );
  log(
    `  Error rate < 5%: ${pf(kpis.error_rate_under_5pct)} (${(stats.errorRate * 100).toFixed(1)}%)`
  );
  log(
    `  Factor completeness >= 80%: ${pf(kpis.factor_completeness_above_80pct)} (${stats.factorCompletenessPct.toFixed(1)}%)`
  );
  log();
}

export interface RunMeta {
  timestamp: string;
  nodeVersion: string;
  platform: string;
  ollamaVersion: string;
  model: string;
  iterations: number;
}

export function buildConclusions(stats: BenchmarkStats, model: string): string[] {
  return [
    `Tested ollama/${model} with ${stats.totalOps} real scoring operations`,
    `Average latency: ${avg(stats.latencies).toFixed(0)}ms (p95: ${stats.latencyP95.toFixed(0)}ms)`,
    `Score differentiation: ${stats.scoreDifferentiation.toFixed(1)} points between high and low quality leads`,
    `Factor completeness: ${stats.factorCompletenessPct.toFixed(1)}%`,
    'Cost per 1K leads: $0.00 (Ollama is free)',
    stats.errors > 0
      ? `Error rate: ${(stats.errorRate * 100).toFixed(1)}%`
      : 'No errors during benchmark',
  ];
}

export function buildAccuracyBenchmarks(
  stats: BenchmarkStats,
  kpis: ReturnType<typeof evaluateKpis>,
  meta: RunMeta
) {
  const { model } = meta;
  return {
    $schema: '../schemas/benchmark.schema.json',
    benchmark_id: 'IFC-174-ollama-benchmark',
    title: 'AI Model Accuracy Benchmarks for Lead Scoring',
    description: 'Real benchmark results from actual Ollama inference operations (IFC-174)',
    timestamp: meta.timestamp,
    environment: {
      node: meta.nodeVersion,
      platform: meta.platform,
      ollama_version: meta.ollamaVersion,
      model,
    },
    test_configuration: {
      test_leads_count: TEST_LEADS.length,
      iterations_per_lead: meta.iterations,
      total_operations: stats.totalOps,
      warmup_runs: 1,
      lead_categories: { high: 2, medium: 2, low: 2 },
    },
    results: {
      models: [
        {
          model_id: model,
          provider: 'ollama' as const,
          accuracy_metrics: {
            avg_score: Number(avg(stats.scores).toFixed(2)),
            score_std_dev: Number(sampleStdDev(stats.scores).toFixed(2)),
            avg_confidence: Number(avg(stats.confidences).toFixed(3)),
            high_quality_avg: Number(stats.avgHighQuality.toFixed(2)),
            medium_quality_avg: Number(stats.avgMediumQuality.toFixed(2)),
            low_quality_avg: Number(stats.avgLowQuality.toFixed(2)),
            score_differentiation: Number(stats.scoreDifferentiation.toFixed(2)),
            factor_completeness_pct: Number(stats.factorCompletenessPct.toFixed(2)),
          },
          latency_ms: {
            avg: Number(avg(stats.latencies).toFixed(2)),
            p50: Number(percentile(stats.latencies, 50).toFixed(2)),
            p95: Number(percentile(stats.latencies, 95).toFixed(2)),
            p99: Number(percentile(stats.latencies, 99).toFixed(2)),
          },
          cost_per_1k_leads_usd: 0,
          error_rate: Number(stats.errorRate.toFixed(4)),
          runs: stats.successful.length,
        },
      ],
    },
    kpi_validation: kpis,
    conclusions: buildConclusions(stats, model),
  };
}

function tierBreakdown(scores: number[], mean: number) {
  return {
    count: scores.length,
    avg_score: Number(mean.toFixed(2)),
    std_dev: Number(sampleStdDev(scores).toFixed(2)),
  };
}

export function buildReport(
  stats: BenchmarkStats,
  kpis: ReturnType<typeof evaluateKpis>,
  meta: RunMeta
) {
  const { model, ollamaVersion } = meta;
  return {
    report_id: 'IFC-174-ollama-real-benchmark-report',
    title: 'Real Ollama Benchmark Report',
    description:
      'Comprehensive benchmark of Ollama mistral model for lead scoring with real inference',
    task_reference: 'IFC-174',
    dependencies: ['IFC-085', 'IFC-168'],
    timestamp: meta.timestamp,
    methodology: {
      approach: 'Score 6 test leads across 5 iterations using real Ollama inference',
      warmup: '1 warmup lead scored and discarded to avoid cold-start model loading skew',
      timing: 'performance.now() for sub-millisecond precision (NF-003)',
      statistics: 'Sample standard deviation with n-1 denominator (NF-004)',
      minimum_operations: `${stats.totalOps} operations (>= 30 MIN_SAMPLE_SIZE per AIConstants.ts)`,
      lead_distribution:
        '2 high-quality (C-suite, corporate), 2 medium (managers), 2 low (free email)',
      provider: `Ollama ${ollamaVersion} with ${model} model`,
    },
    environment: {
      node: meta.nodeVersion,
      platform: meta.platform,
      ollama_version: ollamaVersion,
      model,
      benchmark_date: meta.timestamp,
    },
    summary: {
      total_operations: stats.totalOps,
      successful_operations: stats.successful.length,
      error_count: stats.errors,
      error_rate: Number(stats.errorRate.toFixed(4)),
      avg_score: Number(avg(stats.scores).toFixed(2)),
      score_std_dev: Number(sampleStdDev(stats.scores).toFixed(2)),
      avg_confidence: Number(avg(stats.confidences).toFixed(3)),
      avg_latency_ms: Number(avg(stats.latencies).toFixed(2)),
      p50_latency_ms: Number(percentile(stats.latencies, 50).toFixed(2)),
      p95_latency_ms: Number(percentile(stats.latencies, 95).toFixed(2)),
      p99_latency_ms: Number(percentile(stats.latencies, 99).toFixed(2)),
      score_differentiation: Number(stats.scoreDifferentiation.toFixed(2)),
      factor_completeness_pct: Number(stats.factorCompletenessPct.toFixed(2)),
      cost_per_1k_leads_usd: 0,
    },
    tier_breakdown: {
      high: tierBreakdown(stats.highScores, stats.avgHighQuality),
      medium: tierBreakdown(stats.mediumScores, stats.avgMediumQuality),
      low: tierBreakdown(stats.lowScores, stats.avgLowQuality),
    },
    kpi_validation: kpis,
    conclusions: buildConclusions(stats, model),
  };
}

// ============================================================================
// Orchestration
// ============================================================================

export interface BenchmarkDeps {
  checkAvailable(): Promise<boolean>;
  getVersion(): Promise<string>;
  /** Import the scoring chain (after AI_PROVIDER=ollama is set); may throw. */
  loadChain(): Promise<ScoringChain>;
  writeJson(file: string, value: unknown): void;
  benchmarkPath: string;
  reportPath: string;
  model: string;
  log(...args: unknown[]): void;
  write(text: string): void;
  exit(code: number): never;
  now?: () => number;
  nodeVersion?: string;
  platform?: string;
}

function printOllamaSetupHelp(log: BenchmarkDeps['log']): void {
  log('ERROR: Ollama is not available at http://localhost:11434');
  log();
  log('Setup instructions:');
  log('  1. docker compose -f docker-compose.yml -f docker-compose.ollama.yml up -d ollama');
  log('  2. docker exec intelliflow-ollama ollama pull mistral');
  log('  3. Verify: curl http://localhost:11434/api/tags');
  log('  4. Re-run: npx tsx scripts/run-ollama-benchmark.ts');
  log();
  log('NF-001: Exiting without writing any data.');
}

async function loadChainOrExit(deps: BenchmarkDeps): Promise<ScoringChain> {
  try {
    const chain = await deps.loadChain();
    deps.log('Loaded scoring chain\n');
    return chain;
  } catch (error) {
    deps.log('Failed to load AI worker modules:', error);
    deps.log('Make sure to build the ai-worker package first: pnpm --filter ai-worker build');
    return deps.exit(1);
  }
}

async function runWarmup(chain: ScoringChain, log: BenchmarkDeps['log']): Promise<void> {
  // Avoid cold-start skew: one lead, discarded.
  log('Running warmup (1 lead, discarded)...');
  try {
    await chain.scoreLead(TEST_LEADS[0]);
    log('Warmup complete\n');
  } catch (error) {
    log('Warmup failed:', error);
    log('Continuing anyway...\n');
  }
}

export const ITERATIONS = 5;

export async function runBenchmark(deps: BenchmarkDeps): Promise<void> {
  const { log } = deps;
  const rule = '='.repeat(70);
  log(rule);
  log('  IFC-174: REAL OLLAMA BENCHMARK');
  log('  Testing actual Ollama inference with lead scoring');
  log(rule);
  log();

  // Check availability (AC-005)
  if (!(await deps.checkAvailable())) {
    printOllamaSetupHelp(log);
    deps.exit(1);
  }

  const ollamaVersion = await deps.getVersion();
  const model = deps.model;
  // The version comes from the network and the model from the environment: one line each.
  log(`Ollama version: ${String(ollamaVersion).replaceAll(/\p{Cc}/gu, ' ')}`);
  log(`Model: ${String(model).replaceAll(/\p{Cc}/gu, ' ')}`);
  log();

  const chain = await loadChainOrExit(deps);
  await runWarmup(chain, log);

  // Main benchmark: 6 leads x 5 iterations = 30 operations (NF-005)
  log(
    `Running benchmark: ${TEST_LEADS.length} leads x ${ITERATIONS} iterations = ${TEST_LEADS.length * ITERATIONS} operations`
  );
  log();
  const allResults = await runIterations(chain, ITERATIONS, { write: deps.write, log }, deps.now);
  log();

  const stats = computeStats(allResults);
  const kpis = evaluateKpis(stats);
  printSummary(stats, kpis, model, log);

  const meta: RunMeta = {
    timestamp: new Date().toISOString(),
    nodeVersion: deps.nodeVersion ?? process.version,
    platform: deps.platform ?? process.platform,
    ollamaVersion,
    model,
    iterations: ITERATIONS,
  };

  // accuracy-benchmarks.json (AC-003)
  deps.writeJson(deps.benchmarkPath, buildAccuracyBenchmarks(stats, kpis, meta));
  log(`Accuracy benchmarks written to: ${deps.benchmarkPath}`);

  // Detailed report (AC-004)
  deps.writeJson(deps.reportPath, buildReport(stats, kpis, meta));
  log(`Detailed report written to: ${deps.reportPath}`);
  log();
  log(rule);
}
