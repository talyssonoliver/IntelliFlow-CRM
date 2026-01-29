'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Icon } from '@/lib/icons';

// Helper to determine log level from activity string
function getLogLevel(activity: string): string {
  if (activity.includes('[ERROR]')) return 'ERROR';
  if (activity.includes('[WARN]')) return 'WARN';
  if (activity.includes('[PHASE]')) return 'PHASE';
  if (activity.includes('[SUCCESS]')) return 'SUCCESS';
  return 'INFO';
}

// Helper to get task card border/bg style
function getTaskCardStyle(task: { status: string }, isSelected: boolean): string {
  if (isSelected) return 'border-blue-500 bg-blue-900/20';
  if (task.status === 'needs_human') return 'border-purple-500/50 bg-purple-900/20';
  if (task.status === 'stuck') return 'border-yellow-500/50 bg-yellow-900/20';
  return 'border-gray-700 bg-gray-800/50 hover:border-gray-600';
}

// Helper to get capacity bar color
function getCapacityBarColor(active: number, max: number): string {
  if (active === max) return 'bg-yellow-500';
  if (active > 0) return 'bg-green-500';
  return 'bg-gray-500';
}

interface SwarmHealth {
  active: number;
  max?: number;
  watchdog_threshold?: number;
  recent_claude_errors?: number;
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

interface LogEntry {
  timestamp: string;
  taskId: string;
  level: string;
  message: string;
}

interface Question {
  id: number;
  type: 'codebase' | 'agent' | 'human';
  priority: 'blocking' | 'important' | 'nice-to-have';
  context: string;
  question: string;
  suggestedSources: string;
  answer?: string | null;
}

interface TaskQuestions {
  taskId: string;
  status: string;
  source: 'spec' | 'plan';
  questions: Question[];
}

export default function SwarmPage() {
  const [health, setHealth] = useState<SwarmHealth | null>(null);
  const [activeTasks, setActiveTasks] = useState<TaskLog[]>([]);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [pollInterval, setPollInterval] = useState(3000);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [maxConcurrent, setMaxConcurrent] = useState(4);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [cliOutput, setCliOutput] = useState<string>('');
  const [cliCommand, setCliCommand] = useState<string>('');
  const [isRunningCli, setIsRunningCli] = useState(false);
  const [showCliPanel, setShowCliPanel] = useState(true);
  const [explainTaskId, setExplainTaskId] = useState<string>('');
  const [pendingQuestions, setPendingQuestions] = useState<TaskQuestions[]>([]);
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, Record<number, string>>>(
    {}
  );
  const [isSubmittingAnswers, setIsSubmittingAnswers] = useState<string | null>(null);
  const [showQuestionsPanel, setShowQuestionsPanel] = useState(true);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const cliOutputRef = useRef<HTMLDivElement>(null);

  // Fetch swarm status
  const fetchStatus = useCallback(async () => {
    try {
      const [healthRes, tasksRes] = await Promise.all([
        fetch('/api/swarm/health'),
        fetch('/api/swarm/active-tasks'),
      ]);

      if (healthRes.ok) {
        const data = await healthRes.json();
        setHealth(data);
        setIsConnected(true);
      }

      if (tasksRes.ok) {
        const data = await tasksRes.json();
        setActiveTasks(data);

        // Parse recent activity into log entries
        const newEntries: LogEntry[] = [];
        for (const task of data) {
          if (task.recentActivity) {
            for (const activity of task.recentActivity) {
              newEntries.push({
                timestamp: new Date().toISOString(),
                taskId: task.taskId,
                level: getLogLevel(activity),
                message: activity,
              });
            }
          }
        }

        // Keep last 500 entries
        setLogEntries((prev) => [...prev, ...newEntries].slice(-500));
      }
    } catch (error) {
      console.error('Failed to fetch swarm status:', error);
      setIsConnected(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch pending questions
  const fetchQuestions = useCallback(async () => {
    try {
      const response = await fetch('/api/swarm/questions');
      if (response.ok) {
        const data = await response.json();
        setPendingQuestions(data.tasks || []);
      }
    } catch (error) {
      console.error('Failed to fetch questions:', error);
    }
  }, []);

  // Submit answers to questions
  const submitAnswers = async (taskId: string) => {
    const answers = questionAnswers[taskId];
    if (!answers) return;

    const answersList = Object.entries(answers).map(([qId, answer]) => ({
      questionId: parseInt(qId, 10),
      answer,
    }));

    if (answersList.length === 0) {
      alert('Please provide at least one answer');
      return;
    }

    setIsSubmittingAnswers(taskId);
    try {
      const response = await fetch(`/api/swarm/questions/${taskId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: answersList }),
      });

      const result = await response.json();

      if (response.ok) {
        alert(result.message);
        // Clear answers for this task
        setQuestionAnswers((prev) => {
          const next = { ...prev };
          delete next[taskId];
          return next;
        });
        // Refresh questions
        fetchQuestions();
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      alert(`Failed to submit answers: ${error}`);
    } finally {
      setIsSubmittingAnswers(null);
    }
  };

  // Update answer for a question
  const updateAnswer = (taskId: string, questionId: number, answer: string) => {
    setQuestionAnswers((prev) => ({
      ...prev,
      [taskId]: {
        ...(prev[taskId] || {}),
        [questionId]: answer,
      },
    }));
  };

  // Initial fetch on mount only - no automatic polling to save memory
  // Use the manual Refresh button to update status
  useEffect(() => {
    fetchStatus();
    fetchQuestions();
  }, [fetchStatus, fetchQuestions]);

  // DISABLED: Automatic polling - use manual refresh instead
  // Uncomment below to enable automatic polling
  /*
  useEffect(() => {
    if (activeTasks.length === 0) {
      return;
    }
    const interval = setInterval(() => {
      fetchStatus();
      fetchQuestions();
    }, pollInterval);
    return () => clearInterval(interval);
  }, [activeTasks.length, pollInterval, fetchStatus, fetchQuestions]);
  */

  // Auto-scroll logs
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logEntries, autoScroll]);

  // Task actions
  const handleKillTask = async (taskId: string) => {
    if (!confirm(`Kill agent working on ${taskId}?`)) return;
    try {
      await fetch(`/api/swarm/kill-task/${taskId}`, { method: 'POST' });
      fetchStatus();
    } catch (error) {
      console.error('Failed to kill task:', error);
    }
  };

  const handleRestartTask = async (taskId: string) => {
    if (!confirm(`Restart ${taskId}?`)) return;
    try {
      await fetch(`/api/swarm/restart-task/${taskId}`, { method: 'POST' });
      fetchStatus();
    } catch (error) {
      console.error('Failed to restart task:', error);
    }
  };

  const handleViewLog = (taskId: string) => {
    window.open(`/api/swarm/view-log/${taskId}`, '_blank');
  };

  const handleOpenTerminal = (taskId: string) => {
    window.open(`/terminal/${taskId}`, '_blank', 'width=1200,height=800');
  };

  // Start swarm manager
  const handleStartSwarm = async () => {
    if (!confirm('Start the Swarm Manager? This will begin processing pending tasks.')) return;
    setIsStarting(true);
    try {
      const response = await fetch('/api/swarm/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxConcurrent,
          watchdogThreshold: health?.watchdog_threshold || 900,
        }),
      });
      const result = await response.json();
      if (response.ok) {
        alert(`Swarm started! PID: ${result.pid}`);
        fetchStatus();
      } else {
        alert(`Failed to start swarm: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to start swarm:', error);
      alert('Error starting swarm');
    } finally {
      setIsStarting(false);
    }
  };

  // Stop swarm manager
  const handleStopSwarm = async () => {
    if (!confirm('Stop the Swarm Manager? Running tasks will be allowed to complete.')) return;
    setIsStopping(true);
    try {
      const response = await fetch('/api/swarm/stop', { method: 'POST' });
      const result = await response.json();
      if (response.ok) {
        alert('Swarm stop signal sent');
        fetchStatus();
      } else {
        alert(`Failed to stop swarm: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to stop swarm:', error);
      alert('Error stopping swarm');
    } finally {
      setIsStopping(false);
    }
  };

  // Execute CLI command (supports "command arg1 arg2" format)
  const runCliCommand = async (commandWithArgs: string) => {
    setIsRunningCli(true);
    setCliCommand(commandWithArgs);
    setCliOutput(`Running "${commandWithArgs}"... (may take up to 90s for slow commands)`);

    // Parse command and arguments
    const parts = commandWithArgs.trim().split(/\s+/);
    const command = parts[0];
    const args = parts.slice(1);

    try {
      const response = await fetch('/api/swarm/cli', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, args }),
      });
      const result = await response.json();

      if (result.success) {
        let output = result.stdout || '(no output)';
        // Show warning for partial results
        if (result.partial && result.warning) {
          output = `⚠️ ${result.warning}\n\n${output}`;
        }
        setCliOutput(output);
      } else {
        const errorMsg = result.stderr || result.error || 'Unknown error';
        setCliOutput(`❌ Error (exit ${result.exitCode}):\n${errorMsg}`);
      }
    } catch (error) {
      setCliOutput(`❌ Failed to run command: ${error}`);
    } finally {
      setIsRunningCli(false);
      // Scroll to bottom of CLI output
      if (cliOutputRef.current) {
        cliOutputRef.current.scrollTop = cliOutputRef.current.scrollHeight;
      }
    }
  };

  // Explain a specific task
  const explainTask = async (taskId: string) => {
    if (!taskId.trim()) {
      setCliOutput('❌ Please enter a task ID');
      return;
    }

    setIsRunningCli(true);
    setCliCommand(`explain ${taskId}`);
    setCliOutput(`Fetching explanation for ${taskId}...`);

    try {
      const response = await fetch(`/api/swarm/explain/${taskId}`);
      const result = await response.json();

      if (result.success) {
        setCliOutput(result.explanation || '(no explanation available)');
      } else {
        setCliOutput(`❌ Error: ${result.error || 'Failed to get explanation'}`);
      }
    } catch (error) {
      setCliOutput(`❌ Failed to explain task: ${error}`);
    } finally {
      setIsRunningCli(false);
      if (cliOutputRef.current) {
        cliOutputRef.current.scrollTop = cliOutputRef.current.scrollHeight;
      }
    }
  };

  const toggleTaskExpanded = (taskId: string) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const getHeartbeatStatus = (heartbeatAge?: number) => {
    if (heartbeatAge === undefined || heartbeatAge < 0) {
      return {
        color: 'text-gray-400',
        bgColor: 'bg-gray-400',
        label: 'No heartbeat',
        isAlive: false,
      };
    }
    if (heartbeatAge < 30) {
      return {
        color: 'text-green-500',
        bgColor: 'bg-green-500',
        label: `${heartbeatAge}s`,
        isAlive: true,
      };
    }
    if (heartbeatAge < 60) {
      return {
        color: 'text-yellow-500',
        bgColor: 'bg-yellow-500',
        label: `${heartbeatAge}s`,
        isAlive: true,
      };
    }
    if (heartbeatAge < 300) {
      return {
        color: 'text-orange-500',
        bgColor: 'bg-orange-500',
        label: `${Math.floor(heartbeatAge / 60)}m`,
        isAlive: true,
      };
    }
    return {
      color: 'text-red-500',
      bgColor: 'bg-red-500',
      label: `${Math.floor(heartbeatAge / 60)}m`,
      isAlive: false,
    };
  };

  const getLogLevelColor = (level: string) => {
    switch (level) {
      case 'ERROR':
        return 'text-red-400';
      case 'WARN':
        return 'text-yellow-400';
      case 'PHASE':
        return 'text-purple-400';
      case 'SUCCESS':
        return 'text-green-400';
      default:
        return 'text-blue-400';
    }
  };

  const maxAgents = health?.max || 4;
  const activeCount = health?.active || activeTasks.length;

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 sticky top-0 z-50">
        <div className="max-w-full mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
              >
                <Icon name="home" size="lg" />
              </Link>
              <div className="flex items-center gap-2">
                <Icon name="dns" size="xl" className="text-blue-500" />
                <h1 className="text-xl font-bold">Swarm Control Center</h1>
              </div>
              <div className="flex items-center gap-2 ml-4">
                {isConnected ? (
                  <div className="flex items-center gap-1 text-green-400">
                    <Icon name="wifi" size="sm" />
                    <span className="text-sm">Connected</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-red-400">
                    <Icon name="wifi_off" size="sm" />
                    <span className="text-sm">Disconnected</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Agent Capacity Mini */}
              <div className="flex items-center gap-2 bg-gray-700 px-3 py-1.5 rounded-lg">
                <Icon name="memory" size="sm" className="text-blue-400" />
                <span className="text-sm font-medium">
                  {activeCount} / {maxAgents} Agents
                </span>
                <div className="w-20 h-2 bg-gray-600 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${getCapacityBarColor(activeCount, maxAgents)}`}
                    style={{ width: `${(activeCount / maxAgents) * 100}%` }}
                  />
                </div>
              </div>

              {/* Claude Errors */}
              {health?.recent_claude_errors !== undefined && health.recent_claude_errors > 0 && (
                <div className="flex items-center gap-1 bg-red-900/50 text-red-400 px-3 py-1.5 rounded-lg">
                  <Icon name="warning" size="sm" />
                  <span className="text-sm">{health.recent_claude_errors} Claude errors</span>
                </div>
              )}

              {/* Refresh */}
              <button
                onClick={fetchStatus}
                disabled={isLoading}
                className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                title="Refresh"
              >
                <Icon name="refresh" size="sm" className={isLoading ? 'animate-spin' : ''} />
              </button>

              {/* Settings */}
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                title="Settings"
              >
                <Icon name="settings" size="sm" />
              </button>
            </div>
          </div>

          {/* Config Bar - Always visible */}
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <label htmlFor="poll-interval" className="text-gray-400">
                  Poll Interval:
                </label>
                <select
                  id="poll-interval"
                  value={pollInterval}
                  onChange={(e) => setPollInterval(Number(e.target.value))}
                  className="bg-gray-700 text-white px-2 py-1 rounded text-sm border border-gray-600"
                >
                  <option value={1000}>1s</option>
                  <option value={3000}>3s</option>
                  <option value={5000}>5s</option>
                  <option value={10000}>10s</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-400">Watchdog Threshold:</span>
                <span className="text-white font-medium">
                  {health?.watchdog_threshold
                    ? `${Math.floor(health.watchdog_threshold / 60)}m`
                    : '15m'}
                </span>
              </div>
            </div>

            {/* Start/Stop Buttons */}
            <div className="flex items-center gap-2">
              {activeCount === 0 ? (
                <button
                  onClick={handleStartSwarm}
                  disabled={isStarting}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white font-medium rounded-lg transition-colors"
                >
                  <Icon name="play_arrow" size="sm" className={isStarting ? 'animate-pulse' : ''} />
                  {isStarting ? 'Starting...' : 'Start Swarm'}
                </button>
              ) : (
                <button
                  onClick={handleStopSwarm}
                  disabled={isStopping}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white font-medium rounded-lg transition-colors"
                >
                  <Icon name="stop" size="sm" className={isStopping ? 'animate-pulse' : ''} />
                  {isStopping ? 'Stopping...' : 'Stop Swarm'}
                </button>
              )}
            </div>
          </div>

          {/* Settings Panel - Max concurrent config */}
          {showSettings && (
            <div className="mt-3 p-4 bg-gray-700 rounded-lg">
              <div className="flex items-center gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <label htmlFor="max-concurrent" className="text-gray-400">
                    Max Concurrent Agents:
                  </label>
                  <select
                    id="max-concurrent"
                    value={maxConcurrent}
                    onChange={(e) => setMaxConcurrent(Number(e.target.value))}
                    className="bg-gray-600 text-white px-2 py-1 rounded text-sm border border-gray-500"
                  >
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                    <option value={4}>4</option>
                    <option value={6}>6</option>
                    <option value={8}>8</option>
                  </select>
                </div>
                <span className="text-xs text-gray-500">(Applied on next Start)</span>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex h-[calc(100vh-64px)]">
        {/* Left Panel - Active Tasks & CLI */}
        <div className="w-1/3 border-r border-gray-700 flex flex-col">
          {/* CLI Controls Section */}
          <div className="border-b border-gray-700 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Icon name="terminal" size="lg" className="text-cyan-400" />
                CLI Controls
              </h2>
              <button
                type="button"
                onClick={() => setShowCliPanel(!showCliPanel)}
                className="text-xs text-gray-400 hover:text-white"
              >
                {showCliPanel ? 'Hide' : 'Show'}
              </button>
            </div>

            {showCliPanel && (
              <>
                {/* Command Buttons */}
                <div className="flex flex-wrap gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => runCliCommand('list-ready')}
                    disabled={isRunningCli}
                    className="px-3 py-1.5 text-xs font-medium bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded transition-colors"
                  >
                    List Ready
                  </button>
                  <button
                    type="button"
                    onClick={() => runCliCommand('status')}
                    disabled={isRunningCli}
                    className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded transition-colors"
                  >
                    Status
                  </button>
                  <button
                    type="button"
                    onClick={() => runCliCommand('list')}
                    disabled={isRunningCli}
                    className="px-3 py-1.5 text-xs font-medium bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 rounded transition-colors"
                  >
                    List All
                  </button>
                  <button
                    type="button"
                    onClick={() => runCliCommand('interventions')}
                    disabled={isRunningCli}
                    className="px-3 py-1.5 text-xs font-medium bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 rounded transition-colors"
                  >
                    Interventions
                  </button>
                  <button
                    type="button"
                    onClick={() => runCliCommand('blockers')}
                    disabled={isRunningCli}
                    className="px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 disabled:bg-gray-600 rounded transition-colors"
                  >
                    Blockers
                  </button>
                </div>

                {/* Task Explain Section */}
                <div className="flex items-center gap-2 mb-3 mt-2 pt-2 border-t border-gray-700">
                  <span className="text-xs text-gray-400">Explain Task:</span>
                  <input
                    type="text"
                    value={explainTaskId}
                    onChange={(e) => setExplainTaskId(e.target.value)}
                    placeholder="e.g., ENV-001-AI"
                    className="flex-1 max-w-[200px] px-2 py-1 text-xs bg-gray-800 border border-gray-600 rounded focus:border-cyan-500 focus:outline-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && explainTaskId.trim()) {
                        explainTask(explainTaskId);
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => explainTask(explainTaskId)}
                    disabled={isRunningCli || !explainTaskId.trim()}
                    className="px-3 py-1.5 text-xs font-medium bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 rounded transition-colors"
                  >
                    Explain
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (explainTaskId.trim()) {
                        runCliCommand(`context ${explainTaskId}`);
                      }
                    }}
                    disabled={isRunningCli || !explainTaskId.trim()}
                    className="px-3 py-1.5 text-xs font-medium bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 rounded transition-colors"
                  >
                    Context
                  </button>
                </div>

                {/* CLI Output */}
                {cliOutput && (
                  <div className="mt-2">
                    <div className="text-xs text-gray-500 mb-1">$ orchestrator.sh {cliCommand}</div>
                    <div
                      ref={cliOutputRef}
                      className="bg-gray-950 rounded p-2 max-h-40 overflow-y-auto font-mono text-xs text-gray-300 whitespace-pre-wrap"
                    >
                      {cliOutput}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Pending Questions Section */}
          {pendingQuestions.length > 0 && (
            <div className="border-b border-gray-700 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Icon name="contact_support" size="lg" className="text-purple-400" />
                  Agent Questions (
                  {pendingQuestions.reduce((acc, t) => acc + t.questions.length, 0)})
                </h2>
                <button
                  type="button"
                  onClick={() => setShowQuestionsPanel(!showQuestionsPanel)}
                  className="text-xs text-gray-400 hover:text-white"
                >
                  {showQuestionsPanel ? 'Hide' : 'Show'}
                </button>
              </div>

              {showQuestionsPanel && (
                <div className="space-y-4 max-h-[400px] overflow-y-auto">
                  {pendingQuestions.map((task) => (
                    <div
                      key={task.taskId}
                      className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-3"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-purple-300">{task.taskId}</span>
                        <span className="text-xs text-gray-400">
                          {task.source === 'spec' ? 'Specification' : 'Planning'} phase
                        </span>
                      </div>

                      <div className="space-y-3">
                        {task.questions.map((q) => (
                          <div key={q.id} className="bg-gray-800/50 rounded p-2">
                            <div className="flex items-start gap-2 mb-2">
                              <span
                                className={`text-xs px-2 py-0.5 rounded ${
                                  q.type === 'human'
                                    ? 'bg-purple-500/30 text-purple-300'
                                    : q.type === 'codebase'
                                      ? 'bg-blue-500/30 text-blue-300'
                                      : 'bg-green-500/30 text-green-300'
                                }`}
                              >
                                {q.type}
                              </span>
                              <span
                                className={`text-xs px-2 py-0.5 rounded ${
                                  q.priority === 'blocking'
                                    ? 'bg-red-500/30 text-red-300'
                                    : q.priority === 'important'
                                      ? 'bg-yellow-500/30 text-yellow-300'
                                      : 'bg-gray-500/30 text-gray-300'
                                }`}
                              >
                                {q.priority}
                              </span>
                            </div>

                            <p className="text-sm text-gray-200 mb-2">{q.question}</p>

                            {q.context && (
                              <p className="text-xs text-gray-500 mb-2">
                                <span className="text-gray-400">Context:</span> {q.context}
                              </p>
                            )}

                            {q.answer ? (
                              <div className="flex items-center gap-2 text-xs text-green-400">
                                <Icon name="check_circle" size="xs" />
                                <span>Answered</span>
                              </div>
                            ) : (
                              <textarea
                                placeholder="Type your answer..."
                                value={questionAnswers[task.taskId]?.[q.id] || ''}
                                onChange={(e) => updateAnswer(task.taskId, q.id, e.target.value)}
                                className="w-full px-2 py-1.5 text-sm bg-gray-900 border border-gray-600 rounded focus:border-purple-500 focus:outline-none resize-none"
                                rows={2}
                              />
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          onClick={() => submitAnswers(task.taskId)}
                          disabled={
                            isSubmittingAnswers === task.taskId ||
                            !questionAnswers[task.taskId] ||
                            Object.keys(questionAnswers[task.taskId] || {}).length === 0
                          }
                          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded transition-colors"
                        >
                          <Icon name="send" size="sm" />
                          {isSubmittingAnswers === task.taskId ? 'Submitting...' : 'Submit Answers'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Active Tasks Section */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Icon name="monitoring" size="lg" className="text-blue-400" />
                Active Tasks ({activeTasks.length})
              </h2>
            </div>

            {activeTasks.length === 0 ? (
              <div className="text-center py-12">
                <Icon name="schedule" size="2xl" className="text-gray-600 mx-auto mb-3 text-5xl" />
                <p className="text-gray-500">No agents running</p>
                <p className="text-sm text-gray-600 mt-1">Waiting for tasks...</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activeTasks.map((task) => {
                  const heartbeat = getHeartbeatStatus(task.heartbeatAge);
                  const isExpanded = expandedTasks.has(task.taskId);
                  const isSelected = selectedTask === task.taskId;

                  return (
                    <div
                      key={task.taskId}
                      className={`rounded-lg border transition-all ${getTaskCardStyle(task, isSelected)}`}
                    >
                      {/* Task Header */}
                      <div className="p-3">
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            className="flex items-center gap-2 text-left flex-1"
                            onClick={() => setSelectedTask(task.taskId)}
                          >
                            <div
                              className={`w-2 h-2 rounded-full ${heartbeat.bgColor} ${
                                heartbeat.isAlive ? 'animate-pulse' : ''
                              }`}
                            />
                            <span className="font-medium">{task.taskId}</span>
                            {task.status === 'stuck' && (
                              <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded">
                                STUCK
                              </span>
                            )}
                            {task.status === 'needs_human' && (
                              <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded">
                                NEEDS REVIEW
                              </span>
                            )}
                          </button>
                          <button
                            type="button"
                            className="p-1 hover:bg-gray-700 rounded"
                            onClick={() => toggleTaskExpanded(task.taskId)}
                          >
                            {isExpanded ? (
                              <Icon name="expand_less" size="sm" />
                            ) : (
                              <Icon name="expand_more" size="sm" />
                            )}
                          </button>
                        </div>

                        {/* Phase */}
                        <div className="mt-2 text-sm text-gray-400">{task.phase}</div>

                        {/* Heartbeat and Attempt */}
                        <div className="mt-2 flex items-center gap-4 text-xs">
                          <div className={`flex items-center gap-1 ${heartbeat.color}`}>
                            <Icon name="favorite" size="xs" />
                            <span>{heartbeat.label}</span>
                          </div>
                          {task.attempt > 1 && (
                            <span className="text-orange-400">Attempt {task.attempt}</span>
                          )}
                        </div>
                      </div>

                      {/* Expanded Content - Outside the button */}
                      {isExpanded && (
                        <div className="border-t border-gray-700 p-3">
                          {/* Actions */}
                          <div className="flex flex-wrap gap-2 mb-3">
                            <button
                              type="button"
                              onClick={() => handleOpenTerminal(task.taskId)}
                              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-green-600 hover:bg-green-700 rounded transition-colors"
                            >
                              <Icon name="terminal" size="xs" />
                              Terminal
                            </button>
                            <button
                              type="button"
                              onClick={() => handleViewLog(task.taskId)}
                              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 rounded transition-colors"
                            >
                              <Icon name="visibility" size="xs" />
                              Full Log
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRestartTask(task.taskId)}
                              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-yellow-600 hover:bg-yellow-700 rounded transition-colors"
                            >
                              <Icon name="refresh" size="xs" />
                              Restart
                            </button>
                            <button
                              type="button"
                              onClick={() => handleKillTask(task.taskId)}
                              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 rounded transition-colors"
                            >
                              <Icon name="close" size="xs" />
                              Kill
                            </button>
                          </div>

                          {/* Recent Activity */}
                          {task.recentActivity && task.recentActivity.length > 0 && (
                            <div>
                              <div className="text-xs text-gray-500 mb-2">Recent Activity</div>
                              <div className="space-y-1 max-h-32 overflow-y-auto text-xs font-mono bg-gray-900 rounded p-2">
                                {task.recentActivity.slice(-5).map((activity, idx) => (
                                  <div
                                    key={`${task.taskId}-activity-${idx}`}
                                    className="text-gray-400"
                                  >
                                    {activity}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Live Log Stream */}
        <div className="flex-1 flex flex-col">
          {/* Log Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-700">
            <div className="flex items-center gap-2">
              <Icon name="terminal" size="lg" className="text-green-400" />
              <h2 className="text-lg font-semibold">Live Log Stream</h2>
              <span className="text-sm text-gray-500">({logEntries.length} entries)</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setAutoScroll(!autoScroll)}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                  autoScroll ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                {autoScroll ? <Icon name="play_arrow" size="xs" /> : <Icon name="pause" size="xs" />}
                Auto-scroll
              </button>
              <button
                onClick={() => setLogEntries([])}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-gray-700 hover:bg-gray-600 rounded transition-colors"
              >
                <Icon name="delete" size="xs" />
                Clear
              </button>
            </div>
          </div>

          {/* Log Content */}
          <div
            ref={logContainerRef}
            className="flex-1 overflow-y-auto p-4 font-mono text-sm bg-gray-950"
          >
            {logEntries.length === 0 ? (
              <div className="text-center py-12 text-gray-600">
                <Icon name="terminal" size="2xl" className="mx-auto mb-3 opacity-50 text-5xl" />
                <p>No log entries yet</p>
                <p className="text-xs mt-1">Logs will appear here as tasks run</p>
              </div>
            ) : (
              <div className="space-y-1">
                {logEntries.map((entry, idx) => (
                  <div
                    key={`${entry.timestamp}-${entry.taskId}-${idx}`}
                    className="flex items-start gap-2"
                  >
                    <span className="text-gray-600 flex-shrink-0">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                    <span className="text-cyan-400 flex-shrink-0">[{entry.taskId}]</span>
                    <span className={`flex-shrink-0 ${getLogLevelColor(entry.level)}`}>
                      [{entry.level}]
                    </span>
                    <span className="text-gray-300">{entry.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Status Bar */}
          <div className="flex items-center justify-between p-3 bg-gray-800 border-t border-gray-700 text-xs">
            <div className="flex items-center gap-4">
              <span className="text-gray-500">
                Last updated:{' '}
                {health?.timestamp ? new Date(health.timestamp).toLocaleTimeString() : 'Never'}
              </span>
              <span className="text-gray-500">Poll: {pollInterval / 1000}s</span>
            </div>
            <div className="flex items-center gap-4">
              {health?.watchdog_threshold && (
                <span className="text-gray-500">
                  Watchdog: {Math.floor(health.watchdog_threshold / 60)}m threshold
                </span>
              )}
              <span className={`${isConnected ? 'text-green-500' : 'text-red-500'}`}>
                {isConnected ? 'ONLINE' : 'OFFLINE'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
