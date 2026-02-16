import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function ContactPage() {
  return (
    <div className="container mx-auto px-4 py-12">
      <PlaceholderPage
        taskId="PG-005"
        title="Contact Us"
        description="Get in touch with our sales and support teams."
        group="public"
        sprint={12}
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Contact' }]}
      />
    </div>
  );
}
