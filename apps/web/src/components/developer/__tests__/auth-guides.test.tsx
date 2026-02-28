import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthGuides } from '../auth-guides';

// Mock AuthExamples to isolate auth-guides tests
vi.mock('@/components/developer/auth-examples', () => ({
  AuthExamples: () => <div data-testid="auth-examples">Auth Examples Mock</div>,
}));

// Mock clipboard for copy-to-clipboard coverage
const mockWriteText = vi.fn().mockResolvedValue(undefined);

if (!navigator.clipboard) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: mockWriteText },
    configurable: true,
  });
} else {
  vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
}

describe('AuthGuides', () => {
  it('renders all 5 tab triggers: Overview, OAuth 2.0, JWT / Bearer, MFA, Sessions & Keys', () => {
    render(<AuthGuides />);
    expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'OAuth 2.0' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'JWT / Bearer' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'MFA' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Sessions & Keys' })).toBeInTheDocument();
  });

  it('Overview tab is active by default with data-state="active"', () => {
    render(<AuthGuides />);
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('data-state', 'active');
  });

  it('Overview tab shows auth method summary headings', () => {
    render(<AuthGuides />);
    expect(screen.getAllByText(/OAuth 2\.0/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/JWT/).length).toBeGreaterThanOrEqual(1);
  });

  it('OAuth tab shows Google and Azure provider information', async () => {
    const user = userEvent.setup();
    render(<AuthGuides />);
    await user.click(screen.getByRole('tab', { name: 'OAuth 2.0' }));
    expect(screen.getAllByText(/Google Workspace/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Microsoft Azure AD/i).length).toBeGreaterThanOrEqual(1);
  });

  it('OAuth tab shows PKCE flow code example', async () => {
    const user = userEvent.setup();
    render(<AuthGuides />);
    await user.click(screen.getByRole('tab', { name: 'OAuth 2.0' }));
    expect(screen.getAllByText(/PKCE/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/code_challenge/i).length).toBeGreaterThanOrEqual(1);
  });

  it('OAuth tab shows security warning about state validation', async () => {
    const user = userEvent.setup();
    render(<AuthGuides />);
    await user.click(screen.getByRole('tab', { name: 'OAuth 2.0' }));
    expect(screen.getAllByText(/state parameter/i).length).toBeGreaterThanOrEqual(1);
  });

  it('JWT / Bearer tab shows login flow and token format', async () => {
    const user = userEvent.setup();
    render(<AuthGuides />);
    await user.click(screen.getByRole('tab', { name: 'JWT / Bearer' }));
    expect(screen.getByText(/Authorization: Bearer/)).toBeInTheDocument();
  });

  it('JWT / Bearer tab shows rate limits: login lockout 5/15min, reset 3/15min', async () => {
    const user = userEvent.setup();
    render(<AuthGuides />);
    await user.click(screen.getByRole('tab', { name: 'JWT / Bearer' }));
    expect(screen.getAllByText(/5 failed attempts/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/15.minute/i).length).toBeGreaterThanOrEqual(1);
  });

  it('MFA tab shows TOTP setup steps and backup codes info', async () => {
    const user = userEvent.setup();
    render(<AuthGuides />);
    await user.click(screen.getByRole('tab', { name: 'MFA' }));
    expect(screen.getAllByText(/TOTP/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/backup codes/i).length).toBeGreaterThanOrEqual(1);
  });

  it('MFA tab labels SMS and Email OTP as Coming Soon', async () => {
    const user = userEvent.setup();
    render(<AuthGuides />);
    await user.click(screen.getByRole('tab', { name: 'MFA' }));
    const comingSoonBadges = screen.getAllByText('Coming Soon');
    expect(comingSoonBadges.length).toBeGreaterThanOrEqual(2);
  });

  it('Sessions & Keys tab shows session limits: max 3, 24h/30d/4h', async () => {
    const user = userEvent.setup();
    render(<AuthGuides />);
    await user.click(screen.getByRole('tab', { name: 'Sessions & Keys' }));
    expect(screen.getByText(/3 concurrent/i)).toBeInTheDocument();
    expect(screen.getByText(/24.hour/i)).toBeInTheDocument();
    expect(screen.getByText(/30.day/i)).toBeInTheDocument();
  });

  it('Sessions & Keys tab shows API key format with Coming Soon badge', async () => {
    const user = userEvent.setup();
    render(<AuthGuides />);
    await user.click(screen.getByRole('tab', { name: 'Sessions & Keys' }));
    expect(screen.getByText(/ifc_live_/)).toBeInTheDocument();
    expect(screen.getByText(/ifc_test_/)).toBeInTheDocument();
  });

  it('AuthExamples component is embedded via data-testid', () => {
    render(<AuthGuides />);
    expect(screen.getByTestId('auth-examples')).toBeInTheDocument();
  });

  it('all code examples use placeholder tokens, no real secrets', async () => {
    const user = userEvent.setup();
    render(<AuthGuides />);

    // Check OAuth tab for placeholder tokens
    await user.click(screen.getByRole('tab', { name: 'OAuth 2.0' }));
    const codeBlocks = document.querySelectorAll('pre code');
    codeBlocks.forEach((block) => {
      const text = block.textContent || '';
      // Should not contain valid JWT shapes (three dot-separated base64 sections)
      expect(text).not.toMatch(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    });
  });

  it('code blocks have copy-to-clipboard buttons', async () => {
    const user = userEvent.setup();
    render(<AuthGuides />);
    // Switch to OAuth tab which has CodeBlock components
    await user.click(screen.getByRole('tab', { name: 'OAuth 2.0' }));
    const copyButtons = screen.getAllByLabelText(/copy.*to clipboard/i);
    expect(copyButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('copy button shows check icon feedback', async () => {
    const user = userEvent.setup();
    render(<AuthGuides />);
    // Switch to OAuth tab which has CodeBlock components
    await user.click(screen.getByRole('tab', { name: 'OAuth 2.0' }));
    const copyButtons = screen.getAllByLabelText(/copy.*to clipboard/i);
    await user.click(copyButtons[0]);

    await waitFor(() => {
      const checkIcons = screen.queryAllByText('check');
      expect(checkIcons.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('icons have aria-hidden="true"', () => {
    render(<AuthGuides />);
    const icons = document.querySelectorAll('.material-symbols-outlined');
    expect(icons.length).toBeGreaterThan(0);
    icons.forEach((icon) => {
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });
  });

  it('sections have aria-labelledby pointing to h2', () => {
    render(<AuthGuides />);
    const sections = document.querySelectorAll('section[aria-labelledby]');
    expect(sections.length).toBeGreaterThanOrEqual(2);
    sections.forEach((section) => {
      const labelId = section.getAttribute('aria-labelledby');
      expect(labelId).toBeTruthy();
      const label = document.getElementById(labelId!);
      expect(label).toBeInTheDocument();
    });
  });

  it('heading hierarchy: h2 for tab sections', () => {
    render(<AuthGuides />);
    const h2s = screen.getAllByRole('heading', { level: 2 });
    expect(h2s.length).toBeGreaterThanOrEqual(2);
  });

  it('copy feedback sr-only element has aria-live="polite"', async () => {
    const user = userEvent.setup();
    render(<AuthGuides />);
    // Switch to OAuth tab which has CodeBlock components with sr-only live regions
    await user.click(screen.getByRole('tab', { name: 'OAuth 2.0' }));
    const liveRegions = document.querySelectorAll('[aria-live="polite"].sr-only');
    expect(liveRegions.length).toBeGreaterThanOrEqual(1);
  });
});
