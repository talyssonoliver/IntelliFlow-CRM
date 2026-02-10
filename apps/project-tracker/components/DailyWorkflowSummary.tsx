'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Icon } from '@/lib/icons';
import { Task, SprintNumber } from '@/lib/types';
import {
  SessionOutputModal,
  useSessionPolling,
  type SessionType,
} from './SessionOutputModal';
import {
  computePriorityScores,
  type ScoredTask,
  type DepGraphNode,
  type SessionStatus,
  type ScheduleTaskInfo,
  type PhaseProgress,
} from '@/lib/priority-scorer';

interface DailyWorkflowSummaryProps {
  tasks: Task[];
  sprint: SprintNumber;
  onTaskClick?: (task: Task) => void;
}

interface TaskWorkflowStatus {
  taskId: string;
  description: string;
  section: string;
  owner: string;
  sprint: number;
  status: string;
  // Session statuses
  hasContext: boolean;
  hasSpec: boolean;
  hasPlan: boolean;
  hasDelivery: boolean;
  // Current session
  currentSession: 'ready' | 'spec' | 'plan' | 'exec' | 'completed';
  // Dependencies
  dependenciesMet: boolean;
  dependencies: string[];
}

/**
 * Optimistic UI state for a task being processed
 */
interface OptimisticState {
  taskId: string;
  expectedStatus: string;
  expectedSession: 'spec' | 'plan' | 'exec' | 'completed';
  startedAt: number;
}

interface WorkflowData {
  // Morning: Task Selection
  readyTasks: TaskWorkflowStatus[];
  inProgressTasks: TaskWorkflowStatus[];
  // Session breakdown
  awaitingSpec: TaskWorkflowStatus[];
  awaitingPlan: TaskWorkflowStatus[];
  awaitingExec: TaskWorkflowStatus[];
  // End of day
  completedToday: TaskWorkflowStatus[];
  blockedTasks: TaskWorkflowStatus[];
  // Priority-scored tasks (NOW / NEXT / WAIT)
  scoredTasks: ScoredTask[];
}

/**
 * Daily Workflow Summary - Follows Workflow.txt Structure
 *
 * MORNING: Task Selection
 * - Load Sprint_plan.csv
 * - Filter tasks where dependencies are complete
 * - Present ready tasks for the day
 *
 * FOR EACH READY TASK:
 * - SESSION 1: Spec (context hydration → agent selection → spec generation)
 * - SESSION 2: Plan (load spec → create execution plan)
 * - SESSION 3: Exec (execute → validate → delivery report)
 *
 * END OF DAY: Status Update
 * - Update Sprint_plan.csv
 * - Re-calculate ready tasks
 * - Generate daily summary
 */
