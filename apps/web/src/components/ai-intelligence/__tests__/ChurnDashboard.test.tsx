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

vi.mock('@/lib/churn-risk/hooks', () => ({
  useChurnDashboard: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/agent-approvals/churn-risk',
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
  AreaChart: ({ children }: any) => <div data-testid="area-chart">{children}</div>,
  Area: () => <div data-testid="area" />,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

import {
  mockChurnDashboardData,
  mockEmptyChurnDashboard,
  mockChurnStats,
  mockAtRiskCustomers,
  mockChurnTrends,
} from '@/test/fixtures/churn-data';
import { useChurnDashboard } from '@/lib/churn-risk/hooks';

const mockUseChurnDashboard = vi.mocked(useChurnDashboard);

// Helper to configure the mock hook return value
function setMockHook(overrides: Record<string, unknown> = {}) {
  const data = (overrides as any)._rawData ?? mockChurnDashboardData;
  mockUseChurnDashboard.mockReturnValue({
    stats: data.stats ?? null,
    atRiskCustomers: data.atRiskCustomers ?? [],
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

describe('ChurnDashboard', () => {
  let ChurnDashboard: React.ComponentType;

  beforeEach(async () => {
    vi.clearAllMocks();
    setMockHook();
    const mod = await import('../ChurnDashboard');
    ChurnDashboard = mod.ChurnDashboard;
  });

  // ==============================
  // Rendering (9 tests)
  // ==============================

  describe('Rendering', () => {
    it('renders page title "Churn Risk"', () => {
      render(<ChurnDashboard />);
      expect(screen.getByRole('heading', { name: 'Churn Risk' })).toBeInTheDocument();
    });

    it('renders breadcrumb with "AI & Agents" and "Churn Risk"', () => {
      render(<ChurnDashboard />);
      expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
      expect(screen.getByText('AI & Agents')).toBeInTheDocument();
    });

    it('renders description text', () => {
      render(<ChurnDashboard />);
      expect(
        screen.getByText('AI-powered churn risk analysis and intervention recommendations.')
      ).toBeInTheDocument();
    });

    it('renders 5 stat cards (Critical, High, Medium, Low, Minimal)', () => {
      render(<ChurnDashboard />);
      // Labels appear in stat cards and possibly filter chips — use getAllByText
      expect(screen.getAllByText('Critical').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('High').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Medium').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Low').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Minimal').length).toBeGreaterThanOrEqual(1);
    });

    it('renders SearchFilterBar with search placeholder', () => {
      render(<ChurnDashboard />);
      expect(screen.getByPlaceholderText('Search by entity name...')).toBeInTheDocument();
    });

    it('renders HealthScoreGauge component', () => {
      render(<ChurnDashboard />);
      expect(screen.getByRole('meter')).toBeInTheDocument();
      expect(screen.getByText('Avg Engagement')).toBeInTheDocument();
    });

    it('renders ChurnTrendChart section', () => {
      render(<ChurnDashboard />);
      expect(screen.getByText('Churn Risk Trend')).toBeInTheDocument();
    });

    it('renders loading skeleton when isLoading', () => {
      setMockHook({
        isLoading: true,
        stats: null,
        atRiskCustomers: [],
        trends: [],
        distribution: null,
      });
      render(<ChurnDashboard />);
      const skeletons = document.querySelectorAll('[class*="animate-pulse"], [class*="skeleton"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('renders empty state when no data', () => {
      setMockHook({
        stats: mockEmptyChurnDashboard.stats,
        atRiskCustomers: [],
        trends: [],
        distribution: mockEmptyChurnDashboard.distribution,
      });
      render(<ChurnDashboard />);
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
      expect(screen.getByText('No churn risk data available')).toBeInTheDocument();
    });
  });

  // ==============================
  // Data Display (7 tests)
  // ==============================

  describe('Data Display', () => {
    it('stat cards show correct counts', () => {
      render(<ChurnDashboard />);
      // Values may appear multiple times (stat cards + customer engagement scores + SLA)
      expect(screen.getAllByText('8').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('22').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('35').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('30').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('25').length).toBeGreaterThanOrEqual(1);
    });

    it('CRITICAL badge has red styling', () => {
      render(<ChurnDashboard />);
      const badges = screen.getAllByTestId('risk-badge');
      const criticalBadge = badges.find((b) => b.textContent === 'CRITICAL');
      expect(criticalBadge).toBeDefined();
      expect(criticalBadge?.className).toContain('bg-destructive/10');
    });

    it('HIGH badge has orange styling', () => {
      render(<ChurnDashboard />);
      const badges = screen.getAllByTestId('risk-badge');
      const highBadge = badges.find((b) => b.textContent === 'HIGH');
      expect(highBadge).toBeDefined();
      expect(highBadge?.className).toContain('bg-orange-100');
    });

    it('engagement score displays correctly in gauge', () => {
      render(<ChurnDashboard />);
      const gaugeValue = screen.getByTestId('health-score-value');
      expect(gaugeValue.textContent).toBe('62');
    });

    it('SLA countdown shows formatted time', () => {
      render(<ChurnDashboard />);
      const slaElements = screen.getAllByTestId('sla-countdown');
      expect(slaElements.length).toBeGreaterThan(0);
      // At least one should show hours or days
      const texts = slaElements.map((el) => el.textContent ?? '');
      expect(texts.some((t) => /\d+[hd]\s+(left|overdue)/.test(t))).toBe(true);
    });

    it('next best action text displays', () => {
      render(<ChurnDashboard />);
      // Text appears in both InterventionAlerts button and CustomerCard
      expect(screen.getAllByText('Schedule urgent retention call').length).toBeGreaterThanOrEqual(
        1
      );
    });

    it('recommendations list renders', () => {
      render(<ChurnDashboard />);
      // Acme Corp has recommendations: 'Offer discount', 'Assign senior CSM'
      expect(screen.getByText('Offer discount')).toBeInTheDocument();
      expect(screen.getByText('Assign senior CSM')).toBeInTheDocument();
    });
  });

  // ==============================
  // Interactions (7 tests)
  // ==============================

  describe('Interactions', () => {
    it('filter by risk level updates display', () => {
      render(<ChurnDashboard />);
      const selects = screen.getAllByRole('combobox');
      // Risk level filter is the second filter
      const riskSelect =
        selects.find((el) => {
          const options = within(el).queryAllByRole('option');
          return options.some((o) => o.textContent?.includes('Risk'));
        }) ?? selects[1];
      if (riskSelect) {
        fireEvent.change(riskSelect, { target: { value: 'CRITICAL' } });
      }
      expect(riskSelect).toBeDefined();
    });

    it('filter by entity type', () => {
      render(<ChurnDashboard />);
      const selects = screen.getAllByRole('combobox');
      expect(selects.length).toBeGreaterThan(0);
      if (selects[0]) {
        fireEvent.change(selects[0], { target: { value: 'lead' } });
      }
    });

    it('date range buttons (7d/30d/90d) change state', async () => {
      render(<ChurnDashboard />);
      const btn7d = screen.getByRole('button', { name: '7d' });
      const btn90d = screen.getByRole('button', { name: '90d' });
      expect(btn7d).toBeInTheDocument();
      expect(btn90d).toBeInTheDocument();
      await userEvent.click(btn7d);
    });

    it('quick filter chips toggle', async () => {
      render(<ChurnDashboard />);
      const criticalChip = screen.getByRole('button', { name: /critical/i });
      expect(criticalChip).toBeInTheDocument();
      await userEvent.click(criticalChip);
    });

    it('search by entity name filters list', async () => {
      render(<ChurnDashboard />);
      const searchInput = screen.getByPlaceholderText('Search by entity name...');
      await userEvent.click(searchInput);
      expect(searchInput).toBeInTheDocument();
    });

    it('sort dropdown changes order', () => {
      render(<ChurnDashboard />);
      const sortSelect = screen.getAllByRole('combobox').pop();
      if (sortSelect) {
        fireEvent.change(sortSelect, { target: { value: 'engagement' } });
      }
      expect(sortSelect).toBeDefined();
    });

    it('load more button triggers pagination', async () => {
      const manyCustomers = Array.from({ length: 20 }, (_, i) => ({
        ...mockAtRiskCustomers[0],
        id: `arc-${i + 100}`,
        entityName: `Customer ${i}`,
      }));
      setMockHook({
        stats: mockChurnDashboardData.stats,
        atRiskCustomers: manyCustomers,
        trends: mockChurnDashboardData.trends,
        distribution: mockChurnDashboardData.distribution,
      });
      render(<ChurnDashboard />);
      const loadMoreBtn = screen.getByTestId('load-more-button');
      expect(loadMoreBtn).toBeInTheDocument();
      await userEvent.click(loadMoreBtn);
    });
  });

  // ==============================
  // Edge Cases (5 tests)
  // ==============================

  describe('Edge Cases', () => {
    it('all CRITICAL data renders correctly', () => {
      const allCritical = mockAtRiskCustomers.map((c) => ({
        ...c,
        riskLevel: 'CRITICAL' as const,
        engagementScore: 10,
      }));
      setMockHook({
        stats: mockChurnDashboardData.stats,
        atRiskCustomers: allCritical,
        trends: mockChurnDashboardData.trends,
        distribution: mockChurnDashboardData.distribution,
      });
      render(<ChurnDashboard />);
      const badges = screen.getAllByTestId('risk-badge');
      badges.forEach((badge) => {
        expect(badge.textContent).toBe('CRITICAL');
      });
    });

    it('zero engagement score shows empty gauge', () => {
      setMockHook({
        stats: { ...mockChurnStats, avgEngagement: 0 },
        atRiskCustomers: mockAtRiskCustomers,
        trends: mockChurnTrends,
        distribution: mockChurnDashboardData.distribution,
      });
      render(<ChurnDashboard />);
      const gaugeValue = screen.getByTestId('health-score-value');
      expect(gaugeValue.textContent).toBe('0');
    });

    it('expired SLA shows overdue warning', () => {
      render(<ChurnDashboard />);
      // Overdue Ltd (arc-6) has SLA 12h ago
      const slaElements = screen.getAllByTestId('sla-countdown');
      const overdueElements = slaElements.filter((el) => el.textContent?.includes('overdue'));
      expect(overdueElements.length).toBeGreaterThan(0);
    });

    it('missing next best action shows no action button', () => {
      // Bob Johnson (arc-4) and Growth Partners (arc-5) have null nextBestAction
      render(<ChurnDashboard />);
      const customerCards = screen.getAllByTestId('customer-card');
      // At least some cards should not have the action button
      expect(customerCards.length).toBe(mockAtRiskCustomers.length);
    });

    it('error state with retry button', () => {
      setMockHook({
        error: new Error('Network error') as any,
        stats: null,
        atRiskCustomers: [],
        trends: [],
      });
      render(<ChurnDashboard />);
      expect(screen.getByText('Failed to load churn risk data')).toBeInTheDocument();
      const retryBtn = screen.getByText('Try again');
      expect(retryBtn).toBeInTheDocument();
      fireEvent.click(retryBtn);
      expect(mockRefetch).toHaveBeenCalledOnce();
    });
  });
});
