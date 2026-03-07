'use client';

import { useState, useEffect, useCallback } from 'react';
import { Icon } from '@/lib/icons';
import { RefreshButton, MetricCard, StaleIndicator } from './shared';

interface SpecTask {
  task_id: string;
  title: string;
  sprint: number;
  spec_path: string;
  has_spec: boolean;
  has_plan: boolean;
  has_attestation: boolean;
  csv_status: string;
  metric_status: string | null;
  acceptance_criteria_count: number;
  dependencies: string[];
  real_status: string;
  notes?: string;
  csv_percent_complete?: number;
}

interface SpecIssue {
  task_id: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  issue: string;
  recommendation: string;
}

interface SpecTrackerData {
  generated_at: string;
  description: string;
  summary: {
    total_specs_analyzed: number;
    completed: number;
    partially_done: number;
    spec_only: number;
    uncertain: number;
    note: string;
  };
  status_legend: Record<string, string>;
  issues: SpecIssue[];
  tasks: SpecTask[];
}

type StatusFilter = 'ALL' | 'COMPLETED' | 'PARTIALLY_DONE' | 'SPEC_ONLY' | 'UNCERTAIN';

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: 'bg-green-100 text-green-800',
  PARTIALLY_DONE: 'bg-yellow-100 text-yellow-800',
  SPEC_ONLY: 'bg-blue-100 text-blue-800',
  UNCERTAIN: 'bg-orange-100 text-orange-800',
};

const SEVERITY_COLORS: Record<string, string> = {
  HIGH: 'bg-red-100 text-red-800 border-red-300',
  MEDIUM: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  LOW: 'bg-blue-100 text-blue-800 border-blue-300',
};

