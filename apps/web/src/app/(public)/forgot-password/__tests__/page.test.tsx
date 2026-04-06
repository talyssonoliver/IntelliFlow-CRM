/**
 * @vitest-environment happy-dom
 *
 * Forgot Password Page Tests — IFC-120 wired to tRPC
 */
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { metadata } from '../layout';

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

// tRPC mock — requestPasswordReset mutation
const mockMutateAsync = vi.fn();

vi.mock('@/lib/trpc', () => ({
  trpc: {
    auth: {
      requestPasswordReset: {
        useMutation: () => ({
          mutateAsync: (...args: any[]) => mockMutateAsync(...args),
          mutate: (...args: any[]) => mockMutateAsync(...args),
          isPending: false,
          isSuccess: false,
          error: null,
        }),
      },
    },
  },
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
}));

import ForgotPasswordPage from '../page';
import { useRedirectIfAuthenticated } from '@/lib/auth/AuthContext';

// ============================================
// Tests
// ============================================

describe('ForgotPasswordPage (IFC-120)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedFormProps = null;
    capturedSentProps = null;
    mockMutateAsync.mockResolvedValue({ success: true });
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

  // --- Form Submission via tRPC ---

  describe('Form Submission', () => {
    it('passes isLoading prop to ForgotPasswordForm', () => {
      render(<ForgotPasswordPage />);
      expect(capturedFormProps.isLoading).toBe(false);
    });

    it('calls tRPC requestPasswordReset.mutateAsync on submit', async () => {
      render(<ForgotPasswordPage />);

      await act(async () => {
        await capturedFormProps.onSubmit('test@example.com');
      });

      expect(mockMutateAsync).toHaveBeenCalledWith({ email: 'test@example.com' });
    });

    it('transitions to "sent" state after successful submit', async () => {
      render(<ForgotPasswordPage />);

      await act(async () => {
        await capturedFormProps.onSubmit('test@example.com');
      });

      expect(screen.getByTestId('reset-email-sent')).toBeTruthy();
    });

    it('shows "Check your email" title in sent state', async () => {
      render(<ForgotPasswordPage />);

      await act(async () => {
        await capturedFormProps.onSubmit('test@example.com');
      });

      expect(screen.getByTestId('auth-card-title').textContent).toBe('Check your email');
    });

    it('passes email to ResetEmailSent in sent state', async () => {
      render(<ForgotPasswordPage />);

      await act(async () => {
        await capturedFormProps.onSubmit('test@example.com');
      });

      expect(capturedSentProps.email).toBe('test@example.com');
    });
  });

  // --- Rate Limiting (server-side via tRPC) ---

  describe('Rate Limiting', () => {
    it('shows rate limit error for TOO_MANY_REQUESTS (AC-008)', async () => {
      mockMutateAsync.mockRejectedValue({
        data: { code: 'TOO_MANY_REQUESTS' },
        message: 'Too many requests',
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
    it('shows generic error for network failure (NF-002)', async () => {
      mockMutateAsync.mockRejectedValue(new Error('Network error'));

      render(<ForgotPasswordPage />);

      await act(async () => {
        await capturedFormProps.onSubmit('test@example.com');
      });

      expect(screen.getByText('An error occurred. Please try again.')).toBeTruthy();
    });
  });

  // --- Sent State Actions ---

  describe('Sent State Actions', () => {
    async function submitAndWaitForSent() {
      render(<ForgotPasswordPage />);
      await act(async () => {
        await capturedFormProps.onSubmit('test@example.com');
      });
      expect(screen.getByTestId('reset-email-sent')).toBeTruthy();
    }

    it('"Use a different email" returns to form state', async () => {
      await submitAndWaitForSent();

      await act(async () => {
        screen.getByTestId('change-email-btn').click();
      });

      expect(screen.getByTestId('forgot-password-form')).toBeTruthy();
    });

    it('passes resendCooldown=60 to ResetEmailSent', async () => {
      await submitAndWaitForSent();
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

    it('decrements cooldown every second after submit', async () => {
      render(<ForgotPasswordPage />);

      await act(async () => {
        await capturedFormProps.onSubmit('test@example.com');
      });

      expect(capturedSentProps.resendCooldown).toBe(60);

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      expect(capturedSentProps.resendCooldown).toBe(59);

      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
      expect(capturedSentProps.resendCooldown).toBe(54);
    });

    it('stops decrementing at zero', async () => {
      render(<ForgotPasswordPage />);

      await act(async () => {
        await capturedFormProps.onSubmit('test@example.com');
      });

      await act(async () => {
        vi.advanceTimersByTime(61000);
      });
      expect(capturedSentProps.resendCooldown).toBe(0);
    });
  });

  // --- Resend Flow (via tRPC) ---

  describe('Resend Flow', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('early returns when cooldown is active', async () => {
      render(<ForgotPasswordPage />);

      await act(async () => {
        await capturedFormProps.onSubmit('test@example.com');
      });

      mockMutateAsync.mockClear();

      // Resend while cooldown active
      await act(async () => {
        await capturedSentProps.onResend();
      });

      expect(mockMutateAsync).not.toHaveBeenCalled();
    });

    it('resends successfully via tRPC after cooldown expires', async () => {
      render(<ForgotPasswordPage />);

      await act(async () => {
        await capturedFormProps.onSubmit('test@example.com');
      });

      mockMutateAsync.mockClear();

      // Wait for cooldown to expire
      await act(async () => {
        vi.advanceTimersByTime(61000);
      });
      expect(capturedSentProps.resendCooldown).toBe(0);

      // Resend
      await act(async () => {
        await capturedSentProps.onResend();
      });

      expect(mockMutateAsync).toHaveBeenCalledWith({ email: 'test@example.com' });
      expect(capturedSentProps.resendCooldown).toBe(60);
    });

    it('shows rate limit error on resend', async () => {
      render(<ForgotPasswordPage />);

      await act(async () => {
        await capturedFormProps.onSubmit('test@example.com');
      });

      await act(async () => {
        vi.advanceTimersByTime(61000);
      });

      mockMutateAsync.mockRejectedValueOnce({
        data: { code: 'TOO_MANY_REQUESTS' },
        message: 'Too many requests',
      });

      await act(async () => {
        await capturedSentProps.onResend();
      });

      expect(screen.getByText(/Too many requests/i)).toBeTruthy();
    });

    it('shows generic error on resend failure', async () => {
      render(<ForgotPasswordPage />);

      await act(async () => {
        await capturedFormProps.onSubmit('test@example.com');
      });

      await act(async () => {
        vi.advanceTimersByTime(61000);
      });

      mockMutateAsync.mockRejectedValueOnce(new Error('Network error'));

      await act(async () => {
        await capturedSentProps.onResend();
      });

      expect(screen.getByText('Failed to resend. Please try again.')).toBeTruthy();
    });
  });

  describe('Forgot Password Metadata', () => {
    it('should have correct SEO metadata', () => {
      expect(metadata.title).toBe('Forgot Password');
      expect(metadata.description).toContain('IntelliFlow CRM');
      expect(metadata.description).toContain('reset');
    });

    it('should have Open Graph metadata', () => {
      expect(metadata.openGraph).toBeDefined();
      expect(metadata.openGraph?.url).toBe('https://intelliflow-crm.com/forgot-password');
      expect(metadata.openGraph?.siteName).toBe('IntelliFlow CRM');
      expect((metadata.openGraph as Record<string, unknown>)?.type).toBe('website');
    });

    it('should have Twitter metadata', () => {
      expect(metadata.twitter).toBeDefined();
      expect((metadata.twitter as Record<string, unknown>)?.card).toBe('summary_large_image');
      expect(metadata.twitter?.title).toBeDefined();
    });

    it('should have canonical URL', () => {
      expect(metadata.alternates?.canonical).toBe('/forgot-password');
    });
  });
});
