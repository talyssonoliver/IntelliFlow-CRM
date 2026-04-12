'use client';

import React, { useState, useEffect } from 'react';
import { Icon } from '@/lib/icons';

interface GovernanceSummary {
  sprint: number;
  tierBreakdown: { A: number; B: number; C: number };
  tierCompletion: {
    A: { done: number; total: number };
    B: { done: number; total: number };
    C: { done: number; total: number };
  };
  taskSummary: {
    total: number;
    done: number;
    in_progress: number;
    blocked: number;
    not_started: number;
    failed: number;
  };
  validationCoverage: number;
  reviewQueueSize: number;
  errorCount: number;
  warningCount: number;
  debtItems: number;
  expiringWaivers: number;
  lastLintRun?: string;
}

interface ReviewQueueItem {
  task_id: string;
  tier: 'A' | 'B' | 'C';
  section: string;
  status: string;
  owner: string;
  reasons: string[];
  evidence_missing?: string[];
  dependent_count?: number;
  waiver_expiry?: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

interface DebtItem {
  id: string;
  origin_task: string;
  owner: string;
  severity: string;
  description: string;
  expiry_date: string;
  status: string;
}

interface LintError {
  rule: string;
  severity: string;
  message: string;
  tasks: string[];
}

interface PhantomCompletion {
  task_id: string;
  description: string;
  status_claimed: string;
  missing_artifacts: string[];
  partially_exists?: string[];
  note?: string;
}

interface PhantomAudit {
  summary: {
    total_completed_tasks: number;
    verified_completions: number;
    phantom_completions: number;
    integrity_score: string;
    conclusion: string;
  };
  phantom_completions: PhantomCompletion[];
  recommendations: Array<{ priority: string; action: string; details?: string }>;
}

interface HealthCheck {
  name: string;
  passed: boolean;
  detail: string;
}

interface GoldenPathResult {
  name: string;
  entrypoint: string;
  docExists: boolean;
  contentVerified: boolean;
}

interface MaturityCriterion {
  id: string;
  name: string;
  passed: boolean;
}

interface MaturityLevel {
  level: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
  name: string;
  color: string;
  score: number;
  criteria: MaturityCriterion[];
  nextLevel: string | null;
  nextRequirements: string[];
  progressToNext: number;
}

interface Recommendation {
  title: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
  estimatedTime: string;
  action: string;
}

interface TrendPoint {
  timestamp: string;
  metrics: Record<string, number | null>;
}

interface CodebaseHealth {
  typescript_files: number;
  test_files: number;
  test_ratio: number;
  total_tracked_files: number;
  workspace_packages: number;
  ci_workflows: number;
  ci_workflow_names: string[];
  database_migrations: number;
  root_scripts: number;
  env_files_documented: number;
  env_files_expected: number;
  test_coverage_pct: number | null;
  git_velocity: { commits_30d: number; branches: number };
  golden_paths_verified: number;
  golden_paths_total: number;
}

interface PlatformHealthData {
  source: string;
  timestamp: string;
  pattern: string;
  status: 'passing' | 'failing' | 'degraded';
  summary: {
    schema: 'PASS' | 'FAIL';
    kpis: { total: number; met: number; allMet: boolean };
    evidence: { total: number; passed: number; warnings: string[] };
    provenance: { fresh: boolean; daysSinceCollection: number; threshold: number; nextDue: string };
    consistency: { total: number; passed: number; failures: string[] };
  };
  maturity: MaturityLevel;
  recommendations: Recommendation[];
  trendHistory: TrendPoint[];
  codebaseHealth: CodebaseHealth | null;
  goldenPaths: GoldenPathResult[];
  kpis: Array<{ name: string; target: string; actual: string; met: boolean }>;
  evidenceChecks: HealthCheck[];
  provenanceChecks: HealthCheck[];
  consistencyChecks: HealthCheck[];
  metrics: {
    taskId: string;
    sprint: number;
    generatedAt: string;
    idpStatus: string;
    deploySuccessRate: number;
    totalDeploys: number;
    cacheHitRate: number;
    ciPassRate: number;
  };
}

interface TierTaskDetail {
  taskId: string;
  status: 'done' | 'pending' | 'blocked';
  acceptanceOwner?: string;
  hasLintErrors: boolean;
  lintErrorTypes: string[];
  evidenceRequired: string[];
  gateProfile: string[];
  waiverExpiry?: string;
  debtAllowed: boolean;
}

interface TierTasks {
  A: TierTaskDetail[];
  B: TierTaskDetail[];
  C: TierTaskDetail[];
}

// Sub-component for tier task cards to reduce cognitive complexity
interface TierCardProps {
  readonly tier: 'A' | 'B' | 'C';
  readonly label: string;
  readonly sublabel: string;
  readonly count: number;
  readonly completion: { done: number; total: number };
  readonly tasks: TierTaskDetail[];
  readonly isExpanded: boolean;
  readonly onToggle: () => void;
  readonly getTaskCardClass: (status: string, hasLintErrors: boolean) => string;
  readonly getTaskStatusIcon: (status: string, hasLintErrors: boolean) => React.ReactNode;
}

// Sub-component for actionable summary to reduce cognitive complexity
interface ActionableSummaryProps {
  readonly tierTasks: TierTasks;
}

function ActionableSummary({ tierTasks }: Readonly<ActionableSummaryProps>) {
  const tierAErrors = tierTasks.A.filter((t) => t.hasLintErrors && t.status !== 'done');
  const tierBErrors = tierTasks.B.filter((t) => t.hasLintErrors && t.status !== 'done');
  const pendingA = tierTasks.A.filter((t) => t.status !== 'done').length;
  const pendingB = tierTasks.B.filter((t) => t.status !== 'done').length;
  const pendingC = tierTasks.C.filter((t) => t.status !== 'done').length;
  const completedCount =
    tierTasks.A.filter((t) => t.status === 'done').length +
    tierTasks.B.filter((t) => t.status === 'done').length +
    tierTasks.C.filter((t) => t.status === 'done').length;

  // Group by error type
  const errorTypes: Record<string, string[]> = {};
  for (const t of [...tierAErrors, ...tierBErrors]) {
    for (const err of t.lintErrorTypes) {
      if (!errorTypes[err]) errorTypes[err] = [];
      errorTypes[err].push(t.taskId);
    }
  }

  const hasErrors = Object.keys(errorTypes).length > 0;

  return (
    <div className="mb-6 space-y-3">
      {hasErrors && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <h3 className="font-semibold text-amber-800 flex items-center gap-2">
            <Icon name="warning" size="lg" />
            Action Required
          </h3>
          <div className="mt-3 space-y-3">
            {errorTypes['TIER_A_ACCEPTANCE_REQUIRED'] && (
              <div className="bg-white rounded p-3 border border-amber-100">
                <p className="font-medium text-gray-900">
                  {errorTypes['TIER_A_ACCEPTANCE_REQUIRED'].length} tasks missing Acceptance
                  Criteria
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  Tasks: {errorTypes['TIER_A_ACCEPTANCE_REQUIRED'].join(', ')}
                </p>
                <div className="mt-2 p-2 bg-blue-50 rounded text-sm">
                  <p className="font-medium text-blue-800">How to fix:</p>
                  <ol className="list-decimal list-inside text-blue-700 mt-1 space-y-1">
                    <li>
                      Open <code className="bg-blue-100 px-1 rounded">Sprint_plan.csv</code>
                    </li>
                    <li>
                      Add column{' '}
                      <code className="bg-blue-100 px-1 rounded">Acceptance Criteria</code> if
                      missing
                    </li>
                    <li>For each task above, add specific acceptance criteria</li>
                    <li>
                      Run <code className="bg-blue-100 px-1 rounded">Run Lint</code> to verify
                    </li>
                  </ol>
                </div>
              </div>
            )}
            {errorTypes['PHANTOM_COMPLETION'] && (
              <div className="bg-white rounded p-3 border border-amber-100">
                <p className="font-medium text-gray-900">
                  {errorTypes['PHANTOM_COMPLETION'].length} tasks marked complete but missing
                  artifacts
                </p>
                <div className="mt-2 p-2 bg-blue-50 rounded text-sm">
                  <p className="font-medium text-blue-800">How to fix:</p>
                  <p className="text-blue-700">
                    Either create the missing artifacts or change task status back to "Planned"
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      <div className="flex gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
          <span>{completedCount} completed</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-gray-400"></div>
          <span>{pendingA + pendingB + pendingC} pending</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <span>{tierAErrors.length + tierBErrors.length} need fixes</span>
        </div>
      </div>
    </div>
  );
}

function TierCard({
  tier,
  label,
  sublabel,
  count,
  completion,
  tasks,
  isExpanded,
  onToggle,
  getTaskCardClass,
  getTaskStatusIcon,
}: Readonly<TierCardProps>) {
  const colorMap = {
    A: {
      bg: 'bg-red-100 text-red-800 border-red-300',
      hover: 'hover:bg-red-50/50',
      bar: 'bg-red-600',
      border: 'border-red-200',
    },
    B: {
      bg: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      hover: 'hover:bg-yellow-50/50',
      bar: 'bg-yellow-600',
      border: 'border-yellow-200',
    },
    C: {
      bg: 'bg-green-100 text-green-800 border-green-300',
      hover: 'hover:bg-green-50/50',
      bar: 'bg-green-600',
      border: 'border-green-200',
    },
  };
  const colors = colorMap[tier];
  const percentage = completion.total ? (completion.done / completion.total) * 100 : 0;

  return (
    <div className={`rounded-lg border-2 ${colors.bg} overflow-hidden`}>
      <button
        onClick={onToggle}
        className={`w-full p-4 flex items-center justify-between ${colors.hover} transition-colors`}
      >
        <div className="flex items-center gap-4">
          <p className="text-3xl font-bold">{count}</p>
          <div>
            <p className="text-sm font-medium">{label}</p>
            <p className="text-xs">{sublabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-sm font-medium">
              {completion.done}/{completion.total} done
            </span>
            <div className="w-24 h-2 bg-white/30 rounded-full overflow-hidden mt-1">
              <div
                className={`h-full ${colors.bar} rounded-full`}
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
          {isExpanded ? (
            <Icon name="expand_less" size="lg" />
          ) : (
            <Icon name="expand_more" size="lg" />
          )}
        </div>
      </button>
      {isExpanded && tasks && (
        <div className={`border-t ${colors.border} bg-white p-4`}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {tasks.map((task) => (
              <div
                key={task.taskId}
                className={`p-3 rounded-lg border ${getTaskCardClass(task.status, task.hasLintErrors)}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-medium">{task.taskId}</span>
                  {getTaskStatusIcon(task.status, task.hasLintErrors)}
                </div>
                {task.hasLintErrors && task.status !== 'done' && (
                  <div className="mt-1 text-xs text-red-600">
                    {task.lintErrorTypes.map((e) => e.replaceAll('_', ' ')).join(', ')}
                  </div>
                )}
                {task.acceptanceOwner && tier === 'A' && (
                  <div className="mt-1 text-xs text-gray-500">Owner: {task.acceptanceOwner}</div>
                )}
                {task.waiverExpiry && tier !== 'A' && (
                  <div className="mt-1 text-xs text-orange-600">
                    Waiver expires: {task.waiverExpiry}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function getTierColor(tier: string): string {
  if (tier === 'A') return 'bg-red-100 text-red-800 border-red-300';
  if (tier === 'B') return 'bg-yellow-100 text-yellow-800 border-yellow-300';
  if (tier === 'C') return 'bg-green-100 text-green-800 border-green-300';
  return 'bg-gray-100 text-gray-800 border-gray-300';
}

function getPriorityColor(priority: string): string {
  if (priority === 'critical') return 'bg-red-500 text-white';
  if (priority === 'high') return 'bg-orange-500 text-white';
  if (priority === 'medium') return 'bg-yellow-500 text-black';
  if (priority === 'low') return 'bg-blue-500 text-white';
  return 'bg-gray-500 text-white';
}

function getSeverityColor(severity: string): string {
  if (severity === 'critical') return 'text-red-600 bg-red-50';
  if (severity === 'high') return 'text-orange-600 bg-orange-50';
  if (severity === 'medium') return 'text-yellow-600 bg-yellow-50';
  if (severity === 'low') return 'text-blue-600 bg-blue-50';
  return 'text-gray-600 bg-gray-50';
}

function getDaysUntilExpiry(expiryDate: string): number {
  const now = new Date();
  const expiry = new Date(expiryDate);
  return Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getTaskStatusIcon(status: string, hasLintErrors: boolean): React.ReactNode {
  if (status === 'done') return <Icon name="check_circle" size="sm" className="text-green-600" />;
  if (hasLintErrors) return <Icon name="cancel" size="sm" className="text-red-600" />;
  return <Icon name="schedule" size="sm" className="text-gray-400" />;
}

function getTaskCardClass(status: string, hasLintErrors: boolean): string {
  if (status === 'done') return 'bg-green-50 border-green-200';
  if (hasLintErrors) return 'bg-red-50 border-red-300';
  return 'bg-gray-50 border-gray-200';
}

function getTabClass(
  activeTab: string,
  tabId: string,
  isCritical: boolean,
  hasItems: boolean
): string {
  if (activeTab === tabId) {
    return isCritical ? 'border-red-500 text-red-600' : 'border-blue-500 text-blue-600';
  }
  if (isCritical && hasItems) return 'border-transparent text-red-500 hover:text-red-700';
  return 'border-transparent text-gray-500 hover:text-gray-700';
}

function getExpiryBadgeClass(daysUntil: number): string {
  if (daysUntil <= 0) return 'bg-red-500 text-white';
  if (daysUntil <= 30) return 'bg-orange-500 text-white';
  return 'bg-gray-200';
}

function getRecommendationClass(priority: string): string {
  if (priority === 'CRITICAL') return 'bg-red-50 border-red-500';
  if (priority === 'HIGH') return 'bg-orange-50 border-orange-500';
  return 'bg-yellow-50 border-yellow-500';
}

function getRecommendationBadgeClass(priority: string): string {
  if (priority === 'CRITICAL') return 'bg-red-100 text-red-700';
  if (priority === 'HIGH') return 'bg-orange-100 text-orange-700';
  return 'bg-yellow-100 text-yellow-700';
}

interface PhantomTabContentProps {
  phantomAudit: PhantomAudit | null;
  lintOutput: string;
  isRunningLint: boolean;
  runPlanLint: () => void;
  expandedItems: Set<string>;
  toggleExpand: (id: string) => void;
}

function PhantomTabContent({
  phantomAudit,
  lintOutput,
  isRunningLint,
  runPlanLint,
  expandedItems,
  toggleExpand,
}: Readonly<PhantomTabContentProps>) {
  return (
    <div className="space-y-6">
      {phantomAudit ? (
        <>
          <div className="grid grid-cols-4 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg text-center">
              <p className="text-3xl font-bold text-gray-700">
                {phantomAudit.summary.total_completed_tasks}
              </p>
              <p className="text-sm text-gray-500">Claimed Complete</p>
            </div>
            <div className="p-4 bg-green-50 rounded-lg text-center">
              <p className="text-3xl font-bold text-green-700">
                {phantomAudit.summary.verified_completions}
              </p>
              <p className="text-sm text-green-600">Verified</p>
            </div>
            <div className="p-4 bg-red-50 rounded-lg text-center">
              <p className="text-3xl font-bold text-red-700">
                {phantomAudit.summary.phantom_completions}
              </p>
              <p className="text-sm text-red-600">Phantom</p>
            </div>
            <div className="p-4 bg-orange-50 rounded-lg text-center">
              <p className="text-3xl font-bold text-orange-700">
                {phantomAudit.summary.integrity_score}
              </p>
              <p className="text-sm text-orange-600">Integrity Score</p>
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-red-600 mb-3 flex items-center gap-2">
              <Icon name="warning" size="lg" />
              Phantom Completions ({phantomAudit.phantom_completions.length})
            </h3>
            <div className="space-y-3">
              {phantomAudit.phantom_completions.map((item) => (
                <div
                  key={item.task_id}
                  className="border border-red-200 rounded-lg overflow-hidden bg-white"
                >
                  <button
                    type="button"
                    className="w-full flex items-center justify-between p-4 cursor-pointer hover:bg-red-50 text-left"
                    onClick={() => toggleExpand(`phantom-${item.task_id}`)}
                  >
                    <div className="flex items-center gap-3">
                      <Icon name="cancel" size="lg" className="text-red-500" />
                      <span className="font-semibold text-red-700">{item.task_id}</span>
                      <span className="text-sm text-gray-500">{item.description}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded">
                        {item.missing_artifacts.length} missing
                      </span>
                      {expandedItems.has(`phantom-${item.task_id}`) ? (
                        <Icon name="expand_less" size="sm" />
                      ) : (
                        <Icon name="expand_more" size="sm" />
                      )}
                    </div>
                  </button>
                  {expandedItems.has(`phantom-${item.task_id}`) && (
                    <div className="border-t border-red-100 p-4 bg-red-50">
                      <div className="mb-3">
                        <p className="text-sm font-semibold text-red-700 mb-2">
                          Missing Artifacts:
                        </p>
                        <ul className="list-disc list-inside text-sm text-red-600 space-y-1">
                          {item.missing_artifacts.map((artifact) => (
                            <li key={artifact} className="font-mono text-xs">
                              {artifact}
                            </li>
                          ))}
                        </ul>
                      </div>
                      {item.partially_exists && item.partially_exists.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-red-200">
                          <p className="text-sm font-semibold text-orange-700 mb-2">
                            Partially Exists:
                          </p>
                          <ul className="list-disc list-inside text-sm text-orange-600 space-y-1">
                            {item.partially_exists.map((artifact) => (
                              <li key={artifact} className="font-mono text-xs">
                                {artifact}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {item.note && (
                        <p className="text-sm text-gray-600 mt-3 italic">Note: {item.note}</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          {phantomAudit.recommendations.length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-700 mb-3">Recommendations</h3>
              <div className="space-y-2">
                {phantomAudit.recommendations.map((rec) => (
                  <div
                    key={`${rec.priority}-${rec.action}`}
                    className={`p-3 rounded-lg border-l-4 ${getRecommendationClass(rec.priority)}`}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={`px-2 py-0.5 text-xs rounded font-medium ${getRecommendationBadgeClass(rec.priority)}`}
                      >
                        {rec.priority}
                      </span>
                      <div>
                        <p className="font-medium text-gray-800">{rec.action}</p>
                        {rec.details && <p className="text-sm text-gray-600 mt-1">{rec.details}</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-8">
          <Icon name="warning" size="2xl" className="mx-auto mb-4 text-gray-400" />
          <p className="text-gray-500 mb-4">No phantom completion audit available.</p>
          <p className="text-sm text-gray-400 mb-4">
            Run the Python linter to generate an audit report.
          </p>
          <button
            onClick={runPlanLint}
            disabled={isRunningLint}
            className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50"
          >
            <Icon name="play_arrow" size="sm" className="inline mr-2" />
            {isRunningLint ? 'Running...' : 'Run Lint'}
          </button>
        </div>
      )}
      {lintOutput && (
        <div className="mt-4">
          <h3 className="font-semibold text-gray-700 mb-2 flex items-center gap-2">
            <Icon name="terminal" size="sm" />
            Linter Output
          </h3>
          <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-xs overflow-auto max-h-64 font-mono">
            {lintOutput}
          </pre>
        </div>
      )}
    </div>
  );
}

interface PlatformHealthTabProps {
  platformHealth: PlatformHealthData | null;
  expandedSections: Set<string>;
  toggleSection: (id: string) => void;
  isRegenerating: boolean;
  regenResult: { success: boolean; message: string } | null;
  setRegenResult: (v: { success: boolean; message: string } | null) => void;
  regenerateMetrics: () => void;
}

interface RegenResultBannerProps {
  regenResult: { success: boolean; message: string } | null;
  onDismiss: () => void;
}

function RegenResultBanner({ regenResult, onDismiss }: Readonly<RegenResultBannerProps>) {
  if (!regenResult) return null;
  const colorClass = regenResult.success
    ? 'bg-green-50 border border-green-200 text-green-800'
    : 'bg-red-50 border border-red-200 text-red-800';
  const iconName = regenResult.success ? 'check_circle' : 'error';
  const iconClass = regenResult.success ? 'text-green-500' : 'text-red-500';
  return (
    <div className={`rounded-lg p-3 flex items-center gap-3 text-sm ${colorClass}`}>
      <Icon name={iconName} size="sm" className={iconClass} />
      {regenResult.message}
      <button
        type="button"
        onClick={onDismiss}
        className="ml-auto text-gray-400 hover:text-gray-600"
      >
        <Icon name="close" size="sm" />
      </button>
    </div>
  );
}

interface StalenessWarningProps {
  provenance: PlatformHealthData['summary']['provenance'];
}

function StalenessWarning({ provenance }: Readonly<StalenessWarningProps>) {
  if (provenance.fresh) return null;
  return (
    <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 flex items-start gap-3">
      <Icon name="warning" size="lg" className="text-amber-500 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="font-semibold text-amber-800">Metrics are stale</p>
        <p className="text-sm text-amber-700">
          Last collected {provenance.daysSinceCollection} days ago (threshold: {provenance.threshold} days).
          {provenance.nextDue && (
            <> Next collection was due: {new Date(provenance.nextDue).toLocaleDateString()}</>
          )}
        </p>
        <p className="text-xs text-amber-600 mt-1">
          Click &quot;Regenerate Metrics&quot; above to auto-collect fresh data from the codebase.
        </p>
      </div>
    </div>
  );
}

interface MaturityLevelCardProps {
  maturity: MaturityLevel;
}

function MaturityLevelCard({ maturity }: Readonly<MaturityLevelCardProps>) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white shadow-lg"
            style={{ backgroundColor: maturity.color }}
          >
            {maturity.score}
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-800">{maturity.name}</h3>
            <p className="text-sm text-gray-500">
              {maturity.criteria.filter((c) => c.passed).length}/{maturity.criteria.length} criteria met across all levels
            </p>
          </div>
        </div>
        {maturity.nextLevel && (
          <div className="text-right min-w-[200px]">
            <p className="text-xs text-gray-500 mb-1">Progress to {maturity.nextLevel}</p>
            <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${maturity.progressToNext}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">{maturity.progressToNext}%</p>
          </div>
        )}
      </div>
      {maturity.nextRequirements.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs font-medium text-gray-500 mb-2">
            Remaining for {maturity.nextLevel}:
          </p>
          <div className="flex flex-wrap gap-2">
            {maturity.nextRequirements.map((req) => (
              <span key={req} className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">
                {req}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface PlatformSummaryCardsProps {
  summary: PlatformHealthData['summary'];
}

function PlatformSummaryCards({ summary }: Readonly<PlatformSummaryCardsProps>) {
  const evidenceAllPassed = summary.evidence.passed === summary.evidence.total;
  const provenanceFresh = summary.provenance.fresh;
  return (
    <>
      <div className="p-4 bg-white rounded-lg border border-gray-200">
        <div className="flex items-center gap-2 mb-2">
          {summary.kpis.allMet ? (
            <Icon name="check_circle" size="lg" className="text-green-500" />
          ) : (
            <Icon name="cancel" size="lg" className="text-red-500" />
          )}
          <p className="text-sm font-medium text-gray-600">KPIs</p>
        </div>
        <p className={`text-2xl font-bold ${summary.kpis.allMet ? 'text-green-700' : 'text-red-700'}`}>
          {summary.kpis.met}/{summary.kpis.total}
        </p>
        <p className="text-xs text-gray-500">met</p>
      </div>
      <div className="p-4 bg-white rounded-lg border border-gray-200">
        <div className="flex items-center gap-2 mb-2">
          {evidenceAllPassed ? (
            <Icon name="check_circle" size="lg" className="text-green-500" />
          ) : (
            <Icon name="warning" size="lg" className="text-yellow-500" />
          )}
          <p className="text-sm font-medium text-gray-600">Evidence</p>
        </div>
        <p className={`text-2xl font-bold ${evidenceAllPassed ? 'text-green-700' : 'text-yellow-700'}`}>
          {summary.evidence.passed}/{summary.evidence.total}
        </p>
        <p className="text-xs text-gray-500">verified</p>
      </div>
      <div className="p-4 bg-white rounded-lg border border-gray-200">
        <div className="flex items-center gap-2 mb-2">
          {provenanceFresh ? (
            <Icon name="check_circle" size="lg" className="text-green-500" />
          ) : (
            <Icon name="warning" size="lg" className="text-yellow-500" />
          )}
          <p className="text-sm font-medium text-gray-600">Provenance</p>
        </div>
        <p className={`text-2xl font-bold ${provenanceFresh ? 'text-green-700' : 'text-yellow-700'}`}>
          {provenanceFresh ? 'Fresh' : 'Stale'}
        </p>
        <p className="text-xs text-gray-500">{summary.provenance.daysSinceCollection}d ago</p>
      </div>
    </>
  );
}

function getPlatformStatusClass(status: string): string {
  if (status === 'passing') return 'bg-green-100 text-green-800';
  if (status === 'degraded') return 'bg-yellow-100 text-yellow-800';
  return 'bg-red-100 text-red-800';
}

function getRecommendationBorderClass(severity: string): string {
  if (severity === 'high') return 'border-l-red-500 bg-red-50';
  if (severity === 'medium') return 'border-l-amber-500 bg-amber-50';
  return 'border-l-blue-500 bg-blue-50';
}

function getPlatformRecommendationBadgeClass(severity: string): string {
  if (severity === 'high') return 'bg-red-100 text-red-700';
  if (severity === 'medium') return 'bg-amber-100 text-amber-700';
  return 'bg-blue-100 text-blue-700';
}

interface PassFailSummaryCardProps {
  label: string;
  passed: boolean;
  value: string;
}

function PassFailSummaryCard({ label, passed, value }: Readonly<PassFailSummaryCardProps>) {
  return (
    <div className="p-4 bg-white rounded-lg border border-gray-200">
      <div className="flex items-center gap-2 mb-2">
        {passed ? (
          <Icon name="check_circle" size="lg" className="text-green-500" />
        ) : (
          <Icon name="cancel" size="lg" className="text-red-500" />
        )}
        <p className="text-sm font-medium text-gray-600">{label}</p>
      </div>
      <p className={`text-2xl font-bold ${passed ? 'text-green-700' : 'text-red-700'}`}>
        {value}
      </p>
    </div>
  );
}

interface CheckListSectionProps {
  sectionId: string;
  label: string;
  badge: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function CheckListSection({
  sectionId: _sectionId,
  label,
  badge,
  expanded,
  onToggle,
  children,
}: Readonly<CheckListSectionProps>) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="font-medium">{label}</span>
          {badge}
        </div>
        {expanded ? <Icon name="expand_less" size="sm" /> : <Icon name="expand_more" size="sm" />}
      </button>
      {expanded && <div className="border-t p-4 space-y-2">{children}</div>}
    </div>
  );
}

interface CheckItemProps {
  name: string;
  detail: string;
  passed: boolean;
}

function CheckItem({ name, detail, passed }: Readonly<CheckItemProps>) {
  return (
    <div className="flex items-start gap-3 p-2 rounded hover:bg-gray-50">
      {passed ? (
        <Icon name="check_circle" size="sm" className="text-green-500 mt-0.5" />
      ) : (
        <Icon name="warning" size="sm" className="text-yellow-500 mt-0.5" />
      )}
      <div>
        <p className="text-sm font-medium text-gray-700">{name}</p>
        <p className="text-xs text-gray-500">{detail}</p>
      </div>
    </div>
  );
}

interface ConsistencyCheckItemProps {
  name: string;
  detail: string;
  passed: boolean;
}

function ConsistencyCheckItem({ name, detail, passed }: Readonly<ConsistencyCheckItemProps>) {
  return (
    <div className="flex items-start gap-3 p-2 rounded hover:bg-gray-50">
      {passed ? (
        <Icon name="check_circle" size="sm" className="text-green-500 mt-0.5" />
      ) : (
        <Icon name="cancel" size="sm" className="text-red-500 mt-0.5" />
      )}
      <div>
        <p className="text-sm font-medium text-gray-700">{name}</p>
        <p className="text-xs text-gray-500">{detail}</p>
      </div>
    </div>
  );
}

function PlatformHealthTab({
  platformHealth,
  expandedSections,
  toggleSection,
  isRegenerating,
  regenResult,
  setRegenResult,
  regenerateMetrics,
}: Readonly<PlatformHealthTabProps>) {
  return (
    <div className="space-y-6">
      {platformHealth ? (
        <>
          {/* Header: Status + Regenerate Button */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${getPlatformStatusClass(platformHealth.status)}`}
              >
                {platformHealth.status.toUpperCase()}
              </span>
              <span className="text-sm text-gray-500">
                Task: {platformHealth.metrics.taskId} | Sprint {platformHealth.metrics.sprint}
              </span>
            </div>
            <button
              type="button"
              onClick={regenerateMetrics}
              disabled={isRegenerating}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
            >
              <Icon name="refresh" size="sm" className={isRegenerating ? 'animate-spin' : ''} />
              {isRegenerating ? 'Regenerating...' : 'Regenerate Metrics'}
            </button>
          </div>

          {/* Regeneration Result Banner */}
          <RegenResultBanner regenResult={regenResult} onDismiss={() => setRegenResult(null)} />

          {/* Staleness Warning Banner */}
          <StalenessWarning provenance={platformHealth.summary.provenance} />

          {/* Maturity Level Card */}
          {platformHealth.maturity && (
            <MaturityLevelCard maturity={platformHealth.maturity} />
          )}

          {/* Top Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <PassFailSummaryCard
              label="Schema"
              passed={platformHealth.summary.schema === 'PASS'}
              value={platformHealth.summary.schema}
            />

            <PlatformSummaryCards summary={platformHealth.summary} />
          </div>

          {/* Recommendations */}
          {platformHealth.recommendations && platformHealth.recommendations.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <Icon name="lightbulb" size="lg" />
                Recommendations ({platformHealth.recommendations.length})
              </h3>
              <div className="space-y-3">
                {platformHealth.recommendations.map((rec) => (
                  <div
                    key={rec.title}
                    className={`p-4 rounded-lg border-l-4 ${getRecommendationBorderClass(rec.severity)}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-gray-800">{rec.title}</p>
                          <span
                            className={`px-2 py-0.5 text-xs rounded-full font-medium ${getPlatformRecommendationBadgeClass(rec.severity)}`}
                          >
                            {rec.severity}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">{rec.description}</p>
                      </div>
                      <span className="text-xs text-gray-400 whitespace-nowrap">
                        {rec.estimatedTime}
                      </span>
                    </div>
                    {rec.action === 'regenerate' && (
                      <button
                        type="button"
                        onClick={regenerateMetrics}
                        disabled={isRegenerating}
                        className="mt-2 text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        {isRegenerating ? 'Regenerating...' : 'Regenerate Now'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Codebase Health */}
          {platformHealth.codebaseHealth && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <Icon name="code" size="lg" />
                Codebase Health
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-bold text-gray-800">
                    {platformHealth.codebaseHealth.typescript_files.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500">TypeScript Files</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-bold text-gray-800">
                    {platformHealth.codebaseHealth.test_files.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500">Test Files</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-bold text-gray-800">
                    {platformHealth.codebaseHealth.test_ratio}%
                  </p>
                  <p className="text-xs text-gray-500">Test Ratio</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-bold text-gray-800">
                    {platformHealth.codebaseHealth.test_coverage_pct === null
                      ? 'N/A'
                      : `${platformHealth.codebaseHealth.test_coverage_pct}%`}
                  </p>
                  <p className="text-xs text-gray-500">Coverage</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-bold text-gray-800">
                    {platformHealth.codebaseHealth.workspace_packages}
                  </p>
                  <p className="text-xs text-gray-500">Packages</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-bold text-gray-800">
                    {platformHealth.codebaseHealth.ci_workflows}
                  </p>
                  <p className="text-xs text-gray-500">CI Workflows</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-bold text-gray-800">
                    {platformHealth.codebaseHealth.database_migrations}
                  </p>
                  <p className="text-xs text-gray-500">DB Migrations</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-bold text-gray-800">
                    {platformHealth.codebaseHealth.git_velocity.commits_30d}
                  </p>
                  <p className="text-xs text-gray-500">Commits (30d)</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500 border-t pt-3">
                <span>
                  Tracked files:{' '}
                  <strong>
                    {platformHealth.codebaseHealth.total_tracked_files.toLocaleString()}
                  </strong>
                </span>
                <span>
                  Root scripts: <strong>{platformHealth.codebaseHealth.root_scripts}</strong>
                </span>
                <span>
                  Env docs:{' '}
                  <strong>
                    {platformHealth.codebaseHealth.env_files_documented}/
                    {platformHealth.codebaseHealth.env_files_expected}
                  </strong>
                </span>
                <span>
                  Branches: <strong>{platformHealth.codebaseHealth.git_velocity.branches}</strong>
                </span>
                <span>
                  Golden paths:{' '}
                  <strong>
                    {platformHealth.codebaseHealth.golden_paths_verified}/
                    {platformHealth.codebaseHealth.golden_paths_total}
                  </strong>{' '}
                  verified
                </span>
              </div>
            </div>
          )}

          {/* Golden Paths Table */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <Icon name="route" size="lg" />
              Golden Paths ({platformHealth.goldenPaths.length})
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left p-3 font-medium text-gray-600">Name</th>
                    <th className="text-left p-3 font-medium text-gray-600">Entrypoint</th>
                    <th className="text-center p-3 font-medium text-gray-600">Doc Exists</th>
                    <th className="text-center p-3 font-medium text-gray-600">Content Verified</th>
                  </tr>
                </thead>
                <tbody>
                  {platformHealth.goldenPaths.map((gp) => (
                    <tr key={gp.name} className="border-b hover:bg-gray-50">
                      <td className="p-3 font-medium">{gp.name}</td>
                      <td className="p-3">
                        <code className="bg-gray-100 px-2 py-0.5 rounded text-xs">
                          {gp.entrypoint}
                        </code>
                      </td>
                      <td className="p-3 text-center">
                        {gp.docExists ? (
                          <Icon name="check_circle" size="sm" className="text-green-500 inline" />
                        ) : (
                          <Icon name="cancel" size="sm" className="text-red-500 inline" />
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {gp.contentVerified ? (
                          <Icon name="check_circle" size="sm" className="text-green-500 inline" />
                        ) : (
                          <Icon name="cancel" size="sm" className="text-red-500 inline" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* KPIs Table */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <Icon name="speed" size="lg" />
              KPI Results ({platformHealth.kpis.length})
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left p-3 font-medium text-gray-600">KPI</th>
                    <th className="text-left p-3 font-medium text-gray-600">Target</th>
                    <th className="text-left p-3 font-medium text-gray-600">Actual</th>
                    <th className="text-center p-3 font-medium text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {platformHealth.kpis.map((kpi) => (
                    <tr key={kpi.name} className="border-b hover:bg-gray-50">
                      <td className="p-3 font-medium capitalize">{kpi.name}</td>
                      <td className="p-3 text-gray-600">{kpi.target}</td>
                      <td className="p-3 text-gray-600">{kpi.actual}</td>
                      <td className="p-3 text-center">
                        <span
                          className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                            kpi.met ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {kpi.met ? 'MET' : 'NOT MET'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Validation Details - Collapsible Sections */}
          <div className="space-y-3">
            <h3 className="font-semibold text-gray-700 flex items-center gap-2">
              <Icon name="fact_check" size="lg" />
              Validation Details
            </h3>

            {/* Evidence Checks */}
            <CheckListSection
              sectionId="evidence"
              label="Evidence Checks"
              badge={
                <span
                  className={`px-2 py-0.5 text-xs rounded-full ${
                    platformHealth.summary.evidence.passed === platformHealth.summary.evidence.total
                      ? 'bg-green-100 text-green-700'
                      : 'bg-yellow-100 text-yellow-700'
                  }`}
                >
                  {platformHealth.summary.evidence.passed}/{platformHealth.summary.evidence.total} passed
                </span>
              }
              expanded={expandedSections.has('evidence')}
              onToggle={() => toggleSection('evidence')}
            >
              {platformHealth.evidenceChecks.map((check) => (
                <CheckItem key={check.name} name={check.name} detail={check.detail} passed={check.passed} />
              ))}
            </CheckListSection>

            {/* Provenance Checks */}
            <CheckListSection
              sectionId="provenance"
              label="Provenance Checks"
              badge={
                <span
                  className={`px-2 py-0.5 text-xs rounded-full ${
                    platformHealth.provenanceChecks.every((c) => c.passed)
                      ? 'bg-green-100 text-green-700'
                      : 'bg-yellow-100 text-yellow-700'
                  }`}
                >
                  {platformHealth.provenanceChecks.filter((c) => c.passed).length}/
                  {platformHealth.provenanceChecks.length} passed
                </span>
              }
              expanded={expandedSections.has('provenance')}
              onToggle={() => toggleSection('provenance')}
            >
              {platformHealth.provenanceChecks.map((check) => (
                <CheckItem key={check.name} name={check.name} detail={check.detail} passed={check.passed} />
              ))}
            </CheckListSection>

            {/* Consistency Checks */}
            <CheckListSection
              sectionId="consistency"
              label="Consistency Checks"
              badge={
                <span
                  className={`px-2 py-0.5 text-xs rounded-full ${
                    platformHealth.summary.consistency.passed === platformHealth.summary.consistency.total
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                  }`}
                >
                  {platformHealth.summary.consistency.passed}/
                  {platformHealth.summary.consistency.total} passed
                </span>
              }
              expanded={expandedSections.has('consistency')}
              onToggle={() => toggleSection('consistency')}
            >
              {platformHealth.consistencyChecks.map((check) => (
                <ConsistencyCheckItem key={check.name} name={check.name} detail={check.detail} passed={check.passed} />
              ))}
            </CheckListSection>
          </div>

          {/* Quick Stats Footer */}
          <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              <span>
                IDP: <strong>{platformHealth.metrics.idpStatus}</strong>
              </span>
              <span>
                Deploy Success: <strong>{platformHealth.metrics.deploySuccessRate}%</strong>
              </span>
              <span>
                Total Deploys: <strong>{platformHealth.metrics.totalDeploys}</strong>
              </span>
              <span>
                Cache Hit Rate: <strong>{platformHealth.metrics.cacheHitRate}%</strong>
              </span>
              <span>
                CI Pass Rate: <strong>{platformHealth.metrics.ciPassRate}%</strong>
              </span>
              <span className="text-gray-400">
                Last generated: {new Date(platformHealth.metrics.generatedAt).toLocaleString()}
              </span>
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-8">
          <Icon name="developer_board" size="2xl" className="mx-auto mb-4 text-gray-400" />
          <p className="text-gray-500 mb-2">No platform health data available.</p>
          <p className="text-sm text-gray-400 mb-4">
            Ensure{' '}
            <code className="bg-gray-100 px-1 rounded">
              artifacts/metrics/self-service-metrics.json
            </code>{' '}
            exists.
          </p>
          <button
            type="button"
            onClick={regenerateMetrics}
            disabled={isRegenerating}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
          >
            {isRegenerating ? 'Generating...' : 'Generate Metrics'}
          </button>
        </div>
      )}
    </div>
  );
}

function sprintLabel(selectedSprint: number | 'all' | 'Continuous'): string {
  if (selectedSprint === 'all') return 'All Sprints';
  if (selectedSprint === 'Continuous') return 'Continuous Tasks';
  return `Sprint ${selectedSprint}`;
}

function toggleSetItem<T>(set: Set<T>, item: T): Set<T> {
  const next = new Set(set);
  if (next.has(item)) {
    next.delete(item);
  } else {
    next.add(item);
  }
  return next;
}

interface GovernanceViewProps {
  selectedSprint: number | 'all' | 'Continuous';
}

export default function GovernanceView({ selectedSprint }: Readonly<GovernanceViewProps>) {
  const [summary, setSummary] = useState<GovernanceSummary | null>(null);
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueItem[]>([]);
  const [debtItems, setDebtItems] = useState<DebtItem[]>([]);
  const [lintErrors, setLintErrors] = useState<LintError[]>([]);
  const [lintWarnings, setLintWarnings] = useState<LintError[]>([]);
  const [phantomAudit, setPhantomAudit] = useState<PhantomAudit | null>(null);
  const [tierTasks, setTierTasks] = useState<TierTasks | null>(null);
  const [expandedTiers, setExpandedTiers] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isRunningLint, setIsRunningLint] = useState(false);
  const [lintOutput, setLintOutput] = useState<string>('');
  const [activeTab, setActiveTab] = useState<
    'overview' | 'queue' | 'debt' | 'errors' | 'phantom' | 'platform'
  >('overview');
  const [platformHealth, setPlatformHealth] = useState<PlatformHealthData | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenResult, setRegenResult] = useState<{ success: boolean; message: string } | null>(
    null
  );
  const [filesExist, setFilesExist] = useState({
    planOverrides: false,
    reviewQueue: false,
    lintReport: false,
    debtLedger: false,
  });

  // Helper to fetch JSON from API with cache busting
  const fetchJson = async (url: string) => {
    const timestamp = Date.now();
    const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${timestamp}`, {
      cache: 'no-store',
    });
    return res.ok ? res.json() : null;
  };

  // Convert selectedSprint to query parameter
  const getSprintParam = () => {
    if (selectedSprint === 'all') return 'all';
    if (selectedSprint === 'Continuous') return 'continuous';
    return String(selectedSprint);
  };

  const applyGovernanceData = (
    summaryData: any,
    queueData: any,
    debtData: any,
    lintData: any,
    phantomData: any,
    platformData: any
  ) => {
    if (summaryData) {
      setSummary(summaryData.data);
      setFilesExist(summaryData.filesExist);
      if (summaryData.tierTasks) setTierTasks(summaryData.tierTasks);
    }
    if (queueData) setReviewQueue(queueData.items || []);
    if (debtData) setDebtItems(debtData.items || []);
    if (lintData) {
      setLintErrors(lintData.data?.errors || []);
      setLintWarnings(lintData.data?.warnings || []);
    }
    if (phantomData?.audit) setPhantomAudit(phantomData.audit);
    if (platformData?.status) setPlatformHealth(platformData);
  };

  const loadGovernanceData = async () => {
    setIsLoading(true);
    const sprintParam = getSprintParam();
    try {
      const [summaryData, queueData, debtData, lintData, phantomData, platformData] =
        await Promise.all([
          fetchJson(`/api/governance/summary?sprint=${sprintParam}`),
          fetchJson(`/api/governance/review-queue?sprint=${sprintParam}`),
          fetchJson(`/api/governance/debt?sprint=${sprintParam}`),
          fetchJson(`/api/governance/lint-report?sprint=${sprintParam}`),
          fetchJson(`/api/governance/phantom-audit?sprint=${sprintParam}`),
          fetchJson('/api/governance/platform-health'),
        ]);
      applyGovernanceData(summaryData, queueData, debtData, lintData, phantomData, platformData);
    } catch (error) {
      console.error('Error loading governance data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const runPlanLint = async () => {
    setIsRunningLint(true);
    setLintOutput('Running Python plan-linter...\n');
    const sprintParam = getSprintParam();
    try {
      const response = await fetch(`/api/governance/run-lint?sprint=${sprintParam}&verbose=true`, {
        method: 'POST',
        cache: 'no-store',
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Plan lint result:', result);
        setLintOutput(result.stdout || 'No output');

        // Update phantom audit if available
        if (result.phantomCompletions?.audit) {
          setPhantomAudit(result.phantomCompletions.audit);
        }

        // Reload data after lint
        await loadGovernanceData();
      }
    } catch (error) {
      console.error('Error running plan lint:', error);
      setLintOutput('Error running linter: ' + String(error));
    } finally {
      setIsRunningLint(false);
    }
  };

  const regenerateMetrics = async () => {
    setIsRegenerating(true);
    setRegenResult(null);
    try {
      const res = await fetch('/api/governance/platform-health/regenerate', {
        method: 'POST',
        cache: 'no-store',
      });
      if (res.ok) {
        const result = await res.json();
        setRegenResult({
          success: true,
          message: `Metrics regenerated: ${result.collected.tsFiles} TS files, ${result.collected.testFiles} tests, ${result.collected.commits30d} commits (30d)`,
        });
        // Reload platform health data
        const platformData = await fetchJson('/api/governance/platform-health');
        if (platformData?.status) setPlatformHealth(platformData);
      } else {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        setRegenResult({ success: false, message: err.error || 'Failed to regenerate' });
      }
    } catch (error) {
      setRegenResult({ success: false, message: String(error) });
    } finally {
      setIsRegenerating(false);
    }
  };

  useEffect(() => {
    loadGovernanceData();
  }, [selectedSprint]);

  const toggleExpand = (id: string) => {
    setExpandedItems((prev) => toggleSetItem(prev, id));
  };

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => toggleSetItem(prev, id));
  };

  const toggleTier = (tier: string) => {
    setExpandedTiers((prev) => toggleSetItem(prev, tier));
  };

  if (isLoading && !summary) {
    return (
      <div className="flex items-center justify-center h-64">
        <Icon name="refresh" size="2xl" className="animate-spin text-blue-500" />
      </div>
    );
  }

  if (!filesExist.planOverrides) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
        <Icon name="warning" size="2xl" className="text-yellow-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-yellow-800 mb-2">Governance Not Initialized</h2>
        <p className="text-yellow-700 mb-4">The plan governance system has not been set up yet.</p>
        <p className="text-sm text-yellow-600 mb-4">
          Run <code className="bg-yellow-100 px-2 py-1 rounded">pnpm run plan-lint</code> from the
          project root to initialize.
        </p>
        <button
          onClick={runPlanLint}
          disabled={isRunningLint}
          className="flex items-center gap-2 px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50 mx-auto"
        >
          <Icon name="play_arrow" size="sm" className={isRunningLint ? 'animate-pulse' : ''} />
          {isRunningLint ? 'Running...' : 'Initialize Governance'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Icon name="shield" size="2xl" className="text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold">Plan Governance</h1>
            <p className="text-gray-600">{sprintLabel(selectedSprint)} validation and compliance</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={runPlanLint}
            disabled={isRunningLint}
            className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50"
          >
            <Icon name="play_arrow" size="sm" className={isRunningLint ? 'animate-pulse' : ''} />
            {isRunningLint ? 'Running...' : 'Run Lint'}
          </button>
          <button
            onClick={loadGovernanceData}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
          >
            <Icon name="refresh" size="sm" className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {summary?.lastLintRun && (
        <p className="text-sm text-gray-500">
          Last lint run: {new Date(summary.lastLintRun).toLocaleString()}
        </p>
      )}

      {/* Overall Progress - Matching Metrics Page */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Overall Progress</h2>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <div className="col-span-2 p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-600 font-medium">Completion</p>
            <p className="text-3xl font-bold text-blue-700">
              {summary?.taskSummary?.done || 0} / {summary?.taskSummary?.total || 0} tasks
            </p>
            <p className="text-lg text-blue-600">
              (
              {summary?.taskSummary?.total
                ? Math.round((summary.taskSummary.done / summary.taskSummary.total) * 100 * 10) / 10
                : 0}
              %)
            </p>
          </div>
          <div className="p-4 bg-green-50 rounded-lg border border-green-200 text-center">
            <p className="text-2xl font-bold text-green-700">{summary?.taskSummary?.done || 0}</p>
            <p className="text-xs text-green-600">Done</p>
          </div>
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 text-center">
            <p className="text-2xl font-bold text-blue-700">
              {summary?.taskSummary?.in_progress || 0}
            </p>
            <p className="text-xs text-blue-600">In Progress</p>
          </div>
          <div className="p-4 bg-red-50 rounded-lg border border-red-200 text-center">
            <p className="text-2xl font-bold text-red-700">{summary?.taskSummary?.blocked || 0}</p>
            <p className="text-xs text-red-600">Blocked</p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 text-center">
            <p className="text-2xl font-bold text-gray-700">
              {summary?.taskSummary?.not_started || 0}
            </p>
            <p className="text-xs text-gray-600">Not Started</p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Icon name="description" size="xl" className="text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{summary?.validationCoverage || 0}%</p>
              <p className="text-sm text-gray-600">Validation Coverage</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Icon name="schedule" size="xl" className="text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{summary?.reviewQueueSize || 0}</p>
              <p className="text-sm text-gray-600">Review Queue</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <Icon name="error" size="xl" className="text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{summary?.errorCount || 0}</p>
              <p className="text-sm text-gray-600">Lint Errors</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <Icon name="warning" size="xl" className="text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{summary?.debtItems || 0}</p>
              <p className="text-sm text-gray-600">Tech Debt Items</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tier Breakdown with Completion - Expandable */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Task Tier Distribution & Completion</h2>

        {/* Actionable Summary */}
        {tierTasks && <ActionableSummary tierTasks={tierTasks} />}

        <p className="text-sm text-gray-500 mb-4">Click a tier to see task details</p>
        <div className="space-y-4">
          <TierCard
            tier="A"
            label="Tier A (Critical)"
            sublabel="Requires full evidence pack"
            count={summary?.tierBreakdown?.A || 0}
            completion={summary?.tierCompletion?.A || { done: 0, total: 0 }}
            tasks={tierTasks?.A || []}
            isExpanded={expandedTiers.has('A')}
            onToggle={() => toggleTier('A')}
            getTaskCardClass={getTaskCardClass}
            getTaskStatusIcon={getTaskStatusIcon}
          />
          <TierCard
            tier="B"
            label="Tier B (Important)"
            sublabel="Recommended gates"
            count={summary?.tierBreakdown?.B || 0}
            completion={summary?.tierCompletion?.B || { done: 0, total: 0 }}
            tasks={tierTasks?.B || []}
            isExpanded={expandedTiers.has('B')}
            onToggle={() => toggleTier('B')}
            getTaskCardClass={getTaskCardClass}
            getTaskStatusIcon={getTaskStatusIcon}
          />
          <TierCard
            tier="C"
            label="Tier C (Standard)"
            sublabel="Default validation"
            count={summary?.tierBreakdown?.C || 0}
            completion={summary?.tierCompletion?.C || { done: 0, total: 0 }}
            tasks={tierTasks?.C || []}
            isExpanded={expandedTiers.has('C')}
            onToggle={() => toggleTier('C')}
            getTaskCardClass={getTaskCardClass}
            getTaskStatusIcon={getTaskStatusIcon}
          />
        </div>
      </div>

      {/* Data Integrity Alert */}
      {phantomAudit && phantomAudit.summary.phantom_completions > 0 && (
        <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Icon name="warning" size="2xl" className="text-red-500 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="font-bold text-red-800 text-lg">
                Data Integrity Alert: Phantom Completions Detected
              </h3>
              <p className="text-red-700 mt-1">
                <strong>{phantomAudit.summary.phantom_completions}</strong> of{' '}
                {phantomAudit.summary.total_completed_tasks} "completed" tasks are missing required
                artifacts. Integrity Score: <strong>{phantomAudit.summary.integrity_score}</strong>
              </p>
              <p className="text-sm text-red-600 mt-2">{phantomAudit.summary.conclusion}</p>
              <button
                onClick={() => setActiveTab('phantom')}
                className="mt-3 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
              >
                View Phantom Completions ({phantomAudit.summary.phantom_completions})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b">
          <nav className="flex flex-wrap">
            {[
              { id: 'overview', label: 'Overview', count: null, icon: null },
              { id: 'queue', label: 'Review Queue', count: reviewQueue.length, icon: null },
              { id: 'debt', label: 'Tech Debt', count: debtItems.length, icon: null },
              {
                id: 'errors',
                label: 'Lint Issues',
                count: lintErrors.length + lintWarnings.length,
                icon: null,
              },
              {
                id: 'phantom',
                label: 'Phantom Completions',
                count: phantomAudit?.summary.phantom_completions || 0,
                iconName: 'warning',
                critical: true,
              },
              {
                id: 'platform',
                label: 'Platform Health',
                count: null,
                iconName: 'developer_board',
                critical: false,
              },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-3 text-sm font-medium border-b-2 flex items-center gap-1 ${getTabClass(activeTab, tab.id, !!tab.critical, (tab.count || 0) > 0)}`}
              >
                {tab.iconName && <Icon name={tab.iconName} size="sm" />}
                {tab.label}
                {tab.count !== null && (
                  <span
                    className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
                      tab.critical && tab.count > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h3 className="font-semibold mb-2">File Status</h3>
                  <ul className="space-y-2 text-sm">
                    {Object.entries(filesExist).map(([file, exists]) => (
                      <li key={file} className="flex items-center gap-2">
                        {exists ? (
                          <Icon name="check_circle" size="sm" className="text-green-500" />
                        ) : (
                          <Icon name="error" size="sm" className="text-red-500" />
                        )}
                        <span className={exists ? 'text-green-700' : 'text-red-700'}>
                          {file.replaceAll(/([A-Z])/g, ' $1').trim()}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="p-4 bg-gray-50 rounded-lg">
                  <h3 className="font-semibold mb-2">Expiring Waivers</h3>
                  {summary?.expiringWaivers ? (
                    <p className="text-orange-600 flex items-center gap-2">
                      <Icon name="warning" size="sm" />
                      {summary.expiringWaivers} waiver(s) expire within 30 days
                    </p>
                  ) : (
                    <p className="text-green-600 flex items-center gap-2">
                      <Icon name="check_circle" size="sm" />
                      No waivers expiring soon
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Review Queue Tab */}
          {activeTab === 'queue' && (
            <div className="space-y-3">
              {reviewQueue.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No items in review queue</p>
              ) : (
                reviewQueue.map((item) => (
                  <div key={item.task_id} className="border rounded-lg overflow-hidden">
                    <button
                      type="button"
                      className="w-full flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 text-left"
                      onClick={() => toggleExpand(item.task_id)}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`px-2 py-1 text-xs font-bold rounded ${getTierColor(item.tier)}`}
                        >
                          {item.tier}
                        </span>
                        <span
                          className={`px-2 py-1 text-xs rounded ${getPriorityColor(item.priority)}`}
                        >
                          {item.priority}
                        </span>
                        <span className="font-semibold">{item.task_id}</span>
                        <span className="text-gray-500 text-sm">{item.section}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">{item.owner}</span>
                        {expandedItems.has(item.task_id) ? (
                          <Icon name="expand_less" size="sm" />
                        ) : (
                          <Icon name="expand_more" size="sm" />
                        )}
                      </div>
                    </button>

                    {expandedItems.has(item.task_id) && (
                      <div className="border-t p-4 bg-gray-50">
                        <div className="mb-3">
                          <p className="text-sm font-semibold mb-1">Reasons for review:</p>
                          <ul className="list-disc list-inside text-sm text-gray-600">
                            {item.reasons.map((reason) => (
                              <li key={reason}>{reason}</li>
                            ))}
                          </ul>
                        </div>

                        {item.dependent_count && item.dependent_count > 0 && (
                          <p className="text-sm text-gray-600">
                            <strong>Dependents:</strong> {item.dependent_count} task(s) depend on
                            this
                          </p>
                        )}

                        {item.waiver_expiry && (
                          <p
                            className={`text-sm mt-2 ${
                              getDaysUntilExpiry(item.waiver_expiry) <= 30
                                ? 'text-orange-600'
                                : 'text-gray-600'
                            }`}
                          >
                            <strong>Waiver expires:</strong>{' '}
                            {new Date(item.waiver_expiry).toLocaleDateString()} (
                            {getDaysUntilExpiry(item.waiver_expiry)} days)
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* Tech Debt Tab */}
          {activeTab === 'debt' && (
            <div className="space-y-3">
              {debtItems.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No technical debt items</p>
              ) : (
                debtItems.map((item) => {
                  const daysUntil = getDaysUntilExpiry(item.expiry_date);
                  return (
                    <div
                      key={item.id}
                      className={`p-4 rounded-lg border-l-4 ${getSeverityColor(item.severity)} ${
                        daysUntil <= 30 ? 'border-l-orange-500' : 'border-l-gray-300'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold">{item.id}</span>
                            <span className="text-sm text-gray-500">→ {item.origin_task}</span>
                          </div>
                          <p className="text-sm mb-2">{item.description}</p>
                          <p className="text-xs text-gray-500">Owner: {item.owner}</p>
                        </div>
                        <div className="text-right">
                          <span
                            className={`px-2 py-1 text-xs rounded ${getExpiryBadgeClass(daysUntil)}`}
                          >
                            {daysUntil <= 0 ? 'EXPIRED' : `${daysUntil}d left`}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Lint Issues Tab */}
          {activeTab === 'errors' && (
            <div className="space-y-4">
              {lintErrors.length > 0 && (
                <div>
                  <h3 className="font-semibold text-red-600 mb-2 flex items-center gap-2">
                    <Icon name="error" size="sm" />
                    Errors ({lintErrors.length})
                  </h3>
                  <div className="space-y-2">
                    {lintErrors.slice(0, 20).map((error) => (
                      <div
                        key={`${error.rule}-${error.message}`}
                        className="p-3 bg-red-50 border border-red-200 rounded text-sm"
                      >
                        <p className="font-mono text-xs text-red-500 mb-1">[{error.rule}]</p>
                        <p className="text-red-700">{error.message}</p>
                      </div>
                    ))}
                    {lintErrors.length > 20 && (
                      <p className="text-sm text-gray-500">
                        ...and {lintErrors.length - 20} more errors
                      </p>
                    )}
                  </div>
                </div>
              )}

              {lintWarnings.length > 0 && (
                <div>
                  <h3 className="font-semibold text-yellow-600 mb-2 flex items-center gap-2">
                    <Icon name="warning" size="sm" />
                    Warnings ({lintWarnings.length})
                  </h3>
                  <div className="space-y-2">
                    {lintWarnings.slice(0, 10).map((warning) => (
                      <div
                        key={`${warning.rule}-${warning.message}`}
                        className="p-3 bg-yellow-50 border border-yellow-200 rounded text-sm"
                      >
                        <p className="font-mono text-xs text-yellow-600 mb-1">[{warning.rule}]</p>
                        <p className="text-yellow-700">{warning.message}</p>
                      </div>
                    ))}
                    {lintWarnings.length > 10 && (
                      <p className="text-sm text-gray-500">
                        ...and {lintWarnings.length - 10} more warnings
                      </p>
                    )}
                  </div>
                </div>
              )}

              {lintErrors.length === 0 && lintWarnings.length === 0 && (
                <div className="text-center py-8 text-green-600">
                  <Icon name="check_circle" size="2xl" className="mx-auto mb-2" />
                  <p>No lint issues found</p>
                </div>
              )}
            </div>
          )}

          {/* Phantom Completions Tab */}
          {activeTab === 'phantom' && (
            <PhantomTabContent
              phantomAudit={phantomAudit}
              lintOutput={lintOutput}
              isRunningLint={isRunningLint}
              runPlanLint={runPlanLint}
              expandedItems={expandedItems}
              toggleExpand={toggleExpand}
            />
          )}

          {/* Platform Health Tab */}
          {activeTab === 'platform' && (
            <PlatformHealthTab
              platformHealth={platformHealth}
              expandedSections={expandedSections}
              toggleSection={toggleSection}
              isRegenerating={isRegenerating}
              regenResult={regenResult}
              setRegenResult={setRegenResult}
              regenerateMetrics={regenerateMetrics}
            />
          )}
        </div>
      </div>
    </div>
  );
}
