'use client';

/**
 * AI Review Detail Page (IFC-181)
 *
 * Full review detail view with output payload, confidence, SLA, and actions.
 * Route: /agent-approvals/ai-review/[id]
 */

import { useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Badge,
  Textarea,
  Skeleton,
  StatusBadge,
  ConfidenceIndicator,
  cn,
} from '@intelliflow/ui';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { useReviewDetail } from '@/lib/ai-review/hooks';
import { api } from '@/lib/api';
import { useToast } from '@intelliflow/ui';
import { formatSlaClock, formatTimeAgo } from '@/lib/shared/date-utils';

// Output type display config (shared with ReviewCard)
const OUTPUT_TYPE_LABELS: Record<string, string> = {
  AUTO_RESPONSE: 'Auto-Response',
  LEAD_SCORING: 'Lead Scoring',
  SENTIMENT_ANALYSIS: 'Sentiment Analysis',
  CHURN_PREDICTION: 'Churn Prediction',
  EMAIL_GENERATION: 'Email Generation',
  NEXT_BEST_ACTION: 'Next Best Action',
};

export default function AIReviewDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoading: authLoading } = useRequireAuth();
  const { toast } = useToast();
  const utils = api.useUtils();
  const reviewId = params?.id as string;

  const { data: review, isLoading, isError } = useReviewDetail(reviewId);

  // Lock token state for this single review
  const [lockToken, setLockToken] = useState<string | null>(null);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [showEscalateForm, setShowEscalateForm] = useState(false);
  const [rejectNotes, setRejectNotes] = useState('');
  const [escalateReason, setEscalateReason] = useState('');

  // Mutations
  const claimMutation = api.aiReview.claim.useMutation({
    onSuccess: (data) => {
      setLockToken(data.lockToken);
      utils.aiReview.get.invalidate({ reviewId });
      utils.aiReview.list.invalidate();
      utils.aiReview.stats.invalidate();
      toast({
        title: 'Review claimed',
        description: 'You have exclusive access to review this output.',
      });
    },
    onError: (err: { message: string }) => {
      toast({
        title: 'Failed to claim',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const approveMutation = api.aiReview.approve.useMutation({
    onSuccess: () => {
      setLockToken(null);
      utils.aiReview.get.invalidate({ reviewId });
      utils.aiReview.list.invalidate();
      utils.aiReview.stats.invalidate();
      toast({ title: 'Review approved' });
    },
    onError: (err: { message: string }) => {
      toast({
        title: 'Failed to approve',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const rejectMutation = api.aiReview.reject.useMutation({
    onSuccess: () => {
      setLockToken(null);
      utils.aiReview.get.invalidate({ reviewId });
      utils.aiReview.list.invalidate();
      utils.aiReview.stats.invalidate();
      toast({ title: 'Review rejected' });
    },
    onError: (err: { message: string }) => {
      toast({
        title: 'Failed to reject',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const escalateMutation = api.aiReview.escalate.useMutation({
    onSuccess: () => {
      setLockToken(null);
      utils.aiReview.get.invalidate({ reviewId });
      utils.aiReview.list.invalidate();
      utils.aiReview.stats.invalidate();
      toast({ title: 'Review escalated' });
    },
    onError: (err: { message: string }) => {
      toast({
        title: 'Failed to escalate',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const isMutating =
    claimMutation.isPending ||
    approveMutation.isPending ||
    rejectMutation.isPending ||
    escalateMutation.isPending;

  const handleClaim = useCallback(() => {
    claimMutation.mutateAsync({ reviewId });
  }, [claimMutation, reviewId]);

  const handleApprove = useCallback(() => {
    if (!lockToken) return;
    approveMutation.mutateAsync({ reviewId, lockToken });
  }, [approveMutation, reviewId, lockToken]);

  const handleReject = useCallback(() => {
    if (!lockToken || !rejectNotes.trim()) return;
    rejectMutation.mutateAsync({
      reviewId,
      lockToken,
      notes: rejectNotes.trim(),
    });
    setShowRejectForm(false);
    setRejectNotes('');
  }, [rejectMutation, reviewId, lockToken, rejectNotes]);

  const handleEscalate = useCallback(() => {
    if (!lockToken || !escalateReason.trim()) return;
    escalateMutation.mutateAsync({
      reviewId,
      lockToken,
      reason: escalateReason.trim(),
    });
    setShowEscalateForm(false);
    setEscalateReason('');
  }, [escalateMutation, reviewId, lockToken, escalateReason]);

  // Loading / Error states
  if (authLoading || isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (isError || !review) {
    return (
      <div>
        <p className="text-destructive">Review not found or an error occurred.</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push('/agent-approvals/ai-review')}
        >
          Back to Queue
        </Button>
      </div>
    );
  }

  const slaClock = formatSlaClock(review.slaDeadline);
  const isOwnClaim = review.lockedBy === user?.id;

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <nav
        className="flex items-center gap-2 text-sm text-muted-foreground"
        aria-label="Breadcrumb"
      >
        <Link href="/agent-approvals" className="hover:text-foreground transition-colors">
          AI & Agents
        </Link>
        <span aria-hidden="true">/</span>
        <Link href="/agent-approvals/ai-review" className="hover:text-foreground transition-colors">
          AI Review
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-foreground font-medium">Review #{reviewId.slice(0, 8)}</span>
      </nav>

      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-foreground">
          {OUTPUT_TYPE_LABELS[review.outputType] ?? review.outputType}
        </h1>
        <StatusBadge status={review.status} type="review" showIcon size="lg" />
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left: Output payload */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Output Payload</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto max-h-96 whitespace-pre-wrap">
              {JSON.stringify(review.outputPayload, null, 2)}
            </pre>
          </CardContent>
        </Card>

        {/* Right: Metadata */}
        <div className="space-y-4">
          {/* Confidence */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Confidence</CardTitle>
            </CardHeader>
            <CardContent>
              <ConfidenceIndicator
                confidence={review.confidence}
                size="lg"
                showLabel
                showDescription
              />
            </CardContent>
          </Card>

          {/* SLA */}
          <Card className={cn(slaClock.isBreached && 'border-red-300 dark:border-red-700')}>
            <CardHeader>
              <CardTitle className="text-sm">SLA Deadline</CardTitle>
            </CardHeader>
            <CardContent>
              <p
                className={cn(
                  'text-2xl font-mono tabular-nums font-bold',
                  slaClock.isBreached ? 'text-red-600 dark:text-red-400' : 'text-foreground'
                )}
              >
                {slaClock.display}
              </p>
              {slaClock.isBreached && (
                <Badge variant="destructive" className="mt-2">
                  SLA Breached
                </Badge>
              )}
            </CardContent>
          </Card>

          {/* Audit trail */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">Created:</span>{' '}
                {formatTimeAgo(review.createdAt)}
              </p>
              <p>
                <span className="font-medium text-foreground">Updated:</span>{' '}
                {formatTimeAgo(review.updatedAt)}
              </p>
              {review.reviewerId && (
                <p>
                  <span className="font-medium text-foreground">Reviewer:</span> {review.reviewerId}
                </p>
              )}
              {review.reviewDecision && (
                <p>
                  <span className="font-medium text-foreground">Decision:</span>{' '}
                  {review.reviewDecision.replace(/_/g, ' ')}
                </p>
              )}
              {review.reviewNotes && (
                <div>
                  <span className="font-medium text-foreground">Notes:</span>
                  <p className="mt-1 text-foreground">{review.reviewNotes}</p>
                </div>
              )}
              {review.escalationDepth > 0 && (
                <p>
                  <span className="font-medium text-foreground">Escalation Depth:</span>{' '}
                  {review.escalationDepth}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Action buttons */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            {/* PENDING → Claim */}
            {review.status === 'PENDING' && (
              <Button onClick={handleClaim} disabled={isMutating}>
                <span className="material-symbols-outlined text-sm mr-1" aria-hidden="true">
                  lock
                </span>{' '}
                Claim Review
              </Button>
            )}

            {/* IN_REVIEW (own claim) → actions */}
            {review.status === 'IN_REVIEW' && isOwnClaim && lockToken && (
              <>
                <Button
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={handleApprove}
                  disabled={isMutating}
                >
                  <span className="material-symbols-outlined text-sm mr-1" aria-hidden="true">
                    check_circle
                  </span>{' '}
                  Approve
                </Button>
                <Button
                  variant="outline"
                  className="hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                  onClick={() => {
                    setShowRejectForm(!showRejectForm);
                    setShowEscalateForm(false);
                  }}
                  disabled={isMutating}
                >
                  <span className="material-symbols-outlined text-sm mr-1" aria-hidden="true">
                    cancel
                  </span>
                  Reject
                </Button>
                <Button
                  variant="outline"
                  className="hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-900/20"
                  onClick={() => {
                    setShowEscalateForm(!showEscalateForm);
                    setShowRejectForm(false);
                  }}
                  disabled={isMutating}
                >
                  <span className="material-symbols-outlined text-sm mr-1" aria-hidden="true">
                    arrow_upward
                  </span>
                  Escalate
                </Button>
              </>
            )}

            {/* ESCALATED → Claim */}
            {review.status === 'ESCALATED' && (
              <Button onClick={handleClaim} disabled={isMutating}>
                <span className="material-symbols-outlined text-sm mr-1" aria-hidden="true">
                  lock
                </span>
                Claim Escalated Review
              </Button>
            )}

            {/* Back button */}
            <Button
              variant="ghost"
              onClick={() => router.push('/agent-approvals/ai-review')}
              className="ml-auto"
            >
              <span className="material-symbols-outlined text-sm mr-1" aria-hidden="true">
                arrow_back
              </span>
              Back to Queue
            </Button>
          </div>

          {/* Reject form */}
          {showRejectForm && (
            <div className="mt-4 space-y-2">
              <Textarea
                placeholder="Rejection reason (required)..."
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value)}
                rows={3}
                aria-label="Rejection notes"
              />
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  onClick={handleReject}
                  disabled={isMutating || !rejectNotes.trim()}
                >
                  Confirm Rejection
                </Button>
                <Button
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

          {/* Escalate form */}
          {showEscalateForm && (
            <div className="mt-4 space-y-2">
              <Textarea
                placeholder="Escalation reason (required)..."
                value={escalateReason}
                onChange={(e) => setEscalateReason(e.target.value)}
                rows={3}
                aria-label="Escalation reason"
              />
              <div className="flex gap-2">
                <Button
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={handleEscalate}
                  disabled={isMutating || !escalateReason.trim()}
                >
                  Confirm Escalation
                </Button>
                <Button
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
        </CardContent>
      </Card>
    </div>
  );
}
