'use client';

import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileWarning,
  GitBranch,
  Target,
  ChevronDown,
  ChevronRight,
  Package,
  Folder,
  Server,
} from 'lucide-react';

// Detail types
interface MismatchDetail {
  taskId: string;
  description: string;
  missingArtifacts: string[];
}

interface UntrackedArtifactDetail {
  path: string;
  type: 'package' | 'app' | 'infra';
}

interface ForwardDependencyDetail {
  taskId: string;
  taskDescription: string;
  taskSprint: number;
  dependsOn: string;
  depSprint: number;
}

interface BottleneckDetail {
  sprint: number;
  dependencyCount: number;
  blockedTasks: string[];
}

interface ExecutiveMetrics {
  totalTasks: number;
  completed: { count: number; percentage: number };
  inProgress: { count: number; percentage: number };
  backlog: { count: number; percentage: number };
  planVsCodeMismatches: number;
  planVsCodeMismatchesDetails: MismatchDetail[];
  untrackedCodeArtifacts: number;
  untrackedCodeArtifactsDetails: UntrackedArtifactDetail[];
  forwardDependencies: number;
  forwardDependenciesDetails: ForwardDependencyDetail[];
  sprintBottlenecks: string;
  sprintBottlenecksDetails: BottleneckDetail[];
  generatedAt: string;
}

type ExpandableMetric = 'mismatches' | 'untracked' | 'forward' | 'bottleneck';

