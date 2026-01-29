'use client';

/**
 * Checkout Form Component
 *
 * IMPLEMENTS: PG-026 (Checkout)
 *
 * A payment form for subscription checkout with:
 * - Card number input with formatting and brand detection
 * - Expiry date and CVC inputs
 * - Cardholder name input
 * - Order summary
 * - Real-time validation
 * - Accessible error handling
 */

import { useState, useCallback, useId } from 'react';
import { cn } from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';
import {
  formatCardNumber,
  formatExpiry,
  detectCardBrand,
  validateCardDetails,
  getPaymentErrorMessage,
  type CardDetails,
  type CardValidationResult,
} from '@/lib/billing/payment-processor';
import type { BillingCycle, CardBrand } from '@intelliflow/validators';

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

interface FormState {
  cardNumber: string;
  expiry: string;
  cvc: string;
  name: string;
}

interface FormErrors {
  cardNumber?: string;
  expiry?: string;
  cvc?: string;
  name?: string;
  form?: string;
}

type FormField = keyof Omit<FormState, 'form'>;

// ============================================
// Card Brand Icons
// ============================================

const CARD_BRAND_ICONS: Record<CardBrand, string> = {
  visa: 'credit_card',
  mastercard: 'credit_card',
  amex: 'credit_card',
  discover: 'credit_card',
  diners: 'credit_card',
  jcb: 'credit_card',
  unionpay: 'credit_card',
  unknown: 'credit_card',
};

