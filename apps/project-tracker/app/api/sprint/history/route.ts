import { NextResponse } from 'next/server';
import { join } from 'node:path';
import {
  loadExecutionHistory,
  getExecutionRun,
  getSprintExecutionStats,
  formatDuration,
} from '../../../../lib/execution-history';

export const dynamic = 'force-dynamic';

/**
 * GET /api/sprint/history
 * Get execution history for sprints
 *
 * Query Parameters:
 * - sprint: Filter by sprint number
 * - limit: Maximum number of runs to return
 * - runId: Get specific run by ID
 * - stats: If 'true', return statistics instead of runs
 * - details: If 'true', include task-level details
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sprintParam = searchParams.get('sprint');
    const limitParam = searchParams.get('limit');
    const runIdParam = searchParams.get('runId');
    const statsParam = searchParams.get('stats');
    const detailsParam = searchParams.get('details');

    const projectRoot = join(process.cwd(), '..', '..');

    // Get specific run by ID
    if (runIdParam) {
      const run = getExecutionRun(projectRoot, runIdParam);

      if (!run) {
        return NextResponse.json({ error: `Run ${runIdParam} not found` }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        run: {
          ...run,
          formattedDuration: formatDuration(run.duration),
        },
      });
    }

    // Parse sprint number
    const sprintNumber =
      sprintParam === 'all' ? undefined : sprintParam ? parseInt(sprintParam, 10) : undefined;

    // Return statistics
    if (statsParam === 'true' && sprintNumber !== undefined) {
      const stats = getSprintExecutionStats(projectRoot, sprintNumber);

      return NextResponse.json({
        success: true,
        sprintNumber,
        stats,
      });
    }

    // Load execution history
    const history = loadExecutionHistory(projectRoot, {
      sprintNumber,
      limit: limitParam ? parseInt(limitParam, 10) : undefined,
      includeDetails: detailsParam === 'true',
    });

    // Format durations for display
    const formattedRuns = history.runs.map((run) => ({
      ...run,
      formattedDuration: formatDuration(run.duration),
      passRatePercent:
        run.totalTasks > 0 ? Math.round((run.results.pass / run.totalTasks) * 100) : 0,
    }));

    return NextResponse.json({
      success: true,
      sprintNumber: sprintNumber ?? 'all',
      summary: {
        totalRuns: history.totalRuns,
        passRate: Math.round(history.passRate * 100),
        averageDuration: formatDuration(history.averageDuration),
      },
      latestRun: history.latestRun
        ? {
            ...history.latestRun,
            formattedDuration: formatDuration(history.latestRun.duration),
          }
        : null,
      runs: formattedRuns,
    });
  } catch (error) {
    console.error('Error loading execution history:', error);
    return NextResponse.json(
      {
        error: 'Failed to load execution history',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
