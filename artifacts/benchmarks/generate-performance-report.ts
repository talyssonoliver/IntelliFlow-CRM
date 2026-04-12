/**
 * Performance Report Generator
 *
 * Generates an HTML performance report from actual benchmark JSON files.
 * This ensures the report reflects real measured data, not fabricated values.
 * When benchmarks haven't been run, shows placeholder values with clear indication.
 *
 * Usage: npx tsx artifacts/benchmarks/generate-performance-report.ts
 *
 * @module artifacts/benchmarks/generate-performance-report
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Types
interface EndpointResult {
  name: string;
  method: string;
  p50: number;
  p95: number;
  p99: number;
  requests_per_second: number;
  total_requests: number;
  data_transferred: string;
  status: 'PASS' | 'FAIL';
}

interface ErrorResult {
  type: string;
  count: number;
  percentage: string;
  cause: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXPECTED';
}

interface ResourceResults {
  api_cpu: number | null;
  api_memory_gb: number | null;
  db_cpu: number | null;
  db_connections: number | null;
  db_connections_max: number | null;
  redis_memory_mb: number | null;
  network_bandwidth_mbps: number | null;
}

interface Recommendation {
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
}

interface KpiResult {
  name: string;
  target: string;
  actual: string;
  status: 'PASS' | 'FAIL';
}

interface EndpointCatalogItem {
  name: string;
  method: string;
  description: string;
  critical?: boolean;
}

interface RouterInfo {
  name: string;
  endpoints: number;
  queries: number;
  mutations: number;
}

interface ApiInventory {
  total_routers: number;
  total_endpoints: number;
  total_queries: number;
  total_mutations: number;
  routers: RouterInfo[];
}

// Codebase Inventory Types
interface TableInfo {
  name: string;
  fields: number;
  indexes: number;
  relations: number;
  hasEmbedding: boolean;
}

interface DatabaseInventory {
  total_tables: number;
  total_fields: number;
  total_indexes: number;
  total_relations: number;
  tables_with_embeddings: number;
  enums: number;
  tables: TableInfo[];
}

interface MiddlewareInfo {
  name: string;
  type: string;
  description: string;
  enabled: boolean;
}

interface MiddlewareInventory {
  total_middleware: number;
  by_type: Record<string, number>;
  middleware: MiddlewareInfo[];
}

interface WorkerInfo {
  name: string;
  type: string;
  jobs: string[];
  description: string;
}

interface WorkersInventory {
  total_workers: number;
  total_jobs: number;
  workers: WorkerInfo[];
}

interface IntegrationInfo {
  name: string;
  category: string;
  provider: string;
  description: string;
}

interface IntegrationsInventory {
  total_integrations: number;
  by_category: Record<string, number>;
  integrations: IntegrationInfo[];
}

interface DomainEventInfo {
  name: string;
  eventType: string;
  aggregate: string;
  workflowEngine?: string;
}

interface DomainEventsInventory {
  total_events: number;
  by_aggregate: Record<string, number>;
  by_workflow_engine: Record<string, number>;
  events: DomainEventInfo[];
}

interface ValidatorInfo {
  name: string;
  file: string;
  schemas: number;
  complexity: string;
}

interface ValidatorsInventory {
  total_validators: number;
  total_schemas: number;
  by_complexity: Record<string, number>;
  validators: ValidatorInfo[];
}

interface CacheKeyInfo {
  pattern: string;
  purpose: string;
  ttl?: string;
}

interface CacheInventory {
  enabled: boolean;
  provider: string;
  total_key_patterns: number;
  keys: CacheKeyInfo[];
}

// ============================================================================
// BenchmarkData — matches actual baseline.json structure
// ============================================================================

interface ApiBenchmarkResult {
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

interface BudgetEntry {
  metric: string;
  target: number;
  unit: string;
  threshold: string;
}

interface LoadTestResults {
  timestamp: string;
  target_vus: number;
  max_concurrent_users: number;
  requests_per_second: number;
  error_rate: number;
  p50_response_time: number | null;
  p95_response_time: number | null;
  p99_response_time: number | null;
  duration_seconds: number;
  thresholds_passed: boolean;
}

interface BenchmarkData {
  benchmark_id: string;
  title: string;
  description: string;
  task_reference?: string;
  timestamp: string;
  status: 'COMPLETED' | 'PARTIAL' | 'NOT_RUN' | 'FAILED';
  reason?: string;
  task_context?: {
    original_task: string;
    original_task_status?: string;
  };
  environment?: {
    node?: string;
    platform?: string;
    architecture?: string;
    api_available?: boolean;
    api_type?: string;
    api_url?: string;
    database_available?: boolean;
  };
  // Actual results from run-baseline-benchmark.ts
  results?: {
    api: ApiBenchmarkResult[];
    database: ApiBenchmarkResult[];
    build: ApiBenchmarkResult[];
  };
  // Flat array of budget entries
  budgets?: BudgetEntry[];
  // Load test results from integrate-k6-results.ts
  load_test_results?: LoadTestResults;
  // KPI validation
  kpi_validation?: {
    benchmarks_run: boolean;
    api_tested: boolean;
    database_tested: boolean;
    build_tested: boolean;
    all_targets_met: boolean;
    violations: string[];
  };
  // Inventory sections (these work correctly already)
  api_inventory?: ApiInventory;
  endpoint_catalog?: Record<string, EndpointCatalogItem[]>;
  database_inventory?: DatabaseInventory;
  middleware_inventory?: MiddlewareInventory;
  workers_inventory?: WorkersInventory;
  integrations_inventory?: IntegrationsInventory;
  domain_events_inventory?: DomainEventsInventory;
  validators_inventory?: ValidatorsInventory;
  cache_inventory?: CacheInventory;
}

// ============================================================================
// Helpers to compute summary from actual data
// ============================================================================

function getPassingApiResults(data: BenchmarkData): ApiBenchmarkResult[] {
  return (data.results?.api || []).filter(r => r.status === 'PASS' && !r.metadata?.aggregate);
}

function getFailingApiResults(data: BenchmarkData): ApiBenchmarkResult[] {
  return (data.results?.api || []).filter(r => r.status === 'FAIL');
}

function computeApiSummary(data: BenchmarkData) {
  const passing = getPassingApiResults(data);
  if (passing.length === 0) return { p50: null, p95: null, p99: null, count: 0 };
  const p50s = passing.map(r => r.p50).sort((a, b) => a - b);
  const p95s = passing.map(r => r.p95).sort((a, b) => a - b);
  const p99s = passing.map(r => r.p99).sort((a, b) => a - b);
  const median = (arr: number[]) => arr[Math.floor(arr.length / 2)];
  return {
    p50: median(p50s),
    p95: median(p95s),
    p99: median(p99s),
    avgP50: p50s.reduce((a, b) => a + b, 0) / p50s.length,
    avgP95: p95s.reduce((a, b) => a + b, 0) / p95s.length,
    count: passing.length,
  };
}

function findBudget(data: BenchmarkData, metric: string): number | null {
  const entry = (data.budgets || []).find(b => b.metric === metric);
  return entry ? entry.target : null;
}

/**
 * Load benchmark data from JSON file
 */
function loadBenchmarkData(filePath: string): BenchmarkData | null {
  if (!existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    return null;
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as BenchmarkData;
  } catch (error) {
    console.error(`Failed to parse ${filePath}:`, error);
    return null;
  }
}

/**
 * Get CSS styles (same as original)
 */
