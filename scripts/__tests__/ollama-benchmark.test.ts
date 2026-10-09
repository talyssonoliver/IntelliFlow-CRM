import { describe, expect, it, vi } from 'vitest';
import {
  ITERATIONS,
  TEST_LEADS,
  applyEnvContent,
  avg,
  buildAccuracyBenchmarks,
  buildConclusions,
  buildReport,
  checkOllamaAvailable,
  computeStats,
  evaluateKpis,
  getOllamaVersion,
  parseEnvLine,
  percentile,
  printSummary,
  runBenchmark,
  runIterations,
  sampleStdDev,
  scoreOneLead,
  stripMatchingQuotes,
  tierForLeadIndex,
  type BenchmarkDeps,
  type BenchmarkRawResult,
  type ScoringChain,
} from '../lib/ollama-benchmark';

const goodResult = (score: number, factors = 4, reasoning = 'long enough reasoning') => ({
  score,
  confidence: 0.8,
  factors: Array.from({ length: factors }, (_, i) => ({ name: `f${i}`, impact: 1, reasoning })),
  modelVersion: 'v1',
});

const row = (
  tier: 'high' | 'medium' | 'low',
  score: number,
  latencyMs: number,
  extra: Partial<BenchmarkRawResult> = {}
): BenchmarkRawResult => ({
  lead: TEST_LEADS[0],
  result: goodResult(score),
  latencyMs,
  tier,
  iteration: 0,
  error: false,
  ...extra,
});

describe('env parsing', () => {
  it('strips only matching quotes', () => {
    expect(stripMatchingQuotes('"a b"')).toBe('a b');
    expect(stripMatchingQuotes("'a'")).toBe('a');
    expect(stripMatchingQuotes('"a\'')).toBe('"a\'');
    expect(stripMatchingQuotes('plain')).toBe('plain');
  });

  it('parses KEY=value lines and skips blanks, comments and lines without =', () => {
    expect(parseEnvLine('  KEY = "v=1"  ')).toEqual(['KEY', 'v=1']);
    expect(parseEnvLine('A=')).toEqual(['A', '']);
    expect(parseEnvLine('')).toBeNull();
    expect(parseEnvLine('# comment')).toBeNull();
    expect(parseEnvLine('novalue')).toBeNull();
  });

  it('applies content without overriding keys that are already set', () => {
    const env: Record<string, string | undefined> = { KEEP: 'old', EMPTY: '' };
    applyEnvContent('KEEP=new\nFRESH=1\n# x\nEMPTY=filled\n', env);
    expect(env).toEqual({ KEEP: 'old', FRESH: '1', EMPTY: 'filled' });
  });
});

describe('ollama availability', () => {
  const ok = (body: unknown = {}, okFlag = true) =>
    vi.fn(async () => ({ ok: okFlag, json: async () => body }));

  it('reports availability from the tags endpoint, and false on any failure', async () => {
    const fetchFn = vi.fn(async (_url: string) => ({ ok: true, json: async () => ({}) }));
    expect(await checkOllamaAvailable(fetchFn, 'http://h:1')).toBe(true);
    expect(fetchFn.mock.calls[0][0]).toBe('http://h:1/api/tags');
    expect(await checkOllamaAvailable(ok({}, false))).toBe(false);
    expect(
      await checkOllamaAvailable(async () => {
        throw new Error('down');
      })
    ).toBe(false);
  });

  it('reads the version, or unknown when not ok or failing', async () => {
    expect(await getOllamaVersion(ok({ version: '0.3.1' }), 'http://h:1')).toBe('0.3.1');
    expect(await getOllamaVersion(ok({}, false))).toBe('unknown');
    expect(
      await getOllamaVersion(async () => {
        throw new Error('down');
      })
    ).toBe('unknown');
  });
});

describe('statistics', () => {
  it('computes sample stddev with n-1, and 0 for fewer than two values', () => {
    expect(sampleStdDev([])).toBe(0);
    expect(sampleStdDev([5])).toBe(0);
    expect(sampleStdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
  });

  it('computes nearest-rank percentiles', () => {
    expect(percentile([], 95)).toBe(0);
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3);
    expect(percentile([5, 1, 3, 2, 4], 95)).toBe(5);
    expect(percentile([7], 0)).toBe(7);
  });

  it('averages, with 0 for empty', () => {
    expect(avg([])).toBe(0);
    expect(avg([1, 2, 6])).toBe(3);
  });
});

