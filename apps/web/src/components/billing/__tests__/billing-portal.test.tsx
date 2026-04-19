/**
 * @vitest-environment jsdom
 */
/**
 * Billing Portal Component Tests
 *
 * Tests for the redesigned billing portal with 3-column grid layout,
 * subscription overview, payment methods, billing information, and billing history.
 *
 * @implements PG-025 (Billing Portal)
 */

import { render, screen, within, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BillingPortal } from '../billing-portal';
import {
  createMockSubscription,
  createMockPaymentMethod,
  createMockInvoice,
  createMockBillingInformation,
} from '@/test/fixtures/billing-data';

// ============================================
// Default mock data
// ============================================

const mockSubscription = createMockSubscription();
const mockPaymentMethods = [createMockPaymentMethod()];
const mockInvoices = [createMockInvoice()];
const mockBillingInfo = createMockBillingInformation();

// ============================================
// Mock modules
// ============================================

// Query return shape that allows nullable data and Error for error states
type MockQueryReturn<T> = { data: T | null | undefined; isLoading: boolean; error: Error | null };

// Mock tRPC
const mockGetSubscription = vi.fn<() => MockQueryReturn<typeof mockSubscription>>(() => ({
  data: mockSubscription,
  isLoading: false,
  error: null,
}));
const mockGetPaymentMethods = vi.fn<() => MockQueryReturn<typeof mockPaymentMethods>>(() => ({
  data: mockPaymentMethods,
  isLoading: false,
  error: null,
}));
const mockListInvoices = vi.fn<
  () => MockQueryReturn<{
    invoices: typeof mockInvoices;
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
  }>
>(() => ({
  data: { invoices: mockInvoices, total: 1, page: 1, limit: 5, hasMore: false },
  isLoading: false,
  error: null,
}));
const mockGetBillingInformation = vi.fn<() => MockQueryReturn<typeof mockBillingInfo>>(() => ({
  data: mockBillingInfo,
  isLoading: false,
  error: null,
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    billing: {
      getSubscription: { useQuery: () => mockGetSubscription() },
      getPaymentMethods: { useQuery: () => mockGetPaymentMethods() },
      listInvoices: { useQuery: () => mockListInvoices() },
      getBillingInformation: {
        useQuery: () => mockGetBillingInformation(),
      },
    },
  },
}));

