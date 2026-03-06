import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppEditor } from '@/components/developer/app-editor';
import { createMockDeveloperApp } from '@/test/fixtures/developer-data';

// Mock demo-data module — no component mocks for integration tests
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

describe('AppEditor Integration', () => {
  const productionApp = createMockDeveloperApp({
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
      if (id === 'app-001') return productionApp;
      if (id === 'app-003') return inactiveApp;
      if (id === 'app-002') return sandboxApp;
      return undefined;
    });
  });

  // EI-001: Full page renders form with pre-populated data from app-001
  it('EI-001: renders form with pre-populated data from app-001', () => {
    render(<AppEditor appId="app-001" />);
    expect(screen.getByDisplayValue('IntelliFlow Dashboard')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Main production dashboard')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /read/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /write/i })).toBeChecked();
    expect(screen.getByTestId('webhook-config')).toBeInTheDocument();
  });

  // EI-002: Full page renders not-found state for unknown id
  it('EI-002: renders not-found state for unknown id', () => {
    render(<AppEditor appId="nonexistent" />);
    expect(screen.getByText(/app not found/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to developer apps/i })).toHaveAttribute(
      'href',
      '/developers/apps'
    );
  });

  // EI-003: Edit name and save navigates to detail page
  it('EI-003: edit name and save navigates to detail page', async () => {
    const user = userEvent.setup();
    render(<AppEditor appId="app-001" />);
    const nameInput = screen.getByDisplayValue('IntelliFlow Dashboard');
    await user.clear(nameInput);
    await user.type(nameInput, 'Updated Dashboard');
    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    await user.click(saveBtn);
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/developers/apps/app-001');
    });
  });

  // EI-004: Edit description and verify textarea updates
  it('EI-004: edit description and verify textarea updates', () => {
    render(<AppEditor appId="app-001" />);
    const descInput = screen.getByDisplayValue('Main production dashboard') as HTMLTextAreaElement;
    fireEvent.change(descInput, { target: { value: 'Updated description text' } });
    expect(descInput.value).toBe('Updated description text');
  });

  // EI-005: Toggle scopes and verify checkbox state
  it('EI-005: toggle scopes and verify checkbox state', async () => {
    const user = userEvent.setup();
    render(<AppEditor appId="app-001" />);
    const adminCheckbox = screen.getByRole('checkbox', { name: /admin/i });
    expect(adminCheckbox).not.toBeChecked();
    await user.click(adminCheckbox);
    expect(adminCheckbox).toBeChecked();
  });

  // EI-006: Webhook URL validation shows inline error for invalid URL
  it('EI-006: webhook URL validation shows inline error for invalid URL', async () => {
    const user = userEvent.setup();
    render(<AppEditor appId="app-001" />);
    const webhookInput = screen.getByPlaceholderText('https://example.com/webhooks');
    fireEvent.change(webhookInput, { target: { value: 'not-a-valid-url' } });
    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    await user.click(saveBtn);
    await waitFor(() => {
      expect(
        screen.getByTestId('webhook-config').querySelector('[role="alert"]')
      ).toBeInTheDocument();
    });
  });

  // EI-007: Production app requires HTTPS webhook
  it('EI-007: production app requires HTTPS webhook', async () => {
    const user = userEvent.setup();
    render(<AppEditor appId="app-001" />);
    const webhookInput = screen.getByPlaceholderText('https://example.com/webhooks');
    fireEvent.change(webhookInput, { target: { value: 'http://insecure.com/hook' } });
    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    await user.click(saveBtn);
    await waitFor(() => {
      expect(
        screen.getByTestId('webhook-config').querySelector('[role="alert"]')
      ).toBeInTheDocument();
    });
  });

  // EI-008: Sandbox app allows HTTP webhook
  it('EI-008: sandbox app allows HTTP webhook', async () => {
    const user = userEvent.setup();
    render(<AppEditor appId="app-002" />);
    const webhookInput = screen.getByPlaceholderText('https://example.com/webhooks');
    fireEvent.change(webhookInput, { target: { value: 'http://localhost:3000/hook' } });
    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    await user.click(saveBtn);
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/developers/apps/app-002');
    });
  });

  // EI-009: Cancel link navigates to detail page (not list)
  it('EI-009: cancel link navigates to detail page (not list)', () => {
    render(<AppEditor appId="app-001" />);
    const cancelLink = screen.getByRole('link', { name: /cancel/i });
    expect(cancelLink).toHaveAttribute('href', '/developers/apps/app-001');
    // Verify it does NOT link to the list page
    expect(cancelLink).not.toHaveAttribute('href', '/developers/apps');
  });

  // EI-010: Inactive app shows warning banner with correct text
  it('EI-010: inactive app shows warning banner with correct text', () => {
    render(<AppEditor appId="app-003" />);
    expect(
      screen.getByText(
        /this app is inactive\. changes will take effect if the app is reactivated\./i
      )
    ).toBeInTheDocument();
  });
});
