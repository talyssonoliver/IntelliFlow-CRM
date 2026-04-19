'use client';

// Report Settings Content — PG-187
// Orchestration client component for /analytics/report-settings.
// Composes ModuleSettingsLayout (PG-178) with 3 tabs.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { trpc } from '@/lib/trpc';
import { toast, Card, Button } from '@intelliflow/ui';
import {
  ModuleSettingsLayout,
  type ModuleSettingsTab,
} from '@/components/settings/ModuleSettingsLayout';
import type { ScheduledDelivery } from '@intelliflow/validators';
import { DefaultRangeTab, type DefaultRangeValue } from './components/DefaultRangeTab';
import { CurrencyTab } from './components/CurrencyTab';
import { ScheduledDeliveryTab } from './components/ScheduledDeliveryTab';

const FALLBACK_SCHEDULED_DELIVERY: ScheduledDelivery = {
  enabled: false,
  frequency: 'weekly',
  dayOfWeek: 1,
  time: '09:00',
  recipients: [],
  format: 'pdf',
};

export default function ReportSettingsContent() {
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();

  // ─── tRPC ──────────────────────────────────────────────────────────────────
  const utils = trpc.useUtils();
  const settingsQuery = trpc.analytics.reportSettings.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const updateMutation = trpc.analytics.reportSettings.update.useMutation({
    onSuccess: () => utils.analytics.reportSettings.get.invalidate(),
  });
  const resetMutation = trpc.analytics.reportSettings.resetToDefaults.useMutation({
    onSuccess: () => utils.analytics.reportSettings.get.invalidate(),
  });

  // ─── Local State ───────────────────────────────────────────────────────────
  const [defaultRange, setDefaultRange] = useState<DefaultRangeValue>('30d');
  const [currency, setCurrency] = useState<string>('USD');
  const [scheduledDelivery, setScheduledDelivery] = useState<ScheduledDelivery>(
    FALLBACK_SCHEDULED_DELIVERY
  );
  const [isDirty, setIsDirty] = useState(false);

  // ─── Sync server data → local state ────────────────────────────────────────
  useEffect(() => {
    if (!settingsQuery.data) return;
    const d = settingsQuery.data;
    setDefaultRange((d.defaultRange as DefaultRangeValue) ?? '30d');
    setCurrency(d.currency ?? 'USD');
    const parsed = (d.scheduledDelivery ?? {}) as Partial<ScheduledDelivery>;
    setScheduledDelivery({
      enabled: parsed.enabled ?? false,
      frequency: parsed.frequency ?? 'weekly',
      dayOfWeek: parsed.dayOfWeek,
      time: parsed.time ?? '09:00',
      recipients: parsed.recipients ?? [],
      format: parsed.format ?? 'pdf',
    });
    setIsDirty(false);
  }, [settingsQuery.data]);

  // ─── Handlers ──────────────────────────────────────────────────────────────
  const handleDefaultRangeChange = useCallback((value: DefaultRangeValue) => {
    setDefaultRange(value);
    setIsDirty(true);
  }, []);

  const handleCurrencyChange = useCallback((code: string) => {
    setCurrency(code);
    setIsDirty(true);
  }, []);

  const handleScheduledDeliveryChange = useCallback((value: ScheduledDelivery) => {
    setScheduledDelivery(value);
    setIsDirty(true);
  }, []);

  const recipientsInvalid = scheduledDelivery.enabled && scheduledDelivery.recipients.length === 0;

  const handleSave = useCallback(async () => {
    if (recipientsInvalid) {
      toast({
        title: 'Cannot save',
        description: 'At least one recipient is required when scheduled delivery is enabled.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await updateMutation.mutateAsync({
        defaultRange,
        currency,
        scheduledDelivery,
      });
      setIsDirty(false);
      toast({
        title: 'Settings saved',
        description: 'Report settings have been updated successfully.',
      });
    } catch (err) {
      toast({
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }, [currency, defaultRange, recipientsInvalid, scheduledDelivery, updateMutation]);

  const handleReset = useCallback(async () => {
    try {
      await resetMutation.mutateAsync();
      toast({
        title: 'Reset to defaults',
        description: 'Report settings restored to factory defaults.',
      });
    } catch (err) {
      toast({
        title: 'Reset failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }, [resetMutation]);

  // ─── Tabs ──────────────────────────────────────────────────────────────────
  const tabs = useMemo<ModuleSettingsTab[]>(
    () => [
      {
        value: 'default-range',
        label: 'Default Range',
        content: <DefaultRangeTab value={defaultRange} onChange={handleDefaultRangeChange} />,
      },
      {
        value: 'currency',
        label: 'Currency',
        content: <CurrencyTab value={currency} onChange={handleCurrencyChange} />,
      },
      {
        value: 'scheduled-delivery',
        label: 'Scheduled Delivery',
        content: (
          <ScheduledDeliveryTab
            value={scheduledDelivery}
            onChange={handleScheduledDeliveryChange}
          />
        ),
      },
    ],
    [
      currency,
      defaultRange,
      handleCurrencyChange,
      handleDefaultRangeChange,
      handleScheduledDeliveryChange,
      scheduledDelivery,
    ]
  );

  // ─── Early returns ─────────────────────────────────────────────────────────
  if (authLoading || settingsQuery.isLoading) {
    return (
      <div className="max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            <div className="h-10 bg-muted animate-pulse rounded-md" />
            <div className="h-64 bg-muted animate-pulse rounded-md" />
          </div>
          <div className="lg:col-span-1">
            <div className="h-40 bg-muted animate-pulse rounded-md" />
          </div>
        </div>
      </div>
    );
  }

  if (settingsQuery.error) {
    return (
      <div className="max-w-7xl">
        <Card className="p-6 text-center">
          <h2 className="text-lg font-semibold">Failed to load report settings</h2>
          <p className="text-sm text-muted-foreground mt-2">{settingsQuery.error.message}</p>
          <Button onClick={() => settingsQuery.refetch()} className="mt-4">
            Retry
          </Button>
        </Card>
      </div>
    );
  }

  const lastUpdated = settingsQuery.data?.updatedAt ? new Date(settingsQuery.data.updatedAt) : null;

  return (
    <ModuleSettingsLayout
      title="Report Settings"
      description="Configure default date range, display currency, and scheduled report delivery."
      breadcrumbs={[
        { label: 'Dashboard', href: '/' },
        { label: 'Analytics', href: '/analytics' },
        { label: 'Report Settings' },
      ]}
      tabs={tabs}
      onSave={handleSave}
      onReset={handleReset}
      isSaving={updateMutation.isPending || resetMutation.isPending}
      isDirty={isDirty && !recipientsInvalid}
      lastUpdated={lastUpdated}
    />
  );
}
