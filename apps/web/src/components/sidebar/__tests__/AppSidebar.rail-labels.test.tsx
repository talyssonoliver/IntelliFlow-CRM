/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppSidebar } from '../AppSidebar';
import { SidebarProvider } from '../SidebarContext';
import { createTasksSidebarConfig } from '../configs/tasks';
import { createDealsSidebarConfig } from '../configs/deals';
import type { SidebarConfig } from '../sidebar-types';

vi.mock('next/navigation', () => ({
  usePathname: () => '/tasks',
  useSearchParams: () => new URLSearchParams(),
}));

// Unlike the shared mock in AppSidebar.test.tsx, this one keeps aria-label and the focus handlers.
vi.mock('next/link', () => ({
  default: ({ children, href, prefetch: _prefetch, ...rest }: Record<string, unknown>) => (
    <a href={href as string} {...rest}>
      {children as React.ReactNode}
    </a>
  ),
}));

vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { role: 'ADMIN' } }) }));

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', {
    value: { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn() },
    configurable: true,
  });
});

const configs: Array<[string, SidebarConfig]> = [
  ['tasks', createTasksSidebarConfig(() => {})],
  ['deals', createDealsSidebarConfig(() => {})],
];

function renderRail(config: SidebarConfig) {
  render(
    <SidebarProvider>
      <AppSidebar config={config} />
    </SidebarProvider>
  );
  return screen.getByRole('navigation', {
    name: new RegExp(`${config.moduleTitle} navigation`, 'i'),
  });
}

describe.each(configs)('collapsed %s rail', (_name, config) => {
  it('gives every link and button an accessible name', () => {
    const rail = renderRail(config);
    const controls = [...rail.querySelectorAll('a, button')];
    expect(controls.length).toBeGreaterThan(0);
    for (const el of controls) {
      expect(el.getAttribute('aria-label')?.trim(), el.outerHTML).toBeTruthy();
    }
  });

  it('names each item after its config label, colour dots included', () => {
    const rail = renderRail(config);
    for (const item of config.sections.flatMap((s) => s.items)) {
      expect(within(rail).getByRole('link', { name: item.label })).toBeInTheDocument();
    }
  });

  it('shows the label in a tooltip when an item receives keyboard focus', () => {
    const rail = renderRail(config);
    const dot = config.sections.flatMap((s) => s.items).find((i) => i.color)!;
    expect(screen.queryByRole('tooltip', { hidden: true })).toBeNull();
    fireEvent.focus(within(rail).getByRole('link', { name: dot.label }));
    expect(screen.getByRole('tooltip', { hidden: true })).toHaveTextContent(dot.label);
    fireEvent.blur(within(rail).getByRole('link', { name: dot.label }));
    expect(screen.queryByRole('tooltip', { hidden: true })).toBeNull();
  });
});

describe('rail tooltip', () => {
  it('shows on hover, closes on Escape, and also names Module Settings', () => {
    const rail = renderRail(configs[0][1]);
    const settings = within(rail).getByRole('button', { name: 'Module Settings' });
    fireEvent.focus(settings);
    expect(screen.getByRole('tooltip', { hidden: true })).toHaveTextContent('Module Settings');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('tooltip', { hidden: true })).toBeNull();

    const overdue = within(rail).getByRole('link', { name: 'Overdue' });
    fireEvent.mouseEnter(overdue);
    expect(screen.getByRole('tooltip', { hidden: true })).toHaveTextContent('Overdue');
    fireEvent.mouseLeave(overdue);
    expect(screen.queryByRole('tooltip', { hidden: true })).toBeNull();
  });

  it('keeps a focus-opened tooltip when the pointer leaves, and has no label or tooltip when expanded', () => {
    const rail = renderRail(configs[0][1]);
    expect(rail.className).toContain('w-14');
    const overdue = within(rail).getByRole('link', { name: 'Overdue' });
    fireEvent.focus(overdue);
    fireEvent.mouseEnter(overdue);
    fireEvent.mouseLeave(overdue);
    expect(screen.getByRole('tooltip', { hidden: true })).toHaveTextContent('Overdue');
    fireEvent.blur(overdue);
    expect(screen.queryByRole('tooltip', { hidden: true })).toBeNull();
  });

  it('adds the unread count to the collapsed name', () => {
    const rail = renderRail({
      moduleId: 'tasks',
      moduleTitle: 'Tasks',
      moduleIcon: 'task_alt',
      sections: [
        {
          id: 's',
          title: 'S',
          items: [{ id: 'a', label: 'Inbox', icon: 'inbox', href: '/x', badge: 3 }],
        },
      ],
    });
    expect(within(rail).getByRole('link', { name: 'Inbox (3)' })).toBeInTheDocument();
  });
});
