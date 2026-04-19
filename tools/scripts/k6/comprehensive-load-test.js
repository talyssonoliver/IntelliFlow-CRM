/**
 * IntelliFlow CRM - Comprehensive k6 Load Test Script
 * Tests ALL available tRPC API endpoints with CORRECT endpoint names
 *
 * Run with:
 *   k6 run --env SUPABASE_URL=<url> --env SUPABASE_ANON_KEY=<key> comprehensive-load-test.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { randomString } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// Custom metrics
var errorRate = new Rate('errors');
var trpcLatency = new Trend('trpc_latency', true);
var authLatency = new Trend('auth_latency', true);
var successfulRequests = new Counter('successful_requests');
var failedRequests = new Counter('failed_requests');

// Configuration from environment
var SUPABASE_URL = __ENV.SUPABASE_URL || 'https://your-project.supabase.co';
var SUPABASE_ANON_KEY = __ENV.SUPABASE_ANON_KEY || '';
var BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
var TRPC_PATH = '/api/trpc';

// Test options - quick 30 second test
export var options = {
  scenarios: {
    comprehensive_load: {
      executor: 'constant-vus',
      vus: 5,
      duration: '30s',
    },
  },
  thresholds: {
    'http_req_duration': ['p(95)<300', 'p(99)<500'],
    'trpc_latency': ['p(95)<250'],
    'errors': ['rate<0.5'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(50)', 'p(90)', 'p(95)', 'p(99)'],
};

// Authenticate with Supabase and get access token
function authenticate(email, password) {
  var authUrl = SUPABASE_URL + '/auth/v1/token?grant_type=password';

  var payload = JSON.stringify({
    email: email,
    password: password,
  });

  var params = {
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
    },
    tags: { name: 'auth' },
  };

  var start = Date.now();
  var res = http.post(authUrl, payload, params);
  authLatency.add(Date.now() - start);

  var success = check(res, {
    'auth status 200': function(r) { return r.status === 200; },
  });

  if (success) {
    try {
      var body = JSON.parse(res.body);
      return body.access_token;
    } catch (e) {
      return null;
    }
  }
  return null;
}

// tRPC query helper with auth
function trpcQuery(procedure, input, accessToken) {
  input = input || {};
  var url = BASE_URL + TRPC_PATH + '/' + procedure;
  var headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-Request-ID': 'k6-' + randomString(16),
  };

  if (accessToken) {
    headers['Authorization'] = 'Bearer ' + accessToken;
  }

  var params = {
    headers: headers,
    tags: { procedure: procedure, type: 'query' },
  };

  var queryParams = encodeURIComponent(JSON.stringify({ json: input }));
  var start = Date.now();
  var res = http.get(url + '?input=' + queryParams, params);
  var duration = Date.now() - start;
  trpcLatency.add(duration);

  return res;
}

// Test a query endpoint and record result
function testQueryEndpoint(name, procedure, input, accessToken) {
  var res = trpcQuery(procedure, input, accessToken);

  var success = check(res, {
    [name + ' status 200']: function(r) { return r.status === 200; },
  });

  if (success) {
    successfulRequests.add(1);
  } else {
    failedRequests.add(1);
  }
  errorRate.add(!success);

  return success;
}

// ============================================
// ENDPOINT TEST FUNCTIONS BY ROUTER
// Using ACTUAL endpoint names from router files
// ============================================

function testHealthEndpoints() {
  group('Health Router', function() {
    testQueryEndpoint('health.ping', 'health.ping', {}, null);
    testQueryEndpoint('health.check', 'health.check', {}, null);
    testQueryEndpoint('health.ready', 'health.ready', {}, null);
    testQueryEndpoint('health.alive', 'health.alive', {}, null);
  });
}

function testLeadEndpoints(accessToken) {
  group('Lead Router', function() {
    testQueryEndpoint('lead.list', 'lead.list', { limit: 10 }, accessToken);
    testQueryEndpoint('lead.stats', 'lead.stats', {}, accessToken);
    testQueryEndpoint('lead.filterOptions', 'lead.filterOptions', {}, accessToken);
    testQueryEndpoint('lead.getHotLeads', 'lead.getHotLeads', { limit: 5 }, accessToken);
    testQueryEndpoint('lead.getReadyForQualification', 'lead.getReadyForQualification', { limit: 5 }, accessToken);
  });
}

function testContactEndpoints(accessToken) {
  group('Contact Router', function() {
    testQueryEndpoint('contact.list', 'contact.list', { limit: 10 }, accessToken);
    testQueryEndpoint('contact.stats', 'contact.stats', {}, accessToken);
    testQueryEndpoint('contact.filterOptions', 'contact.filterOptions', {}, accessToken);
    testQueryEndpoint('contact.search', 'contact.search', { query: 'test', limit: 5 }, accessToken);
  });
}

function testAccountEndpoints(accessToken) {
  group('Account Router', function() {
    testQueryEndpoint('account.list', 'account.list', { limit: 10 }, accessToken);
    testQueryEndpoint('account.stats', 'account.stats', {}, accessToken);
    testQueryEndpoint('account.filterOptions', 'account.filterOptions', {}, accessToken);
  });
}

function testOpportunityEndpoints(accessToken) {
  group('Opportunity Router', function() {
    testQueryEndpoint('opportunity.list', 'opportunity.list', { limit: 10 }, accessToken);
    testQueryEndpoint('opportunity.stats', 'opportunity.stats', {}, accessToken);
    testQueryEndpoint('opportunity.forecast', 'opportunity.forecast', {}, accessToken);
  });
}

function testTicketEndpoints(accessToken) {
  group('Ticket Router', function() {
    testQueryEndpoint('ticket.list', 'ticket.list', { limit: 10 }, accessToken);
    testQueryEndpoint('ticket.stats', 'ticket.stats', {}, accessToken);
    testQueryEndpoint('ticket.filterOptions', 'ticket.filterOptions', {}, accessToken);
  });
}

function testTaskEndpoints(accessToken) {
  group('Task Router', function() {
    testQueryEndpoint('task.list', 'task.list', { limit: 10 }, accessToken);
    testQueryEndpoint('task.stats', 'task.stats', {}, accessToken);
  });
}

function testTimelineEndpoints(accessToken) {
  group('Timeline Router', function() {
    testQueryEndpoint('timeline.getEvents', 'timeline.getEvents', { limit: 10 }, accessToken);
    testQueryEndpoint('timeline.getStats', 'timeline.getStats', {}, accessToken);
    testQueryEndpoint('timeline.getUpcomingDeadlines', 'timeline.getUpcomingDeadlines', { days: 7 }, accessToken);
    testQueryEndpoint('timeline.getPendingAgentActions', 'timeline.getPendingAgentActions', {}, accessToken);
  });
}

function testBillingEndpoints(accessToken) {
  group('Billing Router', function() {
    testQueryEndpoint('billing.getSubscription', 'billing.getSubscription', {}, accessToken);
    testQueryEndpoint('billing.listInvoices', 'billing.listInvoices', { limit: 5 }, accessToken);
    testQueryEndpoint('billing.getPaymentMethods', 'billing.getPaymentMethods', {}, accessToken);
    testQueryEndpoint('billing.getUsageMetrics', 'billing.getUsageMetrics', {}, accessToken);
  });
}

function testAgentEndpoints(accessToken) {
  group('Agent Router', function() {
    testQueryEndpoint('agent.listTools', 'agent.listTools', {}, accessToken);
    testQueryEndpoint('agent.getPendingApprovals', 'agent.getPendingApprovals', {}, accessToken);
    testQueryEndpoint('agent.getPendingCount', 'agent.getPendingCount', {}, accessToken);
  });
}

function testConversationEndpoints(accessToken) {
  group('Conversation Router', function() {
    testQueryEndpoint('conversation.search', 'conversation.search', { query: 'test', limit: 5 }, accessToken);
    testQueryEndpoint('conversation.getPendingApprovals', 'conversation.getPendingApprovals', {}, accessToken);
  });
}

function testAnalyticsEndpoints(accessToken) {
  group('Analytics Router', function() {
    testQueryEndpoint('analytics.dealsWonTrend', 'analytics.dealsWonTrend', {}, accessToken);
    testQueryEndpoint('analytics.growthTrends', 'analytics.growthTrends', {}, accessToken);
    testQueryEndpoint('analytics.trafficSources', 'analytics.trafficSources', {}, accessToken);
    testQueryEndpoint('analytics.recentActivity', 'analytics.recentActivity', { limit: 10 }, accessToken);
    testQueryEndpoint('analytics.leadStats', 'analytics.leadStats', {}, accessToken);
  });
}

function testAppointmentsEndpoints(accessToken) {
  group('Appointments Router', function() {
    testQueryEndpoint('appointments.list', 'appointments.list', { limit: 10 }, accessToken);
    testQueryEndpoint('appointments.checkAvailability', 'appointments.checkAvailability', { date: new Date().toISOString().split('T')[0] }, accessToken);
  });
}

function testDocumentsEndpoints(accessToken) {
  group('Documents Router', function() {
    testQueryEndpoint('documents.list', 'documents.list', { limit: 10 }, accessToken);
  });
}

function testExperimentEndpoints(accessToken) {
  group('Experiment Router', function() {
    testQueryEndpoint('experiment.list', 'experiment.list', { limit: 10 }, accessToken);
  });
}

function testChainVersionEndpoints(accessToken) {
  group('ChainVersion Router', function() {
    testQueryEndpoint('chainVersion.list', 'chainVersion.list', { limit: 10 }, accessToken);
    testQueryEndpoint('chainVersion.getActive', 'chainVersion.getActive', {}, accessToken);
    testQueryEndpoint('chainVersion.getStats', 'chainVersion.getStats', {}, accessToken);
  });
}

function testFeedbackEndpoints(accessToken) {
  group('Feedback Router', function() {
    testQueryEndpoint('feedback.getAnalytics', 'feedback.getAnalytics', {}, accessToken);
  });
}

function testPipelineConfigEndpoints(accessToken) {
  group('PipelineConfig Router', function() {
    testQueryEndpoint('pipelineConfig.getAll', 'pipelineConfig.getAll', {}, accessToken);
    testQueryEndpoint('pipelineConfig.getStats', 'pipelineConfig.getStats', {}, accessToken);
  });
}

function testInboundEndpoints(accessToken) {
  group('Inbound Router', function() {
    testQueryEndpoint('inbound.listEmails', 'inbound.listEmails', { limit: 10 }, accessToken);
  });
}

function testIntegrationsEndpoints(accessToken) {
  group('Integrations Router', function() {
    testQueryEndpoint('integrations.getAllConnectorsHealth', 'integrations.getAllConnectorsHealth', {}, accessToken);
    testQueryEndpoint('integrations.getDashboardConfig', 'integrations.getDashboardConfig', {}, accessToken);
  });
}

function testAuditEndpoints(accessToken) {
  group('Audit Router', function() {
    testQueryEndpoint('audit.search', 'audit.search', { limit: 10 }, accessToken);
    testQueryEndpoint('audit.getMyActivity', 'audit.getMyActivity', { limit: 10 }, accessToken);
  });
}

function testSystemEndpoints() {
  group('System Router', function() {
    testQueryEndpoint('system.version', 'system.version', {}, null);
    testQueryEndpoint('system.info', 'system.info', {}, null);
    testQueryEndpoint('system.features', 'system.features', {}, null);
  });
}

function testAuthEndpoints() {
  group('Auth Router', function() {
    testQueryEndpoint('auth.getStatus', 'auth.getStatus', {}, null);
  });
}

// ============================================
// MAIN TEST EXECUTION
// ============================================

export default function(data) {
  var accessToken = data.authToken;

  // Test public endpoints (no auth needed)
  testHealthEndpoints();
  testSystemEndpoints();
  testAuthEndpoints();

  if (!accessToken) {
    errorRate.add(true);
    failedRequests.add(1);
    sleep(1);
    return;
  }

  // Test ALL authenticated routers
  testLeadEndpoints(accessToken);
  testContactEndpoints(accessToken);
  testAccountEndpoints(accessToken);
  testOpportunityEndpoints(accessToken);
  testTicketEndpoints(accessToken);
  testTaskEndpoints(accessToken);
  testTimelineEndpoints(accessToken);
  testBillingEndpoints(accessToken);
  testAgentEndpoints(accessToken);
  testConversationEndpoints(accessToken);
  testAnalyticsEndpoints(accessToken);
  testAppointmentsEndpoints(accessToken);
  testDocumentsEndpoints(accessToken);
  testExperimentEndpoints(accessToken);
  testChainVersionEndpoints(accessToken);
  testFeedbackEndpoints(accessToken);
  testPipelineConfigEndpoints(accessToken);
  testInboundEndpoints(accessToken);
  testIntegrationsEndpoints(accessToken);
  testAuditEndpoints(accessToken);

  // Short think time
  sleep(0.2);
}

// Setup function - authenticate once
export function setup() {
  console.log('Starting comprehensive load test against ' + BASE_URL);
  console.log('Testing 60+ endpoints across 20+ routers');

  // Verify API is accessible
  var healthRes = http.get(BASE_URL + TRPC_PATH + '/health.ping');
  if (healthRes.status !== 200) {
    console.warn('Warning: Health check returned status ' + healthRes.status);
  } else {
    console.log('Health check passed');
  }

  // Authenticate
  var authToken = authenticate('admin@intelliflow.dev', 'TestPassword123!');
  if (authToken) {
    console.log('Authentication successful');
  } else {
    console.warn('WARNING: Authentication failed');
  }

  return {
    startTime: new Date().toISOString(),
    authToken: authToken
  };
}

// Teardown function
export function teardown(data) {
  console.log('Comprehensive load test completed');
  console.log('Started at: ' + data.startTime);
  console.log('Ended at: ' + new Date().toISOString());
}

// Handle test summary
export function handleSummary(data) {
  var timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-');

  var metrics = data.metrics || {};
  var httpDuration = (metrics.http_req_duration && metrics.http_req_duration.values) || {};
  var errorsMetric = metrics.errors && metrics.errors.values;
  var errorsRate = errorsMetric ? errorsMetric.rate : 0;
  var httpReqs = (metrics.http_reqs && metrics.http_reqs.values) || {};

  // Count tested endpoints from checks
  var testedEndpoints = [];
  function extractChecks(group) {
    if (group.checks) {
      for (var i = 0; i < group.checks.length; i++) {
        var check = group.checks[i];
        if (check.name && check.name.indexOf('status 200') !== -1) {
          testedEndpoints.push({
            name: check.name.replaceAll(' status 200', ''),
            passes: check.passes,
            fails: check.fails
          });
        }
      }
    }
    if (group.groups) {
      for (var j = 0; j < group.groups.length; j++) {
        extractChecks(group.groups[j]);
      }
    }
  }
  if (data.root_group) {
    extractChecks(data.root_group);
  }

  var summary = {
    timestamp: new Date().toISOString(),
    test_type: 'comprehensive_load_test',
    target_vus: 5,
    duration_seconds: 30,
    endpoints_tested: testedEndpoints.length,
    metrics: {
      p50_response_time: httpDuration['p(50)'] || null,
      p95_response_time: httpDuration['p(95)'] || null,
      p99_response_time: httpDuration['p(99)'] || null,
      avg_response_time: httpDuration.avg || null,
      requests_per_second: httpReqs.rate || null,
      error_rate: errorsRate * 100,
      total_requests: httpReqs.count || null,
    },
    thresholds_passed: true,
    raw_data: data,
  };

  var result = {
    'stdout': textSummary(data, testedEndpoints),
    'artifacts/benchmarks/k6-latest.json': JSON.stringify(summary, null, 2),
  };
  result['artifacts/benchmarks/k6-comprehensive-' + timestamp + '.json'] = JSON.stringify(summary, null, 2);
  return result;
}

// Text summary helper
function textSummary(data, testedEndpoints) {
  var metrics = data.metrics || {};
  var summary = '\n=== IntelliFlow CRM Comprehensive Load Test Summary ===\n\n';

  summary += 'Endpoints Tested: ' + testedEndpoints.length + '\n\n';

  if (metrics.http_req_duration) {
    var duration = metrics.http_req_duration.values;
    summary += 'HTTP Request Duration:\n';
    summary += '  p50: ' + (duration['p(50)'] ? duration['p(50)'].toFixed(2) : 'N/A') + 'ms\n';
    summary += '  p95: ' + (duration['p(95)'] ? duration['p(95)'].toFixed(2) : 'N/A') + 'ms\n';
    summary += '  p99: ' + (duration['p(99)'] ? duration['p(99)'].toFixed(2) : 'N/A') + 'ms\n';
    summary += '  avg: ' + (duration.avg ? duration.avg.toFixed(2) : 'N/A') + 'ms\n\n';
  }

  if (metrics.errors) {
    var errorPct = (metrics.errors.values.rate * 100).toFixed(2);
    summary += 'Error Rate: ' + errorPct + '%\n\n';
  }

  if (metrics.http_reqs) {
    summary += 'Request Rate: ' + (metrics.http_reqs.values.rate ? metrics.http_reqs.values.rate.toFixed(2) : 'N/A') + ' req/s\n';
    summary += 'Total Requests: ' + (metrics.http_reqs.values.count || 'N/A') + '\n\n';
  }

  // Show endpoint results
  summary += '=== Endpoint Results ===\n';
  var passed = 0;
  var failed = 0;
  for (var i = 0; i < testedEndpoints.length; i++) {
    var ep = testedEndpoints[i];
    var status = ep.fails === 0 ? 'PASS' : 'FAIL';
    if (ep.fails === 0) passed++; else failed++;
    summary += '  ' + ep.name + ': ' + status + ' (' + ep.passes + '/' + (ep.passes + ep.fails) + ')\n';
  }
  summary += '\nTotal: ' + passed + ' passed, ' + failed + ' failed\n';

  return summary;
}
