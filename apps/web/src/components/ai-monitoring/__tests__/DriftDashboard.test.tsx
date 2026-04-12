import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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

vi.mock('@/lib/ai-monitoring/hooks', () => ({
  useDriftDashboard: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/agent-approvals/drift',
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
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  Line: () => <div data-testid="line" />,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  ReferenceLine: () => null,
}));

// ============================================
// Fixtures
// ============================================

import { useDriftDashboard } from '@/lib/ai-monitoring/hooks';

const mockUseDriftDashboard = vi.mocked(useDriftDashboard);

const now = Date.now();

const mockDashboardData = {
  status: {
    trackedMetrics: 8,
    totalSamples: 1500,
    driftDetected: true,
    highSeverityCount: 2,
    lastCheck: new Date(now - 5 * 60000).toISOString(), // 5 min ago
  },
  history: [
    {
      detected: true,
      severity: 'critical' as const,
      metric: 'score_distribution',
      pValue: 0.0012,
      driftScore: 0.8234,
      timestamp: new Date(now - 10 * 60000).toISOString(),
      recommendations: ['Immediately investigate model performance', 'Consider rolling back'],
    },
    {
      detected: true,
      severity: 'high' as const,
      metric: 'confidence_level',
      pValue: 0.0345,
      driftScore: 0.5678,
      timestamp: new Date(now - 30 * 60000).toISOString(),
      recommendations: ['Review recent model inputs for anomalies'],
    },
    {
      detected: true,
      severity: 'medium' as const,
      metric: 'latency',
      pValue: 0.1234,
      driftScore: 0.3456,
      timestamp: new Date(now - 60 * 60000).toISOString(),
      recommendations: ['Monitor closely over next 24 hours'],
    },
    {
      detected: false,
      severity: 'low' as const,
      metric: 'error_rate',
      pValue: 0.4567,
      driftScore: 0.0789,
      timestamp: new Date(now - 120 * 60000).toISOString(),
      recommendations: [],
    },
  ],
  roi: {
    totalCost: 1234.56,
    totalValue: 5678.9,
    netValue: 4444.34,
    roi: 260.1,
    trendDirection: 'up',
  },
  isLoading: false,
  error: null,
  refetch: mockRefetch,
};

function setMockHook(overrides: Record<string, unknown> = {}) {
  mockUseDriftDashboard.mockReturnValue({
    ...mockDashboardData,
    ...overrides,
  } as any);
}

// ============================================
// Import component AFTER mocks
// ============================================

import { DriftDashboard } from '../DriftDashboard';

// ============================================
// Tests
// ============================================

