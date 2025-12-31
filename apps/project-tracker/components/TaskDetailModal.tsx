'use client';

import { useState, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import {
  X,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  FileText,
  GitBranch,
  Target,
  Users,
  Folder,
  ChevronRight,
  ExternalLink,
  Zap,
  Loader2,
  FileCheck,
  FilePlus,
} from 'lucide-react';

interface TaskEntry {
  taskId: string;
  description: string;
  executionMode: 'swarm' | 'matop' | 'manual';
  parallelStreamId?: string;
  dependencies?: string[];
}

interface FullTaskData {
  id: string;
  section: string;
  description: string;
  owner: string;
  dependencies: string[];
  cleanDependencies: string[];
  prerequisites: string;
  dod: string;
  status: string;
  kpis: string;
  sprint: number | string;
  artifacts: string[];
  validation: string;
}

interface ContextData {
  taskId: string;
  packStatus: 'generated' | 'pending' | 'missing' | 'error';
  ackStatus: 'acknowledged' | 'pending' | 'missing' | 'invalid';
  hashStatus: 'valid' | 'invalid' | 'pending' | 'unchecked';
  filesRead: { path: string; hash: string; status: string }[];
  invariantsAcknowledged?: string[];
  generatedAt?: string;
  acknowledgedAt?: string;
}

interface GovernanceData {
  taskId: string;
  override: {
    tier: 'A' | 'B' | 'C';
    gateProfile: string[];
    evidenceRequired: string[];
    debtAllowed: boolean;
    waiverExpiry?: string;
  } | null;
  reviewQueue: {
    reasons: string[];
    priority: string;
  } | null;
  debtItems: { id: string; severity: string; description: string }[];
  waiverStatus: 'none' | 'active' | 'expiring_soon' | 'expired';
  hasGovernance: boolean;
}

interface PlanStatus {
  taskId: string;
  hasSpec: boolean;
  hasPlan: boolean;
  isPlanned: boolean;
  specPath: string | null;
  planPath: string | null;
}

interface TaskDetailModalProps {
  task: TaskEntry;
  isOpen: boolean;
  onClose: () => void;
  onNavigateToTask: (taskId: string) => void;
  allTasks?: Map<string, TaskEntry>;
}

export default function TaskDetailModal({
  task,
  isOpen,
  onClose,
  onNavigateToTask,
  allTasks,
}: TaskDetailModalProps) {
  const [fullTask, setFullTask] = useState<FullTaskData | null>(null);
  const [contextData, setContextData] = useState<ContextData | null>(null);
  const [governanceData, setGovernanceData] = useState<GovernanceData | null>(null);
  const [planStatus, setPlanStatus] = useState<PlanStatus | null>(null);
  const [loadingPlanStatus, setLoadingPlanStatus] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const fetchTaskDetails = useCallback(async () => {
    if (!task.taskId) return;

    setLoading(true);
    setLoadingPlanStatus(true);
    setError(null);

    try {
      // Fetch task, context, governance in parallel (these are fast)
      const [taskRes, contextRes, govRes] = await Promise.all([
        fetch(`/api/tasks?taskId=${task.taskId}`),
        fetch(`/api/context/${task.taskId}`),
        fetch(`/api/governance/task/${task.taskId}`),
      ]);

      // Parse responses
      if (taskRes.ok) {
        const taskData = await taskRes.json();
        if (taskData.task) {
          setFullTask(taskData.task);
        }
      }

      if (contextRes.ok) {
        const ctxData = await contextRes.json();
        setContextData(ctxData);
      }

      if (govRes.ok) {
        const gData = await govRes.json();
        setGovernanceData(gData);
      }

      setLoading(false);

      // Fetch plan status separately (can be slow)
      try {
        const planRes = await fetch(`/api/tasks/plan?taskId=${task.taskId}`);
        if (planRes.ok) {
          const pData = await planRes.json();
          setPlanStatus(pData);
        }
      } finally {
        setLoadingPlanStatus(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch task details');
      setLoading(false);
      setLoadingPlanStatus(false);
    }
  }, [task.taskId]);

  useEffect(() => {
    if (isOpen && task.taskId) {
      fetchTaskDetails();
    }
  }, [isOpen, task.taskId, fetchTaskDetails]);

  const handleGeneratePlan = async () => {
    setActionLoading('plan');
    setActionMessage(null);
    try {
      const response = await fetch('/api/tasks/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.taskId }),
      });
      const data = await response.json();
      if (response.ok) {
        setActionMessage(`Spec & Plan generated: ${data.specPath}`);
        // Refresh plan status
        const planRes = await fetch(`/api/tasks/plan?taskId=${task.taskId}`);
        if (planRes.ok) {
          setPlanStatus(await planRes.json());
        }
      } else {
        setActionMessage(`Error: ${data.error || 'Failed to generate plan'}`);
      }
    } catch (err) {
      setActionMessage(`Error: ${err instanceof Error ? err.message : 'Failed'}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleGeneratePrompt = async () => {
    setActionLoading('prompt');
    setActionMessage(null);
    try {
      const response = await fetch('/api/tasks/generate-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskIds: [task.taskId] }),
      });
      const data = await response.json();
      if (response.ok) {
        setActionMessage(`Prompt saved to: ${data.savedTo}`);
      } else {
        setActionMessage(`Error: ${data.error || 'Failed to generate prompt'}`);
      }
    } catch (err) {
      setActionMessage(`Error: ${err instanceof Error ? err.message : 'Failed'}`);
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      Completed: 'bg-green-100 text-green-800',
      'In Progress': 'bg-blue-100 text-blue-800',
      Planned: 'bg-purple-100 text-purple-800',
      Backlog: 'bg-gray-100 text-gray-800',
      Blocked: 'bg-red-100 text-red-800',
      Failed: 'bg-red-100 text-red-800',
      'Needs Human': 'bg-yellow-100 text-yellow-800',
      Validating: 'bg-cyan-100 text-cyan-800',
    };
    return styles[status] || 'bg-gray-100 text-gray-800';
  };

  const getTierBadge = (tier: 'A' | 'B' | 'C') => {
    const styles = {
      A: 'bg-red-100 text-red-800 border-red-300',
      B: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      C: 'bg-green-100 text-green-800 border-green-300',
    };
    return styles[tier];
  };

  const getContextStatusIcon = (status: string) => {
    switch (status) {
      case 'generated':
      case 'acknowledged':
      case 'valid':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'missing':
        return <XCircle className="w-4 h-4 text-gray-400" />;
      case 'invalid':
      case 'error':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const parseDod = (dod: string): string[] => {
    return dod
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean);
  };

  const parseKpis = (kpis: string): string[] => {
    return kpis
      .split(';')
      .map((k) => k.trim())
      .filter(Boolean);
  };

  const getDependencyStatus = (depId: string): string | null => {
    if (!allTasks) return null;
    const depTask = allTasks.get(depId);
    return depTask ? 'exists' : null;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col m-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50">
          <div className="flex items-center gap-3">
            <span className="font-mono text-lg font-semibold">{task.taskId}</span>
            {fullTask && (
              <span className={clsx('px-2 py-1 text-xs rounded-full', getStatusBadge(fullTask.status))}>
                {fullTask.status}
              </span>
            )}
            {governanceData?.override?.tier && (
              <span
                className={clsx(
                  'px-2 py-0.5 text-xs font-medium rounded border',
                  getTierBadge(governanceData.override.tier)
                )}
              >
                Tier {governanceData.override.tier}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
              <span className="ml-2 text-gray-500">Loading task details...</span>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-50 text-red-700 rounded-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              {error}
            </div>
          ) : (
            <>
              {/* Description */}
              <section>
                <h3 className="text-sm font-medium text-gray-500 mb-2">Description</h3>
                <p className="text-gray-900">{fullTask?.description || task.description}</p>
              </section>

              {/* Quick Info Grid */}
              <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                    <Folder className="w-4 h-4" />
                    Section
                  </div>
                  <div className="font-medium">{fullTask?.section || '-'}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                    <Users className="w-4 h-4" />
                    Owner
                  </div>
                  <div className="font-medium">{fullTask?.owner || '-'}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                    <Target className="w-4 h-4" />
                    Sprint
                  </div>
                  <div className="font-medium">{fullTask?.sprint ?? '-'}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                    <Zap className="w-4 h-4" />
                    Mode
                  </div>
                  <div className="font-medium capitalize">{task.executionMode}</div>
                </div>
              </section>

              {/* Dependencies */}
              <section>
                <h3 className="text-sm font-medium text-gray-500 mb-2 flex items-center gap-2">
                  <GitBranch className="w-4 h-4" />
                  Dependencies ({(fullTask?.dependencies || task.dependencies || []).length})
                </h3>
                <div className="space-y-1">
                  {(fullTask?.cleanDependencies || fullTask?.dependencies || task.dependencies || []).length > 0 ? (
                    (fullTask?.cleanDependencies || fullTask?.dependencies || task.dependencies || []).map((depId) => (
                      <button
                        key={depId}
                        onClick={() => onNavigateToTask(depId)}
                        className="flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-blue-50 rounded-lg text-left w-full group transition-colors"
                      >
                        <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-blue-500" />
                        <span className="font-mono text-sm">{depId}</span>
                        {getDependencyStatus(depId) && (
                          <span className="text-xs text-gray-400 ml-auto">Click to view</span>
                        )}
                        <ExternalLink className="w-3 h-3 text-gray-400 group-hover:text-blue-500" />
                      </button>
                    ))
                  ) : (
                    <p className="text-gray-400 text-sm italic">No dependencies</p>
                  )}
                </div>
              </section>

              {/* Pre-requisites */}
              {fullTask?.prerequisites && (
                <section>
                  <h3 className="text-sm font-medium text-gray-500 mb-2">Pre-requisites</h3>
                  <p className="text-gray-700 text-sm bg-gray-50 p-3 rounded-lg">
                    {fullTask.prerequisites}
                  </p>
                </section>
              )}

              {/* Definition of Done */}
              {fullTask?.dod && (
                <section>
                  <h3 className="text-sm font-medium text-gray-500 mb-2 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    Definition of Done
                  </h3>
                  <ul className="space-y-1">
                    {parseDod(fullTask.dod).map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="text-gray-400 font-mono">{idx + 1}.</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* KPIs */}
              {fullTask?.kpis && (
                <section>
                  <h3 className="text-sm font-medium text-gray-500 mb-2 flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    KPIs
                  </h3>
                  <ul className="space-y-1">
                    {parseKpis(fullTask.kpis).map((kpi, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="text-blue-500">-</span>
                        {kpi}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Artifacts */}
              {fullTask?.artifacts && fullTask.artifacts.length > 0 && (
                <section>
                  <h3 className="text-sm font-medium text-gray-500 mb-2 flex items-center gap-2">
                    <Folder className="w-4 h-4" />
                    Artifacts to Track
                  </h3>
                  <ul className="space-y-1">
                    {fullTask.artifacts.map((artifact, idx) => (
                      <li key={idx} className="text-sm font-mono text-gray-600 bg-gray-50 px-2 py-1 rounded">
                        {artifact}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Validation Method */}
              {fullTask?.validation && (
                <section>
                  <h3 className="text-sm font-medium text-gray-500 mb-2">Validation Method</h3>
                  <p className="text-gray-700 text-sm bg-gray-50 p-3 rounded-lg font-mono">
                    {fullTask.validation}
                  </p>
                </section>
              )}

              {/* Context & Governance Status */}
              <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Context Pack Status */}
                <div className="border rounded-lg p-4">
                  <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Context Pack Status
                  </h4>
                  {contextData ? (
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">Pack Status</span>
                        <span className="flex items-center gap-1">
                          {getContextStatusIcon(contextData.packStatus)}
                          <span className="capitalize">{contextData.packStatus}</span>
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">Ack Status</span>
                        <span className="flex items-center gap-1">
                          {getContextStatusIcon(contextData.ackStatus)}
                          <span className="capitalize">{contextData.ackStatus}</span>
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">Hash Validation</span>
                        <span className="flex items-center gap-1">
                          {getContextStatusIcon(contextData.hashStatus)}
                          <span className="capitalize">{contextData.hashStatus}</span>
                        </span>
                      </div>
                      {contextData.filesRead.length > 0 && (
                        <div className="text-xs text-gray-400 mt-2">
                          {contextData.filesRead.length} files tracked
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-gray-400 text-sm">No context data</p>
                  )}
                </div>

                {/* Plan Status */}
                <div className="border rounded-lg p-4">
                  <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <FileCheck className="w-4 h-4" />
                    Spec & Plan Status
                  </h4>
                  {planStatus ? (
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">Specification</span>
                        <span className="flex items-center gap-1">
                          {planStatus.hasSpec ? (
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                          ) : (
                            <XCircle className="w-4 h-4 text-gray-400" />
                          )}
                          <span>{planStatus.hasSpec ? 'Exists' : 'Missing'}</span>
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">Implementation Plan</span>
                        <span className="flex items-center gap-1">
                          {planStatus.hasPlan ? (
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                          ) : (
                            <XCircle className="w-4 h-4 text-gray-400" />
                          )}
                          <span>{planStatus.hasPlan ? 'Exists' : 'Missing'}</span>
                        </span>
                      </div>
                      {planStatus.specPath && (
                        <div className="text-xs text-gray-400 mt-2 font-mono truncate">
                          {planStatus.specPath}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-gray-400 text-sm">Checking...</p>
                  )}
                </div>
              </section>

              {/* Governance Details */}
              {governanceData?.hasGovernance && governanceData.override && (
                <section className="border rounded-lg p-4">
                  <h4 className="text-sm font-medium mb-3">Governance Details</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Gate Profile:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {governanceData.override.gateProfile.map((gate) => (
                          <span key={gate} className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">
                            {gate}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-500">Evidence Required:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {governanceData.override.evidenceRequired.map((ev) => (
                          <span key={ev} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                            {ev}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  {governanceData.waiverStatus !== 'none' && (
                    <div className="mt-3 text-sm">
                      <span className="text-gray-500">Waiver:</span>
                      <span
                        className={clsx('ml-2 px-2 py-0.5 rounded text-xs', {
                          'bg-green-100 text-green-700': governanceData.waiverStatus === 'active',
                          'bg-yellow-100 text-yellow-700': governanceData.waiverStatus === 'expiring_soon',
                          'bg-red-100 text-red-700': governanceData.waiverStatus === 'expired',
                        })}
                      >
                        {governanceData.waiverStatus.replace('_', ' ')}
                      </span>
                    </div>
                  )}
                </section>
              )}

              {/* Action Message */}
              {actionMessage && (
                <div
                  className={clsx('p-3 rounded-lg text-sm', {
                    'bg-green-50 text-green-700': !actionMessage.startsWith('Error'),
                    'bg-red-50 text-red-700': actionMessage.startsWith('Error'),
                  })}
                >
                  {actionMessage}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="border-t px-6 py-4 bg-gray-50 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {/* Generate Spec & Plan - Show when loading OR when not planned */}
            {(loadingPlanStatus || (planStatus && !planStatus.isPlanned)) && (
              <button
                onClick={handleGeneratePlan}
                disabled={actionLoading === 'plan' || loadingPlanStatus}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg flex items-center gap-2 text-sm disabled:opacity-50"
              >
                {actionLoading === 'plan' || loadingPlanStatus ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FilePlus className="w-4 h-4" />
                )}
                {loadingPlanStatus ? 'Checking...' : 'Generate Spec & Plan'}
              </button>
            )}

            {/* Show badge if already planned */}
            {planStatus?.isPlanned && (
              <span className="px-3 py-2 bg-green-100 text-green-700 rounded-lg flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4" />
                Spec & Plan exists
              </span>
            )}

            {/* Generate Implementation Prompt */}
            <button
              onClick={handleGeneratePrompt}
              disabled={actionLoading === 'prompt'}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 text-sm disabled:opacity-50"
            >
              {actionLoading === 'prompt' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
              Generate Prompt
            </button>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
