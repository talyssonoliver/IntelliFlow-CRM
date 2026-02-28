import { buildRssFeed } from '@/lib/developer/rss-feed';
import { CHANGELOG_ENTRIES } from '@/components/developer/changelog-display';

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://intelliflow-crm.com';

  const xml = buildRssFeed({
    baseUrl,
    title: 'IntelliFlow CRM Changelog',
    description:
      'Release notes, version history, and breaking change notifications for IntelliFlow CRM',
    entries: CHANGELOG_ENTRIES,
  });

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
