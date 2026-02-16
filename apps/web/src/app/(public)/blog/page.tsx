import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function BlogPage() {
  return (
    <div className="container mx-auto px-4 py-12">
      <PlaceholderPage
        taskId="PG-009"
        title="Blog"
        description="Insights on CRM, AI in sales, and product updates."
        group="public"
        sprint={14}
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Blog' }]}
      />
    </div>
  );
}
