'use client';

import Link from 'next/link';
import { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, Button } from '@intelliflow/ui';
import {
  Bot,
  Check,
  X,
  RotateCcw,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  History,
  Filter,
  RefreshCw,
  Eye,
  Edit3,
  Shield,
  Zap,
} from 'lucide-react';
// IFC-149 Integration: Use barrel export for cleaner imports
import {
  type AgentAction,
  type ActionStatus,
  type ApprovalMetrics,
} from '@/lib/agent';

// =============================================================================
// Types
// =============================================================================

interface DiffChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  type: 'added' | 'removed' | 'changed';
}

// =============================================================================
// Mock Data for Demo
// =============================================================================

const MOCK_ACTIONS: AgentAction[] = [
  {
    id: 'action-1',
    actionType: 'lead_update',
    entityId: 'lead-123',
    entityType: 'lead',
    entityName: 'John Smith - Acme Corp',
    previousState: {
      score: 45,
      status: 'New',
      nextFollowUp: null,
      notes: 'Initial inquiry via website form',
    },
    proposedState: {
      score: 72,
      status: 'Qualified',
      nextFollowUp: '2025-01-05',
      notes: 'Initial inquiry via website form. AI Analysis: High engagement, enterprise company, decision-maker role.',
    },
    description: 'Update lead score and status based on engagement analysis',
    aiReasoning: 'Lead opened 5 emails (100% open rate), visited pricing page 3 times, and downloaded enterprise whitepaper. Company size (500+ employees) matches ideal customer profile.',
    confidenceScore: 85,
    status: 'pending',
    agentId: 'scoring-agent-v1',
    agentName: 'Lead Scoring Agent',
    createdAt: new Date(Date.now() - 1000 * 60 * 30), // 30 min ago
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 23), // 23 hours from now
  },
  {
    id: 'action-2',
    actionType: 'email_draft',
    entityId: 'contact-456',
    entityType: 'contact',
    entityName: 'Sarah Johnson - TechStart Inc',
    previousState: {
      lastContactedAt: '2024-12-20',
      emailsSent: 2,
    },
    proposedState: {
      lastContactedAt: '2025-01-02',
      emailsSent: 3,
      pendingEmail: {
        subject: 'Quick follow-up on your IntelliFlow demo',
        body: 'Hi Sarah, I wanted to follow up on our demo last week...',
      },
    },
    description: 'Send personalized follow-up email based on demo engagement',
    aiReasoning: 'Contact attended 45-minute demo, asked 8 questions about API integrations, and requested pricing information. Optimal follow-up timing is 5 days post-demo based on historical conversion data.',
    confidenceScore: 78,
    status: 'pending',
    agentId: 'outreach-agent-v1',
    agentName: 'Outreach Agent',
    createdAt: new Date(Date.now() - 1000 * 60 * 120), // 2 hours ago
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 22),
  },
  {
    id: 'action-3',
    actionType: 'deal_stage_change',
    entityId: 'deal-789',
    entityType: 'deal',
    entityName: 'Enterprise License - GlobalTech',
    previousState: {
      stage: 'PROPOSAL',
      probability: 60,
      value: 85000,
    },
    proposedState: {
      stage: 'NEGOTIATION',
      probability: 75,
      value: 92000,
      notes: 'Verbal agreement on terms. Awaiting legal review.',
    },
    description: 'Advance deal to negotiation stage with updated probability',
    aiReasoning: 'Prospect verbally agreed to terms in last meeting (sentiment analysis: positive). Legal team CC\'d on latest email suggests contract review in progress. Similar deals at this stage have 75% close rate.',
    confidenceScore: 92,
    status: 'pending',
    agentId: 'pipeline-agent-v1',
    agentName: 'Pipeline Intelligence Agent',
    createdAt: new Date(Date.now() - 1000 * 60 * 15), // 15 min ago
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 23.5),
  },
  {
    id: 'action-4',
    actionType: 'task_create',
    entityId: 'lead-124',
    entityType: 'lead',
    entityName: 'Mike Chen - StartupXYZ',
    previousState: {
      tasks: [],
    },
    proposedState: {
      tasks: [
        {
          title: 'Schedule discovery call',
          dueDate: '2025-01-03',
          priority: 'high',
          assignee: 'current_user',
        },
      ],
    },
    description: 'Create follow-up task for high-intent lead',
    aiReasoning: 'Lead visited pricing page 5 times in last 24 hours and spent 12 minutes on comparison chart. Urgency signals suggest ready for sales conversation.',
    confidenceScore: 68,
    status: 'pending',
    agentId: 'task-agent-v1',
    agentName: 'Task Automation Agent',
    createdAt: new Date(Date.now() - 1000 * 60 * 45), // 45 min ago
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 22.5),
  },
];

