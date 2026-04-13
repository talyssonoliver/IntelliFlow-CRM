/**
 * tRPC API Performance Benchmark
 *
 * Validates the IFC-003 KPI requirement: API response time p95 < 50ms.
 *
 * Covers both unauthenticated public procedures (health/system/auth.getStatus)
 * AND authenticated hot-path procedures (lead.list, contact.list, etc.).
 * Authenticated procedures use the dev-auth fallback (`ALLOW_DEV_AUTH_FALLBACK=true`,
 * which the script sets automatically) which resolves to the seeded
 * Sarah Johnson user — see `FALLBACK_USER` in `apps/api/src/context.ts`.
 *
 * Related perf infrastructure (distinct scopes — do not conflate thresholds):
 * - This benchmark: local, in-process, per-procedure latency (IFC-003 KPI).
 * - CI performance gate (`.github/workflows/performance-gate.yml`): k6 load
 *   test with its own thresholds (p95 ≤ 200ms, p99 ≤ 500ms) under concurrency.
 *
 * Prerequisites:
 * - Database seeded with Sarah Johnson user (from `packages/db/prisma/seed.ts`)
 * - A Postgres URL that does NOT use `connection_limit=1` (the Supabase dev
 *   safety flag in `.env.local`). The benchmark auto-selects the first of:
 *     1. `TEST_DATABASE_URL`  (recommended — seeded local DB)
 *     2. `DIRECT_URL`         (same Supabase host, unpooled)
 *     3. `DATABASE_URL`       (fallback — authenticated benchmarks may fail
 *                              under `connection_limit=1`)
 * - Recommended invocation for a clean baseline:
 *     dotenv -e .env.test -- tsx apps/api/src/shared/performance-benchmark.ts
 * - Authenticated benchmarks run 30 iterations with a 50ms inter-iteration
 *   pause to match sustained load patterns (not a synthetic stress test).
 *
 * Outputs actual measured latencies; does not include speculative or fabricated
 * targets beyond the documented IFC-003 KPI thresholds below.
 *
 * Usage:
 *   pnpm tsx apps/api/src/shared/performance-benchmark.ts
 *
 * Success Criteria (IFC-003 KPI, all procedures):
 * - p50 (median) < 30ms
 * - p95 < 50ms
 * - p99 < 100ms
 */

// Enable dev-auth fallback BEFORE importing context — `createContext` resolves
// the fallback at call-time based on this env var. Without it, authenticated
// procedures would throw UNAUTHORIZED.
process.env.ALLOW_DEV_AUTH_FALLBACK = 'true';

// Select a Postgres URL that is suitable for benchmarking.
// The default DATABASE_URL in `.env.local` ends with `?pgbouncer=true&connection_limit=1`
// — this is a Supabase dev safety flag that ALLOWS ONLY 1 CONCURRENT CONNECTION.
// Procedures that do Promise.all internally (e.g. lead.list) will immediately
// fail with "too many clients already" under that constraint.
//
// Preference order (first match wins):
//  1. TEST_DATABASE_URL — seeded local Postgres (e.g. localhost:5433/intelliflow_test)
//  2. DIRECT_URL — same Supabase host WITHOUT pgbouncer/connection_limit=1
//  3. DATABASE_URL — fallback; authenticated benchmarks will likely fail
//
// Scripts/runners: pass credentials explicitly for a clean baseline, e.g.
//   dotenv -e .env.test -- tsx apps/api/src/shared/performance-benchmark.ts
const benchmarkDbUrl =
  process.env.TEST_DATABASE_URL ||
  process.env.DIRECT_URL ||
  process.env.DATABASE_URL;
if (benchmarkDbUrl && benchmarkDbUrl !== process.env.DATABASE_URL) {
  process.env.DATABASE_URL = benchmarkDbUrl;
}
// Redact credentials when logging the selection to avoid leaking into CI logs.
const redactedUrl = (benchmarkDbUrl || '').replace(/:\/\/[^@]+@/, '://***@');
console.log(`[benchmark] Using Postgres: ${redactedUrl || '(none set)'}`);
console.log(
  `[benchmark] Source: ${
    process.env.TEST_DATABASE_URL
      ? 'TEST_DATABASE_URL'
      : process.env.DIRECT_URL
        ? 'DIRECT_URL'
        : 'DATABASE_URL (may be pooled with connection_limit=1 — authenticated benchmarks may fail)'
  }`
);

