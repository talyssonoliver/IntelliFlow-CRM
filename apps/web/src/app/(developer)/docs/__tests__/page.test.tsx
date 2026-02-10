import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DocsPage from '../page';

// Mock the child components to isolate page tests
vi.mock('@/components/shared/docs-search', () => ({
  DocsSearch: ({ categories, onFilter }: { categories: unknown[]; onFilter: (f: unknown[]) => void }) => (
    <div data-testid="docs-search">
      <input
        data-testid="search-input"
        onChange={(e) => {
          const query = e.target.value.toLowerCase();
          if (!query) {
            onFilter(categories);
          } else {
            onFilter((categories as Array<{ title: string; description: string }>).filter(
              (c) => c.title.toLowerCase().includes(query) || c.description.toLowerCase().includes(query)
            ));
          }
        }}
      />
    </div>
  ),
}));

vi.mock('@/components/shared/docs-navigation', () => ({
  DocsNavigation: ({ categories }: { categories: Array<{ title: string }> }) => (
    <div data-testid="docs-navigation">
      {categories.map((c) => (
        <div key={c.title} data-testid="category-card">
          <h2>{c.title}</h2>
        </div>
      ))}
    </div>
  ),
}));

describe('DocsPage', () => {
  it('renders h1 heading "Developer Documentation"', () => {
    render(<DocsPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Developer Documentation');
  });

  it('renders a description paragraph', () => {
    render(<DocsPage />);
    expect(screen.getByText(/documentation/i, { selector: 'p' })).toBeInTheDocument();
  });

  it('renders DocsSearch component', () => {
    render(<DocsPage />);
    expect(screen.getByTestId('docs-search')).toBeInTheDocument();
  });

  it('renders DocsNavigation component', () => {
    render(<DocsPage />);
    expect(screen.getByTestId('docs-navigation')).toBeInTheDocument();
  });

  it('renders 6 categories initially', () => {
    render(<DocsPage />);
    const cards = screen.getAllByTestId('category-card');
    expect(cards).toHaveLength(6);
  });

  it('has proper heading hierarchy (h1 for page title, h2 for categories)', () => {
    render(<DocsPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();

    const h2s = screen.getAllByRole('heading', { level: 2 });
    expect(h2s.length).toBe(6);
  });

  it('search filtering updates visible categories', async () => {
    render(<DocsPage />);

    const input = screen.getByTestId('search-input');
    await userEvent.type(input, 'api');

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const cards = screen.getAllByTestId('category-card');
    expect(cards.length).toBeLessThan(6);
  });

  it('displays all 6 category titles', () => {
    render(<DocsPage />);
    expect(screen.getByText('Getting Started')).toBeInTheDocument();
    expect(screen.getByText('API Reference')).toBeInTheDocument();
    expect(screen.getByText('Architecture')).toBeInTheDocument();
    expect(screen.getByText('Developer Guides')).toBeInTheDocument();
    expect(screen.getByText('Integration Resources')).toBeInTheDocument();
    expect(screen.getByText('Changelog & Updates')).toBeInTheDocument();
  });

  it('clearing search restores all categories', async () => {
    render(<DocsPage />);

    const input = screen.getByTestId('search-input');
    await userEvent.type(input, 'api');

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    await userEvent.clear(input);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const cards = screen.getAllByTestId('category-card');
    expect(cards).toHaveLength(6);
  });
});
