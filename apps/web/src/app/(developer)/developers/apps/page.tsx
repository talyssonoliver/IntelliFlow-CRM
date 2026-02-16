import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function DeveloperAppsPage() {
  return (
    <PlaceholderPage
      taskId="PG-037"
      title="Your Apps"
      description="Manage your developer applications and API credentials."
      group="developer"
      sprint={23}
      breadcrumbs={[{ label: 'Developers', href: '/developers/api-docs' }, { label: 'Apps' }]}
    />
  );
}
