/**
 * @vitest-environment jsdom
 *
 * The real sidebars: which items a role sees, which item is active, the badge cap, and how the
 * trigger opens the menu. Replaces AppSidebar.additional, .supplementary and .supplementary2,
 * which asserted copies of this logic (the mobile version), and so asserted that /leads/123
 * activates /leads in the desktop sidebar, which it does not (#1216).
 */
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AppSidebar, MobileSidebar, SidebarTrigger } from '../AppSidebar';
import { SidebarProvider } from '../SidebarContext';
import type { SidebarConfig } from '../sidebar-types';

const nav = vi.hoisted(() => ({ pathname: '/test', search: '' }));
const auth = vi.hoisted(() => ({ role: 'USER' as string | null }));

vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: auth.role ? { id: 'u1', role: auth.role } : null }),
}));

const config: SidebarConfig = {
  moduleId: 'test',
  moduleTitle: 'Test Module',
  moduleIcon: 'dashboard',
  sections: [
    {
      id: 'views',
      title: 'Views',
      items: [
        { id: 'all', label: 'All Items', icon: 'list', href: '/test' },
        { id: 'my', label: 'My Items', icon: 'person', href: '/test?view=my', badge: 150 },
        { id: 'admin', label: 'Admin Only', icon: 'lock', href: '/test/admin', roles: ['ADMIN'] },
      ],
    },
    {
      id: 'admin-section',
      title: 'Administration',
      items: [{ id: 'audit', label: 'Audit', icon: 'policy', href: '/audit', roles: ['ADMIN'] }],
    },
  ],
};

const link = (href: string) => document.querySelector<HTMLAnchorElement>(`a[href="${href}"]`);
const isActive = (href: string) => link(href)?.getAttribute('aria-current') === 'page';

function renderDesktop() {
  return render(
    <SidebarProvider>
      <AppSidebar config={config} />
    </SidebarProvider>
  );
}

beforeEach(() => {
  nav.pathname = '/test';
  nav.search = '';
  auth.role = 'USER';
  localStorage.clear();
});

afterEach(() => vi.unstubAllGlobals());

describe('desktop sidebar: what a role sees', () => {
  it('hides role-restricted items, and a section left empty, from other roles', () => {
    renderDesktop();
    expect(link('/test')).not.toBeNull();
    expect(link('/test/admin')).toBeNull();
    expect(link('/audit')).toBeNull();
    expect(screen.queryByText('Administration')).toBeNull();
  });

  it('shows them to the role they name', () => {
    auth.role = 'ADMIN';
    renderDesktop();
    expect(link('/test/admin')).not.toBeNull();
    expect(link('/audit')).not.toBeNull();
  });

  it('shows only unrestricted items when nobody is signed in', () => {
    auth.role = null;
    renderDesktop();
    expect(link('/test')).not.toBeNull();
    expect(link('/test/admin')).toBeNull();
  });
});

describe('desktop sidebar: the active item', () => {
  it('marks an item without params active only on its exact path with no query', () => {
    renderDesktop();
    expect(isActive('/test')).toBe(true);
    expect(isActive('/test?view=my')).toBe(false);
  });

  it('does not mark it active under a child path or with any query', () => {
    nav.pathname = '/test/123';
    const { unmount } = renderDesktop();
    expect(isActive('/test')).toBe(false);
    unmount();

    nav.pathname = '/test';
    nav.search = 'foo=1';
    renderDesktop();
    expect(isActive('/test')).toBe(false);
  });

  it('marks an item with params active when the URL carries all of them', () => {
    nav.search = 'view=my&page=2';
    const { unmount } = renderDesktop();
    expect(isActive('/test?view=my')).toBe(true);
    expect(isActive('/test')).toBe(false);
    unmount();

    nav.search = 'view=team';
    renderDesktop();
    expect(isActive('/test?view=my')).toBe(false);
  });

  it('shows only a dot, not the count, while collapsed', () => {
    renderDesktop();
    expect(link('/test?view=my')?.textContent).not.toMatch(/\d/);
    expect(link('/test?view=my')?.querySelector('span.rounded-full')).not.toBeNull();
  });
});

describe('the menu trigger and the mobile sidebar', () => {
  function renderWithTrigger() {
    return render(
      <SidebarProvider>
        <SidebarTrigger />
        <MobileSidebar config={config} />
      </SidebarProvider>
    );
  }

  it('opens the mobile drawer on a small screen', () => {
    vi.stubGlobal('innerWidth', 800);
    renderWithTrigger();
    const dialog = document.querySelector('dialog');
    expect(dialog?.open).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(document.querySelector('dialog')?.open).toBe(true);
  });

  it('pins the desktop sidebar on a large screen, without opening the drawer', () => {
    vi.stubGlobal('innerWidth', 1280);
    renderWithTrigger();

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(document.querySelector('dialog')?.open).toBe(false);
    expect(screen.getAllByRole('button', { name: 'Close menu' })[0]).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });

  it('caps the badge count at 99+ in the drawer, where labels show', () => {
    renderWithTrigger();
    expect(link('/test?view=my')?.textContent).toContain('99+');
  });

  it('applies the same role filter in the drawer', () => {
    renderWithTrigger();
    expect(link('/test')).not.toBeNull();
    expect(link('/test/admin')).toBeNull();
    expect(link('/audit')).toBeNull();
  });

  it('closes the drawer when the page changes', () => {
    vi.stubGlobal('innerWidth', 800);
    const { rerender } = renderWithTrigger();
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(document.querySelector('dialog')?.open).toBe(true);

    nav.pathname = '/elsewhere';
    act(() => {
      rerender(
        <SidebarProvider>
          <SidebarTrigger />
          <MobileSidebar config={config} />
        </SidebarProvider>
      );
    });
    expect(document.querySelector('dialog')?.open).toBe(false);
  });
});
