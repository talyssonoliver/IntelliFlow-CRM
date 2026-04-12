'use client';

/**
 * Checkout Form Component
 *
 * IMPLEMENTS: PG-026 (Checkout)
 *
 * PCI-compliant payment form using Stripe Elements iFrames:
 * - CardNumberElement, CardExpiryElement, CardCvcElement (split Elements)
 * - Cardholder name as standard React input (not PCI scope)
 * - 3D Secure / SCA support via confirmCardPayment
 * - Stripe error code propagation with user-friendly messages
 * - Accessible: aria-invalid, aria-describedby, role="alert"
 */

import { useState, useCallback, useId, useRef } from 'react';
import {
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import type {
  StripeCardNumberElement,
  StripeCardNumberElementChangeEvent,
} from '@stripe/stripe-js';
import { cn } from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';
import { getPaymentErrorMessage } from '@/lib/billing/payment-processor';
import type { BillingCycle } from '@intelliflow/validators';

// ============================================
// Types
// ============================================

export interface CheckoutFormProps {
  planId: string;
  planName: string;
  priceMonthly: number;
  priceAnnual: number;
  billingCycle: BillingCycle;
  onSuccess?: (subscriptionId: string) => void;
  onError?: (error: string) => void;
  className?: string;
}

interface ElementErrors {
  cardNumber?: string;
  cardExpiry?: string;
  cardCvc?: string;
}

// ============================================
// Card Brand Labels
// ============================================

const CARD_BRAND_LABELS: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'Amex',
  discover: 'Discover',
  diners: 'Diners',
  jcb: 'JCB',
  unionpay: 'UnionPay',
  unknown: 'Card',
};

// ============================================
// Stripe Element Styling
// ============================================

const ELEMENT_STYLE = {
  base: {
    fontSize: '14px',
    color: 'hsl(var(--foreground))',
    '::placeholder': {
      color: 'hsl(var(--muted-foreground))',
    },
  },
  invalid: {
    color: 'hsl(var(--destructive))',
  },
};

// ============================================
// Component
// ============================================

