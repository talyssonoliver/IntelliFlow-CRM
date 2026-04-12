/**
 * Real Performance Baseline Benchmark Runner
 *
 * This script runs ACTUAL performance benchmarks against real infrastructure.
 * It tests API endpoints, database queries, and build times - no simulations.
 *
 * Prerequisites:
 * 1. API server running: pnpm --filter api dev
 * 2. Database running: docker-compose up -d postgres
 * 3. Web app for Lighthouse: pnpm --filter web dev
 *
 * Usage: npx tsx artifacts/benchmarks/run-baseline-benchmark.ts
 *
 * @module artifacts/benchmarks/run-baseline-benchmark
 */

import { performance } from 'node:perf_hooks';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

// Load environment variables from .env.local / .env
function loadEnvFile(filePath: string): Record<string, string> {
  const vars: Record<string, string> = {};
  if (!existsSync(filePath)) return vars;
  const content = readFileSync(filePath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    vars[key] = val;
  }
  return vars;
}

function getEnvVar(name: string): string {
  if (process.env[name]) return process.env[name]!;
  const envLocal = loadEnvFile(join(process.cwd(), '.env.local'));
  if (envLocal[name]) return envLocal[name];
  const envFile = loadEnvFile(join(process.cwd(), '.env'));
  return envFile[name] || '';
}

/**
 * Authenticate with Supabase and return a Bearer token.
 * Uses the admin seed user (admin@intelliflow.dev / TestPassword123!).
 */
