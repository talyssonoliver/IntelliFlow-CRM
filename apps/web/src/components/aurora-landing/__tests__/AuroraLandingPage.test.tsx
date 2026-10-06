/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/font/google', () => ({
  Manrope: () => ({ variable: 'font-manrope' }),
}));

vi.mock('../AuroraBackground', () => ({
  AuroraBackground: () => <div data-testid="aurora-background" />,
}));

vi.mock('../AuroraMotion', () => ({ AuroraMotion: () => <div data-testid="aurora-motion" /> }));

import { AuroraLandingPage } from '../AuroraLandingPage';
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
  it('leads with the value proposition over the live waves, hidden until the first screen is ready', () => {
    const { container } = render(<AuroraLandingPage />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'The CRM that works your pipeline for you.' })
    ).toBeInTheDocument();
    const page = container.querySelector('#aurora-page')!;
    expect(page).toHaveClass('aurora-page', 'boot', 'font-manrope');
    expect(page.querySelector('.stage .hero-bg [data-testid="aurora-background"]')).toBeTruthy();
    expect(screen.getByTestId('aurora-motion')).toBeInTheDocument();
  });

  it('sends the primary actions to signup, contact and login', () => {
    render(<AuroraLandingPage />);
    const hero = screen.getByRole('heading', { level: 1 }).parentElement!;

    expect(within(hero).getByRole('link', { name: 'Get started' })).toHaveAttribute(
      'href',
      '/signup'
    );
    expect(within(hero).getByRole('link', { name: 'Book a demo' })).toHaveAttribute(
      'href',
      '/contact'
    );
    const cta = screen.getByRole('navigation', { name: 'Primary' })
      .nextElementSibling as HTMLElement;
    expect(within(cta).getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
  });

  it('walks the five layers top-down, each paired with the stack', () => {
    const { container } = render(<AuroraLandingPage />);

    const layers = [...container.querySelectorAll<HTMLElement>('.layer-step')].map(
      (s) => s.dataset.layer
    );
    expect(layers).toEqual(['agents', 'control', 'pipeline', 'service', 'foundation']);
    expect(container.querySelector('#stack')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText(/five stacked layers/i)).toHaveClass('sr-only');
    expect(
      screen.getByRole('heading', { level: 3, name: 'Nothing goes out until you say yes.' })
    ).toBeInTheDocument();
  });

  it('gives phones a menu with the same destinations as the desktop nav', () => {
    render(<AuroraLandingPage />);
    const primary = within(screen.getByRole('navigation', { name: 'Primary' }))
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'));
    const mobile = within(screen.getByRole('navigation', { name: 'Mobile' }))
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'));

    expect(mobile).toEqual([...primary, '/login']);
  });

  it('skips past its own header without repeating the layout id', () => {
    const { container } = render(<AuroraLandingPage />);

    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute(
      'href',
      '#aurora-main'
    );
    expect(screen.getByRole('main')).toHaveAttribute('id', 'aurora-main');
    // The root layout already owns #main-content; a second one breaks its skip link.
    expect(container.querySelector('#main-content')).toBeNull();
  });

  it('links only to pages and sections that exist', () => {
    const { container } = render(<AuroraLandingPage />);
    const routes = appRoutes();
    const hrefs = [...container.querySelectorAll('a[href^="/"]')].map(
      (a) => a.getAttribute('href')!.split(/[?#]/)[0]!
    );
    expect(hrefs.length).toBeGreaterThan(10);
    for (const href of new Set(hrefs)) expect(routes, `${href} has no page`).toContain(href);

    for (const a of container.querySelectorAll('a[href^="#"]')) {
      const id = a.getAttribute('href')!.slice(1);
      expect(container.querySelector(`#${id}`), `#${id} is missing`).toBeTruthy();
    }
  });

  it('labels every product panel as a sample workspace', () => {
    const { container } = render(<AuroraLandingPage />);
    const scenes = container.querySelectorAll('.scene');

    expect(scenes.length).toBeGreaterThanOrEqual(2);
    for (const scene of scenes)
      expect(scene).toHaveAttribute('aria-label', expect.stringMatching(/sample workspace/i));
    expect(screen.getAllByText(/sample workspace/i).length).toBeGreaterThanOrEqual(2);
  });

  it('claims only what the product can back', () => {
    const { container } = render(<AuroraLandingPage />);
    const text = container.textContent!;

    expect(text).not.toMatch(/\bSAP\b|SOC ?2|GDPR|ISO ?27001/);
    expect(text).not.toMatch(/\b0 agents\b/i);
    expect(text).not.toMatch(/intelliflow/i);
    // The TypeScript SDK is beta and API keys are not built yet.
    expect(container.querySelector('.dev.beta')).toHaveTextContent(/TypeScript SDK\s*Beta/i);
    expect(container.querySelector('.dev.soon')).toHaveTextContent(/API keys\s*Coming soon/i);
  });

  it('names the ready integrations', () => {
    const { container } = render(<AuroraLandingPage />);
    const names = [...container.querySelectorAll('.logo span')].map((s) => s.textContent);

    expect(names).toEqual(
      expect.arrayContaining(['Gmail', 'Outlook', 'Slack', 'Microsoft Teams', 'Stripe', 'PayPal'])
    );
  });

  it('uses Material Symbols for icons and keeps the copyright year current', () => {
    const { container } = render(<AuroraLandingPage />);

    expect(container.querySelector('.material-symbols-outlined')).toBeTruthy();
    expect(container.querySelector('.foot-legal')).toHaveTextContent(
      `© ${new Date().getFullYear()} Aurora`
    );
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
