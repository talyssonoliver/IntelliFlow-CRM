'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { trpc } from '@/lib/trpc';
import { toast } from '@intelliflow/ui';
import {
  ModuleSettingsLayout,
  type ModuleSettingsTab,
} from '@/components/settings/ModuleSettingsLayout';
import { LeadStagesTab } from './components/LeadStagesTab';
import { ScoringRulesTab, type ScoringRule } from './components/ScoringRulesTab';
import {
  CustomFieldsTab,
  type CustomField,
  type CreateFieldData,
  type UpdateFieldData,
} from './components/CustomFieldsTab';
import { AutomationTab, type AutomationSettings } from './components/AutomationTab';
import type { StageItem } from './components/SortableStageItem';
import { LeadSettingsLoading } from './LeadSettingsLoading';

export default function LeadSettingsContent() {
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();

  // ─── Queries ────────────────────────────────────────────────────────────
  const stagesQuery = trpc.leadSettings.stages.getAll.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const scoringQuery = trpc.leadSettings.scoringRules.getAll.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const fieldsQuery = trpc.leadSettings.customFields.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const automationQuery = trpc.leadSettings.automation.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  // ─── Mutations ──────────────────────────────────────────────────────────
  const utils = trpc.useUtils();
  const stagesUpdate = trpc.leadSettings.stages.updateAll.useMutation({
    onSuccess: () => utils.leadSettings.stages.getAll.invalidate(),
  });
  const stagesReset = trpc.leadSettings.stages.resetToDefaults.useMutation({
    onSuccess: () => utils.leadSettings.stages.getAll.invalidate(),
  });
  const scoringUpdate = trpc.leadSettings.scoringRules.updateAll.useMutation({
    onSuccess: () => utils.leadSettings.scoringRules.getAll.invalidate(),
  });
  const scoringReset = trpc.leadSettings.scoringRules.resetToDefaults.useMutation({
    onSuccess: () => utils.leadSettings.scoringRules.getAll.invalidate(),
  });
  const automationUpdate = trpc.leadSettings.automation.update.useMutation({
    onSuccess: () => utils.leadSettings.automation.get.invalidate(),
  });
  const fieldCreate = trpc.leadSettings.customFields.create.useMutation({
    onSuccess: () => utils.leadSettings.customFields.list.invalidate(),
  });
  const fieldUpdate = trpc.leadSettings.customFields.update.useMutation({
    onSuccess: () => utils.leadSettings.customFields.list.invalidate(),
  });
  const fieldDelete = trpc.leadSettings.customFields.delete.useMutation({
    onSuccess: () => utils.leadSettings.customFields.list.invalidate(),
  });

  // ─── Local State ────────────────────────────────────────────────────────
  const [localStages, setLocalStages] = useState<StageItem[]>([]);
  const [localRules, setLocalRules] = useState<ScoringRule[]>([]);
  const [localAutomation, setLocalAutomation] = useState<AutomationSettings>({
    autoAssignment: true,
    instantNotifications: false,
    leadRecurrence: true,
  });
  const [isDirty, setIsDirty] = useState(false);

  // Sync server data to local state
  useEffect(() => {
    if (stagesQuery.data) {
      setLocalStages(
        stagesQuery.data.map((s) => ({
          stageKey: s.stageKey,
          displayName: s.displayName,
          color: s.color,
          sortOrder: s.sortOrder,
          isDefault: s.isDefault,
        }))
      );
    }
  }, [stagesQuery.data]);

  useEffect(() => {
    if (scoringQuery.data) {
      setLocalRules(
        scoringQuery.data.map((r) => ({
          activityType: r.activityType,
          points: r.points,
        }))
      );
    }
  }, [scoringQuery.data]);

  useEffect(() => {
    if (automationQuery.data) {
      setLocalAutomation({
        autoAssignment: automationQuery.data.autoAssignment,
        instantNotifications: automationQuery.data.instantNotifications,
        leadRecurrence: automationQuery.data.leadRecurrence,
      });
    }
  }, [automationQuery.data]);

  // ─── Handlers ───────────────────────────────────────────────────────────
  const handleStagesChange = useCallback((stages: StageItem[]) => {
    setLocalStages(stages);
    setIsDirty(true);
  }, []);

  const handleRulesChange = useCallback((rules: ScoringRule[]) => {
    setLocalRules(rules);
    setIsDirty(true);
  }, []);

  const handleAutomationChange = useCallback((settings: AutomationSettings) => {
    setLocalAutomation(settings);
    setIsDirty(true);
  }, []);

  const handleFieldCreate = useCallback(
    (data: CreateFieldData) => {
      fieldCreate.mutate(data as Parameters<typeof fieldCreate.mutate>[0], {
        onSuccess: () =>
          toast({ title: 'Field created', description: `"${data.fieldName}" has been added.` }),
        onError: (err) =>
          toast({ title: 'Error', description: err.message, variant: 'destructive' }),
      });
    },
    [fieldCreate]
  );

  const handleFieldUpdate = useCallback(
    (data: UpdateFieldData) => {
      fieldUpdate.mutate(data as Parameters<typeof fieldUpdate.mutate>[0], {
        onSuccess: () => toast({ title: 'Field updated' }),
        onError: (err) =>
          toast({ title: 'Error', description: err.message, variant: 'destructive' }),
      });
    },
    [fieldUpdate]
  );

  const handleFieldDelete = useCallback(
    (id: string) => {
      fieldDelete.mutate(
        { id },
        {
          onSuccess: () => toast({ title: 'Field deleted' }),
          onError: (err) =>
            toast({ title: 'Error', description: err.message, variant: 'destructive' }),
        }
      );
    },
    [fieldDelete]
  );

  const isSaving = stagesUpdate.isPending || scoringUpdate.isPending || automationUpdate.isPending;

  const handleSave = useCallback(async () => {
    try {
      await Promise.all([
        stagesUpdate.mutateAsync({ stages: localStages }),
        scoringUpdate.mutateAsync({ rules: localRules }),
        automationUpdate.mutateAsync(localAutomation),
      ]);
      setIsDirty(false);
      toast({ title: 'Settings saved', description: 'Lead settings have been updated.' });
    } catch (err) {
      toast({
        title: 'Error saving settings',
        description: err instanceof Error ? err.message : 'An unexpected error occurred',
        variant: 'destructive',
      });
    }
  }, [localStages, localRules, localAutomation, stagesUpdate, scoringUpdate, automationUpdate]);

  const handleReset = useCallback(async () => {
    try {
      await Promise.all([stagesReset.mutateAsync(), scoringReset.mutateAsync()]);
      setIsDirty(false);
      toast({
        title: 'Settings reset',
        description: 'Lead settings have been restored to defaults.',
      });
    } catch (err) {
      toast({
        title: 'Error resetting settings',
        description: err instanceof Error ? err.message : 'An unexpected error occurred',
        variant: 'destructive',
      });
    }
  }, [stagesReset, scoringReset]);

  // ─── Loading / Error States ─────────────────────────────────────────────
  const isLoading =
    authLoading ||
    stagesQuery.isLoading ||
    scoringQuery.isLoading ||
    fieldsQuery.isLoading ||
    automationQuery.isLoading;

  const error =
    stagesQuery.error || scoringQuery.error || fieldsQuery.error || automationQuery.error;

  // ─── Last Updated ───────────────────────────────────────────────────────
  const lastUpdated = useMemo(() => {
    const dates = [
      ...(stagesQuery.data?.map((s) => new Date(s.updatedAt)) ?? []),
      automationQuery.data?.updatedAt ? new Date(automationQuery.data.updatedAt) : null,
    ].filter(Boolean) as Date[];
    if (dates.length === 0) return null;
    return new Date(Math.max(...dates.map((d) => d.getTime())));
  }, [stagesQuery.data, automationQuery.data]);

  // ─── Tab Config ─────────────────────────────────────────────────────────
  const tabs = useMemo<ModuleSettingsTab[]>(
    () => [
      {
        value: 'stages',
        label: 'Lead Stages',
        content: <LeadStagesTab stages={localStages} onStagesChange={handleStagesChange} />,
      },
      {
        value: 'scoring',
        label: 'Scoring Rules',
        content: <ScoringRulesTab rules={localRules} onRulesChange={handleRulesChange} />,
      },
      {
        value: 'custom-fields',
        label: 'Custom Fields',
        content: (
          <CustomFieldsTab
            fields={(fieldsQuery.data as unknown as CustomField[]) ?? []}
            onCreate={handleFieldCreate}
            onUpdate={handleFieldUpdate}
            onDelete={handleFieldDelete}
          />
        ),
      },
      {
        value: 'automation',
        label: 'Automation',
        content: (
          <AutomationTab settings={localAutomation} onSettingsChange={handleAutomationChange} />
        ),
      },
    ],
    [
      localStages,
      handleStagesChange,
      localRules,
      handleRulesChange,
      fieldsQuery.data,
      handleFieldCreate,
      handleFieldUpdate,
      handleFieldDelete,
      localAutomation,
      handleAutomationChange,
    ]
  );

  // ─── Early Returns (after all hooks) ──────────────────────────────────
  if (isLoading) return <LeadSettingsLoading />;

  if (error) {
    return (
      <div className="max-w-7xl text-center py-12">
        <p className="text-destructive mb-4">Failed to load settings: {error.message}</p>
        <button
          onClick={() => {
            stagesQuery.refetch();
            scoringQuery.refetch();
            fieldsQuery.refetch();
            automationQuery.refetch();
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
      title="Lead Settings"
      description="Configure lead pipeline stages, scoring rules, custom fields, and automation."
      breadcrumbs={[
        { label: 'Dashboard', href: '/' },
        { label: 'Settings', href: '/settings' },
        { label: 'Lead Settings' },
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
