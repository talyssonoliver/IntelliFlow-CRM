/**
 * PG-203 DSAR — the emailed link's fragment is read once and stripped (spec S4).
 */
import { describe, it, expect, vi } from 'vitest';
import { dueDateLabel, errorCode, parseDsarFragment, takeDsarFragment } from '../dsar-shared';

const TOKEN = 'A'.repeat(43);

function fakeWindow(hash: string) {
  return {
    location: { hash, pathname: '/dsar/smith-law/verify', search: '' },
    history: { state: { from: 'test' }, replaceState: vi.fn() },
  } as unknown as Window;
}

describe('parseDsarFragment', () => {
  it('reads the request id and token', () => {
    expect(parseDsarFragment(`#r=clhrequest000000000.${TOKEN}`)).toEqual({
      requestId: 'clhrequest000000000',
      token: TOKEN,
    });
  });

  it.each(['', '#', '#r=', `#r=short.${TOKEN}`, '#r=clhrequest000000000.short', `#x=id.${TOKEN}`])(
    'rejects %j',
    (hash) => {
      expect(parseDsarFragment(hash)).toBeNull();
    }
  );
});

describe('takeDsarFragment', () => {
  it('returns the link and strips the fragment from the address bar', () => {
    const win = fakeWindow(`#r=clhrequest000000000.${TOKEN}`);
    expect(takeDsarFragment(win)).toEqual({ requestId: 'clhrequest000000000', token: TOKEN });
    expect(win.history.replaceState).toHaveBeenCalledWith(
      { from: 'test' },
      '',
      '/dsar/smith-law/verify'
    );
  });

  it('strips even a malformed fragment, and leaves a clean URL alone', () => {
    const bad = fakeWindow('#r=nonsense');
    expect(takeDsarFragment(bad)).toBeNull();
    expect(bad.history.replaceState).toHaveBeenCalled();
    const clean = fakeWindow('');
    expect(takeDsarFragment(clean)).toBeNull();
    expect(clean.history.replaceState).not.toHaveBeenCalled();
  });
});

describe('helpers', () => {
  it('formats the due date as a calendar date', () => {
    expect(dueDateLabel('2026-11-22T10:00:00.000Z')).toBe('22 November 2026');
  });

  it('reads a tRPC error code', () => {
    expect(errorCode({ data: { code: 'NOT_FOUND' } })).toBe('NOT_FOUND');
    expect(errorCode(new Error('x'))).toBeUndefined();
    expect(errorCode(null)).toBeUndefined();
  });
});