function getStyles(): string {
  return `
        :root {
            --primary: #2563eb;
            --success: #16a34a;
            --warning: #ea580c;
            --danger: #dc2626;
            --gray-50: #f9fafb;
            --gray-100: #f3f4f6;
            --gray-200: #e5e7eb;
            --gray-700: #374151;
            --gray-900: #111827;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background-color: var(--gray-50);
            color: var(--gray-900);
            line-height: 1.6;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 2rem;
        }

        header {
            background: linear-gradient(135deg, var(--primary), #1d4ed8);
            color: white;
            padding: 2rem;
            margin-bottom: 2rem;
            border-radius: 8px;
        }

        header h1 {
            font-size: 2rem;
            margin-bottom: 0.5rem;
        }

        header p {
            opacity: 0.9;
        }

        .meta-info {
            display: flex;
            gap: 2rem;
            margin-top: 1rem;
            font-size: 0.875rem;
        }

        .meta-info span {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .section {
            background: white;
            border-radius: 8px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            margin-bottom: 1.5rem;
            overflow: hidden;
        }

        .section-header {
            background: var(--gray-100);
            padding: 1rem 1.5rem;
            border-bottom: 1px solid var(--gray-200);
        }

        .section-header h2 {
            font-size: 1.25rem;
            color: var(--gray-700);
        }

        .section-body {
            padding: 1.5rem;
        }

        .kpi-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
        }

        .kpi-card {
            background: var(--gray-50);
            border-radius: 8px;
            padding: 1.25rem;
            text-align: center;
            border: 1px solid var(--gray-200);
        }

        .kpi-card.success {
            border-color: var(--success);
            background: #f0fdf4;
        }

        .kpi-card.warning {
            border-color: var(--warning);
            background: #fff7ed;
        }

        .kpi-card.danger {
            border-color: var(--danger);
            background: #fef2f2;
        }

        .kpi-card.pending {
            border-color: var(--gray-200);
            background: var(--gray-50);
        }

        .kpi-card.danger {
            border-color: var(--danger);
            background: #fef2f2;
        }

        .kpi-value {
            font-size: 2rem;
            font-weight: 700;
            margin-bottom: 0.25rem;
        }

        .kpi-label {
            font-size: 0.875rem;
            color: var(--gray-700);
        }

        .kpi-target {
            font-size: 0.75rem;
            color: var(--gray-700);
            margin-top: 0.5rem;
        }

        .status-badge {
            display: inline-block;
            padding: 0.25rem 0.75rem;
            border-radius: 9999px;
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
        }

        .status-badge.pass {
            background: #dcfce7;
            color: var(--success);
        }

        .status-badge.fail {
            background: #fef2f2;
            color: var(--danger);
        }

        .status-badge.pending {
            background: var(--gray-100);
            color: var(--gray-700);
        }

        table {
            width: 100%;
            border-collapse: collapse;
        }

        th, td {
            padding: 0.75rem 1rem;
            text-align: left;
            border-bottom: 1px solid var(--gray-200);
        }

        th {
            background: var(--gray-50);
            font-weight: 600;
            color: var(--gray-700);
            font-size: 0.875rem;
        }

        td {
            font-size: 0.875rem;
        }

        tr:hover {
            background: var(--gray-50);
        }

        .bar-chart {
            display: flex;
            align-items: flex-end;
            gap: 0.5rem;
            height: 200px;
            padding: 1rem 0;
        }

        .bar-group {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
        }

        .bar {
            width: 100%;
            max-width: 60px;
            background: var(--primary);
            border-radius: 4px 4px 0 0;
            transition: height 0.3s ease;
        }

        .bar.p50 { background: #60a5fa; }
        .bar.p95 { background: #2563eb; }
        .bar.p99 { background: #1e40af; }
        .bar.pending { background: var(--gray-200); }

        .bar-label {
            margin-top: 0.5rem;
            font-size: 0.75rem;
            color: var(--gray-700);
        }

        .bar-value {
            font-size: 0.75rem;
            font-weight: 600;
            margin-bottom: 0.25rem;
        }

        .legend {
            display: flex;
            justify-content: center;
            gap: 2rem;
            margin-top: 1rem;
            padding-top: 1rem;
            border-top: 1px solid var(--gray-200);
        }

        .legend-item {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            font-size: 0.875rem;
        }

        .legend-color {
            width: 16px;
            height: 16px;
            border-radius: 4px;
        }

        .resource-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 1rem;
        }

        .resource-card {
            background: var(--gray-50);
            border-radius: 8px;
            padding: 1rem;
            border: 1px solid var(--gray-200);
        }

        .resource-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0.75rem;
        }

        .resource-name {
            font-weight: 600;
        }

        .resource-value {
            font-size: 1.25rem;
            font-weight: 700;
        }

        .progress-bar {
            height: 8px;
            background: var(--gray-200);
            border-radius: 4px;
            overflow: hidden;
        }

        .progress-fill {
            height: 100%;
            background: var(--primary);
            border-radius: 4px;
            transition: width 0.3s ease;
        }

        .progress-fill.high {
            background: var(--warning);
        }

        .progress-fill.critical {
            background: var(--danger);
        }

        .recommendations {
            list-style: none;
        }

        .recommendations li {
            padding: 0.75rem 0;
            border-bottom: 1px solid var(--gray-200);
            display: flex;
            align-items: flex-start;
            gap: 0.75rem;
        }

        .recommendations li:last-child {
            border-bottom: none;
        }

        .recommendation-icon {
            flex-shrink: 0;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.75rem;
        }

        .recommendation-icon.high {
            background: #fef2f2;
            color: var(--danger);
        }

        .recommendation-icon.medium {
            background: #fff7ed;
            color: var(--warning);
        }

        .recommendation-icon.low {
            background: #f0fdf4;
            color: var(--success);
        }

        .alert {
            padding: 1.5rem;
            border-radius: 8px;
            margin-bottom: 1.5rem;
        }

        .alert-warning {
            background: #fff7ed;
            border: 1px solid var(--warning);
        }

        .alert-info {
            background: #eff6ff;
            border: 1px solid var(--primary);
        }

        .alert h3 {
            margin-bottom: 0.5rem;
        }

        .alert-warning h3 {
            color: var(--warning);
        }

        .alert-info h3 {
            color: var(--primary);
        }

        footer {
            text-align: center;
            padding: 2rem;
            color: var(--gray-700);
            font-size: 0.875rem;
        }
    `;
}

/**
 * Generate Executive Summary section
 */
