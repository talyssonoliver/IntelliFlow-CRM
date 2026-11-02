'use client';

// Task Automation Content — PG-208
// PageHeader + 12-col bento grid (module-settings-playbook §1): rules (8) and a
// settings + tags stack (4). Rules run in the API's automation engine (ADR-084).
// Webhook URLs and secrets are held in component state only: their mutations
// keep no cache (gcTime 0) and are reset as soon as the value is captured and
// again when the dialog closes (AC-TA-017).

import { useEffect, useRef, useState } from 'react';
import { Button, Card, ConfirmationDialog, toast } from '@intelliflow/ui';
import type {
  CreateTaskAutomationRuleInput,
  TaskAutomationWebhookCredentials,
  UpdateTaskAutomationSettingsInput,
} from '@intelliflow/validators';
import type {
  CreateSettingsTagInput,
  SettingsTagView,
  UpdateSettingsTagInput,
} from '@/components/shared/tags-tab';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { useTimezoneContext } from '@/providers/TimezoneProvider';
import { trpc } from '@/lib/trpc';
import { PageHeader } from '@/components/shared/page-header';
import { SectionHeader } from '@/components/shared/section-header';
import {
  AutomationRuleList,
  TEST_UNAVAILABLE,
  type AutomationRuleListHandle,
  type MoveDirection,
} from './components/AutomationRuleList';
import { AutomationSettingsCard } from './components/AutomationSettingsCard';
import { DeleteAutomationRuleDialog } from './components/DeleteAutomationRuleDialog';
import { RecentRunsDialog } from './components/RecentRunsDialog';
import { TagsTab, type TagsTabHandle } from './components/TagsTab';
import { RotateSecretDialog, WebhookSecretDialog } from './components/WebhookSecretDialog';
import TaskAutomationLoading from './TaskAutomationLoading';
import type { RuleItem } from './task-automation-labels';

const RULES_HEADING = 'automation-rules-heading';
const TAGS_HEADING = 'automation-tags-heading';
const READ_ONLY_NOTE = 'automation-read-only-note';
/** Longer than a dialog's close animation. */
const ANNOUNCE_DELAY_MS = 250;

function errorToast(title: string) {
  return (err: { message: string }) =>
    toast({ title, description: err.message, variant: 'destructive' });
}

interface ShownCredentials {
  ruleName: string;
  credentials: TaskAutomationWebhookCredentials;
}

type ConfirmTarget = { kind: 'tag'; tag: SettingsTagView } | { kind: 'regenerate'; rule: RuleItem };

/** New rule order after moving one rule up or down, or null at an edge. */
export function movedOrder(
  rules: readonly RuleItem[],
  id: string,
  direction: MoveDirection
): { ids: string[]; position: number } | null {
  const ids = rules.map((r) => r.id);
  const from = ids.indexOf(id);
  const to = direction === 'up' ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= ids.length) return null;
  [ids[from], ids[to]] = [ids[to], ids[from]];
  return { ids, position: to + 1 };
}

function useAutomationMutations(onListChanged: () => Promise<unknown>) {
  const opts = { onSuccess: onListChanged };
  return {
    create: trpc.taskAutomation.create.useMutation({ ...opts, gcTime: 0 }),
    update: trpc.taskAutomation.update.useMutation(opts),
    remove: trpc.taskAutomation.delete.useMutation(opts),
    setActive: trpc.taskAutomation.setActive.useMutation({
      ...opts,
      onError: errorToast('Could not change the rule'),
    }),
    reorder: trpc.taskAutomation.reorder.useMutation(opts),
    runNow: trpc.taskAutomation.runNow.useMutation({
      ...opts,
      onError: errorToast('Could not test the rule'),
    }),
    rotate: trpc.taskAutomation.rotateWebhookSecret.useMutation({
      ...opts,
      gcTime: 0,
      onError: errorToast('Could not rotate the secret'),
    }),
    regenerate: trpc.taskAutomation.regenerateWebhookUrl.useMutation({
      ...opts,
      gcTime: 0,
      onError: errorToast('Could not create a new URL'),
    }),
    reset: trpc.taskAutomation.resetToDefaults.useMutation({
      ...opts,
      onError: errorToast('Could not reset the settings'),
    }),
    settings: trpc.taskAutomation.settings.update.useMutation({
      ...opts,
      onError: errorToast('Could not save the settings'),
    }),
    createTag: trpc.taskAutomation.tags.create.useMutation({
      ...opts,
      onError: errorToast('Could not create the tag'),
    }),
    updateTag: trpc.taskAutomation.tags.update.useMutation({
      ...opts,
      onError: errorToast('Could not save the tag'),
    }),
    deleteTag: trpc.taskAutomation.tags.delete.useMutation({
      ...opts,
      onError: errorToast('Could not delete the tag'),
    }),
  };
}

