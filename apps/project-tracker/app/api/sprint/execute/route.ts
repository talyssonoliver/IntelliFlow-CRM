import { NextResponse } from 'next/server';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Papa from 'papaparse';
import { calculatePhases } from '../../../../lib/phase-calculator';
import { generateRunId } from '../../../../../../tools/scripts/lib/sprint/types';
import type {
  CSVTask,
  ExecutionPhase,
  SprintExecutionState,
} from '../../../../../../tools/scripts/lib/sprint/types';
import {
  spawnSwarmAgent,
  spawnMatopAgent,
  processEvents,
  type SubprocessProgress,
  type SubprocessResult,
} from '../../../../lib/subprocess-spawner';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max for API response

interface ExecuteRequest {
  sprintNumber: number | 'all';
  dryRun?: boolean;
  autoExecute?: boolean; // If true, spawn subprocesses to execute tasks
  startFromPhase?: number;
  taskFilter?: string[];
}

interface DependencyGraph {
  nodes: Record<
    string,
    {
      task_id: string;
      sprint: number;
      status: string;
      dependencies: string[];
      dependents: string[];
    }
  >;
  ready_to_start: string[];
  blocked_tasks: string[];
}

/**
 * POST /api/sprint/execute
 * Execute a sprint with computed phases
 */
