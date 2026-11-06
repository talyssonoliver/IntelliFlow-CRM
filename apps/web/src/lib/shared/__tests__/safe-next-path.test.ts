import { describe, it, expect } from 'vitest';
import { safeNextPath } from '../safe-next-path';

describe('safeNextPath', () => {
  it.each([
    ['/dashboard', '/dashboard'],
    ['/leads?tab=new', '/leads?tab=new'],
    ['/a/b#frag', '/a/b#frag'],
    ['/', '/'],
  ])('keeps same-origin path %s', (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    null,
    undefined,
    '',
    'dashboard',
    '//evil.example.net',
    '/\\evil.example.net',
    'https://evil.example.net',
    'javascript:alert(1)',
    '/ok\nLocation: x',
    // Dot segments that normalise into a protocol-relative URL.
    '/.//evil.example.net',
    '/a/..//evil.example.net',
    '/a/../..//evil.example.net',
    '/.\\/evil.example.net',
  ])('falls back to /dashboard for %s', (input) => {
    expect(safeNextPath(input as string | null | undefined)).toBe('/dashboard');
  });

  it('keeps a path whose dot segments stay on this site', () => {
    expect(safeNextPath('/deals/./abc123/../abc123?tab=notes')).toBe('/deals/abc123?tab=notes');
  });

  it('keeps an encoded slash, which stays a path on this site', () => {
    expect(safeNextPath('/./%2F/evil.example.net')).toBe('/%2F/evil.example.net');
  });

  it('uses a custom fallback', () => {
    expect(safeNextPath('//x', '/')).toBe('/');
  });
});
