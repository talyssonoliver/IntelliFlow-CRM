/**
 * OnboardingWelcome — unit tests (Vitest + RTL)
 *
 * Mocks required:
 *  - @/lib/trpc            → trpc proxy with onboarding + billing + auth hooks
 *  - @/lib/auth/AuthContext → useAuth
 *  - next/navigation        → usePathname (vitest.setup already mocks router)
 *  - @stripe/stripe-js      → loadStripe
 *  - @stripe/react-stripe-js → Elements, card elements, useStripe, useElements
 *
 * vi.hoisted() is used for any mock values referenced in vi.mock() factories
 * (Vitest hoists vi.mock() calls above imports, but NOT vi.fn() at top level).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ============================================================
// Hoisted mock factories (must be declared before vi.mock calls)
// ============================================================

const mockGetState = vi.hoisted(() => vi.fn());
const mockGetPlanState = vi.hoisted(() => vi.fn());
const mockCreateCheckout = vi.hoisted(() => vi.fn());
const mockUseAuth = vi.hoisted(() => vi.fn());
const mockUsePathname = vi.hoisted(() => vi.fn());
const mockLoadStripe = vi.hoisted(() => vi.fn());
const mockUseStripe = vi.hoisted(() => vi.fn());
const mockUseElements = vi.hoisted(() => vi.fn());
const mockCreatePaymentMethod = vi.hoisted(() => vi.fn());
const mockConfirmCardPayment = vi.hoisted(() => vi.fn());
const mockMutate = vi.hoisted(() => vi.fn());
const mockMutateAsync = vi.hoisted(() => vi.fn());
const mockShowModal = vi.hoisted(() => vi.fn());
const mockClose = vi.hoisted(() => vi.fn());

// ============================================================
// vi.mock declarations (hoisted to top of file by Vitest)
// ============================================================

vi.mock('@/lib/trpc', () => ({
  trpc: {
    onboarding: {
      getState: {
        useQuery: mockGetState,
      },
      complete: {
        useMutation: () => ({
          mutate: mockMutate,
          mutateAsync: mockMutateAsync,
        }),
      },
    },
    billing: {
      getPlanState: {
        useQuery: mockGetPlanState,
      },
      createCheckoutSubscription: {
        useMutation: () => ({
          mutateAsync: mockCreateCheckout,
        }),
      },
    },
  },
}));

vi.mock('@/lib/auth/AuthContext', () => ({
  useAuth: mockUseAuth,
}));

vi.mock('next/navigation', () => ({
  usePathname: mockUsePathname,
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

vi.mock('@stripe/stripe-js', () => ({
  loadStripe: mockLoadStripe,
}));

// Mock the entire @stripe/react-stripe-js module so no network or iframe
// is needed.  CardNumberElement etc. render as plain inputs for RTL.
vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: { children: React.ReactNode; stripe?: unknown }) =>
    React.createElement('div', { 'data-testid': 'stripe-elements' }, children),
  CardNumberElement: () =>
    React.createElement('input', { 'data-testid': 'card-number-element', type: 'text' }),
  CardExpiryElement: () =>
    React.createElement('input', { 'data-testid': 'card-expiry-element', type: 'text' }),
  CardCvcElement: () =>
    React.createElement('input', { 'data-testid': 'card-cvc-element', type: 'text' }),
  useStripe: mockUseStripe,
  useElements: mockUseElements,
}));

// Note: NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is stubbed in beforeEach (not here)
// because vitest.setup afterEach calls vi.unstubAllEnvs(), which resets stubs
// applied at module-scope before each test runs.

// ============================================================
// Component under test (imported AFTER vi.mock calls)
// ============================================================

import { OnboardingWelcome } from '../OnboardingWelcome';

// ============================================================
// Test helpers
// ============================================================

function authedUser(overrides: Record<string, unknown> = {}) {
  return {
    isAuthenticated: true,
    isLoading: false,
    emailVerified: true,
    user: { id: 'u1', email: 'alice@example.com', name: 'Alice Smith', role: 'USER' },
    ...overrides,
  };
}

/** Patch HTMLDialogElement.showModal / close (happy-dom doesn't implement them) */
function patchDialogElement() {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    value: mockShowModal,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    value: mockClose,
    writable: true,
    configurable: true,
  });
  // happy-dom: `.open` must track showModal/close calls for shouldShow logic
  Object.defineProperty(HTMLDialogElement.prototype, 'open', {
    get() {
      return this._open ?? false;
    },
    set(v) {
      this._open = v;
    },
    configurable: true,
  });
  // Make showModal set .open = true
  mockShowModal.mockImplementation(function (this: HTMLDialogElement & { _open?: boolean }) {
    this._open = true;
  });
  mockClose.mockImplementation(function (this: HTMLDialogElement & { _open?: boolean }) {
    this._open = false;
  });
}

