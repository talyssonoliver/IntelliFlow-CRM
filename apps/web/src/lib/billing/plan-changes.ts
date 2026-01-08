/**
 * Plan Changes Utility
 *
 * Provides helpers for managing subscription plan changes including
 * upgrades, downgrades, and proration calculations.
 *
 * @implements PG-030 (Subscriptions)
 */

import {
  type Plan,
  PLANS,
  getPlanById,
  formatCurrency,
  formatBillingDate,
} from './stripe-portal';

// ============================================
// Types
// ============================================

export type PlanChangeDirection = 'upgrade' | 'downgrade' | 'same';

export interface PlanComparison {
  from: Plan | null;
  to: Plan;
  direction: PlanChangeDirection;
  priceDifference: number; // Monthly difference in cents
  featureChanges: FeatureChange[];
}

export interface FeatureChange {
  name: string;
  previouslyIncluded: boolean;
  nowIncluded: boolean;
  change: 'gained' | 'lost' | 'unchanged';
  previousLimit?: string | number;
  newLimit?: string | number;
}

export interface ProrationPreview {
  amountDue: number;
  currency: string;
  effectiveDate: Date;
  creditApplied: number;
  newPlanAmount: number;
  description: string;
}

export interface PlanChangeResult {
  success: boolean;
  message: string;
  newPlanId?: string;
  effectiveDate?: Date;
}

// ============================================
// Plan Comparison
// ============================================

/**
 * Get the plan tier index (higher = more expensive)
 */
export function getPlanTierIndex(planId: string): number {
  const order: Record<string, number> = {
    starter: 0,
    professional: 1,
    enterprise: 2,
  };
  return order[planId] ?? -1;
}

/**
 * Determine if a plan change is an upgrade, downgrade, or same
 */
export function getPlanChangeDirection(
  fromPlanId: string | null,
  toPlanId: string
): PlanChangeDirection {
  if (!fromPlanId) return 'upgrade'; // New subscription is always an "upgrade"
  if (fromPlanId === toPlanId) return 'same';

  const fromTier = getPlanTierIndex(fromPlanId);
  const toTier = getPlanTierIndex(toPlanId);

  if (toTier > fromTier) return 'upgrade';
  if (toTier < fromTier) return 'downgrade';
  return 'same';
}

/**
 * Compare two plans and return detailed comparison
 */
export function comparePlans(
  fromPlanId: string | null,
  toPlanId: string
): PlanComparison | null {
  const toPlan = getPlanById(toPlanId);
  if (!toPlan) return null;

  const fromPlan = fromPlanId ? getPlanById(fromPlanId) ?? null : null;
  const direction = getPlanChangeDirection(fromPlanId, toPlanId);

  // Calculate price difference
  const fromPrice = fromPlan?.priceMonthly ?? 0;
  const toPrice = toPlan.priceMonthly;
  const priceDifference = toPrice - fromPrice;

  // Calculate feature changes
  const featureChanges = calculateFeatureChanges(fromPlan, toPlan);

  return {
    from: fromPlan,
    to: toPlan,
    direction,
    priceDifference,
    featureChanges,
  };
}

/**
 * Calculate feature changes between two plans
 */
function calculateFeatureChanges(
  fromPlan: Plan | null,
  toPlan: Plan
): FeatureChange[] {
  const changes: FeatureChange[] = [];

  // Build a map of fromPlan features
  const fromFeatures = new Map<string, { included: boolean; limit?: string | number }>();
  if (fromPlan) {
    for (const feature of fromPlan.features) {
      fromFeatures.set(feature.name, {
        included: feature.included,
        limit: feature.limit,
      });
    }
  }

  // Compare with toPlan features
  for (const feature of toPlan.features) {
    const fromFeature = fromFeatures.get(feature.name);
    const previouslyIncluded = fromFeature?.included ?? false;
    const nowIncluded = feature.included;

    let change: 'gained' | 'lost' | 'unchanged';
    if (nowIncluded && !previouslyIncluded) {
      change = 'gained';
    } else if (!nowIncluded && previouslyIncluded) {
      change = 'lost';
    } else {
      change = 'unchanged';
    }

    changes.push({
      name: feature.name,
      previouslyIncluded,
      nowIncluded,
      change,
      previousLimit: fromFeature?.limit,
      newLimit: feature.limit,
    });
  }

  return changes;
}

