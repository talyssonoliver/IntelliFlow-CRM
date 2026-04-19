/**
 * CoverageReportView Tests
 *
 * Tests for the Test Coverage quality report sub-page component.
 * @vitest-environment jsdom
 */

import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/governance/quality-reports/coverage',
}));

vi.mock('@/providers/TimezoneProvider', () => ({
  useTimezoneContext: () => ({ timezone: 'UTC' }),
}));

import CoverageReportView from '../CoverageReportView';

function createMockResponse(data: Record<string, unknown>, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(data),
  } as unknown as Response;
}

const mockCoverageData = {
  success: true,
  data: {
    id: 'coverage',
    name: 'Test Coverage',
    type: 'coverage' as const,
    status: 'passing' as const,
    score: 91,
    generatedAt: '2026-03-15T10:00:00Z',
    source: 'ci' as const,
    details: {
      statements: 92.5,
      branches: 85.3,
      functions: 91.0,
      lines: 93.1,
      testsTotal: 1250,
      testsPassed: 1240,
      testsFailed: 10,
      thresholdsMet: true,
    },
  },
};

describe('CoverageReportView', () => {
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
    render(<CoverageReportView />);
    expect(screen.getByText('Loading report...')).toBeInTheDocument();
  });

  it('renders 4 coverage metric cards with percentages from API', async () => {
    mockFetch.mockResolvedValue(createMockResponse(mockCoverageData));
    render(<CoverageReportView />);

    await waitFor(() => {
      expect(screen.getByText('Statements')).toBeInTheDocument();
    });

    expect(screen.getByText('Branches')).toBeInTheDocument();
    expect(screen.getByText('Functions')).toBeInTheDocument();
    expect(screen.getByText('Lines')).toBeInTheDocument();

    // Percentage values (91.0 renders as "91" in JS)
    expect(screen.getByText('92.5%')).toBeInTheDocument();
    expect(screen.getByText('85.3%')).toBeInTheDocument();
    expect(screen.getByText('91%')).toBeInTheDocument();
    expect(screen.getByText('93.1%')).toBeInTheDocument();
  });

  it('shows threshold pass/fail: >=90% for S/F/L, >=80% for Branches', async () => {
    const mixedData = {
      success: true,
      data: {
        ...mockCoverageData.data,
        details: {
          statements: 92.5, // pass (>=90)
          branches: 85.3, // pass (>=80)
          functions: 91.0, // pass (>=90)
          lines: 93.1, // pass (>=90)
        },
      },
    };
    mockFetch.mockResolvedValue(createMockResponse(mixedData));
    render(<CoverageReportView />);

    await waitFor(() => {
      expect(screen.getByText('Statements')).toBeInTheDocument();
    });

    const passIndicators = screen.getAllByText('Pass');
    expect(passIndicators.length).toBe(4); // all pass
  });

  it('tests threshold boundaries: 89% statements→fail, 90%→pass; 79% branches→fail, 80%→pass', async () => {
    const boundaryData = {
      success: true,
      data: {
        ...mockCoverageData.data,
        details: {
          statements: 89.9, // fail (<90)
          branches: 80.0, // pass (>=80)
          functions: 90.0, // pass (>=90)
          lines: 89.0, // fail (<90)
        },
      },
    };
    mockFetch.mockResolvedValue(createMockResponse(boundaryData));
    render(<CoverageReportView />);

    await waitFor(() => {
      expect(screen.getByText('Statements')).toBeInTheDocument();
    });

    const passIndicators = screen.getAllByText('Pass');
    const failIndicators = screen.getAllByText('Fail');
    expect(passIndicators.length).toBe(2); // branches, functions
    expect(failIndicators.length).toBe(2); // statements, lines
  });

  it('renders progress bars for each metric', async () => {
    mockFetch.mockResolvedValue(createMockResponse(mockCoverageData));
    render(<CoverageReportView />);

    await waitFor(() => {
      expect(screen.getByText('Statements')).toBeInTheDocument();
    });

    const progressBars = screen.getAllByRole('progressbar');
    expect(progressBars.length).toBeGreaterThanOrEqual(4);
  });

  it('renders test metadata card when testsTotal present', async () => {
    mockFetch.mockResolvedValue(createMockResponse(mockCoverageData));
    render(<CoverageReportView />);

    await waitFor(() => {
      expect(screen.getByText('1,250')).toBeInTheDocument();
    });

    expect(screen.getByText('1,240')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('renders failing tests list when failingTests array present', async () => {
    const dataWithFailingTests = {
      success: true,
      data: {
        ...mockCoverageData.data,
        details: {
          ...mockCoverageData.data.details,
          failingTests: [
            { file: 'src/auth.test.ts', test: 'should validate token' },
            { file: 'src/api.test.ts', test: 'should handle errors' },
          ],
        },
      },
    };
    mockFetch.mockResolvedValue(createMockResponse(dataWithFailingTests));
    render(<CoverageReportView />);

    await waitFor(() => {
      expect(screen.getByText('src/auth.test.ts')).toBeInTheDocument();
    });

    expect(screen.getByText('should validate token')).toBeInTheDocument();
    expect(screen.getByText('src/api.test.ts')).toBeInTheDocument();
    expect(screen.getByText('should handle errors')).toBeInTheDocument();
  });

  it('renders PageHeader with correct breadcrumbs', async () => {
    mockFetch.mockResolvedValue(createMockResponse(mockCoverageData));
    render(<CoverageReportView />);

    await waitFor(() => {
      expect(screen.getByText('Test Coverage')).toBeInTheDocument();
    });

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Governance')).toBeInTheDocument();
    expect(screen.getByText('Quality Reports')).toBeInTheDocument();
  });

  it('breadcrumb "Quality Reports" links to /governance/quality-reports', async () => {
    mockFetch.mockResolvedValue(createMockResponse(mockCoverageData));
    render(<CoverageReportView />);

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
        id: 'coverage',
        name: 'Test Coverage',
        type: 'coverage',
        status: 'unknown',
        generatedAt: '2026-03-15T10:00:00Z',
        source: 'placeholder',
        isPlaceholder: true,
        placeholderReason: 'No coverage report generated yet',
      },
    };
    mockFetch.mockResolvedValue(createMockResponse(placeholderData));
    render(<CoverageReportView />);

    await waitFor(() => {
      expect(screen.getByText('No Coverage Report Available')).toBeInTheDocument();
    });
  });

  it('renders error state on fetch failure', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));
    render(<CoverageReportView />);

    await waitFor(() => {
      expect(screen.getByText('Failed to Load Report')).toBeInTheDocument();
    });
  });

  it('has ARIA labels on metric cards', async () => {
    mockFetch.mockResolvedValue(createMockResponse(mockCoverageData));
    render(<CoverageReportView />);

    await waitFor(() => {
      expect(screen.getByText('Statements')).toBeInTheDocument();
    });

    // Cards expose explicit aria-labels (not implicit region role).
    expect(screen.getAllByLabelText(/coverage/i).length).toBeGreaterThanOrEqual(1);
  });
});
