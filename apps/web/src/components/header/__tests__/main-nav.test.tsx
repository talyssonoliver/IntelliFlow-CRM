// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

let pathname = '/dashboard';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

import { MainNav } from '../main-nav';

const r = (label: string, href: string, icon = 'x') => ({ label, href, icon });
const ROUTES = [
  r('Dashboard', '/dashboard', 'dashboard'),
  r('Leads', '/leads'),
  r('Contacts', '/contacts'),
  r('Accounts', '/accounts'),
  r('Deals', '/deals'),
  r('Tasks', '/tasks'),
  r('Calendar', '/calendar'),
  r('Email', '/email'),
  r('Tickets', '/tickets'),
];

describe('MainNav (owner 21/11 navigation)', () => {
  beforeEach(() => {
    pathname = '/dashboard';
  });

  it('shows the main destinations as links, with More for the rest', () => {
    render(<MainNav routes={ROUTES} />);
    const nav = screen.getByRole('navigation', { name: 'Primary navigation' });
    // Dashboard, Leads, Deals, Tasks (AI & Agents is not enabled here)
    expect(within(nav).getAllByRole('link')).toHaveLength(4);
    expect(within(nav).getByRole('link', { name: /Dashboard/ })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(within(nav).queryByRole('link', { name: /Contacts/ })).toBeNull();
    expect(within(nav).getByRole('button', { name: /More/ })).toBeInTheDocument();
  });

  it('opens More with the groups and their pages, and links each page', async () => {
    render(<MainNav routes={ROUTES} />);
    await userEvent.click(screen.getByRole('button', { name: /More/ }));
    const panel = await screen.findByTestId('nav-more-panel');
    expect(within(panel).getByRole('region', { name: 'CRM' })).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: /Contacts/ })).toHaveAttribute(
      'href',
      '/contacts'
    );
    expect(within(panel).getByRole('link', { name: /Email/ })).toHaveAttribute('href', '/email');
    expect(within(panel).getByRole('link', { name: /Tickets/ })).toHaveAttribute(
      'href',
      '/tickets'
    );
    expect(within(panel).getByRole('link', { name: /Integrations/ })).toHaveAttribute(
      'href',
      '/settings/integrations'
    );
  });

  it('marks More as active on a page inside it', () => {
    pathname = '/contacts/abc';
    render(<MainNav routes={ROUTES} />);
    expect(screen.getByRole('button', { name: /More/ })).toHaveClass('bg-primary/10');
  });

  it('gives every link and More a 44px target', () => {
    render(<MainNav routes={ROUTES} />);
    for (const el of [
      ...screen.getAllByRole('link'),
      screen.getByRole('button', { name: /More/ }),
    ]) {
      expect(el).toHaveClass('min-h-11');
    }
  });
});
