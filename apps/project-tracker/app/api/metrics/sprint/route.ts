import { NextResponse } from 'next/server';
import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sprintParam = searchParams.get('sprint') || '0';

    // Handle 'all' and 'continuous' - default to sprint 0 for now
    const sprintNumber = sprintParam === 'all' || sprintParam === 'continuous' ? '0' : sprintParam;
    const sprintFolder = `sprint-${sprintNumber}`;

    const metricsPath = join(process.cwd(), 'docs', 'metrics', sprintFolder, '_summary.json');

    // Check if sprint data exists
    try {
      await access(metricsPath);
    } catch {
      // Sprint folder doesn't exist, return empty data with message
      return NextResponse.json(
        {
          sprint: sprintFolder,
          name: `Sprint ${sprintNumber}`,
          target_date: new Date().toISOString(),
          started_at: null,
          completed_at: null,
          task_summary: {
            total: 0,
            done: 0,
            in_progress: 0,
            blocked: 0,
            not_started: 0,
            failed: 0,
          },
          kpi_summary: {},
          blockers: [],
          completed_tasks: [],
          message: `No metrics data available for Sprint ${sprintNumber}. Only Sprint 0 has detailed metrics tracking.`,
        },
        {
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            Pragma: 'no-cache',
            Expires: '0',
          },
        }
      );
    }

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
