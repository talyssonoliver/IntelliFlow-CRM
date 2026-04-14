'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { trpc } from '@/lib/trpc';
import { Card, ConfirmationDialog, toast } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared/page-header';
import type {
  ContactRequiredFieldKey,
  CreateContactTagInput,
  UpdateContactTagInput,
} from '@intelliflow/validators';
import { ContactSettingsLoading } from './ContactSettingsLoading';
import {
  DuplicateDetectionTab,
  type DuplicateRuleRow,
} from './components/DuplicateDetectionTab';
import { RequiredFieldsTab, type RequiredFieldRow } from './components/RequiredFieldsTab';
import { TagsTab, type TagRow } from './components/TagsTab';
import { AutomationTab, type ContactAutomationSettings } from './components/AutomationTab';
import { AISettingsTab } from './components/AISettingsTab';
import { ConfigurationSummary } from './components/ConfigurationSummary';

const DEFAULT_AUTOMATION: ContactAutomationSettings = {
  autoMergeOnExactEmail: false,
  notifyOnDuplicate: true,
  restrictTagCreationToAdmins: false,
  normalizePhoneNumbers: true,
  autoCapitalizeNames: true,
  preventDeleteWithOpenDeals: true,
  notifyOnOwnerChange: false,
  // AI defaults off — opt-in privacy stance (PG-182 audit F4)
  aiDuplicateDetection: false,
  aiEnrichment: false,
  aiTagSuggestions: false,
  aiInsightGeneration: false,
  aiAutoReplyDrafting: false,
};

interface SectionHeaderProps {
  icon: string;
  iconBg: string;
  iconFg: string;
  title: string;
  description: string;
}

function SectionHeader({
  icon,
  iconBg,
  iconFg,
  title,
  description,
}: Readonly<SectionHeaderProps>) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div
        className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}
      >
        <span
          className={`material-symbols-outlined text-[20px] ${iconFg}`}
          aria-hidden="true"
        >
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

