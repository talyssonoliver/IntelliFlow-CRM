import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function ComposeEmailPage() {
  return (
    <PlaceholderPage taskId="PG-088" title="Compose Email" description="AI-assisted email composition with templates." group="dashboard" sprint={10}
      breadcrumbs={[{ label: 'Emails', href: '/emails' }, { label: 'Compose' }]} />
  );
}
