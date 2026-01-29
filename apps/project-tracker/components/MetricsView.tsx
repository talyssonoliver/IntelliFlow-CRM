'use client';

import { useState, useEffect } from 'react';
import { Icon } from '@/lib/icons';

interface SprintSummary {
  sprint: string;
  name: string;
  target_date: string;
  started_at: string | null;
  completed_at: string | null;
  task_summary: {
    total: number;
    done: number;
    in_progress: number;
    blocked: number;
    not_started: number;
    failed: number;
  };
  kpi_summary: Record<
    string,
    {
      target: any;
      actual: any;
      status: string;
      unit?: string;
    }
  >;
  blockers: Array<{
    task_id: string;
    blocker: string;
    owner: string;
    raised_at: string;
    resolved_at: string | null;
  }>;
  completed_tasks: Array<{
    task_id: string;
    completed_at: string;
    duration_minutes: number;
  }>;
}

interface PhaseMetrics {
  phase: string;
  description: string;
  aggregated_metrics: {
    total_tasks: number;
    done: number;
    in_progress: number;
    blocked: number;
    not_started: number;
  };
  started_at: string | null;
  completed_at: string | null;
}

interface VelocityData {
  config: {
    sprintLengthDays: number;
    targetVelocity: number;
    minVelocityWarning: number;
    velocityGoal: string;
  };
  actual: {
    currentVelocity: number;
    trend: 'improving' | 'stable' | 'declining';
    healthStatus: 'healthy' | 'warning' | 'critical';
    totalPlanned: number;
    totalCompleted: number;
    bySprintBars: Array<{
      sprint: number;
      velocity: number;
      percentage: number;
      planned: number;
      completed: number;
    }>;
  };
  forecast: {
    nextSprintPrediction: number | null;
    confidence: string;
    method: string;
  };
}

interface CapacityData {
  roles: Array<{
    role: string;
    fte: number;
    focusFactor: number;
    actualTasks: number;
    completedTasks: number;
    utilization: number;
  }>;
  summary: {
    totalCapacityDays: number;
    totalTasks: number;
    totalCompleted: number;
    totalUtilization: number;
  };
}

interface RiskData {
  risks: Array<{
    id: string;
    risk: string;
    category: string;
    probability: string;
    impact: string;
    score: number;
    status: string;
    scoreLevel: 'critical' | 'high' | 'medium' | 'low';
  }>;
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    mitigated: number;
    overallScore: number;
    overallLevel: 'critical' | 'high' | 'medium' | 'low';
  };
}

interface MetricsViewProps {
  selectedSprint: number | 'all' | 'Continuous';
}