import { performance } from 'node:perf_hooks';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createContext } from '../context';
import { appRouter } from '../router';

/**
 * Performance statistics
 */
interface BenchmarkResult {
  operation: string;
  iterations: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  p95: number;
  p99: number;
  passed: boolean;
  /** Set when the benchmark could not complete (e.g. DB pool exhausted). */
  error?: string;
}

/**
 * Run a single benchmark iteration
 */
async function runIteration<T>(fn: () => Promise<T>): Promise<number> {
  const start = performance.now();
  await fn();
  return performance.now() - start;
}

/**
 * Pause briefly so DB connections can recycle between iterations.
 * Critical for benchmarks that exercise the Prisma connection pool — without
 * this, rapid-fire iterations can saturate Supabase's small connection limit.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Run multiple iterations and collect timings
 */
async function benchmark<T>(
  operation: string,
  fn: () => Promise<T>,
  iterations: number = 100,
  pauseMs: number = 0
): Promise<BenchmarkResult> {
  console.log(`\nBenchmarking: ${operation} (${iterations} iterations)...`);

  const timings: number[] = [];

  // Warmup (discard first 10 iterations)
  console.log('  Warming up...');
  for (let i = 0; i < 10; i++) {
    await runIteration(fn);
    if (pauseMs > 0) await sleep(pauseMs);
  }

  // Actual benchmark
  console.log('  Running benchmark...');
  for (let i = 0; i < iterations; i++) {
    const duration = await runIteration(fn);
    timings.push(duration);
    if (pauseMs > 0) await sleep(pauseMs);

    // Progress indicator every 25 iterations
    if ((i + 1) % 25 === 0) {
      console.log(`  Progress: ${i + 1}/${iterations}`);
    }
  }

  // Calculate statistics
  timings.sort((a, b) => a - b);

  const min = timings[0];
  const max = timings.at(-1)!;
  const mean = timings.reduce((a, b) => a + b, 0) / timings.length;
  const median = timings[Math.floor(timings.length / 2)];
  const p95 = timings[Math.floor(timings.length * 0.95)];
  const p99 = timings[Math.floor(timings.length * 0.99)];

  // Check if passes KPI (<50ms for p95)
  const passed = p95 < 50;

  const result: BenchmarkResult = {
    operation,
    iterations,
    min,
    max,
    mean,
    median,
    p95,
    p99,
    passed,
  };

  printResult(result);
  return result;
}

/**
 * Error-tolerant wrapper — captures per-benchmark failures so the suite
 * continues on to the remaining measurements. A benchmark that fails with
 * e.g. "too many clients already" is a real signal (shared dev DB under
 * load) — we record the error verbatim, not a fabricated passing result.
 */
