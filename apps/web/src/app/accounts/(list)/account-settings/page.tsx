'use client';

/**
 * Account Settings Page - PG-183
 *
 * Entry for the in-module account-settings page. Uses Pattern B
 * (dynamic import, SSR disabled) to keep the initial bundle small
 * and to match the PG-178 settings pattern.
 */

import dynamic from 'next/dynamic';
import { AccountSettingsLoading } from './AccountSettingsLoading';

const AccountSettingsContent = dynamic(() => import('./AccountSettingsContent'), {
  ssr: false,
  loading: () => <AccountSettingsLoading />,
});

export default function AccountSettingsPage() {
  return <AccountSettingsContent />;
}
