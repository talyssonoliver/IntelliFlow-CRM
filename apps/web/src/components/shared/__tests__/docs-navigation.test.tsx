import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DocsNavigation } from '../docs-navigation';
import { mockDocsCategories } from '@/test/fixtures/docs-data';

describe('DocsNavigation', () => {
  it('renders all 6 documentation categories', () => {
    render(<DocsNavigation categories={mockDocsCategories} />);
    for (const cat of mockDocsCategories) {
      expect(screen.getByText(cat.title)).toBeInTheDocument();
    }
  });

  it('renders category descriptions', () => {
    render(<DocsNavigation categories={mockDocsCategories} />);
    for (const cat of mockDocsCategories) {
      expect(screen.getByText(cat.description)).toBeInTheDocument();
    }
  });

  it('renders category icons', () => {
    render(<DocsNavigation categories={mockDocsCategories} />);
    for (const cat of mockDocsCategories) {
      expect(screen.getByText(cat.icon)).toBeInTheDocument();
    }
  });

  it('links to correct href for enabled categories only', () => {
    render(<DocsNavigation categories={mockDocsCategories} />);
    const links = screen.queryAllByRole('link');
    const enabledCategories = mockDocsCategories.filter((c) => !c.comingSoon && !c.external);

    // Only enabled categories should have links
    expect(links.length).toBe(enabledCategories.length);

    for (const cat of enabledCategories) {
      const link = links.find((l) => l.getAttribute('href') === cat.href);
      expect(link).toBeDefined();
    }
  });

  it('shows "Coming Soon" badge for comingSoon categories', () => {
    render(<DocsNavigation categories={mockDocsCategories} />);
    const comingSoonCats = mockDocsCategories.filter((c) => c.comingSoon);
    const badges = screen.getAllByText('Coming Soon');
    expect(badges).toHaveLength(comingSoonCats.length);
  });

  it('does not show "Coming Soon" badge for non-comingSoon categories', () => {
    const nonComingSoon = mockDocsCategories.filter((c) => !c.comingSoon);
    render(<DocsNavigation categories={nonComingSoon} />);
    expect(screen.queryByText('Coming Soon')).not.toBeInTheDocument();
  });

  it('external categories are non-clickable', () => {
    render(<DocsNavigation categories={mockDocsCategories} />);
    const externalCats = mockDocsCategories.filter((c) => c.external);

    // External categories should not have links
    for (const cat of externalCats) {
      const links = screen.queryAllByRole('link');
      const link = links.find((l) => l.getAttribute('href') === cat.href);
      expect(link).toBeUndefined();
    }
  });

  it('shows "External - Coming Soon" badge for external categories', () => {
    render(<DocsNavigation categories={mockDocsCategories} />);
    const externalCats = mockDocsCategories.filter((c) => c.external);
    const badges = screen.getAllByText('External - Coming Soon');
    expect(badges).toHaveLength(externalCats.length);
  });

  it('coming soon categories are non-clickable', () => {
    render(<DocsNavigation categories={mockDocsCategories} />);
    const comingSoonCats = mockDocsCategories.filter((c) => c.comingSoon && !c.external);

    // Coming soon categories should not have links
    for (const cat of comingSoonCats) {
      const links = screen.queryAllByRole('link');
      const link = links.find((l) => l.getAttribute('href') === cat.href);
      expect(link).toBeUndefined();
    }
  });

  it('uses responsive grid classes', () => {
    const { container } = render(<DocsNavigation categories={mockDocsCategories} />);
    const grid = container.querySelector('.grid');
    expect(grid).toBeInTheDocument();
    expect(grid?.className).toContain('md:grid-cols-2');
    expect(grid?.className).toContain('lg:grid-cols-3');
  });

  it('enabled cards have hover effects, disabled cards do not', () => {
    const { container } = render(<DocsNavigation categories={mockDocsCategories} />);
    const disabledCards = container.querySelectorAll('[class*="cursor-not-allowed"]');
    const enabledCategories = mockDocsCategories.filter((c) => !c.comingSoon && !c.external);
    const disabledCategories = mockDocsCategories.filter((c) => c.comingSoon || c.external);

    // All disabled categories should have cursor-not-allowed
    expect(disabledCards.length).toBe(disabledCategories.length);

    // Enabled categories would have hover:border-primary (if any exist)
    if (enabledCategories.length > 0) {
      const hoverCards = container.querySelectorAll('[class*="hover:border-primary"]');
      expect(hoverCards.length).toBe(enabledCategories.length);
    }
  });

  it('shows doc count badge when docCount is provided', () => {
    render(<DocsNavigation categories={mockDocsCategories} />);
    const catWithCount = mockDocsCategories.find((c) => c.docCount);
    if (catWithCount) {
      expect(screen.getByText(String(catWithCount.docCount))).toBeInTheDocument();
    }
  });

  it('renders chevron right indicator on each card', () => {
    render(<DocsNavigation categories={mockDocsCategories} />);
    const chevrons = screen.getAllByText('chevron_right');
    expect(chevrons).toHaveLength(mockDocsCategories.length);
  });

  it('disabled cards have opacity-70 and cursor-not-allowed classes', () => {
    const { container } = render(<DocsNavigation categories={mockDocsCategories} />);
    const disabledCards = container.querySelectorAll('[class*="opacity-70"]');
    const disabledCount = mockDocsCategories.filter((c) => c.comingSoon || c.external).length;
    expect(disabledCards.length).toBe(disabledCount);
  });

  it('renders color-coded icon badges', () => {
    const { container } = render(<DocsNavigation categories={mockDocsCategories} />);
    for (const cat of mockDocsCategories) {
      const colorDiv = container.querySelector(`.${cat.color.replace('bg-', 'bg-')}`);
      // Check that colored icon container exists
      expect(container.innerHTML).toContain(cat.color);
    }
  });

  it('renders with empty categories', () => {
    render(<DocsNavigation categories={[]} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('only enabled categories are clickable links', () => {
    render(<DocsNavigation categories={mockDocsCategories} />);
    const links = screen.queryAllByRole('link');
    const enabledCategories = mockDocsCategories.filter((c) => !c.comingSoon && !c.external);
    expect(links.length).toBe(enabledCategories.length);
  });
});
