import { NextRequest, NextResponse } from 'next/server';
import { refuseInProduction, requireOperator } from '@/lib/route-access';
import { startTestRun, getActiveRuns } from '@/lib/test-runner';
import type { TestRunConfig, TestScope } from '@/lib/test-runner';

const SAFE_PATTERN = /^[\w./*@][\w./*@-]*$/;
const MAX_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * POST /api/quality-reports/test-run
 * Start a new test run
 */
export async function POST(request: NextRequest) {
  const refused = refuseInProduction();
  if (refused) return refused;
  const denied = await requireOperator(request);
  if (denied) return denied;
  try {
    const body = await request.json();
    const {
      scope = 'standard' as TestScope,
      patterns,
      coverage = true,
      timeout = 5 * 60 * 1000, // 5 minutes default
    } = body;

    // Validate scope
    if (!['quick', 'standard', 'comprehensive'].includes(scope)) {
      return NextResponse.json(
        { success: false, error: 'Invalid scope. Must be quick, standard, or comprehensive.' },
        { status: 400 }
      );
    }

    // Test paths only. A leading dash would be read as a vitest flag.
    if (
      patterns !== undefined &&
      !(
        Array.isArray(patterns) &&
        patterns.every((p) => typeof p === 'string' && SAFE_PATTERN.test(p))
      )
    ) {
      return NextResponse.json(
        { success: false, error: 'Invalid patterns. Use test file paths.' },
        { status: 400 }
      );
    }

    if (typeof timeout !== 'number' || timeout <= 0 || timeout > MAX_TIMEOUT_MS) {
      return NextResponse.json({ success: false, error: 'Invalid timeout.' }, { status: 400 });
    }

    // Generate unique run ID
    const runId = `test-${crypto.randomUUID()}`;

    const config: TestRunConfig = {
      runId,
      scope,
      patterns,
      coverage,
      timeout,
    };

    // Start the test run (non-blocking)
    const state = await startTestRun(config);

    return NextResponse.json({
      success: true,
      runId,
      statusUrl: `/api/quality-reports/test-run/${runId}`,
      eventsUrl: `/api/quality-reports/test-run/events?runId=${runId}`,
      state: {
        runId: state.runId,
        status: state.status,
        startedAt: state.startedAt,
        config: state.config,
      },
    });
  } catch (error) {
    console.error('Failed to start test run:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start test run',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/quality-reports/test-run
 * List all active test runs
 */
export async function GET(request: NextRequest) {
  const denied = await requireOperator(request);
  if (denied) return denied;
  try {
    const activeRuns = getActiveRuns();

    const runs = Array.from(activeRuns.entries()).map(([id, state]) => ({
      runId: id,
      status: state.status,
      startedAt: state.startedAt,
      completedAt: state.completedAt,
      progress: state.progress,
      config: {
        scope: state.config.scope,
        coverage: state.config.coverage,
      },
    }));

    return NextResponse.json({
      success: true,
      count: runs.length,
      runs,
    });
  } catch (error) {
    console.error('Failed to list test runs:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to list test runs' },
      { status: 500 }
    );
  }
}
