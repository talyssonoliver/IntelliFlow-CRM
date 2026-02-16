import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function SalesAnalyticsPage() {
  return (
    <PlaceholderPage taskId="PG-103" title="Sales Analytics" description="Revenue metrics, forecasting, and team performance." group="dashboard" sprint={12}
      breadcrumbs={[{ label: 'Analytics', href: '/analytics' }, { label: 'Sales' }]} />
  );
}