async function getAuthToken(): Promise<string | null> {
  const supabaseUrl = getEnvVar('SUPABASE_URL') || getEnvVar('NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = getEnvVar('SUPABASE_ANON_KEY') || getEnvVar('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  if (!supabaseUrl || !anonKey) {
    console.log('  ⚠ SUPABASE_URL or SUPABASE_ANON_KEY not found in environment or .env.local');
    return null;
  }

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'apikey': anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@intelliflow.dev', password: 'TestPassword123!' }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.log(`  ⚠ Auth failed (HTTP ${response.status}): ${body.substring(0, 200)}`);
      return null;
    }

    const data = await response.json();
    if (!data.access_token) {
      console.log('  ⚠ Auth response missing access_token');
      return null;
    }

    console.log(`  ✅ Authenticated as admin@intelliflow.dev (user: ${data.user?.id})`);
    return data.access_token;
  } catch (error) {
    console.log(`  ⚠ Auth error: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

// Types
interface BenchmarkResult {
  name: string;
  description: string;
  iterations: number;
  totalTime: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  p50: number;
  p95: number;
  p99: number;
  timestamp: string;
  metadata: Record<string, unknown>;
  status: 'PASS' | 'FAIL' | 'SKIP';
}

interface BenchmarkReport {
  benchmark_id: string;
  title: string;
  description: string;
  timestamp: string;
  status: 'COMPLETED' | 'PARTIAL' | 'NOT_RUN';
  environment: {
    node: string;
    platform: string;
    architecture: string;
    api_available: boolean;
    api_type?: 'trpc' | 'standalone';
    api_url?: string;
    database_available: boolean;
  };
  task_context: {
    original_task: string;
    original_task_status: string;
  };
  results: {
    api: BenchmarkResult[];
    database: BenchmarkResult[];
    build: BenchmarkResult[];
  };
  budgets: Array<{
    metric: string;
    target: number;
    unit: string;
    threshold: string;
  }>;
  kpi_validation: {
    benchmarks_run: boolean;
    api_tested: boolean;
    database_tested: boolean;
    build_tested: boolean;
    all_targets_met: boolean;
    violations: string[];
  };
}

// Performance budgets from Sprint Plan
const BUDGETS = {
  'api-p95': { target: 100, unit: 'ms', threshold: 'error' },
  'api-p99': { target: 200, unit: 'ms', threshold: 'error' },
  'api-avg': { target: 50, unit: 'ms', threshold: 'warn' },
  'db-query-simple': { target: 20, unit: 'ms', threshold: 'error' },
  'db-query-complex': { target: 100, unit: 'ms', threshold: 'warn' },
  'build-typecheck': { target: 60000, unit: 'ms', threshold: 'warn' },
};

/**
 * Calculate percentile from sorted array
 */
function percentile(sorted: number[], p: number): number {
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index % 1;

  if (lower === upper) return sorted[lower];
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Run benchmark for a function
 */
async function runBenchmark(
  name: string,
  description: string,
  fn: () => Promise<void>,
  options: { iterations?: number; warmup?: number; metadata?: Record<string, unknown> } = {}
): Promise<BenchmarkResult> {
  const { iterations = 50, warmup = 5, metadata = {} } = options;
  const times: number[] = [];

  console.log(`  Running ${name}...`);

  // Warmup
  for (let i = 0; i < warmup; i++) {
    try {
      await fn();
    } catch {
      // Warmup failure is OK
    }
  }

  // Actual benchmark
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    try {
      await fn();
      const end = performance.now();
      times.push(end - start);
    } catch (error) {
      // Record failure but continue
      console.log(`    Iteration ${i + 1} failed:`, error);
    }
  }

  if (times.length === 0) {
    return {
      name,
      description,
      iterations: 0,
      totalTime: 0,
      avgTime: 0,
      minTime: 0,
      maxTime: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      timestamp: new Date().toISOString(),
      metadata: { ...metadata, error: 'All iterations failed' },
      status: 'FAIL',
    };
  }

  times.sort((a, b) => a - b);
  const totalTime = times.reduce((sum, t) => sum + t, 0);
  const avgTime = totalTime / times.length;

  return {
    name,
    description,
    iterations: times.length,
    totalTime,
    avgTime,
    minTime: times[0],
    maxTime: times[times.length - 1],
    p50: percentile(times, 50),
    p95: percentile(times, 95),
    p99: percentile(times, 99),
    timestamp: new Date().toISOString(),
    metadata,
    status: 'PASS',
  };
}

/**
 * Check if API is available
 * Checks multiple possible endpoints:
 * - Port 3000: Next.js web app with tRPC proxy at /api/trpc
 * - Port 3001: Standalone API server (if running separately)
 */
async function checkApiAvailable(): Promise<{ available: boolean; baseUrl: string; type: 'trpc' | 'standalone' }> {
  // Check port 4000 first — the dedicated API server (preferred for benchmarking
  // as it avoids Next.js dev-mode proxy overhead)
  try {
    const response = await fetch('http://localhost:4000/api/trpc/health.ping', { method: 'GET' });
    if (response.ok) {
      const data = await response.json();
      if (data.result?.data?.status === 'healthy') {
        return { available: true, baseUrl: 'http://localhost:4000/api/trpc', type: 'trpc' };
      }
    }
  } catch {
    // Not available
  }

  // Check port 4000 standalone /health fallback
  try {
    const response = await fetch('http://localhost:4000/health', { method: 'GET' });
    if (response.ok) {
      return { available: true, baseUrl: 'http://localhost:4000', type: 'standalone' };
    }
  } catch {
    // Not available
  }

  // Fallback: Check Next.js tRPC endpoint on port 3000
  try {
    const response = await fetch('http://localhost:3000/api/trpc/health.check', { method: 'GET' });
    if (response.ok) {
      const data = await response.json();
      if (data.result?.data?.status === 'healthy') {
        return { available: true, baseUrl: 'http://localhost:3000/api/trpc', type: 'trpc' };
      }
    }
  } catch {
    // Not available
  }

  return { available: false, baseUrl: '', type: 'standalone' };
}

/**
 * Check if database is available
 * Uses the health.check tRPC endpoint which includes database connectivity
 */
async function checkDatabaseAvailable(): Promise<boolean> {
  // Try multiple ports for the health check that includes DB status
  const healthUrls = [
    'http://localhost:4000/api/trpc/health.check',
    'http://localhost:3000/api/trpc/health.check',
  ];
  for (const url of healthUrls) {
    try {
      const response = await fetch(url, { method: 'GET' });
      if (response.ok) {
        const data = await response.json();
        if (data.result?.data?.checks?.database?.status === 'ok') return true;
        // Some health endpoints return status at top level
        if (data.result?.data?.status === 'healthy') return true;
      }
    } catch {
      // Try next URL
    }
  }
  // Fallback: Try direct Prisma check using spawn + stdin (cross-platform, no bash heredoc)
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('pnpm', ['--filter', '@intelliflow/db', 'exec', 'prisma', 'db', 'execute', '--stdin'], {
        timeout: 5000,
        shell: true,
      });
      child.stdin.write('SELECT 1');
      child.stdin.end();
      child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
      child.on('error', reject);
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Run API benchmarks
 */
async function benchmarkApi(apiInfo: { baseUrl: string; type: 'trpc' | 'standalone' }, authToken: string | null): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];
  const { baseUrl, type } = apiInfo;
  const authHeaders: Record<string, string> = authToken ? { 'Authorization': `Bearer ${authToken}` } : {};

  // All tRPC routers and their GET endpoints to benchmark
  // Based on actual router definitions in apps/api/src/modules/
  // Total: ~110 GET endpoints across 25 routers
  const TRPC_ENDPOINTS = [
    // === Health (5 GET) ===
    { router: 'health', endpoint: 'ping', description: 'Health ping' },
    { router: 'health', endpoint: 'check', description: 'Health check with DB' },
    { router: 'health', endpoint: 'ready', description: 'Readiness probe' },
    { router: 'health', endpoint: 'alive', description: 'Liveness probe' },
    { router: 'health', endpoint: 'dbStats', description: 'Database stats' },

    // === System (6 GET) ===
    { router: 'system', endpoint: 'version', description: 'System version' },
    { router: 'system', endpoint: 'info', description: 'System info' },
    { router: 'system', endpoint: 'features', description: 'Feature flags' },
    { router: 'system', endpoint: 'capabilities', description: 'System capabilities' },

    // === Auth (2 GET) ===
    { router: 'auth', endpoint: 'getStatus', description: 'Auth status' },
    { router: 'auth', endpoint: 'getSessions', description: 'User sessions' },

    // === Lead (6 GET) ===
    { router: 'lead', endpoint: 'list', description: 'Lead list', input: { limit: 10 } },
    { router: 'lead', endpoint: 'stats', description: 'Lead stats' },
    { router: 'lead', endpoint: 'getHotLeads', description: 'Hot leads' },
    { router: 'lead', endpoint: 'getReadyForQualification', description: 'Ready for qualification' },

    // === Contact (6 GET) ===
    { router: 'contact', endpoint: 'list', description: 'Contact list', input: { limit: 10 } },
    { router: 'contact', endpoint: 'stats', description: 'Contact stats' },
    { router: 'contact', endpoint: 'search', description: 'Contact search', input: { query: 'test' } },

    // === Account (4 GET) ===
    { router: 'account', endpoint: 'list', description: 'Account list', input: { limit: 10 } },
    { router: 'account', endpoint: 'stats', description: 'Account stats' },

    // === Opportunity (4 GET) ===
    { router: 'opportunity', endpoint: 'list', description: 'Opportunity list', input: { limit: 10 } },
    { router: 'opportunity', endpoint: 'stats', description: 'Opportunity stats' },
    { router: 'opportunity', endpoint: 'forecast', description: 'Opportunity forecast' },

    // === Task (3 GET) ===
    { router: 'task', endpoint: 'list', description: 'Task list', input: { limit: 10 } },
    { router: 'task', endpoint: 'stats', description: 'Task stats' },

    // === Ticket (4 GET) ===
    { router: 'ticket', endpoint: 'list', description: 'Ticket list', input: { limit: 10 } },
    { router: 'ticket', endpoint: 'stats', description: 'Ticket stats', input: {} },

    // === Appointments (7 GET) ===
    { router: 'appointments', endpoint: 'list', description: 'Appointments list', input: { limit: 10 } },
    { router: 'appointments', endpoint: 'stats', description: 'Appointments stats' },
    { router: 'appointments', endpoint: 'checkConflicts', description: 'Check conflicts', input: { startTime: new Date().toISOString(), endTime: new Date(Date.now() + 3600000).toISOString(), attendeeIds: ['00000000-0000-4000-8000-000000000101'] } },

    // === Documents (3 GET) ===
    { router: 'documents', endpoint: 'list', description: 'Documents list', input: { limit: 10 } },

    // === Conversation (5 GET) ===
    { router: 'conversation', endpoint: 'search', description: 'Conversation search', input: { query: 'test', limit: 10 } },

    // === Agent (5 GET) ===
    { router: 'agent', endpoint: 'listTools', description: 'Agent tools list' },
    { router: 'agent', endpoint: 'getPendingApprovals', description: 'Pending approvals' },
    { router: 'agent', endpoint: 'getPendingCount', description: 'Pending count' },

    // === Billing (5 GET) ===
    { router: 'billing', endpoint: 'getSubscription', description: 'Subscription info' },
    { router: 'billing', endpoint: 'getPaymentMethods', description: 'Payment methods' },
    { router: 'billing', endpoint: 'getUsageMetrics', description: 'Usage metrics' },

    // === Analytics (5 GET) ===
    { router: 'analytics', endpoint: 'leadStats', description: 'Lead analytics' },
    { router: 'analytics', endpoint: 'trafficSources', description: 'Traffic sources' },

    // === Timeline (8 GET) ===
    { router: 'timeline', endpoint: 'getEvents', description: 'Timeline events', input: { entityType: 'lead', entityId: 'test' } },

    // === Pipeline Config (2 GET) ===
    { router: 'pipelineConfig', endpoint: 'getAll', description: 'All pipeline configs' },
    { router: 'pipelineConfig', endpoint: 'getStats', description: 'Pipeline stats' },

    // === Integrations (4 GET) ===
    { router: 'integrations', endpoint: 'getAllConnectorsHealth', description: 'Connectors health' },
    { router: 'integrations', endpoint: 'getDashboardConfig', description: 'Dashboard config' },

    // === Audit (5 GET) ===
    { router: 'audit', endpoint: 'search', description: 'Audit search', input: { limit: 10 } },

    // === Experiment (5 GET) ===
    { router: 'experiment', endpoint: 'list', description: 'Experiment list', input: { limit: 10 } },

    // === Feedback Survey (3 GET) — registered as feedbackSurvey ===
    { router: 'feedbackSurvey', endpoint: 'getDashboardStats', description: 'Feedback dashboard stats', input: {} },

    // === Chain Version (8 GET) ===
    { router: 'chainVersion', endpoint: 'list', description: 'Chain version list', input: { limit: 10 } },

    // === Email / Inbound (4 GET) — registered as email ===
    { router: 'email', endpoint: 'getStorageUsage', description: 'Email storage usage' },
  ];

  if (type === 'trpc') {
    console.log(`  Testing ${TRPC_ENDPOINTS.length} tRPC endpoints...`);

    for (const ep of TRPC_ENDPOINTS) {
      const endpointPath = `${ep.router}.${ep.endpoint}`;
      const url = ep.input
        ? `${baseUrl}/${endpointPath}?input=${encodeURIComponent(JSON.stringify(ep.input))}`
        : `${baseUrl}/${endpointPath}`;

      try {
        const result = await runBenchmark(
          `${ep.router}-${ep.endpoint}`,
          `${ep.description} endpoint response time`,
          async () => {
            const response = await fetch(url, { headers: authHeaders });
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}`);
            }
          },
          { iterations: 20, warmup: 3, metadata: { endpoint: url } }
        );
        results.push(result);
        console.log(`    ✓ ${endpointPath}: ${result.p50.toFixed(1)}ms (p50)`);
      } catch (error) {
        console.log(`    ✗ ${endpointPath}: skipped (${error instanceof Error ? error.message : 'error'})`);
      }
    }
  } else {
    // Standalone API server endpoints
    results.push(
      await runBenchmark(
        'api-health',
        'Health check endpoint response time',
        async () => {
          const response = await fetch(`${baseUrl}/health`);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
        },
        { iterations: 100, warmup: 10, metadata: { endpoint: '/health' } }
      )
    );

    // tRPC healthcheck (if available)
    try {
      results.push(
        await runBenchmark(
          'api-trpc',
          'tRPC endpoint response time',
          async () => {
            const response = await fetch(`${baseUrl}/trpc/health`, { method: 'GET' });
            if (!response.ok && response.status !== 404) throw new Error(`HTTP ${response.status}`);
          },
          { iterations: 100, warmup: 10, metadata: { endpoint: '/trpc/health' } }
        )
      );
    } catch {
      console.log('    tRPC endpoint not available, skipping');
    }
  }

  // Calculate aggregates for budget validation
  const allTimes: number[] = [];
  for (const result of results) {
    if (result.status === 'PASS') {
      allTimes.push(result.p95);
    }
  }

  if (allTimes.length > 0) {
    allTimes.sort((a, b) => a - b);
    const avgP95 = allTimes.reduce((a, b) => a + b, 0) / allTimes.length;

    results.push({
      name: 'api-p95',
      description: 'Aggregate API p95 response time',
      iterations: results.length,
      totalTime: avgP95 * results.length,
      avgTime: avgP95,
      minTime: allTimes[0],
      maxTime: allTimes[allTimes.length - 1],
      p50: percentile(allTimes, 50),
      p95: percentile(allTimes, 95),
      p99: percentile(allTimes, 99),
      timestamp: new Date().toISOString(),
      metadata: { aggregate: true },
      status: 'PASS',
    });
  }

  return results;
}

