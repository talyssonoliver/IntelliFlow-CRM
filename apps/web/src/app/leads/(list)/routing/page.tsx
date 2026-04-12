import { Suspense } from 'react';
import RoutingContent from '@/app/settings/routing/RoutingContent';
import RoutingLoading from '@/app/settings/routing/RoutingLoading';

export default function RoutingSettingsPage() {
  return (
    <Suspense fallback={<RoutingLoading />}>
      <RoutingContent />
    </Suspense>
  );
}
