import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

// Disable caching for this route
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    // Sprint_plan.csv is now in the metrics _global folder
    const csvPath = join(process.cwd(), 'docs', 'metrics', '_global', 'Sprint_plan.csv');
    
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
        'Pragma': 'no-cache',
        'Expires': '0',
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
