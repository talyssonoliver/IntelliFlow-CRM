'use client';

import { useRequireAuth } from '@/lib/auth/AuthContext';
import { PageHeader } from '@/components/shared';
import { QuietHoursScheduler } from '@/components/notifications';

export default function QuietHoursPage() {
  useRequireAuth();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: 'Notifications', href: '/notifications' }, { label: 'Quiet Hours' }]}
        title="Quiet Hours"
      />
      <QuietHoursScheduler />
    </div>
  );
}
