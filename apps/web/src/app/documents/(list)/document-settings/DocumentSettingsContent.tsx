'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { trpc } from '@/lib/trpc';
import { Button, Card, ConfirmationDialog, toast } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared/page-header';
import type { CreateDocumentTagInput, UpdateDocumentTagInput } from '@intelliflow/validators';
import { GeneralConfigCard, type DocumentGeneralConfigLocal } from './components/GeneralConfigCard';
import { AntivirusCard } from './components/AntivirusCard';
import { DuplicateDetectionTab, type LocalDuplicateRule } from './components/DuplicateDetectionTab';
import { RequiredFieldsTab, type LocalRequiredField } from './components/RequiredFieldsTab';
import { AutomationCard, type LocalAutomationSettings } from './components/AutomationCard';
import { AISettingsCard } from './components/AISettingsCard';
import { RetentionPoliciesTab, type LocalRetentionPolicy } from './components/RetentionPoliciesTab';
import { TagsTab, type DocumentTagRow, type TagsTabHandle } from './components/TagsTab';
import { ConfigurationSummary } from './components/ConfigurationSummary';
import { DocumentSettingsLoading } from './DocumentSettingsLoading';

const DEFAULT_GENERAL: DocumentGeneralConfigLocal = {
  allowedMimeTypes: [],
  maxUploadSizeMb: 50,
  defaultRetentionDays: 365,
  enableAntivirusScan: true,
  quarantineOnDetect: true,
  blockOnScanFailure: true,
};

const DEFAULT_AUTOMATION: LocalAutomationSettings = {
  normalizeFilename: true,
  preventDeleteIfReferenced: true,
  notifyOnOwnerChange: false,
  restrictTagCreationToAdmins: false,
  notifyOnDuplicate: true,
  autoVersionOnCollision: false,
  autoDetectDuplicates: false,
  autoExtractText: false,
  autoClassifyCategory: false,
  autoDetectPii: false,
  aiTagSuggestions: false,
  aiInsightGeneration: false,
};

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

