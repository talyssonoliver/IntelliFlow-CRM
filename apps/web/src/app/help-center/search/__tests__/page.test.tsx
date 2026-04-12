import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';

// Mock next/navigation
const mockReplace = vi.fn();
const mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ replace: mockReplace }),
}));

// Mock SearchFilterBar to isolate page logic
vi.mock('@/components/shared', () => ({
  PageHeader: (props: any) => (
    <div data-testid="page-header">
      <h1>{props.title}</h1>
      {props.breadcrumbs?.map((b: any) => (
        <span key={b.label}>{b.label}</span>
      ))}
    </div>
  ),
  SearchFilterBar: (props: any) => (
    <div
      data-testid="search-filter-bar"
      data-search-value={props.searchValue}
      data-search-placeholder={props.searchPlaceholder}
      data-sort-value={props.sort?.value}
      data-chip-value={props.filterChips?.value}
      data-category-value={props.filters?.[0]?.value}
    >
      SearchFilterBar
    </div>
  ),
}));

vi.mock('@/components/support/help-categories', () => ({
  HelpCategories: (props: any) => (
    <div data-testid="help-categories" data-count={props.categories.length}>
      {props.categories.map((c: any) => (
        <span key={c.id} data-testid={`category-${c.id}`}>
          {c.title}
        </span>
      ))}
    </div>
  ),
}));

// Import page after mocks
import HelpSearchPage from '@/app/help-center/search/page';

function setSearchParams(params: Record<string, string>) {
  const keys = Array.from(mockSearchParams.keys());
  keys.forEach((k) => mockSearchParams.delete(k));
  Object.entries(params).forEach(([k, v]) => mockSearchParams.set(k, v));
}

describe('HelpSearchPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSearchParams({});
  });

  it('renders PageHeader with title "Search Help Center"', () => {
    render(<HelpSearchPage />);
    expect(screen.getByText('Search Help Center')).toBeInTheDocument();
  });

  it('renders breadcrumbs: Dashboard > Help Center > Search', () => {
    render(<HelpSearchPage />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Help Center')).toBeInTheDocument();
    expect(screen.getByText('Search')).toBeInTheDocument();
  });

  it('renders SearchFilterBar component', () => {
    render(<HelpSearchPage />);
    expect(screen.getByTestId('search-filter-bar')).toBeInTheDocument();
  });

  it('renders HelpCategories', () => {
    render(<HelpSearchPage />);
    expect(screen.getByTestId('help-categories')).toBeInTheDocument();
  });

  it('?q=billing pre-populates SearchFilterBar searchValue', () => {
    setSearchParams({ q: 'billing' });
    render(<HelpSearchPage />);
    const bar = screen.getByTestId('search-filter-bar');
    expect(bar).toHaveAttribute('data-search-value', 'billing');
  });

  it('empty query passes all 8 categories', () => {
    setSearchParams({});
    render(<HelpSearchPage />);
    const categories = screen.getByTestId('help-categories');
    expect(categories).toHaveAttribute('data-count', '8');
  });

  it('?category=billing propagates to SearchFilterBar', () => {
    setSearchParams({ category: 'billing' });
    render(<HelpSearchPage />);
    const bar = screen.getByTestId('search-filter-bar');
    expect(bar).toHaveAttribute('data-category-value', 'billing');
  });

  it('?sort=a-z propagates to SearchFilterBar', () => {
    setSearchParams({ sort: 'a-z' });
    render(<HelpSearchPage />);
    const bar = screen.getByTestId('search-filter-bar');
    expect(bar).toHaveAttribute('data-sort-value', 'a-z');
  });

  it('?popular=true propagates as chip value "popular"', () => {
    setSearchParams({ popular: 'true' });
    render(<HelpSearchPage />);
    const bar = screen.getByTestId('search-filter-bar');
    expect(bar).toHaveAttribute('data-chip-value', 'popular');
  });

  it('?q=xyznonexistent passes 0 categories', () => {
    setSearchParams({ q: 'xyznonexistent' });
    render(<HelpSearchPage />);
    const categories = screen.getByTestId('help-categories');
    expect(categories).toHaveAttribute('data-count', '0');
  });

  it('popular-only reduces to popular subset', () => {
    setSearchParams({ popular: 'true' });
    render(<HelpSearchPage />);
    const categories = screen.getByTestId('help-categories');
    expect(Number(categories.getAttribute('data-count'))).toBe(3);
  });

  it('default chip value is "all" when popular param absent', () => {
    setSearchParams({});
    render(<HelpSearchPage />);
    const bar = screen.getByTestId('search-filter-bar');
    expect(bar).toHaveAttribute('data-chip-value', 'all');
  });

  it('use client directive present', () => {
    const pagePath = path.resolve(__dirname, '../page.tsx');
    const content = fs.readFileSync(pagePath, 'utf-8');
    expect(content).toContain("'use client'");
  });
});
