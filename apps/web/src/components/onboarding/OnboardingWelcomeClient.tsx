'use client';

import dynamic from 'next/dynamic';

/**
 * Client-only, lazily-loaded wrapper for {@link OnboardingWelcome}.
 *
 * `OnboardingWelcome` statically imports `@stripe/stripe-js` +
 * `@stripe/react-stripe-js` (for the checkout step). It is rendered from the
 * universal root `app/layout.tsx`, so without this wrapper the Stripe SDK is
 * pulled into EVERY route's compile graph — a major contributor to the
 * `next dev` memory blow-up. The welcome modal is driven entirely by client-side
 * onboarding state (`onboarding.getState`) and never needs SSR, so `ssr: false`
 * is correct and isolates Stripe (and the rest of the modal) into its own
 * on-demand client chunk.
 *
 * `dynamic({ ssr: false })` is only valid inside a Client Component, which is why
 * this thin wrapper exists (the root layout is a Server Component).
 */
export const OnboardingWelcome = dynamic(
  () => import('./OnboardingWelcome').then((m) => ({ default: m.OnboardingWelcome })),
  { ssr: false }
);
