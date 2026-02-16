import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function DocumentsPage() {
  return (
    <PlaceholderPage taskId="PG-099" title="Documents" description="Document management with version control." group="dashboard" sprint={16}
      breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Documents' }]} />
  );
}
