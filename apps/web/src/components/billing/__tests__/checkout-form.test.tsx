// @vitest-environment jsdom
/**
 * Checkout Form Component Tests
 *
 * IMPLEMENTS: PG-026 (Checkout)
 *
 * Basic tests for checkout form component rendering and structure.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CheckoutForm, type CheckoutFormProps } from '../checkout-form';

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

describe('CheckoutForm', () => {
  const defaultProps: CheckoutFormProps = {
    planId: 'professional',
    planName: 'Professional',
    priceMonthly: 7900,
    priceAnnual: 78000,
    billingCycle: 'monthly',
  };

  describe('rendering', () => {
    it('should render the checkout form with all inputs', () => {
      render(<CheckoutForm {...defaultProps} />);

      expect(screen.getByLabelText(/card number/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/expiry/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/cvc/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/cardholder name/i)).toBeInTheDocument();
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
      // Price appears in order summary and submit button
      const priceElements = screen.getAllByText(/£79/);
      expect(priceElements.length).toBeGreaterThanOrEqual(1);
    });

    it('should display annual price correctly', () => {
      render(<CheckoutForm {...defaultProps} billingCycle="annual" />);
      // Price appears in order summary and submit button
      const priceElements = screen.getAllByText(/£780/);
      expect(priceElements.length).toBeGreaterThanOrEqual(1);
    });

    it('should render secure payment indicator', () => {
      render(<CheckoutForm {...defaultProps} />);
      expect(screen.getByText(/secure|encrypted/i)).toBeInTheDocument();
    });

    it('should have password type for CVC input', () => {
      render(<CheckoutForm {...defaultProps} />);
      const cvcInput = screen.getByLabelText(/cvc/i);
      expect(cvcInput).toHaveAttribute('type', 'password');
    });
  });

  describe('accessibility', () => {
    it('should have accessible labels for all inputs', () => {
      render(<CheckoutForm {...defaultProps} />);

      expect(screen.getByLabelText(/card number/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/expiry/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/cvc/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/cardholder name/i)).toBeInTheDocument();
    });
  });
});
