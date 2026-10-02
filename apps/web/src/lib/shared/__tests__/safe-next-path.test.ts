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
  ])('falls back to /dashboard for %s', (input) => {
    expect(safeNextPath(input as string | null | undefined)).toBe('/dashboard');
  });

  it('uses a custom fallback', () => {
    expect(safeNextPath('//x', '/')).toBe('/');
  });
});