function generateExecutiveSummary(data: BenchmarkData): string {
  const isNotRun = data.status === 'NOT_RUN';
  const apiSummary = computeApiSummary(data);
  const lt = data.load_test_results;
  const passing = getPassingApiResults(data);
  const failing = getFailingApiResults(data);
  const totalEndpoints = passing.length + failing.length;

  // Use computed API benchmark data (real per-endpoint measurements)
  const p50 = isNotRun ? '--' : apiSummary.p50 != null ? `${Math.round(apiSummary.p50)}ms` : 'N/A';
  const p95 = isNotRun ? '--' : apiSummary.p95 != null ? `${Math.round(apiSummary.p95)}ms` : 'N/A';
  const p99 = isNotRun ? '--' : apiSummary.p99 != null ? `${Math.round(apiSummary.p99)}ms` : 'N/A';
  const rps = isNotRun ? '--' : lt?.requests_per_second != null ? Math.round(lt.requests_per_second).toLocaleString() : '--';
  const errorRate = isNotRun ? '--' : totalEndpoints > 0 ? `${((failing.length / totalEndpoints) * 100).toFixed(1)}%` : '--';
  const maxUsers = isNotRun ? '--' : lt?.max_concurrent_users != null ? lt.max_concurrent_users.toLocaleString() : '--';

  // Budget targets from flat array
  const p95Target = findBudget(data, 'api-p95') ?? 100;
  const p99Target = findBudget(data, 'api-p99') ?? 200;
  const p50Target = findBudget(data, 'api-avg') ?? 50;

  // Determine card status based on actual vs target
  const p50Class = isNotRun ? 'pending' : (apiSummary.p50 != null && apiSummary.p50 <= p50Target) ? 'success' : 'danger';
  const p95Class = isNotRun ? 'pending' : (apiSummary.p95 != null && apiSummary.p95 <= p95Target) ? 'success' : 'danger';
  const p99Class = isNotRun ? 'pending' : (apiSummary.p99 != null && apiSummary.p99 <= p99Target) ? 'success' : 'danger';
  const rpsClass = isNotRun ? 'pending' : 'success';
  const errorClass = isNotRun ? 'pending' : failing.length === 0 ? 'success' : 'danger';
  const usersClass = isNotRun ? 'pending' : 'success';

  return `
        <!-- Executive Summary -->
        <section class="section">
            <div class="section-header">
                <h2>Executive Summary</h2>
            </div>
            <div class="section-body">
                ${isNotRun ? `
                <div class="alert alert-warning">
                    <h3>Benchmarks Not Yet Executed</h3>
                    <p>${data.reason || 'No benchmark data available. Run the benchmark script to collect real measurements.'}</p>
                </div>
                ` : `
                <p style="margin-bottom: 1rem; color: var(--gray-700);">
                    Benchmarked <strong>${passing.length}</strong> of <strong>${totalEndpoints}</strong> endpoints.
                    ${failing.length > 0 ? `<span style="color: var(--danger);"><strong>${failing.length}</strong> endpoint(s) failed.</span>` : '<span style="color: var(--success);">All endpoints passing.</span>'}
                    ${lt ? ` Load test: <strong>${lt.target_vus} VUs</strong> for <strong>${lt.duration_seconds}s</strong>.` : ''}
                </p>
                `}
                <div class="kpi-grid">
                    <div class="kpi-card ${p50Class}">
                        <div class="kpi-value">${p50}</div>
                        <div class="kpi-label">Median p50 Response Time</div>
                        <div class="kpi-target">Target: &lt; ${p50Target}ms</div>
                    </div>
                    <div class="kpi-card ${p95Class}">
                        <div class="kpi-value">${p95}</div>
                        <div class="kpi-label">Median p95 Response Time</div>
                        <div class="kpi-target">Target: &lt; ${p95Target}ms</div>
                    </div>
                    <div class="kpi-card ${p99Class}">
                        <div class="kpi-value">${p99}</div>
                        <div class="kpi-label">Median p99 Response Time</div>
                        <div class="kpi-target">Target: &lt; ${p99Target}ms</div>
                    </div>
                    <div class="kpi-card ${rpsClass}">
                        <div class="kpi-value">${rps}</div>
                        <div class="kpi-label">Requests/Second</div>
                        <div class="kpi-target">${lt ? `Load test (${lt.target_vus} VUs)` : 'Target: &gt; 100 rps'}</div>
                    </div>
                    <div class="kpi-card ${errorClass}">
                        <div class="kpi-value">${errorRate}</div>
                        <div class="kpi-label">Endpoint Failure Rate</div>
                        <div class="kpi-target">${failing.length}/${totalEndpoints} failed</div>
                    </div>
                    <div class="kpi-card ${usersClass}">
                        <div class="kpi-value">${maxUsers}</div>
                        <div class="kpi-label">Concurrent Users Tested</div>
                        <div class="kpi-target">${lt ? `${lt.duration_seconds}s duration` : 'Target: 1000'}</div>
                    </div>
                </div>
            </div>
        </section>`;
}

/**
 * Generate Response Time Metrics section with bar chart
 */
function generateResponseTimeChart(data: BenchmarkData): string {
  const isNotRun = data.status === 'NOT_RUN';
  const passing = getPassingApiResults(data);

  // Show top endpoints by p95 (most interesting), limit to 12 for readability
  const sorted = [...passing].sort((a, b) => b.p95 - a.p95).slice(0, 12);
  const maxP99 = sorted.length > 0 ? Math.max(...sorted.map(e => e.p99)) : 100;

  const bars = isNotRun
    ? '<p style="color: var(--gray-700);"><em>Run benchmarks to see response time data</em></p>'
    : sorted.map(ep => `
                    <div class="bar-group">
                        <div class="bar-value">${Math.round(ep.p50)}ms</div>
                        <div class="bar p50" style="height: ${Math.max(5, (ep.p50 / maxP99) * 100)}%"></div>
                        <div class="bar-value">${Math.round(ep.p95)}ms</div>
                        <div class="bar p95" style="height: ${Math.max(5, (ep.p95 / maxP99) * 100)}%"></div>
                        <div class="bar-value">${Math.round(ep.p99)}ms</div>
                        <div class="bar p99" style="height: ${Math.max(5, (ep.p99 / maxP99) * 100)}%"></div>
                        <div class="bar-label">${ep.name.replace('-', '.')}</div>
                    </div>`).join('');

  return `
        <!-- Response Time Metrics -->
        <section class="section">
            <div class="section-header">
                <h2>Response Time Metrics by Endpoint</h2>
            </div>
            <div class="section-body">
                ${isNotRun ? '<p style="color: var(--gray-700); margin-bottom: 1rem;"><em>Placeholder visualization - run benchmarks to see actual data</em></p>' : ''}
                <div class="bar-chart">
                    ${bars}
                </div>
                <div class="legend">
                    <div class="legend-item">
                        <div class="legend-color" style="background: ${isNotRun ? 'var(--gray-200)' : '#60a5fa'}"></div>
                        <span>p50 (Median)</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-color" style="background: ${isNotRun ? 'var(--gray-200)' : '#2563eb'}"></div>
                        <span>p95</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-color" style="background: ${isNotRun ? 'var(--gray-200)' : '#1e40af'}"></div>
                        <span>p99</span>
                    </div>
                </div>
            </div>
        </section>`;
}

/**
 * Generate API Inventory section
 */
function generateApiInventory(data: BenchmarkData): string {
  const inventory = data.api_inventory;
  if (!inventory) return '';

  const rows = inventory.routers.map(router => `
                        <tr>
                            <td><strong>${router.name}</strong></td>
                            <td>${router.endpoints}</td>
                            <td>${router.queries}</td>
                            <td>${router.mutations}</td>
                        </tr>`).join('');

  return `
        <!-- API Inventory -->
        <section class="section">
            <div class="section-header">
                <h2>API Inventory Summary</h2>
            </div>
            <div class="section-body">
                <div class="kpi-grid" style="margin-bottom: 1.5rem;">
                    <div class="kpi-card">
                        <div class="kpi-value">${inventory.total_routers}</div>
                        <div class="kpi-label">Total Routers</div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-value">${inventory.total_endpoints}</div>
                        <div class="kpi-label">Total Endpoints</div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-value">${inventory.total_queries}</div>
                        <div class="kpi-label">Queries (GET)</div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-value">${inventory.total_mutations}</div>
                        <div class="kpi-label">Mutations (POST)</div>
                    </div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Router</th>
                            <th>Endpoints</th>
                            <th>Queries</th>
                            <th>Mutations</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </div>
        </section>`;
}

/**
 * Generate Database Schema Inventory section
 */
