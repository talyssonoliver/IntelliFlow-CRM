import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function SecurityPage() {
  return (
    <div className="container mx-auto px-4 py-12">
      <PlaceholderPage
        taskId="PG-008"
        title="Security"
        description="How we protect your data with enterprise-grade security."
        group="public"
        sprint={15}
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Security' }]}
      />
    </div>
  );
}
