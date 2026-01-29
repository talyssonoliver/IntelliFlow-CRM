'use client';

import { useState, useEffect, useCallback } from 'react';
import { Task, TaskValidationSummary, CoverageMetrics } from '@/lib/types';
import { Icon } from '@/lib/icons';
import ContractTagList, { parseContractTags, hasContractTags } from './ContractTagList';
import ContextPackStatus, { ContextPackData } from './ContextPackStatus';
import PlanDeliverablesStatus from './PlanDeliverablesStatus';
import { clsx } from 'clsx';

/**
 * Minimal task interface that works with both full Task objects
 * and simplified TaskEntry objects from SprintExecutionView
 */
interface MinimalTask {
  id?: string;
  taskId?: string;
  description?: string;
  executionMode?: 'swarm' | 'matop' | 'manual';
  parallelStreamId?: string;
  dependencies?: string[];
}

interface TaskModalProps {
  /** Task object - can be full Task or minimal TaskEntry */
  task: Task | MinimalTask;
  /** Called when modal should close */
  onClose: () => void;
  /** Called when user clicks a dependency to navigate */
  onNavigateToTask?: (taskId: string) => void;
  /** Whether modal is open (for controlled usage) */
  isOpen?: boolean;
  /** Map of all tasks for dependency lookup */
  allTasks?: Map<string, MinimalTask>;
}

interface PlanStatus {
  taskId: string;
  hasSpec: boolean;
  hasPlan: boolean;
  isPlanned: boolean;
  specPath: string | null;
  planPath: string | null;
}

/** Schedule data from PMBOK calculation */
interface ScheduleTaskData {
  taskId: string;
  expectedDuration: number;
  earlyStart: string;
  earlyFinish: string;
  lateStart: string;
  lateFinish: string;
  totalFloat: number;
  freeFloat: number;
  isCritical: boolean;
  percentComplete: number;
  status: string;
  estimate?: {
    optimistic: number;
    mostLikely: number;
    pessimistic: number;
  };
}

/** Full task data fetched from API */
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

/** Get task ID from either full Task or minimal TaskEntry */
function getTaskId(task: Task | MinimalTask): string {
  return (task as Task).id || (task as MinimalTask).taskId || '';
}

/** Check if task has full data */
function isFullTask(task: Task | MinimalTask): task is Task {
  return 'section' in task && 'owner' in task && 'dod' in task;
}

