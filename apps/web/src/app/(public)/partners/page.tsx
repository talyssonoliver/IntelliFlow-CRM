import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function PartnersPage() {
  return (
    <div className="container mx-auto px-4 py-12">
      <PlaceholderPage
        taskId="PG-006"
        title="Partners"
        description="Explore our partner ecosystem and integration marketplace."
        group="public"
        sprint={18}
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Partners' }]}
      />
    </div>
  );
}
