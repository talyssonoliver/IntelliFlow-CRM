/**
 * HomePageContent Tests
 *
 * Tests the conditional routing component that renders
 * either the authenticated or public home page based on auth state.
 *
 * Task: PG-129 - Authenticated Home Page
 * Updated: PG-166 - Code-split via next/dynamic
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';
import { render, screen } from '@testing-library/react';

// Mock auth context - will be overridden per test
const mockUseAuth = vi.fn();
vi.mock('@/lib/auth/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock child components to isolate routing logic
vi.mock('../AuthenticatedHomePage', () => ({
  AuthenticatedHomePage: () => <div data-testid="authenticated-home">Authenticated Dashboard</div>,
}));

vi.mock('../PublicHomePage', () => ({
  PublicHomePage: () => <div data-testid="public-home">Public Landing Page</div>,
}));

// Mock next/dynamic to resolve dynamic imports in test environment
vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<unknown>, options: Record<string, unknown> = {}) => {
    const DynamicComponent = (props: Readonly<Record<string, unknown>>) => {
      const [Comp, setComp] = React.useState<React.ComponentType<any> | null>(null);
      React.useEffect(() => {
        let cancelled = false;
        loader().then((mod: any) => {
          if (!cancelled) setComp(() => mod.default);
        });
        return () => {
          cancelled = true;
        };
      }, []);
      if (!Comp) {
        if (options.loading) {
          const L = options.loading as React.ComponentType;
          return <L />;
        }
        return null;
      }
      return <Comp {...props} />;
    };
    return DynamicComponent;
  },
}));

describe('HomePageContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading spinner while auth is loading', async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
    });

    vi.resetModules();
    const { HomePageContent } = await import('../HomePageContent');
    render(<HomePageContent />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByTestId('authenticated-home')).not.toBeInTheDocument();
    expect(screen.queryByTestId('public-home')).not.toBeInTheDocument();
  });

  it('renders authenticated home page when user is logged in', async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    });

    vi.resetModules();
    const { HomePageContent } = await import('../HomePageContent');
    render(<HomePageContent />);

    expect(await screen.findByTestId('authenticated-home')).toBeInTheDocument();
    expect(screen.queryByTestId('public-home')).not.toBeInTheDocument();
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });

  it('renders public home page when user is not logged in', async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
    });

    vi.resetModules();
    const { HomePageContent } = await import('../HomePageContent');
    render(<HomePageContent />);

    expect(await screen.findByTestId('public-home')).toBeInTheDocument();
    expect(screen.queryByTestId('authenticated-home')).not.toBeInTheDocument();
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });

  it('renders loading spinner with appropriate styling', async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
    });

    vi.resetModules();
    const { HomePageContent } = await import('../HomePageContent');
    render(<HomePageContent />);

    // Check for the spinning animation
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeTruthy();
  });
});
