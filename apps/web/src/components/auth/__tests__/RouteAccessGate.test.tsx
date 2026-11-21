// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUsePathname = vi.fn();
const mockUseRequireAuth = vi.fn();
const mockSegments = vi.fn((): string[] => []);

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
  useSelectedLayoutSegments: () => mockSegments(),
}));

vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => mockUseRequireAuth(),
}));

const { RouteAccessGate } = await import('../RouteAccessGate');

describe('RouteAccessGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue('/dashboard');
    mockSegments.mockReturnValue(['dashboard']);
    mockUseRequireAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
    });
  });

  it('renders protected content for authenticated users', () => {
    render(
      <RouteAccessGate>
        <div>Protected app content</div>
      </RouteAccessGate>
    );

    expect(screen.getByText('Protected app content')).toBeInTheDocument();
  });

  it('blocks protected content while auth is unresolved', () => {
    mockUseRequireAuth.mockReturnValue({
      isLoading: true,
      isAuthenticated: false,
    });

    const { container } = render(
      <RouteAccessGate>
        <div>Protected app content</div>
      </RouteAccessGate>
    );

    expect(screen.queryByText('Protected app content')).not.toBeInTheDocument();
    expect(container.firstChild).toHaveAttribute('aria-busy', 'true');
  });

  it('never gates the 404 page, even at a protected address (hydration #418, owner 21/11)', () => {
    // Production pre-renders one 404 under '/_not-found' (not protected); a mistyped
    // /settings/... address must render that same page in the browser, not the auth placeholder.
    mockUsePathname.mockReturnValue('/settings/no-such-page');
    // '_not-found' is what the root layout sees in the production build (measured 21/11).
    mockSegments.mockReturnValue(['_not-found']);
    mockUseRequireAuth.mockReturnValue({ isLoading: true, isAuthenticated: false });

    render(
      <RouteAccessGate>
        <div>Page not found</div>
      </RouteAccessGate>
    );

    expect(screen.getByText('Page not found')).toBeInTheDocument();
  });

  it('does not gate public routes', () => {
    mockUsePathname.mockReturnValue('/login');

    render(
      <RouteAccessGate>
        <div>Public page content</div>
      </RouteAccessGate>
    );

    expect(screen.getByText('Public page content')).toBeInTheDocument();
    expect(mockUseRequireAuth).not.toHaveBeenCalled();
  });
});
