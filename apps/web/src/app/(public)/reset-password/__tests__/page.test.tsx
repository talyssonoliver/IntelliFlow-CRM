/**
 * @vitest-environment happy-dom
 *
 * Tests for reset-password/[token] legacy route (IFC-120).
 * The [token] route now redirects to /forgot-password, and the
 * ResetPasswordClient always shows "invalid" state since tokens
 * are handled via /reset-password/callback.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================
// Mock Setup
// ============================================

const mockUseRedirectIfAuthenticated = vi.fn();

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

let _capturedFormProps: any = null;

vi.mock('@/components/shared/password-reset', () => ({
  PasswordResetForm: (props: any) => {
    _capturedFormProps = props;
    return <form data-testid="password-reset-form" />;
  },
  ResetSuccess: () => <div data-testid="reset-success">Password reset successful</div>,
  TokenInvalid: ({ reason }: any) => (
    <div data-testid="token-invalid" data-reason={reason}>
      Token Invalid: {reason}
    </div>
  ),
}));

vi.mock('@/components/shared', () => ({
  AuthBackground: ({ children }: any) => <div data-testid="auth-background">{children}</div>,
  AuthCard: ({ children, badge, _badgeIcon, title, description, footer }: any) => (
    <div data-testid="auth-card">
      {badge && <span data-testid="auth-card-badge">{badge}</span>}
      {title && <h1 data-testid="auth-card-title">{title}</h1>}
      {description && <p data-testid="auth-card-description">{description}</p>}
      <div data-testid="auth-card-content">{children}</div>
      {footer && <div data-testid="auth-card-footer">{footer}</div>}
    </div>
  ),
}));

/**
 * Creates a thenable that React.use() treats as already resolved.
 */
function resolvedThenable<T>(value: T): Promise<T> {
  const thenable = Promise.resolve(value) as Promise<T> & {
    status: string;
    value: T;
  };
  thenable.status = 'fulfilled';
  thenable.value = value;
  return thenable;
}

// ============================================
// Import component AFTER all vi.mock() calls
// ============================================

import ResetPasswordPage from '../[token]/ResetPasswordClient';

// ============================================
// Tests
// ============================================

describe('ResetPasswordClient (IFC-120 legacy)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _capturedFormProps = null;
  });

  // --- Wrapper Components ---

  describe('Wrapper Components', () => {
    it('renders AuthBackground wrapper', () => {
      render(
        <ResetPasswordPage
          params={resolvedThenable({ token: 'validtoken12345678901234567890ab' })}
        />
      );
      expect(screen.getByTestId('auth-background')).toBeTruthy();
    });

    it('renders AuthCard with INTELLIFLOW badge', () => {
      render(
        <ResetPasswordPage
          params={resolvedThenable({ token: 'validtoken12345678901234567890ab' })}
        />
      );
      expect(screen.getByTestId('auth-card')).toBeTruthy();
      expect(screen.getByTestId('auth-card-badge').textContent).toBe('INTELLIFLOW');
    });

    it('calls useRedirectIfAuthenticated with /dashboard', () => {
      render(
        <ResetPasswordPage
          params={resolvedThenable({ token: 'validtoken12345678901234567890ab' })}
        />
      );
      expect(mockUseRedirectIfAuthenticated).toHaveBeenCalledWith('/dashboard');
    });
  });

  // --- Legacy Token Handling ---

  describe('Legacy Token Handling', () => {
    it('shows invalid state for all tokens (legacy route)', () => {
      render(
        <ResetPasswordPage
          params={resolvedThenable({ token: 'any-valid-looking-token-here-1234567890' })}
        />
      );
      const el = screen.getByTestId('token-invalid');
      expect(el.getAttribute('data-reason')).toBe('invalid');
    });

    it('shows invalid state for short tokens (< 20 chars)', () => {
      render(<ResetPasswordPage params={resolvedThenable({ token: 'short' })} />);
      const el = screen.getByTestId('token-invalid');
      expect(el.getAttribute('data-reason')).toBe('invalid');
    });

    it('does not render PasswordResetForm (form state unreachable)', () => {
      render(
        <ResetPasswordPage
          params={resolvedThenable({ token: 'validtoken12345678901234567890ab' })}
        />
      );
      expect(screen.queryByTestId('password-reset-form')).toBeNull();
    });
  });

  // --- Page Title ---

  describe('Page Title', () => {
    it('shows "Reset Link Problem" title for invalid state', () => {
      render(
        <ResetPasswordPage
          params={resolvedThenable({ token: 'validtoken12345678901234567890ab' })}
        />
      );
      expect(screen.getByTestId('auth-card-title').textContent).toBe('Reset Link Problem');
    });
  });

  // --- Footer ---

  describe('Footer', () => {
    it('shows "Back to sign in" footer', () => {
      render(
        <ResetPasswordPage
          params={resolvedThenable({ token: 'validtoken12345678901234567890ab' })}
        />
      );
      const footer = screen.getByText('Back to sign in');
      expect(footer).toBeTruthy();
      expect(footer.getAttribute('href')).toBe('/login');
    });
  });
});
