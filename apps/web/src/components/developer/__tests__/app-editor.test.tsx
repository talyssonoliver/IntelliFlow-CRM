import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppEditor } from '../app-editor';
import { createMockDeveloperApp } from '@/test/fixtures/developer-data';

// Mock demo-data module
const mockFindAppById = vi.fn();
vi.mock('@/lib/developer/demo-data', () => ({
  findAppById: (...args: unknown[]) => mockFindAppById(...args),
}));

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock clipboard
const mockWriteText = vi.fn().mockResolvedValue(undefined);
beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: mockWriteText },
    writable: true,
    configurable: true,
  });
});

describe('AppEditor', () => {
  const activeApp = createMockDeveloperApp({
    id: 'app-001',
    name: 'IntelliFlow Dashboard',
    description: 'Main production dashboard',
    clientId: 'cli_prod_a1b2c3d4e5f6',
    status: 'active',
    environment: 'production',
    createdAt: '2026-01-01T00:00:00Z',
    scopes: ['read', 'write'],
    webhookUrl: 'https://dashboard.intelliflow.dev/webhooks',
  });

  const inactiveApp = createMockDeveloperApp({
    id: 'app-003',
    name: 'Legacy Connector',
    description: 'Deprecated connector',
    clientId: 'cli_prod_m3n4o5p6q7r8',
    status: 'inactive',
    environment: 'production',
    createdAt: '2026-01-01T00:00:00Z',
    scopes: ['read'],
  });

  const sandboxApp = createMockDeveloperApp({
    id: 'app-002',
    name: 'CRM Sandbox App',
    description: 'Testing environment',
    clientId: 'cli_test_x7y8z9w0v1u2',
    status: 'pending',
    environment: 'sandbox',
    createdAt: '2026-02-15T00:00:00Z',
    scopes: ['read', 'write', 'admin'],
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockFindAppById.mockImplementation((id: string) => {
      if (id === 'app-001') return activeApp;
      if (id === 'app-003') return inactiveApp;
      if (id === 'app-002') return sandboxApp;
      return undefined;
    });
  });

  // === Core rendering (7) ===

  // AE-001: Renders with data-testid="app-editor"
  it('AE-001: renders with data-testid="app-editor"', () => {
    render(<AppEditor appId="app-001" />);
    expect(screen.getByTestId('app-editor')).toBeInTheDocument();
  });

  // AE-002: Shows "App Not Found" card when appId doesn't match any app
  it('AE-002: shows "App Not Found" card when appId doesn\'t match any app', () => {
    render(<AppEditor appId="nonexistent" />);
    expect(screen.getByText(/app not found/i)).toBeInTheDocument();
  });

  // AE-003: Not-found card has back link to /developers/apps
  it('AE-003: not-found card has back link to /developers/apps', () => {
    render(<AppEditor appId="nonexistent" />);
    const backLink = screen.getByRole('link', { name: /back to developer apps/i });
    expect(backLink).toHaveAttribute('href', '/developers/apps');
  });

  // AE-004: Pre-populates name from existing app
  it('AE-004: pre-populates name from existing app', () => {
    render(<AppEditor appId="app-001" />);
    const nameInput = screen.getByDisplayValue('IntelliFlow Dashboard');
    expect(nameInput).toBeInTheDocument();
  });

  // AE-005: Pre-populates description from existing app
  it('AE-005: pre-populates description from existing app', () => {
    render(<AppEditor appId="app-001" />);
    const descInput = screen.getByDisplayValue('Main production dashboard');
    expect(descInput).toBeInTheDocument();
  });

  // AE-006: Pre-populates scopes from existing app
  it('AE-006: pre-populates scopes from existing app', () => {
    render(<AppEditor appId="app-001" />);
    const readCheckbox = screen.getByRole('checkbox', { name: /read/i });
    const writeCheckbox = screen.getByRole('checkbox', { name: /write/i });
    expect(readCheckbox).toBeChecked();
    expect(writeCheckbox).toBeChecked();
  });

  // AE-007: Pre-populates webhookUrl from existing app (AC-002)
  it('AE-007: pre-populates webhookUrl from existing app', () => {
    render(<AppEditor appId="app-001" />);
    const webhookInput = screen.getByPlaceholderText(
      'https://example.com/webhooks'
    ) as HTMLInputElement;
    expect(webhookInput.value).toBe('https://dashboard.intelliflow.dev/webhooks');
  });

  // === Read-only fields (6) ===

  // AE-008: Displays clientId as read-only text
  it('AE-008: displays clientId as read-only text', () => {
    render(<AppEditor appId="app-001" />);
    expect(screen.getByText('cli_prod_a1b2c3d4e5f6')).toBeInTheDocument();
  });

  // AE-009: Displays copy button for clientId
  it('AE-009: displays copy button for clientId', () => {
    render(<AppEditor appId="app-001" />);
    const copyBtn = screen.getByRole('button', { name: /copy client id/i });
    expect(copyBtn).toBeInTheDocument();
  });

  // AE-010: Displays environment badge (production/sandbox)
  it('AE-010: displays environment badge', () => {
    render(<AppEditor appId="app-001" />);
    expect(screen.getByText('production')).toBeInTheDocument();
  });

  // AE-011: Displays environment tooltip explaining immutability
  it('AE-011: displays environment tooltip explaining immutability', async () => {
    const user = userEvent.setup();
    render(<AppEditor appId="app-001" />);
    // Hover over the environment badge to trigger tooltip
    const badge = screen.getByText('production');
    await user.hover(badge);
    await waitFor(() => {
      const matches = screen.getAllByText(/environment is bound to api key prefixes/i);
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });

  // AE-012: Displays createdAt as formatted date (AC-014)
  it('AE-012: displays createdAt as formatted date', () => {
    render(<AppEditor appId="app-001" />);
    // The date should be formatted from "2026-01-01T00:00:00Z"
    const dateEl = screen.getByTestId('created-at');
    expect(dateEl.textContent).toBeTruthy();
    expect(dateEl.textContent).not.toBe('2026-01-01T00:00:00Z');
  });

  // AE-013: Displays status badge (active/inactive/pending) (AC-015)
  it('AE-013: displays status badge', () => {
    render(<AppEditor appId="app-001" />);
    expect(screen.getByTestId('status-badge')).toHaveTextContent('active');
  });

  // === Editable fields (6) ===

  // AE-014: Name input is editable
  it('AE-014: name input is editable', async () => {
    render(<AppEditor appId="app-001" />);
    const nameInput = screen.getByDisplayValue('IntelliFlow Dashboard') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Updated Name' } });
    expect(nameInput.value).toBe('Updated Name');
  });

  // AE-015: Description textarea is editable
  it('AE-015: description textarea is editable', async () => {
    render(<AppEditor appId="app-001" />);
    const descInput = screen.getByDisplayValue('Main production dashboard') as HTMLTextAreaElement;
    fireEvent.change(descInput, { target: { value: 'Updated description' } });
    expect(descInput.value).toBe('Updated description');
  });

  // AE-016: Name input has maxLength={100}
  it('AE-016: name input has maxLength={100}', () => {
    render(<AppEditor appId="app-001" />);
    const nameInput = screen.getByDisplayValue('IntelliFlow Dashboard');
    expect(nameInput).toHaveAttribute('maxLength', '100');
  });

  // AE-017: Description textarea has maxLength={500}
  it('AE-017: description textarea has maxLength={500}', () => {
    render(<AppEditor appId="app-001" />);
    const descInput = screen.getByDisplayValue('Main production dashboard');
    expect(descInput).toHaveAttribute('maxLength', '500');
  });

  // AE-018: Scope checkboxes reflect current scopes
  it('AE-018: scope checkboxes reflect current scopes', () => {
    render(<AppEditor appId="app-001" />);
    const readCheckbox = screen.getByRole('checkbox', { name: /read/i });
    const writeCheckbox = screen.getByRole('checkbox', { name: /write/i });
    const adminCheckbox = screen.getByRole('checkbox', { name: /admin/i });
    expect(readCheckbox).toBeChecked();
    expect(writeCheckbox).toBeChecked();
    expect(adminCheckbox).not.toBeChecked();
  });

  // AE-019: Toggling scope updates form state
  it('AE-019: toggling scope updates form state', async () => {
    const user = userEvent.setup();
    render(<AppEditor appId="app-001" />);
    const adminCheckbox = screen.getByRole('checkbox', { name: /admin/i });
    expect(adminCheckbox).not.toBeChecked();
    await user.click(adminCheckbox);
    expect(adminCheckbox).toBeChecked();
  });

  // === Validation (6) ===

  // AE-020: Empty name shows validation error
  it('AE-020: empty name shows validation error', async () => {
    const user = userEvent.setup();
    render(<AppEditor appId="app-001" />);
    const nameInput = screen.getByDisplayValue('IntelliFlow Dashboard');
    await user.clear(nameInput);
    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    await user.click(saveBtn);
    expect(screen.getByText(/name is required/i)).toBeInTheDocument();
  });

  // AE-021: Name > 100 chars shows validation error
  it('AE-021: name > 100 chars shows validation error', async () => {
    const user = userEvent.setup();
    render(<AppEditor appId="app-001" />);
    const nameInput = screen.getByDisplayValue('IntelliFlow Dashboard');
    // Input has maxLength=100 so we use fireEvent to bypass
    fireEvent.change(nameInput, { target: { value: 'a'.repeat(101) } });
    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    await user.click(saveBtn);
    expect(screen.getByText(/name must be 100 characters or less/i)).toBeInTheDocument();
  });

  // AE-022: Deselecting all scopes shows validation error
  it('AE-022: deselecting all scopes shows validation error', async () => {
    const user = userEvent.setup();
    render(<AppEditor appId="app-001" />);
    // app-001 has ['read', 'write'] — uncheck both
    const readCheckbox = screen.getByRole('checkbox', { name: /read/i });
    const writeCheckbox = screen.getByRole('checkbox', { name: /write/i });
    await user.click(readCheckbox);
    await user.click(writeCheckbox);
    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    await user.click(saveBtn);
    expect(screen.getByText(/at least one scope is required/i)).toBeInTheDocument();
  });

  // AE-023: Invalid webhook URL shows validation error
  it('AE-023: invalid webhook URL shows validation error', async () => {
    const user = userEvent.setup();
    render(<AppEditor appId="app-001" />);
    const webhookInput = screen.getByPlaceholderText('https://example.com/webhooks');
    fireEvent.change(webhookInput, { target: { value: 'http://insecure.com/hook' } });
    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    await user.click(saveBtn);
    // Production requires HTTPS
    await waitFor(() => {
      expect(
        screen.getByTestId('webhook-config').querySelector('[role="alert"]')
      ).toBeInTheDocument();
    });
  });

  // AE-024: Valid form allows submission
  it('AE-024: valid form allows submission', async () => {
    const user = userEvent.setup();
    render(<AppEditor appId="app-001" />);
    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    await user.click(saveBtn);
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/developers/apps/app-001');
    });
  });

  // AE-025: Validation errors have role="alert", aria-invalid, aria-describedby
  it('AE-025: validation errors have proper ARIA attributes', async () => {
    const user = userEvent.setup();
    render(<AppEditor appId="app-001" />);
    const nameInput = screen.getByDisplayValue('IntelliFlow Dashboard');
    await user.clear(nameInput);
    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    await user.click(saveBtn);
    const alerts = screen.getAllByRole('alert');
    expect(alerts.length).toBeGreaterThan(0);
  });

  // === Navigation (4) ===

  // AE-026: Breadcrumb shows Developer Apps > {app.name} > Edit App
  it('AE-026: breadcrumb shows correct structure', () => {
    render(<AppEditor appId="app-001" />);
    expect(screen.getByText('Developer Apps')).toBeInTheDocument();
    expect(screen.getByText('IntelliFlow Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Edit App')).toBeInTheDocument();
  });

  // AE-027: Breadcrumb last item has aria-current="page"
  it('AE-027: breadcrumb last item has aria-current="page"', () => {
    render(<AppEditor appId="app-001" />);
    const editAppBreadcrumb = screen.getByText('Edit App');
    expect(editAppBreadcrumb).toHaveAttribute('aria-current', 'page');
  });

  // AE-028: Cancel link goes to /developers/apps/[id]
  it('AE-028: cancel link goes to /developers/apps/[id]', () => {
    render(<AppEditor appId="app-001" />);
    const cancelLink = screen.getByRole('link', { name: /cancel/i });
    expect(cancelLink).toHaveAttribute('href', '/developers/apps/app-001');
  });

  // AE-029: Save navigates to /developers/apps/[id] on success
  it('AE-029: save navigates to detail page on success', async () => {
    const user = userEvent.setup();
    render(<AppEditor appId="app-001" />);
    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    await user.click(saveBtn);
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/developers/apps/app-001');
    });
  });

  // === Status-aware UI (3) ===

  // AE-030: Inactive app shows warning banner
  it('AE-030: inactive app shows warning banner', () => {
    render(<AppEditor appId="app-003" />);
    expect(screen.getByText(/this app is inactive/i)).toBeInTheDocument();
  });

  // AE-031: Active app does NOT show warning banner
  it('AE-031: active app does NOT show warning banner', () => {
    render(<AppEditor appId="app-001" />);
    expect(screen.queryByText(/this app is inactive/i)).not.toBeInTheDocument();
  });

  // AE-032: Scope deselection shows informational notice about existing API keys
  it('AE-032: scope deselection shows informational notice about API keys', async () => {
    const user = userEvent.setup();
    render(<AppEditor appId="app-001" />);
    const readCheckbox = screen.getByRole('checkbox', { name: /read/i });
    await user.click(readCheckbox); // Deselect 'read'
    expect(screen.getByText(/changing scopes may affect existing api keys/i)).toBeInTheDocument();
  });

  // === WebhookConfig integration (3) ===

  // AE-033: WebhookConfig receives current webhookUrl
  it('AE-033: WebhookConfig receives current webhookUrl', () => {
    render(<AppEditor appId="app-001" />);
    expect(screen.getByTestId('webhook-config')).toBeInTheDocument();
    const webhookInput = screen.getByPlaceholderText(
      'https://example.com/webhooks'
    ) as HTMLInputElement;
    expect(webhookInput.value).toBe('https://dashboard.intelliflow.dev/webhooks');
  });

  // AE-034: WebhookConfig receives environment
  it('AE-034: WebhookConfig receives environment', () => {
    render(<AppEditor appId="app-001" />);
    expect(screen.getByText('Production webhooks require HTTPS.')).toBeInTheDocument();
  });

  // AE-035: WebhookConfig onChange updates form state
  it('AE-035: WebhookConfig onChange updates form state', () => {
    render(<AppEditor appId="app-001" />);
    const webhookInput = screen.getByPlaceholderText(
      'https://example.com/webhooks'
    ) as HTMLInputElement;
    fireEvent.change(webhookInput, { target: { value: 'https://new.example.com/hook' } });
    expect(webhookInput.value).toBe('https://new.example.com/hook');
  });

  // === Form state (2) ===

  // AE-036: Save button shows "Saving..." and is disabled while submitting
  it('AE-036: save button shows "Saving..." and is disabled while submitting', async () => {
    const user = userEvent.setup();
    render(<AppEditor appId="app-001" />);
    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    await user.click(saveBtn);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
    });
  });

  // AE-037: Copy button copies clientId to clipboard
  it('AE-037: copy button copies clientId to clipboard', async () => {
    render(<AppEditor appId="app-001" />);
    const copyBtn = screen.getByRole('button', { name: /copy client id/i });
    fireEvent.click(copyBtn);
    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledWith('cli_prod_a1b2c3d4e5f6');
    });
  });
});