export default function TaskAutomationContent() {
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();
  const utils = trpc.useUtils();
  // New schedule rules default to the user's timezone (profile, else browser).
  const { timezone } = useTimezoneContext();
  const listQuery = trpc.taskAutomation.list.useQuery(undefined, { enabled: isAuthenticated });
  const canEdit = listQuery.data?.canEdit ?? false;
  const membersQuery = trpc.account.assignees.useQuery(undefined, {
    enabled: isAuthenticated && canEdit,
  });
  const m = useAutomationMutations(() => utils.taskAutomation.list.invalidate());

  const listRef = useRef<AutomationRuleListHandle>(null);
  const tagsRef = useRef<TagsTabHandle>(null);
  const [announcement, setAnnouncement] = useState('');
  const [shown, setShown] = useState<ShownCredentials | null>(null);
  const [runsFor, setRunsFor] = useState<RuleItem | null>(null);
  const [rotateFor, setRotateFor] = useState<RuleItem | null>(null);
  const [rotateKey, setRotateKey] = useState(0);
  const [deleting, setDeleting] = useState<{
    rule: RuleItem;
    error: string | null;
  } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmTarget | null>(null);

  const rules = listQuery.data?.rules ?? [];
  // Focus moves only after a successful delete (Cancel returns focus to its trigger).
  const [ruleDeleted, setRuleDeleted] = useState(false);
  const [tagDeleted, setTagDeleted] = useState(false);
  const announceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (announceTimer.current) clearTimeout(announceTimer.current);
    },
    []
  );
  /**
   * Clear, then set after a dialog has closed: a modal hides this live region
   * while open, and an unchanged string would not be announced again.
   */
  const announce = (message: string) => {
    setAnnouncement('');
    if (announceTimer.current) clearTimeout(announceTimer.current);
    announceTimer.current = setTimeout(() => setAnnouncement(message), ANNOUNCE_DELAY_MS);
  };

  /** Every mutation that returns a URL or secret; reset so no copy stays in React Query. */
  function dropSecretsFromMutations() {
    m.create.reset();
    m.rotate.reset();
    m.regenerate.reset();
  }

  function showCredentials(ruleName: string, credentials: TaskAutomationWebhookCredentials) {
    setShown({ ruleName, credentials });
    dropSecretsFromMutations();
  }

  function closeCredentials() {
    setShown(null);
    dropSecretsFromMutations();
  }

  async function handleSave(input: CreateTaskAutomationRuleInput, id: string | null) {
    if (id) {
      await m.update.mutateAsync({ id, ...input });
      toast({ title: 'Rule saved', description: 'Your changes apply to new events.' });
      announce(`Rule ${input.name} saved.`);
      return;
    }
    const result = await m.create.mutateAsync(input);
    toast({ title: 'Rule created', description: `“${result.rule.name}” is saved.` });
    announce(`Rule ${result.rule.name} created.`);
    if (result.webhook) showCredentials(result.rule.name, result.webhook);
  }

  async function handleMove(rule: RuleItem, direction: MoveDirection) {
    const next = movedOrder(rules, rule.id, direction);
    if (!next) return;
    try {
      await m.reorder.mutateAsync({ ids: next.ids });
      announce(`Moved to position ${next.position} of ${next.ids.length}.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Try again.';
      errorToast('Could not reorder the rules')({ message });
      throw err;
    }
  }

  function handleToggle(rule: RuleItem, isActive: boolean) {
    m.setActive.mutate(
      { id: rule.id, isActive },
      { onSuccess: () => announce(`${rule.name} turned ${isActive ? 'on' : 'off'}.`) }
    );
  }

  function handleTest(rule: RuleItem) {
    if (rule.trigger.type === 'ENTITY_EVENT') {
      announce(TEST_UNAVAILABLE);
      return;
    }
    m.runNow.mutate(
      { id: rule.id },
      {
        onSuccess: () => {
          toast({ title: 'Test run queued', description: 'It runs within a few seconds.' });
          announce(`Test run of ${rule.name} queued.`);
        },
      }
    );
  }

  function handleRotate(revokePrevious: boolean) {
    const rule = rotateFor;
    if (!rule) return;
    m.rotate.mutate(
      { id: rule.id, revokePrevious },
      {
        onSuccess: (credentials) => {
          setRotateFor(null);
          showCredentials(rule.name, credentials);
        },
      }
    );
  }

  async function handleConfirm() {
    if (!confirm) return;
    if (confirm.kind === 'tag') {
      await m.deleteTag.mutateAsync({ id: confirm.tag.id });
      toast({ title: 'Tag deleted' });
      announce(`Tag ${confirm.tag.name} deleted.`);
      setTagDeleted(true);
      return;
    }
    const credentials = await m.regenerate.mutateAsync({ id: confirm.rule.id });
    showCredentials(confirm.rule.name, credentials);
  }

  function handleDelete() {
    if (!deleting) return;
    const { rule } = deleting;
    m.remove.mutate(
      { id: rule.id },
      {
        onSuccess: () => {
          setRuleDeleted(true);
          setDeleting(null);
          toast({ title: 'Rule deleted' });
          announce(`Rule ${rule.name} deleted.`);
        },
        onError: (err) => setDeleting({ rule, error: err.message }),
      }
    );
  }

  async function handleSaveSettings(input: UpdateTaskAutomationSettingsInput) {
    await m.settings.mutateAsync(input);
    toast({ title: 'Settings saved' });
    announce('Settings saved.');
  }

  async function handleResetSettings() {
    const settings = await m.reset.mutateAsync();
    toast({ title: 'Settings reset', description: 'Rules, run history and tags are kept.' });
    announce('Settings reset to defaults.');
    return settings;
  }

  async function handleCreateTag(input: CreateSettingsTagInput) {
    await m.createTag.mutateAsync(input);
  }

  async function handleUpdateTag(input: UpdateSettingsTagInput) {
    await m.updateTag.mutateAsync(input);
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  if (authLoading || listQuery.isLoading) return <TaskAutomationLoading />;

  const data = listQuery.data;
  const header = (
    <PageHeader
      breadcrumbs={[
        { label: 'Dashboard', href: '/' },
        { label: 'Tasks', href: '/tasks' },
        { label: 'Automation' },
      ]}
      title="Task Automation"
      description="Rules that create tasks when something happens in the CRM, on a schedule or when another system calls a webhook."
      className="mb-6"
    />
  );

  if (listQuery.error || !data) {
    return (
      <div className="w-full">
        {header}
        <Card className="p-4 sm:p-5">
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            Failed to load task automation. {listQuery.error?.message ?? ''}
          </p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => listQuery.refetch()}>
            Retry
          </Button>
        </Card>
      </div>
    );
  }

  const pendingToggleId = m.setActive.isPending ? (m.setActive.variables?.id ?? null) : null;
  const tagBusy = m.createTag.isPending || m.updateTag.isPending || m.deleteTag.isPending;

  return (
    <div className="w-full">
      {header}
      <output aria-live="polite" className="sr-only">
        {announcement}
      </output>

      <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-12">
        <section
          aria-labelledby={RULES_HEADING}
          aria-describedby={canEdit ? undefined : READ_ONLY_NOTE}
          className="lg:col-span-8"
        >
          <Card className="h-full p-4 sm:p-5">
            <SectionHeader
              icon="auto_awesome"
              iconBg="bg-primary/10"
              iconFg="text-primary"
              headingLevel={2}
              focusableTitle
              title="Rules"
              titleId={RULES_HEADING}
              description="Each rule watches one trigger and runs its actions in order."
              action={
                canEdit ? (
                  <Button size="sm" onClick={() => listRef.current?.openCreate()}>
                    New Rule
                  </Button>
                ) : undefined
              }
            />
            {!canEdit && (
              <p id={READ_ONLY_NOTE} className="mb-3 text-sm text-muted-foreground">
                You can view these rules. Only admins and managers can change them.
              </p>
            )}
            <AutomationRuleList
              ref={listRef}
              rules={rules}
              events={data.events}
              tags={data.tags}
              members={membersQuery.data ?? []}
              membersLoading={membersQuery.isLoading}
              membersError={Boolean(membersQuery.error)}
              canEdit={canEdit}
              canManageWebhooks={data.canManageWebhooks}
              defaultTimezone={timezone}
              maxTags={data.limits.maxTags}
              isSaving={m.create.isPending || m.update.isPending}
              pendingToggleId={pendingToggleId}
              isReordering={m.reorder.isPending}
              onSave={handleSave}
              onToggle={handleToggle}
              onMove={handleMove}
              onDelete={(rule) => {
                setRuleDeleted(false);
                setDeleting({ rule, error: null });
              }}
              onShowRuns={setRunsFor}
              onTest={handleTest}
              onRotateSecret={(rule) => {
                setRotateKey((k) => k + 1);
                setRotateFor(rule);
              }}
              onRegenerateUrl={(rule) => setConfirm({ kind: 'regenerate', rule })}
            />
          </Card>
        </section>

        <div className="flex flex-col gap-4 sm:gap-5 lg:col-span-4">
          <section aria-labelledby="automation-settings-heading">
            <Card className="p-4 sm:p-5">
              <SectionHeader
                icon="tune"
                iconBg="bg-amber-500/10"
                iconFg="text-amber-700 dark:text-amber-400"
                headingLevel={2}
                title="Settings"
                titleId="automation-settings-heading"
                description="Applies to every rule in this workspace."
              />
              <AutomationSettingsCard
                readOnlyNoteId={READ_ONLY_NOTE}
                settings={data.settings}
                canEdit={canEdit}
                isSaving={m.settings.isPending || m.reset.isPending}
                onSave={handleSaveSettings}
                onReset={handleResetSettings}
              />
            </Card>
          </section>

          <section aria-labelledby={TAGS_HEADING}>
            <Card className="p-4 sm:p-5">
              <SectionHeader
                icon="sell"
                iconBg="bg-violet-500/10"
                iconFg="text-violet-600 dark:text-violet-400"
                headingLevel={2}
                focusableTitle
                title="Tags"
                titleId={TAGS_HEADING}
                description="Group rules by team or process."
                action={
                  canEdit ? (
                    <Button size="sm" onClick={() => tagsRef.current?.openCreate()}>
                      New Tag
                    </Button>
                  ) : undefined
                }
              />
              <TagsTab
                ref={tagsRef}
                tags={data.tags}
                canEdit={canEdit}
                isBusy={tagBusy}
                onCreate={handleCreateTag}
                onUpdate={handleUpdateTag}
                onDelete={(tag) => {
                  setTagDeleted(false);
                  setConfirm({ kind: 'tag', tag });
                }}
              />
            </Card>
          </section>
        </div>
      </div>

      <WebhookSecretDialog
        credentials={shown?.credentials ?? null}
        ruleName={shown?.ruleName ?? ''}
        onClose={closeCredentials}
      />
      <RotateSecretDialog
        key={rotateKey}
        ruleName={rotateFor?.name ?? null}
        isPending={m.rotate.isPending}
        onConfirm={handleRotate}
        onCancel={() => setRotateFor(null)}
      />
      <RecentRunsDialog rule={runsFor} onClose={() => setRunsFor(null)} />
      <DeleteAutomationRuleDialog
        name={deleting?.rule.name ?? null}
        isDeleting={m.remove.isPending}
        error={deleting?.error ?? null}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
        focusTargetId={RULES_HEADING}
        deleted={ruleDeleted}
      />
      <ConfirmationDialog
        open={confirm !== null}
        onOpenChange={(open) => (open ? undefined : setConfirm(null))}
        title={confirm?.kind === 'tag' ? 'Delete Tag' : 'Create a New Webhook URL'}
        description={
          confirm?.kind === 'tag'
            ? `Delete the tag "${confirm.tag.name}"? It is removed from every rule that uses it.`
            : 'The current URL stops working at once. Senders must switch to the new URL.'
        }
        confirmLabel={confirm?.kind === 'tag' ? 'Delete' : 'Create New URL'}
        variant={confirm?.kind === 'tag' ? 'destructive' : 'default'}
        onConfirm={handleConfirm}
        onCloseAutoFocus={(event) => {
          // The tag row is gone after a delete; keep focus in the Tags card.
          if (!tagDeleted) return;
          event.preventDefault();
          document.getElementById(TAGS_HEADING)?.focus();
        }}
      />
    </div>
  );
}
