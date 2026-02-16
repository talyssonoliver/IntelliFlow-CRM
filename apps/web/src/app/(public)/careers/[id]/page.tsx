import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function CareerDetailPage({ params }: { params: { id: string } }) {
  return (
    <div className="container mx-auto px-4 py-12">
      <PlaceholderPage
        taskId="PG-012"
        title="Job Detail"
        description="Individual job listing with application form."
        group="public"
        sprint={20}
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Careers', href: '/careers' }, { label: 'Position' }]}
      />
    </div>
  );
}
