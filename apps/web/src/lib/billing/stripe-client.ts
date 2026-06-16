/**
 * Stripe Client Singleton
 *
 * IMPLEMENTS: PG-026 (Checkout)
 *
 * Provides a single loadStripe promise for use with <Elements> provider.
 * Returns null if NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set.
 */

import { loadStripe, type Stripe } from '@stripe/stripe-js';

const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

let _stripePromise: Promise<Stripe | null> | null | undefined;

/**
 * Stripe promise lazy getter.
 * - Returns null if the publishable key env var is missing
 * - Calls loadStripe exactly once and caches the result (lazy singleton)
 */
export function getStripePromise(): Promise<Stripe | null> | null {
  if (_stripePromise === undefined) {
    _stripePromise = key ? loadStripe(key) : null;
  }
  return _stripePromise;
}
