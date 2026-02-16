import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function CareersPage() {
  return (
    <div className="container mx-auto px-4 py-12">
      <PlaceholderPage
        taskId="PG-011"
        title="Careers"
        description="Join the IntelliFlow team and shape the future of CRM."
        group="public"
        sprint={20}
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Careers' }]}
      />
    </div>
  );
}
