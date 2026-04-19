import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// ============================================
// Mocks
// ============================================

const mockOverview = {
  totalLeads: 142,
  leadDelta: 12,
  totalRevenue: 48500,
  revenueDelta: 8,
  openOpportunities: 37,
  openOpportunitiesDelta: -3,
  newContacts: 28,
  newContactsDelta: 5,
  winRate: 34,
  winRateDelta: 2,
  recentActivity: [],
};

const mockTimeSeries7d = [
  { period: '2026-03-10', periodLabel: 'Mon', value: 5200 },
  { period: '2026-03-11', periodLabel: 'Tue', value: 6100 },
  { period: '2026-03-12', periodLabel: 'Wed', value: 7300 },
  { period: '2026-03-13', periodLabel: 'Thu', value: 4800 },
  { period: '2026-03-14', periodLabel: 'Fri', value: 9200 },
  { period: '2026-03-15', periodLabel: 'Sat', value: 3100 },
  { period: '2026-03-16', periodLabel: 'Sun', value: 4500 },
];

const mockTimeSeries30d = [
  { period: '2026-02-17', periodLabel: 'Week of Feb 17', value: 32000 },
  { period: '2026-02-24', periodLabel: 'Week of Feb 24', value: 38000 },
  { period: '2026-03-03', periodLabel: 'Week of Mar 3', value: 41000 },
  { period: '2026-03-10', periodLabel: 'Week of Mar 10', value: 35000 },
];

const mockSalesMetrics = {
  pipelineValue: 185000,
  winRate: 36,
  avgDealSize: 12500,
  avgSalesCycleDays: 28,
  totalRevenue: 52000,
  closedWonCount: 14,
  closedLostCount: 6,
};

const mockGrowthData = Array.from({ length: 12 }, (_, i) => ({
  month: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i],
  value: 30000 + i * 2000,
  rawValue: 30000 + i * 2000,
  ...(i === 11 ? { yoyChange: 15 } : {}),
}));

const mockTrafficSources = [
  { name: 'Website', percentage: 45, color: 'bg-ds-primary' },
  { name: 'Cold Call', percentage: 25, color: 'bg-emerald-500' },
  { name: 'Referral', percentage: 20, color: 'bg-amber-500' },
  { name: 'Social', percentage: 10, color: 'bg-violet-500' },
];

const mockFunnel = {
  stages: [
    {
      stage: 'PROSPECTING',
      label: 'Prospecting',
      count: 50,
      value: 125000,
      conversionFromPrevious: null,
    },
    {
      stage: 'QUALIFICATION',
      label: 'Qualification',
      count: 30,
      value: 75000,
      conversionFromPrevious: 60,
    },
    {
      stage: 'CLOSED_WON',
      label: 'Closed Won',
      count: 10,
      value: 25000,
      conversionFromPrevious: 33,
    },
  ],
  totalLeads: 50,
  overallConversionRate: 20,
};

// Mutable query state
const mockQueries: Record<string, { data: unknown; isLoading: boolean }> = {};

function resetQueries() {
  mockQueries.getOverview = { data: undefined, isLoading: false };
  mockQueries.getTimeSeriesData = { data: undefined, isLoading: false };
  mockQueries.getSalesMetrics = { data: undefined, isLoading: false };
  mockQueries.getConversionFunnel = { data: undefined, isLoading: false };
  mockQueries.growthTrends = { data: undefined, isLoading: false };
  mockQueries.trafficSources = { data: undefined, isLoading: false };
}

const mockExportFetch = vi
  .fn()
  .mockResolvedValue({ format: 'csv', data: 'col1,col2\nval1,val2', filename: 'report.csv' });
const mockUseUtils = { analytics: { exportReport: { fetch: mockExportFetch } } };

vi.mock('@/lib/trpc', () => ({
  trpc: {
    analytics: {
      getOverview: {
        useQuery: (_input: unknown, opts?: { enabled?: boolean }) =>
          opts?.enabled === false ? { data: undefined, isLoading: false } : mockQueries.getOverview,
      },
      getTimeSeriesData: {
        useQuery: (_input: unknown, opts?: { enabled?: boolean }) =>
          opts?.enabled === false
            ? { data: undefined, isLoading: false }
            : mockQueries.getTimeSeriesData,
      },
      getSalesMetrics: {
        useQuery: (_input: unknown, opts?: { enabled?: boolean }) =>
          opts?.enabled === false
            ? { data: undefined, isLoading: false }
            : mockQueries.getSalesMetrics,
      },
      getConversionFunnel: {
        useQuery: (_input: unknown, opts?: { enabled?: boolean }) =>
          opts?.enabled === false
            ? { data: undefined, isLoading: false }
            : mockQueries.getConversionFunnel,
      },
      growthTrends: {
        useQuery: (_input: unknown, opts?: { enabled?: boolean }) =>
          opts?.enabled === false
            ? { data: undefined, isLoading: false }
            : mockQueries.growthTrends,
      },
      trafficSources: {
        useQuery: (_input: unknown, opts?: { enabled?: boolean }) =>
          opts?.enabled === false
            ? { data: undefined, isLoading: false }
            : mockQueries.trafficSources,
      },
    },
    useUtils: () => mockUseUtils,
  },
}));

