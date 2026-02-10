import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DocsSearch } from '../docs-search';
import { mockDocsCategories, type DocCategory } from '@/test/fixtures/docs-data';

describe('DocsSearch', () => {
  const defaultProps = {
    categories: mockDocsCategories,
    onFilter: vi.fn(),
  };

  function renderSearch(props?: Partial<{ categories: DocCategory[]; onFilter: (filtered: DocCategory[]) => void }>) {
    return render(<DocsSearch {...defaultProps} {...props} />);
  }

  it('renders search input with placeholder', () => {
    renderSearch();
    expect(screen.getByPlaceholderText('Search documentation...')).toBeInTheDocument();
  });

  it('calls onFilter with all categories when query is empty', () => {
    renderSearch();
    expect(defaultProps.onFilter).toHaveBeenCalledWith(mockDocsCategories);
  });

  it('filters categories by title match (case-insensitive)', async () => {
    const onFilter = vi.fn();
    renderSearch({ onFilter });

    const input = screen.getByPlaceholderText('Search documentation...');
    await userEvent.type(input, 'api');

    // Wait for debounce
    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });

    const lastCall = onFilter.mock.calls[onFilter.mock.calls.length - 1][0] as DocCategory[];
    expect(lastCall.some((c: DocCategory) => c.id === 'api-reference')).toBe(true);
  });

  it('filters categories by description match (case-insensitive)', async () => {
    const onFilter = vi.fn();
    renderSearch({ onFilter });

    const input = screen.getByPlaceholderText('Search documentation...');
    await userEvent.type(input, 'hexagonal');

    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });

    const lastCall = onFilter.mock.calls[onFilter.mock.calls.length - 1][0] as DocCategory[];
    expect(lastCall.some((c: DocCategory) => c.id === 'architecture')).toBe(true);
  });

  it('calls onFilter with empty array when no matches', async () => {
    const onFilter = vi.fn();
    renderSearch({ onFilter });

    const input = screen.getByPlaceholderText('Search documentation...');
    await userEvent.type(input, 'xyznonexistent');

    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });

    const lastCall = onFilter.mock.calls[onFilter.mock.calls.length - 1][0] as DocCategory[];
    expect(lastCall).toHaveLength(0);
  });

  it('shows "No results found" message when filtered list is empty', async () => {
    const onFilter = vi.fn();
    renderSearch({ onFilter });

    const input = screen.getByPlaceholderText('Search documentation...');
    await userEvent.type(input, 'xyznonexistent');

    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });

    // Visible "No results found" paragraph (not the sr-only aria-live region)
    const visibleMessage = screen.getByText(/no results found for/i);
    expect(visibleMessage).toBeInTheDocument();
  });

  it('clears search and restores all categories on clear button click', async () => {
    const onFilter = vi.fn();
    renderSearch({ onFilter });

    const input = screen.getByPlaceholderText('Search documentation...');
    await userEvent.type(input, 'api');

    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });

    const clearButton = screen.getByLabelText('Clear search');
    await userEvent.click(clearButton);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });

    const lastCall = onFilter.mock.calls[onFilter.mock.calls.length - 1][0] as DocCategory[];
    expect(lastCall).toHaveLength(mockDocsCategories.length);
  });

  it('clears search when Escape key is pressed', async () => {
    const onFilter = vi.fn();
    renderSearch({ onFilter });

    const input = screen.getByPlaceholderText('Search documentation...');
    await userEvent.type(input, 'api');

    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });

    fireEvent.keyDown(input, { key: 'Escape' });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });

    expect(input).toHaveValue('');
    const lastCall = onFilter.mock.calls[onFilter.mock.calls.length - 1][0] as DocCategory[];
    expect(lastCall).toHaveLength(mockDocsCategories.length);
  });

  it('has role="search" on container', () => {
    renderSearch();
    expect(screen.getByRole('search')).toBeInTheDocument();
  });

  it('has aria-label="Search documentation" on input', () => {
    renderSearch();
    const input = screen.getByPlaceholderText('Search documentation...');
    expect(input).toHaveAttribute('aria-label', 'Search documentation');
  });

  it('has aria-live="polite" region for results', () => {
    renderSearch();
    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion).toBeInTheDocument();
  });

  it('debounces filtering at 300ms', async () => {
    const onFilter = vi.fn();
    renderSearch({ onFilter });

    onFilter.mockClear();

    const input = screen.getByPlaceholderText('Search documentation...');
    await userEvent.type(input, 'api');

    // Before debounce fires, onFilter should not have been called with filtered results
    expect(onFilter).not.toHaveBeenCalled();

    // After debounce
    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });

    expect(onFilter).toHaveBeenCalled();
  });

  it('matches multiple categories when query is broad', async () => {
    const onFilter = vi.fn();
    renderSearch({ onFilter });

    const input = screen.getByPlaceholderText('Search documentation...');
    await userEvent.type(input, 'guides');

    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });

    const lastCall = onFilter.mock.calls[onFilter.mock.calls.length - 1][0] as DocCategory[];
    // "Developer Guides" title + "Getting Started" has "guides" in description + "migration guides" in Changelog
    expect(lastCall.length).toBeGreaterThanOrEqual(1);
    expect(lastCall.some((c: DocCategory) => c.id === 'developer-guides')).toBe(true);
  });

  it('shows result count in aria-live region', async () => {
    renderSearch();

    const input = screen.getByPlaceholderText('Search documentation...');
    await userEvent.type(input, 'api');

    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });

    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion?.textContent).toMatch(/\d+ result/i);
  });
});
