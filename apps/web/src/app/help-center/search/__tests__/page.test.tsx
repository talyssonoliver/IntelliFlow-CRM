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

// Mock child components to isolate page logic
vi.mock('@/components/support/help-search', () => ({
  HelpSearch: (props: any) => (
    <div data-testid="help-search" data-value={props.value} data-result-count={props.resultCount}>
      HelpSearch
    </div>
  ),
}));

vi.mock('@/components/support/search-filters', () => ({
  SearchFilters: (props: any) => (
    <div
      data-testid="search-filters"
      data-category={props.categoryFilter}
      data-sort={props.sortBy}
      data-popular={props.popularOnly}
    >
      SearchFilters
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
  // Clear and set new params
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

  it('renders HelpSearch component', () => {
    render(<HelpSearchPage />);
    expect(screen.getByTestId('help-search')).toBeInTheDocument();
  });

  it('renders SearchFilters component', () => {
    render(<HelpSearchPage />);
    expect(screen.getByTestId('search-filters')).toBeInTheDocument();
  });

  it('renders HelpCategories', () => {
    render(<HelpSearchPage />);
    expect(screen.getByTestId('help-categories')).toBeInTheDocument();
  });

  it('?q=billing pre-populates HelpSearch value', () => {
    setSearchParams({ q: 'billing' });
    render(<HelpSearchPage />);
    const search = screen.getByTestId('help-search');
    expect(search).toHaveAttribute('data-value', 'billing');
  });

  it('empty query passes all 8 categories', () => {
    setSearchParams({});
    render(<HelpSearchPage />);
    const categories = screen.getByTestId('help-categories');
    expect(categories).toHaveAttribute('data-count', '8');
  });

  it('result count passed to HelpSearch (undefined when empty, N when active)', () => {
    setSearchParams({});
    render(<HelpSearchPage />);
    const search = screen.getByTestId('help-search');
    // Empty query → no resultCount
    expect(search.getAttribute('data-result-count')).toBeNull();
  });

  it('?category=billing propagates to SearchFilters', () => {
    setSearchParams({ category: 'billing' });
    render(<HelpSearchPage />);
    const filters = screen.getByTestId('search-filters');
    expect(filters).toHaveAttribute('data-category', 'billing');
  });

  it('?sort=a-z propagates to SearchFilters', () => {
    setSearchParams({ sort: 'a-z' });
    render(<HelpSearchPage />);
    const filters = screen.getByTestId('search-filters');
    expect(filters).toHaveAttribute('data-sort', 'a-z');
  });

  it('?popular=true propagates to SearchFilters', () => {
    setSearchParams({ popular: 'true' });
    render(<HelpSearchPage />);
    const filters = screen.getByTestId('search-filters');
    expect(filters).toHaveAttribute('data-popular', 'true');
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

  it('use client directive present', () => {
    const pagePath = path.resolve(__dirname, '../page.tsx');
    const content = fs.readFileSync(pagePath, 'utf-8');
    expect(content).toContain("'use client'");
  });
});
