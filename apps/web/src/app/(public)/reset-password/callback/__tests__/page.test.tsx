/**
 * @vitest-environment happy-dom
 *
 * Tests for reset-password/callback page (IFC-120 AC-002).
 * The callback page receives access_token from Supabase,
 * clears it from the URL, and renders the password reset form.
 */
import { render, screen, act } from '@testing-library/react';
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

// Mock PasswordResetForm and ResetSuccess
let capturedFormProps: any = null;
vi.mock('@/components/shared/password-reset', () => ({
  PasswordResetForm: (props: any) => {
    capturedFormProps = props;
    return <form data-testid="password-reset-form" />;
  },
  ResetSuccess: () => {
    return <div data-testid="reset-success">Password reset successful</div>;
  },
}));

vi.mock('@/components/shared', () => ({
  AuthBackground: ({ children }: any) => <div data-testid="auth-background">{children}</div>,
  AuthCard: ({ children, badge, title, description, footer }: any) => (
    <div data-testid="auth-card">
      {badge && <span data-testid="auth-card-badge">{badge}</span>}
      {title && <h1 data-testid="auth-card-title">{title}</h1>}
      {description && <p data-testid="auth-card-description">{description}</p>}
      <div data-testid="auth-card-content">{children}</div>
      {footer && <div data-testid="auth-card-footer">{footer}</div>}
    </div>
  ),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    auth: {
      resetPassword: {
        useMutation: () => ({
          mutateAsync: vi.fn(),
          isPending: false,
          isSuccess: false,
          error: null,
        }),
      },
    },
  },
}));

// ============================================
// Import AFTER mocks
// ============================================

import ResetPasswordCallbackPage from '../page';

// ============================================
// Tests
// ============================================

describe('ResetPasswordCallbackPage (IFC-120 AC-002)', () => {
  const mockReplaceState = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    capturedFormProps = null;
    mockSearchParams = new URLSearchParams();
    // Mock window.history.replaceState
    Object.defineProperty(window, 'history', {
      value: { replaceState: mockReplaceState },
      writable: true,
    });
  });

  // --- Invalid State (no token) ---

  describe('Invalid State (no access_token)', () => {
    it('renders AuthBackground', () => {
      render(<ResetPasswordCallbackPage />);
      expect(screen.getByTestId('auth-background')).toBeTruthy();
    });

    it('shows "Invalid Reset Link" title when no token', () => {
      render(<ResetPasswordCallbackPage />);
      expect(screen.getByTestId('auth-card-title').textContent).toBe('Invalid Reset Link');
    });

    it('shows explanation about invalid/expired link', () => {
      render(<ResetPasswordCallbackPage />);
      expect(screen.getByText(/invalid or has expired/i)).toBeTruthy();
    });

    it('shows "Request a new link" button linking to /forgot-password', () => {
      render(<ResetPasswordCallbackPage />);
      const link = screen.getByText('Request a new link');
      expect(link).toBeTruthy();
      expect(link.getAttribute('href')).toBe('/forgot-password');
    });

    it('shows "Back to sign in" link to /login', () => {
      render(<ResetPasswordCallbackPage />);
      const link = screen.getByText('Back to sign in');
      expect(link).toBeTruthy();
      expect(link.getAttribute('href')).toBe('/login');
    });

    it('does not render password reset form', () => {
      render(<ResetPasswordCallbackPage />);
      expect(screen.queryByTestId('password-reset-form')).toBeNull();
    });

    it('calls useRedirectIfAuthenticated with /dashboard', () => {
      render(<ResetPasswordCallbackPage />);
      expect(mockUseRedirectIfAuthenticated).toHaveBeenCalledWith('/dashboard');
    });
  });

  // --- Form State (has access_token) ---

  describe('Form State (with access_token)', () => {
    beforeEach(() => {
      mockSearchParams = new URLSearchParams('access_token=test-token-abc123&type=recovery');
    });

    it('renders PasswordResetForm when access_token is present', () => {
      render(<ResetPasswordCallbackPage />);
      expect(screen.getByTestId('password-reset-form')).toBeTruthy();
    });

    it('passes access_token as token prop to PasswordResetForm', () => {
      render(<ResetPasswordCallbackPage />);
      expect(capturedFormProps.token).toBe('test-token-abc123');
    });

    it('passes onSuccess callback to PasswordResetForm', () => {
      render(<ResetPasswordCallbackPage />);
      expect(typeof capturedFormProps.onSuccess).toBe('function');
    });

    it('shows "Create new password" title', () => {
      render(<ResetPasswordCallbackPage />);
      expect(screen.getByTestId('auth-card-title').textContent).toBe('Create new password');
    });

    it('shows description about new password requirement', () => {
      render(<ResetPasswordCallbackPage />);
      expect(screen.getByTestId('auth-card-description').textContent).toContain(
        'must be different'
      );
    });

    it('clears tokens from URL for security (R-002)', () => {
      render(<ResetPasswordCallbackPage />);
      expect(mockReplaceState).toHaveBeenCalledWith({}, '', '/reset-password/callback');
    });

    it('shows security info about single-use and expiry', () => {
      render(<ResetPasswordCallbackPage />);
      expect(screen.getByText(/only be used once/i)).toBeTruthy();
    });
  });

  // --- Success State ---

  describe('Success State', () => {
    beforeEach(() => {
      mockSearchParams = new URLSearchParams('access_token=test-token-abc123');
    });

    it('transitions to success state when onSuccess is called', () => {
      render(<ResetPasswordCallbackPage />);

      // Trigger the success callback
      act(() => {
        capturedFormProps.onSuccess();
      });

      expect(screen.getByTestId('reset-success')).toBeTruthy();
    });

    it('shows "Password Reset" title in success state', () => {
      render(<ResetPasswordCallbackPage />);

      act(() => {
        capturedFormProps.onSuccess();
      });

      expect(screen.getByTestId('auth-card-title').textContent).toBe('Password Reset');
    });
  });
});
