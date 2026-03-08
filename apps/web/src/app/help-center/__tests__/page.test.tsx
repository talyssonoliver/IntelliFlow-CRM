import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import HelpCenterPage from '../(list)/page';
import { DEFAULT_HELP_CATEGORIES } from '@/lib/support/help-categories';

// Mock next/navigation
const mockReplace = vi.fn();
const mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ replace: mockReplace }),
}));

// Mock shared components to isolate page logic
vi.mock('@/components/shared', () => ({
  PageHeader: ({
    title,
    description,
    breadcrumbs,
  }: Readonly<{
    title: string;
    description?: string;
    breadcrumbs?: Array<{ label: string; href?: string }>;
  }>) => (
    <div data-testid="page-header" data-title={title}>
      <h1>{title}</h1>
      {description && <p>{description}</p>}
      {breadcrumbs?.map((b, i) => (
        <span key={i} data-testid={`breadcrumb-${i}`} data-href={b.href}>
          {b.label}
        </span>
      ))}
    </div>
  ),
  SearchFilterBar: (props: any) => (
    <div
      data-testid="search-filter-bar"
      data-search-value={props.searchValue}
      data-sort-value={props.sort?.value}
      data-chip-value={props.filterChips?.value}
      data-category-value={props.filters?.[0]?.value}
    >
      SearchFilterBar
    </div>
  ),
}));

vi.mock('@/components/support', () => ({
  HelpCategories: ({ categories }: Readonly<{ categories: unknown[] }>) => (
    <div data-testid="help-categories" data-count={categories.length}>
      {categories.map((c: any) => (
        <span key={c.id} data-testid={`category-${c.id}`}>
          {c.title}
        </span>
      ))}
    </div>
  ),
}));

function setSearchParams(params: Record<string, string>) {
  const keys = Array.from(mockSearchParams.keys());
  keys.forEach((k) => mockSearchParams.delete(k));
  Object.entries(params).forEach(([k, v]) => mockSearchParams.set(k, v));
}

describe('HelpCenterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSearchParams({});
  });

  it('renders PageHeader with "Help Center" title', () => {
    render(<HelpCenterPage />);

    const header = screen.getByTestId('page-header');
    expect(header).toHaveAttribute('data-title', 'Help Center');
    expect(screen.getByRole('heading', { name: 'Help Center' })).toBeInTheDocument();
  });

  it('renders SearchFilterBar component', () => {
    render(<HelpCenterPage />);
    expect(screen.getByTestId('search-filter-bar')).toBeInTheDocument();
  });

  it('renders HelpCategories component', () => {
    render(<HelpCenterPage />);
    expect(screen.getByTestId('help-categories')).toBeInTheDocument();
  });

  it('passes all 8 categories on empty query', () => {
    render(<HelpCenterPage />);

    const categories = screen.getByTestId('help-categories');
    expect(categories).toHaveAttribute('data-count', String(DEFAULT_HELP_CATEGORIES.length));

    DEFAULT_HELP_CATEGORIES.forEach((cat) => {
      expect(screen.getByTestId(`category-${cat.id}`)).toBeInTheDocument();
    });
  });

  it('PageHeader breadcrumbs: Dashboard > Help Center', () => {
    render(<HelpCenterPage />);

    const bc0 = screen.getByTestId('breadcrumb-0');
    expect(bc0).toHaveTextContent('Dashboard');
    expect(bc0).toHaveAttribute('data-href', '/dashboard');

    const bc1 = screen.getByTestId('breadcrumb-1');
    expect(bc1).toHaveTextContent('Help Center');
  });

  it('renders description in PageHeader', () => {
    render(<HelpCenterPage />);

    expect(
      screen.getByText('Find answers, guides, and documentation for IntelliFlow CRM')
    ).toBeInTheDocument();
  });

  it('page source has "use client" directive', () => {
    const filePath = resolve(__dirname, '../(list)/page.tsx');
    const source = readFileSync(filePath, 'utf-8');
    expect(source.trimStart().startsWith("'use client'")).toBe(true);
  });

  it('?q=billing pre-populates SearchFilterBar searchValue', () => {
    setSearchParams({ q: 'billing' });
    render(<HelpCenterPage />);
    const bar = screen.getByTestId('search-filter-bar');
    expect(bar).toHaveAttribute('data-search-value', 'billing');
  });

  it('?category=billing propagates to SearchFilterBar', () => {
    setSearchParams({ category: 'billing' });
    render(<HelpCenterPage />);
    const bar = screen.getByTestId('search-filter-bar');
    expect(bar).toHaveAttribute('data-category-value', 'billing');
  });

  it('?sort=a-z propagates to SearchFilterBar', () => {
    setSearchParams({ sort: 'a-z' });
    render(<HelpCenterPage />);
    const bar = screen.getByTestId('search-filter-bar');
    expect(bar).toHaveAttribute('data-sort-value', 'a-z');
  });

  it('?popular=true propagates as chip value "popular"', () => {
    setSearchParams({ popular: 'true' });
    render(<HelpCenterPage />);
    const bar = screen.getByTestId('search-filter-bar');
    expect(bar).toHaveAttribute('data-chip-value', 'popular');
  });

  it('?q=xyznonexistent passes 0 categories', () => {
    setSearchParams({ q: 'xyznonexistent' });
    render(<HelpCenterPage />);
    const categories = screen.getByTestId('help-categories');
    expect(categories).toHaveAttribute('data-count', '0');
  });

  it('popular-only reduces to popular subset', () => {
    setSearchParams({ popular: 'true' });
    render(<HelpCenterPage />);
    const categories = screen.getByTestId('help-categories');
    expect(Number(categories.getAttribute('data-count'))).toBe(3);
  });
});
