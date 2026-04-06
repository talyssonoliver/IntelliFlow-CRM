'use client';

/**
 * Cancel Flow Component
 *
 * 3-step cancellation flow with leads/new-style stepper:
 *   Step 1 — Plan overview + dynamic feature loss cards
 *   Step 2 — Exit survey (radio buttons) + additional feedback
 *   Step 3 — Final confirmation with 3-button action bar
 *
 * @implements PG-172 (Billing Ghost Pages — Cancel)
 */

import * as React from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent, CardFooter, Badge, Button } from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/lib/auth/AuthContext';
import { getPlanByPriceId, formatBillingDate, type PlanFeature } from '@/lib/billing/stripe-portal';
import {
  getCancellationInfo,
  formatCancellationMessage,
  CANCELLATION_REASONS,
  CANCELLATION_REASON_LABELS,
} from '@/lib/billing/plan-changes';
import { EmptyState, ErrorState, CardSkeleton } from './billing-shared';
import { PauseSubscriptionModal } from './pause-subscription-modal';

// ============================================
// Step configuration (leads/new pattern)
// ============================================

type StepId = 'plan' | 'reason' | 'confirm';

interface Step {
  id: StepId;
  number: number;
  label: string;
}

const STEPS: Step[] = [
  { id: 'plan', number: 1, label: 'Your Plan' },
  { id: 'reason', number: 2, label: 'Feedback' },
  { id: 'confirm', number: 3, label: 'Confirm' },
];

// ============================================
// Feature loss descriptions by feature name
// ============================================

const FEATURE_LOSS_DESCRIPTIONS: Record<string, string> = {
  'Up to 5 users':
    'Your team members will lose access to their accounts and all shared data.',
  'Up to 25 users':
    'Your team members will lose access to their accounts and all shared data.',
  'Unlimited users':
    'Your team members will lose access to their accounts and all shared data.',
  '1,000 contacts':
    'You will lose access to your contact database and all enrichment data.',
  '10,000 contacts':
    'You will lose access to your contact database, enrichment data, and lead profiles.',
  'Unlimited contacts':
    'You will lose access to your entire contact database, enrichment data, and lead profiles.',
  'Basic AI lead scoring':
    'Automated lead scoring will stop. Existing scores will no longer update.',
  'Advanced AI insights':
    'AI-powered insights, drift monitoring, and predictive analytics will be deactivated.',
  'Full AI suite':
    'All AI capabilities including drift monitoring, predictive analytics, and automated insights will be deactivated.',
  '1,000 AI predictions/month':
    'AI predictions for deal outcomes and lead conversion will stop immediately.',
  '10,000 AI predictions/month':
    'AI predictions for deal outcomes, lead conversion, and revenue forecasting will stop immediately.',
  'Unlimited AI predictions':
    'All AI predictions including deal outcomes, lead conversion, and revenue forecasting will stop immediately.',
  'Email support':
    'You will lose access to customer support channels.',
  'Priority support (4h response)':
    'Priority support with 4-hour response time will be downgraded.',
  '24/7 priority support':
    '24/7 dedicated priority support will no longer be available.',
  'Workflow automation':
    'All active workflows, email sequences, and automated lead routing rules will be deactivated immediately.',
  'Advanced workflow automation':
    'All active workflows, multi-step email sequences, and automated lead routing rules will be deactivated immediately.',
  'Custom integrations':
    'Custom API integrations and third-party connections will be disconnected.',
  'Dedicated account manager':
    'Your dedicated account manager will no longer be assigned to your account.',
};

function getFeatureLossDescription(feature: PlanFeature): string {
  return (
    FEATURE_LOSS_DESCRIPTIONS[feature.name] ??
    `You will lose access to ${feature.name.toLowerCase()}.`
  );
}

// ============================================
// Step indicator helper
// ============================================