export default function TaskModal({ task, onClose, onNavigateToTask, isOpen = true, allTasks }: TaskModalProps) {
  const taskId = getTaskId(task);

  // Full task data (fetched from API if not provided)
  const [fullTask, setFullTask] = useState<FullTaskData | null>(
    isFullTask(task) ? {
      id: task.id,
      section: task.section,
      description: task.description,
      owner: task.owner,
      dependencies: task.dependencies,
      cleanDependencies: task.cleanDependencies || [],
      prerequisites: task.prerequisites,
      dod: task.dod,
      status: task.status,
      kpis: task.kpis,
      sprint: task.sprint,
      artifacts: task.artifacts,
      validation: task.validation,
    } : null
  );
  const [loadingTask, setLoadingTask] = useState(!isFullTask(task));

  const [contextData, setContextData] = useState<ContextPackData | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'contract' | 'context' | 'validation' | 'schedule'>('details');
  const [planStatus, setPlanStatus] = useState<PlanStatus | null>(null);
  const [loadingPlanStatus, setLoadingPlanStatus] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [validationSummary, setValidationSummary] = useState<TaskValidationSummary | null>(null);
  const [loadingValidation, setLoadingValidation] = useState(false);
  const [scheduleData, setScheduleData] = useState<ScheduleTaskData | null>(null);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [expandedPanels, setExpandedPanels] = useState<Record<string, boolean>>({
    matop: false,
    spec: false,
    plan: false,
    kpis: false,
    dod: false,
  });

  const togglePanel = useCallback((panel: string) => {
    setExpandedPanels((prev) => ({ ...prev, [panel]: !prev[panel] }));
  }, []);

  // Fetch full task data if not provided
  useEffect(() => {
    if (!isFullTask(task) && taskId && isOpen) {
      setLoadingTask(true);
      fetch(`/api/tasks?taskId=${taskId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.task) {
            setFullTask(data.task);
          }
          setLoadingTask(false);
        })
        .catch(() => {
          setLoadingTask(false);
        });
    }
  }, [task, taskId, isOpen]);

  // Use fullTask data or fall back to provided task data
  const displayTask = fullTask || (isFullTask(task) ? {
    id: task.id,
    section: task.section,
    description: task.description,
    owner: task.owner,
    dependencies: task.dependencies,
    cleanDependencies: task.cleanDependencies || [],
    prerequisites: task.prerequisites,
    dod: task.dod,
    status: task.status,
    kpis: task.kpis,
    sprint: task.sprint,
    artifacts: task.artifacts,
    validation: task.validation,
  } : null);

  // Check if task has contract tags (safely handle missing data)
  const hasPrereqTags = displayTask ? hasContractTags(displayTask.prerequisites) : false;
  const hasArtifactTags = displayTask?.artifacts?.some((a) => hasContractTags(a)) || false;
  const hasValidationTags = displayTask ? hasContractTags(displayTask.validation) : false;
  const hasAnyContractTags = hasPrereqTags || hasArtifactTags || hasValidationTags;

  // Parse artifacts string (joined with ;)
  const artifactsString = displayTask?.artifacts?.join(';') || '';
  const requiresContextAck = parseContractTags(artifactsString).some(
    (t) => t.type === 'EVIDENCE' && t.value === 'context_ack'
  );

  // Load context status when contract tab is selected
  useEffect(() => {
    if (activeTab === 'context' && !contextData && !loadingContext && taskId && isOpen) {
      setLoadingContext(true);
      fetch(`/api/context/${taskId}`)
        .then((res) => res.json())
        .then((data) => {
          setContextData(data);
          setLoadingContext(false);
        })
        .catch(() => {
          setLoadingContext(false);
        });
    }
  }, [activeTab, taskId, contextData, loadingContext, isOpen]);

  // Load validation summary when validation tab is selected
  useEffect(() => {
    if (activeTab === 'validation' && !validationSummary && !loadingValidation && taskId && isOpen) {
      setLoadingValidation(true);
      fetch(`/api/tasks/validation-summary/${taskId}`)
        .then((res) => res.json())
        .then((data) => {
          if (!data.error) {
            setValidationSummary(data);
          }
          setLoadingValidation(false);
        })
        .catch(() => {
          setLoadingValidation(false);
        });
    }
  }, [activeTab, taskId, validationSummary, loadingValidation, isOpen]);

  // Load schedule data when schedule tab is selected
  useEffect(() => {
    if (activeTab === 'schedule' && !scheduleData && !loadingSchedule && taskId && isOpen) {
      setLoadingSchedule(true);
      // Fetch sprint from task to get schedule data
      const sprint = displayTask?.sprint ?? 0;
      fetch(`/api/schedule/calculate?sprint=${sprint}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.tasks && data.tasks[taskId]) {
            setScheduleData(data.tasks[taskId]);
          }
          setLoadingSchedule(false);
        })
        .catch(() => {
          setLoadingSchedule(false);
        });
    }
  }, [activeTab, taskId, scheduleData, loadingSchedule, isOpen, displayTask?.sprint]);

  // Load plan status on mount
  useEffect(() => {
    if (!taskId || !isOpen) return;
    setLoadingPlanStatus(true);
    fetch(`/api/tasks/plan?taskId=${taskId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.taskId) {
          setPlanStatus(data);
        }
      })
      .catch(() => {
        // Plan status not critical
      })
      .finally(() => {
        setLoadingPlanStatus(false);
      });
  }, [taskId, isOpen]);

  const handleGeneratePlan = useCallback(async () => {
    setActionLoading('plan');
    setActionMessage(null);
    try {
      const response = await fetch('/api/tasks/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      });
      const data = await response.json();
      if (response.ok) {
        setActionMessage(`Spec & Plan generated: ${data.specPath}`);
        // Refresh plan status
        const planRes = await fetch(`/api/tasks/plan?taskId=${taskId}`);
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
  }, [taskId]);

  const handleGeneratePrompt = useCallback(async () => {
    setActionLoading('prompt');
    setActionMessage(null);
    try {
      const response = await fetch('/api/tasks/generate-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskIds: [taskId] }),
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
  }, [taskId]);

  const handleDependencyClick = useCallback(
    (depId: string) => {
      if (onNavigateToTask) {
        onNavigateToTask(depId);
      }
    },
    [onNavigateToTask]
  );

  const refreshContext = () => {
    if (!taskId) return;
    setLoadingContext(true);
    setContextData(null);
    fetch(`/api/context/${taskId}`)
      .then((res) => res.json())
      .then((data) => {
        setContextData(data);
        setLoadingContext(false);
      })
      .catch(() => {
        setLoadingContext(false);
      });
  };

  // Don't render if not open
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 z-50">
      <button
        type="button"
        aria-label="Close modal"
        className="fixed inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />
      <div className="relative z-10 bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-gray-900">{taskId}</h2>
            {displayTask?.status && (
              <span
                className={clsx(
                  'px-2 py-0.5 text-xs font-semibold rounded-full',
                  displayTask.status === 'Completed' && 'bg-green-100 text-green-800',
                  displayTask.status === 'In Progress' && 'bg-blue-100 text-blue-800',
                  displayTask.status === 'Blocked' && 'bg-red-100 text-red-800',
                  !['Completed', 'In Progress', 'Blocked'].includes(displayTask.status) && 'bg-gray-100 text-gray-800'
                )}
              >
                {displayTask.status}
              </span>
            )}
            {hasAnyContractTags && (
              <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded">
                Contract Tags
              </span>
            )}
            {requiresContextAck && (
              <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                Requires ACK
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <Icon name="close" size="xl" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 px-6">
          <nav className="flex gap-4" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('details')}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'details'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Details
            </button>
            <button
              onClick={() => setActiveTab('contract')}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
                activeTab === 'contract'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Contract Tags
              {hasAnyContractTags && <span className="w-2 h-2 bg-green-500 rounded-full" />}
            </button>
            <button
              onClick={() => setActiveTab('context')}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
                activeTab === 'context'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Context Verification
              {requiresContextAck && <span className="w-2 h-2 bg-blue-500 rounded-full" />}
            </button>
            <button
              onClick={() => setActiveTab('validation')}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
                activeTab === 'validation'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Validation
              {validationSummary?.attestation?.exists && (
                <span className="w-2 h-2 bg-purple-500 rounded-full" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('schedule')}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
                activeTab === 'schedule'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Schedule
              {scheduleData?.isCritical && (
                <span className="w-2 h-2 bg-red-500 rounded-full" title="Critical Path" />
              )}
            </button>
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Details Tab */}
          {activeTab === 'details' && (
            <div className="space-y-6">
              {loadingTask ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                </div>
              ) : displayTask ? (
                <>
                  {/* Description */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-2">Description</h3>
                    <p className="text-gray-900">{displayTask.description}</p>
                  </div>

                  {/* Info Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h3 className="text-sm font-medium text-gray-500 mb-1">Owner</h3>
                      <p className="text-gray-900">{displayTask.owner}</p>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-gray-500 mb-1">Sprint</h3>
                      <p className="text-gray-900">{displayTask.sprint}</p>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-gray-500 mb-1">Status</h3>
                      <span
                        className={clsx(
                          'px-3 py-1 inline-flex text-sm font-semibold rounded-full',
                          displayTask.status === 'Completed' && 'bg-green-100 text-green-800',
                          displayTask.status === 'In Progress' && 'bg-blue-100 text-blue-800',
                          displayTask.status === 'Blocked' && 'bg-red-100 text-red-800',
                          !['Completed', 'In Progress', 'Blocked'].includes(displayTask.status) && 'bg-gray-100 text-gray-800'
                        )}
                      >
                        {displayTask.status}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-gray-500 mb-1">Section</h3>
                      <p className="text-gray-900">{displayTask.section}</p>
                    </div>
                  </div>

                  {/* Definition of Done */}
                  {displayTask.dod && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-500 mb-2">Definition of Done</h3>
                      <p className="text-gray-900 whitespace-pre-wrap">{displayTask.dod}</p>
                    </div>
                  )}

                  {/* KPIs */}
                  {displayTask.kpis && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-500 mb-2">KPIs</h3>
                      <p className="text-gray-900">{displayTask.kpis}</p>
                    </div>
                  )}

                  {/* Dependencies */}
                  {displayTask.dependencies && displayTask.dependencies.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-500 mb-2">
                        Dependencies ({displayTask.dependencies.length})
                      </h3>
                      <div className="space-y-1">
                        {displayTask.dependencies.map((dep) => (
                          <button
                            key={dep}
                            onClick={() => handleDependencyClick(dep)}
                            disabled={!onNavigateToTask}
                            className={clsx(
                              'flex items-center gap-2 px-3 py-2 rounded-lg text-left w-full transition-colors',
                              onNavigateToTask
                                ? 'bg-gray-50 hover:bg-blue-50 cursor-pointer group'
                                : 'bg-gray-50 cursor-default'
                            )}
                          >
                            <Icon
                              name="chevron_right"
                              size="sm"
                              className={clsx('text-gray-400', onNavigateToTask && 'group-hover:text-blue-500')}
                            />
                            <span className="font-mono text-sm text-blue-700">{dep}</span>
                            {onNavigateToTask && (
                              <>
                                <span className="text-xs text-gray-400 ml-auto">Click to view</span>
                                <Icon name="open_in_new" size="xs" className="text-gray-400 group-hover:text-blue-500" />
                              </>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Plan Status */}
                  {planStatus && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h3 className="text-sm font-medium text-gray-700 mb-3">Spec & Plan Status</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center gap-2">
                          {planStatus.hasSpec ? (
                            <Icon name="check_circle" size="lg" className="text-green-500" />
                          ) : (
                            <Icon name="cancel" size="lg" className="text-gray-400" />
                          )}
                          <span className="text-sm">
                            Specification: {planStatus.hasSpec ? 'Exists' : 'Missing'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {planStatus.hasPlan ? (
                            <Icon name="check_circle" size="lg" className="text-green-500" />
                          ) : (
                            <Icon name="cancel" size="lg" className="text-gray-400" />
                          )}
                          <span className="text-sm">
                            Plan: {planStatus.hasPlan ? 'Exists' : 'Missing'}
                          </span>
                        </div>
                      </div>
                      {planStatus.specPath && (
                        <p className="text-xs text-gray-500 mt-2 font-mono truncate">
                          {planStatus.specPath}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Action Message */}
                  {actionMessage && (
                    <div
                      className={clsx(
                        'p-3 rounded-lg text-sm',
                        actionMessage.startsWith('Error')
                          ? 'bg-red-50 text-red-700'
                          : 'bg-green-50 text-green-700'
                      )}
                    >
                      {actionMessage}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  Unable to load task details
                </div>
              )}
            </div>
          )}

          {/* Contract Tags Tab */}
          {activeTab === 'contract' && (
            <div className="space-y-6">
              {loadingTask ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                </div>
              ) : displayTask ? (
                <>
                  {/* Prerequisites */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-3 flex items-center gap-2">
                      Pre-requisites
                      {hasPrereqTags && (
                        <span className="text-xs text-green-600">
                          ({parseContractTags(displayTask.prerequisites).length} tags)
                        </span>
                      )}
                    </h3>
                    {hasPrereqTags ? (
                      <ContractTagList rawString={displayTask.prerequisites} mode="full" />
                    ) : (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-700">
                        No contract tags found. Raw value:{' '}
                        <span className="font-mono">{displayTask.prerequisites || '(empty)'}</span>
                      </div>
                    )}
                  </div>

                  {/* Artifacts */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-3 flex items-center gap-2">
                      Artifacts To Track (Evidence)
                      {hasArtifactTags && (
                        <span className="text-xs text-green-600">
                          ({parseContractTags(artifactsString).length} tags)
                        </span>
                      )}
                    </h3>
                    {hasArtifactTags ? (
                      <ContractTagList rawString={artifactsString} mode="full" />
                    ) : (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-700">
                        No EVIDENCE tags found. Raw artifacts:
                        <ul className="mt-2 font-mono text-xs space-y-1">
                          {displayTask.artifacts?.map((a, i) => (
                            <li key={i}>{a}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Validation */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-3 flex items-center gap-2">
                      Validation Method
                      {hasValidationTags && (
                        <span className="text-xs text-green-600">
                          ({parseContractTags(displayTask.validation).length} tags)
                        </span>
                      )}
                    </h3>
                    {hasValidationTags ? (
                      <ContractTagList rawString={displayTask.validation} mode="full" />
                    ) : (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-700">
                        No contract tags found. Raw value:{' '}
                        <span className="font-mono">{displayTask.validation || '(empty)'}</span>
                      </div>
                    )}
                  </div>

                  {/* Compliance Summary */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="text-sm font-medium text-gray-700 mb-3">Contract Compliance</h3>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <div
                          className={clsx(
                            'text-2xl font-bold',
                            hasPrereqTags ? 'text-green-600' : 'text-gray-400'
                          )}
                        >
                          {hasPrereqTags ? '✓' : '○'}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">Prerequisites</div>
                      </div>
                      <div>
                        <div
                          className={clsx(
                            'text-2xl font-bold',
                            hasArtifactTags ? 'text-green-600' : 'text-gray-400'
                          )}
                        >
                          {hasArtifactTags ? '✓' : '○'}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">Evidence</div>
                      </div>
                      <div>
                        <div
                          className={clsx(
                            'text-2xl font-bold',
                            hasValidationTags ? 'text-green-600' : 'text-gray-400'
                          )}
                        >
                          {hasValidationTags ? '✓' : '○'}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">Validation</div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  Unable to load task details
                </div>
              )}
            </div>
          )}

          {/* Context Tab */}
          {activeTab === 'context' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-700">
                  Context Pack & Acknowledgment Status
                </h3>
                <button
                  onClick={refreshContext}
                  disabled={loadingContext}
                  className="flex items-center gap-1 px-2 py-1 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50"
                >
                  <Icon name="refresh" size="sm" className={loadingContext ? 'animate-spin' : ''} />
                  Refresh
                </button>
              </div>

              {loadingContext ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Plan Deliverables Verification */}
                  {validationSummary?.planDeliverables && (
                    <PlanDeliverablesStatus data={validationSummary.planDeliverables} />
                  )}

                  {/* Context Pack Status */}
                  {contextData ? (
                    <ContextPackStatus data={contextData} />
                  ) : (
                    <div className="bg-gray-50 rounded-lg p-8 text-center">
                      <p className="text-gray-500">No context pack data available for this task.</p>
                      {requiresContextAck && (
                        <p className="text-sm text-yellow-600 mt-2">
                          This task requires context_ack but none has been generated yet.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Requirements */}
              {requiresContextAck && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-blue-800 mb-2">
                    Context Acknowledgment Required
                  </h4>
                  <p className="text-sm text-blue-700">
                    This task has{' '}
                    <code className="bg-blue-100 px-1 rounded">EVIDENCE:context_ack</code> in its
                    artifacts. The agent must produce a valid context_ack.json with SHA256 hashes
                    matching all FILE: prerequisites before code changes are accepted.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Schedule Tab */}
          {activeTab === 'schedule' && (
            <div className="space-y-6">
              {loadingSchedule ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                </div>
              ) : scheduleData ? (
                <>
                  {/* Critical Path Indicator */}
                  {scheduleData.isCritical && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <div className="flex items-center gap-2">
                        <Icon name="warning" size="lg" className="text-red-500" />
                        <div>
                          <h4 className="text-sm font-semibold text-red-800">Critical Path Task</h4>
                          <p className="text-sm text-red-600">
                            This task is on the critical path. Any delay will impact the sprint completion date.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Progress */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-3">Progress</h3>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-700">Percent Complete</span>
                        <span className="text-lg font-bold text-gray-900">{scheduleData.percentComplete}%</span>
                      </div>
                      <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={clsx(
                            'h-full rounded-full transition-all',
                            scheduleData.percentComplete >= 100 ? 'bg-green-500' :
                            scheduleData.isCritical ? 'bg-red-500' : 'bg-blue-500'
                          )}
                          style={{ width: `${Math.min(100, scheduleData.percentComplete)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Duration & Estimate */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-3">Duration Estimate (PERT)</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {scheduleData.estimate ? (
                        <>
                          <div className="bg-green-50 rounded-lg p-3 text-center border border-green-200">
                            <div className="text-xs text-green-600 mb-1">Optimistic</div>
                            <div className="text-lg font-bold text-green-700">
                              {Math.round(scheduleData.estimate.optimistic / 60)}h
                            </div>
                          </div>
                          <div className="bg-blue-50 rounded-lg p-3 text-center border border-blue-200">
                            <div className="text-xs text-blue-600 mb-1">Most Likely</div>
                            <div className="text-lg font-bold text-blue-700">
                              {Math.round(scheduleData.estimate.mostLikely / 60)}h
                            </div>
                          </div>
                          <div className="bg-amber-50 rounded-lg p-3 text-center border border-amber-200">
                            <div className="text-xs text-amber-600 mb-1">Pessimistic</div>
                            <div className="text-lg font-bold text-amber-700">
                              {Math.round(scheduleData.estimate.pessimistic / 60)}h
                            </div>
                          </div>
                          <div className="bg-purple-50 rounded-lg p-3 text-center border border-purple-200">
                            <div className="text-xs text-purple-600 mb-1">Expected</div>
                            <div className="text-lg font-bold text-purple-700">
                              {Math.round(scheduleData.expectedDuration / 60 * 10) / 10}h
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="col-span-4 bg-gray-50 rounded-lg p-3 text-center border border-gray-200">
                          <div className="text-xs text-gray-600 mb-1">Expected Duration</div>
                          <div className="text-lg font-bold text-gray-700">
                            {Math.round(scheduleData.expectedDuration / 60 * 10) / 10}h
                          </div>
                          <div className="text-xs text-gray-400 mt-1">No three-point estimate provided</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Schedule Dates */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-3">Calculated Schedule</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-gray-50 rounded-lg p-4">
                        <h4 className="text-xs font-medium text-gray-500 mb-3 uppercase">Early Dates (Forward Pass)</h4>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Early Start</span>
                            <span className="text-sm font-medium text-gray-900">
                              {new Date(scheduleData.earlyStart).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Early Finish</span>
                            <span className="text-sm font-medium text-gray-900">
                              {new Date(scheduleData.earlyFinish).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-4">
                        <h4 className="text-xs font-medium text-gray-500 mb-3 uppercase">Late Dates (Backward Pass)</h4>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Late Start</span>
                            <span className="text-sm font-medium text-gray-900">
                              {new Date(scheduleData.lateStart).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Late Finish</span>
                            <span className="text-sm font-medium text-gray-900">
                              {new Date(scheduleData.lateFinish).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Float (Slack) */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-3">Float / Slack</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className={clsx(
                        'rounded-lg p-4 border',
                        scheduleData.totalFloat <= 0 ? 'bg-red-50 border-red-200' :
                        scheduleData.totalFloat < 60 ? 'bg-amber-50 border-amber-200' :
                        'bg-green-50 border-green-200'
                      )}>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-xs text-gray-500 mb-1">Total Float</div>
                            <div className={clsx(
                              'text-2xl font-bold',
                              scheduleData.totalFloat <= 0 ? 'text-red-700' :
                              scheduleData.totalFloat < 60 ? 'text-amber-700' :
                              'text-green-700'
                            )}>
                              {scheduleData.totalFloat} min
                            </div>
                            <div className="text-xs text-gray-400">
                              {Math.round(scheduleData.totalFloat / 60 * 10) / 10} hours
                            </div>
                          </div>
                          {scheduleData.totalFloat <= 0 && (
                            <Icon name="warning" size="xl" className="text-red-400" />
                          )}
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <div className="text-xs text-gray-500 mb-1">Free Float</div>
                        <div className="text-2xl font-bold text-gray-700">
                          {scheduleData.freeFloat} min
                        </div>
                        <div className="text-xs text-gray-400">
                          {Math.round(scheduleData.freeFloat / 60 * 10) / 10} hours
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">
                      Total Float = Late Start - Early Start. Tasks with zero float are on the critical path.
                    </p>
                  </div>

                  {/* Status */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon name="info" size="sm" className="text-gray-400" />
                        <span className="text-sm text-gray-600">Task Status</span>
                      </div>
                      <span className={clsx(
                        'px-3 py-1 text-sm font-medium rounded-full',
                        scheduleData.status === 'Completed' && 'bg-green-100 text-green-800',
                        scheduleData.status === 'In Progress' && 'bg-blue-100 text-blue-800',
                        scheduleData.status === 'Blocked' && 'bg-red-100 text-red-800',
                        !['Completed', 'In Progress', 'Blocked'].includes(scheduleData.status) && 'bg-gray-100 text-gray-800'
                      )}>
                        {scheduleData.status}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="bg-gray-50 rounded-lg p-8 text-center">
                  <Icon name="calendar_today" size="xl" className="text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No schedule data available for this task.</p>
                  <p className="text-sm text-gray-400 mt-2">
                    Schedule data is calculated from Sprint_plan.csv columns:<br/>
                    Estimate (O/M/P), Planned Start, Planned Finish, Percent Complete, Dependency Types
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Validation Tab */}
          {activeTab === 'validation' && (
            <div className="space-y-6">
              {loadingValidation ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                </div>
              ) : validationSummary ? (
                <>
                  {/* Build Validation Grid */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-3">Build Validation</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {validationSummary.buildValidation.items.map((item) => (
                        <div
                          key={item.name}
                          className={clsx(
                            'rounded-lg p-3 text-center border',
                            item.status === 'pass' && 'bg-green-50 border-green-200',
                            item.status === 'fail' && 'bg-red-50 border-red-200',
                            item.status === 'pending' && 'bg-gray-50 border-gray-200',
                            item.status === 'skip' && 'bg-gray-50 border-gray-200'
                          )}
                        >
                          <div className="text-xs font-medium uppercase text-gray-500 mb-1">
                            {item.name}
                          </div>
                          <div className="flex items-center justify-center gap-1">
                            {item.status === 'pass' && (
                              <Icon name="check_circle" size="sm" className="text-green-600" />
                            )}
                            {item.status === 'fail' && (
                              <Icon name="cancel" size="sm" className="text-red-600" />
                            )}
                            {item.status === 'pending' && (
                              <Icon name="schedule" size="sm" className="text-gray-400" />
                            )}
                            {item.status === 'skip' && (
                              <Icon name="block" size="sm" className="text-gray-400" />
                            )}
                            <span
                              className={clsx(
                                'text-sm font-medium uppercase',
                                item.status === 'pass' && 'text-green-700',
                                item.status === 'fail' && 'text-red-700',
                                item.status === 'pending' && 'text-gray-500',
                                item.status === 'skip' && 'text-gray-500'
                              )}
                            >
                              {item.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Coverage Metrics */}
                  {validationSummary.coverage && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-500 mb-3">Coverage Metrics</h3>
                      <div className="space-y-2">
                        {(['lines', 'branches', 'functions'] as const).map((metric) => {
                          const data = validationSummary.coverage?.[metric as keyof CoverageMetrics];
                          if (!data || typeof data !== 'object' || !('pct' in data)) return null;
                          const coverageData = data as { pct: number; met: boolean };
                          return (
                            <div key={metric} className="flex items-center gap-3">
                              <span className="text-xs text-gray-500 w-20 capitalize">{metric}</span>
                              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                  className={clsx(
                                    'h-full rounded-full transition-all',
                                    coverageData.met ? 'bg-green-500' : 'bg-amber-500'
                                  )}
                                  style={{ width: `${Math.min(100, coverageData.pct)}%` }}
                                />
                              </div>
                              <span
                                className={clsx(
                                  'text-xs font-medium w-12 text-right',
                                  coverageData.met ? 'text-green-600' : 'text-amber-600'
                                )}
                              >
                                {coverageData.pct.toFixed(1)}%
                              </span>
                              {coverageData.met ? (
                                <Icon name="check" size="xs" className="text-green-500" />
                              ) : (
                                <Icon name="close" size="xs" className="text-amber-500" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* MATOP Execution Panel */}
                  {validationSummary.matop && (
                    <div className="border rounded-lg overflow-hidden">
                      <button
                        onClick={() => togglePanel('matop')}
                        className="w-full px-4 py-3 bg-gray-50 flex items-center justify-between hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Icon name="smart_toy" size="sm" className="text-purple-500" />
                          <span className="text-sm font-medium">MATOP Execution</span>
                          <span
                            className={clsx(
                              'px-2 py-0.5 text-xs font-medium rounded',
                              validationSummary.matop.consensusVerdict === 'PASS' &&
                                'bg-green-100 text-green-700',
                              validationSummary.matop.consensusVerdict === 'WARN' &&
                                'bg-yellow-100 text-yellow-700',
                              validationSummary.matop.consensusVerdict === 'FAIL' &&
                                'bg-red-100 text-red-700'
                            )}
                          >
                            {validationSummary.matop.consensusVerdict}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          {validationSummary.matop.gatesExecuted.passed}/
                          {validationSummary.matop.gatesExecuted.total} gates
                          <Icon
                            name={expandedPanels.matop ? 'expand_less' : 'expand_more'}
                            size="sm"
                          />
                        </div>
                      </button>
                      {expandedPanels.matop && (
                        <div className="p-4 space-y-3">
                          <div className="grid grid-cols-3 gap-3 text-center">
                            <div className="bg-green-50 rounded-lg p-2">
                              <div className="text-lg font-bold text-green-700">
                                {validationSummary.matop.gatesExecuted.passed}
                              </div>
                              <div className="text-xs text-green-600">Passed</div>
                            </div>
                            <div className="bg-yellow-50 rounded-lg p-2">
                              <div className="text-lg font-bold text-yellow-700">
                                {validationSummary.matop.gatesExecuted.warned}
                              </div>
                              <div className="text-xs text-yellow-600">Warned</div>
                            </div>
                            <div className="bg-red-50 rounded-lg p-2">
                              <div className="text-lg font-bold text-red-700">
                                {validationSummary.matop.gatesExecuted.failed}
                              </div>
                              <div className="text-xs text-red-600">Failed</div>
                            </div>
                          </div>
                          {Object.keys(validationSummary.matop.stoaResults).length > 0 && (
                            <div>
                              <div className="text-xs font-medium text-gray-500 mb-2">
                                STOA Verdicts
                              </div>
                              <div className="space-y-1">
                                {Object.entries(validationSummary.matop.stoaResults).map(
                                  ([stoa, result]) => (
                                    <div
                                      key={stoa}
                                      className="flex items-center justify-between text-sm"
                                    >
                                      <span className="text-gray-700">{stoa}</span>
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs text-gray-400">{result.role}</span>
                                        <span
                                          className={clsx(
                                            'px-2 py-0.5 text-xs rounded',
                                            result.verdict === 'PASS' &&
                                              'bg-green-100 text-green-700',
                                            result.verdict === 'WARN' &&
                                              'bg-yellow-100 text-yellow-700',
                                            result.verdict === 'FAIL' && 'bg-red-100 text-red-700'
                                          )}
                                        >
                                          {result.verdict}
                                        </span>
                                      </div>
                                    </div>
                                  )
                                )}
                              </div>
                            </div>
                          )}
                          <div className="text-xs text-gray-400">
                            Run ID: {validationSummary.matop.runId}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* KPI Results Panel */}
                  {validationSummary.kpis.total > 0 && (
                    <div className="border rounded-lg overflow-hidden">
                      <button
                        onClick={() => togglePanel('kpis')}
                        className="w-full px-4 py-3 bg-gray-50 flex items-center justify-between hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Icon name="my_location" size="sm" className="text-blue-500" />
                          <span className="text-sm font-medium">KPI Results</span>
                          <span
                            className={clsx(
                              'px-2 py-0.5 text-xs font-medium rounded',
                              validationSummary.kpis.met === validationSummary.kpis.total
                                ? 'bg-green-100 text-green-700'
                                : 'bg-amber-100 text-amber-700'
                            )}
                          >
                            {validationSummary.kpis.met}/{validationSummary.kpis.total}
                          </span>
                        </div>
                        <Icon
                          name={expandedPanels.kpis ? 'expand_less' : 'expand_more'}
                          size="sm"
                          className="text-gray-400"
                        />
                      </button>
                      {expandedPanels.kpis && (
                        <div className="p-4">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-xs text-gray-500">
                                <th className="pb-2">KPI</th>
                                <th className="pb-2">Target</th>
                                <th className="pb-2">Actual</th>
                                <th className="pb-2 text-center">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {validationSummary.kpis.results.map((kpi, idx) => (
                                <tr key={idx} className="border-t">
                                  <td className="py-2 text-gray-700">{kpi.kpi}</td>
                                  <td className="py-2 text-gray-500 font-mono text-xs">
                                    {kpi.target}
                                  </td>
                                  <td className="py-2 text-gray-700 font-mono text-xs">
                                    {kpi.actual}
                                  </td>
                                  <td className="py-2 text-center">
                                    {kpi.met ? (
                                      <Icon name="check_circle" size="sm" className="text-green-500" />
                                    ) : (
                                      <Icon name="cancel" size="sm" className="text-red-500" />
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* DoD Results Panel */}
                  {validationSummary.dod.total > 0 && (
                    <div className="border rounded-lg overflow-hidden">
                      <button
                        onClick={() => togglePanel('dod')}
                        className="w-full px-4 py-3 bg-gray-50 flex items-center justify-between hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Icon name="checklist" size="sm" className="text-green-500" />
                          <span className="text-sm font-medium">Definition of Done</span>
                          <span
                            className={clsx(
                              'px-2 py-0.5 text-xs font-medium rounded',
                              validationSummary.dod.met === validationSummary.dod.total
                                ? 'bg-green-100 text-green-700'
                                : 'bg-amber-100 text-amber-700'
                            )}
                          >
                            {validationSummary.dod.met}/{validationSummary.dod.total}
                          </span>
                        </div>
                        <Icon
                          name={expandedPanels.dod ? 'expand_less' : 'expand_more'}
                          size="sm"
                          className="text-gray-400"
                        />
                      </button>
                      {expandedPanels.dod && (
                        <div className="p-4 space-y-2">
                          {validationSummary.dod.items.map((item, idx) => (
                            <div
                              key={idx}
                              className={clsx(
                                'flex items-start gap-3 p-2 rounded',
                                item.met ? 'bg-green-50' : 'bg-red-50'
                              )}
                            >
                              {item.met ? (
                                <Icon name="check_circle" size="sm" className="text-green-500 mt-0.5" />
                              ) : (
                                <Icon name="cancel" size="sm" className="text-red-500 mt-0.5" />
                              )}
                              <div>
                                <div className="text-sm text-gray-700">{item.criterion}</div>
                                {item.evidence && (
                                  <div className="text-xs text-gray-500 mt-1">{item.evidence}</div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Document Previews */}
                  {(validationSummary.spec.exists || validationSummary.plan.exists) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Spec Preview */}
                      {validationSummary.spec.exists && (
                        <div className="border rounded-lg overflow-hidden">
                          <button
                            onClick={() => togglePanel('spec')}
                            className="w-full px-4 py-3 bg-gray-50 flex items-center justify-between hover:bg-gray-100 transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              <Icon name="description" size="sm" className="text-purple-500" />
                              <span className="text-sm font-medium">Specification</span>
                              <Icon name="check_circle" size="xs" className="text-green-500" />
                            </div>
                            <Icon
                              name={expandedPanels.spec ? 'expand_less' : 'expand_more'}
                              size="sm"
                              className="text-gray-400"
                            />
                          </button>
                          {expandedPanels.spec && (
                            <div className="p-4 space-y-2">
                              {validationSummary.spec.title && (
                                <div className="font-medium text-sm">
                                  {validationSummary.spec.title}
                                </div>
                              )}
                              {validationSummary.spec.sections &&
                                validationSummary.spec.sections.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {validationSummary.spec.sections.slice(0, 5).map((section, idx) => (
                                      <span
                                        key={idx}
                                        className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs"
                                      >
                                        {section}
                                      </span>
                                    ))}
                                    {validationSummary.spec.sections.length > 5 && (
                                      <span className="text-xs text-gray-400">
                                        +{validationSummary.spec.sections.length - 5} more
                                      </span>
                                    )}
                                  </div>
                                )}
                              {validationSummary.spec.path && (
                                <div className="text-xs text-gray-400 font-mono truncate">
                                  {validationSummary.spec.path}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Plan Preview */}
                      {validationSummary.plan.exists && (
                        <div className="border rounded-lg overflow-hidden">
                          <button
                            onClick={() => togglePanel('plan')}
                            className="w-full px-4 py-3 bg-gray-50 flex items-center justify-between hover:bg-gray-100 transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              <Icon name="task_alt" size="sm" className="text-blue-500" />
                              <span className="text-sm font-medium">Implementation Plan</span>
                              <Icon name="check_circle" size="xs" className="text-green-500" />
                            </div>
                            <Icon
                              name={expandedPanels.plan ? 'expand_less' : 'expand_more'}
                              size="sm"
                              className="text-gray-400"
                            />
                          </button>
                          {expandedPanels.plan && (
                            <div className="p-4 space-y-2">
                              {validationSummary.plan.title && (
                                <div className="font-medium text-sm">
                                  {validationSummary.plan.title}
                                </div>
                              )}
                              {validationSummary.plan.sections &&
                                validationSummary.plan.sections.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {validationSummary.plan.sections.slice(0, 5).map((section, idx) => (
                                      <span
                                        key={idx}
                                        className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs"
                                      >
                                        {section}
                                      </span>
                                    ))}
                                    {validationSummary.plan.sections.length > 5 && (
                                      <span className="text-xs text-gray-400">
                                        +{validationSummary.plan.sections.length - 5} more
                                      </span>
                                    )}
                                  </div>
                                )}
                              {validationSummary.plan.path && (
                                <div className="text-xs text-gray-400 font-mono truncate">
                                  {validationSummary.plan.path}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Attestation Summary */}
                  {validationSummary.attestation.exists && (
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Icon name="workspace_premium" size="sm" className="text-amber-500" />
                        <span className="text-sm font-medium">Attestation</span>
                        <span
                          className={clsx(
                            'px-2 py-0.5 text-xs font-medium rounded',
                            validationSummary.attestation.verdict === 'COMPLETE'
                              ? 'bg-green-100 text-green-700'
                              : validationSummary.attestation.verdict === 'INCOMPLETE'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-red-100 text-red-700'
                          )}
                        >
                          {validationSummary.attestation.verdict}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        {validationSummary.attestation.artifactsVerified !== undefined && (
                          <span>{validationSummary.attestation.artifactsVerified} artifacts</span>
                        )}
                        {validationSummary.attestation.gatesPassed !== undefined && (
                          <span>{validationSummary.attestation.gatesPassed} gates passed</span>
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-gray-50 rounded-lg p-8 text-center">
                  <p className="text-gray-500">No validation data available for this task.</p>
                  <p className="text-sm text-gray-400 mt-2">
                    Validation data is generated when a task has an attestation file.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 px-6 py-4 flex items-center justify-between border-t border-gray-200">
          <div className="flex items-center gap-2">
            {/* Generate Spec & Plan - Show when loading OR when not planned */}
            {(loadingPlanStatus || (planStatus && !planStatus.isPlanned)) && (
              <button
                onClick={handleGeneratePlan}
                disabled={actionLoading === 'plan' || loadingPlanStatus}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg flex items-center gap-2 text-sm disabled:opacity-50 transition-colors"
              >
                {actionLoading === 'plan' || loadingPlanStatus ? (
                  <Icon name="progress_activity" size="sm" className="animate-spin" />
                ) : (
                  <Icon name="note_add" size="sm" />
                )}
                {loadingPlanStatus ? 'Checking...' : 'Generate Spec & Plan'}
              </button>
            )}

            {/* Show badge if already planned */}
            {planStatus?.isPlanned && (
              <span className="px-3 py-2 bg-green-100 text-green-700 rounded-lg flex items-center gap-2 text-sm">
                <Icon name="check_circle" size="sm" />
                Spec & Plan exists
              </span>
            )}

            {/* Generate Implementation Prompt */}
            <button
              onClick={handleGeneratePrompt}
              disabled={actionLoading === 'prompt'}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 text-sm disabled:opacity-50 transition-colors"
            >
              {actionLoading === 'prompt' ? (
                <Icon name="progress_activity" size="sm" className="animate-spin" />
              ) : (
                <Icon name="description" size="sm" />
              )}
              Generate Prompt
            </button>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
