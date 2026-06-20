/**
 * @vitest-environment jsdom
 *
 * Tests for the client wrapper that swaps the public homepage for the
 * authenticated one when a login-race leaves the server returning `null` while
 * the client is actually authenticated. AuthenticatedHomePage is loaded via
 * next/dynamic(ssr:false) (keeps its heavy subtree out of the public compile
 * graph), so next/dynamic is stubbed to render the fallback synchronously.
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockAuth = { isAuthenticated: false, isLoading: false };
vi.mock('@/lib/auth/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('../PublicHomePage', () => ({
  PublicHomePage: () => <div data-testid="public-home">Public</div>,
}));

vi.mock('next/dynamic', () => ({
  __esModule: true,
  default: () =>
    function AuthenticatedStub() {
      return <div data-testid="authenticated-home">Authenticated</div>;
    },
}));

import { HomePagePublicWithAuthFallback } from '../HomePagePublicWithAuthFallback';

describe('HomePagePublicWithAuthFallback', () => {
  beforeEach(() => {
    mockAuth.isAuthenticated = false;
    mockAuth.isLoading = false;
  });

  it('renders the public home for unauthenticated visitors', () => {
    mockAuth.isAuthenticated = false;
    render(<HomePagePublicWithAuthFallback />);
    expect(screen.getByTestId('public-home')).toBeInTheDocument();
    expect(screen.queryByTestId('authenticated-home')).not.toBeInTheDocument();
  });

  it('swaps to the authenticated home once client auth resolves (login-race fallback)', () => {
    mockAuth.isAuthenticated = true;
    mockAuth.isLoading = false;
    render(<HomePagePublicWithAuthFallback />);
    expect(screen.getByTestId('authenticated-home')).toBeInTheDocument();
    expect(screen.queryByTestId('public-home')).not.toBeInTheDocument();
  });

  it('stays on the public home while auth is still loading', () => {
    mockAuth.isAuthenticated = true;
    mockAuth.isLoading = true;
    render(<HomePagePublicWithAuthFallback />);
    expect(screen.getByTestId('public-home')).toBeInTheDocument();
  });
});
