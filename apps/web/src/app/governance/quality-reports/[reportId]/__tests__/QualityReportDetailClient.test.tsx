/**
 * QualityReportDetailClient Tests
 *
 * @vitest-environment jsdom
 */

import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('next/navigation', () => ({
  useParams: () => ({ reportId: 'coverage' }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/governance/quality-reports/coverage',
}));

vi.mock('@/providers/TimezoneProvider', () => ({
  useTimezoneContext: () => ({ timezone: 'UTC' }),
}));

import QualityReportDetailClient from '../QualityReportDetailClient';

describe('QualityReportDetailClient', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches the report for the route id and renders its status', async () => {
    mockFetch.mockResolvedValue({
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            id: 'coverage',
            name: 'Test Coverage',
            type: 'coverage',
            status: 'passing',
            score: 92,
            generatedAt: '2026-03-15T10:00:00Z',
            source: 'ci',
          },
        }),
    } as unknown as Response);

    render(<QualityReportDetailClient />);

    await waitFor(() => {
      expect(screen.getByText('Passing')).toBeInTheDocument();
    });
    expect(mockFetch).toHaveBeenCalledWith('/api/quality-reports?action=detail&id=coverage');
  });

  it('logs and recovers when the fetch fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch.mockRejectedValue(new Error('network'));

    render(<QualityReportDetailClient />);

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith('Failed to fetch report:', expect.any(Error));
    });
    errorSpy.mockRestore();
  });
});
