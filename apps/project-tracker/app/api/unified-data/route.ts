/**
 * GET /api/unified-data
 *
 * Single source of truth for all project tracker views.
 * All views should fetch from this endpoint to ensure data consistency.
 *
 * This endpoint:
 * 1. Reads Sprint_plan.csv
 * 2. Normalizes all status values using shared normalizeStatus()
 * 3. Pre-computes counts and groupings
 * 4. Returns consistent data structure for all views
 */

import { NextResponse } from 'next/server';
import { readFile, stat } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';
import { normalizeStatus, TASK_STATUSES, STATUS_GROUPS } from '@/lib/csv-parser';
import { PATHS } from '@/lib/paths';
import { NO_CACHE_HEADERS, TaskSummary, createEmptyTaskSummary } from '@/lib/api-types';
import type { TaskStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface CsvRow {
  'Task ID': string;
  Section: string;
  Description: string;
  Owner: string;
  Status: string;
  'Target Sprint': string;
  Dependencies: string;
  CleanDependencies: string;
  'Pre-requisites': string;
  'Definition of Done': string;
  KPIs: string;
  'Artifacts To Track': string;
  'Validation Method': string;
}

interface UnifiedTask {
  id: string;
  section: string;
  description: string;
  owner: string;
  status: TaskStatus;
  sprint: number | 'Continuous';
  dependencies: string[];
  clean_dependencies: string[];
  prerequisites: string;
  dod: string;
  kpis: string;
  artifacts: string[];
  validation: string;
}

interface SectionData {
  name: string;
  total: number;
  done: number;
  in_progress: number;
  blocked: number;
  not_started: number;
  progress: number;
}

interface SprintData {
  sprint: number | 'Continuous';
  total: number;
  done: number;
  in_progress: number;
  blocked: number;
  not_started: number;
  progress: number;
}

interface UnifiedDataResponse {
  tasks: UnifiedTask[];
  sections: SectionData[];
  sprints: SprintData[];
  status_counts: TaskSummary;
  unique_sections: string[];
  unique_owners: string[];
  unique_sprints: (number | 'Continuous')[];
  last_modified: string;
  generated_at: string;
}

function parseDependencies(deps: string): string[] {
  if (!deps || deps.trim() === '' || deps === '-' || deps === 'N/A') {
    return [];
  }
  return deps
    .split(/[,;\n]+/)
    .map((d) => d.trim())
    .filter((d) => d.length > 0 && d !== '-');
}

function parseArtifacts(artifacts: string): string[] {
  if (!artifacts || artifacts.trim() === '' || artifacts === '-' || artifacts === 'N/A') {
    return [];
  }
  return artifacts
    .split(/[,;\n]+/)
    .map((a) => a.trim())
    .filter((a) => a.length > 0 && a !== '-');
}

function parseSprint(sprintValue: string): number | 'Continuous' {
  if (!sprintValue || sprintValue === '') return 0;
  const str = String(sprintValue).trim();
  if (str.toLowerCase() === 'continuous') return 'Continuous';
  if (str.includes('-')) {
    const first = str.split('-')[0].trim();
    const num = Number.parseInt(first, 10);
    return Number.isNaN(num) ? 0 : num;
  }
  const num = Number.parseInt(str, 10);
  return Number.isNaN(num) ? 0 : num;
}

interface GroupData {
  total: number;
  done: number;
  in_progress: number;
  blocked: number;
  not_started: number;
}

function accumulateTaskSummary(status: TaskStatus, counts: TaskSummary): void {
  if (STATUS_GROUPS.completed.includes(status)) {
    counts.done++;
  } else if (STATUS_GROUPS.active.includes(status)) {
    counts.in_progress++;
  } else if (
    status === TASK_STATUSES.BLOCKED ||
    status === TASK_STATUSES.NEEDS_HUMAN ||
    status === TASK_STATUSES.FAILED
  ) {
    counts.blocked++;
    if (status === TASK_STATUSES.FAILED) {
      counts.failed++;
    }
  } else {
    counts.not_started++;
  }
}

function accumulateGroupData(status: TaskStatus, data: GroupData): void {
  data.total++;
  if (STATUS_GROUPS.completed.includes(status)) {
    data.done++;
  } else if (STATUS_GROUPS.active.includes(status)) {
    data.in_progress++;
  } else if (STATUS_GROUPS.blocked.includes(status)) {
    data.blocked++;
  } else {
    data.not_started++;
  }
}

function applySprintFilter(allTasks: UnifiedTask[], sprintFilter: string | null): UnifiedTask[] {
  if (sprintFilter === null || sprintFilter === 'all') return allTasks;
  if (sprintFilter === 'continuous') return allTasks.filter((t) => t.sprint === 'Continuous');
  const sprintNum = Number.parseInt(sprintFilter, 10);
  if (!Number.isNaN(sprintNum)) return allTasks.filter((t) => t.sprint === sprintNum);
  return allTasks;
}

function compareSprints(a: number | 'Continuous', b: number | 'Continuous'): number {
  if (a === 'Continuous') return 1;
  if (b === 'Continuous') return -1;
  return a - b;
}

function groupBySection(tasks: UnifiedTask[]): Map<string, SectionData> {
  const sectionMap = new Map<string, SectionData>();
  for (const task of tasks) {
    const section = task.section || 'Other';
    if (!sectionMap.has(section)) {
      sectionMap.set(section, {
        name: section,
        total: 0,
        done: 0,
        in_progress: 0,
        blocked: 0,
        not_started: 0,
        progress: 0,
      });
    }
    accumulateGroupData(task.status, sectionMap.get(section)!);
  }
  for (const data of sectionMap.values()) {
    data.progress = data.total > 0 ? Math.round((data.done / data.total) * 100) : 0;
  }
  return sectionMap;
}

function groupBySprint(tasks: UnifiedTask[]): Map<number | 'Continuous', SprintData> {
  const sprintMap = new Map<number | 'Continuous', SprintData>();
  for (const task of tasks) {
    const sprint = task.sprint;
    if (!sprintMap.has(sprint)) {
      sprintMap.set(sprint, {
        sprint,
        total: 0,
        done: 0,
        in_progress: 0,
        blocked: 0,
        not_started: 0,
        progress: 0,
      });
    }
    accumulateGroupData(task.status, sprintMap.get(sprint)!);
  }
  for (const data of sprintMap.values()) {
    data.progress = data.total > 0 ? Math.round((data.done / data.total) * 100) : 0;
  }
  return sprintMap;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sprintFilter = searchParams.get('sprint'); // Optional: filter by sprint

    const csvPath = PATHS.sprintTracking.SPRINT_PLAN_CSV;

    // Get file modification time for cache invalidation
    const fileStat = await stat(csvPath);
    const lastModified = fileStat.mtime.toISOString();

    // Read and parse CSV
    const csvContent = await readFile(csvPath, 'utf-8');
    const rows = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      relax_column_count: true,
      bom: true,
    }) as CsvRow[];

    // Transform to unified task format with normalized status
    const allTasks: UnifiedTask[] = rows
      .map((row) => ({
        id: row['Task ID'] || '',
        section: row.Section || '',
        description: row.Description || '',
        owner: row.Owner || '',
        status: normalizeStatus(row.Status || ''),
        sprint: parseSprint(row['Target Sprint']),
        dependencies: parseDependencies(row.Dependencies || ''),
        clean_dependencies: parseDependencies(row.CleanDependencies || ''),
        prerequisites: row['Pre-requisites'] || '',
        dod: row['Definition of Done'] || '',
        kpis: row.KPIs || '',
        artifacts: parseArtifacts(row['Artifacts To Track'] || ''),
        validation: row['Validation Method'] || '',
      }))
      .filter((t) => t.id); // Filter out empty rows

    // Apply sprint filter if specified
    const tasks = applySprintFilter(allTasks, sprintFilter);

    // Compute status counts using STATUS_GROUPS
    const statusCounts: TaskSummary = createEmptyTaskSummary();
    statusCounts.total = tasks.length;

    for (const task of tasks) {
      accumulateTaskSummary(task.status, statusCounts);
    }

    // Group by section and sprint
    const sectionMap = groupBySection(tasks);
    const sprintMap = groupBySprint(tasks);

    // Collect unique values
    const uniqueSections = [...new Set(tasks.map((t) => t.section))].sort((a, b) =>
      a.localeCompare(b)
    );
    const uniqueOwners = [...new Set(tasks.map((t) => t.owner))]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    const uniqueSprints = [...new Set(tasks.map((t) => t.sprint))].sort(compareSprints);

    const response: UnifiedDataResponse = {
      tasks,
      sections: Array.from(sectionMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
      sprints: Array.from(sprintMap.values()).sort((a, b) => compareSprints(a.sprint, b.sprint)),
      status_counts: statusCounts,
      unique_sections: uniqueSections,
      unique_owners: uniqueOwners,
      unique_sprints: uniqueSprints,
      last_modified: lastModified,
      generated_at: new Date().toISOString(),
    };

    return NextResponse.json(response, {
      headers: {
        ...NO_CACHE_HEADERS,
        'X-Last-Modified': lastModified,
      },
    });
  } catch (error) {
    console.error('Error fetching unified data:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch unified data',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
