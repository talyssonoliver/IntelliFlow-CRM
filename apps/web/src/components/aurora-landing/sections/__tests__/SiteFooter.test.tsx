/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { render, screen, within } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { SiteFooter } from '../SiteFooter';
import { FOOTER_COLUMNS, hrefFromElsewhere } from '../footer-links';

describe('SiteFooter', () => {
  it('keeps the copyright year current', () => {
    const { container } = render(<SiteFooter />);
    expect(container.querySelector('.foot-legal')).toHaveTextContent(
      `© ${new Date().getFullYear()} Aurora`
    );
  });

  it('keeps every link the old footer had that leads to a real page', () => {
    render(<SiteFooter />);
    const nav = within(screen.getByRole('navigation', { name: 'Footer' }));
    const hrefs = nav.getAllByRole('link').map((a) => a.getAttribute('href'));
    for (const href of [
      '/features',
      '/pricing',
      '/security',
      '/about',
      '/contact',
      '/partners',
      '/press',
      '/privacy',
      '/terms',
      '/cookies',
      '/dpa',
      '/aup',
    ]) {
      expect(hrefs).toContain(href);
    }
  });

  it('renders every column from the shared list, sections as in-page anchors', () => {
    render(<SiteFooter />);
    const nav = within(screen.getByRole('navigation', { name: 'Footer' }));
    for (const { title, links } of FOOTER_COLUMNS) {
      expect(nav.getByText(title)).toBeInTheDocument();
      for (const link of links) {
        expect(nav.getByRole('link', { name: link.label })).toHaveAttribute('href', link.href);
      }
    }
    expect(nav.getByRole('link', { name: 'Platform' })).toHaveAttribute('href', '#platform');
    // The help centre is an in-app module behind a plan gate: never sent to from here.
    expect(nav.queryByRole('link', { name: /help/i })).toBeNull();
  });

  it('never links to a page that does not exist', () => {
    const app = path.resolve(__dirname, '../../../../app');
    const exists = (route: string): boolean => {
      const walk = (dir: string, rest: string[]): boolean => {
        if (rest.length === 0 && fs.existsSync(path.join(dir, 'page.tsx'))) return true;
        return fs.readdirSync(dir, { withFileTypes: true }).some((e) => {
          if (!e.isDirectory()) return false;
          const full = path.join(dir, e.name);
          if (/^\(.*\)$/.test(e.name) && walk(full, rest)) return true;
          return rest.length > 0 && e.name === rest[0] && walk(full, rest.slice(1));
        });
      };
      return walk(app, route.split('/').filter(Boolean));
    };
    for (const link of FOOTER_COLUMNS.flatMap((c) => c.links)) {
      if (!link.section) expect(exists(link.href), link.href).toBe(true);
    }
    expect(hrefFromElsewhere({ label: 'Platform', href: '#platform', section: true })).toBe(
      '/#platform'
    );
    expect(hrefFromElsewhere({ label: 'About', href: '/about' })).toBe('/about');
  });

  it('carries the section-bridge markup, continuing FinalCta as one Navy block', () => {
    const { container } = render(<SiteFooter />);
    const footer = container.querySelector('footer.footer')!;
    expect(footer).toHaveAttribute('data-bridge-section');
    expect((footer as HTMLElement).style.getPropertyValue('--bridge-accent')).toBe('var(--navy)');
  });
});
