import { NextRequest, NextResponse } from 'next/server';
import { getRunState, cancelTestRun } from '@/lib/test-runner';

export const dynamic = 'force-dynamic';

/**
 * GET /api/quality-reports/test-run/[runId]
 * Get the status of a specific test run
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;
    const state = getRunState(runId);

    if (!state) {
      return NextResponse.json(
        { success: false, error: 'Test run not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        runId: state.runId,
        status: state.status,
        startedAt: state.startedAt,
        completedAt: state.completedAt,
        progress: state.progress,
        coverage: state.coverage,
        error: state.error,
        config: {
          scope: state.config.scope,
          coverage: state.config.coverage,
        },
      },
    });
  } catch (error) {
    console.error('Failed to get test run status:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get test run status' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/quality-reports/test-run/[runId]
 * Cancel a running test
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;
    const cancelled = cancelTestRun(runId);

    if (!cancelled) {
      return NextResponse.json(
        {
          success: false,
          error: 'Test run not found or already completed',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Test run cancelled',
      runId,
    });
  } catch (error) {
    console.error('Failed to cancel test run:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to cancel test run' },
      { status: 500 }
    );
  }
}
