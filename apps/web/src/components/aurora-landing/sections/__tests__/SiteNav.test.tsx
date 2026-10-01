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

import { SiteNav } from '../SiteNav';

describe('SiteNav', () => {
  it('skips straight to the main content', () => {
    render(<SiteNav />);
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute(
      'href',
      '#aurora-main'
    );
  });

  it('gives the phone menu the same destinations as the desktop nav, plus Log in', () => {
    render(<SiteNav />);
    const primary = within(screen.getByRole('navigation', { name: 'Primary' }))
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'));
    const mobile = within(screen.getByRole('navigation', { name: 'Mobile' }))
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'));

    expect(primary).toEqual(['#platform', '#agents', '#security', '#pricing']);
    expect(mobile).toEqual([...primary, '/login']);
  });

  it('sends the header CTA to signup and login', () => {
    const { container } = render(<SiteNav />);
    const cta = container.querySelector<HTMLElement>('.nav-cta')!;
    expect(within(cta).getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
    expect(within(cta).getByRole('link', { name: 'Get started' })).toHaveAttribute(
      'href',
      '/signup'
    );
  });

  it('wires the hamburger toggle and its panel as a sheet, with a real 44px touch target', () => {
    const { container } = render(<SiteNav />);
    const details = container.querySelector('details.nav-menu.nav-sheet')!;
    expect(details).toBeInTheDocument();
    expect(details.querySelector('summary.nav-sheet-toggle')).toBeInTheDocument();
    expect(details.querySelector('nav.nav-sheet-links[aria-label="Mobile"]')).toBeInTheDocument();
    // The icon and toggle carry the classes site-nav.css sizes to 44x44 and rotates on open.
    expect(details.querySelector('.material-symbols-outlined.nav-sheet-icon')).toBeInTheDocument();
  });

  it('renders the phone menu closed by default (native <details>, no JS needed for the markup)', () => {
    const { container } = render(<SiteNav />);
    const details = container.querySelector('summary[aria-label="Menu"]')!.closest('details')!;
    expect(details).not.toHaveAttribute('open');
  });
});

describe('SiteNav phone menu', () => {
  const openSheet = (container: HTMLElement) => {
    const sheet = container.querySelector<HTMLDetailsElement>('details.nav-sheet')!;
    sheet.setAttribute('open', '');
    return sheet;
  };

  it('closes when the visitor taps outside it', () => {
    const { container } = render(<SiteNav />);
    const sheet = openSheet(container);
    sheet.querySelector('summary')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(sheet.open).toBe(true);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(sheet.open).toBe(false);
  });

  it('closes on Escape and when one of its links is followed', () => {
    const { container } = render(<SiteNav />);
    const sheet = openSheet(container);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(sheet.open).toBe(false);

    openSheet(container);
    within(screen.getByRole('navigation', { name: 'Mobile' }))
      .getByRole('link', { name: 'Pricing' })
      .click();
    expect(sheet.open).toBe(false);
  });
});
