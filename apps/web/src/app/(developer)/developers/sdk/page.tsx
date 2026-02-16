import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function SdkGuidesPage() {
  return (
    <PlaceholderPage
      taskId="PG-036"
      title="SDK Guides"
      description="Client libraries and SDK documentation for all supported languages."
      group="developer"
      sprint={23}
      breadcrumbs={[{ label: 'Developers', href: '/developers/api-docs' }, { label: 'SDK Guides' }]}
    />
  );
}
