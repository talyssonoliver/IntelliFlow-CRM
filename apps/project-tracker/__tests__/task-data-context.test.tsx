// @vitest-environment jsdom
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskDataProvider, useTaskData } from '../lib/TaskDataContext';

const unifiedData = {
  tasks: [
    {
      id: 'T-1',
      section: 'S',
      description: 'd',
      owner: 'o',
      dependencies: '',
      clean_dependencies: [],
      prerequisites: '',
      dod: '',
      status: 'Completed',
      kpis: '',
      sprint: 0,
      artifacts: '',
      validation: '',
    },
  ],
  unique_sections: ['S'],
  unique_sprints: [0],
  status_counts: { total: 1 },
  sections: [{ name: 'S', total: 1, done: 1, progress: 100 }],
  last_modified: '2026-01-01T00:00:00Z',
};

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
}

function Probe() {
  const { allTasks } = useTaskData();
  return <div data-testid="count">{allTasks.length}</div>;
}

describe('TaskDataProvider', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    fetchMock = vi.fn(async (url: string) => {
      if (String(url).startsWith('/api/unified-data')) {
        return { ok: true, json: async () => unifiedData };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const unifiedCalls = () =>
    fetchMock.mock.calls.filter(([url]) => String(url).startsWith('/api/unified-data')).length;

  it('loads data on mount', async () => {
    render(
      <TaskDataProvider>
        <Probe />
      </TaskDataProvider>
    );

    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));
    expect(unifiedCalls()).toBe(1);
  });

  it('reloads data when the SSE stream reports a CSV change', async () => {
    render(
      <TaskDataProvider>
        <Probe />
      </TaskDataProvider>
    );
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));
    const before = unifiedCalls();

    await act(async () => {
      FakeEventSource.instances[0].onmessage?.({ data: JSON.stringify({ source: 'csv' }) });
    });

    await waitFor(() => expect(unifiedCalls()).toBeGreaterThan(before));
  });

  it('ignores SSE events from other sources', async () => {
    render(
      <TaskDataProvider>
        <Probe />
      </TaskDataProvider>
    );
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));
    const before = unifiedCalls();

    await act(async () => {
      FakeEventSource.instances[0].onmessage?.({ data: JSON.stringify({ source: 'other' }) });
    });

    expect(unifiedCalls()).toBe(before);
  });

  describe('load failures', () => {
    function ErrorProbe() {
      const { error, refreshData, allTasks } = useTaskData();
      return (
        <div>
          <div data-testid="error">{error ?? ''}</div>
          <div data-testid="count">{allTasks.length}</div>
          <button onClick={() => refreshData()}>refresh</button>
        </div>
      );
    }

    it('reports a failed initial load through error and the console', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      fetchMock.mockRejectedValue(new Error('network down'));

      render(
        <TaskDataProvider>
          <ErrorProbe />
        </TaskDataProvider>
      );

      await waitFor(() => expect(screen.getByTestId('error').textContent).toBe('network down'));
      expect(consoleError).toHaveBeenCalledWith('Error loading data:', expect.any(Error));
    });

    it('uses a generic message for a non-Error rejection', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      fetchMock.mockRejectedValue('boom');

      render(
        <TaskDataProvider>
          <ErrorProbe />
        </TaskDataProvider>
      );

      await waitFor(() => expect(screen.getByTestId('error').textContent).toBe('Unknown error'));
    });

    it('reports a failed reload triggered by the SSE stream', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      render(
        <TaskDataProvider>
          <ErrorProbe />
        </TaskDataProvider>
      );
      await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));

      fetchMock.mockRejectedValue(new Error('stream reload failed'));
      await act(async () => {
        FakeEventSource.instances[0].onmessage?.({ data: JSON.stringify({ source: 'csv' }) });
      });

      await waitFor(() =>
        expect(screen.getByTestId('error').textContent).toBe('stream reload failed')
      );
      expect(consoleError).toHaveBeenCalledWith('Error loading data:', expect.any(Error));
    });

    it('refreshData resolves (never rejects) when the reload fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      let refresh: (() => Promise<void>) | undefined;
      function Capture() {
        refresh = useTaskData().refreshData;
        return null;
      }
      fetchMock.mockRejectedValue(new Error('still down'));

      render(
        <TaskDataProvider>
          <Capture />
        </TaskDataProvider>
      );

      await act(async () => {
        await expect(refresh!()).resolves.toBeUndefined();
      });
    });
  });
});