describe('tiers', () => {
  it('maps the six test leads to 2 high, 2 medium, 2 low', () => {
    expect(TEST_LEADS.map((_, i) => tierForLeadIndex(i))).toEqual([
      'high',
      'high',
      'medium',
      'medium',
      'low',
      'low',
    ]);
  });
});

describe('scoreOneLead', () => {
  it('times a successful score', async () => {
    const ticks = [100, 142.5];
    const chain: ScoringChain = { scoreLead: async () => goodResult(77) };
    const out = await scoreOneLead(chain, TEST_LEADS[0], 'high', 3, () => ticks.shift() as number);
    expect(out).toMatchObject({ latencyMs: 42.5, tier: 'high', iteration: 3, error: false });
    expect(out.result.score).toBe(77);
  });

  it('turns a failure into a zero-score error row', async () => {
    const ticks = [10, 15];
    const chain: ScoringChain = {
      scoreLead: async () => {
        throw new Error('model down');
      },
    };
    const out = await scoreOneLead(chain, TEST_LEADS[1], 'low', 0, () => ticks.shift() as number);
    expect(out).toMatchObject({
      latencyMs: 5,
      error: true,
      result: { score: 0, confidence: 0, factors: [], modelVersion: 'error:v1' },
    });
  });

  it('defaults to performance.now', async () => {
    const out = await scoreOneLead(
      { scoreLead: async () => goodResult(1) },
      TEST_LEADS[0],
      'high',
      0
    );
    expect(out.latencyMs).toBeGreaterThanOrEqual(0);
  });
});

describe('runIterations', () => {
  it('scores every lead each iteration and prints one mark per operation', async () => {
    let n = 0;
    const chain: ScoringChain = {
      scoreLead: async () => {
        n++;
        if (n === 2) throw new Error('flaky');
        return goodResult(50);
      },
    };
    const written: string[] = [];
    const log = vi.fn();
    const results = await runIterations(chain, 2, { write: (t) => written.push(t), log });

    expect(results).toHaveLength(2 * TEST_LEADS.length);
    expect(results.filter((r) => r.error)).toHaveLength(1);
    expect(results[TEST_LEADS.length].iteration).toBe(1);
    expect(written.join('')).toBe(`  Iteration 1/2: .x....  Iteration 2/2: ......`);
    expect(log).toHaveBeenCalledTimes(2);
  });
});

describe('computeStats and KPIs', () => {
  const results = [
    row('high', 90, 100),
    row('high', 80, 200),
    row('medium', 60, 300),
    row('low', 30, 400),
    row('low', 20, 500, { error: true }),
  ];

  it('derives per-tier averages, differentiation, completeness and error rate', () => {
    const s = computeStats(results);
    expect(s.totalOps).toBe(5);
    expect(s.errors).toBe(1);
    expect(s.errorRate).toBeCloseTo(0.2);
    expect(s.successful).toHaveLength(4);
    expect(s.avgHighQuality).toBe(85);
    expect(s.avgMediumQuality).toBe(60);
    expect(s.avgLowQuality).toBe(30);
    expect(s.scoreDifferentiation).toBe(55);
    expect(s.factorCompletenessPct).toBe(100);
    expect(s.latencyP95).toBe(400);
  });

  it('counts a result incomplete when it has fewer than 4 factors or short reasoning', () => {
    const s = computeStats([
      row('high', 90, 1, { result: goodResult(90, 3) }),
      row('high', 90, 1, { result: goodResult(90, 4, 'short') }),
      row('high', 90, 1),
      row('high', 90, 1, {
        result: {
          ...goodResult(90),
          factors: [{ name: 'x', impact: 1, reasoning: '' }, ...goodResult(90, 3).factors],
        },
      }),
    ]);
    expect(s.factorCompletenessPct).toBe(25);
  });

  it('gives 0% completeness when nothing succeeded', () => {
    const s = computeStats([row('high', 0, 5, { error: true })]);
    expect(s.factorCompletenessPct).toBe(0);
    expect(s.avgHighQuality).toBe(0);
  });

  it('evaluates each KPI at its boundary', () => {
    const base = computeStats([row('high', 90, 100), row('low', 30, 100)]);
    expect(evaluateKpis(base)).toEqual({
      latency_p95_under_2s: true,
      score_differentiation_adequate: true,
      error_rate_under_5pct: true,
      factor_completeness_above_80pct: true,
      all_targets_met: true,
    });
    expect(evaluateKpis({ ...base, latencyP95: 2000 }).latency_p95_under_2s).toBe(false);
    expect(
      evaluateKpis({ ...base, scoreDifferentiation: 19.9 }).score_differentiation_adequate
    ).toBe(false);
    expect(evaluateKpis({ ...base, scoreDifferentiation: 20 }).score_differentiation_adequate).toBe(
      true
    );
    expect(evaluateKpis({ ...base, errorRate: 0.05 }).error_rate_under_5pct).toBe(false);
    expect(
      evaluateKpis({ ...base, factorCompletenessPct: 79 }).factor_completeness_above_80pct
    ).toBe(false);
    expect(evaluateKpis({ ...base, factorCompletenessPct: 79 }).all_targets_met).toBe(false);
  });
});

