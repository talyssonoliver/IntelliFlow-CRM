import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function FeaturesPage() {
  return (
    <div className="container mx-auto px-4 py-12">
      <PlaceholderPage
        taskId="PG-002"
        title="Features"
        description="Discover the full power of IntelliFlow CRM's AI-driven features."
        group="public"
        sprint={11}
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Features' }]}
      />
    </div>
  );
}
