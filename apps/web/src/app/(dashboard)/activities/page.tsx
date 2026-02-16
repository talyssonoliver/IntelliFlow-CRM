import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function ActivitiesPage() {
  return (
    <PlaceholderPage taskId="PG-080" title="Activities" description="Activity feed with calls, meetings, emails, and tasks." group="dashboard" sprint={7}
      breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Activities' }]} />
  );
}
