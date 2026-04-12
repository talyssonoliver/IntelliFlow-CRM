/**
 * experiments/hooks unit tests (PG-149 coverage)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// Mock the api module
vi.mock('@/lib/api', () => ({
  api: {
    experiment: {
      list: {
        useQuery: vi.fn(),
      },
      getResults: {
        useQuery: vi.fn(),
      },
      start: { useMutation: vi.fn() },
      pause: { useMutation: vi.fn() },
      complete: { useMutation: vi.fn() },
      archive: { useMutation: vi.fn() },
    },
  },
}));

import { api } from '@/lib/api';
const mockApi = vi.mocked(api);

import { useExperimentsDashboard, useExperimentResults, useExperimentActions } from '../hooks';

describe('useExperimentsDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns experiments from list query', () => {
    const mockData = [{ id: '1', name: 'Test' }];
    (mockApi.experiment.list.useQuery as any).mockReturnValue({
      data: mockData,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useExperimentsDashboard());

    expect(result.current.experiments).toEqual(mockData);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.refetch).toBe('function');
  });

  it('returns empty array when data is undefined', () => {
    (mockApi.experiment.list.useQuery as any).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useExperimentsDashboard());

    expect(result.current.experiments).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  it('passes retry option to useQuery', () => {
    (mockApi.experiment.list.useQuery as any).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    renderHook(() => useExperimentsDashboard());

    expect(mockApi.experiment.list.useQuery).toHaveBeenCalledWith(undefined, {
      retry: 1,
    });
  });
});

describe('useExperimentResults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns query result for experiment ID', () => {
    const mockResult = { data: { pValue: 0.03 }, isLoading: false, error: null };
    (mockApi.experiment.getResults.useQuery as any).mockReturnValue(mockResult);

    const { result } = renderHook(() => useExperimentResults('exp-1'));

    expect(result.current).toEqual(mockResult);
    expect(mockApi.experiment.getResults.useQuery).toHaveBeenCalledWith(
      { experimentId: 'exp-1' },
      { enabled: true }
    );
  });

  it('disables query when experimentId is empty', () => {
    (mockApi.experiment.getResults.useQuery as any).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    });

    renderHook(() => useExperimentResults(''));

    expect(mockApi.experiment.getResults.useQuery).toHaveBeenCalledWith(
      { experimentId: '' },
      { enabled: false }
    );
  });
});

describe('useExperimentActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns all four mutation hooks', () => {
    const mockMutation = { mutate: vi.fn(), isLoading: false };
    (mockApi.experiment.start.useMutation as any).mockReturnValue(mockMutation);
    (mockApi.experiment.pause.useMutation as any).mockReturnValue(mockMutation);
    (mockApi.experiment.complete.useMutation as any).mockReturnValue(mockMutation);
    (mockApi.experiment.archive.useMutation as any).mockReturnValue(mockMutation);

    const { result } = renderHook(() => useExperimentActions());

    expect(result.current.startMutation).toEqual(mockMutation);
    expect(result.current.pauseMutation).toEqual(mockMutation);
    expect(result.current.completeMutation).toEqual(mockMutation);
    expect(result.current.archiveMutation).toEqual(mockMutation);
  });
});
