import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreateNewAppPage from '../page';

// Integration tests — real components, no mocks

const mockWriteText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: mockWriteText },
    configurable: true,
    writable: true,
  });
  mockWriteText.mockClear();
});

describe('CreateNewAppPage Integration', () => {
  it('renders real AppCreator form (NI-001)', () => {
    render(<CreateNewAppPage />);
    expect(screen.getByTestId('app-creator')).toBeInTheDocument();
    expect(screen.getByLabelText('App Name')).toBeInTheDocument();
  });

  it('heading hierarchy — exactly one h1 (NI-002)', () => {
    render(<CreateNewAppPage />);
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s.length).toBe(1);
    expect(h1s[0]).toHaveTextContent('Create New App');
  });

  it('all buttons have accessible names (NI-003)', () => {
    render(<CreateNewAppPage />);
    const buttons = screen.getAllByRole('button');
    buttons.forEach((button) => {
      const name = button.getAttribute('aria-label') || button.textContent;
      expect(name).toBeTruthy();
    });
  });

  it('form name input is focusable and accepts typed input (NI-004)', async () => {
    const user = userEvent.setup();
    render(<CreateNewAppPage />);
    const input = screen.getByLabelText('App Name');
    await user.type(input, 'Integration Test App');
    expect(input).toHaveValue('Integration Test App');
  });

  it('submit with valid data transitions to success state (NI-005)', async () => {
    const user = userEvent.setup();
    render(<CreateNewAppPage />);
    await user.type(screen.getByLabelText('App Name'), 'Test App');
    await user.click(screen.getByRole('button', { name: 'Create App' }));
    await waitFor(() => {
      expect(screen.getByText('App Created Successfully')).toBeInTheDocument();
    });
  });

  it('success state shows clientId with cli_test_ format (NI-006)', async () => {
    const user = userEvent.setup();
    render(<CreateNewAppPage />);
    await user.type(screen.getByLabelText('App Name'), 'Test App');
    await user.click(screen.getByRole('button', { name: 'Create App' }));
    await waitFor(() => {
      expect(screen.getByText(/cli_test_[0-9a-f]{32}/)).toBeInTheDocument();
    });
  });

  it('Cancel link has href /developers/apps (NI-008)', () => {
    render(<CreateNewAppPage />);
    const cancel = screen.getByText('Cancel');
    expect(cancel.closest('a')).toHaveAttribute('href', '/developers/apps');
  });

  it('all icons have aria-hidden="true" (NI-009)', () => {
    render(<CreateNewAppPage />);
    const icons = document.querySelectorAll('.material-symbols-outlined');
    expect(icons.length).toBeGreaterThan(0);
    icons.forEach((icon) => {
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });
  });

  it('no credentials in localStorage or sessionStorage after form submission (NI-010, AC-016)', async () => {
    const user = userEvent.setup();
    render(<CreateNewAppPage />);
    await user.type(screen.getByLabelText('App Name'), 'Secret Test');
    await user.click(screen.getByRole('button', { name: 'Create App' }));
    await waitFor(() => {
      expect(screen.getByText('App Created Successfully')).toBeInTheDocument();
    });

    const sensitivePattern = (k: string) =>
      k.includes('client') ||
      k.includes('secret') ||
      k.includes('credential') ||
      k.includes('oauth');

    // Verify nothing was stored in localStorage
    const localKeys = Object.keys(localStorage).filter(sensitivePattern);
    expect(localKeys.length).toBe(0);

    // Verify nothing was stored in sessionStorage
    const sessionKeys = Object.keys(sessionStorage).filter(sensitivePattern);
    expect(sessionKeys.length).toBe(0);
  });

  it('production environment generates cli_prod_ prefix (NI-006 variant)', async () => {
    const user = userEvent.setup();
    render(<CreateNewAppPage />);
    await user.type(screen.getByLabelText('App Name'), 'Prod App');
    await user.click(screen.getByLabelText('Production'));
    await user.click(screen.getByRole('button', { name: 'Create App' }));
    await waitFor(() => {
      expect(screen.getByText(/cli_prod_[0-9a-f]{32}/)).toBeInTheDocument();
    });
  });
});
