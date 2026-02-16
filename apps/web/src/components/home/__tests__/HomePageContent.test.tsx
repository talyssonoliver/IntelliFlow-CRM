/**
 * HomePageContent Tests
 *
 * Tests the conditional routing component that renders
 * either the authenticated or public home page based on auth state.
 *
 * Task: PG-129 - Authenticated Home Page
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HomePageContent } from '../HomePageContent';

// Mock child components to isolate routing logic
vi.mock('../AuthenticatedHomePage', () => ({
  AuthenticatedHomePage: () => <div data-testid="authenticated-home">Authenticated Dashboard</div>,
}));

vi.mock('../PublicHomePage', () => ({
  PublicHomePage: () => <div data-testid="public-home">Public Landing Page</div>,
}));

// Mock auth context - will be overridden per test
const mockUseAuth = vi.fn();
vi.mock('@/lib/auth/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('HomePageContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading spinner while auth is loading', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
    });

    render(<HomePageContent />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByTestId('authenticated-home')).not.toBeInTheDocument();
    expect(screen.queryByTestId('public-home')).not.toBeInTheDocument();
  });

  it('renders authenticated home page when user is logged in', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    });

    render(<HomePageContent />);

    expect(screen.getByTestId('authenticated-home')).toBeInTheDocument();
    expect(screen.queryByTestId('public-home')).not.toBeInTheDocument();
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });

  it('renders public home page when user is not logged in', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
    });

    render(<HomePageContent />);

    expect(screen.getByTestId('public-home')).toBeInTheDocument();
    expect(screen.queryByTestId('authenticated-home')).not.toBeInTheDocument();
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });

  it('renders loading spinner with appropriate styling', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
    });

    render(<HomePageContent />);

    // Check for the spinning animation
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeTruthy();
  });
});
