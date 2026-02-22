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

/**
 * Stripe promise singleton.
 * - Returns null if the publishable key env var is missing
 * - Calls loadStripe exactly once and caches the result
 */
export const stripePromise: Promise<Stripe | null> | null = key
  ? loadStripe(key)
  : null;
