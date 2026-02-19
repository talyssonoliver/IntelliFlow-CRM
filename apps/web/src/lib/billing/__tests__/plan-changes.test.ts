import { describe, it, expect, vi } from 'vitest';

/**
 * We mock the stripe-portal module so that plan-changes.ts gets controlled
 * data for PLANS, getPlanById, formatCurrency, and formatBillingDate.
 */
vi.mock('../stripe-portal', () => {
  const PLANS = [
    {
      id: 'starter',
      priceId: 'price_starter_monthly',
      name: 'Starter',
      description: 'Small teams',
      priceMonthly: 2900,
      priceAnnual: 28800,
      currency: 'GBP',
      maxUsers: 5,
      popular: false,
      features: [
        { name: 'Users', included: true, limit: 5 },
        { name: 'Contacts', included: true, limit: '1,000' },
        { name: 'AI scoring', included: true },
        { name: 'Workflow automation', included: false },
        { name: 'Custom integrations', included: false },
      ],
    },
    {
      id: 'professional',
      priceId: 'price_professional_monthly',
      name: 'Professional',
      description: 'Growing teams',
      priceMonthly: 7900,
      priceAnnual: 78000,
      currency: 'GBP',
      maxUsers: 25,
      popular: true,
      features: [
        { name: 'Users', included: true, limit: 25 },
        { name: 'Contacts', included: true, limit: '10,000' },
        { name: 'AI scoring', included: true },
        { name: 'Workflow automation', included: true },
        { name: 'Custom integrations', included: false },
      ],
    },
    {
      id: 'enterprise',
      priceId: 'price_enterprise_monthly',
      name: 'Enterprise',
      description: 'Large orgs',
      priceMonthly: 19900,
      priceAnnual: 198000,
      currency: 'GBP',
      maxUsers: null,
      features: [
        { name: 'Users', included: true },
        { name: 'Contacts', included: true, limit: 'Unlimited' },
        { name: 'AI scoring', included: true },
        { name: 'Workflow automation', included: true },
        { name: 'Custom integrations', included: true },
      ],
    },
  ];

  return {
    PLANS,
    getPlanById: (planId: string) => PLANS.find((p: { id: string }) => p.id === planId),
    formatCurrency: (amount: number, currency: string) =>
      `${currency === 'GBP' ? '\u00a3' : '$'}${(amount / 100).toFixed(2)}`,
    formatBillingDate: (date: Date | string) => {
      const d = typeof date === 'string' ? new Date(date) : date;
      return d.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
    },
  };
});

import {
  getPlanTierIndex,
  getPlanChangeDirection,
  comparePlans,
  estimateProration,
  getDaysRemainingInPeriod,
  formatProrationPreview,
  getPlanChangeDirectionDisplay,
  getFeatureChangeBadge,
  formatPriceDifference,
  canChangeToPlan,
  getRecommendedPlan,
  getCancellationInfo,
  formatCancellationMessage,
  getPlansWithSelectionState,
  getBillingIntervals,
  getPlanPriceForInterval,
} from '../plan-changes';

// ============================================
// getPlanTierIndex
// ============================================

describe('getPlanTierIndex', () => {
  it('returns 0 for starter', () => {
    expect(getPlanTierIndex('starter')).toBe(0);
  });

  it('returns 1 for professional', () => {
    expect(getPlanTierIndex('professional')).toBe(1);
  });

  it('returns 2 for enterprise', () => {
    expect(getPlanTierIndex('enterprise')).toBe(2);
  });

  it('returns -1 for unknown plan', () => {
    expect(getPlanTierIndex('nonexistent')).toBe(-1);
  });
});

// ============================================
// getPlanChangeDirection
// ============================================

