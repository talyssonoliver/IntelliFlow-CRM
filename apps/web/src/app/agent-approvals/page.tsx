'use client';

/**
 * Agent Approvals Page - IFC-029 + IFC-149 Integration
 *
 * Real-time approval queue for AI auto-response drafts.
 * Wired to backend tRPC endpoints (autoResponse router).
 *
 * IMPLEMENTS:
 * - IFC-029: Auto-Response with Approval Gate (backend)
 * - IFC-149: Action preview and rollback UI (frontend integration)
 */

import Link from 'next/link';
import { useState, useMemo, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, Button, toast } from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { AssignSheet } from '@/components/shared/assign-sheet';
import type { AgentAction, ActionStatus } from '@/lib/agent';

// Material Symbols icon helper component
const Icon = ({ name, className = '' }: Readonly<{ name: string; className?: string }>) => (
  <span className={`material-symbols-outlined ${className}`} aria-hidden="true">
    {name}
  </span>
);

// =============================================================================
// Type Mapping: Backend AutoResponseDraft -> Frontend AgentAction
// =============================================================================

interface AutoResponseDraftFromAPI {
  id: string;
  leadId: string;
  subject: string;
  body?: string;
  status: string;
  aiConfidence: number;
  triggerType: string;
  recipientEmail: string;
  createdAt: Date | string;
  expiresAt: Date | string;
  modelVersion?: string;
  statusHistory?: Array<{
    status: string;
    changedAt: Date | string;
    changedBy?: string;
    reason?: string;
  }>;
  approvalDecision?: {
    decision: string;
    decidedBy: string;
    decidedAt: Date | string;
    reason?: string;
    modifications?: { subject?: string; body?: string };
  } | null;
  escalation?: {
    escalatedBy: string;
    escalatedTo: string;
    reason: string;
    escalatedAt: Date | string;
    expiresAt: Date | string;
    resolvedBy?: string;
    resolvedAt?: Date | string;
    feedback?: string;
  } | null;
  escalationCount?: number;
  isExpired?: boolean;
  isPendingApproval?: boolean;
  canBeSent?: boolean;
}

/**
 * Map backend AutoResponseDraft to frontend AgentAction format
 */
