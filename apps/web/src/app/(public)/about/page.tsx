import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function AboutPage() {
  return (
    <div className="container mx-auto px-4 py-12">
      <PlaceholderPage
        taskId="PG-004"
        title="About Us"
        description="The team and mission behind IntelliFlow CRM."
        group="public"
        sprint={12}
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'About' }]}
      />
    </div>
  );
}
