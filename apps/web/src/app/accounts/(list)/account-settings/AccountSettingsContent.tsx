'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { trpc } from '@/lib/trpc';
import { toast } from '@intelliflow/ui';
import {
  ModuleSettingsLayout,
  type ModuleSettingsTab,
} from '@/components/settings/ModuleSettingsLayout';
import type { AccountHierarchyConfigInput } from '@intelliflow/validators';
import { HierarchyTab } from './components/HierarchyTab';
import { IndustryTab, type IndustryRow } from './components/IndustryTab';
import {
  CustomFieldsTab,
  type CustomFieldRow,
  type CreateFieldData,
  type UpdateFieldData,
} from './components/CustomFieldsTab';
import { AccountSettingsLoading } from './AccountSettingsLoading';

const DEFAULT_HIERARCHY: AccountHierarchyConfigInput = {
  maxDepth: 5,
  requireParentForTiers: [],
  preventCycles: true,
};

function asCustomFieldRow(raw: {
  id: string;
  fieldName: string;
  fieldKey: string;
  dataType: string;
  isRequired: boolean;
  options: unknown;
}): CustomFieldRow {
  const options =
    raw.options && typeof raw.options === 'object' && 'values' in (raw.options as object)
      ? (raw.options as { values: string[] })
      : null;
  return {
    id: raw.id,
    fieldName: raw.fieldName,
    fieldKey: raw.fieldKey,
    dataType: raw.dataType,
    isRequired: raw.isRequired,
    options,
  };
}

