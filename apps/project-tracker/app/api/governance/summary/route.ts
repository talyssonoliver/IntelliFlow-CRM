/**
 * GET /api/governance/summary
 * Returns governance summary for a sprint (default: Sprint 0)
 */

import { NextResponse } from 'next/server';
import {
  getGovernanceSummary,
  checkGovernanceFilesExist,
  getDetailedTasksByTier,
} from '@/lib/governance';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sprintParam = searchParams.get('sprint') || '0';

    // Handle 'all' as a special case, otherwise parse as integer
    const sprint: number | 'all' = sprintParam === 'all' ? 'all' : parseInt(sprintParam, 10);

    // Check if governance files exist
    const filesExist = checkGovernanceFilesExist();

    if (!filesExist.planOverrides) {
      return NextResponse.json(
        {
          error: 'Governance not initialized',
          message: 'plan-overrides.yaml not found. Run "pnpm run plan-lint" to generate.',
          filesExist,
        },
        { status: 404 }
      );
    }

    const summary = getGovernanceSummary(sprint);
    const tierTasks = getDetailedTasksByTier(sprint);

    return NextResponse.json(
      {
        success: true,
        data: summary,
        tierTasks,
        filesExist,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('Error fetching governance summary:', error);
    return NextResponse.json(
      { error: 'Failed to fetch governance summary', details: String(error) },
      { status: 500 }
    );
  }
}
