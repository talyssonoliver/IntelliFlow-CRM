import type { NavRoute } from './main-nav';

/**
 * The top bar's layout (owner 21/11 reference): a few main destinations with icons, the rest in a
 * grouped "More" menu. It only arranges the routes the plan's modules enable (useEnabledModules);
 * a route that is not enabled never shows, and a group left empty is not drawn.
 */
export const PRIMARY_NAV_HREFS: readonly string[] = [
  '/dashboard',
  '/leads',
  '/deals',
  '/tasks',
  '/agent-approvals',
];

export interface NavGroupConfig {
  title: string;
  hrefs: readonly string[];
}

export const MORE_NAV_GROUPS: readonly NavGroupConfig[] = [
  { title: 'CRM', hrefs: ['/contacts', '/accounts'] },
  { title: 'Productivity', hrefs: ['/calendar', '/email'] },
  { title: 'Customer service', hrefs: ['/cases', '/tickets'] },
  { title: 'Platform', hrefs: ['/analytics', '/settings/integrations'] },
];

/** Integrations is a settings page every plan has, not a module route; More links it under Platform. */
export const INTEGRATIONS_ROUTE: NavRoute = {
  label: 'Integrations',
  href: '/settings/integrations',
  icon: 'extension',
};

export interface NavGroup {
  title: string;
  routes: NavRoute[];
}

export interface NavLayout {
  primary: NavRoute[];
  groups: NavGroup[];
}

/**
 * Splits the enabled routes into the main links (in PRIMARY_NAV_HREFS order) and the More groups.
 * An enabled route that is in neither list goes to a last "Other" group, so a new module's page
 * is never lost from the bar.
 */
export function buildNavLayout(routes: readonly NavRoute[]): NavLayout {
  const byHref = new Map(routes.map((r) => [r.href, r]));
  byHref.set(INTEGRATIONS_ROUTE.href, INTEGRATIONS_ROUTE);
  const primary = PRIMARY_NAV_HREFS.map((h) => byHref.get(h)).filter((r): r is NavRoute => !!r);
  const placed = new Set<string>([
    ...PRIMARY_NAV_HREFS,
    ...MORE_NAV_GROUPS.flatMap((g) => g.hrefs),
  ]);
  const groups: NavGroup[] = MORE_NAV_GROUPS.map((g) => ({
    title: g.title,
    routes: g.hrefs.map((h) => byHref.get(h)).filter((r): r is NavRoute => !!r),
  }));
  const other = routes.filter((r) => !placed.has(r.href));
  if (other.length > 0) groups.push({ title: 'Other', routes: [...other] });
  return { primary, groups: groups.filter((g) => g.routes.length > 0) };
}

/** True when the page is a route's page or below it. */
export function isRouteActive(pathname: string | null | undefined, href: string): boolean {
  return !!pathname && (pathname === href || pathname.startsWith(href + '/'));
}
