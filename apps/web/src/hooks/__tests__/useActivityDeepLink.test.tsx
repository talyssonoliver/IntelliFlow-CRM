import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useState } from 'react';

const nav = vi.hoisted(() => ({
  params: new URLSearchParams(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => nav.params,
}));

/** Puts the page at `/leads/abc?<query>#note` and points the router mock at the same params. */
function openAt(query: string) {
  const search = query ? '?' + query : '';
  window.history.pushState(null, '', '/leads/abc' + search + '#note');
  nav.params = new URLSearchParams(query);
}

import { useActivityDeepLink, isDeepLinkedActivity } from '../useActivityDeepLink';

type Tab = 'overview' | 'activity' | 'emails';

function usePage(initialTab: Tab) {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const { selectedActivityId } = useActivityDeepLink(
    activeTab,
    setActiveTab as (tab: 'activity') => void
  );
  return { activeTab, setActiveTab, selectedActivityId };
}

describe('useActivityDeepLink (UI-020)', () => {
  beforeEach(() => {
    openAt('');
    nav.replace.mockReset();
    vi.spyOn(window.history, 'replaceState').mockImplementation(nav.replace);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('switches to the activity tab once and removes the param from the URL', () => {
    openAt('activityId=lead_123&from=feed');
    const { result } = renderHook(() => usePage('overview'));

    expect(result.current.activeTab).toBe('activity');
    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(nav.replace).toHaveBeenCalledWith(null, '', '/leads/abc?from=feed#note');
  });

  it("passes null state so Next's patched replaceState syncs the router", () => {
    // App Router history entries carry __NA; passing that state back makes Next treat the
    // call as its own and skip the useSearchParams sync.
    window.history.pushState({ __NA: true }, '', '/leads/abc?activityId=lead_9');
    nav.params = new URLSearchParams('activityId=lead_9');
    renderHook(() => usePage('overview'));

    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(nav.replace.mock.calls[0][0]).toBeNull();
    expect(nav.replace.mock.calls[0][2]).toBe('/leads/abc');
  });

  it('drops the query string entirely when activityId was the only param', () => {
    openAt('activityId=lead_123');
    renderHook(() => usePage('overview'));

    expect(nav.replace).toHaveBeenCalledWith(null, '', '/leads/abc#note');
  });

  it('lets the user change tab afterwards without snapping back to activity', () => {
    nav.params = new URLSearchParams('activityId=lead_123');
    const { result, rerender } = renderHook(() => usePage('overview'));
    expect(result.current.activeTab).toBe('activity');

    // Even before the URL update lands, the same param is not acted on twice.
    act(() => result.current.setActiveTab('emails'));
    rerender();
    expect(result.current.activeTab).toBe('emails');

    // After the URL update, the param is gone and the tab stays put.
    nav.params = new URLSearchParams();
    rerender();
    act(() => result.current.setActiveTab('overview'));
    rerender();
    expect(result.current.activeTab).toBe('overview');
    expect(nav.replace).toHaveBeenCalledTimes(1);
  });

  it('keeps the highlight target after the param is removed from the URL', () => {
    nav.params = new URLSearchParams('activityId=lead_123');
    const { result, rerender } = renderHook(() => usePage('overview'));

    nav.params = new URLSearchParams();
    rerender();

    expect(result.current.selectedActivityId).toEqual({ prefixed: 'lead_123', raw: '123' });
    expect(isDeepLinkedActivity('123', result.current.selectedActivityId)).toBe(true);
    expect(isDeepLinkedActivity('lead_123', result.current.selectedActivityId)).toBe(true);
    expect(isDeepLinkedActivity('999', result.current.selectedActivityId)).toBe(false);
  });

  it('acts on a new link to another activity, and on the same one again after it was cleared', () => {
    nav.params = new URLSearchParams('activityId=lead_1');
    const { result, rerender } = renderHook(() => usePage('overview'));
    nav.params = new URLSearchParams();
    rerender();
    act(() => result.current.setActiveTab('emails'));
    rerender();

    nav.params = new URLSearchParams('activityId=contact_2');
    rerender();
    expect(result.current.activeTab).toBe('activity');
    expect(result.current.selectedActivityId).toEqual({ prefixed: 'contact_2', raw: '2' });

    nav.params = new URLSearchParams();
    rerender();
    act(() => result.current.setActiveTab('emails'));
    rerender();

    nav.params = new URLSearchParams('activityId=contact_2');
    rerender();
    expect(result.current.activeTab).toBe('activity');
    expect(nav.replace).toHaveBeenCalledTimes(3);
  });

  it('does nothing without the param', () => {
    const { result } = renderHook(() => usePage('overview'));

    expect(result.current.activeTab).toBe('overview');
    expect(result.current.selectedActivityId).toBeNull();
    expect(nav.replace).not.toHaveBeenCalled();
    expect(isDeepLinkedActivity('123', null)).toBe(false);
  });

  it('keeps an unprefixed id as both forms', () => {
    nav.params = new URLSearchParams('activityId=plain-uuid');
    const { result } = renderHook(() => usePage('activity'));

    expect(result.current.selectedActivityId).toEqual({
      prefixed: 'plain-uuid',
      raw: 'plain-uuid',
    });
  });
});
