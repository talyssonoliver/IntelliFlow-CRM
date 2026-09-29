/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/image', () => ({
  default: ({ priority: _priority, alt, ...props }: any) => <img alt={alt} {...props} />,
}));

vi.mock('next/font/google', () => ({
  Plus_Jakarta_Sans: () => ({ className: 'font-jakarta' }),
}));

vi.mock('../AuroraBackground', () => ({
  AuroraBackground: () => <div data-testid="aurora-background" />,
}));

import { AuroraLandingPage } from '../AuroraLandingPage';
import { AuroraHeader } from '../AuroraHeader';
import AuroraPreviewPage, { metadata, revalidate } from '@/app/preview/aurora/page';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** Every route with a page.tsx, route groups like (public) stripped. */
function appRoutes(): Set<string> {
  const root = path.resolve(__dirname, '../../../app');
  const routes = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'page.tsx') {
        const rel = path
          .relative(root, dir)
          .split(path.sep)
          .filter((s) => !/^\(.*\)$/.test(s));
        routes.add('/' + rel.join('/'));
      }
    }
  };
  walk(root);
  return routes;
}

describe('AuroraLandingPage', () => {
  it('leads with the Aurora value proposition over the live background', () => {
    render(<AuroraLandingPage />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /close more deals with a crm that thinks ahead/i,
      })
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('aurora-hero').parentElement!).getByTestId('aurora-background')
    ).toBeInTheDocument();
  });

  it('sends the primary actions to signup and contact', () => {
    render(<AuroraLandingPage />);
    const hero = screen.getByTestId('aurora-hero');

    expect(within(hero).getByRole('link', { name: 'Get started' })).toHaveAttribute(
      'href',
      '/signup'
    );
    expect(within(hero).getByRole('link', { name: 'Book a demo' })).toHaveAttribute(
      'href',
      '/contact'
    );
  });

  it('keeps the product tour entry point the tour e2e relies on', () => {
    render(<AuroraLandingPage />);

    expect(screen.getByTestId('tour-trigger-link')).toHaveAttribute('href', '/features?tour=1');
  });

  it('shows three feature cards linking to the features page', () => {
    render(<AuroraLandingPage />);

    const cards = screen.getAllByTestId('feature-card');
    expect(cards).toHaveLength(3);
    for (const card of cards) {
      expect(within(card).getByRole('link')).toHaveAttribute('href', '/features');
    }
    expect(screen.getByText('Score every lead')).toBeInTheDocument();
    expect(screen.getByText('See the whole pipeline')).toBeInTheDocument();
    expect(screen.getByText('Follow up on time')).toBeInTheDocument();
  });

  it('skips past its own header without repeating the layout id', () => {
    const { container } = render(<AuroraLandingPage />);

    const skip = screen.getByRole('link', { name: 'Skip to content' });
    expect(skip).toHaveAttribute('href', '#aurora-main');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'aurora-main');
    // The root layout already owns #main-content; a second one breaks its skip link.
    expect(container.querySelector('#main-content')).toBeNull();
  });

  it('links only to pages that exist', () => {
    const { container } = render(<AuroraLandingPage />);
    const routes = appRoutes();
    const hrefs = [...container.querySelectorAll('a[href^="/"]')].map(
      (a) => a.getAttribute('href')!.split(/[?#]/)[0]!
    );

    expect(hrefs.length).toBeGreaterThan(10);
    for (const href of new Set(hrefs)) expect(routes, `${href} has no page`).toContain(href);
  });

  it('has one main landmark, a closing call to action and the Aurora brand', () => {
    render(<AuroraLandingPage />);

    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByTestId('cta-section')).toHaveTextContent('Put Aurora on your pipeline');
    expect(screen.getAllByAltText('Aurora').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/intelliflow/i)).not.toBeInTheDocument();
  });

  it('uses Material Symbols for icons and states no figures it cannot back', () => {
    const { container } = render(<AuroraLandingPage />);

    expect(container.querySelector('.material-symbols-outlined')).toBeTruthy();
    expect(container.textContent).not.toContain('%');
  });
});

describe('AuroraHeader', () => {
  it('opens and closes the phone menu', () => {
    render(<AuroraHeader />);

    const toggle = screen.getByRole('button', { name: 'Open menu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('navigation', { name: 'Mobile' })).not.toBeInTheDocument();

    fireEvent.click(toggle);
    const menu = screen.getByRole('navigation', { name: 'Mobile' });
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );

    fireEvent.click(within(menu).getByRole('link', { name: 'Pricing' }));
    expect(screen.queryByRole('navigation', { name: 'Mobile' })).not.toBeInTheDocument();
  });

  it('closes the phone menu from its log in and get started links', () => {
    render(<AuroraHeader />);

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Mobile' })).getByRole('link', {
        name: 'Log in',
      })
    );
    expect(screen.queryByRole('navigation', { name: 'Mobile' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Mobile' })).getByRole('link', {
        name: 'Get started',
      })
    );
    expect(screen.queryByRole('navigation', { name: 'Mobile' })).not.toBeInTheDocument();
  });
});

describe('/preview/aurora route', () => {
  it('re-renders daily so the copyright year never goes stale', () => {
    expect(revalidate).toBe(86400);
  });

  it('renders the landing page and stays out of search indexes', () => {
    render(<AuroraPreviewPage />);

    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
