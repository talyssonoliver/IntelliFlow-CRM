import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import IntegrationsPage, { metadata } from '../page';

// Mock IntegrationList to isolate page tests
vi.mock('@/components/developer/integration-list', () => ({
  IntegrationList: () => <div data-testid="integration-list">Integration List Mock</div>,
}));

describe('IntegrationsPage', () => {
  it('renders h1 heading "Integration Resources"', () => {
    render(<IntegrationsPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Integration Resources');
  });

  it('renders description paragraph containing "webhooks", "SDKs", or "connectors"', () => {
    render(<IntegrationsPage />);
    const description = screen.getByText(/webhooks.*SDKs.*connectors/i);
    expect(description).toBeInTheDocument();
    expect(description.tagName).toBe('P');
  });

  it('renders IntegrationList component', () => {
    render(<IntegrationsPage />);
    expect(screen.getByTestId('integration-list')).toBeInTheDocument();
  });

  it('exports metadata.title as "Integration Resources | IntelliFlow CRM"', () => {
    expect(metadata.title).toBe('Integration Resources | IntelliFlow CRM');
  });

  it('exports metadata.description containing "Webhooks" or "SDK"', () => {
    expect(metadata.description).toMatch(/Webhooks|SDK/i);
  });

  it('page function is synchronous (NOT AsyncFunction — Server Component check)', () => {
    expect(IntegrationsPage.constructor.name).not.toBe('AsyncFunction');
  });

  it('layout wrapper has "flex flex-col gap-6" classes', () => {
    const { container } = render(<IntegrationsPage />);
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toContain('flex');
    expect(wrapper?.className).toContain('flex-col');
    expect(wrapper?.className).toContain('gap-6');
  });

  it('content is constrained within "max-w-5xl" container', () => {
    const { container } = render(<IntegrationsPage />);
    const inner = container.querySelector('.max-w-5xl');
    expect(inner).toBeInTheDocument();
  });

  it('has accessible h1 landmark (visible, non-empty text)', () => {
    render(<IntegrationsPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeVisible();
    expect(h1.textContent?.trim().length).toBeGreaterThan(0);
  });

  it('no orphan h2 headings at page level (h2s belong to IntegrationList)', () => {
    render(<IntegrationsPage />);
    const h2s = screen.queryAllByRole('heading', { level: 2 });
    // With the mocked IntegrationList, there should be no h2s
    expect(h2s.length).toBe(0);
  });
});