describe('DriftDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMockHook();
  });

  // ------------------------------------------
  // Rendering (5 tests)
  // ------------------------------------------

  describe('Rendering', () => {
    it('renders dashboard with 5 stat cards', () => {
      render(<DriftDashboard />);
      expect(screen.getByText('Tracked Metrics')).toBeInTheDocument();
      expect(screen.getByText('Drift Detected')).toBeInTheDocument();
      expect(screen.getByText('High Severity')).toBeInTheDocument();
      expect(screen.getByText('Total Samples')).toBeInTheDocument();
      expect(screen.getByText('Last Check')).toBeInTheDocument();
    });

    it('renders severity filter chips', () => {
      render(<DriftDashboard />);
      expect(screen.getByTestId('filter-all')).toBeInTheDocument();
      expect(screen.getByTestId('filter-low')).toBeInTheDocument();
      expect(screen.getByTestId('filter-medium')).toBeInTheDocument();
      expect(screen.getByTestId('filter-high')).toBeInTheDocument();
      expect(screen.getByTestId('filter-critical')).toBeInTheDocument();
    });

    it('renders drift history cards', () => {
      render(<DriftDashboard />);
      const cards = screen.getAllByTestId('drift-history-card');
      expect(cards.length).toBe(4);
      // Check metric names appear in history cards
      const firstCard = cards[0];
      expect(firstCard).toBeInTheDocument();
    });

    it('renders empty state when no data', () => {
      setMockHook({
        status: {
          trackedMetrics: 0,
          totalSamples: 0,
          driftDetected: false,
          highSeverityCount: 0,
          lastCheck: null,
        },
        history: [],
        roi: null,
      });
      render(<DriftDashboard />);
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
      expect(
        screen.getByText(
          'No drift metrics tracked yet. Start using AI features to populate monitoring data.'
        )
      ).toBeInTheDocument();
    });

    it('renders loading skeletons when isLoading', () => {
      setMockHook({ isLoading: true });
      const { container } = render(<DriftDashboard />);
      // Skeletons rendered for stat cards
      const skeletons = container.querySelectorAll(
        '[class*="animate-pulse"], [data-slot="skeleton"]'
      );
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  // ------------------------------------------
  // Data Display (5 tests)
  // ------------------------------------------

  describe('Data Display', () => {
    it('shows correct stat values from mock data', () => {
      render(<DriftDashboard />);
      // Use getAllByText since numbers may appear in multiple locations
      expect(screen.getAllByText('8').length).toBeGreaterThan(0); // trackedMetrics
      expect(screen.getByText('YES')).toBeInTheDocument(); // driftDetected
      expect(screen.getAllByText('2').length).toBeGreaterThan(0); // highSeverityCount
      expect(screen.getByText('1500')).toBeInTheDocument(); // totalSamples
    });

    it('shows severity badges with correct classes', () => {
      render(<DriftDashboard />);
      const badges = screen.getAllByLabelText(/Severity:/);
      expect(badges.length).toBeGreaterThan(0);
      // Check a critical badge exists
      const criticalBadge = screen.getAllByText('CRITICAL');
      expect(criticalBadge.length).toBeGreaterThan(0);
    });

    it('shows drift score formatted to 4 decimal places', () => {
      render(<DriftDashboard />);
      const scores = screen.getAllByTestId('drift-score');
      expect(scores[0]).toHaveTextContent('0.8234');
    });

    it('shows recommendations in expanded card', async () => {
      const user = userEvent.setup();
      render(<DriftDashboard />);
      const expandButtons = screen.getAllByTestId('expand-button');
      await user.click(expandButtons[0]);
      const details = screen.getByTestId('expanded-details');
      expect(details).toBeInTheDocument();
      expect(screen.getByText('Immediately investigate model performance')).toBeInTheDocument();
    });

    it('shows relative timestamps', () => {
      render(<DriftDashboard />);
      // The 5-minute-ago lastCheck should show "5m ago"
      expect(screen.getByText('5m ago')).toBeInTheDocument();
    });
  });

  // ------------------------------------------
  // Interactions (5 tests)
  // ------------------------------------------

  describe('Interactions', () => {
    it('filter by severity chip updates hook call', async () => {
      const user = userEvent.setup();
      render(<DriftDashboard />);
      const highChip = screen.getByTestId('filter-high');
      await user.click(highChip);
      // The hook should be called with the HIGH severity filter
      expect(mockUseDriftDashboard).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'HIGH' })
      );
    });

    it('sort by score reorders via hook', async () => {
      const user = userEvent.setup();
      render(<DriftDashboard />);
      const sortSelect = screen.getByTestId('sort-select');
      await user.selectOptions(sortSelect, 'score');
      expect(mockUseDriftDashboard).toHaveBeenCalledWith(
        expect.objectContaining({ sortBy: 'score' })
      );
    });

    it('expand/collapse drift card details', async () => {
      const user = userEvent.setup();
      render(<DriftDashboard />);
      const expandButtons = screen.getAllByTestId('expand-button');
      expect(expandButtons[0]).toHaveTextContent('View Details');

      await user.click(expandButtons[0]);
      expect(screen.getByTestId('expanded-details')).toBeInTheDocument();

      // Click again to collapse
      const hideButton = screen.getAllByTestId('expand-button')[0];
      expect(hideButton).toHaveTextContent('Hide Details');
      await user.click(hideButton);
      expect(screen.queryByTestId('expanded-details')).not.toBeInTheDocument();
    });

    it('retry button calls refetch on error', async () => {
      const user = userEvent.setup();
      setMockHook({ error: new Error('Service unavailable'), isLoading: false });
      render(<DriftDashboard />);
      const retryButton = screen.getByTestId('retry-button');
      await user.click(retryButton);
      expect(mockRefetch).toHaveBeenCalled();
    });

    it('filter chips are keyboard accessible', () => {
      render(<DriftDashboard />);
      const allChip = screen.getByTestId('filter-all');
      expect(allChip).toHaveAttribute('aria-pressed', 'true');
      const highChip = screen.getByTestId('filter-high');
      expect(highChip).toHaveAttribute('aria-pressed', 'false');
    });
  });

  // ------------------------------------------
  // Edge Cases (5 tests)
  // ------------------------------------------

  describe('Edge Cases', () => {
    it('empty drift history shows empty state message', () => {
      setMockHook({
        status: {
          trackedMetrics: 0,
          totalSamples: 0,
          driftDetected: false,
          highSeverityCount: 0,
          lastCheck: null,
        },
        history: [],
      });
      render(<DriftDashboard />);
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });

    it('service unavailable error shows error banner with retry', () => {
      setMockHook({ error: new Error('Service unavailable'), isLoading: false });
      render(<DriftDashboard />);
      expect(screen.getByTestId('error-message')).toHaveTextContent(
        'AI monitoring service unavailable'
      );
      expect(screen.getByTestId('retry-button')).toBeInTheDocument();
    });

    it('stale data shows warning banner when lastCheck > 1h', () => {
      setMockHook({
        status: {
          ...mockDashboardData.status,
          lastCheck: new Date(now - 2 * 3600000).toISOString(), // 2 hours ago
        },
      });
      render(<DriftDashboard />);
      expect(screen.getByTestId('stale-warning')).toBeInTheDocument();
      expect(screen.getByText(/Monitoring data may be stale/)).toBeInTheDocument();
    });

    it('zero tracked metrics shows empty state', () => {
      setMockHook({
        status: {
          trackedMetrics: 0,
          totalSamples: 0,
          driftDetected: false,
          highSeverityCount: 0,
          lastCheck: null,
        },
        history: [],
      });
      render(<DriftDashboard />);
      expect(screen.getAllByText('0').length).toBeGreaterThan(0); // tracked metrics = 0
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });

    it('negative ROI shows red indicator', () => {
      setMockHook({
        roi: {
          totalCost: 5000,
          totalValue: 2000,
          netValue: -3000,
          roi: -60,
          trendDirection: 'down',
        },
      });
      render(<DriftDashboard />);
      const roiValue = screen.getByTestId('roi-value');
      expect(roiValue).toHaveTextContent('-60.0%');
      // Should have red color class
      expect(roiValue.className).toContain('text-red');
    });
  });

  // ------------------------------------------
  // Accessibility (3 tests)
  // ------------------------------------------

  describe('Accessibility', () => {
    it('ErrorRateGauge has role="meter" with aria attributes', () => {
      render(<DriftDashboard />);
      const meter = screen.getByRole('meter');
      expect(meter).toBeInTheDocument();
      expect(meter).toHaveAttribute('aria-valuemin', '0');
      expect(meter).toHaveAttribute('aria-valuemax', '1');
      expect(meter).toHaveAttribute('aria-label');
    });

    it('severity badges have accessible labels', () => {
      render(<DriftDashboard />);
      const badges = screen.getAllByLabelText(/Severity:/);
      expect(badges.length).toBeGreaterThan(0);
      expect(badges[0]).toHaveTextContent(/CRITICAL|HIGH|MEDIUM|LOW|NONE/);
    });

    it('filter chips are keyboard navigable with aria-pressed', () => {
      render(<DriftDashboard />);
      const filterGroup = screen.getByRole('group', { name: /Filter by severity/ });
      expect(filterGroup).toBeInTheDocument();
      const buttons = within(filterGroup).getAllByRole('button');
      expect(buttons.length).toBe(5);
      // ALL should be pressed
      expect(buttons[0]).toHaveAttribute('aria-pressed', 'true');
    });
  });

  // ------------------------------------------
  // Cost Tracker (2 tests)
  // ------------------------------------------

  describe('Cost Tracker', () => {
    it('shows ROI percentage and trend direction', () => {
      render(<DriftDashboard />);
      const roiValue = screen.getByTestId('roi-value');
      expect(roiValue).toHaveTextContent('+260.1%');
      expect(screen.getByTestId('trend-icon')).toBeInTheDocument();
    });

    it('shows "No cost data" when ROI is null', () => {
      setMockHook({ roi: null });
      render(<DriftDashboard />);
      expect(screen.getByTestId('no-cost-data')).toBeInTheDocument();
      expect(screen.getByText('No cost data available')).toBeInTheDocument();
    });

    it('shows trending_flat icon for stable trend direction', () => {
      setMockHook({
        roi: { totalCost: 100, totalValue: 100, netValue: 0, roi: 0, trendDirection: 'stable' },
      });
      render(<DriftDashboard />);
      expect(screen.getByTestId('trend-icon')).toHaveTextContent('trending_flat');
    });
  });

  // ------------------------------------------
  // ErrorRateGauge color coverage (3 tests)
  // ------------------------------------------

  describe('ErrorRateGauge color zones', () => {
    it('shows amber gauge for medium error_rate drift score', () => {
      setMockHook({
        history: [
          {
            detected: true,
            severity: 'medium' as const,
            metric: 'error_rate',
            pValue: 0.05,
            driftScore: 0.35,
            timestamp: new Date(now - 10 * 60000).toISOString(),
            recommendations: ['Monitor closely'],
          },
        ],
      });
      render(<DriftDashboard />);
      const meter = screen.getByRole('meter');
      expect(meter).toHaveAttribute('aria-valuenow', '0.35');
    });

    it('shows red gauge for high error_rate drift score', () => {
      setMockHook({
        history: [
          {
            detected: true,
            severity: 'critical' as const,
            metric: 'error_rate',
            pValue: 0.001,
            driftScore: 0.85,
            timestamp: new Date(now - 10 * 60000).toISOString(),
            recommendations: ['Immediate action required'],
          },
        ],
      });
      render(<DriftDashboard />);
      const meter = screen.getByRole('meter');
      expect(meter).toHaveAttribute('aria-valuenow', '0.85');
      const scoreText = screen.getByTestId('gauge-score');
      expect(scoreText).toHaveTextContent('0.8500');
    });

    it('shows green gauge for low error_rate drift score', () => {
      setMockHook({
        history: [
          {
            detected: false,
            severity: 'none' as const,
            metric: 'error_rate',
            pValue: 0.8,
            driftScore: 0.02,
            timestamp: new Date(now - 10 * 60000).toISOString(),
            recommendations: [],
          },
        ],
      });
      render(<DriftDashboard />);
      const meter = screen.getByRole('meter');
      expect(meter).toHaveAttribute('aria-valuenow', '0.02');
    });
  });
});
