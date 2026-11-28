import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { PageHeader } from '../page-header';

/**
 * The page hero (owner 21/11): the shared page header is a dark navy card with the wave background,
 * white text, the primary action first and the secondary controls beside it. Every page that uses
 * PageHeader gets it; `variant="plain"` keeps the old flat header for a page that needs it.
 */
describe('PageHeader hero (default)', () => {
  const renderHero = () =>
    render(
      <PageHeader
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Dashboard' }]}
        title="Dashboard"
        description="Your sales, deals and tasks at a glance."
        actions={[
          { label: 'Customize', icon: 'tune', variant: 'secondary', href: '/dashboard/customize' },
          { label: 'Add New', icon: 'add', variant: 'primary', href: '/dashboard/new' },
        ]}
      />
    );

  it('is the hero card by default, with the wave background class', () => {
    const { container } = renderHero();
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute('data-variant', 'hero');
    expect(root).toHaveClass('page-hero', 'text-white');
  });

  it('starts every trail with the same home icon, not only on the Dashboard (owner 21/11)', () => {
    render(
      <PageHeader
        variant="plain"
        title="Lead List"
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }]}
      />
    );
    const first = screen.getByRole('link', { name: 'Dashboard' });
    expect(within(first).getByText('home')).toHaveAttribute('aria-hidden', 'true');
    expect(first).toHaveClass('no-underline');
  });

  it('keeps the heading, the subtitle and the breadcrumb, with a home icon on Home', () => {
    renderHero();
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('Your sales, deals and tasks at a glance.')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const home = within(nav).getByRole('link', { name: /Home/ });
    expect(home).toHaveAttribute('href', '/');
    expect(within(home).getByText('home')).toHaveAttribute('aria-hidden', 'true');
    // The title is the current page: not repeated in the trail.
    expect(within(nav).queryByText('Dashboard')).toBeNull();
  });

  it('puts the primary action first, then the secondary controls', () => {
    renderHero();
    const links = screen.getAllByRole('link').filter((l) => l.getAttribute('href') !== '/');
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/dashboard/new',
      '/dashboard/customize',
    ]);
  });

  it('gives every action a 44px target and a light focus ring for the dark card', () => {
    renderHero();
    for (const name of ['Add New', 'Customize']) {
      const el = screen.getByRole('link', { name });
      expect(el).toHaveClass('min-h-11', 'focus-visible:ring-white');
    }
    expect(screen.getByRole('link', { name: 'Customize' })).toHaveClass('min-w-11');
  });

  it('shows secondary controls icon-only on phones, keeping their name and a tooltip', () => {
    renderHero();
    const customize = screen.getByRole('link', { name: 'Customize' });
    expect(customize).toHaveAttribute('aria-label', 'Customize');
    expect(customize).toHaveAttribute('title', 'Customize');
    expect(within(customize).getByText('Customize')).toHaveClass('hidden', 'sm:inline');
  });

  it('keeps the icon animation behind reduced motion', () => {
    renderHero();
    const icon = within(screen.getByRole('link', { name: 'Add New' })).getByText('add');
    expect(icon.className).toContain('motion-safe:group-hover:rotate-90');
    expect(icon.className).not.toMatch(/(^| )group-hover:rotate-90/);
  });

  it('runs a button action and leaves no gap when there is no description', () => {
    const onClick = vi.fn();
    render(<PageHeader title="Leads" actions={[{ label: 'Export', icon: 'download', onClick }]} />);
    screen.getByRole('button', { name: 'Export' }).click();
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Your sales, deals and tasks at a glance.')).toBeNull();
  });

  it('wraps a long title instead of overflowing', () => {
    render(<PageHeader title={'A'.repeat(120)} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('[overflow-wrap:anywhere]');
  });
});

describe('PageHeader plain', () => {
  it('keeps the flat header when a page asks for it', () => {
    const { container } = render(<PageHeader variant="plain" title="Settings" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute('data-variant', 'plain');
    expect(root).not.toHaveClass('page-hero');
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('text-foreground');
  });

  it('shows page controls with the actions in the hero (owner 21/11: period and Export)', () => {
    render(
      <PageHeader
        title="Analytics"
        controls={<select aria-label="Period" />}
        actions={[{ label: 'Refresh', icon: 'refresh', onClick: () => {} }]}
      />
    );
    const period = screen.getByRole('combobox', { name: 'Period' });
    const refresh = screen.getByRole('button', { name: /Refresh/ });
    expect(period.parentElement).toBe(refresh.parentElement);
  });
});
