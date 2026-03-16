import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// ============================================
// Mocks
// ============================================

const mockOverview = {
  totalLeads: 100,
  leadDelta: 5,
  totalRevenue: 50000,
  revenueDelta: 10,
  openOpportunities: 25,
  openOpportunitiesDelta: 2,
  newContacts: 15,
  newContactsDelta: 3,
  winRate: 30,
  winRateDelta: 1,
  recentActivity: [],
};

const mockQueries: Record<string, { data: unknown; isLoading: boolean }> = {};

function resetQueries() {
  mockQueries.getOverview = { data: mockOverview, isLoading: false };
  mockQueries.getTimeSeriesData = { data: [], isLoading: false };
  mockQueries.getSalesMetrics = { data: null, isLoading: false };
  mockQueries.getConversionFunnel = { data: null, isLoading: false };
  mockQueries.growthTrends = { data: null, isLoading: false };
  mockQueries.trafficSources = { data: null, isLoading: false };
}

const mockExportFetch = vi.fn().mockResolvedValue({
  format: 'csv',
  data: 'metric,value\nRevenue,50000',
  filename: 'intelliflow-overview-2026-03-01-2026-03-16.csv',
});

vi.mock('@/lib/trpc', () => ({
  trpc: {
    analytics: {
      getOverview: { useQuery: (_input: unknown, opts?: { enabled?: boolean }) => opts?.enabled === false ? { data: undefined, isLoading: false } : mockQueries.getOverview },
      getTimeSeriesData: { useQuery: (_input: unknown, opts?: { enabled?: boolean }) => opts?.enabled === false ? { data: undefined, isLoading: false } : mockQueries.getTimeSeriesData },
      getSalesMetrics: { useQuery: (_input: unknown, opts?: { enabled?: boolean }) => opts?.enabled === false ? { data: undefined, isLoading: false } : mockQueries.getSalesMetrics },
      getConversionFunnel: { useQuery: (_input: unknown, opts?: { enabled?: boolean }) => opts?.enabled === false ? { data: undefined, isLoading: false } : mockQueries.getConversionFunnel },
      growthTrends: { useQuery: (_input: unknown, opts?: { enabled?: boolean }) => opts?.enabled === false ? { data: undefined, isLoading: false } : mockQueries.growthTrends },
      trafficSources: { useQuery: (_input: unknown, opts?: { enabled?: boolean }) => opts?.enabled === false ? { data: undefined, isLoading: false } : mockQueries.trafficSources },
    },
    useUtils: () => ({ analytics: { exportReport: { fetch: mockExportFetch } } }),
  },
}));

