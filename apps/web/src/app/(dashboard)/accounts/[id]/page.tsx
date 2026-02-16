import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function AccountDetailPage({ params }: { params: { id: string } }) {
  return (
    <PlaceholderPage taskId="PG-071" title="Account Detail" description="Account overview with contacts and deals." group="dashboard" sprint={7}
      breadcrumbs={[{ label: 'Accounts', href: '/accounts' }, { label: 'Detail' }]} />
  );
}
