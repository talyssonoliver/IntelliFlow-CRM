// @vitest-environment jsdom
/**
 * TermsAcceptanceConfirm Component Tests — IFC-309
 *
 * Tests: auth-gating (AC-008), hide-when-accepted (AC-009), a11y (ARIA attributes).
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

// ---- Mock useAuth ----
const mockUseAuth = vi.fn();
vi.mock('@/lib/auth/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

// ---- Mock trpc ----
const mockGetAcceptance = vi.fn();
const mockAcceptMutate = vi.fn();
const mockUseMutation = vi.fn();

vi.mock('@/lib/trpc', () => ({
  trpc: {
    termsAcceptance: {
      getAcceptance: {
        useQuery: (...args: unknown[]) => mockGetAcceptance(...args),
      },
      accept: {
        useMutation: (...args: unknown[]) => mockUseMutation(...args),
      },
    },
  },
}));

// Import component AFTER mocks are defined
import { TermsAcceptanceConfirm } from '../TermsAcceptanceConfirm';

const TERMS_V1 = 'v1.0';

function setAuth(isAuthenticated: boolean, isLoading = false) {
  mockUseAuth.mockReturnValue({ isAuthenticated, isLoading, user: null });
}

function setQuery(accepted: boolean, queryLoading = false, acceptedAt: Date | null = null) {
  mockGetAcceptance.mockReturnValue({
    data: { accepted, acceptedAt },
    isLoading: queryLoading,
  });
}

function setMutation(opts: { isPending?: boolean; isError?: boolean; isSuccess?: boolean } = {}) {
  mockUseMutation.mockImplementation((options?: { onSuccess?: () => void }) => ({
    mutate: (data: unknown) => {
      mockAcceptMutate(data);
      if (options?.onSuccess) options.onSuccess();
    },
    isPending: opts.isPending ?? false,
    isError: opts.isError ?? false,
    isSuccess: opts.isSuccess ?? false,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  setAuth(true);
  setQuery(false);
  setMutation();
});

describe('TermsAcceptanceConfirm', () => {
  // -----------------------------------------------------------------------
  // AC-008: Hide for unauthenticated / loading
  // -----------------------------------------------------------------------
  describe('AC-008 — hidden when unauthenticated or loading', () => {
    it('renders null when not authenticated (AC-008)', () => {
      setAuth(false);
      const { container } = render(<TermsAcceptanceConfirm termsVersion={TERMS_V1} />);
      expect(container.firstChild).toBeNull();
    });

    it('renders null when auth is loading (AC-008)', () => {
      setAuth(false, true);
      const { container } = render(<TermsAcceptanceConfirm termsVersion={TERMS_V1} />);
      expect(container.firstChild).toBeNull();
    });

    it('renders null while query is loading (AC-008)', () => {
      setAuth(true);
      setQuery(false, true);
      const { container } = render(<TermsAcceptanceConfirm termsVersion={TERMS_V1} />);
      expect(container.firstChild).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // AC-009: Hide when already accepted
  // -----------------------------------------------------------------------
  describe('AC-009 — hidden when already accepted', () => {
    it('renders null when getAcceptance returns accepted: true (AC-009)', () => {
      setAuth(true);
      setQuery(true, false, new Date());
      const { container } = render(<TermsAcceptanceConfirm termsVersion={TERMS_V1} />);
      expect(container.firstChild).toBeNull();
    });

    it('renders null after successful accept mutation (optimistic hide)', async () => {
      setAuth(true);
      setQuery(false);
      setMutation({ isSuccess: true });

      render(<TermsAcceptanceConfirm termsVersion={TERMS_V1} />);
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);
      const btn = screen.getByRole('button', { name: /i agree/i });
      fireEvent.click(btn);

      await waitFor(() => {
        // After onSuccess fires, the component hides itself
        expect(
          document.querySelector('section[aria-labelledby="terms-accept-heading"]')
        ).toBeNull();
      });
    });
  });

  // -----------------------------------------------------------------------
  // Renders confirmation section when authenticated and not yet accepted
  // -----------------------------------------------------------------------
  describe('renders confirmation UI when authenticated and not yet accepted', () => {
    it('renders a section with aria-labelledby (a11y)', () => {
      render(<TermsAcceptanceConfirm termsVersion={TERMS_V1} />);
      // <section> has implicit landmark role of region when it has an accessible name
      const section = document.querySelector('section[aria-labelledby="terms-accept-heading"]');
      expect(section).toBeTruthy();
    });

    it('renders a checkbox with aria-required="true" (a11y)', () => {
      render(<TermsAcceptanceConfirm termsVersion={TERMS_V1} />);
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox.getAttribute('aria-required')).toBe('true');
    });

    it('"I Agree" button is DISABLED until checkbox is checked', () => {
      render(<TermsAcceptanceConfirm termsVersion={TERMS_V1} />);
      const btn = screen.getByRole('button', { name: /i agree/i });
      expect(btn).toBeDisabled();
    });

    it('"I Agree" button becomes enabled after checkbox is checked', () => {
      render(<TermsAcceptanceConfirm termsVersion={TERMS_V1} />);
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);
      const btn = screen.getByRole('button', { name: /i agree/i });
      expect(btn).not.toBeDisabled();
    });

    it('calls accept mutation on "I Agree" button click (after checking checkbox)', async () => {
      render(<TermsAcceptanceConfirm termsVersion={TERMS_V1} />);
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);
      const btn = screen.getByRole('button', { name: /i agree/i });
      fireEvent.click(btn);

      expect(mockAcceptMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          termsVersion: TERMS_V1,
          route: '/terms',
        })
      );
    });

    it('does NOT call accept mutation when button clicked without checking checkbox', () => {
      render(<TermsAcceptanceConfirm termsVersion={TERMS_V1} />);
      const btn = screen.getByRole('button', { name: /i agree/i });
      fireEvent.click(btn);
      expect(mockAcceptMutate).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Error state
  // -----------------------------------------------------------------------
  describe('error state', () => {
    it('shows error message when mutation fails', () => {
      setMutation({ isError: true });
      render(<TermsAcceptanceConfirm termsVersion={TERMS_V1} />);
      const alert = screen.getByRole('alert');
      expect(alert.textContent).toMatch(/something went wrong/i);
    });
  });

  // -----------------------------------------------------------------------
  // getAcceptance query is only enabled when authenticated (AC-008)
  // -----------------------------------------------------------------------
  describe('query gating (AC-008)', () => {
    it('passes enabled: false to getAcceptance when not authenticated', () => {
      setAuth(false);
      render(<TermsAcceptanceConfirm termsVersion={TERMS_V1} />);
      const calls = mockGetAcceptance.mock.calls;
      // Should be called but with enabled: false (or not at all since the component returns null first)
      if (calls.length > 0) {
        const [, options] = calls[0];
        expect(options?.enabled).toBeFalsy();
      }
    });
  });
});