export default function MetricsView({ selectedSprint }: Readonly<MetricsViewProps>) {
  const [sprintSummary, setSprintSummary] = useState<SprintSummary | null>(null);
  const [phases, setPhases] = useState<PhaseMetrics[]>([]);
  const [velocityData, setVelocityData] = useState<VelocityData | null>(null);
  const [capacityData, setCapacityData] = useState<CapacityData | null>(null);
  const [riskData, setRiskData] = useState<RiskData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const syncMetrics = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch('/api/sync-metrics', {
        method: 'POST',
        cache: 'no-store',
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Metrics synced:', result);
        // Reload metrics after sync
        await loadMetrics();
      } else {
        console.error('Sync failed:', await response.text());
      }
    } catch (error) {
      console.error('Error syncing metrics:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  // Convert selectedSprint to query parameter
  const getSprintParam = () => {
    if (selectedSprint === 'all') return 'all';
    if (selectedSprint === 'Continuous') return 'continuous';
    return String(selectedSprint);
  };

  const loadMetrics = async () => {
    setIsLoading(true);
    const sprintParam = getSprintParam();
    try {
      const timestamp = Date.now();

      const [sprintRes, phasesRes, velocityRes, capacityRes, risksRes] = await Promise.all([
        fetch(`/api/metrics/sprint?sprint=${sprintParam}&t=${timestamp}`, { cache: 'no-store' }),
        fetch(`/api/metrics/phases?sprint=${sprintParam}&t=${timestamp}`, { cache: 'no-store' }),
        fetch(`/api/metrics/velocity?t=${timestamp}`, { cache: 'no-store' }),
        fetch(`/api/metrics/capacity?t=${timestamp}`, { cache: 'no-store' }),
        fetch(`/api/metrics/risks?t=${timestamp}`, { cache: 'no-store' }),
      ]);

      if (sprintRes.ok) {
        const sprintData = await sprintRes.json();
        setSprintSummary(sprintData);
      }

      if (phasesRes.ok) {
        const phasesData = await phasesRes.json();
        setPhases(phasesData);
      }

      if (velocityRes.ok) {
        const velData = await velocityRes.json();
        setVelocityData(velData);
      }

      if (capacityRes.ok) {
        const capData = await capacityRes.json();
        setCapacityData(capData);
      }

      if (risksRes.ok) {
        const riskDataRes = await risksRes.json();
        setRiskData(riskDataRes);
      }

      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error loading metrics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMetrics();

    // Watch for file changes using Server-Sent Events
    const eventSource = new EventSource('/api/metrics/watch');

    eventSource.onmessage = () => {
      console.log('Metrics files changed, reloading...');
      loadMetrics();
    };

    eventSource.onerror = (error) => {
      console.error('EventSource error:', error);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [selectedSprint]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'MET':
      case 'ON_TARGET':
        return 'text-green-600 bg-green-50';
      case 'BELOW_TARGET':
      case 'ABOVE_TARGET':
        return 'text-red-600 bg-red-50';
      case 'MEASURING':
        return 'text-blue-600 bg-blue-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const getPhaseStatus = (phase: PhaseMetrics) => {
    if (phase.completed_at) return 'DONE';
    if (phase.started_at) return 'IN_PROGRESS';
    return 'NOT_STARTED';
  };

  const getPhaseStatusColor = (status: string) => {
    switch (status) {
      case 'DONE':
        return 'bg-green-500';
      case 'IN_PROGRESS':
        return 'bg-blue-500';
      case 'NOT_STARTED':
        return 'bg-gray-300';
      default:
        return 'bg-gray-300';
    }
  };

  if (isLoading && !sprintSummary) {
    return (
      <div className="flex items-center justify-center h-64">
        <Icon name="refresh" size="2xl" className="animate-spin text-blue-500" />
      </div>
    );
  }

  if (!sprintSummary) {
    return <div className="text-center text-gray-500 p-8">No metrics data available</div>;
  }

  const progressPercentage =
    (sprintSummary.task_summary.done / sprintSummary.task_summary.total) * 100;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{sprintSummary.name}</h1>
          <p className="text-gray-600">
            Sprint {sprintSummary.sprint} • Target:{' '}
            {new Date(sprintSummary.target_date).toLocaleDateString()}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={syncMetrics}
            disabled={isSyncing || isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
            title="Sync all metrics from CSV"
          >
            <Icon name="refresh" size="sm" className={isSyncing ? 'animate-spin' : ''} />
            Sync
          </button>
          <button
            onClick={loadMetrics}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
          >
            <Icon name="refresh" size="sm" className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {lastUpdated && (
        <p className="text-sm text-gray-500">Last updated: {lastUpdated.toLocaleTimeString()}</p>
      )}

      {/* Overall Progress */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Overall Progress</h2>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span>Completion</span>
              <span className="font-semibold">
                {sprintSummary.task_summary.done} / {sprintSummary.task_summary.total} tasks (
                {progressPercentage.toFixed(1)}%)
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-blue-500 h-3 rounded-full transition-all"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6">
            <div className="flex items-center gap-3">
              <Icon name="check_circle" size="2xl" className="text-green-500" />
              <div>
                <p className="text-2xl font-bold">{sprintSummary.task_summary.done}</p>
                <p className="text-sm text-gray-600">Done</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Icon name="schedule" size="2xl" className="text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{sprintSummary.task_summary.in_progress}</p>
                <p className="text-sm text-gray-600">In Progress</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Icon name="error" size="2xl" className="text-red-500" />
              <div>
                <p className="text-2xl font-bold">{sprintSummary.task_summary.blocked}</p>
                <p className="text-sm text-gray-600">Blocked</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Icon name="cancel" size="2xl" className="text-gray-400" />
              <div>
                <p className="text-2xl font-bold">{sprintSummary.task_summary.not_started}</p>
                <p className="text-sm text-gray-600">Not Started</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Icon name="cancel" size="2xl" className="text-red-600" />
              <div>
                <p className="text-2xl font-bold">{sprintSummary.task_summary.failed}</p>
                <p className="text-sm text-gray-600">Failed</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Phases */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Phase Progress</h2>
        <div className="space-y-4">
          {phases.map((phase, index) => {
            const status = getPhaseStatus(phase);
            const metrics = phase.aggregated_metrics ?? {
              total_tasks: 0,
              done: 0,
              in_progress: 0,
              blocked: 0,
              not_started: 0,
            };
            const phaseProgress =
              metrics.total_tasks > 0 ? (metrics.done / metrics.total_tasks) * 100 : 0;

            return (
              <div key={phase.phase ?? `phase-${index}`} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${getPhaseStatusColor(status)}`} />
                    <h3 className="font-semibold">{phase.phase}</h3>
                  </div>
                  <span className="text-sm text-gray-600">
                    {metrics.done} / {metrics.total_tasks}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mb-3">{phase.description}</p>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${getPhaseStatusColor(status)}`}
                    style={{ width: `${phaseProgress}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Velocity Trend */}
      {velocityData && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Velocity Trend</h2>
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
              velocityData.actual.healthStatus === 'healthy' ? 'bg-green-100 text-green-700' :
              velocityData.actual.healthStatus === 'warning' ? 'bg-yellow-100 text-yellow-700' :
              'bg-red-100 text-red-700'
            }`}>
              {velocityData.actual.healthStatus === 'healthy' ? 'On Track' :
               velocityData.actual.healthStatus === 'warning' ? 'Below Target' : 'Critical'}
            </span>
          </div>
          <p className="text-sm text-gray-600 mb-4">{velocityData.config.velocityGoal}</p>

          {/* Bar Chart */}
          <div className="mb-6">
            <div className="flex gap-1 items-end h-32 border-b border-gray-200 pb-2">
              {velocityData.actual.bySprintBars.slice(-12).map((bar) => (
                <div
                  key={bar.sprint}
                  className="flex-1 flex flex-col items-center gap-1"
                  title={`Sprint ${bar.sprint}: ${bar.velocity}% (${bar.completed}/${bar.planned})`}
                >
                  <div
                    className={`w-full rounded-t transition-all ${
                      bar.velocity >= (velocityData.config.targetVelocity || 80)
                        ? 'bg-green-500'
                        : bar.velocity >= 50
                          ? 'bg-blue-500'
                          : 'bg-orange-400'
                    }`}
                    style={{ height: `${Math.max(4, bar.percentage)}%` }}
                  />
                  <span className="text-xs text-gray-500">{bar.sprint}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 text-center mt-1">Sprint Number</p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-blue-600">{velocityData.actual.currentVelocity}%</p>
              <p className="text-sm text-gray-600">Current Velocity</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className={`text-2xl font-bold ${
                velocityData.actual.trend === 'improving' ? 'text-green-600' :
                velocityData.actual.trend === 'declining' ? 'text-red-600' : 'text-gray-600'
              }`}>
                {velocityData.actual.trend === 'improving' ? 'Improving' :
                 velocityData.actual.trend === 'declining' ? 'Declining' : 'Stable'}
              </p>
              <p className="text-sm text-gray-600">Trend</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-gray-700">{velocityData.config.targetVelocity}%</p>
              <p className="text-sm text-gray-600">Target</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-purple-600">
                {velocityData.forecast.nextSprintPrediction ?? 'N/A'}%
              </p>
              <p className="text-sm text-gray-600">Forecast</p>
            </div>
          </div>
        </div>
      )}

      {/* Team Capacity */}
      {capacityData && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Team Capacity</h2>

          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-blue-600">{capacityData.summary.totalTasks}</p>
              <p className="text-sm text-gray-600">Total Tasks</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-green-600">{capacityData.summary.totalCompleted}</p>
              <p className="text-sm text-gray-600">Completed</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-purple-600">{capacityData.summary.totalCapacityDays}</p>
              <p className="text-sm text-gray-600">Capacity (days)</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className={`text-2xl font-bold ${
                capacityData.summary.totalUtilization > 90 ? 'text-red-600' :
                capacityData.summary.totalUtilization > 70 ? 'text-orange-500' : 'text-green-600'
              }`}>{capacityData.summary.totalUtilization}%</p>
              <p className="text-sm text-gray-600">Utilization</p>
            </div>
          </div>

          {/* Role Breakdown */}
          <div className="space-y-4">
            {capacityData.roles.map((role) => (
              <div key={role.role}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">{role.role}</span>
                  <span className="text-gray-600">
                    {role.completedTasks}/{role.actualTasks} tasks ({role.utilization}%)
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all ${
                      role.utilization > 90 ? 'bg-red-500' :
                      role.utilization > 70 ? 'bg-orange-400' : 'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(100, role.utilization)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Risk Summary */}
      {riskData && riskData.risks.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Risk Summary</h2>

          {/* Risk Badges */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-6">
            <div className="text-center p-2 bg-gray-100 rounded-lg">
              <p className="text-xl font-bold text-gray-700">{riskData.summary.total}</p>
              <p className="text-xs text-gray-600">Total</p>
            </div>
            <div className={`text-center p-2 rounded-lg ${riskData.summary.critical > 0 ? 'bg-red-100' : 'bg-gray-50'}`}>
              <p className={`text-xl font-bold ${riskData.summary.critical > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                {riskData.summary.critical}
              </p>
              <p className="text-xs text-gray-600">Critical</p>
            </div>
            <div className={`text-center p-2 rounded-lg ${riskData.summary.high > 0 ? 'bg-orange-100' : 'bg-gray-50'}`}>
              <p className={`text-xl font-bold ${riskData.summary.high > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                {riskData.summary.high}
              </p>
              <p className="text-xs text-gray-600">High</p>
            </div>
            <div className={`text-center p-2 rounded-lg ${riskData.summary.medium > 0 ? 'bg-yellow-100' : 'bg-gray-50'}`}>
              <p className={`text-xl font-bold ${riskData.summary.medium > 0 ? 'text-yellow-600' : 'text-gray-400'}`}>
                {riskData.summary.medium}
              </p>
              <p className="text-xs text-gray-600">Medium</p>
            </div>
            <div className={`text-center p-2 rounded-lg ${riskData.summary.low > 0 ? 'bg-green-100' : 'bg-gray-50'}`}>
              <p className={`text-xl font-bold ${riskData.summary.low > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                {riskData.summary.low}
              </p>
              <p className="text-xs text-gray-600">Low</p>
            </div>
            <div className="text-center p-2 bg-blue-100 rounded-lg">
              <p className="text-xl font-bold text-blue-600">{riskData.summary.mitigated}</p>
              <p className="text-xs text-gray-600">Mitigated</p>
            </div>
          </div>

          {/* Overall Risk Level */}
          <div className={`p-3 rounded-lg mb-4 ${
            riskData.summary.overallLevel === 'critical' ? 'bg-red-50 border border-red-200' :
            riskData.summary.overallLevel === 'high' ? 'bg-orange-50 border border-orange-200' :
            riskData.summary.overallLevel === 'medium' ? 'bg-yellow-50 border border-yellow-200' :
            'bg-green-50 border border-green-200'
          }`}>
            <div className="flex items-center justify-between">
              <span className="font-medium">Overall Risk Level</span>
              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                riskData.summary.overallLevel === 'critical' ? 'bg-red-500 text-white' :
                riskData.summary.overallLevel === 'high' ? 'bg-orange-500 text-white' :
                riskData.summary.overallLevel === 'medium' ? 'bg-yellow-500 text-white' :
                'bg-green-500 text-white'
              }`}>
                {riskData.summary.overallLevel.toUpperCase()}
              </span>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              Average score: {riskData.summary.overallScore}/12
            </p>
          </div>

          {/* Top Risks */}
          <div className="space-y-2">
            <h3 className="font-medium text-sm text-gray-700 mb-2">Top Risks</h3>
            {riskData.risks.slice(0, 5).map((risk) => (
              <div
                key={risk.id}
                className="flex items-center gap-3 p-2 rounded border border-gray-100 hover:bg-gray-50"
              >
                <span className={`px-2 py-1 rounded text-xs font-mono font-semibold ${
                  risk.scoreLevel === 'critical' ? 'bg-red-100 text-red-700' :
                  risk.scoreLevel === 'high' ? 'bg-orange-100 text-orange-700' :
                  risk.scoreLevel === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-green-100 text-green-700'
                }`}>
                  {risk.id}
                </span>
                <span className="flex-1 text-sm truncate">{risk.risk}</span>
                <span className={`px-2 py-1 rounded text-xs ${
                  risk.status.toLowerCase() === 'mitigated' ? 'bg-blue-100 text-blue-700' :
                  risk.status.toLowerCase() === 'monitoring' ? 'bg-purple-100 text-purple-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {risk.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Key Performance Indicators</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(sprintSummary.kpi_summary).map(([key, kpi]) => (
            <div key={key} className={`p-4 rounded-lg ${getStatusColor(kpi.status ?? 'UNKNOWN')}`}>
              <h3 className="font-semibold text-sm mb-2 capitalize">{key.replaceAll('_', ' ')}</h3>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold">
                  {typeof kpi.actual === 'number' ? kpi.actual.toFixed(1) : (kpi.actual ?? 'N/A')}
                </span>
                {kpi.unit && <span className="text-sm">{kpi.unit}</span>}
              </div>
              <p className="text-xs mt-1">
                Target:{' '}
                {typeof kpi.target === 'number' ? kpi.target.toFixed(1) : (kpi.target ?? 'N/A')}{' '}
                {kpi.unit}
              </p>
              <p className="text-xs font-semibold mt-1">
                {(kpi.status ?? 'UNKNOWN').replaceAll('_', ' ')}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Completed Tasks */}
      {sprintSummary.completed_tasks.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Recently Completed Tasks</h2>
          <div className="space-y-3">
            {sprintSummary.completed_tasks.map((task) => (
              <div
                key={task.task_id}
                className="flex items-center justify-between border-l-4 border-green-500 pl-4 py-2"
              >
                <div>
                  <p className="font-semibold">{task.task_id}</p>
                  <p className="text-sm text-gray-600">
                    Completed: {new Date(task.completed_at).toLocaleString()}
                  </p>
                </div>
                <span className="text-sm text-gray-600">{task.duration_minutes} min</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Blockers */}
      {sprintSummary.blockers.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Blockers History</h2>
          <div className="space-y-3">
            {sprintSummary.blockers.map((blocker) => (
              <div
                key={`${blocker.task_id}-${blocker.raised_at}`}
                className={`border-l-4 pl-4 py-2 ${
                  blocker.resolved_at ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-semibold">{blocker.task_id}</p>
                    <p className="text-sm text-gray-700 mt-1">{blocker.blocker}</p>
                    <p className="text-xs text-gray-600 mt-2">
                      Owner: {blocker.owner} • Raised:{' '}
                      {new Date(blocker.raised_at).toLocaleString()}
                    </p>
                    {blocker.resolved_at && (
                      <p className="text-xs text-green-700 mt-1 font-semibold">
                        ✓ Resolved: {new Date(blocker.resolved_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