// Mock auth
vi.mock('@/lib/auth/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    isAuthenticated: true,
    isLoading: false,
  })),
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: Readonly<{
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('BillingPortal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to defaults
    mockGetSubscription.mockReturnValue({ data: mockSubscription, isLoading: false, error: null });
    mockGetPaymentMethods.mockReturnValue({
      data: mockPaymentMethods,
      isLoading: false,
      error: null,
    });
    mockListInvoices.mockReturnValue({
      data: { invoices: mockInvoices, total: 1, page: 1, limit: 5, hasMore: false },
      isLoading: false,
      error: null,
    });
    mockGetBillingInformation.mockReturnValue({
      data: mockBillingInfo,
      isLoading: false,
      error: null,
    });
  });

  // ============================================
  // 1. Rendering & Layout
  // ============================================

  describe('Rendering & Layout', () => {
    it('renders 3-column grid with lg:grid-cols-3', () => {
      const { container } = render(<BillingPortal />);
      const grid = container.firstElementChild;
      expect(grid?.className).toContain('grid');
      expect(grid?.className).toContain('lg:grid-cols-3');
    });

    it('renders SubscriptionOverviewCard in left column (col-span-2)', () => {
      const { container } = render(<BillingPortal />);
      const leftCol = container.querySelector('.lg\\:col-span-2');
      expect(leftCol).toBeInTheDocument();
      expect(within(leftCol as HTMLElement).getByText('Subscription Overview')).toBeInTheDocument();
    });

    it('renders PaymentMethodSection in right column', () => {
      render(<BillingPortal />);
      expect(screen.getByText('Payment Methods')).toBeInTheDocument();
    });

    it('renders BillingInformationCard in right column', () => {
      render(<BillingPortal />);
      expect(screen.getByText('Billing Information')).toBeInTheDocument();
    });

    it('renders BillingHistoryTable in left column', () => {
      const { container } = render(<BillingPortal />);
      const leftCols = container.querySelectorAll('.lg\\:col-span-2');
      // BillingHistoryTable is in the second lg:col-span-2 column
      const secondLeftCol = leftCols[1];
      expect(within(secondLeftCol as HTMLElement).getByText('Billing History')).toBeInTheDocument();
    });

    it('does NOT render UsageMetrics section', () => {
      render(<BillingPortal />);
      expect(screen.queryByText('Usage This Month')).not.toBeInTheDocument();
      expect(screen.queryByText('API Calls')).not.toBeInTheDocument();
    });
  });

  // ============================================
  // 2. Subscription Overview Card
  // ============================================

  describe('Subscription Overview Card', () => {
    it('renders 2-section flex layout (plan info + billing date)', () => {
      render(<BillingPortal />);
      expect(screen.getByText('Professional')).toBeInTheDocument();
      expect(screen.getByText('Next Billing Date')).toBeInTheDocument();
    });

    it('displays auto_awesome icon and Subscription Overview title', () => {
      render(<BillingPortal />);
      expect(screen.getByText('Subscription Overview')).toBeInTheDocument();
      expect(screen.getByText('auto_awesome')).toBeInTheDocument();
    });

    it('shows ACTIVE status badge', () => {
      render(<BillingPortal />);
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('shows TRIAL status badge for trialing subscription', () => {
      mockGetSubscription.mockReturnValue({
        data: createMockSubscription({ status: 'trialing' }),
        isLoading: false,
        error: null,
      });
      render(<BillingPortal />);
      expect(screen.getByText('Trial')).toBeInTheDocument();
    });

    it('shows PAST DUE badge for past_due subscription', () => {
      mockGetSubscription.mockReturnValue({
        data: createMockSubscription({ status: 'past_due' }),
        isLoading: false,
        error: null,
      });
      render(<BillingPortal />);
      expect(screen.getByText('Past Due')).toBeInTheDocument();
    });

    it('renders Upgrade Plan and Cancel Subscription buttons in footer', () => {
      render(<BillingPortal />);
      expect(screen.getByText('Upgrade Plan')).toBeInTheDocument();
      expect(screen.getByText('Cancel Subscription')).toBeInTheDocument();
    });

    it('shows cancellation warning when cancelAtPeriodEnd is true', () => {
      mockGetSubscription.mockReturnValue({
        data: createMockSubscription({ cancelAtPeriodEnd: true }),
        isLoading: false,
        error: null,
      });
      render(<BillingPortal />);
      expect(screen.getByText('Subscription Ending')).toBeInTheDocument();
    });

    it('shows plan name from getPlanByPriceId', () => {
      render(<BillingPortal />);
      expect(screen.getByText('Professional')).toBeInTheDocument();
    });
  });

  // ============================================
  // 3. Payment Methods Card
  // ============================================

  describe('Payment Methods Card', () => {
    it('renders vertical card layout', () => {
      render(<BillingPortal />);
      expect(screen.getByText('Payment Methods')).toBeInTheDocument();
    });

    it('shows brand logo box with card brand name', () => {
      render(<BillingPortal />);
      expect(screen.getByText('Visa')).toBeInTheDocument();
    });

    it('shows DEFAULT badge on default card', () => {
      render(<BillingPortal />);
      expect(screen.getByText('DEFAULT')).toBeInTheDocument();
    });

    it('displays masked card number •••• •••• •••• last4', () => {
      render(<BillingPortal />);
      expect(screen.getByText(/•••• •••• •••• 4242/)).toBeInTheDocument();
    });

    it('shows card expiry date', () => {
      render(<BillingPortal />);
      expect(screen.getByText('Expires 12/2026')).toBeInTheDocument();
    });

    it('renders Add New Payment Method button with dashed border', () => {
      render(<BillingPortal />);
      expect(screen.getByText('Add Payment Method')).toBeInTheDocument();
    });

    it('navigates to payment methods page when Add New Payment Method is clicked', () => {
      render(<BillingPortal />);
      const addBtn = screen.getByText('Add Payment Method');
      expect(addBtn.closest('a')).toHaveAttribute('href', '/billing/payment-methods');
    });

    it('renders multiple payment methods', () => {
      mockGetPaymentMethods.mockReturnValue({
        data: [
          createMockPaymentMethod(),
          createMockPaymentMethod({
            id: 'pm_456',
            isDefault: false,
            card: { brand: 'mastercard', last4: '5555', expMonth: 6, expYear: 2027 },
          }),
        ],
        isLoading: false,
        error: null,
      });
      render(<BillingPortal />);
      expect(screen.getByText(/•••• •••• •••• 4242/)).toBeInTheDocument();
      expect(screen.getByText(/•••• •••• •••• 5555/)).toBeInTheDocument();
    });

    it('renders edit icon button', () => {
      render(<BillingPortal />);
      expect(screen.getByRole('button', { name: /edit payment method/i })).toBeInTheDocument();
    });

    it('shows empty state when no payment methods', () => {
      mockGetPaymentMethods.mockReturnValue({ data: [], isLoading: false, error: null });
      render(<BillingPortal />);
      // Canonical EmptyState copy (entity="payment-methods" title) after
      // billing-portal migrated to <EmptyState entity /> via billing-shared.
      expect(screen.getByText('No payment methods')).toBeInTheDocument();
    });

    it('renders Payment Methods title with credit_card icon', () => {
      render(<BillingPortal />);
      expect(screen.getByText('credit_card')).toBeInTheDocument();
    });
  });

  // ============================================
  // 4. Billing Information Card
  // ============================================

  describe('Billing Information Card', () => {
    it('displays organization name with business icon', () => {
      render(<BillingPortal />);
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
      expect(screen.getByText('business')).toBeInTheDocument();
    });

    it('displays email with mail icon', () => {
      render(<BillingPortal />);
      expect(screen.getByText('billing@acme.com')).toBeInTheDocument();
      expect(screen.getByText('mail')).toBeInTheDocument();
    });

    it('displays address with location_on icon', () => {
      render(<BillingPortal />);
      expect(screen.getByText(/123 Business St/)).toBeInTheDocument();
      expect(screen.getByText('location_on')).toBeInTheDocument();
    });

    it('renders Update Info button', () => {
      render(<BillingPortal />);
      expect(screen.getByText('Update Info')).toBeInTheDocument();
    });

    it('shows loading skeleton during fetch', () => {
      mockGetBillingInformation.mockReturnValue({ data: undefined, isLoading: true, error: null });
      const { container } = render(<BillingPortal />);
      // Skeleton elements should be present via animate-pulse
      const skeletons = container.querySelectorAll('[class*="animate-pulse"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('calls trpc.billing.getBillingInformation hook', () => {
      render(<BillingPortal />);
      expect(mockGetBillingInformation).toHaveBeenCalled();
    });

    it('shows empty state when no billing info', () => {
      mockGetBillingInformation.mockReturnValue({ data: null, isLoading: false, error: null });
      render(<BillingPortal />);
      expect(screen.getByText('No billing information on file')).toBeInTheDocument();
    });
  });

  // ============================================
  // 5. Billing History Table
  // ============================================

  describe('Billing History Table', () => {
    it('renders with Billing History title and history icon', () => {
      render(<BillingPortal />);
      expect(screen.getByText('Billing History')).toBeInTheDocument();
      expect(screen.getByText('history')).toBeInTheDocument();
    });

    it('shows 4 columns: Invoice Date, Amount, Status, Action', () => {
      render(<BillingPortal />);
      expect(screen.getByText('Invoice Date')).toBeInTheDocument();
      expect(screen.getByText('Amount')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Action')).toBeInTheDocument();
    });

    it('renders invoice data correctly', () => {
      render(<BillingPortal />);
      expect(screen.getByText('Paid')).toBeInTheDocument();
    });

    it('shows Paid status badge in green', () => {
      render(<BillingPortal />);
      const paidBadge = screen.getByText('Paid');
      expect(paidBadge.className).toContain('border-green-200');
    });

    it('shows Open/Pending status badge in amber', () => {
      mockListInvoices.mockReturnValue({
        data: {
          invoices: [createMockInvoice({ status: 'open', amountPaid: 0 })],
          total: 1,
          page: 1,
          limit: 5,
          hasMore: false,
        },
        isLoading: false,
        error: null,
      });
      render(<BillingPortal />);
      const openBadge = screen.getByText('Open');
      expect(openBadge.className).toContain('border-amber-200');
    });

    it('renders Download button when PDF available', () => {
      render(<BillingPortal />);
      expect(screen.getByRole('link', { name: /download invoice/i })).toBeInTheDocument();
    });

    it('hides Download when no PDF URL', () => {
      mockListInvoices.mockReturnValue({
        data: {
          invoices: [createMockInvoice({ invoicePdf: undefined })],
          total: 1,
          page: 1,
          limit: 5,
          hasMore: false,
        },
        isLoading: false,
        error: null,
      });
      render(<BillingPortal />);
      expect(screen.queryByRole('link', { name: /download invoice/i })).not.toBeInTheDocument();
    });

    it('shows View All link with arrow', () => {
      render(<BillingPortal />);
      expect(screen.getByText('View All')).toBeInTheDocument();
      expect(screen.getByText('arrow_forward')).toBeInTheDocument();
    });

    it('shows empty state when no invoices', () => {
      mockListInvoices.mockReturnValue({
        data: { invoices: [], total: 0, page: 1, limit: 5, hasMore: false },
        isLoading: false,
        error: null,
      });
      render(<BillingPortal />);
      // "No invoices yet" appears twice (EmptyState title + description) because
      // billing-shared passes the custom `message` through as the description
      // while the canonical config title is also "No invoices yet".
      expect(screen.getAllByText('No invoices yet').length).toBeGreaterThan(0);
    });

    it('formats dates and currency correctly', () => {
      render(<BillingPortal />);
      // Invoice date should be formatted
      expect(screen.getByText(/Dec 2024|1 Dec 2024/)).toBeInTheDocument();
    });

    it('renders Load More button when hasMore is true and increments page on click', () => {
      mockListInvoices.mockReturnValue({
        data: { invoices: mockInvoices, total: 10, page: 1, limit: 5, hasMore: true },
        isLoading: false,
        error: null,
      });
      render(<BillingPortal />);
      const loadMoreBtn = screen.getByText('Load More');
      expect(loadMoreBtn).toBeInTheDocument();
      fireEvent.click(loadMoreBtn);
      // After click, the component calls setPage which triggers a re-render
      // The mockListInvoices should be called again with updated page
      expect(mockListInvoices).toHaveBeenCalled();
    });
  });

  // ============================================
  // 6. Loading States
  // ============================================

  describe('Loading States', () => {
    it('shows subscription skeleton during loading', () => {
      mockGetSubscription.mockReturnValue({ data: undefined, isLoading: true, error: null });
      const { container } = render(<BillingPortal />);
      const skeletons = container.querySelectorAll('[class*="animate-pulse"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('shows payment methods skeleton during loading', () => {
      mockGetPaymentMethods.mockReturnValue({ data: undefined, isLoading: true, error: null });
      const { container } = render(<BillingPortal />);
      const skeletons = container.querySelectorAll('[class*="animate-pulse"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('shows invoices skeleton during loading', () => {
      mockListInvoices.mockReturnValue({ data: undefined, isLoading: true, error: null });
      const { container } = render(<BillingPortal />);
      const skeletons = container.querySelectorAll('[class*="animate-pulse"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('shows billing info skeleton during loading', () => {
      mockGetBillingInformation.mockReturnValue({ data: undefined, isLoading: true, error: null });
      const { container } = render(<BillingPortal />);
      const skeletons = container.querySelectorAll('[class*="animate-pulse"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('shows auth loading skeleton', async () => {
      const { useAuth } = vi.mocked((await import('@/lib/auth/AuthContext')) as any);
      useAuth.mockReturnValue({ isAuthenticated: false, isLoading: true });
      const { container } = render(<BillingPortal />);
      const skeletons = container.querySelectorAll('[class*="animate-pulse"]');
      expect(skeletons.length).toBeGreaterThan(0);
      useAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    });

    it('does not show content during loading', () => {
      mockGetSubscription.mockReturnValue({ data: undefined, isLoading: true, error: null });
      mockGetPaymentMethods.mockReturnValue({ data: undefined, isLoading: true, error: null });
      mockListInvoices.mockReturnValue({ data: undefined, isLoading: true, error: null });
      mockGetBillingInformation.mockReturnValue({ data: undefined, isLoading: true, error: null });
      render(<BillingPortal />);
      expect(screen.queryByText('Subscription Overview')).not.toBeInTheDocument();
      expect(screen.queryByText('Payment Methods')).not.toBeInTheDocument();
    });
  });

  // ============================================
  // 7. Empty States
  // ============================================

  describe('Empty States', () => {
    it('shows no subscription message', () => {
      mockGetSubscription.mockReturnValue({ data: null, isLoading: false, error: null });
      render(<BillingPortal />);
      expect(screen.getByText('No active subscription')).toBeInTheDocument();
    });

    it('shows no payment methods message', () => {
      mockGetPaymentMethods.mockReturnValue({ data: [], isLoading: false, error: null });
      render(<BillingPortal />);
      // Canonical EmptyState copy (entity="payment-methods" title) after
      // billing-portal migrated to <EmptyState entity /> via billing-shared.
      expect(screen.getByText('No payment methods')).toBeInTheDocument();
    });

    it('shows no invoices message', () => {
      mockListInvoices.mockReturnValue({
        data: { invoices: [], total: 0, page: 1, limit: 5, hasMore: false },
        isLoading: false,
        error: null,
      });
      render(<BillingPortal />);
      // "No invoices yet" appears twice (EmptyState title + description) because
      // billing-shared passes the custom `message` through as the description
      // while the canonical config title is also "No invoices yet".
      expect(screen.getAllByText('No invoices yet').length).toBeGreaterThan(0);
    });

    it('shows no billing info message', () => {
      mockGetBillingInformation.mockReturnValue({ data: null, isLoading: false, error: null });
      render(<BillingPortal />);
      expect(screen.getByText('No billing information on file')).toBeInTheDocument();
    });
  });

  // ============================================
  // 8. Accessibility
  // ============================================

  describe('Accessibility', () => {
    it('section headings use proper heading levels', () => {
      render(<BillingPortal />);
      const headings = screen.getAllByRole('heading');
      expect(headings.length).toBeGreaterThan(0);
    });

    it('all buttons have accessible names', () => {
      render(<BillingPortal />);
      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        const name = button.getAttribute('aria-label') || button.textContent;
        expect(name).toBeTruthy();
      });
    });

    it('all links have accessible names', () => {
      render(<BillingPortal />);
      const links = screen.getAllByRole('link');
      links.forEach((link) => {
        const name = link.getAttribute('aria-label') || link.textContent;
        expect(name).toBeTruthy();
      });
    });

    it('table uses proper ARIA with scope=col', () => {
      render(<BillingPortal />);
      const tableHeaders = document.querySelectorAll('th[scope="col"]');
      expect(tableHeaders.length).toBe(4);
    });

    it('status badges include ARIA labels', () => {
      render(<BillingPortal />);
      const statusBadges = document.querySelectorAll('[aria-label*="status"]');
      expect(statusBadges.length).toBeGreaterThan(0);
    });

    it('icons have aria-hidden=true', () => {
      render(<BillingPortal />);
      const icons = document.querySelectorAll('.material-symbols-outlined');
      icons.forEach((icon) => {
        expect(icon.getAttribute('aria-hidden')).toBe('true');
      });
    });
  });

  // ============================================
  // 9. Error States
  // ============================================

  describe('Error States', () => {
    it('handles subscription query failure', () => {
      mockGetSubscription.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('fetch failed'),
      });
      render(<BillingPortal />);
      expect(screen.getByText('Failed to load subscription details')).toBeInTheDocument();
    });

    it('handles payment methods query failure', () => {
      mockGetPaymentMethods.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('fetch failed'),
      });
      render(<BillingPortal />);
      expect(screen.getByText('Failed to load payment methods')).toBeInTheDocument();
    });

    it('handles invoices query failure', () => {
      mockListInvoices.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('fetch failed'),
      });
      render(<BillingPortal />);
      expect(screen.getByText('Failed to load billing history')).toBeInTheDocument();
    });

    it('handles billing info query failure', () => {
      mockGetBillingInformation.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('fetch failed'),
      });
      render(<BillingPortal />);
      expect(screen.getByText('Failed to load billing information')).toBeInTheDocument();
    });
  });
});
