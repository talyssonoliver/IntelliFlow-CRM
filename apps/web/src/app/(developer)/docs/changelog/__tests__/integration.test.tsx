import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ChangelogPage from '../page';
import { developerSidebarConfig } from '@/components/sidebar/configs/developer';

// Integration tests — render the full page with real components (no mocks)

describe('ChangelogPage Integration', () => {
  it('full page renders with real ChangelogDisplay — h1 and first version heading visible', () => {
    render(<ChangelogPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Changelog');
    // Real ChangelogDisplay renders version headings
    const h2s = screen.getAllByRole('heading', { level: 2 });
    expect(h2s.length).toBeGreaterThanOrEqual(1);
  });

  it('at least 5 version entries displayed (AC-002)', () => {
    render(<ChangelogPage />);
    const h2s = screen.getAllByRole('heading', { level: 2 });
    expect(h2s.length).toBeGreaterThanOrEqual(5);
  });

  it('version number badges/tags visible', () => {
    render(<ChangelogPage />);
    expect(screen.getByText('v0.7.0')).toBeInTheDocument();
    expect(screen.getByText('v0.1.0')).toBeInTheDocument();
  });

  it('RSS feed link present with correct href ending in /changelog-rss', () => {
    render(<ChangelogPage />);
    const rssLink = screen.getByLabelText('Subscribe to changelog RSS feed');
    expect(rssLink).toHaveAttribute('href', '/api/developer/changelog-rss');
  });

  it('developer sidebar config documentation section contains changelog item (AC-008)', () => {
    const docSection = developerSidebarConfig.sections.find((s) => s.id === 'documentation');
    const changelogItem = docSection?.items.find((i) => i.id === 'changelog');
    expect(changelogItem).toBeDefined();
  });

  it('changelog sidebar item has href "/docs/changelog" and icon "history"', () => {
    const docSection = developerSidebarConfig.sections.find((s) => s.id === 'documentation');
    const changelogItem = docSection?.items.find((i) => i.id === 'changelog');
    expect(changelogItem?.href).toBe('/docs/changelog');
    expect(changelogItem?.icon).toBe('history');
  });

  it('heading hierarchy: exactly one h1, multiple h2s', () => {
    render(<ChangelogPage />);
    const h1s = screen.getAllByRole('heading', { level: 1 });
    const h2s = screen.getAllByRole('heading', { level: 2 });
    expect(h1s.length).toBe(1);
    expect(h2s.length).toBeGreaterThan(1);
  });
});
