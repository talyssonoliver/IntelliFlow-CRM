import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const metricsPath = join(process.cwd(), 'docs', 'metrics', 'sprint-0', '_summary.json');
    const content = await readFile(metricsPath, 'utf-8');
    const data = JSON.parse(content);

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0',
      },
    });
  } catch (error) {
    console.error('Error reading sprint summary:', error);
    return NextResponse.json({ error: 'Failed to load sprint summary' }, { status: 500 });
  }
}
