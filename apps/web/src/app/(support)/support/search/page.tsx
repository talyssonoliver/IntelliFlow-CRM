import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function SupportSearchPage() {
  return (
    <PlaceholderPage
      taskId="PG-043"
      title="Search Results"
      description="Search help articles and documentation."
      group="support"
      sprint={20}
      breadcrumbs={[{ label: 'Support', href: '/support/help-center' }, { label: 'Search' }]}
    />
  );
}
