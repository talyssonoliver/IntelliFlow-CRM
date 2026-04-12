import type { Metadata } from 'next';
import { ChangelogDisplay } from '@/components/developer/changelog-display';

export const metadata: Metadata = {
  title: 'Changelog | IntelliFlow CRM',
  description:
    'Release notes, version history, and breaking change notifications for IntelliFlow CRM platform updates',
  alternates: {
    types: {
      'application/rss+xml': '/api/developer/changelog-rss',
    },
  },
};

export default function ChangelogPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-5xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Changelog</h1>
          <p className="text-muted-foreground mt-1">
            Track platform releases, breaking changes, and migration deadlines for IntelliFlow CRM
          </p>
        </div>
        <ChangelogDisplay />
      </div>
    </div>
  );
}
