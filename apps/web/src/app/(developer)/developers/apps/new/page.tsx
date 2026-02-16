import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function NewAppPage() {
  return (
    <PlaceholderPage
      taskId="PG-037"
      title="Create App"
      description="Register a new developer application."
      group="developer"
      sprint={23}
      breadcrumbs={[{ label: 'Developers', href: '/developers/api-docs' }, { label: 'Apps', href: '/developers/apps' }, { label: 'New App' }]}
    />
  );
}
