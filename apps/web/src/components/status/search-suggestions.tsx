'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MODULE_NAV_ROUTES } from '@intelliflow/domain';

type SuggestedRoute = {
  readonly label: string;
  readonly href: string;
  readonly icon: string;
  readonly source: 'module-route' | 'public-route';
  readonly keywords: readonly string[];
};

const PUBLIC_FALLBACK_ROUTES: readonly SuggestedRoute[] = [
  {
    label: 'Home',
    href: '/',
    icon: 'home',
    source: 'public-route',
    keywords: ['home', 'landing', 'start'],
  },
  {
    label: 'System Status',
    href: '/status',
    icon: 'monitor_heart',
    source: 'public-route',
    keywords: ['status', 'incident', 'uptime'],
  },
  {
    label: 'Help Center',
    href: '/help-center',
    icon: 'help_center',
    source: 'public-route',
    keywords: ['help', 'docs', 'support'],
  },
  {
    label: 'Privacy Policy',
    href: '/privacy',
    icon: 'shield_person',
    source: 'public-route',
    keywords: ['privacy', 'policy', 'legal'],
  },
  {
    label: 'Contact',
    href: '/contact',
    icon: 'support_agent',
    source: 'public-route',
    keywords: ['contact', 'support', 'sales'],
  },
];

const ROUTE_CATALOG: readonly SuggestedRoute[] = [
  ...Object.values(MODULE_NAV_ROUTES)
    .flat()
    .map((route) => ({
      label: route.label,
      href: route.href,
      icon: route.icon,
      source: 'module-route' as const,
      keywords: [route.label.toLowerCase(), route.href.replace('/', '').toLowerCase()],
    })),
  ...PUBLIC_FALLBACK_ROUTES,
].filter(
  (route, index, routes) => routes.findIndex((candidate) => candidate.href === route.href) === index
);

function tokenize(pathname: string): string[] {
  return pathname
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function scoreRoute(route: SuggestedRoute, tokens: readonly string[]): number {
  const haystack = `${route.label} ${route.href} ${route.keywords.join(' ')}`.toLowerCase();

  return tokens.reduce((score, token) => {
    if (route.href === `/${token}` || route.href.includes(`/${token}`)) {
      return score + 8;
    }

    if (route.label.toLowerCase().includes(token)) {
      return score + 6;
    }

    if (haystack.includes(token)) {
      return score + 3;
    }

    return score;
  }, 0);
}

function getSuggestedRoutes(pathname: string, maxItems: number): SuggestedRoute[] {
  const tokens = tokenize(pathname);
  const rankedEntries = ROUTE_CATALOG.map((route) => ({
    route,
    score: scoreRoute(route, tokens),
  })).sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (left.route.source !== right.route.source) {
        return left.route.source === 'module-route' ? -1 : 1;
      }

      return left.route.label.localeCompare(right.route.label);
    });

  const ranked = rankedEntries.map((entry) => entry.route);

  const fallback = ROUTE_CATALOG.filter((route) =>
    ['/', '/dashboard', '/status', '/help-center'].includes(route.href)
  );

  if (rankedEntries[0]?.score === 0) {
    return fallback.slice(0, maxItems);
  }

  const merged = [...ranked, ...fallback].filter(
    (route, index, routes) => routes.findIndex((candidate) => candidate.href === route.href) === index
  );

  return merged.slice(0, maxItems);
}

export function SearchSuggestions({ maxItems = 4 }: Readonly<{ maxItems?: number }>) {
  const pathname = usePathname() ?? '/404';
  const suggestions = getSuggestedRoutes(pathname, maxItems);

  return (
    <section aria-labelledby="search-suggestions-heading" className="space-y-4">
      <div className="space-y-1">
        <h2
          id="search-suggestions-heading"
          className="text-lg font-semibold text-slate-900 dark:text-white"
        >
          Try one of these instead
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          We matched nearby destinations from real IntelliFlow routes.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {suggestions.map((suggestion) => (
          <Link
            key={suggestion.href}
            href={suggestion.href}
            className="group rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:border-[#137fec] hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:ring-offset-2 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-[#7cc4ff] dark:hover:bg-slate-800"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#137fec]/10 text-[#137fec]">
                <span className="material-symbols-outlined" aria-hidden="true">
                  {suggestion.icon}
                </span>
              </div>
              <div className="space-y-1">
                <p className="font-medium text-slate-900 dark:text-white">{suggestion.label}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{suggestion.href}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
