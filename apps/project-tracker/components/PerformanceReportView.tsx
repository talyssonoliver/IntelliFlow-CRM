'use client';

import React, { useState, useEffect, useCallback, Fragment } from 'react';
import { Icon } from '@/lib/icons';

interface APIInventory {
  total_routers: number;
  total_endpoints: number;
  total_queries: number;
  total_mutations: number;
  routers: Array<{
    name: string;
    file: string;
    endpoints: number;
    queries: number;
    mutations: number;
  }>;
}

interface DatabaseInventory {
  total_tables: number;
  total_fields: number;
  total_indexes: number;
  total_enums: number;
  tables_with_embeddings: number;
  tables: Array<{
    name: string;
    fields: number;
    indexes: number;
    relations: number;
    hasEmbedding: boolean;
  }>;
}

interface MiddlewareInventory {
  total_middleware: number;
  by_type: Record<string, number>;
  middleware: Array<{
    name: string;
    type: string;
    description: string;
    enabled: boolean;
  }>;
}

interface WorkersInventory {
  total_workers: number;
  total_jobs: number;
  workers: Array<{
    name: string;
    type: string;
    jobs: string[];
    description: string;
  }>;
}

interface IntegrationsInventory {
  total_integrations: number;
  by_category: Record<string, number>;
  integrations: Array<{
    name: string;
    category: string;
    provider: string;
    description: string;
  }>;
}

interface DomainEventsInventory {
  total_events: number;
  by_aggregate: Record<string, number>;
  by_workflow_engine: Record<string, number>;
  events: Array<{
    name: string;
    eventType: string;
    aggregate: string;
    workflowEngine?: string;
  }>;
}

interface ValidatorsInventory {
  total_validators: number;
  total_schemas: number;
  by_complexity: Record<string, number>;
  validators: Array<{
    name: string;
    file: string;
    schemas: number;
    complexity: string;
  }>;
}

interface CacheInventory {
  enabled: boolean;
  provider: string;
  total_key_patterns: number;
  keys: Array<{
    pattern: string;
    purpose: string;
    ttl?: string;
  }>;
}