describe('getPlanChangeDirection', () => {
  it('returns "upgrade" when fromPlanId is null (new subscription)', () => {
    expect(getPlanChangeDirection(null, 'starter')).toBe('upgrade');
  });

  it('returns "same" when both plans are the same', () => {
    expect(getPlanChangeDirection('starter', 'starter')).toBe('same');
  });

  it('returns "upgrade" when moving from lower to higher tier', () => {
    expect(getPlanChangeDirection('starter', 'professional')).toBe('upgrade');
    expect(getPlanChangeDirection('starter', 'enterprise')).toBe('upgrade');
    expect(getPlanChangeDirection('professional', 'enterprise')).toBe('upgrade');
  });

  it('returns "downgrade" when moving from higher to lower tier', () => {
    expect(getPlanChangeDirection('enterprise', 'professional')).toBe('downgrade');
    expect(getPlanChangeDirection('enterprise', 'starter')).toBe('downgrade');
    expect(getPlanChangeDirection('professional', 'starter')).toBe('downgrade');
  });

  it('returns "same" for two unknown plan IDs with same tier (-1)', () => {
    expect(getPlanChangeDirection('unknown1', 'unknown2')).toBe('same');
  });
});

// ============================================
// comparePlans
// ============================================

describe('comparePlans', () => {
  it('returns null for invalid target plan', () => {
    expect(comparePlans('starter', 'nonexistent')).toBeNull();
  });

  it('compares from null (new subscription) to a valid plan', () => {
    const result = comparePlans(null, 'starter');
    expect(result).not.toBeNull();
    expect(result!.from).toBeNull();
    expect(result!.to.id).toBe('starter');
    expect(result!.direction).toBe('upgrade');
    expect(result!.priceDifference).toBe(2900); // 0 -> 2900
  });

  it('compares upgrade from starter to professional', () => {
    const result = comparePlans('starter', 'professional');
    expect(result).not.toBeNull();
    expect(result!.direction).toBe('upgrade');
    expect(result!.priceDifference).toBe(7900 - 2900);
  });

  it('compares downgrade from enterprise to starter', () => {
    const result = comparePlans('enterprise', 'starter');
    expect(result).not.toBeNull();
    expect(result!.direction).toBe('downgrade');
    expect(result!.priceDifference).toBe(2900 - 19900);
  });

  it('calculates feature changes correctly', () => {
    const result = comparePlans('starter', 'professional');
    expect(result).not.toBeNull();
    const features = result!.featureChanges;
    expect(features.length).toBeGreaterThan(0);

    // Workflow automation: was false in starter, true in professional -> gained
    const workflowFeature = features.find((f) => f.name === 'Workflow automation');
    expect(workflowFeature).toBeDefined();
    expect(workflowFeature!.change).toBe('gained');
    expect(workflowFeature!.previouslyIncluded).toBe(false);
    expect(workflowFeature!.nowIncluded).toBe(true);
  });

  it('marks features as lost when downgrading', () => {
    const result = comparePlans('professional', 'starter');
    expect(result).not.toBeNull();
    const workflowFeature = result!.featureChanges.find((f) => f.name === 'Workflow automation');
    expect(workflowFeature).toBeDefined();
    expect(workflowFeature!.change).toBe('lost');
  });

  it('marks features as unchanged when both plans include them', () => {
    const result = comparePlans('starter', 'professional');
    expect(result).not.toBeNull();
    const aiFeature = result!.featureChanges.find((f) => f.name === 'AI scoring');
    expect(aiFeature).toBeDefined();
    expect(aiFeature!.change).toBe('unchanged');
  });

  it('handles invalid fromPlanId gracefully (returns null from)', () => {
    const result = comparePlans('nonexistent', 'starter');
    expect(result).not.toBeNull();
    expect(result!.from).toBeNull();
  });

  it('includes previousLimit and newLimit in feature changes', () => {
    const result = comparePlans('starter', 'professional');
    expect(result).not.toBeNull();
    const contactFeature = result!.featureChanges.find((f) => f.name === 'Contacts');
    expect(contactFeature).toBeDefined();
    expect(contactFeature!.previousLimit).toBe('1,000');
    expect(contactFeature!.newLimit).toBe('10,000');
  });
});

// ============================================
// estimateProration
// ============================================

