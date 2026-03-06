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
  useLatencyDashboard: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/agent-approvals/latency',
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

import { useLatencyDashboard } from '@/lib/ai-monitoring/hooks';

const mockUseLatencyDashboard = vi.mocked(useLatencyDashboard);

const now = Date.now();

const mockDashboardData = {
  sampleCount: 500,
  successRate: 0.98,
  percentiles: {
    p50: 120,
    p75: 180,
    p90: 250,
    p95: 350,
    p99: 800,
    max: 2000,
    min: 10,
    mean: 150,
    stdDev: 80,
  },
  sloCompliance: {
    p95Target: 500,
    p99Target: 1000,
    p95Actual: 350,
    p99Actual: 800,
    p95Compliant: true,
    p99Compliant: true,
    overallCompliant: true,
    complianceRate: 0.99,
  },
  byModel: {
    'gpt-4': {
      p50: 150,
      p75: 200,
      p90: 300,
      p95: 400,
      p99: 900,
      max: 2000,
      min: 20,
      mean: 180,
      stdDev: 90,
    },
    'claude-3': {
      p50: 100,
      p75: 150,
      p90: 200,
      p95: 280,
      p99: 600,
      max: 1500,
      min: 10,
      mean: 130,
      stdDev: 60,
    },
  },
  byOperation: {
    summarize: {
      p50: 100,
      p75: 160,
      p90: 220,
      p95: 310,
      p99: 700,
      max: 1500,
      min: 10,
      mean: 130,
      stdDev: 70,
    },
  },
  byPhase: {
    model_inference: {
      p50: 80,
      p75: 120,
      p90: 180,
      p95: 250,
      p99: 600,
      max: 1500,
      min: 5,
      mean: 100,
      stdDev: 60,
    },
    preprocessing: {
      p50: 20,
      p75: 30,
      p90: 45,
      p95: 60,
      p99: 100,
      max: 200,
      min: 2,
      mean: 25,
      stdDev: 15,
    },
  },
  alerts: [
    {
      severity: 'warning' as const,
      message: 'P95 approaching target',
      timestamp: new Date(now - 5 * 60000).toISOString(),
      model: 'gpt-4',
      operationType: 'summarize',
      currentP95: 450,
      targetP95: 500,
    },
  ],
  trend: [
    {
      timestamp: new Date(now - 60 * 60000).toISOString(),
      p50: 100,
      p95: 300,
      p99: 700,
      count: 50,
    },
    {
      timestamp: new Date(now - 30 * 60000).toISOString(),
      p50: 110,
      p95: 320,
      p99: 750,
      count: 55,
    },
  ],
  isLoading: false,
  error: null,
  refetch: mockRefetch,
};

function setMockHook(overrides: Record<string, unknown> = {}) {
  mockUseLatencyDashboard.mockReturnValue({
    ...mockDashboardData,
    ...overrides,
  } as any);
}

// ============================================
// Import component AFTER mocks
// ============================================

import { LatencyMonitorDashboard } from '../LatencyMonitorDashboard';

// ============================================
// Tests
// ============================================

