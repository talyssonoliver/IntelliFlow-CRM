import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import WebhooksPage, { metadata } from '../page';

// Mock WebhookDocs to isolate page tests
vi.mock('@/components/developer/webhook-docs', () => ({
  WebhookDocs: () => <div data-testid="webhook-docs">Webhook Docs Mock</div>,
}));

describe('WebhooksPage', () => {
  it('renders h1 heading "Webhooks"', () => {
    render(<WebhooksPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Webhooks');
  });

  it('renders description paragraph about webhook documentation', () => {
    render(<WebhooksPage />);
    const description = screen.getByText(/webhook integrations.*real-time event notifications/i);
    expect(description).toBeInTheDocument();
    expect(description.tagName).toBe('P');
  });

  it('renders WebhookDocs component', () => {
    render(<WebhooksPage />);
    expect(screen.getByTestId('webhook-docs')).toBeInTheDocument();
  });

  it('exports metadata.title as "Webhooks | IntelliFlow CRM"', () => {
    expect(metadata.title).toBe('Webhooks | IntelliFlow CRM');
  });

  it('exports metadata.description containing "webhook"', () => {
    expect(metadata.description).toMatch(/webhook/i);
  });

  it('page function is synchronous (Server Component check)', () => {
    expect(WebhooksPage.constructor.name).not.toBe('AsyncFunction');
  });

  it('layout wrapper has "flex flex-col gap-6" classes', () => {
    const { container } = render(<WebhooksPage />);
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toContain('flex');
    expect(wrapper?.className).toContain('flex-col');
    expect(wrapper?.className).toContain('gap-6');
  });

  it('content constrained within "max-w-5xl" container', () => {
    const { container } = render(<WebhooksPage />);
    const inner = container.querySelector('.max-w-5xl');
    expect(inner).toBeInTheDocument();
  });

  it('accessible h1 landmark (visible, non-empty text)', () => {
    render(<WebhooksPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeVisible();
    expect(h1.textContent?.trim().length).toBeGreaterThan(0);
  });

  it('no orphan h2 headings at page level (h2s belong to WebhookDocs)', () => {
    render(<WebhooksPage />);
    const h2s = screen.queryAllByRole('heading', { level: 2 });
    // With the mocked WebhookDocs, there should be no h2s
    expect(h2s.length).toBe(0);
  });
});