export default function ExecutiveSummary() {
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

  const fetchMetrics = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/metrics/executive?t=${Date.now()}`);
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
  }, []);

  if (loading && !metrics) {
    return (
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg shadow-xl p-6 border border-slate-700">
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="w-6 h-6 text-blue-400 animate-spin mr-2" />
          <span className="text-slate-300">Loading executive metrics...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg shadow-xl p-6 border border-red-500/30">
        <div className="flex items-center text-red-400">
          <AlertTriangle className="w-5 h-5 mr-2" />
          <span>Error: {error}</span>
        </div>
      </div>
    );
  }

  if (!metrics) return null;

  const staticRows = [
    {
      metric: 'Total Tasks',
      value: metrics.totalTasks.toString(),
      icon: <BarChart3 className="w-4 h-4" />,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
    },
    {
      metric: 'Completed',
      value: `${metrics.completed.count} (${metrics.completed.percentage}%)`,
      icon: <CheckCircle2 className="w-4 h-4" />,
      color: 'text-green-400',
      bgColor: 'bg-green-500/10',
    },
    {
      metric: 'In Progress',
      value: `${metrics.inProgress.count} (${metrics.inProgress.percentage}%)`,
      icon: <Clock className="w-4 h-4" />,
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-500/10',
    },
    {
      metric: 'Backlog',
      value: `${metrics.backlog.count} (${metrics.backlog.percentage}%)`,
      icon: <Target className="w-4 h-4" />,
      color: 'text-slate-400',
      bgColor: 'bg-slate-500/10',
    },
  ];

  const getTypeIcon = (type: 'package' | 'app' | 'infra') => {
    switch (type) {
      case 'package':
        return <Package className="w-3 h-3" />;
      case 'app':
        return <Server className="w-3 h-3" />;
      case 'infra':
        return <Folder className="w-3 h-3" />;
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
            <BarChart3 className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Executive Summary</h2>
            <p className="text-xs text-slate-400">
              Last updated: {new Date(metrics.generatedAt).toLocaleTimeString()}
            </p>
          </div>
        </div>
        <button
          onClick={fetchMetrics}
          disabled={loading}
          className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-600/50 transition-colors disabled:opacity-50"
          title="Refresh metrics"
        >
          <RefreshCw className={`w-4 h-4 text-slate-300 ${loading ? 'animate-spin' : ''}`} />
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
                      className={`w-8 h-8 rounded-lg ${metrics.planVsCodeMismatches > 0 ? 'bg-orange-500/10' : 'bg-green-500/10'} flex items-center justify-center ${metrics.planVsCodeMismatches > 0 ? 'text-orange-400' : 'text-green-400'}`}
                    >
                      <FileWarning className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-medium text-slate-200">Plan-vs-Code Mismatches</span>
                    {metrics.planVsCodeMismatchesDetails.length > 0 && (
                      expanded.has('mismatches') ? (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      )
                    )}
                  </div>
                </td>
                <td className="py-3 px-3 text-right">
                  <span
                    className={`text-sm font-semibold ${metrics.planVsCodeMismatches > 0 ? 'text-orange-400' : 'text-green-400'}`}
                  >
                    {metrics.planVsCodeMismatches}
                  </span>
                </td>
              </tr>
              {expanded.has('mismatches') && metrics.planVsCodeMismatchesDetails.length > 0 && (
                <tr>
                  <td colSpan={2} className="px-3 pb-3">
                    <div className="ml-11 bg-slate-800/50 rounded-lg p-3 space-y-2">
                      {metrics.planVsCodeMismatchesDetails.map((detail, idx) => (
                        <div key={`mismatch-${detail.taskId}-${idx}`} className="text-xs">
                          <div className="flex items-center gap-2 text-slate-300">
                            <span className="font-mono text-orange-400">{detail.taskId}</span>
                            <span className="text-slate-500">-</span>
                            <span className="truncate">{detail.description}</span>
                          </div>
                          <div className="ml-4 mt-1 text-slate-500">
                            Missing: {detail.missingArtifacts.slice(0, 3).join(', ')}
                            {detail.missingArtifacts.length > 3 && ` +${detail.missingArtifacts.length - 3} more`}
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
                      className={`w-8 h-8 rounded-lg ${metrics.untrackedCodeArtifacts > 0 ? 'bg-orange-500/10' : 'bg-green-500/10'} flex items-center justify-center ${metrics.untrackedCodeArtifacts > 0 ? 'text-orange-400' : 'text-green-400'}`}
                    >
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-medium text-slate-200">Untracked Code Artifacts</span>
                    {metrics.untrackedCodeArtifactsDetails.length > 0 && (
                      expanded.has('untracked') ? (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      )
                    )}
                  </div>
                </td>
                <td className="py-3 px-3 text-right">
                  <span
                    className={`text-sm font-semibold ${metrics.untrackedCodeArtifacts > 0 ? 'text-orange-400' : 'text-green-400'}`}
                  >
                    {metrics.untrackedCodeArtifacts}
                  </span>
                </td>
              </tr>
              {expanded.has('untracked') && metrics.untrackedCodeArtifactsDetails.length > 0 && (
                <tr>
                  <td colSpan={2} className="px-3 pb-3">
                    <div className="ml-11 bg-slate-800/50 rounded-lg p-3">
                      <div className="flex flex-wrap gap-2">
                        {metrics.untrackedCodeArtifactsDetails.map((detail, idx) => (
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
                      className={`w-8 h-8 rounded-lg ${metrics.forwardDependencies > 0 ? 'bg-red-500/10' : 'bg-green-500/10'} flex items-center justify-center ${metrics.forwardDependencies > 0 ? 'text-red-400' : 'text-green-400'}`}
                    >
                      <GitBranch className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-medium text-slate-200">Forward Dependencies</span>
                    {metrics.forwardDependenciesDetails.length > 0 && (
                      expanded.has('forward') ? (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      )
                    )}
                  </div>
                </td>
                <td className="py-3 px-3 text-right">
                  <span
                    className={`text-sm font-semibold ${metrics.forwardDependencies > 0 ? 'text-red-400' : 'text-green-400'}`}
                  >
                    {metrics.forwardDependencies}
                  </span>
                </td>
              </tr>
              {expanded.has('forward') && metrics.forwardDependenciesDetails.length > 0 && (
                <tr>
                  <td colSpan={2} className="px-3 pb-3">
                    <div className="ml-11 bg-slate-800/50 rounded-lg p-3 space-y-2">
                      <div className="text-xs text-slate-400 mb-2">
                        Tasks depending on tasks scheduled for later sprints:
                      </div>
                      {metrics.forwardDependenciesDetails.slice(0, 10).map((detail, idx) => (
                        <div key={`forward-${detail.taskId}-${detail.dependsOn}-${idx}`} className="text-xs flex items-center gap-2">
                          <span className="font-mono text-blue-400">{detail.taskId}</span>
                          <span className="text-slate-500">(Sprint {detail.taskSprint})</span>
                          <span className="text-slate-600">depends on</span>
                          <span className="font-mono text-red-400">{detail.dependsOn}</span>
                          <span className="text-slate-500">(Sprint {detail.depSprint})</span>
                        </div>
                      ))}
                      {metrics.forwardDependenciesDetails.length > 10 && (
                        <div className="text-xs text-slate-500 pt-1">
                          +{metrics.forwardDependenciesDetails.length - 10} more forward dependencies
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
                      <Target className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-medium text-slate-200">Sprint Bottleneck</span>
                    {metrics.sprintBottlenecksDetails.length > 0 && (
                      expanded.has('bottleneck') ? (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      )
                    )}
                  </div>
                </td>
                <td className="py-3 px-3 text-right">
                  <span className="text-sm font-semibold text-purple-400">
                    {metrics.sprintBottlenecks}
                  </span>
                </td>
              </tr>
              {expanded.has('bottleneck') && metrics.sprintBottlenecksDetails.length > 0 && (
                <tr>
                  <td colSpan={2} className="px-3 pb-3">
                    <div className="ml-11 bg-slate-800/50 rounded-lg p-3 space-y-3">
                      <div className="text-xs text-slate-400 mb-2">
                        Sprints with highest dependency concentration:
                      </div>
                      {metrics.sprintBottlenecksDetails.map((detail) => (
                        <div key={`bottleneck-sprint-${detail.sprint}`} className="text-xs">
                          <div className="flex items-center gap-3 mb-1">
                            <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded font-semibold">
                              Sprint {detail.sprint}
                            </span>
                            <span className="text-slate-400">
                              {detail.dependencyCount} dependencies
                            </span>
                          </div>
                          <div className="ml-2 flex flex-wrap gap-1">
                            {detail.blockedTasks.slice(0, 8).map((taskId, taskIdx) => (
                              <span
                                key={`bottleneck-${detail.sprint}-task-${taskId}-${taskIdx}`}
                                className="px-1.5 py-0.5 bg-slate-700/50 text-slate-400 rounded font-mono text-[10px]"
                              >
                                {taskId}
                              </span>
                            ))}
                            {detail.blockedTasks.length > 8 && (
                              <span className="px-1.5 py-0.5 text-slate-500 text-[10px]">
                                +{detail.blockedTasks.length - 8} more
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
          {metrics.forwardDependencies > 0 && (
            <div className="flex items-center gap-1.5 text-red-400">
              <AlertTriangle className="w-3 h-3" />
              <span>{metrics.forwardDependencies} forward deps need review</span>
            </div>
          )}
          {metrics.planVsCodeMismatches > 0 && (
            <div className="flex items-center gap-1.5 text-orange-400">
              <FileWarning className="w-3 h-3" />
              <span>{metrics.planVsCodeMismatches} artifact mismatches</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
