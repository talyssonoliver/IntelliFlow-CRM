'use client';

import { useState, useEffect, useMemo } from 'react';
import { clsx } from 'clsx';
import { Icon } from '@/lib/icons';
import GanttChart, { GanttTask } from './GanttChart';
import { useTaskData } from '@/lib/TaskDataContext';

/**
 * Schedule View Component
 *
 * Displays PMBOK schedule management with:
 * - Sprint selector
 * - Gantt chart visualization
 * - Critical path summary
 * - EVM metrics (SPI, SV)
 * - Export functionality
 */

interface ScheduleData {
  sprint: number | string;
  calculatedAt: string;
  config: {
    sprintStart: string;
    sprintEnd: string;
    workingHoursPerDay: number;
    workingDaysPerWeek: number;
  };
  summary: {
    totalTasks: number;
    criticalPathTasks: number;
    completionPercentage: number;
  };
  criticalPath: {
    taskIds: string[];
    totalDuration: number;
    completionPercentage: number;
    bottleneckTaskId?: string;
  };
  scheduleVariance: {
    svMinutes: number;
    spi: number;
    status: 'ahead' | 'on_track' | 'behind' | 'critical';
  };
  tasks: Record<string, GanttTask>;
}

interface CriticalPathData {
  sprint: number;
  criticalPath: {
    taskIds: string[];
    totalDurationMinutes: number;
    totalDurationHours: number;
    completionPercentage: number;
    bottleneckTaskId?: string;
    taskCount: number;
  };
  tasks: Array<{
    taskId: string;
    description: string;
    status: string;
    percentComplete: number;
    expectedDuration: number;
    earlyStart: string;
    earlyFinish: string;
  }>;
  scheduleHealth: {
    spi: number;
    status: string;
    svMinutes: number;
  };
}

