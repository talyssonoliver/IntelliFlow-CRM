import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ChangelogPage, { metadata } from '../page';

// Mock ChangelogDisplay to isolate page tests
vi.mock('@/components/developer/changelog-display', () => ({
  ChangelogDisplay: () => <div data-testid="changelog-display">Changelog Display Mock</div>,
}));

describe('ChangelogPage', () => {
  it('renders h1 heading "Changelog"', () => {
    render(<ChangelogPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Changelog');
  });

  it('renders description paragraph containing release notes/breaking changes text', () => {
    render(<ChangelogPage />);
    const description = screen.getByText(/platform releases.*breaking changes/i);
    expect(description).toBeInTheDocument();
    expect(description.tagName).toBe('P');
  });

  it('renders ChangelogDisplay mock via data-testid', () => {
    render(<ChangelogPage />);
    expect(screen.getByTestId('changelog-display')).toBeInTheDocument();
  });

  it('exports metadata.title as "Changelog | IntelliFlow CRM"', () => {
    expect(metadata.title).toBe('Changelog | IntelliFlow CRM');
  });

  it('exports metadata.description matching /changelog|release/i', () => {
    expect(metadata.description).toMatch(/changelog|release/i);
  });

  it('page function is NOT AsyncFunction (Server Component guard)', () => {
    expect(ChangelogPage.constructor.name).not.toBe('AsyncFunction');
  });

  it('root wrapper has "flex flex-col gap-6" classes', () => {
    const { container } = render(<ChangelogPage />);
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toContain('flex');
    expect(wrapper?.className).toContain('flex-col');
    expect(wrapper?.className).toContain('gap-6');
  });

  it('content constrained within "max-w-5xl" container', () => {
    const { container } = render(<ChangelogPage />);
    const inner = container.querySelector('.max-w-5xl');
    expect(inner).toBeInTheDocument();
  });

  it('h1 is visible with non-empty textContent', () => {
    render(<ChangelogPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeVisible();
    expect(h1.textContent?.trim().length).toBeGreaterThan(0);
  });

  it('metadata.alternates.types includes application/rss+xml key (AC-010)', () => {
    const types = (metadata.alternates as { types?: Record<string, string> })?.types;
    expect(types).toBeDefined();
    expect(types?.['application/rss+xml']).toBe('/api/developer/changelog-rss');
  });
});
