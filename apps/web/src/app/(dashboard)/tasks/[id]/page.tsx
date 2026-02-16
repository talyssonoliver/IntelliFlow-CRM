import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function TaskDetailPage({ params }: { params: { id: string } }) {
  return (
    <PlaceholderPage taskId="PG-085" title="Task Detail" description="View task details, assignee, and status." group="dashboard" sprint={8}
      breadcrumbs={[{ label: 'Tasks', href: '/tasks' }, { label: 'Detail' }]} />
  );
}
