import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock next/navigation
const mockReplace = vi.fn();
let mockParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockParams,
  useRouter: () => ({ replace: mockReplace }),
}));

// Import real components (no mocks for integration test)
import HelpCenterPage from '../(list)/page';

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

describe('HelpCenter Integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    setSearchParams({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders search input, filters, and 8 category cards on empty query', () => {
    render(<HelpCenterPage />);
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
    expect(getCategoryLinks()).toHaveLength(8);
  });

  it('typing triggers router.replace', async () => {
    render(<HelpCenterPage />);
    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'billing' } });

    expect(mockReplace).toHaveBeenCalled();
  });

  it('"xyznonexistent" shows "No results found"', () => {
    setSearchParams({ q: 'xyznonexistent' });
    render(<HelpCenterPage />);
    expect(screen.getByText('No results found')).toBeInTheDocument();
  });

  it('popular-only filter shows only 3 popular categories', () => {
    setSearchParams({ popular: 'true' });
    render(<HelpCenterPage />);
    expect(getCategoryLinks()).toHaveLength(3);
  });

  it('sort by A-Z passes all 8 categories', () => {
    setSearchParams({ sort: 'a-z' });
    render(<HelpCenterPage />);
    expect(getCategoryLinks()).toHaveLength(8);
  });

  it('sort by most articles passes all 8 categories', () => {
    setSearchParams({ sort: 'most-articles' });
    render(<HelpCenterPage />);
    expect(getCategoryLinks()).toHaveLength(8);
  });

  it('combined search + popular-only intersection', () => {
    setSearchParams({ q: 'lead', popular: 'true' });
    render(<HelpCenterPage />);
    const links = getCategoryLinks();
    expect(links.length).toBeGreaterThan(0);
    expect(links.length).toBeLessThanOrEqual(3);
  });

  it('empty query shows all 8 categories', () => {
    setSearchParams({});
    render(<HelpCenterPage />);
    expect(getCategoryLinks()).toHaveLength(8);
  });

  it('?q=billing pre-populates input on mount', () => {
    setSearchParams({ q: 'billing' });
    render(<HelpCenterPage />);
    const input = screen.getByRole('searchbox') as HTMLInputElement;
    expect(input.value).toBe('billing');
  });

  it('selecting a category filter calls router.replace', () => {
    setSearchParams({});
    render(<HelpCenterPage />);
    const categorySelect = screen.getByLabelText(/category/i);
    fireEvent.change(categorySelect, { target: { value: 'billing' } });
    expect(mockReplace).toHaveBeenCalled();
  });

  it('selecting a sort mode calls router.replace', () => {
    setSearchParams({});
    render(<HelpCenterPage />);
    const sortSelect = screen.getByLabelText(/sort/i);
    fireEvent.change(sortSelect, { target: { value: 'a-z' } });
    expect(mockReplace).toHaveBeenCalled();
  });

  it('clicking popular chip calls router.replace', () => {
    setSearchParams({});
    render(<HelpCenterPage />);
    const popularChip = screen.getByRole('button', { name: /popular/i });
    fireEvent.click(popularChip);
    expect(mockReplace).toHaveBeenCalled();
  });

  it('changing filter does not move focus away from the control', () => {
    setSearchParams({});
    render(<HelpCenterPage />);
    const input = screen.getByRole('searchbox');
    input.focus();
    expect(document.activeElement).toBe(input);

    fireEvent.change(input, { target: { value: 'test' } });
    expect(document.activeElement).toBe(input);
  });

  it('popular categories appear first in default order', () => {
    setSearchParams({});
    render(<HelpCenterPage />);

    const categoryLinks = screen
      .getAllByRole('link')
      .filter((l) => l.getAttribute('href')?.startsWith('/help-center/'));
    expect(categoryLinks[0]).toHaveAttribute('href', '/help-center/getting-started');
    expect(categoryLinks[1]).toHaveAttribute('href', '/help-center/leads-contacts');
    expect(categoryLinks[2]).toHaveAttribute('href', '/help-center/deals-pipeline');
  });
});
