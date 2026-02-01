/**
 * Gate 2 Benchmark Script - Authenticated Load Testing
 *
 * Purpose: Test authenticated API endpoints for Gate 2 validation.
 * Requires JWT token injection for authenticated endpoints.
 *
 * Usage:
 *   k6 run artifacts/misc/k6/gate2-benchmark.js \
 *     -e BASE_URL=http://localhost:3000 \
 *     -e TEST_USER_EMAIL=test@intelliflow.com \
 *     -e TEST_USER_PASSWORD=$TEST_PASSWORD \
 *     --out json=artifacts/benchmarks/gate2-baseline.json
 *
 * @see .specify/sprints/sprint-15/specifications/IFC-027-spec.md AC-007
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const authSuccessRate = new Rate('auth_success');
const apiLatency = new Trend('api_latency');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const TEST_USER_EMAIL = __ENV.TEST_USER_EMAIL || 'test@intelliflow.com';
const TEST_USER_PASSWORD = __ENV.TEST_USER_PASSWORD || 'test-password';

export const options = {
  stages: [
    { duration: '30s', target: 10 },  // Ramp up
    { duration: '1m', target: 10 },   // Steady state
    { duration: '30s', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],  // <5% failure rate (>95% success)
    http_req_duration: ['p(95)<500'], // 95th percentile < 500ms
    errors: ['rate<0.05'],
    auth_success: ['rate>0.95'],
  },
};

/**
 * Setup: Authenticate and get JWT token
 */
export function setup() {
  const loginPayload = JSON.stringify({
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
  });

  const loginRes = http.post(`${BASE_URL}/api/auth/login`, loginPayload, {
    headers: { 'Content-Type': 'application/json' },
  });

  const success = check(loginRes, {
    'login status is 200': (r) => r.status === 200,
    'login has token': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.token !== undefined || body.accessToken !== undefined;
      } catch {
        return false;
      }
    },
  });

  if (!success) {
    console.warn('Authentication failed, tests will run without token');
    return { token: null };
  }

  try {
    const body = JSON.parse(loginRes.body);
    return { token: body.token || body.accessToken };
  } catch {
    return { token: null };
  }
}

/**
 * Main test function - runs for each VU iteration
 */
export default function (data) {
  const headers = {
    'Content-Type': 'application/json',
  };

  // Add auth header if token available
  if (data.token) {
    headers['Authorization'] = `Bearer ${data.token}`;
  }

  const params = { headers };

  // Test 1: Get leads (authenticated)
  const leadsRes = http.get(`${BASE_URL}/api/leads`, params);
  const leadsSuccess = check(leadsRes, {
    'leads status is 200': (r) => r.status === 200,
    'leads returns array': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body) || (body.data && Array.isArray(body.data));
      } catch {
        return false;
      }
    },
  });
  errorRate.add(!leadsSuccess);
  authSuccessRate.add(leadsRes.status !== 401 && leadsRes.status !== 403);
  apiLatency.add(leadsRes.timings.duration);

  sleep(1);

  // Test 2: Get contacts (authenticated)
  const contactsRes = http.get(`${BASE_URL}/api/contacts`, params);
  const contactsSuccess = check(contactsRes, {
    'contacts status is 200': (r) => r.status === 200,
  });
  errorRate.add(!contactsSuccess);
  authSuccessRate.add(contactsRes.status !== 401 && contactsRes.status !== 403);
  apiLatency.add(contactsRes.timings.duration);

  sleep(1);

  // Test 3: Health check (public)
  const healthRes = http.get(`${BASE_URL}/api/health`);
  check(healthRes, {
    'health status is 200': (r) => r.status === 200,
  });

  sleep(1);

  // Test 4: AI scoring endpoint (authenticated)
  const scoringRes = http.post(
    `${BASE_URL}/api/ai/score`,
    JSON.stringify({ leadId: 'test-lead-123' }),
    params
  );
  const scoringSuccess = check(scoringRes, {
    'scoring status is 200 or 404': (r) => r.status === 200 || r.status === 404,
  });
  errorRate.add(!scoringSuccess && scoringRes.status !== 404);
  authSuccessRate.add(scoringRes.status !== 401 && scoringRes.status !== 403);

  sleep(1);
}

/**
 * Teardown: Cleanup after tests
 */
export function teardown(data) {
  console.log('Gate 2 Benchmark completed');
  console.log(`Token was ${data.token ? 'available' : 'not available'}`);
}