// ============================================
// Proration Helpers
// ============================================

/**
 * Estimate proration amount for a plan change
 * Note: Actual proration is calculated by Stripe via getUpcomingInvoice
 */
export function estimateProration(
  fromPlan: Plan,
  toPlan: Plan,
  daysRemainingInPeriod: number,
  totalDaysInPeriod: number
): number {
  const dailyDifference =
    (toPlan.priceMonthly - fromPlan.priceMonthly) / totalDaysInPeriod;
  return Math.round(dailyDifference * daysRemainingInPeriod);
}

/**
 * Calculate days remaining in current billing period
 */
export function getDaysRemainingInPeriod(periodEnd: Date): number {
  const now = new Date();
  const diffTime = periodEnd.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
}

/**
 * Format proration preview for display
 */
export function formatProrationPreview(
  preview: ProrationPreview
): {
  formattedAmountDue: string;
  formattedCredit: string;
  formattedNewAmount: string;
  formattedDate: string;
} {
  return {
    formattedAmountDue: formatCurrency(preview.amountDue, preview.currency),
    formattedCredit: formatCurrency(preview.creditApplied, preview.currency),
    formattedNewAmount: formatCurrency(preview.newPlanAmount, preview.currency),
    formattedDate: formatBillingDate(preview.effectiveDate),
  };
}

// ============================================
// Display Helpers
// ============================================

/**
 * Get display text for plan change direction
 */
export function getPlanChangeDirectionDisplay(direction: PlanChangeDirection): {
  label: string;
  description: string;
  icon: string;
  variant: 'success' | 'warning' | 'default';
} {
  switch (direction) {
    case 'upgrade':
      return {
        label: 'Upgrade',
        description: 'Get more features and higher limits',
        icon: 'arrow_upward',
        variant: 'success',
      };
    case 'downgrade':
      return {
        label: 'Downgrade',
        description: 'Some features may become unavailable',
        icon: 'arrow_downward',
        variant: 'warning',
      };
    case 'same':
      return {
        label: 'Current Plan',
        description: 'This is your current plan',
        icon: 'check',
        variant: 'default',
      };
  }
}

/**
 * Get badge variant for feature change
 */
export function getFeatureChangeBadge(change: FeatureChange['change']): {
  label: string;
  variant: 'success' | 'warning' | 'default';
  icon: string;
} {
  switch (change) {
    case 'gained':
      return {
        label: 'New',
        variant: 'success',
        icon: 'add',
      };
    case 'lost':
      return {
        label: 'Removed',
        variant: 'warning',
        icon: 'remove',
      };
    case 'unchanged':
      return {
        label: 'Included',
        variant: 'default',
        icon: 'check',
      };
  }
}

/**
 * Format price difference for display
 */
export function formatPriceDifference(
  difference: number,
  currency: string
): {
  formatted: string;
  isIncrease: boolean;
  isDecrease: boolean;
} {
  const isIncrease = difference > 0;
  const isDecrease = difference < 0;
  const absFormatted = formatCurrency(Math.abs(difference), currency);

  let formatted: string;
  if (isIncrease) {
    formatted = `+${absFormatted}/mo`;
  } else if (isDecrease) {
    formatted = `-${absFormatted}/mo`;
  } else {
    formatted = 'No change';
  }

  return { formatted, isIncrease, isDecrease };
}

// ============================================
// Validation Helpers
// ============================================

/**
 * Check if a plan change is allowed
 */
export function canChangeToPlan(
  currentPlanId: string | null,
  targetPlanId: string,
  currentUsers: number
): {
  allowed: boolean;
  reason?: string;
} {
  const targetPlan = getPlanById(targetPlanId);
  if (!targetPlan) {
    return { allowed: false, reason: 'Invalid plan selected' };
  }

  // Check user limits
  if (targetPlan.maxUsers !== null && currentUsers > targetPlan.maxUsers) {
    return {
      allowed: false,
      reason: `This plan only supports ${targetPlan.maxUsers} users. You currently have ${currentUsers} users.`,
    };
  }

  // Can't switch to same plan
  if (currentPlanId === targetPlanId) {
    return { allowed: false, reason: 'You are already on this plan' };
  }

  return { allowed: true };
}

/**
 * Get recommended plan based on current usage
 */
