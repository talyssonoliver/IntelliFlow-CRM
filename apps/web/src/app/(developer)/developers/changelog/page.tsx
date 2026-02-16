import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function ChangelogPage() {
  return (
    <PlaceholderPage
      taskId="PG-038"
      title="Changelog"
      description="API changes, new features, and version history."
      group="developer"
      sprint={23}
      breadcrumbs={[{ label: 'Developers', href: '/developers/api-docs' }, { label: 'Changelog' }]}
    />
  );
}
