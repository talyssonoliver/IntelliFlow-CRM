import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function SandboxPage() {
  return (
    <PlaceholderPage
      taskId="PG-040"
      title="Sandbox"
      description="Test environment for developing integrations safely."
      group="developer"
      sprint={24}
      breadcrumbs={[{ label: 'Developers', href: '/developers/api-docs' }, { label: 'Sandbox' }]}
    />
  );
}
