/**
 * @vitest-environment happy-dom
 *
 * Tests for verify-email/[token] legacy page (IFC-120).
 * The [token] page is now a backward-compatibility route that shows
 * "invalid link" and offers a resend option.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { metadata } from '../layout';

// ============================================
// Mock Setup
// ============================================

const mockUseRedirectIfAuthenticated = vi.fn();

vi.mock('@intelliflow/ui', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

vi.mock('@/lib/auth/AuthContext', () => ({
  useRedirectIfAuthenticated: (...args: any[]) => mockUseRedirectIfAuthenticated(...args),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock useSearchParams
let mockSearchParams: URLSearchParams;

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

// tRPC mock
const mockResendMutateAsync = vi.fn();
vi.mock('@/lib/trpc', () => ({
  trpc: {
    auth: {
      resendVerification: {
        useMutation: () => ({
          mutateAsync: (...args: any[]) => mockResendMutateAsync(...args),
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
  AuthCard: ({ children, badge, title }: any) => (
    <div data-testid="auth-card">
      {badge && <span data-testid="auth-card-badge">{badge}</span>}
      {title && <h1 data-testid="auth-card-title">{title}</h1>}
      <div data-testid="auth-card-content">{children}</div>
    </div>
  ),
}));

// ============================================
// Import AFTER mocks
// ============================================

import LegacyEmailVerifyPage from '../[token]/page';

// ============================================
// Tests
// ============================================

describe('LegacyEmailVerifyPage (IFC-120)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    mockResendMutateAsync.mockResolvedValue({ success: true });
  });

  it('renders AuthBackground wrapper', () => {
    render(<LegacyEmailVerifyPage />);
    expect(screen.getByTestId('auth-background')).toBeDefined();
  });

  it('renders AuthCard with title "Invalid Verification Link"', () => {
    render(<LegacyEmailVerifyPage />);
    expect(screen.getByTestId('auth-card-title').textContent).toBe('Invalid Verification Link');
  });

  it('shows explanation message about unsupported link format', () => {
    render(<LegacyEmailVerifyPage />);
    expect(screen.getByText(/no longer supported/i)).toBeDefined();
  });

  it('shows "Back to sign in" link', () => {
    render(<LegacyEmailVerifyPage />);
    expect(screen.getByText(/back to sign in/i)).toBeDefined();
  });

  it('calls useRedirectIfAuthenticated with /dashboard', () => {
    render(<LegacyEmailVerifyPage />);
    expect(mockUseRedirectIfAuthenticated).toHaveBeenCalledWith('/dashboard');
  });

  it('shows resend button when email is in search params', () => {
    mockSearchParams = new URLSearchParams('email=test@example.com');
    render(<LegacyEmailVerifyPage />);
    expect(screen.getByText(/resend verification email/i)).toBeDefined();
  });

  it('does not show resend button when no email in search params', () => {
    mockSearchParams = new URLSearchParams();
    render(<LegacyEmailVerifyPage />);
    expect(screen.queryByText(/resend verification email/i)).toBeNull();
  });

  describe('Verify Email Metadata', () => {
    it('should have correct SEO metadata', () => {
      expect(metadata.title).toBe('Verify Email');
      expect(metadata.description).toContain('IntelliFlow CRM');
      expect(metadata.description).toContain('Verify');
    });

    it('should have Open Graph metadata', () => {
      expect(metadata.openGraph).toBeDefined();
      expect(metadata.openGraph?.url).toBe('https://intelliflow-crm.com/verify-email');
      expect(metadata.openGraph?.siteName).toBe('IntelliFlow CRM');
      expect((metadata.openGraph as Record<string, unknown>)?.type).toBe('website');
    });

    it('should have Twitter metadata', () => {
      expect(metadata.twitter).toBeDefined();
      expect((metadata.twitter as Record<string, unknown>)?.card).toBe('summary_large_image');
      expect(metadata.twitter?.title).toBeDefined();
    });

    it('should have canonical URL', () => {
      expect(metadata.alternates?.canonical).toBe('/verify-email');
    });
  });
});
