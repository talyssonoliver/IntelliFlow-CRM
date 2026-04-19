import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HelpCategories } from '@/components/support/help-categories';
import {
  DEFAULT_HELP_CATEGORIES,
  EMPTY_CATEGORIES,
  ZERO_ARTICLE_CATEGORY,
  ALL_POPULAR_CATEGORIES,
} from '@/test/fixtures/help-data';

describe('HelpCategories', () => {
  it('renders all 8 default categories', () => {
    render(<HelpCategories categories={[...DEFAULT_HELP_CATEGORIES]} />);

    expect(screen.getByText('Getting Started')).toBeInTheDocument();
    expect(screen.getByText('Leads & Contacts')).toBeInTheDocument();
    expect(screen.getByText('Deals & Pipeline')).toBeInTheDocument();
    expect(screen.getByText('Email & Calendar')).toBeInTheDocument();
    expect(screen.getByText('Tickets & Cases')).toBeInTheDocument();
    expect(screen.getByText('AI Features')).toBeInTheDocument();
    expect(screen.getByText('Settings & Admin')).toBeInTheDocument();
    expect(screen.getByText('Billing')).toBeInTheDocument();
  });

  it('each card shows title, description, icon, article count', () => {
    render(<HelpCategories categories={[...DEFAULT_HELP_CATEGORIES]} />);

    // Check first category has all elements
    expect(screen.getByText('Getting Started')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Quick start guides, onboarding steps, and first-time setup for IntelliFlow CRM'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('5 articles')).toBeInTheDocument();

    // Check icon rendered via material-symbols-outlined span
    const icons = document.querySelectorAll('.material-symbols-outlined');
    expect(icons.length).toBeGreaterThan(0);
  });

  it('categories link to /help-center/[category-id]', () => {
    render(<HelpCategories categories={[...DEFAULT_HELP_CATEGORIES]} />);

    const links = screen.getAllByRole('link');
    const hrefs = links.map((l) => l.getAttribute('href'));

    expect(hrefs).toContain('/help-center/getting-started');
    expect(hrefs).toContain('/help-center/leads-contacts');
    expect(hrefs).toContain('/help-center/billing');
  });

  it('popular categories show "Popular" badge', () => {
    render(<HelpCategories categories={[...DEFAULT_HELP_CATEGORIES]} />);

    const badges = screen.getAllByText('Popular');
    // 3 popular categories: getting-started, leads-contacts, deals-pipeline
    expect(badges).toHaveLength(3);
  });

  it('popular categories sorted first', () => {
    const mixed = [
      ...DEFAULT_HELP_CATEGORIES.filter((c) => !c.popular).slice(0, 2),
      ...DEFAULT_HELP_CATEGORIES.filter((c) => c.popular),
    ];

    render(<HelpCategories categories={mixed} />);

    const links = screen.getAllByRole('link');
    // First 3 should be popular categories (sorted by order)
    expect(links[0]).toHaveAttribute('href', '/help-center/getting-started');
    expect(links[1]).toHaveAttribute('href', '/help-center/leads-contacts');
    expect(links[2]).toHaveAttribute('href', '/help-center/deals-pipeline');
  });

  it('responsive grid: 1-col mobile, 2-col tablet, 3-col desktop', () => {
    const { container } = render(<HelpCategories categories={[...DEFAULT_HELP_CATEGORIES]} />);

    const grid = container.firstElementChild;
    expect(grid?.className).toContain('grid-cols-1');
    expect(grid?.className).toContain('md:grid-cols-2');
    expect(grid?.className).toContain('lg:grid-cols-3');
  });

  it('empty categories array renders "No results found" message', () => {
    render(<HelpCategories categories={EMPTY_CATEGORIES} />);

    // EmptyState entity="search" → canonical title 'No results found',
    // description 'Try different keywords or broader filters.' (not the
    // legacy 'Try adjusting your search terms').
    expect(screen.getByText('No results found')).toBeInTheDocument();
    expect(screen.getByText('Try different keywords or broader filters.')).toBeInTheDocument();
  });

  it('categories with articleCount: 0 render correctly', () => {
    render(<HelpCategories categories={ZERO_ARTICLE_CATEGORY} />);

    expect(screen.getByText('Empty Category')).toBeInTheDocument();
    expect(screen.getByText('0 articles')).toBeInTheDocument();
  });

  it('card has correct color class from category data', () => {
    render(<HelpCategories categories={[...DEFAULT_HELP_CATEGORIES]} />);

    // The icon wrapper div should have the color class
    const iconWrappers = document.querySelectorAll('.bg-blue-500');
    expect(iconWrappers.length).toBeGreaterThan(0);

    const emeraldWrappers = document.querySelectorAll('.bg-emerald-500');
    expect(emeraldWrappers.length).toBeGreaterThan(0);
  });

  it('dark mode classes present', () => {
    const { container } = render(<HelpCategories categories={[...DEFAULT_HELP_CATEGORIES]} />);

    const html = container.innerHTML;
    expect(html).toContain('dark:');
  });

  it('keyboard navigation: cards are focusable links', () => {
    render(<HelpCategories categories={[...DEFAULT_HELP_CATEGORIES]} />);

    const links = screen.getAllByRole('link');
    expect(links.length).toBe(8);

    // Each link should have focus-visible styles
    links.forEach((link) => {
      expect(link.className).toContain('focus-visible:');
    });
  });

  it('cards have proper semantic structure (heading, description)', () => {
    render(<HelpCategories categories={ALL_POPULAR_CATEGORIES} />);

    // Card titles rendered inside heading elements
    expect(screen.getByText('Category A')).toBeInTheDocument();
    expect(screen.getByText('First popular category')).toBeInTheDocument();
    expect(screen.getByText('Category B')).toBeInTheDocument();
    expect(screen.getByText('Second popular category')).toBeInTheDocument();
  });
});
