/**
 * @vitest-environment jsdom
 */
/**
 * Payment Methods Component - Primary Rendering Tests
 *
 * @implements PG-029 (Payment Methods)
 *
 * Tests cover:
 * - Card title and description rendering
 * - Loading skeleton state
 * - Error state with retry button
 * - Empty state with add CTA
 * - Card list with brand, last4, expiry
 * - Default/Expired/Expiring Soon badges
 * - Add Card button visibility
 * - Remove button per card
 * - Set Default button visibility rules
 * - Security note text
 * - Dialog ARIA attributes (role="dialog", aria-modal)
 * - Dialog ARIA for AlertDialog (role="alertdialog")
 * - PageHeader component usage
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ============================================
// Hoisted mocks
// ============================================

const mockPaymentMethods = vi.hoisted(() => [
  {
    id: 'pm_default',
    type: 'card' as const,
    card: {
      brand: 'visa',
      last4: '4242',
      expMonth: 12,
      expYear: 2028,
    },
    isDefault: true,
  },
  {
    id: 'pm_expired',
    type: 'card' as const,
    card: {
      brand: 'mastercard',
      last4: '5555',
      expMonth: 1,
      expYear: 2025,
    },
    isDefault: false,
  },
  {
    id: 'pm_expiring',
    type: 'card' as const,
    card: {
      brand: 'amex',
      last4: '3782',
      expMonth: new Date().getMonth() + 2 > 12 ? 1 : new Date().getMonth() + 2,
      expYear:
        new Date().getMonth() + 2 > 12 ? new Date().getFullYear() + 1 : new Date().getFullYear(),
    },
    isDefault: false,
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

vi.mock('@/lib/auth/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
  }),
}));

vi.mock('@/lib/billing/card-manager', () => ({
  getCardDisplayInfo: (pm: any) => {
    if (!pm?.card) return null;
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const fullYear = pm.card.expYear < 100 ? 2000 + pm.card.expYear : pm.card.expYear;
    const isExpired =
      fullYear < currentYear || (fullYear === currentYear && pm.card.expMonth < currentMonth);
    const futureDate = new Date(currentYear, now.getMonth() + 3, 1);
    const expiryDate = new Date(fullYear, pm.card.expMonth, 0);
    const isExpiringSoon = !isExpired && expiryDate <= futureDate;
    return {
      brandName: pm.card.brand.charAt(0).toUpperCase() + pm.card.brand.slice(1),
      brandIcon: 'credit_card',
      last4: pm.card.last4,
      expiry: `${String(pm.card.expMonth).padStart(2, '0')}/${fullYear}`,
      status: { isExpired, isExpiringSoon },
      isDefault: pm.isDefault,
    };
  },
  sortPaymentMethods: (methods: any[]) =>
    [...methods].sort((a: any, b: any) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0)),
  canRemoveCard: (_id: string, _methods: any[]) => ({ canRemove: true, reason: undefined }),
  formatCardDisplayString: (brand: string, last4: string) =>
    `${brand.charAt(0).toUpperCase() + brand.slice(1)} ending in ${last4}`,
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
  detectCardBrand: () => 'visa' as const,
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

// Mock Stripe Elements for AddCardDialog
vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: Readonly<{ children: React.ReactNode }>) => (
    <div data-testid="stripe-elements">{children}</div>
  ),
  CardNumberElement: () => <div data-testid="card-number-element" />,
  CardExpiryElement: () => <div data-testid="card-expiry-element" />,
  CardCvcElement: () => <div data-testid="card-cvc-element" />,
  useStripe: () => ({
    createPaymentMethod: vi.fn().mockResolvedValue({
      paymentMethod: { id: 'pm_new_123' },
    }),
  }),
  useElements: () => ({
    getElement: () => ({}),
  }),
}));

vi.mock('@/lib/billing/stripe-client', () => ({
  getStripePromise: () => Promise.resolve(null),
}));

import { PaymentMethods } from '../payment-methods';

// ============================================
// Tests
// ============================================

describe('PaymentMethods - Primary Rendering', () => {
  beforeEach(() => {
    mockQueryResult.data = null;
    mockQueryResult.isLoading = false;
    mockQueryResult.error = null;
    mockMutateAsyncUpdate.mockResolvedValue({});
    mockMutateAsyncRemove.mockResolvedValue({});
  });

  // ----------------------------------------
  // Card title and description
  // ----------------------------------------

  it('renders "Payment Methods" card title', () => {
    mockQueryResult.data = mockPaymentMethods;
    render(<PaymentMethods />);
    expect(screen.getByText('Payment Methods')).toBeInTheDocument();
  });

  it('renders card description subtitle', () => {
    mockQueryResult.data = mockPaymentMethods;
    render(<PaymentMethods />);
    expect(screen.getByText('Manage your saved payment methods')).toBeInTheDocument();
  });

  // ----------------------------------------
  // Loading state
  // ----------------------------------------

  it('shows loading skeleton when isLoading is true', () => {
    mockQueryResult.isLoading = true;
    render(<PaymentMethods />);
    // Skeleton renders but no card data
    expect(screen.getByText('Payment Methods')).toBeInTheDocument();
    expect(screen.queryByText(/4242/)).not.toBeInTheDocument();
  });

  // ----------------------------------------
  // Error state
  // ----------------------------------------

  it('shows error state with "Failed to load payment methods" and "Try Again" button', () => {
    mockQueryResult.error = new Error('Network error');
    render(<PaymentMethods />);
    expect(screen.getByText('Failed to load payment methods')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  // ----------------------------------------
  // Empty state
  // ----------------------------------------

  it('shows empty state with "No payment methods" and "Add Payment Method" button', () => {
    mockQueryResult.data = [];
    render(<PaymentMethods />);
    expect(screen.getByText('No payment methods')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add payment method/i })).toBeInTheDocument();
  });

  // ----------------------------------------
  // Card list rendering
  // ----------------------------------------

  it('renders payment method cards with brand, last4, expiry', () => {
    mockQueryResult.data = mockPaymentMethods;
    render(<PaymentMethods />);
    expect(screen.getByText(/4242/)).toBeInTheDocument();
    expect(screen.getByText(/5555/)).toBeInTheDocument();
    expect(screen.getByText(/3782/)).toBeInTheDocument();
  });

  it('shows "Default" badge on isDefault: true card', () => {
    mockQueryResult.data = mockPaymentMethods;
    render(<PaymentMethods />);
    expect(screen.getByText('Default')).toBeInTheDocument();
  });

  it('shows "Expired" red badge on expired card', () => {
    mockQueryResult.data = mockPaymentMethods;
    render(<PaymentMethods />);
    expect(screen.getByText('Expired')).toBeInTheDocument();
  });

  it('shows "Expiring Soon" amber badge on card within 3 months of expiry', () => {
    mockQueryResult.data = mockPaymentMethods;
    render(<PaymentMethods />);
    expect(screen.getByText('Expiring Soon')).toBeInTheDocument();
  });

  // ----------------------------------------
  // Button visibility
  // ----------------------------------------

  it('shows "Add Card" button in header when methods exist', () => {
    mockQueryResult.data = mockPaymentMethods;
    render(<PaymentMethods />);
    expect(screen.getByRole('button', { name: /add card/i })).toBeInTheDocument();
  });

  it('shows remove button for each payment method', () => {
    mockQueryResult.data = mockPaymentMethods;
    render(<PaymentMethods />);
    const removeButtons = screen.getAllByTitle('Remove card');
    expect(removeButtons).toHaveLength(3);
  });

  it('shows "Set as default" button only on non-default, non-expired cards', () => {
    mockQueryResult.data = mockPaymentMethods;
    render(<PaymentMethods />);
    // Only pm_expiring should show Set as default (pm_default is default, pm_expired is expired)
    const setDefaultButtons = screen.getAllByTitle('Set as default');
    expect(setDefaultButtons).toHaveLength(1);
  });

  // ----------------------------------------
  // Security note
  // ----------------------------------------

  it('renders security note "Your payment information is encrypted and secure"', () => {
    mockQueryResult.data = mockPaymentMethods;
    render(<PaymentMethods />);
    expect(screen.getByText(/encrypted and secure/i)).toBeInTheDocument();
  });

  // ----------------------------------------
  // Dialog ARIA attributes
  // ----------------------------------------

  it('AddCardDialog has role="dialog"', async () => {
    mockQueryResult.data = mockPaymentMethods;
    const user = userEvent.setup();
    render(<PaymentMethods />);

    await user.click(screen.getByRole('button', { name: /add card/i }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('RemoveCardDialog has role="alertdialog"', async () => {
    mockQueryResult.data = mockPaymentMethods;
    const user = userEvent.setup();
    render(<PaymentMethods />);

    const removeButtons = screen.getAllByTitle('Remove card');
    await user.click(removeButtons[0]);

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  // ----------------------------------------
  // Stripe Elements in AddCardDialog
  // ----------------------------------------

  it('AddCardDialog contains Stripe Elements (CardNumber, CardExpiry, CardCvc)', async () => {
    mockQueryResult.data = mockPaymentMethods;
    const user = userEvent.setup();
    render(<PaymentMethods />);

    await user.click(screen.getByRole('button', { name: /add card/i }));

    expect(screen.getByTestId('stripe-elements')).toBeInTheDocument();
    expect(screen.getByTestId('card-number-element')).toBeInTheDocument();
    expect(screen.getByTestId('card-expiry-element')).toBeInTheDocument();
    expect(screen.getByTestId('card-cvc-element')).toBeInTheDocument();
  });
});
