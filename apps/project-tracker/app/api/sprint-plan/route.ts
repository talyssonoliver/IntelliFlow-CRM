import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

// Disable caching for this route
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    // Sprint_plan.csv is in the root of the monorepo
    const csvPath = join(process.cwd(), '..', '..', 'Sprint_plan.csv');
    const csvContent = await readFile(csvPath, 'utf-8');

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'inline; filename="Sprint_plan.csv"',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error) {
    console.error('Error reading Sprint_plan.csv:', error);
    return NextResponse.json(
      { error: 'Failed to load Sprint plan' },
      { status: 500 }
    );
  }
}
