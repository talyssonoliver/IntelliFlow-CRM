import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppCreator } from '../app-creator';

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

describe('AppCreator', () => {
  // Rendering
  it('renders form with data-testid="app-creator" (AC-001)', () => {
    render(<AppCreator />);
    expect(screen.getByTestId('app-creator')).toBeInTheDocument();
  });

  it('renders app name input with label "App Name" (AC-002)', () => {
    render(<AppCreator />);
    expect(screen.getByLabelText('App Name')).toBeInTheDocument();
  });

  it('renders description textarea with label (AC-002)', () => {
    render(<AppCreator />);
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
  });

  it('renders webhook URL input with label "Webhook URL" (AC-002)', () => {
    render(<AppCreator />);
    expect(screen.getByLabelText('Webhook URL')).toBeInTheDocument();
  });

  it('renders environment radio group with Production and Sandbox (AC-002)', () => {
    render(<AppCreator />);
    expect(screen.getByLabelText('Sandbox')).toBeInTheDocument();
    expect(screen.getByLabelText('Production')).toBeInTheDocument();
  });

  it('renders scope checkboxes (read, write, admin) (AC-002)', () => {
    render(<AppCreator />);
    expect(screen.getByLabelText('Read')).toBeInTheDocument();
    expect(screen.getByLabelText('Write')).toBeInTheDocument();
    expect(screen.getByLabelText('Admin')).toBeInTheDocument();
  });

  it('renders breadcrumb with "Developer Apps" link to /developers/apps (AC-010)', () => {
    render(<AppCreator />);
    const breadcrumbNav = screen.getByLabelText('Breadcrumb');
    expect(breadcrumbNav).toBeInTheDocument();
    const link = screen.getByText('Developer Apps');
    expect(link.closest('a')).toHaveAttribute('href', '/developers/apps');
  });

  it('breadcrumb shows "Create New App" with aria-current="page" (AC-010)', () => {
    render(<AppCreator />);
    const currentItems = document.querySelectorAll('[aria-current="page"]');
    expect(currentItems.length).toBe(1);
    expect(currentItems[0]).toHaveTextContent('Create New App');
  });

  it('renders Create App submit button (AC-001)', () => {
    render(<AppCreator />);
    expect(screen.getByRole('button', { name: 'Create App' })).toBeInTheDocument();
  });

  it('renders Cancel link pointing to /developers/apps (AC-011)', () => {
    render(<AppCreator />);
    const cancel = screen.getByText('Cancel');
    expect(cancel.closest('a')).toHaveAttribute('href', '/developers/apps');
  });

  // Defaults
  it('Sandbox radio is selected by default (AC-003)', () => {
    render(<AppCreator />);
    const sandbox = screen.getByLabelText('Sandbox') as HTMLInputElement;
    const production = screen.getByLabelText('Production') as HTMLInputElement;
    expect(sandbox.checked).toBe(true);
    expect(production.checked).toBe(false);
  });

  it('read scope checkbox is checked by default (AC-003)', () => {
    render(<AppCreator />);
    const read = screen.getByLabelText('Read') as HTMLInputElement;
    expect(read.checked).toBe(true);
  });

  it('write and admin checkboxes are unchecked by default (AC-003)', () => {
    render(<AppCreator />);
    const write = screen.getByLabelText('Write') as HTMLInputElement;
    const admin = screen.getByLabelText('Admin') as HTMLInputElement;
    expect(write.checked).toBe(false);
    expect(admin.checked).toBe(false);
  });

  // Validation
  it('submit with empty name shows "App name is required" error (AC-004)', async () => {
    const user = userEvent.setup();
    render(<AppCreator />);
    await user.click(screen.getByRole('button', { name: 'Create App' }));
    expect(screen.getByText('App name is required')).toBeInTheDocument();
  });

  it('submit with valid name and empty webhook succeeds (AC-005)', async () => {
    const user = userEvent.setup();
    render(<AppCreator />);
    await user.type(screen.getByLabelText('App Name'), 'My Test App');
    await user.click(screen.getByRole('button', { name: 'Create App' }));
    await waitFor(() => {
      expect(screen.getByText('App Created Successfully')).toBeInTheDocument();
    });
  });

  it('submit with invalid webhook URL shows error (AC-005)', async () => {
    const user = userEvent.setup();
    render(<AppCreator />);
    await user.type(screen.getByLabelText('App Name'), 'Test App');
    await user.type(screen.getByLabelText('Webhook URL'), 'not-a-url');
    await user.click(screen.getByRole('button', { name: 'Create App' }));
    expect(screen.getByText('Invalid URL format')).toBeInTheDocument();
  });

  it('submit with valid https webhook shows no error (AC-005)', async () => {
    const user = userEvent.setup();
    render(<AppCreator />);
    await user.type(screen.getByLabelText('App Name'), 'Test App');
    await user.type(screen.getByLabelText('Webhook URL'), 'https://example.com/hook');
    await user.click(screen.getByRole('button', { name: 'Create App' }));
    await waitFor(() => {
      expect(screen.getByText('App Created Successfully')).toBeInTheDocument();
    });
  });

  it('error message has aria-describedby linking to input (AC-014)', async () => {
    const user = userEvent.setup();
    render(<AppCreator />);
    await user.click(screen.getByRole('button', { name: 'Create App' }));
    const nameInput = screen.getByLabelText('App Name');
    expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    expect(nameInput).toHaveAttribute('aria-describedby', 'app-name-error');
    expect(document.getElementById('app-name-error')).toBeInTheDocument();
  });

  it('submit with all scopes unchecked shows scope error with aria-describedby (AC-014)', async () => {
    const user = userEvent.setup();
    render(<AppCreator />);
    await user.type(screen.getByLabelText('App Name'), 'My App');
    // Uncheck the default "read" scope
    await user.click(screen.getByLabelText('Read'));
    await user.click(screen.getByRole('button', { name: 'Create App' }));
    expect(screen.getByText('At least one scope is required')).toBeInTheDocument();
    // Verify scope error has id and checkboxes reference it
    const scopeError = document.getElementById('scope-error');
    expect(scopeError).toBeInTheDocument();
    const readCheckbox = screen.getByLabelText('Read');
    expect(readCheckbox).toHaveAttribute('aria-describedby', 'scope-error');
  });

  it('submit with name over 100 chars shows length error (AC-004)', async () => {
    const user = userEvent.setup();
    render(<AppCreator />);
    const longName = 'a'.repeat(101);
    // Use fireEvent to bypass maxLength attribute in test env
    fireEvent.change(screen.getByLabelText('App Name'), { target: { value: longName } });
    await user.click(screen.getByRole('button', { name: 'Create App' }));
    expect(screen.getByText('App name must be 100 characters or less')).toBeInTheDocument();
  });

  it('submit with description over 500 chars shows length error', async () => {
    const user = userEvent.setup();
    render(<AppCreator />);
    await user.type(screen.getByLabelText('App Name'), 'Valid Name');
    const longDesc = 'a'.repeat(501);
    // Use fireEvent to bypass maxLength attribute in test env
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: longDesc } });
    await user.click(screen.getByRole('button', { name: 'Create App' }));
    expect(screen.getByText('Description must be 500 characters or less')).toBeInTheDocument();
  });

  it('typing in description field updates value', async () => {
    const user = userEvent.setup();
    render(<AppCreator />);
    const textarea = screen.getByLabelText('Description');
    await user.type(textarea, 'A test description');
    expect(textarea).toHaveValue('A test description');
  });

  // Interactions
  it('typing in name field updates displayed value (AC-002)', async () => {
    const user = userEvent.setup();
    render(<AppCreator />);
    const input = screen.getByLabelText('App Name');
    await user.type(input, 'Hello World');
    expect(input).toHaveValue('Hello World');
  });

  it('selecting Production radio changes environment (AC-002)', async () => {
    const user = userEvent.setup();
    render(<AppCreator />);
    const production = screen.getByLabelText('Production') as HTMLInputElement;
    await user.click(production);
    expect(production.checked).toBe(true);
  });

  it('toggling write checkbox updates scope selection (AC-002)', async () => {
    const user = userEvent.setup();
    render(<AppCreator />);
    const write = screen.getByLabelText('Write') as HTMLInputElement;
    await user.click(write);
    expect(write.checked).toBe(true);
  });

  it('switching to Production then back to Sandbox restores default (AC-002)', async () => {
    const user = userEvent.setup();
    render(<AppCreator />);
    await user.click(screen.getByLabelText('Production'));
    expect((screen.getByLabelText('Production') as HTMLInputElement).checked).toBe(true);
    await user.click(screen.getByLabelText('Sandbox'));
    expect((screen.getByLabelText('Sandbox') as HTMLInputElement).checked).toBe(true);
  });

  it('toggling admin checkbox updates scope selection (AC-002)', async () => {
    const user = userEvent.setup();
    render(<AppCreator />);
    const admin = screen.getByLabelText('Admin') as HTMLInputElement;
    await user.click(admin);
    expect(admin.checked).toBe(true);
  });

  // Submission & Success State
  it('successful submit shows success state with clientId (AC-007)', async () => {
    const user = userEvent.setup();
    render(<AppCreator />);
    await user.type(screen.getByLabelText('App Name'), 'My App');
    await user.click(screen.getByRole('button', { name: 'Create App' }));
    await waitFor(() => {
      expect(screen.getByText('App Created Successfully')).toBeInTheDocument();
      expect(screen.getByText(/cli_test_/)).toBeInTheDocument();
    });
  });

  it('success state shows client secret (one-time display) (AC-008)', async () => {
    const user = userEvent.setup();
    render(<AppCreator />);
    await user.type(screen.getByLabelText('App Name'), 'My App');
    await user.click(screen.getByRole('button', { name: 'Create App' }));
    await waitFor(() => {
      // Full secret + masked secret both visible
      const secretElements = screen.getAllByText(/cs_test_/);
      expect(secretElements.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('copy button triggers copy feedback (AC-008, AC-015)', async () => {
    const user = userEvent.setup();
    render(<AppCreator />);
    await user.type(screen.getByLabelText('App Name'), 'My App');
    await user.click(screen.getByRole('button', { name: 'Create App' }));
    await waitFor(() => {
      expect(screen.getByText('App Created Successfully')).toBeInTheDocument();
    });
    const copyButtons = screen.getAllByLabelText(/copy.*to clipboard/i);
    expect(copyButtons.length).toBeGreaterThanOrEqual(2);

    // Before click: content_copy icons present
    expect(screen.getAllByText('content_copy').length).toBeGreaterThan(0);

    await user.click(copyButtons[0]);
    // After click: at least one check icon appears (copy feedback)
    await waitFor(() => {
      expect(screen.queryAllByText('check').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('clicking "I\'ve saved my credentials" masks secret and hides full value (AC-009)', async () => {
    const user = userEvent.setup();
    render(<AppCreator />);
    await user.type(screen.getByLabelText('App Name'), 'My App');
    await user.click(screen.getByRole('button', { name: 'Create App' }));
    await waitFor(() => {
      expect(screen.getByText('App Created Successfully')).toBeInTheDocument();
    });
    // Full secret is visible initially
    expect(screen.getByText(/Client Secret \(one-time display\)/)).toBeInTheDocument();
    const fullSecretEl = screen.getByText(/^cs_test_[0-9a-f]{64}$/);
    expect(fullSecretEl).toBeInTheDocument();

    // Click dismiss button
    await user.click(screen.getByRole('button', { name: /I've saved my credentials/i }));

    // After dismiss: label changes, full secret gone, masked shown
    expect(screen.getByText(/Client Secret \(masked\)/)).toBeInTheDocument();
    expect(screen.queryByText(/^cs_test_[0-9a-f]{64}$/)).not.toBeInTheDocument();
    expect(screen.getByText(/cs_test_•+[0-9a-f]{4}/)).toBeInTheDocument();
    // Warning banner should also be hidden
    expect(screen.queryByText('Save your credentials')).not.toBeInTheDocument();
  });

  it('"Create Another App" button resets form including secret state (AC-009)', async () => {
    const user = userEvent.setup();
    render(<AppCreator />);
    await user.type(screen.getByLabelText('App Name'), 'My App');
    await user.click(screen.getByRole('button', { name: 'Create App' }));
    await waitFor(() => {
      expect(screen.getByText('App Created Successfully')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Create Another App' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Create New App' })).toBeInTheDocument();
    expect(screen.getByLabelText('App Name')).toHaveValue('');
  });

  it('"Back to Developer Apps" link points to /developers/apps (AC-011)', async () => {
    const user = userEvent.setup();
    render(<AppCreator />);
    await user.type(screen.getByLabelText('App Name'), 'My App');
    await user.click(screen.getByRole('button', { name: 'Create App' }));
    await waitFor(() => {
      expect(screen.getByText('App Created Successfully')).toBeInTheDocument();
    });
    const backLink = screen.getByText('Back to Developer Apps');
    expect(backLink.closest('a')).toHaveAttribute('href', '/developers/apps');
  });

  it('clipboard failure shows "Copy failed" message (AC-015)', async () => {
    // Override clipboard.writeText to reject for this test
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(
      new Error('Clipboard not available')
    );

    const user = userEvent.setup();
    render(<AppCreator />);
    await user.type(screen.getByLabelText('App Name'), 'My App');
    await user.click(screen.getByRole('button', { name: 'Create App' }));
    await waitFor(() => {
      expect(screen.getByText('App Created Successfully')).toBeInTheDocument();
    });

    const copyButtons = screen.getAllByLabelText(/copy.*to clipboard/i);
    await user.click(copyButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Copy failed')).toBeInTheDocument();
    });
  });

  // Accessibility
  it('all icons have aria-hidden="true" (AC-013)', () => {
    render(<AppCreator />);
    const icons = document.querySelectorAll('.material-symbols-outlined');
    expect(icons.length).toBeGreaterThan(0);
    icons.forEach((icon) => {
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });
  });

  it('all form inputs have associated label elements (AC-012)', () => {
    render(<AppCreator />);
    const nameInput = screen.getByLabelText('App Name');
    expect(nameInput.tagName).toBe('INPUT');
    const descInput = screen.getByLabelText('Description');
    expect(descInput.tagName).toBe('TEXTAREA');
    const webhookInput = screen.getByLabelText('Webhook URL');
    expect(webhookInput.tagName).toBe('INPUT');
  });
});
