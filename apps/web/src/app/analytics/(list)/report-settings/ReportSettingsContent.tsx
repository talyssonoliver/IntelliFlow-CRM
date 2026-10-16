'use client';

// Report Settings Content — PG-187
// Report-specific state/validation over the shared ModuleSettingsShell, which
// owns the page chrome (skeleton / error / header actions / grid / reset dialog).
// Migrated onto the shell by GH #576 (MODULE-SETTINGS-SHELL-SIBLING-MIGRATION-001).

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { trpc } from '@/lib/trpc';
import { Card, toast } from '@intelliflow/ui';
import { ModuleSettingsShell } from '@/components/shared/module-settings-shell';
import {
  reportSettingsSchema,
  DEFAULT_REPORT_SETTINGS,
  type DefaultRange,
} from '@intelliflow/validators';
import { DefaultRangeSection } from './components/DefaultRangeSection';
import { CurrencySection } from './components/CurrencySection';

// PG-201: scheduled delivery moved to /analytics/scheduled-reports (one schedule
// per template instead of one tenant-wide setting). This page no longer reads or
// writes report_settings.scheduledDelivery.
const pageSettingsSchema = reportSettingsSchema.pick({ defaultRange: true, currency: true });

function parseServerSnapshot(data: unknown): { defaultRange: DefaultRange; currency: string } {
  const parsed = pageSettingsSchema.safeParse(data);
  if (parsed.success) {
    return { defaultRange: parsed.data.defaultRange, currency: parsed.data.currency };
  }
  return {
    defaultRange: DEFAULT_REPORT_SETTINGS.defaultRange,
    currency: DEFAULT_REPORT_SETTINGS.currency,
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
  const [initialSnapshot, setInitialSnapshot] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  // ─── Sync server data → local state (with Zod parse) ──────────────────────
  useEffect(() => {
    if (!settingsQuery.data) return;
    const snap = parseServerSnapshot(settingsQuery.data);
    setDefaultRange(snap.defaultRange);
    setCurrency(snap.currency);
    setInitialSnapshot(JSON.stringify(snap));
  }, [settingsQuery.data]);

  const currentSnapshot = useMemo(
    () => JSON.stringify({ defaultRange, currency }),
    [defaultRange, currency]
  );
  const isDirty = initialSnapshot !== null && currentSnapshot !== initialSnapshot;

  const isSaving = updateMutation.isPending || resetMutation.isPending;
  const canSave = isDirty && !isSaving;

  // ─── Handlers ──────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    try {
      await updateMutation.mutateAsync({ defaultRange, currency });
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
  }, [currency, defaultRange, updateMutation]);

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
      description="Configure the default date range and display currency for analytics reports."
      errorTitle="Failed to load report settings"
      isLoading={authLoading || settingsQuery.isLoading}
      errorMessage={settingsQuery.error?.message ?? null}
      isSaving={isSaving}
      canSave={canSave}
      onSave={handleSave}
      resetOpen={resetOpen}
      onResetOpenChange={setResetOpen}
      onResetConfirm={handleReset}
      resetDescription="This will restore the default date range and currency to their factory defaults. Scheduled reports are not affected. This action cannot be undone."
    >
      <DefaultRangeSection value={defaultRange} onChange={(v) => setDefaultRange(v)} />
      <CurrencySection value={currency} onChange={(v) => setCurrency(v)} />
      <Card className="p-4 sm:p-5 lg:col-span-12" data-testid="scheduled-delivery-moved">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                schedule_send
              </span>
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Scheduled delivery has moved
              </h3>
              <p className="text-sm text-muted-foreground">
                Set up recurring report emails per template, each with its own cadence, timezone and
                recipients.
              </p>
            </div>
          </div>
          <Link
            href="/analytics/scheduled-reports"
            className="inline-flex shrink-0 items-center justify-center rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Open Scheduled Reports
          </Link>
        </div>
      </Card>
    </ModuleSettingsShell>
  );
}
