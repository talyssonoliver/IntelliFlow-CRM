/**
 * IFC-007 - k6 Auth Smoke Test
 * Phase 1.2: RED - Write k6 Auth Integration Test
 *
 * Quick validation that Supabase auth is working for load tests.
 * Run with: k6 run --env SUPABASE_URL=<url> --env SUPABASE_ANON_KEY=<key> auth-smoke.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const authSuccessRate = new Rate('auth_success_rate');

// Configuration from environment
const SUPABASE_URL = __ENV.SUPABASE_URL || 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = __ENV.SUPABASE_ANON_KEY || '';
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Test user credentials (from seed data)
const TEST_USER = {
  email: 'admin@intelliflow.dev',
  password: 'TestPassword123!',
};

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    'checks': ['rate==1.0'], // 100% success required
    'auth_success_rate': ['rate==1.0'],
  },
};

/**
 * Validate environment configuration
 */
function validateEnvironment() {
  const errors = [];

  if (!SUPABASE_URL || SUPABASE_URL === 'https://your-project.supabase.co') {
    errors.push('SUPABASE_URL not configured');
  }
  if (!SUPABASE_ANON_KEY) {
    errors.push('SUPABASE_ANON_KEY not configured');
  }

  if (errors.length > 0) {
    console.error('Environment validation failed:');
    errors.forEach(e => console.error(`  - ${e}`));
    console.error('\nRun with:');
    console.error('  k6 run --env SUPABASE_URL=<url> --env SUPABASE_ANON_KEY=<key> auth-smoke.js');
    return false;
  }

  return true;
}

export default function() {
  // Test 1: Validate environment
  const envValid = validateEnvironment();
  check(envValid, { 'environment configured': (v) => v === true });

  if (!envValid) {
    authSuccessRate.add(false);
    return;
  }

  // Test 2: Supabase auth endpoint reachable
  const healthUrl = `${SUPABASE_URL}/auth/v1/health`;
  const healthRes = http.get(healthUrl, {
    headers: { 'apikey': SUPABASE_ANON_KEY },
    tags: { name: 'auth_health' },
  });

  const healthOk = check(healthRes, {
    'auth endpoint healthy': (r) => r.status === 200,
  });

  if (!healthOk) {
    console.error(`Auth health check failed: ${healthRes.status} ${healthRes.body}`);
    authSuccessRate.add(false);
    return;
  }

  // Test 3: Can authenticate with seed credentials
  const authUrl = `${SUPABASE_URL}/auth/v1/token?grant_type=password`;
  const loginRes = http.post(
    authUrl,
    JSON.stringify({
      email: TEST_USER.email,
      password: TEST_USER.password,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      tags: { name: 'auth_login' },
    }
  );

  const loginOk = check(loginRes, {
    'login successful': (r) => r.status === 200,
  });

  if (!loginOk) {
    console.error(`Login failed: ${loginRes.status} ${loginRes.body}`);
    authSuccessRate.add(false);
    return;
  }

  // Test 4: Response contains valid access_token
  let accessToken = null;
  try {
    const body = JSON.parse(loginRes.body);
    accessToken = body.access_token;
  } catch (e) {
    console.error('Failed to parse login response');
  }

  const hasToken = check(accessToken, {
    'has access_token': (t) => t !== null && t !== undefined && t.length > 0,
  });

  if (!hasToken) {
    console.error('No access_token in response');
    authSuccessRate.add(false);
    return;
  }

  // Test 5: Token is valid JWT format
  const jwtValid = check(accessToken, {
    'token is valid JWT': (t) => {
      if (!t) return false;
      const parts = t.split('.');
      return parts.length === 3;
    },
  });

  if (!jwtValid) {
    console.error('Invalid JWT format');
    authSuccessRate.add(false);
    return;
  }

  // Test 6: Can call API health endpoint
  const apiHealthUrl = `${BASE_URL}/api/trpc/health.ping`;
  const apiRes = http.get(apiHealthUrl, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
    tags: { name: 'api_health' },
  });

  const apiOk = check(apiRes, {
    'API health endpoint accessible': (r) => r.status === 200,
  });

  // Test 7: Can call authenticated endpoint
  const leadListUrl = `${BASE_URL}/api/trpc/lead.list?input=${encodeURIComponent(JSON.stringify({ json: { limit: 5 } }))}`;
  const leadRes = http.get(leadListUrl, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    tags: { name: 'lead_list' },
  });

  const leadOk = check(leadRes, {
    'lead.list returns 200': (r) => r.status === 200,
    'lead.list response is valid': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.result !== undefined;
      } catch (e) {
        return false;
      }
    },
  });

  // Mark overall success
  authSuccessRate.add(healthOk && loginOk && hasToken && jwtValid);

  console.log('\n=== Auth Smoke Test Summary ===');
  console.log(`Auth Health: ${healthOk ? '✓' : '✗'}`);
  console.log(`Login: ${loginOk ? '✓' : '✗'}`);
  console.log(`Access Token: ${hasToken ? '✓' : '✗'}`);
  console.log(`JWT Valid: ${jwtValid ? '✓' : '✗'}`);
  console.log(`API Health: ${apiOk ? '✓' : '✗'}`);
  console.log(`Lead List: ${leadOk ? '✓' : '✗'}`);
  console.log('================================\n');
}

export function handleSummary(data) {
  const passed = data.metrics.checks && data.metrics.checks.values.passes > 0;
  const total = data.metrics.checks ? data.metrics.checks.values.passes + data.metrics.checks.values.fails : 0;

  console.log('\n=== Auth Smoke Test Results ===');
  console.log(`Status: ${passed ? 'PASSED' : 'FAILED'}`);
  console.log(`Checks: ${data.metrics.checks?.values.passes || 0}/${total}`);
  console.log('================================\n');

  return {
    stdout: JSON.stringify({
      status: passed ? 'PASSED' : 'FAILED',
      checks: {
        passed: data.metrics.checks?.values.passes || 0,
        failed: data.metrics.checks?.values.fails || 0,
      },
      timestamp: new Date().toISOString(),
    }, null, 2),
  };
}
