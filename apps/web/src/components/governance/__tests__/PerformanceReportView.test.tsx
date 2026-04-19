/**
 * PerformanceReportView Tests
 *
 * Tests for the Performance quality report sub-page component.
 * @vitest-environment jsdom
 */

import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/governance/quality-reports/performance',
}));

vi.mock('@/providers/TimezoneProvider', () => ({
  useTimezoneContext: () => ({ timezone: 'UTC' }),
}));

import PerformanceReportView from '../PerformanceReportView';

function createMockResponse(data: Record<string, unknown>, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(data),
  } as unknown as Response;
}

// Fixture schema follows the new PerformanceReportView detail model
// (see PerformanceReportView.tsx §§ Overall Health Banner / Executive KPI Grid /
// Response Time Breakdown): p50_median, p95_median, p95_avg, p95_target,
// endpoints_{tested,passing,failing}, violations, load_test_*.
const mockPerformanceData = {
  success: true,
  data: {
    id: 'performance',
    name: 'Performance Benchmarks',
    type: 'performance' as const,
    status: 'passing' as const,
    score: 95,
    generatedAt: '2026-03-15T10:00:00Z',
    source: 'ci' as const,
    details: {
      p50_median: '12.5ms',
      p95_median: '28.3ms',
      p95_avg: '22.1ms',
      p99_median: '55.0ms',
      p95_target: '100ms',
      all_targets_met: true,
      endpoints_tested: 42,
      endpoints_passing: 42,
      endpoints_failing: 0,
      violations: [],
      load_test_rps: 150,
      load_test_vus: 50,
      load_test_duration: '60s',
    },
  },
};

