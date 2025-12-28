'use client';

import { useState, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import {
  Play,
  Pause,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Users,
  Zap,
  FileText,
  ChevronDown,
  ChevronRight,
  History,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';

interface ExecutionPhase {
  phaseNumber: number;
  name: string;
  executionType: 'sequential' | 'parallel';
  taskCount: number;
  tasks: TaskEntry[];
  parallelStreams?: string[];
}

interface TaskEntry {
  taskId: string;
  description: string;
  executionMode: 'swarm' | 'matop' | 'manual';
  parallelStreamId?: string;
}

interface PhaseProgress {
  phaseNumber: number;
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  inProgressTasks: number;
}

interface SubAgentInfo {
  agentId: string;
  taskId: string;
  type: 'swarm' | 'matop';
  status: 'spawned' | 'running' | 'completed' | 'failed';
  streamId?: string;
}

interface SprintExecutionState {
  sprintNumber: number | 'all';
  runId: string;
  startedAt: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused';
  currentPhase: number;
  totalPhases: number;
  phaseProgress: PhaseProgress[];
  activeSubAgents: SubAgentInfo[];
  completedTasks: string[];
  failedTasks: string[];
  needsHumanTasks: string[];
}

interface PhasesResponse {
  success: boolean;
  sprintNumber: number | 'all';
  phases: ExecutionPhase[];
  summary: {
    totalTasks: number;
    completedTasks: number;
    inProgressTasks: number;
    pendingTasks: number;
    readyToStart: number;
    blocked: number;
  };
}

interface SprintExecutionViewProps {
  sprintNumber?: number | 'all';
}

interface ExecutionHistoryRun {
  runId: string;
  sprintNumber: number | 'all';
  timestamp: string;
  status: 'running' | 'completed' | 'failed' | 'paused';
  totalTasks: number;
  results: {
    pass: number;
    warn: number;
    fail: number;
    error: number;
    skipped: number;
  };
  duration: number;
  formattedDuration: string;
  passRatePercent: number;
}

interface HistoryStats {
  totalRuns: number;
  successRate: number;
  averagePassRate: number;
  lastRunAt: string | null;
  trend: 'improving' | 'stable' | 'declining';
}

export default function SprintExecutionView({ sprintNumber }: SprintExecutionViewProps) {
  const targetSprint: number | 'all' = sprintNumber ?? 'all';
  const [phases, setPhases] = useState<ExecutionPhase[]>([]);
  const [executionState, setExecutionState] = useState<SprintExecutionState | null>(null);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedPhases, setExpandedPhases] = useState<Set<number>>(new Set([0]));
  const [summary, setSummary] = useState<PhasesResponse['summary'] | null>(null);

  // History state
  const [historyRuns, setHistoryRuns] = useState<ExecutionHistoryRun[]>([]);
  const [historyStats, setHistoryStats] = useState<HistoryStats | null>(null);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Reset state when sprint changes
  useEffect(() => {
    setPhases([]);
    setSummary(null);
    setExecutionState(null);
    setError(null);
    setHistoryRuns([]);
    setHistoryStats(null);
  }, [targetSprint]);

  const fetchPhases = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/sprint/phases?sprint=${targetSprint}`);
      const data: PhasesResponse = await response.json();

      if (data.success) {
        setPhases(data.phases);
        setSummary(data.summary);
        setError(null);
      } else {
        setError('Failed to load phases');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch phases');
    } finally {
      setLoading(false);
    }
  }, [targetSprint]);

  const fetchStatus = useCallback(async () => {
    if (!executionState?.runId) return;

    try {
      const response = await fetch(`/api/sprint/status?runId=${executionState.runId}`);
      const data = await response.json();

      if (data.success && data.state) {
        setExecutionState(data.state);
      }
    } catch (err) {
      console.error('Failed to fetch status:', err);
    }
  }, [executionState?.runId]);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      // Fetch runs and stats in parallel
      const [runsRes, statsRes] = await Promise.all([
        fetch(`/api/sprint/history?sprint=${targetSprint}&limit=10`),
        fetch(`/api/sprint/history?sprint=${targetSprint}&stats=true`),
      ]);

      const runsData = await runsRes.json();
      const statsData = await statsRes.json();

      if (runsData.success) {
        setHistoryRuns(runsData.runs || []);
      }

      if (statsData.success && statsData.stats) {
        setHistoryStats(statsData.stats);
      }
    } catch (err) {
      console.error('Failed to fetch history:', err);
    } finally {
      setHistoryLoading(false);
    }
  }, [targetSprint]);

  useEffect(() => {
    fetchPhases();
  }, [fetchPhases]);

  // Fetch history when section is expanded
  useEffect(() => {
    if (historyExpanded && historyRuns.length === 0) {
      fetchHistory();
    }
  }, [historyExpanded, historyRuns.length, fetchHistory]);

  // Real-time updates via Server-Sent Events
  useEffect(() => {
    if (executionState?.status === 'running' && executionState?.runId) {
      const eventSource = new EventSource(`/api/sprint/events?runId=${executionState.runId}`);

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'progress' || data.type === 'task_progress') {
            // Update execution state based on progress events
            fetchStatus();
          } else if (data.type === 'ping') {
            // Keep-alive, ignore
          }
        } catch (err) {
          console.error('Failed to parse SSE event:', err);
        }
      };

      eventSource.onerror = (err) => {
        console.error('SSE connection error:', err);
        // Fallback to polling on SSE error
        const interval = setInterval(fetchStatus, 5000);
        eventSource.close();
        return () => clearInterval(interval);
      };

      return () => {
        eventSource.close();
      };
    }
  }, [executionState?.status, executionState?.runId, fetchStatus]);

  const handleExecute = async (dryRun: boolean = false, autoExecute: boolean = false) => {
    setExecuting(true);
    setError(null);

    try {
      const response = await fetch('/api/sprint/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sprintNumber: targetSprint,
          dryRun,
          autoExecute,
        }),
      });

      const data = await response.json();

      if (data.success) {
        if (dryRun) {
          // Show dry run results in an alert with summary
          const summary = data.summary;
          const message = [
            `Dry Run Complete for ${targetSprint === 'all' ? 'All Sprints' : `Sprint ${targetSprint}`}`,
            ``,
            `Total Phases: ${summary.totalPhases}`,
            `Total Tasks: ${summary.totalTasks}`,
            `Estimated Duration: ${summary.estimatedDurationMinutes} minutes`,
            ``,
            `Tasks by Mode:`,
            `  SWARM (implementation): ${summary.tasksByMode.swarm}`,
            `  MATOP (validation): ${summary.tasksByMode.matop}`,
            `  Manual: ${summary.tasksByMode.manual}`,
            ``,
            `Parallel Streams: ${summary.parallelStreamCount}`,
            `Sequential Phases: ${summary.sequentialPhases}`,
            `Parallel Phases: ${summary.parallelPhases}`,
          ].join('\n');
          alert(message);
          console.log('Dry run execution plan:', data.executionPlan);
        } else if (data.runId) {
          // Initialize execution state for real runs
          const statusResponse = await fetch(`/api/sprint/status?runId=${data.runId}`);
          const statusData = await statusResponse.json();
          if (statusData.state) {
            setExecutionState(statusData.state);
          }
        }
      } else {
        setError(data.error || 'Execution failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to execute sprint');
    } finally {
      setExecuting(false);
    }
  };

  const handleGeneratePrompt = async () => {
    try {
      const response = await fetch('/api/sprint/generate-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sprintNumber,
          format: 'markdown',
        }),
      });

      const data = await response.json();

      if (data.success) {
        alert(`Sprint prompt generated and saved to: ${data.savedTo}`);
      } else {
        setError(data.error || 'Failed to generate prompt');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate prompt');
    }
  };

  const togglePhase = (phaseNumber: number) => {
    const newExpanded = new Set(expandedPhases);
    if (newExpanded.has(phaseNumber)) {
      newExpanded.delete(phaseNumber);
    } else {
      newExpanded.add(phaseNumber);
    }
    setExpandedPhases(newExpanded);
  };

  const getPhaseStatus = (phaseNumber: number): PhaseProgress['status'] => {
    if (!executionState) return 'pending';
    const progress = executionState.phaseProgress.find((p) => p.phaseNumber === phaseNumber);
    return progress?.status || 'pending';
  };

  const getStatusIcon = (status: PhaseProgress['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'in_progress':
        return <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  const getExecutionModeIcon = (mode: string) => {
    switch (mode) {
      case 'swarm':
        return (
          <span title="SWARM">
            <Zap className="w-4 h-4 text-yellow-500" />
          </span>
        );
      case 'matop':
        return (
          <span title="MATOP">
            <CheckCircle2 className="w-4 h-4 text-purple-500" />
          </span>
        );
      default:
        return (
          <span title="Manual">
            <Users className="w-4 h-4 text-gray-500" />
          </span>
        );
    }
  };

  const getTrendIcon = (trend: HistoryStats['trend']) => {
    switch (trend) {
      case 'improving':
        return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'declining':
        return <TrendingDown className="w-4 h-4 text-red-500" />;
      default:
        return <Minus className="w-4 h-4 text-gray-400" />;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
        <span className="ml-2">Loading phases...</span>
      </div>
    );
  }

  // Show message if no sprint is selected
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-semibold">
            {targetSprint === 'all' ? 'All Sprints Execution' : `Sprint ${targetSprint} Execution`}
          </h2>
          {summary && (
            <p className="text-sm text-gray-500">
              {summary.totalTasks} tasks across {phases.length} phases
              {summary.readyToStart > 0 && (
                <span className="ml-2 text-green-600">({summary.readyToStart} ready to start)</span>
              )}
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={fetchPhases}
            className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center gap-1"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>

          <button
            onClick={handleGeneratePrompt}
            className="px-3 py-2 text-sm bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg flex items-center gap-1"
          >
            <FileText className="w-4 h-4" />
            Generate Prompt
          </button>

          <button
            onClick={() => handleExecute(true, false)}
            disabled={executing}
            className="px-3 py-2 text-sm bg-yellow-100 hover:bg-yellow-200 text-yellow-700 rounded-lg flex items-center gap-1 disabled:opacity-50"
          >
            <Play className="w-4 h-4" />
            Dry Run
          </button>

          <button
            onClick={() => handleExecute(false, false)}
            disabled={executing || executionState?.status === 'running'}
            className="px-3 py-2 text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg flex items-center gap-1 disabled:opacity-50"
            title="Initialize execution (manual task running)"
          >
            {executing ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            Initialize
          </button>

          <button
            onClick={() => handleExecute(false, true)}
            disabled={executing || executionState?.status === 'running'}
            className="px-4 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center gap-1 disabled:opacity-50"
            title="Auto-execute tasks via SWARM/MATOP"
          >
            {executing ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Zap className="w-4 h-4" />
            )}
            Auto Execute
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          {error}
        </div>
      )}

      {/* Execution State Banner */}
      {executionState && (
        <div
          className={clsx('p-4 rounded-lg border flex items-center justify-between', {
            'bg-blue-50 border-blue-200': executionState.status === 'running',
            'bg-green-50 border-green-200': executionState.status === 'completed',
            'bg-red-50 border-red-200': executionState.status === 'failed',
            'bg-yellow-50 border-yellow-200': executionState.status === 'paused',
            'bg-gray-50 border-gray-200': executionState.status === 'pending',
          })}
        >
          <div>
            <div className="font-medium">Run: {executionState.runId}</div>
            <div className="text-sm text-gray-600">
              Phase {executionState.currentPhase + 1} of {executionState.totalPhases} |
              {executionState.completedTasks.length} completed |{executionState.failedTasks.length}{' '}
              failed |{executionState.needsHumanTasks.length} needs human
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={clsx('px-2 py-1 rounded text-sm font-medium', {
                'bg-blue-200 text-blue-800': executionState.status === 'running',
                'bg-green-200 text-green-800': executionState.status === 'completed',
                'bg-red-200 text-red-800': executionState.status === 'failed',
                'bg-yellow-200 text-yellow-800': executionState.status === 'paused',
              })}
            >
              {executionState.status.toUpperCase()}
            </span>

            {executionState.status === 'running' && (
              <button className="p-2 hover:bg-white/50 rounded">
                <Pause className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Active Sub-Agents */}
      {executionState?.activeSubAgents && executionState.activeSubAgents.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-sm font-medium mb-2">Active Sub-Agents</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {executionState.activeSubAgents
              .filter((a) => a.status === 'running' || a.status === 'spawned')
              .map((agent) => (
                <div
                  key={agent.agentId}
                  className="bg-white p-2 rounded border text-sm flex items-center gap-2"
                >
                  {getExecutionModeIcon(agent.type)}
                  <span>{agent.taskId}</span>
                  <RefreshCw className="w-3 h-3 animate-spin text-blue-500 ml-auto" />
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Phase List */}
      <div className="space-y-3">
        {phases.map((phase) => {
          const isExpanded = expandedPhases.has(phase.phaseNumber);
          const status = getPhaseStatus(phase.phaseNumber);
          const progress = executionState?.phaseProgress.find(
            (p) => p.phaseNumber === phase.phaseNumber
          );

          return (
            <div key={phase.phaseNumber} className="border rounded-lg overflow-hidden">
              {/* Phase Header */}
              <button
                onClick={() => togglePhase(phase.phaseNumber)}
                className={clsx('w-full px-4 py-3 flex items-center justify-between text-left', {
                  'bg-green-50': status === 'completed',
                  'bg-blue-50': status === 'in_progress',
                  'bg-red-50': status === 'failed',
                  'bg-white': status === 'pending',
                })}
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                  {getStatusIcon(status)}
                  <div>
                    <span className="font-medium">Phase {phase.phaseNumber}</span>
                    <span className="text-gray-500 ml-2">{phase.name}</span>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span
                    className={clsx('text-xs px-2 py-1 rounded', {
                      'bg-purple-100 text-purple-700': phase.executionType === 'parallel',
                      'bg-gray-100 text-gray-700': phase.executionType === 'sequential',
                    })}
                  >
                    {phase.executionType}
                  </span>

                  <span className="text-sm text-gray-500">
                    {progress
                      ? `${progress.completedTasks}/${progress.totalTasks}`
                      : `${phase.taskCount} tasks`}
                  </span>
                </div>
              </button>

              {/* Phase Tasks */}
              {isExpanded && (
                <div className="border-t bg-gray-50 p-4">
                  {phase.parallelStreams && phase.parallelStreams.length > 0 && (
                    <div className="mb-3 text-xs text-purple-600">
                      Parallel Streams: {phase.parallelStreams.join(', ')}
                    </div>
                  )}

                  <div className="space-y-2">
                    {phase.tasks.map((task) => {
                      const isCompleted = executionState?.completedTasks.includes(task.taskId);
                      const isFailed = executionState?.failedTasks.includes(task.taskId);
                      const needsHuman = executionState?.needsHumanTasks.includes(task.taskId);

                      return (
                        <div
                          key={task.taskId}
                          className={clsx('flex items-center gap-3 p-2 rounded bg-white border', {
                            'border-green-300 bg-green-50': isCompleted,
                            'border-red-300 bg-red-50': isFailed,
                            'border-yellow-300 bg-yellow-50': needsHuman,
                          })}
                        >
                          {getExecutionModeIcon(task.executionMode)}

                          <div className="flex-1 min-w-0">
                            <div className="font-mono text-sm">{task.taskId}</div>
                            <div className="text-xs text-gray-500 truncate">{task.description}</div>
                          </div>

                          {task.parallelStreamId && (
                            <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded">
                              {task.parallelStreamId}
                            </span>
                          )}

                          {isCompleted && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                          {isFailed && <XCircle className="w-4 h-4 text-red-500" />}
                          {needsHuman && <AlertTriangle className="w-4 h-4 text-yellow-500" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {phases.length === 0 && !loading && (
        <div className="text-center py-12 text-gray-500">
          <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No phases found for {targetSprint === 'all' ? 'All Sprints' : `Sprint ${targetSprint}`}</p>
          <p className="text-sm mt-2">
            Make sure dependency-graph.json is synced and tasks exist for this sprint.
          </p>
        </div>
      )}

      {/* Execution History Section */}
      <div className="border rounded-lg overflow-hidden mt-6">
        <button
          onClick={() => setHistoryExpanded(!historyExpanded)}
          className="w-full px-4 py-3 flex items-center justify-between text-left bg-gray-50 hover:bg-gray-100"
        >
          <div className="flex items-center gap-3">
            {historyExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
            <History className="w-5 h-5 text-gray-500" />
            <span className="font-medium">Execution History</span>
            {historyStats && (
              <span className="text-sm text-gray-500 ml-2">({historyStats.totalRuns} runs)</span>
            )}
          </div>

          {historyStats && (
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1">
                {getTrendIcon(historyStats.trend)}
                <span className="text-gray-500">{historyStats.trend}</span>
              </div>
              <span
                className={clsx('px-2 py-0.5 rounded', {
                  'bg-green-100 text-green-700': historyStats.averagePassRate >= 80,
                  'bg-yellow-100 text-yellow-700':
                    historyStats.averagePassRate >= 50 && historyStats.averagePassRate < 80,
                  'bg-red-100 text-red-700': historyStats.averagePassRate < 50,
                })}
              >
                {Math.round(historyStats.averagePassRate * 100)}% avg pass rate
              </span>
            </div>
          )}
        </button>

        {historyExpanded && (
          <div className="border-t bg-white p-4">
            {historyLoading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
                <span className="ml-2 text-gray-500">Loading history...</span>
              </div>
            ) : historyRuns.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <History className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>
                  No execution history found for {targetSprint === 'all' ? 'All Sprints' : `Sprint ${targetSprint}`}
                </p>
                <p className="text-sm">Execute the sprint to start tracking history.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Stats Summary */}
                {historyStats && (
                  <div className="grid grid-cols-4 gap-4 mb-4 p-3 bg-gray-50 rounded-lg">
                    <div className="text-center">
                      <div className="text-2xl font-semibold">{historyStats.totalRuns}</div>
                      <div className="text-xs text-gray-500">Total Runs</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-semibold">
                        {Math.round(historyStats.successRate * 100)}%
                      </div>
                      <div className="text-xs text-gray-500">Success Rate</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-semibold">
                        {Math.round(historyStats.averagePassRate * 100)}%
                      </div>
                      <div className="text-xs text-gray-500">Avg Pass Rate</div>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        {getTrendIcon(historyStats.trend)}
                        <span className="text-lg font-medium capitalize">{historyStats.trend}</span>
                      </div>
                      <div className="text-xs text-gray-500">Trend</div>
                    </div>
                  </div>
                )}

                {/* Run List */}
                <div className="space-y-2">
                  {historyRuns.map((run) => (
                    <div
                      key={run.runId}
                      className={clsx('p-3 rounded-lg border flex items-center justify-between', {
                        'bg-green-50 border-green-200':
                          run.status === 'completed' && run.passRatePercent >= 80,
                        'bg-yellow-50 border-yellow-200':
                          run.status === 'completed' &&
                          run.passRatePercent >= 50 &&
                          run.passRatePercent < 80,
                        'bg-red-50 border-red-200':
                          run.status === 'failed' || run.passRatePercent < 50,
                        'bg-blue-50 border-blue-200': run.status === 'running',
                        'bg-gray-50 border-gray-200': run.status === 'paused',
                      })}
                    >
                      <div>
                        <div className="font-mono text-sm">{run.runId}</div>
                        <div className="text-xs text-gray-500">
                          {formatTimestamp(run.timestamp)} • {run.formattedDuration}
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-sm">
                          <span className="text-green-600">{run.results.pass} pass</span>
                          {run.results.fail > 0 && (
                            <span className="text-red-600 ml-2">{run.results.fail} fail</span>
                          )}
                          {run.results.error > 0 && (
                            <span className="text-orange-600 ml-2">{run.results.error} error</span>
                          )}
                          {run.results.skipped > 0 && (
                            <span className="text-gray-500 ml-2">{run.results.skipped} skip</span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-gray-200 rounded-full h-2">
                            <div
                              className={clsx('h-2 rounded-full', {
                                'bg-green-500': run.passRatePercent >= 80,
                                'bg-yellow-500':
                                  run.passRatePercent >= 50 && run.passRatePercent < 80,
                                'bg-red-500': run.passRatePercent < 50,
                              })}
                              style={{ width: `${run.passRatePercent}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium w-10">{run.passRatePercent}%</span>
                        </div>

                        <span
                          className={clsx('text-xs px-2 py-1 rounded', {
                            'bg-green-200 text-green-800': run.status === 'completed',
                            'bg-red-200 text-red-800': run.status === 'failed',
                            'bg-blue-200 text-blue-800': run.status === 'running',
                            'bg-yellow-200 text-yellow-800': run.status === 'paused',
                          })}
                        >
                          {run.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Refresh button */}
                <button
                  onClick={fetchHistory}
                  disabled={historyLoading}
                  className="w-full mt-2 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center justify-center gap-1 disabled:opacity-50"
                >
                  <RefreshCw className={clsx('w-4 h-4', { 'animate-spin': historyLoading })} />
                  Refresh History
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
