/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { pushRecentLeadView, useLeadRecentViews } from '../use-lead-recent-views';

const KEY = 'intelliflow:leads:recent-views';

describe('useLeadRecentViews / pushRecentLeadView', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('empty on first mount', () => {
    const { result } = renderHook(() => useLeadRecentViews());
    expect(result.current.recentIds).toEqual([]);
  });

  it('push adds id to the front of the list', () => {
    const { result } = renderHook(() => useLeadRecentViews());
    act(() => result.current.push('lead-1'));
    expect(result.current.recentIds).toEqual(['lead-1']);
    act(() => result.current.push('lead-2'));
    expect(result.current.recentIds).toEqual(['lead-2', 'lead-1']);
  });

  it('pushing an existing id promotes it to the front (no duplicates)', () => {
    const { result } = renderHook(() => useLeadRecentViews());
    act(() => {
      result.current.push('a');
      result.current.push('b');
      result.current.push('a');
    });
    expect(result.current.recentIds).toEqual(['a', 'b']);
  });

  it('caps the list to 20 entries', () => {
    const { result } = renderHook(() => useLeadRecentViews());
    act(() => {
      for (let i = 0; i < 25; i++) {
        result.current.push(`id-${i}`);
      }
    });
    expect(result.current.recentIds.length).toBe(20);
    expect(result.current.recentIds[0]).toBe('id-24');
  });

  it('clear() wipes localStorage and returns empty list', () => {
    const { result } = renderHook(() => useLeadRecentViews());
    act(() => result.current.push('x'));
    act(() => result.current.clear());
    expect(result.current.recentIds).toEqual([]);
    expect(window.localStorage.getItem(KEY)).toBe('[]');
  });

  it('pushRecentLeadView(empty string) is a no-op', () => {
    pushRecentLeadView('');
    expect(window.localStorage.getItem(KEY)).toBe(null);
  });

  it('malformed localStorage payload is ignored (empty list returned)', () => {
    window.localStorage.setItem(KEY, 'not-json');
    const { result } = renderHook(() => useLeadRecentViews());
    expect(result.current.recentIds).toEqual([]);
  });

  it('non-array payload is ignored', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ a: 1 }));
    const { result } = renderHook(() => useLeadRecentViews());
    expect(result.current.recentIds).toEqual([]);
  });

  it('non-string entries are filtered out', () => {
    window.localStorage.setItem(KEY, JSON.stringify(['a', 42, null, 'b']));
    const { result } = renderHook(() => useLeadRecentViews());
    expect(result.current.recentIds).toEqual(['a', 'b']);
  });

  it('localStorage quota error on write is swallowed (no throw)', () => {
    const original = window.localStorage.setItem;
    window.localStorage.setItem = vi.fn(() => {
      throw new Error('QuotaExceeded');
    });
    expect(() => pushRecentLeadView('x')).not.toThrow();
    window.localStorage.setItem = original;
  });
});
