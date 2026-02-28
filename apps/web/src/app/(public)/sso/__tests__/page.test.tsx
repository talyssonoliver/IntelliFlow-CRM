/**
 * SSO Page Tests
 *
 * Tests for the Enterprise SSO page component.
 * IMPLEMENTS: PG-124 AC-005, NFR-003
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/sso',
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Mock AuthContext
const mockLoginWithSso = vi.fn();
vi.mock('@/lib/auth/AuthContext', () => ({
  useAuth: () => ({
    loginWithSso: mockLoginWithSso,
    isLoading: false,
    isAuthenticated: false,
    user: null,
    session: null,
    mfa: { required: false, challengeId: null, methods: [] },
    error: null,
    login: vi.fn(),
    loginWithOAuth: vi.fn(),
    verifyMfa: vi.fn(),
    logout: vi.fn(),
    refreshSession: vi.fn(),
    clearError: vi.fn(),
    setMfaRequired: vi.fn(),
  }),
  useRedirectIfAuthenticated: vi.fn(),
}));

// Mock sso-handler
vi.mock('@/lib/auth/sso-handler', () => ({
  resolveSsoProvider: vi.fn((email: string) => {
    if (email.includes('example-corp.com')) {
      return {
        found: true,
        config: {
          domain: 'example-corp.com',
          provider_id: 'sso-example-corp',
          provider_name: 'Example Corp SSO',
          provider_type: 'saml',
          enabled: true,
        },
      };
    }
    return { found: false, suggestion: 'Your organization has not configured SSO.' };
  }),
}));

// Mock useFocusTrap
vi.mock('@/hooks/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null }),
}));

// Mock shared components
vi.mock('@/components/shared', () => ({
  AuthBackground: ({ children }: { children: React.ReactNode }) => <div data-testid="auth-background">{children}</div>,
  AuthCard: ({ children, title, description, badge }: { children: React.ReactNode; title: string; description: string; badge: string }) => (
    <div data-testid="auth-card">
      <h1>{title}</h1>
      <p>{description}</p>
      <span>{badge}</span>
      {children}
    </div>
  ),
}));

// Mock SsoEntryForm
vi.mock('@/components/auth', () => ({
  SsoEntryForm: ({ onResolve, isLoading }: { onResolve: (r: unknown) => void; isLoading?: boolean }) => (
    <div data-testid="sso-entry-form">
      <button
        onClick={() => onResolve({ found: true, config: { provider_name: 'Test SSO' } })}
        disabled={isLoading}
      >
        Find SSO
      </button>
    </div>
  ),
}));

// Mock trpc
vi.mock('@/lib/trpc', () => ({
  trpc: {
    auth: {
      getStatus: { useQuery: () => ({ data: null, isSuccess: false, isError: false, isPending: true, isFetching: true, refetch: vi.fn() }) },
      login: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      logout: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      verifyMfa: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      refreshSession: { useMutation: () => ({ mutateAsync: vi.fn() }) },
    },
  },
}));

// Mock supabase-browser
vi.mock('@/lib/supabase-browser', () => ({
  getSupabaseBrowserClient: () => null,
}));

// Mock @tanstack/react-query
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
    removeQueries: vi.fn(),
    clear: vi.fn(),
  }),
}));

import { metadata } from '../page';
import SsoPageClient from '../SsoPageClient';

describe('SsoPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports metadata with title and description', () => {
    expect(metadata).toBeDefined();
    expect(metadata.title).toBe('Enterprise SSO | IntelliFlow CRM');
    expect(metadata.description).toContain('SSO');
  });

  it('renders SSO page with SsoEntryForm (AC-005)', () => {
    render(<SsoPageClient />);
    expect(screen.getByTestId('sso-entry-form')).toBeInTheDocument();
  });

  it('renders "Sign in with SSO" title', () => {
    render(<SsoPageClient />);
    expect(screen.getByText('Sign in with SSO')).toBeInTheDocument();
  });

  it('renders Enterprise SSO badge', () => {
    render(<SsoPageClient />);
    expect(screen.getByText('Enterprise SSO')).toBeInTheDocument();
  });

  it('renders centered card layout (AuthCard)', () => {
    render(<SsoPageClient />);
    expect(screen.getByTestId('auth-card')).toBeInTheDocument();
  });

  it('renders AuthBackground wrapper', () => {
    render(<SsoPageClient />);
    expect(screen.getByTestId('auth-background')).toBeInTheDocument();
  });

  it('has aria-live="polite" region for screen reader announcements (NFR-003)', () => {
    render(<SsoPageClient />);
    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion).toBeInTheDocument();
  });

  it('renders description text', () => {
    render(<SsoPageClient />);
    expect(screen.getByText(/work email.*SSO provider/i)).toBeInTheDocument();
  });
});
