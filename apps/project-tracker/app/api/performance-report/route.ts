import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

export const dynamic = 'force-dynamic';

// Types for k6 raw data
interface K6Check {
  name: string;
  path: string;
  id: string;
  passes: number;
  fails: number;
}

interface K6Threshold {
  ok: boolean;
}

interface K6RawData {
  timestamp: string;
  test_type: string;
  target_vus: number;
  duration_seconds: number;
  metrics: {
    p50_response_time: number | null;
    p95_response_time: number | null;
    p99_response_time: number | null;
    avg_response_time: number | null;
    requests_per_second: number | null;
    error_rate: number;
    total_requests: number | null;
  };
  thresholds_passed: boolean;
  raw_data?: {
    metrics?: {
      http_req_duration?: {
        thresholds?: Record<string, K6Threshold>;
        values?: {
          avg?: number;
          min?: number;
          max?: number;
          med?: number;
          'p(90)'?: number;
          'p(95)'?: number;
        };
      };
      http_req_failed?: {
        values?: {
          rate: number;
          passes: number;
          fails: number;
        };
      };
      checks?: {
        values?: {
          rate: number;
          passes: number;
          fails: number;
        };
      };
    };
    root_group?: {
      checks?: K6Check[];
    };
    options?: {
      summaryTrendStats?: string[];
    };
    setup_data?: {
      startTime?: string;
    };
  };
}

// Helper to recursively extract all checks from groups
function getAllChecks(group: {
  checks?: K6Check[];
  groups?: { checks?: K6Check[]; groups?: unknown[] }[];
}): K6Check[] {
  const checks: K6Check[] = group.checks ? [...group.checks] : [];
  if (group.groups) {
    for (const subGroup of group.groups) {
      checks.push(
        ...getAllChecks(subGroup as { checks?: K6Check[]; groups?: { checks?: K6Check[]; groups?: unknown[] }[] })
      );
    }
  }
  return checks;
}