export default function ContactSettingsContent() {
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();

  // ─── Queries ────────────────────────────────────────────────────────────
  const duplicateRulesQuery = trpc.contactSettings.duplicateRules.getAll.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const requiredFieldsQuery = trpc.contactSettings.requiredFields.getAll.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const tagsQuery = trpc.contactSettings.tags.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const automationQuery = trpc.contactSettings.automation.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  // ─── Mutations ──────────────────────────────────────────────────────────
  const utils = trpc.useUtils();
  const duplicateRulesUpdate = trpc.contactSettings.duplicateRules.updateAll.useMutation({
    onSuccess: () => utils.contactSettings.duplicateRules.getAll.invalidate(),
  });
  const duplicateRulesReset = trpc.contactSettings.duplicateRules.resetToDefaults.useMutation({
    onSuccess: () => utils.contactSettings.duplicateRules.getAll.invalidate(),
  });
  const requiredFieldsUpdate = trpc.contactSettings.requiredFields.updateAll.useMutation({
    onSuccess: () => utils.contactSettings.requiredFields.getAll.invalidate(),
  });
  const requiredFieldsReset = trpc.contactSettings.requiredFields.resetToDefaults.useMutation({
    onSuccess: () => utils.contactSettings.requiredFields.getAll.invalidate(),
  });
  const automationUpdate = trpc.contactSettings.automation.update.useMutation({
    onSuccess: () => utils.contactSettings.automation.get.invalidate(),
  });
  const automationReset = trpc.contactSettings.automation.resetToDefaults.useMutation({
    onSuccess: () => utils.contactSettings.automation.get.invalidate(),
  });
  const tagCreate = trpc.contactSettings.tags.create.useMutation({
    onSuccess: () => utils.contactSettings.tags.list.invalidate(),
  });
  const tagUpdate = trpc.contactSettings.tags.update.useMutation({
    onSuccess: () => utils.contactSettings.tags.list.invalidate(),
  });
  const tagDelete = trpc.contactSettings.tags.delete.useMutation({
    onSuccess: () => utils.contactSettings.tags.list.invalidate(),
  });

  // ─── Local State ────────────────────────────────────────────────────────
  const [localRules, setLocalRules] = useState<DuplicateRuleRow[]>([]);
  const [localFields, setLocalFields] = useState<RequiredFieldRow[]>([]);
  const [localAutomation, setLocalAutomation] =
    useState<ContactAutomationSettings>(DEFAULT_AUTOMATION);
  const [isDirty, setIsDirty] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

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
      setLocalFields(
        requiredFieldsQuery.data.map((f) => ({
          fieldKey: f.fieldKey as ContactRequiredFieldKey,
          isRequired: f.isRequired,
        }))
      );
    }
  }, [requiredFieldsQuery.data]);

  useEffect(() => {
    if (automationQuery.data) {
      setLocalAutomation({
        autoMergeOnExactEmail: automationQuery.data.autoMergeOnExactEmail,
        notifyOnDuplicate: automationQuery.data.notifyOnDuplicate,
        restrictTagCreationToAdmins: automationQuery.data.restrictTagCreationToAdmins,
        normalizePhoneNumbers: automationQuery.data.normalizePhoneNumbers,
        autoCapitalizeNames: automationQuery.data.autoCapitalizeNames,
        preventDeleteWithOpenDeals: automationQuery.data.preventDeleteWithOpenDeals,
        notifyOnOwnerChange: automationQuery.data.notifyOnOwnerChange,
        aiDuplicateDetection: automationQuery.data.aiDuplicateDetection,
        aiEnrichment: automationQuery.data.aiEnrichment,
        aiTagSuggestions: automationQuery.data.aiTagSuggestions,
        aiInsightGeneration: automationQuery.data.aiInsightGeneration,
        aiAutoReplyDrafting: automationQuery.data.aiAutoReplyDrafting,
      });
    }
  }, [automationQuery.data]);

  // ─── Derived validity ───────────────────────────────────────────────────
  const hasDuplicateRulePair = useMemo(() => {
    const keys = new Set<string>();
    for (const rule of localRules) {
      const key = `${rule.field}__${rule.matchStrategy}`;
      if (keys.has(key)) return true;
      keys.add(key);
    }
    return false;
  }, [localRules]);

  // ─── Change handlers ────────────────────────────────────────────────────
  const handleRulesChange = useCallback((rules: DuplicateRuleRow[]) => {
    setLocalRules(rules);
    setIsDirty(true);
  }, []);

  const handleFieldsChange = useCallback((fields: RequiredFieldRow[]) => {
    setLocalFields(fields);
    setIsDirty(true);
  }, []);

  const handleAutomationChange = useCallback((settings: ContactAutomationSettings) => {
    setLocalAutomation(settings);
    setIsDirty(true);
  }, []);

  // ─── Tag actions (immediate) ────────────────────────────────────────────
  const handleTagCreate = useCallback(
    async (input: CreateContactTagInput) => {
      try {
        await tagCreate.mutateAsync(input);
        toast({ title: 'Tag created', description: `"${input.name}" has been added.` });
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
    async (input: UpdateContactTagInput) => {
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

  const isSaving =
    duplicateRulesUpdate.isPending ||
    requiredFieldsUpdate.isPending ||
    automationUpdate.isPending;

  const handleSave = useCallback(async () => {
    try {
      await Promise.all([
        duplicateRulesUpdate.mutateAsync({ rules: localRules }),
        requiredFieldsUpdate.mutateAsync({ fields: localFields }),
        automationUpdate.mutateAsync(localAutomation),
      ]);
      setIsDirty(false);
      toast({ title: 'Settings saved', description: 'Contact settings updated.' });
    } catch (err) {
      toast({
        title: 'Error saving settings',
        description: err instanceof Error ? err.message : 'An unexpected error occurred',
        variant: 'destructive',
      });
    }
  }, [
    localRules,
    localFields,
    localAutomation,
    duplicateRulesUpdate,
    requiredFieldsUpdate,
    automationUpdate,
  ]);

  const handleReset = useCallback(async () => {
    try {
      await Promise.all([
        duplicateRulesReset.mutateAsync(),
        requiredFieldsReset.mutateAsync(),
        automationReset.mutateAsync(),
      ]);
      setIsDirty(false);
      setResetOpen(false);
      toast({
        title: 'Settings reset',
        description:
          'Duplicate rules, required fields, automation and AI toggles restored to defaults. Tags are preserved.',
      });
    } catch (err) {
      toast({
        title: 'Error resetting settings',
        description: err instanceof Error ? err.message : 'An unexpected error occurred',
        variant: 'destructive',
      });
    }
  }, [duplicateRulesReset, requiredFieldsReset, automationReset]);

  const isLoading =
    authLoading ||
    duplicateRulesQuery.isLoading ||
    requiredFieldsQuery.isLoading ||
    tagsQuery.isLoading ||
    automationQuery.isLoading;

  const error =
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
        disabled: !isDirty || isSaving || hasDuplicateRulePair,
        loading: isSaving,
      },
    ],
    [handleSave, isDirty, isSaving, hasDuplicateRulePair]
  );

  if (isLoading) return <ContactSettingsLoading />;

  if (error) {
    return (
      <div className="w-full text-center py-12">
        <p className="text-destructive mb-4">Failed to load settings: {error.message}</p>
        <button
          onClick={() => {
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
          { label: 'Contacts', href: '/contacts' },
          { label: 'Contact Settings' },
        ]}
        title="Contact Settings"
        description="Configure duplicate detection, required fields, tags, and automation."
        actions={actions}
        className="mb-6"
      />

      {/* ═══════════════════════════════════════════════════════════════════
          BENTO GRID — 12 columns (stacks on mobile)
          Row 1: Duplicate Detection (7)   + Automation (5)
          Row 2: AI & Intelligence (7)     + Required Fields (5)
          Row 3: Tags (8)                  + Configuration Summary (4)
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        {/* Duplicate Detection */}
        <Card className="lg:col-span-7 p-4 sm:p-6">
          <SectionHeader
            icon="content_copy"
            iconBg="bg-blue-100 dark:bg-blue-900/30"
            iconFg="text-blue-600 dark:text-blue-400"
            title="Duplicate Detection"
            description="Rules that flag potential duplicate contacts on create or update."
          />
          <DuplicateDetectionTab rules={localRules} onRulesChange={handleRulesChange} />
        </Card>

        {/* Automation */}
        <Card className="lg:col-span-5 p-4 sm:p-6">
          <SectionHeader
            icon="bolt"
            iconBg="bg-amber-100 dark:bg-amber-900/30"
            iconFg="text-amber-600 dark:text-amber-400"
            title="Automation"
            description="Automated behaviours for contact management."
          />
          <AutomationTab
            settings={localAutomation}
            onSettingsChange={handleAutomationChange}
          />
        </Card>

        {/* AI & Intelligence */}
        <Card className="lg:col-span-7 p-4 sm:p-6">
          <SectionHeader
            icon="neurology"
            iconBg="bg-fuchsia-100 dark:bg-fuchsia-900/30"
            iconFg="text-fuchsia-600 dark:text-fuchsia-400"
            title="AI & Intelligence"
            description="Control how IntelliFlow's AI augments contact records, duplicates, tags, and replies."
          />
          <AISettingsTab
            settings={localAutomation}
            onSettingsChange={handleAutomationChange}
          />
        </Card>

        {/* Required Fields */}
        <Card className="lg:col-span-5 p-4 sm:p-6">
          <SectionHeader
            icon="checklist"
            iconBg="bg-emerald-100 dark:bg-emerald-900/30"
            iconFg="text-emerald-600 dark:text-emerald-400"
            title="Required Fields"
            description="Fields that must be filled in before a contact can be saved."
          />
          <RequiredFieldsTab fields={localFields} onFieldsChange={handleFieldsChange} />
        </Card>

        {/* Tags */}
        <Card className="lg:col-span-8 p-4 sm:p-6">
          <SectionHeader
            icon="sell"
            iconBg="bg-violet-100 dark:bg-violet-900/30"
            iconFg="text-violet-600 dark:text-violet-400"
            title="Tags"
            description="Vocabulary of tags available across the contacts module."
          />
          <TagsTab
            tags={(tagsQuery.data ?? []) as TagRow[]}
            onCreate={handleTagCreate}
            onUpdate={handleTagUpdate}
            onDelete={handleTagDelete}
          />
        </Card>

        {/* Configuration Summary */}
        <Card className="lg:col-span-4 p-4 sm:p-6">
          <SectionHeader
            icon="summarize"
            iconBg="bg-slate-100 dark:bg-slate-800"
            iconFg="text-slate-600 dark:text-slate-300"
            title="Configuration Summary"
            description="Live overview of what you have configured on this page."
          />
          <ConfigurationSummary
            rules={localRules}
            fields={localFields}
            tags={(tagsQuery.data ?? []) as TagRow[]}
            automation={localAutomation}
            lastUpdated={
              automationQuery.data?.updatedAt
                ? new Date(automationQuery.data.updatedAt)
                : null
            }
            isDirty={isDirty}
          />
        </Card>
      </div>

      <ConfirmationDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset to Defaults"
        description="Restore duplicate-detection rules, required-field policy, automation toggles, and AI toggles to factory defaults. Tag vocabulary is preserved. This action cannot be undone."
        confirmLabel="Reset"
        variant="destructive"
        onConfirm={handleReset}
      />
    </div>
  );
}
