import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function PipelinePage() {
  return (
    <PlaceholderPage taskId="PG-078" title="Pipeline Board" description="Kanban-style deal pipeline with drag-and-drop." group="dashboard" sprint={9}
      breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Pipeline' }]} />
  );
}