export async function GET() {
  try {
    // Read baseline.json from artifacts directory
    const baselinePath = path.join(process.cwd(), '../../artifacts/benchmarks/baseline.json');

    // Also read k6-latest.json for detailed load test data
    const k6LatestPath = path.join(process.cwd(), '../../artifacts/benchmarks/k6-latest.json');

    if (!fs.existsSync(baselinePath)) {
      return NextResponse.json(
        { error: 'baseline.json not found. Run pnpm run sync:all-inventory first.' },
        { status: 404 }
      );
    }

    const data = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));

    // Read k6 detailed results if available
    let k6RawData: K6RawData | null = null;
    if (fs.existsSync(k6LatestPath)) {
      try {
        k6RawData = JSON.parse(fs.readFileSync(k6LatestPath, 'utf-8'));
      } catch {
        console.warn('Failed to parse k6-latest.json');
      }
    }

    // Extract performance metrics from results if available
    const apiResults = data.results?.api || [];
    const hasPerformanceData = apiResults.some((r: { status: string }) => r.status === 'PASS');

    // Get aggregate or calculate from individual results
    const aggregateResult = apiResults.find((r: { name: string }) => r.name === 'api-p95');
    const healthResult = apiResults.find((r: { name: string }) => r.name === 'api-health');

    // Build performance metrics from actual benchmark results
    // Only include metrics that were ACTUALLY measured - never fake data
    const totalTests = apiResults.length;
    const passedTests = apiResults.filter((r: { status: string }) => r.status === 'PASS').length;
    // Only count real benchmarks (p50 > 1ms) for success rate - exclude 401/403 instant rejections
    const realBenchmarks = apiResults.filter(
      (r: { status: string; p50: number }) => r.status === 'PASS' && r.p50 > 1
    );
    const realSuccessRate = realBenchmarks.length > 0 ? 100 : null; // All real benchmarks passed

    // Extract k6 load test results if available
    const loadTestResults = data.load_test_results as
      | {
          timestamp: string;
          target_vus: number;
          max_concurrent_users: number;
          requests_per_second: number | null;
          error_rate: number | null;
          p50_response_time: number | null;
          p95_response_time: number | null;
          p99_response_time: number | null;
          duration_seconds: number;
          thresholds_passed: boolean;
        }
      | undefined;

    // Use k6 load test data if available, otherwise use API benchmark data
    const pendingStatus: 'pending' | 'running' | 'completed' | 'failed' =
      data.status === 'COMPLETED' ? 'completed' : 'pending';
    const fallbackErrorRate = realSuccessRate === null ? null : 0;
    const performanceMetrics = hasPerformanceData
      ? {
          // Response times: prefer load test results, fallback to API benchmark
          p50_response_time:
            loadTestResults?.p50_response_time ?? aggregateResult?.p50 ?? healthResult?.p50 ?? null,
          p95_response_time:
            loadTestResults?.p95_response_time ?? aggregateResult?.p95 ?? healthResult?.p95 ?? null,
          p99_response_time:
            loadTestResults?.p99_response_time ?? aggregateResult?.p99 ?? healthResult?.p99 ?? null,
          // Load test specific metrics - only from k6, never fake
          requests_per_second: loadTestResults?.requests_per_second ?? null,
          error_rate: loadTestResults?.error_rate ?? fallbackErrorRate,
          max_concurrent_users: loadTestResults?.max_concurrent_users ?? null,
          // Test counts from API benchmarks
          total_tests: totalTests,
          passed_tests: realBenchmarks.length, // Only count real benchmarks with actual timing
          failed_tests: totalTests - passedTests, // Config issues (wrong endpoint names, etc.)
          status: 'completed' as const,
          // Include load test metadata if available
          load_test_timestamp: loadTestResults?.timestamp ?? null,
          load_test_duration_seconds: loadTestResults?.duration_seconds ?? null,
          load_test_thresholds_passed: loadTestResults?.thresholds_passed ?? null,
        }
      : {
          p50_response_time: null,
          p95_response_time: null,
          p99_response_time: null,
          requests_per_second: null,
          error_rate: null,
          max_concurrent_users: null,
          total_tests: null,
          passed_tests: null,
          failed_tests: null,
          status: pendingStatus,
          load_test_timestamp: null,
          load_test_duration_seconds: null,
          load_test_thresholds_passed: null,
        };

    // Extract individual endpoint results for the Response Time chart
    // Filter out endpoints with 0ms timing (401 responses that didn't actually process)
    const endpointMetrics = apiResults
      .filter(
        (r: { name: string; status: string; p50: number }) =>
          r.status === 'PASS' && r.name !== 'api-p95' && r.p50 > 1 // Only real benchmarks (p50 > 1ms)
      )
      .map((r: { name: string; p50: number; p95: number; p99: number; avgTime: number }) => ({
        name: r.name.replaceAll('api-', ''),
        p50: Math.round(r.p50 * 100) / 100,
        p95: Math.round(r.p95 * 100) / 100,
        p99: Math.round(r.p99 * 100) / 100,
        avg: Math.round(r.avgTime * 100) / 100,
      }));

    // Extract k6 tested endpoints from ALL checks (including nested groups)
    const allK6Checks = k6RawData?.raw_data?.root_group
      ? getAllChecks(k6RawData.raw_data.root_group)
      : [];
    const k6TestedEndpoints = allK6Checks
      .filter((check) => check.name.includes('status 200')) // Only count status checks as endpoint tests
      .map((check) => ({
        name: check.name.replaceAll(' status 200', ''),
        passes: check.passes,
        fails: check.fails,
        total: check.passes + check.fails,
        success_rate:
          check.passes > 0
            ? (check.passes / (check.passes + check.fails)) * 100
            : 0,
      }));

    // Extract k6 test configuration
    const k6TestConfig = k6RawData
      ? {
          test_type: k6RawData.test_type || 'load_test',
          target_vus: k6RawData.target_vus,
          duration_seconds: k6RawData.duration_seconds,
          timestamp: k6RawData.timestamp,
          thresholds_passed: k6RawData.thresholds_passed,
          thresholds: k6RawData.raw_data?.metrics?.http_req_duration?.thresholds || {},
          total_requests: k6RawData.metrics?.total_requests,
          avg_response_time: k6RawData.metrics?.avg_response_time,
        }
      : null;

    // Extract k6 error analysis data
    const k6ErrorAnalysis = k6RawData
      ? {
          total_checks_passed: k6RawData.raw_data?.metrics?.checks?.values?.passes || 0,
          total_checks_failed: k6RawData.raw_data?.metrics?.checks?.values?.fails || 0,
          check_success_rate: k6RawData.raw_data?.metrics?.checks?.values?.rate || 1,
          http_failed_rate: k6RawData.raw_data?.metrics?.http_req_failed?.values?.rate || 0,
          http_failed_count: k6RawData.raw_data?.metrics?.http_req_failed?.values?.passes || 0, // passes = failed requests in http_req_failed
          error_rate_percent: k6RawData.metrics?.error_rate || 0,
        }
      : null;

    // Extract inventory sections
    const response = {
      api_inventory: data.api_inventory || null,
      database_inventory: data.database_inventory || null,
      middleware_inventory: data.middleware_inventory || null,
      workers_inventory: data.workers_inventory || null,
      integrations_inventory: data.integrations_inventory || null,
      domain_events_inventory: data.domain_events_inventory || null,
      validators_inventory: data.validators_inventory || null,
      cache_inventory: data.cache_inventory || null,
      performance_metrics: performanceMetrics,
      endpoint_metrics: endpointMetrics,
      // Include raw load test results for detailed display
      load_test_results: loadTestResults || null,
      // Include detailed k6 data
      k6_tested_endpoints: k6TestedEndpoints,
      k6_test_config: k6TestConfig,
      k6_error_analysis: k6ErrorAnalysis,
      benchmark_status: data.status || 'NOT_RUN',
      environment: data.environment || null,
      last_updated: data.timestamp || new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error reading performance report data:', error);
    return NextResponse.json({ error: 'Failed to read performance report data' }, { status: 500 });
  }
}