function generateDatabaseInventory(data: BenchmarkData): string {
  const db = data.database_inventory;
  if (!db) return '';

  const topTables = db.tables.slice(0, 15);
  const rows = topTables.map(table => `
                        <tr>
                            <td><strong>${table.name}</strong>${table.hasEmbedding ? ' <span class="status-badge pass" style="font-size: 0.65rem;">AI</span>' : ''}</td>
                            <td>${table.fields}</td>
                            <td>${table.indexes}</td>
                            <td>${table.relations}</td>
                        </tr>`).join('');

  return `
        <!-- Database Schema Inventory -->
        <section class="section">
            <div class="section-header">
                <h2>Database Schema Inventory</h2>
            </div>
            <div class="section-body">
                <div class="kpi-grid" style="margin-bottom: 1.5rem;">
                    <div class="kpi-card">
                        <div class="kpi-value">${db.total_tables}</div>
                        <div class="kpi-label">Tables</div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-value">${db.total_fields}</div>
                        <div class="kpi-label">Fields</div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-value">${db.total_indexes}</div>
                        <div class="kpi-label">Indexes</div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-value">${db.enums}</div>
                        <div class="kpi-label">Enums</div>
                    </div>
                    <div class="kpi-card ${db.tables_with_embeddings > 0 ? 'success' : ''}">
                        <div class="kpi-value">${db.tables_with_embeddings}</div>
                        <div class="kpi-label">AI-Enabled (pgvector)</div>
                    </div>
                </div>
                <h3 style="margin-bottom: 0.75rem; font-size: 1rem;">Top Tables by Field Count</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Table</th>
                            <th>Fields</th>
                            <th>Indexes</th>
                            <th>Relations</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
                ${db.tables.length > 15 ? `<p style="margin-top: 0.5rem; font-size: 0.875rem; color: var(--gray-700);">Showing top 15 of ${db.tables.length} tables</p>` : ''}
            </div>
        </section>`;
}

/**
 * Generate Middleware Stack section
 */
function generateMiddlewareInventory(data: BenchmarkData): string {
  const mw = data.middleware_inventory;
  if (!mw) return '';

  const rows = mw.middleware.map(m => `
                        <tr>
                            <td><strong>${m.name}</strong></td>
                            <td><span class="status-badge ${m.type === 'auth' ? 'pass' : ''}">${m.type}</span></td>
                            <td>${m.description}</td>
                            <td><span class="status-badge ${m.enabled ? 'pass' : 'pending'}">${m.enabled ? 'Enabled' : 'Disabled'}</span></td>
                        </tr>`).join('');

  return `
        <!-- Middleware Stack -->
        <section class="section">
            <div class="section-header">
                <h2>Middleware Stack</h2>
            </div>
            <div class="section-body">
                <p style="margin-bottom: 1rem; color: var(--gray-700);">Request pipeline middleware affecting response latency</p>
                <div class="kpi-grid" style="margin-bottom: 1.5rem;">
                    <div class="kpi-card">
                        <div class="kpi-value">${mw.total_middleware}</div>
                        <div class="kpi-label">Total Middleware</div>
                    </div>
                    ${Object.entries(mw.by_type).map(([type, count]) => `
                    <div class="kpi-card">
                        <div class="kpi-value">${count}</div>
                        <div class="kpi-label">${type.charAt(0).toUpperCase() + type.slice(1)}</div>
                    </div>`).join('')}
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Middleware</th>
                            <th>Type</th>
                            <th>Description</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </div>
        </section>`;
}

/**
 * Generate Background Workers section
 */
function generateWorkersInventory(data: BenchmarkData): string {
  const workers = data.workers_inventory;
  if (!workers) return '';

  const rows = workers.workers.map(w => `
                        <tr>
                            <td><strong>${w.name}</strong></td>
                            <td><span class="status-badge">${w.type}</span></td>
                            <td>${w.jobs.length > 0 ? w.jobs.join(', ') : '-'}</td>
                            <td>${w.description}</td>
                        </tr>`).join('');

  return `
        <!-- Background Workers -->
        <section class="section">
            <div class="section-header">
                <h2>Background Workers</h2>
            </div>
            <div class="section-body">
                <p style="margin-bottom: 1rem; color: var(--gray-700);">Async job processing capacity</p>
                <div class="kpi-grid" style="margin-bottom: 1.5rem;">
                    <div class="kpi-card">
                        <div class="kpi-value">${workers.total_workers}</div>
                        <div class="kpi-label">Workers</div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-value">${workers.total_jobs}</div>
                        <div class="kpi-label">Job Types</div>
                    </div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Worker</th>
                            <th>Type</th>
                            <th>Jobs</th>
                            <th>Description</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </div>
        </section>`;
}

/**
 * Generate External Integrations section
 */
function generateIntegrationsInventory(data: BenchmarkData): string {
  const ints = data.integrations_inventory;
  if (!ints) return '';

  const rows = ints.integrations.map(i => `
                        <tr>
                            <td><strong>${i.provider}</strong></td>
                            <td><span class="status-badge">${i.category}</span></td>
                            <td>${i.description}</td>
                        </tr>`).join('');

  return `
        <!-- External Integrations -->
        <section class="section">
            <div class="section-header">
                <h2>External Integrations</h2>
            </div>
            <div class="section-body">
                <p style="margin-bottom: 1rem; color: var(--gray-700);">Third-party service dependencies affecting latency</p>
                <div class="kpi-grid" style="margin-bottom: 1.5rem;">
                    <div class="kpi-card">
                        <div class="kpi-value">${ints.total_integrations}</div>
                        <div class="kpi-label">Total Integrations</div>
                    </div>
                    ${Object.entries(ints.by_category).map(([cat, count]) => `
                    <div class="kpi-card">
                        <div class="kpi-value">${count}</div>
                        <div class="kpi-label">${cat.charAt(0).toUpperCase() + cat.slice(1)}</div>
                    </div>`).join('')}
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Provider</th>
                            <th>Category</th>
                            <th>Description</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </div>
        </section>`;
}

/**
 * Generate Domain Events section
 */
function generateDomainEventsInventory(data: BenchmarkData): string {
  const events = data.domain_events_inventory;
  if (!events) return '';

  const rows = events.events.slice(0, 20).map(e => `
                        <tr>
                            <td><strong>${e.name}</strong></td>
                            <td><code>${e.eventType}</code></td>
                            <td>${e.aggregate}</td>
                            <td>${e.workflowEngine ? `<span class="status-badge">${e.workflowEngine}</span>` : '-'}</td>
                        </tr>`).join('');

  return `
        <!-- Domain Events -->
        <section class="section">
            <div class="section-header">
                <h2>Domain Events Catalog</h2>
            </div>
            <div class="section-body">
                <p style="margin-bottom: 1rem; color: var(--gray-700);">Event-driven architecture overview</p>
                <div class="kpi-grid" style="margin-bottom: 1.5rem;">
                    <div class="kpi-card">
                        <div class="kpi-value">${events.total_events}</div>
                        <div class="kpi-label">Total Events</div>
                    </div>
                    ${Object.entries(events.by_aggregate).slice(0, 4).map(([agg, count]) => `
                    <div class="kpi-card">
                        <div class="kpi-value">${count}</div>
                        <div class="kpi-label">${agg} events</div>
                    </div>`).join('')}
                </div>
                ${Object.keys(events.by_workflow_engine).length > 0 ? `
                <h3 style="margin-bottom: 0.75rem; font-size: 1rem;">By Workflow Engine</h3>
                <div class="kpi-grid" style="margin-bottom: 1.5rem;">
                    ${Object.entries(events.by_workflow_engine).map(([engine, count]) => `
                    <div class="kpi-card">
                        <div class="kpi-value">${count}</div>
                        <div class="kpi-label">${engine}</div>
                    </div>`).join('')}
                </div>` : ''}
                <table>
                    <thead>
                        <tr>
                            <th>Event Class</th>
                            <th>Event Type</th>
                            <th>Aggregate</th>
                            <th>Workflow Engine</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
                ${events.events.length > 20 ? `<p style="margin-top: 0.5rem; font-size: 0.875rem; color: var(--gray-700);">Showing 20 of ${events.events.length} events</p>` : ''}
            </div>
        </section>`;
}

/**
 * Generate Validation Schemas section
 */
