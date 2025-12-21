import { NextResponse } from 'next/server';
import { readFile, readdir, access } from 'node:fs/promises';
import { join } from 'node:path';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PhaseMetrics {
  phase: string;
  status: string;
  aggregated_metrics: {
    total_tasks: number;
    done: number;
    in_progress: number;
    blocked: number;
    not_started: number;
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sprintParam = searchParams.get('sprint') || '0';

    // Handle 'all' and 'continuous' - default to sprint 0 for now
    const sprintNumber = sprintParam === 'all' || sprintParam === 'continuous' ? '0' : sprintParam;
    const sprintFolder = `sprint-${sprintNumber}`;

    const sprintPath = join(process.cwd(), 'docs', 'metrics', sprintFolder);

    // Check if sprint folder exists
    try {
      await access(sprintPath);
    } catch {
      // Sprint folder doesn't exist, return empty array
      return NextResponse.json([], {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          Pragma: 'no-cache',
          Expires: '0',
        },
      });
    }

    // Dynamically find phase folders
    const entries = await readdir(sprintPath, { withFileTypes: true });
    const phases = entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('phase-'))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    const phaseData: PhaseMetrics[] = [];

    for (const phase of phases) {
      try {
        const phaseSummaryPath = join(sprintPath, phase, '_phase-summary.json');
        const content = await readFile(phaseSummaryPath, 'utf-8');
        const data = JSON.parse(content);
        phaseData.push(data);
      } catch (error) {
        console.error(`Error reading ${phase}:`, error);
      }
    }

    return NextResponse.json(phaseData, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0',
      },
    });
  } catch (error) {
    console.error('Error reading phase metrics:', error);
    return NextResponse.json({ error: 'Failed to load phase metrics' }, { status: 500 });
  }
}
