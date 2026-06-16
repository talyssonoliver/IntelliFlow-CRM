'use client';

/**
 * OnboardingWelcome
 *
 * Post-signup onboarding modal presented once to authenticated users whose
 * `onboarding.getState().completed === false`.  Covers both email-signup and
 * Google-OAuth paths (OAuth users land on "/" after callback — the modal fires
 * because `completed` is still false even though they skip /signup/success).
 *
 * Steps:
 *  1. Welcome / profile — greet by name, optional company/role fields, skippable.
 *  2. Choose your plan — 3 tiers from pricing-data.json with monthly/annual
 *     toggle.  If user picks paid + emailVerified === true  → Stripe card form.
 *     If user picks paid + emailVerified !== true → inline verify-first notice.
 *  3. Finish — calls `onboarding.complete({ selectedPlan? })` then closes.
 *
 * Accessibility:
 *  - <dialog> element (native focus-trap in modern browsers + VoiceOver/NVDA).
 *  - Keyboard: Escape closes; Tab cycles within dialog.
 *  - All live feedback via <output> (sonar-guard: no role="status").
 *  - Material Symbols Outlined icons (ADR-046 / PG-195; no lucide-react).
 *  - No role="dialog" — the native <dialog> element covers this.
 *
 * Stripe:
 *  - loadStripe is called lazily inside an <Elements> wrapper.
 *  - Paid-plan + verified path: CardNumberElement / CardExpiryElement /
 *    CardCvcElement → stripe.createPaymentMethod → createCheckoutSubscription
 *    → if status==='incomplete' && clientSecret → confirmCardPayment (3DS).
 *  - Publishable key: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.
 */

import { useState, useEffect, useCallback, useRef, type SyntheticEvent } from 'react';
import { usePathname } from 'next/navigation';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { cn } from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/lib/auth/AuthContext';
import { isProtectedAppRoute } from '@/lib/auth/route-protection';
import pricingData from '@/data/pricing-data.json';

// ============================================
// Constants
// ============================================

// sessionStorage flag: prevents re-open within a session if user dismissed
// without completing.  A permanent "don't show again" is handled server-side
// via onboarding.complete (getState returns completed:true on next load).
const ONBOARDING_DISMISSED_SESSION_FLAG = 'intelliflow_onboarding_session_dismissed';

// Lazy-initialise the Stripe promise once (not on every render).
// Key is read lazily so test stubs applied via vi.stubEnv() take effect.
// The promise is cached by key so switching publishable keys (e.g. in tests)
// always produces a new promise tied to the current key.
let _cachedStripeKey = '';
let stripePromise: ReturnType<typeof loadStripe> | null = null;
function getStripePromise() {
  const publishableKey = process.env['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'] ?? '';
  if (!publishableKey) return null;
  if (publishableKey !== _cachedStripeKey) {
    _cachedStripeKey = publishableKey;
    stripePromise = loadStripe(publishableKey);
  }
  return stripePromise;
}

// Only the 3 main paid tiers are shown in onboarding (exclude 'custom').
const ONBOARDING_TIERS = pricingData.tiers.filter((t) => t.id !== 'custom');

// Stripe Element base styling (matches the existing checkout-form palette).
const STRIPE_ELEMENT_STYLE = {
  base: {
    fontSize: '14px',
    color: 'hsl(var(--foreground))',
    '::placeholder': { color: 'hsl(var(--muted-foreground))' },
  },
  invalid: { color: 'hsl(var(--destructive))' },
};

// ============================================
// Types
// ============================================

type BillingCycle = 'monthly' | 'annual';
type OnboardingStep = 'welcome' | 'plan' | 'checkout' | 'success';

interface StripeCardFormProps {
  planId: string;
  planName: string;
  billingCycle: BillingCycle;
  priceMonthly: number;
  priceAnnual: number;
  onSuccess: (subscriptionId: string) => void;
  onCancel: () => void;
}

// ============================================
// Inner Stripe card form (rendered inside <Elements>)
// ============================================

