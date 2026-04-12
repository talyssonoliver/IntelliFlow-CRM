'use client';

import React, { useEffect, useState } from 'react';
import { Icon } from '@/lib/icons';

// Pure helpers (extracted to reduce component cognitive complexity)

function toggleSetItem<T>(set: Set<T>, item: T): Set<T> {
  const next = new Set(set);
  if (next.has(item)) {
    next.delete(item);
  } else {
    next.add(item);
  }
  return next;
}

function getHealthStatus(pct: number): { color: string; text: string } {
  if (pct > 50) return { color: 'bg-green-400', text: 'Good' };
  if (pct > 25) return { color: 'bg-yellow-400', text: 'Moderate' };
  return { color: 'bg-red-400', text: 'Needs Attention' };
}

function HealthIndicator({ pct }: Readonly<{ pct: number }>) {
  const { color, text } = getHealthStatus(pct);
  return (
    <>
      <div className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-slate-400">Health: {text}</span>
    </>
  );
}

interface ExpandableMetricRowProps {
  isAlert: boolean;
  alertColor: 'orange' | 'red';
  iconName: string;
  label: string;
  hasDetails: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  value: React.ReactNode;
  children?: React.ReactNode;
}

function ExpandableMetricRow({
  isAlert,
  alertColor,
  iconName,
  label,
  hasDetails,
  isExpanded,
  onToggle,
  value,
  children,
}: ExpandableMetricRowProps) {
  const colorOn =
    alertColor === 'red' ? 'text-red-400 bg-red-500/10' : 'text-orange-400 bg-orange-500/10';
  const colorOff = 'text-green-400 bg-green-500/10';
  const [iconColor, bgColor] = isAlert ? colorOn.split(' ') : colorOff.split(' ');
  return (
    <React.Fragment>
      <tr className="hover:bg-slate-800/30 transition-colors cursor-pointer" onClick={onToggle}>
        <td className="py-3 px-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-8 h-8 rounded-lg ${bgColor} flex items-center justify-center ${iconColor}`}
            >
              <Icon name={iconName} size="sm" />
            </div>
            <span className="text-sm font-medium text-slate-200">{label}</span>
            {hasDetails &&
              (isExpanded ? (
                <Icon name="expand_more" size="sm" className="text-slate-400" />
              ) : (
                <Icon name="chevron_right" size="sm" className="text-slate-400" />
              ))}
          </div>
        </td>
        <td className="py-3 px-3 text-right">{value}</td>
      </tr>
      {isExpanded && hasDetails && children}
    </React.Fragment>
  );
}

type ArtifactType = 'package' | 'app' | 'infra';

function getTypeIcon(type: ArtifactType): React.ReactElement {
  const ICONS: Record<string, string> = { package: 'inventory_2', app: 'dns', infra: 'folder' };
  return <Icon name={ICONS[type]} size="xs" />;
}

function getTypeColor(type: ArtifactType): string {
  const COLORS: Record<string, string> = {
    package: 'text-purple-400 bg-purple-500/10',
    app: 'text-blue-400 bg-blue-500/10',
    infra: 'text-green-400 bg-green-500/10',
  };
  return COLORS[type];
}

// Detail types - using snake_case to match API response
interface MismatchDetail {
  task_id: string;
  description: string;
  missing_artifacts: string[];
}

