import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the api module
const mockUseQuery = vi.fn();

vi.mock('@/lib/api', () => ({
  api: {
    intelligence: {
      getLeadScoringDashboard: {
        useQuery: (...args: unknown[]) => mockUseQuery(...args),
      },
    },
  },
}));

import { useLeadScoringDashboard } from '../hooks';
import type { LeadScoringFilters } from '../hooks';
import {
  mockLeadScoringDashboardData,
  mockLeadScoringStats,
  mockScoredLeads,
  mockLeadScoringTrends,
} from '@/test/fixtures/lead-scoring-data';

// We need renderHook from testing-library/react
import { renderHook } from '@testing-library/react';

describe('useLeadScoringDashboard', () => {
  const defaultFilters: LeadScoringFilters = {
    dateRange: '30d',
    page: 1,
    limit: 20,
  };

  const mockRefetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseQuery.mockReturnValue({
      data: mockLeadScoringDashboardData,
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });
  });

  it('TC-H1: calls tRPC with correct dateRange filter', () => {
    renderHook(() => useLeadScoringDashboard({ ...defaultFilters, dateRange: '7d' }));
    expect(mockUseQuery).toHaveBeenCalledWith(expect.objectContaining({ dateRange: '7d' }));
  });

  it('TC-H2: calls tRPC with correct pagination params (page, limit)', () => {
    renderHook(() => useLeadScoringDashboard({ ...defaultFilters, page: 3, limit: 50 }));
    expect(mockUseQuery).toHaveBeenCalledWith(expect.objectContaining({ page: 3, limit: 50 }));
  });

  it('TC-H3: transforms API data correctly', () => {
    const { result } = renderHook(() => useLeadScoringDashboard(defaultFilters));
    expect(result.current.stats).toEqual(mockLeadScoringStats);
    expect(result.current.scoredLeads).toEqual(mockScoredLeads);
    expect(result.current.trends).toEqual(mockLeadScoringTrends);
    expect(result.current.distribution).toEqual({ hot: 35, warm: 60, cold: 55 });
  });

  it('TC-H4: handles loading state', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: mockRefetch,
    });
    const { result } = renderHook(() => useLeadScoringDashboard(defaultFilters));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.stats).toBeNull();
    expect(result.current.scoredLeads).toEqual([]);
  });

  it('TC-H5: handles error state', () => {
    const mockError = { message: 'Network error' };
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: mockError,
      refetch: mockRefetch,
    });
    const { result } = renderHook(() => useLeadScoringDashboard(defaultFilters));
    expect(result.current.error).toBe(mockError);
    expect(result.current.stats).toBeNull();
  });

  it('TC-H6: handles empty results', () => {
    mockUseQuery.mockReturnValue({
      data: {
        stats: { total: 0, hot: 0, warm: 0, cold: 0, avgScore: 0, avgConfidence: 0 },
        distribution: { hot: 0, warm: 0, cold: 0 },
        scoredLeads: [],
        trends: [],
      },
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });
    const { result } = renderHook(() => useLeadScoringDashboard(defaultFilters));
    expect(result.current.stats?.total).toBe(0);
    expect(result.current.scoredLeads).toEqual([]);
    expect(result.current.trends).toEqual([]);
  });

  it('TC-H7: refetch triggers new query', () => {
    const { result } = renderHook(() => useLeadScoringDashboard(defaultFilters));
    result.current.refetch();
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('TC-H8: pagination parameter updates trigger re-fetch', () => {
    const { rerender } = renderHook(({ filters }) => useLeadScoringDashboard(filters), {
      initialProps: { filters: defaultFilters },
    });
    rerender({ filters: { ...defaultFilters, page: 2 } });
    // useQuery was called with updated page
    expect(mockUseQuery).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
  });
});
