import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { publishModuleNav, useModuleNav, visibleSections } from '../module-nav-store';
import type { SidebarConfig } from '../sidebar-types';

const config = (moduleId: string): SidebarConfig => ({
  moduleId,
  moduleTitle: moduleId,
  moduleIcon: 'group',
  sections: [
    {
      id: 'views',
      title: 'Views',
      items: [
        { id: 'all', label: 'All', icon: 'list', href: `/${moduleId}` },
        {
          id: 'admin',
          label: 'Admin only',
          icon: 'lock',
          href: `/${moduleId}?a=1`,
          roles: ['ADMIN'],
        },
      ],
    },
  ],
});

describe('module nav store', () => {
  it('shares the open module and withdraws it when the module unmounts', () => {
    const { result } = renderHook(() => useModuleNav());
    expect(result.current).toBeNull();

    let withdraw = () => {};
    act(() => {
      withdraw = publishModuleNav(config('leads'));
    });
    expect(result.current?.moduleId).toBe('leads');

    act(() => withdraw());
    expect(result.current).toBeNull();
  });

  it('keeps a newer module when an older one withdraws late', () => {
    const { result } = renderHook(() => useModuleNav());
    let withdrawLeads = () => {};
    let withdrawDeals = () => {};
    act(() => {
      withdrawLeads = publishModuleNav(config('leads'));
      withdrawDeals = publishModuleNav(config('deals'));
    });
    act(() => withdrawLeads());
    expect(result.current?.moduleId).toBe('deals');
    act(() => withdrawDeals());
  });
});

describe('visibleSections', () => {
  it('shows role-restricted items only to those roles and drops empty sections', () => {
    const { sections } = config('leads');
    expect(visibleSections(sections, 'ADMIN')[0].items.map((i) => i.id)).toEqual(['all', 'admin']);
    expect(visibleSections(sections, 'SALES_REP')[0].items.map((i) => i.id)).toEqual(['all']);
    expect(visibleSections(sections, undefined)[0].items.map((i) => i.id)).toEqual(['all']);
    const adminOnly = [{ id: 's', title: 'S', items: [sections[0].items[1]] }];
    expect(visibleSections(adminOnly, 'SALES_REP')).toEqual([]);
  });
});