interface UntrackedArtifactDetail {
  path: string;
  type: ArtifactType;
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

interface ContextGapDetail {
  task_id: string;
  description: string;
  missing_pack: boolean;
  missing_ack: boolean;
}

interface PlanGapDetail {
  task_id: string;
  description: string;
  plan_path: string;
  total_files: number;
  verified_files: number;
  missing_files: string[];
  checkbox_total: number;
  checkbox_checked: number;
}

interface HashMismatchDetail {
  task_id: string;
  description: string;
  mismatched_files: string[];
  total_files: number;
  matched_count: number;
}

interface CompletionIntegrityDetail {
  task_id: string;
  description: string;
  issues: string[];
  checkbox_pct: number | null;
  has_attestation: boolean;
  attestation_verdict: string | null;
  validation_count: number;
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
  missing_context_tasks: number;
  missing_context_tasks_details: ContextGapDetail[];
  incomplete_plan_deliverables: number;
  incomplete_plan_deliverables_details: PlanGapDetail[];
  context_hash_mismatches: number;
  context_hash_mismatches_details: HashMismatchDetail[];
  completion_integrity_failures: number;
  completion_integrity_details: CompletionIntegrityDetail[];
  generated_at: string;
}

type ExpandableMetric =
  | 'mismatches'
  | 'untracked'
  | 'forward'
  | 'bottleneck'
  | 'context'
  | 'plandeliverables'
  | 'hashmismatch'
  | 'integrity';

interface ContextArtifactRowProps {
  readonly details: ContextGapDetail[];
  readonly expanded: Set<ExpandableMetric>;
  readonly onToggle: () => void;
}

function ContextArtifactRow({ details, expanded, onToggle }: ContextArtifactRowProps) {
  const ackMissing = details.filter((d) => d.missing_ack);
  const packOnlyMissing = details.filter((d) => !d.missing_ack && d.missing_pack);
  const headlineCount = ackMissing.length;
  const hasAny = details.length > 0;
  const isExpanded = expanded.has('context');
  const iconBgClass = headlineCount > 0 ? 'bg-orange-500/10' : 'bg-green-500/10';
  const iconTextClass = headlineCount > 0 ? 'text-orange-400' : 'text-green-400';

  return (
    <>
      <tr className="hover:bg-slate-800/30 transition-colors cursor-pointer" onClick={onToggle}>
        <td className="py-3 px-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-8 h-8 rounded-lg ${iconBgClass} flex items-center justify-center ${iconTextClass}`}
            >
              <Icon name="folder" size="sm" />
            </div>
            <span className="text-sm font-medium text-slate-200">Missing Context Artifacts</span>
            {hasAny &&
              (isExpanded ? (
                <Icon name="expand_more" size="sm" className="text-slate-400" />
              ) : (
                <Icon name="chevron_right" size="sm" className="text-slate-400" />
              ))}
          </div>
        </td>
        <td className="py-3 px-3 text-right">
          <div className="flex items-center justify-end gap-2">
            <span
              className={`text-sm font-semibold ${headlineCount > 0 ? 'text-orange-400' : 'text-green-400'}`}
            >
              {headlineCount} no ack
            </span>
            {packOnlyMissing.length > 0 && (
              <span className="text-xs text-slate-500">({packOnlyMissing.length} no pack)</span>
            )}
          </div>
        </td>
      </tr>
      {isExpanded && hasAny && (
        <tr>
          <td colSpan={2} className="px-3 pb-3">
            <div className="ml-11 bg-slate-800/50 rounded-lg p-3 space-y-2">
              {ackMissing.length > 0 && (
                <>
                  <div className="text-xs text-orange-400 font-medium mb-1">
                    Missing attestation ({ackMissing.length}):
                  </div>
                  {ackMissing.slice(0, 15).map((detail, idx) => (
                    <div key={`ctx-ack-${detail.task_id}-${idx}`} className="text-xs">
                      <div className="flex items-center gap-2 text-slate-300">
                        <span className="font-mono text-orange-400">{detail.task_id}</span>
                        <span className="text-slate-500">-</span>
                        <span className="truncate">{detail.description}</span>
                        <div className="flex gap-1 ml-auto">
                          <span className="px-1.5 py-0.5 bg-orange-500/10 text-orange-400 rounded text-[10px]">
                            ack missing
                          </span>
                          {detail.missing_pack && (
                            <span className="px-1.5 py-0.5 bg-slate-700/50 text-slate-400 rounded text-[10px]">
                              pack missing
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {ackMissing.length > 15 && (
                    <div className="text-xs text-slate-500">+{ackMissing.length - 15} more</div>
                  )}
                </>
              )}
              {packOnlyMissing.length > 0 && (
                <>
                  <div className="text-xs text-slate-500 font-medium mt-2 mb-1">
                    Missing pack only ({packOnlyMissing.length}):
                  </div>
                  {packOnlyMissing.slice(0, 10).map((detail, idx) => (
                    <div key={`ctx-pack-${detail.task_id}-${idx}`} className="text-xs">
                      <div className="flex items-center gap-2 text-slate-400">
                        <span className="font-mono">{detail.task_id}</span>
                        <span className="text-slate-600">-</span>
                        <span className="truncate">{detail.description}</span>
                      </div>
                    </div>
                  ))}
                  {packOnlyMissing.length > 10 && (
                    <div className="text-xs text-slate-600">
                      +{packOnlyMissing.length - 10} more
                    </div>
                  )}
                </>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

interface ExecutiveSummaryProps {
  readonly sprint?: number | 'all' | 'Continuous';
}

export default function ExecutiveSummary({ sprint = 'all' }: ExecutiveSummaryProps) {
  const [metrics, setMetrics] = useState<ExecutiveMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<ExpandableMetric>>(new Set());

  const toggleExpanded = (key: ExpandableMetric) => {
    setExpanded((prev) => toggleSetItem(prev, key));
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
          <Icon
            name="refresh"
            size="sm"
            className={`text-slate-300 ${loading ? 'animate-spin' : ''}`}
          />
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
            <ExpandableMetricRow
              key="mismatches-section"
              isAlert={metrics.plan_vs_code_mismatches > 0}
              alertColor="orange"
              iconName="description"
              label="Plan-vs-Code Mismatches"
              hasDetails={metrics.plan_vs_code_mismatches_details.length > 0}
              isExpanded={expanded.has('mismatches')}
              onToggle={() => toggleExpanded('mismatches')}
              value={
                <span
                  className={`text-sm font-semibold ${metrics.plan_vs_code_mismatches > 0 ? 'text-orange-400' : 'text-green-400'}`}
                >
                  {metrics.plan_vs_code_mismatches}
                </span>
              }
            >
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
            </ExpandableMetricRow>

            {/* Missing Context Pack & Ack - Expandable */}
            <React.Fragment key="context-section">
              <ContextArtifactRow
                details={metrics.missing_context_tasks_details}
                expanded={expanded}
                onToggle={() => toggleExpanded('context')}
              />
            </React.Fragment>

            {/* Incomplete Plan Deliverables - Expandable */}
            <ExpandableMetricRow
              key="plandeliverables-section"
              isAlert={metrics.incomplete_plan_deliverables > 0}
              alertColor="orange"
              iconName="checklist"
              label="Incomplete Plan Deliverables"
              hasDetails={metrics.incomplete_plan_deliverables_details.length > 0}
              isExpanded={expanded.has('plandeliverables')}
              onToggle={() => toggleExpanded('plandeliverables')}
              value={
                <span
                  className={`text-sm font-semibold ${metrics.incomplete_plan_deliverables > 0 ? 'text-orange-400' : 'text-green-400'}`}
                >
                  {metrics.incomplete_plan_deliverables}
                </span>
              }
            >
              <tr>
                <td colSpan={2} className="px-3 pb-3">
                  <div className="ml-11 bg-slate-800/50 rounded-lg p-3 space-y-2">
                    {metrics.incomplete_plan_deliverables_details.map((detail, idx) => (
                      <div key={`plan-${detail.task_id}-${idx}`} className="text-xs">
                        <div className="flex items-center gap-2 text-slate-300">
                          <span className="font-mono text-orange-400">{detail.task_id}</span>
                          <span className="text-slate-500">-</span>
                          <span className="truncate">{detail.description}</span>
                          <div className="flex gap-2 ml-auto shrink-0">
                            {detail.total_files > 0 && (
                              <span
                                className={`${detail.verified_files < detail.total_files ? 'text-orange-400' : 'text-green-400'}`}
                              >
                                Files {detail.verified_files}/{detail.total_files}
                              </span>
                            )}
                            {detail.checkbox_total > 0 && (
                              <span
                                className={`${detail.checkbox_checked < detail.checkbox_total ? 'text-orange-400' : 'text-green-400'}`}
                              >
                                Steps {detail.checkbox_checked}/{detail.checkbox_total}
                              </span>
                            )}
                          </div>
                        </div>
                        {detail.missing_files.length > 0 && (
                          <div className="ml-4 mt-1 text-slate-500">
                            Missing:{' '}
                            {detail.missing_files.map((f) => f.split('/').pop()).join(', ')}
                            {detail.total_files - detail.verified_files > 5 &&
                              ` +${detail.total_files - detail.verified_files - detail.missing_files.length} more`}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </td>
              </tr>
            </ExpandableMetricRow>

            {/* Completion Integrity - Expandable */}
            <ExpandableMetricRow
              key="integrity-section"
              isAlert={metrics.completion_integrity_failures > 0}
              alertColor="red"
              iconName="verified"
              label="Completion Integrity Failures"
              hasDetails={metrics.completion_integrity_details.length > 0}
              isExpanded={expanded.has('integrity')}
              onToggle={() => toggleExpanded('integrity')}
              value={
                <span
                  className={`text-sm font-semibold ${metrics.completion_integrity_failures > 0 ? 'text-red-400' : 'text-green-400'}`}
                >
                  {metrics.completion_integrity_failures}
                </span>
              }
            >
              <tr>
                <td colSpan={2} className="px-3 pb-3">
                  <div className="ml-11 bg-slate-800/50 rounded-lg p-3 space-y-2">
                    {metrics.completion_integrity_details.slice(0, 20).map((detail, idx) => (
                      <div key={`integrity-${detail.task_id}-${idx}`} className="text-xs">
                        <div className="flex items-center gap-2 text-slate-300">
                          <span className="font-mono text-red-400">{detail.task_id}</span>
                          <span className="text-slate-500">-</span>
                          <span className="truncate">{detail.description}</span>
                          <div className="flex gap-1 ml-auto shrink-0">
                            {detail.has_attestation === false && (
                              <span className="px-1.5 py-0.5 bg-red-500/10 text-red-400 rounded text-[10px]">
                                no attestation
                              </span>
                            )}
                            {detail.checkbox_pct !== null && detail.checkbox_pct < 100 && (
                              <span className="px-1.5 py-0.5 bg-orange-500/10 text-orange-400 rounded text-[10px]">
                                {detail.checkbox_pct}% checked
                              </span>
                            )}
                            {detail.has_attestation && detail.validation_count < 4 && (
                              <span className="px-1.5 py-0.5 bg-orange-500/10 text-orange-400 rounded text-[10px]">
                                {detail.validation_count}/4 validations
                              </span>
                            )}
                            {detail.issues.some((i) => i.startsWith('Plan deliverables:')) && (
                              <span className="px-1.5 py-0.5 bg-orange-500/10 text-orange-400 rounded text-[10px]">
                                missing files
                              </span>
                            )}
                          </div>
                        </div>
                        {detail.issues.length > 0 && (
                          <div className="ml-4 mt-1 text-slate-500">
                            {detail.issues.join(' · ')}
                          </div>
                        )}
                      </div>
                    ))}
                    {metrics.completion_integrity_details.length > 20 && (
                      <div className="text-xs text-slate-500 pt-1">
                        +{metrics.completion_integrity_details.length - 20} more failures
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            </ExpandableMetricRow>

            {/* Context Hash Mismatches - Expandable */}
            <ExpandableMetricRow
              key="hashmismatch-section"
              isAlert={metrics.context_hash_mismatches > 0}
              alertColor="red"
              iconName="fingerprint"
              label="Context Hash Mismatches"
              hasDetails={metrics.context_hash_mismatches_details.length > 0}
              isExpanded={expanded.has('hashmismatch')}
              onToggle={() => toggleExpanded('hashmismatch')}
              value={
                <span
                  className={`text-sm font-semibold ${metrics.context_hash_mismatches > 0 ? 'text-red-400' : 'text-green-400'}`}
                >
                  {metrics.context_hash_mismatches}
                </span>
              }
            >
              <tr>
                <td colSpan={2} className="px-3 pb-3">
                  <div className="ml-11 bg-slate-800/50 rounded-lg p-3 space-y-2">
                    {metrics.context_hash_mismatches_details.map((detail, idx) => (
                      <div key={`hash-${detail.task_id}-${idx}`} className="text-xs">
                        <div className="flex items-center gap-2 text-slate-300">
                          <span className="font-mono text-red-400">{detail.task_id}</span>
                          <span className="text-slate-500">-</span>
                          <span className="truncate">{detail.description}</span>
                          <span className="text-slate-500 ml-auto">
                            {detail.matched_count}/{detail.total_files} matched
                          </span>
                        </div>
                        <div className="ml-4 mt-1 text-slate-500">
                          Mismatched:{' '}
                          {detail.mismatched_files.map((f) => f.split('/').pop()).join(', ')}
                          {detail.mismatched_files.length <
                            detail.total_files - detail.matched_count &&
                            ` +${detail.total_files - detail.matched_count - detail.mismatched_files.length} more`}
                        </div>
                      </div>
                    ))}
                  </div>
                </td>
              </tr>
            </ExpandableMetricRow>

            {/* Untracked Code Artifacts - Expandable */}
            <ExpandableMetricRow
              key="untracked-section"
              isAlert={metrics.untracked_code_artifacts > 0}
              alertColor="orange"
              iconName="warning"
              label="Untracked Code Artifacts"
              hasDetails={metrics.untracked_code_artifacts_details.length > 0}
              isExpanded={expanded.has('untracked')}
              onToggle={() => toggleExpanded('untracked')}
              value={
                <span
                  className={`text-sm font-semibold ${metrics.untracked_code_artifacts > 0 ? 'text-orange-400' : 'text-green-400'}`}
                >
                  {metrics.untracked_code_artifacts}
                </span>
              }
            >
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
            </ExpandableMetricRow>

            {/* Forward Dependencies - Expandable */}
            <ExpandableMetricRow
              key="forward-section"
              isAlert={metrics.forward_dependencies > 0}
              alertColor="red"
              iconName="account_tree"
              label="Forward Dependencies"
              hasDetails={metrics.forward_dependencies_details.length > 0}
              isExpanded={expanded.has('forward')}
              onToggle={() => toggleExpanded('forward')}
              value={
                <span
                  className={`text-sm font-semibold ${metrics.forward_dependencies > 0 ? 'text-red-400' : 'text-green-400'}`}
                >
                  {metrics.forward_dependencies}
                </span>
              }
            >
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
            </ExpandableMetricRow>

            {/* Sprint Bottleneck - Expandable */}
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
            <HealthIndicator pct={metrics.completed.percentage} />
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
          {metrics.missing_context_tasks_details.some((d) => d.missing_ack) && (
            <div className="flex items-center gap-1.5 text-orange-400">
              <Icon name="folder" size="xs" />
              <span>
                {metrics.missing_context_tasks_details.filter((d) => d.missing_ack).length} missing
                ack
              </span>
            </div>
          )}
          {metrics.completion_integrity_failures > 0 && (
            <div className="flex items-center gap-1.5 text-red-400">
              <Icon name="verified" size="xs" />
              <span>{metrics.completion_integrity_failures} integrity failures</span>
            </div>
          )}
          {metrics.context_hash_mismatches > 0 && (
            <div className="flex items-center gap-1.5 text-red-400">
              <Icon name="fingerprint" size="xs" />
              <span>{metrics.context_hash_mismatches} hash mismatches</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
