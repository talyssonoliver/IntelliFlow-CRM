'use client';

/**
 * Agent Approvals Preview Page — IFC-149 + IFC-139 Integration
 *
 * Wired to backend tRPC endpoints (agent router):
 * - agent.getPendingApprovals — pending tool actions
 * - agent.getPendingCount — badge count
 * - agent.approveAction — approve pending action
 * - agent.rejectAction — reject pending action
 */

import Link from 'next/link';
import { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, Button } from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import type { AgentAction, ActionStatus } from '@/lib/agent';

// Material Symbols icon helper component
const Icon = ({ name, className = '' }: Readonly<{ name: string; className?: string }>) => (
  <span className={`material-symbols-outlined ${className}`} aria-hidden="true">
    {name}
  </span>
);

// =============================================================================
// Backend → Frontend Data Mapping
// =============================================================================

interface PendingActionFromAPI {
  id: string;
  toolName: string;
  actionType: string;
  entityType: string;
  preview: {
    summary: string;
    changes: Array<{
      field: string;
      previousValue: unknown;
      newValue: unknown;
      changeType: 'ADD' | 'MODIFY' | 'DELETE';
    }>;
    affectedEntities: Array<{ type: string; id: string; name: string; action: string }>;
    warnings?: string[];
    estimatedImpact?: 'LOW' | 'MEDIUM' | 'HIGH';
  };
  createdAt: Date | string;
  expiresAt: Date | string;
  status: string;
}

