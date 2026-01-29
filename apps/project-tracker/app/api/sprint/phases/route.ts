import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Papa from 'papaparse';
import {
  calculatePhases,
  getReadyTasks,
  getBlockedTasks,
  generateAsciiGraph,
} from '../../../../lib/phase-calculator';
import type { CSVTask } from '../../../../../../tools/scripts/lib/sprint/types';

export const dynamic = 'force-dynamic';

interface DependencyNode {
  task_id: string;
  sprint: number;
  status: string;
  dependencies: string[];
  dependents: string[];
}

interface DependencyGraph {
  nodes: Record<string, DependencyNode>;
  ready_to_start: string[];
  blocked_tasks: string[];
}

/**
 * GET /api/sprint/phases
 * Get computed execution phases for a sprint
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sprintParam = searchParams.get('sprint');
    const sprintNumber = sprintParam === 'all' ? ('all' as const) : parseInt(sprintParam || '0', 10);

    const metricsDir = join(process.cwd(), 'docs', 'metrics');
    const csvPath = join(metricsDir, '_global', 'Sprint_plan.csv');
    const graphPath = join(metricsDir, '_global', 'dependency-graph.json');

    // Check required files exist
    if (!existsSync(csvPath)) {
      return NextResponse.json({ error: 'Sprint_plan.csv not found' }, { status: 404 });
    }

    if (!existsSync(graphPath)) {
      return NextResponse.json(
        { error: 'dependency-graph.json not found. Run sync first.' },
        { status: 404 }
      );
    }

    // Load CSV
    const csvContent = await readFile(csvPath, 'utf-8');
    const { data } = Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
    });
    const tasks = data as CSVTask[];

    // Load dependency graph
    const graphContent = await readFile(graphPath, 'utf-8');
    const dependencyGraph: DependencyGraph = JSON.parse(graphContent);

    // Calculate phases
    const { phases, parallelStreams } = calculatePhases(dependencyGraph, tasks, sprintNumber);

    // Get ready and blocked tasks
    const readyTasks = getReadyTasks(dependencyGraph, tasks, sprintNumber);
    const blockedTasks = getBlockedTasks(dependencyGraph, tasks, sprintNumber);

    // Generate ASCII graph
    const asciiGraph = generateAsciiGraph(phases, parallelStreams);

    // Get sprint summary (exclude completed from active totals)
    const sprintTasks =
      sprintNumber === 'all'
        ? tasks
        : tasks.filter((t) => t['Target Sprint'] === String(sprintNumber));
    const activeTasks = sprintTasks.filter(
      (t) => t.Status !== 'Done' && t.Status !== 'Completed'
    );
    const completedCount = sprintTasks.filter(
      (t) => t.Status === 'Done' || t.Status === 'Completed'
    ).length;
    const inProgressCount = sprintTasks.filter(
      (t) => t.Status === 'In Progress' || t.Status === 'Validating'
    ).length;

    return NextResponse.json({
      success: true,
      sprintNumber,
      summary: {
        totalTasks: activeTasks.length,
        completedTasks: completedCount,
        inProgressTasks: inProgressCount,
        pendingTasks: Math.max(activeTasks.length - inProgressCount, 0),
        readyToStart: readyTasks.length,
        blocked: blockedTasks.length,
      },
      phases,
      parallelStreams,
      readyTasks: readyTasks.map((t) => ({
        taskId: t.taskId,
        description: t.description,
        section: t.section,
        executionMode: t.executionMode,
      })),
      blockedTasks: blockedTasks.map((b) => ({
        taskId: b.task.taskId,
        description: b.task.description,
        blockedBy: b.blockedBy,
      })),
      dependencyGraph: {
        totalNodes: Object.keys(dependencyGraph.nodes).length,
        readyToStart: dependencyGraph.ready_to_start,
        blocked: dependencyGraph.blocked_tasks,
      },
      asciiGraph,
    });
  } catch (error) {
    console.error('Error calculating phases:', error);
    return NextResponse.json(
      {
        error: 'Failed to calculate phases',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
