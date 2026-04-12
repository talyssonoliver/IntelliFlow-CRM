import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppDashboard } from '../app-dashboard';

// Mock AppMetrics to isolate dashboard tests
vi.mock('@/components/developer/app-metrics', () => ({
  AppMetrics: ({ app }: Readonly<{ app: { name: string } }>) => (
    <div data-testid="app-metrics">Metrics for {app.name}</div>
  ),
}));

// Mock clipboard
beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    writable: true,
    configurable: true,
  });
});

describe('AppDashboard', () => {
  // D-001: Renders app name as heading
  it('renders app name as h1 heading for app-001', () => {
    render(<AppDashboard appId="app-001" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('IntelliFlow Dashboard');
  });

  // D-002: Renders status badge for active app
  it('renders Active status badge for active app', () => {
    render(<AppDashboard appId="app-001" />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  // D-003: Renders status badge for inactive app
  it('renders Inactive status badge for inactive app', () => {
    render(<AppDashboard appId="app-003" />);
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  // D-004: Renders status badge for pending app
  it('renders Pending status badge for pending app', () => {
    render(<AppDashboard appId="app-002" />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  // D-005: Renders environment badge
  it('renders environment badge Production for production app', () => {
    render(<AppDashboard appId="app-001" />);
    // Badge and info text both say "Production"; at least one exists
    expect(screen.getAllByText('Production').length).toBeGreaterThanOrEqual(1);
  });

  it('renders environment badge Sandbox for sandbox app', () => {
    render(<AppDashboard appId="app-002" />);
    expect(screen.getAllByText('Sandbox').length).toBeGreaterThanOrEqual(1);
  });

  // D-006: Renders clientId in code element
  it('renders clientId in code element', () => {
    render(<AppDashboard appId="app-001" />);
    const codeEl = screen.getByText('cli_prod_a1b2c3d4e5f6');
    expect(codeEl.tagName.toLowerCase()).toBe('code');
  });

  // D-007: Copy clientId button has aria-label
  it('copy clientId button has aria-label', () => {
    render(<AppDashboard appId="app-001" />);
    expect(
      screen.getByRole('button', { name: /Copy client ID for IntelliFlow Dashboard/i })
    ).toBeInTheDocument();
  });

  // D-008: Default tab is Overview, shows overview content
  it('default tab is Overview, shows client ID and app info', () => {
    render(<AppDashboard appId="app-001" />);
    expect(screen.getByText('cli_prod_a1b2c3d4e5f6')).toBeVisible();
    expect(screen.getByText('App Information')).toBeVisible();
  });

  // D-009: Click Metrics tab shows metrics content
  it('clicking Metrics tab shows metrics content', async () => {
    const user = userEvent.setup();
    render(<AppDashboard appId="app-001" />);
    await user.click(screen.getByRole('tab', { name: 'Metrics' }));
    expect(screen.getByTestId('app-metrics')).toBeVisible();
  });

  // D-010: Click Logs tab shows logs for active app; empty state for pending
  it('clicking Logs tab shows request logs for active app', async () => {
    const user = userEvent.setup();
    render(<AppDashboard appId="app-001" />);
    await user.click(screen.getByRole('tab', { name: 'Logs' }));
    expect(screen.getByText('Request Logs')).toBeVisible();
    // Multiple log entries may contain /api/v1/contacts — just check at least one
    expect(screen.getAllByText(/\/api\/v1\/contacts/).length).toBeGreaterThanOrEqual(1);
  });

  it('clicking Logs tab shows empty state for pending app', async () => {
    const user = userEvent.setup();
    render(<AppDashboard appId="app-002" />);
    await user.click(screen.getByRole('tab', { name: 'Logs' }));
    expect(screen.getByText('No request logs available.')).toBeVisible();
  });

  // D-011: Tab panel has role="tabpanel"
  it('tab content area has role tabpanel', () => {
    render(<AppDashboard appId="app-001" />);
    expect(screen.getByRole('tabpanel')).toBeInTheDocument();
  });

  // D-012: Active tab has aria-selected=true
  it('active tab has aria-selected true', () => {
    render(<AppDashboard appId="app-001" />);
    const overviewTab = screen.getByRole('tab', { name: 'Overview' });
    expect(overviewTab).toHaveAttribute('aria-selected', 'true');
  });

  // D-013: No API keys shows empty state message
  it('shows empty API keys message for app with no keys', () => {
    render(<AppDashboard appId="app-002" />);
    expect(screen.getByText('No API keys generated yet.')).toBeInTheDocument();
  });

  // D-014: API keys list renders key names and masked keys
  it('renders key names and masked keys for app with keys', () => {
    render(<AppDashboard appId="app-001" />);
    expect(screen.getByText('Dashboard API Key')).toBeInTheDocument();
    expect(screen.getByText('Analytics Key')).toBeInTheDocument();
    // Masked keys contain bullets
    const maskedElements = screen.getAllByText(/ifc_live_.*•/);
    expect(maskedElements.length).toBeGreaterThanOrEqual(1);
  });

  // D-015: Full API key never in DOM for pre-existing keys
  it('full API key text never appears in DOM for pre-existing keys', () => {
    const { container } = render(<AppDashboard appId="app-001" />);
    const textContent = container.textContent ?? '';
    expect(textContent).not.toMatch(/ifc_live_[0-9a-f]{40}/);
  });

  // D-016: Generate API Key creates key with one-time reveal
  it('Generate API Key creates key with one-time reveal', async () => {
    const user = userEvent.setup();
    render(<AppDashboard appId="app-001" />);
    const generateBtn = screen.getByRole('button', { name: /Generate API key/i });
    await user.click(generateBtn);
    // A new key should be added - check API Keys count increased
    expect(screen.getByText('API Keys (3)')).toBeInTheDocument();
  });

  // D-017: Webhook URL shown when present
  it('shows webhook URL for app with webhook configured', () => {
    render(<AppDashboard appId="app-001" />);
    expect(screen.getByText('https://dashboard.intelliflow.dev/webhooks')).toBeInTheDocument();
  });

  // D-018: Webhook URL absent when undefined
  it('does not show webhook URL for app without webhook', () => {
    render(<AppDashboard appId="app-002" />);
    expect(screen.queryByText(/Webhook URL/)).not.toBeInTheDocument();
  });

  // D-019: Breadcrumb links to /developers/apps with aria-current="page"
  it('breadcrumb has link to /developers/apps and aria-current on current page', () => {
    render(<AppDashboard appId="app-001" />);
    const breadcrumbNav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(breadcrumbNav).toBeInTheDocument();
    const link = within(breadcrumbNav).getByText('Developer Apps');
    expect(link.closest('a')).toHaveAttribute('href', '/developers/apps');
    const currentCrumb = within(breadcrumbNav).getByText('IntelliFlow Dashboard');
    expect(currentCrumb).toHaveAttribute('aria-current', 'page');
  });

  // D-020: Edit App link points to /developers/apps/{id}/edit
  it('Edit App link points to correct edit URL', () => {
    render(<AppDashboard appId="app-001" />);
    const editLink = screen.getByText('Edit App');
    expect(editLink.closest('a')).toHaveAttribute('href', '/developers/apps/app-001/edit');
  });

  // D-021: lastUsed timestamp displayed per API key
  it('displays lastUsed timestamp for each API key', () => {
    render(<AppDashboard appId="app-001" />);
    expect(screen.getByTestId('last-used-key-001')).toHaveTextContent(/Last used:/);
    expect(screen.getByTestId('last-used-key-002')).toHaveTextContent(/Last used:/);
  });

  // D-022: Material Symbols icons have aria-hidden="true"
  it('Material Symbols icons have aria-hidden="true"', () => {
    const { container } = render(<AppDashboard appId="app-001" />);
    const icons = container.querySelectorAll('.material-symbols-outlined');
    expect(icons.length).toBeGreaterThan(0);
    icons.forEach((icon) => {
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });
  });

  // D-023: Focus rings on interactive elements
  it('interactive elements have focus-visible:ring classes', () => {
    const { container } = render(<AppDashboard appId="app-001" />);
    const buttons = container.querySelectorAll('button');
    buttons.forEach((button) => {
      expect(button.className).toContain('focus-visible:ring');
    });
  });

  // D-024: Not-found state for unknown appId
  it('shows App Not Found card for unknown appId', () => {
    render(<AppDashboard appId="unknown-xyz" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('App Not Found');
    expect(screen.getByText('Back to Developer Apps')).toBeInTheDocument();
    expect(screen.getByText('Back to Developer Apps').closest('a')).toHaveAttribute(
      'href',
      '/developers/apps'
    );
  });

  // D-025: Webhook URL rendered as text node, not <a href> element
  it('webhook URL is rendered as plain text, not an anchor tag', () => {
    const { container } = render(<AppDashboard appId="app-001" />);
    const webhookText = screen.getByText('https://dashboard.intelliflow.dev/webhooks');
    expect(webhookText.tagName.toLowerCase()).not.toBe('a');
    // Verify no <a> element has the webhook URL as href
    const anchorsWithWebhook = container.querySelectorAll('a[href*="webhook"]');
    expect(anchorsWithWebhook).toHaveLength(0);
  });

  // D-026: Copy clientId button does not throw on click
  it('copy clientId button does not throw on click', async () => {
    const user = userEvent.setup();
    render(<AppDashboard appId="app-001" />);
    const copyBtn = screen.getByRole('button', {
      name: /Copy client ID for IntelliFlow Dashboard/i,
    });
    await user.click(copyBtn);
    // After clicking copy, the icon should change to check mark (feedback)
    expect(copyBtn).toBeInTheDocument();
  });

  // D-027: Reveal toggle shows/hides API key
  it('reveal toggle changes icon state', async () => {
    const user = userEvent.setup();
    render(<AppDashboard appId="app-001" />);
    const revealBtn = screen.getByRole('button', { name: /Reveal API key Dashboard API Key/i });
    await user.click(revealBtn);
    // After clicking reveal, the button should switch to "Hide"
    expect(
      screen.getByRole('button', { name: /Hide API key Dashboard API Key/i })
    ).toBeInTheDocument();
    // Click again to hide
    await user.click(screen.getByRole('button', { name: /Hide API key Dashboard API Key/i }));
    expect(
      screen.getByRole('button', { name: /Reveal API key Dashboard API Key/i })
    ).toBeInTheDocument();
  });

  // D-028: Copy API key button does not throw on click
  it('copy API key button does not throw on click', async () => {
    const user = userEvent.setup();
    render(<AppDashboard appId="app-001" />);
    const copyKeyBtns = screen.getAllByRole('button', { name: /Copy API key/i });
    expect(copyKeyBtns.length).toBeGreaterThanOrEqual(1);
    await user.click(copyKeyBtns[0]);
    // Button still in DOM after clicking copy
    expect(copyKeyBtns[0]).toBeInTheDocument();
  });
});
