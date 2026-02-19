/**
 * @vitest-environment jsdom
 */
/**
 * Checkout Form Component - Supplementary Tests
 *
 * IMPLEMENTS: PG-026 (Checkout)
 *
 * Tests cover:
 * - Form validation (blur, submit)
 * - Input formatting (card number, expiry, CVC)
 * - Card brand detection icon
 * - Form submission flow (success, error)
 * - Disabled state during submission
 * - Annual vs monthly price rendering
 * - Accessibility (aria-invalid, aria-describedby)
 * - Error clearing on input change
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CheckoutFormProps } from '../checkout-form';

// ============================================
// Hoisted mocks
// ============================================

const mockMutateAsync = vi.hoisted(() => vi.fn());

// ============================================
// Module mocks
// ============================================

vi.mock('@/lib/trpc', () => ({
  trpc: {
    billing: {
      createCheckoutSubscription: {
        useMutation: () => ({
          mutateAsync: mockMutateAsync,
          isLoading: false,
          isPending: false,
        }),
      },
    },
  },
}));

vi.mock('@/lib/billing/payment-processor', () => ({
  formatCardNumber: (v: string) => {
    const clean = v.replace(/\D/g, '').slice(0, 16);
    return clean.replace(/(.{4})/g, '$1 ').trim();
  },
  formatExpiry: (v: string) => {
    const clean = v.replace(/\D/g, '').slice(0, 4);
    if (clean.length >= 3) return clean.slice(0, 2) + '/' + clean.slice(2);
    return clean;
  },
  detectCardBrand: (v: string) => {
    const clean = v.replace(/\D/g, '');
    if (clean.startsWith('4')) return 'visa' as const;
    if (clean.startsWith('5')) return 'mastercard' as const;
    if (clean.startsWith('34') || clean.startsWith('37')) return 'amex' as const;
    return 'unknown' as const;
  },
  validateCardDetails: (details: any) => {
    const errors: Record<string, string | undefined> = {};
    const cleanNumber = (details.number || '').replace(/\s/g, '');
    if (!cleanNumber || cleanNumber.length < 13) errors.number = 'Invalid card number';
    if (!details.expiry || details.expiry.length < 5) errors.expiry = 'Invalid expiry date';
    if (!details.cvc || details.cvc.length < 3) errors.cvc = 'Invalid CVC';
    if (!details.name || details.name.trim().length === 0) errors.name = 'Name is required';
    return {
      valid: Object.keys(errors).length === 0,
      errors,
    };
  },
  getPaymentErrorMessage: (code: string) => {
    const msgs: Record<string, string> = {
      PROCESSING_ERROR: 'Payment processing failed. Please try again.',
      DECLINED: 'Your card was declined.',
    };
    return msgs[code] ?? 'An error occurred';
  },
}));

import { CheckoutForm } from '../checkout-form';

// ============================================
// Test helpers
// ============================================

const defaultProps: CheckoutFormProps = {
  planId: 'professional',
  planName: 'Professional',
  priceMonthly: 7900,
  priceAnnual: 78000,
  billingCycle: 'monthly',
};

// ============================================
// Tests
// ============================================

describe('CheckoutForm - Supplementary', () => {
  beforeEach(() => {
    mockMutateAsync.mockResolvedValue({ subscriptionId: 'sub_new_123' });
  });

  describe('Order Summary', () => {
    it('shows plan name', () => {
      render(<CheckoutForm {...defaultProps} />);

      expect(screen.getByText('Professional')).toBeInTheDocument();
    });

    it('displays correct monthly price', () => {
      render(<CheckoutForm {...defaultProps} billingCycle="monthly" />);

      // priceMonthly = 7900, formatted = '£79'
      const priceElements = screen.getAllByText(/£79/);
      expect(priceElements.length).toBeGreaterThanOrEqual(1);
    });

    it('displays correct annual price', () => {
      render(<CheckoutForm {...defaultProps} billingCycle="annual" />);

      const priceElements = screen.getAllByText(/£780/);
      expect(priceElements.length).toBeGreaterThanOrEqual(1);
    });

    it('shows /month for monthly billing', () => {
      render(<CheckoutForm {...defaultProps} billingCycle="monthly" />);

      expect(screen.getByText('/month')).toBeInTheDocument();
    });

    it('shows /year for annual billing', () => {
      render(<CheckoutForm {...defaultProps} billingCycle="annual" />);

      expect(screen.getByText('/year')).toBeInTheDocument();
    });
  });

  describe('Input Formatting', () => {
    it('formats card number with spaces', async () => {
      const user = userEvent.setup();
      render(<CheckoutForm {...defaultProps} />);

      const input = screen.getByLabelText(/card number/i);
      await user.type(input, '4242424242424242');

      // Formatted: "4242 4242 4242 4242"
      expect(input).toHaveValue('4242 4242 4242 4242');
    });

    it('formats expiry with slash', async () => {
      const user = userEvent.setup();
      render(<CheckoutForm {...defaultProps} />);

      const input = screen.getByLabelText(/expiry/i);
      await user.type(input, '1225');

      expect(input).toHaveValue('12/25');
    });

    it('limits CVC to 3 digits for non-amex', async () => {
      const user = userEvent.setup();
      render(<CheckoutForm {...defaultProps} />);

      // First set card number to Visa
      const cardInput = screen.getByLabelText(/card number/i);
      await user.type(cardInput, '4242');

      const cvcInput = screen.getByLabelText(/cvc/i);
      await user.type(cvcInput, '12345');

      expect(cvcInput).toHaveValue('123');
    });
  });

  describe('Validation on Blur', () => {
    it('shows error for invalid card number on blur', async () => {
      const user = userEvent.setup();
      render(<CheckoutForm {...defaultProps} />);

      const input = screen.getByLabelText(/card number/i);
      await user.type(input, '123');
      fireEvent.blur(input);

      await waitFor(() => {
        expect(screen.getByText(/invalid card number/i)).toBeInTheDocument();
      });
    });

    it('shows error for invalid expiry on blur', async () => {
      const user = userEvent.setup();
      render(<CheckoutForm {...defaultProps} />);

      const input = screen.getByLabelText(/expiry/i);
      await user.type(input, '1');
      fireEvent.blur(input);

      await waitFor(() => {
        expect(screen.getByText(/invalid expiry/i)).toBeInTheDocument();
      });
    });

    it('shows error for invalid CVC on blur', async () => {
      const user = userEvent.setup();
      render(<CheckoutForm {...defaultProps} />);

      const input = screen.getByLabelText(/cvc/i);
      await user.type(input, '1');
      fireEvent.blur(input);

      await waitFor(() => {
        expect(screen.getByText(/invalid cvc/i)).toBeInTheDocument();
      });
    });

    it('shows error for empty name on blur', async () => {
      const user = userEvent.setup();
      render(<CheckoutForm {...defaultProps} />);

      const input = screen.getByLabelText(/cardholder name/i);
      await user.click(input);
      fireEvent.blur(input);

      await waitFor(() => {
        expect(screen.getByText(/name is required/i)).toBeInTheDocument();
      });
    });
  });

  describe('Error Clearing', () => {
    it('clears error when user types in errored field', async () => {
      const user = userEvent.setup();
      render(<CheckoutForm {...defaultProps} />);

      // Trigger error
      const input = screen.getByLabelText(/card number/i);
      await user.type(input, '1');
      fireEvent.blur(input);

      await waitFor(() => {
        expect(screen.getByText(/invalid card number/i)).toBeInTheDocument();
      });

      // Type more to clear error
      await user.type(input, '42424242424242');

      await waitFor(() => {
        expect(screen.queryByText(/invalid card number/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Form Submission - Validation Failure', () => {
    it('shows all errors when submitting empty form', async () => {
      const user = userEvent.setup();
      render(<CheckoutForm {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: /subscribe/i }));

      await waitFor(() => {
        expect(screen.getByText(/invalid card number/i)).toBeInTheDocument();
        expect(screen.getByText(/invalid expiry/i)).toBeInTheDocument();
        expect(screen.getByText(/invalid cvc/i)).toBeInTheDocument();
        expect(screen.getByText(/name is required/i)).toBeInTheDocument();
      });
    });

    it('does not call mutation when form is invalid', async () => {
      const user = userEvent.setup();
      render(<CheckoutForm {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: /subscribe/i }));

      expect(mockMutateAsync).not.toHaveBeenCalled();
    });
  });

  describe('Form Submission - Success', () => {
    it('calls mutation with correct params on valid submission', async () => {
      const onSuccess = vi.fn();
      const user = userEvent.setup();

      render(<CheckoutForm {...defaultProps} onSuccess={onSuccess} />);

      await user.type(screen.getByLabelText(/card number/i), '4242424242424242');
      await user.type(screen.getByLabelText(/expiry/i), '1228');
      await user.type(screen.getByLabelText(/cvc/i), '123');
      await user.type(screen.getByLabelText(/cardholder name/i), 'John Doe');

      await user.click(screen.getByRole('button', { name: /subscribe/i }));

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({
          planId: 'professional',
          billingCycle: 'monthly',
          paymentMethodId: expect.stringMatching(/^pm_/),
        });
      });

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith('sub_new_123');
      });
    });
  });

  describe('Form Submission - Error', () => {
    it('shows error message when mutation fails', async () => {
      mockMutateAsync.mockRejectedValueOnce(new Error('Payment declined'));
      const onError = vi.fn();
      const user = userEvent.setup();

      render(<CheckoutForm {...defaultProps} onError={onError} />);

      await user.type(screen.getByLabelText(/card number/i), '4242424242424242');
      await user.type(screen.getByLabelText(/expiry/i), '1228');
      await user.type(screen.getByLabelText(/cvc/i), '123');
      await user.type(screen.getByLabelText(/cardholder name/i), 'John Doe');

      await user.click(screen.getByRole('button', { name: /subscribe/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(/payment processing failed/i)).toBeInTheDocument();
      });

      expect(onError).toHaveBeenCalled();
    });

    it('shows generic error for non-Error exceptions', async () => {
      mockMutateAsync.mockRejectedValueOnce('unknown');
      const user = userEvent.setup();

      render(<CheckoutForm {...defaultProps} />);

      await user.type(screen.getByLabelText(/card number/i), '4242424242424242');
      await user.type(screen.getByLabelText(/expiry/i), '1228');
      await user.type(screen.getByLabelText(/cvc/i), '123');
      await user.type(screen.getByLabelText(/cardholder name/i), 'John Doe');

      await user.click(screen.getByRole('button', { name: /subscribe/i }));

      await waitFor(() => {
        expect(screen.getByText(/unexpected error/i)).toBeInTheDocument();
      });
    });
  });

  describe('Disabled State During Submission', () => {
    it('shows Processing text during submission', async () => {
      mockMutateAsync.mockImplementation(() => new Promise(() => {})); // never resolves
      const user = userEvent.setup();

      render(<CheckoutForm {...defaultProps} />);

      await user.type(screen.getByLabelText(/card number/i), '4242424242424242');
      await user.type(screen.getByLabelText(/expiry/i), '1228');
      await user.type(screen.getByLabelText(/cvc/i), '123');
      await user.type(screen.getByLabelText(/cardholder name/i), 'John Doe');

      await user.click(screen.getByRole('button', { name: /subscribe/i }));

      await waitFor(() => {
        expect(screen.getByText('Processing...')).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('sets aria-invalid on errored fields', async () => {
      const user = userEvent.setup();
      render(<CheckoutForm {...defaultProps} />);

      const cardInput = screen.getByLabelText(/card number/i);
      await user.type(cardInput, '1');
      fireEvent.blur(cardInput);

      await waitFor(() => {
        expect(cardInput).toHaveAttribute('aria-invalid', 'true');
      });
    });

    it('has form aria-label', () => {
      render(<CheckoutForm {...defaultProps} />);

      expect(screen.getByRole('form', { name: /checkout form/i })).toBeInTheDocument();
    });

    it('renders security indicator', () => {
      render(<CheckoutForm {...defaultProps} />);

      expect(screen.getByText(/secure payment/i)).toBeInTheDocument();
    });
  });

  describe('Card Brand Display', () => {
    it('shows brand icon in card number field', () => {
      render(<CheckoutForm {...defaultProps} />);

      const brandIcon = screen.getByTestId('card-brand-icon');
      expect(brandIcon).toBeInTheDocument();
    });
  });
});
