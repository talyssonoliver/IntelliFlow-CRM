// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { publishModuleNav } from '@/components/sidebar/module-nav-store';
import type { SidebarConfig } from '@/components/sidebar/sidebar-types';

vi.mock('next/navigation', () => ({
  usePathname: () => '/leads',
  useSearchParams: () => new URLSearchParams('view=my'),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { role: 'SALES_REP' } }) }));
// The menu's search box has its own data; it is not what these tests check.
vi.mock('../search-bar', () => ({ SearchBar: () => null }));

import { ModuleNavGroup } from '../ModuleNavGroup';
import { MobileNav } from '../mobile-nav';

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
    expect(screen.getByRole('button', { name: 'New Lead' })).toBeInTheDocument();
    expect(screen.getByText('Lead Views')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /My Leads/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /All Leads/ })).not.toHaveAttribute('aria-current');
    expect(screen.queryByText('Admin Only')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Module Settings/ }));
    expect(onSettingsClick).toHaveBeenCalled();
    expect(onNavigate).toHaveBeenCalled();
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
});
