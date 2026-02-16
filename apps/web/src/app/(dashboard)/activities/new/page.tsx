import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function NewActivityPage() {
  return (
    <PlaceholderPage taskId="PG-081" title="Log Activity" description="Log a new call, meeting, or note." group="dashboard" sprint={7}
      breadcrumbs={[{ label: 'Activities', href: '/activities' }, { label: 'New Activity' }]} />
  );
}
