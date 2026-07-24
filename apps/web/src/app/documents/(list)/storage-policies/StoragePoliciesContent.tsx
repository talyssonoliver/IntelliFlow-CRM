'use client';

// Storage Policies Content — PG-206
// Standalone /documents/storage-policies destination. Surfaces the per-tenant
// document retention policies (retention period, auto-archive, legal-hold
// override) that are also editable inside Document Settings, as a focused page
// reachable from the Documents settings sidebar.
//
// DRY: reuses the RetentionPoliciesTab controlled component and the
// documentSettings.retentionPolicies tRPC sub-router (getAll / updateAll /
// resetToDefaults) — the same backend surface Document Settings drives. No new
// router or model is introduced; the backend already exists on main.

import { useEffect, useState } from 'react';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { trpc } from '@/lib/trpc';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmationDialog,
  Skeleton,
  toast,
} from '@intelliflow/ui';
import { PageHeader, type PageAction } from '@/components/shared/page-header';
import {
  RetentionPoliciesTab,
  type LocalRetentionPolicy,
} from '../document-settings/components/RetentionPoliciesTab';

export default function StoragePoliciesContent() {
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();

  // ─── tRPC ──────────────────────────────────────────────────────────────────
  const utils = trpc.useUtils();
  const retentionQuery = trpc.documentSettings.retentionPolicies.getAll.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const updateMutation = trpc.documentSettings.retentionPolicies.updateAll.useMutation({
    onSuccess: () => {
      utils.documentSettings.retentionPolicies.getAll.invalidate();
      toast({ title: 'Storage policies saved', description: 'Retention rules were updated.' });
      setIsDirty(false);
    },
    onError: (err) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });
  const resetMutation = trpc.documentSettings.retentionPolicies.resetToDefaults.useMutation({
    onSuccess: () => {
      utils.documentSettings.retentionPolicies.getAll.invalidate();
      toast({ title: 'Storage policies reset', description: 'Restored factory defaults.' });
      setResetOpen(false);
      setIsDirty(false);
    },
    onError: (err) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  // ─── Local (dirty-tracked) working state ────────────────────────────────────
  const [localRetention, setLocalRetention] = useState<LocalRetentionPolicy[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  // Seed working state from server data; clear the dirty flag on every refetch so
  // a successful save (which invalidates + refetches) settles back to pristine.
  useEffect(() => {
    if (retentionQuery.data) {
      setLocalRetention(
        retentionQuery.data.map((p) => ({
          id: p.id,
          categoryKey: p.categoryKey,
          retentionDays: p.retentionDays,
          autoArchive: p.autoArchive,
          legalHoldOverride: p.legalHoldOverride,
        }))
      );
      setIsDirty(false);
    }
  }, [retentionQuery.data]);

  const isSaving = updateMutation.isPending;
  const isResetting = resetMutation.isPending;

  // ─── Handlers ──────────────────────────────────────────────────────────────
  function handleRetentionChange(policies: LocalRetentionPolicy[]) {
    setLocalRetention(policies);
    setIsDirty(true);
  }

  async function handleSave() {
    // Server schema requires at least one policy — never send an empty set.
    if (localRetention.length === 0) return;
    try {
      await updateMutation.mutateAsync({
        // Strip the client-only id; updateAll replaces the whole set by categoryKey.
        policies: localRetention.map((p) => ({
          categoryKey: p.categoryKey,
          retentionDays: p.retentionDays,
          autoArchive: p.autoArchive,
          legalHoldOverride: p.legalHoldOverride,
        })),
      });
    } catch {
      // onError already surfaces a toast; swallow to avoid an unhandled rejection
      // (e.g. a superRefine duplicate-categoryKey BAD_REQUEST).
    }
  }

  // ─── Page actions ──────────────────────────────────────────────────────────
  const actions: PageAction[] = [
    {
      label: 'Reset to defaults',
      icon: 'restart_alt',
      variant: 'secondary',
      onClick: () => setResetOpen(true),
      disabled: isSaving || isResetting,
    },
    {
      label: 'Save changes',
      icon: 'save',
      variant: 'primary',
      onClick: handleSave,
      loading: isSaving,
      disabled: !isDirty || isSaving || isResetting || localRetention.length === 0,
    },
  ];

  // ─── Render ────────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const isLoading = retentionQuery.isLoading;
  const listError = retentionQuery.error;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <PageHeader
        title="Storage Policies"
        description="Per-category document retention periods, auto-archive rules, and legal-hold exceptions."
        actions={actions}
      />

      {/* 12-col bento grid (module-settings-playbook §1) */}
      <div className="grid grid-cols-12 gap-4">
        {isLoading && (
          <Card className="col-span-12">
            <CardHeader>
              <CardTitle>Retention &amp; Compliance</CardTitle>
            </CardHeader>
            <CardContent>
              <div aria-busy="true" className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {!isLoading && listError && (
          <Card className="col-span-12">
            <CardHeader>
              <CardTitle>Retention &amp; Compliance</CardTitle>
            </CardHeader>
            <CardContent>
              <p role="alert" className="text-sm text-destructive">
                Failed to load storage policies. Please try again.
              </p>
            </CardContent>
          </Card>
        )}

        {!isLoading && !listError && (
          <div className="col-span-12">
            <RetentionPoliciesTab
              policies={localRetention}
              onPoliciesChange={handleRetentionChange}
            />
          </div>
        )}
      </div>

      {/* Reset confirmation */}
      <ConfirmationDialog
        open={resetOpen}
        onOpenChange={(open) => !open && setResetOpen(false)}
        title="Reset storage policies?"
        description="All retention rules will be restored to factory defaults. This cannot be undone."
        confirmLabel="Reset"
        onConfirm={async () => {
          try {
            await resetMutation.mutateAsync();
          } catch {
            // onError already surfaces a toast; swallow to avoid an unhandled rejection.
          }
        }}
        isLoading={isResetting}
        variant="destructive"
      />
    </div>
  );
}