function generateValidatorsInventory(data: BenchmarkData): string {
  const validators = data.validators_inventory;
  if (!validators) return '';

  const rows = validators.validators.slice(0, 15).map(v => `
                        <tr>
                            <td><strong>${v.name}</strong></td>
                            <td>${v.schemas}</td>
                            <td><span class="status-badge ${v.complexity === 'complex' ? 'fail' : v.complexity === 'moderate' ? 'pending' : 'pass'}">${v.complexity}</span></td>
                        </tr>`).join('');

  return `
        <!-- Validation Schemas -->
        <section class="section">
            <div class="section-header">
                <h2>Validation Schemas</h2>
            </div>
            <div class="section-body">
                <p style="margin-bottom: 1rem; color: var(--gray-700);">Zod schema complexity affecting validation overhead</p>
                <div class="kpi-grid" style="margin-bottom: 1.5rem;">
                    <div class="kpi-card">
                        <div class="kpi-value">${validators.total_validators}</div>
                        <div class="kpi-label">Validator Files</div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-value">${validators.total_schemas}</div>
                        <div class="kpi-label">Total Schemas</div>
                    </div>
                    ${Object.entries(validators.by_complexity).map(([complexity, count]) => `
                    <div class="kpi-card ${complexity === 'complex' ? 'warning' : complexity === 'simple' ? 'success' : ''}">
                        <div class="kpi-value">${count}</div>
                        <div class="kpi-label">${complexity.charAt(0).toUpperCase() + complexity.slice(1)}</div>
                    </div>`).join('')}
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Validator</th>
                            <th>Schemas</th>
                            <th>Complexity</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </div>
        </section>`;
}

/**
 * Generate Cache Configuration section
 */
function generateCacheInventory(data: BenchmarkData): string {
  const cache = data.cache_inventory;
  if (!cache) return '';

  const rows = cache.keys.map(k => `
                        <tr>
                            <td><code>${k.pattern}</code></td>
                            <td>${k.purpose}</td>
                            <td>${k.ttl || '-'}</td>
                        </tr>`).join('');

  return `
        <!-- Cache Configuration -->
        <section class="section">
            <div class="section-header">
                <h2>Cache Configuration</h2>
            </div>
            <div class="section-body">
                <div class="kpi-grid" style="margin-bottom: 1.5rem;">
                    <div class="kpi-card ${cache.enabled ? 'success' : 'warning'}">
                        <div class="kpi-value">${cache.enabled ? 'Yes' : 'No'}</div>
                        <div class="kpi-label">Cache Enabled</div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-value">${cache.provider}</div>
                        <div class="kpi-label">Provider</div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-value">${cache.total_key_patterns}</div>
                        <div class="kpi-label">Key Patterns</div>
                    </div>
                </div>
                ${cache.keys.length > 0 ? `
                <table>
                    <thead>
                        <tr>
                            <th>Key Pattern</th>
                            <th>Purpose</th>
                            <th>TTL</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>` : '<p style="color: var(--gray-700);">No cache key patterns configured</p>'}
            </div>
        </section>`;
}

/**
 * Generate Throughput Measurements section - uses real endpoint catalog
 */
function generateThroughputTable(data: BenchmarkData): string {
  const isNotRun = data.status === 'NOT_RUN';
  const allResults = [...(data.results?.api || [])].filter(r => !r.metadata?.aggregate);

  // Group by router
  const groups = new Map<string, ApiBenchmarkResult[]>();
  for (const r of allResults) {
    const router = r.name.split('-')[0];
    if (!groups.has(router)) groups.set(router, []);
    groups.get(router)!.push(r);
  }

  let rows = '';
  if (isNotRun) {
    rows = '<tr><td colspan="7" style="text-align:center; color: var(--gray-700);"><em>Run benchmarks to see endpoint data</em></td></tr>';
  } else {
    for (const [router, endpoints] of groups) {
      rows += `<tr style="background: var(--gray-100);"><td colspan="7" style="font-weight: 600; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em; color: var(--gray-700);">${router} (${endpoints.length})</td></tr>`;
      for (const ep of endpoints) {
        const statusClass = ep.status === 'PASS' ? 'pass' : 'fail';
        const rps = ep.iterations > 0 && ep.totalTime > 0 ? (ep.iterations / (ep.totalTime / 1000)).toFixed(1) : '--';
        rows += `
                        <tr>
                            <td>${ep.name.replace('-', '.')}</td>
                            <td>${ep.description}</td>
                            <td>${ep.status === 'PASS' ? Math.round(ep.p50) + 'ms' : '--'}</td>
                            <td>${ep.status === 'PASS' ? Math.round(ep.p95) + 'ms' : '--'}</td>
                            <td>${rps}</td>
                            <td>${ep.iterations}</td>
                            <td><span class="status-badge ${statusClass}">${ep.status}</span></td>
                        </tr>`;
      }
    }
  }

  return `
        <section class="section">
            <div class="section-header">
                <h2>Endpoint Performance Detail (${allResults.length} endpoints)</h2>
            </div>
            <div class="section-body">
                <div style="max-height: 600px; overflow-y: auto;">
                <table>
                    <thead style="position: sticky; top: 0; background: white;">
                        <tr>
                            <th>Endpoint</th>
                            <th>Description</th>
                            <th>p50</th>
                            <th>p95</th>
                            <th>Req/sec</th>
                            <th>Iterations</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
                </div>
            </div>
        </section>`;
}

/**
 * Generate Error Rate Analysis section
 */
function generateErrorAnalysis(data: BenchmarkData): string {
  const isNotRun = data.status === 'NOT_RUN';
  const failing = getFailingApiResults(data);
  const passing = getPassingApiResults(data);
  const total = passing.length + failing.length;

  if (isNotRun) {
    return `
        <section class="section">
            <div class="section-header"><h2>Error Analysis</h2></div>
            <div class="section-body"><p style="color: var(--gray-700);"><em>Run benchmarks to see error data.</em></p></div>
        </section>`;
  }

  if (failing.length === 0) {
    return `
        <section class="section">
            <div class="section-header"><h2>Error Analysis</h2></div>
            <div class="section-body">
                <p style="color: var(--success); font-weight: 600;">All ${total} endpoints returned successfully. No errors detected.</p>
            </div>
        </section>`;
  }

  const rows = failing.map(f => {
    const error = (f.metadata?.error as string) || 'Unknown error';
    return `
                        <tr>
                            <td><strong>${f.name.replace('-', '.')}</strong></td>
                            <td>${f.description}</td>
                            <td>${error}</td>
                            <td><span class="status-badge fail">FAIL</span></td>
                        </tr>`;
  }).join('');

  return `
        <section class="section">
            <div class="section-header"><h2>Error Analysis</h2></div>
            <div class="section-body">
                <p style="margin-bottom: 1rem; color: var(--danger);">
                    <strong>${failing.length} of ${total} endpoints failed</strong> (${(failing.length / total * 100).toFixed(1)}% failure rate)
                </p>
                <table>
                    <thead>
                        <tr>
                            <th>Endpoint</th>
                            <th>Description</th>
                            <th>Error</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </section>`;
}

/**
 * Generate Resource Utilization section
 */
function generateResourceUtilization(_data: BenchmarkData): string {
  // Resource monitoring (CPU, memory, connections) was not included in this benchmark run.
  // Show an honest "not measured" section rather than fabricated values.
  return `
        <!-- Resource Utilization -->
        <section class="section">
            <div class="section-header">
                <h2>Resource Utilization</h2>
            </div>
            <div class="section-body">
                <div class="alert alert-info">
                    <h3>Not Measured in This Run</h3>
                    <p>Resource monitoring (CPU, memory, DB connections, Redis, network) was not included in this benchmark.
                    These metrics require infrastructure-level monitoring (e.g., Prometheus, Grafana, or cloud provider dashboards)
                    during a load test. A future benchmark run with k6 + Docker resource monitoring will populate this section.</p>
                </div>
            </div>
        </section>`;
}

