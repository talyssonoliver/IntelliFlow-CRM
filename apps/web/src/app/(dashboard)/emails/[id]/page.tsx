import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function EmailDetailPage({ params }: { params: { id: string } }) {
  return (
    <PlaceholderPage taskId="PG-089" title="Email Detail" description="View email thread with AI analysis." group="dashboard" sprint={10}
      breadcrumbs={[{ label: 'Emails', href: '/emails' }, { label: 'Email' }]} />
  );
}
