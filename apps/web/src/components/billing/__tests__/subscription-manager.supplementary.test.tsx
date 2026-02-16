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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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
    return null;
  },
  getAnnualSavingsPercent: () => 20,
}));

vi.mock('@/lib/billing/plan-changes', () => ({
  comparePlans: (currentId: string | null, targetId: string) => {
    if (!currentId || currentId === targetId) return null;
    return {
      direction: 'upgrade' as const,
      priceDifference: 2000,
      featureChanges: [{ name: 'AI Scoring', change: 'gained' }],
    };
  },
  getPlanChangeDirectionDisplay: (direction: string) => ({
    label: direction === 'upgrade' ? 'Upgrade' : 'Downgrade',
    icon: direction === 'upgrade' ? 'upgrade' : 'downgrade',
    description: direction === 'upgrade' ? 'Upgrade your plan' : 'Downgrade your plan',
  }),
  formatPriceDifference: (diff: number, _currency: string) => ({
    formatted: `+£${(diff / 100).toFixed(0)}/mo`,
    isIncrease: diff > 0,
    isDecrease: diff < 0,
  }),
  canChangeToPlan: (_currentId: string | null, _targetId: string, _quantity: number) => ({
    allowed: true,
    reason: null,
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
});