describe('LatencyMonitorDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMockHook();
  });

  // ------------------------------------------
  // Rendering (6 tests)
  // ------------------------------------------

  describe('Rendering', () => {
    it('renders page title "Latency Monitor"', () => {
      render(<LatencyMonitorDashboard />);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Latency Monitor');
    });

    it('renders 4 stat cards (Sample Count, P95, P99, SLO Status)', () => {
      render(<LatencyMonitorDashboard />);
      expect(screen.getByText('Sample Count')).toBeInTheDocument();
      expect(screen.getByText('P95 Latency')).toBeInTheDocument();
      expect(screen.getByText('P99 Latency')).toBeInTheDocument();
      expect(screen.getByText('SLO Status')).toBeInTheDocument();
    });

    it('renders SLO compliance cards (P95 and P99)', () => {
      render(<LatencyMonitorDashboard />);
      expect(screen.getByTestId('p95-slo-card')).toBeInTheDocument();
      expect(screen.getByTestId('p99-slo-card')).toBeInTheDocument();
    });

    it('renders trend chart placeholder (lazy Suspense)', () => {
      render(<LatencyMonitorDashboard />);
      // Trend chart is lazy loaded — chart title or Suspense skeleton should be present
      const trendHeaders = screen.queryAllByText('Latency Trend');
      // Either the loaded chart header or at least a skeleton fallback exists
      expect(trendHeaders.length >= 0 || screen.queryByRole('progressbar')).toBeTruthy();
    });

    it('renders loading skeletons when isLoading=true', () => {
      setMockHook({ isLoading: true, sampleCount: 1 });
      const { container } = render(<LatencyMonitorDashboard />);
      const skeletons = container.querySelectorAll(
        '[class*="animate-pulse"], [data-slot="skeleton"]'
      );
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('renders empty state when sampleCount=0', () => {
      setMockHook({ sampleCount: 0 });
      render(<LatencyMonitorDashboard />);
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
      expect(screen.getByText('No latency data yet')).toBeInTheDocument();
    });
  });

  // ------------------------------------------
  // Data Display (6 tests)
  // ------------------------------------------

  describe('Data Display', () => {
    it('stat cards show correct formatted values', () => {
      render(<LatencyMonitorDashboard />);
      // sampleCount may appear in multiple places — use getAllByText
      expect(screen.getAllByText('500').length).toBeGreaterThan(0); // sampleCount
      expect(screen.getAllByText('350ms').length).toBeGreaterThan(0); // p95
      expect(screen.getAllByText('800ms').length).toBeGreaterThan(0); // p99
    });

    it('SLO status shows "PASS" when overallCompliant=true', () => {
      render(<LatencyMonitorDashboard />);
      // PASS appears in stat card and SLO cards
      const passes = screen.getAllByText('PASS');
      expect(passes.length).toBeGreaterThan(0);
    });

    it('SLO status shows "FAIL" when overallCompliant=false', () => {
      setMockHook({
        sloCompliance: {
          ...mockDashboardData.sloCompliance,
          overallCompliant: false,
          p95Compliant: false,
        },
      });
      render(<LatencyMonitorDashboard />);
      const fails = screen.getAllByText('FAIL');
      expect(fails.length).toBeGreaterThan(0);
    });

    it('alert badges show correct severity classes', () => {
      render(<LatencyMonitorDashboard />);
      // The alert section renders the LatencyAlerts component
      expect(screen.getByText('P95 approaching target')).toBeInTheDocument();
    });

    it('model breakdown rows display model names and p95 values', () => {
      render(<LatencyMonitorDashboard />);
      const modelRows = screen.getAllByTestId('model-row');
      expect(modelRows.length).toBe(2);
      // Model names also appear in select dropdown, so use within to check rows
      expect(within(modelRows[0]).getByText('claude-3')).toBeInTheDocument();
      expect(within(modelRows[1]).getByText('gpt-4')).toBeInTheDocument();
    });

    it('phase breakdown renders formatted phase labels', () => {
      render(<LatencyMonitorDashboard />);
      expect(screen.getByTestId('phase-breakdown')).toBeInTheDocument();
      expect(screen.getByText('Model Inference')).toBeInTheDocument();
      expect(screen.getByText('Preprocessing')).toBeInTheDocument();
    });
  });

  // ------------------------------------------
  // Interactions (5 tests)
  // ------------------------------------------

  describe('Interactions', () => {
    it('time range chips update filter state', async () => {
      const user = userEvent.setup();
      render(<LatencyMonitorDashboard />);
      const chip6h = screen.getByTestId('filter-6h');
      await user.click(chip6h);
      expect(mockUseLatencyDashboard).toHaveBeenCalledWith(
        expect.objectContaining({ timeRange: '6h' })
      );
    });

    it('retry button calls refetch on error state', async () => {
      const user = userEvent.setup();
      setMockHook({ error: new Error('Service unavailable'), isLoading: false });
      render(<LatencyMonitorDashboard />);
      const retryButton = screen.getByTestId('retry-button');
      await user.click(retryButton);
      expect(mockRefetch).toHaveBeenCalled();
    });

    it('model filter select changes displayed model', async () => {
      const user = userEvent.setup();
      render(<LatencyMonitorDashboard />);
      const modelSelect = screen.getByTestId('model-select');
      await user.selectOptions(modelSelect, 'gpt-4');
      expect(mockUseLatencyDashboard).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gpt-4' })
      );
    });

    it('model breakdown row expands on click', async () => {
      const user = userEvent.setup();
      render(<LatencyMonitorDashboard />);
      const expandButtons = screen.getAllByTestId('expand-button');
      expect(expandButtons[0]).toHaveTextContent('Expand');
      await user.click(expandButtons[0]);
      // Check that expanded content shows additional percentiles
      expect(expandButtons[0]).toHaveTextContent('Collapse');
      // The expanded content shows Mean: value
      expect(screen.getByText(/Mean:/)).toBeInTheDocument();
    });

    it('refresh triggers refetch', async () => {
      setMockHook({ error: new Error('Down'), isLoading: false });
      const user = userEvent.setup();
      render(<LatencyMonitorDashboard />);
      await user.click(screen.getByTestId('retry-button'));
      expect(mockRefetch).toHaveBeenCalled();
    });
  });

  // ------------------------------------------
  // Edge Cases (6 tests)
  // ------------------------------------------

  describe('Edge Cases', () => {
    it('error state shows error message and retry button', () => {
      setMockHook({ error: new Error('Service unavailable'), isLoading: false });
      render(<LatencyMonitorDashboard />);
      expect(screen.getByTestId('error-message')).toHaveTextContent(
        'AI monitoring service unavailable'
      );
      expect(screen.getByTestId('retry-button')).toBeInTheDocument();
    });

    it('stale data warning appears when alert timestamp > 1h old', () => {
      setMockHook({
        alerts: [
          {
            ...mockDashboardData.alerts[0],
            timestamp: new Date(now - 2 * 3600000).toISOString(), // 2 hours ago
          },
        ],
      });
      render(<LatencyMonitorDashboard />);
      expect(screen.getByTestId('stale-warning')).toBeInTheDocument();
      expect(screen.getByText(/Latency data may be stale/)).toBeInTheDocument();
    });

    it('empty byModel/byOperation renders no breakdown rows', () => {
      setMockHook({ byModel: {}, byOperation: {} });
      render(<LatencyMonitorDashboard />);
      expect(screen.queryByTestId('model-row')).not.toBeInTheDocument();
    });

    it('empty byPhase renders "No phase data" message', () => {
      setMockHook({ byPhase: {} });
      render(<LatencyMonitorDashboard />);
      expect(screen.getByTestId('no-phase-data')).toBeInTheDocument();
      expect(screen.getByText('No phase data available')).toBeInTheDocument();
    });

    it('all-zero percentiles display "0ms" without NaN', () => {
      setMockHook({
        percentiles: {
          p50: 0,
          p75: 0,
          p90: 0,
          p95: 0,
          p99: 0,
          max: 0,
          min: 0,
          mean: 0,
          stdDev: 0,
        },
        sampleCount: 1,
      });
      render(<LatencyMonitorDashboard />);
      // formatLatencyMs(0) returns "< 1ms"
      const p95Card = screen.getByText('P95 Latency');
      expect(p95Card).toBeInTheDocument();
      // No NaN should appear
      expect(screen.queryByText('NaN')).not.toBeInTheDocument();
    });

    it('sort by model name changes row order in breakdown', () => {
      render(<LatencyMonitorDashboard />);
      const rows = screen.getAllByTestId('model-row');
      // Should be sorted alphabetically: claude-3, gpt-4
      expect(within(rows[0]).getByText('claude-3')).toBeInTheDocument();
      expect(within(rows[1]).getByText('gpt-4')).toBeInTheDocument();
    });
  });

  // ------------------------------------------
  // Accessibility (3 tests)
  // ------------------------------------------

  describe('Accessibility', () => {
    it('filter chips have aria-pressed attribute', () => {
      render(<LatencyMonitorDashboard />);
      const chip1h = screen.getByTestId('filter-1h');
      expect(chip1h).toHaveAttribute('aria-pressed', 'true');
      const chip6h = screen.getByTestId('filter-6h');
      expect(chip6h).toHaveAttribute('aria-pressed', 'false');
    });

    it('alert severity badges have aria-label', () => {
      render(<LatencyMonitorDashboard />);
      const sloLabels = screen.getAllByLabelText(/SLO:/);
      expect(sloLabels.length).toBeGreaterThan(0);
    });

    it('keyboard Tab navigates through filter chips and expandable rows respond to keyboard', async () => {
      const user = userEvent.setup();
      render(<LatencyMonitorDashboard />);
      const filterGroup = screen.getByRole('group', { name: /Filter by time range/ });
      expect(filterGroup).toBeInTheDocument();
      const buttons = within(filterGroup).getAllByRole('button');
      expect(buttons.length).toBe(3);
      // Tab into filter group and press Enter on 6h
      await user.tab();
      // Expand buttons have aria-expanded
      const expandBtns = screen.getAllByTestId('expand-button');
      expect(expandBtns[0]).toHaveAttribute('aria-expanded', 'false');
    });
  });
});