describe('estimateProration', () => {
  const starterPlan = { priceMonthly: 2900 } as any;
  const proPlan = { priceMonthly: 7900 } as any;

  it('calculates proration for remaining days', () => {
    // Daily difference: (7900 - 2900) / 30 = 166.67
    // 15 days remaining: Math.round(166.67 * 15) = 2500
    const result = estimateProration(starterPlan, proPlan, 15, 30);
    expect(result).toBe(Math.round(((7900 - 2900) / 30) * 15));
  });

  it('returns 0 for 0 days remaining', () => {
    const result = estimateProration(starterPlan, proPlan, 0, 30);
    expect(result).toBe(0);
  });

  it('handles full period remaining', () => {
    const result = estimateProration(starterPlan, proPlan, 30, 30);
    expect(result).toBe(5000); // Exact difference
  });

  it('handles downgrade (negative proration)', () => {
    const result = estimateProration(proPlan, starterPlan, 15, 30);
    expect(result).toBeLessThan(0);
  });
});

// ============================================
// getDaysRemainingInPeriod
// ============================================

describe('getDaysRemainingInPeriod', () => {
  it('returns 0 for a past date', () => {
    const pastDate = new Date('2020-01-01');
    expect(getDaysRemainingInPeriod(pastDate)).toBe(0);
  });

  it('returns positive number for a future date', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    const result = getDaysRemainingInPeriod(futureDate);
    expect(result).toBeGreaterThanOrEqual(9);
    expect(result).toBeLessThanOrEqual(11);
  });

  it('returns 0 for the current date (approximately)', () => {
    const now = new Date();
    const result = getDaysRemainingInPeriod(now);
    expect(result).toBeLessThanOrEqual(1);
  });
});

// ============================================
// formatProrationPreview
// ============================================

describe('formatProrationPreview', () => {
  it('formats all proration fields', () => {
    const preview = {
      amountDue: 5000,
      currency: 'GBP',
      effectiveDate: new Date('2026-03-01'),
      creditApplied: 1500,
      newPlanAmount: 7900,
      description: 'Test proration',
    };

    const result = formatProrationPreview(preview);
    expect(result.formattedAmountDue).toContain('50.00');
    expect(result.formattedCredit).toContain('15.00');
    expect(result.formattedNewAmount).toContain('79.00');
    expect(result.formattedDate).toBeTruthy();
  });
});

// ============================================
// getPlanChangeDirectionDisplay
// ============================================

describe('getPlanChangeDirectionDisplay', () => {
  it('returns upgrade display', () => {
    const result = getPlanChangeDirectionDisplay('upgrade');
    expect(result.label).toBe('Upgrade');
    expect(result.variant).toBe('success');
    expect(result.icon).toBe('arrow_upward');
    expect(result.description).toContain('more features');
  });

  it('returns downgrade display', () => {
    const result = getPlanChangeDirectionDisplay('downgrade');
    expect(result.label).toBe('Downgrade');
    expect(result.variant).toBe('warning');
    expect(result.icon).toBe('arrow_downward');
  });

  it('returns same plan display', () => {
    const result = getPlanChangeDirectionDisplay('same');
    expect(result.label).toBe('Current Plan');
    expect(result.variant).toBe('default');
    expect(result.icon).toBe('check');
  });
});

// ============================================
// getFeatureChangeBadge
// ============================================

describe('getFeatureChangeBadge', () => {
  it('returns "New" badge for gained features', () => {
    const result = getFeatureChangeBadge('gained');
    expect(result.label).toBe('New');
    expect(result.variant).toBe('success');
    expect(result.icon).toBe('add');
  });

  it('returns "Removed" badge for lost features', () => {
    const result = getFeatureChangeBadge('lost');
    expect(result.label).toBe('Removed');
    expect(result.variant).toBe('warning');
    expect(result.icon).toBe('remove');
  });

  it('returns "Included" badge for unchanged features', () => {
    const result = getFeatureChangeBadge('unchanged');
    expect(result.label).toBe('Included');
    expect(result.variant).toBe('default');
    expect(result.icon).toBe('check');
  });
});

// ============================================
// formatPriceDifference
// ============================================

describe('formatPriceDifference', () => {
  it('formats positive difference with + prefix', () => {
    const result = formatPriceDifference(5000, 'GBP');
    expect(result.formatted).toMatch(/^\+.*\/mo$/);
    expect(result.isIncrease).toBe(true);
    expect(result.isDecrease).toBe(false);
  });

  it('formats negative difference with - prefix', () => {
    const result = formatPriceDifference(-3000, 'GBP');
    expect(result.formatted).toMatch(/^-.*\/mo$/);
    expect(result.isIncrease).toBe(false);
    expect(result.isDecrease).toBe(true);
  });

  it('formats zero difference as "No change"', () => {
    const result = formatPriceDifference(0, 'GBP');
    expect(result.formatted).toBe('No change');
    expect(result.isIncrease).toBe(false);
    expect(result.isDecrease).toBe(false);
  });
});