export function CheckoutForm({
  planId,
  planName,
  priceMonthly,
  priceAnnual,
  billingCycle,
  onSuccess,
  onError,
  className,
}: Readonly<CheckoutFormProps>) {
  const formId = useId();
  const stripe = useStripe();
  const elements = useElements();
  const cardNumberRef = useRef<StripeCardNumberElement | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();
  const [nameTouched, setNameTouched] = useState(false);
  const [formError, setFormError] = useState<string | undefined>();
  const [elementErrors, setElementErrors] = useState<ElementErrors>({});
  const [cardBrand, setCardBrand] = useState<string>('unknown');

  const createCheckoutMutation = trpc.billing.createCheckoutSubscription.useMutation();

  const displayPrice = billingCycle === 'monthly' ? priceMonthly : priceAnnual;
  const priceFormatted = `£${(displayPrice / 100).toFixed(0)}`;
  const periodLabel = billingCycle === 'monthly' ? '/month' : '/year';

  // ============================================
  // Handlers
  // ============================================

  const handleCardNumberChange = useCallback((event: StripeCardNumberElementChangeEvent) => {
    if (event.brand) {
      setCardBrand(event.brand);
    }
    setElementErrors((prev) => ({
      ...prev,
      cardNumber: event.error?.message,
    }));
  }, []);

  const handleCardExpiryChange = useCallback((event: { error?: { message: string } }) => {
    setElementErrors((prev) => ({
      ...prev,
      cardExpiry: event.error?.message,
    }));
  }, []);

  const handleCardCvcChange = useCallback((event: { error?: { message: string } }) => {
    setElementErrors((prev) => ({
      ...prev,
      cardCvc: event.error?.message,
    }));
  }, []);

  const handleNameBlur = useCallback(() => {
    setNameTouched(true);
    if (name.trim()) {
      setNameError(undefined);
    } else {
      setNameError('Cardholder name is required');
    }
  }, [name]);

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    // Validate cardholder name
    if (!name.trim()) {
      setNameTouched(true);
      setNameError('Cardholder name is required');
      return;
    }

    setIsSubmitting(true);
    setFormError(undefined);

    try {
      // Step 1: Create payment method via Stripe.js
      const cardElement = elements.getElement(CardNumberElement);
      if (!cardElement) {
        throw new Error('Card element not found');
      }

      const { error: pmError, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
        billing_details: { name: name.trim() },
      });

      if (pmError) {
        const errorMessage = getPaymentErrorMessage(
          pmError.code || 'PROCESSING_ERROR',
          pmError.decline_code ?? undefined
        );
        setFormError(errorMessage);
        onError?.(errorMessage);
        return;
      }

      // Step 2: Create subscription via backend
      const result = await createCheckoutMutation.mutateAsync({
        planId,
        billingCycle,
        paymentMethodId: paymentMethod.id,
      });

      // Step 3: Handle 3D Secure if needed (Stripe returns 'incomplete' status when SCA is required)
      if (result.status === 'incomplete' && result.clientSecret) {
        const { error: confirmError } = await stripe.confirmCardPayment(result.clientSecret);
        if (confirmError) {
          const errorMessage = getPaymentErrorMessage(
            'THREE_D_SECURE_FAILED',
            confirmError.decline_code ?? undefined
          );
          setFormError(errorMessage);
          onError?.(errorMessage);
          return;
        }
      }

      // Step 4: Success
      onSuccess?.(result.subscriptionId);
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? getPaymentErrorMessage((error as { code?: string }).code || 'PROCESSING_ERROR')
          : 'An unexpected error occurred';
      setFormError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ============================================
  // Render
  // ============================================

  const elementClasses = cn(
    'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background',
    'focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
    isSubmitting && 'cursor-not-allowed opacity-50'
  );

  return (
    <form onSubmit={handleSubmit} className={cn('space-y-6', className)} aria-label="Checkout form">
      {/* Order Summary */}
      <div className="rounded-lg border border-border bg-muted/50 p-4">
        <h3 className="text-sm font-medium text-muted-foreground">Order Summary</h3>
        <div className="mt-2 flex items-baseline justify-between">
          <span className="text-lg font-semibold">{planName}</span>
          <span className="text-lg font-bold">
            {priceFormatted}
            <span className="text-sm font-normal text-muted-foreground">{periodLabel}</span>
          </span>
        </div>
        <div className="mt-2 flex items-baseline justify-between border-t border-border pt-2">
          <span className="text-sm text-muted-foreground">Tax</span>
          <span className="text-sm text-muted-foreground">Calculated at payment</span>
        </div>
      </div>

      {/* Form Error */}
      {formError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              error
            </span>
            {formError}
          </div>
        </div>
      )}

      {/* Card Number — Stripe Element */}
      <div className="space-y-2">
        <label htmlFor={`${formId}-card-number`} className="text-sm font-medium leading-none">
          Card Number
        </label>
        <div className="relative">
          <div
            id={`${formId}-card-number`}
            className={cn(elementClasses, elementErrors.cardNumber && 'border-destructive')}
            aria-invalid={!!elementErrors.cardNumber}
            aria-describedby={elementErrors.cardNumber ? `${formId}-card-number-error` : undefined}
          >
            <CardNumberElement
              options={{ style: ELEMENT_STYLE, disabled: isSubmitting }}
              onChange={handleCardNumberChange}
              onReady={(el) => {
                cardNumberRef.current = el;
              }}
            />
          </div>
          <div
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            data-testid="card-brand-icon"
            title={CARD_BRAND_LABELS[cardBrand] || 'Card'}
          >
            <span className="material-symbols-outlined text-xl" aria-hidden="true">
              credit_card
            </span>
          </div>
        </div>
        {elementErrors.cardNumber && (
          <p id={`${formId}-card-number-error`} className="text-sm text-destructive" role="alert">
            {elementErrors.cardNumber}
          </p>
        )}
      </div>

      {/* Expiry and CVC — Stripe Elements */}
      <div className="grid grid-cols-2 gap-4">
        {/* Expiry */}
        <div className="space-y-2">
          <label htmlFor={`${formId}-expiry`} className="text-sm font-medium leading-none">
            Expiry Date
          </label>
          <div
            id={`${formId}-expiry`}
            className={cn(elementClasses, elementErrors.cardExpiry && 'border-destructive')}
            aria-invalid={!!elementErrors.cardExpiry}
            aria-describedby={elementErrors.cardExpiry ? `${formId}-expiry-error` : undefined}
          >
            <CardExpiryElement
              options={{ style: ELEMENT_STYLE, disabled: isSubmitting }}
              onChange={handleCardExpiryChange}
            />
          </div>
          {elementErrors.cardExpiry && (
            <p id={`${formId}-expiry-error`} className="text-sm text-destructive" role="alert">
              {elementErrors.cardExpiry}
            </p>
          )}
        </div>

        {/* CVC */}
        <div className="space-y-2">
          <label htmlFor={`${formId}-cvc`} className="text-sm font-medium leading-none">
            CVC
          </label>
          <div
            id={`${formId}-cvc`}
            className={cn(elementClasses, elementErrors.cardCvc && 'border-destructive')}
            aria-invalid={!!elementErrors.cardCvc}
            aria-describedby={elementErrors.cardCvc ? `${formId}-cvc-error` : undefined}
          >
            <CardCvcElement
              options={{ style: ELEMENT_STYLE, disabled: isSubmitting }}
              onChange={handleCardCvcChange}
            />
          </div>
          {elementErrors.cardCvc && (
            <p id={`${formId}-cvc-error`} className="text-sm text-destructive" role="alert">
              {elementErrors.cardCvc}
            </p>
          )}
        </div>
      </div>

      {/* Cardholder Name — Standard React input (not PCI scope) */}
      <div className="space-y-2">
        <label htmlFor={`${formId}-name`} className="text-sm font-medium leading-none">
          Cardholder Name
        </label>
        <input
          id={`${formId}-name`}
          type="text"
          autoComplete="cc-name"
          inputMode="text"
          placeholder="John Doe"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (nameError) setNameError(undefined);
          }}
          onBlur={handleNameBlur}
          disabled={isSubmitting}
          aria-invalid={nameTouched && !!nameError}
          aria-describedby={nameError ? `${formId}-name-error` : undefined}
          className={cn(
            'flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background',
            'placeholder:text-muted-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
            nameTouched && nameError ? 'border-destructive' : 'border-input'
          )}
        />
        {nameTouched && nameError && (
          <p id={`${formId}-name-error`} className="text-sm text-destructive" role="alert">
            {nameError}
          </p>
        )}
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isSubmitting || !stripe}
        className={cn(
          'flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground',
          'transition-colors hover:bg-primary/90',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50'
        )}
      >
        {isSubmitting ? (
          <>
            <span className="material-symbols-outlined animate-spin text-lg" aria-hidden="true">
              progress_activity
            </span>{' '}
            Processing...
          </>
        ) : (
          <>
            <span className="material-symbols-outlined text-lg" aria-hidden="true">
              lock
            </span>{' '}
            Subscribe {priceFormatted}
            {periodLabel}
          </>
        )}
      </button>

      {/* Security Indicator */}
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <span className="material-symbols-outlined text-sm" aria-hidden="true">
          verified_user
        </span>
        <span>Secure payment - encrypted with SSL</span>
      </div>
    </form>
  );
}
