'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Icon } from '@/lib/icons';
import {
  computePriorityScores,
  type ScoredTask,
  type DepGraphNode,
  type SessionStatus,
  type ScheduleTaskInfo,
  type PhaseProgress,
} from '@/lib/priority-scorer';

interface ReadyTaskDetail {
  taskId: string;
  sprint: number;
  description: string;
  section: string;
  owner: string;
  dependencies: string[];
  dependencyStatus: string;
  hasSpec?: boolean;
  hasPlan?: boolean;
  isPlanned?: boolean;
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

interface DependencyGraphResponse {
  ready_to_start: string[];
  ready_to_start_details: ReadyTaskDetail[];
  ready_by_sprint: Record<number, ReadyTaskDetail[]>;
  blocked_tasks: string[];
  blocked_tasks_details: BlockedTaskDetail[];
  summary: {
    total_tasks: number;
    completed_tasks: number;
    in_progress_tasks: number;
    ready_count: number;
    blocked_count: number;
    next_sprint: number | null;
    completion_percentage: number;
  };
  violations_count: number;
  last_updated: string;
  nodes?: Record<string, { task_id: string; dependencies: string[]; dependents: string[] }>;
}

interface NextStepsViewProps {
  onTaskClick?: (taskId: string) => void;
  sprint?: number | 'all' | 'Continuous';
}

function buildDepGraphNodesFromResult(
  nodes:
    | Record<string, { task_id: string; dependencies: string[]; dependents: string[] }>
    | undefined
): Map<string, DepGraphNode> {
  const map = new Map<string, DepGraphNode>();
  if (!nodes) return map;
  for (const [id, node] of Object.entries(nodes)) {
    map.set(id, {
      task_id: node.task_id || id,
      dependencies: node.dependencies || [],
      dependents: node.dependents || [],
    });
  }
  return map;
}

function buildScheduleMapFromCritData(
  critData: any,
  schedCalcData: any,
  criticalPathIds: Set<string>
): Map<string, ScheduleTaskInfo> {
  const map = new Map<string, ScheduleTaskInfo>();
  if (!critData?.tasks) return map;
  for (const t of critData.tasks) {
    const calcTask = schedCalcData?.tasks?.[t.taskId];
    map.set(t.taskId, {
      taskId: t.taskId,
      earlyFinish: t.earlyFinish,
      totalFloat: calcTask?.totalFloat,
      isCritical: criticalPathIds.has(t.taskId),
    });
  }
  return map;
}

type PlanStatusEntry = {
  hasSpec: boolean;
  hasPlan: boolean;
  specPath?: string | null;
  planPath?: string | null;
};

async function fetchPlanStatusForTask(taskId: string): Promise<PlanStatusEntry> {
  try {
    const planRes = await fetch(`/api/tasks/plan?taskId=${taskId}`);
    if (planRes.ok) {
      const planData = await planRes.json();
      return {
        hasSpec: planData.hasSpec,
        hasPlan: planData.hasPlan,
        specPath: planData.specPath,
        planPath: planData.planPath,
      };
    }
  } catch {
    // fall through to default
  }
  return { hasSpec: false, hasPlan: false, specPath: null, planPath: null };
}

async function buildPlanStatusMap(taskIds: string[]): Promise<Record<string, PlanStatusEntry>> {
  const entries = await Promise.all(
    taskIds.map(async (taskId) => [taskId, await fetchPlanStatusForTask(taskId)] as const)
  );
  return Object.fromEntries(entries);
}

async function computeScoredTaskMap(
  result: DependencyGraphResponse,
  planStatusMap: Record<string, PlanStatusEntry>,
  sprintParam: string,
  sprint: number | 'all' | 'Continuous'
): Promise<Map<string, ScoredTask>> {
  const [critRes, schedCalcRes, progressRes] = await Promise.all([
    fetch(`/api/schedule/critical-path?sprint=${sprintParam}`).catch(() => null),
    fetch(`/api/schedule/calculate?sprint=${sprintParam}`).catch(() => null),
    fetch(`/api/sprint/progress?sprint=${sprintParam}`).catch(() => null),
  ]);
  const critData = critRes ? await critRes.json().catch(() => null) : null;
  const schedCalcData = schedCalcRes ? await schedCalcRes.json().catch(() => null) : null;
  const progressData = progressRes ? await progressRes.json().catch(() => null) : null;

  const depGraphNodes = buildDepGraphNodesFromResult(result.nodes);
  const criticalPathIds = new Set<string>(critData?.criticalPath?.taskIds || []);
  const scheduleTaskMap = buildScheduleMapFromCritData(critData, schedCalcData, criticalPathIds);
  const phaseProgress: PhaseProgress[] = progressData?.phases || [];

  const sessionStatuses = new Map<string, SessionStatus>(
    Object.entries(planStatusMap).map(([id, ps]) => [
      id,
      { hasSpec: ps.hasSpec, hasPlan: ps.hasPlan },
    ])
  );

  const readyTasks = result.ready_to_start_details.map((rd: ReadyTaskDetail) => ({
    id: rd.taskId,
    section: rd.section,
    description: rd.description,
    owner: rd.owner,
    dependencies: rd.dependencies,
    cleanDependencies: [],
    crossQuarterDeps: false,
    prerequisites: '',
    dod: '',
    status: (rd.status || 'Planned') as import('../lib/types').TaskStatus,
    kpis: '',
    sprint: rd.sprint,
    artifacts: [],
    validation: '',
    cadence: '',
  }));

  const currentSprintNum = typeof sprint === 'number' ? sprint : undefined;
  const scored = computePriorityScores(
    readyTasks,
    depGraphNodes,
    criticalPathIds,
    sessionStatuses,
    scheduleTaskMap,
    phaseProgress,
    currentSprintNum
  );

  const map = new Map<string, ScoredTask>();
  for (const s of scored) {
    map.set(s.taskId, s);
  }
  return map;
}

export default function NextStepsView({
  onTaskClick,
  sprint = 'all',
}: Readonly<NextStepsViewProps>) {
  const [data, setData] = useState<DependencyGraphResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSprints, setExpandedSprints] = useState<Set<number>>(new Set([0, 1]));
  const [showAllBlocked, setShowAllBlocked] = useState(false);

