/**
 * Feedback Analytics Page Tests - IFC-068
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// Mock Recharts
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: Readonly<{ children: React.ReactNode }>) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  BarChart: ({ children }: Readonly<{ children: React.ReactNode }>) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Bar: () => <div data-testid="bar" />,
  LineChart: ({ children }: Readonly<{ children: React.ReactNode }>) => (
    <div data-testid="line-chart">{children}</div>
  ),
  Line: () => <div data-testid="line" />,
  PieChart: ({ children }: Readonly<{ children: React.ReactNode }>) => (
    <div data-testid="pie-chart">{children}</div>
  ),
  Pie: ({ children }: Readonly<{ children: React.ReactNode }>) => (
    <div data-testid="pie">{children}</div>
  ),
  Cell: () => <div data-testid="cell" />,
  AreaChart: ({ children }: Readonly<{ children: React.ReactNode }>) => (
    <div data-testid="area-chart">{children}</div>
  ),
  Area: () => <div data-testid="area" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
}));

// Mock hooks
const mockDashboardData = {
  data: undefined as unknown,
  isLoading: false,
};

vi.mock('@/lib/feedback-survey/hooks', () => ({
  useFeedbackSurveyDashboard: () => mockDashboardData,
}));

// The send dialog and settings card talk to tRPC; they have their own tests.
vi.mock('@/components/feedback-analytics/SendSurveyDialog', () => ({
  SendSurveyDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="send-dialog">Send survey dialog</div> : null,
}));
vi.mock('@/components/feedback-analytics/AutoSurveySettings', () => ({
  AutoSurveySettings: () => <div data-testid="auto-survey-settings" />,
}));

// Mock export utilities
vi.mock('@/lib/export/csv', () => ({
  exportToCSV: vi.fn(),
}));

// Import after mocks
const { default: FeedbackAnalyticsPage } = await import('../(list)/feedback/page');

describe('FeedbackAnalyticsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockDashboardData.data = undefined;
    mockDashboardData.isLoading = false;
  });

  it('renders loading skeleton during data fetch', () => {
    mockDashboardData.isLoading = true;
    mockDashboardData.data = undefined;

    render(<FeedbackAnalyticsPage />);

    expect(screen.getByText('Feedback Analytics')).toBeInTheDocument();
  });

  it('renders "No responses yet" when hasData: false', () => {
    mockDashboardData.data = {
      hasData: false,
      nps: null,
      csat: null,
      ces: null,
      sentiment: null,
      trends: [],
      responseRates: [],
    };

    render(<FeedbackAnalyticsPage />);

    expect(screen.getByText('No survey responses yet')).toBeInTheDocument();
  });

  it('shows the shared hero with breadcrumbs, and the empty state offers "Send a survey"', () => {
    mockDashboardData.data = {
      hasData: false,
      nps: null,
      csat: null,
      ces: null,
      sentiment: null,
      trends: [],
      responseRates: [],
    };

    render(<FeedbackAnalyticsPage />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Feedback Analytics' })
    ).toBeInTheDocument();
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Analytics').length).toBeGreaterThan(0);
    expect(screen.getByTestId('auto-survey-settings')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Send a survey' }));
    expect(screen.getByTestId('send-dialog')).toBeInTheDocument();
  });

  it('renders NPS gauge when data is available', async () => {
    mockDashboardData.data = {
      hasData: true,
      nps: { score: 42, distribution: { promoters: 5, passives: 3, detractors: 2, total: 10 } },
      csat: null,
      ces: null,
      sentiment: { positive: 6, neutral: 2, negative: 2, total: 10 },
      trends: [{ period: '2025-01', nps: 40, csat: null, ces: null, responseCount: 10 }],
      responseRates: [],
    };

    render(<FeedbackAnalyticsPage />);

    // Wait for the dashboard to render its data (the default 1 s window elapses under load).
    await waitFor(
      () => {
        expect(screen.getByText('Net Promoter Score')).toBeInTheDocument();
      },
      { timeout: 10_000 }
    );
    expect(await screen.findByText('+42', undefined, { timeout: 10_000 })).toBeInTheDocument();
  });

  it('renders period selector (7d/30d/90d/ytd) and is interactive', () => {
    mockDashboardData.data = {
      hasData: true,
      nps: null,
      csat: null,
      ces: null,
      sentiment: null,
      trends: [],
      responseRates: [],
    };

    render(<FeedbackAnalyticsPage />);

    const picker = screen.getByLabelText('Period') as HTMLSelectElement;
    expect(Array.from(picker.options).map((o) => o.value)).toEqual(['7d', '30d', '90d', 'ytd']);
    expect(picker.value).toBe('90d');

    fireEvent.change(picker, { target: { value: '30d' } });
    expect(picker.value).toBe('30d');
  });

  it('renders survey type tabs (NPS/CSAT/CES/CUSTOM/All)', () => {
    mockDashboardData.data = {
      hasData: true,
      nps: null,
      csat: null,
      ces: null,
      sentiment: null,
      trends: [],
      responseRates: [],
    };

    render(<FeedbackAnalyticsPage />);

    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('NPS')).toBeInTheDocument();
    expect(screen.getByText('CSAT')).toBeInTheDocument();
    expect(screen.getByText('CES')).toBeInTheDocument();
    expect(screen.getByText('CUSTOM')).toBeInTheDocument();
  });

  it('renders export button', () => {
    mockDashboardData.data = {
      hasData: true,
      nps: null,
      csat: null,
      ces: null,
      sentiment: null,
      trends: [],
      responseRates: [],
    };

    render(<FeedbackAnalyticsPage />);

    expect(screen.getAllByText('Export CSV').length).toBeGreaterThan(0);
  });

  it('renders CSAT and CES scores when available', () => {
    mockDashboardData.data = {
      hasData: true,
      nps: null,
      csat: { score: 80, totalResponses: 25 },
      ces: { score: 4.2, totalResponses: 15 },
      sentiment: null,
      trends: [],
      responseRates: [],
    };

    render(<FeedbackAnalyticsPage />);

    expect(screen.getByText('CSAT Score')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText('CES Score')).toBeInTheDocument();
    expect(screen.getByText('4.2')).toBeInTheDocument();
  });

  it('renders response rates when available', () => {
    mockDashboardData.data = {
      hasData: true,
      nps: null,
      csat: null,
      ces: null,
      sentiment: null,
      trends: [],
      responseRates: [{ type: 'NPS', sent: 100, responded: 75, rate: 75 }],
    };

    render(<FeedbackAnalyticsPage />);

    expect(screen.getByText('Response Rates')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
  });
});
