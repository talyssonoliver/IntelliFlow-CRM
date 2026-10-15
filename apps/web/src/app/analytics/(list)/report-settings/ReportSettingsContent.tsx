'use client';

// Report Settings Content — PG-187
// Report-specific state/validation over the shared ModuleSettingsShell, which
// owns the page chrome (skeleton / error / header actions / grid / reset dialog).
// Migrated onto the shell by GH #576 (MODULE-SETTINGS-SHELL-SIBLING-MIGRATION-001).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { trpc } from '@/lib/trpc';
import { toast } from '@intelliflow/ui';
import { ModuleSettingsShell } from '@/components/shared/module-settings-shell';
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

  // ─── Render ────────────────────────────────────────────────────────────────
  // The chrome (skeleton / error card / header actions / section grid / reset
  // dialog) lives in ModuleSettingsShell; this component only supplies its
  // config + sections. See components/shared/module-settings-shell.tsx.
  return (
    <ModuleSettingsShell
      breadcrumbs={[
        { label: 'Dashboard', href: '/' },
        { label: 'Analytics', href: '/analytics' },
        { label: 'Report Settings' },
      ]}
      title="Report Settings"
      description="Configure default date range, display currency, and scheduled report delivery."
      errorTitle="Failed to load report settings"
      isLoading={authLoading || settingsQuery.isLoading}
      errorMessage={settingsQuery.error?.message ?? null}
      isSaving={isSaving}
      canSave={canSave}
      onSave={handleSave}
      resetOpen={resetOpen}
      onResetOpenChange={setResetOpen}
      onResetConfirm={handleReset}
      resetDescription="This will restore all report settings to their factory defaults. This action cannot be undone."
    >
      <DefaultRangeSection value={defaultRange} onChange={(v) => setDefaultRange(v)} />
      <CurrencySection value={currency} onChange={(v) => setCurrency(v)} />
      <ScheduledDeliverySection
        value={scheduledDelivery}
        onChange={(v) => setScheduledDelivery(v)}
      />
    </ModuleSettingsShell>
  );
}
