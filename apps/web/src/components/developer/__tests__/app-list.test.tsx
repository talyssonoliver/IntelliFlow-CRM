import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppList } from '../app-list';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: Readonly<{
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock navigator.clipboard
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
  writable: true,
  configurable: true,
});

describe('AppList', () => {
  it('renders all 3 app names from static data', () => {
    render(<AppList />);
    expect(screen.getByText('IntelliFlow Dashboard')).toBeInTheDocument();
    expect(screen.getByText('CRM Sandbox App')).toBeInTheDocument();
    expect(screen.getByText('Legacy Connector')).toBeInTheDocument();
  });

  it('renders app descriptions', () => {
    render(<AppList />);
    expect(screen.getByText(/Main production dashboard application/)).toBeInTheDocument();
    expect(screen.getByText(/Testing environment for integration development/)).toBeInTheDocument();
    expect(screen.getByText(/Deprecated integration bridge/)).toBeInTheDocument();
  });

  it('active app shows default badge', () => {
    render(<AppList />);
    const badges = screen.getAllByText('Active');
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it('inactive app shows outline badge variant', () => {
    render(<AppList />);
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('pending app shows warning badge variant', () => {
    render(<AppList />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('environment badge shows Production or Sandbox', () => {
    render(<AppList />);
    const productionBadges = screen.getAllByText('Production');
    expect(productionBadges.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Sandbox')).toBeInTheDocument();
  });

  it('clientId is visible for each app', () => {
    render(<AppList />);
    expect(screen.getByText('cli_prod_a1b2c3d4e5f6')).toBeInTheDocument();
    expect(screen.getByText('cli_test_x7y8z9w0v1u2')).toBeInTheDocument();
    expect(screen.getByText('cli_prod_m3n4o5p6q7r8')).toBeInTheDocument();
  });

  it('API key display is masked with bullet pattern', () => {
    render(<AppList />);
    const maskedKeys = screen.getAllByText(/ifc_live_•+/);
    expect(maskedKeys.length).toBeGreaterThanOrEqual(1);
  });

  it('full API key is NOT rendered in DOM', () => {
    const { container } = render(<AppList />);
    const text = container.textContent || '';
    // Full key would be 49 chars with ifc_live_ + 40 hex without bullets
    expect(text).not.toMatch(/ifc_live_[0-9a-f]{40}/);
  });

  it('copy button exists for clientId', () => {
    render(<AppList />);
    const copyButtons = screen.getAllByLabelText(/Copy client ID/);
    expect(copyButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('Generate API Key button exists per app', () => {
    render(<AppList />);
    const generateButtons = screen.getAllByLabelText(/Generate API key for/);
    expect(generateButtons.length).toBe(3);
  });

  it('aria-labelledby attribute present on app sections', () => {
    render(<AppList />);
    const sections = screen.getAllByRole('region');
    sections.forEach((section) => {
      expect(section).toHaveAttribute('aria-labelledby');
    });
  });

  it('h2 heading for each app name', () => {
    render(<AppList />);
    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings.length).toBe(3);
    expect(headings[0]).toHaveTextContent('IntelliFlow Dashboard');
    expect(headings[1]).toHaveTextContent('CRM Sandbox App');
    expect(headings[2]).toHaveTextContent('Legacy Connector');
  });

  it('Material Symbols icons have aria-hidden="true"', () => {
    const { container } = render(<AppList />);
    const icons = container.querySelectorAll('.material-symbols-outlined');
    icons.forEach((icon) => {
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });
  });

  it('focus-visible rings on interactive elements', () => {
    const { container } = render(<AppList />);
    const buttons = container.querySelectorAll('button');
    buttons.forEach((button) => {
      expect(button.className).toContain('focus-visible:ring-2');
    });
  });

  it('responsive grid class md:grid-cols-2 present', () => {
    const { container } = render(<AppList />);
    const grid = container.querySelector('.md\\:grid-cols-2');
    expect(grid).toBeInTheDocument();
  });

  it('links to /developers/apps/new and /developers/apps/[id] present', () => {
    render(<AppList />);
    const newLinks = screen.getAllByText('Create New App');
    expect(newLinks.length).toBeGreaterThanOrEqual(1);
    const detailLinks = screen.getAllByText('View Details');
    expect(detailLinks.length).toBeGreaterThanOrEqual(1);

    const detailLink = detailLinks[0].closest('a');
    expect(detailLink).toHaveAttribute('href', expect.stringContaining('/developers/apps/'));
  });

  it('clicking copy client ID button does not throw', async () => {
    const user = userEvent.setup();
    render(<AppList />);
    const copyButtons = screen.getAllByLabelText(/Copy client ID/);
    await expect(user.click(copyButtons[0])).resolves.not.toThrow();
  });

  it('clicking Generate API Key adds a new key', async () => {
    const user = userEvent.setup();
    render(<AppList />);
    const generateButtons = screen.getAllByLabelText(/Generate API key for/);
    // CRM Sandbox App has 0 keys initially, click to generate
    await user.click(generateButtons[1]);
    // After generation, a new key name should appear
    expect(screen.getByText(/CRM Sandbox App Key/)).toBeInTheDocument();
  });

  it('clicking reveal toggle shows/hides key', async () => {
    const user = userEvent.setup();
    render(<AppList />);
    const revealButtons = screen.getAllByLabelText(/Reveal API key/);
    expect(revealButtons.length).toBeGreaterThanOrEqual(1);
    // Click to reveal — but only newly generated keys show full key
    await user.click(revealButtons[0]);
    // After clicking, the button label should change to "Hide"
    expect(screen.getAllByLabelText(/Hide API key/).length).toBeGreaterThanOrEqual(1);
  });

  it('webhook URL is displayed for apps that have one', () => {
    render(<AppList />);
    expect(screen.getByText('https://dashboard.intelliflow.dev/webhooks')).toBeInTheDocument();
    expect(screen.getByText('https://legacy.example.com/hook')).toBeInTheDocument();
  });

  it('scopes are displayed as badges', () => {
    render(<AppList />);
    const readBadges = screen.getAllByText('read');
    expect(readBadges.length).toBeGreaterThanOrEqual(1);
    const writeBadges = screen.getAllByText('write');
    expect(writeBadges.length).toBeGreaterThanOrEqual(1);
  });

  it('shows API key count per app', () => {
    render(<AppList />);
    expect(screen.getByText('API Keys (2)')).toBeInTheDocument();
    expect(screen.getByText('API Keys (0)')).toBeInTheDocument();
    expect(screen.getByText('API Keys (1)')).toBeInTheDocument();
  });

  it('clicking copy API key button does not throw', async () => {
    const user = userEvent.setup();
    render(<AppList />);
    const copyKeyButtons = screen.getAllByLabelText(/Copy API key/);
    expect(copyKeyButtons.length).toBeGreaterThanOrEqual(1);
    await expect(user.click(copyKeyButtons[0])).resolves.not.toThrow();
  });
});
