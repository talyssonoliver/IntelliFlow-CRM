import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function HelpCenterPage() {
  return (
    <PlaceholderPage
      taskId="PG-042"
      title="Help Center"
      description="Find answers, guides, and documentation for IntelliFlow CRM."
      group="support"
      sprint={20}
      breadcrumbs={[{ label: 'Support', href: '/support/help-center' }, { label: 'Help Center' }]}
    />
  );
}