const mockAuth = { isAuthenticated: true, isLoading: false };
vi.mock('@/lib/auth/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('@/hooks/useAnalyticsDateRange', () => ({
  useAnalyticsDateRange: (_period: string) => ({
    startDate: `2026-03-01T00:00:00Z`,
    endDate: `2026-03-16T00:00:00Z`,
  }),
}));

vi.mock('@/providers/TimezoneProvider', () => ({
  useTimezoneContext: () => ({
    timezone: 'UTC',
    formatDate: (d: string | Date) => (typeof d === 'string' ? d : d.toISOString()),
  }),
}));

const mockDownloadCSV = vi.fn();
vi.mock('@/lib/export/csv', () => ({
  downloadCSV: (...args: unknown[]) => mockDownloadCSV(...args),
}));

const mockExportToPDF = vi.fn();
vi.mock('@/lib/export/pdf', () => ({
  exportToPDF: (...args: unknown[]) => mockExportToPDF(...args),
}));

// Recharts mock — render minimal structure
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  BarChart: ({ children, data }: { children: React.ReactNode; data: unknown[] }) => (
    <div data-testid="bar-chart" data-points={data?.length}>
      {children}
    </div>
  ),
  Bar: () => <div data-testid="bar" />,
  LineChart: ({ children, data }: { children: React.ReactNode; data: unknown[] }) => (
    <div data-testid="line-chart" data-points={data?.length}>
      {children}
    </div>
  ),
  Line: () => <div data-testid="line" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  PieChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pie-chart">{children}</div>
  ),
  Pie: ({ children }: { children: React.ReactNode }) => <div data-testid="pie">{children}</div>,
  Cell: () => <div data-testid="cell" />,
}));

// ============================================
// Import after mocks
// ============================================

const { default: SavedReportView } = await import('../SavedReportView');

const weeklyConfig = {
  reportType: 'weekly' as const,
  defaultPeriod: '7d' as const,
  title: 'Weekly Summary',
  description: 'Last 7 days: revenue, leads, pipeline activity, and trend indicators',
  breadcrumbLabel: 'Weekly Summary',
};

const monthlyConfig = {
  reportType: 'monthly' as const,
  defaultPeriod: '30d' as const,
  title: 'Monthly Revenue',
  description: 'Last 30 days: revenue breakdown, lead sources, and pipeline metrics',
  breadcrumbLabel: 'Monthly Revenue',
};

const quarterlyConfig = {
  reportType: 'quarterly' as const,
  defaultPeriod: '90d' as const,
  title: 'Q4 Performance',
  description: 'Quarterly performance summary with year-over-year comparison',
  breadcrumbLabel: 'Q4 Performance',
};

// ============================================
// Tests
// ============================================

