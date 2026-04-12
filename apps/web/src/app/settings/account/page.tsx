'use client';

import dynamic from 'next/dynamic';
import { AccountSettingsLoading } from './AccountSettingsLoading';

const AccountSettingsContent = dynamic(() => import('./AccountSettingsContent'), {
  ssr: false,
  loading: () => <AccountSettingsLoading />,
});

export default function AccountSettingsPage() {
  return <AccountSettingsContent />;
}
