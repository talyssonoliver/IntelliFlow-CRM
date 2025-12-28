import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type {
  SprintExecutionState,
  PhaseProgress,
  SubAgentInfo,
} from '../../../../../../tools/scripts/lib/sprint/types';

export const dynamic = 'force-dynamic';

// In-memory store for execution state (in production, use Redis or database)
const executionStateStore = new Map<string, SprintExecutionState>();

/**
 * GET /api/sprint/status
 * Get current execution status for a sprint run
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const runId = searchParams.get('runId');
    const sprintNumber = searchParams.get('sprint');

    // If runId provided, get specific run status
    if (runId) {
      const state = executionStateStore.get(runId);

      if (!state) {
        // Try to load from file
        const projectRoot = join(process.cwd(), '..', '..');
        const statePath = join(projectRoot, 'artifacts', 'sprint-runs', `${runId}.json`);

        if (existsSync(statePath)) {
          const content = await readFile(statePath, 'utf-8');
          const loadedState: SprintExecutionState = JSON.parse(content);

          return NextResponse.json({
            success: true,
            runId,
            state: loadedState,
            elapsedMinutes: calculateElapsedMinutes(loadedState.startedAt),
            estimatedRemainingMinutes: estimateRemainingMinutes(loadedState),
          });
        }

        return NextResponse.json({ error: `Run ${runId} not found` }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        runId,
        state,
        elapsedMinutes: calculateElapsedMinutes(state.startedAt),
        estimatedRemainingMinutes: estimateRemainingMinutes(state),
      });
    }

    // If sprint number provided, get latest run for that sprint
    if (sprintNumber) {
      const sprint = parseInt(sprintNumber, 10);
      const runs = Array.from(executionStateStore.entries())
        .filter(([, state]) => state.sprintNumber === sprint)
        .sort((a, b) => new Date(b[1].startedAt).getTime() - new Date(a[1].startedAt).getTime());

      if (runs.length === 0) {
        // Check for persisted runs
        const projectRoot = join(process.cwd(), '..', '..');
        const runsDir = join(projectRoot, 'artifacts', 'sprint-runs');

        return NextResponse.json({
          success: true,
          sprintNumber: sprint,
          activeRuns: [],
          message: 'No active runs for this sprint',
        });
      }

      const latestRun = runs[0];
      return NextResponse.json({
        success: true,
        sprintNumber: sprint,
        activeRuns: runs.map(([id, state]) => ({
          runId: id,
          status: state.status,
          startedAt: state.startedAt,
          currentPhase: state.currentPhase,
          progress: {
            completed: state.completedTasks.length,
            failed: state.failedTasks.length,
            needsHuman: state.needsHumanTasks.length,
            activeAgents: state.activeSubAgents.length,
          },
        })),
        latestRun: {
          runId: latestRun[0],
          state: latestRun[1],
          elapsedMinutes: calculateElapsedMinutes(latestRun[1].startedAt),
          estimatedRemainingMinutes: estimateRemainingMinutes(latestRun[1]),
        },
      });
    }

    // Return all active runs summary
    const allRuns = Array.from(executionStateStore.entries())
      .filter(([, state]) => state.status === 'running' || state.status === 'paused')
      .map(([id, state]) => ({
        runId: id,
        sprintNumber: state.sprintNumber,
        status: state.status,
        currentPhase: state.currentPhase,
        startedAt: state.startedAt,
        progress: {
          completed: state.completedTasks.length,
          total: state.phaseProgress.reduce((sum, p) => sum + p.totalTasks, 0),
        },
      }));

    return NextResponse.json({
      success: true,
      activeRuns: allRuns,
      totalActive: allRuns.length,
    });
  } catch (error) {
    console.error('Error getting sprint status:', error);
    return NextResponse.json(
      {
        error: 'Failed to get sprint status',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sprint/status
 * Update execution state (called by orchestrator/sub-agents)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { runId, update } = body;

    if (!runId) {
      return NextResponse.json({ error: 'runId is required' }, { status: 400 });
    }

    const existingState = executionStateStore.get(runId);

    if (!existingState && update.type !== 'init') {
      return NextResponse.json({ error: `Run ${runId} not found` }, { status: 404 });
    }

    let newState: SprintExecutionState;

    switch (update.type) {
      case 'init':
        // Initialize new run
        newState = {
          sprintNumber: update.sprintNumber,
          runId,
          startedAt: new Date().toISOString(),
          status: 'running',
          currentPhase: 0,
          totalPhases: update.totalPhases || 0,
          phaseProgress:
            update.phases?.map((p: any) => ({
              phaseNumber: p.phaseNumber,
              name: p.name,
              status: 'pending',
              totalTasks: p.tasks?.length || 0,
              completedTasks: 0,
              failedTasks: 0,
              inProgressTasks: 0,
            })) || [],
          activeSubAgents: [],
          completedTasks: [],
          failedTasks: [],
          needsHumanTasks: [],
          blockers: [],
        };
        break;

      case 'phase_start':
        newState = {
          ...existingState!,
          currentPhase: update.phaseNumber,
          phaseProgress: existingState!.phaseProgress.map((p) =>
            p.phaseNumber === update.phaseNumber
              ? { ...p, status: 'in_progress', startedAt: new Date().toISOString() }
              : p
          ),
        };
        break;

      case 'phase_complete':
        newState = {
          ...existingState!,
          phaseProgress: existingState!.phaseProgress.map((p) =>
            p.phaseNumber === update.phaseNumber
              ? { ...p, status: 'completed', completedAt: new Date().toISOString() }
              : p
          ),
        };
        break;

      case 'task_start':
        newState = {
          ...existingState!,
          phaseProgress: existingState!.phaseProgress.map((p) =>
            p.phaseNumber === update.phaseNumber
              ? { ...p, inProgressTasks: p.inProgressTasks + 1 }
              : p
          ),
        };
        break;

      case 'task_complete':
        newState = {
          ...existingState!,
          completedTasks: [...existingState!.completedTasks, update.taskId],
          phaseProgress: existingState!.phaseProgress.map((p) =>
            p.phaseNumber === update.phaseNumber
              ? {
                  ...p,
                  completedTasks: p.completedTasks + 1,
                  inProgressTasks: Math.max(0, p.inProgressTasks - 1),
                }
              : p
          ),
        };
        break;

      case 'task_failed':
        newState = {
          ...existingState!,
          failedTasks: [...existingState!.failedTasks, update.taskId],
          phaseProgress: existingState!.phaseProgress.map((p) =>
            p.phaseNumber === update.phaseNumber
              ? {
                  ...p,
                  failedTasks: p.failedTasks + 1,
                  inProgressTasks: Math.max(0, p.inProgressTasks - 1),
                }
              : p
          ),
        };
        break;

      case 'task_needs_human':
        newState = {
          ...existingState!,
          needsHumanTasks: [...existingState!.needsHumanTasks, update.taskId],
          phaseProgress: existingState!.phaseProgress.map((p) =>
            p.phaseNumber === update.phaseNumber
              ? { ...p, inProgressTasks: Math.max(0, p.inProgressTasks - 1) }
              : p
          ),
        };
        break;

      case 'agent_spawn':
        const newAgent: SubAgentInfo = {
          agentId: update.agentId,
          taskId: update.taskId,
          type: update.agentType,
          status: 'spawned',
          phase: update.phaseNumber,
          streamId: update.streamId,
          spawnedAt: new Date().toISOString(),
        };
        newState = {
          ...existingState!,
          activeSubAgents: [...existingState!.activeSubAgents, newAgent],
        };
        break;

      case 'agent_complete':
        newState = {
          ...existingState!,
          activeSubAgents: existingState!.activeSubAgents.map((a) =>
            a.agentId === update.agentId
              ? {
                  ...a,
                  status: 'completed',
                  completedAt: new Date().toISOString(),
                  output: update.output,
                }
              : a
          ),
        };
        break;

      case 'agent_failed':
        newState = {
          ...existingState!,
          activeSubAgents: existingState!.activeSubAgents.map((a) =>
            a.agentId === update.agentId
              ? {
                  ...a,
                  status: 'failed',
                  completedAt: new Date().toISOString(),
                  error: update.error,
                }
              : a
          ),
        };
        break;

      case 'blocker_raised':
        newState = {
          ...existingState!,
          blockers: [
            ...existingState!.blockers,
            {
              taskId: update.taskId,
              reason: update.reason,
              raisedAt: new Date().toISOString(),
            },
          ],
        };
        break;

      case 'blocker_resolved':
        newState = {
          ...existingState!,
          blockers: existingState!.blockers.map((b) =>
            b.taskId === update.taskId
              ? { ...b, resolvedAt: new Date().toISOString(), resolution: update.resolution }
              : b
          ),
        };
        break;

      case 'pause':
        newState = {
          ...existingState!,
          status: 'paused',
        };
        break;

      case 'resume':
        newState = {
          ...existingState!,
          status: 'running',
        };
        break;

      case 'complete':
        newState = {
          ...existingState!,
          status: 'completed',
          completedAt: new Date().toISOString(),
        };
        break;

      case 'fail':
        newState = {
          ...existingState!,
          status: 'failed',
          completedAt: new Date().toISOString(),
        };
        break;

      default:
        return NextResponse.json({ error: `Unknown update type: ${update.type}` }, { status: 400 });
    }

    // Store updated state
    executionStateStore.set(runId, newState);

    return NextResponse.json({
      success: true,
      runId,
      state: newState,
    });
  } catch (error) {
    console.error('Error updating sprint status:', error);
    return NextResponse.json(
      {
        error: 'Failed to update sprint status',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * Calculate elapsed minutes from start time
 */
function calculateElapsedMinutes(startedAt: string): number {
  const start = new Date(startedAt).getTime();
  const now = Date.now();
  return Math.round((now - start) / 60000);
}

/**
 * Estimate remaining minutes based on progress
 */
function estimateRemainingMinutes(state: SprintExecutionState): number {
  const totalTasks = state.phaseProgress.reduce((sum, p) => sum + p.totalTasks, 0);
  const completedTasks = state.completedTasks.length;

  if (completedTasks === 0) {
    // Default estimate: 15 min per task
    return totalTasks * 15;
  }

  const elapsedMinutes = calculateElapsedMinutes(state.startedAt);
  const averageMinutesPerTask = elapsedMinutes / completedTasks;
  const remainingTasks = totalTasks - completedTasks - state.failedTasks.length;

  return Math.round(remainingTasks * averageMinutesPerTask);
}

// Export for use by other modules
export { executionStateStore };
