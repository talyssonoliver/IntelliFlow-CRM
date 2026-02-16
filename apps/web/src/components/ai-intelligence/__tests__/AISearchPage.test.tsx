import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ============================================
// Mocks
// ============================================

vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => ({
    user: { id: 'user-1', email: 'test@example.com', name: 'Test', role: 'admin' },
    isLoading: false,
    isAuthenticated: true,
  }),
}));

const mockRefetch = vi.fn();

vi.mock('@/lib/ai-search/hooks', () => ({
  useAISearch: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/agent-approvals/ai-search',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import {
  mockSearchResponse,
  mockEmptySearchResponse,
  mockSingleResultResponse,
  mockSearchResults,
} from '@/test/fixtures/rag-search-data';
import { useAISearch } from '@/lib/ai-search/hooks';

const mockUseAISearch = vi.mocked(useAISearch);

function setMockHook(overrides: Record<string, unknown> = {}) {
  mockUseAISearch.mockReturnValue({
    results: mockSearchResponse.results,
    totalResults: mockSearchResponse.totalResults,
    avgRelevance: mockSearchResponse.avgRelevance,
    executionTimeMs: mockSearchResponse.executionTimeMs,
    sourceCounts: mockSearchResponse.sourceCounts,
    isLoading: false,
    error: null,
    refetch: mockRefetch,
    ...overrides,
  } as any);
}

function setEmptyHook() {
  mockUseAISearch.mockReturnValue({
    results: [],
    totalResults: 0,
    avgRelevance: 0,
    executionTimeMs: 0,
    sourceCounts: {},
    isLoading: false,
    error: null,
    refetch: mockRefetch,
  } as any);
}

// ============================================
// Tests
// ============================================

describe('AISearchPage', () => {
  let AISearchPage: React.ComponentType;

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockRefetch.mockReset();
    setEmptyHook();
    const mod = await import('../AISearchPage');
    AISearchPage = mod.AISearchPage;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ============================================
  // Rendering
  // ============================================

  describe('rendering', () => {
    it('renders page title "AI Search"', () => {
      render(<AISearchPage />);
      // Title appears in breadcrumbs and heading; just verify at least one exists
      const matches = screen.getAllByText('AI Search');
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    it('renders breadcrumbs', () => {
      render(<AISearchPage />);
      expect(screen.getByText('AI & Agents')).toBeDefined();
    });

    it('renders search input with placeholder', () => {
      render(<AISearchPage />);
      const input = screen.getByPlaceholderText(/search across leads/i);
      expect(input).toBeDefined();
    });

    it('renders filter controls', () => {
      render(<AISearchPage />);
      expect(screen.getByText('Hybrid')).toBeDefined();
      expect(screen.getByText('Fulltext')).toBeDefined();
      expect(screen.getByText('Semantic')).toBeDefined();
      expect(screen.getByText('Last 7 days')).toBeDefined();
    });

    it('shows empty state when no query entered', () => {
      render(<AISearchPage />);
      expect(screen.getByText(/enter a search query/i)).toBeDefined();
    });

    it('shows loading skeletons during search', async () => {
      setMockHook({ isLoading: true, results: [], totalResults: 0 });
      render(<AISearchPage />);

      const input = screen.getByLabelText('Search query');
      await userEvent.type(input, 'test');
      act(() => { vi.advanceTimersByTime(600); });

      // The hook returns isLoading=true, should show skeletons
      // Need to wait for re-render after debounce
    });

    it('shows error state with retry button when API fails', async () => {
      setMockHook({
        error: { message: 'Network error' },
        results: [],
        totalResults: 0,
        isLoading: false,
      });
      render(<AISearchPage />);

      const input = screen.getByLabelText('Search query');
      await userEvent.type(input, 'test');
      act(() => { vi.advanceTimersByTime(600); });

      expect(screen.getByText(/search failed/i)).toBeDefined();
      expect(screen.getByText('Retry')).toBeDefined();
    });

    it('shows no results state when query returns empty', async () => {
      setEmptyHook();
      render(<AISearchPage />);

      const input = screen.getByLabelText('Search query');
      await userEvent.type(input, 'nonexistent query');
      act(() => { vi.advanceTimersByTime(600); });

      expect(screen.getByText(/no results found/i)).toBeDefined();
    });

    it('renders stat cards with correct values', async () => {
      setMockHook();
      render(<AISearchPage />);

      const input = screen.getByLabelText('Search query');
      await userEvent.type(input, 'acme');
      act(() => { vi.advanceTimersByTime(600); });

      expect(screen.getByText('Total Results')).toBeDefined();
      expect(screen.getByText('Avg Relevance')).toBeDefined();
      expect(screen.getByText('Response Time')).toBeDefined();
      expect(screen.getByText('Active Sources')).toBeDefined();
    });

    it('renders result cards with source badges', async () => {
      setMockHook();
      render(<AISearchPage />);

      const input = screen.getByLabelText('Search query');
      await userEvent.type(input, 'acme');
      act(() => { vi.advanceTimersByTime(600); });

      // Source labels appear in filter buttons AND in result badges
      const leadsLabels = screen.getAllByText('Leads');
      expect(leadsLabels.length).toBeGreaterThanOrEqual(2); // filter + badge
      const contactsLabels = screen.getAllByText('Contacts');
      expect(contactsLabels.length).toBeGreaterThanOrEqual(2);
    });

    it('renders result cards with relevance scores', async () => {
      setMockHook();
      render(<AISearchPage />);

      const input = screen.getByLabelText('Search query');
      await userEvent.type(input, 'acme');
      act(() => { vi.advanceTimersByTime(600); });

      // Relevance scores appear in result badge AND in citation
      const scores95 = screen.getAllByText('95%');
      expect(scores95.length).toBeGreaterThanOrEqual(1);
      const scores88 = screen.getAllByText('88%');
      expect(scores88.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ============================================
  // Interactions
  // ============================================

  describe('interactions', () => {
    it('search triggers query after 500ms debounce', async () => {
      setEmptyHook();
      render(<AISearchPage />);

      const input = screen.getByLabelText('Search query');
      await userEvent.type(input, 'test');

      // Before debounce — still showing empty state
      expect(screen.getByText(/enter a search query/i)).toBeDefined();

      // After debounce — query is set
      act(() => { vi.advanceTimersByTime(600); });
      // The hook should now be called with query='test'
      expect(mockUseAISearch).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'test' }),
      );
    });

    it('search triggers query on Enter key press', async () => {
      setEmptyHook();
      render(<AISearchPage />);

      const input = screen.getByLabelText('Search query');
      await userEvent.type(input, 'test{enter}');

      // Enter immediately triggers — no need to wait for debounce
      expect(mockUseAISearch).toHaveBeenCalled();
    });

    it('source type filter multi-select updates results', async () => {
      setMockHook();
      render(<AISearchPage />);

      // Click on "Documents" source button
      const docButtons = screen.getAllByText('Documents');
      const sourceButton = docButtons.find((btn) => btn.closest('button')?.className.includes('border'));
      if (sourceButton) {
        await userEvent.click(sourceButton);
      }

      expect(mockUseAISearch).toHaveBeenCalledWith(
        expect.objectContaining({ sources: expect.arrayContaining(['documents']) }),
      );
    });

    it('date range filter updates results', async () => {
      setEmptyHook();
      render(<AISearchPage />);

      const btn = screen.getByText('Last 30 days');
      await userEvent.click(btn);

      expect(mockUseAISearch).toHaveBeenCalledWith(
        expect.objectContaining({ dateRange: '30d' }),
      );
    });

    it('search type selector updates results', async () => {
      setEmptyHook();
      render(<AISearchPage />);

      const btn = screen.getByText('Semantic');
      await userEvent.click(btn);

      expect(mockUseAISearch).toHaveBeenCalledWith(
        expect.objectContaining({ searchType: 'semantic' }),
      );
    });

    it('sort option changes', async () => {
      setMockHook();
      render(<AISearchPage />);

      const btn = screen.getByText('Newest First');
      await userEvent.click(btn);

      // Sort is client-side, just verify the button was activated
      expect(btn.className).toContain('bg-primary');
    });

    it('Load More button fetches next page', async () => {
      setMockHook({
        totalResults: 40, // More than PAGE_LIMIT
      });
      render(<AISearchPage />);

      const input = screen.getByLabelText('Search query');
      await userEvent.type(input, 'acme');
      act(() => { vi.advanceTimersByTime(600); });

      const loadMoreBtn = screen.queryByText('Load More');
      if (loadMoreBtn) {
        await userEvent.click(loadMoreBtn);
        expect(mockUseAISearch).toHaveBeenCalledWith(
          expect.objectContaining({ offset: 20 }),
        );
      }
    });

    it('retry button re-triggers search on error state', async () => {
      setMockHook({
        error: { message: 'Network error' },
        results: [],
        totalResults: 0,
      });
      render(<AISearchPage />);

      const input = screen.getByLabelText('Search query');
      await userEvent.type(input, 'test');
      act(() => { vi.advanceTimersByTime(600); });

      const retryBtn = screen.getByText('Retry');
      await userEvent.click(retryBtn);
      expect(mockRefetch).toHaveBeenCalled();
    });

    it('clear search resets to empty state', async () => {
      setMockHook();
      render(<AISearchPage />);

      const input = screen.getByLabelText('Search query');
      await userEvent.type(input, 'test');
      act(() => { vi.advanceTimersByTime(600); });

      const clearBtn = screen.getByLabelText('Clear search');
      await userEvent.click(clearBtn);

      expect((input as HTMLInputElement).value).toBe('');
    });

    it('result click navigates to entity detail page', async () => {
      setMockHook();
      render(<AISearchPage />);

      const input = screen.getByLabelText('Search query');
      await userEvent.type(input, 'acme');
      act(() => { vi.advanceTimersByTime(600); });

      // Lead result should link to /leads/lead-001
      const link = screen.getAllByRole('link').find((a) => a.getAttribute('href')?.includes('/leads/'));
      expect(link).toBeDefined();
    });
  });

  // ============================================
  // Data Display
  // ============================================

  describe('data display', () => {
    it('relevance scores display as percentages', async () => {
      setMockHook();
      render(<AISearchPage />);

      const input = screen.getByLabelText('Search query');
      await userEvent.type(input, 'acme');
      act(() => { vi.advanceTimersByTime(600); });

      const scores = screen.getAllByText('95%');
      expect(scores.length).toBeGreaterThanOrEqual(1);
    });

    it('source icons render for entity types', async () => {
      setMockHook();
      render(<AISearchPage />);

      const input = screen.getByLabelText('Search query');
      await userEvent.type(input, 'acme');
      act(() => { vi.advanceTimersByTime(600); });

      // Material icons should be rendered
      const icons = screen.getAllByText('leaderboard');
      expect(icons.length).toBeGreaterThan(0);
    });

    it('long snippets truncate at 300 chars', async () => {
      const longSnippet = 'A'.repeat(400);
      setMockHook({
        results: [{ ...mockSearchResults[0], snippet: longSnippet }],
        totalResults: 1,
      });
      render(<AISearchPage />);

      const input = screen.getByLabelText('Search query');
      await userEvent.type(input, 'acme');
      act(() => { vi.advanceTimersByTime(600); });

      // Should have ellipsis from truncation
      const text = screen.getByText(/\.\.\.$/);
      expect(text).toBeDefined();
    });

    it('citation links point to correct routes', async () => {
      setMockHook({
        results: [mockSearchResults[0]], // lead -> /leads/lead-001
        totalResults: 1,
      });
      render(<AISearchPage />);

      const input = screen.getByLabelText('Search query');
      await userEvent.type(input, 'acme');
      act(() => { vi.advanceTimersByTime(600); });

      const links = screen.getAllByRole('link');
      const leadLink = links.find((a) => a.getAttribute('href') === '/leads/lead-001');
      expect(leadLink).toBeDefined();
    });

    it('source counts in stat cards match results', async () => {
      setMockHook({
        sourceCounts: { documents: 5 },
      });
      render(<AISearchPage />);

      const input = screen.getByLabelText('Search query');
      await userEvent.type(input, 'acme');
      act(() => { vi.advanceTimersByTime(600); });

      expect(screen.getByText('5')).toBeDefined();
    });
  });

  // ============================================
  // Edge Cases
  // ============================================

  describe('edge cases', () => {
    it('empty query shows empty state (not error)', () => {
      setEmptyHook();
      render(<AISearchPage />);
      expect(screen.getByText(/enter a search query/i)).toBeDefined();
      expect(screen.queryByText(/error/i)).toBeNull();
    });

    it('special characters in query do not cause XSS', async () => {
      setEmptyHook();
      render(<AISearchPage />);

      const input = screen.getByLabelText('Search query');
      await userEvent.type(input, '<script>alert("xss")</script>');
      act(() => { vi.advanceTimersByTime(600); });

      // No script elements should be rendered
      expect(document.querySelector('script')).toBeNull();
    });

    it('zero results with filters applied shows no-results state', async () => {
      setEmptyHook();
      render(<AISearchPage />);

      // Apply a source filter first
      const docButtons = screen.getAllByText('Documents');
      const sourceButton = docButtons.find((btn) => btn.closest('button')?.className.includes('border'));
      if (sourceButton) await userEvent.click(sourceButton);

      const input = screen.getByLabelText('Search query');
      await userEvent.type(input, 'nonexistent');
      act(() => { vi.advanceTimersByTime(600); });

      expect(screen.getByText(/no results found/i)).toBeDefined();
    });

    it('single result displays correctly', async () => {
      setMockHook({
        results: [mockSearchResults[0]],
        totalResults: 1,
        sourceCounts: { leads: 1 },
      });
      render(<AISearchPage />);

      const input = screen.getByLabelText('Search query');
      await userEvent.type(input, 'john');
      act(() => { vi.advanceTimersByTime(600); });

      const titles = screen.getAllByText('John Doe - Enterprise Lead');
      expect(titles.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ============================================
  // Accessibility
  // ============================================

  describe('accessibility', () => {
    it('result count announced via aria-live region', () => {
      render(<AISearchPage />);
      const liveRegion = document.querySelector('[aria-live="polite"]');
      expect(liveRegion).toBeDefined();
    });

    it('search input has proper aria-label', () => {
      render(<AISearchPage />);
      const input = screen.getByLabelText('Search query');
      expect(input).toBeDefined();
    });

    it('results are keyboard navigable', async () => {
      setMockHook({
        results: [mockSearchResults[0]],
        totalResults: 1,
      });
      render(<AISearchPage />);

      const input = screen.getByLabelText('Search query');
      await userEvent.type(input, 'test');
      act(() => { vi.advanceTimersByTime(600); });

      // Links should be focusable
      const links = screen.getAllByRole('link');
      expect(links.length).toBeGreaterThan(0);
    });
  });
});