export default function AccountSettingsContent() {
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();
  const utils = trpc.useUtils();

  // ── Queries ──────────────────────────────────────────────
  const hierarchyQuery = trpc.accountSettings.hierarchy.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const industryQuery = trpc.accountSettings.industry.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const customFieldsQuery = trpc.accountSettings.customFields.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  // ── Mutations ────────────────────────────────────────────
  const hierarchyUpdate = trpc.accountSettings.hierarchy.update.useMutation({
    onSuccess: () => utils.accountSettings.hierarchy.get.invalidate(),
  });
  const hierarchyReset = trpc.accountSettings.hierarchy.resetToDefaults.useMutation({
    onSuccess: () => utils.accountSettings.hierarchy.get.invalidate(),
  });
  const industryCreate = trpc.accountSettings.industry.create.useMutation({
    onSuccess: () => utils.accountSettings.industry.list.invalidate(),
  });
  const industryUpdate = trpc.accountSettings.industry.update.useMutation({
    onSuccess: () => utils.accountSettings.industry.list.invalidate(),
  });
  const industryDelete = trpc.accountSettings.industry.delete.useMutation({
    onSuccess: () => utils.accountSettings.industry.list.invalidate(),
  });
  const industryReset = trpc.accountSettings.industry.resetToDefaults.useMutation({
    onSuccess: () => utils.accountSettings.industry.list.invalidate(),
  });
  const fieldCreate = trpc.accountSettings.customFields.create.useMutation({
    onSuccess: () => utils.accountSettings.customFields.list.invalidate(),
  });
  const fieldUpdate = trpc.accountSettings.customFields.update.useMutation({
    onSuccess: () => utils.accountSettings.customFields.list.invalidate(),
  });
  const fieldDelete = trpc.accountSettings.customFields.delete.useMutation({
    onSuccess: () => utils.accountSettings.customFields.list.invalidate(),
  });

  // ── Hierarchy local state ────────────────────────────────
  const [localHierarchy, setLocalHierarchy] =
    useState<AccountHierarchyConfigInput>(DEFAULT_HIERARCHY);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (hierarchyQuery.data) {
      setLocalHierarchy({
        maxDepth: hierarchyQuery.data.maxDepth,
        requireParentForTiers: hierarchyQuery.data.requireParentForTiers,
        preventCycles: hierarchyQuery.data.preventCycles,
      });
      setIsDirty(false);
    }
  }, [hierarchyQuery.data]);

  const handleHierarchyChange = useCallback((next: AccountHierarchyConfigInput) => {
    setLocalHierarchy(next);
    setIsDirty(true);
  }, []);

  // ── Industry handlers ────────────────────────────────────
  const industryRows: IndustryRow[] = useMemo(
    () =>
      (industryQuery.data ?? []).map((row) => ({
        id: row.id,
        label: row.label,
        key: row.key,
        sortOrder: row.sortOrder,
        isActive: row.isActive,
      })),
    [industryQuery.data]
  );

  const handleIndustryCreate = useCallback(
    async (label: string) => {
      try {
        await industryCreate.mutateAsync({ label });
        toast({ title: 'Industry added', description: `"${label}" added.` });
      } catch (err) {
        toast({
          title: 'Could not add industry',
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive',
        });
      }
    },
    [industryCreate]
  );

  const handleIndustryUpdate = useCallback(
    async (id: string, patch: Partial<Pick<IndustryRow, 'label' | 'sortOrder' | 'isActive'>>) => {
      try {
        await industryUpdate.mutateAsync({ id, ...patch });
      } catch (err) {
        toast({
          title: 'Could not update industry',
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive',
        });
      }
    },
    [industryUpdate]
  );

  const handleIndustryDelete = useCallback(
    async (id: string) => {
      try {
        const result = await industryDelete.mutateAsync({ id });
        toast({
          title: result.softDeleted ? 'Industry deactivated' : 'Industry deleted',
          description: result.softDeleted
            ? 'Kept because at least one account still references it.'
            : undefined,
        });
      } catch (err) {
        toast({
          title: 'Could not delete industry',
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive',
        });
      }
    },
    [industryDelete]
  );

  // ── Custom field handlers ────────────────────────────────
  const fieldRows: CustomFieldRow[] = useMemo(() => {
    const rows = (customFieldsQuery.data ?? []) as Array<{
      id: string;
      fieldName: string;
      fieldKey: string;
      dataType: string;
      isRequired: boolean;
      options: unknown;
    }>;
    return rows.map(asCustomFieldRow);
  }, [customFieldsQuery.data]);

  const handleFieldCreate = useCallback(
    async (data: CreateFieldData) => {
      try {
        await fieldCreate.mutateAsync({
          fieldName: data.fieldName,
          dataType: data.dataType,
          isRequired: data.isRequired,
          options: data.options,
        });
        toast({ title: 'Field added', description: data.fieldName });
      } catch (err) {
        toast({
          title: 'Could not add field',
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive',
        });
      }
    },
    [fieldCreate]
  );

  const handleFieldUpdate = useCallback(
    async (data: UpdateFieldData) => {
      try {
        await fieldUpdate.mutateAsync(data);
        toast({ title: 'Field updated' });
      } catch (err) {
        toast({
          title: 'Could not update field',
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive',
        });
      }
    },
    [fieldUpdate]
  );

  const handleFieldDelete = useCallback(
    async (id: string) => {
      try {
        await fieldDelete.mutateAsync({ id });
        toast({ title: 'Field deleted' });
      } catch (err) {
        toast({
          title: 'Could not delete field',
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive',
        });
      }
    },
    [fieldDelete]
  );

  // ── Save / Reset ─────────────────────────────────────────
  const handleSave = useCallback(async () => {
    try {
      await hierarchyUpdate.mutateAsync(localHierarchy);
      setIsDirty(false);
      toast({ title: 'Settings saved', description: 'Account hierarchy rules updated.' });
    } catch (err) {
      toast({
        title: 'Error saving settings',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }, [localHierarchy, hierarchyUpdate]);

  const handleReset = useCallback(async () => {
    try {
      await Promise.all([hierarchyReset.mutateAsync(), industryReset.mutateAsync()]);
      setIsDirty(false);
      toast({
        title: 'Settings reset',
        description: 'Hierarchy and industry taxonomy restored to defaults.',
      });
    } catch (err) {
      toast({
        title: 'Error resetting settings',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }, [hierarchyReset, industryReset]);

  const isSaving = hierarchyUpdate.isPending;

  // ── Loading / Error ──────────────────────────────────────
  const isLoading =
    authLoading ||
    hierarchyQuery.isLoading ||
    industryQuery.isLoading ||
    customFieldsQuery.isLoading;

  const error = hierarchyQuery.error || industryQuery.error || customFieldsQuery.error;

  const lastUpdated = useMemo(() => {
    const dates: Date[] = [];
    if (hierarchyQuery.data?.updatedAt) dates.push(new Date(hierarchyQuery.data.updatedAt));
    for (const row of industryQuery.data ?? []) {
      if (row.updatedAt) dates.push(new Date(row.updatedAt));
    }
    for (const row of customFieldsQuery.data ?? []) {
      if (row.updatedAt) dates.push(new Date(row.updatedAt));
    }
    if (dates.length === 0) return null;
    return new Date(Math.max(...dates.map((d) => d.getTime())));
  }, [hierarchyQuery.data, industryQuery.data, customFieldsQuery.data]);

  const tabs = useMemo<ModuleSettingsTab[]>(
    () => [
      {
        value: 'hierarchy',
        label: 'Hierarchy',
        content: <HierarchyTab config={localHierarchy} onConfigChange={handleHierarchyChange} />,
      },
      {
        value: 'industry',
        label: 'Industry',
        content: (
          <IndustryTab
            rows={industryRows}
            onCreate={handleIndustryCreate}
            onUpdate={handleIndustryUpdate}
            onDelete={handleIndustryDelete}
            isBusy={
              industryCreate.isPending || industryUpdate.isPending || industryDelete.isPending
            }
          />
        ),
      },
      {
        value: 'custom-fields',
        label: 'Custom Fields',
        content: (
          <CustomFieldsTab
            rows={fieldRows}
            onCreate={handleFieldCreate}
            onUpdate={handleFieldUpdate}
            onDelete={handleFieldDelete}
            isBusy={fieldCreate.isPending || fieldUpdate.isPending || fieldDelete.isPending}
          />
        ),
      },
    ],
    [
      localHierarchy,
      handleHierarchyChange,
      industryRows,
      handleIndustryCreate,
      handleIndustryUpdate,
      handleIndustryDelete,
      industryCreate.isPending,
      industryUpdate.isPending,
      industryDelete.isPending,
      fieldRows,
      handleFieldCreate,
      handleFieldUpdate,
      handleFieldDelete,
      fieldCreate.isPending,
      fieldUpdate.isPending,
      fieldDelete.isPending,
    ]
  );

  if (isLoading) return <AccountSettingsLoading />;

  if (error) {
    return (
      <div className="max-w-7xl text-center py-12">
        <p className="text-destructive mb-4">Failed to load settings: {error.message}</p>
        <button
          onClick={() => {
            hierarchyQuery.refetch();
            industryQuery.refetch();
            customFieldsQuery.refetch();
          }}
          className="text-sm text-primary hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <ModuleSettingsLayout
      title="Account Settings"
      description="Configure account hierarchy rules, industry taxonomy, and custom fields."
      breadcrumbs={[
        { label: 'Dashboard', href: '/' },
        { label: 'Accounts', href: '/accounts' },
        { label: 'Account Settings' },
      ]}
      tabs={tabs}
      onSave={handleSave}
      onReset={handleReset}
      isSaving={isSaving}
      isDirty={isDirty}
      lastUpdated={lastUpdated}
    />
  );
}