async function safeBenchmark<T>(
  operation: string,
  fn: () => Promise<T>,
  iterations: number,
  pauseMs: number = 0
): Promise<BenchmarkResult> {
  try {
    return await benchmark(operation, fn, iterations, pauseMs);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Extract a short root-cause phrase for the summary line. Prisma wraps
    // DB errors in a multi-line invocation trace; the actual cause shows up
    // on a line starting with "Message:" or a recognizable keyword further
    // down. We surface the most useful signal rather than the first 200 chars.
    const rootCauseMatch =
      /Message: `([^`]+)`/.exec(message) ||
      /does not exist in the current database/.exec(message) ||
      /too many clients already/.exec(message) ||
      /connect ECONNREFUSED/.exec(message) ||
      /Timed out/.exec(message);
    const rootCause = rootCauseMatch ? rootCauseMatch[1] || rootCauseMatch[0] : message.split('\n')[0];
    const truncated = rootCause.length > 200 ? rootCause.slice(0, 200) + '…' : rootCause;
    console.log(`\n  ❌ ${operation} could not complete: ${truncated}`);
    return {
      operation,
      iterations: 0,
      min: NaN,
      max: NaN,
      mean: NaN,
      median: NaN,
      p95: NaN,
      p99: NaN,
      passed: false,
      // Keep the full message (not just the truncated root cause) for the
      // hint matcher in the summary to introspect.
      error: message,
    };
  }
}

/**
 * Print benchmark result
 */
function printResult(result: BenchmarkResult) {
  if (result.error) {
    console.log(`\n  Results for ${result.operation}:`);
    console.log(`  ─────────────────────────────────────`);
    console.log(`  Status:     ❌ ERROR — ${result.error}`);
    console.log(`  ─────────────────────────────────────`);
    return;
  }

  const status = result.passed ? '✅ PASS' : '❌ FAIL';

  console.log(`\n  Results for ${result.operation}:`);
  console.log(`  ─────────────────────────────────────`);
  console.log(`  Iterations: ${result.iterations}`);
  console.log(`  Min:        ${result.min.toFixed(2)}ms`);
  console.log(`  Max:        ${result.max.toFixed(2)}ms`);
  console.log(`  Mean:       ${result.mean.toFixed(2)}ms`);
  console.log(`  Median:     ${result.median.toFixed(2)}ms`);
  console.log(`  p95:        ${result.p95.toFixed(2)}ms ${result.p95 < 50 ? '✅' : '⚠️'}`);
  console.log(`  p99:        ${result.p99.toFixed(2)}ms ${result.p99 < 100 ? '✅' : '⚠️'}`);
  console.log(`  Status:     ${status}`);
  console.log(`  ─────────────────────────────────────`);
}

/**
 * Main benchmark suite
 */
async function runBenchmarks() {
  console.log('═══════════════════════════════════════════');
  console.log('  tRPC API Performance Benchmark');
  console.log('  Target: p95 < 50ms (IFC-003 KPI)');
  console.log('═══════════════════════════════════════════');

  const results: BenchmarkResult[] = [];

  // Create a mock caller for testing
  const ctx = await createContext();
  const caller = appRouter.createCaller(ctx);

  try {
    // Benchmark 1: Health check (ping)
    const healthResult = await benchmark(
      'health.ping',
      async () => {
        await caller.health.ping();
      },
      100
    );
    results.push(healthResult);

    // Benchmark 2: Health check with database
    const healthCheckResult = await benchmark(
      'health.check',
      async () => {
        await caller.health.check();
      },
      100
    );
    results.push(healthCheckResult);

    // Benchmark 3: System info
    const systemInfoResult = await benchmark(
      'system.info',
      async () => {
        await caller.system.info();
      },
      100
    );
    results.push(systemInfoResult);

    // Benchmark 4: System version
    const systemVersionResult = await benchmark(
      'system.version',
      async () => {
        await caller.system.version();
      },
      100
    );
    results.push(systemVersionResult);

    // Benchmark 5: auth.getStatus
    // Measures the hot-path that every page load exercises. With the
    // dev-auth fallback enabled, this also exercises the GET_STATUS_CACHE
    // added for IFC-PERF session-cache hit path.
    const authStatusResult = await benchmark(
      'auth.getStatus',
      async () => {
        await caller.auth.getStatus();
      },
      100
    );
    results.push(authStatusResult);

    // ── Authenticated hot-path procedures ────────────────────────────
    // These exercise the tenantProcedure middleware chain + real database
    // queries. They run under the seeded Sarah Johnson user (SALES_REP).
    // 30 iterations with 50ms pause — realistic sustained-load sample that
    // won't exhaust the Supabase pool when a dev server is also running.
    //
    // Each benchmark is wrapped in safeBenchmark() so that a per-procedure
    // failure (e.g. DB connection pool exhausted during shared-dev use)
    // records an error result and lets the suite continue, rather than
    // aborting and losing the other measurements.
    const AUTHN_ITERATIONS = 30;
    const AUTHN_PAUSE_MS = 50;

    const LIST_ARGS = { page: 1, limit: 20 } as const;

    // CRM core entity hot paths — list + stats for every top-level resource
    results.push(
      await safeBenchmark('lead.list', () => caller.lead.list(LIST_ARGS), AUTHN_ITERATIONS, AUTHN_PAUSE_MS)
    );
    results.push(
      await safeBenchmark('lead.stats', () => caller.lead.stats(), AUTHN_ITERATIONS, AUTHN_PAUSE_MS)
    );
    results.push(
      await safeBenchmark('contact.list', () => caller.contact.list(LIST_ARGS), AUTHN_ITERATIONS, AUTHN_PAUSE_MS)
    );
    results.push(
      await safeBenchmark('contact.stats', () => caller.contact.stats(), AUTHN_ITERATIONS, AUTHN_PAUSE_MS)
    );
    results.push(
      await safeBenchmark('account.list', () => caller.account.list(LIST_ARGS), AUTHN_ITERATIONS, AUTHN_PAUSE_MS)
    );
    results.push(
      await safeBenchmark('account.stats', () => caller.account.stats(), AUTHN_ITERATIONS, AUTHN_PAUSE_MS)
    );
    results.push(
      await safeBenchmark('opportunity.list', () => caller.opportunity.list(LIST_ARGS), AUTHN_ITERATIONS, AUTHN_PAUSE_MS)
    );
    results.push(
      await safeBenchmark('opportunity.stats', () => caller.opportunity.stats(), AUTHN_ITERATIONS, AUTHN_PAUSE_MS)
    );
    results.push(
      await safeBenchmark('task.list', () => caller.task.list(LIST_ARGS), AUTHN_ITERATIONS, AUTHN_PAUSE_MS)
    );
    results.push(
      await safeBenchmark('task.stats', () => caller.task.stats(), AUTHN_ITERATIONS, AUTHN_PAUSE_MS)
    );
    results.push(
      await safeBenchmark('ticket.list', () => caller.ticket.list(LIST_ARGS), AUTHN_ITERATIONS, AUTHN_PAUSE_MS)
    );
    results.push(
      await safeBenchmark('ticket.stats', () => caller.ticket.stats({ timeWindow: 'all' }), AUTHN_ITERATIONS, AUTHN_PAUSE_MS)
    );

    // Home dashboard — hit on every authenticated landing
    results.push(
      await safeBenchmark('home.getWelcomeSummary', () => caller.home.getWelcomeSummary(), AUTHN_ITERATIONS, AUTHN_PAUSE_MS)
    );
    results.push(
      await safeBenchmark('home.getAIInsights', () => caller.home.getAIInsights(), AUTHN_ITERATIONS, AUTHN_PAUSE_MS)
    );
    results.push(
      await safeBenchmark('home.getDailyGoal', () => caller.home.getDailyGoal(), AUTHN_ITERATIONS, AUTHN_PAUSE_MS)
    );

    // Analytics — frequent aggregates
    // analytics.getSalesMetrics requires an ISO datetime range — last 30 days.
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const analyticsRange = {
      startDate: thirtyDaysAgo.toISOString(),
      endDate: today.toISOString(),
    };
    results.push(
      await safeBenchmark('analytics.getOverview', () => caller.analytics.getOverview({}), AUTHN_ITERATIONS, AUTHN_PAUSE_MS)
    );
    results.push(
      await safeBenchmark(
        'analytics.getSalesMetrics',
        () => caller.analytics.getSalesMetrics(analyticsRange),
        AUTHN_ITERATIONS,
        AUTHN_PAUSE_MS
      )
    );

    // Notifications — polled by the nav bell
    results.push(
      await safeBenchmark('notifications.list', () => caller.notifications.list({}), AUTHN_ITERATIONS, AUTHN_PAUSE_MS)
    );
    results.push(
      await safeBenchmark('notifications.getUnreadCount', () => caller.notifications.getUnreadCount(), AUTHN_ITERATIONS, AUTHN_PAUSE_MS)
    );

    // Activity feed — unified entity timeline
    results.push(
      await safeBenchmark('activityFeed.getUnifiedFeed', () => caller.activityFeed.getUnifiedFeed({}), AUTHN_ITERATIONS, AUTHN_PAUSE_MS)
    );

    // Gates / identity — called on every protected route render
    results.push(
      await safeBenchmark('moduleAccess.getEnabledModules', () => caller.moduleAccess.getEnabledModules(), AUTHN_ITERATIONS, AUTHN_PAUSE_MS)
    );
    results.push(
      await safeBenchmark('user.getProfile', () => caller.user.getProfile(), AUTHN_ITERATIONS, AUTHN_PAUSE_MS)
    );

    // Global search — uses a seeded term guaranteed to match at least one row
    results.push(
      await safeBenchmark('globalSearch.query', () => caller.globalSearch.query({ query: 'sarah', limit: 5 }), AUTHN_ITERATIONS, AUTHN_PAUSE_MS)
    );

    // Print summary
    console.log('\n═══════════════════════════════════════════');
    console.log('  BENCHMARK SUMMARY');
    console.log('═══════════════════════════════════════════\n');

    const totalTests = results.length;
    const errored = results.filter((r) => r.error).length;
    const measured = results.filter((r) => !r.error);
    const passedTests = measured.filter((r) => r.passed).length;
    const failedMeasured = measured.length - passedTests;

    console.log(`  Total Benchmarks:      ${totalTests}`);
    console.log(`  Completed:             ${measured.length}`);
    console.log(`  Passed IFC-003 KPI:    ${passedTests} ✅`);
    console.log(`  Failed IFC-003 KPI:    ${failedMeasured} ❌`);
    console.log(`  Could not run:         ${errored} ⚠️  (see error rows above)`);

    console.log('\n  Performance by Operation:');
    console.log('  ─────────────────────────────────────');
    for (const r of results) {
      if (r.error) {
        console.log(`  ⚠️  ${r.operation.padEnd(25)} ERROR (did not complete)`);
      } else {
        const status = r.passed ? '✅' : '❌';
        console.log(`  ${status} ${r.operation.padEnd(25)} p95: ${r.p95.toFixed(2)}ms`);
      }
    }

    console.log('\n═══════════════════════════════════════════');

    // Persist JSON output for the governance dashboard (mirrors the
    // lighthouse-summary.json / performance-report.html artifact pattern).
    // Two files written:
    //   1. trpc-benchmark.json         — raw per-operation results
    //   2. trpc-benchmark-summary.json — compact summary for the dashboard
    try {
      // __dirname = <repo>/apps/api/src/shared → up 4 = <repo>
      const repoRoot = resolve(__dirname, '..', '..', '..', '..');
      const outDir = join(repoRoot, 'artifacts', 'benchmarks');
      if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

      const timestamp = new Date().toISOString();
      const detailPath = join(outDir, 'trpc-benchmark.json');
      const summaryPath = join(outDir, 'trpc-benchmark-summary.json');

      const thresholds = { p50: 30, p95: 50, p99: 100 };
      const detail = {
        generatedAt: timestamp,
        source: 'apps/api/src/shared/performance-benchmark.ts',
        kpi: 'IFC-003',
        thresholds,
        databaseUrlSource: process.env.TEST_DATABASE_URL
          ? 'TEST_DATABASE_URL'
          : process.env.DIRECT_URL
            ? 'DIRECT_URL'
            : 'DATABASE_URL',
        results,
      };
      const summary = {
        generatedAt: timestamp,
        kpi: 'IFC-003',
        thresholds,
        totals: {
          total: totalTests,
          completed: measured.length,
          passed: passedTests,
          failedKpi: failedMeasured,
          errored,
        },
        operations: results.map((r) => ({
          operation: r.operation,
          iterations: r.iterations,
          p50: Number.isFinite(r.median) ? Number(r.median.toFixed(2)) : null,
          p95: Number.isFinite(r.p95) ? Number(r.p95.toFixed(2)) : null,
          p99: Number.isFinite(r.p99) ? Number(r.p99.toFixed(2)) : null,
          mean: Number.isFinite(r.mean) ? Number(r.mean.toFixed(2)) : null,
          min: Number.isFinite(r.min) ? Number(r.min.toFixed(2)) : null,
          max: Number.isFinite(r.max) ? Number(r.max.toFixed(2)) : null,
          passed: r.passed,
          error: r.error ?? null,
        })),
        passed: measured.length > 0 && failedMeasured === 0,
      };

      writeFileSync(detailPath, JSON.stringify(detail, null, 2));
      writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
      console.log(`  📄 Wrote ${detailPath}`);
      console.log(`  📄 Wrote ${summaryPath}\n`);
    } catch (writeErr) {
      console.warn(
        `  ⚠️  Could not write JSON outputs: ${writeErr instanceof Error ? writeErr.message : String(writeErr)}`
      );
    }

    // Exit code policy:
    //  - 0: all COMPLETED benchmarks pass KPI (infra errors don't count)
    //  - 1: at least one completed benchmark failed the KPI
    //  - 2: every benchmark errored (no useful signal)
    if (errored > 0) {
      const anyColumnMissing = results.some((r) => r.error?.includes('does not exist in the current database'));
      const anyTooManyClients = results.some((r) => r.error?.includes('too many clients'));
      if (anyColumnMissing) {
        console.log(
          '\n  💡 Hint: at least one benchmark failed with a missing column. The test DB likely needs'
        );
        console.log('     migrations:  dotenv -e .env.test -- pnpm --filter @intelliflow/db db:migrate');
      }
      if (anyTooManyClients) {
        console.log(
          '\n  💡 Hint: "too many clients already" usually means the Postgres URL has `connection_limit=1`'
        );
        console.log('     (Supabase dev safety flag). Run with:  dotenv -e .env.test -- tsx <this file>');
      }
    }

    if (measured.length === 0) {
      console.log('  ❌ NO BENCHMARKS COMPLETED — infrastructure issue');
      console.log('═══════════════════════════════════════════\n');
      process.exit(2);
    } else if (failedMeasured === 0) {
      console.log(`  ✅ ${passedTests}/${measured.length} BENCHMARKS PASSED IFC-003 KPI (p95 < 50ms)`);
      if (errored > 0) {
        console.log(`  ⚠️  ${errored} benchmark(s) could not run — see errors above`);
      }
      console.log('═══════════════════════════════════════════\n');
      process.exit(0);
    } else {
      console.log(`  ❌ ${failedMeasured}/${measured.length} BENCHMARKS FAILED IFC-003 KPI`);
      console.log('  Review performance and optimize slow endpoints');
      console.log('═══════════════════════════════════════════\n');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Benchmark failed with error:');
    console.error(error);
    process.exit(1);
  }
}

/**
 * Recommendations for optimization if benchmarks fail:
 *
 * 1. Database Optimization:
 *    - Add indexes on frequently queried columns
 *    - Use SELECT only needed fields (not SELECT *)
 *    - Enable query result caching
 *    - Use connection pooling
 *
 * 2. Code Optimization:
 *    - Reduce middleware overhead
 *    - Cache static data (system info, feature flags)
 *    - Use parallel queries where possible
 *    - Minimize serialization overhead
 *
 * 3. Infrastructure:
 *    - Use Redis for caching
 *    - Enable HTTP/2 or HTTP/3
 *    - Optimize network latency (CDN, regional deployment)
 *    - Use faster hardware (SSD, more RAM)
 *
 * 4. Monitoring:
 *    - Add OpenTelemetry tracing to identify bottlenecks
 *    - Set up APM (Application Performance Monitoring)
 *    - Create alerts for slow queries
 *    - Track performance over time
 */

/**
 * Export for programmatic use
 */
export { benchmark, runBenchmarks };
export type { BenchmarkResult };

/**
 * Run if executed directly
 */
if (require.main === module) {
  runBenchmarks().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