const CARD_BRAND_LABELS: Record<CardBrand, string> = {
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
}: CheckoutFormProps) {
  const formId = useId();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // tRPC mutation for creating checkout subscription
  const createCheckoutMutation = trpc.billing.createCheckoutSubscription.useMutation();
  const [formState, setFormState] = useState<FormState>({
    cardNumber: '',
    expiry: '',
    cvc: '',
    name: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<FormField, boolean>>({
    cardNumber: false,
    expiry: false,
    cvc: false,
    name: false,
  });

  const cardBrand = detectCardBrand(formState.cardNumber);
  const displayPrice = billingCycle === 'monthly' ? priceMonthly : priceAnnual;
  const priceFormatted = `£${(displayPrice / 100).toFixed(0)}`;
  const periodLabel = billingCycle === 'monthly' ? '/month' : '/year';

  // ============================================
  // Handlers
  // ============================================

  const handleInputChange = useCallback(
    (field: FormField) => (e: React.ChangeEvent<HTMLInputElement>) => {
      let value = e.target.value;

      // Apply formatting
      if (field === 'cardNumber') {
        value = formatCardNumber(value);
      } else if (field === 'expiry') {
        value = formatExpiry(value);
      } else if (field === 'cvc') {
        // Only allow digits, max 4 for Amex
        value = value.replace(/\D/g, '').slice(0, cardBrand === 'amex' ? 4 : 3);
      }

      setFormState((prev) => ({ ...prev, [field]: value }));

      // Clear error when user starts typing
      if (errors[field]) {
        setErrors((prev) => ({ ...prev, [field]: undefined }));
      }
    },
    [cardBrand, errors]
  );

  const handleBlur = useCallback(
    (field: FormField) => () => {
      setTouched((prev) => ({ ...prev, [field]: true }));

      // Validate single field
      const cardDetails: CardDetails = {
        number: formState.cardNumber,
        expiry: formState.expiry,
        cvc: formState.cvc,
        name: formState.name,
      };

      const result = validateCardDetails(cardDetails);
      // Map CardValidationResult field names to FormErrors field names
      const fieldMap: Record<FormField, keyof typeof result.errors> = {
        cardNumber: 'number',
        expiry: 'expiry',
        cvc: 'cvc',
        name: 'name',
      };
      const errorKey = fieldMap[field];
      if (result.errors[errorKey]) {
        setErrors((prev) => ({ ...prev, [field]: result.errors[errorKey] }));
      }
    },
    [formState]
  );

  const validateForm = useCallback((): CardValidationResult => {
    const cardDetails: CardDetails = {
      number: formState.cardNumber,
      expiry: formState.expiry,
      cvc: formState.cvc,
      name: formState.name,
    };

    const result = validateCardDetails(cardDetails);
    // Map error keys from CardValidationResult to FormErrors
    const mappedErrors: FormErrors = {
      cardNumber: result.errors.number,
      expiry: result.errors.expiry,
      cvc: result.errors.cvc,
      name: result.errors.name,
    };
    setErrors(mappedErrors);
    setTouched({
      cardNumber: true,
      expiry: true,
      cvc: true,
      name: true,
    });

    return result;
  }, [formState]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate form
    const validation = validateForm();
    if (!validation.valid) {
      return;
    }

    setIsSubmitting(true);
    setErrors((prev) => ({ ...prev, form: undefined }));

    try {
      // In real implementation, we would:
      // 1. Create payment method via Stripe.js
      // 2. Call tRPC endpoint with payment method ID
      // For now, simulate with mock payment method ID
      const mockPaymentMethodId = `pm_${Date.now()}`;

      const result = await createCheckoutMutation.mutateAsync({
        planId,
        billingCycle,
        paymentMethodId: mockPaymentMethodId,
      });

      onSuccess?.(result.subscriptionId);
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? getPaymentErrorMessage('PROCESSING_ERROR')
          : 'An unexpected error occurred';
      setErrors((prev) => ({ ...prev, form: errorMessage }));
      onError?.(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ============================================
  // Render
  // ============================================

  return (
    <form
      onSubmit={handleSubmit}
      className={cn('space-y-6', className)}
      aria-label="Checkout form"
    >
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
      </div>

      {/* Form Error */}
      {errors.form && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              error
            </span>
            {errors.form}
          </div>
        </div>
      )}

      {/* Card Number */}
      <div className="space-y-2">
        <label
          htmlFor={`${formId}-card-number`}
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          Card Number
        </label>
        <div className="relative">
          <input
            id={`${formId}-card-number`}
            type="text"
            inputMode="numeric"
            autoComplete="cc-number"
            placeholder="4242 4242 4242 4242"
            value={formState.cardNumber}
            onChange={handleInputChange('cardNumber')}
            onBlur={handleBlur('cardNumber')}
            disabled={isSubmitting}
            aria-invalid={touched.cardNumber && !!errors.cardNumber}
            aria-describedby={errors.cardNumber ? `${formId}-card-number-error` : undefined}
            className={cn(
              'flex h-10 w-full rounded-md border bg-background px-3 py-2 pr-12 text-sm ring-offset-background',
              'placeholder:text-muted-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50',
              touched.cardNumber && errors.cardNumber
                ? 'border-destructive'
                : 'border-input'
            )}
          />
          <div
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            data-testid="card-brand-icon"
            title={CARD_BRAND_LABELS[cardBrand]}
          >
            <span className="material-symbols-outlined text-xl" aria-hidden="true">
              {CARD_BRAND_ICONS[cardBrand]}
            </span>
          </div>
        </div>
        {touched.cardNumber && errors.cardNumber && (
          <p
            id={`${formId}-card-number-error`}
            className="text-sm text-destructive"
            role="alert"
          >
            {errors.cardNumber}
          </p>
        )}
      </div>

      {/* Expiry and CVC */}
      <div className="grid grid-cols-2 gap-4">
        {/* Expiry */}
        <div className="space-y-2">
          <label
            htmlFor={`${formId}-expiry`}
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            Expiry Date
          </label>
          <input
            id={`${formId}-expiry`}
            type="text"
            inputMode="numeric"
            autoComplete="cc-exp"
            placeholder="MM/YY"
            value={formState.expiry}
            onChange={handleInputChange('expiry')}
            onBlur={handleBlur('expiry')}
            disabled={isSubmitting}
            aria-invalid={touched.expiry && !!errors.expiry}
            aria-describedby={errors.expiry ? `${formId}-expiry-error` : undefined}
            className={cn(
              'flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background',
              'placeholder:text-muted-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50',
              touched.expiry && errors.expiry ? 'border-destructive' : 'border-input'
            )}
          />
          {touched.expiry && errors.expiry && (
            <p
              id={`${formId}-expiry-error`}
              className="text-sm text-destructive"
              role="alert"
            >
              {errors.expiry}
            </p>
          )}
        </div>

        {/* CVC */}
        <div className="space-y-2">
          <label
            htmlFor={`${formId}-cvc`}
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            CVC
          </label>
          <input
            id={`${formId}-cvc`}
            type="password"
            inputMode="numeric"
            autoComplete="cc-csc"
            placeholder={cardBrand === 'amex' ? '1234' : '123'}
            value={formState.cvc}
            onChange={handleInputChange('cvc')}
            onBlur={handleBlur('cvc')}
            disabled={isSubmitting}
            aria-invalid={touched.cvc && !!errors.cvc}
            aria-describedby={errors.cvc ? `${formId}-cvc-error` : undefined}
            className={cn(
              'flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background',
              'placeholder:text-muted-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50',
              touched.cvc && errors.cvc ? 'border-destructive' : 'border-input'
            )}
          />
          {touched.cvc && errors.cvc && (
            <p id={`${formId}-cvc-error`} className="text-sm text-destructive" role="alert">
              {errors.cvc}
            </p>
          )}
        </div>
      </div>

      {/* Cardholder Name */}
      <div className="space-y-2">
        <label
          htmlFor={`${formId}-name`}
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          Cardholder Name
        </label>
        <input
          id={`${formId}-name`}
          type="text"
          autoComplete="cc-name"
          placeholder="John Doe"
          value={formState.name}
          onChange={handleInputChange('name')}
          onBlur={handleBlur('name')}
          disabled={isSubmitting}
          aria-invalid={touched.name && !!errors.name}
          aria-describedby={errors.name ? `${formId}-name-error` : undefined}
          className={cn(
            'flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background',
            'placeholder:text-muted-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
            touched.name && errors.name ? 'border-destructive' : 'border-input'
          )}
        />
        {touched.name && errors.name && (
          <p id={`${formId}-name-error`} className="text-sm text-destructive" role="alert">
            {errors.name}
          </p>
        )}
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isSubmitting}
        className={cn(
          'flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground',
          'transition-colors hover:bg-primary/90',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50'
        )}
      >
        {isSubmitting ? (
          <>
            <span
              className="material-symbols-outlined animate-spin text-lg"
              aria-hidden="true"
            >
              progress_activity
            </span>
            Processing...
          </>
        ) : (
          <>
            <span className="material-symbols-outlined text-lg" aria-hidden="true">
              lock
            </span>
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
