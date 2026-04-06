'use client';

import { Badge, Separator, EmptyState } from '@intelliflow/ui';
import type { ChangelogEntry, ChangelogEntryType } from '@/lib/developer/rss-feed';

const BADGE_VARIANT_MAP: Record<
  ChangelogEntryType,
  'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'
> = {
  feature: 'success',
  breaking: 'destructive',
  fix: 'secondary',
  deprecation: 'warning',
  security: 'outline',
  performance: 'secondary',
};

export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    version: '0.7.0',
    date: '2026-02-24',
    title: 'Developer Portal & AI Intelligence',
    changes: [
      {
        type: 'feature',
        description: 'Developer portal with API docs, webhook testing, and changelog',
      },
      {
        type: 'breaking',
        description: 'Removed legacy /api/v1/* REST endpoints — use tRPC procedures',
        migrationDeadline: '2026-08-24',
        docsHref: '/docs/api',
      },
      { type: 'security', description: 'Added HMAC-SHA256 webhook signature verification' },
    ],
  },
  {
    version: '0.6.0',
    date: '2026-02-10',
    title: 'Notification System & Email Integration',
    changes: [
      {
        type: 'feature',
        description: 'Real-time notification system with push, email, and in-app channels',
      },
      {
        type: 'feature',
        description: 'Email compose with rich text editor, templates, and scheduling',
      },
      { type: 'fix', description: 'Fixed notification badge count not updating on dismiss' },
    ],
  },
  {
    version: '0.5.0',
    date: '2026-01-27',
    title: 'Pipeline & Deal Management',
    changes: [
      {
        type: 'feature',
        description: 'Kanban board for deal pipeline with drag-and-drop stage progression',
      },
      { type: 'feature', description: 'Deal forecasting with weighted probability calculations' },
      {
        type: 'performance',
        description: 'Reduced pipeline page load time by 35% with virtualized lists',
      },
    ],
  },
  {
    version: '0.4.0',
    date: '2026-01-13',
    title: 'Contact Management Enhancements',
    changes: [
      {
        type: 'feature',
        description: 'Activity timeline for contacts with automatic event tracking',
      },
      { type: 'feature', description: 'Contact hierarchy and organization chart visualization' },
      {
        type: 'deprecation',
        description: 'ContactCard v1 props deprecated — migrate to v2 interface',
        migrationDeadline: '2026-07-13',
      },
    ],
  },
  {
    version: '0.3.0',
    date: '2025-12-30',
    title: 'AI-Powered Search & Analytics',
    changes: [
      {
        type: 'feature',
        description: 'AI search with natural language queries across all CRM entities',
      },
      { type: 'feature', description: 'Analytics dashboard with customizable KPI widgets' },
      { type: 'fix', description: 'Fixed search indexing delay for newly created records' },
    ],
  },
  {
    version: '0.2.0',
    date: '2025-12-16',
    title: 'Authentication & Security Foundation',
    changes: [
      { type: 'feature', description: 'Multi-factor authentication with TOTP and backup codes' },
      { type: 'security', description: 'CSRF protection on all mutation endpoints' },
      { type: 'fix', description: 'Fixed session expiry not redirecting to login' },
    ],
  },
  {
    version: '0.1.0',
    date: '2025-12-02',
    title: 'Initial Release',
    changes: [
      { type: 'feature', description: 'Core CRM with contacts, leads, and deal tracking' },
      { type: 'feature', description: 'Hexagonal architecture with DDD bounded contexts' },
      { type: 'feature', description: 'tRPC API with 25 routers and full TypeScript type safety' },
    ],
  },
];

const DISPLAY_DATES: Record<string, string> = {
  '2026-02-24': 'February 24, 2026',
  '2026-02-10': 'February 10, 2026',
  '2026-01-27': 'January 27, 2026',
  '2026-01-13': 'January 13, 2026',
  '2025-12-30': 'December 30, 2025',
  '2025-12-16': 'December 16, 2025',
  '2025-12-02': 'December 2, 2025',
};

function formatDate(isoDate: string): string {
  return DISPLAY_DATES[isoDate] ?? isoDate;
}

function hasBreakingChanges(entry: Readonly<ChangelogEntry>): boolean {
  return entry.changes.some((c) => c.type === 'breaking');
}

export function ChangelogDisplay({ entries = CHANGELOG_ENTRIES }: Readonly<{ entries?: ChangelogEntry[] }>) {
  if (entries.length === 0) {
    return <EmptyState entity="insights" phase="passive" />;
  }

  const latestHasBreaking = hasBreakingChanges(entries[0]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{entries.length} releases</span>
        </div>
        <a
          href="/api/developer/changelog-rss"
          aria-label="Subscribe to changelog RSS feed"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-md px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            rss_feed
          </span>{' '}
          RSS Feed
        </a>
      </div>

      {latestHasBreaking && (
        <div
          className="border-l-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20 p-4 rounded-r-lg"
          role="alert"
        >
          <div className="flex items-center gap-2 mb-1">
            <span
              className="material-symbols-outlined text-yellow-600 text-base"
              aria-hidden="true"
            >
              warning
            </span>
            <span className="font-medium text-sm">Breaking Changes in Latest Release</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Version {entries[0].version} includes breaking changes. Review the migration guide
            before upgrading.
          </p>
        </div>
      )}

      {entries.map((entry, index) => (
        <div key={entry.version}>
          <section id={`v${entry.version}`}>
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-3">
              <span>v{entry.version}</span>
              <span className="text-sm font-normal text-muted-foreground">
                {formatDate(entry.date)}
              </span>
            </h2>
            <p className="text-sm text-muted-foreground mt-1 mb-3">{entry.title}</p>
            <ul className="flex flex-col gap-2">
              {entry.changes.map((change, ci) => (
                <li key={ci} className="flex items-start gap-2"> {/* NOSONAR typescript:S6479 */}
                  <Badge variant={BADGE_VARIANT_MAP[change.type]} className="shrink-0 mt-0.5">
                    {change.type}
                  </Badge>
                  <span className="text-sm text-foreground">{change.description}</span>
                </li>
              ))}
            </ul>
          </section>
          {index < entries.length - 1 && <Separator className="mt-6" />}
        </div>
      ))}
    </div>
  );
}
