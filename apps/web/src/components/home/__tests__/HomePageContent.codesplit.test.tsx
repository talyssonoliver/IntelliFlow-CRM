/**
 * HomePageContent Code-Splitting Tests
 *
 * Validates that HomePageContent uses next/dynamic for code splitting:
 * - AuthenticatedHomePage loaded with ssr: false
 * - PublicHomePage loaded with ssr: true
 * - Loading skeleton shown while authenticated page loads
 * - Auth context drives conditional rendering
 *
 * Task: PG-166 — Lighthouse audit on authenticated home page
 * AC: AC-006, NF-007, NF-008
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';
import { render, screen } from '@testing-library/react';

// ---------------------------------------------------------------------------
// vi.hoisted — mock controls
// ---------------------------------------------------------------------------

const { mockUseAuth } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/auth/AuthContext', () => ({
  useAuth: mockUseAuth,
}));

// Track dynamic() calls to verify ssr options
const dynamicCalls: Array<{
  loader: () => Promise<unknown>;
  options: Record<string, unknown>;
}> = [];

vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<unknown>, options: Record<string, unknown> = {}) => {
    dynamicCalls.push({ loader, options });

    // Return a component that resolves the loader via useEffect
    const DynamicComponent = (props: Record<string, unknown>) => {
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

vi.mock('../AuthenticatedHomePage', () => ({
  AuthenticatedHomePage: () => <div data-testid="authenticated-home">Authenticated Home</div>,
}));

vi.mock('../PublicHomePage', () => ({
  PublicHomePage: () => <div data-testid="public-home">Public Home</div>,
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HomePageContent code splitting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    dynamicCalls.length = 0;
  });

  // --- Dynamic import configuration ---

  it('uses next/dynamic with ssr: false for AuthenticatedHomePage', async () => {
    await import('../HomePageContent');
    expect(dynamicCalls.some((c) => c.options.ssr === false)).toBe(true);
  });

  it('uses next/dynamic with ssr: true for PublicHomePage', async () => {
    await import('../HomePageContent');
    expect(dynamicCalls.some((c) => c.options.ssr === true)).toBe(true);
  });

  it('provides loading component for ssr: false dynamic import', async () => {
    await import('../HomePageContent');
    const authCall = dynamicCalls.find((c) => c.options.ssr === false);
    expect(authCall).toBeDefined();
    expect(authCall!.options.loading).toBeDefined();
  });

  it('loading skeleton uses neutral background (bg-[#f6f7f8])', async () => {
    await import('../HomePageContent');
    const authCall = dynamicCalls.find((c) => c.options.ssr === false);
    expect(authCall).toBeDefined();

    const Loading = authCall!.options.loading as React.ComponentType;
    const { container } = render(<Loading />);
    expect(container.firstElementChild?.className).toContain('bg-[#f6f7f8]');
  });

  // --- Rendering behavior ---

  it('renders AuthenticatedHomePage when authenticated', async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { id: 'u1' },
    });

    const { HomePageContent } = await import('../HomePageContent');
    render(<HomePageContent />);
    expect(await screen.findByTestId('authenticated-home')).toBeInTheDocument();
  });

  it('renders PublicHomePage when not authenticated', async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      user: null,
    });

    const { HomePageContent } = await import('../HomePageContent');
    render(<HomePageContent />);
    expect(await screen.findByTestId('public-home')).toBeInTheDocument();
  });

  it('shows loading spinner while auth context is loading', async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
      user: null,
    });

    const { HomePageContent } = await import('../HomePageContent');
    const { container } = render(<HomePageContent />);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('renders content (not empty) for authenticated users', async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { id: 'u1' },
    });

    const { HomePageContent } = await import('../HomePageContent');
    const { container } = render(<HomePageContent />);
    expect(container.firstChild).toBeInTheDocument();
  });
});
