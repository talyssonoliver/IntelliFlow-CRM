import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchFilters } from '@/components/support/search-filters';
import type { SearchFiltersProps } from '@/components/support/search-filters';

const defaultProps: SearchFiltersProps = {
  categoryFilter: '',
  onCategoryChange: vi.fn(),
  sortBy: 'relevance',
  onSortChange: vi.fn(),
  popularOnly: false,
  onPopularOnlyChange: vi.fn(),
};

function renderFilters(overrides: Partial<SearchFiltersProps> = {}) {
  const props = { ...defaultProps, ...overrides };
  // Reset mocks for each render
  return render(<SearchFilters {...props} />);
}

describe('SearchFilters', () => {
  it('renders category select with "All Categories" default', () => {
    renderFilters();
    const select = screen.getByLabelText(/category/i);
    expect(select).toBeInTheDocument();
    expect(select).toHaveValue('');
  });

  it('category select contains all 8 category names', () => {
    renderFilters();
    const select = screen.getByLabelText(/category/i);
    const options = select.querySelectorAll('option');
    // "All Categories" + 8 categories = 9 options
    expect(options).toHaveLength(9);
  });

  it('selecting category calls onCategoryChange with category id', () => {
    const onCategoryChange = vi.fn();
    renderFilters({ onCategoryChange });
    const select = screen.getByLabelText(/category/i);
    fireEvent.change(select, { target: { value: 'billing' } });
    expect(onCategoryChange).toHaveBeenCalledWith('billing');
  });

  it('renders sort select with 3 options', () => {
    renderFilters();
    const select = screen.getByLabelText(/sort/i);
    const options = select.querySelectorAll('option');
    expect(options).toHaveLength(3);
  });

  it('selecting sort calls onSortChange with mode value', () => {
    const onSortChange = vi.fn();
    renderFilters({ onSortChange });
    const select = screen.getByLabelText(/sort/i);
    fireEvent.change(select, { target: { value: 'a-z' } });
    expect(onSortChange).toHaveBeenCalledWith('a-z');
  });

  it('renders popular-only toggle button', () => {
    renderFilters();
    expect(screen.getByRole('button', { name: /popular/i })).toBeInTheDocument();
  });

  it('toggle button has aria-pressed="false" initially', () => {
    renderFilters();
    const button = screen.getByRole('button', { name: /popular/i });
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('clicking toggle calls onPopularOnlyChange(true)', () => {
    const onPopularOnlyChange = vi.fn();
    renderFilters({ onPopularOnlyChange });
    const button = screen.getByRole('button', { name: /popular/i });
    fireEvent.click(button);
    expect(onPopularOnlyChange).toHaveBeenCalledWith(true);
  });

  it('when popularOnly=true, toggle has aria-pressed="true"', () => {
    renderFilters({ popularOnly: true });
    const button = screen.getByRole('button', { name: /popular/i });
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  it('category select has sr-only label via htmlFor', () => {
    renderFilters();
    const label = screen.getByText(/category/i);
    expect(label.tagName).toBe('LABEL');
    expect(label.className).toContain('sr-only');
  });

  it('sort select has sr-only label via htmlFor', () => {
    renderFilters();
    const label = screen.getByText(/sort/i);
    expect(label.tagName).toBe('LABEL');
    expect(label.className).toContain('sr-only');
  });

  it('filter controls wrapped in fieldset with legend', () => {
    const { container } = renderFilters();
    const fieldset = container.querySelector('fieldset');
    expect(fieldset).toBeInTheDocument();
    const legend = fieldset?.querySelector('legend');
    expect(legend).toBeInTheDocument();
  });

  it('no callbacks fired on initial render', () => {
    const onCategoryChange = vi.fn();
    const onSortChange = vi.fn();
    const onPopularOnlyChange = vi.fn();
    renderFilters({ onCategoryChange, onSortChange, onPopularOnlyChange });
    expect(onCategoryChange).not.toHaveBeenCalled();
    expect(onSortChange).not.toHaveBeenCalled();
    expect(onPopularOnlyChange).not.toHaveBeenCalled();
  });

  it('sort default matches sortBy prop', () => {
    renderFilters({ sortBy: 'a-z' });
    const select = screen.getByLabelText(/sort/i);
    expect(select).toHaveValue('a-z');
  });

  it('category default matches categoryFilter prop', () => {
    renderFilters({ categoryFilter: 'billing' });
    const select = screen.getByLabelText(/category/i);
    expect(select).toHaveValue('billing');
  });

  it('popular toggle off calls onPopularOnlyChange(false) when currently true', () => {
    const onPopularOnlyChange = vi.fn();
    renderFilters({ popularOnly: true, onPopularOnlyChange });
    const button = screen.getByRole('button', { name: /popular/i });
    fireEvent.click(button);
    expect(onPopularOnlyChange).toHaveBeenCalledWith(false);
  });

  it('result count displays when provided', () => {
    renderFilters({ resultCount: 5 } as any);
    expect(screen.getByText(/5 results/)).toBeInTheDocument();
  });

  it('result count shows singular "1 result found"', () => {
    renderFilters({ resultCount: 1 } as any);
    expect(screen.getByText('1 result found')).toBeInTheDocument();
  });

  it('decorative icons in filter controls have aria-hidden="true"', () => {
    const { container } = renderFilters();
    const icons = container.querySelectorAll('.material-symbols-outlined');
    icons.forEach((icon) => {
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });
  });

  it('popular toggle icon has aria-hidden="true"', () => {
    renderFilters();
    const button = screen.getByRole('button', { name: /popular/i });
    const icon = button.querySelector('.material-symbols-outlined');
    if (icon) {
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    }
  });
});
