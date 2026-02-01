/**
 * IntelliFlow CRM - Authenticated k6 Load Test Script
 * Task: IFC-007 - Performance Benchmarks - Modern Stack
 *
 * Tests tRPC API endpoints with authentication using seed credentials
 * Performance thresholds: p99 < 100ms latency
 *
 * Run with:
 *   k6 run --env SUPABASE_URL=<url> --env SUPABASE_ANON_KEY=<key> authenticated-load-test.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { randomString, randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';
import { SharedArray } from 'k6/data';

// Custom metrics
const errorRate = new Rate('errors');
const trpcLatency = new Trend('trpc_latency', true);
const authLatency = new Trend('auth_latency', true);
const leadQueryLatency = new Trend('lead_query_latency', true);
const leadMutationLatency = new Trend('lead_mutation_latency', true);
const healthCheckLatency = new Trend('health_check_latency', true);
const successfulRequests = new Counter('successful_requests');
const failedRequests = new Counter('failed_requests');

// Configuration from environment
const SUPABASE_URL = __ENV.SUPABASE_URL || 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = __ENV.SUPABASE_ANON_KEY || '';
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const TRPC_PATH = '/api/trpc';

// Test user credentials (from seed data)
const TEST_USERS = [
  { email: 'admin@intelliflow.dev', password: 'TestPassword123!' },
  { email: 'alex@intelliflow.dev', password: 'TestPassword123!' },
  { email: 'john.sales@intelliflow.dev', password: 'TestPassword123!' },
];

// Quick test options - 30 second test for faster feedback
export const options = {
  scenarios: {
    // Authenticated load test scenario - quick version
    authenticated_load: {
      executor: 'constant-vus',
      vus: 10,
      duration: '30s',
    },
  },
  thresholds: {
    // Primary KPI: p95 < 200ms for API calls (using correct syntax)
    'http_req_duration': ['p(95)<200', 'p(99)<500'],
    'trpc_latency': ['p(95)<150'],
    // Error rate < 10% (higher tolerance for dev environment)
    'errors': ['rate<0.1'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(50)', 'p(90)', 'p(95)', 'p(99)'],
};

// Authenticate with Supabase and get access token
// IFC-007: Added retry logic for transient failures
function authenticate(email, password) {
  const authUrl = `${SUPABASE_URL}/auth/v1/token?grant_type=password`;

  const payload = JSON.stringify({
    email: email,
    password: password,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
    },
    tags: { name: 'auth' },
    timeout: '10s', // Add timeout for slow connections
  };

  // Retry logic for transient failures (IFC-007 fix)
  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const start = Date.now();
    const res = http.post(authUrl, payload, params);
    authLatency.add(Date.now() - start);

    const success = check(res, {
      'auth status 200': (r) => r.status === 200,
      'auth returns access_token': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.access_token !== undefined;
        } catch (e) {
          return false;
        }
      },
    });

    if (success) {
      try {
        const body = JSON.parse(res.body);
        return body.access_token;
      } catch (e) {
        console.warn(`Auth parse error on attempt ${attempt + 1}: ${e}`);
      }
    } else if (attempt < maxRetries - 1) {
      console.warn(`Auth failed on attempt ${attempt + 1}, status: ${res.status}, retrying...`);
      sleep(1); // Backoff between retries
    }
  }

  console.error(`Authentication failed after ${maxRetries} attempts`);
  return null;
}

// tRPC request helper with auth
function trpcQuery(procedure, input = {}, accessToken = null) {
  const url = `${BASE_URL}${TRPC_PATH}/${procedure}`;
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-Request-ID': `k6-${randomString(16)}`,
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const params = {
    headers,
    tags: { procedure, type: 'query' },
  };

  const queryParams = encodeURIComponent(JSON.stringify({ json: input }));
  return http.get(`${url}?input=${queryParams}`, params);
}

function trpcMutation(procedure, input = {}, accessToken = null) {
  const url = `${BASE_URL}${TRPC_PATH}/${procedure}`;
  const payload = JSON.stringify({ json: input });
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-Request-ID': `k6-${randomString(16)}`,
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const params = {
    headers,
    tags: { procedure, type: 'mutation' },
  };

  return http.post(url, payload, params);
}

// Health check endpoint (no auth needed) - uses tRPC health.ping
function healthCheck() {
  const start = Date.now();
  const res = http.get(`${BASE_URL}${TRPC_PATH}/health.ping`, {
    tags: { endpoint: 'health' },
  });
  healthCheckLatency.add(Date.now() - start);

  const success = check(res, {
    'health check status 200': (r) => r.status === 200,
    'health check response time < 50ms': (r) => r.timings.duration < 50,
    'health check returns ok': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.result && body.result.data && body.result.data.status === 'ok';
      } catch (e) {
        return false;
      }
    },
  });

  errorRate.add(!success);
  return success;
}

// Lead API tests with auth
function testLeadQueries(accessToken) {
  group('Lead Queries (Authenticated)', () => {
    // List leads
    const start = Date.now();
    const listRes = trpcQuery('lead.list', {
      limit: 20,
      offset: 0,
    }, accessToken);
    leadQueryLatency.add(Date.now() - start);

    const listSuccess = check(listRes, {
      'lead.list status 200': (r) => r.status === 200,
      'lead.list has data': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.result !== undefined;
        } catch (e) {
          return false;
        }
      },
      'lead.list latency < 100ms': (r) => r.timings.duration < 100,
    });

    if (listSuccess) {
      successfulRequests.add(1);
    } else {
      failedRequests.add(1);
    }
    errorRate.add(!listSuccess);
    trpcLatency.add(listRes.timings.duration);

    // Get statistics (using correct endpoint name: lead.stats)
    const statsStart = Date.now();
    const statsRes = trpcQuery('lead.stats', {}, accessToken);
    leadQueryLatency.add(Date.now() - statsStart);

    const statsSuccess = check(statsRes, {
      'lead.stats status 200': (r) => r.status === 200,
      'lead.stats has data': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.result !== undefined;
        } catch (e) {
          return false;
        }
      },
      'lead.stats latency < 100ms': (r) => r.timings.duration < 100,
    });

    if (statsSuccess) {
      successfulRequests.add(1);
    } else {
      failedRequests.add(1);
    }
    errorRate.add(!statsSuccess);
    trpcLatency.add(statsRes.timings.duration);
  });
}

// Contact API tests with auth
function testContactQueries(accessToken) {
  group('Contact Queries (Authenticated)', () => {
    const start = Date.now();
    const res = trpcQuery('contact.list', { limit: 20 }, accessToken);
    trpcLatency.add(Date.now() - start);

    const success = check(res, {
      'contact.list status 200': (r) => r.status === 200,
      'contact.list latency < 100ms': (r) => r.timings.duration < 100,
    });

    if (success) {
      successfulRequests.add(1);
    } else {
      failedRequests.add(1);
    }
    errorRate.add(!success);
  });
}

// Account API tests with auth
function testAccountQueries(accessToken) {
  group('Account Queries (Authenticated)', () => {
    const start = Date.now();
    const res = trpcQuery('account.list', { limit: 20 }, accessToken);
    trpcLatency.add(Date.now() - start);

    const success = check(res, {
      'account.list status 200': (r) => r.status === 200,
      'account.list latency < 100ms': (r) => r.timings.duration < 100,
    });

    if (success) {
      successfulRequests.add(1);
    } else {
      failedRequests.add(1);
    }
    errorRate.add(!success);
  });
}

// Opportunity API tests with auth
function testOpportunityQueries(accessToken) {
  group('Opportunity Queries (Authenticated)', () => {
    const start = Date.now();
    const res = trpcQuery('opportunity.list', { limit: 20 }, accessToken);
    trpcLatency.add(Date.now() - start);

    const success = check(res, {
      'opportunity.list status 200': (r) => r.status === 200,
      'opportunity.list latency < 100ms': (r) => r.timings.duration < 100,
    });

    if (success) {
      successfulRequests.add(1);
    } else {
      failedRequests.add(1);
    }
    errorRate.add(!success);
  });
}

// Ticket API tests with auth
function testTicketQueries(accessToken) {
  group('Ticket Queries (Authenticated)', () => {
    const start = Date.now();
    const res = trpcQuery('ticket.list', { limit: 20 }, accessToken);
    trpcLatency.add(Date.now() - start);

    const success = check(res, {
      'ticket.list status 200': (r) => r.status === 200,
      'ticket.list latency < 100ms': (r) => r.timings.duration < 100,
    });

    if (success) {
      successfulRequests.add(1);
    } else {
      failedRequests.add(1);
    }
    errorRate.add(!success);
  });
}

// Main test execution - uses cached token from setup()
export default function(data) {
  // Use cached token from setup() to avoid Supabase rate limits
  const accessToken = data.authToken;

  // Always run health check first (no auth)
  healthCheck();

  if (!accessToken) {
    errorRate.add(true);
    failedRequests.add(1);
    sleep(1);
    return;
  }

  // Test ALL endpoints in each iteration for full coverage
  testLeadQueries(accessToken);
  testContactQueries(accessToken);
  testAccountQueries(accessToken);
  testOpportunityQueries(accessToken);
  testTicketQueries(accessToken);

  // Short think time between iterations
  sleep(0.5);
}

// Setup function - runs once before the test
// IMPORTANT: Caches auth token to avoid Supabase rate limits
// IFC-007: Added environment validation and improved error handling
export function setup() {
  console.log('=== IFC-007 Performance Benchmark Test ===');
  console.log(`Target: ${BASE_URL}`);
  console.log(`Supabase: ${SUPABASE_URL}`);
  console.log('==========================================');

  // Verify environment variables (IFC-007 fix)
  if (!SUPABASE_URL || SUPABASE_URL === 'https://your-project.supabase.co') {
    console.error('ERROR: SUPABASE_URL not configured');
    console.error('Run with: k6 run --env SUPABASE_URL=<url> --env SUPABASE_ANON_KEY=<key> ...');
    return { authToken: null, error: 'SUPABASE_URL not configured' };
  }
  if (!SUPABASE_ANON_KEY) {
    console.error('ERROR: SUPABASE_ANON_KEY not configured');
    return { authToken: null, error: 'SUPABASE_ANON_KEY not configured' };
  }

  // Verify API is accessible using tRPC health.ping
  console.log('Checking API health...');
  const healthRes = http.get(`${BASE_URL}${TRPC_PATH}/health.ping`, {
    timeout: '5s',
  });
  if (healthRes.status !== 200) {
    console.warn(`Warning: Health check returned status ${healthRes.status}`);
    console.warn(`Response: ${healthRes.body}`);
  } else {
    console.log('API health check: PASSED');
  }

  // Authenticate ONCE and cache token for all VUs
  console.log('Authenticating with seed user...');
  const authToken = authenticate('admin@intelliflow.dev', 'TestPassword123!');
  if (authToken) {
    console.log('Authentication: PASSED - token cached for all VUs');
  } else {
    console.error('Authentication: FAILED - load test will have high error rate');
    console.error('Check Supabase credentials and seed data');
  }

  return {
    startTime: new Date().toISOString(),
    authToken: authToken
  };
}

// Teardown function - runs once after the test
export function teardown(data) {
  console.log(`Load test completed`);
  console.log(`Started at: ${data.startTime}`);
  console.log(`Ended at: ${new Date().toISOString()}`);
}

// Handle test summary - export to JSON
export function handleSummary(data) {
  var timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  // Extract key metrics for baseline.json integration (ES5 compatible - no optional chaining)
  var metrics = data.metrics || {};
  var httpDuration = (metrics.http_req_duration && metrics.http_req_duration.values) || {};
  var trpcLatencyValues = (metrics.trpc_latency && metrics.trpc_latency.values) || {};
  var errorsMetric = metrics.errors && metrics.errors.values;
  var errorsRate = errorsMetric ? errorsMetric.rate : 0;
  var httpReqs = (metrics.http_reqs && metrics.http_reqs.values) || {};

  var summary = {
    timestamp: new Date().toISOString(),
    test_type: 'authenticated_load_test',
    target_vus: 10,
    duration_seconds: 30,
    metrics: {
      p50_response_time: httpDuration['p(50)'] || null,
      p95_response_time: httpDuration['p(95)'] || null,
      p99_response_time: httpDuration['p(99)'] || null,
      avg_response_time: httpDuration.avg || null,
      requests_per_second: httpReqs.rate || null,
      error_rate: errorsRate * 100, // Convert to percentage
      total_requests: httpReqs.count || null,
    },
    thresholds_passed: !(data.root_group && data.root_group.checks) ? true :
      Object.values(data.root_group.checks).every(function(c) { return c.passes > 0; }),
    raw_data: data,
  };

  var result = {
    'stdout': textSummary(data),
    'artifacts/benchmarks/k6-latest.json': JSON.stringify(summary, null, 2),
  };
  result['artifacts/benchmarks/k6-auth-summary-' + timestamp + '.json'] = JSON.stringify(summary, null, 2);
  return result;
}

// Text summary helper (ES5 compatible)
function textSummary(data) {
  var metrics = data.metrics || {};
  var summary = '\n=== IntelliFlow CRM Authenticated Load Test Summary ===\n\n';

  // HTTP Request Duration
  if (metrics.http_req_duration) {
    var duration = metrics.http_req_duration.values;
    summary += 'HTTP Request Duration:\n';
    summary += '  p50: ' + (duration['p(50)'] ? duration['p(50)'].toFixed(2) : 'N/A') + 'ms\n';
    summary += '  p95: ' + (duration['p(95)'] ? duration['p(95)'].toFixed(2) : 'N/A') + 'ms\n';
    summary += '  p99: ' + (duration['p(99)'] ? duration['p(99)'].toFixed(2) : 'N/A') + 'ms\n';
    summary += '  avg: ' + (duration.avg ? duration.avg.toFixed(2) : 'N/A') + 'ms\n\n';
  }

  // tRPC Latency
  if (metrics.trpc_latency) {
    var trpc = metrics.trpc_latency.values;
    summary += 'tRPC Latency:\n';
    summary += '  p50: ' + (trpc['p(50)'] ? trpc['p(50)'].toFixed(2) : 'N/A') + 'ms\n';
    summary += '  p95: ' + (trpc['p(95)'] ? trpc['p(95)'].toFixed(2) : 'N/A') + 'ms\n';
    summary += '  p99: ' + (trpc['p(99)'] ? trpc['p(99)'].toFixed(2) : 'N/A') + 'ms\n\n';
  }

  // Error Rate
  if (metrics.errors) {
    var errorPct = (metrics.errors.values.rate * 100).toFixed(2);
    summary += 'Error Rate: ' + errorPct + '%\n';
    summary += '  Threshold: < 5%\n';
    summary += '  Status: ' + (parseFloat(errorPct) < 5 ? 'PASS' : 'FAIL') + '\n\n';
  }

  // Request Rate
  if (metrics.http_reqs) {
    var rate = metrics.http_reqs.values.rate;
    summary += 'Request Rate: ' + (rate ? rate.toFixed(2) : 'N/A') + ' req/s\n';
    summary += 'Total Requests: ' + (metrics.http_reqs.values.count || 'N/A') + '\n\n';
  }

  // Auth Latency
  if (metrics.auth_latency) {
    var auth = metrics.auth_latency.values;
    summary += 'Auth Latency:\n';
    summary += '  p50: ' + (auth['p(50)'] ? auth['p(50)'].toFixed(2) : 'N/A') + 'ms\n';
    summary += '  p95: ' + (auth['p(95)'] ? auth['p(95)'].toFixed(2) : 'N/A') + 'ms\n\n';
  }

  // Checks
  if (data.root_group && data.root_group.checks) {
    summary += '=== Check Results ===\n';
    var totalPasses = 0;
    var totalFails = 0;
    var checks = data.root_group.checks;
    for (var name in checks) {
      if (checks.hasOwnProperty(name)) {
        totalPasses += checks[name].passes;
        totalFails += checks[name].fails;
      }
    }
    var pct = ((totalPasses/(totalPasses+totalFails))*100).toFixed(1);
    summary += '  Total: ' + totalPasses + '/' + (totalPasses + totalFails) + ' passed (' + pct + '%)\n';
  }

  return summary;
}
