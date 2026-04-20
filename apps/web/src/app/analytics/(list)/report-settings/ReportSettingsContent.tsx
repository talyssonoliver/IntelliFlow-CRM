'use client';

// Report Settings Content — PG-187
// PageHeader + 12-col bento grid (playbook §1).
// Replaces the prior deprecated-layout-based orchestrator.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { trpc } from '@/lib/trpc';
import { Card, ConfirmationDialog, toast } from '@intelliflow/ui';
import { PageHeader, type PageAction } from '@/components/shared/page-header';
import {
  reportSettingsSchema,
  DEFAULT_REPORT_SETTINGS,
  type DefaultRange,
  type ScheduledDelivery,
} from '@intelliflow/validators';
import { DefaultRangeSection } from './components/DefaultRangeSection';
import { CurrencySection } from './components/CurrencySection';
import { ScheduledDeliverySection } from './components/ScheduledDeliverySection';

function parseServerSnapshot(data: unknown): {
  defaultRange: DefaultRange;
  currency: string;
  scheduledDelivery: ScheduledDelivery;
} {
  const parsed = reportSettingsSchema.safeParse(data);
  if (parsed.success) return parsed.data;
  return {
    defaultRange: DEFAULT_REPORT_SETTINGS.defaultRange,
    currency: DEFAULT_REPORT_SETTINGS.currency,
    scheduledDelivery: DEFAULT_REPORT_SETTINGS.scheduledDelivery,
  };
}

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

  // ─── Local state ───────────────────────────────────────────────────────────
  const [defaultRange, setDefaultRange] = useState<DefaultRange>(
    DEFAULT_REPORT_SETTINGS.defaultRange
  );
  const [currency, setCurrency] = useState<string>(DEFAULT_REPORT_SETTINGS.currency);
  const [scheduledDelivery, setScheduledDelivery] = useState<ScheduledDelivery>(
    DEFAULT_REPORT_SETTINGS.scheduledDelivery
  );
  const [initialSnapshot, setInitialSnapshot] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  // ─── Sync server data → local state (with Zod parse) ──────────────────────
  useEffect(() => {
    if (!settingsQuery.data) return;
    const snap = parseServerSnapshot(settingsQuery.data);
    setDefaultRange(snap.defaultRange);
    setCurrency(snap.currency);
    setScheduledDelivery(snap.scheduledDelivery);
    setInitialSnapshot(JSON.stringify(snap));
  }, [settingsQuery.data]);

  const currentSnapshot = useMemo(
    () => JSON.stringify({ defaultRange, currency, scheduledDelivery }),
    [defaultRange, currency, scheduledDelivery]
  );
  const isDirty = initialSnapshot !== null && currentSnapshot !== initialSnapshot;

  const recipientsInvalid = scheduledDelivery.enabled && scheduledDelivery.recipients.length === 0;

  const isSaving = updateMutation.isPending || resetMutation.isPending;
  const canSave = isDirty && !isSaving && !recipientsInvalid;

  // ─── Handlers ──────────────────────────────────────────────────────────────
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
      setResetOpen(false);
    } catch (err) {
      toast({
        title: 'Reset failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }, [resetMutation]);

  // ─── Early returns ─────────────────────────────────────────────────────────
  if (authLoading || settingsQuery.isLoading) {
    return (
      <div className="w-full">
        <div className="mb-6">
          <div className="h-7 bg-muted animate-pulse rounded-md w-64 mb-2" />
          <div className="h-4 bg-muted animate-pulse rounded-md w-96" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
          <div className="lg:col-span-6 h-48 bg-muted animate-pulse rounded-md" />
          <div className="lg:col-span-6 h-48 bg-muted animate-pulse rounded-md" />
          <div className="lg:col-span-12 h-64 bg-muted animate-pulse rounded-md" />
        </div>
      </div>
    );
  }

  if (settingsQuery.error) {
    return (
      <div className="w-full">
        <Card className="p-6 text-center">
          <h2 className="text-lg font-semibold">Failed to load report settings</h2>
          <p className="text-sm text-muted-foreground mt-2">{settingsQuery.error.message}</p>
        </Card>
      </div>
    );
  }

  const actions: PageAction[] = [
    {
      label: 'Reset to Defaults',
      variant: 'secondary',
      onClick: () => setResetOpen(true),
      disabled: isSaving,
    },
    {
      label: isSaving ? 'Saving…' : 'Save Changes',
      variant: 'primary',
      onClick: handleSave,
      disabled: !canSave,
      loading: isSaving,
    },
  ];

  return (
    <div className="w-full">
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Analytics', href: '/analytics' },
          { label: 'Report Settings' },
        ]}
        title="Report Settings"
        description="Configure default date range, display currency, and scheduled report delivery."
        actions={actions}
        className="mb-6"
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        <DefaultRangeSection value={defaultRange} onChange={(v) => setDefaultRange(v)} />
        <CurrencySection value={currency} onChange={(v) => setCurrency(v)} />
        <ScheduledDeliverySection
          value={scheduledDelivery}
          onChange={(v) => setScheduledDelivery(v)}
        />
      </div>

      <ConfirmationDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset to Defaults"
        description="This will restore all report settings to their factory defaults. This action cannot be undone."
        confirmLabel="Reset"
        variant="destructive"
        onConfirm={handleReset}
      />
    </div>
  );
}
