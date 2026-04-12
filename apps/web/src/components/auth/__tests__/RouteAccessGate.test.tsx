// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUsePathname = vi.fn();
const mockUseRequireAuth = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => mockUseRequireAuth(),
}));

const { RouteAccessGate } = await import('../RouteAccessGate');

describe('RouteAccessGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue('/dashboard');
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
