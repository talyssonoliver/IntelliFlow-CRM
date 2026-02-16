import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function ReportDetailPage({ params }: { params: { id: string } }) {
  return (
    <PlaceholderPage taskId="PG-086" title="Report Detail" description="View and export report data." group="dashboard" sprint={12}
      breadcrumbs={[{ label: 'Reports', href: '/reports' }, { label: 'Report' }]} />
  );
}
