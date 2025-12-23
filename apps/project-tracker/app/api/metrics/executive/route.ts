import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import { access, readdir } from 'node:fs/promises';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface CsvTask {
  'Task ID': string;
  Section: string;
  Description: string;
  Owner: string;
  Status: string;
  'Target Sprint': string;
  Dependencies: string;
  'Artifacts To Track': string;
  KPIs: string;
}

// Detail types for expandable metrics
interface MismatchDetail {
  taskId: string;
  description: string;
  missingArtifacts: string[];
}

interface UntrackedArtifactDetail {
  path: string;
  type: 'package' | 'app' | 'infra';
}

interface ForwardDependencyDetail {
  taskId: string;
  taskDescription: string;
  taskSprint: number;
  dependsOn: string;
  depSprint: number;
}

interface BottleneckDetail {
  sprint: number;
  dependencyCount: number;
  blockedTasks: string[];
}

interface ExecutiveMetrics {
  totalTasks: number;
  completed: { count: number; percentage: number };
  inProgress: { count: number; percentage: number };
  backlog: { count: number; percentage: number };
  planVsCodeMismatches: number;
  planVsCodeMismatchesDetails: MismatchDetail[];
  untrackedCodeArtifacts: number;
  untrackedCodeArtifactsDetails: UntrackedArtifactDetail[];
  forwardDependencies: number;
  forwardDependenciesDetails: ForwardDependencyDetail[];
  sprintBottlenecks: string;
  sprintBottlenecksDetails: BottleneckDetail[];
  generatedAt: string;
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

function getSprintNumber(sprint: string): number | null {
  if (!sprint || sprint === 'Continuous' || sprint === '-') {
    return null;
  }
  const num = parseInt(sprint, 10);
  return isNaN(num) ? null : num;
}

async function checkArtifactExists(artifactPath: string): Promise<boolean> {
  try {
    // Handle glob patterns by checking if any matching file exists
    if (artifactPath.includes('*')) {
      // For patterns, just check if parent directory exists
      const parentDir = artifactPath.split('*')[0].replace(/\/+$/, '');
      if (parentDir) {
        await access(join(process.cwd(), '..', '..', parentDir));
        return true;
      }
      return false;
    }
    await access(join(process.cwd(), '..', '..', artifactPath));
    return true;
  } catch {
    return false;
  }
}

async function getUntrackedArtifactsWithDetails(
  trackedArtifacts: Set<string>
): Promise<{ count: number; details: UntrackedArtifactDetail[] }> {
  const keyDirs: Array<{ dir: string; type: 'package' | 'app' | 'infra' }> = [
    { dir: 'packages', type: 'package' },
    { dir: 'apps', type: 'app' },
    { dir: 'infra', type: 'infra' },
  ];
  const details: UntrackedArtifactDetail[] = [];

  for (const { dir, type } of keyDirs) {
    try {
      const dirPath = join(process.cwd(), '..', '..', dir);
      await access(dirPath);

      const entries = await readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const srcPath = `${dir}/${entry.name}/src`;
          const packagePath = `${dir}/${entry.name}`;

          // Check if this package/app is tracked
          let isTracked = false;
          for (const tracked of trackedArtifacts) {
            if (tracked.startsWith(packagePath) || tracked.startsWith(srcPath)) {
              isTracked = true;
              break;
            }
          }

          if (!isTracked) {
            try {
              await access(join(process.cwd(), '..', '..', srcPath));
              details.push({ path: packagePath, type });
            } catch {
              // src doesn't exist, skip
            }
          }
        }
      }
    } catch {
      // Directory doesn't exist, skip
    }
  }

  return { count: details.length, details };
}

