import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function LiveChatPage() {
  return (
    <PlaceholderPage
      taskId="PG-047"
      title="Live Chat"
      description="Get real-time support from our team."
      group="support"
      sprint={21}
      breadcrumbs={[{ label: 'Support', href: '/support/help-center' }, { label: 'Live Chat' }]}
    />
  );
}