function getStepCircleClass(status: 'completed' | 'current' | 'upcoming'): string {
  if (status === 'current') return 'bg-[#137fec] text-white';
  if (status === 'completed') return 'bg-[#137fec] text-white hover:bg-[#0e6ac7]';
  return 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-2 border-slate-200 dark:border-slate-700';
}

interface StepIndicatorProps {
  steps: Step[];
  currentStepIndex: number;
  onStepClick: (step: Step) => void;
}

function StepIndicator({ steps, currentStepIndex, onStepClick }: Readonly<StepIndicatorProps>) {
  const getStatus = (idx: number): 'completed' | 'current' | 'upcoming' => {
    if (idx < currentStepIndex) return 'completed';
    if (idx === currentStepIndex) return 'current';
    return 'upcoming';
  };

  return (
    <div className="px-8 pt-8 pb-6 border-b border-slate-200 dark:border-slate-700">
      <div className="relative flex items-center justify-between w-full max-w-2xl mx-auto">
        <div className="absolute left-0 top-5 w-full h-0.5 bg-slate-100 dark:bg-slate-700 -z-10" />
        {steps.map((step, idx) => {
          const status = getStatus(idx);
          const isClickable = status === 'completed' || status === 'current';
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => onStepClick(step)}
              disabled={!isClickable}
              className={`flex flex-col items-center gap-2 ${isClickable ? 'cursor-pointer' : 'cursor-not-allowed'}`}
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ring-4 ring-white dark:ring-slate-900 shadow-sm transition-all ${getStepCircleClass(status)}`}
              >
                {status === 'completed' ? (
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                  </svg>
                ) : (
                  step.number
                )}
              </div>
              <span
                className={`text-sm font-medium ${
                  status === 'upcoming'
                    ? 'text-slate-500 dark:text-slate-400'
                    : 'font-bold text-slate-900 dark:text-white'
                }`}
              >
                {step.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================
// Step sub-components (extracted to reduce cognitive complexity of CancelFlow)
// ============================================

interface PlanStepProps {
  planName: string;
  periodEnd: string;
  retentionOffer: { discountPercent: number } | null | undefined;
  includedFeatures: PlanFeature[];
}

function PlanStep({ planName, periodEnd, retentionOffer, includedFeatures }: Readonly<PlanStepProps>) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Your Current Plan</h3>
          <Badge variant="outline" className="text-green-700 border-green-300">Active</Badge>
        </div>
        <div>
          <p className="text-xl font-bold text-slate-900 dark:text-white">{planName}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Active until {formatBillingDate(periodEnd)}</p>
        </div>
      </div>

      {retentionOffer && (
        <div className="flex items-start gap-4 p-4 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
          <span className="material-symbols-outlined text-2xl text-blue-600 dark:text-blue-400" aria-hidden="true">
            local_offer
          </span>
          <div>
            <p className="font-semibold text-blue-800 dark:text-blue-300">Before you go!</p>
            <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">
              Stay and get {retentionOffer.discountPercent}% off your next 3 months.
            </p>
          </div>
        </div>
      )}

      {includedFeatures.length > 0 && (
        <div className="flex flex-col gap-4">
          <h4 className="text-base font-semibold text-slate-800 dark:text-slate-200">
            What you&apos;ll lose access to:
          </h4>
          <div className="flex flex-col gap-3">
            {includedFeatures.map((feature) => (
              <div
                key={feature.name}
                className="flex items-start gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-red-100 dark:border-red-900/30 shadow-sm"
              >
                <div className="flex items-center justify-center rounded-lg bg-red-50 dark:bg-red-900/20 text-red-500 shrink-0 size-10 mt-0.5">
                  <span className="material-symbols-outlined text-xl" aria-hidden="true">warning</span>
                </div>
                <div className="flex flex-col">
                  <p className="text-sm font-bold text-slate-900 dark:text-white leading-normal">
                    {feature.name}
                    {feature.limit && (
                      <span className="text-slate-500 dark:text-slate-400 font-normal ml-1">
                        ({feature.limit})
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mt-0.5">
                    {getFeatureLossDescription(feature)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface ReasonStepProps {
  reason: string;
  feedback: string;
  onReasonChange: (value: string) => void;
  onFeedbackChange: (value: string) => void;
}

function ReasonStep({ reason, feedback, onReasonChange, onFeedbackChange }: Readonly<ReasonStepProps>) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Why are you canceling?</h3>
        <span className="text-xs text-slate-500 dark:text-slate-400">Please select a reason</span>
      </div>

      <fieldset className="flex flex-col gap-3" aria-label="Cancellation reason">
        {CANCELLATION_REASONS.map((value) => (
          <label
            key={value}
            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              reason === value
                ? 'border-[#137fec] bg-[#137fec]/5 dark:border-[#137fec] dark:bg-[#137fec]/10'
                : 'border-slate-200 dark:border-slate-700 hover:border-[#137fec] dark:hover:border-[#137fec]'
            }`}
          >
            <input
              type="radio"
              name="cancel_reason"
              value={value}
              checked={reason === value}
              onChange={(e) => onReasonChange(e.target.value)}
              className="size-4 text-[#137fec] border-slate-300 focus:ring-[#137fec] dark:border-slate-600 dark:bg-slate-800"
            />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {CANCELLATION_REASON_LABELS[value]}
            </span>
          </label>
        ))}
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="cancel-feedback" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
          Additional feedback (optional)
        </label>
        <textarea
          id="cancel-feedback"
          value={feedback}
          onChange={(e) => onFeedbackChange(e.target.value)}
          placeholder="Any additional feedback..."
          rows={3}
          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] placeholder-slate-400 transition-shadow resize-none"
        />
      </div>
    </div>
  );
}

