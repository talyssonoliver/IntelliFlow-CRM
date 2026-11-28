import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useUtcDay, utcDayOf } from '../useUtcDay';

describe('useUtcDay (codex 27/11: the Stalled cutoff froze on the day the tab opened)', () => {
  afterEach(() => vi.useRealTimers());

  it('reads the UTC date', () => {
    expect(utcDayOf(new Date('2026-11-27T23:59:00Z'))).toBe('2026-11-27');
  });

  it('turns over at UTC midnight', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-27T23:59:00Z'));
    const { result } = renderHook(() => useUtcDay());
    expect(result.current).toBe('2026-11-27');
    act(() => {
      vi.advanceTimersByTime(2 * 60 * 1000);
    });
    expect(result.current).toBe('2026-11-28');
  });

  it('catches up when a hidden tab comes back on a later day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-27T10:00:00Z'));
    const { result } = renderHook(() => useUtcDay());
    vi.setSystemTime(new Date('2026-11-29T08:00:00Z'));
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current).toBe('2026-11-29');
  });

  it('catches up when midnight passes between the first render and the effect (codex 27/11)', () => {
    const real = Date;
    let calls = 0;
    // The first Date read (initial state) is before midnight, every later one after it.
    vi.spyOn(globalThis, 'Date').mockImplementation(function (...args: unknown[]) {
      if (args.length) return new real(...(args as [string]));
      calls += 1;
      return new real(calls === 1 ? '2026-11-27T23:59:59.999Z' : '2026-11-28T00:00:00.010Z');
    } as unknown as DateConstructor);
    const { result, unmount } = renderHook(() => useUtcDay());
    vi.restoreAllMocks();
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(result.current).toBe('2026-11-28');
    unmount();
  });
});
