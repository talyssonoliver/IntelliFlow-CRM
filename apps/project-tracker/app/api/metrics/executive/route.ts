import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import { access, readdir } from 'node:fs/promises';
import { normalizeStatus, STATUS_GROUPS } from '@/lib/csv-parser';
import { PATHS } from '@/lib/paths';
import { NO_CACHE_HEADERS } from '@/lib/api-types';

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

// Detail types for expandable metrics - using snake_case for API consistency
interface MismatchDetail {
  task_id: string;
  description: string;
  missing_artifacts: string[];
}

interface UntrackedArtifactDetail {
  path: string;
  type: 'package' | 'app' | 'infra';
}

interface ForwardDependencyDetail {
  task_id: string;
  task_description: string;
  task_sprint: number;
  depends_on: string;
  dep_sprint: number;
}

interface BottleneckDetail {
  sprint: number;
  dependency_count: number;
  blocked_tasks: string[];
}

interface TaskRequiringRevert {
  task_id: string;
  description: string;
  current_status: string;
  missing_artifacts: string[];
  missing_evidence: string[];
}

interface ExecutiveMetrics {
  total_tasks: number;
  completed: { count: number; percentage: number };
  in_progress: { count: number; percentage: number };
  backlog: { count: number; percentage: number };
  plan_vs_code_mismatches: number;
  plan_vs_code_mismatches_details: MismatchDetail[];
  tasks_requiring_revert: number;
  tasks_requiring_revert_details: TaskRequiringRevert[];
  untracked_code_artifacts: number;
  untracked_code_artifacts_details: UntrackedArtifactDetail[];
  forward_dependencies: number;
  forward_dependencies_details: ForwardDependencyDetail[];
  sprint_bottlenecks: string;
  sprint_bottlenecks_details: BottleneckDetail[];
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

// Prefixes that represent file paths to validate
const PATH_PREFIXES = ['ARTIFACT:', 'EVIDENCE:', 'SPEC:', 'PLAN:', 'CONTEXT:'] as const;
// Prefixes that are metadata/commands, not file paths
const METADATA_PREFIXES = ['VALIDATE:', 'GATE:', 'AUDIT:', 'FILE:', 'ENV:', 'POLICY:'] as const;

interface ParsedArtifacts {
  artifacts: string[]; // ARTIFACT: paths (code/config files)
  evidence: string[]; // EVIDENCE: paths (attestation files)
  specs: string[]; // SPEC: paths (specification files)
  plans: string[]; // PLAN: paths (planning files)
  contexts: string[]; // CONTEXT: paths (hydrated context files)
  raw: string[]; // All items for backward compatibility
}

function parseArtifactsWithPrefixes(artifactsStr: string): ParsedArtifacts {
  const result: ParsedArtifacts = { artifacts: [], evidence: [], specs: [], plans: [], contexts: [], raw: [] };

  if (
    !artifactsStr ||
    artifactsStr.trim() === '' ||
    artifactsStr === '-' ||
    artifactsStr === 'N/A'
  ) {
    return result;
  }

  const items = artifactsStr
    .split(/[,;\n]+/)
    .map((a) => a.trim())
    .filter((a) => a.length > 0 && a !== '-');

  for (const item of items) {
    result.raw.push(item);

    // Check for path prefixes (ARTIFACT:, EVIDENCE:, SPEC:, PLAN:)
    const pathPrefix = PATH_PREFIXES.find((prefix) => item.startsWith(prefix));
    if (pathPrefix) {
      const path = item.slice(pathPrefix.length).trim();
      if (path) {
        if (pathPrefix === 'ARTIFACT:') {
          result.artifacts.push(path);
        } else if (pathPrefix === 'EVIDENCE:') {
          result.evidence.push(path);
        } else if (pathPrefix === 'SPEC:') {
          result.specs.push(path);
        } else if (pathPrefix === 'PLAN:') {
          result.plans.push(path);
        } else if (pathPrefix === 'CONTEXT:') {
          result.contexts.push(path);
        }
      }
    }
    // Skip metadata prefixes (VALIDATE:, GATE:, AUDIT:, etc.)
    else if (METADATA_PREFIXES.some((prefix) => item.startsWith(prefix))) {
      // Intentionally skip - these are not file paths
    }
    // Legacy: items without prefix are treated as artifact paths
    else {
      result.artifacts.push(item);
    }
  }

  return result;
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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sprintParam = searchParams.get('sprint');

    const csvPath = PATHS.sprintTracking.SPRINT_PLAN_CSV;
    const csvContent = await readFile(csvPath, 'utf-8');
    let tasks = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      relax_column_count: true,
    }) as CsvTask[];

    // Filter by sprint if specified (not 'all')
    if (sprintParam && sprintParam !== 'all') {
      if (sprintParam === 'continuous') {
        tasks = tasks.filter((t) => t['Target Sprint']?.toLowerCase() === 'continuous');
      } else {
        const sprintNum = parseInt(sprintParam, 10);
        if (!isNaN(sprintNum)) {
          tasks = tasks.filter((t) => getSprintNumber(t['Target Sprint']) === sprintNum);
        }
      }
    }

    // Count statuses using shared normalizeStatus
    let completed = 0;
    let inProgress = 0;
    let backlog = 0;
    const total = tasks.length;

    for (const task of tasks) {
      const status = normalizeStatus(task.Status || '');
      if (STATUS_GROUPS.completed.includes(status)) {
        completed++;
      } else if (STATUS_GROUPS.active.includes(status)) {
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
            task_id: task['Task ID'],
            task_description: task.Description?.substring(0, 50) + '...' || '',
            task_sprint: taskSprint,
            depends_on: depId,
            dep_sprint: depSprint,
          });
        }
      }
    }

    // Calculate plan-vs-code mismatches with details
    const mismatchDetails: MismatchDetail[] = [];
    const tasksRequiringRevertDetails: TaskRequiringRevert[] = [];
    const trackedArtifacts = new Set<string>();

    for (const task of tasks) {
      const parsed = parseArtifactsWithPrefixes(task['Artifacts To Track']);
      const status = (task.Status || '').toLowerCase().trim();
      const isCompleted = status === 'completed' || status === 'done';

      // Track all artifact paths for untracked detection
      for (const artifact of parsed.artifacts) {
        trackedArtifacts.add(artifact);
      }

      // Only check completed tasks for mismatches
      const hasPathsToCheck = parsed.artifacts.length > 0 || parsed.evidence.length > 0 ||
                              parsed.specs.length > 0 || parsed.plans.length > 0 || parsed.contexts.length > 0;
      if (isCompleted && hasPathsToCheck) {
        const missingArtifacts: string[] = [];
        const missingEvidence: string[] = [];

        // Check ARTIFACT: paths
        for (const artifact of parsed.artifacts) {
          const exists = await checkArtifactExists(artifact);
          if (!exists) {
            missingArtifacts.push(artifact);
          }
        }

        // Check EVIDENCE: paths
        for (const evidence of parsed.evidence) {
          const exists = await checkArtifactExists(evidence);
          if (!exists) {
            missingEvidence.push(`EVIDENCE:${evidence}`);
          }
        }

        // Check SPEC: paths
        for (const spec of parsed.specs) {
          const exists = await checkArtifactExists(spec);
          if (!exists) {
            missingArtifacts.push(`SPEC:${spec}`);
          }
        }

        // Check PLAN: paths
        for (const plan of parsed.plans) {
          const exists = await checkArtifactExists(plan);
          if (!exists) {
            missingArtifacts.push(`PLAN:${plan}`);
          }
        }

        // Check CONTEXT: paths
        for (const context of parsed.contexts) {
          const exists = await checkArtifactExists(context);
          if (!exists) {
            missingArtifacts.push(`CONTEXT:${context}`);
          }
        }

        // If any artifacts or evidence missing, track as mismatch
        if (missingArtifacts.length > 0 || missingEvidence.length > 0) {
          // Add to mismatch details (for backward compatibility)
          mismatchDetails.push({
            task_id: task['Task ID'],
            description: task.Description?.substring(0, 50) + '...' || '',
            missing_artifacts: [
              ...missingArtifacts,
              ...missingEvidence,
            ],
          });

          // Add to tasks requiring revert (new governance feature)
          tasksRequiringRevertDetails.push({
            task_id: task['Task ID'],
            description: task.Description?.substring(0, 50) + '...' || '',
            current_status: task.Status,
            missing_artifacts: missingArtifacts.filter(a => !a.startsWith('SPEC:') && !a.startsWith('PLAN:')),
            missing_evidence: missingEvidence,
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
      dependency_count: data.count,
      blocked_tasks: data.tasks.slice(0, 10), // Limit to first 10 tasks
    }));

    const bottleneckStr =
      sortedBottlenecks.length > 0
        ? sortedBottlenecks.map(([sprint]) => sprint).join(', ')
        : 'None';

    const metrics: ExecutiveMetrics = {
      total_tasks: total,
      completed: {
        count: completed,
        percentage: total > 0 ? Math.round((completed / total) * 1000) / 10 : 0,
      },
      in_progress: {
        count: inProgress,
        percentage: total > 0 ? Math.round((inProgress / total) * 1000) / 10 : 0,
      },
      backlog: {
        count: backlog,
        percentage: total > 0 ? Math.round((backlog / total) * 1000) / 10 : 0,
      },
      plan_vs_code_mismatches: mismatchDetails.length,
      plan_vs_code_mismatches_details: mismatchDetails,
      tasks_requiring_revert: tasksRequiringRevertDetails.length,
      tasks_requiring_revert_details: tasksRequiringRevertDetails,
      untracked_code_artifacts: untrackedResult.count,
      untracked_code_artifacts_details: untrackedResult.details,
      forward_dependencies: forwardDepsDetails.length,
      forward_dependencies_details: forwardDepsDetails,
      sprint_bottlenecks: bottleneckStr,
      sprint_bottlenecks_details: bottleneckDetails,
      generated_at: new Date().toISOString(),
    };

    return NextResponse.json(metrics, {
      headers: NO_CACHE_HEADERS,
    });
  } catch (error) {
    console.error('Error calculating executive metrics:', error);
    return NextResponse.json({ error: 'Failed to calculate executive metrics' }, { status: 500 });
  }
}