describe('printing and report building', () => {
  const stats = computeStats([
    row('high', 90, 100),
    row('high', 80, 200),
    row('medium', 60, 300),
    row('low', 30, 400),
  ]);
  const kpis = evaluateKpis(stats);
  const meta = {
    timestamp: '2026-01-01T00:00:00.000Z',
    nodeVersion: 'v22.0.0',
    platform: 'linux',
    ollamaVersion: '0.3.1',
    model: 'mistral',
    iterations: 5,
  };

  it('prints the summary and KPI lines', () => {
    const lines: string[] = [];
    printSummary(stats, kpis, 'mistral', (...a) => lines.push(a.join(' ')));
    const text = lines.join('\n');
    expect(text).toContain('Model: ollama/mistral');
    expect(text).toContain('Operations: 4 (0 errors, 0.0% error rate)');
    expect(text).toContain('Score Differentiation: 55.0');
    expect(text).toContain('p95 latency < 2000ms: PASS (400ms)');
    expect(text).toContain('Cost: $0.00 (Ollama is free)');
  });

  it('prints FAIL for a missed KPI', () => {
    const lines: string[] = [];
    const bad = { ...kpis, error_rate_under_5pct: false };
    printSummary(stats, bad, 'm', (...a) => lines.push(a.join(' ')));
    expect(lines.join('\n')).toContain('Error rate < 5%: FAIL');
  });

  it('builds conclusions, with and without errors', () => {
    expect(buildConclusions(stats, 'mistral').at(-1)).toBe('No errors during benchmark');
    const withErr = computeStats([row('high', 1, 1), row('high', 1, 1, { error: true })]);
    expect(buildConclusions(withErr, 'm').at(-1)).toBe('Error rate: 50.0%');
    expect(buildConclusions(stats, 'mistral')[0]).toBe(
      'Tested ollama/mistral with 4 real scoring operations'
    );
  });

  it('builds the accuracy benchmark document', () => {
    const doc = buildAccuracyBenchmarks(stats, kpis, meta);
    expect(doc).toMatchObject({
      benchmark_id: 'IFC-174-ollama-benchmark',
      timestamp: meta.timestamp,
      environment: {
        node: 'v22.0.0',
        platform: 'linux',
        ollama_version: '0.3.1',
        model: 'mistral',
      },
      test_configuration: { test_leads_count: 6, iterations_per_lead: 5, total_operations: 4 },
      kpi_validation: kpis,
    });
    const m = doc.results.models[0];
    expect(m).toMatchObject({ model_id: 'mistral', provider: 'ollama', runs: 4, error_rate: 0 });
    expect(m.accuracy_metrics).toMatchObject({
      avg_score: 65,
      high_quality_avg: 85,
      medium_quality_avg: 60,
      low_quality_avg: 30,
      score_differentiation: 55,
      factor_completeness_pct: 100,
      avg_confidence: 0.8,
    });
    expect(m.latency_ms).toEqual({ avg: 250, p50: 200, p95: 400, p99: 400 });
  });

  it('builds the detailed report with tier breakdown', () => {
    const report = buildReport(stats, kpis, meta);
    expect(report).toMatchObject({
      report_id: 'IFC-174-ollama-real-benchmark-report',
      task_reference: 'IFC-174',
      environment: { benchmark_date: meta.timestamp, model: 'mistral' },
      summary: {
        total_operations: 4,
        successful_operations: 4,
        error_count: 0,
        avg_latency_ms: 250,
      },
    });
    expect(report.methodology.provider).toBe('Ollama 0.3.1 with mistral model');
    expect(report.methodology.minimum_operations).toContain('4 operations');
    expect(report.tier_breakdown.high).toEqual({ count: 2, avg_score: 85, std_dev: 7.07 });
    expect(report.tier_breakdown.medium).toEqual({ count: 1, avg_score: 60, std_dev: 0 });
    expect(report.conclusions).toEqual(buildConclusions(stats, 'mistral'));
  });
});

