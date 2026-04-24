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
  spawnClaudeExecAgent,
  spawnMatopAgent,
  processEvents,
  type SubprocessProgress,
  type SubprocessResult,
} from '../../../../lib/subprocess-spawner';
import {
  updateTaskStatus,
  canProceedToSession,
  loadTasks,
  type TaskRecord,
} from '../../../../lib/csv-status';
import { sanitizeSprintNumber } from '../../../../lib/paths';
import { basename } from 'node:path';

/**
 * Taint-breaking run-id → filename builder.
 * `path.basename` collapses any directory traversal; the regex then whitelists
 * only the characters present in a valid run-id so CodeQL's taint chain ends here.
 */
function buildSafeRunFilename(runId: string, suffix: string): string | null {
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(runId)) return null;
  const safe = basename(runId).replaceAll(/[^A-Za-z0-9._-]/g, '');
  return safe.length === 0 ? null : `${safe}${suffix}`;
}

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

function checkTaskPrerequisite(
  taskId: string,
  csvTasks: TaskRecord[],
  specifyDir: string,
  prerequisiteErrors: { taskId: string; error: string }[],
  tasksToExecute: string[]
): void {
  const csvTask = csvTasks.find((t: TaskRecord) => t['Task ID'] === taskId);
  const taskSprintNumber = Number.parseInt(csvTask?.['Target Sprint'] || '0', 10);
  const sprintDir = join(specifyDir, 'sprints', `sprint-${taskSprintNumber}`);

  const specExists =
    existsSync(join(sprintDir, 'specifications', `${taskId}-spec.md`)) ||
    existsSync(join(specifyDir, 'specifications', `${taskId}-spec.md`));
  const planExists =
    existsSync(join(sprintDir, 'planning', `${taskId}-plan.md`)) ||
    existsSync(join(specifyDir, 'planning', `${taskId}-plan.md`));

  if (!specExists) {
    prerequisiteErrors.push({ taskId, error: 'Spec required. Run SESSION 1: Spec first.' });
    return;
  }
  if (!planExists) {
    prerequisiteErrors.push({ taskId, error: 'Plan required. Run SESSION 2: Plan first.' });
    return;
  }
  if (!csvTask) {
    tasksToExecute.push(taskId);
    return;
  }
  const canProceed = canProceedToSession(csvTask, 'exec');
  if (canProceed.canProceed) {
    tasksToExecute.push(taskId);
  } else {
    prerequisiteErrors.push({ taskId, error: canProceed.reason || 'Cannot proceed to execution' });
  }
}

function applyTaskFilter(phases: ExecutionPhase[], taskFilter: string[]): ExecutionPhase[] {
  const filterSet = new Set(taskFilter);
  return phases
    .map((phase) => ({
      ...phase,
      tasks: phase.tasks.filter((t) => filterSet.has(t.taskId)),
    }))
    .filter((phase) => phase.tasks.length > 0);
}

async function collectPrerequisites(
  phases: ExecutionPhase[],
  csvTasks: TaskRecord[],
  specifyDir: string
): Promise<{ prerequisiteErrors: { taskId: string; error: string }[]; tasksToExecute: string[] }> {
  const prerequisiteErrors: { taskId: string; error: string }[] = [];
  const tasksToExecute: string[] = [];
  for (const phase of phases) {
    for (const task of phase.tasks) {
      checkTaskPrerequisite(task.taskId, csvTasks, specifyDir, prerequisiteErrors, tasksToExecute);
    }
  }
  return { prerequisiteErrors, tasksToExecute };
}

function buildDryRunResponse(opts: {
  runId: string;
  executionPlan: unknown;
  phases: ExecutionPhase[];
  totalTasks: number;
  estimatedDurationMinutes: number;
  parallelStreamCount: number;
}): NextResponse {
  const {
    runId,
    executionPlan,
    phases,
    totalTasks,
    estimatedDurationMinutes,
    parallelStreamCount,
  } = opts;
  const allTasks = phases.flatMap((p) => p.tasks);
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
      parallelStreamCount,
      sequentialPhases: phases.filter((p) => p.executionType === 'sequential').length,
      parallelPhases: phases.filter((p) => p.executionType === 'parallel').length,
      tasksByMode: {
        swarm: allTasks.filter((t) => t.executionMode === 'swarm').length,
        matop: allTasks.filter((t) => t.executionMode === 'matop').length,
        manual: allTasks.filter((t) => t.executionMode === 'manual').length,
      },
    },
  });
}

