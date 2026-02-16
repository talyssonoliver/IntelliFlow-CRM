import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function AppDetailPage({ params }: { params: { id: string } }) {
  return (
    <PlaceholderPage
      taskId="PG-037"
      title="App Details"
      description="Manage application settings and credentials."
      group="developer"
      sprint={23}
      breadcrumbs={[{ label: 'Developers', href: '/developers/api-docs' }, { label: 'Apps', href: '/developers/apps' }, { label: 'App' }]}
    />
  );
}
