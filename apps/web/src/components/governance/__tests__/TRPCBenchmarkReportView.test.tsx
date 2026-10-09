/**
 * TRPCBenchmarkReportView Tests
 *
 * @vitest-environment jsdom
 */

import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/governance/quality-reports/trpc-benchmark',
}));

vi.mock('@/providers/TimezoneProvider', () => ({
  useTimezoneContext: () => ({ timezone: 'UTC' }),
}));

import TRPCBenchmarkReportView from '../TRPCBenchmarkReportView';

function createMockResponse(data: Record<string, unknown>) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
  } as unknown as Response;
}

const operations = [
  {
    operation: 'contact.list',
    iterations: 10,
    p50: 5,
    p95: 20,
    p99: 30,
    mean: 8,
    min: 1,
    max: 40,
    passed: true,
    error: null,
  },
  {
    operation: 'deal.slow',
    iterations: 10,
    p50: 40,
    p95: 90,
    p99: 120,
    mean: 50,
    min: 10,
    max: 150,
    passed: false,
    error: null,
  },
  {
    operation: 'lead.broken',
    iterations: 0,
    p50: null,
    p95: null,
    p99: null,
    mean: null,
    min: null,
    max: null,
    passed: false,
    error: 'boom',
  },
  {
    operation: 'task.nodata',
    iterations: 0,
    p50: null,
    p95: null,
    p99: null,
    mean: null,
    min: null,
    max: null,
    passed: false,
    error: null,
  },
];

function buildReport(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    data: {
      id: 'trpc-benchmark',
      name: 'tRPC Benchmark',
      type: 'trpc-benchmark',
      status: 'passing',
      score: 95,
      generatedAt: '2026-03-15T10:00:00Z',
      source: 'ci',
      details: {
        kpi: 'IFC-003',
        thresholds: { p50: 30, p95: 50, p99: 100 },
        totals: { total: 4, completed: 2, passed: 1, failedKpi: 1, errored: 1 },
        operations,
      },
      ...overrides,
    },
  };
}

describe('TRPCBenchmarkReportView', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows loading state first', () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<TRPCBenchmarkReportView />);
    expect(screen.getByText('Loading report...')).toBeInTheDocument();
  });

  it('renders a passing report with per-operation results and bar colours', async () => {
    mockFetch.mockResolvedValue(createMockResponse(buildReport()));
    const { container } = render(<TRPCBenchmarkReportView />);

    await waitFor(() => {
      expect(screen.getByText('All benchmarks pass IFC-003 KPI')).toBeInTheDocument();
    });
    expect(mockFetch).toHaveBeenCalledWith('/api/quality-reports?action=detail&id=trpc-benchmark');
    expect(screen.getByLabelText('Benchmark summary')).toBeInTheDocument();
    expect(screen.getByLabelText('Pass rate')).toBeInTheDocument();
    expect(screen.getAllByText('95%').length).toBeGreaterThan(0);
    expect(screen.getByText('contact.list')).toBeInTheDocument();
    expect(screen.getByText('Pass')).toBeInTheDocument();
    expect(screen.getByText('Fail')).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('N/A')).toBeInTheDocument();
    expect(container.querySelector('.bg-emerald-500')).not.toBeNull();
    expect(container.querySelector('.bg-red-500')).not.toBeNull();
    expect(container.querySelector('.bg-muted-foreground\\/40')).not.toBeNull();
  });

  it('renders a failing report with the regression heading and amber/red score', async () => {
    mockFetch.mockResolvedValue(createMockResponse(buildReport({ status: 'failing', score: 60 })));
    render(<TRPCBenchmarkReportView />);

    await waitFor(() => {
      expect(screen.getByText('Some benchmarks regressed')).toBeInTheDocument();
    });
    expect(screen.getAllByText('60%')[0].className).toContain('text-amber-600');
  });

  it('renders the no-benchmarks heading and low score styling for unknown status', async () => {
    mockFetch.mockResolvedValue(createMockResponse(buildReport({ status: 'unknown', score: 10 })));
    render(<TRPCBenchmarkReportView />);

    await waitFor(() => {
      expect(screen.getByText('No benchmarks completed')).toBeInTheDocument();
    });
    expect(screen.getAllByText('10%')[0].className).toContain('text-red-600');
  });

  it('shows an error card when the API reports failure', async () => {
    mockFetch.mockResolvedValue(createMockResponse({ success: false }));
    render(<TRPCBenchmarkReportView />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load report data')).toBeInTheDocument();
    });
  });

  it('shows an error card when fetch rejects', async () => {
    mockFetch.mockRejectedValue(new Error('network'));
    render(<TRPCBenchmarkReportView />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load tRPC benchmark report')).toBeInTheDocument();
    });
  });

  it('shows the placeholder card when no benchmark exists', async () => {
    mockFetch.mockResolvedValue(
      createMockResponse(
        buildReport({
          isPlaceholder: true,
          placeholderReason: 'Nothing generated',
          details: undefined,
        })
      )
    );
    render(<TRPCBenchmarkReportView />);

    await waitFor(() => {
      expect(screen.getByText('No tRPC Benchmark Available')).toBeInTheDocument();
    });
    expect(screen.getByText('Nothing generated')).toBeInTheDocument();
  });
});