/**
 * POST /api/sprint/execute
 * Execute a sprint with computed phases
 */
async function loadSprintExecutionPlan(
  sprintNumber: number | 'all',
  taskFilter: string[] | undefined
): Promise<
  | { error: string; status: number }
  | {
      phases: ExecutionPhase[];
      parallelStreams: Awaited<ReturnType<typeof calculatePhases>>['parallelStreams'];
      projectRoot: string;
    }
> {
  const metricsDir = join(process.cwd(), 'docs', 'metrics');
  const projectRoot = join(process.cwd(), '..', '..');
  const csvPath = join(metricsDir, '_global', 'Sprint_plan.csv');
  const graphPath = join(metricsDir, '_global', 'dependency-graph.json');

  if (!existsSync(csvPath)) return { error: 'Sprint_plan.csv not found', status: 404 };
  if (!existsSync(graphPath)) {
    return { error: 'dependency-graph.json not found. Run sync first.', status: 404 };
  }

  const csvContent = await readFile(csvPath, 'utf-8');
  const { data } = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
  const tasks = data as CSVTask[];

  const graphContent = await readFile(graphPath, 'utf-8');
  const dependencyGraph: DependencyGraph = JSON.parse(graphContent);

  const { phases: initialPhases, parallelStreams } = calculatePhases(
    dependencyGraph,
    tasks,
    sprintNumber
  );
  const phases =
    taskFilter && taskFilter.length > 0
      ? applyTaskFilter(initialPhases, taskFilter)
      : initialPhases;
  return { phases, parallelStreams, projectRoot };
}

/**
 * Build the executionPlan object. Extracts the nested map/ternary tree that
 * would otherwise inflate POST's cognitive complexity.
 */
