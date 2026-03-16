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
      tRPC_p95: '12.5ms',
      database_p95: '3.2ms',
      all_targets_met: true,
      benchmarks: 42,
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
      expect(screen.getByText(/all targets met/i)).toBeInTheDocument();
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
        },
      },
    };
    mockFetch.mockResolvedValue(createMockResponse(failingData));
    render(<PerformanceReportView />);

    await waitFor(() => {
      expect(screen.getByText(/targets not met/i)).toBeInTheDocument();
    });
  });

  it('renders key metrics cards with tRPC p95 and Database p95 values', async () => {
    mockFetch.mockResolvedValue(createMockResponse(mockPerformanceData));
    render(<PerformanceReportView />);

    await waitFor(() => {
      expect(screen.getByText('12.5ms')).toBeInTheDocument();
    });

    expect(screen.getByText('3.2ms')).toBeInTheDocument();
    expect(screen.getByText(/trpc p95/i)).toBeInTheDocument();
    expect(screen.getByText(/database p95/i)).toBeInTheDocument();
  });

  it('shows threshold indicators: tRPC p95 <50ms, DB p95 <20ms', async () => {
    mockFetch.mockResolvedValue(createMockResponse(mockPerformanceData));
    render(<PerformanceReportView />);

    await waitFor(() => {
      expect(screen.getByText('12.5ms')).toBeInTheDocument();
    });

    // Both are within threshold, should show pass
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
          tRPC_p95: '75.0ms',
          database_p95: '25.0ms',
          all_targets_met: false,
          benchmarks: 42,
        },
      },
    };
    mockFetch.mockResolvedValue(createMockResponse(slowData));
    render(<PerformanceReportView />);

    await waitFor(() => {
      expect(screen.getByText('75.0ms')).toBeInTheDocument();
    });

    const failIndicators = screen.getAllByText('Fail');
    expect(failIndicators.length).toBeGreaterThanOrEqual(2);
  });

  it('renders benchmark count summary', async () => {
    mockFetch.mockResolvedValue(createMockResponse(mockPerformanceData));
    render(<PerformanceReportView />);

    await waitFor(() => {
      expect(screen.getByText('42')).toBeInTheDocument();
    });

    expect(screen.getByText('Benchmarks Executed')).toBeInTheDocument();
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
      expect(screen.getByText(/trpc p95/i)).toBeInTheDocument();
    });

    const cards = screen.getAllByRole('region');
    expect(cards.length).toBeGreaterThanOrEqual(2);
  });
});
