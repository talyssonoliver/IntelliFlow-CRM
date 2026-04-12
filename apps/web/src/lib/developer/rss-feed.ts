export type ChangelogEntryType =
  | 'feature'
  | 'fix'
  | 'breaking'
  | 'deprecation'
  | 'security'
  | 'performance';

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  changes: ChangelogChange[];
}

export interface ChangelogChange {
  type: ChangelogEntryType;
  description: string;
  affectedProcedure?: string;
  migrationDeadline?: string;
  docsHref?: string;
  sourceRef?: string;
}

export interface RssFeedOptions {
  baseUrl: string;
  title: string;
  description: string;
  entries: ChangelogEntry[];
}

export function escapeXml(str: string): string {
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function formatRssDate(isoDate: string): string {
  return new Date(isoDate).toUTCString();
}

function hasBreakingChanges(entry: ChangelogEntry): boolean {
  return entry.changes.some((c) => c.type === 'breaking');
}

export function buildRssFeed(options: RssFeedOptions): string {
  const { baseUrl, title, description, entries } = options;
  const feedUrl = `${baseUrl}/api/developer/changelog-rss`;

  const items = entries
    .map((entry) => {
      const breaking = hasBreakingChanges(entry);
      const itemTitle = breaking
        ? `[BREAKING] v${entry.version} — ${escapeXml(entry.title)}`
        : `v${entry.version} — ${escapeXml(entry.title)}`;

      const changeList = entry.changes
        .map((c) => `• [${c.type}] ${escapeXml(c.description)}`)
        .join('\n');

      return `    <item>
      <title>${itemTitle}</title>
      <link>${baseUrl}/docs/changelog#v${entry.version}</link>
      <guid isPermaLink="false">${baseUrl}/changelog/v${entry.version}</guid>
      <pubDate>${formatRssDate(entry.date)}</pubDate>
      <description>${escapeXml(changeList)}</description>
    </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${baseUrl}/docs/changelog</link>
    <description>${escapeXml(description)}</description>
    <language>en-us</language>
    <atom:link href="${feedUrl}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;
}