// =============================================================================
// Utility Functions
// =============================================================================

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
        icon: <Clock className="h-3 w-3" />,
      };
    case 'approved':
      return {
        label: 'Approved',
        className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
        icon: <Check className="h-3 w-3" />,
      };
    case 'rejected':
      return {
        label: 'Rejected',
        className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
        icon: <X className="h-3 w-3" />,
      };
    case 'rolled_back':
      return {
        label: 'Rolled Back',
        className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
        icon: <RotateCcw className="h-3 w-3" />,
      };
    case 'modified':
      return {
        label: 'Modified',
        className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
        icon: <Edit3 className="h-3 w-3" />,
      };
    case 'expired':
      return {
        label: 'Expired',
        className: 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400',
        icon: <AlertTriangle className="h-3 w-3" />,
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
  return {
    label: 'Low Confidence',
    className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
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
      <div className="text-sm text-slate-500 dark:text-slate-400 italic">
        No changes detected
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {changes.map((change) => (
        <div
          key={change.field}
          className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3"
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
              <span className="text-slate-500 dark:text-slate-400 block mb-1">
                Before
              </span>
              <pre className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-2 overflow-x-auto text-red-800 dark:text-red-300">
                {formatValue(change.oldValue)}
              </pre>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400 block mb-1">
                After
              </span>
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
  readonly onRollback: (id: string, reason: string) => void;
  readonly isExpanded: boolean;
  readonly onToggleExpand: () => void;
}

function ActionCard({
  action,
  onApprove,
  onReject,
  onRollback,
  isExpanded,
  onToggleExpand,
}: ActionCardProps) {
  const [feedback, setFeedback] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [showRollbackForm, setShowRollbackForm] = useState(false);

  const statusBadge = getStatusBadge(action.status);
  const confidenceBadge = getConfidenceBadge(action.confidenceScore);
  const isPending = action.status === 'pending';
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
              <Bot className="h-5 w-5 text-[#137fec]" />
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
                  <Zap className="h-3.5 w-3.5" />
                  {action.agentName}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {formatTimeAgo(action.createdAt)}
                </span>
                {isPending && (
                  <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5" />
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
              <ChevronUp className="h-5 w-5 text-slate-400" />
            ) : (
              <ChevronDown className="h-5 w-5 text-slate-400" />
            )}
          </div>
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-slate-200 dark:border-slate-700">
          {/* AI Reasoning */}
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-start gap-2">
              <Shield className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-1">
                  AI Reasoning
                </h4>
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  {action.aiReasoning}
                </p>
              </div>
            </div>
          </div>

          {/* Diff View */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-700">
            <h4 className="text-sm font-medium text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Proposed Changes
            </h4>
            <DiffView
              previousState={action.previousState}
              proposedState={action.proposedState}
            />
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
                  className="gap-2"
                >
                  <Check className="h-4 w-4" />
                  Approve
                </Button>
                <Button
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowRejectForm(true);
                  }}
                  className="gap-2"
                >
                  <X className="h-4 w-4" />
                  Reject
                </Button>
                <Button variant="ghost" className="gap-2 ml-auto">
                  <Edit3 className="h-4 w-4" />
                  Modify
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
                    disabled={!feedback.trim()}
                    className="gap-2"
                  >
                    <X className="h-4 w-4" />
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

            {canRollback && !showRollbackForm && (
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowRollbackForm(true);
                  }}
                  className="gap-2"
                >
                  <RotateCcw className="h-4 w-4" />
                  Rollback
                </Button>
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  Action was approved{' '}
                  {action.reviewedAt && formatTimeAgo(action.reviewedAt)}
                </span>
              </div>
            )}

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
                    disabled={!feedback.trim()}
                    className="gap-2"
                  >
                    <RotateCcw className="h-4 w-4" />
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

            {(action.status === 'rejected' ||
              action.status === 'rolled_back' ||
              action.status === 'modified') &&
              action.feedback && (
                <div className="text-sm">
                  <span className="text-slate-500 dark:text-slate-400">
                    Feedback:{' '}
                  </span>
                  <span className="text-slate-700 dark:text-slate-300">
                    {action.feedback}
                  </span>
                </div>
              )}

            {action.status === 'expired' && (
              <div className="text-sm text-slate-500 dark:text-slate-400">
                This action expired without review and was not applied.
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

interface MetricsCardProps {
  readonly metrics: ApprovalMetrics;
}

function MetricsCard({ metrics }: MetricsCardProps) {
  return (
    <div className="grid gap-4 md:grid-cols-5">
      <Card className="p-4">
        <div className="text-sm text-slate-500 dark:text-slate-400 mb-1">
          Total Actions
        </div>
        <div className="text-2xl font-bold text-slate-900 dark:text-white">
          {metrics.totalActions}
        </div>
      </Card>

      <Card className="p-4">
        <div className="text-sm text-slate-500 dark:text-slate-400 mb-1">
          Approved
        </div>
        <div className="text-2xl font-bold text-green-600">
          {metrics.approved}
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400">
          {metrics.approvalRate}% approval rate
        </div>
      </Card>

      <Card className="p-4">
        <div className="text-sm text-slate-500 dark:text-slate-400 mb-1">
          Rejected
        </div>
        <div className="text-2xl font-bold text-red-600">{metrics.rejected}</div>
      </Card>

      <Card className="p-4">
        <div className="text-sm text-slate-500 dark:text-slate-400 mb-1">
          Rolled Back
        </div>
        <div className="text-2xl font-bold text-purple-600">
          {metrics.rolledBack}
        </div>
      </Card>

      <Card className="p-4">
        <div className="text-sm text-slate-500 dark:text-slate-400 mb-1">
          Avg Review Time
        </div>
        <div className="text-2xl font-bold text-slate-900 dark:text-white">
          {metrics.avgReviewTimeMs > 60000
            ? `${Math.round(metrics.avgReviewTimeMs / 60000)}m`
            : `${Math.round(metrics.avgReviewTimeMs / 1000)}s`}
        </div>
      </Card>
    </div>
  );
}

// =============================================================================
// Main Page Component
// =============================================================================

// Inner component that uses searchParams
function AgentApprovalsPreviewContent() {
  const searchParams = useSearchParams();
  const actionIdFromUrl = searchParams.get('actionId');

  const [actions, setActions] = useState<AgentAction[]>(MOCK_ACTIONS);
  const [expandedActionId, setExpandedActionId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<ActionStatus | 'all'>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [highlightedActionId, setHighlightedActionId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<ApprovalMetrics>({
    totalActions: MOCK_ACTIONS.length,
    approved: 0,
    rejected: 0,
    modified: 0,
    rolledBack: 0,
    expired: 0,
    avgReviewTimeMs: 0,
    approvalRate: 0,
    avgConfidenceApproved: 0,
    avgConfidenceRejected: 0,
  });

  // Auto-expand action if actionId is provided in URL (from timeline navigation)
  useEffect(() => {
    if (actionIdFromUrl) {
      // Set the action as expanded and highlighted
      setExpandedActionId(actionIdFromUrl);
      setHighlightedActionId(actionIdFromUrl);

      // Clear highlight after 3 seconds (keeps expanded)
      const timer = setTimeout(() => {
        setHighlightedActionId(null);
      }, 3000);

      // Scroll to the action after a brief delay to ensure DOM is ready
      setTimeout(() => {
        const element = document.getElementById(`action-card-${actionIdFromUrl}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [actionIdFromUrl]);

  const filteredActions = useMemo(() => {
    if (filterStatus === 'all') return actions;
    return actions.filter((action) => action.status === filterStatus);
  }, [actions, filterStatus]);

  const pendingCount = useMemo(
    () => actions.filter((a) => a.status === 'pending').length,
    [actions]
  );

  const handleApprove = useCallback(async (actionId: string) => {
    setIsLoading(true);
    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 500));

      setActions((prev) =>
        prev.map((action) =>
          action.id === actionId
            ? {
                ...action,
                status: 'approved' as ActionStatus,
                reviewedAt: new Date(),
                reviewedBy: 'current-user',
              }
            : action
        )
      );

      setMetrics((prev) => ({
        ...prev,
        approved: prev.approved + 1,
        approvalRate: Math.round(
          ((prev.approved + 1) / (prev.approved + prev.rejected + 1)) * 100
        ),
      }));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleReject = useCallback(
    async (actionId: string, feedback: string) => {
      setIsLoading(true);
      try {
        await new Promise((resolve) => setTimeout(resolve, 500));

        setActions((prev) =>
          prev.map((action) =>
            action.id === actionId
              ? {
                  ...action,
                  status: 'rejected' as ActionStatus,
                  reviewedAt: new Date(),
                  reviewedBy: 'current-user',
                  feedback,
                }
              : action
          )
        );

        setMetrics((prev) => ({
          ...prev,
          rejected: prev.rejected + 1,
          approvalRate: Math.round(
            (prev.approved / (prev.approved + prev.rejected + 1)) * 100
          ),
        }));
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const handleRollback = useCallback(
    async (actionId: string, reason: string) => {
      setIsLoading(true);
      try {
        await new Promise((resolve) => setTimeout(resolve, 500));

        setActions((prev) =>
          prev.map((action) =>
            action.id === actionId
              ? {
                  ...action,
                  status: 'rolled_back' as ActionStatus,
                  feedback: reason,
                  rollbackInfo: {
                    rolledBackAt: new Date(),
                    rolledBackBy: 'current-user',
                    reason,
                    restoredState: action.previousState,
                  },
                }
              : action
          )
        );

        setMetrics((prev) => ({
          ...prev,
          rolledBack: prev.rolledBack + 1,
        }));
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const handleRefresh = useCallback(async () => {
    setIsLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      // In production, refetch from API
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <div className="mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-16 space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-2">
        <Link href="/dashboard" className="hover:text-[#137fec]">
          Dashboard
        </Link>
        <span>/</span>
        {actionIdFromUrl ? (
          <>
            <Link href="/deals" className="hover:text-[#137fec]">
              Deals
            </Link>
            <span>/</span>
          </>
        ) : (
          <>
            <Link href="/agent-approvals" className="hover:text-[#137fec]">
              Agent Approvals
            </Link>
            <span>/</span>
          </>
        )}
        <span className="text-slate-900 dark:text-white font-medium">
          {actionIdFromUrl ? 'Review Action' : 'Preview'}
        </span>
      </nav>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
            Agent Approvals
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-base">
            Review and approve AI agent-initiated changes before they are applied
          </p>
        </div>
        <div className="flex items-center gap-3">
          {pendingCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 text-sm font-medium">
              <Clock className="h-4 w-4" />
              {pendingCount} pending
            </span>
          )}
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={isLoading}
            className="gap-2"
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Metrics */}
      <MetricsCard metrics={metrics} />

      {/* Filters */}
      <Card className="p-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Filter:
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                'all',
                'pending',
                'approved',
                'rejected',
                'rolled_back',
                'expired',
              ] as const
            ).map((status) => (
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
                {status === 'all'
                  ? 'All'
                  : status.charAt(0).toUpperCase() +
                    status.slice(1).replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Actions List */}
      <div className="space-y-4">
        {filteredActions.length === 0 ? (
          <Card className="p-12">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
                <Bot className="h-8 w-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-1">
                No actions found
              </h3>
              <p className="text-slate-500 dark:text-slate-400 max-w-sm">
                {filterStatus === 'all'
                  ? 'No agent actions to review at this time. Check back later.'
                  : `No ${filterStatus.replace('_', ' ')} actions found. Try a different filter.`}
              </p>
            </div>
          </Card>
        ) : (
          filteredActions.map((action) => (
            <div
              key={action.id}
              id={`action-card-${action.id}`}
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
                onRollback={handleRollback}
                isExpanded={expandedActionId === action.id}
                onToggleExpand={() =>
                  setExpandedActionId(
                    expandedActionId === action.id ? null : action.id
                  )
                }
              />
            </div>
          ))
        )}
      </div>

      {/* History Link */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <History className="h-5 w-5 text-slate-400" />
            <div>
              <h3 className="text-sm font-medium text-slate-900 dark:text-white">
                Action History
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                View full audit log of all agent actions and decisions
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm">
            View History
          </Button>
        </div>
      </Card>
    </div>
  );
}

// Loading fallback
function PreviewLoadingFallback() {
  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
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
