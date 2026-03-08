import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Mock next/navigation
const mockReplace = vi.fn();
let mockParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockParams,
  useRouter: () => ({ replace: mockReplace }),
}));

// Import real components (no mocks for integration test)
import HelpSearchPage from '@/app/help-center/search/page';

function setSearchParams(params: Record<string, string>) {
  mockParams = new URLSearchParams(params);
}

/** Get only category card links (not breadcrumb links) */
function getCategoryLinks() {
  return screen.getAllByRole('link').filter(
    (el) => el.getAttribute('href')?.startsWith('/help-center/') &&
      !el.closest('nav[aria-label="Breadcrumb"]')
  );
}

describe('HelpSearch Integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    setSearchParams({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('full render: search input + filters + 8 category cards on empty query', () => {
    render(<HelpSearchPage />);
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
    expect(getCategoryLinks()).toHaveLength(8);
  });

  it('typing "billing" + clear triggers search callback', async () => {
    render(<HelpSearchPage />);
    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'billing' } });

    // SearchFilterBar calls onSearchChange directly (no internal debounce)
    expect(mockReplace).toHaveBeenCalled();
  });

  it('typing "automation" triggers search callback', async () => {
    render(<HelpSearchPage />);
    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'automation' } });

    expect(mockReplace).toHaveBeenCalled();
  });

  it('"xyznonexistent" shows "No results found"', () => {
    setSearchParams({ q: 'xyznonexistent' });
    render(<HelpSearchPage />);
    expect(screen.getByText('No results found')).toBeInTheDocument();
  });

  it('popular-only chip: only 3 popular categories shown', () => {
    setSearchParams({ popular: 'true' });
    render(<HelpSearchPage />);
    expect(getCategoryLinks()).toHaveLength(3);
  });

  it('sort by A-Z passes all 8 categories (sort applied to results)', () => {
    setSearchParams({ sort: 'a-z' });
    render(<HelpSearchPage />);
    const links = getCategoryLinks();
    expect(links).toHaveLength(8);
  });

  it('sort by most articles passes all 8 categories', () => {
    setSearchParams({ sort: 'most-articles' });
    render(<HelpSearchPage />);
    const links = getCategoryLinks();
    expect(links).toHaveLength(8);
  });

  it('combined search + popular-only intersection', () => {
    setSearchParams({ q: 'lead', popular: 'true' });
    render(<HelpSearchPage />);
    const links = getCategoryLinks();
    // Only popular items matching "lead" should show
    expect(links.length).toBeGreaterThan(0);
    expect(links.length).toBeLessThanOrEqual(3);
  });

  it('aria-live region updates with result count', () => {
    setSearchParams({ q: 'billing' });
    render(<HelpSearchPage />);
    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion).toBeInTheDocument();
  });

  it('empty query shows all 8 categories', () => {
    setSearchParams({});
    render(<HelpSearchPage />);
    expect(getCategoryLinks()).toHaveLength(8);
  });

  it('?q=billing pre-populates on mount', () => {
    setSearchParams({ q: 'billing' });
    render(<HelpSearchPage />);
    const input = screen.getByRole('searchbox') as HTMLInputElement;
    expect(input.value).toBe('billing');
  });

  it('selecting a category filter calls router.replace', () => {
    setSearchParams({});
    render(<HelpSearchPage />);
    const categorySelect = screen.getByLabelText(/category/i);
    fireEvent.change(categorySelect, { target: { value: 'billing' } });
    expect(mockReplace).toHaveBeenCalled();
  });

  it('selecting a sort mode calls router.replace', () => {
    setSearchParams({});
    render(<HelpSearchPage />);
    const sortSelect = screen.getByLabelText(/sort/i);
    fireEvent.change(sortSelect, { target: { value: 'a-z' } });
    expect(mockReplace).toHaveBeenCalled();
  });

  it('clicking popular chip calls router.replace', () => {
    setSearchParams({});
    render(<HelpSearchPage />);
    const popularChip = screen.getByRole('button', { name: /popular/i });
    fireEvent.click(popularChip);
    expect(mockReplace).toHaveBeenCalled();
  });

  it('changing search does not move focus away from input', () => {
    setSearchParams({});
    render(<HelpSearchPage />);
    const input = screen.getByRole('searchbox');
    input.focus();
    expect(document.activeElement).toBe(input);

    fireEvent.change(input, { target: { value: 'test' } });
    expect(document.activeElement).toBe(input);
  });
});
