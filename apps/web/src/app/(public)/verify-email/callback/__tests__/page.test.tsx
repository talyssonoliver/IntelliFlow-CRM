/**
 * @vitest-environment happy-dom
 *
 * Tests for verify-email/callback page (IFC-120 AC-004).
 * The callback page receives token_hash and type from Supabase,
 * then renders the EmailVerification component.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================
// Mock Setup
// ============================================

const mockUseRedirectIfAuthenticated = vi.fn();
let mockSearchParams: URLSearchParams;

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@intelliflow/ui', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

vi.mock('@/lib/auth/AuthContext', () => ({
  useRedirectIfAuthenticated: (...args: any[]) => mockUseRedirectIfAuthenticated(...args),
}));

// Capture props passed to EmailVerification
let capturedVerificationProps: any = null;

vi.mock('@/components/shared', () => ({
  AuthBackground: ({ children }: any) => <div data-testid="auth-background">{children}</div>,
  AuthCard: ({ children, badge, title, securityBadge }: any) => (
    <div data-testid="auth-card">
      {badge && <span data-testid="auth-card-badge">{badge}</span>}
      {title && <h1 data-testid="auth-card-title">{title}</h1>}
      {securityBadge && <span data-testid="security-badge">{securityBadge}</span>}
      <div data-testid="auth-card-content">{children}</div>
    </div>
  ),
  EmailVerification: (props: any) => {
    capturedVerificationProps = props;
    return <div data-testid="email-verification">Verifying...</div>;
  },
}));

// ============================================
// Import AFTER mocks
// ============================================

import VerifyEmailCallbackPage from '../page';

// ============================================
// Tests
// ============================================

describe('VerifyEmailCallbackPage (IFC-120 AC-004)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedVerificationProps = null;
    mockSearchParams = new URLSearchParams();
  });

  // --- Rendering ---

  describe('Rendering', () => {
    it('renders AuthBackground wrapper', () => {
      render(<VerifyEmailCallbackPage />);
      expect(screen.getByTestId('auth-background')).toBeTruthy();
    });

    it('renders AuthCard with INTELLIFLOW badge', () => {
      render(<VerifyEmailCallbackPage />);
      expect(screen.getByTestId('auth-card-badge').textContent).toBe('INTELLIFLOW');
    });

    it('renders EmailVerification component', () => {
      render(<VerifyEmailCallbackPage />);
      expect(screen.getByTestId('email-verification')).toBeTruthy();
    });

    it('calls useRedirectIfAuthenticated with /dashboard', () => {
      render(<VerifyEmailCallbackPage />);
      expect(mockUseRedirectIfAuthenticated).toHaveBeenCalledWith('/dashboard');
    });

    it('passes security badge to AuthCard', () => {
      render(<VerifyEmailCallbackPage />);
      expect(screen.getByTestId('security-badge').textContent).toContain('256-bit SSL');
    });
  });

  // --- SearchParams Handling ---

  describe('SearchParams Handling', () => {
    it('passes token_hash from searchParams to EmailVerification', () => {
      mockSearchParams = new URLSearchParams('token_hash=abc123hash&type=email');
      render(<VerifyEmailCallbackPage />);
      expect(capturedVerificationProps.tokenHash).toBe('abc123hash');
    });

    it('passes type from searchParams to EmailVerification', () => {
      mockSearchParams = new URLSearchParams('token_hash=abc123hash&type=signup');
      render(<VerifyEmailCallbackPage />);
      expect(capturedVerificationProps.type).toBe('signup');
    });

    it('defaults type to "email" when not specified', () => {
      mockSearchParams = new URLSearchParams('token_hash=abc123hash');
      render(<VerifyEmailCallbackPage />);
      expect(capturedVerificationProps.type).toBe('email');
    });

    it('passes empty string for tokenHash when not in searchParams', () => {
      mockSearchParams = new URLSearchParams();
      render(<VerifyEmailCallbackPage />);
      expect(capturedVerificationProps.tokenHash).toBe('');
    });

    it('passes redirectUrl="/dashboard" to EmailVerification', () => {
      mockSearchParams = new URLSearchParams('token_hash=abc123hash&type=email');
      render(<VerifyEmailCallbackPage />);
      expect(capturedVerificationProps.redirectUrl).toBe('/dashboard');
    });
  });
});
