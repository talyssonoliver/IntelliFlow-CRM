'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { trpc } from '@/lib/trpc';
import { Button, Card, ConfirmationDialog, toast } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared/page-header';
import { LeadStagesTab } from './components/LeadStagesTab';
import { ScoringRulesTab, type ScoringRule } from './components/ScoringRulesTab';
import {
  CustomFieldsTab,
  type CustomField,
  type CustomFieldsTabHandle,
  type CreateFieldData,
  type UpdateFieldData,
} from './components/CustomFieldsTab';
import { AutomationTab, type AutomationSettings } from './components/AutomationTab';
import { ConfigurationSummary } from './components/ConfigurationSummary';
import type { StageItem } from './components/SortableStageItem';
import { LeadSettingsLoading } from './LeadSettingsLoading';

interface SectionHeaderProps {
  icon: string;
  iconBg: string;
  iconFg: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}

function SectionHeader({
  icon,
  iconBg,
  iconFg,
  title,
  description,
  action,
}: Readonly<SectionHeaderProps>) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
        <span className={`material-symbols-outlined text-[20px] ${iconFg}`} aria-hidden="true">
          {icon}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

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
  const [resetOpen, setResetOpen] = useState(false);

  const customFieldsTabRef = useRef<CustomFieldsTabHandle>(null);

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
      setResetOpen(false);
      toast({
        title: 'Settings reset',
        description:
          'Pipeline stages and scoring rules restored to defaults. Custom fields and automation toggles are preserved.',
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

  const actions = useMemo(
    () => [
      {
        label: 'Reset to Defaults',
        onClick: () => setResetOpen(true),
        variant: 'secondary' as const,
        icon: 'restart_alt',
        hideOnMobile: true,
      },
      {
        label: isSaving ? 'Saving…' : 'Save Changes',
        onClick: handleSave,
        variant: 'primary' as const,
        icon: 'save',
        disabled: !isDirty || isSaving,
        loading: isSaving,
      },
    ],
    [handleSave, isDirty, isSaving]
  );

  if (isLoading) return <LeadSettingsLoading />;

  if (error) {
    return (
      <div className="w-full text-center py-12">
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

  const fields = (fieldsQuery.data as unknown as CustomField[]) ?? [];

  return (
    <div className="w-full">
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Leads', href: '/leads' },
          { label: 'Lead Settings' },
        ]}
        title="Lead Settings"
        description="Configure lead pipeline stages, scoring rules, custom fields, and automation."
        actions={actions}
        className="mb-6"
      />

      {/* ═══════════════════════════════════════════════════════════════════
          BENTO GRID — 12 columns (stacks on mobile)
          Row 1: Pipeline Stages (8)       + Automation (4)
          Row 2: Scoring Rules (7)         + Custom Fields (5)
          Row 3: Configuration Summary (12)
          The Pipeline Stages card keeps its own Card wrapper — per product
          direction its visual design is already canonical and was
          deliberately preserved in this refactor.
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        {/* Pipeline Stages — preserved as-is */}
        <div className="lg:col-span-8">
          <LeadStagesTab stages={localStages} onStagesChange={handleStagesChange} />
        </div>

        {/* Automation */}
        <Card className="lg:col-span-4 p-4 sm:p-5">
          <SectionHeader
            icon="bolt"
            iconBg="bg-amber-100 dark:bg-amber-900/30"
            iconFg="text-amber-600 dark:text-amber-400"
            title="Automation"
            description="Automated behaviours for lead management."
          />
          <AutomationTab settings={localAutomation} onSettingsChange={handleAutomationChange} />
        </Card>

        {/* Scoring Rules */}
        <Card className="lg:col-span-7 p-4 sm:p-5">
          <SectionHeader
            icon="trending_up"
            iconBg="bg-emerald-100 dark:bg-emerald-900/30"
            iconFg="text-emerald-600 dark:text-emerald-400"
            title="Scoring Rules"
            description="Assign point values to lead activities for automatic scoring."
          />
          <ScoringRulesTab rules={localRules} onRulesChange={handleRulesChange} />
        </Card>

        {/* Custom Fields */}
        <Card className="lg:col-span-5 p-4 sm:p-5">
          <SectionHeader
            icon="tune"
            iconBg="bg-violet-100 dark:bg-violet-900/30"
            iconFg="text-violet-600 dark:text-violet-400"
            title="Custom Fields"
            description="Custom data fields to capture lead-specific information."
            action={
              <Button size="sm" onClick={() => customFieldsTabRef.current?.openCreate()}>
                New Field
              </Button>
            }
          />
          <CustomFieldsTab
            ref={customFieldsTabRef}
            fields={fields}
            onCreate={handleFieldCreate}
            onUpdate={handleFieldUpdate}
            onDelete={handleFieldDelete}
          />
        </Card>

        {/* Configuration Summary */}
        <Card className="lg:col-span-12 p-4 sm:p-5">
          <SectionHeader
            icon="summarize"
            iconBg="bg-slate-100 dark:bg-slate-800"
            iconFg="text-slate-600 dark:text-slate-300"
            title="Configuration Summary"
            description="Live overview of what you have configured on this page."
          />
          <ConfigurationSummary
            stages={localStages}
            rules={localRules}
            fields={fields}
            automation={localAutomation}
            lastUpdated={lastUpdated}
            isDirty={isDirty}
          />
        </Card>
      </div>

      <ConfirmationDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset to Defaults"
        description="Restore pipeline stages and scoring rules to factory defaults. Custom fields and automation toggles are preserved. This action cannot be undone."
        confirmLabel="Reset"
        variant="destructive"
        onConfirm={handleReset}
      />
    </div>
  );
}
