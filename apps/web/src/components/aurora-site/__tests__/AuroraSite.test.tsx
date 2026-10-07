/**
 * @vitest-environment jsdom
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';

let pathname = '/pricing';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { AuroraSiteHeader, SITE_LINKS } from '../AuroraSiteHeader';
import { AuroraSiteFooter, FOOTER_COLUMNS } from '../AuroraSiteFooter';

/** The app directory, so every link can be checked against a real page. */
const APP = path.resolve(__dirname, '../../../app');

/** True when `route` (no hash or query) is served by a page.tsx somewhere under app/, route groups included. */
function routeExists(route: string): boolean {
  const parts = route.split(/[#?]/)[0]!.split('/').filter(Boolean);
  const walk = (dir: string, rest: string[]): boolean => {
    if (rest.length === 0) {
      if (fs.existsSync(path.join(dir, 'page.tsx'))) return true;
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      if (/^\(.*\)$/.test(entry.name) && walk(full, rest)) return true;
      if (rest.length > 0 && entry.name === rest[0] && walk(full, rest.slice(1))) return true;
    }
    return false;
  };
  return walk(APP, parts);
}

describe('AuroraSiteHeader', () => {
  beforeEach(() => {
    pathname = '/pricing';
    window.scrollY = 0;
  });

  it('goes home from the wordmark and offers Log in and Get started', () => {
    render(<AuroraSiteHeader />);
    expect(screen.getByRole('link', { name: 'Aurora home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/signup');
    expect(screen.getAllByRole('link', { name: 'Log in' })[0]).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute(
      'href',
      '#aurora-site-main'
    );
  });

  it('gives the phone menu the same destinations as the desktop nav, plus Log in', () => {
    render(<AuroraSiteHeader />);
    const hrefs = (name: string) =>
      within(screen.getByRole('navigation', { name }))
        .getAllByRole('link')
        .map((a) => a.getAttribute('href'));
    expect(hrefs('Primary')).toEqual(SITE_LINKS.map((l) => l.href));
    expect(hrefs('Mobile')).toEqual([...SITE_LINKS.map((l) => l.href), '/login']);
  });

  it('marks the page the visitor is on', () => {
    render(<AuroraSiteHeader />);
    const primary = within(screen.getByRole('navigation', { name: 'Primary' }));
    expect(primary.getByRole('link', { name: 'Pricing' })).toHaveAttribute('aria-current', 'page');
    expect(primary.getByRole('link', { name: 'Security' })).not.toHaveAttribute('aria-current');
  });

  it('fills in once the page scrolls', () => {
    const { container } = render(<AuroraSiteHeader />);
    const header = container.querySelector('header.as-nav')!;
    expect(header.classList.contains('scrolled')).toBe(false);
    act(() => {
      window.scrollY = 200;
      window.dispatchEvent(new Event('scroll'));
    });
    expect(header.classList.contains('scrolled')).toBe(true);
  });

  it('only links to pages that exist', () => {
    for (const { href } of SITE_LINKS) expect(routeExists(href), href).toBe(true);
  });
});

describe('AuroraSiteFooter', () => {
  it('lists every column with its links', () => {
    render(<AuroraSiteFooter />);
    const nav = within(screen.getByRole('navigation', { name: 'Footer' }));
    for (const { title, links } of FOOTER_COLUMNS) {
      expect(nav.getByText(title)).toBeInTheDocument();
      for (const { href, label } of links) {
        expect(nav.getByRole('link', { name: label })).toHaveAttribute('href', href);
      }
    }
    expect(screen.getByText(`© ${new Date().getFullYear()} Aurora`)).toBeInTheDocument();
  });

  it('never links to a page that does not exist', () => {
    const hrefs = FOOTER_COLUMNS.flatMap((c) => c.links.map((l) => l.href));
    for (const href of hrefs) expect(routeExists(href), href).toBe(true);
  });

  it('keeps its ribbon artwork out of the accessibility tree', () => {
    const { container } = render(<AuroraSiteFooter />);
    expect(container.querySelector('.as-footer-ribbons')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('svg.section-curve')).toHaveAttribute('aria-hidden', 'true');
  });
});
