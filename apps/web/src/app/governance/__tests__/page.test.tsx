/**
 * Governance landing page - ADR stats fetch handling.
 *
 * @vitest-environment jsdom
 */

import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/providers/TimezoneProvider', () => ({
  useTimezoneContext: () => ({ timezone: 'UTC' }),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    analytics: {
      recentActivity: { useQuery: () => ({ data: [] }) },
    },
  },
}));

import GovernancePage from '../page';

describe('GovernancePage ADR stats', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the page and requests ADR stats', async () => {
    mockFetch.mockResolvedValue({
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            total: 3,
            byStatus: { Accepted: 2 },
            validationSummary: { valid: 3, withErrors: 0, withWarnings: 0 },
          },
        }),
    });
    render(<GovernancePage />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/adr?action=stats');
    });
    expect(screen.getByText('Governance')).toBeInTheDocument();
  });

  it('logs the failure and still renders when the stats fetch rejects', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch.mockRejectedValue(new Error('offline'));
    render(<GovernancePage />);

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith('Failed to fetch ADR stats:', expect.any(Error));
    });
    expect(screen.getByText('Governance')).toBeInTheDocument();
    errorSpy.mockRestore();
  });
});
