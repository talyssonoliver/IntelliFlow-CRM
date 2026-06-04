/**
 * @vitest-environment happy-dom
 *
 * Tests for the authLoading gate in PublicLayoutShell:
 *   shouldMountPublicOverlays = !authLoading && !effectiveAuthenticated
 *
 * Covers:
 *   1. authLoading=true  → overlays NOT mounted (neither FAB nor PublicTour)
 *   2. authLoading=false & unauthenticated → overlays ARE mounted
 *   3. authenticated (server prop true) → overlays NOT mounted
 *   4. authenticated (client auth) → overlays NOT mounted
 *   5. auth pages skip the shell entirely (no header, no overlays)
 *   6. /features route with overlays → TourProvider wraps content
 */
import * as React from 'react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mock next/navigation — pathname is controlled per-test via the variable
// ---------------------------------------------------------------------------
let currentPathname = '/';
vi.mock('next/navigation', () => ({
  usePathname: () => currentPathname,
}));

// ---------------------------------------------------------------------------
// Mock @/lib/auth/AuthContext — isLoading + isAuthenticated controlled per test
// ---------------------------------------------------------------------------
let mockAuthLoading = false;
let mockClientAuthenticated = false;

vi.mock('@/lib/auth/AuthContext', () => ({
  useAuth: () => ({
    isLoading: mockAuthLoading,
    isAuthenticated: mockClientAuthenticated,
    user: null,
    session: null,
    mfa: { required: false, challengeId: null, methods: [] },
    error: null,
    login: vi.fn(),
    loginWithOAuth: vi.fn(),
    loginWithSso: vi.fn(),
    verifyMfa: vi.fn(),
    logout: vi.fn(),
    refreshSession: vi.fn(),
    clearError: vi.fn(),
    setMfaRequired: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Mock public components to isolate PublicLayoutShell rendering logic
// ---------------------------------------------------------------------------
vi.mock('@/components/public/PublicHeader', () => ({
  PublicHeader: () => <div data-testid="public-header">PublicHeader</div>,
}));

vi.mock('@/components/public/feedback-widget-public', () => ({
  PublicFeedbackFab: () => <div data-testid="public-feedback-fab">FeedbackFab</div>,
}));

vi.mock('@/components/public/tour-components', () => ({
  TourProvider: ({ children }: { children: React.ReactNode; config: unknown }) => (
    <div data-testid="tour-provider">{children}</div>
  ),
  PublicTour: () => <div data-testid="public-tour">PublicTour</div>,
}));

vi.mock('@/lib/public/tour-config', () => ({
  FEATURES_TOUR_CONFIG: { id: 'features-v1', route: '/features', steps: [] },
}));

// ---------------------------------------------------------------------------
// Import component under test AFTER mocks are declared
// ---------------------------------------------------------------------------
import { PublicLayoutShell } from '../PublicLayoutShell';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function renderShell(opts: { isAuthenticated?: boolean; pathname?: string } = {}) {
  currentPathname = opts.pathname ?? '/';
  return render(
    <PublicLayoutShell isAuthenticated={opts.isAuthenticated ?? false}>
      <div data-testid="child-content">Content</div>
    </PublicLayoutShell>
  );
}

beforeEach(() => {
  cleanup();
  currentPathname = '/';
  mockAuthLoading = false;
  mockClientAuthenticated = false;
});

afterEach(() => {
  cleanup();
});

// ===========================================================================
// 1. authLoading=true → overlays NOT mounted
// ===========================================================================
describe('authLoading=true → overlays suppressed', () => {
  it('does NOT render PublicFeedbackFab while auth is loading', () => {
    mockAuthLoading = true;
    mockClientAuthenticated = false;
    renderShell({ isAuthenticated: false, pathname: '/' });

    expect(screen.queryByTestId('public-feedback-fab')).toBeNull();
  });

  it('does NOT render PublicTour while auth is loading on /features', () => {
    mockAuthLoading = true;
    mockClientAuthenticated = false;
    renderShell({ isAuthenticated: false, pathname: '/features' });

    expect(screen.queryByTestId('public-tour')).toBeNull();
  });

  it('does NOT wrap with TourProvider while auth is loading on /features', () => {
    mockAuthLoading = true;
    mockClientAuthenticated = false;
    renderShell({ isAuthenticated: false, pathname: '/features' });

    expect(screen.queryByTestId('tour-provider')).toBeNull();
  });

  it('still renders children while auth is loading', () => {
    mockAuthLoading = true;
    mockClientAuthenticated = false;
    renderShell({ isAuthenticated: false });

    expect(screen.getByTestId('child-content')).toBeDefined();
  });
});

// ===========================================================================
// 2. authLoading=false & unauthenticated → overlays ARE mounted
// ===========================================================================
describe('authLoading=false & unauthenticated → overlays mounted', () => {
  it('renders PublicFeedbackFab when not loading and not authenticated', () => {
    mockAuthLoading = false;
    mockClientAuthenticated = false;
    renderShell({ isAuthenticated: false, pathname: '/' });

    expect(screen.getByTestId('public-feedback-fab')).toBeDefined();
  });

  it('renders PublicTour on /features when not loading and not authenticated', () => {
    mockAuthLoading = false;
    mockClientAuthenticated = false;
    renderShell({ isAuthenticated: false, pathname: '/features' });

    expect(screen.getByTestId('public-tour')).toBeDefined();
  });

  it('wraps with TourProvider on /features when not loading and not authenticated', () => {
    mockAuthLoading = false;
    mockClientAuthenticated = false;
    renderShell({ isAuthenticated: false, pathname: '/features' });

    expect(screen.getByTestId('tour-provider')).toBeDefined();
  });

  it('renders PublicHeader on non-auth pages for unauthenticated visitor', () => {
    mockAuthLoading = false;
    mockClientAuthenticated = false;
    renderShell({ isAuthenticated: false, pathname: '/' });

    expect(screen.getByTestId('public-header')).toBeDefined();
  });

  it('does NOT render PublicTour on non-features routes', () => {
    mockAuthLoading = false;
    mockClientAuthenticated = false;
    renderShell({ isAuthenticated: false, pathname: '/pricing' });

    // FAB rendered, but no tour
    expect(screen.getByTestId('public-feedback-fab')).toBeDefined();
    expect(screen.queryByTestId('public-tour')).toBeNull();
    expect(screen.queryByTestId('tour-provider')).toBeNull();
  });
});

// ===========================================================================
// 3. Server-authenticated (isAuthenticated prop = true) → overlays NOT mounted
// ===========================================================================
describe('server isAuthenticated=true → overlays suppressed', () => {
  it('does NOT render PublicFeedbackFab', () => {
    mockAuthLoading = false;
    mockClientAuthenticated = false;
    renderShell({ isAuthenticated: true, pathname: '/' });

    expect(screen.queryByTestId('public-feedback-fab')).toBeNull();
  });

  it('does NOT render PublicTour on /features', () => {
    mockAuthLoading = false;
    mockClientAuthenticated = false;
    renderShell({ isAuthenticated: true, pathname: '/features' });

    expect(screen.queryByTestId('public-tour')).toBeNull();
    expect(screen.queryByTestId('tour-provider')).toBeNull();
  });

  it('does NOT render PublicHeader for authenticated user', () => {
    mockAuthLoading = false;
    mockClientAuthenticated = false;
    renderShell({ isAuthenticated: true, pathname: '/' });

    expect(screen.queryByTestId('public-header')).toBeNull();
  });

  it('still renders children for authenticated user', () => {
    mockAuthLoading = false;
    mockClientAuthenticated = false;
    renderShell({ isAuthenticated: true });

    expect(screen.getByTestId('child-content')).toBeDefined();
  });
});

// ===========================================================================
// 4. Client-authenticated (useAuth returns isAuthenticated=true) → overlays NOT mounted
// ===========================================================================
describe('client isAuthenticated=true → overlays suppressed', () => {
  it('does NOT render PublicFeedbackFab when client auth is resolved as authenticated', () => {
    mockAuthLoading = false;
    mockClientAuthenticated = true;
    renderShell({ isAuthenticated: false, pathname: '/' });

    expect(screen.queryByTestId('public-feedback-fab')).toBeNull();
  });

  it('does NOT render PublicTour on /features when client auth is authenticated', () => {
    mockAuthLoading = false;
    mockClientAuthenticated = true;
    renderShell({ isAuthenticated: false, pathname: '/features' });

    expect(screen.queryByTestId('public-tour')).toBeNull();
  });

  it('does NOT render PublicHeader when client auth is authenticated', () => {
    mockAuthLoading = false;
    mockClientAuthenticated = true;
    renderShell({ isAuthenticated: false, pathname: '/' });

    expect(screen.queryByTestId('public-header')).toBeNull();
  });
});

// ===========================================================================
// 5. Auth pages — shell renders children only (no header, no overlays)
// ===========================================================================
const AUTH_PAGES = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/logout',
  '/verify-email',
  '/mfa',
  '/auth/callback',
  '/sso',
];

describe('auth pages skip header and overlays', () => {
  AUTH_PAGES.forEach((page) => {
    it(`renders only children for ${page}`, () => {
      mockAuthLoading = false;
      mockClientAuthenticated = false;
      currentPathname = page;
      render(
        <PublicLayoutShell isAuthenticated={false}>
          <div data-testid="child-content">Content</div>
        </PublicLayoutShell>
      );

      expect(screen.getByTestId('child-content')).toBeDefined();
      expect(screen.queryByTestId('public-header')).toBeNull();
      expect(screen.queryByTestId('public-feedback-fab')).toBeNull();
      expect(screen.queryByTestId('public-tour')).toBeNull();
      cleanup();
    });
  });
});

// ===========================================================================
// 6. effectiveAuthenticated computation: server OR (client && !loading)
// ===========================================================================
describe('effectiveAuthenticated logic', () => {
  it('server=true + clientAuth=false + loading=false → still authenticated (server wins)', () => {
    mockAuthLoading = false;
    mockClientAuthenticated = false;
    renderShell({ isAuthenticated: true, pathname: '/' });

    expect(screen.queryByTestId('public-feedback-fab')).toBeNull();
    expect(screen.queryByTestId('public-header')).toBeNull();
  });

  it('server=false + clientAuth=true + loading=false → authenticated (client wins)', () => {
    mockAuthLoading = false;
    mockClientAuthenticated = true;
    renderShell({ isAuthenticated: false, pathname: '/' });

    expect(screen.queryByTestId('public-feedback-fab')).toBeNull();
  });

  it('server=false + clientAuth=true + loading=true → NOT authenticated (loading blocks client result)', () => {
    // When loading=true, effectiveAuthenticated = server || (!loading && client) = false || false = false
    // But shouldMountPublicOverlays = !authLoading && !effectiveAuthenticated = false
    // So overlays are NOT mounted (loading blocks overlays regardless)
    mockAuthLoading = true;
    mockClientAuthenticated = true;
    renderShell({ isAuthenticated: false, pathname: '/' });

    expect(screen.queryByTestId('public-feedback-fab')).toBeNull();
  });
});