interface ConfirmStepProps {
  planName: string;
  periodEnd: string;
  reason: string;
  feedback: string;
}

function ConfirmStep({ planName, periodEnd, reason, feedback }: Readonly<ConfirmStepProps>) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-4 p-5 rounded-xl border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10">
        <span className="material-symbols-outlined text-2xl text-red-600 dark:text-red-400 mt-0.5" aria-hidden="true">
          warning
        </span>
        <div className="flex flex-col gap-1">
          <p className="font-semibold text-red-800 dark:text-red-300">Confirm Cancellation</p>
          <p className="text-sm text-red-700 dark:text-red-400" aria-live="polite">
            Your subscription will remain active until{' '}
            {formatBillingDate(periodEnd)}. After that, you&apos;ll lose access to all {planName} features.
          </p>
        </div>
      </div>

      {reason && (
        <div className="text-sm text-slate-600 dark:text-slate-400">
          <span className="font-medium text-slate-700 dark:text-slate-300">Reason:{' '}</span>
          {CANCELLATION_REASON_LABELS[reason as (typeof CANCELLATION_REASONS)[number]]}
          {feedback && (
            <>
              <br />
              <span className="font-medium text-slate-700 dark:text-slate-300">Feedback:{' '}</span>
              {feedback}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// Action bar sub-component (extracted to reduce cognitive complexity of CancelFlow)
// ============================================

interface CancelActionBarProps {
  currentStepIndex: number;
  currentStep: StepId;
  reason: string;
  cancelMutation: { isPending: boolean };
  handlePrevStep: () => void;
  handleNextStep: () => void;
  handleConfirmCancelClick: () => void;
}

function CancelActionBar({
  currentStepIndex,
  currentStep,
  reason,
  cancelMutation,
  handlePrevStep,
  handleNextStep,
  handleConfirmCancelClick,
}: Readonly<CancelActionBarProps>) {
  return (
    <div className="flex items-center justify-between pt-6 border-t border-slate-200 dark:border-slate-700 mt-2">
      {/* Left button */}
      <button
        type="button"
        onClick={currentStepIndex === 0 ? undefined : handlePrevStep}
        className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        {currentStepIndex === 0 ? (
          <Link
            href="/billing"
            className="text-slate-600 dark:text-slate-300"
            aria-label="Back to Billing"
          >
            Back to Billing
          </Link>
        ) : (
          'Previous'
        )}
      </button>

      {/* Right buttons */}
      {currentStep === 'confirm' ? (
        /* Step 3: 2 right buttons (Confirm + Keep) */
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleConfirmCancelClick}
            disabled={cancelMutation.isPending}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 border border-red-100 dark:border-red-900/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Confirm Cancellation"
          >
            {cancelMutation.isPending ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span>Processing...</span>
              </>
            ) : (
              'Confirm Cancellation'
            )}
          </button>
          <Link
            href="/billing"
            className="flex items-center gap-2 bg-[#137fec] hover:bg-[#0e6ac7] text-white font-bold py-2.5 px-6 rounded-lg shadow-sm shadow-[#137fec]/30 transition-all active:scale-95"
            aria-label="Keep My Plan"
          >
            Keep My Plan
          </Link>
        </div>
      ) : (
        /* Steps 1-2: Single right button (Next Step) */
        <button
          type="button"
          onClick={handleNextStep}
          disabled={currentStep === 'reason' && !reason}
          className="flex items-center gap-2 bg-[#137fec] hover:bg-[#0e6ac7] text-white font-bold py-2.5 px-6 rounded-lg shadow-sm shadow-[#137fec]/30 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span>{currentStep === 'plan' ? 'Continue Cancellation' : 'Next Step'}</span>
          <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8-8-8z" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ============================================
// Component
// ============================================

export function CancelFlow() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [currentStep, setCurrentStep] = React.useState<StepId>('plan');
  const [reason, setReason] = React.useState<string>('');
  const [feedback, setFeedback] = React.useState('');
  const [showPauseModal, setShowPauseModal] = React.useState(false);
  const [pauseModalDismissed, setPauseModalDismissed] = React.useState(false);
  const [paused, setPaused] = React.useState(false);

  const currentStepIndex = STEPS.findIndex((s) => s.id === currentStep);

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
      setCurrentStep('confirm');
      refetch();
    },
  });

  const reactivateMutation = trpc.billing.updateSubscription.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  const handleStepClick = (step: Step) => {
    const targetIndex = STEPS.findIndex((s) => s.id === step.id);
    if (targetIndex <= currentStepIndex) {
      setCurrentStep(step.id);
    }
  };

  const handleNextStep = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex].id);
    }
  };

  const handlePrevStep = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex].id);
    }
  };

  // --- Guard states ---

  if (isLoading || authLoading) {
    return (
      <div className="max-w-3xl mx-auto">
        <CardSkeleton rows={3} />
      </div>
    );
  }

  if (error) {
    return <ErrorState message="Failed to load subscription data. Please try again later." />;
  }

  if (!subscription) {
    return (
      <div className="max-w-3xl">
        <Card className="border border-slate-200 dark:border-slate-800">
          <CardContent className="p-8">
            <EmptyState icon="" entity="subscriptions" />
            <div className="flex items-center justify-center gap-3 mt-4">
              <Button asChild variant="outline" size="sm">
                <Link href="/billing">Back to Billing</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/billing/plans">View Plans</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Already cancelling — show reactivation
  if (subscription.cancelAtPeriodEnd && currentStep !== 'confirm') {
    return (
      <Card className="border border-amber-200 dark:border-amber-800 max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-600" aria-hidden="true">
              warning
            </span>{' '}
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
            onClick={() =>
              reactivateMutation.mutate({ cancelAtPeriodEnd: false } as Record<string, unknown>)
            }
            disabled={reactivateMutation.isPending}
            aria-label="Reactivate subscription"
          >
            {reactivateMutation.isPending ? 'Processing...' : 'Reactivate'}
          </Button>
        </CardFooter>
      </Card>
    );
  }

  // Derive plan data
  const plan = getPlanByPriceId(subscription.priceId);
  const planName = plan?.name ?? 'Current Plan';
  const includedFeatures = plan?.features.filter((f) => f.included) ?? [];
  const cancellationInfo = getCancellationInfo(
    new Date(subscription.currentPeriodEnd),
    subscription.status
  );

  // Paused success state
  if (paused) {
    return (
      <Card className="border border-slate-200 dark:border-slate-800 max-w-3xl mx-auto">
        <CardContent className="p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto mb-4">
            <span
              className="material-symbols-outlined text-3xl text-blue-600 dark:text-blue-400"
              aria-hidden="true"
            >
              pause_circle
            </span>
          </div>
          <h3 className="text-lg font-semibold mb-2">Subscription Paused</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6" aria-live="polite">
            Your subscription has been paused. Your CRM data and AI model progress are safely
            preserved. Billing will resume automatically at the end of your pause period.
          </p>
          <Button asChild variant="outline">
            <Link href="/billing">Return to Billing</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Cancelled success state
  if (cancelMutation.isSuccess) {
    return (
      <Card className="border border-slate-200 dark:border-slate-800 max-w-3xl mx-auto">
        <CardContent className="p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
            <span
              className="material-symbols-outlined text-3xl text-green-600 dark:text-green-400"
              aria-hidden="true"
            >
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

  // Handle "Confirm Cancellation" click — show pause modal first, or cancel directly
  const handleConfirmCancelClick = () => {
    if (!pauseModalDismissed) {
      setShowPauseModal(true);
    } else {
      cancelMutation.mutate({ atPeriodEnd: true, reason } as Record<string, unknown>);
    }
  };

  // --- Main 3-step layout ---
  return (
    <Card className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      {/* Step Indicator — leads/new pattern */}
      <StepIndicator
        steps={STEPS}
        currentStepIndex={currentStepIndex}
        onStepClick={handleStepClick}
      />

      {/* Step Content */}
      <div className="p-8">
        <div className="flex flex-col gap-8">
          {/* Step 1: Your Plan */}
          {currentStep === 'plan' && (
            <PlanStep
              planName={planName}
              periodEnd={subscription.currentPeriodEnd}
              retentionOffer={cancellationInfo.retentionOffer}
              includedFeatures={includedFeatures}
            />
          )}

          {/* Step 2: Feedback */}
          {currentStep === 'reason' && (
            <ReasonStep
              reason={reason}
              feedback={feedback}
              onReasonChange={setReason}
              onFeedbackChange={setFeedback}
            />
          )}

          {/* Step 3: Confirm */}
          {currentStep === 'confirm' && (
            <ConfirmStep
              planName={planName}
              periodEnd={subscription.currentPeriodEnd}
              reason={reason}
              feedback={feedback}
            />
          )}

          {/* ======================= */}
          {/* Action Buttons Footer   */}
          {/* ======================= */}
          <CancelActionBar
            currentStepIndex={currentStepIndex}
            currentStep={currentStep}
            reason={reason}
            cancelMutation={cancelMutation}
            handlePrevStep={handlePrevStep}
            handleNextStep={handleNextStep}
            handleConfirmCancelClick={handleConfirmCancelClick}
          />
        </div>
      </div>

      {/* Pause subscription modal — intercepts first cancel attempt */}
      <PauseSubscriptionModal
        open={showPauseModal}
        onOpenChange={setShowPauseModal}
        onContinueCancel={() => {
          setShowPauseModal(false);
          setPauseModalDismissed(true);
          cancelMutation.mutate({ atPeriodEnd: true, reason } as Record<string, unknown>);
        }}
        onPauseSuccess={() => {
          setShowPauseModal(false);
          setPaused(true);
          refetch();
        }}
      />
    </Card>
  );
}