function StripeCardForm({
  planId,
  planName,
  billingCycle,
  priceMonthly,
  priceAnnual,
  onSuccess,
  onCancel,
}: Readonly<StripeCardFormProps>) {
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | undefined>();
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [nameError, setNameError] = useState<string | undefined>();

  const createCheckoutMutation = trpc.billing.createCheckoutSubscription.useMutation();

  const displayPrice = billingCycle === 'monthly' ? priceMonthly : priceAnnual;
  const currencySymbol = pricingData.metadata.currencySymbol;
  const priceLabel = `${currencySymbol}${displayPrice}/${billingCycle === 'monthly' ? 'mo' : 'yr'}`;

  const handleSubmit = async (e: SyntheticEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    if (!name.trim()) {
      setNameTouched(true);
      setNameError('Cardholder name is required');
      return;
    }

    setIsSubmitting(true);
    setFormError(undefined);

    try {
      const cardEl = elements.getElement(CardNumberElement);
      if (!cardEl) throw new Error('Card element unavailable');

      const { error: pmError, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardEl,
        billing_details: { name: name.trim() },
      });

      if (pmError) {
        setFormError(pmError.message ?? 'Payment method creation failed');
        return;
      }

      const result = await createCheckoutMutation.mutateAsync({
        planId: planId.toUpperCase(),
        billingCycle,
        paymentMethodId: paymentMethod.id,
      });

      // Handle 3D Secure / SCA
      if (result.status === 'incomplete' && result.clientSecret) {
        const { error: confirmError } = await stripe.confirmCardPayment(result.clientSecret);
        if (confirmError) {
          setFormError(confirmError.message ?? '3D Secure authentication failed');
          return;
        }
      }

      onSuccess(result.subscriptionId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const elementClasses = cn(
    'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
    'focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
    isSubmitting && 'opacity-50 cursor-not-allowed'
  );

  return (
    <form onSubmit={handleSubmit} aria-label="Card payment form" className="space-y-4 mt-4">
      {/* Order summary */}
      <div className="rounded-lg border border-border bg-muted/50 p-3 text-sm">
        <div className="flex justify-between">
          <span className="font-medium">{planName}</span>
          <span className="font-bold">{priceLabel}</span>
        </div>
      </div>

      {/* Form error */}
      {formError && (
        <div
          role="alert"
          className="rounded border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              error
            </span>
            {formError}
          </div>
        </div>
      )}

      {/* Card Number */}
      <div className="space-y-1">
        <label htmlFor="ob-card-number" className="text-sm font-medium">
          Card Number
        </label>
        <div id="ob-card-number" className={elementClasses}>
          <CardNumberElement options={{ style: STRIPE_ELEMENT_STYLE, disabled: isSubmitting }} />
        </div>
      </div>

      {/* Expiry + CVC */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="ob-expiry" className="text-sm font-medium">
            Expiry
          </label>
          <div id="ob-expiry" className={elementClasses}>
            <CardExpiryElement options={{ style: STRIPE_ELEMENT_STYLE, disabled: isSubmitting }} />
          </div>
        </div>
        <div className="space-y-1">
          <label htmlFor="ob-cvc" className="text-sm font-medium">
            CVC
          </label>
          <div id="ob-cvc" className={elementClasses}>
            <CardCvcElement options={{ style: STRIPE_ELEMENT_STYLE, disabled: isSubmitting }} />
          </div>
        </div>
      </div>

      {/* Cardholder name */}
      <div className="space-y-1">
        <label htmlFor="ob-card-name" className="text-sm font-medium">
          Cardholder Name
        </label>
        <input
          id="ob-card-name"
          type="text"
          autoComplete="cc-name"
          placeholder="Jane Smith"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (nameError) setNameError(undefined);
          }}
          onBlur={() => {
            setNameTouched(true);
            if (!name.trim()) setNameError('Cardholder name is required');
          }}
          disabled={isSubmitting}
          aria-invalid={nameTouched && !!nameError}
          aria-describedby={nameTouched && nameError ? 'ob-card-name-error' : undefined}
          className={cn(
            'flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm',
            'placeholder:text-muted-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            nameTouched && nameError ? 'border-destructive' : 'border-input'
          )}
        />
        {nameTouched && nameError && (
          <p id="ob-card-name-error" className="text-sm text-destructive" role="alert">
            {nameError}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className={cn(
            'flex-1 rounded-md border border-border bg-background px-4 py-2.5 text-sm font-medium',
            'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          )}
        >
          Back
        </button>
        <button
          type="submit"
          disabled={isSubmitting || !stripe}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground',
            'hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          {isSubmitting ? (
            <>
              <span className="material-symbols-outlined animate-spin text-lg" aria-hidden="true">
                progress_activity
              </span>{' '}
              Processing&hellip;
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-lg" aria-hidden="true">
                lock
              </span>{' '}
              Subscribe {priceLabel}
            </>
          )}
        </button>
      </div>

      {/* Security note */}
      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <span className="material-symbols-outlined text-sm" aria-hidden="true">
          verified_user
        </span>{' '}
        Secure payment — encrypted with SSL
      </p>
    </form>
  );
}

// ============================================
// OnboardingWelcome — main modal
// ============================================

export function OnboardingWelcome() {
  const { isAuthenticated, isLoading: authLoading, user, emailVerified } = useAuth();
  const pathname = usePathname() ?? '/';

  // tRPC
  const { data: onboardingState, isLoading: onboardingLoading } = trpc.onboarding.getState.useQuery(
    undefined,
    {
      enabled: isAuthenticated && isProtectedAppRoute(pathname),
      staleTime: Infinity,
    }
  );

  const completeMutation = trpc.onboarding.complete.useMutation();

  // Local UI state
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [sessionDismissed, setSessionDismissed] = useState(false);
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Read session-dismiss flag (once, client-side)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setSessionDismissed(sessionStorage.getItem(ONBOARDING_DISMISSED_SESSION_FLAG) === '1');
    }
  }, []);

  // Show / hide the native <dialog>
  const shouldShow =
    !authLoading &&
    !onboardingLoading &&
    isAuthenticated &&
    isProtectedAppRoute(pathname) &&
    onboardingState?.completed === false &&
    !sessionDismissed;

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (shouldShow && !el.open) {
      el.showModal();
    } else if (!shouldShow && el.open) {
      el.close();
    }
  }, [shouldShow]);

  // Escape key handler (native <dialog> fires 'cancel' on Escape — catch it)
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const onCancel = (e: Event) => {
      e.preventDefault(); // prevent default close so we control the dismiss
      handleSkipAll();
    };
    el.addEventListener('cancel', onCancel);
    return () => el.removeEventListener('cancel', onCancel);
  });

  // ==========================================
  // Handlers
  // ==========================================

  const handleSkipAll = useCallback(() => {
    // Persist skip for this browser session — modal will not reappear until
    // the user reloads in a new session (or until onboarding.complete fires).
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(ONBOARDING_DISMISSED_SESSION_FLAG, '1');
    }
    setSessionDismissed(true);
    // Fire complete without a plan so the server marks onboarding done.
    completeMutation.mutate({});
  }, [completeMutation]);

  const handleContinueWelcome = useCallback(() => {
    setStep('plan');
  }, []);

  const handleSelectTier = useCallback(
    (tierId: string) => {
      setSelectedTierId(tierId);
      if (emailVerified === true) {
        setStep('checkout');
      }
      // If not verified, we stay on 'plan' step but show the inline notice.
    },
    [emailVerified]
  );

  const handleSkipPlan = useCallback(() => {
    completeMutation.mutate({});
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(ONBOARDING_DISMISSED_SESSION_FLAG, '1');
    }
    setSessionDismissed(true);
  }, [completeMutation]);

  const handleCheckoutSuccess = useCallback(
    (subscriptionId: string) => {
      void subscriptionId; // surfaced to parent if needed in future
      setCheckoutSuccess(true);
      setStep('success');
      completeMutation.mutate({ selectedPlan: selectedTierId ?? undefined });
    },
    [completeMutation, selectedTierId]
  );

  const handleSuccessClose = useCallback(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(ONBOARDING_DISMISSED_SESSION_FLAG, '1');
    }
    setSessionDismissed(true);
  }, []);

  // Escape is handled by the native <dialog> 'cancel' event (registered in
  // the useEffect above).  No separate handleKeyDown is needed.

  // ==========================================
  // Step content
  // ==========================================

  const selectedTier = ONBOARDING_TIERS.find((t) => t.id === selectedTierId);
  const showUnverifiedNotice = step === 'plan' && selectedTierId !== null && emailVerified !== true;

  const firstName = user?.name ? user.name.split(' ')[0] : 'there';

  // ==========================================
  // Stripe wrapper (lazy, only when needed)
  // ==========================================

  const stripeJsPromise = step === 'checkout' ? getStripePromise() : null;

  return (
    <dialog
      ref={dialogRef}
      aria-modal="true"
      aria-label="Welcome to IntelliFlow CRM"
      data-testid="onboarding-dialog"
      className={cn(
        'fixed inset-0 m-auto w-full max-w-xl rounded-xl border border-border bg-background shadow-2xl',
        'p-0 backdrop:bg-black/50 open:flex open:flex-col',
        // Ensure it sits above nav/banners (z-[200])
        'z-[200]'
      )}
    >
      {/* ---- Step: Welcome ---- */}
      {step === 'welcome' && (
        <section aria-label="Welcome step" className="flex flex-col gap-6 p-8">
          {/* Dismiss */}
          <button
            type="button"
            onClick={handleSkipAll}
            aria-label="Skip onboarding"
            className="absolute right-4 top-4 rounded-sm p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="material-symbols-outlined text-xl" aria-hidden="true">
              close
            </span>
          </button>

          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-4xl text-primary" aria-hidden="true">
              waving_hand
            </span>
            <div>
              <h1 className="text-2xl font-bold">Welcome, {firstName}!</h1>
              <p className="text-sm text-muted-foreground">
                Let&apos;s get your workspace set up in a few quick steps.
              </p>
            </div>
          </div>

          {/* Optional profile fields */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-medium text-muted-foreground">
              Tell us a bit about yourself (optional)
            </legend>
            <div className="space-y-2">
              <label htmlFor="ob-company" className="text-sm font-medium">
                Company
              </label>
              <input
                id="ob-company"
                type="text"
                placeholder="Acme Corp"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className={cn(
                  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
                  'placeholder:text-muted-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                )}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="ob-role" className="text-sm font-medium">
                Your Role
              </label>
              <input
                id="ob-role"
                type="text"
                placeholder="e.g. Sales Manager"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className={cn(
                  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
                  'placeholder:text-muted-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                )}
              />
            </div>
          </fieldset>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleSkipAll}
              className={cn(
                'flex-1 rounded-md border border-border bg-background px-4 py-2.5 text-sm font-medium',
                'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
              )}
            >
              Skip for now
            </button>
            <button
              type="button"
              onClick={handleContinueWelcome}
              className={cn(
                'flex-1 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground',
                'hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
              )}
            >
              Continue
            </button>
          </div>

          {/* Step indicator */}
          <p className="text-center text-xs text-muted-foreground" aria-live="polite">
            Step 1 of 2
          </p>
        </section>
      )}

      {/* ---- Step: Plan selection ---- */}
      {step === 'plan' && (
        <section aria-label="Choose your plan step" className="flex flex-col gap-4 p-6">
          <button
            type="button"
            onClick={handleSkipAll}
            aria-label="Skip plan selection"
            className="absolute right-4 top-4 rounded-sm p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="material-symbols-outlined text-xl" aria-hidden="true">
              close
            </span>
          </button>

          <div>
            <h2 className="text-xl font-bold">Choose your plan</h2>
            <p className="text-sm text-muted-foreground">
              You&apos;re on a {pricingData.metadata.freeTrialDays}-day Professional trial. Upgrade
              now or stay on trial — no pressure.
            </p>
          </div>

          {/* Monthly / Annual toggle — use <fieldset> (prefer-tag-over-role) */}
          <fieldset
            aria-label="Billing cycle"
            className="flex w-fit rounded-lg border border-border bg-muted p-0.5 text-sm"
          >
            <legend className="sr-only">Billing cycle</legend>
            <button
              type="button"
              onClick={() => setBillingCycle('monthly')}
              aria-pressed={billingCycle === 'monthly'}
              className={cn(
                'rounded-md px-4 py-1.5 font-medium transition-colors',
                billingCycle === 'monthly'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle('annual')}
              aria-pressed={billingCycle === 'annual'}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-4 py-1.5 font-medium transition-colors',
                billingCycle === 'annual'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Annual{' '}
              <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs font-semibold text-green-700">
                Save {pricingData.metadata.annualDiscountPercent}%
              </span>
            </button>
          </fieldset>

          {/* Tier cards */}
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Available plans">
            {ONBOARDING_TIERS.map((tier) => {
              const price = billingCycle === 'monthly' ? tier.price.monthly : tier.price.annual;
              const isSelected = selectedTierId === tier.id;
              return (
                <li key={tier.id}>
                  <button
                    type="button"
                    onClick={() => handleSelectTier(tier.id)}
                    aria-pressed={isSelected}
                    className={cn(
                      'w-full rounded-xl border p-4 text-left transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      tier.mostPopular
                        ? 'border-primary/60 bg-primary/5'
                        : 'border-border bg-background hover:border-primary/40',
                      isSelected && 'ring-2 ring-primary ring-offset-1'
                    )}
                  >
                    {tier.mostPopular && (
                      <span className="mb-1.5 inline-block rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">
                        Most popular
                      </span>
                    )}
                    <div className="flex items-center gap-2">
                      <span
                        className="material-symbols-outlined text-xl text-primary"
                        aria-hidden="true"
                      >
                        {tier.icon}
                      </span>
                      <span className="font-semibold">{tier.name}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                      {tier.description}
                    </p>
                    {price !== null ? (
                      <p className="mt-2 text-lg font-bold">
                        {pricingData.metadata.currencySymbol}
                        {price}
                        <span className="text-xs font-normal text-muted-foreground">
                          /{billingCycle === 'monthly' ? 'mo' : 'yr'}
                        </span>
                      </p>
                    ) : (
                      <p className="mt-2 text-sm font-bold">Contact Sales</p>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Unverified notice (shown when tier selected but email not verified) */}
          {showUnverifiedNotice && selectedTier && (
            <output
              aria-live="polite"
              className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
              data-testid="unverified-notice"
            >
              <p className="font-medium">Verify your email to subscribe</p>
              <p className="mt-0.5 text-xs">
                You&apos;re on a {pricingData.metadata.freeTrialDays}-day Professional trial until
                your email is verified. Subscribing to <strong>{selectedTier.name}</strong> will be
                available once you confirm your address.
              </p>
            </output>
          )}

          {/* Trial / Skip CTA */}
          <button
            type="button"
            onClick={handleSkipPlan}
            className={cn(
              'w-full rounded-md border border-border bg-background px-4 py-2.5 text-sm font-medium',
              'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
            data-testid="skip-plan-btn"
          >
            Continue on {pricingData.metadata.freeTrialDays}-day Professional trial
          </button>

          <p className="text-center text-xs text-muted-foreground" aria-live="polite">
            Step 2 of 2
          </p>
        </section>
      )}

      {/* ---- Step: Checkout (Stripe Elements) ---- */}
      {step === 'checkout' && selectedTier && stripeJsPromise && (
        <section aria-label="Payment step" className="overflow-y-auto p-6">
          <h2 className="mb-1 text-xl font-bold">Subscribe to {selectedTier.name}</h2>
          <p className="text-sm text-muted-foreground">
            Enter your card details to activate your subscription.
          </p>

          <Elements stripe={stripeJsPromise}>
            <StripeCardForm
              planId={selectedTier.id}
              planName={selectedTier.name}
              billingCycle={billingCycle}
              priceMonthly={selectedTier.price.monthly ?? 0}
              priceAnnual={selectedTier.price.annual ?? 0}
              onSuccess={handleCheckoutSuccess}
              onCancel={() => {
                setSelectedTierId(null);
                setStep('plan');
              }}
            />
          </Elements>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            You can cancel at any time.{' '}
            <button
              type="button"
              onClick={handleSkipAll}
              className="underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            >
              Continue on trial instead
            </button>
          </p>
        </section>
      )}

      {/* ---- Step: Success ---- */}
      {step === 'success' && checkoutSuccess && (
        <section
          aria-label="Subscription confirmed"
          aria-live="polite"
          className="flex flex-col items-center gap-6 p-10 text-center"
        >
          <span className="material-symbols-outlined text-6xl text-green-600" aria-hidden="true">
            check_circle
          </span>
          <div>
            <h2 className="text-2xl font-bold">You&apos;re all set!</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Your {selectedTier?.name} subscription is now active. Welcome to IntelliFlow!
            </p>
          </div>
          <button
            type="button"
            onClick={handleSuccessClose}
            className={cn(
              'rounded-md bg-primary px-8 py-2.5 text-sm font-semibold text-primary-foreground',
              'hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
          >
            Get started
          </button>
        </section>
      )}
    </dialog>
  );
}