function buildExecutionPlan(args: {
  runId: string;
  sprintNumber: number | 'all';
  dryRun: boolean;
  phases: ExecutionPhase[];
  parallelStreams: Awaited<ReturnType<typeof calculatePhases>>['parallelStreams'];
  totalTasks: number;
  estimatedDurationMinutes: number;
}) {
  const {
    runId,
    sprintNumber,
    dryRun,
    phases,
    parallelStreams,
    totalTasks,
    estimatedDurationMinutes,
  } = args;
  return {
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
}

function buildInitialExecutionState(args: {
  sprintNumber: number | 'all';
  runId: string;
  startFromPhase: number;
  phases: ExecutionPhase[];
}): SprintExecutionState {
  const { sprintNumber, runId, startFromPhase, phases } = args;
  return {
    sprintNumber: typeof sprintNumber === 'number' ? sprintNumber : 0,
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
}

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
    if (sprintNumber !== 'all' && sanitizeSprintNumber(sprintNumber) === null) {
      return NextResponse.json(
        { error: 'sprintNumber must be a non-negative integer <= 999' },
        { status: 400 }
      );
    }

    const loaded = await loadSprintExecutionPlan(sprintNumber, taskFilter);
    if ('error' in loaded) {
      return NextResponse.json({ error: loaded.error }, { status: loaded.status });
    }
    let { phases } = loaded;
    const { parallelStreams, projectRoot } = loaded;

    // SESSION 3: Exec - Validate prerequisites for each task
    const specifyDir = join(projectRoot, '.specify');
    const csvTasks = await loadTasks();
    const { prerequisiteErrors, tasksToExecute } = await collectPrerequisites(
      phases,
      csvTasks,
      specifyDir
    );

    if (prerequisiteErrors.length > 0 && !dryRun) {
      return NextResponse.json(
        {
          success: false,
          error: 'Prerequisites not met for some tasks',
          prerequisiteErrors,
          message: `${prerequisiteErrors.length} task(s) missing prerequisites. Complete SESSION 1 (Spec) and SESSION 2 (Plan) first.`,
          tasksReady: tasksToExecute,
        },
        { status: 400 }
      );
    }

    // Update status to "In Progress" for all tasks that will be executed
    for (const taskId of tasksToExecute) {
      await updateTaskStatus(taskId, 'In Progress');
    }

    // Filter to phases starting from startFromPhase
    phases = phases.filter((p) => p.phaseNumber >= startFromPhase);

    // Generate run ID
    const runId = generateRunId(sprintNumber);

    // Calculate estimates
    const totalTasks = phases.reduce((sum, p) => sum + p.tasks.length, 0);
    const estimatedDurationMinutes = phases.reduce((sum, p) => sum + p.estimatedDurationMinutes, 0);

    // Create execution plan
    const executionPlan = buildExecutionPlan({
      runId,
      sprintNumber,
      dryRun,
      phases,
      parallelStreams,
      totalTasks,
      estimatedDurationMinutes,
    });

    if (dryRun) {
      return buildDryRunResponse({
        runId,
        executionPlan,
        phases,
        totalTasks,
        estimatedDurationMinutes,
        parallelStreamCount: parallelStreams.length,
      });
    }

    // Initialize execution state
    const initialState: SprintExecutionState = {
      sprintNumber: typeof sprintNumber === 'number' ? sprintNumber : 0,
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
    const runStateFilename = buildSafeRunFilename(runId, '.json');
    if (!runStateFilename) {
      return NextResponse.json({ success: false, error: 'Invalid run ID format' }, { status: 400 });
    }
    await writeFile(
      join(runsDir, runStateFilename),
      JSON.stringify(initialState, null, 2),
      'utf-8'
    );

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

  lines.push(
    '## Execution Instructions',
    '',
    `Run ID: ${runId}`,
    '',
    'Execute phases in order:',
    ''
  );

  for (const phase of phases) {
    lines.push(`### Phase ${phase.phaseNumber}: ${phase.name}`);

    if (phase.executionType === 'parallel') {
      lines.push('```bash', '# Spawn parallel sub-agents');

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

  lines.push(
    'After each task, update status:',
    '```bash',
    `curl -X POST /api/sprint/status -d '{"runId": "${runId}", "update": {"type": "task_complete", "taskId": "TASK_ID", "phaseNumber": N}}'`,
    '```'
  );

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
    const { writeFile } = await import('node:fs/promises');
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

    const runResultsFilename = buildSafeRunFilename(runId, '-results.json');
    if (runResultsFilename) {
      await writeFile(
        join(runsDir, runResultsFilename),
        JSON.stringify(finalResults, null, 2),
        'utf-8'
      );
    }
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

      const spawnFn = task.executionMode === 'swarm' ? spawnClaudeExecAgent : spawnMatopAgent;

      const result = await spawnFn({
        taskId: task.taskId,
        runId,
        onProgress,
      });

      results.set(task.taskId, result);

      if (result.success) {
        // Update CSV status to Completed
        await updateTaskStatus(task.taskId, 'Completed');

        await updateStatus({
          type: 'task_complete',
          taskId: task.taskId,
          phaseNumber: phase.phaseNumber,
        });
      } else {
        // Set status to Failed - task needs investigation/remediation
        await updateTaskStatus(task.taskId, 'Failed');

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

    const spawnFn = task.executionMode === 'swarm' ? spawnClaudeExecAgent : spawnMatopAgent;

    const result = await spawnFn({
      taskId: task.taskId,
      runId,
      onProgress,
    });

    results.set(task.taskId, result);

    if (result.success) {
      // Update CSV status to Completed
      await updateTaskStatus(task.taskId, 'Completed');

      await updateStatus({
        type: 'task_complete',
        taskId: task.taskId,
        phaseNumber: phase.phaseNumber,
      });
    } else {
      // Set status to Failed - task needs investigation/remediation
      await updateTaskStatus(task.taskId, 'Failed');

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
