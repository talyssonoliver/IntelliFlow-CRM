import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { PATHS } from '@/lib/paths';

// Disable caching for this route
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    // Use centralized path configuration
    const csvPath = PATHS.sprintTracking.SPRINT_PLAN_CSV;

    // Debug logging
    console.log('Looking for CSV at:', csvPath);
    console.log('File exists:', existsSync(csvPath));
    console.log('Current working directory:', process.cwd());

    if (!existsSync(csvPath)) {
      throw new Error(`File not found at: ${csvPath}`);
    }

    const csvContent = await readFile(csvPath, 'utf-8');

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'inline; filename="Sprint_plan.csv"',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0',
      },
    });
  } catch (error) {
    console.error('Error reading Sprint_plan.csv:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to load Sprint plan', details: errorMessage },
      { status: 500 }
    );
  }
}
