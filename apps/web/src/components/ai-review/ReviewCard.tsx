'use client';

/**
 * ReviewCard — Individual AI output review card (IFC-181)
 *
 * Uses existing shared components:
 * - StatusBadge (type="review") from @intelliflow/ui
 * - ConfidenceIndicator from @intelliflow/ui
 * - Card, Badge, Button from @intelliflow/ui
 * - formatSlaClock from shared date-utils
 */

import { useState } from 'react';
import Link from 'next/link';
import {
  Card,
  Badge,
  Button,
  Textarea,
  StatusBadge,
  ConfidenceIndicator,
  cn,
} from '@intelliflow/ui';
import { formatSlaClock, formatTimeAgo } from '@/lib/shared/date-utils';
import type { ReviewResponse } from '@intelliflow/validators/ai-review';

// ============================================
// Output Type Config (const map, not inline)
// ============================================

const OUTPUT_TYPE_CONFIG: Record<
  string,
  { icon: string; label: string; bgClass: string; textClass: string }
> = {
  AUTO_RESPONSE: {
    icon: 'mark_email_unread',
    label: 'Auto-Response',
    bgClass: 'bg-blue-50 dark:bg-blue-900/20',
    textClass: 'text-blue-600 dark:text-blue-400',
  },
  LEAD_SCORING: {
    icon: 'score',
    label: 'Lead Scoring',
    bgClass: 'bg-purple-50 dark:bg-purple-900/20',
    textClass: 'text-purple-600 dark:text-purple-400',
  },
  SENTIMENT_ANALYSIS: {
    icon: 'sentiment_satisfied',
    label: 'Sentiment',
    bgClass: 'bg-green-50 dark:bg-green-900/20',
    textClass: 'text-green-600 dark:text-green-400',
  },
  CHURN_PREDICTION: {
    icon: 'trending_down',
    label: 'Churn Risk',
    bgClass: 'bg-orange-50 dark:bg-orange-900/20',
    textClass: 'text-orange-600 dark:text-orange-400',
  },
  EMAIL_GENERATION: {
    icon: 'email',
    label: 'Email Draft',
    bgClass: 'bg-sky-50 dark:bg-sky-900/20',
    textClass: 'text-sky-600 dark:text-sky-400',
  },
  NEXT_BEST_ACTION: {
    icon: 'summarize',
    label: 'Next Best Action',
    bgClass: 'bg-emerald-50 dark:bg-emerald-900/20',
    textClass: 'text-emerald-600 dark:text-emerald-400',
  },
};

// ============================================
// Props
// ============================================

export interface ReviewCardProps {
  review: ReviewResponse;
  lockToken: string | null;
  currentUserId: string;
  onClaim: (reviewId: string) => void;
  onApprove: (reviewId: string, lockToken: string, feedback?: string) => void;
  onReject: (reviewId: string, lockToken: string, notes: string) => void;
  onEscalate: (reviewId: string, lockToken: string, reason: string) => void;
  isMutating: boolean;
}

// ============================================
// Component
// ============================================

