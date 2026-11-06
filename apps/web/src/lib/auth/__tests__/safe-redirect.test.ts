/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearPostLoginRedirect,
  loginPathFor,
  readPostLoginRedirect,
  rememberPostLoginRedirect,
  safeRedirectPath,
} from '../safe-redirect';

describe('safeRedirectPath', () => {
  it.each([
    ['/dashboard', '/dashboard'],
    ['/deals/abc123?tab=notes', '/deals/abc123?tab=notes'],
    ['/leads#top', '/leads#top'],
  ])('keeps the same-site path %s', (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });

  it.each([
    ['another host', 'https://evil.example.invalid/x'],
    ['protocol-relative', '//evil.example.invalid'],
    ['backslash trick', '/\\evil.example.invalid'],
    ['script URL', 'javascript:alert(1)'],
    ['data URL', 'data:text/html,hi'],
    ['relative path', 'dashboard'],
    ['control character', '/a\nb'],
    ['dot segments that normalise off-site', '/.//evil.example.invalid'],
    ['parent segments that normalise off-site', '/a/..//evil.example.invalid'],
    ['sign-in page', '/login'],
    ['sign-in page with query', '/login?redirect=/x'],
    ['sign-up page', '/signup'],
    ['sign-out page', '/logout'],
    ['empty', ''],
    ['missing', null],
  ])('rejects %s', (_label, input) => {
    expect(safeRedirectPath(input)).toBeNull();
  });

  it('rejects an over-long value', () => {
    expect(safeRedirectPath(`/${'a'.repeat(2048)}`)).toBeNull();
  });
});

describe('loginPathFor', () => {
  it('carries the current page', () => {
    expect(loginPathFor('/deals/abc123?tab=notes')).toBe(
      '/login?redirect=%2Fdeals%2Fabc123%3Ftab%3Dnotes'
    );
  });

  it.each(['/', null, 'https://evil.example.invalid', '/login'])(
    'is plain /login for %s',
    (input) => {
      expect(loginPathFor(input)).toBe('/login');
    }
  );
});

describe('post-login redirect across Google sign-in', () => {
  beforeEach(() => sessionStorage.clear());

  it('remembers a safe path until cleared', () => {
    rememberPostLoginRedirect('/deals/abc123');

    expect(readPostLoginRedirect()).toBe('/deals/abc123');
    expect(readPostLoginRedirect()).toBe('/deals/abc123');
    clearPostLoginRedirect();
    expect(readPostLoginRedirect()).toBeNull();
  });

  it('forgets an old target when the new one is unsafe or missing', () => {
    rememberPostLoginRedirect('/deals/abc123');
    rememberPostLoginRedirect('//evil.example.invalid');

    expect(readPostLoginRedirect()).toBeNull();
  });

  it('checks a stored value again before using it', () => {
    sessionStorage.setItem('post_login_redirect', 'javascript:alert(1)');

    expect(readPostLoginRedirect()).toBeNull();
  });
});
