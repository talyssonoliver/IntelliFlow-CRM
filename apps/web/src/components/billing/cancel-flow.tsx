'use client';

/**
 * Cancel Flow Component
 *
 * Multi-step cancellation flow with retention offer, reason selection,
 * and period-end confirmation.
 *
 * @implements PG-172 (Billing Ghost Pages — Cancel)
 */

import * as React from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent, CardFooter, Badge, Button } from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/lib/auth/AuthContext';
import { getPlanByPriceId, formatBillingDate } from '@/lib/billing/stripe-portal';
import {
  getCancellationInfo,
  formatCancellationMessage,
  CANCELLATION_REASONS,
  CANCELLATION_REASON_LABELS,
} from '@/lib/billing/plan-changes';
import { EmptyState, ErrorState, CardSkeleton } from './billing-shared';

type CancelStep = 1 | 2 | 3 | 'success';

export function CancelFlow() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [step, setStep] = React.useState<CancelStep>(1);
  const [reason, setReason] = React.useState<string>('');
  const [feedback, setFeedback] = React.useState('');

  const {
    data: subscription,
    isLoading,
    error,
    refetch,
  } = trpc.billing.getSubscription.useQuery(undefined, {
    enabled: isAuthenticated && !authLoading,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const cancelMutation = trpc.billing.cancelSubscription.useMutation({
    onSuccess: () => {
      setStep('success');
      refetch();
    },
  });

  const reactivateMutation = trpc.billing.updateSubscription.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  if (isLoading || authLoading) {
    return (
      <div className="max-w-xl mx-auto">
        <CardSkeleton rows={3} />
      </div>
    );
  }

  if (error) {
    return <ErrorState message="Failed to load subscription data. Please try again later." />;
  }

  if (!subscription) {
    return (
      <Card className="border border-slate-200 dark:border-slate-800 max-w-xl mx-auto">
        <CardContent className="p-6">
          <EmptyState icon="credit_card_off" message="No active subscription to cancel." />
        </CardContent>
      </Card>
    );
  }

  // If already cancelling, show reactivation
  if (subscription.cancelAtPeriodEnd && step !== 'success') {
    return (
      <Card className="border border-amber-200 dark:border-amber-800 max-w-xl mx-auto">
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-600" aria-hidden="true">
              warning
            </span>
            Subscription Ending
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            Your subscription will end on {formatBillingDate(subscription.currentPeriodEnd)}.
            You can reactivate to keep your plan active.
          </p>
        </CardContent>
        <CardFooter>
          <Button
            onClick={() => reactivateMutation.mutate({ cancelAtPeriodEnd: false } as Record<string, unknown>)}
            disabled={reactivateMutation.isPending}
            aria-label="Reactivate subscription"
          >
            {reactivateMutation.isPending ? 'Processing...' : 'Reactivate'}
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const plan = getPlanByPriceId(subscription.priceId);
  const planName = plan?.name ?? 'Current Plan';
  const cancellationInfo = getCancellationInfo(
    new Date(subscription.currentPeriodEnd),
    subscription.status
  );

  // Success state
  if (step === 'success') {
    return (
      <Card className="border border-slate-200 dark:border-slate-800 max-w-xl mx-auto">
        <CardContent className="p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-3xl text-green-600 dark:text-green-400" aria-hidden="true">
              check_circle
            </span>
          </div>
          <h3 className="text-lg font-semibold mb-2">Subscription Cancelled</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6" aria-live="polite">
            {formatCancellationMessage(new Date(subscription.currentPeriodEnd), true)}
          </p>
          <Button asChild variant="outline">
            <Link href="/billing">Return to Billing</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Step 1: Plan details + retention offer
  if (step === 1) {
    return (
      <div className="max-w-xl mx-auto space-y-6">
        <Card className="border border-slate-200 dark:border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Your Current Plan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xl font-bold">{planName}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Active until {formatBillingDate(subscription.currentPeriodEnd)}
                </p>
              </div>
              <Badge variant="outline" className="text-green-700 border-green-300">Active</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Retention offer */}
        {cancellationInfo.retentionOffer && (
          <Card className="border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <span className="material-symbols-outlined text-2xl text-blue-600 dark:text-blue-400" aria-hidden="true">
                  local_offer
                </span>
                <div>
                  <p className="font-semibold text-blue-800 dark:text-blue-300">
                    Before you go!
                  </p>
                  <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">
                    Stay and get {cancellationInfo.retentionOffer.discountPercent}% off your next 3 months.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex gap-3">
          <Button className="flex-1" asChild>
            <Link href="/billing" aria-label="Keep My Plan">Keep My Plan</Link>
          </Button>
          <Button
            variant="outline"
            className="flex-1 text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800"
            onClick={() => setStep(2)}
            aria-label="Continue Cancellation"
          >
            Continue Cancellation
          </Button>
        </div>
      </div>
    );
  }

  // Step 2: Reason selection
  if (step === 2) {
    return (
      <div className="max-w-xl mx-auto space-y-6">
        <Card className="border border-slate-200 dark:border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Why are you cancelling?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label htmlFor="cancel-reason" className="text-sm font-medium text-slate-700 dark:text-slate-300 block mb-2">
                Reason
              </label>
              <select
                id="cancel-reason"
                role="combobox"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm"
              >
                <option value="">Select a reason...</option>
                {CANCELLATION_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {CANCELLATION_REASON_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="cancel-feedback" className="text-sm font-medium text-slate-700 dark:text-slate-300 block mb-2">
                Additional feedback (optional)
              </label>
              <textarea
                id="cancel-feedback"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Any additional feedback..."
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm resize-none"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>
            Go Back
          </Button>
          <Button
            className="flex-1"
            disabled={!reason}
            onClick={() => setStep(3)}
            aria-label="Continue"
          >
            Continue
          </Button>
        </div>
      </div>
    );
  }

  // Step 3: Confirmation
  return (
    <div className="max-w-xl mx-auto space-y-6">
      <Card className="border border-red-200 dark:border-red-800">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-red-700 dark:text-red-400 flex items-center gap-2">
            <span className="material-symbols-outlined" aria-hidden="true">warning</span>
            Confirm Cancellation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600 dark:text-slate-400" aria-live="polite">
            Your subscription will remain active until {formatBillingDate(subscription.currentPeriodEnd)}.
            After that, you&apos;ll lose access to premium features.
          </p>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>
          Go Back
        </Button>
        <Button
          variant="destructive"
          className="flex-1"
          onClick={() =>
            cancelMutation.mutate({ atPeriodEnd: true, reason } as Record<string, unknown>)
          }
          disabled={cancelMutation.isPending}
          aria-label="Cancel Subscription"
        >
          {cancelMutation.isPending ? 'Processing...' : 'Cancel Subscription'}
        </Button>
      </div>
    </div>
  );
}
