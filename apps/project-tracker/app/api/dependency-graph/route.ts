import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface DependencyNode {
  task_id: string;
  sprint: number;
  status: string;
  dependencies: string[];
  dependents: string[];
}

interface DependencyGraph {
  version: string;
  last_updated: string;
  description: string;
  nodes: Record<string, DependencyNode>;
  ready_to_start: string[];
  blocked_tasks: string[];
  critical_paths: Array<{
    name: string;
    tasks: string[];
    total_duration_estimate_minutes: number;
    completion_percentage: number;
    blocking_status: string;
  }>;
  cross_sprint_dependencies: Array<{
    from_task: string;
    to_task: string;
    from_sprint: number;
    to_sprint: number;
    dependency_type: string;
  }>;
  dependency_violations: Array<{
    task_id: string;
    violation: string;
  }>;
  parallel_execution_groups: Record<string, Record<string, string[]>>;
}

interface CsvTask {
  'Task ID': string;
  Section: string;
  Description: string;
  Owner: string;
  Status: string;
  'Target Sprint': string;
  Dependencies?: string;
  CleanDependencies?: string;
}

interface ReadyTaskDetail {
  taskId: string;
  sprint: number;
  description: string;
  section: string;
  owner: string;
  dependencies: string[];
  dependencyStatus: string;
  status?: string;
}

interface BlockedTaskDetail {
  taskId: string;
  sprint: number;
  description: string;
  section: string;
  blockedBy: string[];
  pendingDeps: Array<{
    taskId: string;
    status: string;
  }>;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sprintParam = searchParams.get('sprint');

    const metricsDir = join(process.cwd(), 'docs', 'metrics');
    const graphPath = join(metricsDir, '_global', 'dependency-graph.json');
    const csvPath = join(metricsDir, '_global', 'Sprint_plan.csv');

    // Read the dependency graph
    let graph: DependencyGraph;
    try {
      const graphContent = await readFile(graphPath, 'utf-8');
      graph = JSON.parse(graphContent);
    } catch {
      return NextResponse.json(
        { error: 'Dependency graph not found. Run sync first.' },
        { status: 404 }
      );
    }

    // Read CSV for task descriptions
    const taskDescriptions: Record<
      string,
      { description: string; section: string; owner: string }
    > = {};
    try {
      const csvContent = await readFile(csvPath, 'utf-8');
      const tasks = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        relax_quotes: true,
        relax_column_count: true,
      }) as CsvTask[];

      for (const task of tasks) {
        if (task['Task ID']) {
          taskDescriptions[task['Task ID']] = {
            description: task.Description || '',
            section: task.Section || '',
            owner: task.Owner || '',
          };
        }
      }
    } catch (csvErr) {
      console.warn('Could not load task descriptions from CSV:', csvErr);
    }

    // Filter out tasks that should not be started (safety against stale graph data)
    const readyCandidates = graph.ready_to_start.filter((taskId) => {
      const status = graph.nodes[taskId]?.status;
      return status !== 'IN_PROGRESS' && status !== 'DONE' && status !== 'FAILED';
    });

    // Enrich ready_to_start with task details
    const readyToStartDetails: ReadyTaskDetail[] = readyCandidates.map((taskId) => {
      const node = graph.nodes[taskId];
      const desc = taskDescriptions[taskId] || { description: '', section: '', owner: '' };

      return {
        taskId,
        sprint: node?.sprint ?? 0,
        description: desc.description,
        section: desc.section,
        owner: desc.owner,
        dependencies: node?.dependencies || [],
        dependencyStatus: 'All dependencies complete',
        status: node?.status,
      };
    });

    // Enrich blocked_tasks with details
    const blockedTasksDetails: BlockedTaskDetail[] = graph.blocked_tasks.map((taskId) => {
      const node = graph.nodes[taskId];
      const desc = taskDescriptions[taskId] || { description: '', section: '', owner: '' };

      // Find which dependencies are not done
      const pendingDeps = (node?.dependencies || [])
        .filter((depId) => {
          const depNode = graph.nodes[depId];
          return depNode && depNode.status !== 'DONE';
        })
        .map((depId) => ({
          taskId: depId,
          status: graph.nodes[depId]?.status || 'UNKNOWN',
        }));

      return {
        taskId,
        sprint: node?.sprint ?? 0,
        description: desc.description,
        section: desc.section,
        blockedBy: pendingDeps.map((d) => d.taskId),
        pendingDeps,
      };
    });

    // Group ready tasks by sprint
    const readyBySprint: Record<number, ReadyTaskDetail[]> = {};
    for (const task of readyToStartDetails) {
      const sprint = task.sprint;
      if (!readyBySprint[sprint]) {
        readyBySprint[sprint] = [];
      }
      readyBySprint[sprint].push(task);
    }

    // Apply sprint filter if specified
    let filteredReadyDetails = readyToStartDetails;
    let filteredBlockedDetails = blockedTasksDetails;
    let filteredReadyBySprint = readyBySprint;

    if (sprintParam && sprintParam !== 'all') {
      const targetSprint = parseInt(sprintParam, 10);
      if (!isNaN(targetSprint)) {
        filteredReadyDetails = readyToStartDetails.filter((t) => t.sprint === targetSprint);
        filteredBlockedDetails = blockedTasksDetails.filter((t) => t.sprint === targetSprint);
        filteredReadyBySprint = {};
        if (readyBySprint[targetSprint]) {
          filteredReadyBySprint[targetSprint] = readyBySprint[targetSprint];
        }
      }
    }

    // Find next actionable sprint (lowest sprint number with ready tasks)
    const sprintNumbers = Object.keys(filteredReadyBySprint)
      .map(Number)
      .filter((s) => s >= 0)
      .sort((a, b) => a - b);
    const nextSprint = sprintNumbers.length > 0 ? sprintNumbers[0] : null;

    // Calculate summary stats (for filtered data if sprint specified)
    const totalNodes = Object.keys(graph.nodes).length;
    const doneNodes = Object.values(graph.nodes).filter((n) => n.status === 'DONE').length;
    const inProgressNodes = Object.values(graph.nodes).filter(
      (n) => n.status === 'IN_PROGRESS'
    ).length;

    const response = {
      ...graph,
      ready_to_start: filteredReadyDetails.map((t) => t.taskId),
      ready_to_start_details: filteredReadyDetails,
      ready_by_sprint: filteredReadyBySprint,
      blocked_tasks: filteredBlockedDetails.map((t) => t.taskId),
      blocked_tasks_details: filteredBlockedDetails,
      summary: {
        total_tasks: totalNodes,
        completed_tasks: doneNodes,
        in_progress_tasks: inProgressNodes,
        ready_count: filteredReadyDetails.length,
        blocked_count: filteredBlockedDetails.length,
        next_sprint: nextSprint,
        completion_percentage:
          totalNodes > 0 ? Math.round((doneNodes / totalNodes) * 100 * 10) / 10 : 0,
      },
      violations_count: graph.dependency_violations?.length || 0,
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0',
      },
    });
  } catch (error) {
    console.error('Error reading dependency graph:', error);
    return NextResponse.json({ error: 'Failed to load dependency graph' }, { status: 500 });
  }
}
