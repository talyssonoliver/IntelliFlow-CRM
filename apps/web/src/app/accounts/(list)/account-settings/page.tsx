/**
 * Account Settings Page - PG-183
 *
 * Server Component shell — streams the skeleton immediately, then hydrates
 * AccountSettingsContent (client component) via Suspense. Matches the
 * PG-182 contact-settings pattern.
 */

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