function mapDraftToAction(draft: AutoResponseDraftFromAPI): AgentAction {
  const createdAt =
    typeof draft.createdAt === 'string' ? new Date(draft.createdAt) : draft.createdAt;
  const expiresAt =
    typeof draft.expiresAt === 'string' ? new Date(draft.expiresAt) : draft.expiresAt;

  // Map backend status to frontend status
  const statusMap: Record<string, ActionStatus> = {
    DRAFT: 'pending',
    PENDING_APPROVAL: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    ESCALATED: 'escalated',
    SENT: 'approved',
    FAILED: 'rejected',
    INVALIDATED: 'expired',
  };

  return {
    id: draft.id,
    actionType: 'email_draft',
    entityId: draft.leadId,
    entityType: 'lead',
    entityName: `Lead ${draft.leadId.substring(0, 8)}...`,
    previousState: {},
    proposedState: {
      subject: draft.subject,
      body: draft.body || '',
      recipientEmail: draft.recipientEmail,
    },
    description: draft.subject,
    aiReasoning: `AI-generated response with ${Math.round(draft.aiConfidence * 100)}% confidence. Trigger: ${draft.triggerType}`,
    confidenceScore: Math.round(draft.aiConfidence * 100),
    status: statusMap[draft.status] || 'pending',
    agentId: draft.modelVersion || 'auto-response-agent',
    agentName: 'Auto-Response Agent',
    createdAt,
    expiresAt,
    reviewedAt: draft.approvalDecision?.decidedAt
      ? new Date(draft.approvalDecision.decidedAt as string)
      : undefined,
    reviewedBy: draft.approvalDecision?.decidedBy,
    feedback: draft.approvalDecision?.reason,
    escalation: draft.escalation
      ? {
          escalatedBy: draft.escalation.escalatedBy,
          escalatedTo: draft.escalation.escalatedTo,
          reason: draft.escalation.reason,
          escalatedAt: new Date(draft.escalation.escalatedAt as string),
          slaExpiresAt: new Date(draft.escalation.expiresAt as string),
        }
      : undefined,
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

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

const STATUS_BADGE_CONFIG: Record<
  ActionStatus,
  { label: string; className: string; iconName: string }
> = {
  pending: {
    label: 'Pending Review',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    iconName: 'schedule',
  },
  approved: {
    label: 'Approved',
    className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    iconName: 'check',
  },
  modified: {
    label: 'Modified',
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    iconName: 'edit',
  },
  rejected: {
    label: 'Rejected',
    className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    iconName: 'close',
  },
  rolled_back: {
    label: 'Rolled Back',
    className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    iconName: 'history',
  },
  expired: {
    label: 'Expired',
    className: 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400',
    iconName: 'warning',
  },
  escalated: {
    label: 'Escalated',
    className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    iconName: 'arrow_upward',
  },
};

function getStatusBadge(status: ActionStatus): {
  label: string;
  className: string;
  icon: React.ReactNode;
} {
  const config = STATUS_BADGE_CONFIG[status];
  if (config) {
    return {
      label: config.label,
      className: config.className,
      icon: <Icon name={config.iconName} className="text-xs" />,
    };
  }
  return {
    label: status,
    className: 'bg-slate-100 text-slate-800',
    icon: null,
  };
}

function getConfidenceBadge(score: number): { label: string; className: string } {
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
  return {
    label: 'Low Confidence',
    className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  };
}

// =============================================================================
// Components
// =============================================================================

interface ActionCardProps {
  readonly action: AgentAction;
  readonly onApprove: (id: string) => void;
  readonly onReject: (id: string, feedback: string) => void;
  readonly onEscalate: (id: string) => void;
  readonly onRollback: (id: string, reason: string) => void;
  readonly onRegenerate: (id: string) => void;
  readonly isExpanded: boolean;
  readonly onToggleExpand: () => void;
  readonly isLoading: boolean;
}

function ActionCard({
  action,
  onApprove,
  onReject,
  onEscalate,
  onRollback,
  onRegenerate,
  isExpanded,
  onToggleExpand,
  isLoading,
}: ActionCardProps) {
  const [feedback, setFeedback] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [showRollbackForm, setShowRollbackForm] = useState(false);

  const statusBadge = getStatusBadge(action.status);
  const confidenceBadge = getConfidenceBadge(action.confidenceScore);
  const isPending = action.status === 'pending' || action.status === 'escalated';
  const isEscalated = action.status === 'escalated';
  const canRollback = action.status === 'approved';

  const handleReject = () => {
    if (feedback.trim()) {
      onReject(action.id, feedback);
      setFeedback('');
      setShowRejectForm(false);
    }
  };

  const handleRollback = () => {
    if (feedback.trim()) {
      onRollback(action.id, feedback);
      setFeedback('');
      setShowRollbackForm(false);
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
                <h2 className="font-semibold text-slate-900 dark:text-white truncate">
                  {action.description}
                </h2>
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
            <div className="text-right">
              <div className="text-lg font-bold text-slate-900 dark:text-white">
                {action.confidenceScore}%
              </div>
              <span
                className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${confidenceBadge.className}`}
              >
                {confidenceBadge.label}
              </span>
            </div>
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
                <h3 className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-1">
                  AI Reasoning
                </h3>
                <p
                  className="text-sm text-blue-800 dark:text-blue-300"
                  data-testid="ai-reasoning-content"
                >
                  {action.aiReasoning}
                </p>
              </div>
            </div>
          </div>

          {/* Proposed Content */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-700">
            <h3 className="text-sm font-medium text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <Icon name="mail" className="text-base" />
              Proposed Email
            </h3>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 space-y-2">
              <div>
                <span className="text-xs text-slate-500 dark:text-slate-400">Subject:</span>
                <p className="text-sm font-medium text-slate-900 dark:text-white">
                  {(action.proposedState as { subject?: string }).subject}
                </p>
              </div>
              <div>
                <span className="text-xs text-slate-500 dark:text-slate-400">To:</span>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  {(action.proposedState as { recipientEmail?: string }).recipientEmail}
                </p>
              </div>
              <div>
                <span className="text-xs text-slate-500 dark:text-slate-400">Body:</span>
                <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                  {(action.proposedState as { body?: string }).body}
                </p>
              </div>
            </div>
          </div>

          {/* Escalation Banner */}
          {isEscalated && (
            <div className="p-4 bg-orange-50 dark:bg-orange-900/20 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-start gap-2">
                <Icon name="arrow_upward" className="text-base text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <h3 className="text-sm font-medium text-orange-900 dark:text-orange-200">
                    Escalated for Manager Review
                  </h3>
                  {action.escalation ? (
                    <div className="space-y-1.5">
                      <p className="text-sm text-orange-800 dark:text-orange-300">
                        <span className="font-medium">Reason:</span>{' '}{action.escalation.reason}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-orange-700 dark:text-orange-400">
                        <span className="flex items-center gap-1">
                          <Icon name="schedule" className="text-xs" />
                          SLA: {formatTimeRemaining(action.escalation.slaExpiresAt)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Icon name="calendar_today" className="text-xs" />
                          Escalated {formatTimeAgo(action.escalation.escalatedAt)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-orange-800 dark:text-orange-300">
                      This item was escalated and requires a manager&apos;s decision.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

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
                  Approve & Send
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
                {!isEscalated && (
                  <Button
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEscalate(action.id);
                    }}
                    disabled={isLoading}
                    className="gap-2 ml-auto"
                  >
                    <Icon name="arrow_upward" className="text-base" />
                    Escalate
                  </Button>
                )}
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

            {/* Rollback Button - only for approved items */}
            {canRollback && !showRollbackForm && (
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowRollbackForm(true);
                  }}
                  disabled={isLoading}
                  className="gap-2"
                >
                  <Icon name="history" className="text-base" />
                  Rollback
                </Button>
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  Action was approved {action.reviewedAt && formatTimeAgo(action.reviewedAt)}
                </span>
              </div>
            )}

            {/* Rollback Form */}
            {canRollback && showRollbackForm && (
              <div className="space-y-3">
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Please provide a reason for rollback..."
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#137fec] resize-none"
                  rows={3}
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="flex items-center gap-2">
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRollback();
                    }}
                    disabled={!feedback.trim() || isLoading}
                    className="gap-2"
                  >
                    <Icon name="history" className="text-base" />
                    Confirm Rollback
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowRollbackForm(false);
                      setFeedback('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {action.status !== 'pending' && action.status !== 'rejected' && action.status !== 'expired' && action.feedback && (
              <div className="text-sm">
                <span className="text-slate-500 dark:text-slate-400">Feedback: </span>
                <span className="text-slate-700 dark:text-slate-300">{action.feedback}</span>
              </div>
            )}

            {action.status === 'expired' && (
              <div className="space-y-3">
                <div className="flex items-start gap-2 p-3 rounded-lg bg-slate-100 dark:bg-slate-800/50">
                  <Icon name="timer_off" className="text-base text-slate-400 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Draft Expired / Invalidated
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      This draft was not reviewed within its approval window and has been automatically invalidated. The email was not sent.
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      You can regenerate a new draft with the same content and a fresh approval window.
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRegenerate(action.id);
                  }}
                  disabled={isLoading}
                  className="gap-2"
                >
                  <Icon name="refresh" className="text-base" />
                  Regenerate Draft
                </Button>
              </div>
            )}

            {action.status === 'rejected' && (
              <div className="space-y-3">
                {action.feedback && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20">
                    <Icon name="feedback" className="text-base text-red-400 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-red-700 dark:text-red-300">
                        Rejection Reason
                      </p>
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                        {action.feedback}
                      </p>
                    </div>
                  </div>
                )}
                <Button
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRegenerate(action.id);
                  }}
                  disabled={isLoading}
                  className="gap-2"
                >
                  <Icon name="refresh" className="text-base" />
                  Regenerate Draft
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

interface MetricsCardProps {
  readonly stats: Record<string, number> | undefined;
  readonly isLoading: boolean;
}

function MetricsLoadingSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-5" data-testid="metrics-dashboard">
      {[1, 2, 3, 4, 5].map((i) => (
        <Card key={i} className="p-4 animate-pulse">
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-20 mb-2" />
          <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-12" />
        </Card>
      ))}
    </div>
  );
}

function computeMetricsValues(stats: Record<string, number>) {
  const total = Object.values(stats).reduce((a, b) => a + b, 0);
  const approved = (stats['APPROVED'] ?? 0) + (stats['SENT'] ?? 0);
  const rejected = (stats['REJECTED'] ?? 0) + (stats['FAILED'] ?? 0);
  const pending = (stats['DRAFT'] ?? 0) + (stats['PENDING_APPROVAL'] ?? 0) + (stats['ESCALATED'] ?? 0);
  const approvalRate = total > 0 ? Math.round((approved / total) * 100) : 0;
  return { total, approved, rejected, pending, approvalRate };
}

function MetricsCard({ stats, isLoading }: MetricsCardProps) {
  if (isLoading || !stats) {
    return <MetricsLoadingSkeleton />;
  }

  const { total, approved, rejected, pending, approvalRate } = computeMetricsValues(stats);

  return (
    <div className="grid gap-4 md:grid-cols-5" data-testid="metrics-dashboard">
      <Card className="p-4" data-testid="metric-total">
        <div className="text-sm text-slate-500 dark:text-slate-400 mb-1">Total Drafts</div>
        <div
          className="text-2xl font-bold text-slate-900 dark:text-white"
          data-testid="metric-value"
        >
          {total}
        </div>
      </Card>

      <Card className="p-4" data-testid="metric-pending">
        <div className="text-sm text-slate-500 dark:text-slate-400 mb-1">Pending Review</div>
        <div className="text-2xl font-bold text-amber-600" data-testid="metric-value">
          {pending}
        </div>
      </Card>

      <Card className="p-4" data-testid="metric-approved">
        <div className="text-sm text-slate-500 dark:text-slate-400 mb-1">Approved/Sent</div>
        <div className="text-2xl font-bold text-green-600" data-testid="metric-value">
          {approved}
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400">
          {approvalRate}% approval rate
        </div>
      </Card>

      <Card className="p-4" data-testid="metric-rejected">
        <div className="text-sm text-slate-500 dark:text-slate-400 mb-1">Rejected</div>
        <div className="text-2xl font-bold text-red-600" data-testid="metric-value">
          {rejected}
        </div>
      </Card>

      <Card className="p-4" data-testid="metric-escalated">
        <div className="text-sm text-slate-500 dark:text-slate-400 mb-1">Escalated</div>
        <div className="text-2xl font-bold text-purple-600" data-testid="metric-value">
          {stats['ESCALATED'] || 0}
        </div>
      </Card>
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

interface QueryErrorState {
  error: { message: string; data?: { code?: string | null } | null } | null;
  isAuth: boolean;
}

type AnyQueryError = { message: string; data?: { code?: string | null } | null } | null | undefined;

function detectQueryError(pendingError: AnyQueryError, listError: AnyQueryError): QueryErrorState {
  const error = pendingError || listError || null;
  if (!error) return { error: null, isAuth: false };
  const isAuth =
    error.data?.code === 'UNAUTHORIZED' ||
    error.message?.toLowerCase().includes('authentication') ||
    error.message?.toLowerCase().includes('unauthorized');
  return { error, isAuth };
}

// =============================================================================
// Main Page Component
// =============================================================================

function AgentApprovalsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const actionIdFromUrl = searchParams.get('actionId');
  const { user, isAuthenticated, isLoading: authLoading } = useRequireAuth();

  const [expandedActionId, setExpandedActionId] = useState<string | null>(actionIdFromUrl);
  const [filterStatus, setFilterStatus] = useState<ActionStatus | 'all'>(
    searchParams.get('status') === 'escalated' ? 'escalated' : 'all'
  );

  // Escalation sheet state
  const [escalatingActionId, setEscalatingActionId] = useState<string | null>(null);
  const [escalateReason, setEscalateReason] = useState('');
  const [escalateSlaHours, setEscalateSlaHours] = useState(48);

  // Get user ID for queries - use a fallback for demo purposes
  const userId = user?.id || '00000000-0000-4000-8000-000000000001';
  // tenantId is required by getStatsByStatus (protectedProcedure, not tenantProcedure).
  // AuthUser does not expose tenantId — it is resolved server-side from the JWT via tRPC context.
  // Until the autoResponse router is migrated to tenantProcedure (IFC-149 follow-up), this
  // falls back to the seeded default tenant. PG-084 OAuth integration will provide the real value.
  const tenantId = '00000000-0000-4000-8000-000000000001';

  // ==========================================================================
  // tRPC Queries & Mutations - WIRED TO BACKEND
  // ==========================================================================

  // Cross-system: agent tool action count
  const toolActionCountQuery = trpc.agent.getPendingCount.useQuery(undefined, {
    enabled: isAuthenticated && !authLoading,
    refetchInterval: 30000,
  });
  const toolActionCount = toolActionCountQuery.data?.count ?? 0;

  // Fetch pending approvals for current user
  const pendingQuery = trpc.autoResponse.getPendingForApprover.useQuery(
    { approverId: userId },
    {
      enabled: isAuthenticated && !authLoading && !!userId,
      refetchInterval: 30000, // Refresh every 30 seconds
    }
  );

  // Fetch all drafts (for history)
  const listQuery = trpc.autoResponse.list.useQuery(
    { page: 1, limit: 100 },
    {
      enabled: isAuthenticated && !authLoading,
      refetchInterval: 60000, // Refresh every minute
    }
  );

  // Fetch statistics by status
  const statsQuery = trpc.autoResponse.getStatsByStatus.useQuery(
    { tenantId },
    {
      enabled: isAuthenticated && !authLoading,
      refetchInterval: 60000,
    }
  );

  // Team members for escalation assignment
  const assigneesQuery = trpc.ticket.assignees.useQuery(undefined, {
    enabled: isAuthenticated && !authLoading,
  });

  // Mutations
  const approveMutation = trpc.autoResponse.approve.useMutation({
    onSuccess: () => {
      pendingQuery.refetch();
      listQuery.refetch();
      statsQuery.refetch();
    },
  });

  const rejectMutation = trpc.autoResponse.reject.useMutation({
    onSuccess: () => {
      pendingQuery.refetch();
      listQuery.refetch();
      statsQuery.refetch();
    },
  });

  const escalateMutation = trpc.autoResponse.escalate.useMutation({
    onSuccess: () => {
      pendingQuery.refetch();
      listQuery.refetch();
      statsQuery.refetch();
    },
  });

  const rollbackMutation = trpc.autoResponse.rollback.useMutation({
    onSuccess: () => {
      pendingQuery.refetch();
      listQuery.refetch();
      statsQuery.refetch();
    },
  });

  const regenerateMutation = trpc.autoResponse.regenerate.useMutation({
    onSuccess: () => {
      pendingQuery.refetch();
      listQuery.refetch();
      statsQuery.refetch();
    },
  });

  // ==========================================================================
  // Transform API data to AgentAction format
  // ==========================================================================

  const actions = useMemo(() => {
    // Combine pending drafts and list results
    const pendingDrafts = pendingQuery.data?.drafts || [];
    const allDrafts = listQuery.data?.drafts || [];

    // Merge and deduplicate
    const draftMap = new Map<string, AutoResponseDraftFromAPI>();
    [...pendingDrafts, ...allDrafts].forEach((draft) => {
      draftMap.set(draft.id, draft as AutoResponseDraftFromAPI);
    });

    return Array.from(draftMap.values()).map(mapDraftToAction);
  }, [pendingQuery.data, listQuery.data]);

  const filteredActions = useMemo(() => {
    if (filterStatus === 'all') return actions;
    return actions.filter((action) => action.status === filterStatus);
  }, [actions, filterStatus]);

  const pendingCount = useMemo(
    () => actions.filter((a) => a.status === 'pending').length,
    [actions]
  );

  // ==========================================================================
  // Handlers - WIRED TO tRPC MUTATIONS
  // ==========================================================================

  const handleApprove = useCallback(
    async (actionId: string) => {
      try {
        await approveMutation.mutateAsync({
          draftId: actionId,
          decision: 'APPROVED',
          decidedBy: userId,
        });
        toast({ title: 'Draft Approved', description: 'The AI draft has been approved and will be sent.' });
      } catch (error) {
        console.error('Failed to approve:', error);
        toast({ title: 'Approval Failed', description: String(error instanceof Error ? error.message : 'Unknown error'), variant: 'destructive' });
      }
    },
    [approveMutation, userId]
  );

  const handleReject = useCallback(
    async (actionId: string, feedback: string) => {
      try {
        await rejectMutation.mutateAsync({
          draftId: actionId,
          decidedBy: userId,
          reason: feedback,
        });
        toast({ title: 'Draft Rejected', description: 'The AI draft has been rejected.' });
      } catch (error) {
        console.error('Failed to reject:', error);
        toast({ title: 'Rejection Failed', description: String(error instanceof Error ? error.message : 'Unknown error'), variant: 'destructive' });
      }
    },
    [rejectMutation, userId]
  );

  const openEscalateSheet = useCallback((actionId: string) => {
    setEscalatingActionId(actionId);
    setEscalateReason('');
    setEscalateSlaHours(48);
  }, []);

  const handleEscalateConfirm = useCallback(
    async (escalateToId: string) => {
      if (!escalatingActionId || !escalateReason.trim()) return;
      try {
        await escalateMutation.mutateAsync({
          draftId: escalatingActionId,
          escalatedBy: userId,
          escalatedTo: escalateToId,
          reason: escalateReason,
          escalationExpiryHours: escalateSlaHours,
        });
        toast({ title: 'Escalated', description: `Draft escalated for manager review (${escalateSlaHours}h SLA).` });
        setEscalatingActionId(null);
        setEscalateReason('');
        setEscalateSlaHours(48);
      } catch (error) {
        console.error('Failed to escalate:', error);
        toast({ title: 'Escalation Failed', description: String(error instanceof Error ? error.message : 'Unknown error'), variant: 'destructive' });
      }
    },
    [escalateMutation, userId, escalatingActionId, escalateReason, escalateSlaHours]
  );

  const handleRollback = useCallback(
    async (actionId: string, reason: string) => {
      try {
        await rollbackMutation.mutateAsync({
          draftId: actionId,
          rolledBackBy: userId,
          reason,
        });
        toast({ title: 'Rolled Back', description: 'The approved action has been rolled back.' });
      } catch (error) {
        console.error('Failed to rollback:', error);
        toast({ title: 'Rollback Failed', description: String(error instanceof Error ? error.message : 'Unknown error'), variant: 'destructive' });
      }
    },
    [rollbackMutation, userId]
  );

  const handleRegenerate = useCallback(
    async (actionId: string) => {
      try {
        const result = await regenerateMutation.mutateAsync({ draftId: actionId });
        toast({ title: 'Draft Regenerated', description: `A new draft has been created with a fresh approval window. New ID: ${result.draftId.substring(0, 8)}...` });
        // Expand the new draft card
        setExpandedActionId(result.draftId);
      } catch (error) {
        console.error('Failed to regenerate:', error);
        toast({ title: 'Regeneration Failed', description: String(error instanceof Error ? error.message : 'Unknown error'), variant: 'destructive' });
      }
    },
    [regenerateMutation]
  );

  const handleRefresh = useCallback(async () => {
    await Promise.all([pendingQuery.refetch(), listQuery.refetch(), statsQuery.refetch()]);
  }, [pendingQuery, listQuery, statsQuery]);

  // ==========================================================================
  // Loading & Auth States
  // ==========================================================================

  const isLoading = authLoading || pendingQuery.isLoading || listQuery.isLoading;
  const isMutating =
    approveMutation.isPending ||
    rejectMutation.isPending ||
    escalateMutation.isPending ||
    rollbackMutation.isPending ||
    regenerateMutation.isPending;

  // Debug: Log query states
  console.log('[AgentApprovals] Query states:', {
    isAuthenticated,
    userId,
    pendingLoading: pendingQuery.isLoading,
    pendingError: pendingQuery.error?.message,
    pendingData: pendingQuery.data?.drafts?.length ?? 'none',
    listLoading: listQuery.isLoading,
    listError: listQuery.error?.message,
    listData: listQuery.data?.drafts?.length ?? 'none',
    statsError: statsQuery.error?.message,
  });

  // Show error state if queries failed (but redirect for auth errors)
  const { error: queryError, isAuth: isAuthError } = detectQueryError(
    pendingQuery.error,
    listQuery.error
  );

  // Redirect to login for auth errors
  if (queryError && isAuthError && !isLoading) {
    router.replace('/login');
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-center py-12">
          <Icon name="hourglass_empty" className="text-4xl text-slate-400 animate-spin" />
          <p className="ml-3 text-slate-600 dark:text-slate-400">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  // Show error state for non-auth errors
  if (queryError && !isAuthError && !isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h2 className="text-red-800 font-medium">Error loading approvals</h2>
          <p className="text-red-600 text-sm mt-1">{queryError.message}</p>
          <button
            onClick={() => {
              pendingQuery.refetch();
              listQuery.refetch();
            }}
            className="mt-2 text-sm text-red-700 underline"
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
        <span className="text-slate-900 dark:text-white font-medium">Agent Approvals</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
            Agent Approvals
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-base">
            Unified approval hub for all AI-generated actions
          </p>
        </div>
        <div className="flex items-center gap-3">
          {pendingCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 text-sm font-medium">
              <Icon name="schedule" className="text-base" />
              {pendingCount} pending
            </span>
          )}
          <Button variant="outline" onClick={handleRefresh} disabled={isLoading} className="gap-2">
            <Icon name="refresh" className={`text-base ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Link href="/agent-approvals/preview">
            <Button variant="ghost" className="gap-2">
              <Icon name="visibility" className="text-base" />
              Preview Mode
            </Button>
          </Link>
        </div>
      </div>

      {/* Approval Sources */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="p-4 border-l-4 border-l-[#137fec] bg-[#137fec]/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon name="mail" className="text-lg text-[#137fec]" />
              <div>
                <h3 className="text-sm font-medium text-slate-900 dark:text-white">Email Drafts</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Auto-response emails pending review</p>
              </div>
            </div>
            <span className="text-lg font-bold text-[#137fec]">{pendingCount}</span>
          </div>
        </Card>
        <Link href="/agent-approvals/preview">
          <Card className="p-4 border-l-4 border-l-amber-500 hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon name="build" className="text-lg text-amber-600" />
                <div>
                  <h3 className="text-sm font-medium text-slate-900 dark:text-white">Tool Actions</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">AI agent CRM changes awaiting approval</p>
                </div>
              </div>
              <span className="text-lg font-bold text-amber-600">{toolActionCount}</span>
            </div>
          </Card>
        </Link>
        <Link href="/agent-approvals/ai-review">
          <Card className="p-4 border-l-4 border-l-purple-500 hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon name="rate_review" className="text-lg text-purple-600" />
                <div>
                  <h3 className="text-sm font-medium text-slate-900 dark:text-white">AI Review</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">AI output quality checks</p>
                </div>
              </div>
              <Icon name="chevron_right" className="text-base text-slate-400" />
            </div>
          </Card>
        </Link>
      </div>

      {/* Metrics */}
      <MetricsCard stats={statsQuery.data} isLoading={statsQuery.isLoading} />

      {/* Filters */}
      <Card className="p-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Icon name="filter_list" className="text-base text-slate-400" />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Filter:</span>
          </div>
          <div className="flex flex-wrap gap-2" data-testid="filter-buttons">
            {(['all', 'pending', 'escalated', 'approved', 'rejected', 'expired'] as const).map((status) => (
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
              <p className="text-slate-600 dark:text-slate-400">Loading approvals...</p>
            </div>
          </Card>
        )}
        {!isLoading && filteredActions.length === 0 && (
          <Card className="p-12">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
                <Icon name="smart_toy" className="text-3xl text-slate-400" />
              </div>
              <h2 className="text-lg font-medium text-slate-900 dark:text-white mb-1">
                No actions found
              </h2>
              <p className="text-slate-500 dark:text-slate-400 max-w-sm">
                {filterStatus === 'all'
                  ? 'No auto-response drafts to review at this time. Check back later.'
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
            >
              <ActionCard
                action={action}
                onApprove={handleApprove}
                onReject={handleReject}
                onEscalate={openEscalateSheet}
                onRollback={handleRollback}
                onRegenerate={handleRegenerate}
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
                  ? `Connected as ${user?.email || 'unknown'} • Real-time updates enabled`
                  : 'Not authenticated • Using demo mode'}
              </p>
            </div>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400" suppressHydrationWarning>
            Last refresh: {new Date().toLocaleTimeString()}
          </div>
        </div>
      </Card>

      {/* Escalation Assign Sheet */}
      {(() => {
        const escalatingAction = escalatingActionId
          ? actions.find((a) => a.id === escalatingActionId)
          : null;
        const teamMembers = (assigneesQuery.data ?? []).map((m) => ({
          id: m.id,
          name: m.name,
          title: m.title,
          avatar: m.avatar ?? null,
        }));

        return (
          <AssignSheet
            open={!!escalatingActionId}
            onOpenChange={(open) => {
              if (!open) {
                setEscalatingActionId(null);
                setEscalateReason('');
                setEscalateSlaHours(48);
              }
            }}
            title="Escalate to Manager"
            description={
              escalatingAction
                ? `Select who should review "${escalatingAction.description}"`
                : 'Select a manager for escalation'
            }
            currentUserId={userId}
            currentUserName={user?.name ?? user?.email ?? null}
            assignees={teamMembers}
            isAssigning={escalateMutation.isPending}
            isLoadingOptions={assigneesQuery.isLoading}
            onAssign={handleEscalateConfirm}
            showSelfAssign={false}
            teamSectionLabel="Managers & Team Leads"
            canAssign={!!escalateReason.trim()}
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <label
                  htmlFor="escalate-reason"
                  className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider"
                >
                  Reason for Escalation *
                </label>
                <textarea
                  id="escalate-reason"
                  value={escalateReason}
                  onChange={(e) => setEscalateReason(e.target.value)}
                  placeholder="Explain why this needs manager review..."
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#137fec] resize-none text-sm"
                  rows={3}
                />
                {!escalateReason.trim() && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    A reason is required before selecting a reviewer.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="escalate-sla"
                  className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider"
                >
                  Review SLA (hours)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    id="escalate-sla"
                    type="number"
                    min={1}
                    max={168}
                    value={escalateSlaHours}
                    onChange={(e) => setEscalateSlaHours(Math.max(1, Math.min(168, Number(e.target.value) || 48)))}
                    className="w-24 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#137fec] text-sm"
                  />
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    hours ({Math.floor(escalateSlaHours / 24)}d {escalateSlaHours % 24}h)
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Time limit for the reviewer to take action. Default: 48 hours.
                </p>
              </div>
            </div>
          </AssignSheet>
        );
      })()}
    </div>
  );
}

// Loading fallback
function LoadingFallback() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-600">Loading approvals...</p>
      </div>
    </div>
  );
}

// Page component with Suspense boundary
export default function AgentApprovalsPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <AgentApprovalsContent />
    </Suspense>
  );
}
