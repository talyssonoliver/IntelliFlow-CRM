/**
 * @vitest-environment jsdom
 */
/**
 * Payment Methods Page Tests
 *
 * @implements PG-029 (Payment Methods)
 *
 * Tests cover:
 * - Page renders h1 with "Payment Methods"
 * - Page renders subtitle
 * - Page renders the PaymentMethods component
 * - Page mounts without crash
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock the PaymentMethods component
vi.mock('@/components/billing/payment-methods', () => ({
  PaymentMethods: () => <div data-testid="payment-methods-component">PaymentMethods stub</div>,
}));

// Mock auth context (needed by page)
vi.mock('@/lib/auth/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
  }),
}));

// Mock trpc (needed by PaymentMethods)
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      billing: { getPaymentMethods: { invalidate: vi.fn() } },
    }),
    billing: {
      getPaymentMethods: { useQuery: () => ({ data: null, isLoading: false, error: null }) },
      updatePaymentMethod: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) },
      removePaymentMethod: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) },
    },
  },
}));

import PaymentMethodsPage from '../page';

describe('PaymentMethodsPage', () => {
  it('renders heading with "Payment Methods"', () => {
    render(<PaymentMethodsPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Payment Methods');
  });

  it('renders subtitle text', () => {
    render(<PaymentMethodsPage />);
    expect(
      screen.getByText(/Manage your saved payment methods and set your default card/)
    ).toBeInTheDocument();
  });

  it('renders the PaymentMethods component', () => {
    render(<PaymentMethodsPage />);
    expect(screen.getByTestId('payment-methods-component')).toBeInTheDocument();
  });

  it('mounts without crash', () => {
    const { container } = render(<PaymentMethodsPage />);
    expect(container).toBeTruthy();
  });
});
