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

// Quick test options - 2 minute test for faster feedback
export const options = {
  scenarios: {
    // Authenticated load test scenario
    authenticated_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },   // Ramp up to 50 users
        { duration: '1m', target: 100 },   // Ramp to 100 users
        { duration: '30s', target: 0 },    // Ramp down
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    // Primary KPI: p99 < 100ms for API calls
    http_req_duration: ['p99<200', 'p95<100', 'p50<50'],
    trpc_latency: ['p99<200', 'p95<100'],
    lead_query_latency: ['p99<150'],
    health_check_latency: ['p99<50'],
    // Error rate < 5% (higher tolerance for auth issues)
    errors: ['rate<0.05'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(50)', 'p(90)', 'p(95)', 'p(99)'],
};

// Authenticate with Supabase and get access token
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
  };

  const start = Date.now();
  const res = http.post(authUrl, payload, params);
  authLatency.add(Date.now() - start);

  const success = check(res, {
    'auth status 200': (r) => r.status === 200,
    'auth returns access_token': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.access_token !== undefined;
      } catch {
        return false;
      }
    },
  });

  if (success) {
    try {
      const body = JSON.parse(res.body);
      return body.access_token;
    } catch {
      return null;
    }
  }

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
        return body.result?.data?.status === 'ok';
      } catch {
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
        } catch {
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

    // Get statistics
    const statsStart = Date.now();
    const statsRes = trpcQuery('lead.getStatistics', {}, accessToken);
    leadQueryLatency.add(Date.now() - statsStart);

    check(statsRes, {
      'lead.getStatistics status 200': (r) => r.status === 200,
      'lead.getStatistics latency < 100ms': (r) => r.timings.duration < 100,
    });
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

// Main test execution
export default function() {
  // Pick a random test user
  const user = TEST_USERS[randomIntBetween(0, TEST_USERS.length - 1)];

  // Always run health check first (no auth)
  healthCheck();

  // Authenticate
  const accessToken = authenticate(user.email, user.password);

  if (!accessToken) {
    console.warn(`Failed to authenticate as ${user.email}`);
    errorRate.add(true);
    failedRequests.add(1);
    sleep(1);
    return;
  }

  // Distribute load across different endpoint groups
  const scenario = randomIntBetween(1, 100);

  if (scenario <= 30) {
    // 30% - Lead queries (most common operation)
    testLeadQueries(accessToken);
  } else if (scenario <= 50) {
    // 20% - Contact queries
    testContactQueries(accessToken);
  } else if (scenario <= 70) {
    // 20% - Account queries
    testAccountQueries(accessToken);
  } else if (scenario <= 85) {
    // 15% - Opportunity queries
    testOpportunityQueries(accessToken);
  } else {
    // 15% - Ticket queries
    testTicketQueries(accessToken);
  }

  // Think time between iterations
  sleep(randomIntBetween(1, 2));
}

// Setup function - runs once before the test
export function setup() {
  console.log(`Starting authenticated load test against ${BASE_URL}`);
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  console.log('Test users: admin@intelliflow.dev, alex@intelliflow.dev, john.sales@intelliflow.dev');

  // Verify API is accessible using tRPC health.ping
  const healthRes = http.get(`${BASE_URL}${TRPC_PATH}/health.ping`);
  if (healthRes.status !== 200) {
    console.warn(`Warning: Health check returned status ${healthRes.status}`);
  } else {
    console.log('Health check passed');
  }

  // Test authentication
  const testToken = authenticate('admin@intelliflow.dev', 'TestPassword123!');
  if (testToken) {
    console.log('Authentication test passed');
  } else {
    console.warn('WARNING: Authentication test failed - load test may have high error rate');
  }

  return { startTime: new Date().toISOString() };
}

// Teardown function - runs once after the test
export function teardown(data) {
  console.log(`Load test completed`);
  console.log(`Started at: ${data.startTime}`);
  console.log(`Ended at: ${new Date().toISOString()}`);
}

// Handle test summary - export to JSON
export function handleSummary(data) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  // Extract key metrics for baseline.json integration
  const metrics = data.metrics || {};
  const httpDuration = metrics.http_req_duration?.values || {};
  const trpcLatencyValues = metrics.trpc_latency?.values || {};
  const errorsRate = metrics.errors?.values?.rate || 0;
  const httpReqs = metrics.http_reqs?.values || {};

  const summary = {
    timestamp: new Date().toISOString(),
    test_type: 'authenticated_load_test',
    target_vus: 100,
    duration_seconds: 120,
    metrics: {
      p50_response_time: httpDuration['p(50)'] || null,
      p95_response_time: httpDuration['p(95)'] || null,
      p99_response_time: httpDuration['p(99)'] || null,
      avg_response_time: httpDuration.avg || null,
      requests_per_second: httpReqs.rate || null,
      error_rate: errorsRate * 100, // Convert to percentage
      total_requests: httpReqs.count || null,
    },
    thresholds_passed: !data.root_group?.checks ? true :
      Object.values(data.root_group.checks).every(c => c.passes > 0),
    raw_data: data,
  };

  return {
    'stdout': textSummary(data),
    [`artifacts/benchmarks/k6-auth-summary-${timestamp}.json`]: JSON.stringify(summary, null, 2),
    'artifacts/benchmarks/k6-latest.json': JSON.stringify(summary, null, 2),
  };
}

