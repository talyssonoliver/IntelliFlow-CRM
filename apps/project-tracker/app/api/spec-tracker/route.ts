import { NextResponse } from 'next/server';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PATHS } from '@/lib/paths';
import { generateSpecTracker } from '../../../../../tools/scripts/generate-spec-tracker';

export const dynamic = 'force-dynamic';

const SPEC_TRACKER_PATH = join(PATHS.artifacts.reports, 'spec-tracker.json');

/**
 * GET /api/spec-tracker
 * Serves the current spec-tracker.json
 */
export async function GET() {
  try {
    if (!existsSync(SPEC_TRACKER_PATH)) {
      return NextResponse.json(
        { success: false, error: 'spec-tracker.json not yet generated. POST to regenerate.' },
        { status: 404 }
      );
    }

    const data = JSON.parse(readFileSync(SPEC_TRACKER_PATH, 'utf-8'));
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to read spec-tracker.json',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/spec-tracker
 * Triggers regeneration of spec-tracker.json from live filesystem data
 */
export async function POST() {
  try {
    const result = generateSpecTracker({ writeOutput: true });

    return NextResponse.json({
      success: true,
      message: 'spec-tracker.json regenerated',
      summary: result.summary,
      issues_count: result.issues.length,
      generated_at: result.generated_at,
    });
  } catch (error) {
    console.error('Error generating spec-tracker:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to generate spec-tracker.json',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
