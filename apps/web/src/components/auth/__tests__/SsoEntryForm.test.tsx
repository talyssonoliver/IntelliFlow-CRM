/**
 * SsoEntryForm Tests
 *
 * Tests for the SSO email entry form component.
 * IMPLEMENTS: PG-124 AC-005, NFR-003, NFR-007
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SsoEntryForm } from '../SsoEntryForm';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Mock @intelliflow/ui Input to avoid type="email" jsdom sanitization issues
vi.mock('@intelliflow/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@intelliflow/ui')>();
  return {
    ...actual,
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
      <input {...props} type="text" data-original-type={props.type} />
    ),
  };
});

// Mock tRPC — SsoEntryForm now calls trpc.useUtils().auth.resolveSso.fetch()
const mockResolveSsoFetch = vi.fn();
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      auth: {
        resolveSso: {
          fetch: mockResolveSsoFetch,
        },
      },
    }),
  },
}));

// Mock sso-handler (only type import is used now)
vi.mock('@/lib/auth/sso-handler', () => ({}));

describe('SsoEntryForm', () => {
  const mockOnResolve = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: known domain returns found
    mockResolveSsoFetch.mockImplementation(async ({ email }: { email: string }) => {
      if (email.includes('example-corp.com')) {
        return {
          found: true as const,
          config: {
            provider_id: 'sso-example-corp',
            provider_name: 'Example Corp SSO',
            provider_type: 'saml',
          },
        };
      }
      return {
        found: false as const,
        suggestion: 'Your organization has not configured SSO for this domain.',
      };
    });
  });

  it('renders email input with aria-label="Work email address" (NFR-003)', () => {
    render(<SsoEntryForm onResolve={mockOnResolve} />);
    expect(screen.getByLabelText('Work email address')).toBeInTheDocument();
  });

  it('renders submit button with "Find my SSO provider" text', () => {
    render(<SsoEntryForm onResolve={mockOnResolve} />);
    expect(screen.getByRole('button', { name: /find my sso provider/i })).toBeInTheDocument();
  });

  it('renders help text with id="sso-help-text"', () => {
    render(<SsoEntryForm onResolve={mockOnResolve} />);
    const helpText = document.getElementById('sso-help-text');
    expect(helpText).toBeInTheDocument();
    expect(helpText?.textContent).toContain('work email');
  });

  it('email input has aria-describedby="sso-help-text" (NFR-003)', () => {
    render(<SsoEntryForm onResolve={mockOnResolve} />);
    const input = screen.getByLabelText('Work email address');
    expect(input).toHaveAttribute('aria-describedby', 'sso-help-text');
  });

  it('submit button disabled when isLoading is true', () => {
    render(<SsoEntryForm onResolve={mockOnResolve} isLoading={true} />);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  it('shows loading text when isLoading is true', () => {
    render(<SsoEntryForm onResolve={mockOnResolve} isLoading={true} />);
    expect(screen.getByText(/finding provider/i)).toBeInTheDocument();
  });

  it('calls resolveSso tRPC endpoint and onResolve when form submitted with valid email', async () => {
    const user = userEvent.setup();
    render(<SsoEntryForm onResolve={mockOnResolve} />);

    const input = screen.getByLabelText('Work email address');
    await user.type(input, 'user@example-corp.com');

    const button = screen.getByRole('button', { name: /find my sso provider/i });
    await user.click(button);

    await waitFor(() => {
      expect(mockResolveSsoFetch).toHaveBeenCalledWith({ email: 'user@example-corp.com' });
    });
    await waitFor(() => {
      expect(mockOnResolve).toHaveBeenCalledWith(
        expect.objectContaining({ found: true })
      );
    });
  });

  it('shows validation error for invalid email format', async () => {
    const user = userEvent.setup();
    render(<SsoEntryForm onResolve={mockOnResolve} />);

    const input = screen.getByLabelText('Work email address') as HTMLInputElement;
    await user.type(input, 'useronly');

    const button = screen.getByRole('button', { name: /find my sso provider/i });
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText(/valid email/i)).toBeInTheDocument();
    });
    expect(mockOnResolve).not.toHaveBeenCalled();
    expect(mockResolveSsoFetch).not.toHaveBeenCalled();
  });

  it('form submits on Enter key press (NFR-007)', async () => {
    const user = userEvent.setup();
    render(<SsoEntryForm onResolve={mockOnResolve} />);

    const input = screen.getByLabelText('Work email address');
    await user.type(input, 'user@example-corp.com{Enter}');

    await waitFor(() => {
      expect(mockOnResolve).toHaveBeenCalled();
    });
  });

  it('renders "Back to standard login" link to /login', () => {
    render(<SsoEntryForm onResolve={mockOnResolve} />);
    const link = screen.getByText(/back to standard login/i);
    expect(link).toBeInTheDocument();
    expect(link.closest('a')).toHaveAttribute('href', '/login');
  });

  it('error state shown for unrecognized domain', async () => {
    const user = userEvent.setup();
    render(<SsoEntryForm onResolve={mockOnResolve} />);

    const input = screen.getByLabelText('Work email address');
    await user.type(input, 'user@unknown-domain.com');

    const button = screen.getByRole('button', { name: /find my sso provider/i });
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText(/not configured SSO/i)).toBeInTheDocument();
    });
  });

  it('shows required error when empty email submitted', async () => {
    const user = userEvent.setup();
    render(<SsoEntryForm onResolve={mockOnResolve} />);

    const button = screen.getByRole('button', { name: /find my sso provider/i });
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText(/email is required/i)).toBeInTheDocument();
    });
    expect(mockOnResolve).not.toHaveBeenCalled();
  });

  it('shows error when tRPC call fails', async () => {
    mockResolveSsoFetch.mockRejectedValue(new Error('Network error'));
    const user = userEvent.setup();
    render(<SsoEntryForm onResolve={mockOnResolve} />);

    const input = screen.getByLabelText('Work email address');
    await user.type(input, 'user@example-corp.com');

    const button = screen.getByRole('button', { name: /find my sso provider/i });
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText(/failed to resolve/i)).toBeInTheDocument();
    });
    expect(mockOnResolve).not.toHaveBeenCalled();
  });
});