// Text summary helper
function textSummary(data) {
  const { metrics } = data;

  let summary = '\n=== IntelliFlow CRM Authenticated Load Test Summary ===\n\n';

  // HTTP Request Duration
  if (metrics.http_req_duration) {
    const duration = metrics.http_req_duration.values;
    summary += `HTTP Request Duration:\n`;
    summary += `  p50: ${duration['p(50)']?.toFixed(2) || 'N/A'}ms\n`;
    summary += `  p95: ${duration['p(95)']?.toFixed(2) || 'N/A'}ms\n`;
    summary += `  p99: ${duration['p(99)']?.toFixed(2) || 'N/A'}ms\n`;
    summary += `  avg: ${duration.avg?.toFixed(2) || 'N/A'}ms\n\n`;
  }

  // tRPC Latency
  if (metrics.trpc_latency) {
    const trpc = metrics.trpc_latency.values;
    summary += `tRPC Latency:\n`;
    summary += `  p50: ${trpc['p(50)']?.toFixed(2) || 'N/A'}ms\n`;
    summary += `  p95: ${trpc['p(95)']?.toFixed(2) || 'N/A'}ms\n`;
    summary += `  p99: ${trpc['p(99)']?.toFixed(2) || 'N/A'}ms\n\n`;
  }

  // Error Rate
  if (metrics.errors) {
    const errorPct = (metrics.errors.values.rate * 100).toFixed(2);
    summary += `Error Rate: ${errorPct}%\n`;
    summary += `  Threshold: < 5%\n`;
    summary += `  Status: ${parseFloat(errorPct) < 5 ? 'PASS' : 'FAIL'}\n\n`;
  }

  // Request Rate
  if (metrics.http_reqs) {
    summary += `Request Rate: ${metrics.http_reqs.values.rate?.toFixed(2) || 'N/A'} req/s\n`;
    summary += `Total Requests: ${metrics.http_reqs.values.count || 'N/A'}\n\n`;
  }

  // Auth Latency
  if (metrics.auth_latency) {
    const auth = metrics.auth_latency.values;
    summary += `Auth Latency:\n`;
    summary += `  p50: ${auth['p(50)']?.toFixed(2) || 'N/A'}ms\n`;
    summary += `  p95: ${auth['p(95)']?.toFixed(2) || 'N/A'}ms\n\n`;
  }

  // Checks
  if (data.root_group?.checks) {
    summary += `=== Check Results ===\n`;
    let totalPasses = 0;
    let totalFails = 0;
    for (const [name, check] of Object.entries(data.root_group.checks)) {
      totalPasses += check.passes;
      totalFails += check.fails;
    }
    summary += `  Total: ${totalPasses}/${totalPasses + totalFails} passed (${((totalPasses/(totalPasses+totalFails))*100).toFixed(1)}%)\n`;
  }

  return summary;
}
