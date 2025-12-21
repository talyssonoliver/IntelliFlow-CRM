'use client';

import { useState, useEffect } from 'react';
import {
  RefreshCw,
  Shield,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  AlertCircle,
  Play,
  ChevronDown,
  ChevronUp,
  Ghost,
  XCircle,
  Terminal,
} from 'lucide-react';

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

function ActionableSummary({ tierTasks }: ActionableSummaryProps) {
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
            <AlertTriangle className="w-5 h-5" />
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
}: TierCardProps) {
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
          {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
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

interface GovernanceViewProps {
  selectedSprint: number | 'all' | 'Continuous';
}

export default function GovernanceView({ selectedSprint }: GovernanceViewProps) {
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
  const [activeTab, setActiveTab] = useState<'overview' | 'queue' | 'debt' | 'errors' | 'phantom'>(
    'overview'
  );
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
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

  const loadGovernanceData = async () => {
    setIsLoading(true);
    const sprintParam = getSprintParam();
    try {
      const [summaryData, queueData, debtData, lintData, phantomData] = await Promise.all([
        fetchJson(`/api/governance/summary?sprint=${sprintParam}`),
        fetchJson(`/api/governance/review-queue?sprint=${sprintParam}`),
        fetchJson(`/api/governance/debt?sprint=${sprintParam}`),
        fetchJson(`/api/governance/lint-report?sprint=${sprintParam}`),
        fetchJson(`/api/governance/phantom-audit?sprint=${sprintParam}`),
      ]);

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

  useEffect(() => {
    loadGovernanceData();
  }, [selectedSprint]);

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedItems(newExpanded);
  };

  const toggleTier = (tier: string) => {
    const newExpanded = new Set(expandedTiers);
    if (newExpanded.has(tier)) {
      newExpanded.delete(tier);
    } else {
      newExpanded.add(tier);
    }
    setExpandedTiers(newExpanded);
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'A':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'B':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'C':
        return 'bg-green-100 text-green-800 border-green-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'bg-red-500 text-white';
      case 'high':
        return 'bg-orange-500 text-white';
      case 'medium':
        return 'bg-yellow-500 text-black';
      case 'low':
        return 'bg-blue-500 text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'text-red-600 bg-red-50';
      case 'high':
        return 'text-orange-600 bg-orange-50';
      case 'medium':
        return 'text-yellow-600 bg-yellow-50';
      case 'low':
        return 'text-blue-600 bg-blue-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const getDaysUntilExpiry = (expiryDate: string) => {
    const now = new Date();
    const expiry = new Date(expiryDate);
    return Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };

  // Helper to get task status icon
  const getTaskStatusIcon = (status: string, hasLintErrors: boolean) => {
    if (status === 'done') {
      return <CheckCircle2 className="w-4 h-4 text-green-600" />;
    }
    if (hasLintErrors) {
      return <XCircle className="w-4 h-4 text-red-600" />;
    }
    return <Clock className="w-4 h-4 text-gray-400" />;
  };

  // Helper to get task card background class
  const getTaskCardClass = (status: string, hasLintErrors: boolean) => {
    if (status === 'done') {
      return 'bg-green-50 border-green-200';
    }
    if (hasLintErrors) {
      return 'bg-red-50 border-red-300';
    }
    return 'bg-gray-50 border-gray-200';
  };

  // Helper to get tab styling class
  const getTabClass = (tabId: string, isCritical: boolean, hasItems: boolean) => {
    if (activeTab === tabId) {
      return isCritical ? 'border-red-500 text-red-600' : 'border-blue-500 text-blue-600';
    }
    if (isCritical && hasItems) {
      return 'border-transparent text-red-500 hover:text-red-700';
    }
    return 'border-transparent text-gray-500 hover:text-gray-700';
  };

  // Helper to get expiry badge class
  const getExpiryBadgeClass = (daysUntil: number) => {
    if (daysUntil <= 0) {
      return 'bg-red-500 text-white';
    }
    if (daysUntil <= 30) {
      return 'bg-orange-500 text-white';
    }
    return 'bg-gray-200';
  };

  // Helper to get recommendation styling class
  const getRecommendationClass = (priority: string) => {
    if (priority === 'CRITICAL') {
      return 'bg-red-50 border-red-500';
    }
    if (priority === 'HIGH') {
      return 'bg-orange-50 border-orange-500';
    }
    return 'bg-yellow-50 border-yellow-500';
  };

  // Helper to get recommendation badge class
  const getRecommendationBadgeClass = (priority: string) => {
    if (priority === 'CRITICAL') {
      return 'bg-red-100 text-red-700';
    }
    if (priority === 'HIGH') {
      return 'bg-orange-100 text-orange-700';
    }
    return 'bg-yellow-100 text-yellow-700';
  };

  if (isLoading && !summary) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!filesExist.planOverrides) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
        <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
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
          <Play className={`w-4 h-4 ${isRunningLint ? 'animate-pulse' : ''}`} />
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
          <Shield className="w-8 h-8 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold">Plan Governance</h1>
            <p className="text-gray-600">
              {selectedSprint === 'all'
                ? 'All Sprints'
                : selectedSprint === 'Continuous'
                  ? 'Continuous Tasks'
                  : `Sprint ${selectedSprint}`}{' '}
              validation and compliance
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={runPlanLint}
            disabled={isRunningLint}
            className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50"
          >
            <Play className={`w-4 h-4 ${isRunningLint ? 'animate-pulse' : ''}`} />
            {isRunningLint ? 'Running...' : 'Run Lint'}
          </button>
          <button
            onClick={loadGovernanceData}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
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
              <FileText className="w-6 h-6 text-blue-600" />
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
              <Clock className="w-6 h-6 text-orange-600" />
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
              <AlertCircle className="w-6 h-6 text-red-600" />
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
              <AlertTriangle className="w-6 h-6 text-yellow-600" />
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
            <Ghost className="w-8 h-8 text-red-500 flex-shrink-0" />
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
                icon: Ghost,
                critical: true,
              },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-3 text-sm font-medium border-b-2 flex items-center gap-1 ${getTabClass(tab.id, !!tab.critical, (tab.count || 0) > 0)}`}
              >
                {tab.icon && <tab.icon className="w-4 h-4" />}
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
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-red-500" />
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
                      <AlertTriangle className="w-4 h-4" />
                      {summary.expiringWaivers} waiver(s) expire within 30 days
                    </p>
                  ) : (
                    <p className="text-green-600 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
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
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
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
                    <AlertCircle className="w-4 h-4" />
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
                    <AlertTriangle className="w-4 h-4" />
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
                  <CheckCircle2 className="w-12 h-12 mx-auto mb-2" />
                  <p>No lint issues found</p>
                </div>
              )}
            </div>
          )}

          {/* Phantom Completions Tab */}
          {activeTab === 'phantom' && (
            <div className="space-y-6">
              {phantomAudit ? (
                <>
                  {/* Summary */}
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

                  {/* Phantom Completions List */}
                  <div>
                    <h3 className="font-semibold text-red-600 mb-3 flex items-center gap-2">
                      <Ghost className="w-5 h-5" />
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
                              <XCircle className="w-5 h-5 text-red-500" />
                              <span className="font-semibold text-red-700">{item.task_id}</span>
                              <span className="text-sm text-gray-500">{item.description}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded">
                                {item.missing_artifacts.length} missing
                              </span>
                              {expandedItems.has(`phantom-${item.task_id}`) ? (
                                <ChevronUp className="w-4 h-4" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
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
                                <p className="text-sm text-gray-600 mt-3 italic">
                                  Note: {item.note}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recommendations */}
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
                                {rec.details && (
                                  <p className="text-sm text-gray-600 mt-1">{rec.details}</p>
                                )}
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
                  <Ghost className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-gray-500 mb-4">No phantom completion audit available.</p>
                  <p className="text-sm text-gray-400 mb-4">
                    Run the Python linter to generate an audit report.
                  </p>
                  <button
                    onClick={runPlanLint}
                    disabled={isRunningLint}
                    className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50"
                  >
                    <Play className="w-4 h-4 inline mr-2" />
                    {isRunningLint ? 'Running...' : 'Run Lint'}
                  </button>
                </div>
              )}

              {/* Lint Output */}
              {lintOutput && (
                <div className="mt-4">
                  <h3 className="font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <Terminal className="w-4 h-4" />
                    Linter Output
                  </h3>
                  <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-xs overflow-auto max-h-64 font-mono">
                    {lintOutput}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