export function ReviewCard({
  review,
  lockToken,
  currentUserId,
  onClaim,
  onApprove,
  onReject,
  onEscalate,
  isMutating,
}: ReviewCardProps) {
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [showEscalateForm, setShowEscalateForm] = useState(false);
  const [rejectNotes, setRejectNotes] = useState('');
  const [escalateReason, setEscalateReason] = useState('');

  const outputConfig = OUTPUT_TYPE_CONFIG[review.outputType] ?? {
    icon: 'smart_toy',
    label: review.outputType,
    bgClass: 'bg-gray-50 dark:bg-gray-900/20',
    textClass: 'text-gray-600 dark:text-gray-400',
  };

  const slaClock = formatSlaClock(review.slaDeadline);
  const isOwnClaim = review.lockedBy === currentUserId;
  const isOtherClaim = review.lockedBy !== null && !isOwnClaim;

  // State-dependent border color
  const borderColor = slaClock.isBreached
    ? 'border-l-red-500'
    : review.status === 'IN_REVIEW'
      ? 'border-l-blue-400'
      : 'border-l-slate-300 dark:border-l-slate-600';

  const handleReject = () => {
    if (!lockToken || !rejectNotes.trim()) return;
    onReject(review.id, lockToken, rejectNotes.trim());
    setShowRejectForm(false);
    setRejectNotes('');
  };

  const handleEscalate = () => {
    if (!lockToken || !escalateReason.trim()) return;
    onEscalate(review.id, lockToken, escalateReason.trim());
    setShowEscalateForm(false);
    setEscalateReason('');
  };

  return (
    <Card
      className={cn(
        'border-l-4 transition-all',
        borderColor,
        slaClock.isBreached && 'ring-1 ring-red-200 dark:ring-red-800'
      )}
    >
      <div className="p-4 sm:p-5">
        {/* Top row: Output type + Status + SLA */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {/* Output type badge */}
          <Badge
            variant="outline"
            className={cn(
              'gap-1.5 font-medium',
              outputConfig.bgClass,
              outputConfig.textClass,
              'border-0'
            )}
          >
            <span className="material-symbols-outlined text-sm" aria-hidden="true">
              {outputConfig.icon}
            </span>
            {outputConfig.label}
          </Badge>

          <StatusBadge status={review.status} type="review" showIcon />

          {/* SLA clock */}
          <span
            className={cn(
              'ml-auto text-xs font-mono tabular-nums',
              slaClock.isBreached
                ? 'text-red-600 dark:text-red-400 font-semibold'
                : 'text-muted-foreground'
            )}
            aria-label={`SLA ${slaClock.isBreached ? 'breached' : 'remaining'}: ${slaClock.display}`}
          >
            {slaClock.isBreached && (
              <span
                className="material-symbols-outlined text-xs mr-0.5 align-middle"
                aria-hidden="true"
              >
                warning
              </span>
            )}
            {slaClock.display}
          </span>
        </div>

        {/* Confidence */}
        <div className="mb-3">
          <ConfidenceIndicator confidence={review.confidence} showLabel size="sm" />
        </div>

        {/* Metadata */}
        <p className="text-xs text-muted-foreground mb-4">
          Created {formatTimeAgo(review.createdAt)}
          {review.escalationDepth > 0 && (
            <span className="ml-2">Escalation depth: {review.escalationDepth}</span>
          )}
        </p>

        {/* Actions row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* PENDING → Claim + Preview */}
          {review.status === 'PENDING' && (
            <>
              <Button
                size="sm"
                onClick={() => onClaim(review.id)}
                disabled={isMutating}
                aria-label="Claim this review"
              >
                <span className="material-symbols-outlined text-sm mr-1" aria-hidden="true">
                  lock
                </span>{' '}
                Claim
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link
                  href={`/agent-approvals/ai-review/${review.id}`}
                  aria-label="Preview review details"
                >
                  <span className="material-symbols-outlined text-sm mr-1" aria-hidden="true">
                    visibility
                  </span>{' '}
                  Preview
                </Link>
              </Button>
            </>
          )}

          {/* IN_REVIEW (own claim) → Approve / Reject / Escalate */}
          {review.status === 'IN_REVIEW' && isOwnClaim && lockToken && (
            <>
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={() => onApprove(review.id, lockToken)}
                disabled={isMutating}
                aria-label="Approve this review"
              >
                <span className="material-symbols-outlined text-sm mr-1" aria-hidden="true">
                  check_circle
                </span>
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="hover:bg-red-50 hover:text-red-600 hover:border-red-300 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                onClick={() => {
                  setShowRejectForm(!showRejectForm);
                  setShowEscalateForm(false);
                }}
                disabled={isMutating}
                aria-label="Reject this review"
              >
                <span className="material-symbols-outlined text-sm mr-1" aria-hidden="true">
                  cancel
                </span>
                Reject
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="hover:bg-amber-50 hover:text-amber-600 hover:border-amber-300 dark:hover:bg-amber-900/20 dark:hover:text-amber-400"
                onClick={() => {
                  setShowEscalateForm(!showEscalateForm);
                  setShowRejectForm(false);
                }}
                disabled={isMutating}
                aria-label="Escalate this review"
              >
                <span className="material-symbols-outlined text-sm mr-1" aria-hidden="true">
                  arrow_upward
                </span>
                Escalate
              </Button>
            </>
          )}

          {/* IN_REVIEW (other claim) → Claimed badge */}
          {review.status === 'IN_REVIEW' && isOtherClaim && (
            <Badge variant="outline" className="text-muted-foreground">
              <span className="material-symbols-outlined text-xs mr-1" aria-hidden="true">
                lock
              </span>{' '}
              Claimed by another reviewer
            </Badge>
          )}

          {/* ESCALATED → re-claim available */}
          {review.status === 'ESCALATED' && (
            <Button
              size="sm"
              onClick={() => onClaim(review.id)}
              disabled={isMutating}
              aria-label="Claim escalated review"
            >
              <span className="material-symbols-outlined text-sm mr-1" aria-hidden="true">
                lock
              </span>
              Claim
            </Button>
          )}

          {/* APPROVED / REJECTED / EXPIRED → read-only, preview only */}
          {(review.status === 'APPROVED' ||
            review.status === 'REJECTED' ||
            review.status === 'EXPIRED') && (
            <Button size="sm" variant="outline" asChild>
              <Link
                href={`/agent-approvals/ai-review/${review.id}`}
                aria-label="View review details"
              >
                <span className="material-symbols-outlined text-sm mr-1" aria-hidden="true">
                  visibility
                </span>
                View
              </Link>
            </Button>
          )}
        </div>

        {/* Reject Notes Form */}
        {showRejectForm && (
          <div className="mt-3 space-y-2">
            <Textarea
              placeholder="Rejection reason (required)..."
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              className="text-sm"
              rows={2}
              aria-label="Rejection notes"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                onClick={handleReject}
                disabled={isMutating || !rejectNotes.trim()}
              >
                Confirm Rejection
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowRejectForm(false);
                  setRejectNotes('');
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Escalate Reason Form */}
        {showEscalateForm && (
          <div className="mt-3 space-y-2">
            <Textarea
              placeholder="Escalation reason (required)..."
              value={escalateReason}
              onChange={(e) => setEscalateReason(e.target.value)}
              className="text-sm"
              rows={2}
              aria-label="Escalation reason"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                className="bg-amber-600 hover:bg-amber-700 text-white"
                onClick={handleEscalate}
                disabled={isMutating || !escalateReason.trim()}
              >
                Confirm Escalation
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowEscalateForm(false);
                  setEscalateReason('');
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