  // Start task state
  const [startingTask, setStartingTask] = useState<string | null>(null);
  const [planningTask, setPlanningTask] = useState<string | null>(null);
  const [showMatopModal, setShowMatopModal] = useState(false);
  const [selectedTaskForStart, setSelectedTaskForStart] = useState<ReadyTaskDetail | null>(null);
  const [startResult, setStartResult] = useState<{ success: boolean; message: string } | null>(
    null
  );
  const [taskPlanStatus, setTaskPlanStatus] = useState<
    Record<
      string,
      { hasSpec: boolean; hasPlan: boolean; specPath?: string | null; planPath?: string | null }
    >
  >({});
  const [scoredMap, setScoredMap] = useState<Map<string, ScoredTask>>(new Map());

  const getSprintParam = (): string => {
    if (sprint === 'all') return 'all';
    if (sprint === 'Continuous') return 'continuous';
    return String(sprint);
  };

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const sprintParam = getSprintParam();
      const response = await fetch(`/api/dependency-graph?sprint=${sprintParam}`);
      if (!response.ok) throw new Error('Failed to fetch dependency graph');

      const result = await response.json();
      setData(result);

      if (result.summary?.next_sprint !== null) {
        setExpandedSprints((prev) => new Set([...prev, result.summary.next_sprint]));
      }

      if (result.ready_to_start && result.ready_to_start.length > 0) {
        const planStatusMap = await buildPlanStatusMap(result.ready_to_start);
        setTaskPlanStatus(planStatusMap);
        const newMap = await computeScoredTaskMap(result, planStatusMap, sprintParam, sprint);
        setScoredMap(newMap);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [sprint]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleSprint = (sprint: number) => {
    setExpandedSprints((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(sprint)) {
        newSet.delete(sprint);
      } else {
        newSet.add(sprint);
      }
      return newSet;
    });
  };

