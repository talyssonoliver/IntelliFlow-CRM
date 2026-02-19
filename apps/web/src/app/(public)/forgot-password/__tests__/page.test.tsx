/**
 * @vitest-environment happy-dom
 */
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================
// Mocks
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
  useRedirectIfAuthenticated: vi.fn(),
}));

const mockCreateResetToken = vi.fn();
const mockCheckRateLimit = vi.fn();
const mockBuildResetUrl = vi.fn();
const mockBuildResetEmailPayload = vi.fn();

vi.mock('@/lib/shared/reset-token', () => ({
  createResetToken: (...args: any[]) => mockCreateResetToken(...args),
  checkRateLimit: (...args: any[]) => mockCheckRateLimit(...args),
  buildResetUrl: (...args: any[]) => mockBuildResetUrl(...args),
}));

vi.mock('@/components/shared', () => ({
  AuthBackground: ({ children }: any) => (
    <div data-testid="auth-background">{children}</div>
  ),
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

// Track props passed to child components
let capturedFormProps: any = null;
let capturedSentProps: any = null;

vi.mock('@/components/shared/reset-email', () => ({
  ForgotPasswordForm: (props: any) => {
    capturedFormProps = props;
    return (
      <form
        data-testid="forgot-password-form"
        onSubmit={(e) => {
          e.preventDefault();
          props.onSubmit('test@example.com');
        }}
      >
        <input data-testid="email-input" disabled={props.isLoading} />
        <button type="submit" data-testid="submit-btn" disabled={props.isLoading}>
          {props.isLoading ? 'Sending...' : 'Send reset link'}
        </button>
      </form>
    );
  },
  ResetEmailSent: (props: any) => {
    capturedSentProps = props;
    return (
      <div data-testid="reset-email-sent">
        <span data-testid="masked-email">{props.email}</span>
        <button
          data-testid="resend-btn"
          onClick={props.onResend}
          disabled={props.isResending || (props.resendCooldown ?? 0) > 0}
        >
          {props.isResending ? 'Resending...' : 'Resend'}
        </button>
        <button data-testid="change-email-btn" onClick={props.onChangeEmail}>
          Use a different email
        </button>
      </div>
    );
  },
  buildResetEmailPayload: (...args: any[]) => mockBuildResetEmailPayload(...args),
}));

import ForgotPasswordPage from '../page';
import { useRedirectIfAuthenticated } from '@/lib/auth/AuthContext';

// ============================================
// Helpers
// ============================================

function setupSuccessfulMocks() {
  mockCheckRateLimit.mockReturnValue({
    remaining: 2,
    resetAt: new Date(Date.now() + 3600000),
    isLimited: false,
  });
  mockCreateResetToken.mockReturnValue({
    ok: true,
    value: {
      token: 'abc123token',
      hashedToken: 'hashed123',
      email: 'test@example.com',
      expiresAt: new Date(Date.now() + 3600000),
      createdAt: new Date(),
    },
  });
  mockBuildResetUrl.mockReturnValue('http://localhost:3000/reset-password/abc123token');
  mockBuildResetEmailPayload.mockReturnValue({
    to: 'test@example.com',
    from: 'noreply@intelliflow.com',
    subject: 'Reset your IntelliFlow password',
    htmlBody: '<html>...</html>',
    textBody: 'Reset...',
    replyTo: 'support@intelliflow.com',
    metadata: { source: 'password_reset', email: 'test@example.com', expiresAt: '2026-01-01T00:00:00.000Z' },
  });
}

/** Submit the form and await handleSubmit to transition to "sent" state */
async function submitAndWaitForSent() {
  render(<ForgotPasswordPage />);

  // Directly await the async handleSubmit (includes 1s simulated delay)
  await act(async () => {
    await capturedFormProps.onSubmit('test@example.com');
  });

  // Verify transition
  expect(screen.getByTestId('reset-email-sent')).toBeTruthy();
}

// ============================================
// Tests
// ============================================

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedFormProps = null;
    capturedSentProps = null;
    setupSuccessfulMocks();
  });

  // --- Rendering ---

  describe('Rendering', () => {
    it('renders forgot password form initially', () => {
      render(<ForgotPasswordPage />);
      expect(screen.getByTestId('forgot-password-form')).toBeTruthy();
    });

    it('wraps content in AuthBackground', () => {
      render(<ForgotPasswordPage />);
      expect(screen.getByTestId('auth-background')).toBeTruthy();
    });

    it('wraps content in AuthCard', () => {
      render(<ForgotPasswordPage />);
      expect(screen.getByTestId('auth-card')).toBeTruthy();
    });

    it('shows badge "INTELLIFLOW" with lock_reset icon', () => {
      render(<ForgotPasswordPage />);
      expect(screen.getByTestId('auth-card-badge').textContent).toBe('INTELLIFLOW');
      expect(screen.getByTestId('auth-card-badge-icon').textContent).toBe('lock_reset');
    });

    it('shows "Forgot your password?" title in form state', () => {
      render(<ForgotPasswordPage />);
      expect(screen.getByTestId('auth-card-title').textContent).toBe('Forgot your password?');
    });

    it('shows description in form state', () => {
      render(<ForgotPasswordPage />);
      expect(screen.getByTestId('auth-card-description').textContent).toContain(
        "we'll send you reset instructions"
      );
    });

    it('shows "Back to sign in" link to /login', () => {
      render(<ForgotPasswordPage />);
      const link = screen.getByText('Back to sign in');
      expect(link).toBeTruthy();
      expect(link.getAttribute('href')).toBe('/login');
    });

    it('shows security note about 1 hour validity', () => {
      render(<ForgotPasswordPage />);
      expect(screen.getByText(/valid for 1 hour/i)).toBeTruthy();
    });

    it('shows "Need help?" link to /support', () => {
      render(<ForgotPasswordPage />);
      const link = screen.getByText('Need help?');
      expect(link).toBeTruthy();
      expect(link.getAttribute('href')).toBe('/support');
    });

    it('calls useRedirectIfAuthenticated on mount', () => {
      render(<ForgotPasswordPage />);
      expect(useRedirectIfAuthenticated).toHaveBeenCalledWith('/dashboard');
    });
  });

  // --- Form Submission ---

  describe('Form Submission', () => {
    it('passes isLoading prop to ForgotPasswordForm', () => {
      render(<ForgotPasswordPage />);
      expect(capturedFormProps.isLoading).toBe(false);
    });

    it('transitions to "sent" state after successful submit', async () => {
      await submitAndWaitForSent();
      expect(screen.getByTestId('reset-email-sent')).toBeTruthy();
    });

    it('shows "Check your email" title in sent state', async () => {
      await submitAndWaitForSent();
      expect(screen.getByTestId('auth-card-title').textContent).toBe('Check your email');
    });

    it('passes email to ResetEmailSent in sent state', async () => {
      await submitAndWaitForSent();
      expect(capturedSentProps).toBeTruthy();
      expect(capturedSentProps.email).toBe('test@example.com');
    });

    it('shows generic error for non-Error throw', async () => {
      mockCheckRateLimit.mockImplementation(() => {
        throw 'unexpected string error';
      });

      render(<ForgotPasswordPage />);

      await act(async () => {
        await capturedFormProps.onSubmit('test@example.com');
      });

      expect(screen.getByText('An error occurred. Please try again.')).toBeTruthy();
    });
  });

  // --- Rate Limiting ---

  describe('Rate Limiting', () => {
    it('shows rate limit error when checkRateLimit returns isLimited', async () => {
      mockCheckRateLimit.mockReturnValue({
        remaining: 0,
        resetAt: new Date(Date.now() + 1800000),
        isLimited: true,
      });

      render(<ForgotPasswordPage />);

      await act(async () => {
        await capturedFormProps.onSubmit('test@example.com');
      });

      expect(screen.getByText(/Too many requests/i)).toBeTruthy();
    });
  });

  // --- Error Handling ---

  describe('Error Handling', () => {
    it('shows error message for failed token creation', async () => {
      mockCreateResetToken.mockReturnValue({
        ok: false,
        error: { code: 'GENERATION_FAILED', message: 'Token generation failed' },
      });

      render(<ForgotPasswordPage />);

      await act(async () => {
        await capturedFormProps.onSubmit('test@example.com');
      });

      expect(screen.getByText('Token generation failed')).toBeTruthy();
    });
  });

  // --- Sent State Actions ---

  describe('Sent State Actions', () => {
    it('"Use a different email" returns to form state', async () => {
      await submitAndWaitForSent();

      await act(async () => {
        screen.getByTestId('change-email-btn').click();
      });

      expect(screen.getByTestId('forgot-password-form')).toBeTruthy();
    });

    it('passes resendCooldown=60 to ResetEmailSent', async () => {
      await submitAndWaitForSent();
      expect(capturedSentProps).toBeTruthy();
      expect(capturedSentProps.resendCooldown).toBe(60);
    });
  });

  // --- Resend Cooldown Timer ---

  describe('Resend Cooldown Timer', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    /** Submit with fake timers: advance past the 1s simulated API delay */
    async function submitWithFakeTimers() {
      render(<ForgotPasswordPage />);

      await act(async () => {
        const promise = capturedFormProps.onSubmit('test@example.com');
        vi.advanceTimersByTime(1100); // resolve the 1s setTimeout
        await promise;
      });

      expect(screen.getByTestId('reset-email-sent')).toBeTruthy();
    }

    it('decrements cooldown every second after submit', async () => {
      await submitWithFakeTimers();
      expect(capturedSentProps.resendCooldown).toBe(60);

      // Advance 1 second
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      expect(capturedSentProps.resendCooldown).toBe(59);

      // Advance 5 more seconds
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
      expect(capturedSentProps.resendCooldown).toBe(54);
    });

    it('stops decrementing at zero', async () => {
      await submitWithFakeTimers();

      // Advance past all 60 seconds
      await act(async () => {
        vi.advanceTimersByTime(61000);
      });
      expect(capturedSentProps.resendCooldown).toBe(0);
    });
  });

  // --- Resend Flow ---

  describe('Resend Flow', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    /** Submit with fake timers: advance past the 1s simulated API delay */
    async function submitWithFakeTimers() {
      render(<ForgotPasswordPage />);

      await act(async () => {
        const promise = capturedFormProps.onSubmit('test@example.com');
        vi.advanceTimersByTime(1100);
        await promise;
      });

      expect(screen.getByTestId('reset-email-sent')).toBeTruthy();
    }

    it('early returns when cooldown is active', async () => {
      await submitWithFakeTimers();
      mockCreateResetToken.mockClear();

      // Try resend while cooldown active
      await act(async () => {
        await capturedSentProps.onResend();
      });

      // createResetToken should NOT be called
      expect(mockCreateResetToken).not.toHaveBeenCalled();
    });

    it('resends successfully after cooldown expires', async () => {
      await submitWithFakeTimers();
      mockCreateResetToken.mockClear();
      mockBuildResetUrl.mockClear();
      mockBuildResetEmailPayload.mockClear();

      // Re-setup mocks for the resend call
      setupSuccessfulMocks();

      // Wait for cooldown to expire
      await act(async () => {
        vi.advanceTimersByTime(61000);
      });
      expect(capturedSentProps.resendCooldown).toBe(0);

      // Now resend (includes 1s simulated delay)
      await act(async () => {
        const promise = capturedSentProps.onResend();
        vi.advanceTimersByTime(1100);
        await promise;
      });

      expect(mockCreateResetToken).toHaveBeenCalledWith('test@example.com');
      expect(mockBuildResetUrl).toHaveBeenCalled();
      expect(mockBuildResetEmailPayload).toHaveBeenCalled();
      // Cooldown resets to 60
      expect(capturedSentProps.resendCooldown).toBe(60);
    });

    it('shows error when resend token creation fails', async () => {
      await submitWithFakeTimers();

      // Wait for cooldown to expire
      await act(async () => {
        vi.advanceTimersByTime(61000);
      });

      // Mock token failure for resend
      mockCreateResetToken.mockReturnValue({
        ok: false,
        error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded' },
      });

      await act(async () => {
        await capturedSentProps.onResend();
      });

      expect(screen.getByText('Rate limit exceeded')).toBeTruthy();
    });

    it('shows generic error for non-Error thrown during resend', async () => {
      await submitWithFakeTimers();

      // Wait for cooldown to expire
      await act(async () => {
        vi.advanceTimersByTime(61000);
      });

      // Mock throwing a non-Error value
      mockCreateResetToken.mockImplementation(() => {
        throw 42;
      });

      await act(async () => {
        await capturedSentProps.onResend();
      });

      expect(screen.getByText('Failed to resend. Please try again.')).toBeTruthy();
    });
  });
});