// ============================================
// canChangeToPlan
// ============================================

describe('canChangeToPlan', () => {
  it('returns not allowed for invalid target plan', () => {
    const result = canChangeToPlan('starter', 'nonexistent', 3);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Invalid plan selected');
  });

  it('returns not allowed when user count exceeds plan limit', () => {
    const result = canChangeToPlan('enterprise', 'starter', 10);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('only supports 5 users');
    expect(result.reason).toContain('currently have 10');
  });

  it('returns not allowed when switching to same plan', () => {
    const result = canChangeToPlan('starter', 'starter', 3);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('You are already on this plan');
  });

  it('allows changing to a plan with sufficient user capacity', () => {
    const result = canChangeToPlan('starter', 'professional', 3);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('allows changing to enterprise (unlimited users)', () => {
    const result = canChangeToPlan('starter', 'enterprise', 100);
    expect(result.allowed).toBe(true);
  });
});

// ============================================
// getRecommendedPlan
// ============================================

describe('getRecommendedPlan', () => {
  it('recommends starter for small usage', () => {
    const result = getRecommendedPlan(3, 500);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('starter');
  });

  it('recommends professional when users exceed starter limit', () => {
    const result = getRecommendedPlan(10, 500);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('professional');
  });

  it('recommends enterprise when users exceed professional limit', () => {
    const result = getRecommendedPlan(30, 500);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('enterprise');
  });

  it('recommends higher plan when contact limit is exceeded', () => {
    // starter has 1,000 contacts limit, so 5000 contacts should skip it
    const result = getRecommendedPlan(3, 5000);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('professional');
  });

  it('returns enterprise as fallback for very high usage', () => {
    const result = getRecommendedPlan(3, 50000);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('enterprise');
  });
});

// ============================================
// getCancellationInfo
// ============================================

describe('getCancellationInfo', () => {
  it('returns refund eligible when more than 25 days remaining', () => {
    const periodEnd = new Date();
    periodEnd.setDate(periodEnd.getDate() + 28);
    const result = getCancellationInfo(periodEnd, 'active');
    expect(result.refundEligible).toBe(true);
    expect(result.canReactivate).toBe(true);
    expect(result.daysRemaining).toBeGreaterThanOrEqual(27);
  });

  it('returns not refund eligible when 25 or fewer days remaining', () => {
    const periodEnd = new Date();
    periodEnd.setDate(periodEnd.getDate() + 20);
    const result = getCancellationInfo(periodEnd, 'active');
    expect(result.refundEligible).toBe(false);
  });

  it('offers retention discount when more than 14 days remaining', () => {
    const periodEnd = new Date();
    periodEnd.setDate(periodEnd.getDate() + 20);
    const result = getCancellationInfo(periodEnd, 'active');
    expect(result.retentionOffer).toBeDefined();
    expect(result.retentionOffer!.discountPercent).toBe(20);
  });

  it('does not offer retention when 14 or fewer days remaining', () => {
    const periodEnd = new Date();
    periodEnd.setDate(periodEnd.getDate() + 10);
    const result = getCancellationInfo(periodEnd, 'active');
    expect(result.retentionOffer).toBeUndefined();
  });

  it('cannot reactivate when status is canceled', () => {
    const periodEnd = new Date();
    periodEnd.setDate(periodEnd.getDate() + 20);
    const result = getCancellationInfo(periodEnd, 'canceled');
    expect(result.canReactivate).toBe(false);
  });

  it('returns effectiveDate as the periodEnd', () => {
    const periodEnd = new Date('2026-06-01');
    const result = getCancellationInfo(periodEnd, 'active');
    expect(result.effectiveDate).toEqual(periodEnd);
  });
});

// ============================================
// formatCancellationMessage
// ============================================

describe('formatCancellationMessage', () => {
  it('returns active-until message when atPeriodEnd is true', () => {
    const periodEnd = new Date('2026-06-01');
    const result = formatCancellationMessage(periodEnd, true);
    expect(result).toContain('will remain active until');
    expect(result).toContain('lose access to premium features');
  });

  it('returns cancelled message when atPeriodEnd is false', () => {
    const periodEnd = new Date('2026-06-01');
    const result = formatCancellationMessage(periodEnd, false);
    expect(result).toContain('has been cancelled');
    expect(result).toContain('will end on');
  });
});

// ============================================
// getPlansWithSelectionState
// ============================================

describe('getPlansWithSelectionState', () => {
  it('marks the current plan correctly', () => {
    const plans = getPlansWithSelectionState('professional');
    const currentPlan = plans.find((p) => p.id === 'professional');
    expect(currentPlan).toBeDefined();
    expect(currentPlan!.isCurrent).toBe(true);
    expect(currentPlan!.changeDirection).toBe('same');
  });

  it('marks non-current plans with correct directions', () => {
    const plans = getPlansWithSelectionState('professional');
    const starter = plans.find((p) => p.id === 'starter');
    const enterprise = plans.find((p) => p.id === 'enterprise');

    expect(starter!.isCurrent).toBe(false);
    expect(starter!.changeDirection).toBe('downgrade');
    expect(enterprise!.isCurrent).toBe(false);
    expect(enterprise!.changeDirection).toBe('upgrade');
  });

  it('handles null current plan (all upgrades)', () => {
    const plans = getPlansWithSelectionState(null);
    plans.forEach((plan) => {
      expect(plan.isCurrent).toBe(false);
      expect(plan.changeDirection).toBe('upgrade');
    });
  });

  it('includes isRecommended based on popular flag', () => {
    const plans = getPlansWithSelectionState(null);
    const proPlan = plans.find((p) => p.id === 'professional');
    expect(proPlan!.isRecommended).toBe(true);

    const starterPlan = plans.find((p) => p.id === 'starter');
    expect(starterPlan!.isRecommended).toBe(false);
  });
});

// ============================================
// getBillingIntervals
// ============================================

describe('getBillingIntervals', () => {
  it('returns monthly and annual options', () => {
    const intervals = getBillingIntervals();
    expect(intervals).toHaveLength(2);
    expect(intervals[0].id).toBe('monthly');
    expect(intervals[1].id).toBe('annual');
  });

  it('includes labels and descriptions', () => {
    const intervals = getBillingIntervals();
    expect(intervals[0].label).toBe('Monthly');
    expect(intervals[1].label).toBe('Annual');
    expect(intervals[0].description).toBeTruthy();
    expect(intervals[1].description).toContain('20%');
  });
});

// ============================================
// getPlanPriceForInterval
// ============================================

describe('getPlanPriceForInterval', () => {
  const plan = {
    id: 'professional',
    priceMonthly: 7900,
    priceAnnual: 78000,
    currency: 'GBP',
  } as any;

  it('returns monthly pricing', () => {
    const result = getPlanPriceForInterval(plan, 'monthly');
    expect(result.amount).toBe(7900);
    expect(result.perMonth).toBe(7900);
    expect(result.formatted).toContain('/mo');
    expect(result.savings).toBeUndefined();
  });

  it('returns annual pricing with per-month breakdown', () => {
    const result = getPlanPriceForInterval(plan, 'annual');
    expect(result.amount).toBe(78000);
    expect(result.perMonth).toBe(78000 / 12);
    expect(result.formatted).toContain('/year');
    expect(result.formattedPerMonth).toContain('/mo');
  });

  it('calculates savings for annual plan when there are savings', () => {
    const result = getPlanPriceForInterval(plan, 'annual');
    // Monthly total: 7900 * 12 = 94800
    // Annual: 78000
    // Savings: 16800
    expect(result.savings).toBeDefined();
    expect(result.savings).toContain('saved');
  });

  it('does not show savings when annual equals monthly total', () => {
    const noSavingsPlan = {
      ...plan,
      priceAnnual: 7900 * 12, // No savings
    };
    const result = getPlanPriceForInterval(noSavingsPlan, 'annual');
    expect(result.savings).toBeUndefined();
  });
});
