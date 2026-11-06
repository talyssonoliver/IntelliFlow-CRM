/**
 * @vitest-environment happy-dom
 *
 * After sign-in the browser goes to the `redirect` query parameter. It comes from
 * the URL, so only a path on this site may be used; anything else must land on the
 * hook's own default.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const h = vi.hoisted(() => ({ search: '' }));

// vitest.setup.ts replaces AuthContext globally; this file tests the real one.
vi.unmock('@/lib/auth/AuthContext');

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(h.search),
}));

import { useRedirectIfAuthenticated } from '../AuthContext';

/** Where the hook sent the browser. */
let navigatedTo: string | undefined;

beforeEach(() => {
  navigatedTo = undefined;
  vi.stubGlobal('location', {
    pathname: '/login',
    search: '',
    set href(value: string) {
      navigatedTo = value;
    },
    get href() {
      return navigatedTo ?? 'http://localhost/login';
    },
  });
  // The hook's "signed in with Google a moment ago" path navigates at once.
  localStorage.setItem('accessToken', 'token');
  sessionStorage.setItem('oauth_login_success', String(Date.now()));
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

function redirectFor(redirect: string, fallback = '/'): string | undefined {
  h.search = `redirect=${encodeURIComponent(redirect)}`;
  renderHook(() => useRedirectIfAuthenticated(fallback));
  return navigatedTo;
}

describe('useRedirectIfAuthenticated redirect target', () => {
  it('goes to a page on this site', () => {
    expect(redirectFor('/deals/abc123?tab=notes')).toBe('/deals/abc123?tab=notes');
  });

  it.each([
    ['a script URL', 'javascript:alert(document.domain)'],
    ['another site', 'https://evil.example.invalid/phish'],
    ['a protocol-relative URL', '//evil.example.invalid'],
    ['a backslash trick', '/\\evil.example.invalid'],
  ])('lands on the safe default for %s', (_label, redirect) => {
    expect(redirectFor(redirect, '/dashboard')).toBe('/dashboard');
  });

  it('uses the default when there is no redirect', () => {
    h.search = '';
    renderHook(() => useRedirectIfAuthenticated('/dashboard'));

    expect(navigatedTo).toBe('/dashboard');
  });
});
