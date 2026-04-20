'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { trpc } from '@/lib/trpc';
import { Button, Card, ConfirmationDialog, toast } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared/page-header';
import {
  DEFAULT_DEAL_AUTOMATION,
  type CreateDealScoringRuleInput,
  type CreateDealTagInput,
  type CreateDealWinLossReasonInput,
  type DealAutomationSettingsInput,
  type DealRequiredFieldKey,
  type UpdateDealScoringRuleInput,
  type UpdateDealTagInput,
  type UpdateDealWinLossReasonInput,
} from '@intelliflow/validators';
import {
  DealDuplicateDetectionCard,
  type DealDuplicateRuleRow,
} from './components/DealDuplicateDetectionCard';
import {
  DealRequiredFieldsCard,
  type DealRequiredFieldRow,
} from './components/DealRequiredFieldsCard';
import { DealWinLossCard, type DealWinLossReasonRow } from './components/DealWinLossCard';
import { DealScoringCard, type DealScoringRuleRow } from './components/DealScoringCard';
import { DealAutomationCard } from './components/DealAutomationCard';
import { DealPipelineCard } from './components/DealPipelineCard';
import { DealTagsCard, type DealTagRow, type TagsTabHandle } from './components/DealTagsCard';
import { DealSettingsLoading } from './DealSettingsLoading';

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
    <div className="flex items-start gap-3 mb-5">
      <div className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
        <span className={`material-symbols-outlined text-[20px] ${iconFg}`} aria-hidden="true">
          {icon}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export default function DealSettingsContent() {
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();
  const utils = trpc.useUtils();

  // ── Queries ──────────────────────────────────────────────
  const winLossQuery = trpc.dealSettings.winLossReasons.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const scoringQuery = trpc.dealSettings.scoringRules.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const duplicateRulesQuery = trpc.dealSettings.duplicateRules.getAll.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const requiredFieldsQuery = trpc.dealSettings.requiredFields.getAll.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const tagsQuery = trpc.dealSettings.tags.list.useQuery(undefined, { enabled: isAuthenticated });
  const automationQuery = trpc.dealSettings.automation.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  // ── Mutations ────────────────────────────────────────────
  const duplicateRulesUpdate = trpc.dealSettings.duplicateRules.updateAll.useMutation({
    onSuccess: () => utils.dealSettings.duplicateRules.getAll.invalidate(),
  });
  const duplicateRulesReset = trpc.dealSettings.duplicateRules.resetToDefaults.useMutation({
    onSuccess: () => utils.dealSettings.duplicateRules.getAll.invalidate(),
  });
  const requiredFieldsUpdate = trpc.dealSettings.requiredFields.updateAll.useMutation({
    onSuccess: () => utils.dealSettings.requiredFields.getAll.invalidate(),
  });
  const requiredFieldsReset = trpc.dealSettings.requiredFields.resetToDefaults.useMutation({
    onSuccess: () => utils.dealSettings.requiredFields.getAll.invalidate(),
  });
  const winLossCreate = trpc.dealSettings.winLossReasons.create.useMutation({
    onSuccess: () => utils.dealSettings.winLossReasons.list.invalidate(),
  });
  const winLossUpdate = trpc.dealSettings.winLossReasons.update.useMutation({
    onSuccess: () => utils.dealSettings.winLossReasons.list.invalidate(),
  });
  const winLossDelete = trpc.dealSettings.winLossReasons.delete.useMutation({
    onSuccess: () => utils.dealSettings.winLossReasons.list.invalidate(),
  });
  const winLossReset = trpc.dealSettings.winLossReasons.resetToDefaults.useMutation({
    onSuccess: () => utils.dealSettings.winLossReasons.list.invalidate(),
  });
  const scoringCreate = trpc.dealSettings.scoringRules.create.useMutation({
    onSuccess: () => utils.dealSettings.scoringRules.list.invalidate(),
  });
  const scoringUpdate = trpc.dealSettings.scoringRules.update.useMutation({
    onSuccess: () => utils.dealSettings.scoringRules.list.invalidate(),
  });
  const scoringDelete = trpc.dealSettings.scoringRules.delete.useMutation({
    onSuccess: () => utils.dealSettings.scoringRules.list.invalidate(),
  });
  const scoringReset = trpc.dealSettings.scoringRules.resetToDefaults.useMutation({
    onSuccess: () => utils.dealSettings.scoringRules.list.invalidate(),
  });
  const tagCreate = trpc.dealSettings.tags.create.useMutation({
    onSuccess: () => utils.dealSettings.tags.list.invalidate(),
  });
  const tagUpdate = trpc.dealSettings.tags.update.useMutation({
    onSuccess: () => utils.dealSettings.tags.list.invalidate(),
  });
  const tagDelete = trpc.dealSettings.tags.delete.useMutation({
    onSuccess: () => utils.dealSettings.tags.list.invalidate(),
  });
  const automationUpdate = trpc.dealSettings.automation.update.useMutation({
    onSuccess: () => utils.dealSettings.automation.get.invalidate(),
  });
  const automationReset = trpc.dealSettings.automation.resetToDefaults.useMutation({
    onSuccess: () => utils.dealSettings.automation.get.invalidate(),
  });

  // ── Local state ─────────────────────────────────────────
  const [localRules, setLocalRules] = useState<DealDuplicateRuleRow[]>([]);
  const [localRequired, setLocalRequired] = useState<DealRequiredFieldRow[]>([]);
  const [localAutomation, setLocalAutomation] =
    useState<DealAutomationSettingsInput>(DEFAULT_DEAL_AUTOMATION);
  const [isDirty, setIsDirty] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  const tagsRef = useRef<TagsTabHandle>(null);

  useEffect(() => {
    if (duplicateRulesQuery.data) {
      setLocalRules(
        duplicateRulesQuery.data.map((r) => ({
          field: r.field as DealDuplicateRuleRow['field'],
          matchStrategy: r.matchStrategy as DealDuplicateRuleRow['matchStrategy'],
          threshold: r.threshold,
          isActive: r.isActive,
          sortOrder: r.sortOrder,
        }))
      );
    }
  }, [duplicateRulesQuery.data]);

  useEffect(() => {
    if (requiredFieldsQuery.data) {
      setLocalRequired(
        requiredFieldsQuery.data.map((f) => ({
          fieldKey: f.fieldKey as DealRequiredFieldKey,
          isRequired: f.isRequired,
        }))
      );
    }
  }, [requiredFieldsQuery.data]);

  useEffect(() => {
    if (automationQuery.data) {
      const d = automationQuery.data;
      setLocalAutomation({
        autoMergeOnExactNameAccount: d.autoMergeOnExactNameAccount,
        notifyOnDuplicate: d.notifyOnDuplicate,
        restrictTagCreationToAdmins: d.restrictTagCreationToAdmins,
        normalizeCurrency: d.normalizeCurrency,
        autoCapitalizeDealNames: d.autoCapitalizeDealNames,
        preventDeleteWithOpenTasks: d.preventDeleteWithOpenTasks,
        notifyOnOwnerChange: d.notifyOnOwnerChange,
        notifyOnStageChange: d.notifyOnStageChange,
        notifyOnHighValueStageMove: d.notifyOnHighValueStageMove,
        highValueThreshold:
          typeof d.highValueThreshold === 'number'
            ? d.highValueThreshold
            : Number.parseFloat(String(d.highValueThreshold)),
        aiDuplicateDetection: d.aiDuplicateDetection,
        aiDealScoring: d.aiDealScoring,
        aiNextStepRecommendation: d.aiNextStepRecommendation,
        aiTagSuggestions: d.aiTagSuggestions,
        aiInsightGeneration: d.aiInsightGeneration,
        aiWinLossPrediction: d.aiWinLossPrediction,
      });
    }
  }, [automationQuery.data]);

  const handleRulesChange = useCallback((rules: DealDuplicateRuleRow[]) => {
    setLocalRules(rules);
    setIsDirty(true);
  }, []);

  const handleRequiredChange = useCallback((fields: DealRequiredFieldRow[]) => {
    setLocalRequired(fields);
    setIsDirty(true);
  }, []);

  const handleAutomationChange = useCallback((next: DealAutomationSettingsInput) => {
    setLocalAutomation(next);
    setIsDirty(true);
  }, []);

  const winLossRows: DealWinLossReasonRow[] = useMemo(
    () =>
      (winLossQuery.data ?? []).map((r) => ({
        id: r.id,
        category: r.category as 'WON' | 'LOST',
        label: r.label,
        key: r.key,
        sortOrder: r.sortOrder,
        isActive: r.isActive,
      })),
    [winLossQuery.data]
  );

  const scoringRows: DealScoringRuleRow[] = useMemo(() => {
    const raw = (scoringQuery.data ?? []) as unknown as Array<{
      id: string;
      name: string;
      field: string;
      operator: string;
      valueJson: { type?: string; value?: unknown } | null;
      points: number;
      isActive: boolean;
      sortOrder: number;
    }>;
    return raw.map((r): DealScoringRuleRow => {
      const rawVal = (r.valueJson ?? {}) as { type?: string; value?: unknown };
      // Narrow the persisted JSON back into the discriminated-union row type.
      // Unknown types fall back to a zero-number rule so the card still renders.
      let valueJson: DealScoringRuleRow['valueJson'];
      if (rawVal.type === 'string') {
        valueJson = { type: 'string', value: String(rawVal.value ?? '') };
      } else if (rawVal.type === 'array' && Array.isArray(rawVal.value)) {
        valueJson = {
          type: 'array',
          value: (rawVal.value as unknown[]).filter(
            (v): v is string | number => typeof v === 'string' || typeof v === 'number'
          ),
        };
      } else {
        valueJson = { type: 'number', value: Number(rawVal.value) || 0 };
      }
      return {
        id: r.id,
        name: r.name,
        field: r.field as DealScoringRuleRow['field'],
        operator: r.operator as DealScoringRuleRow['operator'],
        valueJson,
        points: r.points,
        isActive: r.isActive,
        sortOrder: r.sortOrder,
      };
    });
  }, [scoringQuery.data]);

  const tagRows: DealTagRow[] = useMemo(
    () =>
      (tagsQuery.data ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        colorToken: t.colorToken as DealTagRow['colorToken'],
        description: t.description,
        sortOrder: t.sortOrder,
        isActive: t.isActive,
      })),
    [tagsQuery.data]
  );

  const handleWinLossCreate = useCallback(
    async (input: CreateDealWinLossReasonInput) => {
      try {
        await winLossCreate.mutateAsync(input);
        toast({ title: 'Reason added', description: input.label });
      } catch (err) {
        toast({
          title: 'Could not add reason',
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive',
        });
      }
    },
    [winLossCreate]
  );
  const handleWinLossUpdate = useCallback(
    async (input: UpdateDealWinLossReasonInput) => {
      try {
        await winLossUpdate.mutateAsync(input);
      } catch (err) {
        toast({
          title: 'Could not update reason',
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive',
        });
      }
    },
    [winLossUpdate]
  );
  const handleWinLossDelete = useCallback(
    async (id: string) => {
      try {
        const result = await winLossDelete.mutateAsync({ id });
        return result;
      } catch (err) {
        toast({
          title: 'Could not delete reason',
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive',
        });
      }
    },
    [winLossDelete]
  );

  const handleScoringCreate = useCallback(
    async (input: CreateDealScoringRuleInput) => {
      try {
        await scoringCreate.mutateAsync(input);
        toast({ title: 'Scoring rule added', description: input.name });
      } catch (err) {
        toast({
          title: 'Could not add rule',
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive',
        });
      }
    },
    [scoringCreate]
  );
  const handleScoringUpdate = useCallback(
    async (input: UpdateDealScoringRuleInput) => {
      try {
        await scoringUpdate.mutateAsync(input);
      } catch (err) {
        toast({
          title: 'Could not update rule',
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive',
        });
      }
    },
    [scoringUpdate]
  );
  const handleScoringDelete = useCallback(
    async (id: string) => {
      try {
        await scoringDelete.mutateAsync({ id });
      } catch (err) {
        toast({
          title: 'Could not delete rule',
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive',
        });
      }
    },
    [scoringDelete]
  );

  const handleTagCreate = useCallback(
    async (input: CreateDealTagInput) => {
      try {
        await tagCreate.mutateAsync(input);
        toast({ title: 'Tag created', description: input.name });
      } catch (err) {
        toast({
          title: 'Could not create tag',
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive',
        });
      }
    },
    [tagCreate]
  );
  const handleTagUpdate = useCallback(
    async (input: UpdateDealTagInput) => {
      try {
        await tagUpdate.mutateAsync(input);
      } catch (err) {
        toast({
          title: 'Could not update tag',
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive',
        });
      }
    },
    [tagUpdate]
  );
  const handleTagDelete = useCallback(
    async (id: string) => {
      try {
        await tagDelete.mutateAsync({ id });
      } catch (err) {
        toast({
          title: 'Could not delete tag',
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive',
        });
      }
    },
    [tagDelete]
  );

  const isSaving =
    duplicateRulesUpdate.isPending || requiredFieldsUpdate.isPending || automationUpdate.isPending;

  const handleSave = useCallback(async () => {
    try {
      await Promise.all([
        duplicateRulesUpdate.mutateAsync({ rules: localRules }),
        requiredFieldsUpdate.mutateAsync({ fields: localRequired }),
        automationUpdate.mutateAsync(localAutomation),
      ]);
      setIsDirty(false);
      toast({ title: 'Settings saved', description: 'Deal settings updated.' });
    } catch (err) {
      toast({
        title: 'Error saving settings',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }, [
    localRules,
    localRequired,
    localAutomation,
    duplicateRulesUpdate,
    requiredFieldsUpdate,
    automationUpdate,
  ]);

  const handleReset = useCallback(async () => {
    // Each mutateAsync is typed through a deep tRPC generic; Promise.all
    // on the raw promises triggers TS2589. Wrapping in `void` collapses the
    // inferred type to `Promise<void>` and keeps the parallel execution.
    const run = (p: Promise<unknown>): Promise<void> => p.then(() => undefined);
    try {
      await Promise.all([
        run(duplicateRulesReset.mutateAsync()),
        run(requiredFieldsReset.mutateAsync()),
        run(winLossReset.mutateAsync()),
        run(scoringReset.mutateAsync()),
        run(automationReset.mutateAsync()),
      ]);
      setIsDirty(false);
      setResetOpen(false);
      toast({
        title: 'Settings reset',
        description: 'Duplicate rules, required fields, win/loss, scoring and automation restored.',
      });
    } catch (err) {
      toast({
        title: 'Error resetting settings',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }, [duplicateRulesReset, requiredFieldsReset, winLossReset, scoringReset, automationReset]);

  const isLoading =
    authLoading ||
    winLossQuery.isLoading ||
    scoringQuery.isLoading ||
    duplicateRulesQuery.isLoading ||
    requiredFieldsQuery.isLoading ||
    tagsQuery.isLoading ||
    automationQuery.isLoading;

  const error =
    winLossQuery.error ||
    scoringQuery.error ||
    duplicateRulesQuery.error ||
    requiredFieldsQuery.error ||
    tagsQuery.error ||
    automationQuery.error;

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

  const tagsIsBusy = tagCreate.isPending || tagUpdate.isPending || tagDelete.isPending;
  const winLossIsBusy =
    winLossCreate.isPending || winLossUpdate.isPending || winLossDelete.isPending;
  const scoringIsBusy =
    scoringCreate.isPending || scoringUpdate.isPending || scoringDelete.isPending;

  if (isLoading) return <DealSettingsLoading />;

  if (error) {
    return (
      <div className="w-full text-center py-12">
        <p className="text-destructive mb-4">Failed to load settings: {error.message}</p>
        <button
          type="button"
          onClick={() => {
            winLossQuery.refetch();
            scoringQuery.refetch();
            duplicateRulesQuery.refetch();
            requiredFieldsQuery.refetch();
            tagsQuery.refetch();
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
    <div className="w-full">
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Deals', href: '/deals' },
          { label: 'Deal Settings' },
        ]}
        title="Deal Settings"
        description="Pipeline stages, win/loss reasons, scoring rules, duplicate detection, required fields, tags and automation."
        actions={actions}
        className="mb-6"
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        <Card id="pipeline" className="lg:col-span-7 p-4 sm:p-6">
          <SectionHeader
            icon="linear_scale"
            iconBg="bg-blue-100 dark:bg-blue-900/30"
            iconFg="text-blue-600 dark:text-blue-400"
            title="Pipeline Stages"
            description="Stage order, colors and probabilities."
          />
          <DealPipelineCard />
        </Card>

        <Card id="required-fields" className="lg:col-span-5 p-4 sm:p-6">
          <SectionHeader
            icon="checklist"
            iconBg="bg-emerald-100 dark:bg-emerald-900/30"
            iconFg="text-emerald-600 dark:text-emerald-400"
            title="Required Fields"
            description="Fields that must be filled in before a deal can be saved."
          />
          <DealRequiredFieldsCard fields={localRequired} onFieldsChange={handleRequiredChange} />
        </Card>

        <Card id="duplicate-detection" className="lg:col-span-6 p-4 sm:p-6">
          <SectionHeader
            icon="content_copy"
            iconBg="bg-amber-100 dark:bg-amber-900/30"
            iconFg="text-amber-600 dark:text-amber-400"
            title="Duplicate Detection"
            description="Rules that flag potential duplicate deals."
          />
          <DealDuplicateDetectionCard rules={localRules} onRulesChange={handleRulesChange} />
        </Card>

        <Card id="win-loss" className="lg:col-span-6 p-4 sm:p-6">
          <SectionHeader
            icon="emoji_events"
            iconBg="bg-teal-100 dark:bg-teal-900/30"
            iconFg="text-teal-600 dark:text-teal-400"
            title="Win / Loss Reasons"
            description="Taxonomy of reasons a deal was won or lost."
          />
          <DealWinLossCard
            reasons={winLossRows}
            onCreate={handleWinLossCreate}
            onUpdate={handleWinLossUpdate}
            onDelete={handleWinLossDelete}
            isBusy={winLossIsBusy}
          />
        </Card>

        <Card id="scoring" className="lg:col-span-6 p-4 sm:p-6">
          <SectionHeader
            icon="leaderboard"
            iconBg="bg-violet-100 dark:bg-violet-900/30"
            iconFg="text-violet-600 dark:text-violet-400"
            title="Scoring Rules"
            description="Rules that shape each deal's score (runtime via IFC-312)."
          />
          <DealScoringCard
            rules={scoringRows}
            onCreate={handleScoringCreate}
            onUpdate={handleScoringUpdate}
            onDelete={handleScoringDelete}
            isBusy={scoringIsBusy}
          />
        </Card>

        <Card id="tags" className="lg:col-span-6 p-4 sm:p-6">
          <SectionHeader
            icon="sell"
            iconBg="bg-indigo-100 dark:bg-indigo-900/30"
            iconFg="text-indigo-600 dark:text-indigo-400"
            title="Tags"
            description="Tag vocabulary for deals."
            action={
              <Button
                type="button"
                size="sm"
                onClick={() => tagsRef.current?.openCreate()}
                disabled={tagsIsBusy}
              >
                <span className="material-symbols-outlined text-sm mr-1" aria-hidden>
                  add
                </span>{' '}
                New Tag
              </Button>
            }
          />
          <DealTagsCard
            ref={tagsRef}
            tags={tagRows}
            onCreate={handleTagCreate}
            onUpdate={handleTagUpdate}
            onDelete={handleTagDelete}
            isBusy={tagsIsBusy}
          />
        </Card>

        <Card id="automation" className="lg:col-span-12 p-4 sm:p-6">
          <SectionHeader
            icon="bolt"
            iconBg="bg-orange-100 dark:bg-orange-900/30"
            iconFg="text-orange-600 dark:text-orange-400"
            title="Automation"
            description="Deal automation and AI hygiene behaviours."
          />
          <DealAutomationCard
            settings={localAutomation}
            onSettingsChange={handleAutomationChange}
          />
        </Card>
      </div>

      <ConfirmationDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset to Defaults"
        description="This restores duplicate rules, required fields, win/loss reasons, scoring rules and automation to factory defaults. Tags and pipeline stages are preserved. This action cannot be undone."
        confirmLabel="Reset"
        variant="destructive"
        onConfirm={handleReset}
      />
    </div>
  );
}
