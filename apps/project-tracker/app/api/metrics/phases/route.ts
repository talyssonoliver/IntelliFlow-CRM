import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
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

export async function GET() {
  try {
    const sprintPath = join(process.cwd(), 'docs', 'metrics', 'sprint-0');
    const phases = [
      'phase-0-initialisation',
      'phase-1-ai-foundation',
      'phase-2-parallel',
      'phase-3-dependencies',
      'phase-4-integration',
    ];

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
