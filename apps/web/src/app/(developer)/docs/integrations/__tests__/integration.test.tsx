import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import IntegrationsPage from '../page';

// Integration tests — render the full page with real components (no mocks)

describe('IntegrationsPage Integration', () => {
  it('full page renders with real IntegrationList (zero mocks)', () => {
    render(<IntegrationsPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Integration Resources');
    // Real IntegrationList should render category headings
    expect(screen.getByText('Webhooks')).toBeInTheDocument();
  });

  it('all 4 category section headings visible', () => {
    render(<IntegrationsPage />);
    const h2s = screen.getAllByRole('heading', { level: 2 });
    expect(h2s.length).toBe(4);
    expect(h2s[0]).toHaveTextContent('Webhooks');
    expect(h2s[1]).toHaveTextContent('SDK & Developer Tools');
    expect(h2s[2]).toHaveTextContent('Authentication');
    expect(h2s[3]).toHaveTextContent('Third-Party Connectors');
  });

  it('available integrations rendered as working links with correct hrefs', () => {
    render(<IntegrationsPage />);
    const inboundLink = screen.getByText('Inbound Webhooks').closest('a');
    expect(inboundLink).toBeInTheDocument();
    expect(inboundLink).toHaveAttribute('href', '/docs/webhooks');

    const reactHooksLink = screen.getByText('React Hooks').closest('a');
    expect(reactHooksLink).toBeInTheDocument();
    expect(reactHooksLink).toHaveAttribute('href', '/docs/api');
  });

  it('Coming Soon integrations visible but not clickable (no <a> tag)', () => {
    render(<IntegrationsPage />);
    const cliText = screen.getByText('CLI Tools');
    expect(cliText).toBeInTheDocument();
    expect(cliText.closest('a')).toBeNull();

    const apiKeysText = screen.getByText('API Keys');
    expect(apiKeysText).toBeInTheDocument();
    expect(apiKeysText.closest('a')).toBeNull();
  });

  it('status badges visible — "Beta" on TypeScript SDK, "Coming Soon" on API Keys/CLI', () => {
    render(<IntegrationsPage />);
    expect(screen.getAllByText('Beta').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Coming Soon').length).toBe(2);
  });

  it('accessible structure: h1 heading, multiple h2s', () => {
    render(<IntegrationsPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent('Integration Resources');

    const h2s = screen.getAllByRole('heading', { level: 2 });
    expect(h2s.length).toBe(4);
  });

  it('external links have rel="noopener noreferrer" attribute', () => {
    render(<IntegrationsPage />);
    const externalLinks = document.querySelectorAll('a[target="_blank"]');
    expect(externalLinks.length).toBeGreaterThan(0);
    externalLinks.forEach((link) => {
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  it('correct total count of integration cards rendered (16)', () => {
    render(<IntegrationsPage />);
    const chevrons = screen.getAllByText('chevron_right');
    expect(chevrons.length).toBe(16);
  });
});
