/**
 * @vitest-environment jsdom
 */
/**
 * Checkout promotion code (#1220): the optional code a customer types, such as a
 * founding-customer discount, reaches the server, and a refused code says why.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CheckoutFormProps } from '../checkout-form';

const mockMutateAsync = vi.hoisted(() => vi.fn());
const mockCreatePaymentMethod = vi.hoisted(() => vi.fn());

vi.mock('@stripe/react-stripe-js', async () => {
  const React = await import('react');
  return {
    CardNumberElement: () => React.createElement('div', { 'data-testid': 'card-number-element' }),
    CardExpiryElement: () => React.createElement('div', { 'data-testid': 'card-expiry-element' }),
    CardCvcElement: () => React.createElement('div', { 'data-testid': 'card-cvc-element' }),
    useStripe: () => ({
      createPaymentMethod: mockCreatePaymentMethod,
      confirmCardPayment: vi.fn(),
    }),
    useElements: () => ({ getElement: () => ({ _type: 'CardNumberElement' }) }),
  };
});

vi.mock('@/lib/trpc', () => ({
  trpc: {
    billing: {
      createCheckoutSubscription: {
        useMutation: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
      },
    },
  },
}));

vi.mock('@intelliflow/ui', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

vi.mock('@/lib/billing/payment-processor', () => ({
  getPaymentErrorMessage: () => 'Payment processing failed. Please try again.',
}));

import { INVALID_PROMOTION_CODE_MESSAGE } from '@intelliflow/validators';
import { CheckoutForm } from '../checkout-form';

const props: CheckoutFormProps = {
  planId: 'professional',
  planName: 'Professional',
  priceMonthly: 7900,
  priceAnnual: 78000,
  billingCycle: 'monthly',
};

async function submit(code?: string) {
  const user = userEvent.setup();
  render(<CheckoutForm {...props} />);
  await user.type(screen.getByLabelText(/cardholder name/i), 'Ada Lovelace');
  if (code !== undefined) await user.type(screen.getByLabelText(/promotion code/i), code);
  await user.click(screen.getByRole('button', { name: /subscribe/i }));
}

describe('CheckoutForm — promotion code (#1220)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreatePaymentMethod.mockResolvedValue({ paymentMethod: { id: 'pm_test_123' } });
    mockMutateAsync.mockResolvedValue({
      subscriptionId: 'sub_1',
      status: 'active',
      currentPeriodEnd: new Date(),
    });
  });

  it('offers an optional promotion code field', () => {
    render(<CheckoutForm {...props} />);
    const field = screen.getByLabelText(/promotion code/i);
    expect(field).toHaveAttribute('type', 'text');
    expect(field).toHaveAttribute('maxLength', '64');
    expect(screen.getByText('(optional)')).toBeInTheDocument();
  });

  it('sends the typed code, trimmed, with the subscription', async () => {
    await submit('  FOUNDING100 ');

    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ paymentMethodId: 'pm_test_123', promotionCode: 'FOUNDING100' })
      )
    );
  });

  it('sends no code when the field is left empty', async () => {
    await submit();

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());
    expect(mockMutateAsync.mock.calls[0][0].promotionCode).toBeUndefined();
  });

  it('says the code is not valid, instead of a generic payment error', async () => {
    mockMutateAsync.mockRejectedValue(new Error(INVALID_PROMOTION_CODE_MESSAGE));

    await submit('NOPE');

    expect(await screen.findByRole('alert')).toHaveTextContent(INVALID_PROMOTION_CODE_MESSAGE);
  });

  it('keeps the generic message for other failures', async () => {
    mockMutateAsync.mockRejectedValue(new Error('card network down'));

    await submit('FOUNDING100');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Payment processing failed. Please try again.'
    );
  });

  it.each(['FOUND ING', 'founding.100', 'café'])(
    'says %j is not a valid code before touching the card',
    async (code) => {
      await submit(code);

      expect(await screen.findByRole('alert')).toHaveTextContent(INVALID_PROMOTION_CODE_MESSAGE);
      expect(mockCreatePaymentMethod).not.toHaveBeenCalled();
      expect(mockMutateAsync).not.toHaveBeenCalled();
    }
  );
});
