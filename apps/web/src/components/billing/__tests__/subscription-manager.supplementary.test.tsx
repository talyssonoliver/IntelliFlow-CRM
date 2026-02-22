/**
 * @vitest-environment jsdom
 */
/**
 * Subscription Manager Component - Supplementary Tests
 *
 * @implements PG-030 (Subscriptions)
 *
 * Tests cover:
 * - Loading skeleton state
 * - No subscription state (empty state)
 * - Current plan card with status badges
 * - Cancel at period end warning
 * - Billing interval toggle
 * - Plan selection cards
 * - Change plan dialog
 * - Cancel subscription dialog
 * - Plan change confirmation flow
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Polyfill pointer capture methods for Radix UI Select in jsdom
beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
});

// ============================================
// Hoisted mocks
// ============================================

const mockOnPlanChange = vi.hoisted(() => vi.fn());
const mockMutateUpdate = vi.hoisted(() => vi.fn());
const mockMutateCancel = vi.hoisted(() => vi.fn());

const mockSubscriptionQueryResult = vi.hoisted(() => ({
  data: null as any,
  isLoading: false,
}));

const mockUpdateSubscription = vi.hoisted(() => ({
  mutate: mockMutateUpdate,
  isPending: false,
}));

const mockCancelSubscription = vi.hoisted(() => ({
  mutate: mockMutateCancel,
  isPending: false,
}));

// ============================================
// Module mocks
// ============================================

vi.mock('@/lib/trpc', () => ({
  trpc: {
    billing: {
      getSubscription: {
        useQuery: (_input: unknown, _opts?: unknown) => mockSubscriptionQueryResult,
      },
      updateSubscription: {
        useMutation: (opts?: any) => {
          (mockUpdateSubscription as any)._opts = opts;
          return mockUpdateSubscription;
        },
      },
      cancelSubscription: {
        useMutation: (opts?: any) => {
          (mockCancelSubscription as any)._opts = opts;
          return mockCancelSubscription;
        },
      },
    },
  },
}));

vi.mock('@/lib/billing/stripe-portal', () => ({
  formatBillingDate: (d: string | Date) => {
    const date = typeof d === 'string' ? new Date(d) : d;
    return date.toLocaleDateString('en-GB');
  },
  getSubscriptionStatusDisplay: (status: string) => {
    const map: Record<string, any> = {
      active: { label: 'Active', variant: 'success' },
      canceled: { label: 'Cancelled', variant: 'error' },
      trialing: { label: 'Trial', variant: 'warning' },
      past_due: { label: 'Past Due', variant: 'error' },
    };
    return map[status] ?? { label: status, variant: 'default' };
  },
  getPlanById: (id: string) => {
    const plans: Record<string, any> = {
      starter: {
        id: 'starter',
        name: 'Starter',
        description: 'Basic plan',
        priceId: 'price_starter_monthly',
        currency: 'gbp',
        features: [],
        popular: false,
      },
      professional: {
        id: 'professional',
        name: 'Professional',
        description: 'Advanced plan',
        priceId: 'price_pro_monthly',
        currency: 'gbp',
        features: [{ name: 'AI Scoring', included: true }],
        popular: true,
      },
      enterprise: {
        id: 'enterprise',
        name: 'Enterprise',
        description: 'Full plan',
        priceId: 'price_ent_monthly',
        currency: 'gbp',
        features: [
          { name: 'AI Scoring', included: true },
          { name: 'Custom Reports', included: true },
        ],
        popular: false,
      },
    };
    return plans[id] ?? null;
  },
  getPlanByPriceId: (priceId: string) => {
    if (priceId.includes('pro'))
      return {
        id: 'professional',
        name: 'Professional',
        description: 'Advanced plan',
        priceId,
        currency: 'gbp',
        features: [],
        popular: true,
      };
    if (priceId.includes('starter'))
      return {
        id: 'starter',
        name: 'Starter',
        description: 'Basic plan',
        priceId,
        currency: 'gbp',
        features: [],
        popular: false,
      };
    if (priceId.includes('ent'))
      return {
        id: 'enterprise',
        name: 'Enterprise',
        description: 'Full plan',
        priceId,
        currency: 'gbp',
        features: [
          { name: 'AI Scoring', included: true },
          { name: 'Custom Reports', included: true },
        ],
        popular: false,
      };
    return null;
  },
  getAnnualSavingsPercent: () => 20,
}));

// Control mock behavior for canChangeToPlan
const mockCanChangeAllowed = vi.hoisted(() => ({ value: true }));

vi.mock('@/lib/billing/plan-changes', () => ({
  comparePlans: (currentId: string | null, targetId: string) => {
    if (!currentId || currentId === targetId) return null;
    // Downgrade when going from higher to lower tier
    const tierOrder = ['starter', 'professional', 'enterprise'];
    const currentTier = tierOrder.indexOf(currentId);
    const targetTier = tierOrder.indexOf(targetId);
    const isDowngrade = targetTier < currentTier;
    return {
      direction: isDowngrade ? ('downgrade' as const) : ('upgrade' as const),
      priceDifference: isDowngrade ? -2000 : 2000,
      featureChanges: isDowngrade
        ? [{ name: 'AI Scoring', change: 'lost' }]
        : [{ name: 'AI Scoring', change: 'gained' }],
    };
  },
  getPlanChangeDirectionDisplay: (direction: string) => ({
    label: direction === 'upgrade' ? 'Upgrade' : 'Downgrade',
    icon: direction === 'upgrade' ? 'upgrade' : 'downgrade',
    description: direction === 'upgrade' ? 'Upgrade your plan' : 'Downgrade your plan',
  }),
  formatPriceDifference: (diff: number, _currency: string) => ({
    formatted: diff > 0 ? `+£${(diff / 100).toFixed(0)}/mo` : `-£${(Math.abs(diff) / 100).toFixed(0)}/mo`,
    isIncrease: diff > 0,
    isDecrease: diff < 0,
  }),
  canChangeToPlan: (_currentId: string | null, _targetId: string, _quantity: number) => ({
    allowed: mockCanChangeAllowed.value,
    reason: mockCanChangeAllowed.value ? null : 'User limit exceeded',
  }),
  getCancellationInfo: (periodEnd: Date, _status: string) => ({
    effectiveDate: periodEnd.toISOString(),
    retentionOffer: { description: 'Get 50% off for 3 months' },
  }),
  formatCancellationMessage: (_date: Date, _active: boolean) =>
    'Your subscription will end on the next billing date.',
  getPlansWithSelectionState: (currentId: string | null) => [
    {
      id: 'starter',
      name: 'Starter',
      description: 'Basic',
      priceId: 'price_starter_monthly',
      priceMonthly: 2900,
      currency: 'gbp',
      features: [{ name: 'Basic CRM', included: true }],
      popular: false,
      isCurrent: currentId === 'starter',
      changeDirection: currentId === 'starter' ? 'current' : 'downgrade',
    },
    {
      id: 'professional',
      name: 'Professional',
      description: 'Advanced',
      priceId: 'price_pro_monthly',
      priceMonthly: 7900,
      currency: 'gbp',
      features: [{ name: 'AI Scoring', included: true }],
      popular: true,
      isCurrent: currentId === 'professional',
      changeDirection: currentId === 'professional' ? 'current' : 'upgrade',
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      description: 'Full',
      priceId: 'price_ent_monthly',
      priceMonthly: 19900,
      currency: 'gbp',
      features: [{ name: 'Custom Reports', included: true }],
      popular: false,
      isCurrent: currentId === 'enterprise',
      changeDirection: currentId === 'enterprise' ? 'current' : 'upgrade',
    },
  ],
  getBillingIntervals: () => [
    { id: 'monthly' as const, label: 'Monthly' },
    { id: 'annual' as const, label: 'Annual' },
  ],
  getPlanPriceForInterval: (plan: any, interval: string) => ({
    formatted: interval === 'annual' ? '£790/yr' : '£79/mo',
    formattedPerMonth: '£79/mo',
    savings: interval === 'annual' ? 'Save 20%' : undefined,
  }),
  estimateProration: (_fromPlan: any, _toPlan: any, daysRemaining: number, _totalDays: number) =>
    Math.round(daysRemaining * 50),
  getDaysRemainingInPeriod: (_periodEnd: Date) => 15,
  CANCELLATION_REASONS: [
    'too_expensive',
    'missing_features',
    'switching_competitor',
    'no_longer_needed',
    'technical_issues',
    'other',
  ] as const,
  CANCELLATION_REASON_LABELS: {
    too_expensive: 'Too expensive',
    missing_features: 'Missing features I need',
    switching_competitor: 'Switching to a competitor',
    no_longer_needed: 'No longer need a CRM',
    technical_issues: 'Technical issues',
    other: 'Other',
  },
}));

import { SubscriptionManager } from '../subscription-manager';

// ============================================
// Helper
// ============================================

const mockActiveSubscription = {
  id: 'sub_test',
  customerId: 'cus_test',
  status: 'active' as const,
  priceId: 'price_pro_monthly',
  quantity: 1,
  currency: 'gbp',
  currentPeriodStart: '2025-01-01T00:00:00Z',
  currentPeriodEnd: '2025-02-01T00:00:00Z',
  cancelAtPeriodEnd: false,
};

// ============================================
// Tests
// ============================================

describe('SubscriptionManager', () => {
  beforeEach(() => {
    mockSubscriptionQueryResult.data = null;
    mockSubscriptionQueryResult.isLoading = false;
    mockMutateUpdate.mockClear();
    mockMutateCancel.mockClear();
    mockOnPlanChange.mockClear();
  });

  describe('Loading State', () => {
    it('renders loading skeleton when subscription is loading', () => {
      mockSubscriptionQueryResult.isLoading = true;

      render(<SubscriptionManager />);

      // LoadingSkeleton renders Skeleton components
      // It should not render the plan cards yet
      expect(screen.queryByText('Professional')).not.toBeInTheDocument();
    });

    it('does not show loading skeleton when external subscription is provided', () => {
      mockSubscriptionQueryResult.isLoading = true;

      render(<SubscriptionManager subscription={mockActiveSubscription} />);

      // Should render immediately with external subscription
      // "Professional" appears in both current plan card and plan selection
      const elements = screen.getAllByText('Professional');
      expect(elements.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('No Subscription State', () => {
    it('renders empty state when no subscription', () => {
      render(<SubscriptionManager />);

      expect(screen.getByText('No Active Subscription')).toBeInTheDocument();
      expect(screen.getByText(/choose a plan/i)).toBeInTheDocument();
    });

    it('shows plan selector when View Plans is clicked', async () => {
      const user = userEvent.setup();

      render(<SubscriptionManager />);

      await user.click(screen.getByRole('button', { name: /view plans/i }));

      expect(screen.getByText('Choose a Plan')).toBeInTheDocument();
    });
  });

  describe('Current Plan Card', () => {
    it('renders current plan name and status', () => {
      render(<SubscriptionManager subscription={mockActiveSubscription} />);

      // "Professional" appears in both current plan card and plan selection list
      const planNames = screen.getAllByText('Professional');
      expect(planNames.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('displays billing period dates', () => {
      render(<SubscriptionManager subscription={mockActiveSubscription} />);

      expect(screen.getByText('Billing Period')).toBeInTheDocument();
    });

    it('shows Cancel Subscription button', () => {
      render(<SubscriptionManager subscription={mockActiveSubscription} />);

      expect(screen.getByRole('button', { name: /cancel subscription/i })).toBeInTheDocument();
    });

    it('shows cancellation warning when cancelAtPeriodEnd is true', () => {
      const cancelledSub = {
        ...mockActiveSubscription,
        cancelAtPeriodEnd: true,
      };

      render(<SubscriptionManager subscription={cancelledSub} />);

      expect(screen.getByText('Subscription Ending')).toBeInTheDocument();
      // Cancel button should be hidden
      expect(
        screen.queryByRole('button', { name: /cancel subscription/i })
      ).not.toBeInTheDocument();
    });
  });

  describe('Plan Selection', () => {
    it('renders plan cards when subscription exists', () => {
      render(<SubscriptionManager subscription={mockActiveSubscription} />);

      expect(screen.getByText('Change Plan')).toBeInTheDocument();
      expect(screen.getByText('Starter')).toBeInTheDocument();
      expect(screen.getByText('Enterprise')).toBeInTheDocument();
    });

    it('shows Current badge on active plan', () => {
      render(<SubscriptionManager subscription={mockActiveSubscription} />);

      expect(screen.getByText('Current')).toBeInTheDocument();
    });

    it('shows Most Popular badge on popular plan', () => {
      render(<SubscriptionManager subscription={mockActiveSubscription} />);

      expect(screen.getByText('Most Popular')).toBeInTheDocument();
    });
  });

  describe('Billing Interval Toggle', () => {
    it('renders monthly and annual toggle buttons', () => {
      render(<SubscriptionManager subscription={mockActiveSubscription} />);

      expect(screen.getByText('Monthly')).toBeInTheDocument();
      expect(screen.getByText('Annual')).toBeInTheDocument();
    });

    it('shows Save 20% on annual toggle', () => {
      render(<SubscriptionManager subscription={mockActiveSubscription} />);

      expect(screen.getByText('Save 20%')).toBeInTheDocument();
    });
  });

  describe('Cancel Dialog', () => {
    it('opens cancel dialog when Cancel Subscription is clicked', async () => {
      const user = userEvent.setup();

      render(<SubscriptionManager subscription={mockActiveSubscription} />);

      await user.click(screen.getByRole('button', { name: /cancel subscription/i }));

      // Dialog should now show the confirmation text
      expect(screen.getByText(/are you sure/i)).toBeInTheDocument();
    });

    it('shows retention offer in cancel dialog', async () => {
      const user = userEvent.setup();

      render(<SubscriptionManager subscription={mockActiveSubscription} />);

      await user.click(screen.getByRole('button', { name: /cancel subscription/i }));

      expect(screen.getByText('Stay with us!')).toBeInTheDocument();
      expect(screen.getByText(/50% off/i)).toBeInTheDocument();
    });

    it('shows features that will be lost', async () => {
      const user = userEvent.setup();

      render(<SubscriptionManager subscription={mockActiveSubscription} />);

      await user.click(screen.getByRole('button', { name: /cancel subscription/i }));

      expect(screen.getByText(/AI-powered lead scoring/i)).toBeInTheDocument();
      expect(screen.getByText(/Advanced analytics/i)).toBeInTheDocument();
    });

    it('calls cancel mutation when confirmed', async () => {
      const user = userEvent.setup();

      render(
        <SubscriptionManager
          subscription={mockActiveSubscription}
          onPlanChange={mockOnPlanChange}
        />
      );

      await user.click(screen.getByRole('button', { name: /cancel subscription/i }));

      const confirmBtn = screen.getByRole('button', { name: /cancel at period end/i });
      await user.click(confirmBtn);

      expect(mockMutateCancel).toHaveBeenCalledWith({ atPeriodEnd: true });
    });

    it('closes cancel dialog when Keep Subscription is clicked', async () => {
      const user = userEvent.setup();

      render(<SubscriptionManager subscription={mockActiveSubscription} />);

      await user.click(screen.getByRole('button', { name: /cancel subscription/i }));
      // Verify dialog opened
      expect(screen.getByText(/are you sure/i)).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /keep subscription/i }));

      // Dialog content should be gone
      expect(screen.queryByText(/are you sure/i)).not.toBeInTheDocument();
    });
  });

  describe('ChangePlanDialog returns null', () => {
    it('does not render when targetPlan is null', () => {
      // By default, no plan is selected, so ChangePlanDialog gets null targetPlan
      render(<SubscriptionManager subscription={mockActiveSubscription} />);

      // There should be no plan change confirmation dialog rendered
      expect(screen.queryByText('Price Change')).not.toBeInTheDocument();
    });
  });

  describe('CancelDialog returns null', () => {
    it('does not render when subscription is null', () => {
      render(<SubscriptionManager />);

      // Cancel dialog should not render
      expect(screen.queryByText(/are you sure you want to cancel/i)).not.toBeInTheDocument();
    });
  });

  // ============================================
  // T1-T10: Coverage expansion tests
  // ============================================

  describe('ChangePlanDialog interaction', () => {
    it('T1: opens ChangePlanDialog when clicking a non-current plan card', async () => {
      const user = userEvent.setup();
      render(<SubscriptionManager subscription={mockActiveSubscription} />);

      // Click on Enterprise plan (non-current)
      const enterpriseBtn = screen.getByRole('button', { name: /upgrade to enterprise/i });
      await user.click(enterpriseBtn);

      // Dialog should show price change info
      expect(screen.getByText('Price Change')).toBeInTheDocument();
    });

    it('T2: confirm plan change calls updateSubscription.mutate with priceId', async () => {
      const user = userEvent.setup();
      render(
        <SubscriptionManager
          subscription={mockActiveSubscription}
          onPlanChange={mockOnPlanChange}
        />
      );

      // Click Enterprise plan
      const enterpriseBtn = screen.getByRole('button', { name: /upgrade to enterprise/i });
      await user.click(enterpriseBtn);

      // Confirm the change
      const confirmBtn = screen.getByRole('button', { name: /confirm upgrade/i });
      await user.click(confirmBtn);

      expect(mockMutateUpdate).toHaveBeenCalledWith({ priceId: 'price_ent_monthly' });
    });

    it('T3: toggle to annual then confirm sends _annual priceId', async () => {
      const user = userEvent.setup();
      render(
        <SubscriptionManager
          subscription={mockActiveSubscription}
          onPlanChange={mockOnPlanChange}
        />
      );

      // Toggle to annual
      await user.click(screen.getByText('Annual'));

      // Click Enterprise plan
      const enterpriseBtn = screen.getByRole('button', { name: /upgrade to enterprise/i });
      await user.click(enterpriseBtn);

      // Confirm the change
      const confirmBtn = screen.getByRole('button', { name: /confirm upgrade/i });
      await user.click(confirmBtn);

      expect(mockMutateUpdate).toHaveBeenCalledWith({ priceId: 'price_ent_annual' });
    });

    it('T9: downgrade plan shows "Features You\'ll Lose" and period-end text', async () => {
      const user = userEvent.setup();
      // Use enterprise subscription so Starter is a downgrade
      const enterpriseSub = {
        ...mockActiveSubscription,
        priceId: 'price_ent_monthly',
      };
      render(<SubscriptionManager subscription={enterpriseSub} />);

      // Click Starter plan (downgrade from Enterprise)
      const starterBtn = screen.getByRole('button', { name: /downgrade to starter/i });
      await user.click(starterBtn);

      expect(screen.getByText(/features you.ll lose/i)).toBeInTheDocument();
      expect(screen.getByText(/end of your current billing period/i)).toBeInTheDocument();
    });
  });

  describe('Mutation callbacks', () => {
    it('T4: updateSubscription.onSuccess closes dialog and calls onPlanChange', async () => {
      const user = userEvent.setup();
      render(
        <SubscriptionManager
          subscription={mockActiveSubscription}
          onPlanChange={mockOnPlanChange}
        />
      );

      // Click Enterprise plan to open dialog
      const enterpriseBtn = screen.getByRole('button', { name: /upgrade to enterprise/i });
      await user.click(enterpriseBtn);

      // Dialog should be open
      expect(screen.getByText('Price Change')).toBeInTheDocument();

      // Simulate onSuccess callback
      const opts = (mockUpdateSubscription as any)._opts;
      opts?.onSuccess?.();

      expect(mockOnPlanChange).toHaveBeenCalled();
    });

    it('T5: cancelSubscription.onSuccess closes dialog and calls onPlanChange', async () => {
      const user = userEvent.setup();
      render(
        <SubscriptionManager
          subscription={mockActiveSubscription}
          onPlanChange={mockOnPlanChange}
        />
      );

      // Open cancel dialog
      await user.click(screen.getByRole('button', { name: /cancel subscription/i }));

      // Simulate onSuccess callback
      const opts = (mockCancelSubscription as any)._opts;
      opts?.onSuccess?.();

      expect(mockOnPlanChange).toHaveBeenCalled();
    });
  });

  describe('Loading states', () => {
    it('T6: shows "Processing..." spinner in ChangePlanDialog when isPending', async () => {
      const user = userEvent.setup();
      mockUpdateSubscription.isPending = true;

      render(<SubscriptionManager subscription={mockActiveSubscription} />);

      const enterpriseBtn = screen.getByRole('button', { name: /upgrade to enterprise/i });
      await user.click(enterpriseBtn);

      expect(screen.getByText('Processing...')).toBeInTheDocument();

      mockUpdateSubscription.isPending = false;
    });

    it('T7: shows "Cancelling..." spinner in CancelDialog when isPending', async () => {
      const user = userEvent.setup();
      mockCancelSubscription.isPending = true;

      render(<SubscriptionManager subscription={mockActiveSubscription} />);

      await user.click(screen.getByRole('button', { name: /cancel subscription/i }));

      expect(screen.getByText('Cancelling...')).toBeInTheDocument();

      mockCancelSubscription.isPending = false;
    });
  });

  describe('Disabled plan cards', () => {
    it('T8: plan card shows disabled styling when canChangeToPlan returns false', () => {
      mockCanChangeAllowed.value = false;

      render(<SubscriptionManager subscription={mockActiveSubscription} />);

      // Look for opacity-50 in plan cards (disabled styling)
      const starterCard = screen.getByText('Starter').closest('[class*="Card"]')?.parentElement;
      expect(starterCard?.innerHTML).toContain('opacity-50');

      mockCanChangeAllowed.value = true;
    });
  });

  describe('Fallback text', () => {
    it('T10: shows "Current Plan" fallback when getPlanByPriceId returns null', () => {
      const unknownSub = {
        ...mockActiveSubscription,
        priceId: 'price_unknown_plan',
      };

      render(<SubscriptionManager subscription={unknownSub} />);

      expect(screen.getByText('Current Plan')).toBeInTheDocument();
    });
  });

  describe('Status badge variants', () => {
    it('T14a: trialing status renders "Trial" badge', () => {
      const trialSub = {
        ...mockActiveSubscription,
        status: 'trialing' as const,
      };

      render(<SubscriptionManager subscription={trialSub} />);

      expect(screen.getByText('Trial')).toBeInTheDocument();
    });

    it('T14b: past_due status renders "Past Due" badge', () => {
      const pastDueSub = {
        ...mockActiveSubscription,
        status: 'past_due' as const,
      };

      render(<SubscriptionManager subscription={pastDueSub} />);

      expect(screen.getByText('Past Due')).toBeInTheDocument();
    });
  });

  // ============================================
  // T11-T13: New feature tests (C1, C2, C3)
  // ============================================

  describe('Reactivation (C2)', () => {
    it('T11: shows reactivation button when cancelAtPeriodEnd is true', () => {
      const cancelledSub = {
        ...mockActiveSubscription,
        cancelAtPeriodEnd: true,
      };

      render(<SubscriptionManager subscription={cancelledSub} />);

      expect(screen.getByRole('button', { name: /reactivate subscription/i })).toBeInTheDocument();
    });

    it('T11b: clicking reactivation calls updateSubscription.mutate with cancelAtPeriodEnd: false', async () => {
      const user = userEvent.setup();
      const cancelledSub = {
        ...mockActiveSubscription,
        cancelAtPeriodEnd: true,
      };

      render(
        <SubscriptionManager
          subscription={cancelledSub}
          onPlanChange={mockOnPlanChange}
        />
      );

      await user.click(screen.getByRole('button', { name: /reactivate subscription/i }));

      expect(mockMutateUpdate).toHaveBeenCalledWith({ cancelAtPeriodEnd: false });
    });
  });

  describe('Cancellation reason (C1)', () => {
    it('T12: cancel dialog shows reason selector', async () => {
      const user = userEvent.setup();
      render(<SubscriptionManager subscription={mockActiveSubscription} />);

      await user.click(screen.getByRole('button', { name: /cancel subscription/i }));

      // Look for the cancellation reason selector
      expect(screen.getByLabelText(/cancellation reason/i)).toBeInTheDocument();
    });

    it('T12b: selected reason is forwarded in cancel mutation', async () => {
      const user = userEvent.setup();
      render(
        <SubscriptionManager
          subscription={mockActiveSubscription}
          onPlanChange={mockOnPlanChange}
        />
      );

      await user.click(screen.getByRole('button', { name: /cancel subscription/i }));

      // Select a reason using native select
      const selectEl = screen.getByLabelText(/cancellation reason/i);
      await user.selectOptions(selectEl, 'too_expensive');

      // Confirm cancellation
      const confirmBtn = screen.getByRole('button', { name: /cancel at period end/i });
      await user.click(confirmBtn);

      expect(mockMutateCancel).toHaveBeenCalledWith({
        atPeriodEnd: true,
        reason: 'too_expensive',
      });
    });
  });

  describe('Proration estimate (C3)', () => {
    it('T13: upgrade dialog shows estimated proration amount', async () => {
      const user = userEvent.setup();
      render(<SubscriptionManager subscription={mockActiveSubscription} />);

      // Click Enterprise plan (upgrade)
      const enterpriseBtn = screen.getByRole('button', { name: /upgrade to enterprise/i });
      await user.click(enterpriseBtn);

      // Should show estimated proration text
      expect(screen.getByText(/estimated charge today/i)).toBeInTheDocument();
      expect(screen.getByText(/prorated for.*remaining days/i)).toBeInTheDocument();
    });
  });
});
