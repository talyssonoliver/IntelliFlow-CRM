/**
 * IntelliFlow CRM - k6 Load Test Script
 * Task: IFC-007 - Performance Benchmarks - Modern Stack
 *
 * Tests tRPC API endpoints with 1000 concurrent users target
 * Performance thresholds: p99 < 100ms latency
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { randomString, randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// Custom metrics
const errorRate = new Rate('errors');
const trpcLatency = new Trend('trpc_latency', true);
const leadQueryLatency = new Trend('lead_query_latency', true);
const leadMutationLatency = new Trend('lead_mutation_latency', true);
const healthCheckLatency = new Trend('health_check_latency', true);
const successfulRequests = new Counter('successful_requests');
const failedRequests = new Counter('failed_requests');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const TRPC_PATH = '/trpc';

// Test options with staged load ramping to 1000 concurrent users
export const options = {
  stages: [
    // Ramp up phase
    { duration: '30s', target: 100 },   // Warm up to 100 users
    { duration: '1m', target: 250 },    // Ramp to 250 users
    { duration: '2m', target: 500 },    // Ramp to 500 users
    { duration: '3m', target: 1000 },   // Ramp to 1000 users (target)
    { duration: '5m', target: 1000 },   // Sustain 1000 users
    // Ramp down phase
    { duration: '2m', target: 500 },    // Ramp down to 500
    { duration: '1m', target: 100 },    // Ramp down to 100
    { duration: '30s', target: 0 },     // Cool down
  ],
  thresholds: {
    // Primary KPI: p99 < 100ms
    http_req_duration: ['p99<100', 'p95<80', 'p50<50'],
    trpc_latency: ['p99<100', 'p95<80'],
    lead_query_latency: ['p99<100'],
    lead_mutation_latency: ['p99<150'],
    health_check_latency: ['p99<50'],
    // Error rate < 1%
    errors: ['rate<0.01'],
    // Request rate
    http_reqs: ['rate>100'],
  },
  // Summary export
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(50)', 'p(90)', 'p(95)', 'p(99)'],
};

// tRPC request helper
function trpcQuery(procedure, input = {}) {
  const url = `${BASE_URL}${TRPC_PATH}/${procedure}`;
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Request-ID': `k6-${randomString(16)}`,
    },
    tags: { procedure, type: 'query' },
  };

  const queryParams = encodeURIComponent(JSON.stringify({ json: input }));
  return http.get(`${url}?input=${queryParams}`, params);
}

function trpcMutation(procedure, input = {}) {
  const url = `${BASE_URL}${TRPC_PATH}/${procedure}`;
  const payload = JSON.stringify({ json: input });
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Request-ID': `k6-${randomString(16)}`,
    },
    tags: { procedure, type: 'mutation' },
  };

  return http.post(url, payload, params);
}

// Health check endpoint
function healthCheck() {
  const start = Date.now();
  const res = http.get(`${BASE_URL}/health`, {
    tags: { endpoint: 'health' },
  });
  healthCheckLatency.add(Date.now() - start);

  const success = check(res, {
    'health check status 200': (r) => r.status === 200,
    'health check response time < 50ms': (r) => r.timings.duration < 50,
  });

  errorRate.add(!success);
  return success;
}

// Lead API tests
function testLeadQueries() {
  group('Lead Queries', () => {
    // List leads
    const start = Date.now();
    const listRes = trpcQuery('lead.list', {
      limit: 20,
      offset: 0,
      sortBy: 'createdAt',
      sortOrder: 'desc'
    });
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

    // Get single lead
    const getStart = Date.now();
    const getRes = trpcQuery('lead.getById', {
      id: `lead-${randomIntBetween(1, 1000)}`
    });
    leadQueryLatency.add(Date.now() - getStart);

    const getSuccess = check(getRes, {
      'lead.getById status 200 or 404': (r) => r.status === 200 || r.status === 404,
      'lead.getById latency < 100ms': (r) => r.timings.duration < 100,
    });

    errorRate.add(!getSuccess && getRes.status !== 404);
    trpcLatency.add(getRes.timings.duration);

    // Search leads
    const searchStart = Date.now();
    const searchRes = trpcQuery('lead.search', {
      query: randomString(5),
      filters: {
        status: ['new', 'qualified', 'contacted'],
      },
      limit: 10
    });
    leadQueryLatency.add(Date.now() - searchStart);

    check(searchRes, {
      'lead.search status 200': (r) => r.status === 200,
      'lead.search latency < 100ms': (r) => r.timings.duration < 100,
    });
    trpcLatency.add(searchRes.timings.duration);
  });
}

function testLeadMutations() {
  group('Lead Mutations', () => {
    // Create lead
    const createStart = Date.now();
    const createRes = trpcMutation('lead.create', {
      email: `test-${randomString(8)}@example.com`,
      firstName: `Test${randomString(4)}`,
      lastName: `User${randomString(4)}`,
      company: `Company ${randomString(6)}`,
      source: 'api_test',
      status: 'new',
    });
    leadMutationLatency.add(Date.now() - createStart);

    const createSuccess = check(createRes, {
      'lead.create status 200 or 201': (r) => r.status === 200 || r.status === 201,
      'lead.create latency < 150ms': (r) => r.timings.duration < 150,
      'lead.create returns id': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.result?.data?.id !== undefined;
        } catch {
          return false;
        }
      },
    });

    if (createSuccess) {
      successfulRequests.add(1);
    } else {
      failedRequests.add(1);
    }
    errorRate.add(!createSuccess);
    trpcLatency.add(createRes.timings.duration);

    // Update lead (if create succeeded)
    if (createSuccess) {
      try {
        const body = JSON.parse(createRes.body);
        const leadId = body.result?.data?.id;

        if (leadId) {
          const updateStart = Date.now();
          const updateRes = trpcMutation('lead.update', {
            id: leadId,
            status: 'contacted',
            notes: `Updated by k6 load test at ${new Date().toISOString()}`,
          });
          leadMutationLatency.add(Date.now() - updateStart);

          check(updateRes, {
            'lead.update status 200': (r) => r.status === 200,
            'lead.update latency < 150ms': (r) => r.timings.duration < 150,
          });
          trpcLatency.add(updateRes.timings.duration);
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
  });
}

// Contact API tests
function testContactQueries() {
  group('Contact Queries', () => {
    const start = Date.now();
    const res = trpcQuery('contact.list', { limit: 20 });
    trpcLatency.add(Date.now() - start);

    check(res, {
      'contact.list status 200': (r) => r.status === 200,
      'contact.list latency < 100ms': (r) => r.timings.duration < 100,
    });
  });
}

// Account API tests
function testAccountQueries() {
  group('Account Queries', () => {
    const start = Date.now();
    const res = trpcQuery('account.list', { limit: 20 });
    trpcLatency.add(Date.now() - start);

    check(res, {
      'account.list status 200': (r) => r.status === 200,
      'account.list latency < 100ms': (r) => r.timings.duration < 100,
    });
  });
}

// AI Scoring endpoint tests
function testAIScoring() {
  group('AI Scoring', () => {
    const start = Date.now();
    const res = trpcMutation('ai.scoreLead', {
      leadId: `lead-${randomIntBetween(1, 1000)}`,
      forceRefresh: false,
    });
    trpcLatency.add(Date.now() - start);

    check(res, {
      'ai.scoreLead status 200': (r) => r.status === 200,
      // AI scoring has higher latency allowance
      'ai.scoreLead latency < 2000ms': (r) => r.timings.duration < 2000,
    });
  });
}

// Analytics endpoint tests
function testAnalytics() {
  group('Analytics', () => {
    const start = Date.now();
    const res = trpcQuery('analytics.dashboard', {
      period: '7d',
      metrics: ['leads', 'conversions', 'revenue'],
    });
    trpcLatency.add(Date.now() - start);

    check(res, {
      'analytics.dashboard status 200': (r) => r.status === 200,
      'analytics.dashboard latency < 200ms': (r) => r.timings.duration < 200,
    });
  });
}

// Main test execution
export default function() {
  // Distribute load across different endpoint groups
  const scenario = randomIntBetween(1, 100);

  // Always run health check first
  healthCheck();

  if (scenario <= 40) {
    // 40% - Lead queries (most common operation)
    testLeadQueries();
  } else if (scenario <= 60) {
    // 20% - Lead mutations
    testLeadMutations();
  } else if (scenario <= 75) {
    // 15% - Contact queries
    testContactQueries();
  } else if (scenario <= 85) {
    // 10% - Account queries
    testAccountQueries();
  } else if (scenario <= 95) {
    // 10% - Analytics
    testAnalytics();
  } else {
    // 5% - AI Scoring (expensive operation)
    testAIScoring();
  }

  // Think time between iterations
  sleep(randomIntBetween(1, 3));
}

// Setup function - runs once before the test
export function setup() {
  console.log(`Starting load test against ${BASE_URL}`);
  console.log('Target: 1000 concurrent users');
  console.log('Threshold: p99 < 100ms');

  // Verify API is accessible
  const healthRes = http.get(`${BASE_URL}/health`);
  if (healthRes.status !== 200) {
    console.warn(`Warning: Health check returned status ${healthRes.status}`);
  }

  return { startTime: new Date().toISOString() };
}

// Teardown function - runs once after the test
export function teardown(data) {
  console.log(`Load test completed`);
  console.log(`Started at: ${data.startTime}`);
  console.log(`Ended at: ${new Date().toISOString()}`);
}

// Handle test summary
export function handleSummary(data) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    [`artifacts/benchmarks/k6-summary-${timestamp}.json`]: JSON.stringify(data, null, 2),
  };
}

// Text summary helper
function textSummary(data, options) {
  const { metrics } = data;

  let summary = '\n=== IntelliFlow CRM Load Test Summary ===\n\n';

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
    summary += `  Threshold: < 1%\n`;
    summary += `  Status: ${parseFloat(errorPct) < 1 ? 'PASS' : 'FAIL'}\n\n`;
  }

  // Request Rate
  if (metrics.http_reqs) {
    summary += `Request Rate: ${metrics.http_reqs.values.rate?.toFixed(2) || 'N/A'} req/s\n\n`;
  }

  // Threshold Results
  summary += `=== Threshold Results ===\n`;
  for (const [key, threshold] of Object.entries(data.root_group?.checks || {})) {
    summary += `  ${key}: ${threshold.passes}/${threshold.passes + threshold.fails} passed\n`;
  }

  return summary;
}
