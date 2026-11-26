'use client';

import { trpc } from '@/lib/trpc';

/**
 * The tenant's one currency, from Analytics -> Report settings. GBP while the
 * setting loads or if it cannot be read. Saving the setting invalidates this
 * query (ReportSettingsContent), so every figure follows without a reload.
 */
export function useTenantCurrency(): string {
  const query = trpc.analytics.reportSettings.get.useQuery(undefined, {
    staleTime: 5 * 60_000,
  });
  const currency = query.data?.currency;
  return typeof currency === 'string' && currency.length > 0 ? currency : 'GBP';
}
