'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { trpc } from '@/lib/trpc';
import { Card, ConfirmationDialog, toast } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared/page-header';
import type { TicketAutomationSettingsInput } from '@intelliflow/validators';
import { TicketSLAPoliciesCard } from './components/TicketSLAPoliciesCard';
import { TicketDuplicateDetectionCard } from './components/TicketDuplicateDetectionCard';
import { TicketRequiredFieldsCard } from './components/TicketRequiredFieldsCard';
import { TicketTagsCard, type TicketTagsCardHandle } from './components/TicketTagsCard';
import { TicketAutomationCard } from './components/TicketAutomationCard';
import { TicketSettingsLoading } from './TicketSettingsLoading';

const DEFAULT_AUTOMATION: TicketAutomationSettingsInput = {
  defaultSlaPolicyId: null,
  autoCloseIdleDays: 7,
  autoCloseAppliesToWaitingCustomer: true,
  autoCloseAppliesToResolved: true,
  autoCloseNotifyCustomer: true,
  autoMergeOnExactContactSubject: false,
  notifyOnDuplicate: true,
  restrictTagCreationToAdmins: false,
  normalizeSubjectCasing: true,
  trimDescriptionWhitespace: true,
  preventDeleteWithOpenChildren: true,
  notifyOnAssigneeChange: true,
  notifyOnSlaBreach: true,
  notifyOnSlaWarning: false,
  notifyOnStatusResolved: false,
  notifyOnEscalation: true,
  aiDuplicateDetection: false,
  aiAutoCategorization: false,
  aiSentimentAnalysis: false,
  aiNextStepRecommendation: false,
  aiTagSuggestions: false,
  aiInsightGeneration: false,
};