export default function SpecTrackerPanel() {
  const [data, setData] = useState<SpecTrackerData | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIssue, setExpandedIssue] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch('/api/tracking/spec-tracker');
      if (!response.ok) throw new Error('Failed to fetch spec tracker data');
      const result = await response.json();
      setData(result.data);
      setLastUpdated(result.lastUpdated);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRefresh = async () => {
    setLoading(true);
    await fetchData();
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <Icon name="progress_activity" className="animate-spin text-blue-500" size="2xl" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <Icon name="error" size="2xl" className="text-red-500 mb-2" />
        <p className="text-red-700 font-medium">{error}</p>
        <p className="text-red-600 text-sm mt-1">
          Generate it by running the spec tracker analysis script.
        </p>
      </div>
    );
  }

  if (!data) return null;

  const filteredTasks = data.tasks.filter((task) => {
    const matchesStatus = statusFilter === 'ALL' || task.real_status === statusFilter;
    const matchesSearch =
      !searchQuery ||
      task.task_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.title.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const completionRate =
    data.summary.total_specs_analyzed > 0
      ? ((data.summary.completed / data.summary.total_specs_analyzed) * 100).toFixed(1)
      : '0';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Spec Tracker</h3>
          <p className="mt-1 text-sm text-gray-600">{data.description}</p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <StaleIndicator lastUpdated={new Date(lastUpdated)} thresholdMinutes={1440} />
          )}
          <RefreshButton onRefresh={handleRefresh} size="sm" />
        </div>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <MetricCard
          title="Total Specs"
          value={data.summary.total_specs_analyzed}
          icon="description"
          variant="info"
        />
        <MetricCard
          title="Completed"
          value={data.summary.completed}
          subtitle={`${completionRate}%`}
          icon="check_circle"
          variant="success"
        />
        <MetricCard
          title="Partially Done"
          value={data.summary.partially_done}
          icon="pending"
          variant="warning"
        />
        <MetricCard
          title="Spec Only"
          value={data.summary.spec_only}
          icon="draft"
          variant="default"
        />
        <MetricCard title="Uncertain" value={data.summary.uncertain} icon="help" variant="error" />
      </div>

      {/* Issues Section */}
      {data.issues.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-3 flex items-center gap-2">
            <Icon name="report" size="lg" className="text-red-500" />
            <h4 className="font-semibold text-gray-900">Issues ({data.issues.length})</h4>
          </div>
          <div className="divide-y divide-gray-100">
            {data.issues.map((issue) => (
              <div key={issue.task_id} className="px-4 py-3">
                <button
                  className="w-full text-left flex items-start gap-3"
                  onClick={() =>
                    setExpandedIssue(expandedIssue === issue.task_id ? null : issue.task_id)
                  }
                >
                  <span
                    className={`mt-0.5 inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${SEVERITY_COLORS[issue.severity]}`}
                  >
                    {issue.severity}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900">{issue.task_id}</p>
                    <p className="text-sm text-gray-600 truncate">{issue.issue}</p>
                  </div>
                  <Icon
                    name={expandedIssue === issue.task_id ? 'expand_less' : 'expand_more'}
                    size="base"
                    className="text-gray-400 mt-1 flex-shrink-0"
                  />
                </button>
                {expandedIssue === issue.task_id && (
                  <div className="mt-2 ml-16 space-y-2">
                    <p className="text-sm text-gray-700">{issue.issue}</p>
                    <div className="rounded-md bg-blue-50 p-3">
                      <p className="text-xs font-medium text-blue-800 mb-1">Recommendation</p>
                      <p className="text-sm text-blue-700">{issue.recommendation}</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Icon
            name="search"
            size="base"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            placeholder="Search by task ID or title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-gray-300 pl-9 pr-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
          />
        </div>
        <div className="inline-flex rounded-md border border-gray-300 bg-white">
          {(['ALL', 'COMPLETED', 'PARTIALLY_DONE', 'SPEC_ONLY', 'UNCERTAIN'] as StatusFilter[]).map(
            (filter) => (
              <button
                key={filter}
                onClick={() => setStatusFilter(filter)}
                className={`px-3 py-1.5 text-xs font-medium first:rounded-l-md last:rounded-r-md border-r last:border-r-0 border-gray-300 transition-colors ${
                  statusFilter === filter
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {filter === 'ALL' ? 'All' : filter.replaceAll('_', ' ')}
              </button>
            )
          )}
        </div>
        <span className="text-sm text-gray-500">
          {filteredTasks.length} of {data.tasks.length} tasks
        </span>
      </div>

      {/* Tasks Table */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Task
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Sprint
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Spec
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Plan
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Attestation
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  CSV Status
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ACs
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Real Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredTasks.map((task) => (
                <tr
                  key={task.task_id}
                  className={`hover:bg-blue-50 transition-colors cursor-pointer ${selectedTaskId === task.task_id ? 'bg-blue-50 ring-1 ring-inset ring-blue-300' : ''}`}
                  onClick={() =>
                    setSelectedTaskId(selectedTaskId === task.task_id ? null : task.task_id)
                  }
                >
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-mono text-sm font-medium text-blue-700 group-hover:underline">
                        {task.task_id}
                      </p>
                      <p className="text-xs text-gray-500 truncate max-w-xs">{task.title}</p>
                      {task.notes && (
                        <p className="text-xs text-amber-600 mt-0.5 truncate max-w-xs">
                          {task.notes}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{task.sprint}</td>
                  <td className="px-4 py-3 text-center">
                    <EvidenceBadge present={task.has_spec} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <EvidenceBadge present={task.has_plan} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <EvidenceBadge present={task.has_attestation} />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{task.csv_status}</td>
                  <td className="px-4 py-3 text-center text-sm text-gray-600">
                    {task.acceptance_criteria_count}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[task.real_status] ?? 'bg-gray-100 text-gray-800'}`}
                    >
                      {task.real_status.replaceAll('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))}
              {filteredTasks.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">
                    No tasks match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Task Detail Panel */}
      {selectedTaskId && (
        <TaskDetailPanel
          task={data.tasks.find((t) => t.task_id === selectedTaskId) ?? null}
          issue={data.issues.find((i) => i.task_id === selectedTaskId) ?? null}
          onClose={() => setSelectedTaskId(null)}
        />
      )}

      {/* Legend */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Status Legend</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {Object.entries(data.status_legend).map(([status, description]) => (
            <div key={status} className="flex items-start gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium flex-shrink-0 ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-800'}`}
              >
                {status.replaceAll('_', ' ')}
              </span>
              <span className="text-xs text-gray-600">{description}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Source info */}
      <p className="text-xs text-gray-500">
        Generated from{' '}<code>artifacts/reports/spec-tracker.json</code>. Last generated:{' '}
        {new Date(data.generated_at).toLocaleString()}.
      </p>
    </div>
  );
}

function EvidenceBadge({ present }: Readonly<{ present: boolean }>) {
  return present ? (
    <Icon name="check_circle" size="base" className="text-green-500" />
  ) : (
    <Icon name="cancel" size="base" className="text-red-400" />
  );
}

/* ------------------------------------------------------------------ */
/*  Task Detail Panel                                                  */
/* ------------------------------------------------------------------ */

interface TaskDetailPanelProps {
  task: SpecTask | null;
  issue: SpecIssue | null;
  onClose: () => void;
}

function TaskDetailPanel({ task, issue, onClose }: Readonly<TaskDetailPanelProps>) {
  if (!task) return null;

  return (
    <div className="rounded-lg border border-blue-200 bg-white shadow-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b border-gray-200 bg-gray-50 px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="font-mono text-lg font-bold text-gray-900">{task.task_id}</h3>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[task.real_status] ?? 'bg-gray-100 text-gray-800'}`}
            >
              {task.real_status.replaceAll('_', ' ')}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-700">{task.title}</p>
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-colors"
        >
          <Icon name="close" size="lg" />
        </button>
      </div>

      <div className="px-5 py-4 space-y-5">
        {/* Evidence Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <EvidenceCard label="Spec" present={task.has_spec} path={task.spec_path} />
          <EvidenceCard label="Plan" present={task.has_plan} />
          <EvidenceCard label="Attestation" present={task.has_attestation} />
          <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs font-medium text-gray-500">Acceptance Criteria</p>
            <p className="mt-1 text-lg font-bold text-gray-900">{task.acceptance_criteria_count}</p>
          </div>
        </div>

        {/* Status Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <p className="text-xs font-medium text-gray-500">Sprint</p>
            <p className="mt-0.5 text-sm font-medium text-gray-900">{task.sprint}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500">CSV Status</p>
            <p className="mt-0.5 text-sm font-medium text-gray-900">{task.csv_status}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500">Metric Status</p>
            <p className="mt-0.5 text-sm font-medium text-gray-900">
              {task.metric_status ?? 'N/A'}
            </p>
          </div>
          {task.csv_percent_complete !== undefined && (
            <div>
              <p className="text-xs font-medium text-gray-500">CSV % Complete</p>
              <p className="mt-0.5 text-sm font-medium text-gray-900">
                {task.csv_percent_complete}%
              </p>
            </div>
          )}
        </div>

        {/* Dependencies */}
        {task.dependencies.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1.5">
              Dependencies ({task.dependencies.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {task.dependencies.map((dep) => (
                <span
                  key={dep}
                  className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs font-mono font-medium text-gray-700"
                >
                  {dep}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Spec Path */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1">Spec Path</p>
          <code className="block rounded-md bg-gray-100 px-3 py-2 text-xs text-gray-700 break-all">
            {task.spec_path}
          </code>
        </div>

        {/* Notes */}
        {task.notes && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-2">
              <Icon name="info" size="base" className="text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-amber-800 mb-1">Notes</p>
                <p className="text-sm text-amber-900">{task.notes}</p>
              </div>
            </div>
          </div>
        )}

        {/* Related Issue */}
        {issue && (
          <div className={`rounded-md border p-4 ${SEVERITY_COLORS[issue.severity]}`}>
            <div className="flex items-start gap-2">
              <Icon name="report" size="base" className="mt-0.5 flex-shrink-0" />
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-bold uppercase">{issue.severity} Severity Issue</p>
                </div>
                <p className="text-sm">{issue.issue}</p>
                <div className="rounded-md bg-white/60 p-3">
                  <p className="text-xs font-medium mb-1">Recommendation</p>
                  <p className="text-sm">{issue.recommendation}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Evidence Card                                                      */
/* ------------------------------------------------------------------ */

interface EvidenceCardProps {
  label: string;
  present: boolean;
  path?: string;
}

function EvidenceCard({ label, present, path }: Readonly<EvidenceCardProps>) {
  return (
    <div
      className={`rounded-md border p-3 ${present ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}
    >
      <div className="flex items-center gap-1.5">
        <EvidenceBadge present={present} />
        <p className="text-xs font-medium text-gray-700">{label}</p>
      </div>
      {path && (
        <p className="mt-1 text-[10px] text-gray-500 truncate" title={path}>
          {path}
        </p>
      )}
    </div>
  );
}
