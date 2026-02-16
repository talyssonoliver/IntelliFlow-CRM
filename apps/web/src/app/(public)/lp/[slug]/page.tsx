import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function LandingPage({ params }: { params: { slug: string } }) {
  return (
    <div className="container mx-auto px-4 py-12">
      <PlaceholderPage
        taskId="PG-013"
        title="Landing Page"
        description="Dynamic marketing landing page template."
        group="public"
        sprint={16}
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Campaign' }]}
      />
    </div>
  );
}
