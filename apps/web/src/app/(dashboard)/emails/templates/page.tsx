import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function EmailTemplatesPage() {
  return (
    <PlaceholderPage taskId="PG-090" title="Email Templates" description="Manage email templates with AI-generated variants." group="dashboard" sprint={11}
      breadcrumbs={[{ label: 'Emails', href: '/emails' }, { label: 'Templates' }]} />
  );
}
