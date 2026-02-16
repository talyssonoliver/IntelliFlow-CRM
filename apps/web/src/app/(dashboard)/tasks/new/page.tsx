import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function NewTaskPage() {
  return (
    <PlaceholderPage taskId="PG-084" title="New Task" description="Create a new task or follow-up reminder." group="dashboard" sprint={8}
      breadcrumbs={[{ label: 'Tasks', href: '/tasks' }, { label: 'New Task' }]} />
  );
}