export function DailyWorkflowSummary({
  tasks,
  sprint,
  onTaskClick,
}: DailyWorkflowSummaryProps) {
  const [workflowData, setWorkflowData] = useState<WorkflowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ success: boolean; message: string } | null>(null);

  // Optimistic UI state - tracks tasks being processed
  const [optimisticUpdates, setOptimisticUpdates] = useState<Map<string, OptimisticState>>(new Map());

  // Session modal state
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [activeSession, setActiveSession] = useState<{
    sessionId: string | null;
    taskId: string;
    sessionType: SessionType;
    isSwarm: boolean;
  } | null>(null);

  // Session polling for real-time output
  const sessionPolling = useSessionPolling({
    sessionId: activeSession?.sessionId ?? null,
    taskId: activeSession?.taskId ?? '',
    sessionType: activeSession?.sessionType ?? 'spec',
    enabled: showSessionModal && activeSession !== null,
    pollInterval: activeSession?.isSwarm ? 5000 : 3000, // Swarm polls less frequently
  });

  // Fetch workflow status for all tasks
  const fetchWorkflowData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const sprintParam = sprint === 'all' ? 'all' : sprint;

      // Fetch dependency graph, critical path, schedule calculate, and sprint progress in parallel
      const [graphRes, criticalPathRes, scheduleCalcRes, sprintProgressRes] = await Promise.all([
        fetch(`/api/dependency-graph?sprint=${sprintParam}`),
        fetch(`/api/schedule/critical-path?sprint=${sprintParam}`).catch(() => null),
        fetch(`/api/schedule/calculate?sprint=${sprintParam}`).catch(() => null),
        fetch(`/api/sprint/progress?sprint=${sprintParam}`).catch(() => null),
      ]);

      const graphData = await graphRes.json();
      const criticalPathData = criticalPathRes ? await criticalPathRes.json().catch(() => null) : null;
      const scheduleCalcData = scheduleCalcRes ? await scheduleCalcRes.json().catch(() => null) : null;
      const sprintProgressData = sprintProgressRes ? await sprintProgressRes.json().catch(() => null) : null;

      // Build dep graph node map and critical path set for priority scoring
      const depGraphNodes = new Map<string, DepGraphNode>();
      if (graphData.nodes) {
        for (const [id, node] of Object.entries(graphData.nodes)) {
          const n = node as { task_id: string; dependencies: string[]; dependents: string[] };
          depGraphNodes.set(id, {
            task_id: n.task_id || id,
            dependencies: n.dependencies || [],
            dependents: n.dependents || [],
          });
        }
      }

      const criticalPathIds = new Set<string>(
        criticalPathData?.criticalPath?.taskIds || []
      );

      const scheduleTaskMap = new Map<string, ScheduleTaskInfo>();
      if (criticalPathData?.tasks) {
        for (const t of criticalPathData.tasks) {
          // Enrich with totalFloat from schedule/calculate data (CPM-based)
          const calcTask = scheduleCalcData?.tasks?.[t.taskId];
          scheduleTaskMap.set(t.taskId, {
            taskId: t.taskId,
            earlyFinish: t.earlyFinish,
            totalFloat: calcTask?.totalFloat,
            isCritical: criticalPathIds.has(t.taskId),
          });
        }
      }

      const phaseProgress: PhaseProgress[] = sprintProgressData?.phases || [];

      // Process tasks into workflow categories
      const sessionStatusMap = new Map<string, SessionStatus>();

      const workflowTasks: TaskWorkflowStatus[] = await Promise.all(
        tasks.map(async (task) => {
          // Check if task has spec/plan/context
          const planStatusRes = await fetch(`/api/tasks/plan?taskId=${task.id}`);
          const planStatus = await planStatusRes.json();

          // Collect session status for priority scoring
          sessionStatusMap.set(task.id, {
            hasSpec: planStatus.hasSpec || false,
            hasPlan: planStatus.hasPlan || false,
          });

          const dependenciesMet = graphData.ready_to_start_details?.some(
            (r: { taskId: string }) => r.taskId === task.id
          ) || false;

          const hasContext = planStatus.hasContext || false;
          const hasSpec = planStatus.hasSpec || false;
          const hasPlan = planStatus.hasPlan || false;
          const hasDelivery = task.status === 'Completed';

          // Determine current session
          let currentSession: TaskWorkflowStatus['currentSession'] = 'ready';
          if (hasDelivery) {
            currentSession = 'completed';
          } else if (hasSpec && hasPlan) {
            currentSession = 'exec';
          } else if (hasSpec) {
            currentSession = 'plan';
          } else if (dependenciesMet) {
            currentSession = 'spec';
          }

          return {
            taskId: task.id,
            description: task.description,
            section: task.section,
            owner: task.owner,
            sprint: typeof task.sprint === 'number' ? task.sprint : 0,
            status: task.status,
            hasContext,
            hasSpec,
            hasPlan,
            hasDelivery,
            currentSession,
            dependenciesMet,
            dependencies: task.dependencies || [],
          };
        })
      );

      // Filter by sprint if needed
      const filteredTasks = sprint === 'all'
        ? workflowTasks
        : workflowTasks.filter((t) => t.sprint === sprint);

      // Categorize tasks
      const readyTasks = filteredTasks.filter(
        (t) => t.dependenciesMet && t.status !== 'Completed' && t.status !== 'Blocked'
      );
      const inProgressTasks = filteredTasks.filter(
        (t) => t.status === 'In Progress' || t.status === 'Validating'
      );
      const awaitingSpec = filteredTasks.filter(
        (t) => t.currentSession === 'spec' && !t.hasSpec
      );
      const awaitingPlan = filteredTasks.filter(
        (t) => t.currentSession === 'plan' || (t.hasSpec && !t.hasPlan)
      );
      const awaitingExec = filteredTasks.filter(
        (t) => t.currentSession === 'exec' && t.hasSpec && t.hasPlan
      );
      const completedToday = filteredTasks.filter(
        (t) => t.status === 'Completed'
      ).slice(0, 5);
      const blockedTasks = filteredTasks.filter(
        (t) => t.status === 'Blocked' || (!t.dependenciesMet && t.status !== 'Completed')
      );

      // Compute priority scores for ready tasks
      const readyFullTasks = readyTasks.map((wt) => {
        const fullTask = tasks.find((t) => t.id === wt.taskId);
        return fullTask!;
      }).filter(Boolean);

      const currentSprintNum = typeof sprint === 'number' ? sprint : undefined;
      const scoredTasks = computePriorityScores(
        readyFullTasks,
        depGraphNodes,
        criticalPathIds,
        sessionStatusMap,
        scheduleTaskMap,
        phaseProgress,
        currentSprintNum,
      );

      setWorkflowData({
        readyTasks,
        inProgressTasks,
        awaitingSpec,
        awaitingPlan,
        awaitingExec,
        completedToday,
        blockedTasks,
        scoredTasks,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workflow data');
    } finally {
      setLoading(false);
    }
  }, [tasks, sprint]);

  useEffect(() => {
    fetchWorkflowData();
  }, [fetchWorkflowData]);

  // Helper to apply optimistic update
  const applyOptimisticUpdate = useCallback((taskId: string, expectedStatus: string, expectedSession: OptimisticState['expectedSession']) => {
    setOptimisticUpdates(prev => {
      const next = new Map(prev);
      next.set(taskId, {
        taskId,
        expectedStatus,
        expectedSession,
        startedAt: Date.now(),
      });
      return next;
    });
  }, []);

  // Helper to clear optimistic update
  const clearOptimisticUpdate = useCallback((taskId: string) => {
    setOptimisticUpdates(prev => {
      const next = new Map(prev);
      next.delete(taskId);
      return next;
    });
  }, []);

  // Run SESSION 1: Spec - Uses full Claude Code CLI session
  const handleRunSpec = useCallback(async (e: React.MouseEvent, taskId: string) => {
    e.preventDefault();
    e.stopPropagation();

    setActionInProgress(taskId);
    setActionResult(null);

    // OPTIMISTIC UPDATE: Show task as "Specifying" immediately
    applyOptimisticUpdate(taskId, 'Specifying', 'spec');

    try {
      // Start Claude Code session for spec generation
      const res = await fetch('/api/claude-session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, session: 'spec' }),
      });

      const result = await res.json();

      if (res.ok && result.success) {
        // Session started - open the modal to show real-time output
        setActiveSession({
          sessionId: result.sessionId,
          taskId,
          sessionType: 'spec',
          isSwarm: false,
        });
        setShowSessionModal(true);
        setActionResult({
          success: true,
          message: `SESSION 1 started: Claude Code session running for ${taskId}`,
        });
      } else {
        // ROLLBACK: Clear optimistic state on failure
        clearOptimisticUpdate(taskId);
        setActionResult({
          success: false,
          message: result.error || result.message || 'Failed to start spec session',
        });
      }
    } catch (err) {
      // ROLLBACK: Clear optimistic state on error
      clearOptimisticUpdate(taskId);
      setActionResult({
        success: false,
        message: err instanceof Error ? err.message : 'Network error',
      });
    } finally {
      setActionInProgress(null);
    }
  }, [applyOptimisticUpdate, clearOptimisticUpdate]);

  // Run SESSION 2: Plan - Uses full Claude Code CLI session
  const handleRunPlan = useCallback(async (e: React.MouseEvent, taskId: string) => {
    e.preventDefault();
    e.stopPropagation();

    setActionInProgress(taskId);
    setActionResult(null);

    // OPTIMISTIC UPDATE: Show task as "Planning" immediately
    applyOptimisticUpdate(taskId, 'Planning', 'plan');

    try {
      // Start Claude Code session for plan generation
      const res = await fetch('/api/claude-session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, session: 'plan' }),
      });

      const result = await res.json();

      if (res.ok && result.success) {
        // Session started - open the modal to show real-time output
        setActiveSession({
          sessionId: result.sessionId,
          taskId,
          sessionType: 'plan',
          isSwarm: false,
        });
        setShowSessionModal(true);
        setActionResult({
          success: true,
          message: `SESSION 2 started: Claude Code session running for ${taskId}`,
        });
      } else {
        // ROLLBACK: Clear optimistic state on failure
        clearOptimisticUpdate(taskId);
        setActionResult({
          success: false,
          message: result.error || result.message || 'Failed to start plan session',
        });
      }
    } catch (err) {
      // ROLLBACK: Clear optimistic state on error
      clearOptimisticUpdate(taskId);
      setActionResult({
        success: false,
        message: err instanceof Error ? err.message : 'Network error',
      });
    } finally {
      setActionInProgress(null);
    }
  }, [applyOptimisticUpdate, clearOptimisticUpdate]);

  // Run SESSION 3: Exec - Uses orchestrator.sh run (full pipeline with review)
  const handleRunExec = useCallback(async (e: React.MouseEvent, taskId: string) => {
    e.preventDefault();
    e.stopPropagation();

    setActionInProgress(taskId);
    setActionResult(null);

    // OPTIMISTIC UPDATE: Show task as "Executing" immediately
    applyOptimisticUpdate(taskId, 'In Progress', 'exec');

    try {
      // Run task via orchestrator.sh run (full pipeline with qualitative review)
      const execRes = await fetch(`/api/swarm/run-task/${taskId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const execResult = await execRes.json();

      if (execRes.ok && execResult.success) {
        // Task execution started - open the modal to show real-time output
        setActiveSession({
          sessionId: null, // Swarm uses taskId for identification
          taskId,
          sessionType: 'exec',
          isSwarm: true,
        });
        setShowSessionModal(true);
        setActionResult({
          success: true,
          message: `SESSION 3 started: ${execResult.command}`,
        });
      } else {
        // ROLLBACK: Clear optimistic state on failure
        clearOptimisticUpdate(taskId);
        setActionResult({
          success: false,
          message: execResult.error || execResult.message || 'Failed to start exec session',
        });
      }
    } catch (err) {
      // ROLLBACK: Clear optimistic state on error
      clearOptimisticUpdate(taskId);
      setActionResult({
        success: false,
        message: err instanceof Error ? err.message : 'Network error',
      });
    } finally {
      setActionInProgress(null);
    }
  }, [applyOptimisticUpdate, clearOptimisticUpdate]);

  // Kill active session
  const handleKillSession = useCallback(async () => {
    if (!activeSession) return;

    try {
      if (activeSession.isSwarm) {
        // Kill via swarm endpoint
        await fetch(`/api/swarm/kill-task/${activeSession.taskId}`, {
          method: 'POST',
        });
      } else if (activeSession.sessionId) {
        // Kill via claude-session endpoint
        await fetch('/api/claude-session/kill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: activeSession.sessionId,
            revertStatus: true,
          }),
        });
      }

      // Clear optimistic update and close modal
      clearOptimisticUpdate(activeSession.taskId);
      setShowSessionModal(false);
      setActiveSession(null);
      setActionResult({
        success: true,
        message: `Session for ${activeSession.taskId} terminated`,
      });

      // Refresh workflow data
      await fetchWorkflowData();
    } catch (err) {
      setActionResult({
        success: false,
        message: err instanceof Error ? err.message : 'Failed to kill session',
      });
    }
  }, [activeSession, clearOptimisticUpdate, fetchWorkflowData]);

  // Close session modal (allows session to continue in background)
  const handleCloseSessionModal = useCallback(() => {
    setShowSessionModal(false);
    // Don't clear activeSession - session continues in background
    // The polling will continue and update workflow data when done
  }, []);

  // Auto-refresh workflow data when session completes
  useEffect(() => {
    if (
      sessionPolling.status === 'completed' ||
      sessionPolling.status === 'failed' ||
      sessionPolling.status === 'timeout'
    ) {
      // Session finished - clear optimistic update and refresh data
      if (activeSession) {
        clearOptimisticUpdate(activeSession.taskId);
      }
      fetchWorkflowData();
    }
  }, [sessionPolling.status, activeSession, clearOptimisticUpdate, fetchWorkflowData]);

  // Get current date and time
  const now = new Date();
  const timeOfDay = now.getHours() < 12 ? 'morning' : now.getHours() < 17 ? 'afternoon' : 'evening';
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  // Apply optimistic updates to workflow data for immediate UI feedback
  // NOTE: This hook MUST be called before any early returns to comply with Rules of Hooks
  const data = useMemo(() => {
    if (!workflowData) return null;
    if (optimisticUpdates.size === 0) return workflowData;

    // Keep scored tasks as-is during optimistic updates (they reflect pre-action state)
    const scoredTasks = workflowData.scoredTasks;

    // Create a map of all tasks with optimistic updates applied
    const applyOptimisticToTasks = (tasks: TaskWorkflowStatus[]): TaskWorkflowStatus[] => {
      return tasks.map((task) => {
        const optimistic = optimisticUpdates.get(task.taskId);
        if (!optimistic) return task;

        // Apply the optimistic state
        return {
          ...task,
          status: optimistic.expectedStatus,
          currentSession: optimistic.expectedSession,
          // Update flags based on expected session
          hasSpec: optimistic.expectedSession !== 'spec' || task.hasSpec,
          hasPlan: optimistic.expectedSession === 'exec' || optimistic.expectedSession === 'completed' || task.hasPlan,
          hasDelivery: optimistic.expectedSession === 'completed',
        };
      });
    };

    // Filter tasks based on optimistic session state
    const filterByOptimisticSession = (
      tasks: TaskWorkflowStatus[],
      targetSession: 'spec' | 'plan' | 'exec' | 'completed'
    ): TaskWorkflowStatus[] => {
      return tasks.filter((task) => {
        const optimistic = optimisticUpdates.get(task.taskId);
        if (optimistic) {
          // If task has optimistic update, use that session
          return optimistic.expectedSession === targetSession;
        }
        // Otherwise use actual session
        return task.currentSession === targetSession;
      });
    };

    // Recompute task lists with optimistic updates
    const allTasks = [
      ...workflowData.readyTasks,
      ...workflowData.inProgressTasks,
      ...workflowData.awaitingSpec,
      ...workflowData.awaitingPlan,
      ...workflowData.awaitingExec,
      ...workflowData.completedToday,
      ...workflowData.blockedTasks,
    ];

    // Remove duplicates
    const uniqueTasks = Array.from(
      new Map(allTasks.map((t) => [t.taskId, t])).values()
    );

    const tasksWithOptimistic = applyOptimisticToTasks(uniqueTasks);

    return {
      readyTasks: workflowData.readyTasks.filter(
        (t) => !optimisticUpdates.has(t.taskId)
      ),
      inProgressTasks: [
        ...workflowData.inProgressTasks,
        ...tasksWithOptimistic.filter((t) => {
          const opt = optimisticUpdates.get(t.taskId);
          return opt && ['spec', 'plan', 'exec'].includes(opt.expectedSession);
        }),
      ],
      awaitingSpec: filterByOptimisticSession(tasksWithOptimistic, 'spec').filter(
        (t) => !optimisticUpdates.has(t.taskId) || optimisticUpdates.get(t.taskId)?.expectedSession !== 'spec'
      ),
      awaitingPlan: [
        ...workflowData.awaitingPlan.filter((t) => !optimisticUpdates.has(t.taskId)),
        // Tasks that just completed spec move here optimistically
      ],
      awaitingExec: [
        ...workflowData.awaitingExec.filter((t) => !optimisticUpdates.has(t.taskId)),
        // Tasks that just completed plan move here optimistically
      ],
      completedToday: [
        ...workflowData.completedToday,
        ...tasksWithOptimistic.filter((t) => optimisticUpdates.get(t.taskId)?.expectedSession === 'completed'),
      ],
      blockedTasks: workflowData.blockedTasks,
      scoredTasks,
    };
  }, [workflowData, optimisticUpdates]);

  // Loading state
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-4">
          <div className="flex items-center gap-3">
            <Icon name="today" className="w-6 h-6 text-white" />
            <h3 className="text-lg font-semibold text-white">Daily Workflow Summary</h3>
          </div>
        </div>
        <div className="p-6 flex items-center justify-center">
          <Icon name="refresh" className="w-6 h-6 text-blue-600 animate-spin" />
          <span className="ml-2 text-gray-600">Loading workflow status...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-4">
          <div className="flex items-center gap-3">
            <Icon name="today" className="w-6 h-6 text-white" />
            <h3 className="text-lg font-semibold text-white">Daily Workflow Summary</h3>
          </div>
        </div>
        <div className="p-6">
          <div className="flex items-center gap-2 text-red-600">
            <Icon name="warning" className="w-5 h-5" />
            <span>{error}</span>
          </div>
          <button
            onClick={fetchWorkflowData}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Icon name="today" className="w-6 h-6 text-white" />
            <div>
              <h3 className="text-lg font-semibold text-white">Daily Workflow Summary</h3>
              <p className="text-indigo-200 text-sm">{dateStr} • Good {timeOfDay}!</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchWorkflowData}
              className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
              title="Refresh"
            >
              <Icon name="refresh" className="w-4 h-4 text-white" />
            </button>
            <div className="flex items-center gap-2 bg-white/20 rounded-full px-3 py-1">
              <Icon name="sprint" className="w-4 h-4 text-white" />
              <span className="text-white text-sm font-medium">
                Sprint {sprint === 'all' ? 'All' : sprint}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Action Result Banner */}
      {actionResult && (
        <div
          className={`px-6 py-3 flex items-center justify-between ${
            actionResult.success
              ? 'bg-green-100 border-b border-green-200 text-green-800'
              : 'bg-red-100 border-b border-red-200 text-red-800'
          }`}
        >
          <div className="flex items-center gap-2">
            <Icon name={actionResult.success ? 'check_circle' : 'warning'} className="w-5 h-5" />
            <span className="text-sm font-medium">{actionResult.message}</span>
          </div>
          <button onClick={() => setActionResult(null)} className="hover:opacity-70">
            <Icon name="close" className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="p-6">
        {/* ═══════════════════════════════════════════════════════════════════
            SMART WORK QUEUE: NOW / NEXT / WAIT
            ═══════════════════════════════════════════════════════════════════ */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Icon name="wb_sunny" className="w-5 h-5 text-amber-500" />
            <h4 className="font-semibold text-gray-900">MORNING: Smart Work Queue</h4>
            <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
              {data.readyTasks.length} ready
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* NOW bucket */}
            <PriorityBucket
              bucket="now"
              label="NOW"
              description="What matters today"
              tasks={data.scoredTasks.filter((s) => s.bucket === 'now')}
              colorScheme="red"
              actionInProgress={actionInProgress}
              onRunSpec={handleRunSpec}
              onRunPlan={handleRunPlan}
              onRunExec={handleRunExec}
              onTaskClick={onTaskClick}
              allTasks={tasks}
              defaultExpanded
            />

            {/* NEXT bucket */}
            <PriorityBucket
              bucket="next"
              label="NEXT"
              description="Important, coming up"
              tasks={data.scoredTasks.filter((s) => s.bucket === 'next')}
              colorScheme="amber"
              actionInProgress={actionInProgress}
              onRunSpec={handleRunSpec}
              onRunPlan={handleRunPlan}
              onRunExec={handleRunExec}
              onTaskClick={onTaskClick}
              allTasks={tasks}
              defaultExpanded={false}
            />

            {/* WAIT bucket */}
            <PriorityBucket
              bucket="wait"
              label="WAIT"
              description="Ready but deferrable"
              tasks={data.scoredTasks.filter((s) => s.bucket === 'wait')}
              colorScheme="gray"
              actionInProgress={actionInProgress}
              onRunSpec={handleRunSpec}
              onRunPlan={handleRunPlan}
              onRunExec={handleRunExec}
              onTaskClick={onTaskClick}
              allTasks={tasks}
              defaultExpanded={false}
            />
          </div>

          {/* In Progress */}
          <div className="mt-4 border border-purple-200 rounded-lg overflow-hidden">
            <div className="bg-purple-50 px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon name="play_circle" className="w-4 h-4 text-purple-600" />
                <span className="text-sm font-medium text-gray-900">In Progress</span>
              </div>
              <span className="text-xs bg-purple-200 text-purple-800 px-2 py-0.5 rounded-full">
                {data.inProgressTasks.length}
              </span>
            </div>
            <div className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
              {data.inProgressTasks.length === 0 ? (
                <div className="p-3 text-center text-gray-500 text-sm">
                  No tasks in progress.
                </div>
              ) : (
                data.inProgressTasks.slice(0, 5).map((task) => (
                  <TaskRow
                    key={task.taskId}
                    task={task}
                    onTaskClick={onTaskClick}
                    tasks={tasks}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            PIPELINE: Next Actions (sorted by priority)
            ═══════════════════════════════════════════════════════════════════ */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Icon name="account_tree" className="w-5 h-5 text-blue-500" />
            <h4 className="font-semibold text-gray-900">Pipeline: What&apos;s Next</h4>
          </div>

          <PipelineColumns
            scoredTasks={data.scoredTasks}
            actionInProgress={actionInProgress}
            onRunSpec={handleRunSpec}
            onRunPlan={handleRunPlan}
            onRunExec={handleRunExec}
          />
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            END OF DAY: Status Update
            ═══════════════════════════════════════════════════════════════════ */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Icon name="nightlight" className="w-5 h-5 text-indigo-500" />
            <h4 className="font-semibold text-gray-900">END OF DAY: Status Summary</h4>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Completed */}
            <div className="border border-green-200 rounded-lg overflow-hidden">
              <div className="bg-green-50 px-4 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon name="task_alt" className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium text-gray-900">Completed</span>
                </div>
                <span className="text-xs bg-green-200 text-green-800 px-2 py-0.5 rounded-full">
                  {data.completedToday.length}
                </span>
              </div>
              <div className="divide-y divide-gray-100 max-h-32 overflow-y-auto">
                {data.completedToday.length === 0 ? (
                  <div className="p-3 text-center text-gray-500 text-sm">
                    No tasks completed yet.
                  </div>
                ) : (
                  data.completedToday.map((task) => (
                    <div key={task.taskId} className="p-2 flex items-center gap-2">
                      <Icon name="check_circle" className="w-4 h-4 text-green-500" />
                      <span className="font-mono text-xs text-green-600">{task.taskId}</span>
                      <span className="text-xs text-gray-500 truncate">{task.description.slice(0, 30)}...</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Blocked */}
            <div className="border border-orange-200 rounded-lg overflow-hidden">
              <div className="bg-orange-50 px-4 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon name="block" className="w-4 h-4 text-orange-600" />
                  <span className="text-sm font-medium text-gray-900">Blocked / Waiting</span>
                </div>
                <span className="text-xs bg-orange-200 text-orange-800 px-2 py-0.5 rounded-full">
                  {data.blockedTasks.length}
                </span>
              </div>
              <div className="divide-y divide-gray-100 max-h-32 overflow-y-auto">
                {data.blockedTasks.length === 0 ? (
                  <div className="p-3 text-center text-gray-500 text-sm">
                    No blocked tasks!
                  </div>
                ) : (
                  data.blockedTasks.slice(0, 5).map((task) => (
                    <div key={task.taskId} className="p-2">
                      <div className="flex items-center gap-2">
                        <Icon name="hourglass_empty" className="w-4 h-4 text-orange-500" />
                        <span className="font-mono text-xs text-orange-600">{task.taskId}</span>
                      </div>
                      <p className="text-xs text-gray-500 ml-6">
                        Waiting: {task.dependencies.slice(0, 3).join(', ')}
                        {task.dependencies.length > 3 ? '...' : ''}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions Footer */}
        <div className="mt-6 pt-4 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Run <code className="bg-gray-100 px-1 py-0.5 rounded">/matop-execute TASK_ID</code> for full orchestration
            </p>
            <a
              href="/swarm"
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white text-sm font-medium rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all"
            >
              <Icon name="dns" className="w-4 h-4" />
              Swarm Control
            </a>
          </div>
        </div>
      </div>

      {/* Session Output Modal */}
      {activeSession && (
        <SessionOutputModal
          open={showSessionModal}
          onClose={handleCloseSessionModal}
          sessionId={activeSession.sessionId}
          taskId={activeSession.taskId}
          sessionType={activeSession.sessionType}
          output={sessionPolling.output}
          status={sessionPolling.status}
          phase={sessionPolling.phase}
          isSwarm={activeSession.isSwarm}
          onKill={handleKillSession}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bucket colors
// ---------------------------------------------------------------------------

const BUCKET_COLORS = {
  red: {
    border: 'border-red-200',
    headerBg: 'bg-red-50',
    icon: 'text-red-600',
    badge: 'bg-red-200 text-red-800',
    pill: 'bg-red-100 text-red-700',
  },
  amber: {
    border: 'border-amber-200',
    headerBg: 'bg-amber-50',
    icon: 'text-amber-600',
    badge: 'bg-amber-200 text-amber-800',
    pill: 'bg-amber-100 text-amber-700',
  },
  gray: {
    border: 'border-gray-200',
    headerBg: 'bg-gray-50',
    icon: 'text-gray-500',
    badge: 'bg-gray-200 text-gray-700',
    pill: 'bg-gray-100 text-gray-600',
  },
} as const;

const ACTION_LABELS: Record<string, { label: string; activeLabel: string; color: string }> = {
  spec: { label: 'Run Spec', activeLabel: 'Specifying...', color: 'bg-indigo-600 hover:bg-indigo-700' },
  plan: { label: 'Run Plan', activeLabel: 'Planning...', color: 'bg-cyan-600 hover:bg-cyan-700' },
  exec: { label: 'Run Exec', activeLabel: 'Executing...', color: 'bg-green-600 hover:bg-green-700' },
};

// ---------------------------------------------------------------------------
// PriorityBucket component — collapsible bucket of scored tasks
// ---------------------------------------------------------------------------

function PriorityBucket({
  bucket,
  label,
  description,
  tasks: scoredTasks,
  colorScheme,
  actionInProgress,
  onRunSpec,
  onRunPlan,
  onRunExec,
  onTaskClick,
  allTasks,
  defaultExpanded,
}: {
  bucket: 'now' | 'next' | 'wait';
  label: string;
  description: string;
  tasks: ScoredTask[];
  colorScheme: 'red' | 'amber' | 'gray';
  actionInProgress: string | null;
  onRunSpec: (e: React.MouseEvent, taskId: string) => void;
  onRunPlan: (e: React.MouseEvent, taskId: string) => void;
  onRunExec: (e: React.MouseEvent, taskId: string) => void;
  onTaskClick?: (task: Task) => void;
  allTasks: Task[];
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const colors = BUCKET_COLORS[colorScheme];
  const MAX_VISIBLE = bucket === 'now' ? 10 : 5;

  const handleAction = (e: React.MouseEvent, taskId: string, action: 'spec' | 'plan' | 'exec') => {
    if (action === 'spec') onRunSpec(e, taskId);
    else if (action === 'plan') onRunPlan(e, taskId);
    else onRunExec(e, taskId);
  };

  return (
    <div className={`border ${colors.border} rounded-lg overflow-hidden`}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={`w-full ${colors.headerBg} px-4 py-2 flex items-center justify-between hover:opacity-90 transition-opacity`}
      >
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold ${colors.icon}`}>{label}</span>
          <span className="text-xs text-gray-500">{description}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs ${colors.badge} px-2 py-0.5 rounded-full`}>
            {scoredTasks.length}
          </span>
          <Icon name={expanded ? 'expand_less' : 'expand_more'} className="w-4 h-4 text-gray-400" />
        </div>
      </button>

      {expanded && (
        <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
          {scoredTasks.length === 0 ? (
            <div className="p-3 text-center text-gray-500 text-xs">
              {bucket === 'now' ? 'No urgent tasks' : 'No tasks in this bucket'}
            </div>
          ) : (
            scoredTasks.slice(0, MAX_VISIBLE).map((scored) => {
              const fullTask = allTasks.find((t) => t.id === scored.taskId);
              const actionMeta = ACTION_LABELS[scored.recommendedAction];

              return (
                <div
                  key={scored.taskId}
                  className="p-2 hover:bg-gray-50 cursor-pointer"
                  onClick={() => fullTask && onTaskClick?.(fullTask)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="font-mono text-xs font-medium text-blue-600 shrink-0">
                        {scored.taskId}
                      </span>
                      <span className="text-xs text-gray-500 truncate">{scored.reason}</span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAction(e, scored.taskId, scored.recommendedAction);
                      }}
                      disabled={actionInProgress === scored.taskId}
                      className={`px-2 py-1 text-xs text-white rounded shrink-0 disabled:bg-gray-300 ${actionMeta.color}`}
                    >
                      {actionInProgress === scored.taskId ? actionMeta.activeLabel : actionMeta.label}
                    </button>
                  </div>
                </div>
              );
            })
          )}
          {scoredTasks.length > MAX_VISIBLE && (
            <div className="p-2 text-center text-xs text-gray-400">
              +{scoredTasks.length - MAX_VISIBLE} more
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PipelineColumns — sorted by priority score
// ---------------------------------------------------------------------------

function PipelineColumns({
  scoredTasks,
  actionInProgress,
  onRunSpec,
  onRunPlan,
  onRunExec,
}: {
  scoredTasks: ScoredTask[];
  actionInProgress: string | null;
  onRunSpec: (e: React.MouseEvent, taskId: string) => void;
  onRunPlan: (e: React.MouseEvent, taskId: string) => void;
  onRunExec: (e: React.MouseEvent, taskId: string) => void;
}) {
  const specTasks = scoredTasks.filter((s) => s.recommendedAction === 'spec');
  const planTasks = scoredTasks.filter((s) => s.recommendedAction === 'plan');
  const execTasks = scoredTasks.filter((s) => s.recommendedAction === 'exec');

  const columns: {
    label: string;
    tasks: ScoredTask[];
    action: 'spec' | 'plan' | 'exec';
    colorClass: string;
    borderClass: string;
    bgClass: string;
    handler: (e: React.MouseEvent, taskId: string) => void;
  }[] = [
    {
      label: 'Next Spec',
      tasks: specTasks,
      action: 'spec',
      colorClass: 'text-indigo-600',
      borderClass: 'border-indigo-200',
      bgClass: 'bg-indigo-50',
      handler: onRunSpec,
    },
    {
      label: 'Next Plan',
      tasks: planTasks,
      action: 'plan',
      colorClass: 'text-cyan-600',
      borderClass: 'border-cyan-200',
      bgClass: 'bg-cyan-50',
      handler: onRunPlan,
    },
    {
      label: 'Next Exec',
      tasks: execTasks,
      action: 'exec',
      colorClass: 'text-green-600',
      borderClass: 'border-green-200',
      bgClass: 'bg-green-50',
      handler: onRunExec,
    },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {columns.map((col) => {
        const actionMeta = ACTION_LABELS[col.action];
        return (
          <div key={col.label} className={`border ${col.borderClass} rounded-lg overflow-hidden`}>
            <div className={`${col.bgClass} px-4 py-2 flex items-center justify-between`}>
              <span className={`text-sm font-medium ${col.colorClass}`}>{col.label}</span>
              <span className={`text-xs ${col.bgClass} ${col.colorClass} px-2 py-0.5 rounded-full font-medium`}>
                {col.tasks.length}
              </span>
            </div>
            <div className="divide-y divide-gray-100 max-h-40 overflow-y-auto">
              {col.tasks.length === 0 ? (
                <div className="p-3 text-center text-gray-500 text-xs">
                  None pending
                </div>
              ) : (
                col.tasks.slice(0, 5).map((scored) => (
                  <div key={scored.taskId} className="p-2 flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`font-mono text-xs ${col.colorClass}`}>{scored.taskId}</span>
                      {scored.bucket === 'now' && (
                        <span className="text-[10px] bg-red-100 text-red-700 px-1 py-0.5 rounded">NOW</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => col.handler(e, scored.taskId)}
                      disabled={actionInProgress === scored.taskId}
                      className={`px-2 py-1 text-xs text-white rounded shrink-0 disabled:bg-gray-300 ${actionMeta.color}`}
                    >
                      {actionInProgress === scored.taskId ? actionMeta.activeLabel : actionMeta.label}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task row component (for In Progress / Completed / Blocked)
// ---------------------------------------------------------------------------

function TaskRow({
  task,
  onTaskClick,
  tasks,
}: {
  task: TaskWorkflowStatus;
  onTaskClick?: (task: Task) => void;
  tasks: Task[];
}) {
  const fullTask = tasks.find((t) => t.id === task.taskId);

  return (
    <div
      className="p-2 hover:bg-gray-50 cursor-pointer"
      onClick={() => fullTask && onTaskClick?.(fullTask)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-medium text-blue-600">{task.taskId}</span>
          <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
            S{task.sprint}
          </span>
        </div>
        {/* Session indicators */}
        <div className="flex items-center gap-1">
          <div
            className={`w-2 h-2 rounded-full ${task.hasSpec ? 'bg-indigo-500' : 'bg-gray-300'}`}
            title={task.hasSpec ? 'Spec done' : 'Needs spec'}
          />
          <div
            className={`w-2 h-2 rounded-full ${task.hasPlan ? 'bg-cyan-500' : 'bg-gray-300'}`}
            title={task.hasPlan ? 'Plan done' : 'Needs plan'}
          />
          <div
            className={`w-2 h-2 rounded-full ${task.hasDelivery ? 'bg-green-500' : 'bg-gray-300'}`}
            title={task.hasDelivery ? 'Delivered' : 'Not delivered'}
          />
        </div>
      </div>
      <p className="text-xs text-gray-600 mt-1 truncate">{task.description}</p>
    </div>
  );
}

export default DailyWorkflowSummary;
