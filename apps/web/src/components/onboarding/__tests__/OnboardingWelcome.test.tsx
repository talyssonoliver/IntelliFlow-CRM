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

  it('does NOT advance to an empty checkout when Stripe is not configured', async () => {
    // Payments unavailable: getStripePromise() returns null with no publishable key,
    // so a verified user selecting a paid tier must stay on 'plan' (skip/trial CTA
    // visible) rather than land in a blank checkout step.
    vi.stubEnv('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', '');
    render(<OnboardingWelcome />);
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    const tierBtns = screen.getAllByRole('button', { name: /professional/i });
    const professionalBtn = tierBtns.find(
      (b) => b.hasAttribute('aria-pressed') && b.getAttribute('aria-pressed') !== null
    );
    if (!professionalBtn) throw new Error('Professional tier button not found');
    fireEvent.click(professionalBtn);

    // No card form rendered; the skip-plan control is still available — not stranded.
    expect(screen.queryByTestId('card-number-element')).toBeNull();
    expect(screen.getByTestId('skip-plan-btn')).toBeDefined();
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

  // ------------------------------------------------------------------
  // Step navigation
  // ------------------------------------------------------------------

  it('greets with "there" when user.name is null', () => {
    mockUseAuth.mockReturnValue(
      authedUser({ user: { id: 'u2', email: 'x@y.com', name: null, role: 'USER' } })
    );
    render(<OnboardingWelcome />);
    expect(screen.getByText(/welcome, there/i)).toBeDefined();
  });

  it('typing in company and role fields updates their values', () => {
    render(<OnboardingWelcome />);
    const companyInput = screen.getByPlaceholderText(/acme corp/i) as HTMLInputElement;
    const roleInput = screen.getByPlaceholderText(/sales manager/i) as HTMLInputElement;
    fireEvent.change(companyInput, { target: { value: 'FlowCo' } });
    fireEvent.change(roleInput, { target: { value: 'CTO' } });
    expect(companyInput.value).toBe('FlowCo');
    expect(roleInput.value).toBe('CTO');
  });

  it('switching billing cycle to annual updates the toggle state', () => {
    render(<OnboardingWelcome />);
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    const annualBtn = screen.getByRole('button', { name: /annual/i });
    fireEvent.click(annualBtn);
    expect(annualBtn.getAttribute('aria-pressed')).toBe('true');

    // Toggling back to monthly
    const monthlyBtn = screen.getByRole('button', { name: /monthly/i });
    fireEvent.click(monthlyBtn);
    expect(monthlyBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('"Back" button in checkout step returns to plan step', async () => {
    render(<OnboardingWelcome />);
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    // Select professional tier to go to checkout
    const tierBtns = screen.getAllByRole('button', { name: /professional/i });
    const professionalBtn = tierBtns.find((b) => b.hasAttribute('aria-pressed'));
    if (!professionalBtn) throw new Error('Professional tier button not found');
    fireEvent.click(professionalBtn);

    await waitFor(() => expect(screen.getByTestId('stripe-elements')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /back/i }));

    await waitFor(() => expect(screen.getByText(/choose your plan/i)).toBeDefined());
    expect(screen.queryByTestId('stripe-elements')).toBeNull();
  });

  it('"Continue on trial instead" link in checkout step calls handleSkipAll', async () => {
    render(<OnboardingWelcome />);
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    const tierBtns = screen.getAllByRole('button', { name: /professional/i });
    const professionalBtn = tierBtns.find((b) => b.hasAttribute('aria-pressed'));
    if (!professionalBtn) throw new Error('Professional tier button not found');
    fireEvent.click(professionalBtn);

    await waitFor(() => expect(screen.getByTestId('stripe-elements')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /continue on trial instead/i }));

    await waitFor(() => expect(mockMutate).toHaveBeenCalledWith({}));
    expect(sessionStorage.getItem('intelliflow_onboarding_session_dismissed')).toBe('1');
  });

  it('"Skip plan selection" X button on plan step calls handleSkipAll', async () => {
    render(<OnboardingWelcome />);
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    fireEvent.click(screen.getByRole('button', { name: /skip plan selection/i }));
    await waitFor(() => expect(mockMutate).toHaveBeenCalledWith({}));
    expect(sessionStorage.getItem('intelliflow_onboarding_session_dismissed')).toBe('1');
  });

  // ------------------------------------------------------------------
  // Stripe card form — happy path (active subscription, no 3DS)
  // ------------------------------------------------------------------

  it('successful card submission with status=active calls onSuccess and shows success step', async () => {
    // Default mockCreateCheckout returns { status:'active', clientSecret:null }
    render(<OnboardingWelcome />);
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    const tierBtns = screen.getAllByRole('button', { name: /professional/i });
    const professionalBtn = tierBtns.find((b) => b.hasAttribute('aria-pressed'));
    if (!professionalBtn) throw new Error('Professional tier button not found');
    fireEvent.click(professionalBtn);

    await waitFor(() => expect(screen.getByTestId('card-number-element')).toBeDefined());

    // Fill cardholder name
    const nameInput = screen.getByPlaceholderText(/jane smith/i) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Alice Smith' } });

    // Submit the form
    fireEvent.submit(screen.getByRole('form', { name: /card payment form/i }));

    await waitFor(() => {
      expect(mockCreatePaymentMethod).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'card',
          billing_details: { name: 'Alice Smith' },
        })
      );
    });

    await waitFor(() => {
      expect(mockCreateCheckout).toHaveBeenCalledWith(
        expect.objectContaining({
          planId: 'PROFESSIONAL',
          billingCycle: 'monthly',
          paymentMethodId: 'pm_test_123',
        })
      );
    });

    // Success step
    await waitFor(() => expect(screen.getByText(/you're all set/i)).toBeDefined());
    // confirmCardPayment must NOT have been called (status was 'active')
    expect(mockConfirmCardPayment).not.toHaveBeenCalled();
    // onboarding.complete should be called with the selectedPlan
    await waitFor(() => expect(mockMutate).toHaveBeenCalledWith({ selectedPlan: 'professional' }));
  });

  it('"Get started" on success step sets session dismissed flag', async () => {
    // Drive to success step the fast way: re-use default mocks
    render(<OnboardingWelcome />);
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    const tierBtns = screen.getAllByRole('button', { name: /professional/i });
    const professionalBtn = tierBtns.find((b) => b.hasAttribute('aria-pressed'));
    if (!professionalBtn) throw new Error('Professional tier button not found');
    fireEvent.click(professionalBtn);

    await waitFor(() => expect(screen.getByTestId('card-number-element')).toBeDefined());
    const nameInput = screen.getByPlaceholderText(/jane smith/i);
    fireEvent.change(nameInput, { target: { value: 'Alice' } });
    fireEvent.submit(screen.getByRole('form', { name: /card payment form/i }));

    await waitFor(() => expect(screen.getByRole('button', { name: /get started/i })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /get started/i }));

    expect(sessionStorage.getItem('intelliflow_onboarding_session_dismissed')).toBe('1');
  });

  // ------------------------------------------------------------------
  // Stripe card form — 3DS branch
  // ------------------------------------------------------------------

  it('3DS branch: confirmCardPayment is called when status=incomplete + clientSecret', async () => {
    mockCreateCheckout.mockResolvedValueOnce({
      subscriptionId: 'sub_3ds',
      status: 'incomplete',
      clientSecret: 'cs_test_secret',
      currentPeriodEnd: new Date().toISOString(),
    });

    render(<OnboardingWelcome />);
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    const tierBtns = screen.getAllByRole('button', { name: /professional/i });
    const professionalBtn = tierBtns.find((b) => b.hasAttribute('aria-pressed'));
    if (!professionalBtn) throw new Error('Professional tier button not found');
    fireEvent.click(professionalBtn);

    await waitFor(() => expect(screen.getByTestId('card-number-element')).toBeDefined());
    fireEvent.change(screen.getByPlaceholderText(/jane smith/i), { target: { value: 'Alice' } });
    fireEvent.submit(screen.getByRole('form', { name: /card payment form/i }));

    await waitFor(() => expect(mockConfirmCardPayment).toHaveBeenCalledWith('cs_test_secret'));
    // No error → success step
    await waitFor(() => expect(screen.getByText(/you're all set/i)).toBeDefined());
  });

  it('3DS failure: confirmCardPayment returns error → form error shown', async () => {
    mockCreateCheckout.mockResolvedValueOnce({
      subscriptionId: 'sub_3ds_fail',
      status: 'incomplete',
      clientSecret: 'cs_fail',
      currentPeriodEnd: new Date().toISOString(),
    });
    mockConfirmCardPayment.mockResolvedValueOnce({
      error: { message: '3D Secure authentication failed' },
    });

    render(<OnboardingWelcome />);
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    const tierBtns = screen.getAllByRole('button', { name: /professional/i });
    const professionalBtn = tierBtns.find((b) => b.hasAttribute('aria-pressed'));
    if (!professionalBtn) throw new Error('Professional tier button not found');
    fireEvent.click(professionalBtn);

    await waitFor(() => expect(screen.getByTestId('card-number-element')).toBeDefined());
    fireEvent.change(screen.getByPlaceholderText(/jane smith/i), { target: { value: 'Alice' } });
    fireEvent.submit(screen.getByRole('form', { name: /card payment form/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
    expect(screen.getByRole('alert').textContent).toContain('3D Secure authentication failed');
  });

  // ------------------------------------------------------------------
  // Stripe card form — error branches
  // ------------------------------------------------------------------

  it('createPaymentMethod error → shows form error, no checkout call', async () => {
    mockCreatePaymentMethod.mockResolvedValueOnce({
      paymentMethod: null,
      error: { message: 'Your card number is incomplete.' },
    });

    render(<OnboardingWelcome />);
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    const tierBtns = screen.getAllByRole('button', { name: /professional/i });
    const professionalBtn = tierBtns.find((b) => b.hasAttribute('aria-pressed'));
    if (!professionalBtn) throw new Error('Professional tier button not found');
    fireEvent.click(professionalBtn);

    await waitFor(() => expect(screen.getByTestId('card-number-element')).toBeDefined());
    fireEvent.change(screen.getByPlaceholderText(/jane smith/i), { target: { value: 'Alice' } });
    fireEvent.submit(screen.getByRole('form', { name: /card payment form/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('Your card number is incomplete.')
    );
    expect(mockCreateCheckout).not.toHaveBeenCalled();
  });

  it('createCheckoutSubscription rejection → shows generic error message', async () => {
    mockCreateCheckout.mockRejectedValueOnce(new Error('Backend subscription error'));

    render(<OnboardingWelcome />);
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    const tierBtns = screen.getAllByRole('button', { name: /professional/i });
    const professionalBtn = tierBtns.find((b) => b.hasAttribute('aria-pressed'));
    if (!professionalBtn) throw new Error('Professional tier button not found');
    fireEvent.click(professionalBtn);

    await waitFor(() => expect(screen.getByTestId('card-number-element')).toBeDefined());
    fireEvent.change(screen.getByPlaceholderText(/jane smith/i), { target: { value: 'Alice' } });
    fireEvent.submit(screen.getByRole('form', { name: /card payment form/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('Backend subscription error')
    );
  });

  it('submitting with empty name shows validation error without calling stripe', async () => {
    render(<OnboardingWelcome />);
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    const tierBtns = screen.getAllByRole('button', { name: /professional/i });
    const professionalBtn = tierBtns.find((b) => b.hasAttribute('aria-pressed'));
    if (!professionalBtn) throw new Error('Professional tier button not found');
    fireEvent.click(professionalBtn);

    await waitFor(() => expect(screen.getByTestId('card-number-element')).toBeDefined());
    // Do NOT fill cardholder name — submit immediately
    fireEvent.submit(screen.getByRole('form', { name: /card payment form/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('Cardholder name is required')
    );
    expect(mockCreatePaymentMethod).not.toHaveBeenCalled();
  });

  it('cardholder name error clears when user starts typing', async () => {
    render(<OnboardingWelcome />);
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    const tierBtns = screen.getAllByRole('button', { name: /professional/i });
    const professionalBtn = tierBtns.find((b) => b.hasAttribute('aria-pressed'));
    if (!professionalBtn) throw new Error('Professional tier button not found');
    fireEvent.click(professionalBtn);

    await waitFor(() => expect(screen.getByTestId('card-number-element')).toBeDefined());

    // Trigger validation error via blur with empty name
    const nameInput = screen.getByPlaceholderText(/jane smith/i);
    fireEvent.blur(nameInput);
    await waitFor(() =>
      expect(
        screen
          .getAllByRole('alert')
          .some((el) => el.textContent?.includes('Cardholder name is required'))
      ).toBe(true)
    );

    // Typing clears the error
    fireEvent.change(nameInput, { target: { value: 'B' } });
    await waitFor(() =>
      expect(
        screen
          .queryAllByRole('alert')
          .some((el) => el.textContent?.includes('Cardholder name is required'))
      ).toBe(false)
    );
  });

  // ------------------------------------------------------------------
  // emailVerified === null (unknown) — same as unverified: no checkout
  // ------------------------------------------------------------------

  it('emailVerified=null: selecting a tier shows unverified notice, no card form', async () => {
    mockUseAuth.mockReturnValue(authedUser({ emailVerified: null }));

    render(<OnboardingWelcome />);
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    const starterBtns = screen.getAllByRole('button', { name: /starter/i });
    const starterBtn = starterBtns.find((b) => b.hasAttribute('aria-pressed'));
    if (!starterBtn) throw new Error('Starter tier button not found');
    fireEvent.click(starterBtn);

    await waitFor(() => expect(screen.getByTestId('unverified-notice')).toBeDefined());
    expect(screen.queryByTestId('card-number-element')).toBeNull();
  });

  // ------------------------------------------------------------------
  // Annual billing cycle in checkout
  // ------------------------------------------------------------------

  it('annual billing cycle flows to checkout form showing annual price', async () => {
    render(<OnboardingWelcome />);
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    // Switch to annual
    fireEvent.click(screen.getByRole('button', { name: /annual/i }));

    const tierBtns = screen.getAllByRole('button', { name: /starter/i });
    const starterBtn = tierBtns.find((b) => b.hasAttribute('aria-pressed'));
    if (!starterBtn) throw new Error('Starter tier button not found');
    fireEvent.click(starterBtn);

    await waitFor(() => expect(screen.getByTestId('stripe-elements')).toBeDefined());
    // Annual pricing label for starter (£24/yr) appears in the order summary
    // and also inside the subscribe button — use getAllByText
    expect(screen.getAllByText(/£24\/yr/i).length).toBeGreaterThan(0);
  });
});
