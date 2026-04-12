/**
 * @vitest-environment jsdom
 */
/**
 * Checkout Form Component - Supplementary Tests
 *
 * IMPLEMENTS: PG-026 (Checkout)
 *
 * Tests cover:
 * - Stripe Elements rendering (CardNumber, CardExpiry, CardCvc)
 * - Card brand detection via Stripe element change event
 * - Form submission flow with stripe.createPaymentMethod
 * - 3D Secure handling (requires_action → confirmCardPayment)
 * - Error propagation from Stripe error codes
 * - Disabled state during submission
 * - Accessibility (aria-invalid, aria-describedby, role="alert")
 * - Annual vs monthly billing cycle
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CheckoutFormProps } from '../checkout-form';

// ============================================
// Hoisted mocks
// ============================================

const mockMutateAsync = vi.hoisted(() => vi.fn());
const mockCreatePaymentMethod = vi.hoisted(() => vi.fn());
const mockConfirmCardPayment = vi.hoisted(() => vi.fn());
const mockGetElement = vi.hoisted(() => vi.fn());

// Track onChange handlers registered by Stripe Elements
const elementChangeHandlers = vi.hoisted(() => ({
  cardNumber: null as ((event: any) => void) | null,
  cardExpiry: null as ((event: any) => void) | null,
  cardCvc: null as ((event: any) => void) | null,
}));

// ============================================
// Module mocks
// ============================================

vi.mock('@stripe/react-stripe-js', () => {
  const React = require('react');
  return {
    CardNumberElement: (props: any) => {
      // Capture onChange handler
      if (props.onChange) {
        elementChangeHandlers.cardNumber = props.onChange;
      }
      return React.createElement('div', {
        'data-testid': 'card-number-element',
        'aria-label': 'Card Number',
      });
    },
    CardExpiryElement: (props: any) => {
      if (props.onChange) {
        elementChangeHandlers.cardExpiry = props.onChange;
      }
      return React.createElement('div', {
        'data-testid': 'card-expiry-element',
        'aria-label': 'Expiry Date',
      });
    },
    CardCvcElement: (props: any) => {
      if (props.onChange) {
        elementChangeHandlers.cardCvc = props.onChange;
      }
      return React.createElement('div', {
        'data-testid': 'card-cvc-element',
        'aria-label': 'CVC',
      });
    },
    useStripe: () => ({
      createPaymentMethod: mockCreatePaymentMethod,
      confirmCardPayment: mockConfirmCardPayment,
    }),
    useElements: () => ({
      getElement: mockGetElement,
    }),
  };
});

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

vi.mock('@intelliflow/ui', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

vi.mock('@/lib/billing/payment-processor', () => ({
  getPaymentErrorMessage: (code: string, _declineCode?: string) => {
    const msgs: Record<string, string> = {
      PROCESSING_ERROR: 'Payment processing failed. Please try again.',
      CARD_DECLINED: 'Your card was declined.',
      THREE_D_SECURE_FAILED: '3D Secure verification failed.',
      card_declined: 'Your card was declined.',
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

const mockCardElement = { _type: 'CardNumberElement' };

// ============================================
// Tests
// ============================================

describe('CheckoutForm - Supplementary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    elementChangeHandlers.cardNumber = null;
    elementChangeHandlers.cardExpiry = null;
    elementChangeHandlers.cardCvc = null;

    mockGetElement.mockReturnValue(mockCardElement);
    mockCreatePaymentMethod.mockResolvedValue({
      paymentMethod: { id: 'pm_test_123' },
    });
    mockMutateAsync.mockResolvedValue({
      subscriptionId: 'sub_new_123',
      status: 'active',
      currentPeriodEnd: new Date(),
    });
  });

  describe('Stripe Elements Rendering', () => {
    it('renders CardNumberElement, CardExpiryElement, CardCvcElement', () => {
      render(<CheckoutForm {...defaultProps} />);

      expect(screen.getByTestId('card-number-element')).toBeInTheDocument();
      expect(screen.getByTestId('card-expiry-element')).toBeInTheDocument();
      expect(screen.getByTestId('card-cvc-element')).toBeInTheDocument();
    });

    it('keeps cardholder name as standard React input', () => {
      render(<CheckoutForm {...defaultProps} />);

      const nameInput = screen.getByLabelText(/cardholder name/i);
      expect(nameInput.tagName).toBe('INPUT');
      expect(nameInput).toHaveAttribute('type', 'text');
    });
  });

  describe('Card Brand Detection', () => {
    it('updates card brand icon on Stripe element change event', () => {
      render(<CheckoutForm {...defaultProps} />);

      // Trigger brand change via Stripe onChange handler
      act(() => {
        elementChangeHandlers.cardNumber?.({
          brand: 'visa',
          complete: false,
          empty: false,
          error: undefined,
          elementType: 'cardNumber',
        });
      });

      const brandIcon = screen.getByTestId('card-brand-icon');
      expect(brandIcon).toHaveAttribute('title', 'Visa');
    });
  });

  describe('Order Summary', () => {
    it('shows plan name', () => {
      render(<CheckoutForm {...defaultProps} />);
      expect(screen.getByText('Professional')).toBeInTheDocument();
    });

    it('displays correct monthly price', () => {
      render(<CheckoutForm {...defaultProps} billingCycle="monthly" />);
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

    it('shows non-round price correctly', () => {
      // 4999 cents → toFixed(0) rounds to £50
      render(<CheckoutForm {...defaultProps} priceMonthly={4999} billingCycle="monthly" />);
      const priceElements = screen.getAllByText(/£50/);
      expect(priceElements.length).toBeGreaterThanOrEqual(1);
    });

    it('shows tax placeholder row', () => {
      render(<CheckoutForm {...defaultProps} />);
      expect(screen.getByText('Tax')).toBeInTheDocument();
      expect(screen.getByText('Calculated at payment')).toBeInTheDocument();
    });
  });

  describe('Cardholder Name Validation', () => {
    it('shows error for empty name on blur', async () => {
      const user = userEvent.setup();
      render(<CheckoutForm {...defaultProps} />);

      const input = screen.getByLabelText(/cardholder name/i);
      await user.click(input);
      fireEvent.blur(input);

      await waitFor(() => {
        expect(screen.getByText(/cardholder name is required/i)).toBeInTheDocument();
      });
    });

    it('clears name error when user types', async () => {
      const user = userEvent.setup();
      render(<CheckoutForm {...defaultProps} />);

      const input = screen.getByLabelText(/cardholder name/i);
      await user.click(input);
      fireEvent.blur(input);

      await waitFor(() => {
        expect(screen.getByText(/cardholder name is required/i)).toBeInTheDocument();
      });

      await user.type(input, 'John Doe');

      await waitFor(() => {
        expect(screen.queryByText(/cardholder name is required/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Element Error Display', () => {
    it('displays card number error from Stripe element', () => {
      render(<CheckoutForm {...defaultProps} />);

      act(() => {
        elementChangeHandlers.cardNumber?.({
          brand: 'unknown',
          complete: false,
          empty: false,
          error: { message: 'Your card number is incomplete.' },
          elementType: 'cardNumber',
        });
      });

      expect(screen.getByText('Your card number is incomplete.')).toBeInTheDocument();
    });

    it('displays expiry error from Stripe element', () => {
      render(<CheckoutForm {...defaultProps} />);

      act(() => {
        elementChangeHandlers.cardExpiry?.({
          complete: false,
          empty: false,
          error: { message: "Your card's expiration date is incomplete." },
          elementType: 'cardExpiry',
        });
      });

      expect(screen.getByText("Your card's expiration date is incomplete.")).toBeInTheDocument();
    });

    it('displays CVC error from Stripe element', () => {
      render(<CheckoutForm {...defaultProps} />);

      act(() => {
        elementChangeHandlers.cardCvc?.({
          complete: false,
          empty: false,
          error: { message: "Your card's security code is incomplete." },
          elementType: 'cardCvc',
        });
      });

      expect(screen.getByText("Your card's security code is incomplete.")).toBeInTheDocument();
    });

    it('error paragraphs have role="alert"', () => {
      render(<CheckoutForm {...defaultProps} />);

      act(() => {
        elementChangeHandlers.cardNumber?.({
          brand: 'unknown',
          complete: false,
          empty: false,
          error: { message: 'Your card number is incomplete.' },
          elementType: 'cardNumber',
        });
      });

      const errorParagraph = screen.getByText('Your card number is incomplete.');
      expect(errorParagraph).toHaveAttribute('role', 'alert');
    });
  });

  describe('Form Submission - Validation', () => {
    it('validates cardholder name before submitting', async () => {
      const user = userEvent.setup();
      render(<CheckoutForm {...defaultProps} />);

      // Submit without filling name
      await user.click(screen.getByRole('button', { name: /subscribe/i }));

      await waitFor(() => {
        expect(screen.getByText(/cardholder name is required/i)).toBeInTheDocument();
      });

      expect(mockCreatePaymentMethod).not.toHaveBeenCalled();
    });
  });

  describe('Form Submission - Success', () => {
    it('calls stripe.createPaymentMethod then mutation', async () => {
      const onSuccess = vi.fn();
      const user = userEvent.setup();

      render(<CheckoutForm {...defaultProps} onSuccess={onSuccess} />);

      // Fill in name (only standard input — Stripe Elements are mocked)
      await user.type(screen.getByLabelText(/cardholder name/i), 'John Doe');
      await user.click(screen.getByRole('button', { name: /subscribe/i }));

      await waitFor(() => {
        expect(mockCreatePaymentMethod).toHaveBeenCalledWith({
          type: 'card',
          card: mockCardElement,
          billing_details: { name: 'John Doe' },
        });
      });

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({
          planId: 'professional',
          billingCycle: 'monthly',
          paymentMethodId: 'pm_test_123',
        });
      });

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith('sub_new_123');
      });
    });

    it('passes annual billingCycle when selected', async () => {
      const user = userEvent.setup();

      render(<CheckoutForm {...defaultProps} billingCycle="annual" />);

      await user.type(screen.getByLabelText(/cardholder name/i), 'John Doe');
      await user.click(screen.getByRole('button', { name: /subscribe/i }));

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            billingCycle: 'annual',
          })
        );
      });
    });
  });

  describe('Form Submission - 3D Secure', () => {
    it('calls confirmCardPayment when requires_action returned', async () => {
      mockMutateAsync.mockResolvedValue({
        subscriptionId: 'sub_3ds_123',
        status: 'incomplete',
        clientSecret: 'pi_secret_123',
        currentPeriodEnd: new Date(),
      });
      mockConfirmCardPayment.mockResolvedValue({ error: undefined });

      const onSuccess = vi.fn();
      const user = userEvent.setup();

      render(<CheckoutForm {...defaultProps} onSuccess={onSuccess} />);

      await user.type(screen.getByLabelText(/cardholder name/i), 'John Doe');
      await user.click(screen.getByRole('button', { name: /subscribe/i }));

      await waitFor(() => {
        expect(mockConfirmCardPayment).toHaveBeenCalledWith('pi_secret_123');
      });

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith('sub_3ds_123');
      });
    });

    it('shows error when 3D Secure confirmation fails', async () => {
      mockMutateAsync.mockResolvedValue({
        subscriptionId: 'sub_3ds_fail',
        status: 'incomplete',
        clientSecret: 'pi_secret_fail',
        currentPeriodEnd: new Date(),
      });
      mockConfirmCardPayment.mockResolvedValue({
        error: { type: 'card_error', code: 'card_declined', decline_code: null },
      });

      const onError = vi.fn();
      const user = userEvent.setup();

      render(<CheckoutForm {...defaultProps} onError={onError} />);

      await user.type(screen.getByLabelText(/cardholder name/i), 'John Doe');
      await user.click(screen.getByRole('button', { name: /subscribe/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      expect(onError).toHaveBeenCalled();
    });
  });

  describe('Form Submission - Error Handling', () => {
    it('shows error when createPaymentMethod fails', async () => {
      mockCreatePaymentMethod.mockResolvedValue({
        error: { code: 'card_declined', decline_code: 'insufficient_funds' },
      });
      const onError = vi.fn();
      const user = userEvent.setup();

      render(<CheckoutForm {...defaultProps} onError={onError} />);

      await user.type(screen.getByLabelText(/cardholder name/i), 'John Doe');
      await user.click(screen.getByRole('button', { name: /subscribe/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      expect(onError).toHaveBeenCalled();
      // Should NOT call mutation
      expect(mockMutateAsync).not.toHaveBeenCalled();
    });

    it('shows error when mutation throws', async () => {
      mockMutateAsync.mockRejectedValue(new Error('Network error'));
      const onError = vi.fn();
      const user = userEvent.setup();

      render(<CheckoutForm {...defaultProps} onError={onError} />);

      await user.type(screen.getByLabelText(/cardholder name/i), 'John Doe');
      await user.click(screen.getByRole('button', { name: /subscribe/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      expect(onError).toHaveBeenCalled();
    });

    it('shows generic error for non-Error exceptions', async () => {
      mockMutateAsync.mockRejectedValue('unknown');
      const user = userEvent.setup();

      render(<CheckoutForm {...defaultProps} />);

      await user.type(screen.getByLabelText(/cardholder name/i), 'John Doe');
      await user.click(screen.getByRole('button', { name: /subscribe/i }));

      await waitFor(() => {
        expect(screen.getByText(/unexpected error/i)).toBeInTheDocument();
      });
    });

    it('clears form error on new submission attempt', async () => {
      mockMutateAsync.mockRejectedValueOnce(new Error('fail'));
      const user = userEvent.setup();

      render(<CheckoutForm {...defaultProps} />);

      await user.type(screen.getByLabelText(/cardholder name/i), 'John Doe');
      await user.click(screen.getByRole('button', { name: /subscribe/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      // Second attempt - error should clear when submitting again
      mockMutateAsync.mockResolvedValueOnce({
        subscriptionId: 'sub_retry',
        status: 'active',
        currentPeriodEnd: new Date(),
      });

      await user.click(screen.getByRole('button', { name: /subscribe/i }));

      await waitFor(() => {
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      });
    });
  });

  describe('Disabled State During Submission', () => {
    it('shows Processing text during submission', async () => {
      mockMutateAsync.mockImplementation(() => new Promise(() => {})); // never resolves
      const user = userEvent.setup();

      render(<CheckoutForm {...defaultProps} />);

      await user.type(screen.getByLabelText(/cardholder name/i), 'John Doe');
      await user.click(screen.getByRole('button', { name: /subscribe/i }));

      await waitFor(() => {
        expect(screen.getByText('Processing...')).toBeInTheDocument();
      });
    });

    it('disables submit button during submission', async () => {
      mockMutateAsync.mockImplementation(() => new Promise(() => {}));
      const user = userEvent.setup();

      render(<CheckoutForm {...defaultProps} />);

      await user.type(screen.getByLabelText(/cardholder name/i), 'John Doe');
      await user.click(screen.getByRole('button', { name: /subscribe/i }));

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeDisabled();
      });
    });

    it('disables cardholder name input during submission', async () => {
      mockMutateAsync.mockImplementation(() => new Promise(() => {}));
      const user = userEvent.setup();

      render(<CheckoutForm {...defaultProps} />);

      await user.type(screen.getByLabelText(/cardholder name/i), 'John Doe');
      await user.click(screen.getByRole('button', { name: /subscribe/i }));

      await waitFor(() => {
        expect(screen.getByLabelText(/cardholder name/i)).toBeDisabled();
      });
    });
  });

  describe('Accessibility', () => {
    it('has form aria-label', () => {
      render(<CheckoutForm {...defaultProps} />);
      expect(screen.getByRole('form', { name: /checkout form/i })).toBeInTheDocument();
    });

    it('renders security indicator', () => {
      render(<CheckoutForm {...defaultProps} />);
      expect(screen.getByText(/secure payment/i)).toBeInTheDocument();
    });

    it('shows card brand icon', () => {
      render(<CheckoutForm {...defaultProps} />);
      expect(screen.getByTestId('card-brand-icon')).toBeInTheDocument();
    });

    it('sets aria-invalid on cardholder name when errored', async () => {
      const user = userEvent.setup();
      render(<CheckoutForm {...defaultProps} />);

      const nameInput = screen.getByLabelText(/cardholder name/i);
      await user.click(nameInput);
      fireEvent.blur(nameInput);

      await waitFor(() => {
        expect(nameInput).toHaveAttribute('aria-invalid', 'true');
      });
    });

    it('links cardholder name to error via aria-describedby', async () => {
      const user = userEvent.setup();
      render(<CheckoutForm {...defaultProps} />);

      const nameInput = screen.getByLabelText(/cardholder name/i);
      await user.click(nameInput);
      fireEvent.blur(nameInput);

      await waitFor(() => {
        const describedBy = nameInput.getAttribute('aria-describedby');
        expect(describedBy).toBeTruthy();
        const errorElement = document.getElementById(describedBy!);
        expect(errorElement).toHaveTextContent(/cardholder name is required/i);
      });
    });
  });
});
