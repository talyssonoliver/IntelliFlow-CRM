import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Papa from 'papaparse';

export const dynamic = 'force-dynamic';

interface CsvTask {
  'Task ID': string;
  Section: string;
  Description: string;
  Owner: string;
  Dependencies: string;
  CleanDependencies: string;
  'Pre-requisites': string;
  'Definition of Done': string;
  Status: string;
  KPIs: string;
  'Target Sprint': string;
  'Artifacts To Track': string;
  'Validation Method': string;
}

function parseDependencies(deps: string): string[] {
  if (!deps) return [];
  return deps
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean);
}

function parseArtifacts(artifacts: string): string[] {
  if (!artifacts) return [];
  return artifacts
    .split(';')
    .map((a) => a.trim())
    .filter(Boolean);
}

function parseSprint(sprint: string): number | string {
  if (!sprint) return 0;
  if (sprint.toLowerCase() === 'continuous') return 'Continuous';
  const num = parseInt(sprint, 10);
  return isNaN(num) ? sprint : num;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json({ error: 'taskId query param required' }, { status: 400 });
    }

    const csvPath = join(process.cwd(), 'docs', 'metrics', '_global', 'Sprint_plan.csv');

    if (!existsSync(csvPath)) {
      return NextResponse.json({ error: 'Sprint_plan.csv not found' }, { status: 404 });
    }

    const csvContent = await readFile(csvPath, 'utf-8');
    const { data } = Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
    });

    const tasks = data as CsvTask[];
    const csvTask = tasks.find((t) => t['Task ID'] === taskId);

    if (!csvTask) {
      return NextResponse.json({ error: `Task ${taskId} not found` }, { status: 404 });
    }

    const task = {
      id: csvTask['Task ID'],
      section: csvTask.Section,
      description: csvTask.Description,
      owner: csvTask.Owner,
      dependencies: parseDependencies(csvTask.Dependencies),
      cleanDependencies: parseDependencies(csvTask.CleanDependencies),
      prerequisites: csvTask['Pre-requisites'] || '',
      dod: csvTask['Definition of Done'] || '',
      status: csvTask.Status || 'Backlog',
      kpis: csvTask.KPIs || '',
      sprint: parseSprint(csvTask['Target Sprint']),
      artifacts: parseArtifacts(csvTask['Artifacts To Track']),
      validation: csvTask['Validation Method'] || '',
    };

    return NextResponse.json(
      { success: true, task },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('Error fetching task:', error);
    return NextResponse.json(
      { error: 'Failed to fetch task', details: String(error) },
      { status: 500 }
    );
  }
}
