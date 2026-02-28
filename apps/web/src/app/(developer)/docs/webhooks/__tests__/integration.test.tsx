import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WebhooksPage from '../page';
import { developerSidebarConfig } from '@/components/sidebar/configs/developer';

// Integration tests — render the full page with real components (no mocks)

describe('WebhooksPage Integration', () => {
  it('full page renders with real components (zero mocks)', () => {
    render(<WebhooksPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Webhooks');
    // Real WebhookDocs renders tab triggers
    expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();
  });

  it('all 5 tab triggers visible', () => {
    render(<WebhooksPage />);
    expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Event Catalog' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Security' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Retry/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Endpoint Tester' })).toBeInTheDocument();
  });

  it('Overview section content visible by default', () => {
    render(<WebhooksPage />);
    expect(screen.getByText('What are Webhooks?')).toBeInTheDocument();
    expect(screen.getByText('Inbound Webhooks')).toBeInTheDocument();
    expect(screen.getByText('Outbound Webhooks')).toBeInTheDocument();
  });

  it('Tester panel renders with URL input field', async () => {
    const user = userEvent.setup();
    render(<WebhooksPage />);
    // Switch to Endpoint Tester tab to mount the tester content
    await user.click(screen.getByRole('tab', { name: 'Endpoint Tester' }));
    const input = screen.getByPlaceholderText(/endpoint/i);
    expect(input).toBeInTheDocument();
  });

  it('developer sidebar config contains webhooks item with correct href', () => {
    const docSection = developerSidebarConfig.sections.find((s) => s.id === 'documentation');
    const webhooksItem = docSection?.items.find((i) => i.id === 'webhooks');
    expect(webhooksItem).toBeDefined();
    expect(webhooksItem?.href).toBe('/docs/webhooks');
  });

  it('developer sidebar config webhooks item has webhook icon', () => {
    const docSection = developerSidebarConfig.sections.find((s) => s.id === 'documentation');
    const webhooksItem = docSection?.items.find((i) => i.id === 'webhooks');
    expect(webhooksItem?.icon).toBe('webhook');
  });

  it('code blocks present on the page', () => {
    render(<WebhooksPage />);
    const preElements = document.querySelectorAll('pre');
    expect(preElements.length).toBeGreaterThanOrEqual(1);
  });
});
