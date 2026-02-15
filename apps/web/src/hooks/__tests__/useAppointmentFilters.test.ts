import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppointmentFilters } from '../useAppointmentFilters';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/calendar',
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('useAppointmentFilters', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('returns default filter state', () => {
    const { result } = renderHook(() => useAppointmentFilters());
    expect(result.current.filters.search).toBe('');
    expect(result.current.filters.status).toBe('');
    expect(result.current.filters.appointmentType).toBe('');
    expect(result.current.filters.page).toBe(1);
    expect(result.current.filters.limit).toBe(20);
    expect(result.current.filters.viewMode).toBe('calendar');
    expect(result.current.filters.calendarView).toBe('month');
  });

  it('updates search filter', () => {
    const { result } = renderHook(() => useAppointmentFilters());
    act(() => {
      result.current.setSearch('hearing');
    });
    expect(result.current.filters.search).toBe('hearing');
  });

  it('resets page when search changes', () => {
    const { result } = renderHook(() => useAppointmentFilters());
    act(() => {
      result.current.setPage(3);
    });
    expect(result.current.filters.page).toBe(3);
    act(() => {
      result.current.setSearch('test');
    });
    expect(result.current.filters.page).toBe(1);
  });

  it('updates status filter', () => {
    const { result } = renderHook(() => useAppointmentFilters());
    act(() => {
      result.current.setStatusFilter('CONFIRMED');
    });
    expect(result.current.filters.status).toBe('CONFIRMED');
  });

  it('updates type filter', () => {
    const { result } = renderHook(() => useAppointmentFilters());
    act(() => {
      result.current.setTypeFilter('HEARING');
    });
    expect(result.current.filters.appointmentType).toBe('HEARING');
  });

  it('updates view mode and persists to localStorage', () => {
    const { result } = renderHook(() => useAppointmentFilters());
    act(() => {
      result.current.setViewMode('list');
    });
    expect(result.current.filters.viewMode).toBe('list');
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'appointment-viewMode',
      JSON.stringify('list')
    );
  });

  it('updates calendar view and persists to localStorage', () => {
    const { result } = renderHook(() => useAppointmentFilters());
    act(() => {
      result.current.setCalendarView('week');
    });
    expect(result.current.filters.calendarView).toBe('week');
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'appointment-calendarView',
      JSON.stringify('week')
    );
  });

  it('updates page', () => {
    const { result } = renderHook(() => useAppointmentFilters());
    act(() => {
      result.current.setPage(5);
    });
    expect(result.current.filters.page).toBe(5);
  });

  it('generates queryParams with undefined for empty values', () => {
    const { result } = renderHook(() => useAppointmentFilters());
    const params = result.current.queryParams;
    expect(params.search).toBeUndefined();
    expect(params.status).toBeUndefined();
    expect(params.page).toBe(1);
    expect(params.limit).toBe(20);
  });

  it('includes non-empty values in queryParams', () => {
    const { result } = renderHook(() => useAppointmentFilters());
    act(() => {
      result.current.setSearch('test');
      result.current.setStatusFilter('CONFIRMED');
    });
    expect(result.current.queryParams).toHaveProperty('search', 'test');
    expect(result.current.queryParams).toHaveProperty('status', 'CONFIRMED');
  });
});
