/**
 * Stripe Client Singleton Tests
 *
 * IMPLEMENTS: PG-026 (Checkout) — TEST-013
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist the mock function so it persists across resetModules
const mockLoadStripe = vi.hoisted(() => vi.fn(() => Promise.resolve({ elements: vi.fn() })));

vi.mock('@stripe/stripe-js', () => ({
  loadStripe: mockLoadStripe,
}));

describe('stripe-client', () => {
  beforeEach(() => {
    vi.resetModules();
    mockLoadStripe.mockClear();
    // Re-apply mock return value
    mockLoadStripe.mockImplementation(() => Promise.resolve({ elements: vi.fn() }));
  });

  it('getStripePromise() when key is undefined returns null', async () => {
    delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    const mod = await import('../stripe-client');
    expect(mod.getStripePromise()).toBeNull();
  });

  it('getStripePromise() when key is set returns a Promise and calls loadStripe with the key value', async () => {
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_abc123';
    const mod = await import('../stripe-client');
    const result = mod.getStripePromise();
    expect(result).not.toBeNull();
    expect(result).toBeInstanceOf(Promise);
    expect(mockLoadStripe).toHaveBeenCalledWith('pk_test_abc123');
  });

  it('Lazy-singleton: calling getStripePromise() twice in the same module instance calls the loadStripe mock exactly once', async () => {
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_once';
    const mod = await import('../stripe-client');
    mod.getStripePromise();
    mod.getStripePromise();
    expect(mockLoadStripe).toHaveBeenCalledTimes(1);
  });
});