vi.mock('@/lib/auth/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));

vi.mock('@/hooks/useAnalyticsDateRange', () => ({
  useAnalyticsDateRange: () => ({
    startDate: '2026-03-01T00:00:00Z',
    endDate: '2026-03-16T00:00:00Z',
  }),
}));

vi.mock('@/providers/TimezoneProvider', () => ({
  useTimezoneContext: () => ({
    timezone: 'UTC',
    formatDate: (d: string | Date) => typeof d === 'string' ? d : d.toISOString(),
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

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Bar: () => <div />,
  LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Line: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
  PieChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Pie: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Cell: () => <div />,
}));

const { default: SavedReportView } = await import('@/components/analytics/SavedReportView');

const weeklyConfig = {
  reportType: 'weekly' as const,
  defaultPeriod: '7d' as const,
  title: 'Weekly Summary',
  description: 'Test description',
  breadcrumbLabel: 'Weekly Summary',
};

const monthlyConfig = {
  reportType: 'monthly' as const,
  defaultPeriod: '30d' as const,
  title: 'Monthly Revenue',
  description: 'Test description',
  breadcrumbLabel: 'Monthly Revenue',
};

const quarterlyConfig = {
  reportType: 'quarterly' as const,
  defaultPeriod: '90d' as const,
  title: 'Q4 Performance',
  description: 'Test description',
  breadcrumbLabel: 'Q4 Performance',
};

// ============================================
// Tests
// ============================================

describe('Saved Report Export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetQueries();
    // Re-set mock after clearAllMocks clears the implementation
    mockExportFetch.mockResolvedValue({
      format: 'csv',
      data: 'metric,value\nRevenue,50000',
      filename: 'intelliflow-overview-2026-03-01-2026-03-16.csv',
    });
  });

  it('export button renders dropdown with CSV and PDF options', async () => {
    render(<SavedReportView config={weeklyConfig} />);
    const exportBtn = screen.getByRole('button', { name: /export/i });
    await userEvent.click(exportBtn);
    expect(screen.getByText('Export CSV')).toBeInTheDocument();
    expect(screen.getByText('Export PDF')).toBeInTheDocument();
  });

  it('CSV export for weekly calls exportReport.fetch with reportType "overview"', async () => {
    render(<SavedReportView config={weeklyConfig} />);
    await userEvent.click(screen.getByRole('button', { name: /export/i }));
    await userEvent.click(screen.getByText('Export CSV'));
    expect(mockExportFetch).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'csv', reportType: 'overview' }),
    );
  });

  it('CSV export for monthly calls exportReport.fetch with reportType "sales"', async () => {
    render(<SavedReportView config={monthlyConfig} />);
    await userEvent.click(screen.getByRole('button', { name: /export/i }));
    await userEvent.click(screen.getByText('Export CSV'));
    expect(mockExportFetch).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'csv', reportType: 'sales' }),
    );
  });

  it('CSV export for quarterly calls exportReport.fetch with reportType "timeseries"', async () => {
    mockQueries.growthTrends = { data: [], isLoading: false };
    render(<SavedReportView config={quarterlyConfig} />);
    await userEvent.click(screen.getByRole('button', { name: /export/i }));
    await userEvent.click(screen.getByText('Export CSV'));
    expect(mockExportFetch).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'csv', reportType: 'timeseries' }),
    );
  });

  it('CSV export triggers downloadCSV with server-returned data', async () => {
    render(<SavedReportView config={weeklyConfig} />);
    await userEvent.click(screen.getByRole('button', { name: /export/i }));
    await userEvent.click(screen.getByText('Export CSV'));
    // Flush microtask queue — mockExportFetch is async
    await Promise.resolve();
    await Promise.resolve();
    expect(mockDownloadCSV).toHaveBeenCalledWith(
      'metric,value\nRevenue,50000',
      'intelliflow-overview-2026-03-01-2026-03-16.csv',
    );
  });

  it('PDF export for weekly calls exportToPDF with metrics sections', async () => {
    render(<SavedReportView config={weeklyConfig} />);
    await userEvent.click(screen.getByRole('button', { name: /export/i }));
    await userEvent.click(screen.getByText('Export PDF'));
    expect(mockExportToPDF).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Key Metrics', type: 'metrics' }),
      ]),
      expect.objectContaining({ title: 'Weekly Summary Report' }),
    );
  });

  it('PDF export for monthly calls exportToPDF with metrics + source distribution', async () => {
    mockQueries.trafficSources = {
      data: [{ name: 'Website', percentage: 45, color: 'bg-blue-500' }],
      isLoading: false,
    };
    render(<SavedReportView config={monthlyConfig} />);
    await userEvent.click(screen.getByRole('button', { name: /export/i }));
    await userEvent.click(screen.getByText('Export PDF'));
    expect(mockExportToPDF).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Key Metrics' }),
        expect.objectContaining({ title: 'Lead Sources', type: 'table' }),
      ]),
      expect.any(Object),
    );
  });

  it('PDF export for quarterly calls exportToPDF with metrics + growth trend', async () => {
    mockQueries.growthTrends = {
      data: [{ month: 'Jan', value: 30000 }, { month: 'Feb', value: 32000 }],
      isLoading: false,
    };
    render(<SavedReportView config={quarterlyConfig} />);
    await userEvent.click(screen.getByRole('button', { name: /export/i }));
    await userEvent.click(screen.getByText('Export PDF'));
    expect(mockExportToPDF).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Key Metrics' }),
        expect.objectContaining({ title: 'Growth Trend', type: 'table' }),
      ]),
      expect.any(Object),
    );
  });

  it('export dropdown closes after CSV selection', async () => {
    render(<SavedReportView config={weeklyConfig} />);
    await userEvent.click(screen.getByRole('button', { name: /export/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Export CSV'));
    await vi.waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  it('export dropdown closes after PDF selection', async () => {
    render(<SavedReportView config={weeklyConfig} />);
    await userEvent.click(screen.getByRole('button', { name: /export/i }));
    await userEvent.click(screen.getByText('Export PDF'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('export filename includes report type and date range', async () => {
    render(<SavedReportView config={weeklyConfig} />);
    await userEvent.click(screen.getByRole('button', { name: /export/i }));
    await userEvent.click(screen.getByText('Export CSV'));
    expect(mockExportFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        startDate: '2026-03-01T00:00:00Z',
        endDate: '2026-03-16T00:00:00Z',
      }),
    );
  });
});