export async function GET() {
  try {
    const csvPath = join(process.cwd(), 'docs', 'metrics', '_global', 'Sprint_plan.csv');
    const csvContent = await readFile(csvPath, 'utf-8');
    const tasks = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      relax_column_count: true,
    }) as CsvTask[];

    // Count statuses
    let completed = 0;
    let inProgress = 0;
    let backlog = 0;
    const total = tasks.length;

    for (const task of tasks) {
      const status = (task.Status || '').toLowerCase().trim();
      if (status === 'completed' || status === 'done') {
        completed++;
      } else if (status === 'in progress' || status === 'in_progress' || status === 'validating') {
        inProgress++;
      } else {
        backlog++;
      }
    }

    // Build task maps for lookups
    const taskSprintMap = new Map<string, number | null>();
    const taskDescriptionMap = new Map<string, string>();

    for (const task of tasks) {
      taskSprintMap.set(task['Task ID'], getSprintNumber(task['Target Sprint']));
      taskDescriptionMap.set(task['Task ID'], task.Description || '');
    }

    // Calculate forward dependencies with details
    const forwardDepsDetails: ForwardDependencyDetail[] = [];

    for (const task of tasks) {
      const taskSprint = getSprintNumber(task['Target Sprint']);
      if (taskSprint === null) continue;

      const deps = parseDependencies(task.Dependencies);
      for (const depId of deps) {
        const depSprint = taskSprintMap.get(depId);
        if (depSprint !== null && depSprint !== undefined && depSprint > taskSprint) {
          forwardDepsDetails.push({
            taskId: task['Task ID'],
            taskDescription: task.Description?.substring(0, 50) + '...' || '',
            taskSprint,
            dependsOn: depId,
            depSprint,
          });
        }
      }
    }

    // Calculate plan-vs-code mismatches with details
    const mismatchDetails: MismatchDetail[] = [];
    const trackedArtifacts = new Set<string>();

    for (const task of tasks) {
      const artifacts = parseArtifacts(task['Artifacts To Track']);
      const status = (task.Status || '').toLowerCase().trim();
      const isCompleted = status === 'completed' || status === 'done';

      for (const artifact of artifacts) {
        trackedArtifacts.add(artifact);
      }

      // Only check completed tasks for mismatches
      if (isCompleted && artifacts.length > 0) {
        const missingArtifacts: string[] = [];
        for (const artifact of artifacts) {
          const exists = await checkArtifactExists(artifact);
          if (!exists) {
            missingArtifacts.push(artifact);
          }
        }
        if (missingArtifacts.length > 0) {
          mismatchDetails.push({
            taskId: task['Task ID'],
            description: task.Description?.substring(0, 50) + '...' || '',
            missingArtifacts,
          });
        }
      }
    }

    // Calculate untracked artifacts with details
    const untrackedResult = await getUntrackedArtifactsWithDetails(trackedArtifacts);

    // Calculate sprint bottlenecks with details
    const sprintDepCounts = new Map<number, { count: number; tasks: string[] }>();

    for (const task of tasks) {
      const deps = parseDependencies(task.Dependencies);
      for (const depId of deps) {
        const depSprint = taskSprintMap.get(depId);
        if (depSprint !== null && depSprint !== undefined) {
          const current = sprintDepCounts.get(depSprint) || { count: 0, tasks: [] };
          current.count++;
          if (!current.tasks.includes(task['Task ID'])) {
            current.tasks.push(task['Task ID']);
          }
          sprintDepCounts.set(depSprint, current);
        }
      }
    }

    // Sort and get top bottleneck sprints
    const sortedBottlenecks = Array.from(sprintDepCounts.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5);

    const bottleneckDetails: BottleneckDetail[] = sortedBottlenecks.map(([sprint, data]) => ({
      sprint,
      dependencyCount: data.count,
      blockedTasks: data.tasks.slice(0, 10), // Limit to first 10 tasks
    }));

    const bottleneckStr =
      sortedBottlenecks.length > 0
        ? sortedBottlenecks.map(([sprint]) => sprint).join(', ')
        : 'None';

    const metrics: ExecutiveMetrics = {
      totalTasks: total,
      completed: {
        count: completed,
        percentage: total > 0 ? Math.round((completed / total) * 1000) / 10 : 0,
      },
      inProgress: {
        count: inProgress,
        percentage: total > 0 ? Math.round((inProgress / total) * 1000) / 10 : 0,
      },
      backlog: {
        count: backlog,
        percentage: total > 0 ? Math.round((backlog / total) * 1000) / 10 : 0,
      },
      planVsCodeMismatches: mismatchDetails.length,
      planVsCodeMismatchesDetails: mismatchDetails,
      untrackedCodeArtifacts: untrackedResult.count,
      untrackedCodeArtifactsDetails: untrackedResult.details,
      forwardDependencies: forwardDepsDetails.length,
      forwardDependenciesDetails: forwardDepsDetails,
      sprintBottlenecks: bottleneckStr,
      sprintBottlenecksDetails: bottleneckDetails,
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(metrics, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0',
      },
    });
  } catch (error) {
    console.error('Error calculating executive metrics:', error);
    return NextResponse.json(
      { error: 'Failed to calculate executive metrics' },
      { status: 500 }
    );
  }
}
