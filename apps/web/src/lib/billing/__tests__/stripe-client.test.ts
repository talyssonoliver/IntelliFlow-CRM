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

  it('returns null when NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is undefined', async () => {
    delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    const mod = await import('../stripe-client');
    expect(mod.stripePromise).toBeNull();
  });

  it('returns a Stripe promise when key is set', async () => {
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_abc123';
    const mod = await import('../stripe-client');
    expect(mod.stripePromise).not.toBeNull();
    expect(mod.stripePromise).toBeInstanceOf(Promise);
  });

  it('calls loadStripe with the publishable key', async () => {
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_xyz789';
    await import('../stripe-client');
    expect(mockLoadStripe).toHaveBeenCalledWith('pk_test_xyz789');
  });

  it('does not call loadStripe more than once per module load', async () => {
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_once';
    await import('../stripe-client');
    // Module is loaded once, loadStripe called once
    expect(mockLoadStripe).toHaveBeenCalledTimes(1);
  });
});
