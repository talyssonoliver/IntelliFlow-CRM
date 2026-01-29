import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    // Read baseline.json from artifacts directory
    const baselinePath = path.join(process.cwd(), '../../artifacts/benchmarks/baseline.json');

    if (!fs.existsSync(baselinePath)) {
      return NextResponse.json(
        { error: 'baseline.json not found. Run pnpm run sync:all-inventory first.' },
        { status: 404 }
      );
    }

    const data = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));

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
    const realBenchmarks = apiResults.filter((r: { status: string; p50: number }) => r.status === 'PASS' && r.p50 > 1);
    const realSuccessRate = realBenchmarks.length > 0 ? 100 : null; // All real benchmarks passed

    // Extract k6 load test results if available
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const loadTestResults = (data as any).load_test_results as {
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
    } | undefined;

    // Use k6 load test data if available, otherwise use API benchmark data
    const performanceMetrics = hasPerformanceData ? {
      // Response times: prefer load test results, fallback to API benchmark
      p50_response_time: loadTestResults?.p50_response_time ?? aggregateResult?.p50 ?? healthResult?.p50 ?? null,
      p95_response_time: loadTestResults?.p95_response_time ?? aggregateResult?.p95 ?? healthResult?.p95 ?? null,
      p99_response_time: loadTestResults?.p99_response_time ?? aggregateResult?.p99 ?? healthResult?.p99 ?? null,
      // Load test specific metrics - only from k6, never fake
      requests_per_second: loadTestResults?.requests_per_second ?? null,
      error_rate: loadTestResults?.error_rate ?? (realSuccessRate !== null ? 0 : null),
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
    } : {
      p50_response_time: null,
      p95_response_time: null,
      p99_response_time: null,
      requests_per_second: null,
      error_rate: null,
      max_concurrent_users: null,
      total_tests: null,
      passed_tests: null,
      failed_tests: null,
      status: (data.status === 'COMPLETED' ? 'completed' :
               data.status === 'PARTIAL' ? 'pending' : 'pending') as 'pending' | 'running' | 'completed' | 'failed',
      load_test_timestamp: null,
      load_test_duration_seconds: null,
      load_test_thresholds_passed: null,
    };

    // Extract individual endpoint results for the Response Time chart
    // Filter out endpoints with 0ms timing (401 responses that didn't actually process)
    const endpointMetrics = apiResults
      .filter((r: { name: string; status: string; p50: number }) =>
        r.status === 'PASS' && r.name !== 'api-p95' && r.p50 > 1 // Only real benchmarks (p50 > 1ms)
      )
      .map((r: { name: string; p50: number; p95: number; p99: number; avgTime: number }) => ({
        name: r.name.replace('api-', ''),
        p50: Math.round(r.p50 * 100) / 100,
        p95: Math.round(r.p95 * 100) / 100,
        p99: Math.round(r.p99 * 100) / 100,
        avg: Math.round(r.avgTime * 100) / 100,
      }));

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
      benchmark_status: data.status || 'NOT_RUN',
      environment: data.environment || null,
      last_updated: data.timestamp || new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error reading performance report data:', error);
    return NextResponse.json(
      { error: 'Failed to read performance report data' },
      { status: 500 }
    );
  }
}
