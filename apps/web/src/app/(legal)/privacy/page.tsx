import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function PrivacyPage() {
  return (
    <PlaceholderPage
      taskId="PG-049"
      title="Privacy Policy"
      description="How IntelliFlow collects, uses, and protects your data."
      group="legal"
      sprint={15}
      breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Privacy Policy' }]}
    />
  );
}
