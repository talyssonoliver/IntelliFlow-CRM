import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// Mock the tRPC api module
const mockUseQuery = vi.fn();

vi.mock('@/lib/api', () => ({
  api: {
    intelligence: {
      getSentimentDashboard: {
        useQuery: (...args: unknown[]) => mockUseQuery(...args),
      },
    },
  },
}));

import { useSentimentDashboard } from '../hooks';
import type { SentimentFilters } from '../hooks';
import {
  mockSentimentStats,
  mockSentimentAnalyses,
  mockSentimentTrends,
  mockSentimentDistribution,
} from '@/test/fixtures/sentiment-data';

const defaultFilters: SentimentFilters = {
  entityType: 'all',
  dateRange: '30d',
  page: 1,
  limit: 20,
};

describe('useSentimentDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls tRPC useQuery with correct filter params', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true, error: null, refetch: vi.fn() });
    renderHook(() => useSentimentDashboard(defaultFilters));

    expect(mockUseQuery).toHaveBeenCalledWith({
      entityType: 'all',
      dateRange: '30d',
      page: 1,
      limit: 20,
    });
  });

  it('returns loading state when query is loading', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true, error: null, refetch: vi.fn() });
    const { result } = renderHook(() => useSentimentDashboard(defaultFilters));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.stats).toBeNull();
    expect(result.current.recentAnalyses).toEqual([]);
    expect(result.current.trends).toEqual([]);
    expect(result.current.distribution).toBeNull();
  });

  it('returns data when query succeeds', () => {
    const dashboardData = {
      stats: mockSentimentStats,
      distribution: mockSentimentDistribution,
      recentAnalyses: mockSentimentAnalyses,
      trends: mockSentimentTrends,
    };
    mockUseQuery.mockReturnValue({ data: dashboardData, isLoading: false, error: null, refetch: vi.fn() });
    const { result } = renderHook(() => useSentimentDashboard(defaultFilters));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.stats).toEqual(mockSentimentStats);
    expect(result.current.recentAnalyses).toEqual(mockSentimentAnalyses);
    expect(result.current.trends).toEqual(mockSentimentTrends);
    expect(result.current.distribution).toEqual(mockSentimentDistribution);
  });

  it('returns error when query fails', () => {
    const error = new Error('Network error');
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false, error, refetch: vi.fn() });
    const { result } = renderHook(() => useSentimentDashboard(defaultFilters));

    expect(result.current.error).toBe(error);
    expect(result.current.stats).toBeNull();
  });

  it('returns refetch function', () => {
    const refetch = vi.fn();
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false, error: null, refetch });
    const { result } = renderHook(() => useSentimentDashboard(defaultFilters));

    expect(result.current.refetch).toBe(refetch);
  });

  it('passes different filter values to useQuery', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false, error: null, refetch: vi.fn() });
    const filters: SentimentFilters = {
      entityType: 'lead',
      dateRange: '7d',
      page: 2,
      limit: 50,
    };
    renderHook(() => useSentimentDashboard(filters));

    expect(mockUseQuery).toHaveBeenCalledWith({
      entityType: 'lead',
      dateRange: '7d',
      page: 2,
      limit: 50,
    });
  });

  it('handles undefined data fields gracefully', () => {
    mockUseQuery.mockReturnValue({ data: {}, isLoading: false, error: null, refetch: vi.fn() });
    const { result } = renderHook(() => useSentimentDashboard(defaultFilters));

    expect(result.current.stats).toBeNull();
    expect(result.current.recentAnalyses).toEqual([]);
    expect(result.current.trends).toEqual([]);
    expect(result.current.distribution).toBeNull();
  });
});
