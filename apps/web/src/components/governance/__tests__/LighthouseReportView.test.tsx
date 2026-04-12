/**
 * LighthouseReportView Tests
 *
 * Tests for the Lighthouse quality report sub-page component.
 * @vitest-environment jsdom
 */

import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/governance/quality-reports/lighthouse',
}));

vi.mock('@/providers/TimezoneProvider', () => ({
  useTimezoneContext: () => ({ timezone: 'UTC' }),
}));

import LighthouseReportView from '../LighthouseReportView';

function createMockResponse(data: Record<string, unknown>, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(data),
  } as unknown as Response;
}

const mockLighthouseData = {
  success: true,
  data: {
    id: 'lighthouse',
    name: 'Lighthouse Performance',
    type: 'lighthouse' as const,
    status: 'passing' as const,
    score: 92,
    generatedAt: '2026-03-15T10:00:00Z',
    source: 'ci' as const,
    details: {
      performance: 95,
      accessibility: 92,
      bestPractices: 88,
      seo: 97,
    },
  },
};

describe('LighthouseReportView', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders loading state initially', () => {
    mockFetch.mockReturnValue(new Promise(() => {})); // never resolves
    render(<LighthouseReportView />);
    expect(screen.getByText('Loading report...')).toBeInTheDocument();
  });

  it('renders 4 Lighthouse category score cards with scores from API', async () => {
    mockFetch.mockResolvedValue(createMockResponse(mockLighthouseData));
    render(<LighthouseReportView />);

    await waitFor(() => {
      expect(screen.getByText('Performance')).toBeInTheDocument();
    });

    expect(screen.getByText('Accessibility')).toBeInTheDocument();
    expect(screen.getByText('Best Practices')).toBeInTheDocument();
    expect(screen.getByText('SEO')).toBeInTheDocument();

    // Score values should be displayed
    expect(screen.getByText('95')).toBeInTheDocument();
    expect(screen.getByText('92')).toBeInTheDocument();
    expect(screen.getByText('88')).toBeInTheDocument();
    expect(screen.getByText('97')).toBeInTheDocument();
  });

  it('applies correct color coding: >=90 emerald, >=70 amber, <70 red', async () => {
    const dataWithMixedScores = {
      success: true,
      data: {
        ...mockLighthouseData.data,
        details: {
          performance: 95, // emerald
          accessibility: 75, // amber
          bestPractices: 60, // red
          seo: 90, // emerald
        },
      },
    };
    mockFetch.mockResolvedValue(createMockResponse(dataWithMixedScores));
    render(<LighthouseReportView />);

    await waitFor(() => {
      expect(screen.getByText('Performance')).toBeInTheDocument();
    });

    // Check score containers have appropriate color classes
    const score95 = screen.getByText('95').closest('[data-score-card]');
    const score75 = screen.getByText('75').closest('[data-score-card]');
    const score60 = screen.getByText('60').closest('[data-score-card]');
    const score90 = screen.getByText('90').closest('[data-score-card]');

    expect(score95).toHaveClass('text-emerald-500');
    expect(score75).toHaveClass('text-amber-500');
    expect(score60).toHaveClass('text-red-500');
    expect(score90).toHaveClass('text-emerald-500');
  });

  it('tests score threshold boundaries: 89→amber, 90→emerald, 69→red, 70→amber', async () => {
    const boundaryData = {
      success: true,
      data: {
        ...mockLighthouseData.data,
        details: {
          performance: 90, // emerald (boundary)
          accessibility: 89, // amber (boundary)
          bestPractices: 70, // amber (boundary)
          seo: 69, // red (boundary)
        },
      },
    };
    mockFetch.mockResolvedValue(createMockResponse(boundaryData));
    render(<LighthouseReportView />);

    await waitFor(() => {
      expect(screen.getByText('Performance')).toBeInTheDocument();
    });

    const score90 = screen.getByText('90').closest('[data-score-card]');
    const score89 = screen.getByText('89').closest('[data-score-card]');
    const score70 = screen.getByText('70').closest('[data-score-card]');
    const score69 = screen.getByText('69').closest('[data-score-card]');

    expect(score90).toHaveClass('text-emerald-500');
    expect(score89).toHaveClass('text-amber-500');
    expect(score70).toHaveClass('text-amber-500');
    expect(score69).toHaveClass('text-red-500');
  });

  it('renders progress bars for each category', async () => {
    mockFetch.mockResolvedValue(createMockResponse(mockLighthouseData));
    render(<LighthouseReportView />);

    await waitFor(() => {
      expect(screen.getByText('Performance')).toBeInTheDocument();
    });

    const progressBars = screen.getAllByRole('progressbar');
    expect(progressBars.length).toBeGreaterThanOrEqual(4);
  });

  it('renders pass/fail indicators per category vs >=90 threshold', async () => {
    const mixedData = {
      success: true,
      data: {
        ...mockLighthouseData.data,
        details: {
          performance: 95,
          accessibility: 92,
          bestPractices: 88,
          seo: 97,
        },
      },
    };
    mockFetch.mockResolvedValue(createMockResponse(mixedData));
    render(<LighthouseReportView />);

    await waitFor(() => {
      expect(screen.getByText('Performance')).toBeInTheDocument();
    });

    // bestPractices=88 should show fail, others should show pass
    const passIndicators = screen.getAllByText('Pass');
    const failIndicators = screen.getAllByText('Fail');
    expect(passIndicators.length).toBe(3); // performance, accessibility, seo
    expect(failIndicators.length).toBe(1); // bestPractices
  });

  it('renders overall score summary card', async () => {
    mockFetch.mockResolvedValue(createMockResponse(mockLighthouseData));
    render(<LighthouseReportView />);

    await waitFor(() => {
      expect(screen.getByText(/overall/i)).toBeInTheDocument();
    });
  });

  it('renders PageHeader with correct breadcrumbs', async () => {
    mockFetch.mockResolvedValue(createMockResponse(mockLighthouseData));
    render(<LighthouseReportView />);

    await waitFor(() => {
      expect(screen.getByText('Lighthouse')).toBeInTheDocument();
    });

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Governance')).toBeInTheDocument();
    expect(screen.getByText('Quality Reports')).toBeInTheDocument();
  });

  it('breadcrumb "Quality Reports" links to /governance/quality-reports', async () => {
    mockFetch.mockResolvedValue(createMockResponse(mockLighthouseData));
    render(<LighthouseReportView />);

    await waitFor(() => {
      expect(screen.getByText('Quality Reports')).toBeInTheDocument();
    });

    const qrLink = screen.getByText('Quality Reports').closest('a');
    expect(qrLink).toHaveAttribute('href', '/governance/quality-reports');
  });

  it('renders placeholder state when API returns no data or isPlaceholder', async () => {
    const placeholderData = {
      success: true,
      data: {
        id: 'lighthouse',
        name: 'Lighthouse Performance',
        type: 'lighthouse',
        status: 'unknown',
        generatedAt: '2026-03-15T10:00:00Z',
        source: 'placeholder',
        isPlaceholder: true,
        placeholderReason: 'No Lighthouse report generated yet',
      },
    };
    mockFetch.mockResolvedValue(createMockResponse(placeholderData));
    render(<LighthouseReportView />);

    await waitFor(() => {
      expect(screen.getByText('No Lighthouse Report Available')).toBeInTheDocument();
    });
  });

  it('renders error state on fetch failure', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));
    render(<LighthouseReportView />);

    await waitFor(() => {
      expect(screen.getByText('Failed to Load Report')).toBeInTheDocument();
    });
  });

  it('has ARIA labels on score cards', async () => {
    mockFetch.mockResolvedValue(createMockResponse(mockLighthouseData));
    render(<LighthouseReportView />);

    await waitFor(() => {
      expect(screen.getByText('Performance')).toBeInTheDocument();
    });

    const cards = screen.getAllByRole('region');
    expect(cards.length).toBeGreaterThanOrEqual(4);
  });

  it('has proper heading structure for accessibility', async () => {
    mockFetch.mockResolvedValue(createMockResponse(mockLighthouseData));
    render(<LighthouseReportView />);

    await waitFor(() => {
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toHaveTextContent(/lighthouse/i);
    });
  });
});