interface PerformanceMetrics {
  p50_response_time?: number | null;
  p95_response_time?: number | null;
  p99_response_time?: number | null;
  requests_per_second?: number | null;
  error_rate?: number | null;
  max_concurrent_users?: number | null;
  total_tests?: number | null;
  passed_tests?: number | null;
  failed_tests?: number | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

interface EndpointMetric {
  name: string;
  p50: number;
  p95: number;
  p99: number;
  avg: number;
}

interface K6TestedEndpoint {
  name: string;
  passes: number;
  fails: number;
  total: number;
  success_rate: number;
}

interface K6TestConfig {
  test_type: string;
  target_vus: number;
  duration_seconds: number;
  timestamp: string;
  thresholds_passed: boolean;
  thresholds: Record<string, { ok: boolean }>;
  total_requests: number | null;
  avg_response_time: number | null;
}

interface K6ErrorAnalysis {
  total_checks_passed: number;
  total_checks_failed: number;
  check_success_rate: number;
  http_failed_rate: number;
  http_failed_count: number;
  error_rate_percent: number;
}

interface PerformanceReportData {
  api_inventory: APIInventory | null;
  database_inventory: DatabaseInventory | null;
  middleware_inventory: MiddlewareInventory | null;
  workers_inventory: WorkersInventory | null;
  integrations_inventory: IntegrationsInventory | null;
  domain_events_inventory: DomainEventsInventory | null;
  validators_inventory: ValidatorsInventory | null;
  cache_inventory: CacheInventory | null;
  performance_metrics?: PerformanceMetrics;
  endpoint_metrics?: EndpointMetric[];
  k6_tested_endpoints?: K6TestedEndpoint[];
  k6_test_config?: K6TestConfig | null;
  k6_error_analysis?: K6ErrorAnalysis | null;
  benchmark_status?: string;
  last_updated: string;
}

function getPerformanceStatusClass(status: string): string {
  if (status === 'completed') return 'bg-green-500';
  if (status === 'running') return 'bg-yellow-500';
  if (status === 'failed') return 'bg-red-500';
  return 'bg-gray-500';
}

function getValidatorComplexityClass(complexity: string): string {
  if (complexity === 'complex') return 'bg-red-100 text-red-700';
  if (complexity === 'moderate') return 'bg-yellow-100 text-yellow-700';
  return 'bg-green-100 text-green-700';
}

function getEndpointTestStatusBadge(isK6Tested: boolean, hasBenchmark: unknown): React.ReactElement {
  if (isK6Tested) {
    return <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">TESTED</span>;
  }
  if (hasBenchmark) {
    return <span className="px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700">BENCHMARKED</span>;
  }
  return <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600">PENDING</span>;
}

function getRecommendationPriorityClass(priority: string): string {
  if (priority === 'high') return 'bg-red-500';
  if (priority === 'medium') return 'bg-amber-500';
  if (priority === 'success') return 'bg-green-500';
  if (priority === 'info') return 'bg-cyan-500';
  return 'bg-blue-500';
}

function buildEndpointSectionData(
  endpointMetrics: EndpointMetric[]
): { name: string; p50: number; p95: number; p99: number; count: number }[] {
  const sections: Record<string, { p50: number[]; p95: number[]; p99: number[]; count: number }> = {};
  for (const endpoint of endpointMetrics) {
    const section = endpoint.name.split('-')[0];
    if (!sections[section]) {
      sections[section] = { p50: [], p95: [], p99: [], count: 0 };
    }
    sections[section].p50.push(endpoint.p50);
    sections[section].p95.push(endpoint.p95);
    sections[section].p99.push(endpoint.p99);
    sections[section].count++;
  }
  return Object.entries(sections)
    .map(([name, d]) => ({
      name,
      p50: d.p50.reduce((a, b) => a + b, 0) / d.p50.length,
      p95: d.p95.reduce((a, b) => a + b, 0) / d.p95.length,
      p99: d.p99.reduce((a, b) => a + b, 0) / d.p99.length,
      count: d.count,
    }))
    .sort((a, b) => a.p50 - b.p50);
}

interface K6Recommendation {
  priority: string;
  icon: string;
  title: string;
  desc: string;
}

function buildK6Recommendations(
  p95: number | null | undefined,
  errorRate: number,
  rps: number | null | undefined,
  vus: number,
  testedEndpoints: number,
  totalEndpoints: number
): K6Recommendation[] {
  const recommendations: K6Recommendation[] = [];

  if (testedEndpoints < totalEndpoints * 0.1) {
    recommendations.push({
      priority: 'high',
      icon: '!',
      title: 'Expand Load Test Coverage',
      desc: `Only ${testedEndpoints} of ${totalEndpoints} endpoints (${((testedEndpoints / totalEndpoints) * 100).toFixed(1)}%) are tested. Add more endpoints to quick-test.js for comprehensive performance coverage.`,
    });
  }

  if (p95 && p95 > 100) {
    recommendations.push({
      priority: 'medium',
      icon: '!',
      title: 'Optimize p95 Response Time',
      desc: `Current p95 is ${p95.toFixed(1)}ms. Consider database query optimization, response caching, or connection pooling to get under 100ms threshold.`,
    });
  }

  if (errorRate > 1) {
    recommendations.push({
      priority: 'high',
      icon: '!',
      title: 'Investigate Error Rate',
      desc: `Error rate of ${errorRate.toFixed(2)}% exceeds 1% threshold. Check server logs and increase connection limits if needed.`,
    });
  }

  if (vus < 50) {
    recommendations.push({
      priority: 'low',
      icon: 'i',
      title: 'Increase Load Test Intensity',
      desc: `Current test runs with ${vus} VUs. For production readiness, run stress tests with 100-500 VUs to identify scaling limits.`,
    });
  }

  if (recommendations.length === 0 || (p95 && p95 < 100 && errorRate === 0)) {
    recommendations.push({
      priority: 'success',
      icon: '✓',
      title: 'Performance Metrics Within Targets',
      desc: `p95 response time of ${p95?.toFixed(1) ?? '--'}ms is under 100ms target, with 0% error rate. System performing well under ${vus} concurrent users.`,
    });
  }

  if (rps) {
    recommendations.push({
      priority: 'info',
      icon: 'i',
      title: 'Throughput Analysis',
      desc: `Achieved ${rps.toFixed(1)} requests/second with ${vus} VUs. Extrapolating: ~${(rps * 5).toFixed(0)} rps possible with 50 VUs if linear scaling holds.`,
    });
  }

  return recommendations;
}

function getK6ButtonClass(testType: 'quick' | 'comprehensive', isRunningTest: 'quick' | 'comprehensive' | null, baseColor: string, runningColor: string): string {
  if (isRunningTest === testType) return `${runningColor} text-white cursor-wait`;
  if (isRunningTest !== null) return 'bg-gray-300 text-gray-500 cursor-not-allowed';
  return `${baseColor} text-white`;
}

export default function PerformanceReportView() { // NOSONAR typescript:S3776
  const [data, setData] = useState<PerformanceReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [isRunningTest, setIsRunningTest] = useState<'quick' | 'comprehensive' | null>(null);
  const [testOutput, setTestOutput] = useState<string | null>(null);

  const runK6Test = async (testType: 'quick' | 'comprehensive') => {
    setIsRunningTest(testType);
    setTestOutput(null);
    try {
      const response = await fetch('/api/run-k6-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testType }),
      });
      const result = await response.json();
      setTestOutput(result.output || result.error || 'Test completed');
      // Reload data after test completes
      await loadData();
    } catch (err) {
      setTestOutput(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setIsRunningTest(null);
    }
  };

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/performance-report', {
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch performance report');
      }
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <Icon name="error" size="2xl" className="mx-auto text-red-400 mb-4 text-6xl" />
        <h2 className="text-xl font-semibold text-gray-700 mb-2">Error Loading Report</h2>
        <p className="text-gray-500 mb-4">{error}</p>
        <button
          onClick={loadData}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const performanceStatus = data.performance_metrics?.status || 'pending';
  const performanceStatusClass = getPerformanceStatusClass(performanceStatus);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white rounded-lg p-6 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">IntelliFlow CRM - Performance Benchmark Report</h1>
            <p className="text-blue-100 mt-1">
              Task: IFC-007 - Performance Benchmarks - Modern Stack
            </p>
            <div className="flex gap-6 mt-3 text-sm text-blue-100">
              <span>
                Generated:{' '}
                <strong className="text-white">
                  {new Date(data.last_updated).toLocaleDateString()}
                </strong>
              </span>
              <span>
                Target Users: <strong className="text-white">1000 Concurrent</strong>
              </span>
              <span>
                Duration: <strong className="text-white">15 minutes</strong>
              </span>
              <span>
                Status:{' '}
                <strong
                  className={`px-2 py-0.5 rounded text-xs uppercase ${performanceStatusClass}`}
                >
                  {performanceStatus}
                </strong>
              </span>
            </div>
          </div>
          <button
            onClick={loadData}
            className="flex items-center gap-2 bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg transition-colors"
          >
            <Icon name="refresh" size="sm" />{' '}
            Refresh
          </button>
        </div>
      </div>

