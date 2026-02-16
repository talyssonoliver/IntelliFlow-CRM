import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function EmailsPage() {
  return (
    <PlaceholderPage taskId="PG-087" title="Email Inbox" description="Unified email inbox with AI-powered insights." group="dashboard" sprint={10}
      breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Emails' }]} />
  );
}
