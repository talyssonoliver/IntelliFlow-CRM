/**
 * @vitest-environment happy-dom
 *
 * Page-level integration tests for PG-020 Reset Password page.
 * Tests token validation state machine, component composition, and UI elements.
 *
 * Mock Strategy (PG-019 pattern):
 *   - External vi.fn() variables declared BEFORE vi.mock() calls
 *   - Wrapper functions inside vi.mock() factory that call external mocks
 *   - beforeEach resets and configures mock return values
 *   - React.use() handled via resolved thenable (React 19 pattern)
 */
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================
// Mock Setup — External vi.fn() BEFORE vi.mock()
// ============================================

const mockValidateResetToken = vi.fn();
const mockUseRedirectIfAuthenticated = vi.fn();

const VALID_TOKEN = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6'; // 32 chars
const SHORT_TOKEN = 'short-token'; // < 32 chars
const VALID_EMAIL = 'te***@example.com';
const VALID_EXPIRES = new Date(Date.now() + 3600000);

/**
 * Creates a thenable that React.use() treats as already resolved.
 * React 19 checks for status === 'fulfilled' to skip suspension.
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

let currentToken = VALID_TOKEN;

// ============================================
// vi.mock() calls (hoisted by Vitest)
// ============================================

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

vi.mock('@/lib/shared/reset-token', () => ({
  validateResetToken: (...args: any[]) => mockValidateResetToken(...args),
}));

// Track props passed to PasswordResetForm
let capturedFormProps: any = null;

vi.mock('@/components/shared/password-reset', () => ({
  PasswordResetForm: (props: any) => {
    capturedFormProps = props;
    return (
      <form data-testid="password-reset-form">
        <span data-testid="form-token">{props.token}</span>
        <span data-testid="form-email">{props.email}</span>
        <button data-testid="success-btn" onClick={props.onSuccess}>
          Submit
        </button>
      </form>
    );
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
  AuthCard: ({ children, badge, badgeIcon, title, description, footer }: any) => (
    <div data-testid="auth-card">
      {badge && <span data-testid="auth-card-badge">{badge}</span>}
      {badgeIcon && <span data-testid="auth-card-badge-icon">{badgeIcon}</span>}
      {title && <h1 data-testid="auth-card-title">{title}</h1>}
      {description && <p data-testid="auth-card-description">{description}</p>}
      <div data-testid="auth-card-content">{children}</div>
      {footer && <div data-testid="auth-card-footer">{footer}</div>}
    </div>
  ),
}));

// ============================================
// Import component AFTER all vi.mock() calls
// ============================================

import ResetPasswordPage from '../[token]/page';

// ============================================
// Helpers
// ============================================

function setupValidToken() {
  currentToken = VALID_TOKEN;
  mockValidateResetToken.mockReturnValue({
    ok: true,
    value: { email: VALID_EMAIL, expiresAt: VALID_EXPIRES },
  });
}

function setupInvalidToken(code: string) {
  currentToken = VALID_TOKEN;
  mockValidateResetToken.mockReturnValue({
    ok: false,
    error: { code, message: `Token ${code.toLowerCase()}` },
  });
}

function renderPage() {
  const params = resolvedThenable({ token: currentToken });
  return render(<ResetPasswordPage params={params} />);
}

// ============================================
// Tests (18 cases)
// ============================================

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedFormProps = null;
    setupValidToken();
  });

  // --- Wrapper Components (AC-008, NF-002) ---

  describe('Wrapper Components', () => {
    it('renders AuthBackground wrapper', () => {
      renderPage();
      expect(screen.getByTestId('auth-background')).toBeTruthy();
    });

    it('renders AuthCard with INTELLIFLOW badge', () => {
      renderPage();
      expect(screen.getByTestId('auth-card')).toBeTruthy();
      expect(screen.getByTestId('auth-card-badge').textContent).toBe('INTELLIFLOW');
    });

    it('calls useRedirectIfAuthenticated with /dashboard', () => {
      renderPage();
      expect(mockUseRedirectIfAuthenticated).toHaveBeenCalledWith('/dashboard');
    });
  });

  // --- Token Validation — Invalid States (AC-002) ---

  describe('Token Validation — Invalid States', () => {
    it('shows invalid state for short tokens (< 32 chars)', () => {
      currentToken = SHORT_TOKEN;
      renderPage();
      const el = screen.getByTestId('token-invalid');
      expect(el.getAttribute('data-reason')).toBe('invalid');
      expect(mockValidateResetToken).not.toHaveBeenCalled();
    });

    it('shows invalid state when validateResetToken returns INVALID', () => {
      setupInvalidToken('INVALID');
      renderPage();
      expect(screen.getByTestId('token-invalid').getAttribute('data-reason')).toBe('invalid');
    });

    it('shows expired state when validateResetToken returns EXPIRED', () => {
      setupInvalidToken('EXPIRED');
      renderPage();
      expect(screen.getByTestId('token-invalid').getAttribute('data-reason')).toBe('expired');
    });

    it('shows used state when validateResetToken returns ALREADY_USED', () => {
      setupInvalidToken('ALREADY_USED');
      renderPage();
      expect(screen.getByTestId('token-invalid').getAttribute('data-reason')).toBe('used');
    });
  });

  // --- Valid Token — Form State (AC-001, AC-006) ---

  describe('Valid Token — Form State', () => {
    it('renders PasswordResetForm for valid tokens', () => {
      renderPage();
      expect(screen.getByTestId('password-reset-form')).toBeTruthy();
    });

    it('passes correct token to PasswordResetForm', () => {
      renderPage();
      expect(capturedFormProps).toBeTruthy();
      expect(capturedFormProps.token).toBe(VALID_TOKEN);
    });

    it('passes email and expiresAt to PasswordResetForm', () => {
      renderPage();
      expect(capturedFormProps.email).toBe(VALID_EMAIL);
      expect(capturedFormProps.expiresAt).toBe(VALID_EXPIRES);
    });

    it('transitions to success state on form onSuccess', async () => {
      renderPage();
      expect(screen.getByTestId('password-reset-form')).toBeTruthy();

      await act(async () => {
        capturedFormProps.onSuccess();
      });

      expect(screen.getByTestId('reset-success')).toBeTruthy();
      expect(screen.queryByTestId('password-reset-form')).toBeNull();
    });
  });

  // --- Page Titles (AC-001, AC-002) ---

  describe('Page Titles', () => {
    it('shows "Create new password" in form state', () => {
      renderPage();
      expect(screen.getByTestId('auth-card-title').textContent).toBe('Create new password');
    });

    it('shows "Reset Link Problem" in error states', () => {
      setupInvalidToken('EXPIRED');
      renderPage();
      expect(screen.getByTestId('auth-card-title').textContent).toBe('Reset Link Problem');
    });

    it('shows "Password Reset" in success state', async () => {
      renderPage();
      await act(async () => {
        capturedFormProps.onSuccess();
      });
      expect(screen.getByTestId('auth-card-title').textContent).toBe('Password Reset');
    });
  });

  // --- Page Content (AC-001, NF-002) ---

  describe('Page Content', () => {
    it('shows description in form state', () => {
      renderPage();
      const desc = screen.getByTestId('auth-card-description');
      expect(desc.textContent).toContain('different from previously used');
    });

    it('shows security note only in form state', () => {
      renderPage();
      expect(screen.getByText(/can only be used once/)).toBeTruthy();
    });

    it('shows help link with /support href', () => {
      const { container } = renderPage();
      const supportLink = container.querySelector('a[href="/support"]');
      expect(supportLink).toBeTruthy();
      expect(supportLink?.textContent).toContain('Need help?');
    });

    it('shows "Back to sign in" footer in non-success states', () => {
      renderPage();
      const footer = screen.getByTestId('auth-card-footer');
      expect(footer).toBeTruthy();
      const link = footer.querySelector('a[href="/login"]');
      expect(link).toBeTruthy();
      expect(link?.textContent).toContain('Back to sign in');
    });
  });
});