export function getRecommendedPlan(
  currentUsers: number,
  currentContacts: number
): Plan | null {
  for (const plan of PLANS) {
    const maxUsers = plan.maxUsers ?? Infinity;

    // Check user limit
    if (currentUsers > maxUsers) continue;

    // Extract contact limit from features
    const contactFeature = plan.features.find((f) =>
      f.name.toLowerCase().includes('contact')
    );
    if (contactFeature) {
      const limitStr = contactFeature.limit?.toString() ?? '0';
      const limit = limitStr.toLowerCase() === 'unlimited'
        ? Infinity
        : parseInt(limitStr.replace(/,/g, ''), 10);

      if (currentContacts > limit) continue;
    }

    return plan;
  }

  // Return enterprise as fallback
  return PLANS[PLANS.length - 1];
}

// ============================================
// Cancellation Helpers
// ============================================

export interface CancellationInfo {
  effectiveDate: Date;
  canReactivate: boolean;
  daysRemaining: number;
  refundEligible: boolean;
  retentionOffer?: {
    discountPercent: number;
    description: string;
  };
}

/**
 * Get cancellation information
 */
export function getCancellationInfo(
  periodEnd: Date,
  subscriptionStatus: string
): CancellationInfo {
  const daysRemaining = getDaysRemainingInPeriod(periodEnd);
  const canReactivate = subscriptionStatus !== 'canceled';

  // Refund eligible if more than 25 days remaining (within first 5 days)
  const refundEligible = daysRemaining > 25;

  // Retention offer for professional plan users
  const retentionOffer = daysRemaining > 14
    ? {
        discountPercent: 20,
        description: 'Stay with us and get 20% off your next 3 months',
      }
    : undefined;

  return {
    effectiveDate: periodEnd,
    canReactivate,
    daysRemaining,
    refundEligible,
    retentionOffer,
  };
}

/**
 * Format cancellation date message
 */
export function formatCancellationMessage(
  periodEnd: Date,
  atPeriodEnd: boolean
): string {
  const formattedDate = formatBillingDate(periodEnd);

  if (atPeriodEnd) {
    return `Your subscription will remain active until ${formattedDate}. After that, you'll lose access to premium features.`;
  }

  return `Your subscription has been cancelled and will end on ${formattedDate}.`;
}

// ============================================
// Plan Selection Helpers
// ============================================

/**
 * Get all available plans with selection state
 */
export function getPlansWithSelectionState(currentPlanId: string | null): Array<
  Plan & {
    isCurrent: boolean;
    changeDirection: PlanChangeDirection;
    isRecommended: boolean;
  }
> {
  return PLANS.map((plan) => ({
    ...plan,
    isCurrent: plan.id === currentPlanId,
    changeDirection: getPlanChangeDirection(currentPlanId, plan.id),
    isRecommended: plan.popular ?? false,
  }));
}

/**
 * Get billing interval options
 */
export function getBillingIntervals(): Array<{
  id: 'monthly' | 'annual';
  label: string;
  description: string;
}> {
  return [
    {
      id: 'monthly',
      label: 'Monthly',
      description: 'Pay month-to-month, cancel anytime',
    },
    {
      id: 'annual',
      label: 'Annual',
      description: 'Save up to 20% with annual billing',
    },
  ];
}

/**
 * Get plan price for interval
 */
export function getPlanPriceForInterval(
  plan: Plan,
  interval: 'monthly' | 'annual'
): {
  amount: number;
  perMonth: number;
  formatted: string;
  formattedPerMonth: string;
  savings?: string;
} {
  if (interval === 'annual') {
    const perMonth = plan.priceAnnual / 12;
    const savings = plan.priceMonthly * 12 - plan.priceAnnual;
    return {
      amount: plan.priceAnnual,
      perMonth,
      formatted: formatCurrency(plan.priceAnnual, plan.currency) + '/year',
      formattedPerMonth: formatCurrency(perMonth, plan.currency) + '/mo',
      savings: savings > 0 ? formatCurrency(savings, plan.currency) + ' saved' : undefined,
    };
  }

  return {
    amount: plan.priceMonthly,
    perMonth: plan.priceMonthly,
    formatted: formatCurrency(plan.priceMonthly, plan.currency) + '/mo',
    formattedPerMonth: formatCurrency(plan.priceMonthly, plan.currency) + '/mo',
  };
}
