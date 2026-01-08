'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '@/lib/icons';
import { Task, SprintNumber } from '@/lib/types';

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

  // Fetch workflow status for all tasks
  const fetchWorkflowData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch dependency graph and task status
      const graphRes = await fetch(`/api/dependency-graph?sprint=${sprint === 'all' ? 'all' : sprint}`);
      const graphData = await graphRes.json();

      // Process tasks into workflow categories
      const workflowTasks: TaskWorkflowStatus[] = await Promise.all(
        tasks.map(async (task) => {
          // Check if task has spec/plan/context
          const planStatusRes = await fetch(`/api/tasks/plan?taskId=${task.id}`);
          const planStatus = await planStatusRes.json();

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

      setWorkflowData({
        readyTasks,
        inProgressTasks,
        awaitingSpec,
        awaitingPlan,
        awaitingExec,
        completedToday,
        blockedTasks,
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

  // Run SESSION 1: Spec
  const handleRunSpec = useCallback(async (e: React.MouseEvent, taskId: string) => {
    e.preventDefault();
    e.stopPropagation();

    setActionInProgress(taskId);
    setActionResult(null);

    try {
      const res = await fetch('/api/matop/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      });

      const result = await res.json();

      if (res.ok && result.success) {
        setActionResult({
          success: true,
          message: `SESSION 1 complete: ${taskId} spec generated`,
        });
        await fetchWorkflowData();
      } else {
        setActionResult({
          success: false,
          message: result.error || result.message || 'Spec session failed',
        });
      }
    } catch (err) {
      setActionResult({
        success: false,
        message: err instanceof Error ? err.message : 'Network error',
      });
    } finally {
      setActionInProgress(null);
    }
  }, [fetchWorkflowData]);

  // Run SESSION 3: Exec (via MATOP)
  const handleRunExec = useCallback(async (e: React.MouseEvent, taskId: string) => {
    e.preventDefault();
    e.stopPropagation();

    setActionInProgress(taskId);
    setActionResult(null);

    try {
      // Start task and execute MATOP
      const execRes = await fetch('/api/sprint/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sprintNumber: sprint === 'all' ? 0 : sprint,
          taskFilter: [taskId],
          autoExecute: true,
        }),
      });

      const execResult = await execRes.json();

      if (execRes.ok) {
        setActionResult({
          success: true,
          message: `SESSION 3 started: ${taskId} execution initiated`,
        });
        await fetchWorkflowData();
      } else {
        setActionResult({
          success: false,
          message: execResult.error || 'Exec session failed',
        });
      }
    } catch (err) {
      setActionResult({
        success: false,
        message: err instanceof Error ? err.message : 'Network error',
      });
    } finally {
      setActionInProgress(null);
    }
  }, [sprint, fetchWorkflowData]);

  // Get current date and time
  const now = new Date();
  const timeOfDay = now.getHours() < 12 ? 'morning' : now.getHours() < 17 ? 'afternoon' : 'evening';
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

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

  const data = workflowData!;

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
            MORNING: Task Selection
            ═══════════════════════════════════════════════════════════════════ */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Icon name="wb_sunny" className="w-5 h-5 text-amber-500" />
            <h4 className="font-semibold text-gray-900">MORNING: Task Selection</h4>
            <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
              {data.readyTasks.length} ready
            </span>
          </div>

          {/* Ready Tasks */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Tasks Ready for Today */}
            <div className="border border-blue-200 rounded-lg overflow-hidden">
              <div className="bg-blue-50 px-4 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon name="check_circle" className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-gray-900">Ready for Today</span>
                </div>
                <span className="text-xs bg-blue-200 text-blue-800 px-2 py-0.5 rounded-full">
                  {data.readyTasks.length}
                </span>
              </div>
              <div className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
                {data.readyTasks.length === 0 ? (
                  <div className="p-3 text-center text-gray-500 text-sm">
                    No tasks ready. Complete dependencies first.
                  </div>
                ) : (
                  data.readyTasks.slice(0, 5).map((task) => (
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

            {/* In Progress */}
            <div className="border border-purple-200 rounded-lg overflow-hidden">
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
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            FOR EACH READY TASK: Sessions
            ═══════════════════════════════════════════════════════════════════ */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Icon name="account_tree" className="w-5 h-5 text-blue-500" />
            <h4 className="font-semibold text-gray-900">FOR EACH READY TASK: Session Status</h4>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* SESSION 1: Spec */}
            <div className="border border-indigo-200 rounded-lg overflow-hidden">
              <div className="bg-indigo-50 px-4 py-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">1</div>
                    <span className="text-sm font-medium text-gray-900">SESSION: Spec</span>
                  </div>
                  <span className="text-xs bg-indigo-200 text-indigo-800 px-2 py-0.5 rounded-full">
                    {data.awaitingSpec.length} awaiting
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">Context → Agents → Discussion → Spec</p>
              </div>
              <div className="divide-y divide-gray-100 max-h-40 overflow-y-auto">
                {data.awaitingSpec.length === 0 ? (
                  <div className="p-3 text-center text-gray-500 text-xs">All specs complete</div>
                ) : (
                  data.awaitingSpec.slice(0, 3).map((task) => (
                    <div key={task.taskId} className="p-2 flex items-center justify-between">
                      <span className="font-mono text-xs text-indigo-600">{task.taskId}</span>
                      <button
                        type="button"
                        onClick={(e) => handleRunSpec(e, task.taskId)}
                        disabled={actionInProgress === task.taskId}
                        className="px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-gray-300"
                      >
                        {actionInProgress === task.taskId ? 'Running...' : 'Run Spec'}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* SESSION 2: Plan */}
            <div className="border border-cyan-200 rounded-lg overflow-hidden">
              <div className="bg-cyan-50 px-4 py-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-cyan-600 text-white flex items-center justify-center text-xs font-bold">2</div>
                    <span className="text-sm font-medium text-gray-900">SESSION: Plan</span>
                  </div>
                  <span className="text-xs bg-cyan-200 text-cyan-800 px-2 py-0.5 rounded-full">
                    {data.awaitingPlan.length} awaiting
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">Load Spec → Create Execution Plan</p>
              </div>
              <div className="divide-y divide-gray-100 max-h-40 overflow-y-auto">
                {data.awaitingPlan.length === 0 ? (
                  <div className="p-3 text-center text-gray-500 text-xs">All plans complete</div>
                ) : (
                  data.awaitingPlan.slice(0, 3).map((task) => (
                    <div key={task.taskId} className="p-2 flex items-center justify-between">
                      <span className="font-mono text-xs text-cyan-600">{task.taskId}</span>
                      <button
                        type="button"
                        onClick={(e) => handleRunSpec(e, task.taskId)}
                        disabled={actionInProgress === task.taskId}
                        className="px-2 py-1 text-xs bg-cyan-600 text-white rounded hover:bg-cyan-700 disabled:bg-gray-300"
                      >
                        {actionInProgress === task.taskId ? 'Running...' : 'Run Plan'}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* SESSION 3: Exec */}
            <div className="border border-green-200 rounded-lg overflow-hidden">
              <div className="bg-green-50 px-4 py-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-green-600 text-white flex items-center justify-center text-xs font-bold">3</div>
                    <span className="text-sm font-medium text-gray-900">SESSION: Exec</span>
                  </div>
                  <span className="text-xs bg-green-200 text-green-800 px-2 py-0.5 rounded-full">
                    {data.awaitingExec.length} ready
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">Execute → Validate → Delivery Report</p>
              </div>
              <div className="divide-y divide-gray-100 max-h-40 overflow-y-auto">
                {data.awaitingExec.length === 0 ? (
                  <div className="p-3 text-center text-gray-500 text-xs">No tasks ready for exec</div>
                ) : (
                  data.awaitingExec.slice(0, 3).map((task) => (
                    <div key={task.taskId} className="p-2 flex items-center justify-between">
                      <span className="font-mono text-xs text-green-600">{task.taskId}</span>
                      <button
                        type="button"
                        onClick={(e) => handleRunExec(e, task.taskId)}
                        disabled={actionInProgress === task.taskId}
                        className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-300"
                      >
                        {actionInProgress === task.taskId ? 'Running...' : 'Run Exec'}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
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
    </div>
  );
}

// Task row component
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
