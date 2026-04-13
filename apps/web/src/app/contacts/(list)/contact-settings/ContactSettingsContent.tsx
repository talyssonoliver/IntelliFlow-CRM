'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { trpc } from '@/lib/trpc';
import { toast } from '@intelliflow/ui';
import {
  ModuleSettingsLayout,
  type ModuleSettingsTab,
} from '@/components/settings/ModuleSettingsLayout';
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
import {
  RequiredFieldsTab,
  type RequiredFieldRow,
} from './components/RequiredFieldsTab';
import { TagsTab, type TagRow } from './components/TagsTab';
import {
  AutomationTab,
  type ContactAutomationSettings,
} from './components/AutomationTab';

const DEFAULT_AUTOMATION: ContactAutomationSettings = {
  autoMergeOnExactEmail: false,
  notifyOnDuplicate: true,
  restrictTagCreationToAdmins: false,
};

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
  const duplicateRulesUpdate =
    trpc.contactSettings.duplicateRules.updateAll.useMutation({
      onSuccess: () => utils.contactSettings.duplicateRules.getAll.invalidate(),
    });
  const duplicateRulesReset =
    trpc.contactSettings.duplicateRules.resetToDefaults.useMutation({
      onSuccess: () => utils.contactSettings.duplicateRules.getAll.invalidate(),
    });
  const requiredFieldsUpdate =
    trpc.contactSettings.requiredFields.updateAll.useMutation({
      onSuccess: () => utils.contactSettings.requiredFields.getAll.invalidate(),
    });
  const requiredFieldsReset =
    trpc.contactSettings.requiredFields.resetToDefaults.useMutation({
      onSuccess: () => utils.contactSettings.requiredFields.getAll.invalidate(),
    });
  const automationUpdate = trpc.contactSettings.automation.update.useMutation({
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
      });
    }
  }, [automationQuery.data]);

  // ─── Change handlers (mark dirty) ───────────────────────────────────────
  const handleRulesChange = useCallback((rules: DuplicateRuleRow[]) => {
    setLocalRules(rules);
    setIsDirty(true);
  }, []);

  const handleFieldsChange = useCallback((fields: RequiredFieldRow[]) => {
    setLocalFields(fields);
    setIsDirty(true);
  }, []);

  const handleAutomationChange = useCallback(
    (settings: ContactAutomationSettings) => {
      setLocalAutomation(settings);
      setIsDirty(true);
    },
    []
  );

  // ─── Tag actions (immediate, not dirty-tracked) ─────────────────────────
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
      await Promise.all([duplicateRulesReset.mutateAsync(), requiredFieldsReset.mutateAsync()]);
      setIsDirty(false);
      toast({
        title: 'Settings reset',
        description: 'Contact settings have been restored to defaults.',
      });
    } catch (err) {
      toast({
        title: 'Error resetting settings',
        description: err instanceof Error ? err.message : 'An unexpected error occurred',
        variant: 'destructive',
      });
    }
  }, [duplicateRulesReset, requiredFieldsReset]);

  // ─── Loading / Error ────────────────────────────────────────────────────
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

  const lastUpdated = useMemo(() => {
    if (!automationQuery.data?.updatedAt) return null;
    return new Date(automationQuery.data.updatedAt);
  }, [automationQuery.data]);

  const tabs = useMemo<ModuleSettingsTab[]>(
    () => [
      {
        value: 'duplicate-detection',
        label: 'Duplicate Detection',
        content: (
          <DuplicateDetectionTab rules={localRules} onRulesChange={handleRulesChange} />
        ),
      },
      {
        value: 'required-fields',
        label: 'Required Fields',
        content: (
          <RequiredFieldsTab fields={localFields} onFieldsChange={handleFieldsChange} />
        ),
      },
      {
        value: 'tags',
        label: 'Tags',
        content: (
          <TagsTab
            tags={((tagsQuery.data as unknown as TagRow[]) ?? [])}
            onCreate={handleTagCreate}
            onUpdate={handleTagUpdate}
            onDelete={handleTagDelete}
          />
        ),
      },
      {
        value: 'automation',
        label: 'Automation',
        content: (
          <AutomationTab
            settings={localAutomation}
            onSettingsChange={handleAutomationChange}
          />
        ),
      },
    ],
    [
      localRules,
      handleRulesChange,
      localFields,
      handleFieldsChange,
      tagsQuery.data,
      handleTagCreate,
      handleTagUpdate,
      handleTagDelete,
      localAutomation,
      handleAutomationChange,
    ]
  );

  if (isLoading) return <ContactSettingsLoading />;

  if (error) {
    return (
      <div className="max-w-7xl text-center py-12">
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
    <ModuleSettingsLayout
      title="Contact Settings"
      description="Configure duplicate detection, required fields, tags, and automation."
      breadcrumbs={[
        { label: 'Dashboard', href: '/' },
        { label: 'Contacts', href: '/contacts' },
        { label: 'Contact Settings' },
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
