/**
 * Stripe Integration for Pricing
 *
 * This module provides:
 * - Checkout session builder (redirect-based flow)
 * - Publishable key accessor
 * - Programmatic subscription management via the vanilla tRPC client
 *   (for non-React contexts: server actions, API routes, utilities)
 *
 * React components should prefer tRPC hooks directly:
 *   - trpc.billing.getSubscription.useQuery()
 *   - trpc.billing.cancelSubscription.useMutation()
 *   - trpc.billing.updateSubscription.useMutation()
 *
 * Webhook signature validation is server-side only
 * (handled by StripeAdapter.constructWebhookEvent).
 */

import { createTRPCClient } from '@intelliflow/api-client';
import { requiredProdEnv } from '../required-url';

// ============================================
// Types
// ============================================

export interface StripeCheckoutOptions {
  priceId: string;
  quantity: number;
  customerEmail?: string;
  successUrl?: string;
  cancelUrl?: string;
}

/** Client-side subscription type. Dates are ISO strings (no superjson transformer). */
export interface StripeSubscription {
  id: string;
  customerId: string;
  status:
    | 'incomplete'
    | 'incomplete_expired'
    | 'trialing'
    | 'active'
    | 'past_due'
    | 'canceled'
    | 'unpaid'
    | 'paused';
  priceId: string;
  quantity: number;
  currency: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  canceledAt?: string;
  trialStart?: string;
  trialEnd?: string;
}

// ============================================
// Vanilla tRPC Client (lazy-initialized)
// ============================================

let _billingClient: ReturnType<typeof createTRPCClient> | null = null;

function getBillingClient(): ReturnType<typeof createTRPCClient> {
  if (!_billingClient) {
    // SSR self-call base URL (browser uses the relative path). Extracted to
    // avoid a nested template literal. Fail-fast in prod, no localhost. (#228)
    const devBaseUrl = `http://localhost:${process.env.PORT ?? 3000}`;
    const ssrBaseUrl = requiredProdEnv(
      'NEXT_PUBLIC_APP_URL',
      process.env.NEXT_PUBLIC_APP_URL,
      devBaseUrl
    );
    _billingClient = createTRPCClient({
      url: typeof globalThis.window === 'undefined' ? `${ssrBaseUrl}/api/trpc` : '/api/trpc',
      headers: (): Record<string, string> => {
        if (typeof globalThis.window === 'undefined') return {};
        const token = localStorage.getItem('accessToken');
        if (token) return { Authorization: `Bearer ${token}` };
        return {};
      },
    });
  }
  return _billingClient;
}

/** @internal Reset client singleton — used by tests only */
export function _resetBillingClient(): void {
  _billingClient = null;
}

// ============================================
// Checkout Session (redirect-based flow)
// ============================================

/**
 * Create a Stripe checkout session via the backend.
 *
 * Returns the checkout/subscription URL on success, or null on error.
 */
export async function createCheckoutSession(
  options: StripeCheckoutOptions
): Promise<string | null> {
  try {
    // The backend createCheckoutSubscription procedure handles
    // customer creation, payment method attachment, and subscription creation.
    // For the pricing page flow, we redirect to a sign-up page where
    // the user provides payment details via Stripe Elements, then the
    // backend creates the subscription.
    const params = new URLSearchParams({
      plan: options.priceId,
      quantity: options.quantity.toString(),
    });

    if (options.customerEmail) {
      params.set('email', options.customerEmail);
    }

    // Redirect to sign-up with plan context — the sign-up page
    // collects payment details and calls createCheckoutSubscription.
    return `/signup?${params}`;
  } catch (error) {
    console.error('[stripe-integration] Failed to create checkout session:', error);
    return null;
  }
}

// ============================================
// Publishable Key
// ============================================

/**
 * Get Stripe publishable key from environment
 */
export function getStripePublishableKey(): string {
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
}

// ============================================
// Subscription Management (via tRPC)
// ============================================

/**
 * Get the current user's active subscription.
 *
 * Calls billing.getSubscription — the backend resolves the customer
 * from the authenticated session (no customerId parameter needed).
 *
 * @returns The active subscription, or null if none exists.
 */
export async function getSubscription(): Promise<StripeSubscription | null> {
  const client = getBillingClient();
  const result = await client.billing.getSubscription.query();
  return result as StripeSubscription | null;
}

/**
 * Cancel the current user's subscription.
 *
 * The backend finds the active subscription from the authenticated
 * session — no subscriptionId parameter needed.
 *
 * @param options.atPeriodEnd - If true, cancel at end of current billing period (default: true)
 * @param options.reason - Optional cancellation reason for records
 * @returns The updated subscription with cancellation details.
 */
export async function cancelSubscription(options?: {
  atPeriodEnd?: boolean;
  reason?: string;
}): Promise<StripeSubscription> {
  const client = getBillingClient();
  const result = await client.billing.cancelSubscription.mutate({
    atPeriodEnd: options?.atPeriodEnd ?? true,
    reason: options?.reason,
  });
  return result as StripeSubscription;
}

/**
 * Update the current user's subscription seat count.
 *
 * The backend finds the active subscription from the authenticated
 * session — no subscriptionId parameter needed.
 *
 * @param newQuantity - The new seat/quantity count
 * @returns The updated subscription with new quantity.
 */
export async function updateSubscriptionQuantity(newQuantity: number): Promise<StripeSubscription> {
  const client = getBillingClient();
  const result = await client.billing.updateSubscription.mutate({
    quantity: newQuantity,
  });
  return result as StripeSubscription;
}
