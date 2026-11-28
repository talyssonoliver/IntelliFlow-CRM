'use client';

import { trpc } from '@/lib/trpc';

/**
 * The tenant's one currency, from Analytics -> Report settings, read through the core
 * `reportSettings.currency` query so plans without Analytics get it too (codex 27/11). GBP while the
 * setting loads or if it cannot be read. Saving the setting invalidates this
 * query (ReportSettingsContent), so every figure follows without a reload.
 */
export function useTenantCurrency(): string {
  const query = trpc.analytics.reportSettings.currency.useQuery(undefined, {
    staleTime: 5 * 60_000,
  });
  const currency = query.data?.currency;
  return typeof currency === 'string' && currency.length > 0 ? currency : 'GBP';
}

/**
 * For forms that SAVE a money value (codex review 26/11): the currency plus whether it is really
 * known. `useTenantCurrency` shows GBP while the setting loads or when it fails, which is right
 * for display but would save a new deal in GBP for a tenant that uses another currency. A create
 * form waits until `ready`, and offers `retry` when the setting could not be read.
 */
export function useTenantCurrencyForSave(): {
  currency: string;
  ready: boolean;
  failed: boolean;
  retry: () => void;
} {
  const query = trpc.analytics.reportSettings.currency.useQuery(undefined, {
    staleTime: 5 * 60_000,
  });
  const value = query.data?.currency;
  const known = typeof value === 'string' && value.length > 0;
  return {
    currency: known ? value : 'GBP',
    ready: query.isSuccess === true,
    failed: query.isError === true,
    retry: () => void query.refetch(),
  };
}
