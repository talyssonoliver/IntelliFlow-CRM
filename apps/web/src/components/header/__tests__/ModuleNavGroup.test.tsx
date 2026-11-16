// @vitest-environment jsdom
import { createContext, useContext } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { publishModuleNav } from '@/components/sidebar/module-nav-store';
import type { SidebarConfig } from '@/components/sidebar/sidebar-types';

const nav = vi.hoisted(() => ({ path: '/leads', query: 'view=my' }));
vi.mock('next/navigation', () => ({
  usePathname: () => nav.path,
  useSearchParams: () => new URLSearchParams(nav.query),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { role: 'SALES_REP' } }) }));
// The menu's search box has its own data; it is not what these tests check.
vi.mock('../search-bar', () => ({ SearchBar: () => null }));

import { ModuleNavGroup } from '../ModuleNavGroup';
import { MobileNav } from '../mobile-nav';
import { ModuleMenuContent } from '@/components/sidebar/SidebarSuspenseWrapper';

const onSettingsClick = vi.fn();
const leads: SidebarConfig = {
  moduleId: 'leads',
  moduleTitle: 'Leads',
  moduleIcon: 'group',
  onSettingsClick,
  showSettings: true,
  beforeContent: () => <button type="button">New Lead</button>,
  sections: [
    {
      id: 'views',
      title: 'Lead Views',
      items: [
        { id: 'all', label: 'All Leads', icon: 'list', href: '/leads' },
        { id: 'my', label: 'My Leads', icon: 'person', href: '/leads?view=my' },
        { id: 'admin', label: 'Admin Only', icon: 'lock', href: '/leads?x=1', roles: ['ADMIN'] },
      ],
    },
  ],
};

let withdraw: () => void = () => {};
afterEach(() => act(() => withdraw()));

describe('ModuleNavGroup', () => {
  it('renders nothing outside a module', () => {
    const { container } = render(<ModuleNavGroup onNavigate={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists the module's content, sections and settings, with the current item marked", () => {
    act(() => {
      withdraw = publishModuleNav(leads);
    });
    const onNavigate = vi.fn();
    render(<ModuleNavGroup onNavigate={onNavigate} />);

    expect(screen.getByRole('navigation', { name: 'Leads sections' })).toBeInTheDocument();
    // Custom content is not rendered by the app menu itself (it is portalled in by the module).
    expect(screen.queryByRole('button', { name: 'New Lead' })).not.toBeInTheDocument();
    expect(screen.getByText('Lead Views')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /My Leads/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /All Leads/ })).not.toHaveAttribute('aria-current');
    expect(screen.queryByText('Admin Only')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Module Settings/ }));
    expect(onSettingsClick).toHaveBeenCalled();
    expect(onNavigate).toHaveBeenCalled();
  });

  it("shows the module's custom content in the menu with the module's own providers", () => {
    // Like the calendar's toggles: content that only works inside its module's provider.
    const Visibility = createContext<string | null>(null);
    const Toggles = () => {
      const value = useContext(Visibility);
      if (value === null) throw new Error('outside the provider');
      return <button type="button">Toggles: {value}</button>;
    };
    const calendar: SidebarConfig = { ...leads, beforeContent: undefined, afterContent: Toggles };
    act(() => {
      withdraw = publishModuleNav(calendar);
    });

    render(
      <>
        <ModuleNavGroup onNavigate={vi.fn()} />
        <Visibility.Provider value="on">
          <ModuleMenuContent config={calendar} />
        </Visibility.Provider>
      </>
    );

    const menu = screen.getByRole('navigation', { name: 'Leads sections' });
    const toggles = screen.getByRole('button', { name: 'Toggles: on' });
    expect(menu.contains(toggles)).toBe(true);
  });

  it('offers Module Settings as a link when the module has a settings page', () => {
    act(() => {
      withdraw = publishModuleNav({
        ...leads,
        onSettingsClick: undefined,
        settingsHref: '/leads/settings',
      });
    });
    render(<ModuleNavGroup onNavigate={vi.fn()} />);
    expect(screen.getByRole('link', { name: /Module Settings/ })).toHaveAttribute(
      'href',
      '/leads/settings'
    );
  });
});

describe('MobileNav with a module open', () => {
  const routes = [
    { href: '/dashboard', label: 'Dashboard', icon: 'home' },
    { href: '/leads', label: 'Leads', icon: 'group' },
  ];

  it("shows the module's sections under its own link: one menu on a phone", () => {
    act(() => {
      withdraw = publishModuleNav(leads);
    });
    render(<MobileNav routes={routes as never} isOpen onClose={vi.fn()} />);
    const group = screen.getByRole('navigation', { name: 'Leads sections' });
    const leadsLink = screen
      .getAllByRole('link')
      .find((a) => a.getAttribute('href') === '/leads' && !group.contains(a))!;
    expect(leadsLink).toBeDefined();
    // The group follows the Leads link, not the Dashboard one.
    expect(
      leadsLink.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('puts the sections at the top when no top-level route matches the page', () => {
    act(() => {
      withdraw = publishModuleNav(leads);
    });
    render(<MobileNav routes={[routes[0]] as never} isOpen onClose={vi.fn()} />);
    expect(screen.getByRole('navigation', { name: 'Leads sections' })).toBeInTheDocument();
  });

  it('closes after any navigation, including a query-only one from module content', () => {
    const onClose = vi.fn();
    const { rerender } = render(<MobileNav routes={routes as never} isOpen onClose={onClose} />);
    expect(onClose).not.toHaveBeenCalled();

    nav.query = 'view=starred';
    rerender(<MobileNav routes={routes as never} isOpen onClose={onClose} />);
    expect(onClose).toHaveBeenCalledTimes(1);

    nav.path = '/leads/lead-settings';
    rerender(<MobileNav routes={routes as never} isOpen onClose={onClose} />);
    expect(onClose).toHaveBeenCalledTimes(2);
    nav.path = '/leads';
    nav.query = 'view=my';
  });
});
