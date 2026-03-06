import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { mockSearchResponse } from '@/test/fixtures/rag-search-data';

// Mock the api module
const mockUseQuery = vi.fn();
vi.mock('@/lib/api', () => ({
  api: {
    intelligence: {
      ragSearch: {
        useQuery: (...args: unknown[]) => mockUseQuery(...args),
      },
    },
  },
}));

// Import after mock
import { useAISearch } from '../hooks';

describe('useAISearch', () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
  });

  it('calls api.intelligence.ragSearch.useQuery with correct params', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    renderHook(() =>
      useAISearch({
        query: 'test search',
        sources: ['leads'],
        searchType: 'hybrid',
        dateRange: '7d',
        limit: 20,
        offset: 0,
      })
    );

    expect(mockUseQuery).toHaveBeenCalledWith(
      {
        query: 'test search',
        sources: ['leads'],
        searchType: 'hybrid',
        dateRange: '7d',
        limit: 20,
        offset: 0,
        minRelevance: undefined,
      },
      { enabled: true }
    );
  });

  it('returns loading state when query is in progress', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useAISearch({ query: 'test' }));
    expect(result.current.isLoading).toBe(true);
  });

  it('returns data on successful response', () => {
    mockUseQuery.mockReturnValue({
      data: mockSearchResponse,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useAISearch({ query: 'test' }));
    expect(result.current.results).toEqual(mockSearchResponse.results);
    expect(result.current.totalResults).toBe(mockSearchResponse.totalResults);
    expect(result.current.avgRelevance).toBe(mockSearchResponse.avgRelevance);
    expect(result.current.executionTimeMs).toBe(mockSearchResponse.executionTimeMs);
    expect(result.current.sourceCounts).toEqual(mockSearchResponse.sourceCounts);
  });

  it('returns error on API failure', () => {
    const mockError = new Error('API error');
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: mockError,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useAISearch({ query: 'test' }));
    expect(result.current.error).toBe(mockError);
  });

  it('returns refetch function', () => {
    const refetchFn = vi.fn();
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      refetch: refetchFn,
    });

    const { result } = renderHook(() => useAISearch({ query: 'test' }));
    expect(result.current.refetch).toBe(refetchFn);
  });

  it('handles undefined data fields gracefully', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useAISearch({ query: 'test' }));
    expect(result.current.results).toEqual([]);
    expect(result.current.totalResults).toBe(0);
    expect(result.current.avgRelevance).toBe(0);
    expect(result.current.executionTimeMs).toBe(0);
    expect(result.current.sourceCounts).toEqual({});
  });

  it('passes filter changes to query', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    renderHook(() =>
      useAISearch({
        query: 'test',
        sources: ['documents', 'leads'],
        searchType: 'semantic',
        dateRange: '30d',
        minRelevance: 0.5,
      })
    );

    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: ['documents', 'leads'],
        searchType: 'semantic',
        dateRange: '30d',
        minRelevance: 0.5,
      }),
      { enabled: true }
    );
  });

  it('does not call query when query string is empty', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    renderHook(() => useAISearch({ query: '' }));

    expect(mockUseQuery).toHaveBeenCalledWith(expect.anything(), { enabled: false });
  });

  it('returns empty results array when data is undefined', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useAISearch({ query: 'test' }));
    expect(result.current.results).toEqual([]);
  });

  it('returns isLoading false when query is empty even if useQuery says loading', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useAISearch({ query: '' }));
    expect(result.current.isLoading).toBe(false);
  });
});