// ============================================================
// Default mock setup (reset before each test)
// ============================================================

beforeEach(() => {
  patchDialogElement();

  // Stub Stripe publishable key before each test so getStripePromise() returns
  // a non-null value.  Must be in beforeEach (not module scope) because
  // vitest.setup's afterEach calls vi.unstubAllEnvs() which would reset it.
  vi.stubEnv('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'pk_test_stub_key_for_tests');

  // Default: protected route
  mockUsePathname.mockReturnValue('/dashboard');

  // Default auth: authenticated, email verified
  mockUseAuth.mockReturnValue(authedUser());

  // Default onboarding: not completed
  mockGetState.mockReturnValue({
    data: { completed: false, selectedPlan: null },
    isLoading: false,
  });

  // Default billing plan: trial
  mockGetPlanState.mockReturnValue({
    data: {
      source: 'trial',
      tier: 'PROFESSIONAL',
      status: 'TRIALING',
      trialEndsAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      daysLeft: 10,
      currentPeriodEnd: null,
    },
    isLoading: false,
  });

  // Default Stripe
  mockLoadStripe.mockResolvedValue({});
  mockUseStripe.mockReturnValue({
    createPaymentMethod: mockCreatePaymentMethod,
    confirmCardPayment: mockConfirmCardPayment,
  });
  mockUseElements.mockReturnValue({
    getElement: () => ({}),
  });
  mockCreatePaymentMethod.mockResolvedValue({
    paymentMethod: { id: 'pm_test_123' },
    error: null,
  });
  mockConfirmCardPayment.mockResolvedValue({ error: null });
  mockCreateCheckout.mockResolvedValue({
    subscriptionId: 'sub_123',
    status: 'active',
    clientSecret: null,
    currentPeriodEnd: new Date().toISOString(),
  });

  // Stub sessionStorage (happy-dom provides it but let's ensure clean state)
  sessionStorage.clear();
});

// ============================================================
// Tests
// ============================================================

describe('OnboardingWelcome', () => {
  it('renders the welcome step when authed + protected route + not completed', () => {
    render(<OnboardingWelcome />);
    expect(screen.getByTestId('onboarding-dialog')).toBeDefined();
    expect(screen.getByText(/welcome, alice/i)).toBeDefined();
  });

  it('does NOT render when onboarding completed === true', () => {
    mockGetState.mockReturnValue({
      data: { completed: true, selectedPlan: 'PROFESSIONAL' },
      isLoading: false,
    });
    render(<OnboardingWelcome />);
    // Dialog exists in DOM but .open should remain false → content hidden
    const dialog = screen.getByTestId('onboarding-dialog');
    expect((dialog as HTMLDialogElement).open).toBe(false);
  });

  it('does NOT open on a public route (e.g. /login)', () => {
    mockUsePathname.mockReturnValue('/login');
    render(<OnboardingWelcome />);
    const dialog = screen.getByTestId('onboarding-dialog');
    expect((dialog as HTMLDialogElement).open).toBe(false);
  });

  it('does NOT open when user is not authenticated', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      emailVerified: null,
      user: null,
    });
    render(<OnboardingWelcome />);
    const dialog = screen.getByTestId('onboarding-dialog');
    expect((dialog as HTMLDialogElement).open).toBe(false);
  });

  it('advances from welcome step to plan step on "Continue"', () => {
    render(<OnboardingWelcome />);
    expect(screen.getByText(/step 1 of 2/i)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(screen.getByText(/choose your plan/i)).toBeDefined();
    expect(screen.getByText(/step 2 of 2/i)).toBeDefined();
  });

  it('"Skip for now" on welcome step calls onboarding.complete and closes', async () => {
    render(<OnboardingWelcome />);
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));
    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith({});
    });
    expect(sessionStorage.getItem('intelliflow_onboarding_session_dismissed')).toBe('1');
  });

  it('"Continue on trial" on plan step calls onboarding.complete and closes', async () => {
    render(<OnboardingWelcome />);
    // Advance to plan step
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    // Click the trial skip button
    fireEvent.click(screen.getByTestId('skip-plan-btn'));
    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith({});
    });
    expect(sessionStorage.getItem('intelliflow_onboarding_session_dismissed')).toBe('1');
  });

  it('shows Stripe card form when verified user selects a paid plan', async () => {
    // emailVerified = true (default)
    render(<OnboardingWelcome />);
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    // Click the "Professional" tier card button (aria-pressed attribute identifies tier buttons)
    // Use getAllByRole and pick the one with aria-pressed (tier cards) not the skip-plan btn
    const tierBtns = screen.getAllByRole('button', { name: /professional/i });
    // The tier card button has aria-pressed attribute; the skip-plan btn does not
    const professionalBtn = tierBtns.find(
      (b) => b.hasAttribute('aria-pressed') && b.getAttribute('aria-pressed') !== null
    );
    if (!professionalBtn) throw new Error('Professional tier button not found');
    fireEvent.click(professionalBtn);

    await waitFor(() => {
      expect(screen.getByTestId('stripe-elements')).toBeDefined();
      expect(screen.getByTestId('card-number-element')).toBeDefined();
    });
  });

  it('shows verify-email notice and NO card form when email is NOT verified', async () => {
    mockUseAuth.mockReturnValue(authedUser({ emailVerified: false }));

    render(<OnboardingWelcome />);
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    // Click "Starter" tier card (aria-pressed identifies tier cards)
    const starterBtns = screen.getAllByRole('button', { name: /starter/i });
    const starterBtn = starterBtns.find((b) => b.hasAttribute('aria-pressed'));
    if (!starterBtn) throw new Error('Starter tier button not found');
    fireEvent.click(starterBtn);

    await waitFor(() => {
      expect(screen.getByTestId('unverified-notice')).toBeDefined();
    });

    // Stripe card form must NOT be present
    expect(screen.queryByTestId('card-number-element')).toBeNull();
  });

  it('does NOT call createCheckoutSubscription when email is not verified', () => {
    mockUseAuth.mockReturnValue(authedUser({ emailVerified: false }));

    render(<OnboardingWelcome />);
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    const starterBtns = screen.getAllByRole('button', { name: /starter/i });
    const starterBtn = starterBtns.find((b) => b.hasAttribute('aria-pressed'));
    if (!starterBtn) throw new Error('Starter tier button not found');
    fireEvent.click(starterBtn);

    // checkout mutation must never be called
    expect(mockCreateCheckout).not.toHaveBeenCalled();
  });

  it('does not re-open if session flag is already set', () => {
    sessionStorage.setItem('intelliflow_onboarding_session_dismissed', '1');
    render(<OnboardingWelcome />);
    const dialog = screen.getByTestId('onboarding-dialog');
    expect((dialog as HTMLDialogElement).open).toBe(false);
  });
});
