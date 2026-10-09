/**
 * Quality reports page - summary fetch failure handling.
 *
 * @vitest-environment jsdom
 */

import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/providers/TimezoneProvider', () => ({
  useTimezoneContext: () => ({ timezone: 'UTC' }),
}));

vi.mock('@/components/governance/test-runner-modal', () => ({
  TestRunnerModal: () => null,
}));

import QualityReportsPage from '../page';

describe('QualityReportsPage summary fetch', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('logs the failure and leaves the loading state when the summary fetch rejects', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch.mockRejectedValue(new Error('offline'));
    render(<QualityReportsPage />);

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith('Failed to fetch quality reports:', expect.any(Error));
    });
    expect(screen.getByText('Quality Reports', { selector: 'h1' })).toBeInTheDocument();
    errorSpy.mockRestore();
  });
});
