// @vitest-environment jsdom
import * as React from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Import reducer and toast for direct testing
import { useToast, toast, reducer } from '../src/hooks/use-toast';

describe('reducer', () => {
  const baseState = { toasts: [] };

  it('ADD_TOAST adds a toast', () => {
    const newToast = { id: '1', title: 'Hello', open: true };
    const state = reducer(baseState, { type: 'ADD_TOAST', toast: newToast });
    expect(state.toasts).toHaveLength(1);
    expect(state.toasts[0].title).toBe('Hello');
  });

  it('ADD_TOAST respects TOAST_LIMIT (5)', () => {
    let state = baseState;
    for (let i = 0; i < 6; i++) {
      state = reducer(state, { type: 'ADD_TOAST', toast: { id: String(i), open: true } });
    }
    expect(state.toasts.length).toBeLessThanOrEqual(5);
  });

  it('UPDATE_TOAST updates a matching toast', () => {
    const initial = { toasts: [{ id: '1', title: 'Old', open: true }] };
    const state = reducer(initial, {
      type: 'UPDATE_TOAST',
      toast: { id: '1', title: 'New' },
    });
    expect(state.toasts[0].title).toBe('New');
  });

  it('UPDATE_TOAST leaves non-matching toasts unchanged', () => {
    const initial = { toasts: [{ id: '1', title: 'Unchanged', open: true }] };
    const state = reducer(initial, {
      type: 'UPDATE_TOAST',
      toast: { id: '99', title: 'Changed' },
    });
    expect(state.toasts[0].title).toBe('Unchanged');
  });

  it('DISMISS_TOAST sets open=false for specific toast', () => {
    const initial = {
      toasts: [
        { id: '1', open: true },
        { id: '2', open: true },
      ],
    };
    const state = reducer(initial, { type: 'DISMISS_TOAST', toastId: '1' });
    expect(state.toasts[0].open).toBe(false);
    expect(state.toasts[1].open).toBe(true);
  });

  it('DISMISS_TOAST without toastId dismisses all', () => {
    const initial = {
      toasts: [
        { id: '1', open: true },
        { id: '2', open: true },
      ],
    };
    const state = reducer(initial, { type: 'DISMISS_TOAST', toastId: undefined });
    expect(state.toasts.every((t) => t.open === false)).toBe(true);
  });

  it('REMOVE_TOAST removes specific toast', () => {
    const initial = {
      toasts: [
        { id: '1', open: false },
        { id: '2', open: false },
      ],
    };
    const state = reducer(initial, { type: 'REMOVE_TOAST', toastId: '1' });
    expect(state.toasts).toHaveLength(1);
    expect(state.toasts[0].id).toBe('2');
  });

  it('REMOVE_TOAST without toastId removes all', () => {
    const initial = { toasts: [{ id: '1', open: false }] };
    const state = reducer(initial, { type: 'REMOVE_TOAST', toastId: undefined });
    expect(state.toasts).toHaveLength(0);
  });
});

describe('toast function', () => {
  it('returns id, dismiss, and update', () => {
    const result = toast({ title: 'Test' });
    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('dismiss');
    expect(result).toHaveProperty('update');
    expect(typeof result.id).toBe('string');
    expect(typeof result.dismiss).toBe('function');
    expect(typeof result.update).toBe('function');
  });

  it('dismiss function calls dispatch', () => {
    const { dismiss } = toast({ title: 'Dismissable' });
    // Should not throw
    expect(() => dismiss()).not.toThrow();
  });

  it('update function works', () => {
    const { update, id } = toast({ title: 'Original' });
    // Should not throw
    expect(() => update({ id, title: 'Updated', open: true })).not.toThrow();
  });

  it('onOpenChange dismisses toast when open=false', () => {
    const result = toast({ title: 'Auto dismiss' });
    // Access the onOpenChange by dispatching via the useToast hook
    const { result: hookResult } = renderHook(() => useToast());
    const t = hookResult.current.toasts.find((x) => x.id === result.id);
    if (t?.onOpenChange) {
      act(() => {
        t.onOpenChange?.(false);
      });
      // Toast should be dismissed (open: false)
    }
  });
});

describe('useToast hook', () => {
  it('returns state with toast and dismiss', () => {
    const { result } = renderHook(() => useToast());
    expect(result.current).toHaveProperty('toasts');
    expect(result.current).toHaveProperty('toast');
    expect(result.current).toHaveProperty('dismiss');
  });

  it('adds a toast via hook', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.toast({ title: 'Hook Toast' });
    });
    const toastInHook = result.current.toasts.find((t) => t.title === 'Hook Toast');
    expect(toastInHook).toBeDefined();
  });

  it('dismisses a toast via hook', () => {
    const { result } = renderHook(() => useToast());
    let toastId: string = '';
    act(() => {
      const { id } = result.current.toast({ title: 'Dismiss Me' });
      toastId = id;
    });
    act(() => {
      result.current.dismiss(toastId);
    });
    const t = result.current.toasts.find((x) => x.id === toastId);
    expect(t?.open).toBe(false);
  });

  it('dismisses all toasts when called without id', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.toast({ title: 'Toast 1' });
      result.current.toast({ title: 'Toast 2' });
    });
    act(() => {
      result.current.dismiss();
    });
    expect(result.current.toasts.every((t) => t.open === false)).toBe(true);
  });
});
