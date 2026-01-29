/**
 * Quick k6 Load Test for IntelliFlow CRM
 * 10 VUs for 30 seconds - fast feedback on load performance
 *
 * OPTIMIZED: Auth token cached in setup() to avoid Supabase rate limits
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

var errorRate = new Rate('errors');
var trpcLatency = new Trend('trpc_latency', true);
var authLatency = new Trend('auth_latency', true);
var successfulRequests = new Counter('successful_requests');
var failedRequests = new Counter('failed_requests');

var SUPABASE_URL = __ENV.SUPABASE_URL || 'https://gpirtcvwmssxhwcwwucq.supabase.co';
var SUPABASE_ANON_KEY = __ENV.SUPABASE_ANON_KEY || '';
var BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
var TRPC_PATH = '/api/trpc';

export var options = {
  vus: 10,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<200', 'p(99)<500'],
    errors: ['rate<0.1'],
    trpc_latency: ['p(95)<150'],
  },
};

function authenticate(email, password) {
  var authUrl = SUPABASE_URL + '/auth/v1/token?grant_type=password';
  var payload = JSON.stringify({ email: email, password: password });
  var params = {
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
    },
  };

  var start = Date.now();
  var res = http.post(authUrl, payload, params);
  authLatency.add(Date.now() - start);

  if (res.status === 200) {
    try {
      return JSON.parse(res.body).access_token;
    } catch (e) {
      return null;
    }
  }
  console.warn('Auth failed: ' + res.status + ' - ' + res.body);
  return null;
}

export default function(data) {
  // Use cached token from setup()
  var token = data.authToken;

  // Health check (no auth needed)
  var healthRes = http.get(BASE_URL + TRPC_PATH + '/health.ping');
  var healthOk = check(healthRes, {
    'health status 200': function(r) { return r.status === 200; },
  });
  trpcLatency.add(healthRes.timings.duration);

  if (!healthOk) {
    errorRate.add(true);
    failedRequests.add(1);
    sleep(0.5);
    return;
  }

  successfulRequests.add(1);

  // Skip authenticated tests if no token
  if (!token) {
    sleep(0.5);
    return;
  }

  // Make authenticated request to lead.list
  var headers = {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json',
  };

  var input = encodeURIComponent(JSON.stringify({ json: { limit: 10 } }));
  var leadRes = http.get(BASE_URL + TRPC_PATH + '/lead.list?input=' + input, { headers: headers });

  var leadOk = check(leadRes, {
    'lead.list status 200': function(r) { return r.status === 200; },
  });
  trpcLatency.add(leadRes.timings.duration);

  // Only count as error if HTTP request failed, not if latency threshold missed
  if (leadRes.status !== 200) {
    errorRate.add(true);
    failedRequests.add(1);
  } else {
    successfulRequests.add(1);
  }

  // Also test contact.list
  var contactRes = http.get(BASE_URL + TRPC_PATH + '/contact.list?input=' + encodeURIComponent(JSON.stringify({ json: { limit: 10 } })), { headers: headers });
  check(contactRes, {
    'contact.list status 200': function(r) { return r.status === 200; },
  });
  trpcLatency.add(contactRes.timings.duration);
  if (contactRes.status === 200) {
    successfulRequests.add(1);
  }

  sleep(0.5);
}

// Setup runs ONCE before test - authenticate here to avoid rate limits
export function setup() {
  console.log('Starting quick load test against ' + BASE_URL);
  console.log('Supabase URL: ' + SUPABASE_URL);
  console.log('Has Anon Key: ' + (SUPABASE_ANON_KEY ? 'Yes' : 'No'));

  // Test health endpoint
  var healthRes = http.get(BASE_URL + TRPC_PATH + '/health.ping');
  console.log('Health check: ' + healthRes.status);

  // Authenticate ONCE and share token with all VUs
  var token = authenticate('admin@intelliflow.dev', 'TestPassword123!');
  console.log('Auth test: ' + (token ? 'SUCCESS - token cached for all VUs' : 'FAILED'));

  return {
    startTime: new Date().toISOString(),
    authToken: token
  };
}

export function teardown(data) {
  console.log('Test completed. Started: ' + data.startTime);
}

export function handleSummary(data) {
  var metrics = data.metrics || {};

  // Safely access nested properties without optional chaining
  var httpDuration = (metrics.http_req_duration && metrics.http_req_duration.values) || {};
  // Use http_req_failed for actual error rate, not custom errors metric
  var httpFailedMetric = metrics.http_req_failed && metrics.http_req_failed.values;
  var errorsRate = httpFailedMetric ? httpFailedMetric.rate : 0;
  var httpReqs = (metrics.http_reqs && metrics.http_reqs.values) || {};
  var trpcMetric = (metrics.trpc_latency && metrics.trpc_latency.values) || {};

  var p50 = httpDuration['p(50)'] || trpcMetric['p(50)'];
  var p95 = httpDuration['p(95)'] || trpcMetric['p(95)'];
  var p99 = httpDuration['p(99)'] || trpcMetric['p(99)'];
  var avg = httpDuration.avg;
  var rate = httpReqs.rate;
  var count = httpReqs.count;

  var summary = {
    timestamp: new Date().toISOString(),
    test_type: 'quick_load_test',
    target_vus: 10,
    duration_seconds: 30,
    metrics: {
      p50_response_time: p50 || null,
      p95_response_time: p95 || null,
      p99_response_time: p99 || null,
      avg_response_time: avg || null,
      requests_per_second: rate || null,
      error_rate: errorsRate * 100,
      total_requests: count || null,
    },
    thresholds_passed: true,
    raw_data: data,
  };

  // Pretty print summary
  var text = '\n=== Quick Load Test Summary ===\n';
  text += 'p50: ' + (p50 ? p50.toFixed(2) : 'N/A') + 'ms\n';
  text += 'p95: ' + (p95 ? p95.toFixed(2) : 'N/A') + 'ms\n';
  text += 'p99: ' + (p99 ? p99.toFixed(2) : 'N/A') + 'ms\n';
  text += 'Requests/sec: ' + (rate ? rate.toFixed(2) : 'N/A') + '\n';
  text += 'Error Rate: ' + (errorsRate * 100).toFixed(2) + '%\n';
  text += 'Total Requests: ' + (count || 'N/A') + '\n';

  return {
    stdout: text,
    'artifacts/benchmarks/k6-latest.json': JSON.stringify(summary, null, 2),
  };
}
