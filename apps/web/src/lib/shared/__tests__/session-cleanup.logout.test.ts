import { beforeEach, describe, expect, it } from 'vitest';
import { clearAuthCookies, clearLocalStorage } from '../session-cleanup';

describe('clearLocalStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("removes the Supabase client's persisted session, even when keeping preferences", () => {
    localStorage.setItem('sb-project-auth-token', 'session');
    localStorage.setItem('theme', 'dark');

    const cleared = clearLocalStorage(true);

    expect(localStorage.getItem('sb-project-auth-token')).toBeNull();
    expect(cleared).toContain('sb-project-auth-token');
    expect(localStorage.getItem('theme')).toBe('dark');
  });
});

describe('clearAuthCookies', () => {
  it('removes the access token cookie the server renders the portal from', () => {
    document.cookie = 'accessToken=a-token; path=/';
    document.cookie = 'cookie_consent=yes; path=/';

    const cleared = clearAuthCookies();

    expect(cleared).toContain('accessToken');
    expect(document.cookie).not.toContain('accessToken');
    expect(document.cookie).toContain('cookie_consent=yes');
    document.cookie = 'cookie_consent=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });
});
