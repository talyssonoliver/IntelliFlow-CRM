/**
 * Account Tiers Page - PG-196
 *
 * Server Component shell — streams the skeleton immediately, then hydrates
 * AccountTiersContent (client component) via Suspense. Matches the PG-183
 * account-settings pattern.
 */

import { Suspense } from 'react';
import AccountTiersContent from './AccountTiersContent';
import { AccountTiersLoading } from './AccountTiersLoading';

export default function AccountTiersPage() {
  return (
    <Suspense fallback={<AccountTiersLoading />}>
      <AccountTiersContent />
    </Suspense>
  );
}
