import { Suspense } from 'react';
import AccountSettingsContent from './AccountSettingsContent';
import { AccountSettingsLoading } from './AccountSettingsLoading';

export default function AccountSettingsPage() {
  return (
    <Suspense fallback={<AccountSettingsLoading />}>
      <AccountSettingsContent />
    </Suspense>
  );
}
