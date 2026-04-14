'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { trpc } from '@/lib/trpc';
import { Card, ConfirmationDialog, toast } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared/page-header';
import type {
  AccountHierarchyConfigInput,
  AccountRequiredFieldKey,
  CreateAccountTagInput,
  UpdateAccountTagInput,
} from '@intelliflow/validators';
import { HierarchyTab } from './components/HierarchyTab';
import { IndustryTab, type IndustryRow } from './components/IndustryTab';
import {
  CustomFieldsTab,
  type CustomFieldRow,
  type CreateFieldData,
  type UpdateFieldData,
} from './components/CustomFieldsTab';
import {
  DuplicateDetectionTab,
  type DuplicateRuleRow,
} from './components/DuplicateDetectionTab';
import { RequiredFieldsTab, type RequiredFieldRow } from './components/RequiredFieldsTab';
import { TagsTab, type TagRow } from './components/TagsTab';
import { AutomationTab, type AccountAutomationSettings } from './components/AutomationTab';
import { AISettingsTab } from './components/AISettingsTab';
import { ConfigurationSummary } from './components/ConfigurationSummary';
import { AccountSettingsLoading } from './AccountSettingsLoading';

const DEFAULT_HIERARCHY: AccountHierarchyConfigInput = {
  maxDepth: 5,
  requireParentForTiers: [],
  preventCycles: true,
};

const DEFAULT_AUTOMATION: AccountAutomationSettings = {
  autoAssignOwner: false,
  autoLinkContactsByDomain: true,
  preventDeleteWithOpenOpportunities: true,
  notifyOnOwnerChange: false,
  normalizeWebsiteDomain: true,
  autoCapitalizeAccountNames: true,
  notifyOnDuplicate: true,
  restrictTagCreationToAdmins: false,
  aiIndustryInference: true,
  aiEnrichment: false,
  aiTagSuggestions: true,
  aiInsightGeneration: true,
  aiAccountScoring: false,
};

interface SectionHeaderProps {
  icon: string;
  iconBg: string;
  iconFg: string;
  title: string;
  description: string;
}