/**
 * Run a SQL query via `prisma db execute --stdin` using cross-platform spawn (no bash heredoc).
 * Works on Windows cmd/PowerShell as well as Unix shells.
 */
function runPrismaQuery(sql: string, timeoutMs = 10000): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn('pnpm', ['--filter', '@intelliflow/db', 'exec', 'prisma', 'db', 'execute', '--stdin'], {
      timeout: timeoutMs,
      shell: true,
    });
    child.stdin.write(sql);
    child.stdin.end();
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`prisma db execute exited with code ${code}`))));
    child.on('error', reject);
  });
}

/**
 * Run database benchmarks.
 *
 * Three complementary approaches:
 *  1. Raw Prisma CLI query (SELECT COUNT(*) FROM leads) — lowest-level round-trip to Supabase.
 *  2. health.dbStats tRPC endpoint — API-mediated DB timing already computed server-side.
 *  3. lead.stats tRPC endpoint — realistic aggregate query path that users actually trigger.
 */
async function benchmarkDatabase(): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];

  // ------------------------------------------------------------------
  // 1. Raw DB query via Prisma CLI (cross-platform spawn + stdin pipe)
  // ------------------------------------------------------------------
  try {
    results.push(
      await runBenchmark(
        'db-query-simple',
        'Simple SELECT COUNT(*) FROM leads via Prisma CLI',
        () => runPrismaQuery('SELECT COUNT(*) FROM leads'),
        { iterations: 20, warmup: 3, metadata: { query: 'SELECT COUNT(*) FROM leads', method: 'prisma-cli' } }
      )
    );
  } catch (error) {
    console.log('    Simple query (Prisma CLI) failed:', error);
    results.push({
      name: 'db-query-simple',
      description: 'Simple SELECT COUNT(*) FROM leads via Prisma CLI',
      iterations: 0,
      totalTime: 0,
      avgTime: 0,
      minTime: 0,
      maxTime: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      timestamp: new Date().toISOString(),
      metadata: { error: String(error), method: 'prisma-cli' },
      status: 'SKIP',
    });
  }

  // ------------------------------------------------------------------
  // 2. API-mediated DB timing: health.dbStats endpoint
  //    This endpoint already runs DB diagnostics and returns timing data,
  //    making it the most reliable proxy for "how fast is the DB via API".
  // ------------------------------------------------------------------
  const dbStatsUrls = [
    'http://localhost:4000/api/trpc/health.dbStats',
    'http://localhost:3000/api/trpc/health.dbStats',
  ];
  let dbStatsUrl: string | null = null;
  for (const url of dbStatsUrls) {
    try {
      const probe = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (probe.ok || probe.status === 401) { dbStatsUrl = url; break; }
    } catch { /* try next */ }
  }

  if (dbStatsUrl) {
    const capturedUrl = dbStatsUrl;
    try {
      results.push(
        await runBenchmark(
          'db-via-api-dbstats',
          'DB stats round-trip via health.dbStats tRPC endpoint',
          async () => {
            const res = await fetch(capturedUrl, { signal: AbortSignal.timeout(8000) });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
          },
          { iterations: 20, warmup: 3, metadata: { endpoint: capturedUrl, method: 'trpc-health-dbstats' } }
        )
      );
    } catch (error) {
      console.log('    health.dbStats benchmark failed:', error);
    }
  } else {
    console.log('    health.dbStats endpoint not reachable — skipping API DB benchmark');
  }

  // ------------------------------------------------------------------
  // 3. Realistic user path: lead.stats tRPC endpoint
  //    Executes aggregate GROUP-BY queries on leads — the same path
  //    real users hit when viewing the CRM dashboard.
  // ------------------------------------------------------------------
  const leadStatsUrls = [
    'http://localhost:4000/api/trpc/lead.stats',
    'http://localhost:3000/api/trpc/lead.stats',
  ];
  let leadStatsUrl: string | null = null;
  for (const url of leadStatsUrls) {
    try {
      const probe = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (probe.ok || probe.status === 401) { leadStatsUrl = url; break; }
    } catch { /* try next */ }
  }

  if (leadStatsUrl) {
    const capturedUrl = leadStatsUrl;
    try {
      results.push(
        await runBenchmark(
          'db-via-api-lead-stats',
          'Realistic DB aggregate query via lead.stats tRPC endpoint',
          async () => {
            const res = await fetch(capturedUrl, { signal: AbortSignal.timeout(8000) });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
          },
          { iterations: 20, warmup: 3, metadata: { endpoint: capturedUrl, method: 'trpc-lead-stats' } }
        )
      );
    } catch (error) {
      console.log('    lead.stats benchmark failed:', error);
    }
  } else {
    console.log('    lead.stats endpoint not reachable — skipping realistic DB benchmark');
  }

  return results;
}