export default function DocumentSettingsContent() {
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();
  const utils = trpc.useUtils();

  // ── Queries ──────────────────────────────────────────────
  const generalQuery = trpc.documentSettings.general.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const duplicateRulesQuery = trpc.documentSettings.duplicateRules.getAll.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const requiredFieldsQuery = trpc.documentSettings.requiredFields.getAll.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const tagsQuery = trpc.documentSettings.tags.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const automationQuery = trpc.documentSettings.automation.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const retentionQuery = trpc.documentSettings.retentionPolicies.getAll.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  // ── Mutations ────────────────────────────────────────────
  const generalUpdate = trpc.documentSettings.general.update.useMutation({
    onSuccess: () => utils.documentSettings.general.get.invalidate(),
  });
  const generalReset = trpc.documentSettings.general.resetToDefaults.useMutation({
    onSuccess: () => utils.documentSettings.general.get.invalidate(),
  });
  const duplicateRulesUpdate = trpc.documentSettings.duplicateRules.updateAll.useMutation({
    onSuccess: () => utils.documentSettings.duplicateRules.getAll.invalidate(),
  });
  const duplicateRulesReset = trpc.documentSettings.duplicateRules.resetToDefaults.useMutation({
    onSuccess: () => utils.documentSettings.duplicateRules.getAll.invalidate(),
  });
  const requiredFieldsUpdate = trpc.documentSettings.requiredFields.updateAll.useMutation({
    onSuccess: () => utils.documentSettings.requiredFields.getAll.invalidate(),
  });
  const requiredFieldsReset = trpc.documentSettings.requiredFields.resetToDefaults.useMutation({
    onSuccess: () => utils.documentSettings.requiredFields.getAll.invalidate(),
  });
  const automationUpdate = trpc.documentSettings.automation.update.useMutation({
    onSuccess: () => utils.documentSettings.automation.get.invalidate(),
  });
  const automationReset = trpc.documentSettings.automation.resetToDefaults.useMutation({
    onSuccess: () => utils.documentSettings.automation.get.invalidate(),
  });
  const retentionUpdate = trpc.documentSettings.retentionPolicies.updateAll.useMutation({
    onSuccess: () => utils.documentSettings.retentionPolicies.getAll.invalidate(),
  });
  const retentionReset = trpc.documentSettings.retentionPolicies.resetToDefaults.useMutation({
    onSuccess: () => utils.documentSettings.retentionPolicies.getAll.invalidate(),
  });
  const tagCreate = trpc.documentSettings.tags.create.useMutation({
    onSuccess: () => utils.documentSettings.tags.list.invalidate(),
  });
  const tagUpdate = trpc.documentSettings.tags.update.useMutation({
    onSuccess: () => utils.documentSettings.tags.list.invalidate(),
  });
  const tagDelete = trpc.documentSettings.tags.delete.useMutation({
    onSuccess: () => utils.documentSettings.tags.list.invalidate(),
  });

  // ── Local state (dirty-tracked) ──────────────────────────
  const [localGeneral, setLocalGeneral] = useState<DocumentGeneralConfigLocal>(DEFAULT_GENERAL);
  const [localRules, setLocalRules] = useState<LocalDuplicateRule[]>([]);
  const [localRequired, setLocalRequired] = useState<LocalRequiredField[]>([]);
  const [localAutomation, setLocalAutomation] =
    useState<LocalAutomationSettings>(DEFAULT_AUTOMATION);
  const [localRetention, setLocalRetention] = useState<LocalRetentionPolicy[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  const tagsRef = useRef<TagsTabHandle>(null);

  // Seed local state from server data
  useEffect(() => {
    if (generalQuery.data) {
      setLocalGeneral({
        allowedMimeTypes: generalQuery.data.allowedMimeTypes,
        maxUploadSizeMb: generalQuery.data.maxUploadSizeMb,
        defaultRetentionDays: generalQuery.data.defaultRetentionDays,
        enableAntivirusScan: generalQuery.data.enableAntivirusScan,
        quarantineOnDetect: generalQuery.data.quarantineOnDetect,
        blockOnScanFailure: generalQuery.data.blockOnScanFailure,
      });
    }
  }, [generalQuery.data]);

  useEffect(() => {
    if (duplicateRulesQuery.data) {
      setLocalRules(
        duplicateRulesQuery.data.map((r) => ({
          field: r.field as LocalDuplicateRule['field'],
          matchStrategy: r.matchStrategy as LocalDuplicateRule['matchStrategy'],
          collisionAction: r.collisionAction as LocalDuplicateRule['collisionAction'],
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
          fieldKey: f.fieldKey as LocalRequiredField['fieldKey'],
          isRequired: f.isRequired,
        }))
      );
    }
  }, [requiredFieldsQuery.data]);

  useEffect(() => {
    if (automationQuery.data) {
      setLocalAutomation({
        normalizeFilename: automationQuery.data.normalizeFilename,
        preventDeleteIfReferenced: automationQuery.data.preventDeleteIfReferenced,
        notifyOnOwnerChange: automationQuery.data.notifyOnOwnerChange,
        restrictTagCreationToAdmins: automationQuery.data.restrictTagCreationToAdmins,
        notifyOnDuplicate: automationQuery.data.notifyOnDuplicate,
        autoVersionOnCollision: automationQuery.data.autoVersionOnCollision,
        autoDetectDuplicates: automationQuery.data.autoDetectDuplicates,
        autoExtractText: automationQuery.data.autoExtractText,
        autoClassifyCategory: automationQuery.data.autoClassifyCategory,
        autoDetectPii: automationQuery.data.autoDetectPii,
        aiTagSuggestions: automationQuery.data.aiTagSuggestions,
        aiInsightGeneration: automationQuery.data.aiInsightGeneration,
      });
    }
  }, [automationQuery.data]);

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
    }
  }, [retentionQuery.data]);

  // ── Conflict detection for duplicate rules ───────────────
  const hasConflict = useMemo(() => {
    const seen = new Set<string>();
    for (const r of localRules) {
      const key = `${r.field}:${r.matchStrategy}`;
      if (seen.has(key)) return true;
      seen.add(key);
    }
    return false;
  }, [localRules]);

  // ── Change handlers ──────────────────────────────────────
  const handleGeneralChange = useCallback((c: DocumentGeneralConfigLocal) => {
    setLocalGeneral(c);
    setIsDirty(true);
  }, []);

  const handleRulesChange = useCallback((rules: LocalDuplicateRule[]) => {
    setLocalRules(rules);
    setIsDirty(true);
  }, []);

  const handleRequiredChange = useCallback((fields: LocalRequiredField[]) => {
    setLocalRequired(fields);
    setIsDirty(true);
  }, []);

  const handleAutomationChange = useCallback((s: LocalAutomationSettings) => {
    setLocalAutomation(s);
    setIsDirty(true);
  }, []);

  const handleRetentionChange = useCallback((p: LocalRetentionPolicy[]) => {
    setLocalRetention(p);
    setIsDirty(true);
  }, []);

  // ── Tag handlers (immediate) ──────────────────────────────
  const tagRows: DocumentTagRow[] = useMemo(() => {
    return (tagsQuery.data ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      colorToken: t.colorToken,
      description: t.description ?? null,
      sortOrder: t.sortOrder,
      isActive: t.isActive,
    }));
  }, [tagsQuery.data]);

  const handleTagCreate = useCallback(
    async (input: CreateDocumentTagInput) => {
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
    async (input: UpdateDocumentTagInput) => {
      try {
        await tagUpdate.mutateAsync(input);
        toast({ title: 'Tag updated' });
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
        const result = await tagDelete.mutateAsync({ id });
        toast({
          title: (result as { softDeleted?: boolean }).softDeleted
            ? 'Tag deactivated'
            : 'Tag deleted',
          description: (result as { softDeleted?: boolean }).softDeleted
            ? 'Kept because at least one document still references it.'
            : undefined,
        });
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

  // ── Save ──────────────────────────────────────────────────
  const isSaving =
    generalUpdate.isPending ||
    duplicateRulesUpdate.isPending ||
    requiredFieldsUpdate.isPending ||
    automationUpdate.isPending ||
    retentionUpdate.isPending;

  const handleSave = useCallback(async () => {
    try {
      await Promise.all([
        generalUpdate.mutateAsync(localGeneral),
        duplicateRulesUpdate.mutateAsync({ rules: localRules }),
        requiredFieldsUpdate.mutateAsync({ fields: localRequired }),
        automationUpdate.mutateAsync(localAutomation),
        retentionUpdate.mutateAsync({ policies: localRetention }),
      ]);
      setIsDirty(false);
      toast({ title: 'Settings saved', description: 'Document settings updated.' });
    } catch (err) {
      toast({
        title: 'Error saving settings',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }, [
    localGeneral,
    localRules,
    localRequired,
    localAutomation,
    localRetention,
    generalUpdate,
    duplicateRulesUpdate,
    requiredFieldsUpdate,
    automationUpdate,
    retentionUpdate,
  ]);

  // ── Reset ──────────────────────────────────────────────────
  const handleReset = useCallback(async () => {
    try {
      await Promise.all([
        generalReset.mutateAsync(),
        duplicateRulesReset.mutateAsync(),
        requiredFieldsReset.mutateAsync(),
        automationReset.mutateAsync(),
        retentionReset.mutateAsync(),
      ]);
      setIsDirty(false);
      setResetOpen(false);
      toast({ title: 'Settings reset', description: 'Document settings restored to defaults.' });
    } catch (err) {
      toast({
        title: 'Error resetting settings',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }, [generalReset, duplicateRulesReset, requiredFieldsReset, automationReset, retentionReset]);

  // ── Loading / Error state ────────────────────────────────
  const isLoading =
    authLoading ||
    generalQuery.isLoading ||
    duplicateRulesQuery.isLoading ||
    requiredFieldsQuery.isLoading ||
    tagsQuery.isLoading ||
    automationQuery.isLoading ||
    retentionQuery.isLoading;

  const error =
    generalQuery.error ||
    duplicateRulesQuery.error ||
    requiredFieldsQuery.error ||
    tagsQuery.error ||
    automationQuery.error ||
    retentionQuery.error;

  const lastUpdated = useMemo(() => {
    const dates: Date[] = [];
    if (generalQuery.data?.updatedAt) dates.push(new Date(generalQuery.data.updatedAt));
    if (automationQuery.data?.updatedAt) dates.push(new Date(automationQuery.data.updatedAt));
    if (dates.length === 0) return null;
    return new Date(Math.max(...dates.map((d) => d.getTime())));
  }, [generalQuery.data, automationQuery.data]);

  const tagsIsBusy = tagCreate.isPending || tagUpdate.isPending || tagDelete.isPending;

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
        disabled: !isDirty || isSaving || hasConflict,
        loading: isSaving,
      },
    ],
    [handleSave, isDirty, isSaving, hasConflict]
  );

  if (isLoading) return <DocumentSettingsLoading />;

  if (error) {
    return (
      <div className="w-full text-center py-12">
        <p className="text-destructive mb-4">Failed to load settings: {error.message}</p>
        <button
          onClick={() => {
            generalQuery.refetch();
            duplicateRulesQuery.refetch();
            requiredFieldsQuery.refetch();
            tagsQuery.refetch();
            automationQuery.refetch();
            retentionQuery.refetch();
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
          { label: 'Documents', href: '/documents' },
          { label: 'Document Settings' },
        ]}
        title="Document Settings"
        description="Configure file types, security, retention, and metadata policies."
        actions={actions}
        className="mb-6"
      />

      {/* ═════════════════════════════════════════════════════════════════
          BENTO GRID — 12 columns (stacks on mobile)
          Row 1: GeneralConfigCard (5)     + AntivirusCard (7)
          Row 2: DuplicateDetectionTab (7) + RequiredFieldsTab (5)
          Row 3: AutomationCard (7)        + AISettingsCard (5)
          Row 4: RetentionPoliciesTab (8)  + TagsTab (4)
          Row 5: ConfigurationSummary (12)
          ═════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        {/* Row 1 */}
        <GeneralConfigCard config={localGeneral} onConfigChange={handleGeneralChange} />
        <AntivirusCard config={localGeneral} onConfigChange={handleGeneralChange} />

        {/* Row 2 */}
        <DuplicateDetectionTab
          rules={localRules}
          onRulesChange={handleRulesChange}
          hasConflict={hasConflict}
        />
        <RequiredFieldsTab fields={localRequired} onFieldsChange={handleRequiredChange} />

        {/* Row 3 */}
        <AutomationCard settings={localAutomation} onSettingsChange={handleAutomationChange} />
        <AISettingsCard settings={localAutomation} onSettingsChange={handleAutomationChange} />

        {/* Row 4 */}
        <RetentionPoliciesTab policies={localRetention} onPoliciesChange={handleRetentionChange} />

        {/* Tags */}
        <Card className="lg:col-span-4 p-4 sm:p-6">
          <SectionHeader
            icon="label"
            iconBg="bg-indigo-500/10"
            iconFg="text-indigo-500"
            title="Tags"
            description="Tag vocabulary for the Documents module."
            action={
              <Button
                type="button"
                size="sm"
                onClick={() => tagsRef.current?.openCreate()}
                disabled={tagsIsBusy}
              >
                <span className="material-symbols-outlined text-sm mr-1" aria-hidden="true">
                  add
                </span>{' '}
                New Tag
              </Button>
            }
          />
          <TagsTab
            ref={tagsRef}
            tags={tagRows}
            onCreate={handleTagCreate}
            onUpdate={handleTagUpdate}
            onDelete={handleTagDelete}
            isBusy={tagsIsBusy}
          />
        </Card>

        {/* Row 5 — Configuration Summary */}
        <Card className="lg:col-span-12 p-4 sm:p-6">
          <SectionHeader
            icon="summarize"
            iconBg="bg-slate-100 dark:bg-slate-800"
            iconFg="text-slate-600 dark:text-slate-300"
            title="Configuration Summary"
            description="Live overview of your document settings."
          />
          <ConfigurationSummary
            general={localGeneral}
            rules={localRules}
            requiredFields={localRequired}
            automation={localAutomation}
            retention={localRetention}
            lastUpdated={lastUpdated}
            isDirty={isDirty}
          />
        </Card>
      </div>

      <ConfirmationDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset to Defaults"
        description="Reset General Config, Duplicate Rules, Required Fields, Automation, and Retention Policies to defaults? Tags and custom fields are preserved."
        confirmLabel="Reset"
        variant="destructive"
        onConfirm={handleReset}
      />
    </div>
  );
}