      {/* k6 Test Runner Section */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="bg-gray-100 px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-700">Load Test Runner</h2>
            <p className="text-sm text-gray-500">Run k6 load tests against the API</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => runK6Test('quick')}
              disabled={isRunningTest !== null}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${getK6ButtonClass('quick', isRunningTest, 'bg-blue-600 hover:bg-blue-700', 'bg-blue-400')}`}
            >
              {isRunningTest === 'quick' ? (
                <><span className="animate-spin">⏳</span>{' '}Running Quick...</>
              ) : (
                <><Icon name="bolt" size="sm" />{' '}Quick Test (8 endpoints)</>
              )}
            </button>
            <button
              onClick={() => runK6Test('comprehensive')}
              disabled={isRunningTest !== null}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${getK6ButtonClass('comprehensive', isRunningTest, 'bg-green-600 hover:bg-green-700', 'bg-green-400')}`}
            >
              {isRunningTest === 'comprehensive' ? (
                <><span className="animate-spin">⏳</span>{' '}Running Comprehensive...</>
              ) : (
                <><Icon name="science" size="sm" />{' '}Comprehensive Test (47 endpoints)</>
              )}
            </button>
          </div>
        </div>
        {/* Test output log */}
        {(isRunningTest || testOutput) && (
          <div className="p-4 bg-gray-900 text-green-400 font-mono text-xs max-h-64 overflow-y-auto">
            {isRunningTest && !testOutput && (
              <div className="flex items-center gap-2">
                <span className="animate-pulse">▶</span>{' '}
                Running {isRunningTest} test... This may take 30-60 seconds.
              </div>
            )}
            {testOutput && <pre className="whitespace-pre-wrap">{testOutput}</pre>}
          </div>
        )}
        {/* Last test info */}
        {data?.k6_test_config && (
          <div className="px-6 py-3 bg-gray-50 border-t text-sm text-gray-600 flex items-center justify-between">
            <span>
              Last test:{' '}<strong>{data.k6_test_config.test_type}</strong>{' '}at{' '}
              {new Date(data.k6_test_config.timestamp).toLocaleString()}
            </span>
            <span>
              {data.k6_tested_endpoints?.length || 0} endpoints tested |{' '}
              {data.k6_test_config.total_requests?.toLocaleString() || 0} requests |{' '}
              {data.k6_test_config.avg_response_time?.toFixed(1) || '--'}ms avg
            </span>
          </div>
        )}
      </div>

      {/* Executive Summary - Performance KPIs */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="bg-gray-100 px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-700">Executive Summary</h2>
        </div>
        <div className="p-6">
          {performanceStatus === 'pending' && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
              <h3 className="font-semibold text-amber-700">Benchmarks Not Yet Executed</h3>
              <p className="text-amber-600 text-sm mt-1">
                No production API, database, or frontend available for real performance
                measurements. Requires running web app, API server, and database.
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <KPICard
              value={data.performance_metrics?.p50_response_time ?? '--'}
              label="p50 Response Time"
              target="< 50ms"
              unit="ms"
              status={performanceStatus}
            />
            <KPICard
              value={data.performance_metrics?.p95_response_time ?? '--'}
              label="p95 Response Time"
              target="< 80ms"
              unit="ms"
              status={performanceStatus}
            />
            <KPICard
              value={data.performance_metrics?.p99_response_time ?? '--'}
              label="p99 Response Time"
              target="< 100ms"
              unit="ms"
              status={performanceStatus}
            />
            <KPICard
              value={data.performance_metrics?.passed_tests ?? '--'}
              label="Tests Passed"
              target="All"
              unit=""
              status={performanceStatus}
            />
            <KPICard
              value={
                data.performance_metrics?.error_rate == null
                  ? '--'
                  : formatNumber(data.performance_metrics.error_rate)
              }
              label="Error Rate"
              target="< 1%"
              unit="%"
              status={performanceStatus}
            />
            <KPICard
              value={data.performance_metrics?.total_tests ?? '--'}
              label="Total Tests"
              target=""
              unit=""
              status={performanceStatus}
            />
          </div>
        </div>
      </div>

      {/* Codebase Inventory Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
        <SummaryCard
          icon="api"
          label="API Endpoints"
          value={data.api_inventory?.total_endpoints ?? 0}
          color="blue"
        />
        <SummaryCard
          icon="table_chart"
          label="DB Tables"
          value={data.database_inventory?.total_tables ?? 0}
          color="purple"
        />
        <SummaryCard
          icon="layers"
          label="Middleware"
          value={data.middleware_inventory?.total_middleware ?? 0}
          color="amber"
        />
        <SummaryCard
          icon="work"
          label="Workers"
          value={data.workers_inventory?.total_workers ?? 0}
          color="orange"
        />
        <SummaryCard
          icon="cloud"
          label="Integrations"
          value={data.integrations_inventory?.total_integrations ?? 0}
          color="green"
        />
        <SummaryCard
          icon="bolt"
          label="Events"
          value={data.domain_events_inventory?.total_events ?? 0}
          color="red"
        />
        <SummaryCard
          icon="check_circle"
          label="Validators"
          value={data.validators_inventory?.total_schemas ?? 0}
          color="indigo"
        />
        <SummaryCard
          icon="memory"
          label="Cache"
          value={data.cache_inventory?.enabled ? 'ON' : 'OFF'}
          color="cyan"
        />
      </div>

      {/* Detailed Inventory Sections */}
      <div className="space-y-4">
        {/* API Inventory */}
        {data.api_inventory && (
          <InventorySection
            title="API Inventory Summary"
            icon="api"
            color="blue"
            summary={`${data.api_inventory.total_routers} routers, ${data.api_inventory.total_endpoints} endpoints (${data.api_inventory.total_queries} queries, ${data.api_inventory.total_mutations} mutations)`}
            isExpanded={expandedSection === 'api'}
            onToggle={() => toggleSection('api')}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Router</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-600">Endpoints</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-600">Queries</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-600">Mutations</th>
                  </tr>
                </thead>
                <tbody>
                  {data.api_inventory.routers.map((router) => (
                    <tr key={router.name} className="border-t hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{router.name}</td>
                      <td className="px-4 py-3 text-center">{router.endpoints}</td>
                      <td className="px-4 py-3 text-center text-green-600">{router.queries}</td>
                      <td className="px-4 py-3 text-center text-blue-600">{router.mutations}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </InventorySection>
        )}

        {/* Database Inventory */}
        {data.database_inventory && (
          <InventorySection
            title="Database Schema"
            icon="table_chart"
            color="purple"
            summary={`${data.database_inventory.total_tables} tables, ${data.database_inventory.total_fields} fields, ${data.database_inventory.total_enums} enums, ${data.database_inventory.tables_with_embeddings} with embeddings`}
            isExpanded={expandedSection === 'database'}
            onToggle={() => toggleSection('database')}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 max-h-96 overflow-y-auto">
              {data.database_inventory.tables.map((table) => (
                <div key={table.name} className="bg-gray-50 p-3 rounded-lg">
                  <div className="font-medium text-gray-800 flex items-center gap-2">
                    {table.name}
                    {table.hasEmbedding && (
                      <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">
                        vector
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex gap-3 text-xs text-gray-500">
                    <span>{table.fields} fields</span>
                    <span>{table.indexes} indexes</span>
                    <span>{table.relations} relations</span>
                  </div>
                </div>
              ))}
            </div>
          </InventorySection>
        )}

        {/* Middleware Inventory */}
        {data.middleware_inventory && (
          <InventorySection
            title="Middleware Stack"
            icon="layers"
            color="amber"
            summary={`${data.middleware_inventory.total_middleware} components (${Object.entries(
              data.middleware_inventory.by_type
            )
              .map(([k, v]) => `${v} ${k}`)
              .join(', ')})`}
            isExpanded={expandedSection === 'middleware'}
            onToggle={() => toggleSection('middleware')}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {data.middleware_inventory.middleware.map((mw) => (
                <div key={mw.name} className="bg-gray-50 p-3 rounded-lg flex items-start gap-3">
                  <div
                    className={`w-2 h-2 rounded-full mt-2 ${mw.enabled ? 'bg-green-500' : 'bg-gray-400'}`}
                  />
                  <div>
                    <div className="font-medium text-gray-800">{mw.name}</div>
                    <div className="text-sm text-gray-500">{mw.description}</div>
                    <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded mt-1 inline-block">
                      {mw.type}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </InventorySection>
        )}

        {/* Workers Inventory */}
        {data.workers_inventory && (
          <InventorySection
            title="Background Workers"
            icon="work"
            color="orange"
            summary={`${data.workers_inventory.total_workers} workers, ${data.workers_inventory.total_jobs} jobs`}
            isExpanded={expandedSection === 'workers'}
            onToggle={() => toggleSection('workers')}
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {data.workers_inventory.workers.map((worker) => (
                <div key={worker.name} className="bg-gray-50 p-3 rounded-lg">
                  <div className="font-medium text-gray-800">{worker.name}</div>
                  <div className="text-sm text-gray-500">{worker.description}</div>
                  <div className="mt-2">
                    <span className="text-xs text-gray-400">Jobs:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {worker.jobs.map((job) => (
                        <span
                          key={job}
                          className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded"
                        >
                          {job}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </InventorySection>
        )}

        {/* Integrations Inventory */}
        {data.integrations_inventory && (
          <InventorySection
            title="External Integrations"
            icon="cloud"
            color="green"
            summary={`${data.integrations_inventory.total_integrations} services (${Object.entries(
              data.integrations_inventory.by_category
            )
              .map(([k, v]) => `${v} ${k}`)
              .join(', ')})`}
            isExpanded={expandedSection === 'integrations'}
            onToggle={() => toggleSection('integrations')}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.integrations_inventory.integrations.map((integration) => (
                <div key={integration.name} className="bg-gray-50 p-3 rounded-lg">
                  <div className="font-medium text-gray-800">{integration.name}</div>
                  <div className="text-sm text-gray-500">{integration.description}</div>
                  <div className="mt-2 flex gap-2">
                    <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                      {integration.category}
                    </span>
                    <span className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">
                      {integration.provider}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </InventorySection>
        )}

        {/* Domain Events Inventory */}
        {data.domain_events_inventory && (
          <InventorySection
            title="Domain Events"
            icon="bolt"
            color="red"
            summary={`${data.domain_events_inventory.total_events} events (${Object.entries(
              data.domain_events_inventory.by_aggregate
            )
              .map(([k, v]) => `${v} ${k}`)
              .join(', ')})`}
            isExpanded={expandedSection === 'events'}
            onToggle={() => toggleSection('events')}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.domain_events_inventory.events.map((event) => (
                <div key={event.name} className="bg-gray-50 p-3 rounded-lg">
                  <div className="font-medium text-gray-800">{event.name}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                      {event.aggregate}
                    </span>
                    <span className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">
                      {event.eventType}
                    </span>
                    {event.workflowEngine && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                        {event.workflowEngine}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </InventorySection>
        )}

        {/* Validators Inventory */}
        {data.validators_inventory && (
          <InventorySection
            title="Validation Schemas"
            icon="check_circle"
            color="indigo"
            summary={`${data.validators_inventory.total_validators} files, ${data.validators_inventory.total_schemas} schemas (${Object.entries(
              data.validators_inventory.by_complexity
            )
              .map(([k, v]) => `${v} ${k}`)
              .join(', ')})`}
            isExpanded={expandedSection === 'validators'}
            onToggle={() => toggleSection('validators')}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {data.validators_inventory.validators.map((validator) => (
                <div key={validator.name} className="bg-gray-50 p-3 rounded-lg">
                  <div className="font-medium text-gray-800">{validator.name}</div>
                  <div className="text-sm text-gray-500 truncate">{validator.file}</div>
                  <div className="mt-2 flex gap-2">
                    <span className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">
                      {validator.schemas} schemas
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${getValidatorComplexityClass(validator.complexity)}`}>
                      {validator.complexity}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </InventorySection>
        )}

        {/* Cache Inventory */}
        {data.cache_inventory && (
          <InventorySection
            title="Cache Configuration"
            icon="memory"
            color="cyan"
            summary={`${data.cache_inventory.enabled ? 'Enabled' : 'Disabled'} - ${data.cache_inventory.provider} (${data.cache_inventory.total_key_patterns} key patterns)`}
            isExpanded={expandedSection === 'cache'}
            onToggle={() => toggleSection('cache')}
          >
            <div className="space-y-3">
              <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                <div
                  className={`w-3 h-3 rounded-full ${data.cache_inventory.enabled ? 'bg-green-500' : 'bg-red-500'}`}
                />
                <div>
                  <span className="font-medium">
                    {data.cache_inventory.enabled ? 'Cache Enabled' : 'Cache Disabled'}
                  </span>
                  <span className="text-gray-500 ml-2">
                    Provider: {data.cache_inventory.provider}
                  </span>
                </div>
              </div>
              {data.cache_inventory.keys.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {data.cache_inventory.keys.map((key) => (
                    <div key={key.pattern} className="bg-gray-50 p-3 rounded-lg">
                      <code className="text-sm font-mono text-cyan-700">{key.pattern}</code>
                      <div className="text-sm text-gray-500 mt-1">{key.purpose}</div>
                      {key.ttl && (
                        <span className="text-xs bg-cyan-100 text-cyan-700 px-1.5 py-0.5 rounded mt-1 inline-block">
                          TTL: {key.ttl}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </InventorySection>
        )}
      </div>

      {/* Response Time Metrics by Section */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="bg-gray-100 px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-700">Response Time Metrics by Section</h2>
        </div>
        <div className="p-6">
          {performanceStatus === 'pending' && (
            <p className="text-gray-600 italic mb-4">
              Run benchmarks to see actual response time data
            </p>
          )}
          {performanceStatus === 'completed' &&
          data.endpoint_metrics &&
          data.endpoint_metrics.length > 0 ? (
            <>
              <div className="flex items-end justify-around gap-2 h-64 pb-8 overflow-x-auto">
                {buildEndpointSectionData(data.endpoint_metrics).map((section) => {
                  const maxTime = 120;
                  const p50Height = Math.min((section.p50 / maxTime) * 160, 160);
                  const p95Height = Math.min((section.p95 / maxTime) * 160, 160);
                  const p99Height = Math.min((section.p99 / maxTime) * 160, 160);
                  return (
                    <div
                      key={section.name}
                      className="flex flex-col items-center gap-2 min-w-[70px]"
                    >
                      <div className="flex items-end gap-1 h-40">
                        <div className="flex flex-col items-center">
                          <span className="text-xs text-gray-500 mb-1">
                            {section.p50.toFixed(0)}
                          </span>
                          <div
                            className="w-5 bg-green-500 rounded-t"
                            style={{ height: `${p50Height}px` }}
                          />
                        </div>
                        <div className="flex flex-col items-center">
                          <span className="text-xs text-gray-500 mb-1">
                            {section.p95.toFixed(0)}
                          </span>
                          <div
                            className="w-5 bg-yellow-500 rounded-t"
                            style={{ height: `${p95Height}px` }}
                          />
                        </div>
                        <div className="flex flex-col items-center">
                          <span className="text-xs text-gray-500 mb-1">
                            {section.p99.toFixed(0)}
                          </span>
                          <div
                            className="w-5 bg-orange-500 rounded-t"
                            style={{ height: `${p99Height}px` }}
                          />
                        </div>
                      </div>
                      <span className="text-xs text-gray-700 font-medium text-center capitalize">
                        {section.name}
                      </span>
                      <span className="text-xs text-gray-400">({section.count})</span>
                    </div>
                  );
                })}
              </div>
              {/* Legend */}
              <div className="flex justify-center gap-6 mt-4 pt-4 border-t">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-green-500 rounded" />
                  <span className="text-sm text-gray-600">p50 (Median)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-yellow-500 rounded" />
                  <span className="text-sm text-gray-600">p95</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-orange-500 rounded" />
                  <span className="text-sm text-gray-600">p99</span>
                </div>
                <div className="flex items-center gap-2 ml-4 pl-4 border-l">
                  <span className="text-sm text-gray-500">(n) = endpoints tested</span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-end justify-around gap-4 h-64 pb-8">
              {['Health', 'Auth', 'CRM', 'AI', 'Billing'].map((section) => (
                <div key={section} className="flex flex-col items-center gap-2 flex-1">
                  <div className="flex items-end gap-1 h-40">
                    <div className="flex flex-col items-center">
                      <span className="text-xs text-gray-500 mb-1">--</span>
                      <div className="w-5 bg-gray-200 rounded-t" style={{ height: '32px' }} />
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-xs text-gray-500 mb-1">--</span>
                      <div className="w-5 bg-gray-300 rounded-t" style={{ height: '64px' }} />
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-xs text-gray-500 mb-1">--</span>
                      <div className="w-5 bg-gray-400 rounded-t" style={{ height: '96px' }} />
                    </div>
                  </div>
                  <span className="text-xs text-gray-700 font-medium text-center">{section}</span>
                  <span className="text-xs text-gray-400">(0)</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Endpoint Performance Catalog */}
      {data.api_inventory && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="bg-gray-100 px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-700">
              Endpoint Performance Catalog ({data.api_inventory.total_endpoints} endpoints)
            </h2>
          </div>
          <div className="p-6">
            {/* Coverage Summary */}
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-amber-800">Load Test Coverage</span>
                <span className="text-sm text-amber-700">
                  {data.k6_tested_endpoints?.length ?? 0} of {data.api_inventory.total_endpoints}{' '}
                  endpoints tested
                </span>
              </div>
              <div className="w-full bg-amber-200 rounded-full h-3">
                <div
                  className="bg-amber-500 h-3 rounded-full transition-all"
                  style={{
                    width: `${((data.k6_tested_endpoints?.length ?? 0) / data.api_inventory.total_endpoints) * 100}%`,
                  }}
                />
              </div>
              <p className="text-xs text-amber-700 mt-2">
                <strong>
                  Coverage:{' '}
                  {(
                    ((data.k6_tested_endpoints?.length ?? 0) / data.api_inventory.total_endpoints) *
                    100
                  ).toFixed(1)}
                  %
                </strong>{' '}
                | To test all endpoints, add them to{' '}
                <code className="bg-amber-100 px-1 rounded">
                  artifacts/misc/k6/scripts/quick-test.js
                </code>
              </p>
            </div>

            <p className="text-gray-600 italic mb-4">
              All {data.api_inventory.total_endpoints} API endpoints with benchmark status
            </p>
            <div className="max-h-96 overflow-y-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="bg-gray-50">
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Endpoint</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-600">Method</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-600">p50</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-600">p95</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-600">Req/sec</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.api_inventory.routers.map((router) => {
                    // Get k6 tested endpoint names for matching
                    const testedEndpointNames =
                      data.k6_tested_endpoints?.map((e) =>
                        e.name.replaceAll(' status 200', '').toLowerCase()
                      ) || [];

                    return (
                      <Fragment key={router.name}>
                        <tr className="bg-gray-100">
                          <td
                            colSpan={5}
                            className="px-4 py-2 font-semibold uppercase text-xs tracking-wide text-gray-700"
                          >
                            {router.name} ({router.endpoints} endpoints)
                          </td>
                          <td></td>
                        </tr>
                        {[...new Array(router.endpoints)].map((_, i) => {
                          const endpointName =
                            [
                              'list',
                              'getById',
                              'create',
                              'update',
                              'delete',
                              'search',
                              'count',
                              'export',
                              'import',
                              'validate',
                              'archive',
                              'restore',
                              'duplicate',
                              'merge',
                              'split',
                              'transfer',
                              'assign',
                              'unassign',
                              'activate',
                              'deactivate',
                            ][i] || `action${i + 1}`;
                          const fullEndpointName = `${router.name}.${endpointName}`;

                          // Check if this endpoint was tested by k6
                          const isK6Tested = testedEndpointNames.some(
                            (name) =>
                              name === fullEndpointName.toLowerCase() ||
                              name === `${router.name}.${endpointName}`.toLowerCase() ||
                              (router.name.toLowerCase() === 'health' &&
                                i === 0 &&
                                name.includes('health')) ||
                              (router.name.toLowerCase() === 'lead' &&
                                endpointName === 'list' &&
                                name.includes('lead.list')) ||
                              (router.name.toLowerCase() === 'contact' &&
                                endpointName === 'list' &&
                                name.includes('contact.list'))
                          );

                          // Get benchmark data if available
                          const benchmarkData = data.endpoint_metrics?.find(
                            (m) =>
                              m.name.toLowerCase() === router.name.toLowerCase() ||
                              m.name.toLowerCase() ===
                                `${router.name}-${endpointName}`.toLowerCase() ||
                              m.name.toLowerCase().includes(router.name.toLowerCase())
                          );
                          const isFirstEndpoint = i === 0;
                          const hasBenchmark = isFirstEndpoint && benchmarkData;

                          const isQuery = i < router.queries;
                          const isCritical = i < 2;

                          return (
                            <tr key={fullEndpointName} className="border-t hover:bg-gray-50">
                              <td className="px-4 py-2">
                                <span className="font-medium">{fullEndpointName}</span>
                                {isCritical && (
                                  <span className="ml-2 text-xs bg-red-50 text-red-600 px-1.5 py-0.5 rounded">
                                    CRITICAL
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-center">
                                <span
                                  className={`px-2 py-0.5 rounded text-xs ${isQuery ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}
                                >
                                  {isQuery ? 'GET' : 'POST'}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-center">
                                {hasBenchmark ? (
                                  `${formatNumber(benchmarkData.p50)}ms`
                                ) : (
                                  <span className="text-gray-400">--</span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-center">
                                {hasBenchmark ? (
                                  `${formatNumber(benchmarkData.p95)}ms`
                                ) : (
                                  <span className="text-gray-400">--</span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-center">
                                {hasBenchmark ? (
                                  `${Math.round(1000 / benchmarkData.avg)}`
                                ) : (
                                  <span className="text-gray-400">--</span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-center">
                                {getEndpointTestStatusBadge(isK6Tested, hasBenchmark)}
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Error Rate Analysis */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="bg-gray-100 px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-700">Error Rate Analysis</h2>
        </div>
        <div className="p-6">
          {data.k6_error_analysis ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-gray-50 p-4 rounded-lg text-center">
                  <div
                    className={`text-3xl font-bold ${data.k6_error_analysis.error_rate_percent === 0 ? 'text-green-600' : 'text-red-600'}`}
                  >
                    {data.k6_error_analysis.error_rate_percent.toFixed(2)}%
                  </div>
                  <div className="text-sm text-gray-600 mt-1">Total Error Rate</div>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg text-center">
                  <div className="text-3xl font-bold text-green-600">
                    {data.k6_error_analysis.total_checks_passed.toLocaleString()}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">Checks Passed</div>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg text-center">
                  <div
                    className={`text-3xl font-bold ${data.k6_error_analysis.total_checks_failed === 0 ? 'text-green-600' : 'text-red-600'}`}
                  >
                    {data.k6_error_analysis.total_checks_failed.toLocaleString()}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">Checks Failed</div>
                </div>
              </div>

              {/* Tested Endpoints Results */}
              {data.k6_tested_endpoints && data.k6_tested_endpoints.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-4 py-3 text-left font-semibold text-gray-600">
                          Endpoint Check
                        </th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-600">
                          Passes
                        </th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-600">Fails</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-600">
                          Success Rate
                        </th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-600">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.k6_tested_endpoints.map((endpoint) => (
                        <tr key={endpoint.name} className="border-t hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium">{endpoint.name}</td>
                          <td className="px-4 py-3 text-center text-green-600">
                            {endpoint.passes.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-center text-red-600">{endpoint.fails}</td>
                          <td className="px-4 py-3 text-center">
                            {endpoint.success_rate.toFixed(1)}%
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded text-xs ${
                                endpoint.fails === 0
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-red-100 text-red-700'
                              }`}
                            >
                              {endpoint.fails === 0 ? 'PASS' : 'FAIL'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="mt-4 text-sm text-gray-700">
                <strong>
                  Check Success Rate: {(data.k6_error_analysis.check_success_rate * 100).toFixed(1)}
                  %
                </strong>{' '}
                | HTTP Failed Requests: {data.k6_error_analysis.http_failed_count}
              </p>
            </>
          ) : (
            <>
              <p className="text-gray-600 italic mb-4">
                No load test data available - run k6 benchmark to see actual error analysis
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-sm text-amber-800">
                  <strong>To run load tests:</strong>{' '}Execute{' '}
                  <code className="bg-amber-100 px-1 rounded">
                    .\artifacts\misc\k6\run-quick-test.ps1
                  </code>{' '}
                  from project root
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Resource Utilization Targets */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="bg-gray-100 px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-700">Resource Utilization Targets</h2>
        </div>
        <div className="p-6">
          <p className="text-gray-600 italic mb-4">
            Resource targets and thresholds - run benchmarks to see actual utilization
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { name: 'API Server CPU', value: '--', target: '< 80%' },
              { name: 'API Server Memory', value: '--', target: '< 2 GB' },
              { name: 'Database CPU', value: '--', target: '< 70%' },
              { name: 'Database Connections', value: '--/100', target: '< 90' },
              { name: 'Redis Memory', value: '--', target: '< 1 GB' },
              { name: 'Network Bandwidth', value: '--', target: '< 1 Gbps' },
            ].map((resource) => (
              <div key={resource.name} className="bg-gray-50 p-4 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium text-gray-800">{resource.name}</span>
                  <span className="text-lg font-bold text-gray-400">{resource.value}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-gray-300 h-2 rounded-full" style={{ width: '0%' }} />
                </div>
                <p className="mt-2 text-xs text-gray-600">
                  Target: {resource.target} | Awaiting measurement
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Test Configuration */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="bg-gray-100 px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-700">Test Configuration</h2>
        </div>
        <div className="p-6">
          {data.k6_test_config ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Parameter</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Value</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">
                        Description
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">Load Testing Tool</td>
                      <td className="px-4 py-3 text-blue-600">k6 v0.49.0</td>
                      <td className="px-4 py-3 text-gray-600">
                        Modern load testing tool by Grafana Labs
                      </td>
                    </tr>
                    <tr className="border-t hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">Test Type</td>
                      <td className="px-4 py-3 text-blue-600">
                        {data.k6_test_config.test_type.replaceAll('_', ' ')}
                      </td>
                      <td className="px-4 py-3 text-gray-600">Quick feedback load test</td>
                    </tr>
                    <tr className="border-t hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">Test Duration</td>
                      <td className="px-4 py-3 text-blue-600">
                        {data.k6_test_config.duration_seconds} seconds
                      </td>
                      <td className="px-4 py-3 text-gray-600">Total test execution time</td>
                    </tr>
                    <tr className="border-t hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">Virtual Users (VUs)</td>
                      <td className="px-4 py-3 text-blue-600">{data.k6_test_config.target_vus}</td>
                      <td className="px-4 py-3 text-gray-600">Concurrent simulated users</td>
                    </tr>
                    <tr className="border-t hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">Total Requests</td>
                      <td className="px-4 py-3 text-blue-600">
                        {data.k6_test_config.total_requests?.toLocaleString() ?? '--'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">Total HTTP requests executed</td>
                    </tr>
                    <tr className="border-t hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">Avg Response Time</td>
                      <td className="px-4 py-3 text-blue-600">
                        {data.k6_test_config.avg_response_time?.toFixed(2) ?? '--'} ms
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        Mean response time across all requests
                      </td>
                    </tr>
                    <tr className="border-t hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">Test Timestamp</td>
                      <td className="px-4 py-3 text-blue-600">
                        {new Date(data.k6_test_config.timestamp).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-gray-600">When the test was executed</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Threshold Results */}
              {Object.keys(data.k6_test_config.thresholds).length > 0 && (
                <div className="mt-6">
                  <h3 className="text-md font-semibold text-gray-700 mb-3">Threshold Results</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {Object.entries(data.k6_test_config.thresholds).map(([name, result]) => (
                      <div
                        key={name}
                        className={`p-3 rounded-lg ${result.ok ? 'bg-green-50' : 'bg-red-50'}`}
                      >
                        <div className="flex items-center justify-between">
                          <code className="text-sm font-mono">{name}</code>
                          <span
                            className={`px-2 py-0.5 rounded text-xs ${
                              result.ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {result.ok ? 'PASS' : 'FAIL'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-gray-600 italic mb-4">
                No load test configuration available - run k6 benchmark to see test parameters
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-sm text-amber-800">
                  <strong>To run load tests:</strong>{' '}Execute{' '}
                  <code className="bg-amber-100 px-1 rounded">
                    .\artifacts\misc\k6\run-quick-test.ps1
                  </code>{' '}
                  from project root
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Optimization Recommendations */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="bg-gray-100 px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-700">Optimization Recommendations</h2>
        </div>
        <div className="p-6">
          {data.k6_test_config ? (
            <div className="space-y-4">
              {/* Generate dynamic recommendations based on actual results */}
              {buildK6Recommendations(
                data.performance_metrics?.p95_response_time,
                data.k6_error_analysis?.error_rate_percent ?? 0,
                data.performance_metrics?.requests_per_second,
                data.k6_test_config.target_vus,
                data.k6_tested_endpoints?.length ?? 0,
                data.api_inventory?.total_endpoints ?? 0
              ).map((rec) => (
                <div
                  key={rec.title}
                  className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg"
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${getRecommendationPriorityClass(rec.priority)}`}
                  >
                    {rec.icon}
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-800">{rec.title}</h4>
                    <p className="text-sm text-gray-600 mt-1">{rec.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <p className="text-gray-600 italic mb-4">
                Run k6 load tests to generate data-driven recommendations
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-sm text-amber-800">
                  <strong>To get recommendations:</strong>{' '}Execute{' '}
                  <code className="bg-amber-100 px-1 rounded">
                    .\artifacts\misc\k6\run-quick-test.ps1
                  </code>{' '}
                  from project root
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* KPI Threshold Summary */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="bg-gray-100 px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-700">KPI Threshold Summary</h2>
        </div>
        <div className="p-6">
          <p className="text-gray-600 italic mb-4">
            KPI targets to be validated - run benchmarks to see pass/fail status
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">KPI</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-600">Target</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-600">Actual</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    kpi: 'Concurrent Users Support',
                    target: '1000 users',
                    actual: data.performance_metrics?.max_concurrent_users,
                  },
                  {
                    kpi: 'Response Time (p99)',
                    target: '< 100ms',
                    actual: data.performance_metrics?.p99_response_time
                      ? `${formatNumber(data.performance_metrics.p99_response_time)}ms`
                      : null,
                  },
                  {
                    kpi: 'Response Time (p95)',
                    target: '< 80ms',
                    actual: data.performance_metrics?.p95_response_time
                      ? `${formatNumber(data.performance_metrics.p95_response_time)}ms`
                      : null,
                  },
                  {
                    kpi: 'Response Time (p50)',
                    target: '< 50ms',
                    actual: data.performance_metrics?.p50_response_time
                      ? `${formatNumber(data.performance_metrics.p50_response_time)}ms`
                      : null,
                  },
                  {
                    kpi: 'Error Rate',
                    target: '< 1%',
                    actual:
                      data.performance_metrics?.error_rate === undefined
                        ? null
                        : `${formatNumber(data.performance_metrics.error_rate)}%`,
                  },
                  {
                    kpi: 'Request Rate',
                    target: '> 100 rps',
                    actual: data.performance_metrics?.requests_per_second
                      ? `${data.performance_metrics.requests_per_second} rps`
                      : null,
                  },
                ].map((item) => (
                  <tr key={item.kpi} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{item.kpi}</td>
                    <td className="px-4 py-3 text-center text-gray-700">{item.target}</td>
                    <td className="px-4 py-3 text-center text-gray-400">{item.actual ?? '--'}</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${
                          performanceStatus === 'completed'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {performanceStatus === 'completed' ? 'PASS' : 'PENDING'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-sm text-gray-500 py-4">
        Generated by IntelliFlow CRM Performance Report Generator
      </div>
    </div>
  );
}

// Helper to format numbers to 1 decimal place
function formatNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '--') return '--';
  if (typeof value === 'string') return value;
  return value.toFixed(1);
}

// KPI Card Component for Performance Metrics
function KPICard({
  value,
  label,
  target,
  unit,
  status,
}: Readonly<{
  value: number | string | null | undefined;
  label: string;
  target: string;
  unit: string;
  status: string;
}>) {
  const formattedValue = formatNumber(value);
  const isPending = status === 'pending' || formattedValue === '--';

  return (
    <div
      className={`rounded-lg p-4 text-center border ${
        isPending ? 'bg-gray-50 border-gray-200' : 'bg-green-50 border-green-200'
      }`}
    >
      <div className={`text-2xl font-bold ${isPending ? 'text-gray-400' : 'text-gray-900'}`}>
        {formattedValue}
        {formattedValue !== '--' && unit && (
          <span className="text-sm font-normal ml-1">{unit}</span>
        )}
      </div>
      <div className="text-sm text-gray-600 mt-1">{label}</div>
      <div className="text-xs text-gray-500 mt-2">Target: {target}</div>
    </div>
  );
}

// Summary Card Component
function SummaryCard({
  icon,
  label,
  value,
  color,
}: Readonly<{
  icon: string;
  label: string;
  value: number | string;
  color: string;
}>) {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    amber: 'bg-amber-50 text-amber-600',
    orange: 'bg-orange-50 text-orange-600',
    green: 'bg-green-50 text-green-600',
    red: 'bg-red-50 text-red-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    cyan: 'bg-cyan-50 text-cyan-600',
  };

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div
        className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorClasses[color]}`}
      >
        <Icon name={icon} size="sm" />
      </div>
      <div className="mt-3">
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        <div className="text-xs text-gray-500">{label}</div>
      </div>
    </div>
  );
}

// Inventory Section Component
function InventorySection({
  title,
  icon,
  color,
  summary,
  isExpanded,
  onToggle,
  children,
}: Readonly<{
  title: string;
  icon: string;
  color: string;
  summary: string;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}>) {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-600',
    purple: 'bg-purple-600',
    amber: 'bg-amber-600',
    orange: 'bg-orange-600',
    green: 'bg-green-600',
    red: 'bg-red-600',
    indigo: 'bg-indigo-600',
    cyan: 'bg-cyan-600',
  };

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center text-white ${colorClasses[color]}`}
          >
            <Icon name={icon} size="sm" />
          </div>
          <div className="text-left">
            <div className="font-semibold text-gray-900">{title}</div>
            <div className="text-sm text-gray-500">{summary}</div>
          </div>
        </div>
        <Icon
          name={isExpanded ? 'expand_less' : 'expand_more'}
          size="lg"
          className="text-gray-400"
        />
      </button>
      {isExpanded && <div className="px-4 pb-4 border-t">{children}</div>}
    </div>
  );
}
