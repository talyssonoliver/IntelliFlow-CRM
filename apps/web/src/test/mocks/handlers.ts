/**
 * MSW Request Handlers
 *
 * Mock Service Worker handlers for API mocking in integration tests.
 */

import { http, HttpResponse } from 'msw';

// Mock data
const mockQualityReports = {
  reports: [
    {
      id: 'lighthouse',
      name: 'Lighthouse Performance',
      type: 'lighthouse',
      status: 'passing',
      score: 92,
      generatedAt: new Date().toISOString(),
      source: 'ci',
      details: {
        performance: 95,
        accessibility: 90,
        bestPractices: 92,
        seo: 91,
      },
    },
    {
      id: 'coverage',
      name: 'Test Coverage',
      type: 'coverage',
      status: 'passing',
      score: 85,
      generatedAt: new Date().toISOString(),
      source: 'ci',
      details: {
        lines: 85,
        statements: 84,
        functions: 82,
        branches: 78,
      },
    },
    {
      id: 'performance',
      name: 'Performance Benchmarks',
      type: 'performance',
      status: 'passing',
      score: 88,
      generatedAt: new Date().toISOString(),
      source: 'ci',
      details: {
        tRPC_p95: '45ms',
        database_p95: '12ms',
      },
    },
  ],
  lastUpdated: new Date().toISOString(),
  overallHealth: 'good' as const,
};

// Track test runs
const testRuns = new Map<string, {
  runId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: {
    testsRun: number;
    testsPassed: number;
    testsFailed: number;
    testsSkipped: number;
  };
  startedAt: string;
  completedAt?: string;
}>();

export const handlers = [
  // Quality Reports API
  http.get('/api/quality-reports', ({ request }) => {
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'summary';

    if (action === 'summary') {
      return HttpResponse.json({
        success: true,
        data: mockQualityReports,
      });
    }

    if (action === 'detail') {
      const id = url.searchParams.get('id');
      const report = mockQualityReports.reports.find((r) => r.id === id);
      if (!report) {
        return HttpResponse.json(
          { success: false, error: 'Report not found' },
          { status: 404 }
        );
      }
      return HttpResponse.json({ success: true, data: report });
    }

    return HttpResponse.json(
      { success: false, error: 'Unknown action' },
      { status: 400 }
    );
  }),

  // Start test run
  http.post('/api/quality-reports/test-run', async ({ request }) => {
    const body = await request.json() as { scope?: string; coverage?: boolean };
    const runId = `test-mock-${Date.now()}`;
    const scope = body.scope ?? 'all';
    const withCoverage = body.coverage ?? false;

    const run = {
      runId,
      scope,
      withCoverage,
      status: 'running' as const,
      progress: {
        testsRun: 0,
        testsPassed: 0,
        testsFailed: 0,
        testsSkipped: 0,
      },
      startedAt: new Date().toISOString(),
    };

    testRuns.set(runId, run);

    // Simulate test completion after a short delay
    setTimeout(() => {
      const completedRun = testRuns.get(runId);
      if (completedRun) {
        completedRun.status = 'completed';
        completedRun.completedAt = new Date().toISOString();
        completedRun.progress = {
          testsRun: 10,
          testsPassed: 9,
          testsFailed: 1,
          testsSkipped: 0,
        };
      }
    }, 100);

    return HttpResponse.json({
      success: true,
      runId,
      statusUrl: `/api/quality-reports/test-run/${runId}`,
      eventsUrl: `/api/quality-reports/test-run/events?runId=${runId}`,
      state: run,
    });
  }),

  // List active test runs
  http.get('/api/quality-reports/test-run', () => {
    const runs = Array.from(testRuns.values()).map((run) => ({
      runId: run.runId,
      status: run.status,
      startedAt: run.startedAt,
      progress: run.progress,
    }));

    return HttpResponse.json({
      success: true,
      count: runs.length,
      runs,
    });
  }),

  // Get specific test run status
  http.get('/api/quality-reports/test-run/:runId', ({ params }) => {
    const { runId } = params;
    const run = testRuns.get(runId as string);

    if (!run) {
      return HttpResponse.json(
        { success: false, error: 'Test run not found' },
        { status: 404 }
      );
    }

    return HttpResponse.json({
      success: true,
      data: run,
    });
  }),

  // Cancel test run
  http.delete('/api/quality-reports/test-run/:runId', ({ params }) => {
    const { runId } = params;
    const run = testRuns.get(runId as string);

    if (!run) {
      return HttpResponse.json(
        { success: false, error: 'Test run not found' },
        { status: 404 }
      );
    }

    run.status = 'failed';
    run.completedAt = new Date().toISOString();

    return HttpResponse.json({
      success: true,
      message: 'Test run cancelled',
      runId,
    });
  }),

  // SSE events endpoint (returns mock response - SSE not fully supported in MSW)
  http.get('/api/quality-reports/test-run/events', ({ request }) => {
    const url = new URL(request.url);
    const runId = url.searchParams.get('runId');

    if (!runId) {
      return HttpResponse.json(
        { error: 'runId is required' },
        { status: 400 }
      );
    }

    // Return a simple response for tests (real SSE testing requires special setup)
    return HttpResponse.json({
      type: 'connected',
      runId,
      timestamp: new Date().toISOString(),
    });
  }),
];
