import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function TasksPage() {
  return (
    <PlaceholderPage taskId="PG-084" title="Tasks" description="Manage and track your sales tasks and follow-ups." group="dashboard" sprint={8}
      breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Tasks' }]} />
  );
}
