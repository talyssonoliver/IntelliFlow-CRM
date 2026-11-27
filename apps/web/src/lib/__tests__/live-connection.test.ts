// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { isLiveConnected, setLiveConnected, useLiveConnection } from '../live-connection';

describe('live connection (MVP-004)', () => {
  it('starts closed and follows the connection', () => {
    setLiveConnected(false);
    const { result } = renderHook(() => useLiveConnection());
    expect(result.current).toBe(false);
    act(() => setLiveConnected(true));
    expect(result.current).toBe(true);
    expect(isLiveConnected()).toBe(true);
    act(() => setLiveConnected(false));
    expect(result.current).toBe(false);
  });
});
