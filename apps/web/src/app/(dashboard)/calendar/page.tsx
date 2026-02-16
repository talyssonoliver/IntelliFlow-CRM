import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function CalendarPage() {
  return (
    <PlaceholderPage taskId="PG-083" title="Calendar" description="Calendar view of activities, meetings, and deadlines." group="dashboard" sprint={10}
      breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Calendar' }]} />
  );
}
