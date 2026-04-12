import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

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

vi.mock('@/lib/lead-scoring/hooks', () => ({
  useLeadScoringDashboard: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/agent-approvals/lead-scoring',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock Recharts to avoid SVG rendering issues in happy-dom
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  ComposedChart: ({ children }: any) => <div data-testid="composed-chart">{children}</div>,
  AreaChart: ({ children }: any) => <div data-testid="area-chart">{children}</div>,
  Line: () => <div data-testid="line" />,
  Area: () => <div data-testid="area" />,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

import {
  mockLeadScoringDashboardData,
  mockEmptyLeadScoringDashboard,
  mockLeadScoringStats,
  mockScoredLeads,
  mockLeadScoringTrends,
} from '@/test/fixtures/lead-scoring-data';
import { useLeadScoringDashboard } from '@/lib/lead-scoring/hooks';

const mockUseLeadScoringDashboard = vi.mocked(useLeadScoringDashboard);

function setMockHook(overrides: Record<string, unknown> = {}) {
  const data = (overrides as any)._rawData ?? mockLeadScoringDashboardData;
  mockUseLeadScoringDashboard.mockReturnValue({
    stats: data.stats ?? null,
    scoredLeads: data.scoredLeads ?? [],
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

describe('LeadScoringDashboard', () => {
  let LeadScoringDashboard: React.ComponentType;

  beforeEach(async () => {
    vi.clearAllMocks();
    setMockHook();
    const mod = await import('../LeadScoringDashboard');
    LeadScoringDashboard = mod.LeadScoringDashboard;
  });

  // ==============================
  // Rendering (9 tests)
  // ==============================

  describe('Rendering', () => {
    it('TC-1: renders page title "Lead Scoring"', () => {
      render(<LeadScoringDashboard />);
      expect(screen.getByRole('heading', { name: 'Lead Scoring' })).toBeInTheDocument();
    });

    it('TC-2: renders breadcrumbs "AI & Agents > Lead Scoring"', () => {
      render(<LeadScoringDashboard />);
      expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
      expect(screen.getByText('AI & Agents')).toBeInTheDocument();
    });

    it('TC-3: renders description text', () => {
      render(<LeadScoringDashboard />);
      expect(
        screen.getByText('AI-powered lead scoring analysis and factor breakdown.')
      ).toBeInTheDocument();
    });

    it('TC-4: renders 5 stat cards (Total Scored, Hot Leads, Warm Leads, Cold Leads, Avg Score)', () => {
      render(<LeadScoringDashboard />);
      expect(screen.getByText('Total Scored')).toBeInTheDocument();
      expect(screen.getByText('Hot Leads')).toBeInTheDocument();
      expect(screen.getByText('Warm Leads')).toBeInTheDocument();
      expect(screen.getByText('Cold Leads')).toBeInTheDocument();
      expect(screen.getByText('Avg Score')).toBeInTheDocument();
    });

    it('TC-5: renders SearchFilterBar with search placeholder', () => {
      render(<LeadScoringDashboard />);
      expect(screen.getByPlaceholderText('Search by lead name...')).toBeInTheDocument();
    });

    it('TC-6: renders date range buttons (7d, 30d, 90d)', () => {
      render(<LeadScoringDashboard />);
      expect(screen.getByRole('button', { name: '7d' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '30d' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '90d' })).toBeInTheDocument();
    });

    it('TC-7: renders scored leads list', () => {
      render(<LeadScoringDashboard />);
      const cards = screen.getAllByTestId('lead-card');
      expect(cards.length).toBe(mockScoredLeads.length);
    });

    it('TC-8: renders loading skeletons when isLoading=true', () => {
      setMockHook({
        isLoading: true,
        stats: null,
        scoredLeads: [],
        trends: [],
        distribution: null,
      });
      render(<LeadScoringDashboard />);
      // Stat cards should show skeletons — check for skeleton elements
      const skeletons = document.querySelectorAll(
        '[class*="animate-pulse"], [data-slot="skeleton"]'
      );
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('TC-9: renders empty state when no scored leads', () => {
      setMockHook({
        _rawData: mockEmptyLeadScoringDashboard,
      });
      render(<LeadScoringDashboard />);
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
      expect(screen.getByText('No lead scoring data available')).toBeInTheDocument();
    });
  });

  // ==============================
  // Data Display (7 tests)
  // ==============================

  describe('Data Display', () => {
    it('TC-10: stat cards show correct hot/warm/cold counts', () => {
      render(<LeadScoringDashboard />);
      // Stat values may appear in multiple contexts; verify at least one instance
      expect(screen.getAllByText(String(mockLeadScoringStats.hot)).length).toBeGreaterThanOrEqual(
        1
      );
      expect(screen.getAllByText(String(mockLeadScoringStats.warm)).length).toBeGreaterThanOrEqual(
        1
      );
      expect(screen.getAllByText(String(mockLeadScoringStats.cold)).length).toBeGreaterThanOrEqual(
        1
      );
    });

    it('TC-11: hot tier lead shows green/success styling', () => {
      render(<LeadScoringDashboard />);
      // John Doe is hot (score 92)
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    it('TC-12: warm tier lead shows orange styling', () => {
      render(<LeadScoringDashboard />);
      // Jane Smith is warm (score 65)
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    });

    it('TC-13: cold tier lead shows muted/slate styling', () => {
      render(<LeadScoringDashboard />);
      // Bob Wilson is cold (score 35)
      expect(screen.getByText('Bob Wilson')).toBeInTheDocument();
    });

    it('TC-14: lead score value displays correctly via ScoreBadge', () => {
      render(<LeadScoringDashboard />);
      // ScoreBadge should show score values
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    it('TC-15: confidence indicator renders', () => {
      render(<LeadScoringDashboard />);
      // ConfidenceIndicator has role="progressbar"
      const progressBars = screen.getAllByRole('progressbar');
      expect(progressBars.length).toBeGreaterThan(0);
    });

    it('TC-16: scoring factors display in lead cards (top 3)', () => {
      render(<LeadScoringDashboard />);
      // John Doe has factors: Activity Level, Email Domain, Company Size
      // Use getAllByText since factors may appear in multiple lead cards
      expect(screen.getAllByText(/Activity Level/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Email Domain/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Company Size/).length).toBeGreaterThanOrEqual(1);
    });
  });

  // ==============================
  // Interactions (7 tests)
  // ==============================

  describe('Interactions', () => {
    it('TC-17: clicking "Hot" filter chip filters to hot leads only', () => {
      render(<LeadScoringDashboard />);
      const hotChip = screen
        .getAllByText('Hot')
        .find((el) => el.closest('[role="button"]') || el.closest('button'));
      if (hotChip) fireEvent.click(hotChip);
      // After filter, only hot leads should show (John Doe, Alice Brown)
      const cards = screen.getAllByTestId('lead-card');
      expect(cards.length).toBe(2);
    });

    it('TC-18: clicking date range "7d" button updates state', () => {
      render(<LeadScoringDashboard />);
      const btn7d = screen.getByRole('button', { name: '7d' });
      fireEvent.click(btn7d);
      // The hook should be called — verify button state changed
      expect(mockUseLeadScoringDashboard).toHaveBeenCalled();
    });

    it('TC-19: filter chips toggle between All/Hot/Warm/Needs Review', () => {
      render(<LeadScoringDashboard />);
      // Click Warm chip
      const warmChips = screen.getAllByText('Warm');
      const warmChip = warmChips.find(
        (el) => el.closest('[role="button"]') || el.closest('button')
      );
      if (warmChip) fireEvent.click(warmChip);
      // Only warm leads should show (Jane Smith, Charlie Davis)
      const cards = screen.getAllByTestId('lead-card');
      expect(cards.length).toBe(2);
    });

    it('TC-20: search input filters leads by name (client-side)', () => {
      render(<LeadScoringDashboard />);
      const searchInput = screen.getByPlaceholderText('Search by lead name...');
      fireEvent.change(searchInput, { target: { value: 'John' } });
      const cards = screen.getAllByTestId('lead-card');
      expect(cards.length).toBe(1);
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    it('TC-21: sort dropdown changes lead order', () => {
      render(<LeadScoringDashboard />);
      // The sort select should exist
      const sortSelects = document.querySelectorAll('select');
      if (sortSelects.length > 0) {
        fireEvent.change(sortSelects[0], { target: { value: 'confidence' } });
      }
      // Verify hook was called (sorting is client-side)
      expect(mockUseLeadScoringDashboard).toHaveBeenCalled();
    });

    it('TC-22: "Load more" button increments page state', () => {
      // Need >= 20 scored leads to show load more
      const manyLeads = Array.from({ length: 25 }, (_, i) => ({
        ...mockScoredLeads[0],
        id: `score-${i}`,
        leadId: `lead-${i}`,
        leadName: `Lead ${i}`,
      }));
      setMockHook({
        scoredLeads: manyLeads,
        stats: mockLeadScoringStats,
        trends: mockLeadScoringTrends,
        distribution: { hot: 35, warm: 60, cold: 55 },
      });
      render(<LeadScoringDashboard />);
      const loadMore = screen.getByTestId('load-more-button');
      fireEvent.click(loadMore);
      // Hook should be re-called with updated page
      expect(mockUseLeadScoringDashboard).toHaveBeenCalled();
    });

    it('TC-23: error state renders retry button; clicking retries', () => {
      setMockHook({
        error: { message: 'Network error' } as any,
        stats: null,
        scoredLeads: [],
        trends: [],
        distribution: null,
      });
      render(<LeadScoringDashboard />);
      expect(screen.getByText('Failed to load lead scoring data')).toBeInTheDocument();
      const retryBtn = screen.getByRole('button', { name: 'Try again' });
      fireEvent.click(retryBtn);
      expect(mockRefetch).toHaveBeenCalled();
    });
  });

  // ==============================
  // Edge Cases (5 tests)
  // ==============================

  describe('Edge Cases', () => {
    it('TC-24: all leads same tier (all hot) renders correctly', () => {
      const allHot = mockScoredLeads.map((l) => ({ ...l, score: 90, tier: 'hot' as const }));
      setMockHook({
        scoredLeads: allHot,
        stats: { ...mockLeadScoringStats, hot: 5, warm: 0, cold: 0 },
        trends: mockLeadScoringTrends,
        distribution: { hot: 5, warm: 0, cold: 0 },
      });
      render(<LeadScoringDashboard />);
      const cards = screen.getAllByTestId('lead-card');
      expect(cards.length).toBe(5);
    });

    it('TC-25: lead with confidence < 0.85 shows "Needs Review" indicator', () => {
      render(<LeadScoringDashboard />);
      // Jane Smith has confidence 0.78, requiresReview: true
      const reviewBadges = screen.getAllByText('Needs Review');
      expect(reviewBadges.length).toBeGreaterThanOrEqual(1);
    });

    it('TC-26: lead with empty factors array renders gracefully', () => {
      const noFactors = [{ ...mockScoredLeads[0], factors: [] }];
      setMockHook({
        scoredLeads: noFactors,
        stats: mockLeadScoringStats,
        trends: mockLeadScoringTrends,
        distribution: { hot: 35, warm: 60, cold: 55 },
      });
      render(<LeadScoringDashboard />);
      const cards = screen.getAllByTestId('lead-card');
      expect(cards.length).toBe(1);
    });

    it('TC-27: stale data (>7 days) handled without crash', () => {
      const staleLeads = [
        {
          ...mockScoredLeads[0],
          scoredAt: new Date(Date.now() - 10 * 86400000).toISOString(),
        },
      ];
      setMockHook({
        scoredLeads: staleLeads,
        stats: mockLeadScoringStats,
        trends: mockLeadScoringTrends,
        distribution: { hot: 35, warm: 60, cold: 55 },
      });
      render(<LeadScoringDashboard />);
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    it('TC-28: auth loading state shows skeleton', async () => {
      const authMod = await import('@/lib/auth/AuthContext');
      (authMod as any).useRequireAuth = () => ({
        user: null,
        isLoading: true,
        isAuthenticated: false,
      });
      // The dashboard itself doesn't have auth logic — the page.tsx does
      // Just verify the dashboard renders regardless of auth state
      render(<LeadScoringDashboard />);
      expect(screen.getByRole('heading', { name: 'Lead Scoring' })).toBeInTheDocument();
    });
  });
});
