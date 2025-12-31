'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Activity,
  Zap,
  Clock,
  X,
  RotateCcw,
  FileText,
  AlertTriangle,
  Heart,
  Play,
  ExternalLink,
} from 'lucide-react';

interface SwarmHealth {
  active: number;
  max?: number;
  watchdog_threshold?: number;
  timestamp: string;
}

interface TaskLog {
  taskId: string;
  status: 'running' | 'stuck' | 'needs_human';
  phase: string;
  currentPhase?: string | null;
  attempt: number;
  lastMessage?: string;
  lastUpdate: string;
  recentActivity?: string[];
  isStuck?: boolean;
  needsHumanReview?: boolean;
  minutesSinceActivity?: number;
  heartbeatAge?: number;
}

// Helper to get status indicator color
function getStatusIndicatorColor(status: TaskLog['status']): string {
  if (status === 'running') return 'bg-blue-500 animate-pulse';
  if (status === 'stuck') return 'bg-yellow-500';
  return 'bg-purple-500';
}

export default function SwarmMonitor() {
  const [health, setHealth] = useState<SwarmHealth | null>(null);
  const [activeTasks, setActiveTasks] = useState<TaskLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const handleKillTask = async (taskId: string) => {
    if (!confirm(`Kill agent working on ${taskId}? This will stop the current execution.`)) return;

    try {
      const response = await fetch(`/api/swarm/kill-task/${taskId}`, { method: 'POST' });
      if (response.ok) {
        alert(`Task ${taskId} killed successfully`);
      } else {
        alert('Failed to kill task');
      }
    } catch (error) {
      console.error('Failed to kill task:', error);
      alert('Error killing task');
    }
  };

  const handleRestartTask = async (taskId: string) => {
    if (!confirm(`Restart ${taskId}? This will kill the current execution and start fresh.`))
      return;

    try {
      const response = await fetch(`/api/swarm/restart-task/${taskId}`, { method: 'POST' });
      if (response.ok) {
        alert(`Task ${taskId} will restart shortly`);
      } else {
        alert('Failed to restart task');
      }
    } catch (error) {
      console.error('Failed to restart task:', error);
      alert('Error restarting task');
    }
  };

  const handleViewLog = (taskId: string) => {
    window.open(`/api/swarm/view-log/${taskId}`, '_blank');
  };

  const handleOpenTerminal = (taskId: string) => {
    window.open(`/terminal/${taskId}`, '_blank', 'width=1200,height=800');
  };

  useEffect(() => {
    const fetchSwarmStatus = async () => {
      try {
        // Read swarm health file
        const healthResponse = await fetch('/api/swarm/health');
        if (healthResponse.ok) {
          const healthData = await healthResponse.json();
          setHealth(healthData);
        }

        // Read active locks
        const tasksResponse = await fetch('/api/swarm/active-tasks');
        if (tasksResponse.ok) {
          const tasksData = await tasksResponse.json();
          setActiveTasks(tasksData);
        }
      } catch (error) {
        console.error('Failed to fetch swarm status:', error);
      } finally {
        setIsLoading(false);
      }
    };

    // Initial fetch
    fetchSwarmStatus();

    // Only poll if there are active tasks (prevents memory waste)
    // Polling disabled by default to save resources
    // To enable: uncomment the lines below
    // const interval = setInterval(fetchSwarmStatus, 10000); // 10 seconds
    // return () => clearInterval(interval);
  }, []);

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-blue-600 animate-pulse" />
          <h3 className="text-lg font-semibold text-gray-900">Swarm Manager</h3>
        </div>
        <p className="text-sm text-gray-500">Loading swarm status...</p>
      </div>
    );
  }

  const maxConcurrent = health?.max || 4;
  const activeCount = health?.active || activeTasks.length;

  const getCapacityColor = (active: number, max: number) => {
    if (active === max) return 'bg-yellow-500';
    if (active > 0) return 'bg-green-500';
    return 'bg-gray-400';
  };

  const getRunningTime = (timestamp: string) => {
    const start = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffSecs = Math.floor((diffMs % 60000) / 1000);

    if (diffMins > 0) {
      return `${diffMins}m ${diffSecs}s`;
    }
    return `${diffSecs}s`;
  };

  const getCapacityStatus = (active: number, max: number) => {
    if (active === max) return 'All agents busy';
    if (active > 0) return `${max - active} available`;
    return 'Ready to process';
  };

  const getTaskCardStyle = (task: TaskLog) => {
    if (task.status === 'needs_human' || task.needsHumanReview) {
      return 'bg-gradient-to-r from-purple-50 to-pink-50 border-purple-300';
    }
    if (task.status === 'stuck' || task.isStuck) {
      return 'bg-gradient-to-r from-yellow-50 to-orange-50 border-yellow-300';
    }
    return 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200';
  };

  const getHeartbeatStatus = (heartbeatAge?: number) => {
    if (heartbeatAge === undefined || heartbeatAge < 0) {
      return { color: 'text-gray-400', label: 'No heartbeat', isAlive: false };
    }
    if (heartbeatAge < 30) {
      return { color: 'text-green-500', label: `${heartbeatAge}s ago`, isAlive: true };
    }
    if (heartbeatAge < 60) {
      return { color: 'text-yellow-500', label: `${heartbeatAge}s ago`, isAlive: true };
    }
    if (heartbeatAge < 300) {
      return {
        color: 'text-orange-500',
        label: `${Math.floor(heartbeatAge / 60)}m ago`,
        isAlive: true,
      };
    }
    return {
      color: 'text-red-500',
      label: `${Math.floor(heartbeatAge / 60)}m ago`,
      isAlive: false,
    };
  };

  const getPhaseIcon = (currentPhase?: string | null) => {
    if (!currentPhase) return <Play className="w-4 h-4" />;

    if (currentPhase.includes('CRASHED') || currentPhase.includes('STUCK')) {
      return <AlertTriangle className="w-4 h-4 text-red-500" />;
    }
    if (currentPhase.includes('COMPLETED')) {
      return <Activity className="w-4 h-4 text-green-500" />;
    }
    return <Zap className="w-4 h-4 text-blue-500 animate-pulse" />;
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity
            className={`w-5 h-5 ${activeCount > 0 ? 'text-green-600 animate-pulse' : 'text-gray-400'}`}
          />
          <h3 className="text-lg font-semibold text-gray-900">Swarm Manager</h3>
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
            Streaming Enabled
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${activeCount > 0 ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}
            />
            <span className="text-sm text-gray-600">{activeCount > 0 ? 'Active' : 'Idle'}</span>
          </div>
          <Link
            href="/swarm"
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
          >
            Full Control
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* Agent Capacity */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center justify-between mb-3">
          <div>
            <span className="text-sm font-semibold text-gray-900">Agent Capacity</span>
            <p className="text-xs text-gray-500 mt-1">
              {getCapacityStatus(activeCount, maxConcurrent)}
            </p>
          </div>
          <span className="text-2xl font-bold text-blue-600">
            {activeCount} / {maxConcurrent}
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className={`h-3 rounded-full transition-all duration-300 ${getCapacityColor(activeCount, maxConcurrent)}`}
            style={{ width: `${(activeCount / maxConcurrent) * 100}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
          <span>0</span>
          <span className="font-medium">
            {Math.round((activeCount / maxConcurrent) * 100)}% utilized
          </span>
          <span>{maxConcurrent}</span>
        </div>
      </div>

      {/* Active Tasks */}
      {activeTasks.length > 0 ? (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">
            Active Tasks ({activeTasks.length})
          </h4>
          {activeTasks.map((task) => {
            const heartbeat = getHeartbeatStatus(task.heartbeatAge);

            return (
              <div
                key={task.taskId}
                className={`p-4 rounded-lg border shadow-sm hover:shadow-md transition-shadow ${getTaskCardStyle(task)}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {getPhaseIcon(task.currentPhase)}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900">{task.taskId}</span>
                        {task.status === 'stuck' && (
                          <span className="text-xs bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded font-semibold">
                            STUCK
                          </span>
                        )}
                        {task.status === 'needs_human' && (
                          <span className="text-xs bg-purple-200 text-purple-800 px-2 py-0.5 rounded font-semibold">
                            NEEDS REVIEW
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">
                        Running for {getRunningTime(task.lastUpdate)}
                      </span>
                    </div>
                  </div>

                  {/* Heartbeat Indicator */}
                  <div className="flex items-center gap-1">
                    <Heart
                      className={`w-4 h-4 ${heartbeat.color} ${heartbeat.isAlive ? 'animate-pulse' : ''}`}
                    />
                    <span className={`text-xs ${heartbeat.color}`}>{heartbeat.label}</span>
                  </div>
                </div>

                {/* Phase and Attempt Display */}
                <div className="mt-3 space-y-3">
                  <div className="flex items-center gap-2 bg-white/70 p-2 rounded border border-blue-100">
                    <div
                      className={`w-2 h-2 rounded-full ${getStatusIndicatorColor(task.status)} flex-shrink-0`}
                    />
                    <div className="flex-1">
                      <div className="text-xs text-gray-600 font-medium">Current Phase</div>
                      <div className="text-sm font-bold text-gray-800">{task.phase}</div>
                    </div>
                    {task.attempt > 1 && (
                      <div className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">
                        Attempt {task.attempt}
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  {(task.isStuck || task.needsHumanReview || task.status !== 'running') && (
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-200">
                      <button
                        onClick={() => handleOpenTerminal(task.taskId)}
                        className="flex items-center gap-1 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 rounded-lg shadow-md transition-all"
                      >
                        <Activity className="w-4 h-4" />
                        Open Terminal & Help
                      </button>
                      <button
                        onClick={() => handleViewLog(task.taskId)}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded transition-colors"
                      >
                        <FileText className="w-3 h-3" />
                        View Log
                      </button>
                      <button
                        onClick={() => handleRestartTask(task.taskId)}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-yellow-700 bg-yellow-100 hover:bg-yellow-200 rounded transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Restart
                      </button>
                      <button
                        onClick={() => handleKillTask(task.taskId)}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-100 hover:bg-red-200 rounded transition-colors"
                      >
                        <X className="w-3 h-3" />
                        Kill
                      </button>
                      {task.isStuck && (
                        <div className="ml-auto flex items-center gap-1 text-xs text-yellow-700">
                          <AlertTriangle className="w-3 h-3" />
                          <span className="font-medium">Agent may need manual intervention</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Recent Activity Stream */}
                  {task.recentActivity && task.recentActivity.length > 0 && (
                    <div className="pt-2 border-t border-blue-200">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-semibold text-gray-700">Activity Stream</div>
                        <div className="text-xs text-gray-500">
                          {task.recentActivity.length} events
                        </div>
                      </div>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {task.recentActivity.map((activity, idx) => (
                          <div
                            key={`${task.taskId}-${idx}`}
                            className="flex items-start gap-2 text-xs"
                          >
                            <div className="w-1 h-1 bg-blue-400 rounded-full mt-1.5 flex-shrink-0" />
                            <div className="text-gray-600 leading-relaxed flex-1">{activity}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-4">
          <Clock className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No agents currently running</p>
          <p className="text-xs text-gray-400 mt-1">Waiting for tasks...</p>
        </div>
      )}

      {/* Last Update */}
      {health?.timestamp && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Last update: {new Date(health.timestamp).toLocaleTimeString()}</span>
            {health.watchdog_threshold && (
              <span>Watchdog: {Math.floor(health.watchdog_threshold / 60)}m threshold</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
