'use client';

/**
 * Subscription Manager Component
 *
 * Full subscription management UI including plan selection,
 * upgrade/downgrade flow, and cancellation handling.
 *
 * @implements PG-030 (Subscriptions)
 */

import { useState, useMemo, useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  Skeleton,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@intelliflow/ui';
import {
  type Plan,
  formatBillingDate,
  getSubscriptionStatusDisplay,
  getPlanById,
  getPlanByPriceId,
  getAnnualSavingsPercent,
} from '@/lib/billing/stripe-portal';
import {
  type PlanChangeDirection,
  comparePlans,
  getPlanChangeDirectionDisplay,
  formatPriceDifference,
  canChangeToPlan,
  getCancellationInfo,
  formatCancellationMessage,
  getPlansWithSelectionState,
  getBillingIntervals,
  getPlanPriceForInterval,
} from '@/lib/billing/plan-changes';

// ============================================
// Types
// ============================================

// Subscription type that matches tRPC response (dates as strings from serialization)
interface Subscription {
  id: string;
  customerId: string;
  status: 'incomplete' | 'incomplete_expired' | 'trialing' | 'active' |
          'past_due' | 'canceled' | 'unpaid' | 'paused';
  priceId: string;
  quantity: number;
  currency: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  canceledAt?: string;
  trialStart?: string;
  trialEnd?: string;
}

interface SubscriptionManagerProps {
  subscription?: Subscription | null;
  onPlanChange?: () => void;
}

type BillingInterval = 'monthly' | 'annual';

// ============================================
// Sub-components
// ============================================

/**
 * Current subscription status card
 */
function CurrentPlanCard({
  subscription,
  onCancelClick,
}: {
  subscription: Subscription;
  onCancelClick: () => void;
}) {
  const statusDisplay = getSubscriptionStatusDisplay(subscription.status);
  const currentPlan = getPlanByPriceId(subscription.priceId);

  const badgeVariantMap: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    success: 'default',
    warning: 'secondary',
    error: 'destructive',
    default: 'outline',
  };

  return (
    <Card className="border-2 border-[#137fec]/20 bg-[#137fec]/5 dark:bg-[#137fec]/10">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#137fec]/10">
              <span className="material-symbols-outlined text-[#137fec]">
                workspace_premium
              </span>
            </div>
            <div>
              <CardTitle className="text-lg">
                {currentPlan?.name ?? 'Current Plan'}
              </CardTitle>
              <CardDescription>
                {currentPlan?.description ?? 'Your active subscription'}
              </CardDescription>
            </div>
          </div>
          <Badge variant={badgeVariantMap[statusDisplay.variant]}>
            {statusDisplay.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-slate-500 dark:text-slate-400">Billing Period</span>
            <p className="font-medium text-slate-900 dark:text-white">
              {formatBillingDate(subscription.currentPeriodStart)} -{' '}
              {formatBillingDate(subscription.currentPeriodEnd)}
            </p>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400">Next Invoice</span>
            <p className="font-medium text-slate-900 dark:text-white">
              {subscription.cancelAtPeriodEnd
                ? 'Cancelled'
                : formatBillingDate(subscription.currentPeriodEnd)}
            </p>
          </div>
        </div>

        {subscription.cancelAtPeriodEnd && (
          <div className="rounded-lg bg-amber-50 p-3 dark:bg-amber-900/20">
            <div className="flex items-start gap-2">
              <span className="material-symbols-outlined text-amber-600 dark:text-amber-400">
                warning
              </span>
              <div className="text-sm">
                <p className="font-medium text-amber-800 dark:text-amber-200">
                  Subscription Ending
                </p>
                <p className="text-amber-700 dark:text-amber-300">
                  {formatCancellationMessage(new Date(subscription.currentPeriodEnd), true)}
                </p>
              </div>
            </div>
          </div>
        )}

        {!subscription.cancelAtPeriodEnd && (
          <Button
            variant="outline"
            size="sm"
            onClick={onCancelClick}
            className="text-slate-600 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400"
          >
            <span className="material-symbols-outlined mr-2 text-lg">cancel</span>
            Cancel Subscription
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Plan selection card
 */
function PlanCard({
  plan,
  interval,
  isCurrent,
  changeDirection,
  isSelected,
  onSelect,
  disabled,
}: {
  plan: Plan;
  interval: BillingInterval;
  isCurrent: boolean;
  changeDirection: PlanChangeDirection;
  isSelected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  const priceInfo = getPlanPriceForInterval(plan, interval);
  const directionDisplay = getPlanChangeDirectionDisplay(changeDirection);
  const annualSavings = getAnnualSavingsPercent(plan);

  return (
    <Card
      className={`relative cursor-pointer transition-all ${
        isSelected
          ? 'border-2 border-[#137fec] ring-2 ring-[#137fec]/20'
          : isCurrent
            ? 'border-2 border-slate-300 dark:border-slate-600'
            : 'border hover:border-slate-300 dark:hover:border-slate-600'
      } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
      onClick={disabled ? undefined : onSelect}
    >
      {plan.popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="bg-[#137fec] text-white hover:bg-[#137fec]">
            Most Popular
          </Badge>
        </div>
      )}

      {isCurrent && (
        <div className="absolute right-3 top-3">
          <Badge variant="secondary">Current</Badge>
        </div>
      )}

      <CardHeader className="pb-2 pt-6">
        <CardTitle className="text-xl">{plan.name}</CardTitle>
        <CardDescription>{plan.description}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div>
          <span className="text-3xl font-bold text-slate-900 dark:text-white">
            {priceInfo.formattedPerMonth}
          </span>
          {interval === 'annual' && priceInfo.savings && (
            <span className="ml-2 text-sm text-green-600 dark:text-green-400">
              {priceInfo.savings}
            </span>
          )}
        </div>

        {interval === 'annual' && annualSavings > 0 && (
          <div className="text-sm text-slate-500 dark:text-slate-400">
            Billed {priceInfo.formatted}
          </div>
        )}

        <ul className="space-y-2">
          {plan.features.map((feature, index) => (
            <li key={index} className="flex items-start gap-2 text-sm">
              <span
                className={`material-symbols-outlined text-lg ${
                  feature.included
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-slate-300 dark:text-slate-600'
                }`}
              >
                {feature.included ? 'check_circle' : 'cancel'}
              </span>
              <span
                className={
                  feature.included
                    ? 'text-slate-700 dark:text-slate-300'
                    : 'text-slate-400 dark:text-slate-500'
                }
              >
                {feature.name}
              </span>
            </li>
          ))}
        </ul>

        {!isCurrent && (
          <div className="pt-2">
            <Button
              className={`w-full ${
                changeDirection === 'upgrade'
                  ? 'bg-[#137fec] hover:bg-[#0e6ac7]'
                  : changeDirection === 'downgrade'
                    ? 'bg-amber-500 hover:bg-amber-600'
                    : ''
              }`}
              disabled={disabled}
            >
              <span className="material-symbols-outlined mr-2 text-lg">
                {directionDisplay.icon}
              </span>
              {directionDisplay.label} to {plan.name}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Billing interval toggle
 */
function IntervalToggle({
  value,
  onChange,
}: {
  value: BillingInterval;
  onChange: (interval: BillingInterval) => void;
}) {
  const intervals = getBillingIntervals();

  return (
    <div className="flex items-center justify-center gap-2 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
      {intervals.map((interval) => (
        <button
          key={interval.id}
          onClick={() => onChange(interval.id)}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            value === interval.id
              ? 'bg-white text-slate-900 shadow dark:bg-slate-700 dark:text-white'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
          }`}
        >
          {interval.label}
          {interval.id === 'annual' && (
            <span className="ml-1 text-xs text-green-600 dark:text-green-400">
              Save 20%
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/**
 * Plan change confirmation dialog
 */
function ChangePlanDialog({
  open,
  onOpenChange,
  currentPlanId,
  targetPlan,
  isLoading,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPlanId: string | null;
  targetPlan: Plan | null;
  isLoading: boolean;
  onConfirm: () => void;
}) {
  if (!targetPlan) return null;

  const comparison = comparePlans(currentPlanId, targetPlan.id);
  if (!comparison) return null;

  const directionDisplay = getPlanChangeDirectionDisplay(comparison.direction);
  const priceDiff = formatPriceDifference(
    comparison.priceDifference,
    targetPlan.currency
  );

  const gainedFeatures = comparison.featureChanges.filter((f) => f.change === 'gained');
  const lostFeatures = comparison.featureChanges.filter((f) => f.change === 'lost');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span
              className={`material-symbols-outlined ${
                comparison.direction === 'upgrade'
                  ? 'text-green-600'
                  : 'text-amber-600'
              }`}
            >
              {directionDisplay.icon}
            </span>
            {directionDisplay.label} to {targetPlan.name}
          </DialogTitle>
          <DialogDescription>
            {directionDisplay.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600 dark:text-slate-400">
                Price Change
              </span>
              <span
                className={`font-semibold ${
                  priceDiff.isIncrease
                    ? 'text-amber-600'
                    : priceDiff.isDecrease
                      ? 'text-green-600'
                      : ''
                }`}
              >
                {priceDiff.formatted}
              </span>
            </div>
          </div>

          {gainedFeatures.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-medium text-green-700 dark:text-green-400">
                Features You'll Gain
              </h4>
              <ul className="space-y-1">
                {gainedFeatures.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <span className="material-symbols-outlined text-green-600">
                      add_circle
                    </span>
                    {f.name}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {lostFeatures.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-medium text-amber-700 dark:text-amber-400">
                Features You'll Lose
              </h4>
              <ul className="space-y-1">
                {lostFeatures.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <span className="material-symbols-outlined text-amber-600">
                      remove_circle
                    </span>
                    {f.name}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-sm text-slate-500 dark:text-slate-400">
            {comparison.direction === 'upgrade'
              ? 'You will be charged the prorated difference immediately.'
              : 'The change will take effect at the end of your current billing period.'}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isLoading}
            className={
              comparison.direction === 'upgrade'
                ? 'bg-[#137fec] hover:bg-[#0e6ac7]'
                : 'bg-amber-500 hover:bg-amber-600'
            }
          >
            {isLoading ? (
              <>
                <span className="material-symbols-outlined mr-2 animate-spin">
                  progress_activity
                </span>
                Processing...
              </>
            ) : (
              <>Confirm {directionDisplay.label}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Cancel subscription dialog
 */
function CancelDialog({
  open,
  onOpenChange,
  subscription,
  isLoading,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscription: Subscription | null;
  isLoading: boolean;
  onConfirm: (atPeriodEnd: boolean) => void;
}) {
  if (!subscription) return null;

  const cancellationInfo = getCancellationInfo(
    new Date(subscription.currentPeriodEnd),
    subscription.status
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <span className="material-symbols-outlined">warning</span>
            Cancel Subscription
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to cancel your subscription?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-lg bg-amber-50 p-4 dark:bg-amber-900/20">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Your subscription will remain active until{' '}
              <strong>{formatBillingDate(cancellationInfo.effectiveDate)}</strong>.
              After that, you'll lose access to premium features.
            </p>
          </div>

          {cancellationInfo.retentionOffer && (
            <div className="rounded-lg border-2 border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-green-600">
                  local_offer
                </span>
                <div>
                  <h4 className="font-medium text-green-800 dark:text-green-200">
                    Stay with us!
                  </h4>
                  <p className="text-sm text-green-700 dark:text-green-300">
                    {cancellationInfo.retentionOffer.description}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="text-sm text-slate-600 dark:text-slate-400">
            <p className="mb-2">You'll lose access to:</p>
            <ul className="list-inside list-disc space-y-1">
              <li>AI-powered lead scoring</li>
              <li>Advanced analytics</li>
              <li>Priority support</li>
              <li>Workflow automation</li>
            </ul>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            Keep Subscription
          </Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm(true)}
            disabled={isLoading}
            className="w-full sm:w-auto"
          >
            {isLoading ? (
              <>
                <span className="material-symbols-outlined mr-2 animate-spin">
                  progress_activity
                </span>
                Cancelling...
              </>
            ) : (
              <>Cancel at Period End</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Empty state when no subscription
 */
function NoSubscriptionState({ onSelectPlan }: { onSelectPlan: () => void }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
          <span className="material-symbols-outlined text-3xl text-slate-400">
            credit_card_off
          </span>
        </div>
        <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-white">
          No Active Subscription
        </h3>
        <p className="mb-6 max-w-sm text-sm text-slate-500 dark:text-slate-400">
          Choose a plan to unlock AI-powered features and take your CRM to the next level.
        </p>
        <Button onClick={onSelectPlan} className="bg-[#137fec] hover:bg-[#0e6ac7]">
          <span className="material-symbols-outlined mr-2">rocket_launch</span>
          View Plans
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Loading skeleton
 */
function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-48 w-full" />
      <div className="flex justify-center">
        <Skeleton className="h-10 w-64" />
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-96" />
        ))}
      </div>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export function SubscriptionManager({
  subscription: externalSubscription,
  onPlanChange,
}: SubscriptionManagerProps) {
  // State
  const [interval, setInterval] = useState<BillingInterval>('monthly');
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [showChangePlanDialog, setShowChangePlanDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showPlanSelector, setShowPlanSelector] = useState(false);

  // Queries
  const {
    data: fetchedSubscription,
    isLoading: isLoadingSubscription,
  } = trpc.billing.getSubscription.useQuery(undefined, {
    enabled: !externalSubscription,
  });

  // Cast tRPC response to our Subscription type (dates come as ISO strings)
  const subscription = (externalSubscription ?? fetchedSubscription) as Subscription | null | undefined;

  // Mutations
  const updateSubscription = trpc.billing.updateSubscription.useMutation({
    onSuccess: () => {
      setShowChangePlanDialog(false);
      setSelectedPlanId(null);
      onPlanChange?.();
    },
  });

  const cancelSubscription = trpc.billing.cancelSubscription.useMutation({
    onSuccess: () => {
      setShowCancelDialog(false);
      onPlanChange?.();
    },
  });

  // Derived state
  const currentPlanId = useMemo(() => {
    if (!subscription) return null;
    const plan = getPlanByPriceId(subscription.priceId);
    return plan?.id ?? null;
  }, [subscription]);

  const plansWithState = useMemo(
    () => getPlansWithSelectionState(currentPlanId),
    [currentPlanId]
  );

  const selectedPlan = useMemo(
    () => (selectedPlanId ? getPlanById(selectedPlanId) : null),
    [selectedPlanId]
  );

  // Handlers
  const handleSelectPlan = useCallback((planId: string) => {
    setSelectedPlanId(planId);
    setShowChangePlanDialog(true);
  }, []);

  const handleConfirmChange = useCallback(() => {
    if (!selectedPlan) return;

    // Get the price ID for the selected interval
    const priceId =
      interval === 'annual'
        ? `${selectedPlan.priceId.replace('_monthly', '_annual')}`
        : selectedPlan.priceId;

    updateSubscription.mutate({ priceId });
  }, [selectedPlan, interval, updateSubscription]);

  const handleCancelSubscription = useCallback(
    (atPeriodEnd: boolean) => {
      cancelSubscription.mutate({ atPeriodEnd });
    },
    [cancelSubscription]
  );

  // Render
  if (isLoadingSubscription && !externalSubscription) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="space-y-8">
      {/* Current Plan */}
      {subscription ? (
        <CurrentPlanCard
          subscription={subscription}
          onCancelClick={() => setShowCancelDialog(true)}
        />
      ) : (
        <NoSubscriptionState onSelectPlan={() => setShowPlanSelector(true)} />
      )}

      {/* Plan Selection */}
      {(subscription || showPlanSelector) && (
        <div className="space-y-6">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                {subscription ? 'Change Plan' : 'Choose a Plan'}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {subscription
                  ? 'Upgrade or downgrade your subscription'
                  : 'Select the plan that best fits your needs'}
              </p>
            </div>
            <IntervalToggle value={interval} onChange={setInterval} />
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {plansWithState.map((plan) => {
              const validation = canChangeToPlan(
                currentPlanId,
                plan.id,
                subscription?.quantity ?? 1
              );

              return (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  interval={interval}
                  isCurrent={plan.isCurrent}
                  changeDirection={plan.changeDirection}
                  isSelected={selectedPlanId === plan.id}
                  onSelect={() => handleSelectPlan(plan.id)}
                  disabled={!validation.allowed}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Change Plan Dialog */}
      <ChangePlanDialog
        open={showChangePlanDialog}
        onOpenChange={setShowChangePlanDialog}
        currentPlanId={currentPlanId}
        targetPlan={selectedPlan ?? null}
        isLoading={updateSubscription.isPending}
        onConfirm={handleConfirmChange}
      />

      {/* Cancel Dialog */}
      <CancelDialog
        open={showCancelDialog}
        onOpenChange={setShowCancelDialog}
        subscription={subscription ?? null}
        isLoading={cancelSubscription.isPending}
        onConfirm={handleCancelSubscription}
      />
    </div>
  );
}

export default SubscriptionManager;
