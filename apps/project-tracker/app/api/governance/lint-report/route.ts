/**
 * GET /api/governance/lint-report
 * Returns the full plan lint report
 */

import { NextResponse } from 'next/server';
import { loadLintReport } from '@/lib/governance';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const lintReport = loadLintReport();

    if (!lintReport) {
      return NextResponse.json(
        {
          error: 'Lint report not found',
          message: 'plan-lint-report.json not found. Run "pnpm run plan-lint" to generate.',
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: lintReport,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('Error fetching lint report:', error);
    return NextResponse.json(
      { error: 'Failed to fetch lint report', details: String(error) },
      { status: 500 }
    );
  }
}
