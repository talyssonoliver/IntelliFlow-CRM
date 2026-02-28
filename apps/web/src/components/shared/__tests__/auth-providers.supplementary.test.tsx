/**
 * Auth Providers Supplementary Tests
 *
 * Tests for GitHub, LinkedIn, EnterpriseSsoLink, and expanded SocialLoginGrid.
 * IMPLEMENTS: PG-124 AC-002, AC-003, AC-004, AC-009
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  GitHubSignInButton,
  LinkedInSignInButton,
  EnterpriseSsoLink,
  SocialLoginGrid,
} from '../auth-providers';

describe('GitHubSignInButton', () => {
  const mockOnLogin = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with GitHub label (AC-002)', () => {
    render(<GitHubSignInButton onLogin={mockOnLogin} />);
    expect(screen.getByText('GitHub')).toBeInTheDocument();
  });

  it('has aria-label="Sign in with GitHub" (AC-002)', () => {
    render(<GitHubSignInButton onLogin={mockOnLogin} />);
    expect(screen.getByRole('button', { name: 'Sign in with GitHub' })).toBeInTheDocument();
  });

  it('calls onClick handler when clicked (AC-002)', async () => {
    const user = userEvent.setup();
    render(<GitHubSignInButton onLogin={mockOnLogin} />);

    await user.click(screen.getByRole('button', { name: 'Sign in with GitHub' }));

    await waitFor(() => {
      expect(mockOnLogin).toHaveBeenCalledTimes(1);
    });
  });

  it('shows loading state when clicked', async () => {
    const slowLogin = vi.fn().mockImplementation(() => new Promise(() => {})); // never resolves
    const user = userEvent.setup();
    render(<GitHubSignInButton onLogin={slowLogin} />);

    await user.click(screen.getByRole('button', { name: 'Sign in with GitHub' }));

    await waitFor(() => {
      expect(screen.getByText('Connecting...')).toBeInTheDocument();
    });
  });

  it('is disabled when disabled prop is true', () => {
    render(<GitHubSignInButton onLogin={mockOnLogin} disabled={true} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});

describe('LinkedInSignInButton', () => {
  const mockOnLogin = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with LinkedIn label (AC-003)', () => {
    render(<LinkedInSignInButton onLogin={mockOnLogin} />);
    expect(screen.getByText('LinkedIn')).toBeInTheDocument();
  });

  it('has aria-label="Sign in with LinkedIn" (AC-003)', () => {
    render(<LinkedInSignInButton onLogin={mockOnLogin} />);
    expect(screen.getByRole('button', { name: 'Sign in with LinkedIn' })).toBeInTheDocument();
  });

  it('calls onClick handler when clicked (AC-003)', async () => {
    const user = userEvent.setup();
    render(<LinkedInSignInButton onLogin={mockOnLogin} />);

    await user.click(screen.getByRole('button', { name: 'Sign in with LinkedIn' }));

    await waitFor(() => {
      expect(mockOnLogin).toHaveBeenCalledTimes(1);
    });
  });

  it('is disabled when disabled prop is true', () => {
    render(<LinkedInSignInButton onLogin={mockOnLogin} disabled={true} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});

describe('SocialLoginGrid', () => {
  const mockGoogle = vi.fn().mockResolvedValue(undefined);
  const mockMicrosoft = vi.fn().mockResolvedValue(undefined);
  const mockGitHub = vi.fn().mockResolvedValue(undefined);
  const mockLinkedIn = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all 4 provider buttons when all handlers provided (AC-004)', () => {
    render(
      <SocialLoginGrid
        onGoogleLogin={mockGoogle}
        onMicrosoftLogin={mockMicrosoft}
        onGitHubLogin={mockGitHub}
        onLinkedInLogin={mockLinkedIn}
      />
    );

    expect(screen.getByText('Google')).toBeInTheDocument();
    expect(screen.getByText('Microsoft')).toBeInTheDocument();
    expect(screen.getByText('GitHub')).toBeInTheDocument();
    expect(screen.getByText('LinkedIn')).toBeInTheDocument();
  });

  it('uses responsive grid layout sm:grid-cols-2 (AC-004)', () => {
    const { container } = render(
      <SocialLoginGrid
        onGoogleLogin={mockGoogle}
        onMicrosoftLogin={mockMicrosoft}
        onGitHubLogin={mockGitHub}
        onLinkedInLogin={mockLinkedIn}
      />
    );

    const grid = container.firstElementChild;
    expect(grid?.className).toContain('grid-cols-1');
    expect(grid?.className).toContain('sm:grid-cols-2');
  });

  it('renders only Google and Microsoft when optional handlers omitted', () => {
    render(
      <SocialLoginGrid
        onGoogleLogin={mockGoogle}
        onMicrosoftLogin={mockMicrosoft}
      />
    );

    expect(screen.getByText('Google')).toBeInTheDocument();
    expect(screen.getByText('Microsoft')).toBeInTheDocument();
    expect(screen.queryByText('GitHub')).not.toBeInTheDocument();
    expect(screen.queryByText('LinkedIn')).not.toBeInTheDocument();
  });

  it('disables all buttons when disabled prop is true', () => {
    render(
      <SocialLoginGrid
        onGoogleLogin={mockGoogle}
        onMicrosoftLogin={mockMicrosoft}
        onGitHubLogin={mockGitHub}
        onLinkedInLogin={mockLinkedIn}
        disabled={true}
      />
    );

    const buttons = screen.getAllByRole('button');
    buttons.forEach((button) => {
      expect(button).toBeDisabled();
    });
  });
});

describe('EnterpriseSsoLink', () => {
  it('renders "Sign in with Enterprise SSO" text (AC-009)', () => {
    render(<EnterpriseSsoLink />);
    expect(screen.getByText('Sign in with Enterprise SSO')).toBeInTheDocument();
  });

  it('links to /sso (AC-009)', () => {
    render(<EnterpriseSsoLink />);
    const link = screen.getByLabelText('Sign in with Enterprise SSO');
    expect(link).toHaveAttribute('href', '/sso');
  });

  it('renders lock icon', () => {
    render(<EnterpriseSsoLink />);
    expect(screen.getByText('lock')).toBeInTheDocument();
  });
});
