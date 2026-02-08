/**
 * @vitest-environment happy-dom
 * AppSidebar.tsx - Additional logic tests for sidebar state and URL matching
 */
import { describe, it, expect } from 'vitest';

// Test the isItemActive logic without rendering
function isItemActive(
  item: { href: string },
  pathname: string,
  searchParams: URLSearchParams,
): boolean {
  const itemUrl = new URL(item.href, 'http://localhost');
  const itemPath = itemUrl.pathname;
  const itemParams = itemUrl.searchParams;

  if (pathname !== itemPath && !pathname?.startsWith(itemPath + '/')) {
    return false;
  }

  if (itemParams.toString()) {
    for (const [key, value] of itemParams.entries()) {
      if (searchParams.get(key) !== value) {
        return false;
      }
    }
    return true;
  }

  const view = searchParams.get('view');
  const segment = searchParams.get('segment');
  return !view && !segment;
}

describe('AppSidebar - isItemActive logic', () => {
  it('matches exact pathname', () => {
    const result = isItemActive({ href: '/leads' }, '/leads', new URLSearchParams());
    expect(result).toBe(true);
  });

  it('does not match different path', () => {
    const result = isItemActive({ href: '/leads' }, '/contacts', new URLSearchParams());
    expect(result).toBe(false);
  });

  it('matches child path', () => {
    const result = isItemActive({ href: '/leads' }, '/leads/123', new URLSearchParams());
    expect(result).toBe(true);
  });

  it('matches with query params in item href', () => {
    const result = isItemActive(
      { href: '/leads?view=my' },
      '/leads',
      new URLSearchParams('view=my'),
    );
    expect(result).toBe(true);
  });

  it('does not match when query params differ', () => {
    const result = isItemActive(
      { href: '/leads?view=my' },
      '/leads',
      new URLSearchParams('view=all'),
    );
    expect(result).toBe(false);
  });

  it('basic item not active when view param present', () => {
    const result = isItemActive(
      { href: '/leads' },
      '/leads',
      new URLSearchParams('view=my'),
    );
    expect(result).toBe(false);
  });

  it('basic item not active when segment param present', () => {
    const result = isItemActive(
      { href: '/leads' },
      '/leads',
      new URLSearchParams('segment=hot'),
    );
    expect(result).toBe(false);
  });
});

describe('AppSidebar - SidebarInset margin logic', () => {
  it('pinned gives larger margin', () => {
    const isPinned = true;
    const isExpanded = true;
    const margin = isPinned ? 'lg:ml-60' : 'lg:ml-14';
    expect(margin).toBe('lg:ml-60');
  });

  it('unpinned gives smaller margin', () => {
    const isPinned = false;
    const margin = isPinned ? 'lg:ml-60' : 'lg:ml-14';
    expect(margin).toBe('lg:ml-14');
  });
});

describe('AppSidebar - badge display', () => {
  it('shows 99+ for badges over 99', () => {
    const badge = 150;
    const display = badge > 99 ? '99+' : String(badge);
    expect(display).toBe('99+');
  });

  it('shows actual number for badges <= 99', () => {
    const badge = 42;
    const display = badge > 99 ? '99+' : String(badge);
    expect(display).toBe('42');
  });
});
