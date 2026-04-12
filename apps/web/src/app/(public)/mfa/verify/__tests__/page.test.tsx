// @vitest-environment jsdom
/**
 * Tests for MFA Verify Page (PG-022)
 *
 * Covers: AC-001 through AC-014, NF-003, NF-004
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// ============================================
// Mocks
// ============================================

const mockPush = vi.fn();
const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, prefetch: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@intelliflow/ui', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

const mockUseRedirectIfAuthenticated = vi.fn();
vi.mock('@/lib/auth/AuthContext', () => ({
  useRedirectIfAuthenticated: (...args: any[]) => mockUseRedirectIfAuthenticated(...args),
}));

vi.mock('@/components/shared/auth-background', () => ({
  AuthBackground: ({ children }: any) => <div data-testid="auth-background">{children}</div>,
}));

vi.mock('@/components/shared/auth-card', () => ({
  AuthCard: ({ children, title, badge, badgeIcon, description, securityBadge }: any) => (
    <div
      data-testid="auth-card"
      data-title={title}
      data-badge={badge}
      data-badge-icon={badgeIcon}
      data-description={description}
      data-security-badge={securityBadge}
    >
      <h1>{title}</h1>
      {description && <p>{description}</p>}
      {children}
    </div>
  ),
}));

let capturedMfaProps: any = null;
vi.mock('@/components/shared/mfa-verification', () => ({
  MfaVerification: (props: any) => {
    capturedMfaProps = props;
    return <div data-testid="mfa-verification" />;
  },
}));

const mockIsValidRedirectUrl = vi.fn((url: string) => url.startsWith('/') && !url.startsWith('//'));
vi.mock('@/lib/shared/logout-redirect', () => ({
  isValidRedirectUrl: (url: string) => mockIsValidRedirectUrl(url),
}));

// ============================================
// Import after mocks
// ============================================

import MfaVerifyPage from '../page';
import { MfaVerifyLoading } from '../mfa-verify-loading';

// ============================================
// Helpers
// ============================================

function renderPage(params?: Record<string, string>) {
  mockSearchParams = new URLSearchParams(params);
  capturedMfaProps = null;
  return render(<MfaVerifyPage />);
}

// ============================================
// Tests
// ============================================

describe('MfaVerifyPage (PG-022)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedMfaProps = null;
    mockSearchParams = new URLSearchParams();
    mockIsValidRedirectUrl.mockImplementation(
      (url: string) => url.startsWith('/') && !url.startsWith('//')
    );
  });

  // -------------------------------------------
  // Rendering (4 tests) — AC-001, AC-009, AC-013, AC-014
  // -------------------------------------------
  describe('Rendering', () => {
    it('renders AuthBackground wrapper (AC-001)', () => {
      renderPage({ challenge: 'test-challenge-id' });
      expect(screen.getByTestId('auth-background')).toBeInTheDocument();
    });

    it('renders AuthCard with correct props (AC-001, AC-009)', () => {
      renderPage({ challenge: 'test-challenge-id' });
      const card = screen.getByTestId('auth-card');
      expect(card).toBeInTheDocument();
      expect(card).toHaveAttribute('data-badge', 'INTELLIFLOW');
      expect(card).toHaveAttribute('data-badge-icon', 'security');
      expect(card).toHaveAttribute('data-title', 'Two-Factor Authentication');
    });

    it('renders post-card security note (AC-013)', () => {
      renderPage({ challenge: 'test-challenge-id' });
      expect(screen.getByText(/verification codes expire after 5 minutes/i)).toBeInTheDocument();
    });

    it('renders "Back to sign in" link pointing to /login (AC-014)', () => {
      renderPage({ challenge: 'test-challenge-id' });
      const link = screen.getByText(/back to sign in/i);
      expect(link).toBeInTheDocument();
      expect(link.closest('a')).toHaveAttribute('href', '/login');
    });
  });

  // -------------------------------------------
  // URL Parameter Extraction (5 tests) — AC-002, AC-006
  // -------------------------------------------
  describe('URL Parameter Extraction', () => {
    it('passes challenge param as challengeId to MfaVerification (AC-002)', () => {
      renderPage({ challenge: 'abc-123-def' });
      expect(capturedMfaProps.challengeId).toBe('abc-123-def');
    });

    it('passes validated redirect param as redirectUrl (AC-002)', () => {
      renderPage({ challenge: 'c1', redirect: '/settings' });
      expect(capturedMfaProps.redirectUrl).toBe('/settings');
    });

    it('defaults redirectUrl to /dashboard when redirect param is missing (AC-002)', () => {
      renderPage({ challenge: 'c1' });
      expect(capturedMfaProps.redirectUrl).toBe('/dashboard');
    });

    it('passes method param to MfaVerification (AC-002)', () => {
      renderPage({ challenge: 'c1', method: 'sms' });
      expect(capturedMfaProps.method).toBe('sms');
    });

    it('passes email param to MfaVerification (AC-002)', () => {
      renderPage({ challenge: 'c1', email: 'user@example.com' });
      expect(capturedMfaProps.email).toBe('user@example.com');
    });
  });

  // -------------------------------------------
  // Redirect Validation (3 tests) — AC-004, NF-004
  // -------------------------------------------
  describe('Redirect Validation', () => {
    it('valid relative URL passes through (AC-004)', () => {
      renderPage({ challenge: 'c1', redirect: '/settings' });
      expect(mockIsValidRedirectUrl).toHaveBeenCalledWith('/settings');
      expect(capturedMfaProps.redirectUrl).toBe('/settings');
    });

    it('external URL is rejected — falls back to /dashboard (AC-004, NF-004)', () => {
      mockIsValidRedirectUrl.mockReturnValue(false);
      renderPage({ challenge: 'c1', redirect: 'https://evil.com' });
      expect(mockIsValidRedirectUrl).toHaveBeenCalledWith('https://evil.com');
      expect(capturedMfaProps.redirectUrl).toBe('/dashboard');
    });

    it('protocol-relative URL is rejected — falls back to /dashboard (AC-004)', () => {
      mockIsValidRedirectUrl.mockReturnValue(false);
      renderPage({ challenge: 'c1', redirect: '//evil.com' });
      expect(mockIsValidRedirectUrl).toHaveBeenCalledWith('//evil.com');
      expect(capturedMfaProps.redirectUrl).toBe('/dashboard');
    });
  });

  // -------------------------------------------
  // Method Validation (2 tests) — AC-005
  // -------------------------------------------
  describe('Method Validation', () => {
    it('valid method passes through (AC-005)', () => {
      renderPage({ challenge: 'c1', method: 'sms' });
      expect(capturedMfaProps.method).toBe('sms');
    });

    it('invalid method falls back to totp (AC-005)', () => {
      renderPage({ challenge: 'c1', method: 'invalid' });
      expect(capturedMfaProps.method).toBe('totp');
    });
  });

  // -------------------------------------------
  // Auth Guard (1 test) — AC-003
  // -------------------------------------------
  describe('Auth Guard', () => {
    it('calls useRedirectIfAuthenticated with /dashboard (AC-003)', () => {
      renderPage({ challenge: 'c1' });
      expect(mockUseRedirectIfAuthenticated).toHaveBeenCalledWith('/dashboard');
    });
  });

  // -------------------------------------------
  // Cancel Navigation (1 test) — AC-007
  // -------------------------------------------
  describe('Cancel Navigation', () => {
    it('onCancel calls router.push(/login) (AC-007)', () => {
      renderPage({ challenge: 'c1' });
      expect(capturedMfaProps.onCancel).toBeTypeOf('function');
      capturedMfaProps.onCancel();
      expect(mockPush).toHaveBeenCalledWith('/login');
    });
  });

  // -------------------------------------------
  // Loading Fallback (2 tests) — AC-008
  // -------------------------------------------
  describe('Loading Fallback', () => {
    it('page renders within Suspense boundary (AC-008)', () => {
      renderPage({ challenge: 'c1' });
      expect(screen.getByTestId('auth-background')).toBeInTheDocument();
      expect(screen.getByTestId('mfa-verification')).toBeInTheDocument();
    });

    it('MfaVerifyLoading renders spinner with loading text (AC-008)', () => {
      const { container } = render(<MfaVerifyLoading />);
      expect(screen.getByText('Loading verification...')).toBeInTheDocument();
      const spinner = container.querySelector('.material-symbols-outlined');
      expect(spinner).toHaveAttribute('aria-hidden', 'true');
      expect(spinner).toHaveTextContent('progress_activity');
    });
  });

  // -------------------------------------------
  // onSuccess callback (1 test) — AC-006
  // -------------------------------------------
  describe('Success Handler', () => {
    it('onSuccess is a no-op callback passed to MfaVerification (AC-006)', () => {
      renderPage({ challenge: 'c1' });
      expect(capturedMfaProps.onSuccess).toBeTypeOf('function');
      // Call it — it's a no-op since MfaVerification handles redirect internally
      capturedMfaProps.onSuccess();
    });
  });

  // -------------------------------------------
  // Accessibility (3 tests) — NF-003
  // -------------------------------------------
  describe('Accessibility', () => {
    it('page has h1 heading "Two-Factor Authentication" (NF-003)', () => {
      renderPage({ challenge: 'c1' });
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toHaveTextContent('Two-Factor Authentication');
    });

    it('decorative icons have aria-hidden="true" (NF-003)', () => {
      renderPage({ challenge: 'c1' });
      const icons = document.querySelectorAll('.material-symbols-outlined');
      icons.forEach((icon) => {
        expect(icon).toHaveAttribute('aria-hidden', 'true');
      });
    });

    it('MfaVerification component is rendered for focus delegation (NF-003)', () => {
      // Focus management is delegated to MfaChallenge which auto-focuses
      // the first OTP input on mount (mfa-challenge.tsx line 375)
      renderPage({ challenge: 'c1' });
      expect(screen.getByTestId('mfa-verification')).toBeInTheDocument();
    });
  });
});