export default function TicketSettingsContent() {
  const auth = useRequireAuth();
  const utils = trpc.useUtils();
  const tagsRef = useRef<TicketTagsCardHandle>(null);

  // ─── Data queries ────────────────────────────────────────────────────────

  const duplicateRulesQuery = trpc.ticketSettings.duplicateRules.getAll.useQuery(undefined, {
    enabled: !!auth?.user,
  });
  const requiredFieldsQuery = trpc.ticketSettings.requiredFields.getAll.useQuery(undefined, {
    enabled: !!auth?.user,
  });
  const tagsQuery = trpc.ticketSettings.tags.list.useQuery(undefined, {
    enabled: !!auth?.user,
  });
  const automationQuery = trpc.ticketSettings.automation.get.useQuery(undefined, {
    enabled: !!auth?.user,
  });
  const slaPoliciesQuery = trpc.ticketConfig.slaPolicy.list.useQuery(undefined, {
    enabled: !!auth?.user,
  });

  // ─── Dirty state (per-card) ───────────────────────────────────────────────

  const [duplicateRulesDraft, setDuplicateRulesDraft] = useState<unknown[] | null>(null);
  const [requiredFieldsDraft, setRequiredFieldsDraft] = useState<unknown[] | null>(null);
  const [automationDraft, setAutomationDraft] = useState<TicketAutomationSettingsInput | null>(
    null
  );
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  const isDirty = useMemo(
    () => duplicateRulesDraft !== null || requiredFieldsDraft !== null || automationDraft !== null,
    [duplicateRulesDraft, requiredFieldsDraft, automationDraft]
  );

  // ─── Mutations ────────────────────────────────────────────────────────────

  const updateDuplicateRules = trpc.ticketSettings.duplicateRules.updateAll.useMutation();
  const updateRequiredFields = trpc.ticketSettings.requiredFields.updateAll.useMutation();
  const updateAutomation = trpc.ticketSettings.automation.update.useMutation();
  const resetDuplicateRules = trpc.ticketSettings.duplicateRules.resetToDefaults.useMutation();
  const resetRequiredFields = trpc.ticketSettings.requiredFields.resetToDefaults.useMutation();
  const resetAutomation = trpc.ticketSettings.automation.resetToDefaults.useMutation();

  const isSaving =
    updateDuplicateRules.isPending || updateRequiredFields.isPending || updateAutomation.isPending;

  const handleSave = useCallback(async () => {
    const tasks: Promise<unknown>[] = [];
    if (duplicateRulesDraft !== null) {
      tasks.push(
        updateDuplicateRules.mutateAsync({
          rules: duplicateRulesDraft as Parameters<
            typeof updateDuplicateRules.mutateAsync
          >[0]['rules'],
        })
      );
    }
    if (requiredFieldsDraft !== null) {
      tasks.push(
        updateRequiredFields.mutateAsync({
          fields: requiredFieldsDraft as Parameters<
            typeof updateRequiredFields.mutateAsync
          >[0]['fields'],
        })
      );
    }
    if (automationDraft !== null) {
      tasks.push(updateAutomation.mutateAsync(automationDraft));
    }

    try {
      await Promise.all(tasks);
      setDuplicateRulesDraft(null);
      setRequiredFieldsDraft(null);
      setAutomationDraft(null);
      await Promise.all([
        utils.ticketSettings.duplicateRules.getAll.invalidate(),
        utils.ticketSettings.requiredFields.getAll.invalidate(),
        utils.ticketSettings.automation.get.invalidate(),
        utils.ticketConfig.slaPolicy.list.invalidate(),
      ]);
      toast({ title: 'Settings saved' });
    } catch (err) {
      toast({
        title: 'Failed to save settings',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }, [
    duplicateRulesDraft,
    requiredFieldsDraft,
    automationDraft,
    updateDuplicateRules,
    updateRequiredFields,
    updateAutomation,
    utils,
  ]);

  const handleReset = useCallback(async () => {
    try {
      await Promise.all([
        resetDuplicateRules.mutateAsync(),
        resetRequiredFields.mutateAsync(),
        resetAutomation.mutateAsync(),
      ]);
      setDuplicateRulesDraft(null);
      setRequiredFieldsDraft(null);
      setAutomationDraft(null);
      await Promise.all([
        utils.ticketSettings.duplicateRules.getAll.invalidate(),
        utils.ticketSettings.requiredFields.getAll.invalidate(),
        utils.ticketSettings.automation.get.invalidate(),
      ]);
      toast({ title: 'Settings reset to defaults' });
    } catch (err) {
      toast({
        title: 'Reset failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setResetDialogOpen(false);
    }
  }, [resetDuplicateRules, resetRequiredFields, resetAutomation, utils]);

  if (
    !auth?.user ||
    duplicateRulesQuery.isPending ||
    requiredFieldsQuery.isPending ||
    tagsQuery.isPending ||
    automationQuery.isPending ||
    slaPoliciesQuery.isPending
  ) {
    return <TicketSettingsLoading />;
  }

  const automation = (automationDraft ??
    automationQuery.data ??
    DEFAULT_AUTOMATION) as TicketAutomationSettingsInput;

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Tickets', href: '/tickets' },
          { label: 'SLA Policies & Settings' },
        ]}
        title="SLA Policies & Settings"
        description="Configure default SLA, auto-close rules, duplicate detection, required fields, tags, and automation triggers for tickets."
        actions={[
          {
            label: 'Reset to Defaults',
            variant: 'secondary',
            onClick: () => setResetDialogOpen(true),
          },
          {
            label: isSaving ? 'Saving…' : 'Save Changes',
            variant: 'primary',
            onClick: () => void handleSave(),
            disabled: !isDirty || isSaving,
            loading: isSaving,
          },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        <Card id="sla-policies" className="lg:col-span-12 p-4 sm:p-5">
          <TicketSLAPoliciesCard
            policies={slaPoliciesQuery.data ?? []}
            defaultSlaPolicyId={automation.defaultSlaPolicyId}
            onSetDefault={(id) => setAutomationDraft({ ...automation, defaultSlaPolicyId: id })}
          />
        </Card>

        <Card id="duplicate-detection" className="lg:col-span-7 p-4 sm:p-5">
          <TicketDuplicateDetectionCard
            rules={(duplicateRulesDraft as never) ?? duplicateRulesQuery.data ?? []}
            onChange={(rules) => setDuplicateRulesDraft(rules)}
          />
        </Card>

        <Card id="required-fields" className="lg:col-span-5 p-4 sm:p-5">
          <TicketRequiredFieldsCard
            fields={(requiredFieldsDraft as never) ?? requiredFieldsQuery.data ?? []}
            onChange={(fields) => setRequiredFieldsDraft(fields)}
          />
        </Card>

        <Card id="tags" className="lg:col-span-6 p-4 sm:p-5">
          <TicketTagsCard
            ref={tagsRef}
            tags={tagsQuery.data ?? []}
            onRefresh={() => utils.ticketSettings.tags.list.invalidate()}
          />
        </Card>

        <Card id="automation" className="lg:col-span-6 p-4 sm:p-5">
          <TicketAutomationCard
            settings={automation}
            slaPolicies={slaPoliciesQuery.data ?? []}
            onChange={(next: TicketAutomationSettingsInput) => setAutomationDraft(next)}
          />
        </Card>
      </div>

      <ConfirmationDialog
        open={resetDialogOpen}
        onOpenChange={setResetDialogOpen}
        title="Reset ticket settings?"
        description="This resets duplicate rules, required fields, and automation toggles to factory defaults. Your SLA policies and tags are preserved. This cannot be undone."
        confirmLabel="Reset to Defaults"
        onConfirm={handleReset}
        variant="destructive"
      />
    </>
  );
}