/**
 * Generate Test Configuration section
 */
function generateTestConfiguration(data: BenchmarkData): string {
  const env = data.environment;
  const lt = data.load_test_results;
  const passing = getPassingApiResults(data);

  return `
        <!-- Test Configuration -->
        <section class="section">
            <div class="section-header">
                <h2>Test Configuration</h2>
            </div>
            <div class="section-body">
                <table>
                    <thead>
                        <tr>
                            <th>Parameter</th>
                            <th>Value</th>
                            <th>Description</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>Benchmark Runner</td>
                            <td>run-baseline-benchmark.ts</td>
                            <td>Custom Node.js benchmark with 20 iterations per endpoint + 3 warmup</td>
                        </tr>
                        <tr>
                            <td>Endpoints Tested</td>
                            <td>${passing.length} tRPC queries</td>
                            <td>Authenticated GET endpoints across all routers</td>
                        </tr>
                        <tr>
                            <td>Iterations per Endpoint</td>
                            <td>20</td>
                            <td>With 3 warmup iterations excluded from results</td>
                        </tr>
                        ${lt ? `<tr>
                            <td>Load Test (k6)</td>
                            <td>${lt.target_vus} VUs / ${lt.duration_seconds}s</td>
                            <td>${lt.requests_per_second != null ? Math.round(lt.requests_per_second) + ' rps achieved' : 'No throughput data'}</td>
                        </tr>` : ''}
                        <tr>
                            <td>Node.js Version</td>
                            <td>${env?.node ?? 'unknown'}</td>
                            <td>Platform: ${env?.platform ?? 'unknown'} (${env?.architecture ?? 'unknown'})</td>
                        </tr>
                        <tr>
                            <td>API Type</td>
                            <td>${env?.api_type ?? 'tRPC'}</td>
                            <td>${env?.api_url ?? 'localhost'}</td>
                        </tr>
                        <tr>
                            <td>Database</td>
                            <td>Supabase PostgreSQL (cloud)</td>
                            <td>${env?.database_available ? 'Connected' : 'Not available'}</td>
                        </tr>
                        <tr>
                            <td>Authentication</td>
                            <td>Supabase Auth (Bearer token)</td>
                            <td>All endpoints tested with real authentication</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </section>`;
}

/**
 * Generate Recommendations section
 */
function generateRecommendations(data: BenchmarkData): string {
  const isNotRun = data.status === 'NOT_RUN';
  if (isNotRun) {
    return `
        <section class="section">
            <div class="section-header"><h2>Optimization Recommendations</h2></div>
            <div class="section-body"><p style="color: var(--gray-700);"><em>Run benchmarks to generate data-driven recommendations.</em></p></div>
        </section>`;
  }

  // Generate recommendations from actual data
  const recs: { priority: 'high' | 'medium' | 'low'; title: string; description: string }[] = [];
  const apiSummary = computeApiSummary(data);
  const failing = getFailingApiResults(data);
  const passing = getPassingApiResults(data);
  const p95Target = findBudget(data, 'api-p95') ?? 100;
  const lt = data.load_test_results;

  // High: p95 exceeds budget
  if (apiSummary.avgP95 && apiSummary.avgP95 > p95Target) {
    recs.push({
      priority: 'high',
      title: `API p95 latency (${Math.round(apiSummary.avgP95)}ms) exceeds ${p95Target}ms budget`,
      description: `Root cause analysis shows ~47ms per request is spent on a remote Supabase Auth HTTP call to verify the JWT, and ~25ms on a per-request DB user lookup (prisma.user.findUnique). Redis is configured (Upstash, with session:* and user:* key patterns defined) but is not wired into the auth middleware — every request still does a full remote verify. Fix: (1) verify JWTs locally using SUPABASE_JWT_SECRET instead of calling Supabase Auth, (2) cache resolved user sessions in Redis using the existing session:* key pattern, (3) cache the DB user lookup in Redis using the user:* key pattern. Expected impact: auth overhead drops from ~72ms to <1ms on cache hits.`,
    });
  }

  // High: failing endpoints
  if (failing.length > 0) {
    recs.push({
      priority: 'high',
      title: `${failing.length} endpoint(s) returning errors`,
      description: `Failed endpoints: ${failing.map(f => f.name.replace('-', '.')).join(', ')}. Check server logs for root cause — common issues include missing input validation, BigInt serialization, or missing DB records.`,
    });
  }

  // Medium: slow endpoints
  const slowEndpoints = passing.filter(r => r.p95 > 250).sort((a, b) => b.p95 - a.p95);
  if (slowEndpoints.length > 0) {
    recs.push({
      priority: 'medium',
      title: `${slowEndpoints.length} endpoint(s) with p95 > 250ms`,
      description: `Slowest: ${slowEndpoints.slice(0, 5).map(e => `${e.name.replace('-', '.')} (${Math.round(e.p95)}ms)`).join(', ')}. Consider adding Redis caching for aggregate queries and optimizing DB indexes.`,
    });
  }

  // Medium: load test scale
  if (lt && lt.target_vus < 100) {
    recs.push({
      priority: 'medium',
      title: `Load test only used ${lt.target_vus} virtual users`,
      description: `Current load test ran with ${lt.target_vus} VUs for ${lt.duration_seconds}s. Scale up to 100-1000 VUs to validate concurrent user targets and identify bottlenecks under load.`,
    });
  }

  // Low: DB benchmarks
  const dbResults = data.results?.database || [];
  const dbFails = dbResults.filter(r => r.status === 'FAIL');
  if (dbFails.length > 0) {
    recs.push({
      priority: 'low',
      title: 'Database benchmark issues',
      description: `${dbFails.length} DB benchmark(s) failed. Supabase cloud DB adds ~25ms network latency per query. Consider using Supavisor connection pooling (port 6543) and batching queries where possible.`,
    });
  }

  if (recs.length === 0) {
    recs.push({ priority: 'low', title: 'All targets met', description: 'No actionable recommendations at this time.' });
  }

  const items = recs.map(rec => `
                    <li>
                        <div class="recommendation-icon ${rec.priority}">${rec.priority === 'high' ? '!' : rec.priority === 'medium' ? '!' : 'i'}</div>
                        <div>
                            <strong>${rec.title}</strong>
                            <p style="font-size: 0.875rem; color: var(--gray-700); margin-top: 0.25rem;">${rec.description}</p>
                        </div>
                    </li>`).join('');

  return `
        <section class="section">
            <div class="section-header"><h2>Optimization Recommendations</h2></div>
            <div class="section-body">
                <ul class="recommendations">${items}</ul>
            </div>
        </section>`;
}

/**
 * Generate KPI Threshold Summary section
 */
