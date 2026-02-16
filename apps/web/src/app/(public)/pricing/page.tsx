import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function PricingPage() {
  return (
    <div className="container mx-auto px-4 py-12">
      <PlaceholderPage
        taskId="PG-003"
        title="Pricing"
        description="Simple, transparent pricing for teams of all sizes."
        group="public"
        sprint={11}
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Pricing' }]}
      />
    </div>
  );
}
