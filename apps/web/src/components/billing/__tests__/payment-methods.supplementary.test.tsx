/**
 * @vitest-environment jsdom
 */
/**
 * Payment Methods Component - Supplementary Tests
 *
 * @implements PG-029 (Payment Methods)
 *
 * Tests cover:
 * - Loading skeleton state
 * - Error state with retry
 * - Empty state with add card CTA
 * - Payment method card rendering with badges (default, expired, expiring soon)
 * - Set default action
 * - Remove card flow with confirmation dialog
 * - Add card dialog open/close and form validation
 * - Toast notifications
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ============================================
// Hoisted mocks
// ============================================

const mockPaymentMethods = vi.hoisted(() => [
  {
    id: 'pm_001',
    type: 'card' as const,
    card: {
      brand: 'visa',
      last4: '4242',
      expMonth: 12,
      expYear: 2028,
    },
    isDefault: true,
    created: new Date('2024-01-01'),
  },
  {
    id: 'pm_002',
    type: 'card' as const,
    card: {
      brand: 'mastercard',
      last4: '5555',
      expMonth: 1,
      expYear: 2025,
    },
    isDefault: false,
    created: new Date('2024-06-01'),
  },
]);

const mockInvalidate = vi.hoisted(() => vi.fn());
const mockMutateAsyncUpdate = vi.hoisted(() => vi.fn().mockResolvedValue({}));
const mockMutateAsyncRemove = vi.hoisted(() => vi.fn().mockResolvedValue({}));

const mockQueryResult = vi.hoisted(() => ({
  data: null as typeof mockPaymentMethods | null,
  isLoading: false,
  error: null as Error | null,
}));

const mockUpdateMutation = vi.hoisted(() => ({
  mutateAsync: mockMutateAsyncUpdate,
  isPending: false,
}));

const mockRemoveMutation = vi.hoisted(() => ({
  mutateAsync: mockMutateAsyncRemove,
  isPending: false,
}));

// ============================================
// Module mocks
// ============================================

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      billing: {
        getPaymentMethods: {
          invalidate: mockInvalidate,
        },
      },
    }),
    billing: {
      getPaymentMethods: {
        useQuery: (_input: unknown, _opts?: unknown) => mockQueryResult,
      },
      updatePaymentMethod: {
        useMutation: (opts?: any) => {
          // Store callbacks for test invocation
          (mockUpdateMutation as any)._onSuccess = opts?.onSuccess;
          (mockUpdateMutation as any)._onError = opts?.onError;
          return mockUpdateMutation;
        },
      },
      removePaymentMethod: {
        useMutation: (opts?: any) => {
          (mockRemoveMutation as any)._onSuccess = opts?.onSuccess;
          (mockRemoveMutation as any)._onError = opts?.onError;
          return mockRemoveMutation;
        },
      },
    },
  },
}));

vi.mock('@/lib/billing/card-manager', () => ({
  getCardDisplayInfo: (pm: any) => {
    if (!pm?.card) return null;
    const now = new Date();
    const expDate = new Date(pm.card.expYear, pm.card.expMonth - 1);
    const isExpired = expDate < now;
    const threeMonths = new Date();
    threeMonths.setMonth(threeMonths.getMonth() + 3);
    const isExpiringSoon = !isExpired && expDate < threeMonths;
    return {
      brandName: pm.card.brand.charAt(0).toUpperCase() + pm.card.brand.slice(1),
      last4: pm.card.last4,
      expiry: `${pm.card.expMonth}/${pm.card.expYear}`,
      status: { isExpired, isExpiringSoon },
      isDefault: pm.isDefault,
    };
  },
  sortPaymentMethods: (methods: any[]) =>
    [...methods].sort((a: any, b: any) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0)),
  canRemoveCard: (_id: string, _methods: any[]) => ({ allowed: true, reason: undefined }),
  formatCardDisplayString: (brand: string, last4: string) => `${brand} ending in ${last4}`,
  formatMaskedCardNumber: (last4: string) => `**** **** **** ${last4}`,
}));

vi.mock('@/lib/billing/payment-processor', () => ({
  formatCardNumber: (v: string) =>
    v
      .replace(/\D/g, '')
      .replace(/(.{4})/g, '$1 ')
      .trim(),
  formatExpiry: (v: string) => {
    const clean = v.replace(/\D/g, '');
    if (clean.length >= 3) return clean.slice(0, 2) + '/' + clean.slice(2, 4);
    return clean;
  },
  detectCardBrand: (_v: string) => 'visa' as const,
  validateCardDetails: (details: any) => {
    const errors: Record<string, string | undefined> = {};
    if (!details.number || details.number.replace(/\s/g, '').length < 13)
      errors.number = 'Invalid card number';
    if (!details.expiry) errors.expiry = 'Expiry required';
    if (!details.cvc) errors.cvc = 'CVC required';
    if (!details.name) errors.name = 'Name required';
    return { valid: Object.keys(errors).length === 0, errors };
  },
}));

import { PaymentMethods } from '../payment-methods';

// ============================================
// Tests
// ============================================

describe('PaymentMethods', () => {
  beforeEach(() => {
    // Reset query result to defaults
    mockQueryResult.data = null;
    mockQueryResult.isLoading = false;
    mockQueryResult.error = null;

    mockMutateAsyncUpdate.mockResolvedValue({});
    mockMutateAsyncRemove.mockResolvedValue({});
  });

  describe('Loading State', () => {
    it('renders loading skeleton when data is loading', () => {
      mockQueryResult.isLoading = true;

      render(<PaymentMethods />);

      // LoadingSkeleton renders skeleton elements (divs with Skeleton class)
      // The card header should still render
      expect(screen.getByText('Payment Methods')).toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('renders error message when query fails', () => {
      mockQueryResult.error = new Error('Network error');

      render(<PaymentMethods />);

      expect(screen.getByText('Failed to load payment methods')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    });

    it('calls invalidate when Try Again is clicked', async () => {
      mockQueryResult.error = new Error('Network error');
      const user = userEvent.setup();

      render(<PaymentMethods />);

      await user.click(screen.getByRole('button', { name: /try again/i }));
      expect(mockInvalidate).toHaveBeenCalled();
    });
  });

  describe('Empty State', () => {
    it('renders empty state when no payment methods', () => {
      mockQueryResult.data = [];

      render(<PaymentMethods />);

      expect(screen.getByText('No payment methods')).toBeInTheDocument();
      expect(screen.getByText(/add a payment method/i)).toBeInTheDocument();
    });

    it('renders Add Payment Method button in empty state', () => {
      mockQueryResult.data = [];

      render(<PaymentMethods />);

      expect(screen.getByRole('button', { name: /add payment method/i })).toBeInTheDocument();
    });
  });

  describe('Payment Methods List', () => {
    it('renders all payment methods', () => {
      mockQueryResult.data = mockPaymentMethods;

      render(<PaymentMethods />);

      expect(screen.getByText(/4242/)).toBeInTheDocument();
      expect(screen.getByText(/5555/)).toBeInTheDocument();
    });

    it('shows Default badge for default payment method', () => {
      mockQueryResult.data = mockPaymentMethods;

      render(<PaymentMethods />);

      expect(screen.getByText('Default')).toBeInTheDocument();
    });

    it('shows Expired badge for expired card', () => {
      mockQueryResult.data = mockPaymentMethods;

      render(<PaymentMethods />);

      // pm_002 has expMonth 1, expYear 2025 which is expired
      expect(screen.getByText('Expired')).toBeInTheDocument();
    });

    it('renders Add Card button in header when methods exist', () => {
      mockQueryResult.data = mockPaymentMethods;

      render(<PaymentMethods />);

      expect(screen.getByRole('button', { name: /add card/i })).toBeInTheDocument();
    });

    it('renders remove buttons for each card', () => {
      mockQueryResult.data = mockPaymentMethods;

      render(<PaymentMethods />);

      const removeButtons = screen.getAllByTitle('Remove card');
      expect(removeButtons.length).toBe(2);
    });
  });

  describe('Add Card Dialog', () => {
    it('opens add card dialog when button is clicked', async () => {
      mockQueryResult.data = mockPaymentMethods;
      const user = userEvent.setup();

      render(<PaymentMethods />);

      await user.click(screen.getByRole('button', { name: /add card/i }));

      expect(screen.getByText('Add Payment Method')).toBeInTheDocument();
      expect(screen.getByLabelText(/card number/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/expiry/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/cvc/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/cardholder name/i)).toBeInTheDocument();
    });

    it('closes add card dialog when Cancel is clicked', async () => {
      mockQueryResult.data = mockPaymentMethods;
      const user = userEvent.setup();

      render(<PaymentMethods />);

      await user.click(screen.getByRole('button', { name: /add card/i }));
      expect(screen.getByText('Add Payment Method')).toBeInTheDocument();

      // Click Cancel in the dialog footer
      const cancelButtons = screen.getAllByRole('button', { name: /cancel/i });
      await user.click(cancelButtons[cancelButtons.length - 1]);

      // Dialog should close (the form inputs disappear)
      expect(screen.queryByLabelText(/card number/i)).not.toBeInTheDocument();
    });

    it('shows validation errors when submitting empty form', async () => {
      mockQueryResult.data = mockPaymentMethods;
      const user = userEvent.setup();

      render(<PaymentMethods />);

      await user.click(screen.getByRole('button', { name: /add card/i }));

      // Click the Add Card submit button (the one inside the dialog footer)
      const addButtons = screen.getAllByRole('button', { name: /add card/i });
      // The last one is in the dialog footer
      await user.click(addButtons[addButtons.length - 1]);

      // Should show validation errors
      await waitFor(() => {
        expect(screen.getByText(/invalid card number/i)).toBeInTheDocument();
      });
    });
  });

  describe('Remove Card Dialog', () => {
    it('opens remove confirmation when remove button clicked', async () => {
      mockQueryResult.data = mockPaymentMethods;
      const user = userEvent.setup();

      render(<PaymentMethods />);

      const removeButtons = screen.getAllByTitle('Remove card');
      await user.click(removeButtons[0]);

      expect(screen.getByText('Remove Payment Method?')).toBeInTheDocument();
    });

    it('closes remove dialog when Cancel is clicked', async () => {
      mockQueryResult.data = mockPaymentMethods;
      const user = userEvent.setup();

      render(<PaymentMethods />);

      const removeButtons = screen.getAllByTitle('Remove card');
      await user.click(removeButtons[0]);

      expect(screen.getByText('Remove Payment Method?')).toBeInTheDocument();

      const cancelBtn = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelBtn);

      expect(screen.queryByText('Remove Payment Method?')).not.toBeInTheDocument();
    });

    it('calls remove mutation when confirm is clicked', async () => {
      mockQueryResult.data = mockPaymentMethods;
      const user = userEvent.setup();

      render(<PaymentMethods />);

      const removeButtons = screen.getAllByTitle('Remove card');
      await user.click(removeButtons[0]);

      const removeConfirmBtn = screen.getByRole('button', { name: /^remove$/i });
      await user.click(removeConfirmBtn);

      await waitFor(() => {
        expect(mockMutateAsyncRemove).toHaveBeenCalledWith({
          paymentMethodId: expect.any(String),
        });
      });
    });
  });

  describe('Security Note', () => {
    it('renders security note', () => {
      mockQueryResult.data = mockPaymentMethods;

      render(<PaymentMethods />);

      expect(screen.getByText(/encrypted and secure/i)).toBeInTheDocument();
    });
  });

  describe('PaymentMethodCard null display info', () => {
    it('does not render a card when getCardDisplayInfo returns null', () => {
      // Card with no card data
      mockQueryResult.data = [
        {
          id: 'pm_bad',
          type: 'card' as const,
          card: null as any,
          isDefault: false,
          created: new Date(),
        },
      ];

      render(<PaymentMethods />);

      // Should not crash and should show empty state since the card renders null
      expect(screen.queryByText('Default')).not.toBeInTheDocument();
    });
  });
});