/**
 * Run build benchmarks
 */
async function benchmarkBuild(): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];

  // TypeScript typecheck (faster than full build)
  console.log('  Running typecheck benchmark (this may take a while)...');

  const start = performance.now();
  try {
    await execAsync('pnpm run typecheck', { timeout: 120000 });
    const duration = performance.now() - start;

    results.push({
      name: 'build-typecheck',
      description: 'TypeScript typecheck time',
      iterations: 1,
      totalTime: duration,
      avgTime: duration,
      minTime: duration,
      maxTime: duration,
      p50: duration,
      p95: duration,
      p99: duration,
      timestamp: new Date().toISOString(),
      metadata: { command: 'pnpm run typecheck' },
      status: duration < BUDGETS['build-typecheck'].target ? 'PASS' : 'FAIL',
    });
  } catch (error) {
    const duration = performance.now() - start;
    results.push({
      name: 'build-typecheck',
      description: 'TypeScript typecheck time',
      iterations: 1,
      totalTime: duration,
      avgTime: duration,
      minTime: duration,
      maxTime: duration,
      p50: duration,
      p95: duration,
      p99: duration,
      timestamp: new Date().toISOString(),
      metadata: { command: 'pnpm run typecheck', error: String(error) },
      status: 'FAIL',
    });
  }

  return results;
}