function formatToolName(toolName: string): string {
  return toolName
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function mapPendingToAction(pending: PendingActionFromAPI): AgentAction {
  const previousState: Record<string, unknown> = {};
  const proposedState: Record<string, unknown> = {};
  for (const change of pending.preview.changes) {
    previousState[change.field] = change.previousValue;
    proposedState[change.field] = change.newValue;
  }

  const statusMap: Record<string, ActionStatus> = {
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    EXPIRED: 'expired',
  };

  const impactToConfidence: Record<string, number> = {
    HIGH: 90,
    MEDIUM: 70,
    LOW: 50,
  };

  const agentName = formatToolName(pending.toolName);
  const primaryEntity = pending.preview.affectedEntities[0];

  return {
    id: pending.id,
    actionType: pending.actionType.toLowerCase() as AgentAction['actionType'],
    entityId: primaryEntity?.id || '',
    entityType: pending.entityType.toLowerCase(),
    entityName: primaryEntity?.name || `${pending.entityType} action`,
    previousState,
    proposedState,
    description: pending.preview.summary,
    aiReasoning: pending.preview.warnings?.length
      ? pending.preview.warnings.join('. ')
      : `Automated action via ${agentName}`,
    confidenceScore: impactToConfidence[pending.preview.estimatedImpact || ''] || 0,
    status: statusMap[pending.status] || 'pending',
    agentId: pending.toolName,
    agentName: agentName || 'AI Agent',
    createdAt:
      typeof pending.createdAt === 'string' ? new Date(pending.createdAt) : pending.createdAt,
    expiresAt:
      typeof pending.expiresAt === 'string' ? new Date(pending.expiresAt) : pending.expiresAt,
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

interface DiffChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  type: 'added' | 'removed' | 'changed';
}

function calculateDiff(
  oldState: Record<string, unknown>,
  newState: Record<string, unknown>
): DiffChange[] {
  const changes: DiffChange[] = [];
  const allKeys = new Set([...Object.keys(oldState), ...Object.keys(newState)]);

  for (const key of allKeys) {
    const oldVal = oldState[key];
    const newVal = newState[key];

    if (oldVal === undefined && newVal !== undefined) {
      changes.push({ field: key, oldValue: null, newValue: newVal, type: 'added' });
    } else if (oldVal !== undefined && newVal === undefined) {
      changes.push({ field: key, oldValue: oldVal, newValue: null, type: 'removed' });
    } else if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes.push({ field: key, oldValue: oldVal, newValue: newVal, type: 'changed' });
    }
  }

  return changes;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

function formatTimeRemaining(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (diffMs <= 0) return 'Expired';
  if (diffHours > 0) return `${diffHours}h ${diffMins}m`;
  return `${diffMins}m`;
}

function getChangeTypeClassName(type: 'added' | 'removed' | 'changed'): string {
  switch (type) {
    case 'added':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    case 'removed':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    case 'changed':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
  }
}

function getStatusBadge(status: ActionStatus): {
  label: string;
  className: string;
  icon: React.ReactNode;
} {
  switch (status) {
    case 'pending':
      return {
        label: 'Pending Review',
        className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
        icon: <Icon name="schedule" className="text-xs" />,
      };
    case 'approved':
      return {
        label: 'Approved',
        className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
        icon: <Icon name="check" className="text-xs" />,
      };
    case 'rejected':
      return {
        label: 'Rejected',
        className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
        icon: <Icon name="close" className="text-xs" />,
      };
    case 'rolled_back':
      return {
        label: 'Rolled Back',
        className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
        icon: <Icon name="history" className="text-xs" />,
      };
    case 'modified':
      return {
        label: 'Modified',
        className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
        icon: <Icon name="edit" className="text-xs" />,
      };
    case 'expired':
      return {
        label: 'Expired',
        className: 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400',
        icon: <Icon name="warning" className="text-xs" />,
      };
    default:
      return {
        label: status,
        className: 'bg-slate-100 text-slate-800',
        icon: null,
      };
  }
}

function getConfidenceBadge(score: number): {
  label: string;
  className: string;
} {
  if (score >= 80) {
    return {
      label: 'High Confidence',
      className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    };
  }
  if (score >= 60) {
    return {
      label: 'Medium Confidence',
      className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    };
  }
  if (score > 0) {
    return {
      label: 'Low Confidence',
      className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    };
  }
  return {
    label: '',
    className: '',
  };
}

// =============================================================================
// Components
// =============================================================================

interface DiffViewProps {
  readonly previousState: Record<string, unknown>;
  readonly proposedState: Record<string, unknown>;
}

function DiffView({ previousState, proposedState }: DiffViewProps) {
  const changes = calculateDiff(previousState, proposedState);

  if (changes.length === 0) {
    return (
      <div className="text-sm text-slate-500 dark:text-slate-400 italic">No changes detected</div>
    );
  }

  return (
    <div className="space-y-3" data-testid="diff-view">
      {changes.map((change) => (
        <div
          key={change.field}
          className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3"
          data-testid="diff-change"
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="font-medium text-slate-900 dark:text-white text-sm">
              {change.field}
            </span>
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium ${getChangeTypeClassName(change.type)}`}
            >
              {change.type}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-slate-500 dark:text-slate-400 block mb-1">Before</span>
              <pre className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-2 overflow-x-auto text-red-800 dark:text-red-300">
                {formatValue(change.oldValue)}
              </pre>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400 block mb-1">After</span>
              <pre className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded p-2 overflow-x-auto text-green-800 dark:text-green-300">
                {formatValue(change.newValue)}
              </pre>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

interface ActionCardProps {
  readonly action: AgentAction;
  readonly onApprove: (id: string) => void;
  readonly onReject: (id: string, feedback: string) => void;
  readonly isExpanded: boolean;
  readonly onToggleExpand: () => void;
  readonly isLoading: boolean;
}

function ActionCard({
  action,
  onApprove,
  onReject,
  isExpanded,
  onToggleExpand,
  isLoading,
}: ActionCardProps) {
  const [feedback, setFeedback] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);

  const statusBadge = getStatusBadge(action.status);
  const confidenceBadge = getConfidenceBadge(action.confidenceScore);
  const isPending = action.status === 'pending';

  const handleReject = () => {
    if (feedback.trim()) {
      onReject(action.id, feedback);
      setFeedback('');
      setShowRejectForm(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <button
        type="button"
        className="w-full text-left p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
        onClick={onToggleExpand}
        aria-expanded={isExpanded}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            {/* Agent Icon */}
            <div className="w-10 h-10 rounded-full bg-[#137fec]/10 flex items-center justify-center flex-shrink-0">
              <Icon name="smart_toy" className="text-xl text-[#137fec]" />
            </div>

            {/* Action Info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h3 className="font-semibold text-slate-900 dark:text-white truncate">
                  {action.description}
                </h3>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge.className}`}
                >
                  {statusBadge.icon}
                  {statusBadge.label}
                </span>
              </div>

              <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1">
                  <Icon name="bolt" className="text-sm" />
                  {action.agentName}
                </span>
                <span className="flex items-center gap-1" data-testid="relative-time">
                  <Icon name="schedule" className="text-sm" />
                  {formatTimeAgo(action.createdAt)}
                </span>
                {isPending && (
                  <span
                    className="flex items-center gap-1 text-amber-600 dark:text-amber-400"
                    data-testid="expires-time"
                  >
                    <Icon name="warning" className="text-sm" />
                    Expires in {formatTimeRemaining(action.expiresAt)}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Target: {action.entityType}
                </span>
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  {action.entityName}
                </span>
              </div>
            </div>
          </div>

          {/* Confidence + Expand */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {action.confidenceScore > 0 && (
              <div className="text-right">
                <div className="text-lg font-bold text-slate-900 dark:text-white">
                  {action.confidenceScore}%
                </div>
                {confidenceBadge.label && (
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${confidenceBadge.className}`}
                  >
                    {confidenceBadge.label}
                  </span>
                )}
              </div>
            )}
            {isExpanded ? (
              <Icon name="expand_less" className="text-xl text-slate-400" />
            ) : (
              <Icon name="expand_more" className="text-xl text-slate-400" />
            )}
          </div>
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-slate-200 dark:border-slate-700">
          {/* AI Reasoning */}
          <div
            className="p-4 bg-blue-50 dark:bg-blue-900/20 border-b border-slate-200 dark:border-slate-700"
            data-testid="action-card-expanded"
          >
            <div className="flex items-start gap-2">
              <Icon
                name="shield"
                className="text-base text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0"
              />
              <div>
                <h4 className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-1">
                  AI Reasoning
                </h4>
                <p
                  className="text-sm text-blue-800 dark:text-blue-300"
                  data-testid="ai-reasoning-content"
                >
                  {action.aiReasoning}
                </p>
              </div>
            </div>
          </div>

          {/* Diff View */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-700">
            <h4 className="text-sm font-medium text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <Icon name="visibility" className="text-base" />
              Proposed Changes
            </h4>
            <DiffView previousState={action.previousState} proposedState={action.proposedState} />
          </div>

          {/* Action Buttons */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/30">
            {isPending && !showRejectForm && (
              <div className="flex items-center gap-3">
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    onApprove(action.id);
                  }}
                  disabled={isLoading}
                  className="gap-2"
                >
                  <Icon name="check" className="text-base" />
                  Approve
                </Button>
                <Button
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowRejectForm(true);
                  }}
                  disabled={isLoading}
                  className="gap-2"
                >
                  <Icon name="close" className="text-base" />
                  Reject
                </Button>
              </div>
            )}

            {isPending && showRejectForm && (
              <div className="space-y-3">
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Please provide a reason for rejection..."
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#137fec] resize-none"
                  rows={3}
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="flex items-center gap-2">
                  <Button
                    variant="destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleReject();
                    }}
                    disabled={!feedback.trim() || isLoading}
                    className="gap-2"
                  >
                    <Icon name="close" className="text-base" />
                    Confirm Rejection
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowRejectForm(false);
                      setFeedback('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {(action.status === 'rejected' || action.status === 'modified') && action.feedback && (
              <div className="text-sm">
                <span className="text-slate-500 dark:text-slate-400">Feedback: </span>
                <span className="text-slate-700 dark:text-slate-300">{action.feedback}</span>
              </div>
            )}

            {action.status === 'expired' && (
              <div className="text-sm text-slate-500 dark:text-slate-400">
                This action expired without review and was not applied.
              </div>
            )}

            {action.status === 'approved' && (
              <div className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                <Icon name="check_circle" className="text-base" />
                Action approved{action.reviewedAt && ` ${formatTimeAgo(action.reviewedAt)}`}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

// =============================================================================
// Metrics
// =============================================================================

function MetricsLoadingSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-4" data-testid="metrics-dashboard">
      {[1, 2, 3, 4].map((i) => (
        <Card key={i} className="p-4 animate-pulse">
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-20 mb-2" />
          <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-12" />
        </Card>
      ))}
    </div>
  );
}

interface MetricsSectionProps {
  readonly actions: AgentAction[];
  readonly pendingCount: number;
  readonly isLoading: boolean;
}

function MetricsSection({ actions, pendingCount, isLoading }: MetricsSectionProps) {
  if (isLoading) return <MetricsLoadingSkeleton />;

  const expiringSoon = actions.filter((a) => {
    if (a.status !== 'pending') return false;
    const hoursLeft = (a.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60);
    return hoursLeft < 2;
  }).length;

  const highImpact = actions.filter((a) => a.confidenceScore >= 80).length;

  return (
    <div className="grid gap-4 md:grid-cols-4" data-testid="metrics-dashboard">
      <Card className="p-4" data-testid="metric-pending">
        <div className="text-sm text-slate-500 dark:text-slate-400 mb-1">Pending Review</div>
        <div className="text-2xl font-bold text-amber-600" data-testid="metric-value">
          {pendingCount}
        </div>
      </Card>

      <Card className="p-4" data-testid="metric-loaded">
        <div className="text-sm text-slate-500 dark:text-slate-400 mb-1">Actions Loaded</div>
        <div
          className="text-2xl font-bold text-slate-900 dark:text-white"
          data-testid="metric-value"
        >
          {actions.length}
        </div>
      </Card>

      <Card className="p-4" data-testid="metric-expiring">
        <div className="text-sm text-slate-500 dark:text-slate-400 mb-1">Expiring Soon</div>
        <div className="text-2xl font-bold text-red-600" data-testid="metric-value">
          {expiringSoon}
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400">Within 2 hours</div>
      </Card>

      <Card className="p-4" data-testid="metric-highimpact">
        <div className="text-sm text-slate-500 dark:text-slate-400 mb-1">High Impact</div>
        <div className="text-2xl font-bold text-[#137fec]" data-testid="metric-value">
          {highImpact}
        </div>
      </Card>
    </div>
  );
}

// =============================================================================
// Main Page Component
// =============================================================================

function AgentApprovalsPreviewContent() {
  const searchParams = useSearchParams();
  const actionIdFromUrl = searchParams.get('actionId');
  const { isAuthenticated, isLoading: authLoading } = useRequireAuth();

  const [expandedActionId, setExpandedActionId] = useState<string | null>(actionIdFromUrl);
  const [filterStatus, setFilterStatus] = useState<ActionStatus | 'all'>('all');
  const [highlightedActionId, setHighlightedActionId] = useState<string | null>(null);

  // ==========================================================================
  // tRPC Queries — WIRED TO BACKEND
  // ==========================================================================

  const pendingQuery = trpc.agent.getPendingApprovals.useQuery(undefined, {
    enabled: isAuthenticated && !authLoading,
    refetchInterval: 30000,
  });

  const countQuery = trpc.agent.getPendingCount.useQuery(undefined, {
    enabled: isAuthenticated && !authLoading,
    refetchInterval: 30000,
  });

  // ==========================================================================
  // tRPC Mutations — WIRED TO BACKEND
  // ==========================================================================

  const approveMutation = trpc.agent.approveAction.useMutation({
    onSuccess: () => {
      pendingQuery.refetch();
      countQuery.refetch();
    },
  });

  const rejectMutation = trpc.agent.rejectAction.useMutation({
    onSuccess: () => {
      pendingQuery.refetch();
      countQuery.refetch();
    },
  });

  // ==========================================================================
  // Transform API data → AgentAction[]
  // ==========================================================================

  const actions = useMemo(() => {
    if (!pendingQuery.data) return [];
    return (pendingQuery.data as PendingActionFromAPI[]).map(mapPendingToAction);
  }, [pendingQuery.data]);

  const filteredActions = useMemo(() => {
    if (filterStatus === 'all') return actions;
    return actions.filter((action) => action.status === filterStatus);
  }, [actions, filterStatus]);

  const pendingCount = countQuery.data?.count ?? actions.filter((a) => a.status === 'pending').length;

  // Auto-expand action if actionId is provided in URL (from timeline navigation)
  useEffect(() => {
    if (actionIdFromUrl) {
      setExpandedActionId(actionIdFromUrl);
      setHighlightedActionId(actionIdFromUrl);

      const timer = setTimeout(() => {
        setHighlightedActionId(null);
      }, 3000);

      setTimeout(() => {
        const element = document.getElementById(`action-card-${actionIdFromUrl}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [actionIdFromUrl]);

  // ==========================================================================
  // Handlers — WIRED TO tRPC MUTATIONS
  // ==========================================================================

  const handleApprove = useCallback(
    async (actionId: string) => {
      try {
        await approveMutation.mutateAsync({ actionId });
      } catch (error) {
        console.error('Failed to approve:', error);
      }
    },
    [approveMutation]
  );

  const handleReject = useCallback(
    async (actionId: string, feedback: string) => {
      try {
        await rejectMutation.mutateAsync({ actionId, reason: feedback });
      } catch (error) {
        console.error('Failed to reject:', error);
      }
    },
    [rejectMutation]
  );

  const handleRefresh = useCallback(async () => {
    await Promise.all([pendingQuery.refetch(), countQuery.refetch()]);
  }, [pendingQuery, countQuery]);

  // ==========================================================================
  // Loading & Error States
  // ==========================================================================

  const isLoading = authLoading || pendingQuery.isLoading;
  const isMutating = approveMutation.isPending || rejectMutation.isPending;

  if (pendingQuery.error && !isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <h2 className="text-red-800 dark:text-red-200 font-medium">
            Error loading pending actions
          </h2>
          <p className="text-red-600 dark:text-red-400 text-sm mt-1">
            {pendingQuery.error.message}
          </p>
          <button
            onClick={() => pendingQuery.refetch()}
            className="mt-2 text-sm text-red-700 dark:text-red-300 underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-center py-12">
          <Icon name="hourglass_empty" className="text-4xl text-slate-400 animate-spin" />
          <p className="ml-3 text-slate-600 dark:text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // Render
  // ==========================================================================

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-2">
        <Link href="/dashboard" className="hover:text-[#137fec]">
          Dashboard
        </Link>
        <span>/</span>
        <Link href="/agent-approvals" className="hover:text-[#137fec]">
          Agent Approvals
        </Link>
        <span>/</span>
        <span className="text-slate-900 dark:text-white font-medium">
          {actionIdFromUrl ? 'Review Action' : 'Tool Actions Preview'}
        </span>
      </nav>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
            Agent Tool Actions
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-base">
            Review and approve AI agent-initiated tool actions before they are applied
          </p>
        </div>
        <div className="flex items-center gap-3">
          {pendingCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 text-sm font-medium">
              <Icon name="schedule" className="text-base" />
              {pendingCount} pending
            </span>
          )}
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={isLoading}
            className="gap-2"
          >
            <Icon name="refresh" className={`text-base ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Metrics */}
      <MetricsSection actions={actions} pendingCount={pendingCount} isLoading={isLoading} />

      {/* Filters */}
      <Card className="p-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Icon name="filter_list" className="text-base text-slate-400" />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Filter:</span>
          </div>
          <div className="flex flex-wrap gap-2" data-testid="filter-buttons">
            {(['all', 'pending', 'approved', 'rejected', 'expired'] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setFilterStatus(status)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filterStatus === status
                    ? 'bg-[#137fec] text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Actions List */}
      <div className="space-y-4">
        {isLoading && (
          <Card className="p-12">
            <div className="flex flex-col items-center justify-center">
              <Icon name="hourglass_empty" className="text-4xl text-slate-400 animate-spin mb-4" />
              <p className="text-slate-600 dark:text-slate-400">Loading pending actions...</p>
            </div>
          </Card>
        )}
        {!isLoading && filteredActions.length === 0 && (
          <Card className="p-12">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
                <Icon name="smart_toy" className="text-3xl text-slate-400" />
              </div>
              <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-1">
                No actions found
              </h3>
              <p className="text-slate-500 dark:text-slate-400 max-w-sm">
                {filterStatus === 'all'
                  ? 'No pending agent tool actions to review. Actions appear here when AI agents propose CRM changes that require human approval.'
                  : `No ${filterStatus} actions found. Try a different filter.`}
              </p>
            </div>
          </Card>
        )}
        {!isLoading &&
          filteredActions.length > 0 &&
          filteredActions.map((action) => (
            <div
              key={action.id}
              id={`action-card-${action.id}`}
              data-testid={`action-card-${action.id}`}
              data-status={action.status}
              className={`transition-all duration-500 ${
                highlightedActionId === action.id
                  ? 'ring-2 ring-[#137fec] ring-offset-2 rounded-lg'
                  : ''
              }`}
            >
              <ActionCard
                action={action}
                onApprove={handleApprove}
                onReject={handleReject}
                isExpanded={expandedActionId === action.id}
                onToggleExpand={() =>
                  setExpandedActionId(expandedActionId === action.id ? null : action.id)
                }
                isLoading={isMutating}
              />
            </div>
          ))}
      </div>

      {/* Connection Status */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-2 h-2 rounded-full ${isAuthenticated ? 'bg-green-500' : 'bg-red-500'}`}
            />
            <div>
              <h3 className="text-sm font-medium text-slate-900 dark:text-white">
                Backend Connection
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isAuthenticated
                  ? 'Connected to agent.getPendingApprovals • Auto-refresh every 30s'
                  : 'Not authenticated'}
              </p>
            </div>
          </div>
          <Link href="/agent-approvals/history">
            <Button variant="outline" size="sm" className="gap-2">
              <Icon name="history" className="text-base" />
              View History
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}

// Loading fallback
function PreviewLoadingFallback() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-600">Loading approvals...</p>
      </div>
    </div>
  );
}

// Page component with Suspense boundary
export default function AgentApprovalsPreviewPage() {
  return (
    <Suspense fallback={<PreviewLoadingFallback />}>
      <AgentApprovalsPreviewContent />
    </Suspense>
  );
}
