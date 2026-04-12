'use client';

import { useRequireAuth } from '@/lib/auth/AuthContext';
import { PageHeader } from '@/components/shared';
import { ChannelManager } from '@/components/notifications';

export default function NotificationChannelsPage() {
  useRequireAuth();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: 'Notifications', href: '/notifications' }, { label: 'Channels' }]}
        title="Notification Channels"
      />
      <ChannelManager />
    </div>
  );
}