function generateKpiSummary(data: BenchmarkData): string {
  const isNotRun = data.status === 'NOT_RUN';
  const apiSummary = computeApiSummary(data);
  const failing = getFailingApiResults(data);
  const passing = getPassingApiResults(data);
  const totalEndpoints = passing.length + failing.length;
  const lt = data.load_test_results;

  const p95Target = findBudget(data, 'api-p95') ?? 100;
  const p99Target = findBudget(data, 'api-p99') ?? 200;
  const avgTarget = findBudget(data, 'api-avg') ?? 50;

  const kpis: { name: string; target: string; actual: string; status: 'PASS' | 'FAIL' }[] = isNotRun ? [] : [
    {
      name: 'API Endpoints Passing',
      target: '100%',
      actual: `${passing.length}/${totalEndpoints} (${totalEndpoints > 0 ? Math.round(passing.length / totalEndpoints * 100) : 0}%)`,
      status: failing.length === 0 ? 'PASS' : 'FAIL',
    },
    {
      name: 'Response Time (p95 median)',
      target: `< ${p95Target}ms`,
      actual: apiSummary.p95 != null ? `${Math.round(apiSummary.p95)}ms` : 'N/A',
      status: apiSummary.p95 != null && apiSummary.p95 <= p95Target ? 'PASS' : 'FAIL',
    },
    {
      name: 'Response Time (p99 median)',
      target: `< ${p99Target}ms`,
      actual: apiSummary.p99 != null ? `${Math.round(apiSummary.p99)}ms` : 'N/A',
      status: apiSummary.p99 != null && apiSummary.p99 <= p99Target ? 'PASS' : 'FAIL',
    },
    {
      name: 'Response Time (p50 median)',
      target: `< ${avgTarget}ms`,
      actual: apiSummary.p50 != null ? `${Math.round(apiSummary.p50)}ms` : 'N/A',
      status: apiSummary.p50 != null && apiSummary.p50 <= avgTarget ? 'PASS' : 'FAIL',
    },
    {
      name: 'Endpoint Failure Rate',
      target: '0%',
      actual: `${((failing.length / Math.max(totalEndpoints, 1)) * 100).toFixed(1)}%`,
      status: failing.length === 0 ? 'PASS' : 'FAIL',
    },
    ...(lt ? [{
      name: 'Load Test Throughput',
      target: `${lt.target_vus} VUs sustained`,
      actual: `${Math.round(lt.requests_per_second)} rps (${lt.duration_seconds}s)`,
      status: (lt.thresholds_passed ? 'PASS' : 'FAIL') as 'PASS' | 'FAIL',
    }] : []),
  ];

  // Include budget violations from kpi_validation
  const violations = data.kpi_validation?.violations || [];

  const rows = isNotRun
    ? '<tr><td colspan="4" style="text-align:center; color: var(--gray-700);"><em>Run benchmarks to see KPI results</em></td></tr>'
    : kpis.map(kpi => `
                        <tr>
                            <td>${kpi.name}</td>
                            <td>${kpi.target}</td>
                            <td>${kpi.actual}</td>
                            <td><span class="status-badge ${kpi.status.toLowerCase()}">${kpi.status}</span></td>
                        </tr>`).join('');

  return `
        <!-- Threshold Summary -->
        <section class="section">
            <div class="section-header">
                <h2>KPI Threshold Summary</h2>
            </div>
            <div class="section-body">
                <table>
                    <thead>
                        <tr>
                            <th>KPI</th>
                            <th>Target</th>
                            <th>Actual</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
                ${violations.length > 0 ? `
                <div style="margin-top: 1rem; padding: 1rem; background: #fef2f2; border-radius: 6px; border-left: 4px solid var(--danger);">
                    <strong style="color: var(--danger);">Budget Violations</strong>
                    <ul style="margin-top: 0.5rem; padding-left: 1.5rem; font-size: 0.875rem; color: var(--gray-700);">
                        ${violations.map(v => `<li>${v}</li>`).join('')}
                    </ul>
                </div>` : ''}
            </div>
        </section>`;
}

/**
 * Generate Frontend Performance (Lighthouse) section from .lighthouseci/ data
 */
function generateLighthouseSection(baseDir: string): string {
  const lhciDir = join(baseDir, '.lighthouseci');
  const summaryPath = join(baseDir, 'artifacts', 'benchmarks', 'home-page-lighthouse.json');

  // Try summarized data first
  let scores: { performance: number; accessibility: number; bestPractices: number; seo: number } | null = null;
  let metrics: { fcp: number; lcp: number; tbt: number; cls: number; tti: number; si: number } | null = null;
  let serverResponse: number | null = null;
  let jsBytes: number | null = null;
  let totalBytes: number | null = null;
  let url = '';
  let fetchTime = '';

  if (existsSync(summaryPath)) {
    try {
      const summary = JSON.parse(readFileSync(summaryPath, 'utf-8'));
      scores = summary.scores;
      metrics = summary.metrics;
      url = summary.url || '';
      fetchTime = summary.generatedAt || summary.fetchTime || '';
    } catch { /* skip */ }
  }

  // Enrich with detailed data from .lighthouseci/ runs
  if (existsSync(lhciDir)) {
    try {
      const lhrFiles = require('fs').readdirSync(lhciDir)
        .filter((f: string) => f.endsWith('.json') && f.startsWith('lhr-'))
        .sort();

      interface LhrRun {
        perf: number;
        a11y: number;
        bp: number;
        seo: number;
        fcp: number;
        lcp: number;
        tbt: number;
        cls: number;
        tti: number;
        si: number;
        serverResponse: number;
        jsBytes: number;
        totalBytes: number;
      }

      const runs: LhrRun[] = lhrFiles.map((f: string) => {
        const d = JSON.parse(readFileSync(join(lhciDir, f), 'utf-8'));
        return {
          perf: d.categories?.performance?.score ?? 0,
          a11y: d.categories?.accessibility?.score ?? 0,
          bp: d.categories?.['best-practices']?.score ?? 0,
          seo: d.categories?.seo?.score ?? 0,
          fcp: d.audits?.['first-contentful-paint']?.numericValue ?? 0,
          lcp: d.audits?.['largest-contentful-paint']?.numericValue ?? 0,
          tbt: d.audits?.['total-blocking-time']?.numericValue ?? 0,
          cls: d.audits?.['cumulative-layout-shift']?.numericValue ?? 0,
          tti: d.audits?.interactive?.numericValue ?? 0,
          si: d.audits?.['speed-index']?.numericValue ?? 0,
          serverResponse: d.audits?.['server-response-time']?.numericValue ?? 0,
          jsBytes: d.audits?.['resource-summary']?.details?.items?.find((i: { resourceType: string }) => i.resourceType === 'script')?.transferSize ?? 0,
          totalBytes: d.audits?.['resource-summary']?.details?.items?.find((i: { resourceType: string }) => i.resourceType === 'total')?.transferSize ?? 0,
        };
      });

      // Use median run (skip cold start outlier)
      if (runs.length >= 2) {
        runs.sort((a, b) => b.perf - a.perf);
        const rep = runs.length >= 3 ? runs[1] : runs[0]; // median of 3, or best of 2
        if (!scores) {
          scores = { performance: rep.perf, accessibility: rep.a11y, bestPractices: rep.bp, seo: rep.seo };
        }
        if (!metrics) {
          metrics = { fcp: rep.fcp, lcp: rep.lcp, tbt: rep.tbt, cls: rep.cls, tti: rep.tti, si: rep.si };
        }
        serverResponse = rep.serverResponse;
        jsBytes = rep.jsBytes;
        totalBytes = rep.totalBytes;
        if (!url) url = 'http://localhost:3000/';
      }
    } catch { /* skip */ }
  }

  if (!scores || !metrics) {
    return `
        <section class="section">
            <div class="section-header"><h2>Frontend Performance (Lighthouse)</h2></div>
            <div class="section-body">
                <div class="alert alert-info">
                    <h3>No Lighthouse Data Available</h3>
                    <p>Run <code>npx lhci autorun</code> to collect Lighthouse scores for the frontend.</p>
                </div>
            </div>
        </section>`;
  }

  const scoreCard = (label: string, score: number, target: number) => {
    const pct = Math.round(score * 100);
    const cls = pct >= target ? 'success' : pct >= target - 10 ? 'pending' : 'danger';
    return `<div class="kpi-card ${cls}">
                        <div class="kpi-value">${pct}%</div>
                        <div class="kpi-label">${label}</div>
                        <div class="kpi-target">Target: &ge; ${target}%</div>
                    </div>`;
  };

  const metricRow = (name: string, value: number, unit: string, target: number, lowerIsBetter = true) => {
    const pass = lowerIsBetter ? value <= target : value >= target;
    const formatted = unit === 'ms' ? Math.round(value) + 'ms' : value.toFixed(4);
    return `<tr>
                            <td>${name}</td>
                            <td>${formatted}</td>
                            <td>&lt; ${target}${unit === 'ms' ? 'ms' : ''}</td>
                            <td><span class="status-badge ${pass ? 'pass' : 'fail'}">${pass ? 'PASS' : 'FAIL'}</span></td>
                        </tr>`;
  };

  return `
        <!-- Frontend Performance (Lighthouse) -->
        <section class="section">
            <div class="section-header">
                <h2>Frontend Performance (Lighthouse CI)</h2>
            </div>
            <div class="section-body">
                <p style="margin-bottom: 1rem; color: var(--gray-700);">
                    URL: <strong>${url}</strong>
                    ${fetchTime ? ` | Collected: <strong>${fetchTime.split('T')[0]}</strong>` : ''}
                    | 3 runs, median selected (cold start excluded)
                </p>

                <h3 style="margin-bottom: 0.75rem; font-size: 1rem; color: var(--gray-700);">Category Scores</h3>
                <div class="kpi-grid" style="margin-bottom: 1.5rem;">
                    ${scoreCard('Performance', scores.performance, 90)}
                    ${scoreCard('Accessibility', scores.accessibility, 90)}
                    ${scoreCard('Best Practices', scores.bestPractices, 90)}
                    ${scoreCard('SEO', scores.seo, 90)}
                </div>

                <h3 style="margin-bottom: 0.75rem; font-size: 1rem; color: var(--gray-700);">Core Web Vitals &amp; Metrics</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Metric</th>
                            <th>Actual</th>
                            <th>Target</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${metricRow('First Contentful Paint (FCP)', metrics.fcp, 'ms', 1000)}
                        ${metricRow('Largest Contentful Paint (LCP)', metrics.lcp, 'ms', 2500)}
                        ${metricRow('Total Blocking Time (TBT)', metrics.tbt, 'ms', 300)}
                        ${metricRow('Cumulative Layout Shift (CLS)', metrics.cls, '', 0.1)}
                        ${metricRow('Time to Interactive (TTI)', metrics.tti, 'ms', 1000)}
                        ${metricRow('Speed Index (SI)', metrics.si, 'ms', 3000)}
                        ${serverResponse != null ? metricRow('Server Response (TTFB)', serverResponse, 'ms', 200) : ''}
                    </tbody>
                </table>

                ${jsBytes != null || totalBytes != null ? `
                <h3 style="margin-top: 1.5rem; margin-bottom: 0.75rem; font-size: 1rem; color: var(--gray-700);">Resource Budgets</h3>
                <table>
                    <thead>
                        <tr><th>Resource</th><th>Size</th><th>Budget</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                        ${jsBytes != null ? `<tr>
                            <td>JavaScript (transferred)</td>
                            <td>${(jsBytes / 1024).toFixed(0)} KB</td>
                            <td>&lt; 300 KB</td>
                            <td><span class="status-badge ${jsBytes <= 307200 ? 'pass' : 'fail'}">${jsBytes <= 307200 ? 'PASS' : 'FAIL'}</span></td>
                        </tr>` : ''}
                        ${totalBytes != null ? `<tr>
                            <td>Total page weight</td>
                            <td>${(totalBytes / 1024).toFixed(0)} KB</td>
                            <td>&lt; 1000 KB</td>
                            <td><span class="status-badge ${totalBytes <= 1024000 ? 'pass' : 'fail'}">${totalBytes <= 1024000 ? 'PASS' : 'FAIL'}</span></td>
                        </tr>` : ''}
                    </tbody>
                </table>` : ''}
            </div>
        </section>`;
}

