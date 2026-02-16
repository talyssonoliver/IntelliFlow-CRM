import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function PressPage() {
  return (
    <div className="container mx-auto px-4 py-12">
      <PlaceholderPage
        taskId="PG-007"
        title="Press"
        description="Press releases, media kit, and company news."
        group="public"
        sprint={18}
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Press' }]}
      />
    </div>
  );
}
