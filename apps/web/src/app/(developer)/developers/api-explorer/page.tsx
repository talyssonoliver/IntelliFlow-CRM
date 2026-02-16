import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function ApiExplorerPage() {
  return (
    <PlaceholderPage
      taskId="PG-039"
      title="API Explorer"
      description="Interactive API testing tool for trying endpoints live."
      group="developer"
      sprint={24}
      breadcrumbs={[{ label: 'Developers', href: '/developers/api-docs' }, { label: 'API Explorer' }]}
    />
  );
}
