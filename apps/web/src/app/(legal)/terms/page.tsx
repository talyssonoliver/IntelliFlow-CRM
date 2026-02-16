import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function TermsPage() {
  return (
    <PlaceholderPage
      taskId="PG-050"
      title="Terms of Service"
      description="The terms and conditions governing use of IntelliFlow CRM."
      group="legal"
      sprint={15}
      breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Terms of Service' }]}
    />
  );
}
