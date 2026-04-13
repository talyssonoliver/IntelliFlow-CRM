/**
 * IFC-196 Synthetic Cache Benchmark
 *
 * Measures HomeCacheService read-through latency end-to-end (key build + cache
 * get + deserialise) independent of the database. Simulates a miss path with a
 * 120ms compute (representative of the baseline Prisma parallel queries under
 * dev hardware) and validates p95 < 50ms on hits.
 *
 * Run: pnpm tsx apps/api/src/shared/performance-benchmark.ts is the full
 * end-to-end benchmark. This file targets the cache layer in isolation so
 * numbers can be produced without a live Postgres.
 *
 * Writes: artifacts/benchmarks/IFC-196/cache-layer-benchmark.json
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { InMemoryCache, InMemoryEventBus } from '@intelliflow/adapters';
import { HomeCacheService } from './home.cache';

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

async function measure(
  label: string,
  service: HomeCacheService,
  iterations: number,
  simulatedComputeMs: number
): Promise<{
  label: string;
  iterations: number;
  p50: number;
  p95: number;
  p99: number;
  mean: number;
}> {
  const durations: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await service.getWelcomeSummary('tenant-1', 'user-1', async () => {
      if (simulatedComputeMs > 0) await sleep(simulatedComputeMs);
      return {
        userName: 'bench-user',
        greeting: 'good morning',
        todayDate: new Date(),
        stats: {
          highPriorityTasksCount: 3,
          newLeadsCount: 12,
          newLeadsPeriod: 'yesterday' as const,
          dealClosingRateTrend: 15,
          dealsTrendPeriod: 'this_week' as const,
          appointmentsToday: 2,
          overdueTasksCount: 0,
        },
      };
    });
    durations.push(performance.now() - start);
  }

  const sorted = [...durations].sort((a, b) => a - b);
  const mean = durations.reduce((s, v) => s + v, 0) / durations.length;

  return {
    label,
    iterations,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    mean,
  };
}

async function main(): Promise<void> {
  const simulatedComputeMs = Number.parseInt(process.env.BENCH_COMPUTE_MS || '120', 10);
  const warmIterations = Number.parseInt(process.env.BENCH_WARM || '200', 10);
  const coldIterations = Number.parseInt(process.env.BENCH_COLD || '50', 10);

  console.log(`[IFC-196 bench] simulated miss compute=${simulatedComputeMs}ms`);

  // Cold: fresh service each iteration so every call is a miss.
  const coldDurations: number[] = [];
  for (let i = 0; i < coldIterations; i++) {
    const cold = new HomeCacheService(new InMemoryCache(), new InMemoryEventBus());
    const start = performance.now();
    await cold.getWelcomeSummary('t1', `u${i}`, async () => {
      await sleep(simulatedComputeMs);
      return { stats: {} } as any;
    });
    coldDurations.push(performance.now() - start);
  }
  const coldSorted = [...coldDurations].sort((a, b) => a - b);
  const coldResult = {
    label: 'miss (no cache)',
    iterations: coldIterations,
    p50: percentile(coldSorted, 50),
    p95: percentile(coldSorted, 95),
    p99: percentile(coldSorted, 99),
    mean: coldDurations.reduce((s, v) => s + v, 0) / coldDurations.length,
  };

  // Warm: single service instance, first call warms, subsequent calls are hits.
  const warm = new HomeCacheService(new InMemoryCache(), new InMemoryEventBus());
  // Prime
  await warm.getWelcomeSummary('t1', 'u-warm', async () => {
    await sleep(simulatedComputeMs);
    return { stats: {} } as any;
  });
  const warmResult = await measure('hit (warmed)', warm, warmIterations, simulatedComputeMs);

  const thresholds = { p95Hit: 50, p99Hit: 100 };
  const passed = warmResult.p95 < thresholds.p95Hit && warmResult.p99 < thresholds.p99Hit;

  const hitRate =
    (warm.getMetrics().hits / (warm.getMetrics().hits + warm.getMetrics().misses)) * 100;

  const report = {
    task: 'IFC-196',
    generatedAt: new Date().toISOString(),
    env: {
      node: process.version,
      simulatedComputeMs,
    },
    thresholds,
    results: {
      cold: coldResult,
      warm: warmResult,
    },
    metrics: warm.getMetrics(),
    hitRatePercent: Number.isFinite(hitRate) ? Math.round(hitRate * 100) / 100 : 0,
    passed,
    notes:
      'Synthetic cache-layer micro-benchmark. Measures HomeCacheService.getWelcomeSummary ' +
      'end-to-end latency with an in-memory CachePort. Miss path simulated via setTimeout ' +
      'to mimic the ~120ms baseline from the IFC-182 12-query Promise.all. Independent of ' +
      'Postgres / Redis availability.',
  };

  const repoRoot = resolve(__dirname, '..', '..', '..', '..', '..');
  const outDir = join(repoRoot, 'artifacts', 'benchmarks', 'IFC-196');
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, 'cache-layer-benchmark.json');
  writeFileSync(out, JSON.stringify(report, null, 2));

  console.log('\nIFC-196 Cache Layer Benchmark');
  console.log('-----------------------------');
  console.log(
    `Miss (cold) p50=${coldResult.p50.toFixed(2)}ms p95=${coldResult.p95.toFixed(2)}ms p99=${coldResult.p99.toFixed(2)}ms`
  );
  console.log(
    `Hit  (warm) p50=${warmResult.p50.toFixed(2)}ms p95=${warmResult.p95.toFixed(2)}ms p99=${warmResult.p99.toFixed(2)}ms`
  );
  console.log(`Hit rate: ${report.hitRatePercent}% over ${warmIterations} warm iterations`);
  console.log(
    `Thresholds (hit p95<${thresholds.p95Hit}ms, p99<${thresholds.p99Hit}ms): ${passed ? 'PASS' : 'FAIL'}`
  );
  console.log(`Report: ${out}`);

  if (!passed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