  const handleTaskClick = (taskId: string) => {
    if (onTaskClick) {
      onTaskClick(taskId);
    }
  };

  const handleStartClick = (e: React.MouseEvent, task: ReadyTaskDetail) => {
    e.stopPropagation(); // Prevent task click
    setSelectedTaskForStart(task);
    setShowMatopModal(true);
    setStartResult(null);
  };

  const startTask = async (runMatop: boolean) => {
    if (!selectedTaskForStart) return;

    setStartingTask(selectedTaskForStart.taskId);
    setShowMatopModal(false);

    try {
      const response = await fetch('/api/tasks/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: selectedTaskForStart.taskId,
          runMatop,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        setStartResult({
          success: true,
          message: runMatop
            ? `Task started! Use spec ${result.specPath || ''} and plan ${result.planPath || ''}. Run in Claude Code: ${result.matopCommand}`
            : `${result.message} Spec: ${result.specPath || ''} Plan: ${result.planPath || ''}`,
        });
        // Refresh the dependency graph
        await fetchData();
      } else {
        setStartResult({
          success: false,
          message: result.error || 'Failed to start task',
        });
      }
    } catch (err) {
      setStartResult({
        success: false,
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setStartingTask(null);
      setSelectedTaskForStart(null);
    }
  };

  const closeResultBanner = () => {
    setStartResult(null);
  };

  const handlePlanClick = (e: React.MouseEvent, task: ReadyTaskDetail) => {
    e.stopPropagation(); // Prevent task click
    planTask(task.taskId);
  };

  const planTask = async (taskId: string) => {
    setPlanningTask(taskId);
    setStartResult(null);

    try {
      const response = await fetch('/api/tasks/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      });

      const result = await response.json();

      if (response.ok) {
        setStartResult({
          success: true,
          message:
            result.status === 'already_planned'
              ? `Task ${taskId} already has spec and plan.`
              : `Task ${taskId} planned! Spec: ${result.specPath}, Plan: ${result.planPath}`,
        });

        // Update local plan status
        setTaskPlanStatus((prev) => ({
          ...prev,
          [taskId]: {
            hasSpec: true,
            hasPlan: true,
            specPath: result.specPath,
            planPath: result.planPath,
          },
        }));

        // Refresh to update any status changes
        await fetchData();
      } else {
        setStartResult({
          success: false,
          message: result.error || 'Failed to plan task',
        });
      }
    } catch (err) {
      setStartResult({
        success: false,
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setPlanningTask(null);
    }
  };

  // Helper to check if a task is planned
  const isTaskPlanned = (taskId: string): boolean => {
    const status = taskPlanStatus[taskId];
    return status?.hasSpec && status?.hasPlan;
  };

  const copyPath = async (e: React.MouseEvent, path?: string | null) => {
    e.stopPropagation();
    if (!path) return;
    try {
      await navigator.clipboard?.writeText(path);
      setStartResult({ success: true, message: `Copied path: ${path}` });
    } catch {
      setStartResult({ success: false, message: 'Failed to copy path' });
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-2">
          <Icon name="refresh" size="lg" className="animate-spin text-blue-600" />
          <span className="text-gray-600">Loading next steps...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-2 text-red-600">
          <Icon name="warning" size="lg" />
          <span>Error loading dependency graph: {error}</span>
        </div>
        <button
          onClick={fetchData}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { ready_by_sprint, blocked_tasks_details, summary, last_updated } = data;

  // Sort sprints numerically
  const sortedSprints = Object.keys(ready_by_sprint)
    .map(Number)
    .filter((s) => s >= 0)
    .sort((a, b) => a - b);

  const blockedToShow = showAllBlocked ? blocked_tasks_details : blocked_tasks_details.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Result Banner */}
      {startResult && (
        <div
          className={`rounded-lg p-4 flex items-center justify-between ${
            startResult.success
              ? 'bg-green-100 border border-green-300 text-green-800'
              : 'bg-red-100 border border-red-300 text-red-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {startResult.success ? (
              <Icon name="play_arrow" size="lg" />
            ) : (
              <Icon name="warning" size="lg" />
            )}
            <span className="text-sm font-medium">{startResult.message}</span>
          </div>
          <button onClick={closeResultBanner} className="hover:opacity-70">
            <Icon name="close" size="sm" />
          </button>
        </div>
      )}

      {/* MATOP Confirmation Modal */}
      {showMatopModal && selectedTaskForStart && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                  <Icon name="play_arrow" size="xl" className="text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Start Task</h3>
                  <p className="text-blue-100 text-sm font-mono">{selectedTaskForStart.taskId}</p>
                </div>
              </div>
            </div>

            <div className="p-6">
              <p className="text-gray-700 mb-4">{selectedTaskForStart.description}</p>

              <div className="space-y-3">
                <button
                  onClick={() => startTask(false)}
                  className="w-full flex items-center justify-between p-4 border-2 border-gray-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <Icon
                      name="play_arrow"
                      size="lg"
                      className="text-gray-500 group-hover:text-blue-600"
                    />
                    <div className="text-left">
                      <p className="font-medium text-gray-900">Start Only</p>
                      <p className="text-xs text-gray-500">Mark as In Progress, work manually</p>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => startTask(true)}
                  className="w-full flex items-center justify-between p-4 border-2 border-indigo-200 bg-indigo-50 rounded-lg hover:border-indigo-400 hover:bg-indigo-100 transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <Icon name="terminal" size="lg" className="text-indigo-600" />
                    <div className="text-left">
                      <p className="font-medium text-indigo-900">Start + MATOP</p>
                      <p className="text-xs text-indigo-600">Run /matop-execute in Claude Code</p>
                    </div>
                  </div>
                  <span className="text-xs bg-indigo-200 text-indigo-800 px-2 py-1 rounded-full">
                    Recommended
                  </span>
                </button>
              </div>
            </div>

            <div className="bg-gray-50 px-6 py-4 flex justify-end">
              <button
                onClick={() => {
                  setShowMatopModal(false);
                  setSelectedTaskForStart(null);
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ready to Start Section */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                <Icon name="rocket_launch" size="xl" className="text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Ready to Start</h3>
                <p className="text-green-100 text-sm">
                  {summary.ready_count} task{summary.ready_count === 1 ? '' : 's'} with all
                  dependencies satisfied
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-3xl font-bold text-white">{summary.ready_count}</span>
              <p className="text-green-100 text-xs">Next: Sprint {summary.next_sprint ?? '-'}</p>
            </div>
          </div>
        </div>

        <div className="p-4">
          {sortedSprints.length === 0 ? (
            <p className="text-gray-500 text-center py-4">
              No tasks ready to start. Complete pending dependencies first.
            </p>
          ) : (
            <div className="space-y-3">
              {sortedSprints.map((sprint) => {
                const rawSprintTasks = ready_by_sprint[sprint] || [];
                // Sort tasks within each sprint by priority score (highest first)
                const sprintTasks = [...rawSprintTasks].sort((a, b) => {
                  const scoreA = scoredMap.get(a.taskId)?.score ?? 0;
                  const scoreB = scoredMap.get(b.taskId)?.score ?? 0;
                  return scoreB - scoreA;
                });
                const isExpanded = expandedSprints.has(sprint);
                const isNextSprint = sprint === summary.next_sprint;

                // Count bucket distribution for header
                const nowCount = sprintTasks.filter(
                  (t) => scoredMap.get(t.taskId)?.bucket === 'now'
                ).length;
                const nextCount = sprintTasks.filter(
                  (t) => scoredMap.get(t.taskId)?.bucket === 'next'
                ).length;

                return (
                  <div
                    key={sprint}
                    className={`border rounded-lg overflow-hidden ${
                      isNextSprint ? 'border-green-300 bg-green-50' : 'border-gray-200'
                    }`}
                  >
                    <button
                      onClick={() => toggleSprint(sprint)}
                      className={`w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors ${
                        isNextSprint ? 'hover:bg-green-100' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <Icon name="expand_more" size="lg" className="text-gray-400" />
                        ) : (
                          <Icon name="chevron_right" size="lg" className="text-gray-400" />
                        )}
                        <span className="font-medium text-gray-900">Sprint {sprint}</span>
                        {isNextSprint && (
                          <span className="px-2 py-0.5 bg-green-200 text-green-800 text-xs rounded-full font-medium">
                            Next Up
                          </span>
                        )}
                      </div>
                      <span className="text-sm text-gray-500">
                        {sprintTasks.length} task{sprintTasks.length === 1 ? '' : 's'}
                        {(nowCount > 0 || nextCount > 0) && (
                          <span className="ml-1 text-xs">
                            ({nowCount > 0 && <span className="text-red-600">{nowCount} NOW</span>}
                            {nowCount > 0 && nextCount > 0 && ' \u00b7 '}
                            {nextCount > 0 && (
                              <span className="text-amber-600">{nextCount} NEXT</span>
                            )}
                            )
                          </span>
                        )}
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-gray-200 divide-y divide-gray-100">
                        {sprintTasks.map((task) => {
                          const planMeta = taskPlanStatus[task.taskId];
                          const specPath = planMeta?.specPath;
                          const planPath = planMeta?.planPath;
                          const status = (task.status || '').toUpperCase();
                          const isReadyStatus =
                            status === '' || status === 'BACKLOG' || status === 'PLANNED';

                          return (
                            <div
                              key={task.taskId}
                              onClick={() => handleTaskClick(task.taskId)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  handleTaskClick(task.taskId);
                                }
                              }}
                              tabIndex={0}
                              className="p-3 hover:bg-gray-50 cursor-pointer transition-colors"
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-sm font-medium text-blue-600">
                                      {task.taskId}
                                    </span>
                                    <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                                      {task.section}
                                    </span>
                                    {/* Priority badge */}
                                    {scoredMap.has(task.taskId) &&
                                      (() => {
                                        const scored = scoredMap.get(task.taskId)!;
                                        const nextOrLaterColor =
                                          scored.bucket === 'next'
                                            ? 'bg-amber-100 text-amber-700'
                                            : 'bg-gray-100 text-gray-500';
                                        const badgeColor =
                                          scored.bucket === 'now'
                                            ? 'bg-red-100 text-red-700'
                                            : nextOrLaterColor;
                                        return (
                                          <span
                                            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${badgeColor}`}
                                          >
                                            {scored.bucket.toUpperCase()}
                                          </span>
                                        );
                                      })()}
                                    {status && !isReadyStatus && (
                                      <span className="text-xs px-2 py-0.5 bg-gray-200 text-gray-700 rounded">
                                        {status.replaceAll('_', ' ')}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-sm text-gray-700 mt-1 line-clamp-2">
                                    {task.description}
                                  </p>
                                  {scoredMap.has(task.taskId) && (
                                    <p className="text-xs text-gray-500 mt-0.5">
                                      {scoredMap.get(task.taskId)!.reason}
                                    </p>
                                  )}
                                  {task.dependencies.length > 0 && (
                                    <p className="text-xs text-green-600 mt-1">
                                      Dependencies complete: {task.dependencies.join(', ')}
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 ml-2">
                                  <span className="text-xs text-gray-500 whitespace-nowrap">
                                    {task.owner}
                                  </span>
                                  {/* Show Plan or Start button based on planning status and task readiness */}
                                  {!isReadyStatus && (
                                    <span className="text-xs text-gray-500">
                                      Not ready to plan/start
                                    </span>
                                  )}
                                  {isReadyStatus && isTaskPlanned(task.taskId) && (
                                    <>
                                      <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                                        <Icon name="check" size="xs" />
                                        Planned
                                      </span>
                                      <button
                                        onClick={(e) => copyPath(e, specPath)}
                                        className="px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-1 border border-gray-200 text-gray-700 hover:bg-gray-100"
                                        title={specPath || 'Spec path'}
                                      >
                                        <Icon name="content_copy" size="xs" />
                                        Spec
                                      </button>
                                      <button
                                        onClick={(e) => copyPath(e, planPath)}
                                        className="px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-1 border border-gray-200 text-gray-700 hover:bg-gray-100"
                                        title={planPath || 'Plan path'}
                                      >
                                        <Icon name="content_copy" size="xs" />
                                        Plan
                                      </button>
                                      <button
                                        onClick={(e) => handleStartClick(e, task)}
                                        disabled={startingTask === task.taskId}
                                        className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-all ${
                                          startingTask === task.taskId
                                            ? 'bg-gray-200 text-gray-500 cursor-wait'
                                            : 'bg-green-600 text-white hover:bg-green-700 shadow-sm hover:shadow'
                                        }`}
                                      >
                                        {startingTask === task.taskId ? (
                                          <>
                                            <Icon
                                              name="progress_activity"
                                              size="sm"
                                              className="animate-spin"
                                            />
                                            <span>Starting...</span>
                                          </>
                                        ) : (
                                          <>
                                            <Icon name="play_arrow" size="sm" />
                                            <span>Start</span>
                                          </>
                                        )}
                                      </button>
                                    </>
                                  )}
                                  {isReadyStatus && !isTaskPlanned(task.taskId) && (
                                    <button
                                      onClick={(e) => handlePlanClick(e, task)}
                                      disabled={planningTask === task.taskId}
                                      className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-all ${
                                        planningTask === task.taskId
                                          ? 'bg-gray-200 text-gray-500 cursor-wait'
                                          : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm hover:shadow'
                                      }`}
                                    >
                                      {planningTask === task.taskId ? (
                                        <>
                                          <Icon
                                            name="progress_activity"
                                            size="sm"
                                            className="animate-spin"
                                          />
                                          <span>Planning...</span>
                                        </>
                                      ) : (
                                        <>
                                          <Icon name="edit_document" size="sm" />
                                          <span>Plan</span>
                                        </>
                                      )}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Blocked Tasks Section */}
      {blocked_tasks_details.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="bg-gradient-to-r from-orange-500 to-amber-600 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                  <Icon name="lock" size="xl" className="text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Blocked Tasks</h3>
                  <p className="text-orange-100 text-sm">Waiting on dependencies</p>
                </div>
              </div>
              <span className="text-3xl font-bold text-white">{summary.blocked_count}</span>
            </div>
          </div>

          <div className="p-4">
            <div className="space-y-3">
              {blockedToShow.map((task) => (
                <div
                  key={task.taskId}
                  onClick={() => handleTaskClick(task.taskId)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleTaskClick(task.taskId);
                    }
                  }}
                  tabIndex={0}
                  className="border border-orange-200 rounded-lg p-3 hover:bg-orange-50 cursor-pointer transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium text-blue-600">
                          {task.taskId}
                        </span>
                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                          Sprint {task.sprint}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 mt-1 line-clamp-1">{task.description}</p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        <span className="text-xs text-orange-600">Blocked by:</span>
                        {task.pendingDeps.map((dep) => {
                          const blockedOrDefaultDepClass =
                            dep.status === 'BLOCKED'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-gray-100 text-gray-700';
                          const depStatusClass =
                            dep.status === 'IN_PROGRESS'
                              ? 'bg-blue-100 text-blue-700'
                              : blockedOrDefaultDepClass;
                          return (
                            <span
                              key={dep.taskId}
                              className={`text-xs px-1.5 py-0.5 rounded ${depStatusClass}`}
                            >
                              {dep.taskId} ({dep.status})
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {blocked_tasks_details.length > 5 && (
              <button
                onClick={() => setShowAllBlocked(!showAllBlocked)}
                className="mt-3 w-full text-center text-sm text-orange-600 hover:text-orange-800 py-2"
              >
                {showAllBlocked
                  ? 'Show less'
                  : `Show ${blocked_tasks_details.length - 5} more blocked tasks`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Sync Status */}
      <div className="flex items-center justify-between text-xs text-gray-500 px-1">
        <span>Last updated: {new Date(last_updated).toLocaleString()}</span>
        <button
          onClick={fetchData}
          className="flex items-center gap-1 hover:text-gray-700 transition-colors"
        >
          <Icon name="refresh" size="xs" />
          Refresh
        </button>
      </div>
    </div>
  );
}