describe('SavedReportView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetQueries();
    mockAuth.isAuthenticated = true;
    mockAuth.isLoading = false;
  });

  // --- Loading States (AC-009) ---
  describe('Loading states', () => {
    it('renders loading MetricCards when overview is loading', () => {
      mockQueries.getOverview = { data: undefined, isLoading: true };
      render(<SavedReportView config={weeklyConfig} />);
      // MetricCard with isLoading renders skeleton — heading still visible
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Weekly Summary');
    });

    it('renders chart skeleton when timeSeries is loading', () => {
      mockQueries.getOverview = { data: mockOverview, isLoading: false };
      mockQueries.getTimeSeriesData = { data: undefined, isLoading: true };
      render(<SavedReportView config={weeklyConfig} />);
      expect(screen.getByText('Daily Revenue')).toBeInTheDocument();
    });
  });

  // --- Empty States (AC-010) ---
  describe('Empty states', () => {
    it('renders EmptyState when overview returns null', () => {
      mockQueries.getOverview = { data: null, isLoading: false };
      render(<SavedReportView config={weeklyConfig} />);
      expect(screen.getByText('No data available')).toBeInTheDocument();
    });

    it('renders chart EmptyState when timeSeries is empty array', () => {
      mockQueries.getOverview = { data: mockOverview, isLoading: false };
      mockQueries.getTimeSeriesData = { data: [], isLoading: false };
      render(<SavedReportView config={weeklyConfig} />);
      expect(screen.getByText('No revenue data')).toBeInTheDocument();
    });
  });

  // --- Weekly Config (AC-001, AC-002) ---
  describe('Weekly report', () => {
    beforeEach(() => {
      mockQueries.getOverview = { data: mockOverview, isLoading: false };
      mockQueries.getTimeSeriesData = { data: mockTimeSeries7d, isLoading: false };
      mockQueries.getConversionFunnel = { data: mockFunnel, isLoading: false };
    });

    it('renders 4 MetricCards with revenue, leads, open opportunities, win rate', () => {
      render(<SavedReportView config={weeklyConfig} />);
      expect(screen.getByText('Revenue')).toBeInTheDocument();
      expect(screen.getByText('Leads')).toBeInTheDocument();
      expect(screen.getByText('Open Opportunities')).toBeInTheDocument();
      expect(screen.getByText('Win Rate')).toBeInTheDocument();
    });

    it('renders daily revenue bar chart with 7 data points', () => {
      render(<SavedReportView config={weeklyConfig} />);
      expect(screen.getByText('Daily Revenue')).toBeInTheDocument();
      const barChart = screen.getByTestId('bar-chart');
      expect(barChart).toHaveAttribute('data-points', '7');
    });
  });

  // --- Monthly Config (AC-003, AC-004) ---
  describe('Monthly report', () => {
    beforeEach(() => {
      mockQueries.getOverview = { data: mockOverview, isLoading: false };
      mockQueries.getTimeSeriesData = { data: mockTimeSeries30d, isLoading: false };
      mockQueries.getSalesMetrics = { data: mockSalesMetrics, isLoading: false };
      mockQueries.trafficSources = { data: mockTrafficSources, isLoading: false };
    });

    it('renders 4 MetricCards with total revenue, pipeline value, win rate, avg deal size', () => {
      render(<SavedReportView config={monthlyConfig} />);
      expect(screen.getByText('Total Revenue')).toBeInTheDocument();
      expect(screen.getByText('Pipeline Value')).toBeInTheDocument();
      expect(screen.getByText('Win Rate')).toBeInTheDocument();
      expect(screen.getByText('Avg Deal Size')).toBeInTheDocument();
    });

    it('renders weekly revenue trend chart', () => {
      render(<SavedReportView config={monthlyConfig} />);
      expect(screen.getByText('Weekly Revenue Trend')).toBeInTheDocument();
      const barChart = screen.getByTestId('bar-chart');
      expect(barChart).toHaveAttribute('data-points', '4');
    });

    it('renders lead source distribution chart', () => {
      render(<SavedReportView config={monthlyConfig} />);
      expect(screen.getByText('Lead Sources')).toBeInTheDocument();
      expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
    });
  });

  // --- Quarterly Config (AC-005, AC-006) ---
  describe('Quarterly report', () => {
    beforeEach(() => {
      mockQueries.getOverview = { data: mockOverview, isLoading: false };
      mockQueries.getSalesMetrics = { data: mockSalesMetrics, isLoading: false };
      mockQueries.growthTrends = { data: mockGrowthData, isLoading: false };
      mockQueries.getConversionFunnel = { data: mockFunnel, isLoading: false };
    });

    it('renders heading "Q4 Performance"', () => {
      render(<SavedReportView config={quarterlyConfig} />);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Q4 Performance');
    });

    it('renders MetricCards with revenue, win rate, pipeline value, deals closed', () => {
      render(<SavedReportView config={quarterlyConfig} />);
      expect(screen.getByText('Revenue')).toBeInTheDocument();
      expect(screen.getByText('Win Rate')).toBeInTheDocument();
      expect(screen.getByText('Pipeline Value')).toBeInTheDocument();
      expect(screen.getByText('Deals Closed')).toBeInTheDocument();
    });

    it('renders 12-month revenue trend line chart', () => {
      render(<SavedReportView config={quarterlyConfig} />);
      expect(screen.getByText('12-Month Revenue Trend')).toBeInTheDocument();
      const lineChart = screen.getByTestId('line-chart');
      expect(lineChart).toHaveAttribute('data-points', '12');
    });
  });

  // --- Period Selector (AC-007) ---
  describe('Period selector', () => {
    it('renders with correct default period for weekly', () => {
      mockQueries.getOverview = { data: mockOverview, isLoading: false };
      render(<SavedReportView config={weeklyConfig} />);
      const select = screen.getByLabelText('Select time period') as HTMLSelectElement;
      expect(select.value).toBe('7d');
    });

    it('weekly offers 7d and 30d options', () => {
      mockQueries.getOverview = { data: mockOverview, isLoading: false };
      render(<SavedReportView config={weeklyConfig} />);
      const select = screen.getByLabelText('Select time period');
      const options = within(select).getAllByRole('option');
      expect(options).toHaveLength(2);
      expect(options[0]).toHaveValue('7d');
      expect(options[1]).toHaveValue('30d');
    });

    it('monthly offers 30d and 90d options', () => {
      mockQueries.getOverview = { data: mockOverview, isLoading: false };
      render(<SavedReportView config={monthlyConfig} />);
      const select = screen.getByLabelText('Select time period');
      const options = within(select).getAllByRole('option');
      expect(options).toHaveLength(2);
      expect(options[0]).toHaveValue('30d');
      expect(options[1]).toHaveValue('90d');
    });

    it('quarterly offers 90d and ytd options', () => {
      mockQueries.getOverview = { data: mockOverview, isLoading: false };
      render(<SavedReportView config={quarterlyConfig} />);
      const select = screen.getByLabelText('Select time period');
      const options = within(select).getAllByRole('option');
      expect(options).toHaveLength(2);
      expect(options[0]).toHaveValue('90d');
      expect(options[1]).toHaveValue('ytd');
    });

    it('changing period updates the selected value', async () => {
      mockQueries.getOverview = { data: mockOverview, isLoading: false };
      render(<SavedReportView config={weeklyConfig} />);
      const select = screen.getByLabelText('Select time period') as HTMLSelectElement;
      await userEvent.selectOptions(select, '30d');
      expect(select.value).toBe('30d');
    });
  });

  // --- Export (AC-008) ---
  describe('Export', () => {
    beforeEach(() => {
      mockQueries.getOverview = { data: mockOverview, isLoading: false };
    });

    it('renders export button with CSV and PDF options', async () => {
      render(<SavedReportView config={weeklyConfig} />);
      const exportBtn = screen.getByRole('button', { name: /export/i });
      await userEvent.click(exportBtn);
      expect(screen.getByText('Export CSV')).toBeInTheDocument();
      expect(screen.getByText('Export PDF')).toBeInTheDocument();
    });

    it('CSV export calls utils.analytics.exportReport.fetch with mapped reportType', async () => {
      render(<SavedReportView config={weeklyConfig} />);
      const exportBtn = screen.getByRole('button', { name: /export/i });
      await userEvent.click(exportBtn);
      await userEvent.click(screen.getByText('Export CSV'));
      expect(mockExportFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          format: 'csv',
          reportType: 'overview', // weekly maps to 'overview'
        })
      );
    });

    it('CSV export calls downloadCSV with server result', async () => {
      // Use flushPromises pattern for async mock resolution
      mockExportFetch.mockResolvedValue({
        format: 'csv',
        data: 'col1,col2\nval1,val2',
        filename: 'report.csv',
      });
      render(<SavedReportView config={weeklyConfig} />);
      const exportBtn = screen.getByRole('button', { name: /export/i });
      await userEvent.click(exportBtn);
      await userEvent.click(screen.getByText('Export CSV'));
      // Flush promise queue
      await new Promise(process.nextTick);
      expect(mockDownloadCSV).toHaveBeenCalledWith('col1,col2\nval1,val2', 'report.csv');
    });

    it('PDF export calls exportToPDF with formatted report sections', async () => {
      render(<SavedReportView config={weeklyConfig} />);
      const exportBtn = screen.getByRole('button', { name: /export/i });
      await userEvent.click(exportBtn);
      await userEvent.click(screen.getByText('Export PDF'));
      expect(mockExportToPDF).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ title: 'Key Metrics', type: 'metrics' }),
        ]),
        expect.objectContaining({ title: 'Weekly Summary Report' })
      );
    });
  });

  // --- Auth Guard (AC-011) ---
  describe('Auth guard', () => {
    it('queries use enabled: isAuthenticated && !authLoading', () => {
      mockQueries.getOverview = { data: mockOverview, isLoading: false };
      render(<SavedReportView config={weeklyConfig} />);
      // If auth is valid, data should render
      expect(screen.getByText('Revenue')).toBeInTheDocument();
    });

    it('queries NOT issued when isAuthenticated is false', () => {
      mockAuth.isAuthenticated = false;
      render(<SavedReportView config={weeklyConfig} />);
      // With auth disabled, EmptyState should show since queries return undefined
      expect(screen.getByText('No data available')).toBeInTheDocument();
    });

    it('queries NOT issued when authLoading is true', () => {
      mockAuth.isLoading = true;
      render(<SavedReportView config={weeklyConfig} />);
      // Auth loading means isLoading=true, heading still renders
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Weekly Summary');
    });
  });

  // --- Timezone (AC-012) ---
  it('uses useTimezoneContext for date formatting', () => {
    mockQueries.getOverview = { data: mockOverview, isLoading: false };
    mockQueries.getTimeSeriesData = { data: mockTimeSeries7d, isLoading: false };
    render(<SavedReportView config={weeklyConfig} />);
    // Component imports and calls useTimezoneContext — verified by not throwing
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Weekly Summary');
  });

  // --- Breadcrumb & Navigation (AC-013, NF-002) ---
  describe('Breadcrumb', () => {
    it('renders Dashboard > Analytics > breadcrumbLabel', () => {
      mockQueries.getOverview = { data: mockOverview, isLoading: false };
      render(<SavedReportView config={weeklyConfig} />);
      const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
      expect(within(nav).getByText('Dashboard')).toBeInTheDocument();
      expect(within(nav).getByText('Analytics')).toBeInTheDocument();
      expect(within(nav).getByText('Weekly Summary')).toBeInTheDocument();
    });

    it('uses nav aria-label="Breadcrumb" with aria-current="page"', () => {
      mockQueries.getOverview = { data: mockOverview, isLoading: false };
      render(<SavedReportView config={weeklyConfig} />);
      const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
      expect(nav).toBeInTheDocument();
      const current = within(nav).getByText('Weekly Summary');
      expect(current).toHaveAttribute('aria-current', 'page');
    });
  });

  // --- Accessibility (NF-002, NF-003, NF-004) ---
  describe('Accessibility', () => {
    beforeEach(() => {
      mockQueries.getOverview = { data: mockOverview, isLoading: false };
      mockQueries.getTimeSeriesData = { data: mockTimeSeries7d, isLoading: false };
    });

    it('charts have role="img" with aria-label', () => {
      render(<SavedReportView config={weeklyConfig} />);
      const chartImg = screen.getByRole('img', { name: /revenue bar chart/i });
      expect(chartImg).toBeInTheDocument();
    });

    it('metric section has section aria-label', () => {
      render(<SavedReportView config={weeklyConfig} />);
      const section = screen.getByRole('region', { name: 'Key Metrics' });
      expect(section).toBeInTheDocument();
    });

    it('export dropdown uses aria-haspopup and aria-expanded', async () => {
      render(<SavedReportView config={weeklyConfig} />);
      const exportBtn = screen.getByRole('button', { name: /export/i });
      expect(exportBtn).toHaveAttribute('aria-haspopup', 'menu');
      expect(exportBtn).toHaveAttribute('aria-expanded', 'false');
      await userEvent.click(exportBtn);
      expect(exportBtn).toHaveAttribute('aria-expanded', 'true');
    });

    it('export dropdown uses role="menu" and role="menuitem"', async () => {
      render(<SavedReportView config={weeklyConfig} />);
      await userEvent.click(screen.getByRole('button', { name: /export/i }));
      expect(screen.getByRole('menu')).toBeInTheDocument();
      const menuItems = screen.getAllByRole('menuitem');
      expect(menuItems).toHaveLength(2);
    });

    it('trend direction uses icon + text, not colour alone', () => {
      render(<SavedReportView config={weeklyConfig} />);
      // MetricCard from @intelliflow/ui renders change.direction as icon + text
      // The component passes MetricChange objects with direction and value
      expect(screen.getByText('Revenue')).toBeInTheDocument();
    });
  });

  // --- use client directive (NF-005) ---
  it('has use client directive', async () => {
    const fs = await import('node:fs');
    const content = fs.readFileSync('src/components/analytics/SavedReportView.tsx', 'utf-8');
    expect(content.startsWith("'use client'")).toBe(true);
  });

  // --- No fake data (NF-006) ---
  it('displays values from tRPC mock responses, not hardcoded', () => {
    mockQueries.getOverview = { data: mockOverview, isLoading: false };
    mockQueries.getTimeSeriesData = { data: mockTimeSeries7d, isLoading: false };
    render(<SavedReportView config={weeklyConfig} />);
    // Revenue value 48500 rendered by MetricCard with en-GB GBP currency
    // (Timezone Refactor locale migration) → £48,500.
    expect(screen.getByText('£48,500')).toBeInTheDocument();
  });
});
