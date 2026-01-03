/**
 * Billing Portal Component Tests
 *
 * @implements PG-025 (Billing Portal)
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BillingPortal } from '../billing-portal';

// Mock subscription data
const mockSubscription = {
  id: 'sub_123',
  customerId: 'cus_123',
  status: 'active' as const,
  priceId: 'price_professional_monthly',
  quantity: 5,
  currency: 'gbp',
  currentPeriodStart: new Date('2025-01-01'),
  currentPeriodEnd: new Date('2025-02-01'),
  cancelAtPeriodEnd: false,
};

// Mock payment methods
const mockPaymentMethods = [
  {
    id: 'pm_123',
    type: 'card' as const,
    card: {
      brand: 'visa',
      last4: '4242',
      expMonth: 12,
      expYear: 2026,
    },
    isDefault: true,
    created: new Date('2024-01-01'),
  },
];

// Mock invoices
const mockInvoices = [
  {
    id: 'in_123',
    customerId: 'cus_123',
    status: 'paid' as const,
    amountDue: 7900,
    amountPaid: 7900,
    amountRemaining: 0,
    currency: 'gbp',
    created: new Date('2024-12-01'),
    invoicePdf: 'https://example.com/invoice.pdf',
  },
];

// Mock usage metrics
const mockUsage = {
  apiCalls: { current: 8500, limit: 10000 },
  storage: { current: 2.4, limit: 5, unit: 'GB' as const },
  activeUsers: { current: 12, limit: 25 },
};

// Mock tRPC
vi.mock('@/lib/trpc', () => ({
  trpc: {
    billing: {
      getSubscription: {
        useQuery: vi.fn(() => ({
          data: mockSubscription,
          isLoading: false,
          error: null,
        })),
      },
      getPaymentMethods: {
        useQuery: vi.fn(() => ({
          data: mockPaymentMethods,
          isLoading: false,
          error: null,
        })),
      },
      listInvoices: {
        useQuery: vi.fn(() => ({
          data: { invoices: mockInvoices, total: 1, page: 1, limit: 5, hasMore: false },
          isLoading: false,
          error: null,
        })),
      },
      getUsageMetrics: {
        useQuery: vi.fn(() => ({
          data: mockUsage,
          isLoading: false,
          error: null,
        })),
      },
    },
  },
}));

describe('BillingPortal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================
  // Rendering Tests
  // ============================================

  describe('rendering', () => {
    it('renders the subscription overview card', () => {
      render(<BillingPortal />);
      // Check for subscription status
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('renders payment method section', () => {
      render(<BillingPortal />);
      expect(screen.getByText('Payment Method')).toBeInTheDocument();
    });

    it('renders usage metrics section', () => {
      render(<BillingPortal />);
      expect(screen.getByText('Usage This Month')).toBeInTheDocument();
    });

    it('renders invoice history section', () => {
      render(<BillingPortal />);
      expect(screen.getByText('Invoice History')).toBeInTheDocument();
    });

    it('displays card information correctly', () => {
      render(<BillingPortal />);
      expect(screen.getByText(/Visa \*\*\*\* 4242/i)).toBeInTheDocument();
    });
  });

  // ============================================
  // Loading State Tests
  // ============================================

  describe('loading states', () => {
    it('shows skeleton while loading subscription', async () => {
      const { trpc } = await import('@/lib/trpc');
      vi.mocked(trpc.billing.getSubscription.useQuery).mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
      } as ReturnType<typeof trpc.billing.getSubscription.useQuery>);

      render(<BillingPortal />);
      // Skeleton elements should be present when loading
      const skeletons = document.querySelectorAll('[class*="skeleton"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // Empty State Tests
  // ============================================

  describe('empty states', () => {
    it('shows no subscription message when user has no subscription', async () => {
      const { trpc } = await import('@/lib/trpc');
      vi.mocked(trpc.billing.getSubscription.useQuery).mockReturnValue({
        data: null,
        isLoading: false,
        error: null,
      } as ReturnType<typeof trpc.billing.getSubscription.useQuery>);

      render(<BillingPortal />);
      expect(screen.getByText(/No Active Subscription/i)).toBeInTheDocument();
    });

    it('shows no payment method message when none exist', async () => {
      const { trpc } = await import('@/lib/trpc');
      vi.mocked(trpc.billing.getPaymentMethods.useQuery).mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
      } as ReturnType<typeof trpc.billing.getPaymentMethods.useQuery>);

      render(<BillingPortal />);
      expect(screen.getByText(/No payment method on file/i)).toBeInTheDocument();
    });

    it('shows no invoices message when none exist', async () => {
      const { trpc } = await import('@/lib/trpc');
      vi.mocked(trpc.billing.listInvoices.useQuery).mockReturnValue({
        data: { invoices: [], total: 0, page: 1, limit: 5, hasMore: false },
        isLoading: false,
        error: null,
      } as ReturnType<typeof trpc.billing.listInvoices.useQuery>);

      render(<BillingPortal />);
      expect(screen.getByText(/No invoices yet/i)).toBeInTheDocument();
    });
  });

  // ============================================
  // Subscription Status Tests
  // ============================================

  describe('subscription status', () => {
    it('shows warning when subscription is canceling', async () => {
      const { trpc } = await import('@/lib/trpc');
      vi.mocked(trpc.billing.getSubscription.useQuery).mockReturnValue({
        data: { ...mockSubscription, cancelAtPeriodEnd: true },
        isLoading: false,
        error: null,
      } as ReturnType<typeof trpc.billing.getSubscription.useQuery>);

      render(<BillingPortal />);
      expect(screen.getByText(/Subscription Ending/i)).toBeInTheDocument();
    });
  });

  // ============================================
  // Usage Metrics Tests
  // ============================================

  describe('usage metrics', () => {
    it('displays API calls usage', () => {
      render(<BillingPortal />);
      expect(screen.getByText('API Calls')).toBeInTheDocument();
      expect(screen.getByText(/8,500.*10,000/)).toBeInTheDocument();
    });

    it('displays storage usage', () => {
      render(<BillingPortal />);
      expect(screen.getByText('Storage')).toBeInTheDocument();
    });

    it('displays active users usage', () => {
      render(<BillingPortal />);
      expect(screen.getByText('Active Users')).toBeInTheDocument();
      expect(screen.getByText(/12.*25/)).toBeInTheDocument();
    });
  });

  // ============================================
  // Accessibility Tests
  // ============================================

  describe('accessibility', () => {
    it('has accessible section headings', () => {
      render(<BillingPortal />);
      const headings = screen.getAllByRole('heading');
      expect(headings.length).toBeGreaterThan(0);
    });

    it('buttons have accessible names', () => {
      render(<BillingPortal />);
      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).toHaveAccessibleName();
      });
    });

    it('links have accessible names', () => {
      render(<BillingPortal />);
      const links = screen.getAllByRole('link');
      links.forEach((link) => {
        expect(link).toHaveAccessibleName();
      });
    });
  });

  // ============================================
  // Invoice Table Tests
  // ============================================

  describe('invoice table', () => {
    it('renders invoice data correctly', () => {
      render(<BillingPortal />);
      expect(screen.getByText('Paid')).toBeInTheDocument();
    });

    it('shows download button for invoices with PDF', () => {
      render(<BillingPortal />);
      const downloadLinks = screen.getAllByRole('link', { name: /download/i });
      expect(downloadLinks.length).toBeGreaterThan(0);
    });
  });
});