describe('PerformanceReportView', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders loading state initially', () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<PerformanceReportView />);
    expect(screen.getByText('Loading report...')).toBeInTheDocument();
  });

  it('renders overall status card with pass badge when all_targets_met=true', async () => {
    mockFetch.mockResolvedValue(createMockResponse(mockPerformanceData));
    render(<PerformanceReportView />);

    await waitFor(() => {
      // Overall Health Banner copy was updated in PerformanceReportView.tsx:466-468.
      expect(screen.getByText(/all performance targets met/i)).toBeInTheDocument();
    });
  });

  it('renders overall status card with fail badge when all_targets_met=false', async () => {
    const failingData = {
      success: true,
      data: {
        ...mockPerformanceData.data,
        status: 'failing',
        details: {
          ...mockPerformanceData.data.details,
          all_targets_met: false,
          endpoints_failing: 5,
          endpoints_passing: 37,
          violations: ['p95 budget exceeded'],
        },
      },
    };
    mockFetch.mockResolvedValue(createMockResponse(failingData));
    render(<PerformanceReportView />);

    await waitFor(() => {
      expect(screen.getByText(/performance budget exceeded/i)).toBeInTheDocument();
    });
  });

  it('renders key metrics cards with p50 and p95 median values', async () => {
    mockFetch.mockResolvedValue(createMockResponse(mockPerformanceData));
    render(<PerformanceReportView />);

    await waitFor(() => {
      // p50_median renders in both the KPI MetricCard and the Response Time
      // Breakdown table — use getAllByText to tolerate both occurrences.
      expect(screen.getAllByText('12.5ms').length).toBeGreaterThan(0);
    });

    expect(screen.getAllByText('28.3ms').length).toBeGreaterThan(0);
    // MetricCard labels are "p50 Median" / "p95 Median"; MetricCard appears
    // twice (KPI grid) plus once again in the Response Time Breakdown table.
    expect(screen.getAllByText(/p50 median/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/p95 median/i).length).toBeGreaterThan(0);
  });

  it('shows threshold indicators: p50 <50ms, p95 <100ms', async () => {
    mockFetch.mockResolvedValue(createMockResponse(mockPerformanceData));
    render(<PerformanceReportView />);

    await waitFor(() => {
      // p50_median renders in both the KPI MetricCard and the Response Time
      // Breakdown table — use getAllByText to tolerate both occurrences.
      expect(screen.getAllByText('12.5ms').length).toBeGreaterThan(0);
    });

    // Overall banner + both MetricCards + endpoints card all render a
    // PassFailPill on the happy path.
    const passIndicators = screen.getAllByText('Pass');
    expect(passIndicators.length).toBeGreaterThanOrEqual(2);
  });

  it('shows fail for metrics exceeding thresholds', async () => {
    const slowData = {
      success: true,
      data: {
        ...mockPerformanceData.data,
        status: 'failing',
        details: {
          ...mockPerformanceData.data.details,
          p50_median: '75.0ms', // > P50_TARGET_MS (50)
          p95_median: '250.0ms', // > P95_TARGET_MS (100)
          all_targets_met: false,
          endpoints_failing: 5,
          endpoints_passing: 37,
          violations: ['p95 budget exceeded'],
        },
      },
    };
    mockFetch.mockResolvedValue(createMockResponse(slowData));
    render(<PerformanceReportView />);

    await waitFor(() => {
      expect(screen.getAllByText('75.0ms').length).toBeGreaterThan(0);
    });

    const failIndicators = screen.getAllByText('Fail');
    expect(failIndicators.length).toBeGreaterThanOrEqual(2);
  });

  it('renders endpoint count summary', async () => {
    mockFetch.mockResolvedValue(createMockResponse(mockPerformanceData));
    render(<PerformanceReportView />);

    // Overall banner copy: "{passing} of {tested} endpoints passing".
    await waitFor(() => {
      expect(screen.getByText(/42 of 42 endpoints passing/i)).toBeInTheDocument();
    });

    // Endpoints KPI card also renders "42/42" + "100% passing".
    expect(screen.getByText('42/42')).toBeInTheDocument();
    expect(screen.getByText(/100% passing/i)).toBeInTheDocument();
  });

  it('renders PageHeader with correct breadcrumbs', async () => {
    mockFetch.mockResolvedValue(createMockResponse(mockPerformanceData));
    render(<PerformanceReportView />);

    await waitFor(() => {
      expect(screen.getByText('Performance')).toBeInTheDocument();
    });

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Governance')).toBeInTheDocument();
    expect(screen.getByText('Quality Reports')).toBeInTheDocument();
  });

  it('breadcrumb "Quality Reports" links to /governance/quality-reports', async () => {
    mockFetch.mockResolvedValue(createMockResponse(mockPerformanceData));
    render(<PerformanceReportView />);

    await waitFor(() => {
      expect(screen.getByText('Quality Reports')).toBeInTheDocument();
    });

    const qrLink = screen.getByText('Quality Reports').closest('a');
    expect(qrLink).toHaveAttribute('href', '/governance/quality-reports');
  });

  it('renders placeholder state when no data', async () => {
    const placeholderData = {
      success: true,
      data: {
        id: 'performance',
        name: 'Performance Benchmarks',
        type: 'performance',
        status: 'unknown',
        generatedAt: '2026-03-15T10:00:00Z',
        source: 'placeholder',
        isPlaceholder: true,
        placeholderReason: 'No performance report generated yet',
      },
    };
    mockFetch.mockResolvedValue(createMockResponse(placeholderData));
    render(<PerformanceReportView />);

    await waitFor(() => {
      expect(screen.getByText('No Performance Report Available')).toBeInTheDocument();
    });
  });

  it('renders error state on fetch failure', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));
    render(<PerformanceReportView />);

    await waitFor(() => {
      expect(screen.getByText('Failed to Load Report')).toBeInTheDocument();
    });
  });

  it('has ARIA labels on metric cards', async () => {
    mockFetch.mockResolvedValue(createMockResponse(mockPerformanceData));
    render(<PerformanceReportView />);

    await waitFor(() => {
      expect(screen.getAllByText(/p50 median/i).length).toBeGreaterThan(0);
    });

    // Cards now expose explicit aria-labels — use them to verify ARIA coverage
    // instead of relying on an implicit "region" role.
    expect(screen.getByLabelText(/overall performance status/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/p50 median response time/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/p95 median response time/i)).toBeInTheDocument();
  });
});