describe('runBenchmark', () => {
  class Exit extends Error {
    constructor(public code: number) {
      super(`exit ${code}`);
    }
  }

  const makeDeps = (over: Partial<BenchmarkDeps> = {}) => {
    const lines: string[] = [];
    const written: Array<[string, unknown]> = [];
    const calls = { n: 0 };
    const deps: BenchmarkDeps = {
      checkAvailable: async () => true,
      getVersion: async () => '0.3.1',
      loadChain: async () => ({
        scoreLead: async () => {
          calls.n++;
          return goodResult(50 + calls.n);
        },
      }),
      writeJson: (f, v) => written.push([f, v]),
      benchmarkPath: '/out/accuracy.json',
      reportPath: '/out/report.json',
      model: 'mistral',
      log: (...a) => lines.push(a.map(String).join(' ')),
      write: () => undefined,
      exit: (code) => {
        throw new Exit(code);
      },
      nodeVersion: 'v22',
      platform: 'linux',
      ...over,
    };
    return { deps, lines, written, calls };
  };

  it('exits 1 with setup help, writing nothing, when Ollama is unavailable', async () => {
    const { deps, lines, written } = makeDeps({ checkAvailable: async () => false });
    await expect(runBenchmark(deps)).rejects.toMatchObject({ code: 1 });
    expect(lines.join('\n')).toContain('Setup instructions:');
    expect(lines.join('\n')).toContain('NF-001: Exiting without writing any data.');
    expect(written).toEqual([]);
  });

  it('exits 1 when the scoring chain cannot be loaded', async () => {
    const { deps, lines } = makeDeps({
      loadChain: async () => {
        throw new Error('not built');
      },
    });
    await expect(runBenchmark(deps)).rejects.toMatchObject({ code: 1 });
    expect(lines.join('\n')).toContain('Failed to load AI worker modules:');
    expect(lines.join('\n')).toContain('pnpm --filter ai-worker build');
  });

  it('runs warmup plus 6 x 5 operations and writes both documents', async () => {
    const { deps, lines, written, calls } = makeDeps();
    await runBenchmark(deps);

    expect(calls.n).toBe(1 + TEST_LEADS.length * ITERATIONS);
    expect(written.map(([f]) => f)).toEqual(['/out/accuracy.json', '/out/report.json']);
    expect(
      (written[0][1] as { environment: { ollama_version: string } }).environment.ollama_version
    ).toBe('0.3.1');
    const text = lines.join('\n');
    expect(text).toContain('Warmup complete');
    expect(text).toContain('6 leads x 5 iterations = 30 operations');
    expect(text).toContain('Accuracy benchmarks written to: /out/accuracy.json');
    expect(text).toContain('Detailed report written to: /out/report.json');
  });

  it('continues after a failed warmup', async () => {
    let first = true;
    const { deps, lines, written } = makeDeps({
      loadChain: async () => ({
        scoreLead: async () => {
          if (first) {
            first = false;
            throw new Error('cold');
          }
          return goodResult(70);
        },
      }),
    });
    await runBenchmark(deps);
    expect(lines.join('\n')).toContain('Continuing anyway...');
    expect(written).toHaveLength(2);
  });

  it('prints the version and model on one line each even if they contain control characters', async () => {
    const { deps, lines } = makeDeps({
      getVersion: async () => '0.3.1\r\nFAKE: forged line',
      model: 'm\nodel',
    });
    await runBenchmark(deps);
    expect(lines).toContain('Ollama version: 0.3.1  FAKE: forged line');
    expect(lines).toContain('Model: m odel');
  });

  it('defaults node version and platform from the process', async () => {
    const { deps, written } = makeDeps({ nodeVersion: undefined, platform: undefined });
    await runBenchmark(deps);
    const env = (written[0][1] as { environment: { node: string; platform: string } }).environment;
    expect(env).toEqual(
      expect.objectContaining({ node: process.version, platform: process.platform })
    );
  });
});
