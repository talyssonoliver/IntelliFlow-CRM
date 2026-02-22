import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { IntegrationList } from '../integration-list';
import { developerSidebarConfig } from '../../sidebar/configs/developer';

describe('IntegrationList', () => {
  it('renders all 4 category section headings', () => {
    render(<IntegrationList />);
    expect(screen.getByText('Webhooks')).toBeInTheDocument();
    expect(screen.getByText('SDK & Developer Tools')).toBeInTheDocument();
    expect(screen.getByText('Authentication')).toBeInTheDocument();
    expect(screen.getByText('Third-Party Connectors')).toBeInTheDocument();
  });

  it('renders integration items with correct titles and descriptions', () => {
    render(<IntegrationList />);
    expect(screen.getByText('Inbound Webhooks')).toBeInTheDocument();
    expect(screen.getByText('TypeScript SDK')).toBeInTheDocument();
    expect(screen.getByText('OAuth (Google & Azure)')).toBeInTheDocument();
    expect(screen.getByText('SAP ERP')).toBeInTheDocument();
    expect(screen.getByText(/Receive events from external services/)).toBeInTheDocument();
  });

  it('renders available items as links with correct href', () => {
    render(<IntegrationList />);
    const inboundLink = screen.getByText('Inbound Webhooks').closest('a');
    expect(inboundLink).toBeInTheDocument();
    expect(inboundLink).toHaveAttribute('href', '/docs/webhooks');
  });

  it('renders Coming Soon items as divs (not links), non-clickable', () => {
    render(<IntegrationList />);
    const cliText = screen.getByText('CLI Tools');
    const cliCard = cliText.closest('[aria-disabled="true"]');
    expect(cliCard).toBeInTheDocument();
    expect(cliCard?.tagName).toBe('DIV');
    // Should not be wrapped in a link
    expect(cliText.closest('a')).toBeNull();
  });

  it('renders Beta items as links with "Beta" badge', () => {
    render(<IntegrationList />);
    const sdkText = screen.getByText('TypeScript SDK');
    const sdkLink = sdkText.closest('a');
    expect(sdkLink).toBeInTheDocument();
    // Find the Beta badge near the SDK title
    const sdkContainer = sdkText.closest('.flex-1') as HTMLElement;
    expect(sdkContainer).toBeInTheDocument();
    expect(within(sdkContainer).getByText('Beta')).toBeInTheDocument();
  });

  it('shows correct status badges: Beta and Coming Soon', () => {
    render(<IntegrationList />);
    const betaBadges = screen.getAllByText('Beta');
    expect(betaBadges.length).toBeGreaterThanOrEqual(1);
    const comingSoonBadges = screen.getAllByText('Coming Soon');
    expect(comingSoonBadges.length).toBe(2); // CLI Tools + API Keys
  });

  it('icons have aria-hidden="true" attribute', () => {
    render(<IntegrationList />);
    const icons = document.querySelectorAll('.material-symbols-outlined');
    expect(icons.length).toBeGreaterThan(0);
    icons.forEach((icon) => {
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });
  });

  it('has responsive grid classes (grid, gap-4, md:grid-cols-2)', () => {
    render(<IntegrationList />);
    const grids = document.querySelectorAll('.grid.gap-4');
    expect(grids.length).toBe(4); // One grid per category
    grids.forEach((grid) => {
      expect(grid.className).toContain('md:grid-cols-2');
    });
  });

  it('has focus ring classes on active card links', () => {
    render(<IntegrationList />);
    const links = document.querySelectorAll('a.group');
    expect(links.length).toBeGreaterThan(0);
    links.forEach((link) => {
      expect(link.className).toContain('focus-visible:ring-2');
    });
  });

  it('has aria-disabled="true" on Coming Soon card containers', () => {
    render(<IntegrationList />);
    const disabledCards = document.querySelectorAll('[aria-disabled="true"]');
    expect(disabledCards.length).toBe(2); // CLI Tools + API Keys
  });

  it('external links have target="_blank" and rel="noopener noreferrer"', () => {
    render(<IntegrationList />);
    const externalLinks = document.querySelectorAll('a[target="_blank"]');
    expect(externalLinks.length).toBeGreaterThan(0);
    externalLinks.forEach((link) => {
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  it('shows chevron_right indicator on each card', () => {
    render(<IntegrationList />);
    const chevrons = screen.getAllByText('chevron_right');
    // 16 items total = 16 chevrons
    expect(chevrons.length).toBe(16);
  });

  it('active cards have hover:border-primary class', () => {
    render(<IntegrationList />);
    // Find a card that is NOT disabled (e.g., Inbound Webhooks)
    const card = screen.getByText('Inbound Webhooks').closest('.p-4');
    expect(card?.className).toContain('hover:border-primary');
  });

  it('disabled cards have opacity-70 and cursor-not-allowed classes', () => {
    render(<IntegrationList />);
    const cliCard = screen.getByText('CLI Tools').closest('.p-4');
    expect(cliCard?.className).toContain('opacity-70');
    expect(cliCard?.className).toContain('cursor-not-allowed');
  });

  it('each category section is wrapped in a section with aria-labelledby', () => {
    render(<IntegrationList />);
    const sections = document.querySelectorAll('section[aria-labelledby]');
    expect(sections.length).toBe(4);
  });

  it('has h2 heading hierarchy for category titles', () => {
    render(<IntegrationList />);
    const h2s = screen.getAllByRole('heading', { level: 2 });
    expect(h2s.length).toBe(4);
    expect(h2s[0]).toHaveTextContent('Webhooks');
    expect(h2s[1]).toHaveTextContent('SDK & Developer Tools');
    expect(h2s[2]).toHaveTextContent('Authentication');
    expect(h2s[3]).toHaveTextContent('Third-Party Connectors');
  });

  it('renders correct total number of integration items (16)', () => {
    render(<IntegrationList />);
    // Count all cards (each has a chevron_right)
    const chevrons = screen.getAllByText('chevron_right');
    expect(chevrons.length).toBe(16);
  });

  it('developer sidebar config contains integrations item (AC-007)', () => {
    const docSection = developerSidebarConfig.sections.find((s) => s.id === 'documentation');
    expect(docSection).toBeDefined();
    const integrationsItem = docSection!.items.find((i) => i.id === 'integrations');
    expect(integrationsItem).toBeDefined();
    expect(integrationsItem!.href).toBe('/docs/integrations');
    expect(integrationsItem!.label).toBe('Integrations');
  });
});