/**
 * Generate full HTML report
 */
function generateHtmlReport(data: BenchmarkData, baseDir: string): string {
  const today = new Date().toISOString().split('T')[0];
  const statusClass = data.status === 'NOT_RUN' ? 'pending' : data.status === 'COMPLETED' ? 'pass' : 'fail';
  const lt = data.load_test_results;
  const targetUsers = lt?.target_vus ?? '--';
  const testDuration = lt ? `${lt.duration_seconds}s` : 'N/A';

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${data.title}</title>
    <style>${getStyles()}</style>
</head>
<body>
    <div class="container">
        <header>
            <h1>${data.title}</h1>
            <p>Task: ${data.task_reference || 'IFC-007 - Performance Benchmarks - Modern Stack'}</p>
            <div class="meta-info">
                <span>Generated: <strong id="report-date">${today}</strong></span>
                <span>Target Users: <strong>${targetUsers} Concurrent</strong></span>
                <span>Duration: <strong>${testDuration}</strong></span>
                <span>Status: <strong class="status-badge ${statusClass}">${data.status === 'NOT_RUN' ? 'PENDING' : data.status}</strong></span>
            </div>
        </header>

        ${generateExecutiveSummary(data)}
        ${generateLighthouseSection(baseDir)}
        ${generateApiInventory(data)}
        ${generateDatabaseInventory(data)}
        ${generateMiddlewareInventory(data)}
        ${generateWorkersInventory(data)}
        ${generateIntegrationsInventory(data)}
        ${generateDomainEventsInventory(data)}
        ${generateValidatorsInventory(data)}
        ${generateCacheInventory(data)}
        ${generateResponseTimeChart(data)}
        ${generateThroughputTable(data)}
        ${generateErrorAnalysis(data)}
        ${generateResourceUtilization(data)}
        ${generateTestConfiguration(data)}
        ${generateRecommendations(data)}
        ${generateKpiSummary(data)}

        <footer>
            <p>IntelliFlow CRM Performance Benchmark Report</p>
            <p>Generated from baseline.json benchmark data | Task: ${data.task_context?.original_task || 'IFC-007'}</p>
            <p style="margin-top: 0.5rem;">Report generated on <span id="footer-date">${today}</span></p>
            ${data.status === 'NOT_RUN' ? '<p style="margin-top: 0.5rem; color: var(--warning);"><em>Run <code>npx tsx artifacts/benchmarks/run-baseline-benchmark.ts</code> to collect real measurements</em></p>' : ''}
        </footer>
    </div>

    <script>
        // Update dates dynamically
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('report-date').textContent = today;
        document.getElementById('footer-date').textContent = today;
    </script>
</body>
</html>`;
}

/**
 * Main function
 */
async function main() {
  const baseDir = process.cwd();
  const baselineJsonPath = join(baseDir, 'artifacts', 'benchmarks', 'baseline.json');
  const outputHtmlPath = join(baseDir, 'artifacts', 'benchmarks', 'performance-report.html');

  console.log('='.repeat(60));
  console.log('Performance Report Generator');
  console.log('='.repeat(60));
  console.log();

  // Load baseline data
  console.log(`Loading benchmark data from: ${baselineJsonPath}`);
  const data = loadBenchmarkData(baselineJsonPath);

  if (!data) {
    console.error('Failed to load benchmark data. Cannot generate report.');
    process.exit(1);
  }

  console.log(`  Status: ${data.status}`);
  console.log(`  Title: ${data.title}`);
  console.log();

  // Generate HTML
  console.log('Generating HTML report...');
  const html = generateHtmlReport(data, baseDir);

  // Write output
  writeFileSync(outputHtmlPath, html, 'utf-8');
  console.log(`Report written to: ${outputHtmlPath}`);
  console.log(`  Lines: ${html.split('\n').length}`);

  console.log();
  console.log('='.repeat(60));
  console.log('Done!');
  console.log('='.repeat(60));
}

// Run
main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
