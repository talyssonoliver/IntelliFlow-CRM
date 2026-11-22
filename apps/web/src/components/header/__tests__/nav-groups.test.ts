import { describe, it, expect } from 'vitest';
import { buildNavLayout, isRouteActive } from '../nav-groups';

const r = (label: string, href: string) => ({ label, href, icon: 'x' });
const CORE = [
  r('Dashboard', '/dashboard'),
  r('Leads', '/leads'),
  r('Contacts', '/contacts'),
  r('Accounts', '/accounts'),
  r('Deals', '/deals'),
  r('Tasks', '/tasks'),
  r('Calendar', '/calendar'),
  r('Email', '/email'),
];

describe('buildNavLayout (owner 21/11 navigation)', () => {
  it('puts the main destinations first, in order', () => {
    const layout = buildNavLayout([...CORE, r('AI & Agents', '/agent-approvals')]);
    expect(layout.primary.map((x) => x.label)).toEqual([
      'Dashboard',
      'Leads',
      'Deals',
      'Tasks',
      'AI & Agents',
    ]);
  });

  it('groups the rest under More, only with routes the plan enables', () => {
    const layout = buildNavLayout(CORE);
    expect(layout.groups.map((g) => [g.title, g.routes.map((x) => x.label)])).toEqual([
      ['CRM', ['Contacts', 'Accounts']],
      ['Productivity', ['Calendar', 'Email']],
      // Cases, Tickets and Reports are not enabled: Customer service drops, Platform keeps
      // Integrations, which every plan has.
      ['Platform', ['Integrations']],
    ]);
    expect(layout.primary.map((x) => x.label)).not.toContain('AI & Agents');
  });

  it('shows Customer service and Reports when their modules are on', () => {
    const layout = buildNavLayout([
      ...CORE,
      r('Cases', '/cases'),
      r('Tickets', '/tickets'),
      r('Reports', '/analytics'),
    ]);
    const titles = layout.groups.map((g) => g.title);
    expect(titles).toEqual(['CRM', 'Productivity', 'Customer service', 'Platform']);
    expect(layout.groups[3].routes.map((x) => x.label)).toEqual(['Reports', 'Integrations']);
  });

  it('never drops an enabled route it does not know: it goes to Other', () => {
    const layout = buildNavLayout([...CORE, r('Products', '/products')]);
    expect(layout.groups.at(-1)).toEqual({ title: 'Other', routes: [r('Products', '/products')] });
  });

  it('keeps every enabled destination reachable (additive)', () => {
    const all = [
      ...CORE,
      r('Cases', '/cases'),
      r('Tickets', '/tickets'),
      r('Reports', '/analytics'),
    ];
    const layout = buildNavLayout(all);
    const shown = [...layout.primary, ...layout.groups.flatMap((g) => g.routes)].map((x) => x.href);
    for (const route of all) expect(shown).toContain(route.href);
  });
});

describe('isRouteActive', () => {
  it('matches the page and pages below it, not prefixes of other words', () => {
    expect(isRouteActive('/leads', '/leads')).toBe(true);
    expect(isRouteActive('/leads/abc', '/leads')).toBe(true);
    expect(isRouteActive('/leadsx', '/leads')).toBe(false);
    expect(isRouteActive(null, '/leads')).toBe(false);
  });
});
