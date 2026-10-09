/**
 * TestRunnerModal render tests - closing the modal while a run is in progress.
 *
 * @vitest-environment jsdom
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestRunnerModal } from '../test-runner-modal';

describe('TestRunnerModal (rendered)', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let closeSource: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    mockFetch = vi.fn().mockImplementation(async (_url: string, init?: { method?: string }) => ({
      json: async () =>
        init?.method === 'DELETE'
          ? { success: true }
          : { success: true, runId: 'run-1', eventsUrl: '/api/events/run-1' },
    }));
    vi.stubGlobal('fetch', mockFetch);

    closeSource = vi.fn();
    class FakeEventSource {
      onmessage: unknown = null;
      onerror: unknown = null;
      close = closeSource;
    }
    vi.stubGlobal('EventSource', FakeEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('cancels the active run (DELETE) and closes when dismissed mid-run', async () => {
    const onClose = vi.fn();
    render(<TestRunnerModal isOpen onClose={onClose} onComplete={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /start tests/i }));

    await waitFor(() => {
      expect(screen.getByText('Running Tests...')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText(/Starting .* test run/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Close modal' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/quality-reports/test-run/run-1', {
        method: 'DELETE',
      });
    });
    await waitFor(() => {
      expect(closeSource).toHaveBeenCalled();
    });
  });
  it('shows an error and logs when the server-side cancel fails, still stopping the stream', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch.mockImplementation(async (_url: string, init?: { method?: string }) => {
      if (init?.method === 'DELETE') throw new Error('cancel failed');
      return {
        json: async () => ({ success: true, runId: 'run-1', eventsUrl: '/api/events/run-1' }),
      };
    });
    render(<TestRunnerModal isOpen onClose={vi.fn()} onComplete={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /start tests/i }));
    await waitFor(() => {
      expect(screen.getByText(/Starting .* test run/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel Test Run' }));

    await waitFor(() => {
      expect(screen.getByText('Failed to cancel test run on the server')).toBeInTheDocument();
    });
    expect(errorSpy).toHaveBeenCalledWith('Failed to cancel test run:', expect.any(Error));
    expect(closeSource).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
