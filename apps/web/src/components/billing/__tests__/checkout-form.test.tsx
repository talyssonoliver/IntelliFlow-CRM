// @vitest-environment jsdom
/**
 * Checkout Form Component Tests
 *
 * IMPLEMENTS: PG-026 (Checkout)
 *
 * Tests for checkout form component rendering and structure
 * with Stripe Elements (CardNumberElement, CardExpiryElement, CardCvcElement).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CheckoutForm, type CheckoutFormProps } from '../checkout-form';

// ============================================
// Stripe Elements mock
// ============================================

vi.mock('@stripe/react-stripe-js', () => {
  const React = require('react');
  return {
    CardNumberElement: (props: any) =>
      React.createElement('div', { 'data-testid': 'card-number-element', ...props }),
    CardExpiryElement: (props: any) =>
      React.createElement('div', { 'data-testid': 'card-expiry-element', ...props }),
    CardCvcElement: (props: any) =>
      React.createElement('div', { 'data-testid': 'card-cvc-element', ...props }),
    useStripe: () => ({
      createPaymentMethod: vi.fn(),
      confirmCardPayment: vi.fn(),
    }),
    useElements: () => ({
      getElement: vi.fn(),
    }),
  };
});

// Mock tRPC
vi.mock('@/lib/trpc', () => ({
  trpc: {
    billing: {
      createCheckoutSubscription: {
        useMutation: () => ({
          mutateAsync: vi.fn(),
          isLoading: false,
        }),
      },
    },
  },
}));

// Mock cn utility
vi.mock('@intelliflow/ui', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

// Mock payment-processor
vi.mock('@/lib/billing/payment-processor', () => ({
  getPaymentErrorMessage: (code: string) => `Error: ${code}`,
}));

describe('CheckoutForm', () => {
  const defaultProps: CheckoutFormProps = {
    planId: 'professional',
    planName: 'Professional',
    priceMonthly: 7900,
    priceAnnual: 78000,
    billingCycle: 'monthly',
  };

  describe('rendering', () => {
    it('should render Stripe Elements for card input', () => {
      render(<CheckoutForm {...defaultProps} />);

      expect(screen.getByTestId('card-number-element')).toBeInTheDocument();
      expect(screen.getByTestId('card-expiry-element')).toBeInTheDocument();
      expect(screen.getByTestId('card-cvc-element')).toBeInTheDocument();
    });

    it('should render labels for card fields', () => {
      render(<CheckoutForm {...defaultProps} />);

      expect(screen.getByText('Card Number')).toBeInTheDocument();
      expect(screen.getByText('Expiry Date')).toBeInTheDocument();
      expect(screen.getByText('CVC')).toBeInTheDocument();
    });

    it('should render cardholder name as standard React input', () => {
      render(<CheckoutForm {...defaultProps} />);

      const nameInput = screen.getByLabelText(/cardholder name/i);
      expect(nameInput).toBeInTheDocument();
      expect(nameInput.tagName).toBe('INPUT');
      expect(nameInput).toHaveAttribute('type', 'text');
    });

    it('should have autoComplete and inputMode on cardholder name', () => {
      render(<CheckoutForm {...defaultProps} />);

      const nameInput = screen.getByLabelText(/cardholder name/i);
      expect(nameInput).toHaveAttribute('autoComplete', 'cc-name');
      expect(nameInput).toHaveAttribute('inputMode', 'text');
    });

    it('should render the submit button', () => {
      render(<CheckoutForm {...defaultProps} />);
      expect(screen.getByRole('button', { name: /subscribe/i })).toBeInTheDocument();
    });

    it('should display plan name in order summary', () => {
      render(<CheckoutForm {...defaultProps} />);
      expect(screen.getByText('Professional')).toBeInTheDocument();
    });

    it('should display monthly price correctly', () => {
      render(<CheckoutForm {...defaultProps} billingCycle="monthly" />);
      const priceElements = screen.getAllByText(/£79/);
      expect(priceElements.length).toBeGreaterThanOrEqual(1);
    });

    it('should display annual price correctly', () => {
      render(<CheckoutForm {...defaultProps} billingCycle="annual" />);
      const priceElements = screen.getAllByText(/£780/);
      expect(priceElements.length).toBeGreaterThanOrEqual(1);
    });

    it('should render secure payment indicator', () => {
      render(<CheckoutForm {...defaultProps} />);
      expect(screen.getByText(/secure payment/i)).toBeInTheDocument();
    });

    it('should show tax row in order summary', () => {
      render(<CheckoutForm {...defaultProps} />);
      expect(screen.getByText('Tax')).toBeInTheDocument();
      expect(screen.getByText('Calculated at payment')).toBeInTheDocument();
    });

    it('should render card brand icon', () => {
      render(<CheckoutForm {...defaultProps} />);
      expect(screen.getByTestId('card-brand-icon')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have aria-label on the form', () => {
      render(<CheckoutForm {...defaultProps} />);
      expect(screen.getByRole('form', { name: /checkout form/i })).toBeInTheDocument();
    });

    it('should have accessible label for cardholder name', () => {
      render(<CheckoutForm {...defaultProps} />);
      expect(screen.getByLabelText(/cardholder name/i)).toBeInTheDocument();
    });
  });
});