export default function ScheduleView() {
  // Use shared context for sprint selection and task modal
  const { currentSprint, setCurrentSprint, sprints, allTasks, selectTask } = useTaskData();

  const [scheduleData, setScheduleData] = useState<ScheduleData | null>(null);
  const [criticalPathData, setCriticalPathData] = useState<CriticalPathData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCriticalOnly, setShowCriticalOnly] = useState(false);

  // Get sprint param for API calls - 'all' or number
  const sprintParam = currentSprint === 'all' ? 'all' : String(currentSprint);

  // Fetch schedule data
  useEffect(() => {
    setLoading(true);
    setError(null);

    Promise.all([
      fetch(`/api/schedule/calculate?sprint=${sprintParam}`).then((res) => res.json()),
      fetch(`/api/schedule/critical-path?sprint=${sprintParam}`).then((res) => res.json()),
    ])
      .then(([scheduleRes, criticalRes]) => {
        if (scheduleRes.error) {
          setError(scheduleRes.error);
        } else {
          setScheduleData(scheduleRes);
        }

        if (!criticalRes.error) {
          setCriticalPathData(criticalRes);
        }

        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to fetch schedule data');
        setLoading(false);
      });
  }, [sprintParam]);

  // Convert schedule tasks to GanttTask array
  const ganttTasks = useMemo((): GanttTask[] => {
    if (!scheduleData?.tasks) return [];

    let tasks = Object.values(scheduleData.tasks);

    if (showCriticalOnly) {
      tasks = tasks.filter((t) => t.isCritical);
    }

    return tasks;
  }, [scheduleData, showCriticalOnly]);

  // Handle task click - use shared modal from context
  const handleTaskClick = (taskId: string) => {
    // Find the full task from allTasks context
    const task = allTasks.find((t) => t.id === taskId);
    if (task) {
      selectTask(task);
    }
  };

  // Get SPI status color
  const getSpiColor = (spi: number) => {
    if (spi >= 1.1) return 'text-green-600';
    if (spi >= 0.95) return 'text-blue-600';
    if (spi >= 0.8) return 'text-amber-600';
    return 'text-red-600';
  };

  const getSpiStatus = (status: string) => {
    switch (status) {
      case 'ahead':
        return { label: 'Ahead of Schedule', color: 'bg-green-100 text-green-800' };
      case 'on_track':
        return { label: 'On Track', color: 'bg-blue-100 text-blue-800' };
      case 'behind':
        return { label: 'Behind Schedule', color: 'bg-amber-100 text-amber-800' };
      case 'critical':
        return { label: 'Critical', color: 'bg-red-100 text-red-800' };
      default:
        return { label: status, color: 'bg-gray-100 text-gray-800' };
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <Icon name="error" size="xl" className="text-red-400 mx-auto mb-3" />
        <h3 className="text-lg font-medium text-red-800">Error Loading Schedule</h3>
        <p className="text-red-600 mt-1">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // Check if sprint is overdue (no incomplete tasks)
  const isSprintComplete = scheduleData && Object.values(scheduleData.tasks).every(
    (t) => t.percentComplete === 100
  );

  // Display label for current view
  const sprintLabel = currentSprint === 'all'
    ? 'All Sprints'
    : `Sprint ${currentSprint}`;

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Schedule Management</h2>
          <p className="text-gray-500 mt-1">
            PMBOK-compliant schedule with critical path analysis
            {currentSprint === 'all' && scheduleData && (
              <span className="ml-2 text-blue-600">
                ({Object.keys(scheduleData.tasks).length} tasks across all sprints)
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-4">
          {/* Sprint selector - synced with main navigation */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Sprint</label>
            <select
              value={currentSprint}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'all') {
                  setCurrentSprint('all');
                } else {
                  setCurrentSprint(Number(val));
                }
              }}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Sprints</option>
              {sprints.filter((s) => typeof s === 'number').map((sprint) => (
                <option key={sprint} value={sprint}>
                  Sprint {sprint}
                </option>
              ))}
            </select>
          </div>

          {/* Critical only toggle */}
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={showCriticalOnly}
              onChange={(e) => setShowCriticalOnly(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Critical Path Only
          </label>
        </div>
      </div>

      {/* Completed Sprint Notice */}
      {isSprintComplete && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
          <Icon name="check_circle" size="lg" className="text-green-500" />
          <div>
            <span className="text-sm font-medium text-green-800">{sprintLabel} Complete</span>
            <span className="text-sm text-green-600 ml-2">
              All {Object.keys(scheduleData?.tasks || {}).length} tasks are 100% complete.
              Critical path analysis shows historical data.
            </span>
          </div>
        </div>
      )}

      {/* EVM Metrics Cards */}
      {scheduleData && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* SPI Card */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-500">Schedule Performance Index</div>
              <Icon name="speed" size="lg" className="text-gray-400" />
            </div>
            <div className={clsx('text-3xl font-bold mt-2', getSpiColor(scheduleData.scheduleVariance.spi))}>
              {scheduleData.scheduleVariance.spi.toFixed(2)}
            </div>
            <div className="mt-2">
              <span
                className={clsx(
                  'px-2 py-1 text-xs font-medium rounded-full',
                  getSpiStatus(scheduleData.scheduleVariance.status).color
                )}
              >
                {getSpiStatus(scheduleData.scheduleVariance.status).label}
              </span>
            </div>
          </div>

          {/* Schedule Variance Card */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-500">Schedule Variance</div>
              <Icon name="trending_up" size="lg" className="text-gray-400" />
            </div>
            <div
              className={clsx(
                'text-3xl font-bold mt-2',
                scheduleData.scheduleVariance.svMinutes >= 0 ? 'text-green-600' : 'text-red-600'
              )}
            >
              {scheduleData.scheduleVariance.svMinutes >= 0 ? '+' : ''}
              {Math.round(scheduleData.scheduleVariance.svMinutes / 60 * 10) / 10}h
            </div>
            <div className="text-sm text-gray-500 mt-1">
              {scheduleData.scheduleVariance.svMinutes} minutes
            </div>
          </div>

          {/* Critical Path Card */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-500">Critical Path</div>
              <Icon name="route" size="lg" className="text-red-400" />
            </div>
            <div className="text-3xl font-bold text-red-600 mt-2">
              {scheduleData.criticalPath.taskIds.length}
            </div>
            <div className="text-sm text-gray-500 mt-1">
              tasks • {Math.round(scheduleData.criticalPath.totalDuration / 60 * 10) / 10}h duration
            </div>
          </div>

          {/* Completion Card */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-500">Critical Path Progress</div>
              <Icon name="pie_chart" size="lg" className="text-gray-400" />
            </div>
            <div className="text-3xl font-bold text-gray-900 mt-2">
              {scheduleData.criticalPath.completionPercentage}%
            </div>
            <div className="h-2 bg-gray-200 rounded-full mt-3 overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${scheduleData.criticalPath.completionPercentage}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Critical Path Summary */}
      {criticalPathData && criticalPathData.criticalPath.taskCount > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Icon name="warning" size="lg" className="text-red-500" />
            Critical Path Tasks
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-4 py-2 font-medium text-gray-600">Task ID</th>
                  <th className="px-4 py-2 font-medium text-gray-600">Description</th>
                  <th className="px-4 py-2 font-medium text-gray-600">Status</th>
                  <th className="px-4 py-2 font-medium text-gray-600 text-center">Progress</th>
                  <th className="px-4 py-2 font-medium text-gray-600 text-right">Duration</th>
                  <th className="px-4 py-2 font-medium text-gray-600">Early Start</th>
                  <th className="px-4 py-2 font-medium text-gray-600">Early Finish</th>
                </tr>
              </thead>
              <tbody>
                {criticalPathData.tasks.map((task) => (
                  <tr
                    key={task.taskId}
                    className={clsx(
                      'border-t border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors',
                      task.taskId === criticalPathData.criticalPath.bottleneckTaskId && 'bg-red-50'
                    )}
                    onClick={() => handleTaskClick(task.taskId)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {task.taskId === criticalPathData.criticalPath.bottleneckTaskId && (
                          <span title="Bottleneck">
                            <Icon name="block" size="sm" className="text-red-500" />
                          </span>
                        )}
                        <span className="font-mono text-blue-700">{task.taskId}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-xs truncate">{task.description}</td>
                    <td className="px-4 py-3">
                      <span
                        className={clsx(
                          'px-2 py-1 text-xs font-medium rounded-full',
                          task.status === 'Completed' && 'bg-green-100 text-green-800',
                          task.status === 'In Progress' && 'bg-blue-100 text-blue-800',
                          task.status === 'Blocked' && 'bg-red-100 text-red-800',
                          !['Completed', 'In Progress', 'Blocked'].includes(task.status) &&
                            'bg-gray-100 text-gray-800'
                        )}
                      >
                        {task.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-red-500 rounded-full"
                            style={{ width: `${task.percentComplete}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-600 w-10 text-right">
                          {task.percentComplete}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-600">
                      {Math.round(task.expectedDuration / 60 * 10) / 10}h
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(task.earlyStart).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(task.earlyFinish).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {criticalPathData.criticalPath.bottleneckTaskId && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
              <Icon name="warning" size="lg" className="text-red-500" />
              <div>
                <span className="text-sm font-medium text-red-800">Current Bottleneck: </span>
                <span className="text-sm text-red-700 font-mono">
                  {criticalPathData.criticalPath.bottleneckTaskId}
                </span>
                <span className="text-sm text-red-600 ml-2">
                  - First incomplete task on critical path
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Gantt Chart */}
      {scheduleData && ganttTasks.length > 0 && (
        <div className="w-full overflow-x-auto">
          <GanttChart
            tasks={ganttTasks}
            sprintStart={scheduleData.config.sprintStart}
            sprintEnd={scheduleData.config.sprintEnd}
            onTaskClick={handleTaskClick}
            className="shadow-sm min-w-full"
          />
        </div>
      )}

      {/* Empty state */}
      {scheduleData && ganttTasks.length === 0 && (
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-12 text-center">
          <Icon name="calendar_today" size="xl" className="text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-700">No Tasks to Display</h3>
          <p className="text-gray-500 mt-2">
            {showCriticalOnly
              ? 'No critical path tasks found for this sprint.'
              : 'No tasks found for this sprint.'}
          </p>
        </div>
      )}

    </div>
  );
}
