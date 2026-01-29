'use client';

import React, { useEffect, useState } from 'react';
import { Icon } from '@/lib/icons';

// Detail types - using snake_case to match API response
interface MismatchDetail {
  task_id: string;
  description: string;
  missing_artifacts: string[];
}

interface UntrackedArtifactDetail {
  path: string;
  type: 'package' | 'app' | 'infra';
}

interface ForwardDependencyDetail {
  task_id: string;
  task_description: string;
  task_sprint: number;
  depends_on: string;
  dep_sprint: number;
}

interface BottleneckDetail {
  sprint: number;
  dependency_count: number;
  blocked_tasks: string[];
}

interface ExecutiveMetrics {
  total_tasks: number;
  completed: { count: number; percentage: number };
  in_progress: { count: number; percentage: number };
  backlog: { count: number; percentage: number };
  plan_vs_code_mismatches: number;
  plan_vs_code_mismatches_details: MismatchDetail[];
  untracked_code_artifacts: number;
  untracked_code_artifacts_details: UntrackedArtifactDetail[];
  forward_dependencies: number;
  forward_dependencies_details: ForwardDependencyDetail[];
  sprint_bottlenecks: string;
  sprint_bottlenecks_details: BottleneckDetail[];
  generated_at: string;
}

type ExpandableMetric = 'mismatches' | 'untracked' | 'forward' | 'bottleneck';

interface ExecutiveSummaryProps {
  readonly sprint?: number | 'all' | 'Continuous';
}

