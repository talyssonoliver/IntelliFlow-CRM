/**
 * ADR registry page - fetch failure handling and clipboard feedback.
 *
 * @vitest-environment jsdom
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import ADRRegistryPage from '../page';

const adr = {
  id: 'ADR-001',
  title: 'Use tRPC',
  status: 'Accepted',
  date: '2026-01-01',
  deciders: 'Team',
  technicalStory: 'IFC-1',
  filePath: 'docs/adr/001.md',
  relatedADRs: [],
  sprint: '1',
};

function ok(data: unknown) {
  return { json: () => Promise.resolve({ success: true, data }) };
}

describe('ADRRegistryPage', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows an error message when the ADR list fetch rejects', async () => {
    mockFetch.mockRejectedValue(new Error('offline'));
    render(<ADRRegistryPage />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to fetch ADRs/)).toBeInTheDocument();
    });
  });

  it('logs stats failures without breaking the list', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('action=stats')) throw new Error('stats down');
      return ok([adr]);
    });
    render(<ADRRegistryPage />);

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith('Failed to fetch stats:', expect.any(Error));
    });
    await waitFor(() => {
      expect(screen.getByText(/Use tRPC/)).toBeInTheDocument();
    });
    errorSpy.mockRestore();
  });

  it('logs index and graph failures when those tabs are opened', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/api/adr/index') || url.includes('action=graph')) {
        throw new Error('tab down');
      }
      return ok(url.includes('action=stats') ? null : []);
    });
    render(<ADRRegistryPage />);

    fireEvent.click(screen.getByRole('button', { name: /Index/ }));
    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith('Failed to fetch index:', expect.any(Error));
    });

    fireEvent.click(screen.getByRole('button', { name: /Graph/ }));
    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith('Failed to fetch graph:', expect.any(Error));
    });
    errorSpy.mockRestore();
  });

  it('refetches the list from Search and from Clear', async () => {
    mockFetch.mockImplementation(async (url: string) =>
      ok(url.includes('action=stats') ? null : [adr])
    );
    render(<ADRRegistryPage />);
    await screen.findByText(/Use tRPC/);

    fireEvent.change(screen.getByPlaceholderText(/Search ADRs/), { target: { value: 'trpc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/adr?action=search&q=trpc');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Search ADRs/)).toHaveValue('');
    });
  });

  describe('copy to clipboard', () => {
    function mockIndexTab() {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes('/api/adr/index')) return ok({ content: '# Index' });
        return ok(url.includes('action=stats') ? null : []);
      });
    }

    it('confirms when the clipboard write succeeds', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('navigator', { clipboard: { writeText } });
      mockIndexTab();
      render(<ADRRegistryPage />);

      fireEvent.click(screen.getByRole('button', { name: /Index/ }));
      fireEvent.click(await screen.findByRole('button', { name: /Copy/ }));

      expect(await screen.findByText('Copied to clipboard')).toBeInTheDocument();
      expect(writeText).toHaveBeenCalledWith('# Index');
    });

    it('shows an error instead of a false success when the clipboard is denied', async () => {
      const writeText = vi.fn().mockRejectedValue(new Error('denied'));
      vi.stubGlobal('navigator', { clipboard: { writeText } });
      mockIndexTab();
      render(<ADRRegistryPage />);

      fireEvent.click(screen.getByRole('button', { name: /Index/ }));
      fireEvent.click(await screen.findByRole('button', { name: /Copy/ }));

      expect(await screen.findByText(/Failed to copy to clipboard/)).toBeInTheDocument();
      expect(screen.queryByText('Copied to clipboard')).not.toBeInTheDocument();
    });
  });
});
