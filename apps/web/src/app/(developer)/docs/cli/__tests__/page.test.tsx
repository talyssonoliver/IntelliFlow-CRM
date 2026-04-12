import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import CliDocsPage, { metadata } from '../page';

// Mock CliDocs to isolate page tests
vi.mock('@/components/developer/cli-docs', () => ({
  CliDocs: () => <div data-testid="cli-docs">CLI Docs Mock</div>,
}));

describe('CliDocsPage', () => {
  it('renders h1 heading "CLI Reference" (AC-001)', () => {
    render(<CliDocsPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('CLI Reference');
  });

  it('renders description paragraph containing "CLI" (AC-001)', () => {
    render(<CliDocsPage />);
    const description = screen.getByText(/Monorepo development commands/i);
    expect(description).toBeInTheDocument();
    expect(description.tagName).toBe('P');
  });

  it('renders mocked CliDocs child via data-testid="cli-docs" (AC-001)', () => {
    render(<CliDocsPage />);
    expect(screen.getByTestId('cli-docs')).toBeInTheDocument();
  });

  it('metadata.title === "CLI Reference | IntelliFlow CRM"', () => {
    expect(metadata.title).toBe('CLI Reference | IntelliFlow CRM');
  });

  it('metadata.description contains "CLI"', () => {
    expect(metadata.description).toMatch(/CLI/i);
  });

  it('page function is synchronous (Server Component)', () => {
    expect(CliDocsPage.constructor.name).not.toBe('AsyncFunction');
  });

  it('wrapper has flex flex-col gap-6 classes', () => {
    const { container } = render(<CliDocsPage />);
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toContain('flex');
    expect(wrapper?.className).toContain('flex-col');
    expect(wrapper?.className).toContain('gap-6');
  });

  it('content within max-w-5xl container', () => {
    const { container } = render(<CliDocsPage />);
    const inner = container.querySelector('.max-w-5xl');
    expect(inner).toBeInTheDocument();
  });

  it('h1 is visible and non-empty (NF-006)', () => {
    render(<CliDocsPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeVisible();
    expect(h1.textContent?.trim().length).toBeGreaterThan(0);
  });

  it('no orphan h2 at page level with mocked child', () => {
    render(<CliDocsPage />);
    const h2s = screen.queryAllByRole('heading', { level: 2 });
    expect(h2s.length).toBe(0);
  });
});