export default function ExecutiveSummary({ sprint = 'all' }: ExecutiveSummaryProps) {
  const [metrics, setMetrics] = useState<ExecutiveMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<ExpandableMetric>>(new Set());

  const toggleExpanded = (key: ExpandableMetric) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const getSprintParam = (): string => {
    if (sprint === 'all') return 'all';
    if (sprint === 'Continuous') return 'continuous';
    return String(sprint);
  };

  const fetchMetrics = async () => {
    setLoading(true);
    setError(null);
    try {
      const sprintParam = getSprintParam();
      const response = await fetch(`/api/metrics/executive?sprint=${sprintParam}&t=${Date.now()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch executive metrics');
      }
      const data = await response.json();
      setMetrics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 60000);
    return () => clearInterval(interval);
  }, [sprint]);

  if (loading && !metrics) {
    return (
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg shadow-xl p-6 border border-slate-700">
        <div className="flex items-center justify-center py-8">
          <Icon name="refresh" size="xl" className="text-blue-400 animate-spin mr-2" />
          <span className="text-slate-300">Loading executive metrics...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg shadow-xl p-6 border border-red-500/30">
        <div className="flex items-center text-red-400">
          <Icon name="warning" size="lg" className="mr-2" />
          <span>Error: {error}</span>
        </div>
      </div>
    );
  }

  if (!metrics) return null;

  const staticRows = [
    {
      metric: 'Total Tasks',
      value: metrics.total_tasks.toString(),
      icon: <Icon name="bar_chart" size="sm" />,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
    },
    {
      metric: 'Completed',
      value: `${metrics.completed.count} (${metrics.completed.percentage}%)`,
      icon: <Icon name="check_circle" size="sm" />,
      color: 'text-green-400',
      bgColor: 'bg-green-500/10',
    },
    {
      metric: 'In Progress',
      value: `${metrics.in_progress.count} (${metrics.in_progress.percentage}%)`,
      icon: <Icon name="schedule" size="sm" />,
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-500/10',
    },
    {
      metric: 'Backlog',
      value: `${metrics.backlog.count} (${metrics.backlog.percentage}%)`,
      icon: <Icon name="my_location" size="sm" />,
      color: 'text-slate-400',
      bgColor: 'bg-slate-500/10',
    },
  ];

  const getTypeIcon = (type: 'package' | 'app' | 'infra') => {
    switch (type) {
      case 'package':
        return <Icon name="inventory_2" size="xs" />;
      case 'app':
        return <Icon name="dns" size="xs" />;
      case 'infra':
        return <Icon name="folder" size="xs" />;
    }
  };

  const getTypeColor = (type: 'package' | 'app' | 'infra') => {
    switch (type) {
      case 'package':
        return 'text-purple-400 bg-purple-500/10';
      case 'app':
        return 'text-blue-400 bg-blue-500/10';
      case 'infra':
        return 'text-green-400 bg-green-500/10';
    }
  };

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg shadow-xl border border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 bg-slate-800/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
            <Icon name="bar_chart" size="lg" className="text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Executive Summary</h2>
            <p className="text-xs text-slate-400">
              Last updated: {new Date(metrics.generated_at).toLocaleTimeString()}
            </p>
          </div>
        </div>
        <button
          onClick={fetchMetrics}
          disabled={loading}
          className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-600/50 transition-colors disabled:opacity-50"
          title="Refresh metrics"
        >
          <Icon name="refresh" size="sm" className={`text-slate-300 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Table */}
      <div className="p-4">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left py-2 px-3 text-xs font-medium text-slate-400 uppercase tracking-wider">
                Metric
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-slate-400 uppercase tracking-wider">
                Value
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {/* Static rows */}
            {staticRows.map((row) => (
              <tr key={row.metric} className="hover:bg-slate-800/30 transition-colors">
                <td className="py-3 px-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-lg ${row.bgColor} flex items-center justify-center ${row.color}`}
                    >
                      {row.icon}
                    </div>
                    <span className="text-sm font-medium text-slate-200">{row.metric}</span>
                  </div>
                </td>
                <td className="py-3 px-3 text-right">
                  <span className={`text-sm font-semibold ${row.color}`}>{row.value}</span>
                </td>
              </tr>
            ))}

            {/* Plan-vs-Code Mismatches - Expandable */}
            <React.Fragment key="mismatches-section">
              <tr
                className="hover:bg-slate-800/30 transition-colors cursor-pointer"
                onClick={() => toggleExpanded('mismatches')}
              >
                <td className="py-3 px-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-lg ${metrics.plan_vs_code_mismatches > 0 ? 'bg-orange-500/10' : 'bg-green-500/10'} flex items-center justify-center ${metrics.plan_vs_code_mismatches > 0 ? 'text-orange-400' : 'text-green-400'}`}
                    >
                      <Icon name="description" size="sm" />
                    </div>
                    <span className="text-sm font-medium text-slate-200">
                      Plan-vs-Code Mismatches
                    </span>
                    {metrics.plan_vs_code_mismatches_details.length > 0 &&
                      (expanded.has('mismatches') ? (
                        <Icon name="expand_more" size="sm" className="text-slate-400" />
                      ) : (
                        <Icon name="chevron_right" size="sm" className="text-slate-400" />
                      ))}
                  </div>
                </td>
                <td className="py-3 px-3 text-right">
                  <span
                    className={`text-sm font-semibold ${metrics.plan_vs_code_mismatches > 0 ? 'text-orange-400' : 'text-green-400'}`}
                  >
                    {metrics.plan_vs_code_mismatches}
                  </span>
                </td>
              </tr>
              {expanded.has('mismatches') && metrics.plan_vs_code_mismatches_details.length > 0 && (
                <tr>
                  <td colSpan={2} className="px-3 pb-3">
                    <div className="ml-11 bg-slate-800/50 rounded-lg p-3 space-y-2">
                      {metrics.plan_vs_code_mismatches_details.map((detail, idx) => (
                        <div key={`mismatch-${detail.task_id}-${idx}`} className="text-xs">
                          <div className="flex items-center gap-2 text-slate-300">
                            <span className="font-mono text-orange-400">{detail.task_id}</span>
                            <span className="text-slate-500">-</span>
                            <span className="truncate">{detail.description}</span>
                          </div>
                          <div className="ml-4 mt-1 text-slate-500">
                            Missing: {detail.missing_artifacts.slice(0, 3).join(', ')}
                            {detail.missing_artifacts.length > 3 &&
                              ` +${detail.missing_artifacts.length - 3} more`}
                          </div>
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>

            {/* Untracked Code Artifacts - Expandable */}
            <React.Fragment key="untracked-section">
              <tr
                className="hover:bg-slate-800/30 transition-colors cursor-pointer"
                onClick={() => toggleExpanded('untracked')}
              >
                <td className="py-3 px-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-lg ${metrics.untracked_code_artifacts > 0 ? 'bg-orange-500/10' : 'bg-green-500/10'} flex items-center justify-center ${metrics.untracked_code_artifacts > 0 ? 'text-orange-400' : 'text-green-400'}`}
                    >
                      <Icon name="warning" size="sm" />
                    </div>
                    <span className="text-sm font-medium text-slate-200">
                      Untracked Code Artifacts
                    </span>
                    {metrics.untracked_code_artifacts_details.length > 0 &&
                      (expanded.has('untracked') ? (
                        <Icon name="expand_more" size="sm" className="text-slate-400" />
                      ) : (
                        <Icon name="chevron_right" size="sm" className="text-slate-400" />
                      ))}
                  </div>
                </td>
                <td className="py-3 px-3 text-right">
                  <span
                    className={`text-sm font-semibold ${metrics.untracked_code_artifacts > 0 ? 'text-orange-400' : 'text-green-400'}`}
                  >
                    {metrics.untracked_code_artifacts}
                  </span>
                </td>
              </tr>
              {expanded.has('untracked') && metrics.untracked_code_artifacts_details.length > 0 && (
                <tr>
                  <td colSpan={2} className="px-3 pb-3">
                    <div className="ml-11 bg-slate-800/50 rounded-lg p-3">
                      <div className="flex flex-wrap gap-2">
                        {metrics.untracked_code_artifacts_details.map((detail, idx) => (
                          <div
                            key={`untracked-${detail.path}-${idx}`}
                            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs ${getTypeColor(detail.type)}`}
                          >
                            {getTypeIcon(detail.type)}
                            <span className="font-mono">{detail.path}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>

            {/* Forward Dependencies - Expandable */}
            <React.Fragment key="forward-section">
              <tr
                className="hover:bg-slate-800/30 transition-colors cursor-pointer"
                onClick={() => toggleExpanded('forward')}
              >
                <td className="py-3 px-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-lg ${metrics.forward_dependencies > 0 ? 'bg-red-500/10' : 'bg-green-500/10'} flex items-center justify-center ${metrics.forward_dependencies > 0 ? 'text-red-400' : 'text-green-400'}`}
                    >
                      <Icon name="account_tree" size="sm" />
                    </div>
                    <span className="text-sm font-medium text-slate-200">Forward Dependencies</span>
                    {metrics.forward_dependencies_details.length > 0 &&
                      (expanded.has('forward') ? (
                        <Icon name="expand_more" size="sm" className="text-slate-400" />
                      ) : (
                        <Icon name="chevron_right" size="sm" className="text-slate-400" />
                      ))}
                  </div>
                </td>
                <td className="py-3 px-3 text-right">
                  <span
                    className={`text-sm font-semibold ${metrics.forward_dependencies > 0 ? 'text-red-400' : 'text-green-400'}`}
                  >
                    {metrics.forward_dependencies}
                  </span>
                </td>
              </tr>
              {expanded.has('forward') && metrics.forward_dependencies_details.length > 0 && (
                <tr>
                  <td colSpan={2} className="px-3 pb-3">
                    <div className="ml-11 bg-slate-800/50 rounded-lg p-3 space-y-2">
                      <div className="text-xs text-slate-400 mb-2">
                        Tasks depending on tasks scheduled for later sprints:
                      </div>
                      {metrics.forward_dependencies_details.slice(0, 10).map((detail, idx) => (
                        <div
                          key={`forward-${detail.task_id}-${detail.depends_on}-${idx}`}
                          className="text-xs flex items-center gap-2"
                        >
                          <span className="font-mono text-blue-400">{detail.task_id}</span>
                          <span className="text-slate-500">(Sprint {detail.task_sprint})</span>
                          <span className="text-slate-600">depends on</span>
                          <span className="font-mono text-red-400">{detail.depends_on}</span>
                          <span className="text-slate-500">(Sprint {detail.dep_sprint})</span>
                        </div>
                      ))}
                      {metrics.forward_dependencies_details.length > 10 && (
                        <div className="text-xs text-slate-500 pt-1">
                          +{metrics.forward_dependencies_details.length - 10} more forward
                          dependencies
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>

            {/* Sprint Bottleneck - Expandable */}
            <React.Fragment key="bottleneck-section">
              <tr
                className="hover:bg-slate-800/30 transition-colors cursor-pointer"
                onClick={() => toggleExpanded('bottleneck')}
              >
                <td className="py-3 px-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
                      <Icon name="my_location" size="sm" />
                    </div>
                    <span className="text-sm font-medium text-slate-200">Sprint Bottleneck</span>
                    {metrics.sprint_bottlenecks_details.length > 0 &&
                      (expanded.has('bottleneck') ? (
                        <Icon name="expand_more" size="sm" className="text-slate-400" />
                      ) : (
                        <Icon name="chevron_right" size="sm" className="text-slate-400" />
                      ))}
                  </div>
                </td>
                <td className="py-3 px-3 text-right">
                  <span className="text-sm font-semibold text-purple-400">
                    {metrics.sprint_bottlenecks}
                  </span>
                </td>
              </tr>
              {expanded.has('bottleneck') && metrics.sprint_bottlenecks_details.length > 0 && (
                <tr>
                  <td colSpan={2} className="px-3 pb-3">
                    <div className="ml-11 bg-slate-800/50 rounded-lg p-3 space-y-3">
                      <div className="text-xs text-slate-400 mb-2">
                        Sprints with highest dependency concentration:
                      </div>
                      {metrics.sprint_bottlenecks_details.map((detail) => (
                        <div key={`bottleneck-sprint-${detail.sprint}`} className="text-xs">
                          <div className="flex items-center gap-3 mb-1">
                            <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded font-semibold">
                              Sprint {detail.sprint}
                            </span>
                            <span className="text-slate-400">
                              {detail.dependency_count} dependencies
                            </span>
                          </div>
                          <div className="ml-2 flex flex-wrap gap-1">
                            {detail.blocked_tasks.slice(0, 8).map((taskId, taskIdx) => (
                              <span
                                key={`bottleneck-${detail.sprint}-task-${taskId}-${taskIdx}`}
                                className="px-1.5 py-0.5 bg-slate-700/50 text-slate-400 rounded font-mono text-[10px]"
                              >
                                {taskId}
                              </span>
                            ))}
                            {detail.blocked_tasks.length > 8 && (
                              <span className="px-1.5 py-0.5 text-slate-500 text-[10px]">
                                +{detail.blocked_tasks.length - 8} more
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          </tbody>
        </table>
      </div>

      {/* Footer with quick insights */}
      <div className="px-6 py-3 bg-slate-800/30 border-t border-slate-700">
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div
              className={`w-2 h-2 rounded-full ${metrics.completed.percentage > 50 ? 'bg-green-400' : metrics.completed.percentage > 25 ? 'bg-yellow-400' : 'bg-red-400'}`}
            />
            <span className="text-slate-400">
              Health:{' '}
              {metrics.completed.percentage > 50
                ? 'Good'
                : metrics.completed.percentage > 25
                  ? 'Moderate'
                  : 'Needs Attention'}
            </span>
          </div>
          {metrics.forward_dependencies > 0 && (
            <div className="flex items-center gap-1.5 text-red-400">
              <Icon name="warning" size="xs" />
              <span>{metrics.forward_dependencies} forward deps need review</span>
            </div>
          )}
          {metrics.plan_vs_code_mismatches > 0 && (
            <div className="flex items-center gap-1.5 text-orange-400">
              <Icon name="description" size="xs" />
              <span>{metrics.plan_vs_code_mismatches} artifact mismatches</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