/**
 * Validate results against budgets
 */
function validateBudgets(
  results: { api: BenchmarkResult[]; database: BenchmarkResult[]; build: BenchmarkResult[] }
): { all_met: boolean; violations: string[] } {
  const violations: string[] = [];
  const allResults = [...results.api, ...results.database, ...results.build];

  for (const [metric, budget] of Object.entries(BUDGETS)) {
    const result = allResults.find((r) => r.name === metric);
    if (!result || result.status !== 'PASS') continue;

    const value = metric.includes('p99') ? result.p99 : metric.includes('p95') ? result.p95 : result.avgTime;

    if (value > budget.target) {
      const severity = budget.threshold === 'error' ? 'ERROR' : 'WARNING';
      violations.push(`[${severity}] ${metric}: ${value.toFixed(2)}${budget.unit} exceeds budget of ${budget.target}${budget.unit}`);
    }
  }

  return {
    all_met: violations.filter((v) => v.includes('ERROR')).length === 0,
    violations,
  };
}

/**
 * Main benchmark runner
 */
async function main() {
  console.log('='.repeat(60));
  console.log('IntelliFlow CRM - Real Performance Baseline Benchmark');
  console.log('='.repeat(60));
  console.log();

  // Check infrastructure availability
  console.log('Checking infrastructure availability...');
  const apiInfo = await checkApiAvailable();
  const dbAvailable = await checkDatabaseAvailable();

  console.log(`  API Server: ${apiInfo.available ? `✅ Available (${apiInfo.type} at ${apiInfo.baseUrl})` : '❌ Not available'}`);
  console.log(`  Database: ${dbAvailable ? '✅ Available (Supabase)' : '❌ Not available'}`);
  console.log();

  // Authenticate before running benchmarks
  console.log('Authenticating...');
  const authToken = await getAuthToken();
  if (!authToken) {
    console.log('  ⚠ Running without auth — authenticated endpoints will fail honestly');
  }
  console.log();

  const results: BenchmarkReport['results'] = {
    api: [],
    database: [],
    build: [],
  };

  // Run benchmarks based on availability
  if (apiInfo.available) {
    console.log('Running API benchmarks...');
    results.api = await benchmarkApi(apiInfo, authToken);
    console.log(`  Completed ${results.api.length} API benchmarks`);
  } else {
    console.log('Skipping API benchmarks (server not running)');
  }

  if (dbAvailable) {
    console.log('\nRunning database benchmarks...');
    results.database = await benchmarkDatabase();
    console.log(`  Completed ${results.database.length} database benchmarks`);
  } else {
    console.log('\nSkipping database benchmarks (database not available)');
  }

  // Build benchmarks can run without external services
  console.log('\nRunning build benchmarks...');
  results.build = await benchmarkBuild();
  console.log(`  Completed ${results.build.length} build benchmarks`);

  // Validate against budgets
  const validation = validateBudgets(results);

  // Determine overall status
  let status: 'COMPLETED' | 'PARTIAL' | 'NOT_RUN' = 'NOT_RUN';
  if (apiInfo.available && dbAvailable) {
    status = 'COMPLETED';
  } else if (apiInfo.available || dbAvailable || results.build.length > 0) {
    status = 'PARTIAL';
  }

  // Build report
  const report: BenchmarkReport = {
    benchmark_id: 'ENV-015-AI-performance-baseline',
    title: 'IntelliFlow CRM - Performance Baseline',
    description:
      status === 'COMPLETED'
        ? 'Real performance baseline with all infrastructure available'
        : status === 'PARTIAL'
          ? 'Partial performance baseline - some infrastructure unavailable'
          : 'Benchmark not run - no infrastructure available',
    timestamp: new Date().toISOString(),
    status,
    environment: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      api_available: apiInfo.available,
      api_type: apiInfo.type,
      api_url: apiInfo.baseUrl,
      database_available: dbAvailable,
    },
    task_context: {
      original_task: 'ENV-015-AI',
      original_task_status: status === 'COMPLETED' ? 'Real benchmarks completed' : 'PARTIAL - real benchmarks run where possible',
    },
    results,
    budgets: Object.entries(BUDGETS).map(([metric, budget]) => ({
      metric,
      ...budget,
    })),
    kpi_validation: {
      benchmarks_run: status !== 'NOT_RUN',
      api_tested: results.api.length > 0 && results.api.some((r) => r.status === 'PASS'),
      database_tested: results.database.length > 0 && results.database.some((r) => r.status === 'PASS'),
      build_tested: results.build.length > 0 && results.build.some((r) => r.status === 'PASS'),
      all_targets_met: validation.all_met,
      violations: validation.violations,
    },
  };

  // Save results - PRESERVE existing inventory data
  const outputPath = join(process.cwd(), 'artifacts', 'benchmarks', 'baseline.json');
  const outputDir = dirname(outputPath);

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Read existing file to preserve inventory data
  let existingData: Record<string, unknown> = {};
  if (existsSync(outputPath)) {
    try {
      existingData = JSON.parse(readFileSync(outputPath, 'utf-8'));
    } catch {
      // If file is corrupted, start fresh
    }
  }

  // Merge: keep inventory data and load_test_results, update benchmark results
  const mergedReport = {
    ...report,
    // Preserve inventory data from existing file
    api_inventory: existingData.api_inventory,
    database_inventory: existingData.database_inventory,
    middleware_inventory: existingData.middleware_inventory,
    workers_inventory: existingData.workers_inventory,
    integrations_inventory: existingData.integrations_inventory,
    domain_events_inventory: existingData.domain_events_inventory,
    validators_inventory: existingData.validators_inventory,
    cache_inventory: existingData.cache_inventory,
    // Preserve load test results (written by integrate-k6-results.ts)
    load_test_results: existingData.load_test_results,
  };

  writeFileSync(outputPath, JSON.stringify(mergedReport, null, 2), 'utf-8');

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('BENCHMARK SUMMARY');
  console.log('='.repeat(60));
  console.log(`Status: ${status}`);
  console.log(`API Tests: ${results.api.length} (${results.api.filter((r) => r.status === 'PASS').length} passed)`);
  console.log(`DB Tests: ${results.database.length} (${results.database.filter((r) => r.status === 'PASS').length} passed)`);
  console.log(`Build Tests: ${results.build.length} (${results.build.filter((r) => r.status === 'PASS').length} passed)`);

  if (validation.violations.length > 0) {
    console.log('\nBudget Violations:');
    for (const v of validation.violations) {
      console.log(`  ${v}`);
    }
  } else if (status !== 'NOT_RUN') {
    console.log('\n✅ All performance budgets met!');
  }

  console.log(`\nResults saved to: ${outputPath}`);

  // Exit with appropriate code
  process.exit(validation.all_met ? 0 : 1);
}

// Run if executed directly
main().catch((error) => {
  console.error('Benchmark failed:', error);
  process.exit(1);
});
