import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import HelpCenterPage from '../(list)/page';
import { DEFAULT_HELP_CATEGORIES } from '@/lib/support/help-categories';

// Mock child components to isolate page logic
vi.mock('@/components/support', () => ({
  HelpSearch: ({
    value,
    onChange,
    resultCount,
  }: Readonly<{
    value: string;
    onChange: (v: string) => void;
    resultCount?: number;
  }>) => (
    <div data-testid="help-search" data-value={value} data-result-count={resultCount}>
      <input data-testid="search-input" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  ),
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

vi.mock('@/components/shared/page-header', () => ({
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
}));

describe('HelpCenterPage', () => {
  it('renders PageHeader with "Help Center" title', () => {
    render(<HelpCenterPage />);

    const header = screen.getByTestId('page-header');
    expect(header).toHaveAttribute('data-title', 'Help Center');
    expect(screen.getByRole('heading', { name: 'Help Center' })).toBeInTheDocument();
  });

  it('renders HelpSearch component', () => {
    render(<HelpCenterPage />);
    expect(screen.getByTestId('help-search')).toBeInTheDocument();
  });

  it('renders HelpCategories component', () => {
    render(<HelpCenterPage />);
    expect(screen.getByTestId('help-categories')).toBeInTheDocument();
  });

  it('passes DEFAULT_HELP_CATEGORIES to HelpCategories initially', () => {
    render(<HelpCenterPage />);

    const categories = screen.getByTestId('help-categories');
    expect(categories).toHaveAttribute('data-count', String(DEFAULT_HELP_CATEGORIES.length));

    // All 8 category names should be present
    DEFAULT_HELP_CATEGORIES.forEach((cat) => {
      expect(screen.getByTestId(`category-${cat.id}`)).toBeInTheDocument();
    });
  });

  it('search state updates filtered categories', async () => {
    render(<HelpCenterPage />);

    const input = screen.getByTestId('search-input');
    // Simulate onChange with a value that matches one category title
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    await user.clear(input);
    await user.type(input, 'Billing');

    // After typing, the page should filter categories
    // The mocked HelpSearch calls onChange directly (no debounce in mock)
    const categories = screen.getByTestId('help-categories');
    expect(Number(categories.getAttribute('data-count'))).toBeLessThan(
      DEFAULT_HELP_CATEGORIES.length
    );
  });

  it('renders all 8 categories on initial load (no loading state)', () => {
    render(<HelpCenterPage />);

    const categories = screen.getByTestId('help-categories');
    expect(categories).toHaveAttribute('data-count', '8');
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
});
