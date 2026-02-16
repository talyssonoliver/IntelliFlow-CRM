import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function CookiePolicyPage() {
  return (
    <PlaceholderPage
      taskId="PG-051"
      title="Cookie Policy"
      description="How IntelliFlow uses cookies and similar technologies."
      group="legal"
      sprint={15}
      breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Cookie Policy' }]}
    />
  );
}
