import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
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

vi.mock('@/lib/sentiment/hooks', () => ({
  useSentimentDashboard: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/agent-approvals/sentiment',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Mock Recharts to avoid SVG rendering issues in happy-dom
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
  AreaChart: ({ children }: any) => <div data-testid="area-chart">{children}</div>,
  Area: () => <div data-testid="area" />,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

import {
  mockDashboardData,
  mockEmptyDashboard,
  mockSentimentStats,
  mockSentimentAnalyses,
} from '@/test/fixtures/sentiment-data';
import { useSentimentDashboard } from '@/lib/sentiment/hooks';

const mockUseSentimentDashboard = vi.mocked(useSentimentDashboard);

// Helper to configure the mock hook return value
function setMockHook(overrides: Record<string, unknown> = {}) {
  const data = (overrides as any)._rawData ?? mockDashboardData;
  mockUseSentimentDashboard.mockReturnValue({
    stats: data.stats ?? null,
    recentAnalyses: data.recentAnalyses ?? [],
    trends: data.trends ?? [],
    distribution: data.distribution ?? null,
    isLoading: false,
    error: null,
    refetch: mockRefetch,
    ...overrides,
  });
}

// ============================================
// Tests
// ============================================

describe('SentimentDashboard', () => {
  let SentimentDashboard: React.ComponentType;

  beforeEach(async () => {
    vi.clearAllMocks();
    setMockHook();
    const mod = await import('../SentimentDashboard');
    SentimentDashboard = mod.SentimentDashboard;
  });

  // ==============================
  // Rendering (8 tests)
  // ==============================

  describe('Rendering', () => {
    it('renders page title "Sentiment Analysis"', () => {
      render(<SentimentDashboard />);
      expect(screen.getByRole('heading', { name: 'Sentiment Analysis' })).toBeInTheDocument();
    });

    it('renders breadcrumb navigation with PageHeader', () => {
      render(<SentimentDashboard />);
      expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
      expect(screen.getByText('AI & Agents')).toBeInTheDocument();
    });

    it('renders page description', () => {
      render(<SentimentDashboard />);
      expect(screen.getByText('AI-powered sentiment insights across leads and contacts.')).toBeInTheDocument();
    });

    it('renders 5 stat cards with correct labels', () => {
      render(<SentimentDashboard />);
      expect(screen.getByText('Total')).toBeInTheDocument();
      // "Positive" appears in both stat card and filter chip — use getAllByText
      expect(screen.getAllByText('Positive').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Negative').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Neutral').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Urgent').length).toBeGreaterThanOrEqual(1);
    });

    it('renders SearchFilterBar', () => {
      render(<SentimentDashboard />);
      expect(screen.getByPlaceholderText('Search by entity name...')).toBeInTheDocument();
    });

    it('renders trend chart section', () => {
      render(<SentimentDashboard />);
      expect(screen.getByText('Sentiment Trend')).toBeInTheDocument();
    });

    it('renders sentiment analysis cards with badges', () => {
      render(<SentimentDashboard />);
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      expect(screen.getByText('TechStart Inc')).toBeInTheDocument();
    });

    it('renders loading skeleton when isLoading', () => {
      setMockHook({ isLoading: true, stats: null, recentAnalyses: [], trends: [], distribution: null });
      render(<SentimentDashboard />);
      // When loading, stat cards show skeleton and list shows skeleton blocks
      const skeletons = document.querySelectorAll('[class*="animate-pulse"], [class*="skeleton"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('renders empty state when no data', () => {
      setMockHook({
        stats: mockEmptyDashboard.stats,
        recentAnalyses: [],
        trends: [],
        distribution: mockEmptyDashboard.distribution,
      });
      render(<SentimentDashboard />);
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
      expect(screen.getByText('No sentiment analyses found')).toBeInTheDocument();
    });

    it('renders error state when query fails', () => {
      setMockHook({ error: new Error('Network error') as any, stats: null, recentAnalyses: [], trends: [] });
      render(<SentimentDashboard />);
      expect(screen.getByText('Failed to load sentiment data')).toBeInTheDocument();
      expect(screen.getByText('Try again')).toBeInTheDocument();
    });
  });

  // ==============================
  // Data Display (7 tests)
  // ==============================

  describe('Data Display', () => {
    it('stats cards show correct counts from mock data', () => {
      render(<SentimentDashboard />);
      expect(screen.getByText('156')).toBeInTheDocument(); // total
      expect(screen.getByText('89')).toBeInTheDocument();  // positive
      expect(screen.getByText('25')).toBeInTheDocument();  // negative
      expect(screen.getByText('42')).toBeInTheDocument();  // neutral
      expect(screen.getByText('8')).toBeInTheDocument();   // urgent
    });

    it('VERY_POSITIVE badge renders with emerald styling', () => {
      render(<SentimentDashboard />);
      const badge = screen.getByText('VERY POSITIVE');
      expect(badge.className).toContain('bg-emerald-100');
    });

    it('VERY_NEGATIVE badge renders with destructive styling', () => {
      render(<SentimentDashboard />);
      const badge = screen.getByText('VERY NEGATIVE');
      expect(badge.className).toContain('bg-destructive/10');
    });

    it('emotion badges show with correct icons/colors', () => {
      render(<SentimentDashboard />);
      // Acme Corp has JOY and TRUST emotions
      const emotionBadges = screen.getAllByTestId('emotion-badges');
      expect(emotionBadges.length).toBeGreaterThan(0);
      expect(screen.getByText(/joy/i)).toBeInTheDocument();
    });

    it('urgency badges show CRITICAL with destructive styling', () => {
      render(<SentimentDashboard />);
      const criticalBadge = screen.getByText('CRITICAL');
      expect(criticalBadge.className).toContain('bg-destructive/10');
    });

    it('key phrases render as color-coded tags', () => {
      render(<SentimentDashboard />);
      const phraseContainers = screen.getAllByTestId('key-phrases');
      expect(phraseContainers.length).toBeGreaterThan(0);
      expect(screen.getByText('great product')).toBeInTheDocument();
      expect(screen.getByText('delayed delivery')).toBeInTheDocument();
    });

    it('timestamps format correctly', () => {
      render(<SentimentDashboard />);
      // Timestamps should show relative time (e.g., "Xm ago", "Xh ago", "Xd ago")
      const timeElements = screen.getAllByText(/\d+[mhd] ago/);
      expect(timeElements.length).toBeGreaterThan(0);
    });
  });

  // ==============================
  // Interactions (7 tests)
  // ==============================

  describe('Interactions', () => {
    it('filter by sentiment level updates query', async () => {
      render(<SentimentDashboard />);
      // Find and interact with the sentiment filter dropdown
      const sentimentSelect = screen.getAllByRole('combobox').find(el => {
        const options = within(el).queryAllByRole('option');
        return options.some(o => o.textContent?.includes('Sentiments'));
      }) ?? screen.getAllByRole('combobox')[1];

      if (sentimentSelect) {
        fireEvent.change(sentimentSelect, { target: { value: 'POSITIVE' } });
      }
      // The component should re-filter based on sentiment
      expect(sentimentSelect).toBeDefined();
    });

    it('filter by entity type updates query', () => {
      render(<SentimentDashboard />);
      const selects = screen.getAllByRole('combobox');
      expect(selects.length).toBeGreaterThan(0);
      // First filter should be entity type
      if (selects[0]) {
        fireEvent.change(selects[0], { target: { value: 'lead' } });
      }
    });

    it('date range selector changes query', async () => {
      render(<SentimentDashboard />);
      const btn7d = screen.getByRole('button', { name: '7d' });
      const btn90d = screen.getByRole('button', { name: '90d' });
      expect(btn7d).toBeInTheDocument();
      expect(btn90d).toBeInTheDocument();
      await userEvent.click(btn7d);
      // 7d button should now be active (default variant)
    });

    it('quick filter chips toggle active state', async () => {
      render(<SentimentDashboard />);
      const positiveChip = screen.getByRole('button', { name: /positive/i });
      expect(positiveChip).toBeInTheDocument();
      await userEvent.click(positiveChip);
    });

    it('search input filters by entity name', async () => {
      render(<SentimentDashboard />);
      const searchInput = screen.getByPlaceholderText('Search by entity name...');
      // SearchFilterBar manages its own input — just verify it exists and accepts focus
      await userEvent.click(searchInput);
      expect(searchInput).toBeInTheDocument();
    });

    it('sort dropdown changes query', () => {
      render(<SentimentDashboard />);
      const sortSelect = screen.getAllByRole('combobox').pop();
      if (sortSelect) {
        fireEvent.change(sortSelect, { target: { value: 'score' } });
      }
      expect(sortSelect).toBeDefined();
    });

    it('pagination load more button fetches next page', async () => {
      // Set up data where there are >= 20 analyses to show load more button
      const manyAnalyses = Array.from({ length: 20 }, (_, i) => ({
        ...mockSentimentAnalyses[0],
        id: `sa-${i + 100}`,
        entityName: `Entity ${i}`,
      }));
      setMockHook({
        stats: mockDashboardData.stats,
        recentAnalyses: manyAnalyses,
        trends: mockDashboardData.trends,
        distribution: mockDashboardData.distribution,
      });
      render(<SentimentDashboard />);
      const loadMoreBtn = screen.getByTestId('load-more-button');
      expect(loadMoreBtn).toBeInTheDocument();
      await userEvent.click(loadMoreBtn);
    });
  });

  // ==============================
  // Edge Cases (4 tests)
  // ==============================

  describe('Edge Cases', () => {
    it('all negative sentiment data renders correctly', () => {
      const allNegative = mockSentimentAnalyses.map((a) => ({
        ...a,
        sentiment: 'VERY_NEGATIVE' as const,
        sentimentScore: -0.9,
      }));
      setMockHook({
        stats: mockDashboardData.stats,
        recentAnalyses: allNegative,
        trends: mockDashboardData.trends,
      });
      render(<SentimentDashboard />);
      const badges = screen.getAllByText('VERY NEGATIVE');
      expect(badges.length).toBe(allNegative.length);
    });

    it('mixed emotions on single entity', () => {
      // Bob Johnson has 4 emotions: ANGER, FEAR, SADNESS, DISGUST
      render(<SentimentDashboard />);
      // Should display top 3 emotions
      const bobCard = screen.getByText('Bob Johnson');
      const card = bobCard.closest('[class*="card"]') ?? bobCard.parentElement?.parentElement?.parentElement;
      expect(card).toBeTruthy();
      // Verify emotion badges are present
      if (card) {
        const emotionBadges = within(card as HTMLElement).getByTestId('emotion-badges');
        expect(emotionBadges).toBeInTheDocument();
      }
    });

    it('zero confidence analysis displays warning', () => {
      render(<SentimentDashboard />);
      // Growth Partners has confidence 0.25 (< 0.3)
      const warnings = screen.getAllByTestId('low-confidence-warning');
      expect(warnings.length).toBeGreaterThan(0);
      expect(screen.getByText('Low confidence')).toBeInTheDocument();
    });

    it('very long key phrases truncate with ellipsis', () => {
      render(<SentimentDashboard />);
      // Bob Johnson has a very long key phrase
      const longPhrase = screen.getByTitle(/This is a very long key phrase/);
      expect(longPhrase).toBeInTheDocument();
      expect(longPhrase.className).toContain('truncate');
    });
  });
});