export async function POST(request: Request) {
  try {
    const body: ExecuteRequest = await request.json();
    const {
      sprintNumber,
      dryRun = false,
      autoExecute = false,
      startFromPhase = 0,
      taskFilter,
    } = body;

    if (sprintNumber === undefined || sprintNumber === null) {
      return NextResponse.json({ error: 'sprintNumber is required' }, { status: 400 });
    }

    const includeAll = sprintNumber === 'all';

    const metricsDir = join(process.cwd(), 'docs', 'metrics');
    const projectRoot = join(process.cwd(), '..', '..');
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
    let { phases, parallelStreams } = calculatePhases(dependencyGraph, tasks, sprintNumber);

    // Apply task filter if provided
    if (taskFilter && taskFilter.length > 0) {
      const filterSet = new Set(taskFilter);
      phases = phases
        .map((phase) => ({
          ...phase,
          tasks: phase.tasks.filter((t) => filterSet.has(t.taskId)),
        }))
        .filter((phase) => phase.tasks.length > 0);
    }

    // Filter to phases starting from startFromPhase
    phases = phases.filter((p) => p.phaseNumber >= startFromPhase);

    // Generate run ID
    const runId = generateRunId(sprintNumber);

    // Calculate estimates
    const totalTasks = phases.reduce((sum, p) => sum + p.tasks.length, 0);
    const estimatedDurationMinutes = phases.reduce((sum, p) => sum + p.estimatedDurationMinutes, 0);

    // Create execution plan
    const executionPlan = {
      runId,
      sprintNumber,
      dryRun,
      startedAt: new Date().toISOString(),
      phases: phases.map((phase) => ({
        phaseNumber: phase.phaseNumber,
        name: phase.name,
        executionType: phase.executionType,
        taskCount: phase.tasks.length,
        tasks: phase.tasks.map((t) => ({
          taskId: t.taskId,
          description: t.description,
          executionMode: t.executionMode,
          parallelStreamId: t.parallelStreamId,
          dependencies: t.dependencies,
        })),
        parallelStreams:
          phase.executionType === 'parallel'
            ? [...new Set(phase.tasks.map((t) => t.parallelStreamId).filter(Boolean))]
            : [],
      })),
      parallelStreams: parallelStreams.filter((s) =>
        phases.some((p) => p.tasks.some((t) => t.parallelStreamId === s.streamId.split('-').pop()))
      ),
      totalTasks,
      estimatedDurationMinutes,
    };

    if (dryRun) {
      // Just return the execution plan without actually executing
      return NextResponse.json({
        success: true,
        dryRun: true,
        runId,
        message: 'Dry run completed. No tasks were executed.',
        executionPlan,
        summary: {
          totalPhases: phases.length,
          totalTasks,
          estimatedDurationMinutes,
          parallelStreamCount: parallelStreams.length,
          sequentialPhases: phases.filter((p) => p.executionType === 'sequential').length,
          parallelPhases: phases.filter((p) => p.executionType === 'parallel').length,
          tasksByMode: {
            swarm: phases.flatMap((p) => p.tasks).filter((t) => t.executionMode === 'swarm').length,
            matop: phases.flatMap((p) => p.tasks).filter((t) => t.executionMode === 'matop').length,
            manual: phases.flatMap((p) => p.tasks).filter((t) => t.executionMode === 'manual')
              .length,
          },
        },
      });
    }

    // Initialize execution state
    const initialState: SprintExecutionState = {
      sprintNumber,
      runId,
      startedAt: new Date().toISOString(),
      status: 'running',
      currentPhase: startFromPhase,
      totalPhases: phases.length,
      phaseProgress: phases.map((p) => ({
        phaseNumber: p.phaseNumber,
        name: p.name,
        status: 'pending',
        totalTasks: p.tasks.length,
        completedTasks: 0,
        failedTasks: 0,
        inProgressTasks: 0,
      })),
      activeSubAgents: [],
      completedTasks: [],
      failedTasks: [],
      needsHumanTasks: [],
      blockers: [],
    };

    // Save execution state
    const runsDir = join(projectRoot, 'artifacts', 'sprint-runs');
    await mkdir(runsDir, { recursive: true });
    await writeFile(join(runsDir, `${runId}.json`), JSON.stringify(initialState, null, 2), 'utf-8');

    // Initialize run in status store via API call
    const baseUrl = getBaseUrl(request);
    await fetch(`${baseUrl}/api/sprint/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runId,
        update: {
          type: 'init',
          sprintNumber,
          totalPhases: phases.length,
          phases: phases.map((p) => ({
            phaseNumber: p.phaseNumber,
            name: p.name,
            tasks: p.tasks,
          })),
        },
      }),
    });

    // If autoExecute is true, start executing tasks in the background
    if (autoExecute) {
      // Start execution in background (don't await)
      executeSprintAsync(phases, runId, baseUrl, runsDir).catch((err) => {
        console.error('Background execution error:', err);
      });

      return NextResponse.json({
        success: true,
        dryRun: false,
        autoExecute: true,
        runId,
        message: `Sprint ${sprintNumber} execution started automatically. Use /api/sprint/status?runId=${runId} to track progress.`,
        executionPlan,
        statusUrl: `/api/sprint/status?runId=${runId}`,
        eventsUrl: `/api/sprint/events?runId=${runId}`,
      });
    }

    // Return execution details for manual execution
    return NextResponse.json({
      success: true,
      dryRun: false,
      autoExecute: false,
      runId,
      message: `Sprint ${sprintNumber} execution initialized. Use /api/sprint/status?runId=${runId} to track progress.`,
      executionPlan,
      statusUrl: `/api/sprint/status?runId=${runId}`,
      instructions: generateExecutionInstructions(phases, runId),
    });
  } catch (error) {
    console.error('Error executing sprint:', error);
    return NextResponse.json(
      {
        error: 'Failed to execute sprint',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/sprint/execute
 * Get info about sprint execution
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/sprint/execute',
    method: 'POST',
    description: 'Execute a sprint with computed phases',
    parameters: {
      sprintNumber: {
        type: 'number',
        required: true,
        description: 'The sprint number to execute',
      },
      dryRun: {
        type: 'boolean',
        default: false,
        description: 'If true, returns execution plan without actually executing',
      },
      startFromPhase: {
        type: 'number',
        default: 0,
        description: 'Phase number to start execution from',
      },
      taskFilter: {
        type: 'string[]',
        required: false,
        description: 'Optional list of specific task IDs to execute',
      },
    },
    example: {
      request: {
        sprintNumber: 1,
        dryRun: true,
      },
      response: {
        success: true,
        dryRun: true,
        runId: 'sprint1-20251225T143000-abc123',
        executionPlan: '...',
      },
    },
  });
}

/**
 * Generate execution instructions for Claude Code
 */
function generateExecutionInstructions(phases: ExecutionPhase[], runId: string): string {
  const lines: string[] = [];

  lines.push('## Execution Instructions');
  lines.push('');
  lines.push(`Run ID: ${runId}`);
  lines.push('');
  lines.push('Execute phases in order:');
  lines.push('');

  for (const phase of phases) {
    lines.push(`### Phase ${phase.phaseNumber}: ${phase.name}`);

    if (phase.executionType === 'parallel') {
      lines.push('```bash');
      lines.push('# Spawn parallel sub-agents');

      const streams = new Set(phase.tasks.map((t) => t.parallelStreamId).filter(Boolean));
      for (const streamId of streams) {
        const streamTasks = phase.tasks.filter((t) => t.parallelStreamId === streamId);
        const taskIds = streamTasks.map((t) => t.taskId).join(', ');
        lines.push(`Task("${streamId}", "Execute: ${taskIds}") &`);
      }

      lines.push('```');
    } else {
      lines.push('Execute sequentially:');
      for (const task of phase.tasks) {
        lines.push(
          `- [ ] ${task.taskId}: ${task.description.slice(0, 50)}... (${task.executionMode})`
        );
      }
    }

    lines.push('');
  }

  lines.push('After each task, update status:');
  lines.push('```bash');
  lines.push(
    `curl -X POST /api/sprint/status -d '{"runId": "${runId}", "update": {"type": "task_complete", "taskId": "TASK_ID", "phaseNumber": N}}'`
  );
  lines.push('```');

  return lines.join('\n');
}

/**
 * Get base URL from request
 */
function getBaseUrl(request: Request): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

/**
 * Execute sprint phases asynchronously in the background
 */
async function executeSprintAsync(
  phases: ExecutionPhase[],
  runId: string,
  baseUrl: string,
  runsDir: string
): Promise<void> {
  const results: Map<string, SubprocessResult> = new Map();

  // Update status helper
  const updateStatus = async (update: Record<string, unknown>) => {
    try {
      await fetch(`${baseUrl}/api/sprint/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId, update }),
      });
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  // Progress callback
  const onProgress = (progress: SubprocessProgress) => {
    // Emit event for SSE endpoint to pick up
    processEvents.emit('task_progress', progress);
  };

  try {
    for (const phase of phases) {
      // Update phase status to in_progress
      await updateStatus({
        type: 'phase_start',
        phaseNumber: phase.phaseNumber,
      });

      if (phase.executionType === 'parallel') {
        // Execute tasks in parallel with concurrency limit
        await executeParallelPhase(phase, runId, updateStatus, onProgress, results);
      } else {
        // Execute tasks sequentially
        await executeSequentialPhase(phase, runId, updateStatus, onProgress, results);
      }

      // Update phase status to completed
      await updateStatus({
        type: 'phase_complete',
        phaseNumber: phase.phaseNumber,
      });
    }

    // Mark execution as complete
    await updateStatus({ type: 'complete' });

    // Save final results to file
    const { writeFile } = await import('fs/promises');
    const finalResults = {
      runId,
      completedAt: new Date().toISOString(),
      results: Object.fromEntries(results),
      summary: {
        total: results.size,
        success: Array.from(results.values()).filter((r) => r.success).length,
        failed: Array.from(results.values()).filter((r) => !r.success).length,
      },
    };

    await writeFile(
      join(runsDir, `${runId}-results.json`),
      JSON.stringify(finalResults, null, 2),
      'utf-8'
    );
  } catch (error) {
    console.error('Sprint execution error:', error);
    await updateStatus({
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Execute a phase's tasks in parallel
 */
async function executeParallelPhase(
  phase: ExecutionPhase,
  runId: string,
  updateStatus: (update: Record<string, unknown>) => Promise<void>,
  onProgress: (progress: SubprocessProgress) => void,
  results: Map<string, SubprocessResult>
): Promise<void> {
  const MAX_CONCURRENCY = 4;

  // Filter out manual tasks
  const executableTasks = phase.tasks.filter((t) => t.executionMode !== 'manual');
  const manualTasks = phase.tasks.filter((t) => t.executionMode === 'manual');

  // Mark manual tasks as needs_human
  for (const task of manualTasks) {
    await updateStatus({
      type: 'task_needs_human',
      taskId: task.taskId,
      phaseNumber: phase.phaseNumber,
      reason: 'Manual task requires human intervention',
    });
  }

  // Execute in batches
  for (let i = 0; i < executableTasks.length; i += MAX_CONCURRENCY) {
    const batch = executableTasks.slice(i, i + MAX_CONCURRENCY);

    const batchPromises = batch.map(async (task) => {
      await updateStatus({
        type: 'task_start',
        taskId: task.taskId,
        phaseNumber: phase.phaseNumber,
      });

      const spawnFn = task.executionMode === 'swarm' ? spawnSwarmAgent : spawnMatopAgent;

      const result = await spawnFn({
        taskId: task.taskId,
        runId,
        onProgress,
      });

      results.set(task.taskId, result);

      if (result.success) {
        await updateStatus({
          type: 'task_complete',
          taskId: task.taskId,
          phaseNumber: phase.phaseNumber,
        });
      } else {
        await updateStatus({
          type: 'task_failed',
          taskId: task.taskId,
          phaseNumber: phase.phaseNumber,
          error: result.error || result.stderr,
        });
      }

      return { taskId: task.taskId, result };
    });

    await Promise.all(batchPromises);
  }
}

/**
 * Execute a phase's tasks sequentially
 */
async function executeSequentialPhase(
  phase: ExecutionPhase,
  runId: string,
  updateStatus: (update: Record<string, unknown>) => Promise<void>,
  onProgress: (progress: SubprocessProgress) => void,
  results: Map<string, SubprocessResult>
): Promise<void> {
  for (const task of phase.tasks) {
    if (task.executionMode === 'manual') {
      await updateStatus({
        type: 'task_needs_human',
        taskId: task.taskId,
        phaseNumber: phase.phaseNumber,
        reason: 'Manual task requires human intervention',
      });
      continue;
    }

    await updateStatus({
      type: 'task_start',
      taskId: task.taskId,
      phaseNumber: phase.phaseNumber,
    });

    const spawnFn = task.executionMode === 'swarm' ? spawnSwarmAgent : spawnMatopAgent;

    const result = await spawnFn({
      taskId: task.taskId,
      runId,
      onProgress,
    });

    results.set(task.taskId, result);

    if (result.success) {
      await updateStatus({
        type: 'task_complete',
        taskId: task.taskId,
        phaseNumber: phase.phaseNumber,
      });
    } else {
      await updateStatus({
        type: 'task_failed',
        taskId: task.taskId,
        phaseNumber: phase.phaseNumber,
        error: result.error || result.stderr,
      });

      // For sequential phases, stop on first failure
      break;
    }
  }
}