function SectionHeader({ icon, iconBg, iconFg, title, description }: Readonly<SectionHeaderProps>) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
        <span className={`material-symbols-outlined text-[20px] ${iconFg}`} aria-hidden="true">
          {icon}
        </span>
      </div>
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

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
  const hierarchyQuery = trpc.accountSettings.hierarchy.get.useQuery(undefined, { enabled: isAuthenticated });
  const industryQuery = trpc.accountSettings.industry.list.useQuery(undefined, { enabled: isAuthenticated });
  const customFieldsQuery = trpc.accountSettings.customFields.list.useQuery(undefined, { enabled: isAuthenticated });
  const duplicateRulesQuery = trpc.accountSettings.duplicateRules.getAll.useQuery(undefined, { enabled: isAuthenticated });
  const requiredFieldsQuery = trpc.accountSettings.requiredFields.getAll.useQuery(undefined, { enabled: isAuthenticated });
  const tagsQuery = trpc.accountSettings.tags.list.useQuery(undefined, { enabled: isAuthenticated });
  const automationQuery = trpc.accountSettings.automation.get.useQuery(undefined, { enabled: isAuthenticated });

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
  const duplicateRulesUpdate = trpc.accountSettings.duplicateRules.updateAll.useMutation({
    onSuccess: () => utils.accountSettings.duplicateRules.getAll.invalidate(),
  });
  const duplicateRulesReset = trpc.accountSettings.duplicateRules.resetToDefaults.useMutation({
    onSuccess: () => utils.accountSettings.duplicateRules.getAll.invalidate(),
  });
  const requiredFieldsUpdate = trpc.accountSettings.requiredFields.updateAll.useMutation({
    onSuccess: () => utils.accountSettings.requiredFields.getAll.invalidate(),
  });
  const requiredFieldsReset = trpc.accountSettings.requiredFields.resetToDefaults.useMutation({
    onSuccess: () => utils.accountSettings.requiredFields.getAll.invalidate(),
  });
  const tagCreate = trpc.accountSettings.tags.create.useMutation({
    onSuccess: () => utils.accountSettings.tags.list.invalidate(),
  });
  const tagUpdate = trpc.accountSettings.tags.update.useMutation({
    onSuccess: () => utils.accountSettings.tags.list.invalidate(),
  });
  const tagDelete = trpc.accountSettings.tags.delete.useMutation({
    onSuccess: () => utils.accountSettings.tags.list.invalidate(),
  });
  const automationUpdate = trpc.accountSettings.automation.update.useMutation({
    onSuccess: () => utils.accountSettings.automation.get.invalidate(),
  });

  // ── Local state (dirty-tracked) ──────────────────────────
  const [localHierarchy, setLocalHierarchy] = useState<AccountHierarchyConfigInput>(DEFAULT_HIERARCHY);
  const [localRules, setLocalRules] = useState<DuplicateRuleRow[]>([]);
  const [localRequired, setLocalRequired] = useState<RequiredFieldRow[]>([]);
  const [localAutomation, setLocalAutomation] = useState<AccountAutomationSettings>(DEFAULT_AUTOMATION);
  const [isDirty, setIsDirty] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  useEffect(() => {
    if (hierarchyQuery.data) {
      setLocalHierarchy({
        maxDepth: hierarchyQuery.data.maxDepth,
        requireParentForTiers: hierarchyQuery.data.requireParentForTiers,
        preventCycles: hierarchyQuery.data.preventCycles,
      });
    }
  }, [hierarchyQuery.data]);

  useEffect(() => {
    if (duplicateRulesQuery.data) {
      setLocalRules(
        duplicateRulesQuery.data.map((r) => ({
          field: r.field as DuplicateRuleRow['field'],
          matchStrategy: r.matchStrategy as DuplicateRuleRow['matchStrategy'],
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
          fieldKey: f.fieldKey as AccountRequiredFieldKey,
          isRequired: f.isRequired,
        }))
      );
    }
  }, [requiredFieldsQuery.data]);

  useEffect(() => {
    if (automationQuery.data) {
      setLocalAutomation({
        autoAssignOwner: automationQuery.data.autoAssignOwner,
        autoLinkContactsByDomain: automationQuery.data.autoLinkContactsByDomain,
        preventDeleteWithOpenOpportunities: automationQuery.data.preventDeleteWithOpenOpportunities,
        notifyOnOwnerChange: automationQuery.data.notifyOnOwnerChange,
        normalizeWebsiteDomain: automationQuery.data.normalizeWebsiteDomain,
        autoCapitalizeAccountNames: automationQuery.data.autoCapitalizeAccountNames,
        notifyOnDuplicate: automationQuery.data.notifyOnDuplicate,
        restrictTagCreationToAdmins: automationQuery.data.restrictTagCreationToAdmins,
        aiIndustryInference: automationQuery.data.aiIndustryInference,
        aiEnrichment: automationQuery.data.aiEnrichment,
        aiTagSuggestions: automationQuery.data.aiTagSuggestions,
        aiInsightGeneration: automationQuery.data.aiInsightGeneration,
        aiAccountScoring: automationQuery.data.aiAccountScoring,
      });
    }
  }, [automationQuery.data]);

  const handleHierarchyChange = useCallback((next: AccountHierarchyConfigInput) => {
    setLocalHierarchy(next);
    setIsDirty(true);
  }, []);

  const handleRulesChange = useCallback((rules: DuplicateRuleRow[]) => {
    setLocalRules(rules);
    setIsDirty(true);
  }, []);

  const handleRequiredChange = useCallback((fields: RequiredFieldRow[]) => {
    setLocalRequired(fields);
    setIsDirty(true);
  }, []);

  const handleAutomationChange = useCallback((next: AccountAutomationSettings) => {
    setLocalAutomation(next);
    setIsDirty(true);
  }, []);

  // ── Industry row mapping + handlers (immediate mutations) ──
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

  // ── Custom field row mapping + handlers (immediate) ──
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

  // ── Tag handlers (immediate) ──
  const tagRows: TagRow[] = useMemo(() => {
    const rows = (tagsQuery.data ?? []) as Array<{
      id: string;
      name: string;
      colorToken: string;
      description: string | null;
      sortOrder: number;
      isActive: boolean;
    }>;
    return rows.map((t) => ({
      id: t.id,
      name: t.name,
      colorToken: t.colorToken as TagRow['colorToken'],
      description: t.description,
      sortOrder: t.sortOrder,
      isActive: t.isActive,
    }));
  }, [tagsQuery.data]);

  const handleTagCreate = useCallback(
    async (input: CreateAccountTagInput) => {
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
    async (input: UpdateAccountTagInput) => {
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
        await tagDelete.mutateAsync({ id });
        toast({ title: 'Tag deleted' });
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

  // ── Save / Reset (hierarchy + duplicate + required + automation) ──
  const isSaving =
    hierarchyUpdate.isPending ||
    duplicateRulesUpdate.isPending ||
    requiredFieldsUpdate.isPending ||
    automationUpdate.isPending;

  const handleSave = useCallback(async () => {
    try {
      await Promise.all([
        hierarchyUpdate.mutateAsync(localHierarchy),
        duplicateRulesUpdate.mutateAsync({ rules: localRules }),
        requiredFieldsUpdate.mutateAsync({ fields: localRequired }),
        automationUpdate.mutateAsync(localAutomation),
      ]);
      setIsDirty(false);
      toast({ title: 'Settings saved', description: 'Account settings updated.' });
    } catch (err) {
      toast({
        title: 'Error saving settings',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }, [
    localHierarchy,
    localRules,
    localRequired,
    localAutomation,
    hierarchyUpdate,
    duplicateRulesUpdate,
    requiredFieldsUpdate,
    automationUpdate,
  ]);

  const handleReset = useCallback(async () => {
    try {
      await Promise.all([
        hierarchyReset.mutateAsync(),
        industryReset.mutateAsync(),
        duplicateRulesReset.mutateAsync(),
        requiredFieldsReset.mutateAsync(),
      ]);
      setIsDirty(false);
      setResetOpen(false);
      toast({ title: 'Settings reset', description: 'Account settings restored to defaults.' });
    } catch (err) {
      toast({
        title: 'Error resetting settings',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }, [hierarchyReset, industryReset, duplicateRulesReset, requiredFieldsReset]);

  // ── Loading / Error ──
  const isLoading =
    authLoading ||
    hierarchyQuery.isLoading ||
    industryQuery.isLoading ||
    customFieldsQuery.isLoading ||
    duplicateRulesQuery.isLoading ||
    requiredFieldsQuery.isLoading ||
    tagsQuery.isLoading ||
    automationQuery.isLoading;

  const error =
    hierarchyQuery.error ||
    industryQuery.error ||
    customFieldsQuery.error ||
    duplicateRulesQuery.error ||
    requiredFieldsQuery.error ||
    tagsQuery.error ||
    automationQuery.error;

  const lastUpdated = useMemo(() => {
    const dates: Date[] = [];
    if (hierarchyQuery.data?.updatedAt) dates.push(new Date(hierarchyQuery.data.updatedAt));
    if (automationQuery.data?.updatedAt) dates.push(new Date(automationQuery.data.updatedAt));
    for (const row of industryQuery.data ?? []) if (row.updatedAt) dates.push(new Date(row.updatedAt));
    if (dates.length === 0) return null;
    return new Date(Math.max(...dates.map((d) => d.getTime())));
  }, [hierarchyQuery.data, automationQuery.data, industryQuery.data]);

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

  if (isLoading) return <AccountSettingsLoading />;

  if (error) {
    return (
      <div className="w-full text-center py-12">
        <p className="text-destructive mb-4">Failed to load settings: {error.message}</p>
        <button
          onClick={() => {
            hierarchyQuery.refetch();
            industryQuery.refetch();
            customFieldsQuery.refetch();
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

  const industryIsBusy =
    industryCreate.isPending || industryUpdate.isPending || industryDelete.isPending;
  const fieldsIsBusy = fieldCreate.isPending || fieldUpdate.isPending || fieldDelete.isPending;
  const tagsIsBusy = tagCreate.isPending || tagUpdate.isPending || tagDelete.isPending;

  return (
    <div className="w-full">
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Accounts', href: '/accounts' },
          { label: 'Account Settings' },
        ]}
        title="Account Settings"
        description="Hierarchy, industry taxonomy, custom fields, duplicate detection, required fields, tags, automation and AI."
        actions={actions}
        className="mb-6"
      />

      {/* ═════════════════════════════════════════════════════════════════
          BENTO GRID — 12 columns (stacks on mobile)
          Row 1: Hierarchy (5)            + Duplicate Detection (7)
          Row 2: Required Fields (5)      + Automation (7)
          Row 3: Industry (7)             + AI & Intelligence (5)
          Row 4: Custom Fields (8)        + Tags (4)
          Row 5: Configuration Summary (12)
          ═════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        {/* Hierarchy */}
        <Card className="lg:col-span-5 p-4 sm:p-6">
          <SectionHeader
            icon="account_tree"
            iconBg="bg-blue-100 dark:bg-blue-900/30"
            iconFg="text-blue-600 dark:text-blue-400"
            title="Hierarchy"
            description="Rules for parent/child account relationships."
          />
          <HierarchyTab config={localHierarchy} onConfigChange={handleHierarchyChange} />
        </Card>

        {/* Duplicate Detection */}
        <Card className="lg:col-span-7 p-4 sm:p-6">
          <SectionHeader
            icon="content_copy"
            iconBg="bg-amber-100 dark:bg-amber-900/30"
            iconFg="text-amber-600 dark:text-amber-400"
            title="Duplicate Detection"
            description="Rules that flag potential duplicate accounts on create or update."
          />
          <DuplicateDetectionTab rules={localRules} onRulesChange={handleRulesChange} />
        </Card>

        {/* Required Fields */}
        <Card className="lg:col-span-5 p-4 sm:p-6">
          <SectionHeader
            icon="checklist"
            iconBg="bg-emerald-100 dark:bg-emerald-900/30"
            iconFg="text-emerald-600 dark:text-emerald-400"
            title="Required Fields"
            description="Fields that must be filled in before an account can be saved."
          />
          <RequiredFieldsTab fields={localRequired} onFieldsChange={handleRequiredChange} />
        </Card>

        {/* Automation */}
        <Card className="lg:col-span-7 p-4 sm:p-6">
          <SectionHeader
            icon="bolt"
            iconBg="bg-orange-100 dark:bg-orange-900/30"
            iconFg="text-orange-600 dark:text-orange-400"
            title="Automation"
            description="Automated behaviours for account management and data hygiene."
          />
          <AutomationTab settings={localAutomation} onSettingsChange={handleAutomationChange} />
        </Card>

        {/* Industry */}
        <Card className="lg:col-span-7 p-4 sm:p-6">
          <SectionHeader
            icon="business_center"
            iconBg="bg-teal-100 dark:bg-teal-900/30"
            iconFg="text-teal-600 dark:text-teal-400"
            title="Industry"
            description="Admin-configurable taxonomy of industries for account records."
          />
          <IndustryTab
            rows={industryRows}
            onCreate={handleIndustryCreate}
            onUpdate={handleIndustryUpdate}
            onDelete={handleIndustryDelete}
            isBusy={industryIsBusy}
          />
        </Card>

        {/* AI & Intelligence */}
        <Card className="lg:col-span-5 p-4 sm:p-6">
          <SectionHeader
            icon="neurology"
            iconBg="bg-fuchsia-100 dark:bg-fuchsia-900/30"
            iconFg="text-fuchsia-600 dark:text-fuchsia-400"
            title="AI & Intelligence"
            description="Control how IntelliFlow's AI augments account records."
          />
          <AISettingsTab settings={localAutomation} onSettingsChange={handleAutomationChange} />
        </Card>

        {/* Custom Fields */}
        <Card className="lg:col-span-8 p-4 sm:p-6">
          <SectionHeader
            icon="dynamic_form"
            iconBg="bg-violet-100 dark:bg-violet-900/30"
            iconFg="text-violet-600 dark:text-violet-400"
            title="Custom Fields"
            description="Additional data captured on account records."
          />
          <CustomFieldsTab
            rows={fieldRows}
            onCreate={handleFieldCreate}
            onUpdate={handleFieldUpdate}
            onDelete={handleFieldDelete}
            isBusy={fieldsIsBusy}
          />
        </Card>

        {/* Tags */}
        <Card className="lg:col-span-4 p-4 sm:p-6">
          <SectionHeader
            icon="sell"
            iconBg="bg-indigo-100 dark:bg-indigo-900/30"
            iconFg="text-indigo-600 dark:text-indigo-400"
            title="Tags"
            description="Tag vocabulary for the Accounts module."
          />
          <TagsTab
            tags={tagRows}
            onCreate={handleTagCreate}
            onUpdate={handleTagUpdate}
            onDelete={handleTagDelete}
            isBusy={tagsIsBusy}
          />
        </Card>

        {/* Configuration Summary */}
        <Card className="lg:col-span-12 p-4 sm:p-6">
          <SectionHeader
            icon="summarize"
            iconBg="bg-slate-100 dark:bg-slate-800"
            iconFg="text-slate-600 dark:text-slate-300"
            title="Configuration Summary"
            description="Live overview of your account settings."
          />
          <ConfigurationSummary
            hierarchy={localHierarchy}
            industries={industryRows}
            customFields={fieldRows}
            duplicateRules={localRules}
            requiredFields={localRequired}
            tags={tagRows}
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
        description="This will restore hierarchy rules, industry taxonomy, duplicate-detection rules, and required-field policy to factory defaults. Custom fields, tags and automation are preserved. This action cannot be undone."
        confirmLabel="Reset"
        variant="destructive"
        onConfirm={handleReset}
      />
    </div>
  );
}
