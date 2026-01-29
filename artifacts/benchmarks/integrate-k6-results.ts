/**
 * Integrate k6 Load Test Results into baseline.json
 *
 * This script reads k6-latest.json and merges the load test metrics
 * into baseline.json for display in the Performance Report view.
 *
 * Usage:
 *   npx tsx artifacts/benchmarks/integrate-k6-results.ts
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const BASELINE_PATH = join(__dirname, 'baseline.json');
const K6_RESULTS_PATH = join(__dirname, 'k6-latest.json');

interface K6Results {
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
}

interface BaselineData {
  timestamp: string;
  status: string;
  results?: {
    api?: Array<{
      name: string;
      status: string;
      p50: number;
      p95: number;
      p99: number;
      avgTime: number;
    }>;
  };
  load_test_results?: {
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
  };
  api_inventory?: unknown;
  database_inventory?: unknown;
  middleware_inventory?: unknown;
  workers_inventory?: unknown;
  integrations_inventory?: unknown;
  domain_events_inventory?: unknown;
  validators_inventory?: unknown;
  cache_inventory?: unknown;
}

function main() {
  console.log('Integrating k6 load test results into baseline.json...\n');

  // Check if k6 results exist
  if (!existsSync(K6_RESULTS_PATH)) {
    console.error('ERROR: k6-latest.json not found.');
    console.log('Run the k6 load test first:');
    console.log('  k6 run artifacts/misc/k6/scripts/authenticated-load-test.js');
    process.exit(1);
  }

  // Read k6 results
  const k6Results: K6Results = JSON.parse(readFileSync(K6_RESULTS_PATH, 'utf-8'));
  console.log('k6 Results:');
  console.log(`  Timestamp: ${k6Results.timestamp}`);
  console.log(`  Target VUs: ${k6Results.target_vus}`);
  console.log(`  Duration: ${k6Results.duration_seconds}s`);
  console.log(`  Requests/sec: ${k6Results.metrics.requests_per_second?.toFixed(2) || 'N/A'}`);
  console.log(`  Error Rate: ${k6Results.metrics.error_rate.toFixed(2)}%`);
  console.log(`  p50: ${k6Results.metrics.p50_response_time?.toFixed(2) || 'N/A'}ms`);
  console.log(`  p95: ${k6Results.metrics.p95_response_time?.toFixed(2) || 'N/A'}ms`);
  console.log(`  p99: ${k6Results.metrics.p99_response_time?.toFixed(2) || 'N/A'}ms`);
  console.log(`  Thresholds Passed: ${k6Results.thresholds_passed ? 'YES' : 'NO'}\n`);

  // Read existing baseline.json
  let baseline: BaselineData = {
    timestamp: new Date().toISOString(),
    status: 'NOT_RUN',
  };

  if (existsSync(BASELINE_PATH)) {
    baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'));
    console.log('Existing baseline.json found, merging results...');
  } else {
    console.log('No existing baseline.json, creating new file...');
  }

  // Add load test results to baseline
  baseline.load_test_results = {
    timestamp: k6Results.timestamp,
    target_vus: k6Results.target_vus,
    max_concurrent_users: k6Results.target_vus, // VUs = concurrent users
    requests_per_second: k6Results.metrics.requests_per_second,
    error_rate: k6Results.metrics.error_rate,
    p50_response_time: k6Results.metrics.p50_response_time,
    p95_response_time: k6Results.metrics.p95_response_time,
    p99_response_time: k6Results.metrics.p99_response_time,
    duration_seconds: k6Results.duration_seconds,
    thresholds_passed: k6Results.thresholds_passed,
  };

  // Update timestamp
  baseline.timestamp = new Date().toISOString();

  // Write updated baseline
  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2));
  console.log('\nbaseline.json updated successfully!');
  console.log('Refresh the Performance Report page to see load test results.');
}

main();
